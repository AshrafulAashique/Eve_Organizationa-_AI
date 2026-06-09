const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'org_ai_user',
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  database: process.env.POSTGRES_DB || 'org_ai_db',
  password: process.env.POSTGRES_PASSWORD || 'org_ai_password',
  port: process.env.POSTGRES_PORT || 5432,
});

let _resolve;
const dbReady = new Promise(r => { _resolve = r; });

(async () => {
  let retries = 5;
  while(retries) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ PostgreSQL connected');
      break;
    } catch(err) {
      console.error('PostgreSQL connection error, retrying...', err.message);
      retries -= 1;
      await new Promise(r => setTimeout(r, 2000));
      if (!retries) {
        console.error('Failed to connect to PostgreSQL. Please ensure the database is running.');
        _resolve(); // Resolve anyway so server starts and fails gracefully or waits
        return;
      }
    }
  }

  // Init tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      username TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      last_seen TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT DEFAULT 'New Conversation',
      model TEXT NOT NULL DEFAULT 'qwen3:14b',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Database schema initialized');
  _resolve();
})();

async function one(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

async function all(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function run(sql, params) {
  await pool.query(sql, params);
}

const orgs = {
  create: async p => await run('INSERT INTO organizations (id, name) VALUES ($1,$2)', [p.id, p.name]),
  findById: async id => await one('SELECT * FROM organizations WHERE id=$1', [id])
};

const users = {
  create: async p => await run(
    'INSERT INTO users (id, org_id, username, email, password, role) VALUES ($1,$2,$3,$4,$5,$6)',
    [p.id, p.org_id, p.username, p.email, p.password, p.role]
  ),
  findByEmail: async e => await one('SELECT * FROM users WHERE email=$1', [e]),
  findById: async id => await one(
    'SELECT id,org_id,username,email,role,is_active,created_at,last_seen FROM users WHERE id=$1',
    [id]
  ),
  findAll: async orgId => await all(
    'SELECT id,org_id,username,email,role,is_active,created_at,last_seen FROM users WHERE org_id=$1 ORDER BY created_at DESC',
    [orgId]
  ),
  count: async () => parseInt((await one('SELECT COUNT(*) as count FROM users'))?.count || '0', 10),
  updateRole: async (role, id) => await run('UPDATE users SET role=$1 WHERE id=$2', [role, id]),
  updateStatus: async (active, id) => await run('UPDATE users SET is_active=$1 WHERE id=$2', [active, id]),
  updateLastSeen: async id => await run("UPDATE users SET last_seen=NOW() WHERE id=$1", [id])
};

const conversations = {
  create: async p => await run(
    'INSERT INTO conversations (id, user_id, title, model) VALUES ($1,$2,$3,$4)',
    [p.id, p.user_id, p.title, 'qwen3:14b']
  ),
  findByUser: async uid => await all(
    `SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) as message_count
     FROM conversations c WHERE c.user_id=$1 ORDER BY c.updated_at DESC`,
    [uid]
  ),
  findById: async id => await one('SELECT * FROM conversations WHERE id=$1', [id]),
  findAll: async orgId => await all(
    `SELECT c.*, u.username,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) as message_count
     FROM conversations c
     JOIN users u ON u.id=c.user_id
     WHERE u.org_id=$1 ORDER BY c.updated_at DESC LIMIT 200`,
    [orgId]
  ),
  updateTitle: async (title, id) => await run(
    "UPDATE conversations SET title=$1, updated_at=NOW() WHERE id=$2",
    [title, id]
  ),
  updateTimestamp: async id => await run(
    "UPDATE conversations SET updated_at=NOW() WHERE id=$1",
    [id]
  ),
  delete: async id => {
    await run('DELETE FROM messages WHERE conversation_id=$1', [id]);
    await run('DELETE FROM conversations WHERE id=$1', [id]);
  }
};

const messages = {
  create: async p => await run(
    'INSERT INTO messages (id, conversation_id, role, content) VALUES ($1,$2,$3,$4)',
    [p.id, p.conversation_id, p.role, p.content]
  ),
  findByConversation: async cid => await all(
    'SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC',
    [cid]
  )
};

async function getStats(orgId) {
  return {
    total_users: parseInt((await one('SELECT COUNT(*) as c FROM users WHERE org_id=$1', [orgId]))?.c || 0, 10),
    active_users: parseInt((await one('SELECT COUNT(*) as c FROM users WHERE org_id=$1 AND is_active=1', [orgId]))?.c || 0, 10),
    total_conversations: parseInt((await one('SELECT COUNT(*) as c FROM conversations c JOIN users u ON u.id=c.user_id WHERE u.org_id=$1', [orgId]))?.c || 0, 10),
    total_messages: parseInt((await one('SELECT COUNT(*) as c FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN users u ON u.id=c.user_id WHERE u.org_id=$1', [orgId]))?.c || 0, 10)
  };
}

module.exports = { dbReady, orgs, users, conversations, messages, getStats };
