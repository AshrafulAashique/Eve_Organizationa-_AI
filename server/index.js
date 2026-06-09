const express = require('express');
const cors = require('cors');
const path = require('path');
const { dbReady } = require('./db');
const { initMemory } = require('./memory');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', /^http:\/\/192\.168\./],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ─────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/conversations', require('./routes/history'));
app.use('/api/admin', require('./routes/admin'));

// ─── Health ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ─── Start after DB is ready ────────────────────────────────────
dbReady.then(async () => {
  await initMemory(); // Connect to ChromaDB

  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════╗');
    console.log('  ║      Jarvis AI Platform - Server      ║');
    console.log('  ╠═══════════════════════════════════════╣');
    console.log(`  ║  API  →  http://localhost:${PORT}          ║`);
    console.log('  ║  DB   →  PostgreSQL & ChromaDB        ║');
    console.log('  ╚═══════════════════════════════════════╝');
    console.log('');
  });
});

module.exports = app;
