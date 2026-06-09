import { neon } from '@neondatabase/serverless';

function sql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL env var not set');
  return neon(process.env.DATABASE_URL);
}

// ─── Schema ───────────────────────────────────────────────────
let migrated = false;
export async function ensureSchema() {
  if (migrated) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS organizations (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await db`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      org_id     TEXT NOT NULL REFERENCES organizations(id),
      username   TEXT NOT NULL,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'user',
      is_active  BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen  TIMESTAMPTZ DEFAULT NOW()
    )`;
  await db`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT DEFAULT 'New Conversation',
      model      TEXT NOT NULL DEFAULT 'llama3.2:3b',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await db`
    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )`;
  migrated = true;
}

// ─── Helpers ──────────────────────────────────────────────────
export async function createOrg({ id, name }) {
  await ensureSchema();
  const db = sql();
  await db`INSERT INTO organizations (id, name) VALUES (${id}, ${name})`;
}

export async function createUser({ id, org_id, username, email, password, role }) {
  await ensureSchema();
  const db = sql();
  await db`INSERT INTO users (id, org_id, username, email, password, role) VALUES (${id}, ${org_id}, ${username}, ${email}, ${password}, ${role})`;
}

export async function findUserByEmail(email) {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT * FROM users WHERE email = ${email}`;
  return rows[0];
}

export async function findUserById(id) {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT id, org_id, username, email, role, is_active, created_at FROM users WHERE id = ${id}`;
  return rows[0];
}

export async function getAllUsers(orgId) {
  const db = sql();
  return db`SELECT id, org_id, username, email, role, is_active, created_at FROM users WHERE org_id = ${orgId} ORDER BY created_at DESC`;
}

export async function updateUserRole(id, role) {
  const db = sql();
  await db`UPDATE users SET role = ${role} WHERE id = ${id}`;
}

export async function updateUserStatus(id, isActive) {
  const db = sql();
  await db`UPDATE users SET is_active = ${isActive} WHERE id = ${id}`;
}

export async function createConversation({ id, user_id, title, model }) {
  await ensureSchema();
  const db = sql();
  await db`INSERT INTO conversations (id, user_id, title, model) VALUES (${id}, ${user_id}, ${title}, ${model})`;
}

export async function getUserConversations(userId) {
  const db = sql();
  return db`
    SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id)::int as message_count
    FROM conversations c WHERE c.user_id = ${userId} ORDER BY c.updated_at DESC`;
}

export async function getConversation(id) {
  const db = sql();
  const rows = await db`SELECT * FROM conversations WHERE id = ${id}`;
  return rows[0];
}

export async function getAllConversations(orgId) {
  const db = sql();
  return db`
    SELECT c.*, u.username, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id)::int as message_count
    FROM conversations c JOIN users u ON u.id = c.user_id
    WHERE u.org_id = ${orgId} ORDER BY c.updated_at DESC LIMIT 200`;
}

export async function updateConversationTitle(id, title) {
  const db = sql();
  await db`UPDATE conversations SET title = ${title}, updated_at = NOW() WHERE id = ${id}`;
}

export async function updateConversationTimestamp(id) {
  const db = sql();
  await db`UPDATE conversations SET updated_at = NOW() WHERE id = ${id}`;
}

export async function deleteConversation(id) {
  const db = sql();
  await db`DELETE FROM messages WHERE conversation_id = ${id}`;
  await db`DELETE FROM conversations WHERE id = ${id}`;
}

export async function createMessage({ id, conversation_id, role, content }) {
  const db = sql();
  await db`INSERT INTO messages (id, conversation_id, role, content) VALUES (${id}, ${conversation_id}, ${role}, ${content})`;
  await updateConversationTimestamp(conversation_id);
}

export async function getMessages(conversationId) {
  const db = sql();
  return db`SELECT * FROM messages WHERE conversation_id = ${conversationId} ORDER BY created_at ASC`;
}

export async function getStats(orgId) {
  const db = sql();
  const [tu, au, tc, tm] = await Promise.all([
    db`SELECT COUNT(*)::int as c FROM users WHERE org_id = ${orgId}`,
    db`SELECT COUNT(*)::int as c FROM users WHERE org_id = ${orgId} AND is_active = true`,
    db`SELECT COUNT(*)::int as c FROM conversations c JOIN users u ON u.id = c.user_id WHERE u.org_id = ${orgId}`,
    db`SELECT COUNT(*)::int as c FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN users u ON u.id = c.user_id WHERE u.org_id = ${orgId}`
  ]);
  return { total_users: tu[0].c, active_users: au[0].c, total_conversations: tc[0].c, total_messages: tm[0].c };
}
