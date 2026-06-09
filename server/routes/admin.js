const router = require('express').Router();
const { authenticate, requireAdmin } = require('../auth');
const { users, conversations, messages, getStats, orgs } = require('../db');

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// ─── GET /api/admin/users ─────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const allUsers = await users.findAll(req.user.org_id);
    res.json({ users: allUsers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /api/admin/users/:id ───────────────────────────────────
router.patch('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { role, is_active } = req.body;
  try {
    const target = await users.findById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (role) await users.updateRole(role, id);
    if (typeof is_active === 'boolean') await users.updateStatus(is_active ? 1 : 0, id);
    const updated = await users.findById(id);
    res.json({ user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/admin/conversations ─────────────────────────────────
router.get('/conversations', async (req, res) => {
  try {
    const allConvs = await conversations.findAll(req.user.org_id);
    res.json({ conversations: allConvs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/admin/conversations/:id ─────────────────────────────
router.get('/conversations/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const conv = await conversations.findById(id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    
    // Ensure the conversation belongs to a user in the same org
    const owner = await users.findById(conv.user_id);
    if (!owner || owner.org_id !== req.user.org_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const msgs = await messages.findByConversation(id);
    res.json({ conversation: conv, messages: msgs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/admin/stats ─────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const org = await orgs.findById(req.user.org_id);
    const stats = await getStats(req.user.org_id);
    res.json({ ...stats, org_name: org?.name, org_id: req.user.org_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
