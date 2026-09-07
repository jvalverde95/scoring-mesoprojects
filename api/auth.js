/**
 * Función consolidada de autenticación (SSO Microsoft Entra ID).
 * Enruta internamente según la subruta para no gastar varias funciones serverless:
 *   GET /api/auth/login     → redirige a Microsoft
 *   GET /api/auth/callback  → recibe el código, valida acceso, crea sesión
 *   GET /api/auth/logout    → cierra sesión
 *   GET /api/auth/me        → estado de la sesión actual (usado por el frontend)
 */
const crypto = require('crypto');
const {
  ssoConfigured, CLIENT_ID, REDIRECT_URI, AUTHORITY,
  clearCookie, readSession, loadUsers, ensureAdmin,
  exchangeCodeForToken, graphMe, sessionCookie,
} = require('./_lib/auth-lib');

// ── login ──
async function login(req, res) {
  if (!ssoConfigured()) {
    res.status(501).json({ error: 'sso_not_configured', message: 'Faltan variables AZURE_* en el entorno.' });
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `nexus_oauth_state=${state}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=600`);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    state,
  });
  res.writeHead(302, { Location: `${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}` });
  res.end();
}

// ── callback ──
async function callback(req, res) {
  if (!ssoConfigured()) { res.status(501).json({ error: 'sso_not_configured' }); return; }
  const url = new URL(req.url, 'http://localhost');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const stateCookie = (req.headers.cookie || '').match(/nexus_oauth_state=([^;]+)/);

  if (!code) { res.status(400).send('Falta el código de autorización.'); return; }
  if (!stateCookie || decodeURIComponent(stateCookie[1]) !== state) {
    res.status(400).send('Estado de sesión no válido. Vuelve a intentar el login.');
    return;
  }
  try {
    const tokens = await exchangeCodeForToken(code);
    if (!tokens.access_token) { res.status(401).send('No se pudo completar el login con Microsoft.'); return; }
    const me = await graphMe(tokens.access_token);
    const email = (me.mail || me.userPrincipalName || '').toLowerCase();
    if (!email) { res.status(401).send('No se pudo obtener el email del usuario.'); return; }

    const { users } = await loadUsers();
    ensureAdmin(users);
    const user = users[email];
    const clearState = 'nexus_oauth_state=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0';

    if (!user || !user.allowed) {
      res.setHeader('Set-Cookie', clearState);
      res.status(403).send(
        '<!doctype html><meta charset="utf-8"><title>Acceso pendiente</title>' +
        '<div style="font-family:system-ui;max-width:520px;margin:80px auto;text-align:center;color:#0B1F3A">' +
        '<h2>Acceso pendiente de autorización</h2>' +
        '<p style="color:#5A6B85">Tu cuenta <b>' + email + '</b> se ha autenticado correctamente, ' +
        'pero aún no tiene acceso concedido a NEXUS.</p>' +
        '<p style="color:#5A6B85">Solicita al administrador que te dé acceso desde el panel de administración.</p>' +
        '<a href="/api/auth/logout" style="color:#0E9CA8">Cerrar sesión</a></div>'
      );
      return;
    }
    res.setHeader('Set-Cookie', [sessionCookie(email), clearState]);
    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    res.status(500).send('Error en el login: ' + err.message);
  }
}

// ── logout ──
async function logout(req, res) {
  res.setHeader('Set-Cookie', clearCookie());
  const base = process.env.APP_BASE_URL || '/';
  if (AUTHORITY) {
    res.writeHead(302, { Location: `${AUTHORITY}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(base)}` });
  } else {
    res.writeHead(302, { Location: '/' });
  }
  res.end();
}

// ── me ──
async function me(req, res) {
  const sess = readSession(req);
  if (!sess) { res.status(200).json({ authenticated: false, ssoConfigured: ssoConfigured() }); return; }
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
}

// ── router ──
module.exports = async (req, res) => {
  // La subruta viene o bien en la URL (/api/auth/login) o en ?action=login
  const url = new URL(req.url, 'http://localhost');
  let action = (url.searchParams.get('action') || '').toLowerCase();
  if (!action) {
    const m = url.pathname.match(/\/api\/auth\/([a-z]+)/i);
    action = m ? m[1].toLowerCase() : '';
  }
  switch (action) {
    case 'login': return login(req, res);
    case 'callback': return callback(req, res);
    case 'logout': return logout(req, res);
    case 'me': return me(req, res);
    default:
      res.status(404).json({ error: 'unknown_auth_action', action });
  }
};
