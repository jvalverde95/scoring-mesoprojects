// Vercel Serverless — /api/token
// Lee las credenciales de Dataverse DESDE LAS ENV VARS DE VERCEL.
// El browser nunca envía ni ve el client_secret.
//
// Variables de entorno a configurar en Vercel → Settings → Environment Variables:
//   DV_TENANT_ID   = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
//   DV_CLIENT_ID   = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
//   DV_CLIENT_SECRET = your-client-secret-value
//   DV_URL         = https://yourorg.crm4.dynamics.com

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Read credentials from Vercel environment (NEVER from request body)
  const tenant = process.env.DV_TENANT_ID;
  const clientId = process.env.DV_CLIENT_ID;
  const secret = process.env.DV_CLIENT_SECRET;
  const dvUrl = process.env.DV_URL;

  if (!tenant || !clientId || !secret || !dvUrl) {
    return res.status(500).json({
      error: 'config_missing',
      error_description:
        'Configura DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET y DV_URL ' +
        'en Vercel → Settings → Environment Variables',
    });
  }

  try {
    const scope = (dvUrl.endsWith('/') ? dvUrl : dvUrl + '/') + '.default';

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'client_credentials',
          client_id:     clientId,
          client_secret: secret,
          scope,
        }).toString(),
      }
    );

    const data = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(tokenRes.status).json({
        error:             data.error             || 'auth_error',
        error_description: data.error_description || `HTTP ${tokenRes.status}`,
      });
    }

    // Return token info — secret never leaves this function
    return res.status(200).json({
      access_token: data.access_token,
      expires_in:   data.expires_in,
      token_type:   data.token_type,
      dv_url:       dvUrl,   // return url so frontend knows where to call
    });

  } catch (err) {
    return res.status(500).json({ error: 'proxy_error', error_description: err.message });
  }
}
