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

  // meso_auditstatus is a picklist in DV: 0=Active, 1=Inactive, etc.
  // When loaded from ADO it's a string; when stored as DV picklist it's a number
  const adoState = rec.meso_auditstatus !== undefined && rec.meso_auditstatus !== null
    ? (typeof rec.meso_auditstatus === 'number'
        ? (rec.meso_auditstatus === 0 ? 'Active' : 'Resolved')
        : String(rec.meso_auditstatus))
    : '';

  const proj = {
    // ── Identity ──────────────────────────────────────────────
    nom:        rec.meso_auditname       || '',
    area:       rec.meso_departmentarea  || '',
    sponsor:    rec.meso_sponsor         || '',
    adoId:      rec.meso_auditid         ?? null,
    adoState,
    adoType:    rec.meso_audittype       || '',
    notes:      rec.meso_notes           || '',

    // ── Dates ─────────────────────────────────────────────────
    reqDate:    rec.meso_requestdate
      ? rec.meso_requestdate.substring(0, 10) : null,
    horas:      rec.meso_estimatedhours  ?? null,

    // ── Scores ────────────────────────────────────────────────
    scores,
    sf:         rec.meso_finalscore      || 0,
    sb:         rec.meso_basescore       || 0,
    af:         rec.meso_agingfactor     || 1,
    dimScores: [
      rec.meso_dimension1score || 0,
      rec.meso_dimension2score || 0,
      rec.meso_dimension3score || 0,
      rec.meso_dimension4score || 0,
      rec.meso_dimension5score || 0,
      rec.meso_dimension6score || 0,
    ],

    // ── Classification ────────────────────────────────────────
    autoP:       !!(rec.meso_ispriorityauto),

    // ── DV metadata ───────────────────────────────────────────
    _dvId:       rec.meso_projectscoringid || null,
    _dvStatus:   'synced',
    _dvPrevScore: rec.meso_finalscore || null,  // remember for scorevariation next update
    _selected:   false,
  };

  return proj;
}

