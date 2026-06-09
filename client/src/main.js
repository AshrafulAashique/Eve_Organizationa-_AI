// ─── App Entry Point ──────────────────────────────────────────
import { renderAuth } from './auth.js';
import { renderSetup } from './setup.js';
import { renderChat } from './chat.js';
import { renderAdmin } from './admin.js';
import { api, getUser, clearAuth, hasToken } from './api.js';

const app = document.getElementById('app');
let currentUser = null;

// Show setup wizard only once per user
function setupDone() { return localStorage.getItem(`orgai_setup_${currentUser?.id}`) === '1'; }
function markSetupDone() { localStorage.setItem(`orgai_setup_${currentUser?.id}`, '1'); }

async function boot() {
  if (!hasToken()) {
    renderAuth(app, (user) => { currentUser = user; afterLogin(); });
    return;
  }
  try {
    const data = await api('/auth/me');
    currentUser = data.user;
    afterLogin();
  } catch {
    clearAuth();
    renderAuth(app, (user) => { currentUser = user; afterLogin(); });
  }
}

function afterLogin() {
  if (!setupDone()) {
    renderSetup(app, currentUser, () => { markSetupDone(); showChat(); });
  } else {
    showChat();
  }
}

function showChat() { renderChat(app, currentUser, logout, showAdmin); }
function showAdmin() { renderAdmin(app, currentUser, showChat); }
function logout() { clearAuth(); currentUser = null; boot(); }

boot();
