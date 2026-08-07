/**
 * api/_lib/auth-lib.js — Utilidades compartidas por las funciones de auth y users.
 *
 * Incluye:
 *  - Sesiones firmadas con HMAC (cookie httpOnly, sin dependencias externas)
 *  - Almacén de usuarios en GitHub (data/users.json), reutilizando el mismo
 *    repositorio que ya guarda la cartera
 *  - Helpers de Entra ID (token de app, intercambio de código)
 */
const crypto = require('crypto');

// ── Config desde variables de entorno ──
const TENANT        = process.env.AZURE_TENANT_ID || '';
const CLIENT_ID     = process.env.AZURE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || '';
const REDIRECT_URI  = process.env.AZURE_REDIRECT_URI || '';
const ADMIN_EMAIL   = (process.env.ADMIN_EMAIL || 'jvalverde@mesoestetic.com').toLowerCase();
const SESSION_SECRET= process.env.SESSION_SECRET || '';
const AUTHORITY     = TENANT ? `https://login.microsoftonline.com/${TENANT}` : '';

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO   = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const USERS_PATH    = 'data/users.json';

function ssoConfigured() {
  return !!(TENANT && CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

// ── Sesiones firmadas (HMAC) ───────────────────────────────────────
// Formato de cookie: base64url(payloadJSON).base64url(hmac)
function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifySession(token) {
  if (!token || !SESSION_SECRET) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  // Comparación en tiempo constante
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;   // caducada
    return payload;
  } catch { return null; }
}
function sessionCookie(email, maxAgeSec = 60 * 60 * 8) {
  const token = signSession({ email: email.toLowerCase(), exp: Date.now() + maxAgeSec * 1000 });
  return `nexus_session=${token}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
function clearCookie() {
  return 'nexus_session=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0';
}
function readSession(req) {
  const raw = (req.headers.cookie || '').match(/nexus_session=([^;]+)/);
  if (!raw) return null;
  return verifySession(decodeURIComponent(raw[1]));
}

// ── Almacén de usuarios en GitHub ──────────────────────────────────
function ghHeaders() {
  return { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'nexus-app' };
}
async function loadUsers() {
  if (!GITHUB_REPO || !GITHUB_TOKEN) return { users: {}, sha: null };
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${USERS_PATH}?ref=${GITHUB_BRANCH}`;
  const r = await fetch(url, { headers: ghHeaders() });
  if (r.status === 404) return { users: {}, sha: null };   // aún no existe
  if (!r.ok) throw new Error('GitHub loadUsers ' + r.status);
  const j = await r.json();
  let users = {};
  try { users = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')); } catch {}
  return { users: users || {}, sha: j.sha };
}
async function saveUsers(users, sha) {
  if (!GITHUB_REPO || !GITHUB_TOKEN) throw new Error('GitHub no configurado');
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${USERS_PATH}`;
  const body = {
    message: 'nexus: update users',
    content: Buffer.from(JSON.stringify(users, null, 2)).toString('base64'),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;
  const r = await fetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('GitHub saveUsers ' + r.status);
  return true;
}

// Garantiza que el admin siempre existe con acceso
function ensureAdmin(users) {
  if (!users[ADMIN_EMAIL]) {
    users[ADMIN_EMAIL] = { email: ADMIN_EMAIL, name: 'Administrador', allowed: true, role: 'admin', importedAt: new Date().toISOString() };
  } else {
    users[ADMIN_EMAIL].allowed = true;
    users[ADMIN_EMAIL].role = 'admin';
  }
  return users;
}

// ── Comprobar que el llamante es admin (para rutas protegidas) ──
async function requireAdmin(req) {
  const sess = readSession(req);
  if (!sess) return { ok: false, code: 401, error: 'not_authenticated' };
  const { users } = await loadUsers();
  ensureAdmin(users);
  const u = users[sess.email];
  if (!u || u.role !== 'admin') return { ok: false, code: 403, error: 'admin_required' };
  return { ok: true, email: sess.email, users };
}

// ── Entra ID helpers ───────────────────────────────────────────────
async function exchangeCodeForToken(code) {
  const r = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code,
      redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
      scope: 'openid profile email User.Read',
    }),
  });
  return r.json();
}
async function graphMe(accessToken) {
  const r = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${accessToken}` } });
  return r.json();
}
async function graphAppToken() {
  const r = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('graphAppToken: ' + JSON.stringify(j));
  return j.access_token;
}

module.exports = {
  TENANT, CLIENT_ID, REDIRECT_URI, ADMIN_EMAIL, AUTHORITY, ssoConfigured,
  signSession, verifySession, sessionCookie, clearCookie, readSession,
  loadUsers, saveUsers, ensureAdmin, requireAdmin,
  exchangeCodeForToken, graphMe, graphAppToken,
};
