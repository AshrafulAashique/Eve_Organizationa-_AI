const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../auth');
const { conversations, messages } = require('../db');
const { streamChat, generateTitle, TARGET_MODEL, pickModel } = require('../ollama');
const { saveMemory, retrieveMemory } = require('../memory');

router.use(authenticate);

// ─── POST /api/chat ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { conversation_id, message } = req.body;

  if (!message || !message.trim())
    return res.status(400).json({ error: 'Message is required' });

  try {
    // Get or create conversation
    let conv;
    if (conversation_id) {
      conv = await conversations.findById(conversation_id);
      if (!conv || conv.user_id !== req.user.id)
        return res.status(404).json({ error: 'Conversation not found' });
    } else {
      const convId = uuidv4();
      await conversations.create({ id: convId, user_id: req.user.id, title: 'New Conversation', model: TARGET_MODEL });
      conv = await conversations.findById(convId);
    }

    // Save user message to database
    await messages.create({ id: uuidv4(), conversation_id: conv.id, role: 'user', content: message.trim() });
    
    // Save user message to ChromaDB memory (disabled for performance)
    // saveMemory(req.user.id, `User said: ${message.trim()}`);

    const fs = require('fs');
    const path = require('path');
    const { exec } = require('child_process');

    // Retrieve relevant memory (disabled for performance)
    // const memoryContext = await retrieveMemory(req.user.id, message.trim(), 3);
    const memoryText = '';

    const now = new Date();
    const realTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const realDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const systemPrompt = {
      role: 'system',
      content: `You are Eve, a highly advanced local AI assistant. You are witty, sharp, and friendly — like F.R.I.D.A.Y. from the Iron Man films. You speak with confidence and a touch of dry humor. You call the user "Boss" naturally throughout conversation.
${memoryText}
CURRENT DATE AND TIME (authoritative — never guess or calculate the time yourself):
- Time: ${realTime}
- Date: ${realDate}

You can control the user's Windows computer, open files, run scripts, copy-paste text, set timers, and more.
You MUST output EXACTLY these XML tags to perform local actions. The system executes them immediately and feeds the results back to you:
1. Run a Windows command: <execute>command</execute>
   - To open an application or file: <execute>start msedge "https://google.com"</execute>.
   - To create a note/reminder: <execute>echo "Reminder text" > "d:\\waste\\reminder.txt"</execute>.
   - To set a timer: <execute>powershell -c "Start-Sleep -s 60; [System.Windows.MessageBox]::Show('Timer Done')"</execute>
2. Read a file: <read>absolute/path/to/file.txt</read>
3. Write/edit a file: <write file="absolute/path/to/file.txt">content to write</write>
4. Search the web: <search>your search query</search>

CRITICAL RULES:
- For potentially destructive actions (delete, overwrite, shutdown, format, rm, del), DO NOT output the <execute> or <write> tag immediately. Ask for confirmation first. ONLY output the tag AFTER the user says Yes.
- DO NOT run interactive commands that wait for user input (e.g. 'time' or 'date'). Always use non-interactive variants like 'time /t' or 'date /t'.
- You are a VOICE assistant. Keep responses conversational, concise, and punchy — they will be read aloud. Be direct. Make a quick joke when appropriate. Call the user Boss. DO NOT say 'I am running a command' or 'The result is'. Just give the answer.`
    };

    const history = await messages.findByConversation(conv.id);
    let ollamaMessages = [systemPrompt, ...history.map(m => ({ role: m.role, content: m.content }))];

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Pick best model for this message now so we can show it in the UI
    const activeModel = await pickModel(message.trim());
    const modelLabel = {
      'llama3.2:3b': 'Eve Fast (Llama 3.2)',
      'phi3:mini': 'Eve Mini (Phi-3)',
      'mistral:7b-instruct-q4_K_M': 'Eve Smart (Mistral 7B)',
      'qwen2.5-coder:7b': 'Eve Coder (Qwen 2.5)',
      'qwen3:14b': 'Eve Pro (Qwen3 14B)'
    }[activeModel] || activeModel;

    res.write(`data: ${JSON.stringify({ type: 'meta', conversation_id: conv.id, model: activeModel, model_label: modelLabel })}\n\n`);

    async function webSearch(query) {
      try {
        const fetch = require('node-fetch');
        const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const html = await res.text();
        const results = [];
        const regex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        while ((match = regex.exec(html)) && results.length < 4) {
          results.push(match[1].replace(/<[^>]+>/g, '').trim());
        }
        return results.length ? results.join('\n\n') : 'No results found.';
      } catch (e) {
        return 'Search failed: ' + e.message;
      }
    }

    async function runChatLoop() {
      let assistantContent = '';
      let hasExecuted = false;

      await new Promise((resolve) => {
        streamChat(
          TARGET_MODEL,
          ollamaMessages,
          (chunk) => {
            assistantContent += chunk;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
          },
          async (fullContent) => {
            const finalContent = fullContent || assistantContent;
            
            const execMatch = finalContent.match(/<execute>([\s\S]*?)<\/execute>/);
            const readMatch = finalContent.match(/<read>([\s\S]*?)<\/read>/);
            const writeMatch = finalContent.match(/<write\s+file=["']?([^"'>]+)["']?>([\s\S]*?)<\/write>/);
            const searchMatch = finalContent.match(/<search>([\s\S]*?)<\/search>/);

            if (execMatch || readMatch || writeMatch || searchMatch) {
              let output = '';

              if (searchMatch) {
                const query = searchMatch[1].trim();
                res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n\n**🔍 Searching Web:** \`${query}\`\n` })}\n\n`);
                output = await webSearch(query);
              } 
              else if (readMatch) {
                const filePath = readMatch[1].trim();
                res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n\n**📖 Reading File:** \`${filePath}\`\n` })}\n\n`);
                try {
                  output = fs.readFileSync(filePath, 'utf8');
                  if (output.length > 2000) output = output.slice(0, 2000) + '... (truncated)';
                } catch (e) { output = e.message; }
              }
              else if (writeMatch) {
                const filePath = writeMatch[1].trim();
                const fileContent = writeMatch[2];
                res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n\n**💾 Writing File:** \`${filePath}\`\n` })}\n\n`);
                try {
                  fs.writeFileSync(filePath, fileContent, 'utf8');
                  output = `Successfully wrote to ${filePath}`;
                } catch (e) { output = e.message; }
              }
              else if (execMatch) {
                const cmd = execMatch[1].trim();
                res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n\n**⚙ Running Command:** \`${cmd}\`\n` })}\n\n`);
                output = await new Promise((resExec) => {
                  exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
                    resExec(error ? (stderr || error.message) : stdout);
                  });
                });
              }

              res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n**Result:**\n\`\`\`\n${output}\n\`\`\`\n\n` })}\n\n`);
              
              await messages.create({ id: uuidv4(), conversation_id: conv.id, role: 'assistant', content: finalContent });
              const toolResultMsg = { role: 'user', content: `System Tool Output:\n${output}` };
              await messages.create({ id: uuidv4(), conversation_id: conv.id, role: 'user', content: toolResultMsg.content });
              
              ollamaMessages.push({ role: 'assistant', content: finalContent });
              ollamaMessages.push(toolResultMsg);
              
              hasExecuted = true;
              resolve();
            } else {
              await messages.create({ id: uuidv4(), conversation_id: conv.id, role: 'assistant', content: finalContent });
              await conversations.updateTimestamp(conv.id);

              // Save AI response to ChromaDB memory (disabled for performance)
              // saveMemory(req.user.id, \`Eve said: \${finalContent}\`);

              res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
              res.end();
              
              if (conv.title === 'New Conversation') {
                // Run in background without awaiting to prevent freezing the frontend stream!
                generateTitle(TARGET_MODEL, message.trim()).then(title => {
                  conversations.updateTitle(title, conv.id);
                }).catch(e => console.error(e));
              }
              resolve();
            }
          },
          (err) => {
            console.error('Ollama stream error:', err);
            res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
            res.end();
            resolve();
          }
        );
      });

      if (hasExecuted) {
        await runChatLoop();
      }
    }

    await runChatLoop();

  } catch (err) {
    console.error('Chat error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/chat/models ─────────────────────────────────────────
router.get('/models', async (req, res) => {
  const { getAvailableModels } = require('../ollama');
  const result = await getAvailableModels();
  res.json(result);
});

module.exports = router;
