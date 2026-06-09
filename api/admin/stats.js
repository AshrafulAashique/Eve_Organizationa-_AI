import { requireAdmin } from '../../lib/auth.js';
import { getStats } from '../../lib/db.js';

export default async function handler(req, res) {
  try {
    const admin = requireAdmin(req);
    const stats = await getStats(admin.org);
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}
