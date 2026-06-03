// Vercel Serverless — /api/config
// Returns public config from env vars so the frontend can auto-configure.
// NEVER returns secrets (PAT, client_secret).
// Called once at startup by the frontend.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Check which integrations are actually configured
  const hasDv  = !!(process.env.DV_TENANT_ID && process.env.DV_CLIENT_ID &&
                    process.env.DV_CLIENT_SECRET && process.env.DV_URL);
  const hasAdo = !!(process.env.ADO_PAT);

  return res.status(200).json({
    // Safe public values — no secrets
    dv_url:       process.env.DV_URL         || '',
    ado_org:      process.env.ADO_ORG        || '',
    ado_project:  process.env.ADO_PROJECT    || '',
    // Flags: tells frontend which integrations are available
    has_dataverse: hasDv,
    has_ado:       hasAdo,
  });
}
