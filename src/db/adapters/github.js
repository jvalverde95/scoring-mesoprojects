/**
 * Adaptador GitHub — mantiene compatibilidad con el almacén actual (data/cartera.json
 * en un repo de GitHub), que es lo que ya funciona hoy en Vercel.
 *
 * Reutiliza las variables de entorno existentes:
 *   GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH
 *
 * Nota: la gestión de usuarios NO se implementa aquí (GitHub no es el sitio para
 * permisos). Con este adaptador, los usuarios se resuelven en memoria; para
 * gestión real de usuarios usa el adaptador azure-sql.
 */
const mem = require('./memory');

const REPO   = process.env.GITHUB_REPO   || '';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN  = process.env.GITHUB_TOKEN  || '';

function ghHeaders() {
  return { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'nexus-app' };
}
function pathFor(key) {
  return `data/${(key || 'cartera').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
}

module.exports = {
  async getPortfolio(key) {
    if (!REPO || !TOKEN) return null;
    const url = `https://api.github.com/repos/${REPO}/contents/${pathFor(key)}?ref=${BRANCH}`;
    const r = await fetch(url, { headers: ghHeaders() });
    if (!r.ok) return null;
    const j = await r.json();
    try { return JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')); }
    catch { return null; }
  },
  async savePortfolio(key, data) {
    if (!REPO || !TOKEN) throw new Error('GitHub no configurado (GITHUB_REPO/GITHUB_TOKEN)');
    const p = pathFor(key);
    const getUrl = `https://api.github.com/repos/${REPO}/contents/${p}?ref=${BRANCH}`;
    let sha = null;
    const cur = await fetch(getUrl, { headers: ghHeaders() });
    if (cur.ok) { const j = await cur.json(); sha = j.sha; }
    const putUrl = `https://api.github.com/repos/${REPO}/contents/${p}`;
    const body = {
      message: `nexus: update ${p}`,
      content: Buffer.from(JSON.stringify(data)).toString('base64'),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;
    const r = await fetch(putUrl, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`GitHub save falló: ${r.status}`);
    return { ok: true };
  },
  // Usuarios: delegados a memoria (GitHub no gestiona permisos)
  listUsers: mem.listUsers,
  getUser: mem.getUser,
  upsertUser: mem.upsertUser,
  setUserAccess: mem.setUserAccess,
};
