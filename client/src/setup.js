// ─── Setup Wizard: Ollama install guide + model download ──────
import { checkOllama } from './api.js';

const MODELS = [
  { id: 'qwen3:14b', name: 'Jarvis (Qwen3 14B)', icon: '⚡', badge: 'Jarvis Core', desc: 'Highly capable reasoning, full agentic local execution, and rapid voice feedback.', size: '~9.0 GB' }
];

export function renderSetup(root, user, onDone) {
  let step = 1; // 1 = install ollama, 2 = download models, 3 = ready
  let ollamaOnline = false;
  let pulledModels = [];

  async function refreshOllama() {
    const status = await checkOllama();
    ollamaOnline = status.online;
    pulledModels = (status.models || []).map(m => m.name.split(':')[0]);
    return status;
  }

  function copy(text) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  async function draw() {
    await refreshOllama();
    if (ollamaOnline && step === 1) step = 2;

    root.innerHTML = `
      <div class="page-center">
        <div class="glass-card setup-card">
          <div class="logo">Jarvis</div>
          <div class="subtitle">
            Welcome, <strong>${user.username}</strong>! Let's set up your AI agents.
            <br><small style="color:var(--dim)">This runs AI locally on your machine — your data never leaves.</small>
          </div>

          <!-- Step dots -->
          <div class="step-indicator">
            <div class="step-dot ${step === 1 ? 'active' : 'done'}"></div>
            <div class="step-dot ${step === 2 ? 'active' : step > 2 ? 'done' : ''}"></div>
            <div class="step-dot ${step === 3 ? 'active' : ''}"></div>
          </div>

          ${step === 1 ? renderStep1() : ''}
          ${step === 2 ? renderStep2() : ''}
          ${step === 3 ? renderStep3() : ''}
        </div>
      </div>`;

    attachListeners();
  }

  function renderStep1() {
    return `
      <h3 style="font-weight:600;margin-bottom:.8rem">Step 1 — Install Ollama</h3>
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:1rem">
        Ollama lets your browser talk to AI models running on your machine.
        It's free, open-source, and takes 30 seconds to install.
      </p>
      <a href="https://ollama.com/download" target="_blank" rel="noopener"
         class="btn btn-primary" style="display:flex;gap:.5rem;margin-bottom:1rem">
        ⬇ Download Ollama for Windows
      </a>
      <p style="color:var(--muted);font-size:.8rem;margin-bottom:.5rem">
        After installing, run this once in your terminal to allow browser access:
      </p>
      <div class="cmd-box">
        <code>$env:OLLAMA_ORIGINS="*"; ollama serve</code>
        <button onclick="navigator.clipboard.writeText('$env:OLLAMA_ORIGINS=\\'*\\'; ollama serve')">Copy</button>
      </div>
      <div class="ollama-status ${ollamaOnline ? 'connected' : 'disconnected'}" id="ollama-status-box">
        ${ollamaOnline ? '✅ Ollama is running! Click Next.' : '⏳ Waiting for Ollama to start...'}
      </div>
      <div style="display:flex;gap:.8rem;margin-top:1rem">
        <button class="btn btn-ghost" style="flex:1" id="check-ollama-btn">🔄 Check Again</button>
        ${ollamaOnline ? '<button class="btn btn-primary" style="flex:1" id="next-step-btn">Next →</button>' : ''}
      </div>`;
  }

  function renderStep2() {
    return `
      <h3 style="font-weight:600;margin-bottom:.5rem">Step 2 — Download AI Agents</h3>
      <p style="color:var(--muted);font-size:.85rem;margin-bottom:1rem">
        Click a model to download it. Each model downloads to your machine and runs offline.
        <strong>You MUST install at least one model to proceed.</strong>
      </p>
      <div class="model-cards">
        ${MODELS.map(m => {
          const pulled = pulledModels.includes(m.id.split(':')[0]) || pulledModels.includes(m.id);
          return `
            <div class="model-card ${pulled ? 'downloaded' : ''}" data-model="${m.id}" data-cmd="ollama pull ${m.id}">
              <div class="model-icon">${m.icon}</div>
              <div class="model-info">
                <div class="model-name">${m.name} <span class="model-badge" style="font-size:.65rem">${m.badge}</span></div>
                <div class="model-desc">${m.desc}</div>
                <div class="model-size">📦 ${m.size} download</div>
              </div>
              <div class="model-status ${pulled ? 'ready' : 'pending'}">
                ${pulled ? '✓ Ready' : '⬇ Get'}
              </div>
            </div>`;
        }).join('')}
      </div>
      <p style="color:var(--dim);font-size:.78rem;margin-bottom:1rem">
        💡 Click a model above to copy the download command, then paste it in your terminal.
      </p>
      <div style="display:flex;gap:.8rem;margin-top:.5rem">
        <button class="btn btn-ghost" id="check-ollama-btn">🔄 Refresh Status</button>
        ${pulledModels.length > 0
          ? '<button class="btn btn-primary" id="next-step-btn">Start Chatting →</button>'
          : '<button class="btn btn-ghost" disabled style="opacity: 0.5; cursor: not-allowed;">Install a model first</button>'}
      </div>`;
  }

  function renderStep3() {
    return `
      <div style="text-align:center;padding:1rem 0">
        <div style="font-size:3rem;margin-bottom:1rem">🎉</div>
        <h3 style="font-weight:700;font-size:1.2rem;margin-bottom:.5rem">You're all set!</h3>
        <p style="color:var(--muted);font-size:.88rem;margin-bottom:1.5rem">
          Your AI models are ready. All conversations are saved to the cloud so you can access them from any device.
        </p>
        <button class="btn btn-primary" id="done-btn" style="max-width:240px">Enter Jarvis →</button>
      </div>`;
  }

  function attachListeners() {
    document.getElementById('check-ollama-btn')?.addEventListener('click', () => draw());
    document.getElementById('next-step-btn')?.addEventListener('click', () => {
      step = step === 1 ? 2 : 3;
      if (step === 3 && pulledModels.length === 0) { onDone(); return; }
      if (step === 3) draw(); else draw();
    });
    document.getElementById('skip-btn')?.addEventListener('click', () => onDone());
    document.getElementById('done-btn')?.addEventListener('click', () => onDone());

    // Model card click → show pull command + auto-copy
    document.querySelectorAll('.model-card').forEach(card => {
      card.addEventListener('click', () => {
        const cmd = card.dataset.cmd;
        const modelId = card.dataset.model;
        copy(cmd);

        // Show toast
        const status = card.querySelector('.model-status');
        status.textContent = '📋 Copied!';
        status.style.background = 'rgba(255,0,0,.2)';
        status.style.color = 'var(--accent-l)';

        // Show inline instruction
        const existing = document.getElementById('copy-notice');
        if (existing) existing.remove();
        const notice = document.createElement('div');
        notice.id = 'copy-notice';
        notice.style.cssText = 'background:rgba(255,0,0,.12);border:1px solid rgba(255,0,0,.3);border-radius:8px;padding:.8rem;margin-top:.5rem;font-size:.82rem;color:var(--accent-l)';
        notice.innerHTML = `
          <strong>Command copied!</strong> Open a new terminal and paste:<br>
          <code style="color:var(--teal)">${cmd}</code><br>
          <small style="color:var(--dim)">Then click "Refresh Status" when done (may take a few minutes).</small>`;
        card.parentElement.after(notice);

        setTimeout(() => draw(), 180000); // auto-refresh after 3 min
      });
    });
  }

  draw();

  // Poll Ollama status every 5 seconds while on step 1
  const poll = setInterval(async () => {
    const status = await checkOllama();
    if (status.online && step === 1) {
      clearInterval(poll);
      step = 2;
      draw();
    }
  }, 5000);
}
