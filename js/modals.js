/* ═══ MODAL OPEN/CLOSE ════════════════════════════════════ */
function openAiModal(adoItems) {
  _aiItems  = adoItems;
  _aiScored = adoItems.map(wi => ({wi, proj:adoMapToProject(wi), status:'pending', selected:false}));
  _aiStopped = false;

  // Update modal subtitle with hours summary
  const withH = _aiScored.filter(s => s.proj.horas != null).length;
  const total = _aiScored.length;
  const subEl = document.getElementById('ai-modal-sub');
  if (subEl) {
    subEl.innerHTML = `${total} proyectos de Azure DevOps · 
      <span style="color:#087B50;font-weight:600">${withH} con horas estimadas ✓</span>
      ${withH < total
        ? ` · <span style="color:#C07800;font-weight:600">${total-withH} sin horas</span>
            <span style="color:#AAA"> — asígnalas aquí o en Pools</span>`
        : ''}`;
  }

  renderAiColumns();
  const el = document.getElementById('ai-overlay');
  if (el) el.classList.add('open');
}

function openProjectEdit(idx) {
  _pemIdx = idx;
  renderPemBody();
  const el = document.getElementById('proj-edit-overlay');
  if (el) el.classList.add('open');
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

function createNewProject() {
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

  toast(`✓ "${nom}" añadido a la cartera`);
  if (typeof renderDashboard === 'function') renderDashboard();
  document.getElementById('new-project-overlay').classList.remove('open');
  renderPortfolio();
}

/* ═══ RE-EVALUATION FLOW ═══════════════════════════════════════
   Instead of the dark overlay modal, we load the project into
   the same manual evaluation wizard (step 0 → 6), pre-filled
   with current scores. User can review and adjust each dimension,
   then save back to portfolio.
   ═══════════════════════════════════════════════════════════════ */

function reEvalProject(idx) {
  const p = portfolioData[idx];
  if (!p) return;

  // Store which project we are re-evaluating
  _pemIdx = idx;

  // ── Pre-fill wizard fields ──────────────────────────────────
  const setVal = (id, val) => {
    const e = document.getElementById(id);
    if (e && val != null) e.value = val;
  };

  setVal('f-name',    p.nom);
  setVal('f-area',    p.area);
  setVal('f-type',    p.adoType || '');
  setVal('f-req',     p.reqDate || '');

  // Pre-fill all 22 criterion sliders with current scores
  DIMS.forEach(d => d.criterios.forEach(c => {
    const val = p.scores?.[c.id] ?? 5;
    c.val = val;
    const sl = document.getElementById('sl-' + c.id);
    const vl = document.getElementById('vl-' + c.id);
    if (sl) sl.value = val;
    if (vl) vl.textContent = val;
  }));

  // Update wizard header and progress
  upd();

  // Show a notice banner in the wizard that this is a re-evaluation
  const notice = document.getElementById('reeval-notice');
  if (notice) {
    notice.style.display = 'flex';
    notice.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0">
        <circle cx="7" cy="7" r="6" stroke="#1848A0" stroke-width="1.2"/>
        <path d="M7 4v3.5M7 9.5h.01" stroke="#1848A0" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      <span>Reevaluando: <strong>${p.nom.substring(0, 50)}${p.nom.length > 50 ? '…' : ''}</strong>
        &nbsp;· Score actual: <strong style="color:${scColorHex(p.sf || 0)}">${(p.sf || 0).toFixed(1)}</strong>
      </span>
      <button onclick="document.getElementById('reeval-notice').style.display='none'"
        style="margin-left:auto;background:none;border:none;color:#1848A0;cursor:pointer;font-size:14px;padding:0">✕</button>`;
  }

  // Navigate to step 0 (project metadata) — same as manual eval
  goStep(0);

  // Scroll to top
  const shell = document.getElementById('shell');
  if (shell) shell.scrollTop = 0;

  toast(`↺ Reevaluando "${p.nom.substring(0, 30)}…" · Ajusta los criterios y guarda`);
}
