import { v4 as uuid } from 'uuid';
import { requireAuth } from '../../lib/auth.js';
import { getUserConversations, getConversation, getMessages, deleteConversation } from '../../lib/db.js';

export default async function handler(req, res) {
  try {
    const user = requireAuth(req);

    if (req.method === 'GET') {
      const convs = await getUserConversations(user.sub);
      return res.json({ conversations: convs });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}
