const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { users, orgs } = require('../db');
const { hashPassword, comparePassword, generateToken, authenticate } = require('../auth');

// ─── POST /api/auth/register ─────────────────────────────────────
// Body: { username, email, password, org_name?, org_id? }
// org_name → create a new org (first admin)
// org_id   → join an existing org
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, org_name, org_id } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ error: 'Username, email and password are required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    if (await users.findByEmail(email))
      return res.status(409).json({ error: 'Email already registered' });

    // Determine org
    let finalOrgId;
    let role = 'user';

    if (org_name) {
      // Creating a brand new organisation → this user becomes admin
      finalOrgId = uuidv4();
      await orgs.create({ id: finalOrgId, name: org_name.trim() });
      role = 'admin';
    } else if (org_id) {
      // Joining an existing org
      const org = await orgs.findById(org_id);
      if (!org) return res.status(404).json({ error: 'Organization not found. Check the Org ID.' });
      finalOrgId = org_id;
    } else {
      // Legacy: first user ever becomes admin with a default org
      const count = await users.count();
      if (count === 0) {
        finalOrgId = uuidv4();
        await orgs.create({ id: finalOrgId, name: 'Default Organization' });
        role = 'admin';
      } else {
        return res.status(400).json({ error: 'Please provide an org_id to join an organization, or org_name to create one.' });
      }
    }

    const id = uuidv4();
    const hashed = await hashPassword(password);
    await users.create({ id, org_id: finalOrgId, username, email, password: hashed, role });

    const user = await users.findById(id);
    const token = generateToken(user);
    const org = await orgs.findById(finalOrgId);

    res.status(201).json({
      message: role === 'admin' ? 'Organization and admin account created!' : 'Account created successfully!',
      token,
      user: { id, username, email, role, org_id: finalOrgId },
      org: { id: finalOrgId, name: org?.name }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const user = await users.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.is_active) return res.status(403).json({ error: 'Account disabled. Contact your admin.' });

    const valid = await comparePassword(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    await users.updateLastSeen(user.id);
    const token = generateToken(user);
    const org = await orgs.findById(user.org_id);

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, org_id: user.org_id },
      org: { id: user.org_id, name: org?.name }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const user = await users.findById(req.user.id);
  const org = await orgs.findById(req.user.org_id);
  res.json({ user: { id: req.user.id, username: req.user.username, email: req.user.email, role: req.user.role, org_id: req.user.org_id }, org });
});

// ─── GET /api/auth/org/:id — check if org exists (for join flow) ─
router.get('/org/:id', async (req, res) => {
  const org = await orgs.findById(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  res.json({ org: { id: org.id, name: org.name } });
});

module.exports = router;
