// Vercel Serverless Function — /api/token
// Proxy para el token de Azure AD (evita CORS desde el browser)
// Las credenciales viajan del browser → esta función → Azure AD
// NUNCA se expone el client_secret en el frontend
 
export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  // CORS headers para que el browser pueda llamar a /api/token
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
 
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
 
  try {
    const { tenant_id, client_id, client_secret, scope } = req.body;
 
    if (!tenant_id || !client_id || !client_secret || !scope) {
      return res.status(400).json({ error: 'Faltan parámetros: tenant_id, client_id, client_secret, scope' });
    }
 
    // Llamada server-side a Azure AD (sin CORS)
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'client_credentials',
          client_id,
          client_secret,
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
 
    // Devolver SOLO el access_token y expires_in — nunca ecos del secret
    return res.status(200).json({
      access_token: data.access_token,
      expires_in:   data.expires_in,
      token_type:   data.token_type,
    });
 
  } catch (err) {
    return res.status(500).json({ error: 'proxy_error', error_description: err.message });
  }
}