const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'orgai-local-secret-2024';
const JWT_EXPIRES = '30d';

async function hashPassword(plain) { return bcrypt.hash(plain, 12); }
async function comparePassword(plain, hash) { return bcrypt.compare(plain, hash); }

function generateToken(user) {
  return jwt.sign(
    { sub: user.id, id: user.id, org: user.org_id, username: user.username, email: user.email, role: user.role },
    JWT_SECRET, { expiresIn: JWT_EXPIRES }
  );
}

function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const d = jwt.verify(token, JWT_SECRET);
    req.user = { id: d.sub || d.id, org_id: d.org, username: d.username, email: d.email, role: d.role };
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

module.exports = { hashPassword, comparePassword, generateToken, authenticate, requireAdmin };
