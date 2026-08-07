/**
 * POST /api/users/access — Concede o revoca acceso a un usuario. Solo administradores.
 * Body: { email: string, allowed: boolean }
 */
const { requireAdmin, loadUsers, saveUsers, ensureAdmin, ADMIN_EMAIL } = require('../_lib/auth-lib');

module.exports = async (req, res) => {
  const auth = await requireAdmin(req);
  if (!auth.ok) { res.status(auth.code).json({ error: auth.error }); return; }

  // Parsear el body (Vercel lo entrega ya parseado, pero por si acaso)
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const email = (body.email || '').toLowerCase();
  const allowed = !!body.allowed;

  if (!email) { res.status(400).json({ error: 'missing_email' }); return; }
  if (email === ADMIN_EMAIL && !allowed) {
    res.status(400).json({ error: 'cannot_revoke_admin', message: 'No se puede revocar el acceso al administrador.' });
    return;
  }

  try {
    const { users, sha } = await loadUsers();
    ensureAdmin(users);
    if (!users[email]) { res.status(404).json({ error: 'user_not_found' }); return; }
    users[email].allowed = allowed;
    await saveUsers(users, sha);
    res.status(200).json({ ok: true, user: users[email] });
  } catch (e) {
    res.status(500).json({ error: 'update_failed', message: e.message });
  }
};
