// Vercel Serverless — /api/dataverse
// Proxy para Microsoft Dataverse OData API (evita CORS desde el browser)
// El access_token se obtiene primero vía /api/token y luego se pasa aquí.
//
// Variables de entorno requeridas:
//   DV_URL = https://yourorg.crm4.dynamics.com

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, OData-MaxVersion, OData-Version, Prefer, If-Match');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const dvUrl = process.env.DV_URL;
  if (!dvUrl) {
    return res.status(500).json({
      error: 'config_missing',
      message: 'Configura DV_URL en Vercel → Settings → Environment Variables',
    });
  }

  // The OData path comes from the X-DV-Path header
  // e.g. "meso_projectscorings?$select=..."
  const dvPath  = req.headers['x-dv-path'];
  const method  = req.method;
  const authHdr = req.headers['authorization'];  // Bearer token from frontend

  if (!dvPath) {
    return res.status(400).json({ error: 'missing_header', message: 'X-DV-Path required' });
  }
  if (!authHdr) {
    return res.status(400).json({ error: 'missing_auth', message: 'Authorization header required' });
  }

  try {
    const base = dvUrl.replace(/\/$/, '');
    const url  = `${base}/api/data/v9.2/${dvPath}`;

    const headers = {
      'Authorization':    authHdr,
      'Accept':           'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version':    '4.0',
    };

    // Forward Prefer header (e.g. return=representation for POST)
    if (req.headers['prefer']) headers['Prefer'] = req.headers['prefer'];
    // Forward If-Match for concurrency control on PATCH
    if (req.headers['if-match']) headers['If-Match'] = req.headers['if-match'];

    const opts = { method, headers };

    if (['POST','PATCH','PUT'].includes(method) && req.body) {
      headers['Content-Type'] = 'application/json';
      opts.body = typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);
    }

    const dvRes = await fetch(url, opts);

    // 204 No Content (DELETE/PATCH success) — return empty
    if (dvRes.status === 204) {
      return res.status(204).end();
    }

    // 201 Created — return the new record
    if (dvRes.status === 201) {
      const data = await dvRes.json().catch(() => ({}));
      return res.status(201).json(data);
    }

    const data = await dvRes.json().catch(() => ({}));
    return res.status(dvRes.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: 'proxy_error', message: err.message });
  }
}
