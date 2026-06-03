// Vercel Serverless — /api/ado
// Proxy para Azure DevOps API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, X-ADO-Org, X-ADO-Project, X-ADO-Path');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pat = process.env.ADO_PAT;
  if (!pat) {
    return res.status(500).json({
      error: 'config_missing',
      message: 'Configura ADO_PAT en Vercel → Settings → Environment Variables',
    });
  }

  const org     = req.headers['x-ado-org']     || process.env.ADO_ORG     || '';
  const project = req.headers['x-ado-project'] || process.env.ADO_PROJECT  || '';
  const path    = req.headers['x-ado-path']    || '';
  const method  = req.method || 'GET';

  if (!org || !path) {
    return res.status(400).json({
      error: 'missing_params',
      message: `Se requiere org y path. org="${org}" path="${path}"`,
    });
  }

  // For org-level paths (_apis/projects, _apis/...) don't include project in base
  // For project-level paths (wit/queries, wit/wiql) include project
  const isOrgLevel = !project || path.startsWith('_apis/projects');
  const base = isOrgLevel
    ? `https://dev.azure.com/${org}`
    : `https://dev.azure.com/${org}/${encodeURIComponent(project)}`;

  const url  = `${base}/${path}`;
  const auth = 'Basic ' + Buffer.from(':' + pat).toString('base64');

  // Log to Vercel function logs (visible in Vercel dashboard → Functions tab)
  console.log(`[ADO] ${method} ${url}`);
  console.log(`[ADO] org="${org}" project="${project}" isOrgLevel=${isOrgLevel}`);

  try {
    const opts = {
      method,
      headers: {
        'Authorization': auth,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
      },
    };

    if (method === 'POST' && req.body) {
      opts.body = typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);
    }

    const adoRes = await fetch(url, opts);
    const text   = await adoRes.text();

    console.log(`[ADO] response: ${adoRes.status}`);

    // Return full response info on error so frontend can diagnose
    if (!adoRes.ok) {
      return res.status(adoRes.status).json({
        error:   `ADO_${adoRes.status}`,
        status:  adoRes.status,
        url:     url,
        org:     org,
        project: project,
        message: text.substring(0, 500),
      });
    }

    try {
      return res.status(adoRes.status).json(JSON.parse(text));
    } catch(_) {
      return res.status(adoRes.status).send(text);
    }

  } catch (err) {
    console.error('[ADO] proxy_error:', err.message);
    return res.status(500).json({
      error:   'proxy_error',
      message: err.message,
      org:     org,
      url:     `${base}/${path}`,
    });
  }
}