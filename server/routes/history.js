const router = require('express').Router();
const { authenticate } = require('../auth');
const { conversations, messages } = require('../db');

router.use(authenticate);

// ─── GET /api/conversations — list my conversations ───────────────
router.get('/', async (req, res) => {
  try {
    const convs = await conversations.findByUser(req.user.id);
    res.json({ conversations: convs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/conversations/:id — get messages ────────────────────
router.get('/:id', async (req, res) => {
  try {
    const conv = await conversations.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Access denied' });

    const msgs = await messages.findByConversation(req.params.id);
    res.json({ conversation: conv, messages: msgs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/conversations/:id ────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const conv = await conversations.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Access denied' });

    await conversations.delete(req.params.id);
    res.json({ message: 'Conversation deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
