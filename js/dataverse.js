/* ═══ DATAVERSE — ScoringDigitalProject v1.0.0.1 ════════════
   State variables, field maps and all DV functions.
   Load order: after scoring.js (needs DIMS, CRIT_IDS, computeProj)
   ═══════════════════════════════════════════════════════════ */

// ── Runtime state ────────────────────────────────────────────

// ── Criterion ID → real Dataverse field name ─────────────────
// meso_prioritypool picklist: 0=Corto, 1=Medio, 2=Largo, 3=Sin estimar
function getPoolCode(p) {
  if (p.horas == null) return 3;
  const thrS = parseInt(document.getElementById('thr-s')?.value) || 30;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 100;
  if (p.horas < thrS) return 0;
  if (p.horas < thrM) return 1;
  return 2;
}



// Parse a Dataverse record into app project format
function dvRecordToProject(rec) {
  const scores = {};
  Object.entries(CRIT_FIELD_MAP).forEach(([cid, field]) => {
    scores[cid] = rec[field] ?? 5;
  });
  return {
    nom:        rec.meso_auditname    || '',
    area:       rec.meso_departmentarea || '',
    sponsor:    rec.meso_sponsor       || '',
    adoId:      rec.meso_auditid       || null,
    adoState:   rec.meso_auditstatus !== undefined
      ? (rec.meso_auditstatus === 0 ? 'Active' : 'Resolved') : '',
    reqDate:    rec.meso_requestdate
      ? rec.meso_requestdate.substring(0,10) : null,
    horas:      rec.meso_estimatedhours || null,
    scores,
    sf:         rec.meso_finalscore   || 0,
    sb:         rec.meso_basescore    || 0,
    af:         rec.meso_agingfactor  || 1,
    dimScores: [
      rec.meso_dimension1score || 0,
      rec.meso_dimension2score || 0,
      rec.meso_dimension3score || 0,
      rec.meso_dimension4score || 0,
      rec.meso_dimension5score || 0,
      rec.meso_dimension6score || 0,
    ],
    _dvId:      rec.meso_projectscoringid || null,
    _dvStatus:  'synced',
  };
}