// Load all projects from Dataverse on app startup
async function dvLoadPortfolio() {
  // Only need URL — token is obtained server-side via /api/token
  if (!_dvCfg.url) return;

  const loadingEl = document.getElementById('dv-loading-banner');
  if (loadingEl) { loadingEl.style.display='flex'; loadingEl.textContent='⟳ Cargando proyectos de Dataverse…'; }

  try {
    const token = await dvGetToken();
    const fields = [
      // Identity
      'meso_projectscoringid', 'meso_auditname', 'meso_departmentarea', 'meso_sponsor',
      'meso_auditid', 'meso_auditstatus', 'meso_audittype', 'meso_notes',
      // Dates
      'meso_requestdate', 'meso_estimatedhours', 'meso_daysinportfolio', 'meso_syncdatetime',
      // Scores
      'meso_finalscore', 'meso_basescore', 'meso_agingfactor', 'meso_currentscore',
      'meso_previousscore', 'meso_scorevariation',
      // Dimensions
      'meso_dimension1score', 'meso_dimension2score', 'meso_dimension3score',
      'meso_dimension4score', 'meso_dimension5score', 'meso_dimension6score',
      // Classification
      'meso_priorityclassification', 'meso_prioritypool', 'meso_ispriorityauto',
      // 22 criterion scores
      ...Object.values(CRIT_FIELD_MAP),
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
  const res   = await dvApi('DELETE', `meso_projectscorings(${dvId})`, token);
  if (!res.ok && res.status !== 204)
    throw new Error(`HTTP ${res.status} deleting ${dvId}`);
}

// Delete selected projects (bulk)
async function dvDeleteSelected() {
  const selected = portfolioData.filter(p => p._selected);
  if (!selected.length) { toast('Selecciona proyectos para eliminar'); return; }

  const hasDvIds = selected.filter(p => p._dvId);
  const noun     = selected.length === 1 ? 'proyecto' : 'proyectos';
  const msg      = `¿Eliminar ${selected.length} ${noun}?`
    + (hasDvIds.length ? `\nSe borrarán también de Dataverse.` : '');
  if (!confirm(msg)) return;

  // Remove from Dataverse
  if (hasDvIds.length && _dvCfg.url) {
    dvStatusShow('loading', `Eliminando de Dataverse…`);
    let ok=0, err=0;
    for (const p of hasDvIds) {
      try   { await dvDeleteProject(p._dvId); ok++; }
      catch(e) { err++; console.warn('Delete error:', e.message); }
    }
    dvStatusShow(
      err ? 'error' : 'ok',
      err ? `⚠ ${ok} eliminados · ${err} errores` : `✓ ${ok} eliminados de Dataverse`
    );
  }

  // Remove from local portfolio
  portfolioData = portfolioData.filter(p => !p._selected);
  renderPortfolio(); renderPools();
  try { renderCharts(); } catch(_) {}
  if (typeof renderDashboard === 'function') renderDashboard();
  toast(`✓ ${selected.length} ${noun} eliminado${selected.length>1?'s':''}`);
}

// Delete a single project by index (called from row delete button)
async function dvDeleteOne(idx) {
  const p = portfolioData[idx];
  if (!p) return;
  if (!confirm(`¿Eliminar "${p.nom}"?`)) return;

  if (p._dvId && _dvCfg.url) {
    try {
      await dvDeleteProject(p._dvId);
      toast(`✓ "${p.nom}" eliminado de Dataverse`);
    } catch(e) {
      toast(`✗ Error Dataverse: ${e.message}`);
      return;
    }
  }
  portfolioData.splice(idx, 1);
  renderPortfolio(); renderPools();
  try { renderCharts(); } catch(_) {}
  if (typeof renderDashboard === 'function') renderDashboard();
  if (!p._dvId) toast(`✓ "${p.nom}" eliminado`);
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
  // Credentials are now in Vercel env vars — nothing to save from the browser.
  // This function remains for backwards compat but just shows status.
  toast('✓ Las credenciales están configuradas en Vercel env vars');
  dvStatusShow('ok', '✓ Credenciales gestionadas por el servidor');
}

async function dvTest() {
  dvStatusShow('loading', 'Verificando conexión con Dataverse…');
  try {
    const token = await dvGetToken();
    if (!_dvCfg.url) throw new Error('DV_URL no configurado en Vercel env vars');
    const res = await dvApi('GET',
      'meso_projectscorings?$top=1&$select=meso_projectscoringid', token);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dvStatusShow('ok', '✓ Conexión con Dataverse correcta');
    toast('✓ Dataverse conectado');
  } catch(e) {
    dvStatusShow('error', '✗ ' + e.message);
    toast('✗ ' + e.message);
  }
}

async function dvGetToken() {
  // Return cached token if still valid
  if (_dvToken && Date.now() < _dvTokenExp) return _dvToken;

  // /api/token now reads ALL credentials from Vercel env vars server-side.
  // The browser sends NO secrets — just a plain GET.
  let res;
  try {
    res = await fetch('/api/token', { method: 'GET' });
  } catch(e) {
    throw new Error('No se puede conectar con el servidor: ' + e.message);
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 500 && data.error === 'config_missing') {
    throw new Error(
      'Dataverse no configurado en el servidor. ' +
      'Añade DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET y DV_URL ' +
      'en Vercel → Settings → Environment Variables.'
    );
  }
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }
  if (!data.access_token) {
    throw new Error('No se recibió access_token del servidor');
  }

  // If the server returned the DV URL, update _dvCfg so dvApi knows where to call
  if (data.dv_url && !_dvCfg.url) {
    _dvCfg.url = data.dv_url;
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

  // Store previous score for history tracking (meso_previousscore + meso_scorevariation)
  const prevScore = p._dvPrevScore || null;
  const variation = prevScore !== null ? +((p.sf||0) - prevScore).toFixed(3) : null;

  const body = {
    // ── Identity ─────────────────────────────────────────────
    meso_auditname:              p.nom          || '',
    meso_departmentarea:         p.area         || '',
    meso_sponsor:                p.sponsor      || '',
    meso_auditid:                p.adoId        ?? null,
    meso_auditstatus:            p.adoState     || '',
    meso_audittype:              p.adoType      || '',
    meso_notes:                  p.notes        || '',

    // ── Dates ─────────────────────────────────────────────────
    meso_requestdate:            p.reqDate      || null,
    meso_daysinportfolio:        p.reqDate
      ? Math.round((Date.now() - new Date(p.reqDate)) / 86400000) : null,
    meso_estimatedhours:         p.horas        ?? null,
    meso_syncdatetime:           new Date().toISOString(),

    // ── Scores ────────────────────────────────────────────────
    meso_finalscore:             +(p.sf  || 0).toFixed(3),
    meso_basescore:              +(p.sb  || 0).toFixed(3),
    meso_agingfactor:            +(p.af  || 1).toFixed(4),
    meso_currentscore:           +(p.sf  || 0).toFixed(3),
    ...(prevScore !== null && { meso_previousscore: +prevScore.toFixed(3) }),
    ...(variation !== null && { meso_scorevariation: +variation.toFixed(3) }),

    // ── Dimensions ───────────────────────────────────────────
    meso_dimension1score:        +(p.dimScores?.[0] || 0).toFixed(3),
    meso_dimension2score:        +(p.dimScores?.[1] || 0).toFixed(3),
    meso_dimension3score:        +(p.dimScores?.[2] || 0).toFixed(3),
    meso_dimension4score:        +(p.dimScores?.[3] || 0).toFixed(3),
    meso_dimension5score:        +(p.dimScores?.[4] || 0).toFixed(3),
    meso_dimension6score:        +(p.dimScores?.[5] || 0).toFixed(3),

    // ── Classification ───────────────────────────────────────
    meso_priorityclassification: cl.et || '',
    meso_ispriorityauto:         !!(p.dimScores && p.dimScores[0] >= 8),
    meso_prioritypool:           getPoolCode(p),
  };

  // ── 22 criterion scores ───────────────────────────────────
  Object.entries(CRIT_FIELD_MAP).forEach(([cid, field]) => {
    body[field] = Math.round(p.scores?.[cid] ?? 5);
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

/* ── Global Parameters — pool thresholds in Dataverse ──────────
   meso_globalparameters table:
     meso_shortpoolmax  = threshold Corto→Medio (hours)
     meso_mediumpoolmax = threshold Medio→Largo (hours)
     meso_agingrate     = aging rate (0.15 default)
     meso_maximumaging  = max aging multiplier (1.25 default)
   ─────────────────────────────────────────────────────────── */

async function dvSaveGlobalParams() {
  if (!_dvCfg.url) return;
  try {
    const token = await dvGetToken();
    const thrS = parseInt(document.getElementById('thr-s')?.value) || 30;
    const thrM = parseInt(document.getElementById('thr-m')?.value) || 100;

    // Check if global params record exists
    const res = await dvApi('GET',
      'meso_globalparameterss?$top=1&$select=meso_globalparametersid,meso_shortpoolmax,meso_mediumpoolmax',
      token);
    
    const body = {
      meso_shortpoolmax:  thrS,
      meso_mediumpoolmax: thrM,
    };

    if (res.ok) {
      const d = await res.json();
      if (d.value?.length) {
        // PATCH existing
        await dvApi('PATCH', `meso_globalparameterss(${d.value[0].meso_globalparametersid})`, token, body);
      } else {
        // POST new
        await dvApi('POST', 'meso_globalparameterss', token, body);
      }
    }
    console.log('[DV] Global params saved: thrS='+thrS+' thrM='+thrM);
  } catch(e) {
    console.warn('[DV] saveGlobalParams:', e.message);
  }
}

async function dvLoadGlobalParams() {
  if (!_dvCfg.url) return;
  try {
    const token = await dvGetToken();
    const res = await dvApi('GET',
      'meso_globalparameterss?$top=1&$select=meso_shortpoolmax,meso_mediumpoolmax,meso_agingrate,meso_maximumaging',
      token);
    if (!res.ok) return;
    const d = await res.json();
    if (!d.value?.length) return;
    const rec = d.value[0];
    
    // Apply pool thresholds to inputs
    if (rec.meso_shortpoolmax) {
      const s = document.getElementById('thr-s');
      const cs = document.getElementById('cfg-thr-s');
      if (s) s.value = rec.meso_shortpoolmax;
      if (cs) cs.value = rec.meso_shortpoolmax;
    }
    if (rec.meso_mediumpoolmax) {
      const m = document.getElementById('thr-m');
      const cm = document.getElementById('cfg-thr-m');
      if (m) m.value = rec.meso_mediumpoolmax;
      if (cm) cm.value = rec.meso_mediumpoolmax;
    }
    console.log('[DV] Global params loaded:', rec.meso_shortpoolmax, rec.meso_mediumpoolmax);
  } catch(e) {
    console.warn('[DV] loadGlobalParams:', e.message);
  }
}