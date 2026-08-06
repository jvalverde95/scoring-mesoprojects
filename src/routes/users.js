/**
 * src/routes/users.js — Gestión de usuarios (esqueleto).
 *
 * Permite al administrador:
 *   - Importar usuarios del tenant de Entra ID (Microsoft Graph)
 *   - Listar usuarios y su estado de acceso
 *   - Conceder o revocar acceso a la app
 *
 * Requiere que el App Registration tenga permiso de Microsoft Graph
 * `User.Read.All` o `Directory.Read.All` CON CONSENTIMIENTO DE ADMINISTRADOR.
 *
 * Protección: todas las rutas deberían exigir que el llamante sea admin.
 * El middleware requireAdmin valida la sesión (pendiente de completar cuando
 * el SSO esté activo).
 */
const express = require('express');
const router = express.Router();
const db = require('../db');

const TENANT = process.env.AZURE_TENANT_ID || '';
const CLIENT_ID = process.env.AZURE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || '';

// Middleware: solo administradores
async function requireAdmin(req, res, next) {
  const cookie = (req.headers.cookie || '').match(/nexus_user=([^;]+)/);
  if (!cookie) return res.status(401).json({ error: 'not_authenticated' });
  const email = decodeURIComponent(cookie[1]);
  const user = await db.getUser(email);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
  req.currentUser = user;
  next();
}

// Obtener un token de aplicación para Microsoft Graph (client credentials)
async function graphAppToken() {
  if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) throw new Error('Entra ID no configurado');
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('No se pudo obtener token de Graph: ' + JSON.stringify(j));
  return j.access_token;
}

// Listar usuarios ya registrados en la app
router.get('/', requireAdmin, async (req, res) => {
  try { res.json({ users: await db.listUsers() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Importar usuarios del tenant de Entra ID
router.post('/import', requireAdmin, async (req, res) => {
  try {
    const token = await graphAppToken();
    // Traer usuarios del directorio (paginado si hace falta)
    const r = await fetch('https://graph.microsoft.com/v1.0/users?$select=displayName,mail,userPrincipalName&$top=999', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    if (!j.value) return res.status(502).json({ error: 'graph_error', detail: j });

    let imported = 0;
    for (const u of j.value) {
      const email = (u.mail || u.userPrincipalName || '').toLowerCase();
      if (!email) continue;
      await db.upsertUser({ email, name: u.displayName || '', allowed: false, role: 'user' });
      imported++;
    }
    res.json({ ok: true, imported });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Conceder / revocar acceso
router.post('/:email/access', requireAdmin, async (req, res) => {
  try {
    const allowed = !!req.body.allowed;
    const updated = await db.setUserAccess(req.params.email, allowed);
    if (!updated) return res.status(404).json({ error: 'user_not_found' });
    res.json({ ok: true, user: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