// Load all projects from Dataverse on app startup
async function dvLoadPortfolio() {
  if (!_dvCfg.url || !_dvCfg.tenant || !_dvCfg.clientId || !_dvCfg.secret) return;

  const loadingEl = document.getElementById('dv-loading-banner');
  if (loadingEl) { loadingEl.style.display='flex'; loadingEl.textContent='⟳ Cargando proyectos de Dataverse…'; }

  try {
    const token = await dvGetToken();
    const fields = [
      'meso_projectscoringid','meso_auditname','meso_departmentarea','meso_sponsor',
      'meso_auditid','meso_auditstatus','meso_requestdate','meso_estimatedhours',
      'meso_finalscore','meso_scorebase','meso_agingfactor','meso_priorityclassification',
      'meso_prioritypool',
      'meso_dimension1score','meso_dimension2score','meso_dimension3score',
      'meso_dimension4score','meso_dimension5score','meso_dimension6score',
      ...Object.values(CRIT_FIELD_MAP)
    ].join(',');

    // Load all pages (Dataverse returns max 5000 per page)
    let url = `meso_projectscorings?$select=${fields}&$orderby=meso_finalscore desc`;
    let allRecords = [];
    while (url) {
      const res = await dvApi('GET', url, token);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      allRecords.push(...(data.value || []));
      // Follow @odata.nextLink for pagination
      const next = data['@odata.nextLink'];
      url = next ? next.replace(/.*\/api\/data\/v9\.2\//, '') : null;
    }

    if (!allRecords.length) {
      if (loadingEl) loadingEl.style.display='none';
      return;
    }

    portfolioData = allRecords.map(dvRecordToProject);
    renderPortfolio();
    renderPools();
    renderCharts();
    if (loadingEl) {
      loadingEl.textContent = `✓ ${portfolioData.length} proyectos cargados de Dataverse`;
      loadingEl.style.background='var(--d3t)'; loadingEl.style.color='var(--d3)';
      setTimeout(()=>{ loadingEl.style.display='none'; }, 3000);
    }

    // Show portfolio panel
    const pp = document.getElementById('portfolio'); if(pp) pp.style.display='block';
    const cp = document.getElementById('charts-panel'); if(cp) cp.style.display='block';
    const bc = document.getElementById('btn-clear'); if(bc) bc.style.display='flex';

    // Go to summary if we loaded data
    goStep('summary');
    toast(`✓ ${portfolioData.length} proyectos cargados de Dataverse`);

  } catch(e) {
    console.warn('dvLoadPortfolio:', e.message);
    if (loadingEl) {
      loadingEl.textContent = '⚠ No se pudieron cargar proyectos de Dataverse: ' + e.message;
      loadingEl.style.background='var(--d1t)'; loadingEl.style.color='var(--d1)';
      setTimeout(()=>{ loadingEl.style.display='none'; }, 6000);
    }
  }
}

// Delete a project from Dataverse by GUID
async function dvDeleteProject(dvId) {
  const token = await dvGetToken();
  const res = await dvApi('DELETE', `meso_projectscorings(${dvId})`, token);
  if (!res.ok && res.status !== 204)
    throw new Error(`HTTP ${res.status}`);
}

// Delete selected projects (bulk)
async function dvDeleteSelected() {
  const selected = portfolioData.filter(p => p._selected);
  if (!selected.length) { toast('Selecciona proyectos para eliminar'); return; }

  const hasDvIds = selected.filter(p => p._dvId);
  const msg = `¿Eliminar ${selected.length} proyectos${hasDvIds.length ? ` (${hasDvIds.length} de Dataverse)` : ''}?`;
  if (!confirm(msg)) return;

  // Remove from Dataverse
  if (hasDvIds.length && _dvCfg.url) {
    dvStatusShow('loading', `Eliminando ${hasDvIds.length} proyectos de Dataverse…`);
    let ok=0, err=0;
    for (const p of hasDvIds) {
      try { await dvDeleteProject(p._dvId); ok++; }
      catch(e) { err++; console.warn('Delete error:', e.message); }
    }
    dvStatusShow(err?'error':'ok', `✓ ${ok} eliminados de Dataverse${err?' · '+err+' errores':''}`);
  }

  // Remove from local portfolio
  portfolioData = portfolioData.filter(p => !p._selected);
  renderPortfolio();
  renderPools();
  renderCharts();
  toast(`✓ ${selected.length} proyectos eliminados`);
}

// Toggle selection on a project
function toggleProjectSelect(idx, checked) {
  if (portfolioData[idx]) portfolioData[idx]._selected = checked;
  updateBulkDeleteBtn();
}

function selectAllProjects(checked) {
  portfolioData.forEach(p => p._selected = checked);
  // Re-render to reflect checkboxes
  renderPortfolio();
  updateBulkDeleteBtn();
}

function updateBulkDeleteBtn() {
  const n = portfolioData.filter(p=>p._selected).length;
  const btn = document.getElementById('btn-bulk-delete');
  if (btn) {
    btn.disabled = n === 0;
    btn.textContent = n > 0 ? `🗑 Eliminar selección (${n})` : '🗑 Eliminar selección';
  }
  const count = document.getElementById('bulk-count');
  if (count) count.textContent = n > 0 ? `${n} seleccionado${n>1?'s':''}` : '';
}

function dvSaveCfg() {
  const g = id => (document.getElementById(id)?.value || '').trim();
  _dvCfg = {
    url:      g('cfg-dv-url'),
    tenant:   g('cfg-dv-tenant'),
    clientId: g('cfg-dv-clientid'),
    secret:   g('cfg-dv-secret'),
  };
  saveAllCreds();  // persist to localStorage
  toast('✓ Configuración Dataverse guardada');
}

async function dvTest() {
  dvSaveCfg();
  const { url, tenant, clientId, secret } = _dvCfg;

  // Step 1: required fields
  const missing = [];
  if (!url)      missing.push('URL del entorno');
  if (!tenant)   missing.push('Tenant ID');
  if (!clientId) missing.push('Client ID');
  if (!secret)   missing.push('Client Secret');
  if (missing.length) {
    dvStatusShow('error', '✗ Faltan: ' + missing.join(', ')); return;
  }

  // Step 2: URL format
  if (!url.startsWith('https://')) {
    dvStatusShow('error', '✗ URL debe empezar por https://  Ej: https://org1234.crm4.dynamics.com'); return;
  }

  // Step 3: token
  dvStatusShow('loading', '① Autenticando con Azure AD…');
  let token;
  try {
    token = await dvGetToken();
  } catch(e) {
    const m = e.message;
    const hints = {
      'NET_ERR':           ' → Error de red. Comprueba conexión a internet.',
      'AADSTS700016':      ' → Client ID no existe en este tenant.',
      'AADSTS7000215':     ' → Client Secret incorrecto o expirado.',
      'AADSTS50020':       ' → Tenant ID incorrecto.',
      'AADSTS650057':      ' → Falta permiso "Dynamics CRM → user_impersonation" en Azure AD → API permissions.',
      'AADSTS700082':      ' → Secreto expirado. Genera uno nuevo en Azure AD → Certificates & secrets.',
      'unauthorized_client':' → App sin permiso de Client Credentials. Verifica configuración en Azure AD.',
    };
    const hint = Object.entries(hints).find(([k]) => m.includes(k));
    dvStatusShow('error', '✗ Azure AD: ' + m + (hint ? hint[1] : '')); return;
  }

  // Step 4: ping Dataverse
  dvStatusShow('loading', '② Token ✓ — Conectando con Dataverse…');
  let res;
  try {
    res = await dvApi('GET', 'meso_projectscorings?$top=1&$select=meso_projectscoringid', token);
  } catch(e) {
    dvStatusShow('error', '✗ No se pudo conectar a ' + url + ' — ' + e.message); return;
  }

  // Step 5: interpret status
  const STATUS_HINTS = {
    401: '✗ Sin acceso (401) → Power Platform Admin Center → tu entorno → Usuarios de aplicación → añade tu app con rol "Administrador del sistema".',
    403: '✗ Sin permisos (403) → Asigna rol "Administrador del sistema" en Power Platform Admin Center.',
    404: '✗ Tabla meso_projectscoring no encontrada (404) → Verifica que importaste la solución ScoringDigitalProject v1.0.0.1 en este entorno.',
  };
  if (STATUS_HINTS[res.status]) {
    dvStatusShow('error', STATUS_HINTS[res.status]); return;
  }
  if (!res.ok) {
    let body = ''; try { body = await res.text(); } catch(_){}
    dvStatusShow('error', `✗ Error ${res.status}: ${body.substring(0,200)}`); return;
  }

  // Step 6: success
  const data = await res.json().catch(() => ({value:[]}));
  const envName = url.replace('https://','').split('.')[0];
  dvStatusShow('ok', `✓ Conectado · ${envName} · meso_projectscoring OK · ${data.value?.length??0} registros`);

  const badge = document.getElementById('cfg-dv-badge');
  if (badge) { badge.style.display='inline-block'; badge.textContent='✓ conectado'; }
  const syncBtn = document.getElementById('cfg-dv-sync-btn');
  if (syncBtn) syncBtn.disabled = false;
  const dvBtn = document.getElementById('pem-dv-btn');
  if (dvBtn) dvBtn.style.display = 'flex';
}

async function dvGetToken() {
  if (_dvToken && Date.now() < _dvTokenExp) return _dvToken;
  const { url, tenant, clientId, secret } = _dvCfg;
  if (!tenant || !clientId || !secret || !url)
    throw new Error('Faltan credenciales en ⚙ Config → Dataverse');

  const resource = (url.endsWith('/') ? url : url + '/') + '.default';

  // Use /api/token proxy to avoid browser CORS block on login.microsoftonline.com
  // The client_secret never goes to Azure AD from the browser — it goes through Vercel
  let res;
  try {
    res = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id:     tenant,
        client_id:     clientId,
        client_secret: secret,
        scope:         resource,
      }),
    });
  } catch(e) {
    throw new Error('NET_ERR:' + e.message);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }
  if (!data.access_token) {
    throw new Error('No se recibió access_token del proxy');
  }

  _dvToken    = data.access_token;
  _dvTokenExp = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
  return _dvToken;
}

