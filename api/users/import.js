/**
 * POST /api/users/import — Importa usuarios del tenant de Entra ID.
 * Requiere permiso de Graph User.Read.All (o Directory.Read.All) con consentimiento admin.
 * Solo administradores.
 */
const { requireAdmin, graphAppToken, loadUsers, saveUsers, ensureAdmin, ADMIN_EMAIL } = require('../_lib/auth-lib');

module.exports = async (req, res) => {
  const auth = await requireAdmin(req);
  if (!auth.ok) { res.status(auth.code).json({ error: auth.error }); return; }

  try {
    const token = await graphAppToken();
    // Traer usuarios del directorio (una página de hasta 999; suficiente para el tamaño esperado)
    let url = 'https://graph.microsoft.com/v1.0/users?$select=displayName,mail,userPrincipalName,accountEnabled&$top=999';
    let imported = 0, skipped = 0;
    const { users, sha } = await loadUsers();
    ensureAdmin(users);

    while (url) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!j.value) { res.status(502).json({ error: 'graph_error', detail: j }); return; }

      for (const u of j.value) {
        const email = (u.mail || u.userPrincipalName || '').toLowerCase();
        if (!email) { skipped++; continue; }
        const isAdmin = email === ADMIN_EMAIL;
        if (users[email]) {
          // Ya existe: actualizar nombre, conservar su permiso actual
          users[email].name = u.displayName || users[email].name || '';
          if (isAdmin) { users[email].allowed = true; users[email].role = 'admin'; }
        } else {
          // Nuevo: sin acceso por defecto (el admin lo concede luego)
          users[email] = {
            email, name: u.displayName || '',
            allowed: isAdmin ? true : false,
            role: isAdmin ? 'admin' : 'user',
            importedAt: new Date().toISOString(),
          };
        }
        imported++;
      }
      url = j['@odata.nextLink'] || null;   // paginación
    }

    await saveUsers(users, sha);
    res.status(200).json({ ok: true, imported, skipped, total: Object.keys(users).length });
  } catch (e) {
    res.status(500).json({ error: 'import_failed', message: e.message });
  }
};
