// ─── Admin Dashboard ──────────────────────────────────────────
import { api } from './api.js';

export function renderAdmin(root, user, onBack) {
  root.innerHTML = `
    <div id="main-layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <span class="brand">Eve</span>
          <span class="badge">ADMIN</span>
        </div>
        <div style="padding:.8rem">
          <button class="new-chat-btn" id="back-btn">← Back to Chat</button>
          <div class="conv-list" style="margin-top:1rem">
            <div class="conv-item active" data-view="stats"><span>📊</span><span class="conv-title">Statistics</span></div>
            <div class="conv-item" data-view="users"><span>👥</span><span class="conv-title">User Management</span></div>
            <div class="conv-item" data-view="chats"><span>💬</span><span class="conv-title">User Chats</span></div>
          </div>
        </div>
        <div class="sidebar-footer">
          <div class="user-info">
            <div class="avatar">${user.username[0].toUpperCase()}</div>
            <div><div class="user-name">${user.username}</div><div class="user-role">ADMIN</div></div>
          </div>
        </div>
      </aside>
      <div class="admin-panel" id="admin-content"><p style="color:var(--muted)">Loading...</p></div>
    </div>`;

  document.getElementById('back-btn').addEventListener('click', onBack);

  const navItems = root.querySelectorAll('.conv-item[data-view]');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      const v = item.dataset.view;
      if (v === 'stats') showStats();
      else if (v === 'users') showUsers();
      else if (v === 'chats') showChats();
    });
  });

  const content = document.getElementById('admin-content');

  async function showStats() {
    try {
      const s = await api('/admin/stats');
      content.innerHTML = `
        <h2>📊 Statistics</h2>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${s.total_users}</div><div class="stat-label">Total Users</div></div>
          <div class="stat-card"><div class="stat-value">${s.active_users}</div><div class="stat-label">Active Users</div></div>
          <div class="stat-card"><div class="stat-value">${s.total_conversations}</div><div class="stat-label">Conversations</div></div>
          <div class="stat-card"><div class="stat-value">${s.total_messages}</div><div class="stat-label">Messages</div></div>
        </div>`;
    } catch (e) {
      content.innerHTML = `<p style="color:var(--red)">Failed: ${e.message}</p>`;
    }
  }

  async function showUsers() {
    try {
      const data = await api('/admin/users');
      const users = data.users || [];
      content.innerHTML = `
        <h2>👥 User Management</h2>
        <table class="admin-table">
          <tr><th>Status</th><th>Username</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr>
          ${users.map(u => `
            <tr>
              <td><span class="status-dot ${u.is_active ? 'active' : 'inactive'}"></span>${u.is_active ? 'Active' : 'Disabled'}</td>
              <td>${esc(u.username)}</td>
              <td>${esc(u.email)}</td>
              <td><span class="role-badge ${u.role}">${u.role}</span></td>
              <td>${new Date(u.created_at).toLocaleDateString()}</td>
              <td style="display:flex;gap:.4rem;flex-wrap:wrap">
                <button class="btn btn-sm btn-ghost role-btn" data-uid="${u.id}" data-role="${u.role}">
                  ${u.role === 'admin' ? 'Demote' : 'Promote'}
                </button>
                <button class="btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-ghost'} status-btn" data-uid="${u.id}" data-active="${u.is_active ? '1' : '0'}">
                  ${u.is_active ? 'Disable' : 'Enable'}
                </button>
              </td>
            </tr>`).join('')}
        </table>
        <div style="margin-top:1rem;padding:.8rem;background:var(--card);border:1px solid var(--border);border-radius:var(--rs)">
          <strong style="font-size:.85rem">Invite others to join:</strong>
          <div style="font-size:.8rem;color:var(--muted);margin-top:.3rem">
            Share your <strong>Organization ID: ${esc(user.org_id)}</strong> with teammates. They use it when registering.
          </div>
          <button class="btn btn-sm btn-ghost" style="margin-top:.5rem" id="copy-org-id">📋 Copy Org ID</button>
        </div>`;

      document.getElementById('copy-org-id')?.addEventListener('click', () => {
        navigator.clipboard.writeText(user.org_id);
        document.getElementById('copy-org-id').textContent = '✓ Copied!';
      });

      content.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const newRole = btn.dataset.role === 'admin' ? 'user' : 'admin';
          await api('/admin/users', { method: 'PATCH', body: JSON.stringify({ user_id: btn.dataset.uid, role: newRole }) });
          showUsers();
        });
      });

      content.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const newStatus = btn.dataset.active !== '1';
          await api('/admin/users', { method: 'PATCH', body: JSON.stringify({ user_id: btn.dataset.uid, is_active: newStatus }) });
          showUsers();
        });
      });

    } catch (e) {
      content.innerHTML = `<p style="color:var(--red)">Failed: ${e.message}</p>`;
    }
  }



  async function showChats() {
    try {
      const data = await api('/admin/conversations');
      const convs = data.conversations || [];
      content.innerHTML = `
        <h2>💬 User Chats</h2>
        <table class="admin-table">
          <tr><th>User</th><th>Title</th><th>Messages</th><th>Last Updated</th><th>Action</th></tr>
          ${convs.map(c => `
            <tr>
              <td><strong>${esc(c.username)}</strong></td>
              <td>${esc(c.title)}</td>
              <td>${c.message_count}</td>
              <td>${new Date(c.updated_at).toLocaleString()}</td>
              <td>
                <button class="btn btn-sm btn-ghost view-chat-btn" data-cid="${c.id}">View Chat</button>
              </td>
            </tr>`).join('')}
        </table>`;
      
      content.querySelectorAll('.view-chat-btn').forEach(btn => {
        btn.addEventListener('click', () => showChatDetail(btn.dataset.cid));
      });
    } catch (e) {
      content.innerHTML = `<p style="color:var(--red)">Failed: ${e.message}</p>`;
    }
  }

  async function showChatDetail(cid) {
    try {
      content.innerHTML = `<p style="color:var(--muted)">Loading chat...</p>`;
      const data = await api(`/admin/conversations/${cid}`);
      const conv = data.conversation;
      const msgs = data.messages || [];
      
      content.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
          <h2>💬 Chat: ${esc(conv.title)}</h2>
          <button class="btn btn-sm btn-ghost" id="back-to-chats-btn">← Back to List</button>
        </div>
        <div class="messages" style="height: 60vh; border: 1px solid var(--border); border-radius: var(--rs); background: var(--bg); padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
          ${msgs.map(m => `
            <div class="msg ${m.role}" style="align-self: flex-start; max-width: 80%; padding: 1rem; border-radius: var(--rs); background: ${m.role === 'user' ? 'rgba(0, 242, 254, 0.1)' : 'var(--card)'}; border: 1px solid ${m.role === 'user' ? 'rgba(0, 242, 254, 0.2)' : 'var(--border)'};">
              <div style="margin-bottom:0.3rem; font-size:0.75rem; color:var(--muted); text-transform:uppercase; font-weight:bold; letter-spacing:0.5px;">${m.role}</div>
              <pre style="white-space: pre-wrap; margin:0; font-family:inherit; font-size: 0.9rem; color: var(--fg); line-height: 1.5;">${esc(m.content)}</pre>
            </div>
          `).join('')}
          ${msgs.length === 0 ? '<p style="color:var(--muted);text-align:center;">No messages</p>' : ''}
        </div>
      `;
      
      document.getElementById('back-to-chats-btn').addEventListener('click', showChats);
    } catch (e) {
      content.innerHTML = `<p style="color:var(--red)">Failed: ${e.message}</p>`;
    }
  }

  showStats();
}

function esc(s) { const d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }
