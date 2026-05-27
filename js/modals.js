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