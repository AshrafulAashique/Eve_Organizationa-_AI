import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'orgai-change-this-in-production';
const JWT_EXPIRES = '30d';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function generateToken(user) {
  return jwt.sign(
    { sub: user.id, org: user.org_id, username: user.username, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Middleware-style auth for serverless handlers
export function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  return verifyToken(token);
}

export function requireAuth(req) {
  const user = getUser(req);
  if (!user) throw { status: 401, message: 'Unauthorized' };
  return user;
}

export function requireAdmin(req) {
  const user = requireAuth(req);
  if (user.role !== 'admin') throw { status: 403, message: 'Admin access required' };
  return user;
}
