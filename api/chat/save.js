import { v4 as uuid } from 'uuid';
import { requireAuth } from '../../lib/auth.js';
import { createConversation, createMessage, updateConversationTitle } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = requireAuth(req);
    const { conversation_id, title, model, messages } = req.body;

    // Create conversation if new
    let convId = conversation_id;
    if (!convId) {
      convId = uuid();
      await createConversation({ id: convId, user_id: user.sub, title: title || 'New Conversation', model: model || 'llama3.2:3b' });
    }

    // Save messages (array of {role, content})
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        await createMessage({ id: uuid(), conversation_id: convId, role: msg.role, content: msg.content });
      }
    }

    // Update title if provided
    if (title) {
      await updateConversationTitle(convId, title);
    }

    res.json({ conversation_id: convId });
  } catch (err) {
    console.error('Chat save error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}
