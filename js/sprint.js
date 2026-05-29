/* ═══ SPRINT / EN MARCHA ════════════════════════════════════
   Developer capacity management and Sprint board rendering.
   ═══════════════════════════════════════════════════════════ */

// ── Developer capacity state ─────────────────────────────────
let devTeam = [];  // [{name, corto, medio, largo}]

function loadDevTeam() {
  try {
    const saved = localStorage.getItem('meso_dev_team');
    if (saved) devTeam = JSON.parse(saved);
  } catch(_) {}
  if (!devTeam.length) {
    // Default: one developer
    devTeam = [{ name: 'Desarrollador 1', corto: 2, medio: 1, largo: 1 }];
  }
}

function saveDevTeam() {
  try { localStorage.setItem('meso_dev_team', JSON.stringify(devTeam)); } catch(_){}
}

function renderDevRows() {
  const cont = document.getElementById('dev-rows');
  if (!cont) return;
  cont.innerHTML = devTeam.map((dev, i) => `
    <div style="display:grid;grid-template-columns:1fr 80px 80px 80px 32px;gap:8px;align-items:center;
                padding:8px 10px;background:var(--surf);border-radius:6px;border:1px solid var(--b)">
      <input type="text" value="${dev.name}" placeholder="Nombre desarrollador"
        style="border:none;background:transparent;font-size:11px;font-weight:600;color:var(--ink);outline:none"
        onchange="devTeam[${i}].name=this.value;saveDevTeam();updateDevCapSummary()">
      <div style="text-align:center">
        <div style="font-size:8px;color:var(--d3);font-weight:700;margin-bottom:2px">CORTO</div>
        <input type="number" min="0" max="20" value="${dev.corto}"
          style="width:100%;text-align:center;border:1px solid var(--d3);border-radius:4px;font-size:12px;padding:2px"
          onchange="devTeam[${i}].corto=parseInt(this.value)||0;saveDevTeam();updateDevCapSummary()">
      </div>
      <div style="text-align:center">
        <div style="font-size:8px;color:var(--d4);font-weight:700;margin-bottom:2px">MEDIO</div>
        <input type="number" min="0" max="20" value="${dev.medio}"
          style="width:100%;text-align:center;border:1px solid var(--d4);border-radius:4px;font-size:12px;padding:2px"
          onchange="devTeam[${i}].medio=parseInt(this.value)||0;saveDevTeam();updateDevCapSummary()">
      </div>
      <div style="text-align:center">
        <div style="font-size:8px;color:var(--d1);font-weight:700;margin-bottom:2px">LARGO</div>
        <input type="number" min="0" max="20" value="${dev.largo}"
          style="width:100%;text-align:center;border:1px solid var(--d1);border-radius:4px;font-size:12px;padding:2px"
          onchange="devTeam[${i}].largo=parseInt(this.value)||0;saveDevTeam();updateDevCapSummary()">
      </div>
      <button onclick="removeDevRow(${i})"
        style="background:none;border:none;color:var(--d1);cursor:pointer;font-size:14px;padding:0">✕</button>
    </div>
  `).join('');
  updateDevCapSummary();
}

function addDevRow() {
  devTeam.push({ name: `Desarrollador ${devTeam.length + 1}`, corto: 2, medio: 1, largo: 1 });
  renderDevRows();
}

function removeDevRow(idx) {
  devTeam.splice(idx, 1);
  renderDevRows();
  saveDevTeam();
}

function saveDevCapacity() {
  saveDevTeam();
  updateDevCapSummary();
  toast('✓ Capacidad del equipo guardada');
}

function getDevCapacity() {
  return devTeam.reduce((acc, d) => ({
    corto: acc.corto + (parseInt(d.corto) || 0),
    medio: acc.medio + (parseInt(d.medio) || 0),
    largo: acc.largo + (parseInt(d.largo) || 0),
  }), { corto: 0, medio: 0, largo: 0 });
}

function updateDevCapSummary() {
  const cap = getDevCapacity();
  const total = cap.corto + cap.medio + cap.largo;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('dev-cap-corto', cap.corto);
  set('dev-cap-medio', cap.medio);
  set('dev-cap-largo', cap.largo);
  set('dev-cap-total', total);
  // Also update sprint screen
  set('sprint-cap-total', total);
  set('sprint-cap-corto', cap.corto);
  set('sprint-cap-medio', cap.medio);
  set('sprint-cap-largo', cap.largo);
}

/* ── Pool threshold sync ─────────────────────────────────────── */
let _syncingThr = false;
function syncThrInputs() {
  if (_syncingThr) return;
  _syncingThr = true;
  try {
    const s = parseInt(document.getElementById('cfg-thr-s')?.value) || 30;
    const m = parseInt(document.getElementById('cfg-thr-m')?.value) || 100;
    const setVal = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    setVal('thr-s', s);
    setVal('thr-m', m);
    const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setTxt('cfg-thr-largo-lbl', m);
    if (typeof updThresholds === 'function') updThresholds();
  } finally {
    _syncingThr = false;
  }
}

