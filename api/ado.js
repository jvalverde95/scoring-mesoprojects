// Vercel Serverless — /api/ado
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, X-ADO-Org, X-ADO-Project, X-ADO-Path');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // PAT: env var first, never from browser
  const pat = process.env.ADO_PAT;
  if (!pat) {
    return res.status(500).json({ error: 'config_missing', message: 'ADO_PAT no configurado en Vercel env vars' });
  }

  const org     = (req.headers['x-ado-org']     || process.env.ADO_ORG     || '').trim();
  const project = (req.headers['x-ado-project'] || process.env.ADO_PROJECT || '').trim();
  const path    = (req.headers['x-ado-path']    || '').trim();
  const method  = req.method;

  if (!org || !path) {
    return res.status(400).json({ error: 'missing_params', org, path });
  }

  // Build URL — org-level vs project-level
  const needsProject = project && !path.startsWith('_apis/projects');
  const base = needsProject
    ? `https://dev.azure.com/${org}/${encodeURIComponent(project)}`
    : `https://dev.azure.com/${org}`;
  const url = `${base}/${path}`;

  try {
    const opts = {
      method,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(':' + pat).toString('base64'),
        'Accept':        'application/json',
        'Content-Type':  'application/json',
      },
    };
    // Forward body for POST and PATCH
    if ((method === 'POST' || method === 'PATCH') && req.body) {
      opts.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    // ADO Work Item updates require application/json-patch+json
    if (method === 'PATCH') {
      opts.headers['Content-Type'] = 'application/json-patch+json';
    }

    const adoRes = await fetch(url, opts);
    const text   = await adoRes.text();

    // On error return diagnostic info
    if (!adoRes.ok) {
      return res.status(adoRes.status).json({
        error:   `HTTP_${adoRes.status}`,
        url,
        org,
        project,
        detail:  text.substring(0, 300),
      });
    }

    try { return res.status(200).json(JSON.parse(text)); }
    catch(_) { return res.status(200).send(text); }

  } catch(err) {
    return res.status(500).json({ error: 'proxy_error', message: err.message, url });
  }
}
