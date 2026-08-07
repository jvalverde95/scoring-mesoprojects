/**
 * GET /api/users — Lista los usuarios registrados. Solo administradores.
 */
const { requireAdmin } = require('../_lib/auth-lib');

module.exports = async (req, res) => {
  const auth = await requireAdmin(req);
  if (!auth.ok) { res.status(auth.code).json({ error: auth.error }); return; }
  const list = Object.values(auth.users).sort((a, b) =>
    (a.name || a.email).localeCompare(b.name || b.email));
  res.status(200).json({ users: list });
};
