/* ═══ PERSISTENCE — localStorage ════════════════════════════
   Saves & restores credentials across page reloads.
   Sensitive values (PAT, Client Secret) are obfuscated with
   a reversible XOR so they don't sit as plain text in storage.
   Not cryptographic — just avoids casual shoulder-surfing.
   ═══════════════════════════════════════════════════════════ */

const _STORE_KEY = 'meso_scoring_cfg_v1';
const _OBFUSCATE_SEED = 'meso2024scr';

function _xor(str, key) {
  // Simple reversible XOR obfuscation
  if (!str) return '';
  try {
    let out = '';
    for (let i = 0; i < str.length; i++)
      out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return btoa(unescape(encodeURIComponent(out)));
  } catch(e) { return ''; }
}
function _dxor(b64, key) {
  if (!b64) return '';
  try {
    const str = decodeURIComponent(escape(atob(b64)));
    let out = '';
    for (let i = 0; i < str.length; i++)
      out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return out;
  } catch(e) { return ''; }
}

function saveAllCreds() {
  const g  = id => (document.getElementById(id)?.value || '').trim();
  const gs = id => document.getElementById(id)?.value || '';  // keep selected option
  const existing = JSON.parse(localStorage.getItem(_STORE_KEY) || '{}');
  const cfg = {
    ...existing,
    // Azure DevOps credentials
    ado_org:       g('cfg-ado-org'),
    ado_project:   g('cfg-ado-project'),
    ado_pat:       _xor(g('cfg-ado-pat'), _OBFUSCATE_SEED),
    // ADO query selection (persist last used query)
    ado_query_id:  g('cfg-ado-query-id') || existing.ado_query_id || '',
    ado_query_name:document.getElementById('cfg-ado-query-select')
      ? (document.getElementById('cfg-ado-query-select').selectedOptions?.[0]?.textContent || existing.ado_query_name || '')
      : (existing.ado_query_name || ''),
    // ADO type filters
    ado_types_all: document.getElementById('cfg-ado-type-all')?.checked ?? true,
    // Dataverse — URL and tenant only (secrets are in Vercel env vars)
    dv_url:        g('cfg-dv-url'),
    dv_tenant:     g('cfg-dv-tenant'),
    dv_clientid:   g('cfg-dv-clientid'),
    // dv_secret: intentionally NOT saved — lives in Vercel env vars
  };
  try { localStorage.setItem(_STORE_KEY, JSON.stringify(cfg)); } catch(e) {}
}

function loadAllCreds() {
  let cfg;
  try { cfg = JSON.parse(localStorage.getItem(_STORE_KEY) || '{}'); }
  catch(e) { return; }
  if (!cfg || !Object.keys(cfg).length) return;

  const set = (id, val) => {
    if (!val) return;
    const e = document.getElementById(id);
    if (e) e.value = val;
  };

  // Azure DevOps credentials
  set('cfg-ado-org',     cfg.ado_org);
  set('cfg-ado-project', cfg.ado_project);
  if (cfg.ado_pat) set('cfg-ado-pat', _dxor(cfg.ado_pat, _OBFUSCATE_SEED));
  // Also sync to landing ADO modal fields
  set('ado-org',     cfg.ado_org);
  set('ado-project', cfg.ado_project);

  // ADO query selection — restore last used query info
  if (cfg.ado_query_id) {
    set('cfg-ado-query-id', cfg.ado_query_id);
    const note = document.getElementById('cfg-ado-query-note');
    if (note && cfg.ado_query_name)
      note.textContent = `Query guardada: "${cfg.ado_query_name}"`;
    const loadBtn = document.getElementById('cfg-ado-load-btn');
    if (loadBtn) loadBtn.disabled = false;
    // Show query section hint
    const qSec = document.getElementById('cfg-ado-query-section');
    if (qSec) qSec.style.display = 'block';
  }

  // Dataverse credentials
  set('cfg-dv-url',      cfg.dv_url);
  set('cfg-dv-tenant',   cfg.dv_tenant);
  set('cfg-dv-clientid', cfg.dv_clientid);
  // dv_secret intentionally not loaded — it lives in Vercel env vars server-side

  // Sync into runtime _dvCfg
  if (cfg.dv_url || cfg.dv_tenant || cfg.dv_clientid) {
    _dvCfg.url      = cfg.dv_url      || '';
    _dvCfg.tenant   = cfg.dv_tenant   || '';
    _dvCfg.clientId = cfg.dv_clientid || '';
    _dvCfg.secret   = cfg.dv_secret   ? _dxor(cfg.dv_secret, _OBFUSCATE_SEED) : '';
  }

  // Show DV badge
  if (cfg.dv_url && cfg.dv_tenant && cfg.dv_clientid && cfg.dv_secret) {
    const b = document.getElementById('cfg-dv-badge');
    if (b) { b.style.display='inline-block'; b.textContent='⟳ guardado';
             b.style.background='#F3E8FF'; b.style.color='#742774'; }
  }
  // Show ADO badge
  if (cfg.ado_org && cfg.ado_pat) {
    const b = document.getElementById('cfg-ado-conn-badge');
    if (b) { b.style.display='inline-block'; b.textContent='⟳ guardado';
             b.style.background='#EEF3FC'; b.style.color='#1848A0'; }
  }

  // Apply HARDCODED_CREDS as fallback for any empty field
  // (defined in scoring.js — loaded first)
  if (typeof HARDCODED_CREDS !== 'undefined') {
    const hc = HARDCODED_CREDS;
    const setIfEmpty = (id, val) => {
      if (!val) return;
      const e = document.getElementById(id);
      if (e && !e.value) e.value = val;
    };
    setIfEmpty('cfg-ado-org',     hc.ado_org);
    setIfEmpty('cfg-ado-project', hc.ado_project);
    setIfEmpty('cfg-ado-pat',     hc.ado_pat);
    setIfEmpty('ado-org',         hc.ado_org);
    setIfEmpty('ado-project',     hc.ado_project);
    setIfEmpty('cfg-dv-url',      hc.dv_url);
    setIfEmpty('cfg-dv-tenant',   hc.dv_tenant);
    setIfEmpty('cfg-dv-clientid', hc.dv_clientid);
    // dv_secret not set from HARDCODED_CREDS — use Vercel env vars instead
    // _dvCfg.url will be set from /api/config response at startup
    if (hc.dv_url && !_dvCfg.url) {
      _dvCfg.url = hc.dv_url;  // URL is not secret, ok to set
    }
  }
}

function clearAllCreds() {
  try { localStorage.removeItem(_STORE_KEY); } catch(e) {}
  ['cfg-ado-org','cfg-ado-project','cfg-ado-pat',
   'cfg-dv-url','cfg-dv-tenant','cfg-dv-clientid','cfg-dv-secret']
    .forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
  _dvCfg = { url:'', tenant:'', clientId:'', secret:'' };
  _dvToken = null; _dvTokenExp = 0;
  toast('✓ Credenciales borradas');
}