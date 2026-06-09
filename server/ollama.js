const fetch = require('node-fetch');

const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

// ── Model Registry ─────────────────────────────────────────────────────────
// Ordered: fastest → most capable. Router picks automatically per query.
const MODEL_REGISTRY = [
  { id: 'llama3.2:3b',                name: 'Eve Fast',     tier: 'fast',     icon: '⚡', badge: 'Fast' },
  { id: 'phi3:mini',                  name: 'Eve Mini',     tier: 'balanced', icon: '🔷', badge: 'Mini' },
  { id: 'mistral:7b-instruct-q4_K_M', name: 'Eve Smart',    tier: 'smart',    icon: '🧠', badge: 'Smart' },
  { id: 'qwen2.5-coder:7b',           name: 'Eve Coder',    tier: 'code',     icon: '💻', badge: 'Coder' },
  { id: 'qwen3:14b',                  name: 'Eve Pro',      tier: 'pro',      icon: '🚀', badge: 'Pro' }
];

// Cache pulled model list so we don't hammer Ollama on every request
let _pulledModels = null;
let _pulledAt = 0;

async function getPulledModels() {
  if (_pulledModels && Date.now() - _pulledAt < 30000) return _pulledModels;
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { timeout: 3000 });
    if (!res.ok) return _pulledModels || [];
    const data = await res.json();
    _pulledModels = data.models.map(m => m.name);
    _pulledAt = Date.now();
    return _pulledModels;
  } catch {
    return _pulledModels || [];
  }
}

function isAvailable(pulled, modelId) {
  return pulled.some(p => p === modelId || p.startsWith(modelId.split(':')[0] + ':'));
}

// ── Smart Router ───────────────────────────────────────────────────────────
const FAST_PATTERNS = [
  /\b(time|date|day|year|hour|minute)\b/i,
  /^(hi|hello|hey|good morning|good night|thanks|thank you|ok|okay|yes|no|bye|who are you|how are you)/i,
  /open |launch |start |close |kill |play |pause |stop |volume/i,
  /remind me|set (a )?timer|set (an )?alarm/i,
  /weather|temperature|forecast/i
];

const PRO_PATTERNS = [
  /write (a |an )?(function|class|script|program|code|app|component)/i,
  /\b(debug|refactor|optimize|implement|build|create a)\b/i,
  /analyze|summarize|compare|research|explain in detail/i,
  /essay|report|document|strategy|architecture/i,
  /calculate|math|equation|formula/i
];

const CODE_PATTERNS = [
  /\b(code|function|variable|loop|if|array|object|class|import|export)\b/i,
  /\b(python|javascript|typescript|java|c\+\+|rust|go|sql|html|css)\b/i,
  /syntax|error|exception|bug/i
];

async function pickModel(userMessage) {
  const pulled = await getPulledModels();
  const msg = userMessage || '';

  const needsFast = FAST_PATTERNS.some(p => p.test(msg)) && msg.split(' ').length < 6;
  const needsPro  = PRO_PATTERNS.some(p => p.test(msg)) || msg.length > 600;
  const needsCode = CODE_PATTERNS.some(p => p.test(msg));

  let preference;
  if (needsPro) {
    preference = ['qwen3:14b', 'mistral:7b-instruct-q4_K_M', 'phi3:mini', 'llama3.2:3b'];
  } else if (needsCode) {
    preference = ['qwen2.5-coder:7b', 'mistral:7b-instruct-q4_K_M', 'qwen3:14b', 'phi3:mini'];
  } else if (needsFast) {
    preference = ['llama3.2:3b', 'phi3:mini', 'mistral:7b-instruct-q4_K_M', 'qwen3:14b'];
  } else {
    // Default: phi3:mini — good balance of speed and intelligence for general questions
    preference = ['phi3:mini', 'mistral:7b-instruct-q4_K_M', 'llama3.2:3b', 'qwen3:14b'];
  }

  for (const modelId of preference) {
    if (isAvailable(pulled, modelId)) return modelId;
  }
  return pulled[0] || 'qwen3:14b';
}

const TARGET_MODEL = 'qwen3:14b'; // backwards compat
const AVAILABLE_MODELS = MODEL_REGISTRY;

async function getAvailableModels() {
  try {
    const pulled = await getPulledModels();
    return {
      online: pulled.length > 0,
      models: MODEL_REGISTRY.map(m => ({
        ...m,
        available: isAvailable(pulled, m.id)
      }))
    };
  } catch {
    return { online: false, models: MODEL_REGISTRY };
  }
}

// ── Stream Chat ────────────────────────────────────────────────────────────
async function streamChat(model, messages, onChunk, onDone, onError) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const activeModel = await pickModel(lastUserMsg);
  console.log(`[Router] "${lastUserMsg.slice(0, 60)}" → ${activeModel}`);

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: activeModel, messages, stream: true })
    });

    if (!res.ok) {
      const errText = await res.text();
      onError(new Error(`Ollama error: ${res.status} — ${errText}`));
      return;
    }

    let fullContent = '';
    const body = res.body;
    let buffer = '';
    let doneCalled = false; // Guard: ensure onDone fires exactly once

    const safeDone = () => {
      if (doneCalled) return;
      doneCalled = true;
      onDone(fullContent);
    };

    body.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            fullContent += parsed.message.content;
            onChunk(parsed.message.content);
          }
          if (parsed.done) safeDone();
        } catch {}
      }
    });

    body.on('end', () => {
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.message?.content) {
            fullContent += parsed.message.content;
            onChunk(parsed.message.content);
          }
        } catch {}
      }
      safeDone(); // safe — will no-op if already called
    });

    body.on('error', onError);
  } catch (err) {
    onError(err);
  }
}

// ── Title Generation ───────────────────────────────────────────────────────
async function generateTitle(model, firstMessage) {
  const pulled = await getPulledModels();
  const titleModel = ['llama3.2:3b', 'phi3:mini', 'mistral:7b-instruct-q4_K_M', 'qwen3:14b']
    .find(m => isAvailable(pulled, m)) || 'qwen3:14b';

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: titleModel,
        messages: [{ role: 'user', content: `Generate a very short title (max 6 words, no quotes, no punctuation) for a chat that starts with: "${firstMessage.slice(0, 200)}"` }],
        stream: false,
        options: { temperature: 0.3, num_predict: 20 }
      })
    });
    if (!res.ok) return firstMessage.slice(0, 40);
    const data = await res.json();
    return (data.message?.content || firstMessage).replace(/['"]/g, '').trim().slice(0, 60);
  } catch {
    return firstMessage.slice(0, 40);
  }
}

// ── Embeddings ─────────────────────────────────────────────────────────────
async function getEmbedding(text) {
  try {
    const pulled = await getPulledModels();
    const embedModel = isAvailable(pulled, 'llama3.2:3b') ? 'llama3.2:3b' : 'qwen3:14b';
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embedModel, prompt: text })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding;
  } catch {
    return null;
  }
}

module.exports = { AVAILABLE_MODELS, getAvailableModels, streamChat, generateTitle, getEmbedding, TARGET_MODEL, pickModel };