/* ── Sync full portfolio ─────────────────────────────────────── */
async function dvSyncAll() {
  if (!portfolioData.length) { toast('Sin proyectos para sincronizar'); return; }
  dvStatusShow('loading', `Sincronizando ${portfolioData.length} proyectos…`);
  try {
    const token = await dvGetToken();
    let ok=0, err=0;
    for (const p of portfolioData) {
      try { await dvUpsertProject(p, token); ok++; }
      catch(e) { err++; console.warn('DV:', p.nom, e.message); }
    }
    dvStatusShow(err?'error':'ok', `✓ ${ok} sincronizados${err?' · '+err+' errores (consola)':''}`);
    toast(`↑ Dataverse: ${ok} proyectos`);
  } catch(e) {
    dvStatusShow('error', '✗ ' + e.message);
  }
}

/* ── Save single project from edit modal ────────────────────── */
async function pemSaveDataverse() {
  const p = portfolioData[_pemIdx];
  if (!p) return;
  pemSave();
  try {
    const token = await dvGetToken();
    await dvUpsertProject(p, token);
    toast('✓ Guardado en Dataverse');
    dvStatusShow('ok', '✓ Proyecto guardado en Dataverse');
  } catch(e) {
    toast('✗ Dataverse: ' + e.message);
    dvStatusShow('error', '✗ ' + e.message);
  }
}

