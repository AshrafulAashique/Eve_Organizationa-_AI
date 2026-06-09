import { v4 as uuid } from 'uuid';
import { createUser, createOrg, findUserByEmail, countUsers } from '../../lib/db.js';
import { hashPassword, generateToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { username, email, password, org_name } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be 6+ chars' });

    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    // If org_name is provided, create a new org (first user = admin)
    let org_id;
    let role = 'user';
    if (org_name) {
      org_id = uuid();
      await createOrg({ id: org_id, name: org_name });
      role = 'admin';
    } else {
      // Must provide org_id for joining existing org (passed from invite or from admin)
      org_id = req.body.org_id;
      if (!org_id) return res.status(400).json({ error: 'Organization ID or name required' });
    }

    const id = uuid();
    const hashed = await hashPassword(password);
    await createUser({ id, org_id, username, email, password: hashed, role });

    const token = generateToken({ id, org_id, username, email, role });
    res.status(201).json({ token, user: { id, org_id, username, email, role } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
