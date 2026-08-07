/**
 * GET /api/users/directory — Lista los usuarios del tenant de Entra ID (Microsoft Graph),
 * para que el administrador los vea y seleccione cuáles importar. Solo administradores.
 *
 * Devuelve también el estado de acceso actual de cada uno (si ya está importado).
 */
const { requireAdmin, graphAppToken, loadUsers, ensureAdmin } = require('../_lib/auth-lib');

module.exports = async (req, res) => {
  const auth = await requireAdmin(req);
  if (!auth.ok) { res.status(auth.code).json({ error: auth.error }); return; }

  try {
    let token;
    try {
      token = await graphAppToken();
    } catch (e) {
      res.status(502).json({
        error: 'graph_token_failed',
        message: 'No se pudo obtener el token de Microsoft Graph. Revisa AZURE_CLIENT_ID/SECRET/TENANT.',
        detail: String(e.message || e),
      });
      return;
    }

    // Traer usuarios del directorio, con paginación
    let url = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,accountEnabled,jobTitle,department&$top=100&$orderby=displayName';
    const all = [];
    let pages = 0;
    while (url && pages < 50) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!r.ok || j.error) {
        // Exponer el error real de Graph (lo más útil para diagnosticar permisos)
        res.status(502).json({
          error: 'graph_error',
          message: graphHint(j),
          graphCode: j.error && j.error.code,
          graphMessage: j.error && j.error.message,
        });
        return;
      }
      (j.value || []).forEach(u => {
        const email = (u.mail || u.userPrincipalName || '').toLowerCase();
        if (email) all.push({
          email,
          name: u.displayName || '',
          jobTitle: u.jobTitle || '',
          department: u.department || '',
          enabled: u.accountEnabled !== false,
        });
      });
      url = j['@odata.nextLink'] || null;
      pages++;
    }

    // Cruzar con el estado actual de acceso
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
};

// Traduce el error de Graph a una pista accionable
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
