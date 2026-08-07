/**
 * GET /api/auth/login — Inicia el login redirigiendo a Microsoft Entra ID.
 */
const { ssoConfigured, CLIENT_ID, REDIRECT_URI, AUTHORITY } = require('../_lib/auth-lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (!ssoConfigured()) {
    res.status(501).json({ error: 'sso_not_configured', message: 'Faltan variables AZURE_* en el entorno.' });
    return;
  }
  // Token anti-CSRF (state) en cookie temporal
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
};
