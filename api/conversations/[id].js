import { requireAuth } from '../../lib/auth.js';
import { getConversation, getMessages, deleteConversation } from '../../lib/db.js';

export default async function handler(req, res) {
  try {
    const user = requireAuth(req);
    const id = req.query.id;

    if (req.method === 'GET') {
      const conv = await getConversation(id);
      if (!conv) return res.status(404).json({ error: 'Not found' });
      const msgs = await getMessages(id);
      return res.json({ conversation: conv, messages: msgs });
    }

    if (req.method === 'DELETE') {
      const conv = await getConversation(id);
      if (!conv) return res.status(404).json({ error: 'Not found' });
      if (conv.user_id !== user.sub && user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      await deleteConversation(id);
      return res.json({ message: 'Deleted' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}
