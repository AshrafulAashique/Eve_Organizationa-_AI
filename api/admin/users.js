import { requireAdmin } from '../../lib/auth.js';
import { getAllUsers, updateUserRole, updateUserStatus } from '../../lib/db.js';

export default async function handler(req, res) {
  try {
    const admin = requireAdmin(req);

    if (req.method === 'GET') {
      const users = await getAllUsers(admin.org);
      return res.json({ users });
    }

    if (req.method === 'PATCH') {
      const { user_id, role, is_active } = req.body;
      if (role) await updateUserRole(user_id, role);
      if (typeof is_active === 'boolean') await updateUserStatus(user_id, is_active);
      return res.json({ message: 'Updated' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}
