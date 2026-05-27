/* ═══ DATAVERSE CRUD — load, create, delete ════════════════
   Runs on startup to load portfolio from Dataverse.
   All field names from ScoringDigitalProject v1.0.0.1
   ═══════════════════════════════════════════════════════════ */

// Reverse map: Dataverse field → app criterion ID
const DV_CRIT_REVERSE = Object.fromEntries(
  Object.entries(CRIT_FIELD_MAP).map(([cid, field]) => [field, cid])
);

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

// Auto-sync after aiImportAll — hook into the existing function
const _origAiImportAll = aiImportAll;
aiImportAll = async function() {
  _origAiImportAll();
  // After loading into portfolio, sync to Dataverse if connected
  if (_dvCfg.url && _dvCfg.tenant && _dvCfg.clientId && _dvCfg.secret) {
    setTimeout(async () => {
      try {
        const token = await dvGetToken();
        let ok = 0;
        for (const p of portfolioData) {
          try { await dvUpsertProject(p, token); ok++; } catch(e) {}
        }
        if (ok) toast(`↑ ${ok} proyectos sincronizados con Dataverse`);
      } catch(e) { console.warn('Auto-sync after import:', e.message); }
    }, 500);
  }
};