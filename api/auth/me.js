/**
 * GET /api/auth/me — Devuelve el estado de la sesión actual.
 * Lo usa el frontend para mostrar/ocultar el menú Admin y controlar el acceso.
 */
const { readSession, loadUsers, ensureAdmin, ssoConfigured } = require('../_lib/auth-lib');

module.exports = async (req, res) => {
  const sess = readSession(req);
  if (!sess) {
    res.status(200).json({ authenticated: false, ssoConfigured: ssoConfigured() });
    return;
  }
  try {
    const { users } = await loadUsers();
    ensureAdmin(users);
    const user = users[sess.email] || null;
    res.status(200).json({
      authenticated: !!(user && user.allowed),
      user: user ? { email: user.email, name: user.name, role: user.role, allowed: user.allowed } : null,
      ssoConfigured: ssoConfigured(),
    });
  } catch (e) {
    res.status(200).json({ authenticated: false, ssoConfigured: ssoConfigured(), error: e.message });
  }
};
