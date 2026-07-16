// Vercel Serverless — /api/store
// Almacena y sirve la cartera publicada usando el propio repo de GitHub como almacén (coste 0).
//
// ENV VARS necesarias (Vercel → Settings → Environment Variables):
//   GITHUB_TOKEN     → token fine-grained con permiso Contents: Read & Write sobre el repo
//   GITHUB_REPO      → "usuario/repositorio" (p. ej. "miuser/scoring-mesoproject")
//   GITHUB_BRANCH    → rama donde guardar (p. ej. "main")
//   NEXUS_SHARE_KEY  → clave inventada que protege lectura y escritura (la misma que se pone en la app)
//
// GET  /api/store?k=<clave>   → devuelve el JSON publicado (vista de directores, precarga)
// POST /api/store?k=<clave>   → publica el JSON (body = cartera). Sobrescribe data/cartera.json en el repo.

const FILE_PATH = 'data/cartera.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token  = process.env.GITHUB_TOKEN;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const shareKey = process.env.NEXUS_SHARE_KEY || '';

  if (!token || !repo) {
    return res.status(500).json({ error: 'Almacén no configurado. Faltan GITHUB_TOKEN / GITHUB_REPO en Vercel.' });
  }
  // Clave compartida: protege tanto la lectura (directores) como la publicación (app)
  const k = (req.query && req.query.k) || '';
  if (!shareKey || k !== shareKey) {
    return res.status(401).json({ error: 'Clave inválida.' });
  }

  const apiUrl = `https://api.github.com/repos/${repo}/contents/${FILE_PATH}?ref=${encodeURIComponent(branch)}`;
  const ghHeaders = {
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'nexus-scoring-app',
    'Accept': 'application/vnd.github+json',
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(apiUrl, { headers: ghHeaders });
      if (r.status === 404) return res.status(404).json({ error: 'Aún no hay cartera publicada.' });
      if (!r.ok) return res.status(502).json({ error: 'GitHub: ' + r.status });
      const j = await r.json();
      const content = Buffer.from(j.content || '', 'base64').toString('utf8');
      return res.status(200).json(JSON.parse(content));
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (!body || body.length < 10) return res.status(400).json({ error: 'Cuerpo vacío.' });
      if (body.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'Cartera demasiado grande (>4MB).' });

      // Necesitamos el sha actual del archivo (si existe) para sobrescribirlo
      let sha = undefined;
      const cur = await fetch(apiUrl, { headers: ghHeaders });
      if (cur.ok) { const cj = await cur.json(); sha = cj.sha; }

      const put = await fetch(`https://api.github.com/repos/${repo}/contents/${FILE_PATH}`, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'publicación cartera Nexus · ' + new Date().toISOString(),
          content: Buffer.from(body, 'utf8').toString('base64'),
          branch: branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!put.ok) {
        const t = await put.text();
        return res.status(502).json({ error: 'GitHub PUT: ' + put.status, detail: t.slice(0, 200) });
      }
      return res.status(200).json({ ok: true, publishedAt: Date.now() });
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
