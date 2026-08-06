/**
 * src/routes/auth.js — Autenticación SSO con Microsoft Entra ID (esqueleto).
 *
 * Flujo OAuth 2.0 / OpenID Connect (Authorization Code):
 *   1. GET  /api/auth/login     → redirige a Microsoft para iniciar sesión
 *   2. Microsoft redirige a...   → GET /api/auth/callback?code=...
 *   3. /callback intercambia el código por tokens (usa el client secret)
 *   4. Se valida el usuario contra la lista de acceso (tabla Users)
 *   5. Se crea la sesión y se redirige a la app
 *
 * PENDIENTE DE CONFIGURAR (cuando tengas el App Registration en Azure):
 *   - AZURE_TENANT_ID      (tenant de mesoestetic.com)
 *   - AZURE_CLIENT_ID      (Application ID del App Registration)
 *   - AZURE_CLIENT_SECRET  (secret generado en el App Registration)
 *   - AZURE_REDIRECT_URI   (p.ej. https://tu-app.azurewebsites.net/api/auth/callback)
 *
 * Mientras estas variables no existan, las rutas responden 501 (no configurado)
 * y la app sigue usando el login actual sin romperse.
 */
const express = require('express');
const router = express.Router();
const db = require('../db');

const TENANT = process.env.AZURE_TENANT_ID || '';
const CLIENT_ID = process.env.AZURE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.AZURE_REDIRECT_URI || '';
const AUTHORITY = TENANT ? `https://login.microsoftonline.com/${TENANT}` : '';

function ssoConfigured() {
  return !!(TENANT && CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

// Paso 1: iniciar sesión → redirige a Microsoft
router.get('/login', (req, res) => {
  if (!ssoConfigured()) {
    return res.status(501).json({ error: 'sso_not_configured', message: 'Entra ID aún no configurado. Ver .env.example y README.' });
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    // state: <token anti-CSRF a generar y validar>
  });
  res.redirect(`${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`);
});

// Paso 2-4: callback tras el login en Microsoft
router.get('/callback', async (req, res) => {
  if (!ssoConfigured()) {
    return res.status(501).json({ error: 'sso_not_configured' });
  }
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'missing_code' });

  try {
    // Intercambiar el código por tokens
    const tokenRes = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: 'openid profile email User.Read',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return res.status(401).json({ error: 'token_exchange_failed', detail: tokens });
    }

    // Obtener el perfil del usuario desde Microsoft Graph
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me = await meRes.json();
    const email = (me.mail || me.userPrincipalName || '').toLowerCase();

    // Validar acceso contra la tabla Users
    const user = await db.getUser(email);
    if (!user || !user.allowed) {
      return res.status(403).send('Acceso no autorizado. Contacta con el administrador.');
    }

    // TODO: crear sesión segura (cookie firmada / JWT). De momento, redirección simple.
    // Ejemplo mínimo: guardar el email en una cookie httpOnly.
    res.setHeader('Set-Cookie', `nexus_user=${encodeURIComponent(email)}; HttpOnly; Path=/; SameSite=Lax`);
    res.redirect('/');
  } catch (err) {
    res.status(500).json({ error: 'callback_error', message: err.message });
  }
});

// Cerrar sesión
router.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'nexus_user=; HttpOnly; Path=/; Max-Age=0');
  if (AUTHORITY) return res.redirect(`${AUTHORITY}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(process.env.APP_BASE_URL || '/')}`);
  res.redirect('/');
});

// Estado de la sesión actual (para el frontend)
router.get('/me', async (req, res) => {
  const cookie = (req.headers.cookie || '').match(/nexus_user=([^;]+)/);
  if (!cookie) return res.json({ authenticated: false });
  const email = decodeURIComponent(cookie[1]);
  const user = await db.getUser(email);
  res.json({ authenticated: !!(user && user.allowed), user: user || null, ssoConfigured: ssoConfigured() });
});

module.exports = router;