/* ── Sprint screen rendering ─────────────────────────────────── */
function renderSprintScreen() {
  updateDevCapSummary();
  const thrS = parseInt(document.getElementById('thr-s')?.value) || 30;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 100;

  // Projects "en marcha" = those in pool Corto, Medio, or Largo (not Sin estimar)
  const enMarcha = portfolioData.filter(p =>
    p.horas !== null && p.horas !== undefined
  );

  const cortos = enMarcha.filter(p => p.horas < thrS);
  const medios = enMarcha.filter(p => p.horas >= thrS && p.horas < thrM);
  const largos = enMarcha.filter(p => p.horas >= thrM);

  const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setTxt('sprint-corto-count', cortos.length);
  setTxt('sprint-medio-count', medios.length);
  setTxt('sprint-largo-count', largos.length);

  const renderCol = (projects) => {
    if (!projects.length) return '<div style="font-size:10px;color:var(--ink4);text-align:center;padding:20px 0">Sin proyectos</div>';
    return projects.map(p => {
      const cl = clsf(p.sf || 0);
      return `
        <div style="padding:10px 12px;background:#fff;border-radius:8px;border:1px solid var(--b);cursor:pointer"
          onclick="openProjectEdit(portfolioData.indexOf(p))">
          <div style="font-size:10px;font-weight:700;color:var(--ink);margin-bottom:4px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${p.nom}">
            ${p.nom}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:9px;color:var(--ink3)">${p.area || '—'}</span>
            <span style="font-size:13px;font-weight:900;color:${scColorHex(p.sf || 0)};font-family:'Playfair Display',serif">
              ${(p.sf || 0).toFixed(1)}
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px">
            <span style="font-size:8px;padding:2px 6px;border-radius:20px;background:${cl.bg || 'var(--surf)'};color:${cl.c || 'var(--ink3)'}">
              ${cl.et || '—'}
            </span>
            <span style="font-size:9px;color:var(--ink3)">
              ${p.horas != null ? p.horas + 'h' : '—'}
            </span>
          </div>
        </div>
      `;
    }).join('');
  };

  const setHTML = (id, v) => { const e = document.getElementById(id); if (e) e.innerHTML = v; };
  setHTML('sprint-col-corto', renderCol(cortos));
  setHTML('sprint-col-medio', renderCol(medios));
  setHTML('sprint-col-largo', renderCol(largos));
}

/* ── Projects screen update ─────────────────────────────────── */
function renderProjectsScreen() {
  const count = portfolioData.length;
  const el = document.getElementById('projects-screen-count');
  const btn = document.getElementById('btn-clear-projects');
  if (el) {
    el.textContent = count > 0
      ? `${count} proyecto${count>1?'s':''} cargado${count>1?'s':''}`
      : 'Sin proyectos cargados';
  }
  if (btn) btn.style.display = count > 0 ? 'inline-block' : 'none';
}

/* ── Eval screen ─────────────────────────────────────────────── */
function renderEvalScreen() {
  const noPools = portfolioData.filter(p =>
    p.horas === null || p.horas === undefined
  );
  const el = document.getElementById('eval-pending-list');
  if (!el) return;
  if (!portfolioData.length) {
    el.innerHTML = '<div style="color:var(--ink4)">No hay proyectos cargados — ve a <b>Proyectos</b> primero</div>';
    return;
  }
  if (!noPools.length) {
    el.innerHTML = '<div style="color:var(--d3)">✓ Todos los proyectos tienen horas estimadas</div>';
    return;
  }
  el.innerHTML = `
    <div style="color:var(--d4);margin-bottom:8px;font-size:10px">
      ${noPools.length} proyecto${noPools.length>1?'s':''} sin horas — en pool "Sin estimar"
    </div>
    ${noPools.slice(0,5).map(p => `
      <div style="padding:6px 10px;background:var(--surf);border-radius:6px;margin-bottom:4px;
        display:flex;justify-content:space-between;align-items:center;font-size:10px">
        <span style="font-weight:600">${p.nom}</span>
        <span style="color:${scColorHex(p.sf||0)};font-weight:700">${(p.sf||0).toFixed(1)}</span>
      </div>
    `).join('')}
    ${noPools.length > 5 ? `<div style="font-size:9px;color:var(--ink4);text-align:center">+${noPools.length-5} más</div>` : ''}
  `;
}

/* ── openAiModalFromEval — opens AI modal with all unscored/all projects ── */
function openAiModalFromEval() {
  // Use all projects in portfolioData that came from ADO (_adoCreds)
  if (typeof _adoCreds !== 'undefined' && _adoCreds && typeof openAiModal === 'function') {
    // If we have ADO items cached, open directly
    if (typeof _aiItems !== 'undefined' && _aiItems.length) {
      openAiModal(_aiItems);
      return;
    }
  }
  // Otherwise go to config to load ADO
  toast('Primero carga proyectos desde Azure DevOps en ⚙ Config → Cargar query');
  goStep('config');
}

/* ── applyBulkHorasEval ──────────────────────────────────────── */
function applyBulkHorasEval() {
  const val = parseInt(document.getElementById('eval-horas-masivo')?.value);
  if (!val) { toast('Selecciona un valor de horas'); return; }
  const thrS = parseInt(document.getElementById('thr-s')?.value) || 30;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 100;
  // Apply to all projects without hours
  let count = 0;
  portfolioData.forEach(p => {
    if (p.horas === null || p.horas === undefined) {
      p.horas = val; count++;
    }
  });
  renderPortfolio(); renderPools();
  renderEvalScreen();
  renderSprintScreen();
  toast(`✓ ${count} proyectos actualizados con ${val}h`);
}
