/**
 * Función consolidada de gestión de usuarios (solo administradores).
 * Enruta internamente para no gastar varias funciones serverless:
 *   GET  /api/users            → lista de usuarios de la app
 *   GET  /api/users/directory  → directorio de Entra ID (Microsoft Graph)
 *   POST /api/users/access     → concede/revoca acceso  { email, allowed }
 *   POST /api/users/import     → importa seleccionados   { users:[{email,name}] }
 */
const { requireAdmin, loadUsers, saveUsers, ensureAdmin, graphAppToken, ADMIN_EMAIL } = require('./_lib/auth-lib');

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  return body || {};
}

// GET /api/users
async function list(req, res, auth) {
  const arr = Object.values(auth.users).sort((a, b) =>
    (a.name || a.email).localeCompare(b.name || b.email));
  res.status(200).json({ users: arr });
}

// POST /api/users/access
async function access(req, res) {
  const body = parseBody(req);
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
}

// POST /api/users/import
async function importUsers(req, res) {
  const body = parseBody(req);
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
}

// GET /api/users/directory
function graphHint(j) {
  const code = j && j.error && j.error.code;
  if (code === 'Authorization_RequestDenied') {
    return 'Permiso denegado. El App Registration necesita el permiso de APLICACIÓN "User.Read.All" (o "Directory.Read.All") de Microsoft Graph, CON consentimiento de administrador concedido.';
  }
  if (code === 'InvalidAuthenticationToken') {
    return 'Token no válido. Revisa AZURE_CLIENT_SECRET (puede haber caducado o estar mal copiado).';
  }
  return (j && j.error && j.error.message) || 'Error desconocido de Microsoft Graph.';
}

async function directory(req, res) {
  try {
    let token;
    try { token = await graphAppToken(); }
    catch (e) {
      res.status(502).json({ error: 'graph_token_failed',
        message: 'No se pudo obtener el token de Microsoft Graph. Revisa AZURE_CLIENT_ID/SECRET/TENANT.',
        detail: String(e.message || e) });
      return;
    }
    let url = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,accountEnabled,jobTitle,department&$top=100&$orderby=displayName';
    const all = [];
    let pages = 0;
    while (url && pages < 50) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!r.ok || j.error) {
        res.status(502).json({ error: 'graph_error', message: graphHint(j),
          graphCode: j.error && j.error.code, graphMessage: j.error && j.error.message });
        return;
      }
      (j.value || []).forEach(u => {
        const email = (u.mail || u.userPrincipalName || '').toLowerCase();
        if (email) all.push({
          email, name: u.displayName || '',
          jobTitle: u.jobTitle || '', department: u.department || '',
          enabled: u.accountEnabled !== false,
        });
      });
      url = j['@odata.nextLink'] || null;
      pages++;
    }
    const { users } = await loadUsers();
    ensureAdmin(users);
    all.forEach(u => {
      const existing = users[u.email];
      u.imported = !!existing;
      u.allowed = !!(existing && existing.allowed);
      u.role = existing ? existing.role : 'user';
    });
    res.status(200).json({ users: all, total: all.length });
  } catch (e) {
    res.status(500).json({ error: 'directory_failed', message: String(e.message || e) });
  }
}

// ── router (todas requieren admin) ──
module.exports = async (req, res) => {
  const auth = await requireAdmin(req);
  if (!auth.ok) { res.status(auth.code).json({ error: auth.error }); return; }

  const url = new URL(req.url, 'http://localhost');
  let action = (url.searchParams.get('action') || '').toLowerCase();
  if (!action) {
    const m = url.pathname.match(/\/api\/users\/([a-z]+)/i);
    action = m ? m[1].toLowerCase() : '';
  }
  if (action === 'directory') return directory(req, res);
  if (action === 'access') return access(req, res);
  if (action === 'import') return importUsers(req, res);
  // Sin subruta → lista
  return list(req, res, auth);
};
