// Vercel Serverless Function — /api/ado
// Proxy para Azure DevOps API (evita bloqueo CORS con Basic auth desde browser)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-ADO-Org, X-ADO-Project, X-ADO-Pat, X-ADO-Path');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const org     = req.headers['x-ado-org'];
    const project = req.headers['x-ado-project'];
    const pat     = req.headers['x-ado-pat'];
    const path    = req.headers['x-ado-path']; // e.g. "_apis/projects/..."
    const method  = req.method || 'GET';

    if (!org || !pat || !path) {
      return res.status(400).json({ error: 'Missing headers: x-ado-org, x-ado-pat, x-ado-path' });
    }

    const base = project
      ? `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`
      : `https://dev.azure.com/${encodeURIComponent(org)}`;

    const url  = `${base}/${path}`;
    const auth = 'Basic ' + Buffer.from(':' + pat).toString('base64');

    const opts = {
      method,
      headers: {
        'Authorization': auth,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
      },
    };

    if (method === 'POST' && req.body) {
      opts.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const adoRes = await fetch(url, opts);
    const data   = await adoRes.json().catch(() => ({}));

    return res.status(adoRes.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: 'proxy_error', message: err.message });
  }
}