/* ── Status display ─────────────────────────────────────────── */
function dvStatusShow(type, msg) {
  const el    = document.getElementById('cfg-dv-status');
  const msgEl = document.getElementById('cfg-dv-status-msg');
  const spin  = document.getElementById('cfg-dv-spinner');
  const colors = {
    loading:{ bg:'#F3E8FF', c:'#742774' },
    ok:     { bg:'#ECF8F3', c:'#087B50' },
    error:  { bg:'#FEF0F1', c:'#CC1F26' },
  };
  const clr = colors[type] || colors.loading;
  if (el)  { el.style.display='flex'; el.style.background=clr.bg; el.style.color=clr.c; }
  if (spin)  spin.style.display = type==='loading' ? 'block' : 'none';
  if (msgEl) msgEl.textContent = msg;
}

/* ── Helper: DV API call ────────────────────────────────────── */
async function dvApi(method, path, token, body=null) {
  const url = `${_dvCfg.url.replace(/\/$/,'')}/api/data/v9.2/${path}`;
  const headers = {
    'Authorization':    'Bearer ' + token,
    'Accept':           'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version':    '4.0',
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

/* ── Build project record body ──────────────────────────────── */
function dvBuildBody(p) {
  const cl = clsf(p.sf || 0);
  const body = {
    meso_auditname:              p.nom     || '',
    meso_departmentarea:         p.area    || '',
    meso_sponsor:                p.sponsor || '',
    meso_auditid:                p.adoId   || null,
    meso_requestdate:            p.reqDate || null,
    meso_daysinportfolio:        p.reqDate
      ? Math.round((Date.now() - new Date(p.reqDate)) / 86400000) : null,
    meso_estimatedhours:         p.horas   || null,
    meso_priorityclassification: cl.et     || '',
    meso_ispriorityauto:         !!(p.dimScores && p.dimScores[0] >= 8),
    meso_prioritypool:           getPoolCode(p),
    meso_syncdatetime:           new Date().toISOString(),
    meso_finalscore:             +(p.sf  || 0).toFixed(3),
    meso_basescore:              +(p.sb  || 0).toFixed(3),
    meso_agingfactor:            +(p.af  || 1).toFixed(4),
    meso_dimension1score:        +(p.dimScores?.[0] || 0).toFixed(3),
    meso_dimension2score:        +(p.dimScores?.[1] || 0).toFixed(3),
    meso_dimension3score:        +(p.dimScores?.[2] || 0).toFixed(3),
    meso_dimension4score:        +(p.dimScores?.[3] || 0).toFixed(3),
    meso_dimension5score:        +(p.dimScores?.[4] || 0).toFixed(3),
    meso_dimension6score:        +(p.dimScores?.[5] || 0).toFixed(3),
  };
  Object.entries(CRIT_FIELD_MAP).forEach(([cid, field]) => {
    body[field] = Math.round(p.scores?.[cid] || 5);
  });
  return body;
}

/* ── Upsert single project ──────────────────────────────────── */
async function dvUpsertProject(p, token) {
  const body = dvBuildBody(p);
  let existingId = p._dvId || null;
  if (!existingId && p.adoId) {
    const chk = await dvApi('GET',
      `meso_projectscorings?$filter=meso_auditid eq ${p.adoId}&$select=meso_projectscoringid`,
      token
    );
    if (chk.ok) {
      const d = await chk.json();
      if (d.value?.length) existingId = d.value[0].meso_projectscoringid;
    }
  }
  const method = existingId ? 'PATCH' : 'POST';
  const path   = existingId
    ? `meso_projectscorings(${existingId})`
    : 'meso_projectscorings';
  const res = await dvApi(method, path, token, body);
  if (!res.ok && res.status !== 204) {
    const t = await res.text().catch(()=>'');
    throw new Error(`${res.status}: ${t.substring(0,120)}`);
  }
  if (res.status === 201) {
    try { const d=await res.json(); if(d.meso_projectscoringid) p._dvId=d.meso_projectscoringid; }
    catch(_){}
  } else if (existingId) {
    p._dvId = existingId;
  }
}