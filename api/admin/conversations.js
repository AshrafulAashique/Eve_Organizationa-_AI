import { requireAdmin } from '../../lib/auth.js';
import { getAllConversations, getConversation, getMessages } from '../../lib/db.js';

export default async function handler(req, res) {
  try {
    const admin = requireAdmin(req);

    if (req.method === 'GET') {
      const convId = req.query.id;
      if (convId) {
        const conv = await getConversation(convId);
        if (!conv) return res.status(404).json({ error: 'Not found' });
        const msgs = await getMessages(convId);
        return res.json({ conversation: conv, messages: msgs });
      }
      const convs = await getAllConversations(admin.org);
      return res.json({ conversations: convs });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}
