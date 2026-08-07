/**
 * GET /api/auth/logout — Cierra la sesión.
 */
const { clearCookie, AUTHORITY } = require('../_lib/auth-lib');

module.exports = async (req, res) => {
  res.setHeader('Set-Cookie', clearCookie());
  const base = process.env.APP_BASE_URL || '/';
  if (AUTHORITY) {
    res.writeHead(302, { Location: `${AUTHORITY}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(base)}` });
  } else {
    res.writeHead(302, { Location: '/' });
  }
  res.end();
};
