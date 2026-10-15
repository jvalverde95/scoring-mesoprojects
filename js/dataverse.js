/* ─────────────────────────────────────────────────────────────────
   dataverse.js — Dataverse removed.
   Portfolio persistence is now Excel-only.
   This file keeps non-DV helpers for backwards compat.
   ───────────────────────────────────────────────────────────────── */

// Pool code helper (used by export and pools screen)
function getPoolCode(p) {
  const thrS = parseInt(document.getElementById('thr-s')?.value) || 30;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 100;
  if (p.horas == null) return 'none';
  if (p.horas < thrS)  return 's';
  if (p.horas < thrM)  return 'm';
  return 'l';
}

// Row selection helpers
function toggleProjectSelect(idx) {
  if (portfolioData[idx]) {
    portfolioData[idx]._selected = !portfolioData[idx]._selected;
    updateBulkDeleteBtn();
  }
}

function selectAllProjects(checked) {
  portfolioData.forEach(p => p._selected = !!checked);
  renderPortfolio();
}

function updateBulkDeleteBtn() {
  const n   = portfolioData.filter(p => p._selected).length;
  const btn = document.getElementById('btn-delete-selected');
  if (btn) {
    btn.textContent = n ? `🗑 Eliminar selección (${n})` : '🗑 Eliminar selección';
    btn.disabled = !n;
  }
}

// Delete a single project by index (local only)
function dvDeleteOne(idx) {
  const p = portfolioData[idx];
  if (!p) return;
  if (!confirm(`¿Eliminar "${p.nom}"?\n\nNo volverá a aparecer aunque se sincronice con Azure DevOps.`)) return;
  // Registrar el borrado (tombstone) para que ADO no lo vuelva a añadir
  if (typeof markDeleted === 'function') markDeleted(p);
  portfolioData.splice(idx, 1);
  // Persistir inmediatamente para que no reaparezca al recargar
  if (typeof savePortfolio === 'function') savePortfolio();
  renderPortfolio();
  renderPools();
  try { renderCharts(); } catch(_) {}
  if (typeof renderDashboard === 'function') renderDashboard();
  toast(`✓ "${p.nom}" eliminado`);
}

// Bulk delete selected projects (local only)
function dvDeleteSelected() {
  const selected = portfolioData.filter(p => p._selected);
  if (!selected.length) { toast('Selecciona proyectos para eliminar'); return; }
  if (!confirm(`¿Eliminar ${selected.length} proyecto${selected.length>1?'s':''}?\n\nNo volverán a aparecer aunque se sincronice con Azure DevOps.`)) return;
  // Registrar los borrados (tombstones) antes de quitarlos
  if (typeof markDeleted === 'function') markDeleted(selected);
  portfolioData = portfolioData.filter(p => !p._selected);
  // Persistir inmediatamente
  if (typeof savePortfolio === 'function') savePortfolio();
  renderPortfolio();
  renderPools();
  try { renderCharts(); } catch(_) {}
  if (typeof renderDashboard === 'function') renderDashboard();
  toast(`✓ ${selected.length} proyecto${selected.length>1?'s':''} eliminado${selected.length>1?'s':''}`);
}
