/* ═══ PERSISTENCE — localStorage ════════════════════════════
   Saves & restores credentials across page reloads.
   Sensitive values (PAT, Client Secret) are obfuscated with
   a reversible XOR so they don't sit as plain text in storage.
   Not cryptographic — just avoids casual shoulder-surfing.
   ═══════════════════════════════════════════════════════════ */

const _PORTFOLIO_KEY = 'nexus_portfolio_v1';

/* ═══ PERSISTENCIA DE LA CARTERA (localStorage — caché instantánea) ═══
   Guarda la cartera completa (con las reevaluaciones) en el navegador,
   para restaurarla al abrir la app sin recargar el Excel. Complementa
   el almacén en GitHub (compartido entre dispositivos). */
function savePortfolio() {
  try {
    if (!portfolioData || !portfolioData.length) return;
    var payload = {
      v: 1, savedAt: Date.now(),
      portfolio: portfolioData,
      devTeam: (typeof devTeam !== 'undefined' ? devTeam : []),
      thr: (typeof getThr === 'function' ? getThr() : {s:10,m:50}),
    };
    localStorage.setItem(_PORTFOLIO_KEY, JSON.stringify(payload));
  } catch(e) { /* cuota excedida u otro: ignorar silenciosamente */ }
}

function loadPortfolioLocal() {
  try {
    var raw = localStorage.getItem(_PORTFOLIO_KEY);
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (!d || !d.portfolio || !d.portfolio.length) return null;
    return d;
  } catch(e) { return null; }
}

function hasStoredPortfolio() {
  return !!loadPortfolioLocal();
}

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


/* ══════════════════════════════════════════════════════════════════
   PUBLICACIÓN WEB DE LA CARTERA (almacén en GitHub vía /api/store)
   - publishCartera(): sube snapshot + cartera completa
   - schedulePublish(): auto-publicación con debounce tras cambios
   - fetchPublishedCartera(): lee la última publicación
   - loadPublishedIntoApp(): restaura la cartera publicada en la app
   ══════════════════════════════════════════════════════════════════ */

function getShareKey() { return localStorage.getItem('nexus_share_key') || ''; }
function setShareKey(k) { localStorage.setItem('nexus_share_key', (k||'').trim()); }

function directorsLink() {
  var k = getShareKey();
  if (!k) return '';
  return location.origin + location.pathname + '#directores?k=' + encodeURIComponent(k);
}

async function publishCartera(silent) {
  var k = getShareKey();
  if (!k) { if (!silent) toast('⚠ Configura la clave de publicación en Configuración'); return false; }
  if (!portfolioData || !portfolioData.length) { if (!silent) toast('⚠ No hay cartera que publicar'); return false; }
  try {
    var snapshot = (typeof _buildSprintSnapshot === 'function') ? _buildSprintSnapshot() : null;
    // Cartera completa compacta para poder restaurarla al abrir la app
    var portfolio = portfolioData.map(function(p){
      return { nom:p.nom, area:p.area, sponsor:p.sponsor, scores:p.scores, sf:p.sf,
        dimScores:p.dimScores, horas:p.horas, reqDate:p.reqDate, descripcion:p.descripcion,
        adoId:p.adoId, adoType:p.adoType, adoState:p.adoState, adoPriority:p.adoPriority,
        adoAssigned:p.adoAssigned, adoStartDate:p.adoStartDate, adoDesc:p.adoDesc,
        adoTags:p.adoTags, adoIteration:p.adoIteration, assignedDev:p.assignedDev,
        _sfExcel:p._sfExcel, _manualEval:p._manualEval };
    });
    var payload = { v:2, publishedAt:Date.now(), snapshot:snapshot, portfolio:portfolio,
      devTeam:(typeof devTeam!=='undefined'?devTeam:[]),
      thr:(typeof getThr==='function'?getThr():{s:10,m:50}) };
    var r = await fetch('/api/store?k='+encodeURIComponent(k), {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!r.ok) { var j=await r.json().catch(function(){return{};}); throw new Error(j.error||('HTTP '+r.status)); }
    localStorage.setItem('nexus_last_publish', String(Date.now()));
    var st = document.getElementById('pub-status');
    if (st) st.textContent = 'Última publicación: ' + new Date().toLocaleString('es-ES');
    if (!silent) toast('✓ Cartera publicada · la vista de directores ya está actualizada');
    return true;
  } catch(e) {
    if (!silent) toast('✗ Error al publicar: ' + e.message);
    return false;
  }
}

// Auto-publicación con debounce: se llama tras cargar Excel / cambiar notas / replanificar
var _pubTimer = null;
function schedulePublish() {
  if (!getShareKey()) return;                 // sin clave configurada, no publica
  if (window._sharedViewLocked) return;       // la vista de directores nunca publica
  if (_pubTimer) clearTimeout(_pubTimer);
  _pubTimer = setTimeout(function(){ publishCartera(true); }, 4000);   // 4s tras el último cambio
}

async function fetchPublishedCartera(key) {
  var k = key || getShareKey();
  if (!k) return null;
  var r = await fetch('/api/store?k='+encodeURIComponent(k), { cache:'no-store' });
  if (!r.ok) return null;
  return await r.json();
}

// Restaura la última cartera publicada en la app (para no depender del Excel local)
async function loadPublishedIntoApp() {
  var st = document.getElementById('mandatory-excel-status');
  if (st) { st.style.display='block'; st.style.color='#888'; st.textContent='Descargando última cartera publicada…'; }
  try {
    var data = await fetchPublishedCartera();
    if (!data || !data.portfolio || !data.portfolio.length) throw new Error('No hay cartera publicada aún');
    portfolioData = data.portfolio;
    if (data.devTeam && data.devTeam.length && typeof devTeam !== 'undefined') { devTeam = data.devTeam; if (typeof saveDevTeam==='function') try{saveDevTeam();}catch(_){} }
    // Refrescar todo
    ['renderPortfolio','renderPools','renderCharts','renderDashboard','renderSprintScreen','renderPlanningSummary','renderCalendar','renderDevAssignPanel'].forEach(function(fn){
      if (typeof window[fn]==='function') { try{ window[fn](); }catch(_){} }
    });
    toast('✓ Cartera publicada cargada · '+portfolioData.length+' proyectos');
    var ov = document.getElementById('mandatory-excel-overlay');
    if (ov) ov.style.display='none';
    return true;
  } catch(e) {
    if (st) { st.style.color='#C0392B'; st.textContent='✗ ' + e.message; }
    return false;
  }
}
