/**
 * GET /api/auth/callback — Recibe el código de Microsoft, valida el acceso y
 * crea la sesión. Solo entran los usuarios con permiso concedido por el admin.
 */
const {
  ssoConfigured, exchangeCodeForToken, graphMe,
  loadUsers, ensureAdmin, sessionCookie, ADMIN_EMAIL,
} = require('../_lib/auth-lib');

module.exports = async (req, res) => {
  if (!ssoConfigured()) { res.status(501).json({ error: 'sso_not_configured' }); return; }

  const url = new URL(req.url, 'http://localhost');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const stateCookie = (req.headers.cookie || '').match(/nexus_oauth_state=([^;]+)/);

  if (!code) { res.status(400).send('Falta el código de autorización.'); return; }
  // Validar state anti-CSRF
  if (!stateCookie || decodeURIComponent(stateCookie[1]) !== state) {
    res.status(400).send('Estado de sesión no válido. Vuelve a intentar el login.');
    return;
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    if (!tokens.access_token) {
      res.status(401).send('No se pudo completar el login con Microsoft.');
      return;
    }
    const me = await graphMe(tokens.access_token);
    const email = (me.mail || me.userPrincipalName || '').toLowerCase();
    if (!email) { res.status(401).send('No se pudo obtener el email del usuario.'); return; }

    // Validar acceso contra la lista gestionada por el admin
    const { users } = await loadUsers();
    ensureAdmin(users);
    const user = users[email];

    const clearState = 'nexus_oauth_state=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0';

    if (!user || !user.allowed) {
      // Autenticado en Microsoft, pero sin permiso en la app
      res.setHeader('Set-Cookie', clearState);
      res.status(403).send(
        '<!doctype html><meta charset="utf-8"><title>Acceso pendiente</title>' +
        '<div style="font-family:system-ui;max-width:520px;margin:80px auto;text-align:center;color:#1A1A1A">' +
        '<h2>Acceso pendiente de autorización</h2>' +
        '<p style="color:#666">Tu cuenta <b>' + email + '</b> se ha autenticado correctamente, ' +
        'pero aún no tiene acceso concedido a NEXUS.</p>' +
        '<p style="color:#666">Solicita al administrador que te dé acceso desde el panel de administración.</p>' +
        '<a href="/api/auth/logout" style="color:#2E5B9A">Cerrar sesión</a></div>'
      );
      return;
    }

    // Acceso concedido → crear sesión y entrar
    res.setHeader('Set-Cookie', [sessionCookie(email), clearState]);
    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    res.status(500).send('Error en el login: ' + err.message);
  }
};
