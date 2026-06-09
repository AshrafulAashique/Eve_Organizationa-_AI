// ─── API wrapper ─────────────────────────────────────────────
const API = '/api';

function token() { return localStorage.getItem('orgai_token'); }

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const t = token();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (res.headers.get('content-type')?.includes('text/event-stream')) return res;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function saveAuth(t, user) {
  localStorage.setItem('orgai_token', t);
  localStorage.setItem('orgai_user', JSON.stringify(user));
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem('orgai_user')); } catch { return null; }
}
export function clearAuth() {
  localStorage.removeItem('orgai_token');
  localStorage.removeItem('orgai_user');
}
export function hasToken() { return !!token(); }

// ─── Ollama (browser → localhost:11434) ──────────────────────
const OLLAMA = 'http://localhost:11434';

export async function checkOllama() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return { online: false, models: [] };
    const data = await r.json();
    return { online: true, models: data.models || [] };
  } catch { return { online: false, models: [] }; }
}

export async function chatOllama(model, messages, onChunk, onDone, onError) {
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true })
    });
    if (!res.ok) { onError(new Error('Ollama error: ' + res.status)); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let full = '', buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        if (!l.trim()) continue;
        try {
          const j = JSON.parse(l);
          if (j.message?.content) { full += j.message.content; onChunk(j.message.content, full); }
          if (j.done) onDone(full);
        } catch {}
      }
    }
    if (!full) onDone('');
  } catch (e) { onError(e); }
}
