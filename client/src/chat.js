// ─── Chat Interface & Eve Voice Engine ───────────────────────────
import { api, checkOllama } from './api.js';
import { marked } from 'marked';
import hljs from 'highlight.js';

// Configure marked to use highlight.js
marked.setOptions({
  highlight: function (code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-'
});

export function renderChat(root, user, onLogout, onAdmin) {
  let activeConvId = null;
  let conversations = [];
  let currentModel = 'qwen3:14b';
  let ollamaOnline = false;
  let sending = false;
  let sessionMessages = [];

  // Voice Engine State
  let isVoiceActive = false;
  let voiceState = 'OFF'; // 'OFF', 'MONITORING', 'LISTENING', 'SPEAKING'
  let recognition = null;
  let speechSynthesisUtterance = null;
  let canvasAnimationId = null;
  let wavePhase = 0;

  root.innerHTML = `
    <div id="main-layout">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <span class="brand">Eve</span>
          <span class="badge">PRIVATE</span>
        </div>
        <button class="new-chat-btn" id="new-chat-btn">＋ New Chat</button>
        <div class="conv-list" id="conv-list"></div>
        <div class="sidebar-footer">
          <div class="user-info">
            <div class="avatar">${user.username[0].toUpperCase()}</div>
            <div>
              <div class="user-name">${user.username}</div>
              <div class="user-role">${user.role.toUpperCase()}</div>
            </div>
          </div>
          <div class="sidebar-actions">
            ${user.role === 'admin' ? '<button class="btn btn-sm btn-ghost" id="admin-btn">⚙ Admin</button>' : ''}
            <button class="btn btn-sm btn-ghost" id="logout-btn">Logout</button>
          </div>
        </div>
      </aside>

      <main class="chat-area">
        <div class="chat-header">
          <div class="custom-model-selector" id="voice-toggle-btn" style="cursor: pointer; border-color: rgba(255, 0, 0, 0.2); background: rgba(255, 0, 0, 0.05); color: var(--accent); transition: opacity 0.3s; opacity: 0.5;">
            <span>🎙️</span>
            <span>Eve Voice Console</span>
          </div>
          <span class="model-badge voice-engine-badge" id="active-model-badge">Eve AI</span>
          <div style="flex:1"></div>
          <span id="ollama-indicator" title="Ollama status">
            <span class="ollama-dot off" id="ollama-dot"></span>
            <span id="ollama-label" style="font-size:.75rem;color:var(--muted)">Offline</span>
          </span>
          <span id="conv-title-hdr" style="font-size:.78rem;color:var(--dim);margin-left:.8rem"></span>
        </div>

        <div class="messages" id="messages">
          <div class="welcome-msg" id="welcome">
            <div class="big-icon">🤖</div>
            <h2>Welcome to Eve</h2>
            <p>Your chats are stored securely and available from any device. AI runs locally on your machine.</p>
          </div>
        </div>

        <!-- Eve Voice Console Panel -->
        <div class="voice-console" id="voice-console" style="display: none;">
          <div class="voice-header">
            <div class="voice-title">
              <span class="live-dot"></span> Eve VOICE LINK
            </div>
            <div style="display: flex; gap: 1rem; align-items: center;">
              <span id="voice-wake-word-status" style="font-size:0.75rem; color:var(--muted);">Monitoring Wake Word...</span>
              <button class="btn btn-sm btn-ghost" id="close-voice-btn" style="color: var(--red); border-color: rgba(255, 0, 0, 0.3); padding: 0.2rem 0.6rem; font-size: 0.75rem;">✕ Close Voice</button>
            </div>
          </div>
          <div class="voice-status-bar">
            <span class="voice-status-lbl" id="voice-status-lbl">STANDBY</span>
            <span class="voice-transcript" id="voice-transcript">Say "Eve"</span>
          </div>
          <div class="eve-arc-reactor" id="eve-reactor">
            <div class="reactor-ring outer"></div>
            <div class="reactor-ring middle"></div>
            <div class="reactor-ring inner"></div>
            <div class="reactor-core"></div>
          </div>
          <canvas class="voice-visualizer-canvas" id="voice-canvas" height="45"></canvas>
        </div>

        <div id="model-warning-container"></div>
        <div class="chat-input-bar">
          <button class="attach-btn" id="attach-btn" title="Attach local file">📎</button>
          <input type="file" id="file-input" style="display:none;" />
          <textarea id="msg-input" rows="1" placeholder="Type your message… (Enter to send)"></textarea>
          <button class="send-btn" id="send-btn">▶</button>
        </div>
      </main>
    </div>`;

  // ── Refs ──
  const convListEl      = document.getElementById('conv-list');
  const messagesEl      = document.getElementById('messages');
  const msgInput        = document.getElementById('msg-input');
  const sendBtn         = document.getElementById('send-btn');
  const attachBtn       = document.getElementById('attach-btn');
  const fileInput       = document.getElementById('file-input');
  const ollamaDot       = document.getElementById('ollama-dot');
  const ollamaLabel     = document.getElementById('ollama-label');
  const titleHdr        = document.getElementById('conv-title-hdr');
  const voiceConsole    = document.getElementById('voice-console');
  const voiceCanvas     = document.getElementById('voice-canvas');
  const voiceToggleBtn  = document.getElementById('voice-toggle-btn');
  const closeVoiceBtn   = document.getElementById('close-voice-btn');

  let activePullInterval = null;
  let isInstalling = false;

  // Set the body class
  document.body.className = '';
  document.body.classList.add('model-qwen2'); // Used to trigger red UI in CSS

  // ── Ollama status polling ──
  async function updateOllamaStatus() {
    const status = await checkOllama();
    ollamaOnline = status.online;
    ollamaDot.className = `ollama-dot ${status.online ? 'on' : 'off'}`;
    ollamaLabel.textContent = status.online ? 'AI Ready' : 'Ollama Offline';

    if (!status.online) {
      ollamaLabel.style.color = 'var(--red)';
      sendBtn.title = 'Ollama not running. Install it at ollama.com';
      document.getElementById('model-warning-container').innerHTML = `
        <div class="model-warning-box" style="margin: 0 10% 1rem 10%; padding: 1.2rem; background: rgba(255, 0, 0, 0.1); border: 1px solid rgba(255, 0, 0, 0.25); border-radius: var(--rs); backdrop-filter: blur(12px); text-align: center; border-left: 4px solid var(--red);">
          <div style="font-size: 0.95rem; font-weight: 600; color: #fff;">⚠️ Ollama is offline</div>
          <div style="font-size: 0.85rem; color: var(--muted); margin-top: 5px;">Make sure Ollama is launched and running locally on your computer.</div>
        </div>
      `;
      msgInput.disabled = true;
      sendBtn.disabled = true;

      return;
    }

    ollamaLabel.style.color = 'var(--green)';
    sendBtn.title = 'Send message';

    const installed = status.models.map(m => m.name.split(':')[0]);
    const currentBase = currentModel.split(':')[0];
    const isInstalled = installed.includes(currentBase);

    if (!isInstalled) {
      msgInput.disabled = true;
      sendBtn.disabled = true;

      if (!isInstalling) {
        document.getElementById('model-warning-container').innerHTML = `
          <div class="model-warning-box" style="margin: 0 10% 1rem 10%; padding: 1.2rem; background: rgba(255, 0, 0, 0.1); border: 1px solid rgba(255, 0, 0, 0.25); border-radius: var(--rs); backdrop-filter: blur(12px); display: flex; flex-direction: column; gap: 0.8rem; align-items: center; text-align: center; border-left: 4px solid var(--red); animation: fadeIn 0.4s ease;">
            <div style="font-size: 1.2rem;">⚠️</div>
            <div style="font-size: 0.95rem; font-weight: 600; color: #fff;">
              Model <strong style="color: var(--accent);">Qwen3 (14B)</strong> is not installed locally.
            </div>
            <div style="font-size: 0.85rem; color: var(--muted); max-width: 400px; line-height: 1.5;">
              This model needs to be downloaded to your local Ollama setup before you can chat or use Eve Voice Engine.
            </div>
          </div>
        `;
      }
    } else {
      isInstalling = false;
      if (activePullInterval) {
        clearInterval(activePullInterval);
        activePullInterval = null;
      }
      document.getElementById('model-warning-container').innerHTML = '';
      msgInput.disabled = false;
      sendBtn.disabled = false;
    }
  }
  updateOllamaStatus();
  setInterval(updateOllamaStatus, 10000);

  // ── Load conversations ──
  async function loadConvs() {
    try {
      const data = await api('/conversations');
      conversations = data.conversations || [];
      renderConvList();
    } catch { conversations = []; }
  }

  function renderConvList() {
    convListEl.innerHTML = conversations.map(c => `
      <div class="conv-item ${c.id === activeConvId ? 'active' : ''}" data-id="${c.id}">
        <span>💬</span>
        <span class="conv-title">${esc(c.title || 'New Conversation')}</span>
        <span class="conv-delete" data-del="${c.id}">✕</span>
      </div>`).join('');

    convListEl.querySelectorAll('.conv-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.dataset.del) return;
        loadConversation(el.dataset.id);
      });
    });

    convListEl.querySelectorAll('.conv-delete').forEach(el => {
      el.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Delete this conversation?')) return;
        await api(`/conversations/${el.dataset.del}`, { method: 'DELETE' }).catch(() => {});
        if (activeConvId === el.dataset.del) { activeConvId = null; sessionMessages = []; showWelcome(); }
        loadConvs();
      });
    });
  }

  async function loadConversation(id) {
    activeConvId = id;
    sessionMessages = [];
    renderConvList();
    try {
      const data = await api(`/conversations/${id}`);
      titleHdr.textContent = data.conversation?.title || '';
      sessionMessages = (data.messages || []).map(m => ({ role: m.role, content: m.content }));
      renderMessages(data.messages || []);
    } catch { }
  }

  function renderMessages(msgs) {
    messagesEl.innerHTML = msgs.map(m =>
      `<div class="msg ${m.role}">${m.role === 'assistant' ? renderMd(m.content) : esc(m.content)}</div>`
    ).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showWelcome() {
    messagesEl.innerHTML = `
      <div class="welcome-msg">
        <div class="big-icon">🤖</div>
        <h2>Welcome to Eve</h2>
        <p>Your chats are stored securely and available from any device. AI runs locally on your machine.</p>
      </div>`;
    titleHdr.textContent = '';
  }

  // ── Send message ──
  async function sendMessage() {
    const content = msgInput.value.trim();
    if (!content || sending) return;

    if (!ollamaOnline) {
      alert('Ollama is not running. Please install Ollama from ollama.com and run: ollama serve');
      return;
    }

    sending = true;
    sendBtn.disabled = true;
    msgInput.value = '';
    msgInput.style.height = 'auto';

    if (document.querySelector('.welcome-msg')) messagesEl.innerHTML = '';

    appendBubble('user', esc(content));
    sessionMessages.push({ role: 'user', content });

    const aiDiv = appendBubble('assistant', '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>');

    let fullResponse = '';

    await new Promise(resolve => {
      const currentToken = localStorage.getItem('orgai_token');
      fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': currentToken ? 'Bearer ' + currentToken : ''
        },
        body: JSON.stringify({
          conversation_id: activeConvId || undefined,
          message: content
        })
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Server error');
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop();
          for (const part of parts) {
            if (part.startsWith('data: ')) {
              try {
                const data = JSON.parse(part.slice(6));
                if (data.type === 'meta') {
                  if (!activeConvId) {
                    activeConvId = data.conversation_id;
                  }
                  if (data.model_label) {
                    const badge = document.getElementById('active-model-badge');
                    if (badge) badge.textContent = data.model_label;
                  }
                } else if (data.type === 'chunk') {
                  fullResponse += data.content;
                  if (!window.renderRAF) {
                    window.renderRAF = requestAnimationFrame(() => {
                      aiDiv.innerHTML = renderMd(fullResponse);
                      messagesEl.scrollTop = messagesEl.scrollHeight;
                      window.renderRAF = null;
                    });
                  }
                } else if (data.type === 'title') {
                  titleHdr.textContent = data.title;
                  loadConvs();
                } else if (data.type === 'error') {
                  aiDiv.innerHTML += `<br><span style="color:var(--red)">⚠ ${esc(data.message)}</span>`;
                } else if (data.type === 'done') {
                  resolve();
                }
              } catch (e) {}
            }
          }
        }
        if (window.renderRAF) { cancelAnimationFrame(window.renderRAF); window.renderRAF = null; }
        aiDiv.innerHTML = renderMd(fullResponse);
        sessionMessages.push({ role: 'assistant', content: fullResponse });
        loadConvs();
        resolve();
      }).catch(err => {
        aiDiv.innerHTML = `<span style="color:var(--red)">⚠ ${esc(err.message)}. Is backend running?</span>`;
        resolve();
      });
    });

    sending = false;
    sendBtn.disabled = false;
    msgInput.focus();
  }

  function appendBubble(role, html) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = html;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  // ── Advanced Voice Assistant Engine Integration ────────────────
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let vadTimeout = null;
  let audioContext = null;
  let analyser = null;
  let microphone = null;
  let vadActive = false;
  let streamRef = null;

  async function initSpeechEngine() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef = stream;
      
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      microphone = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.1;
      microphone.connect(analyser);

      mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        if (audioChunks.length === 0) return;
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        audioChunks = []; 
        
        // Skip tiny noises
        if (blob.size < 4000) return; 

        document.getElementById('voice-transcript').textContent = "Processing audio...";
        
        const formData = new FormData();
        formData.append('audio', blob, 'recording.wav');
        
        try {
          const res = await fetch('http://localhost:8001/transcribe', {
            method: 'POST',
            body: formData
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.text.trim();
            if (text) {
              document.getElementById('voice-transcript').textContent = '"' + text + '"';
              processCommand(text);
            } else {
              document.getElementById('voice-transcript').textContent = "Listening...";
            }
          }
        } catch (e) {
          console.error("Transcribe error:", e);
          document.getElementById('voice-transcript').textContent = "Whisper API offline.";
        }
      };

      vadActive = true;
      const pcmData = new Uint8Array(analyser.frequencyBinCount);
      let baselineVolume = null;
      let recordStartTime = 0;
      const MAX_RECORD_MS = 6000; // Force stop after 6s of continuous recording
      const SILENCE_MS = 1200;

      function checkAudioLevel() {
        if (!vadActive) return;

        analyser.getByteFrequencyData(pcmData);
        let sum = 0;
        for (let i = 0; i < pcmData.length; i++) sum += pcmData[i];
        let averageVolume = sum / pcmData.length;

        // Auto-calibrate baseline volume on first few frames
        if (baselineVolume === null && averageVolume > 0) {
          baselineVolume = averageVolume;
        }
        if (baselineVolume !== null) {
          // Slowly adapt baseline to background noise
          baselineVolume = (baselineVolume * 0.99) + (averageVolume * 0.01);
        }

        window.currentAudioVolume = Math.max(0, averageVolume - (baselineVolume || 0));

        const dynamicThreshold = (baselineVolume || 0) + 12; // 12 above ambient noise

        if (averageVolume > dynamicThreshold && !sending && voiceState !== 'SPEAKING') {
          if (!isRecording && mediaRecorder.state === 'inactive') {
            isRecording = true;
            audioChunks = [];
            recordStartTime = Date.now();
            mediaRecorder.start();
            document.getElementById('voice-transcript').textContent = "Listening...";
            
            // Switch wave state to LISTENING when VAD triggers
            if (voiceState !== 'SPEAKING') {
              voiceState = 'LISTENING';
              document.getElementById('voice-status-lbl').textContent = 'LISTENING';
              document.getElementById('voice-status-lbl').style.color = 'var(--accent)';
            }
          }
          if (vadTimeout) {
            clearTimeout(vadTimeout);
            vadTimeout = null;
          }
        } else {
          if (isRecording && mediaRecorder.state === 'recording' && !vadTimeout) {
            vadTimeout = setTimeout(() => {
              mediaRecorder.stop();
              isRecording = false;
              
              // Switch wave state back to MONITORING
              if (voiceState !== 'SPEAKING') {
                voiceState = 'MONITORING';
                document.getElementById('voice-status-lbl').textContent = 'MONITORING';
                document.getElementById('voice-status-lbl').style.color = '#94a3b8';
              }
            }, SILENCE_MS);
          }
        }

        // Force stop if talking for too long without pause
        if (isRecording && mediaRecorder.state === 'recording' && Date.now() - recordStartTime > MAX_RECORD_MS) {
           if (vadTimeout) clearTimeout(vadTimeout);
           mediaRecorder.stop();
           isRecording = false;
           recordStartTime = 0;
        }
        
        requestAnimationFrame(checkAudioLevel);
      }
      checkAudioLevel();
      console.log('Local Whisper VAD engine active');

    } catch (e) {
      console.error('Mic error:', e);
      document.getElementById('voice-transcript').textContent = 'Microphone error: ' + e.message;
    }
  }

  let isStandby = false;

  function speakText(text, callback, cancelPrevious = false) {
    if (!text) return;
    if (cancelPrevious && currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    const audioObj = new Audio(`http://localhost:8001/speak?text=${encodeURIComponent(text)}`);
    audioObj.crossOrigin = "anonymous";
    playAudioObj(audioObj, callback, cancelPrevious);
  }

  function processCommand(cmdText) {
      if (!cmdText) return;
      
      const lowerCmd = cmdText.toLowerCase();
      const cleanCmd = lowerCmd.replace(/[.,!?]/g, '').trim();
      const wakeWords = ['eve', 'travis', 'chavez', 'garbage'];

      if (lowerCmd.includes('standby') || lowerCmd.includes('go to sleep')) {
        isStandby = true;
        speakText("Standby mode engaged, Sir.", () => {
          if (isVoiceActive) {
            voiceState = 'MONITORING';
            document.getElementById('voice-status-lbl').textContent = 'STANDBY';
            document.getElementById('voice-status-lbl').style.color = 'var(--muted)';
            document.getElementById('voice-transcript').textContent = 'Say "Eve" to wake me up';
            document.getElementById('voice-wake-word-status').textContent = 'Monitoring Wake Word...';
          }
        }, true);
      } else if (isStandby && wakeWords.includes(cleanCmd)) {
        isStandby = false;
        playChime(true);
        voiceState = 'LISTENING';
        document.getElementById('voice-status-lbl').textContent = 'LISTENING';
        document.getElementById('voice-status-lbl').style.color = 'var(--accent)';
        document.getElementById('voice-wake-word-status').textContent = 'ACTIVE STATE';
        speakText("At your service, Sir.", null, true);
      } else if (!isStandby) {
        handleVoiceCommand(cmdText);
      }
  }

  // Synthesize futuristic dual sine-wave chimes using AudioContext
  function playChime(isWakeUp = true) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const actx = new AudioContext();

      const osc1 = actx.createOscillator();
      const osc2 = actx.createOscillator();
      const gain = actx.createGain();

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(actx.destination);

      if (isWakeUp) {
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440.00, actx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(880.00, actx.currentTime + 0.2);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(554.37, actx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(1108.73, actx.currentTime + 0.2);

        gain.gain.setValueAtTime(0.12, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.22);

        osc1.start();
        osc2.start();
        osc1.stop(actx.currentTime + 0.25);
        osc2.stop(actx.currentTime + 0.25);
      } else {
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, actx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(329.63, actx.currentTime + 0.18);

        gain.gain.setValueAtTime(0.08, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.2);

        osc1.start();
        osc1.stop(actx.currentTime + 0.22);
      }
    } catch (e) {
      console.warn('Real-time AudioContext chime failed:', e);
    }
  }

  // Synthesize Speech utilizing Browser Text-to-Speech
  let currentAudio = null;
  function playAudioObj(audioObj, callback, cancelPrevious = false) {
    if (cancelPrevious && currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    voiceState = 'SPEAKING';
    document.getElementById('voice-status-lbl').textContent = 'SPEAKING';
    document.getElementById('voice-status-lbl').style.color = 'var(--red)';

    currentAudio = audioObj;
    
    currentAudio.onended = () => {
      if (isVoiceActive) {
        voiceState = 'LISTENING';
        document.getElementById('voice-status-lbl').textContent = 'LISTENING';
        document.getElementById('voice-status-lbl').style.color = 'var(--accent)';
      }
      if (callback) callback();
    };

    currentAudio.onerror = (e) => {
      console.error('Speech Synthesis Error:', e);
      if (isVoiceActive) {
        voiceState = 'LISTENING';
        document.getElementById('voice-status-lbl').textContent = 'LISTENING';
        document.getElementById('voice-status-lbl').style.color = 'var(--accent)';
      }
      if (callback) callback();
    };

    currentAudio.play().catch(e => {
        console.error('Audio playback failed', e);
        if (callback) callback();
    });
  }

  // Process a verbal command directly to Eve local agent
  async function handleVoiceCommand(commandText) {
    if (!commandText || sending) return;

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    sending = true;

    if (isVoiceActive) {
      voiceState = 'PROCESSING';
      document.getElementById('voice-status-lbl').textContent = 'PROCESSING...';
      document.getElementById('voice-status-lbl').style.color = '#eab308'; // Yellow
    }

    if (document.querySelector('.welcome-msg')) messagesEl.innerHTML = '';

    appendBubble('user', esc(commandText));
    sessionMessages.push({ role: 'user', content: commandText });

    const aiDiv = appendBubble('assistant', '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>');

    let fullResponse = '';
    let spokenSentenceIndex = 0;
    let spokenSentences = [];

    function cleanForSpeech(text) {
      return text.replace(/<execute>[\s\S]*?<\/execute>/gi, '')
                 .replace(/<read>[\s\S]*?<\/read>/gi, '')
                 .replace(/<write[\s\S]*?<\/write>/gi, '')
                 .replace(/<search>[\s\S]*?<\/search>/gi, '')
                 .replace(/\*\*⚙ Running Command:\*\*[\s\S]*?\n/gi, '')
                 .replace(/\*\*Result:\*\*[\s\S]*?```[\s\S]*?```/gi, '')
                 .replace(/Result:[\s\S]*?```[\s\S]*?```/gi, '')
                 .replace(/<[^>]+>/g, '')
                 .replace(/`[\s\S]*?`/g, '')
                 .replace(/\*+/g, '')
                 .trim();
    }

    // TTS queue: preload audio for seamless back-to-back playback
    const ttsQueue = [];
    let ttsBusy = false;
    function enqueueSpeech(sentence) {
      if (!sentence || sentence.length < 3 || sentence.startsWith('<') || sentence.startsWith('`')) return;
      const clean = cleanForSpeech(sentence);
      if (!clean) return;
      
      const audioUrl = 'http://localhost:8001/speak?text=' + encodeURIComponent(clean);
      const preloadedAudio = new Audio(audioUrl);
      preloadedAudio.preload = 'auto'; // Forces browser to fetch immediately

      ttsQueue.push(preloadedAudio);
      if (!ttsBusy) drainTTSQueue();
    }
    function drainTTSQueue() {
      if (ttsQueue.length === 0) { ttsBusy = false; return; }
      ttsBusy = true;
      const nextAudio = ttsQueue.shift();
      playAudioObj(nextAudio, drainTTSQueue);
    }

    function renderSynchronizedOutput() {
      // Show full streaming text immediately — don't wait for speech
      const displayText = fullResponse
        .replace(/<execute>[\s\S]*?<\/execute>/gi, '')
        .replace(/<read>[\s\S]*?<\/read>/gi, '')
        .replace(/<write[\s\S]*?<\/write>/gi, '')
        .replace(/<search>[\s\S]*?<\/search>/gi, '')
        .replace(/<(execute|read|write|search)\b[^>]*>[\s\S]*$/gi, '') // Strip UNCLOSED tags during stream
        .replace(/\*\*⚙ Running Command:\*\*[\s\S]*?\n/gi, '')
        .trim();
      aiDiv.innerHTML = renderMd(displayText) || '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    await new Promise(resolve => {
      const currentToken = localStorage.getItem('orgai_token');
      fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': currentToken ? 'Bearer ' + currentToken : ''
        },
        body: JSON.stringify({
          conversation_id: activeConvId || undefined,
          message: commandText
        })
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Server error');
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop();
          for (const part of parts) {
            if (part.startsWith('data: ')) {
              try {
                const data = JSON.parse(part.slice(6));
                if (data.type === 'meta') {
                  if (!activeConvId) {
                    activeConvId = data.conversation_id;
                  }
                  if (data.model_label) {
                    const badge = document.getElementById('active-model-badge');
                    if (badge) badge.textContent = data.model_label;
                  }
                } else if (data.type === 'chunk') {
                  fullResponse += data.content;
                  renderSynchronizedOutput();

                  // Speak sentences as they complete mid-stream
                  const speakable = cleanForSpeech(fullResponse);
                  const sentences = speakable.split(/(?<=[.!?])\s+(?=[A-Z"\u2019])/);
                  while (sentences.length > spokenSentenceIndex + 1) {
                    enqueueSpeech(sentences[spokenSentenceIndex].trim());
                    spokenSentenceIndex++;
                  }
                } else if (data.type === 'title') {
                  titleHdr.textContent = data.title;
                  loadConvs();
                } else if (data.type === 'error') {
                  aiDiv.innerHTML += `<br><span style="color:var(--red)">⚠ ${esc(data.message)}</span>`;
                } else if (data.type === 'done') {
                  resolve();
                }
              } catch (e) {}
            }
          }
        }

        // Speak any remaining unspoken sentences when stream ends
        const finalSpeakable = cleanForSpeech(fullResponse);
        const finalSentences = finalSpeakable.split(/(?<=[.!?])\s+(?=[A-Z"\u2019])/);
        const remaining = finalSentences.slice(spokenSentenceIndex).join(' ').trim();
        if (remaining && remaining.length > 2) {
          enqueueSpeech(remaining);
        }

        // After all speech drains, switch back to listening
        const waitForSpeech = setInterval(() => {
          if (!ttsBusy && ttsQueue.length === 0) {
            clearInterval(waitForSpeech);
            if (isVoiceActive) {
              voiceState = 'LISTENING';
              document.getElementById('voice-status-lbl').textContent = 'LISTENING';
              document.getElementById('voice-status-lbl').style.color = 'var(--accent)';
              document.getElementById('voice-transcript').textContent = '"Waiting..."';
            }
          }
        }, 200);
        if (window.renderRAF) { cancelAnimationFrame(window.renderRAF); window.renderRAF = null; }
        aiDiv.innerHTML = renderMd(fullResponse);
        sessionMessages.push({ role: 'assistant', content: fullResponse });
        loadConvs();
        resolve();
      }).catch(err => {
        aiDiv.innerHTML = `<span style="color:var(--red)">⚠ ${esc(err.message)}</span>`;
        resolve();
      });
    });

    sending = false;
  }

  function drawWave() {
    if (!isVoiceActive) return;
    const ctx = voiceCanvas.getContext('2d');
    const width = voiceCanvas.width;
    const height = voiceCanvas.height;

    ctx.clearRect(0, 0, width, height);

    let dynamicAmp = (window.currentAudioVolume || 0) * 0.5;
    let waveColor = 'rgba(255, 0, 0, 0.5)';
    let waveSpeed = 0.05;
    let waveAmplitude = 2;
    let waveFrequency = 0.02;
    let waveLines = 2;

    if (voiceState === 'LISTENING') {
      waveColor = '#00f2fe';
      waveSpeed = 0.16;
      waveAmplitude = 12 + dynamicAmp;
      waveFrequency = 0.04;
      waveLines = 4;
    } else if (voiceState === 'SPEAKING') {
      waveColor = '#f43f5e';
      waveSpeed = 0.24;
      waveAmplitude = 15 + (Math.random() * 10);
      waveFrequency = 0.05;
      waveLines = 5;
    } else if (voiceState === 'PROCESSING') {
      waveColor = '#eab308';
      waveSpeed = 0.1;
      waveAmplitude = 6 + (Math.random() * 4);
      waveFrequency = 0.08;
      waveLines = 3;
    } else if (voiceState === 'MONITORING') {
      waveColor = '#94a3b8';
      waveSpeed = 0.03;
      waveAmplitude = 2; // Flat when not recording
      waveFrequency = 0.02;
      waveLines = 2;
    }

    const reactor = document.getElementById('eve-reactor');
    if (reactor) {
      if (voiceState === 'SPEAKING') {
        reactor.style.transform = 'scale(1.2)';
        reactor.style.opacity = '1';
        reactor.style.filter = 'hue-rotate(320deg) brightness(1.5)';
      } else if (voiceState === 'LISTENING') {
        reactor.style.transform = 'scale(1)';
        reactor.style.opacity = '1';
        reactor.style.filter = 'none';
      } else if (voiceState === 'PROCESSING') {
        reactor.style.transform = 'scale(0.9)';
        reactor.style.opacity = '0.8';
        reactor.style.filter = 'hue-rotate(60deg) brightness(1.2)';
      } else {
        reactor.style.transform = 'scale(0.7)';
        reactor.style.opacity = '0.3';
        reactor.style.filter = 'grayscale(0.5)';
      }
      reactor.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
    }

    wavePhase += waveSpeed;

    ctx.shadowBlur = 8;
    ctx.shadowColor = waveColor;

    for (let i = 0; i < waveLines; i++) {
      ctx.beginPath();
      ctx.lineWidth = i === 0 ? 2 : 1;
      ctx.strokeStyle = waveColor + (i === 0 ? 'FF' : '33'); 

      const offset = i * (Math.PI / 5);
      for (let x = 0; x < width; x++) {
        // Siri double envelope calculation to squeeze/pinch both left and right edges
        const envelope = Math.sin((x / width) * Math.PI);
        const y = (height / 2) + Math.sin(x * waveFrequency - wavePhase + offset) * waveAmplitude * envelope;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.shadowBlur = 0; 
    canvasAnimationId = requestAnimationFrame(drawWave);
  }

  function startVoiceEngine() {
    isVoiceActive = true;
    isStandby = false;
    voiceConsole.style.display = 'flex';

    // Start in MONITORING mode, will switch to LISTENING when speaking
    voiceState = 'MONITORING';
    document.getElementById('voice-status-lbl').textContent = 'MONITORING';
    document.getElementById('voice-status-lbl').style.color = '#94a3b8';
    document.getElementById('voice-transcript').textContent = 'Waiting for voice...';
    document.getElementById('voice-wake-word-status').textContent = 'ACTIVE STATE';

    playChime(true);
    if (!streamRef) initSpeechEngine();
    else { vadActive = true; }
    
    if (window.speechSynthesis) window.speechSynthesis.getVoices();

    drawWave();
  }

  function stopVoiceEngine() {
    isVoiceActive = false;
    voiceState = 'OFF';
    voiceConsole.style.display = 'none';

    playChime(false);

    vadActive = false;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop(); } catch(e){}
    }
    isRecording = false;

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (canvasAnimationId) {
      cancelAnimationFrame(canvasAnimationId);
      canvasAnimationId = null;
    }
  }

  // ── Events ──
  if (voiceToggleBtn) {
    voiceToggleBtn.addEventListener('click', () => {
      if (isVoiceActive) {
        stopVoiceEngine();
        voiceToggleBtn.style.opacity = '0.5';
      } else {
        startVoiceEngine();
        voiceToggleBtn.style.opacity = '1';
      }
    });
  }

  if (closeVoiceBtn) {
    closeVoiceBtn.addEventListener('click', () => {
      stopVoiceEngine();
      if (voiceToggleBtn) voiceToggleBtn.style.opacity = '0.5';
    });
  }

  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const attachment = `\n\n[Attached File: ${file.name}]\n\`\`\`\n${text}\n\`\`\``;
    msgInput.value += attachment;
    msgInput.style.height = 'auto'; 
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
    fileInput.value = ''; 
  });

  sendBtn.addEventListener('click', sendMessage);
  msgInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  msgInput.addEventListener('input', () => { msgInput.style.height = 'auto'; msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px'; });
  document.getElementById('new-chat-btn').addEventListener('click', () => { activeConvId = null; sessionMessages = []; renderConvList(); showWelcome(); });
  document.getElementById('logout-btn').addEventListener('click', onLogout);
  document.getElementById('admin-btn')?.addEventListener('click', onAdmin);

  // Voice engine is now toggled manually via voiceToggleBtn

  loadConvs();
}

// ── Helpers ──
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function renderMd(text) {
  try {
    return marked.parse(text);
  } catch (e) {
    console.error('Markdown parse error:', e);
    return esc(text);
  }
}
