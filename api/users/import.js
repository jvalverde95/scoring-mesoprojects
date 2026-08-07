/**
 * POST /api/users/import — Importa a la app los usuarios seleccionados del directorio.
 * Body: { users: [{ email, name }, ...] }  (los que el admin ha marcado)
 * Los importa SIN acceso por defecto; el admin lo concede luego con el interruptor.
 * Solo administradores.
 */
const { requireAdmin, loadUsers, saveUsers, ensureAdmin, ADMIN_EMAIL } = require('../_lib/auth-lib');

module.exports = async (req, res) => {
  const auth = await requireAdmin(req);
  if (!auth.ok) { res.status(auth.code).json({ error: auth.error }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const seleccion = Array.isArray(body.users) ? body.users : [];
  if (!seleccion.length) { res.status(400).json({ error: 'no_users', message: 'No se ha seleccionado ningun usuario.' }); return; }

  try {
    const { users, sha } = await loadUsers();
    ensureAdmin(users);
    let imported = 0;
    for (const sel of seleccion) {
      const email = (sel.email || '').toLowerCase();
      if (!email) continue;
      const isAdmin = email === ADMIN_EMAIL;
      if (users[email]) {
        users[email].name = sel.name || users[email].name || '';
        if (isAdmin) { users[email].allowed = true; users[email].role = 'admin'; }
      } else {
        users[email] = {
          email, name: sel.name || '',
          allowed: isAdmin ? true : false,
          role: isAdmin ? 'admin' : 'user',
          importedAt: new Date().toISOString(),
        };
      }
      imported++;
    }
    await saveUsers(users, sha);
    res.status(200).json({ ok: true, imported, total: Object.keys(users).length });
  } catch (e) {
    res.status(500).json({ error: 'import_failed', message: String(e.message || e) });
  }
};
