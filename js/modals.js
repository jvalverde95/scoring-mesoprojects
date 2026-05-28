/* ═══ MODAL OPEN/CLOSE ════════════════════════════════════ */
function openAiModal(adoItems) {
  _aiItems  = adoItems;
  _aiScored = adoItems.map(wi => ({wi, proj:adoMapToProject(wi), status:'pending', selected:false}));
  _aiStopped = false;
  renderAiColumns();
  const el = document.getElementById('ai-overlay');
  if (el) el.classList.add('open');
}

function openProjectEdit(idx) {
  _pemIdx = idx;
  renderPemBody();
  const el = document.getElementById('proj-edit-overlay');
  if (el) el.classList.add('open');
  const dvBtn = document.getElementById('pem-dv-btn');
  if (dvBtn) dvBtn.style.display = _dvCfg.url ? 'flex' : 'none';
}

/* ═══ MODAL HELPERS ═══════════════════════════════════════ */
function closeAiModal() {
  _aiStopped = true; _aiRunning = false;
  const el = document.getElementById('ai-overlay');
  if (el) el.classList.remove('open');
}

function closeProjEdit() {
  const el = document.getElementById('proj-edit-overlay');
  if (el) el.classList.remove('open');
  renderPortfolio(); renderPools();
  if (currentStep === 'pools') renderPoolsStep();
}

function pemSave() {
  const p = portfolioData[_pemIdx];
  if (!p) return;
  const updated = computeProj(p);
  Object.assign(portfolioData[_pemIdx], updated);
  portfolioData[_pemIdx].horas = p.horas;
  toast('✓ Proyecto actualizado');
  renderPemBody();
}

function pemPrev() {
  if (_pemIdx > 0) { _pemIdx--; renderPemBody(); }
}

function pemNext() {
  if (_pemIdx < portfolioData.length - 1) { _pemIdx++; renderPemBody(); }
}

function openNewProjectModal() {
  ['np-nombre','np-area','np-sponsor','np-horas','np-fecha'].forEach(id => {
    const e = document.getElementById(id); if(e) e.value = '';
  });
  const fd = document.getElementById('np-fecha');
  if(fd) fd.value = new Date().toISOString().split('T')[0];
  const err = document.getElementById('np-error'); if(err) err.style.display='none';
  const sav = document.getElementById('np-saving'); if(sav) sav.style.display='none';
  document.getElementById('new-project-overlay').classList.add('open');
}

async function createNewProject() {
  const g = id => (document.getElementById(id)?.value || '').trim();
  const nom    = g('np-nombre');
  const area   = g('np-area');
  const sponsor= g('np-sponsor');
  const horas  = parseFloat(g('np-horas')) || null;
  const fecha  = g('np-fecha') || null;
  const errEl  = document.getElementById('np-error');
  const savEl  = document.getElementById('np-saving');

  if (!nom)  { errEl.textContent='El nombre es obligatorio'; errEl.style.display='block'; return; }
  if (!area) { errEl.textContent='El área es obligatoria';   errEl.style.display='block'; return; }
  errEl.style.display = 'none';

  const scores = {};
  CRIT_IDS.forEach(cid => { scores[cid] = 5; });

  const proj = computeProj({ nom, area, sponsor, scores, reqDate: fecha, regDate: null });
  proj.horas = horas; proj._dvId = null; proj._selected = false;

  portfolioData.push(proj);
  renderPortfolio(); renderPools(); renderCharts();
  ['portfolio','charts-panel'].forEach(id => { const e=document.getElementById(id); if(e) e.style.display='block'; });
  ['btn-clear','bulk-toolbar'].forEach(id => { const e=document.getElementById(id); if(e) e.style.display='flex'; });

  if (_dvCfg.url && _dvCfg.tenant && _dvCfg.clientId && _dvCfg.secret) {
    if(savEl) { savEl.style.display='block'; savEl.textContent='⟳ Guardando en Dataverse…'; savEl.style.background='var(--d5t)'; savEl.style.color='var(--d5)'; }
    try {
      const token = await dvGetToken();
      await dvUpsertProject(proj, token);
      if(savEl) { savEl.textContent='✓ Guardado en Dataverse'; savEl.style.background='var(--d3t)'; savEl.style.color='var(--d3)'; }
      toast(`✓ "${nom}" creado`);
      setTimeout(() => document.getElementById('new-project-overlay').classList.remove('open'), 1000);
    } catch(e) {
      if(savEl) savEl.style.display='none';
      if(errEl) { errEl.textContent='✗ Dataverse: '+e.message; errEl.style.display='block'; }
    }
  } else {
    toast(`✓ "${nom}" creado localmente`);
    document.getElementById('new-project-overlay').classList.remove('open');
  }
  renderPortfolio();
}
