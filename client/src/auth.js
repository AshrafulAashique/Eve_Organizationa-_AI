// ─── Auth page: login OR register + org creation ─────────────
import { api, saveAuth } from './api.js';

export function renderAuth(root, onSuccess) {
  // 3 modes: 'login' | 'register' | 'create-org'
  let mode = 'login';

  function draw() {
    root.innerHTML = `
      <div class="page-center">
        <div class="glass-card">
          <div class="logo">Eve</div>
          <div class="subtitle">
            ${mode === 'create-org'
              ? 'Set up your private AI workspace'
              : mode === 'register'
              ? 'Join your organization'
              : 'Private AI Platform for Organizations'}
          </div>

          ${mode === 'create-org' ? `
            <div class="form-group">
              <label>Organization Name</label>
              <input class="form-input" id="org-name" placeholder="Acme Corp" autocomplete="off" />
            </div>
            <div class="form-group">
              <label>Your Name (Admin Username)</label>
              <input class="form-input" id="reg-user" placeholder="johndoe" autocomplete="off" />
            </div>
            <div class="form-group">
              <label>Admin Email</label>
              <input class="form-input" id="auth-email" type="email" placeholder="admin@company.com" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input class="form-input" id="auth-pass" type="password" placeholder="••••••••" />
            </div>
            <button class="btn btn-primary" id="auth-submit">Create Organization &amp; Sign In</button>
            <div class="form-error" id="auth-error"></div>
            <div class="auth-toggle">Already have an org? <a id="toggle-login">Sign In</a></div>
          ` : ''}

          ${mode === 'register' ? `
            <div class="form-group">
              <label>Username</label>
              <input class="form-input" id="reg-user" placeholder="johndoe" autocomplete="off" />
            </div>
            <div class="form-group">
              <label>Organization ID <span style="font-size:11px;opacity:.6">(ask your admin)</span></label>
              <input class="form-input" id="org-id" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input class="form-input" id="auth-email" type="email" placeholder="you@company.com" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input class="form-input" id="auth-pass" type="password" placeholder="••••••••" />
            </div>
            <button class="btn btn-primary" id="auth-submit">Join Organization</button>
            <div class="form-error" id="auth-error"></div>
            <div class="auth-toggle">
              <a id="toggle-login">Sign In</a> · <a id="toggle-org">Create New Org</a>
            </div>
          ` : ''}

          ${mode === 'login' ? `
            <div class="form-group">
              <label>Email</label>
              <input class="form-input" id="auth-email" type="email" placeholder="you@company.com" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input class="form-input" id="auth-pass" type="password" placeholder="••••••••" />
            </div>
            <button class="btn btn-primary" id="auth-submit">Sign In</button>
            <div class="form-error" id="auth-error"></div>
            <div class="auth-toggle">
              No account? <a id="toggle-register">Join an Org</a> ·
              <a id="toggle-org">Create New Org</a>
            </div>
            <div style="margin: 1.5rem 0 0 0; border-top: 1px solid var(--border); padding-top: 1.2rem; text-align: center;">
              <div style="font-size: 11px; color: var(--muted); margin-bottom: 8px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">⚡ Yesterday's Profiles</div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <button class="btn btn-sm btn-ghost" style="font-size: 11px; padding: 0.5rem; width: 100%;" id="dev-profile-yesterday">
                  🔑 beta@test.com (Yesterday's Chats)
                </button>
                <button class="btn btn-sm btn-ghost" style="font-size: 11px; padding: 0.5rem; width: 100%;" id="dev-profile-previous">
                  🔑 admin@test.com (Previous Chats)
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>`;

    const errEl = () => document.getElementById('auth-error');

    // Toggle links
    document.getElementById('toggle-login')?.addEventListener('click', () => { mode = 'login'; draw(); });
    document.getElementById('toggle-register')?.addEventListener('click', () => { mode = 'register'; draw(); });
    document.getElementById('toggle-org')?.addEventListener('click', () => { mode = 'create-org'; draw(); });

    // Developer Profiles Prefill Click Event
    document.getElementById('dev-profile-yesterday')?.addEventListener('click', () => {
      const emailEl = document.getElementById('auth-email');
      const passEl = document.getElementById('auth-pass');
      if (emailEl && passEl) {
        emailEl.value = 'beta@test.com';
        passEl.value = 'password123';
        document.getElementById('auth-submit')?.click();
      }
    });

    document.getElementById('dev-profile-previous')?.addEventListener('click', () => {
      const emailEl = document.getElementById('auth-email');
      const passEl = document.getElementById('auth-pass');
      if (emailEl && passEl) {
        emailEl.value = 'admin@test.com';
        passEl.value = 'password123';
        document.getElementById('auth-submit')?.click();
      }
    });

    // Submit
    document.getElementById('auth-submit').addEventListener('click', async () => {
      errEl().textContent = '';
      const email = document.getElementById('auth-email')?.value.trim();
      const password = document.getElementById('auth-pass')?.value;

      try {
        if (mode === 'login') {
          if (!email || !password) { errEl().textContent = 'Email and password required'; return; }
          const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
          saveAuth(data.token, data.user);
          onSuccess(data.user);

        } else if (mode === 'create-org') {
          const org_name = document.getElementById('org-name')?.value.trim();
          const username = document.getElementById('reg-user')?.value.trim();
          if (!org_name) { errEl().textContent = 'Organization name required'; return; }
          if (!username) { errEl().textContent = 'Username required'; return; }
          if (!email || !password) { errEl().textContent = 'Email and password required'; return; }
          const data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password, org_name }) });
          saveAuth(data.token, data.user);
          onSuccess(data.user);

        } else if (mode === 'register') {
          const username = document.getElementById('reg-user')?.value.trim();
          const org_id = document.getElementById('org-id')?.value.trim();
          if (!username || !org_id || !email || !password) { errEl().textContent = 'All fields required'; return; }
          const data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password, org_id }) });
          saveAuth(data.token, data.user);
          onSuccess(data.user);
        }
      } catch (e) {
        errEl().textContent = e.message;
      }
    });

    // Enter key support
    document.getElementById('auth-pass')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('auth-submit').click();
    });
  }

  draw();
}
