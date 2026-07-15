/* ═══ CONFIG STEP ══════════════════════════════════════════ */
function applyCfgWeights(){
  const total=DIMS.reduce((s,d)=>{const v=parseInt(document.getElementById('cfg-val-'+d.id)?.value||0);return s+(isNaN(v)?0:v);},0);
  if(total!==100){toast('Los pesos deben sumar 100% (ahora: '+total+'%)');return;}
  DIMS.forEach(d=>{const v=parseInt(document.getElementById('cfg-val-'+d.id)?.value||0);d.peso=v/100;});
  renderWeightEditor();
  if(portfolioData.length){portfolioData=portfolioData.map(p=>computeProj(p));renderPortfolio();}
  upd(); toast('✓ Pesos aplicados');
}
function resetCfgWeights(){
  const defs=[0.30,0.20,0.20,0.12,0.10,0.08];
  DIMS.forEach((d,i)=>{d.peso=defs[i];const sl=document.getElementById('cfg-slider-'+d.id),vl=document.getElementById('cfg-val-'+d.id);if(sl)sl.value=Math.round(defs[i]*100);if(vl)vl.value=Math.round(defs[i]*100);});
  updateCfgTotal(); applyCfgWeights();
}

/* ═══ WIZARD HEADER ════════════════════════════════════════ */
function updateWizHeader(step) {
  const badge   = document.getElementById('wh-badge');
  const nameEl  = document.getElementById('wh-name');
  const metaEl  = document.getElementById('wh-meta');
  const scoreEl = document.getElementById('wh-score');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const dimRow  = document.getElementById('wiz-dim-row');

  // ── Always update dimension dots row ──────────────────────
  if (dimRow && typeof DIMS !== 'undefined') {
    const COLORS = ['#CC1F26','#C4974A','#087B50','#C07800','#1848A0','#5C6570'];
    const BGS    = ['#FEF0F1','#FAF6EC','#ECF8F3','#FAF5E6','#EEF3FC','#F4F5F6'];
    const isNum  = typeof step === 'number' && step >= 1 && step <= 6;
    dimRow.innerHTML = DIMS.map((d, di) => {
      const ds     = typeof scoreDim === 'function'
        ? scoreDim(d.criterios.map(c => ({...c, val: c.val || 5}))).toFixed(1)
        : '5.0';
      const active = isNum && di === step - 1;
      const done   = isNum && di < step - 1;
      return '<button onclick="goStep(' + (di+1) + ')" style="'
        + 'display:inline-flex;flex-direction:column;align-items:center;'
        + 'gap:2px;padding:4px 10px;border-radius:6px;cursor:pointer;'
        + 'border:1.5px solid ' + (active ? COLORS[di] : done ? '#DEDEDE' : '#F0F0F0') + ';'
        + 'background:' + (active ? COLORS[di] : done ? '#FAFAFA' : '#fff') + ';'
        + 'transition:all .15s;min-width:44px;'
        + '">'
        + '<span style="font-size:8px;font-weight:700;color:' + (active ? '#fff' : COLORS[di]) + ';letter-spacing:.05em">' + d.id + '</span>'
        + '<span style="font-size:11px;font-weight:800;color:' + (active ? '#fff' : done ? '#999' : '#CCC') + ';line-height:1">' + ds + '</span>'
        + '</button>';
    }).join('');
  }

  const DT = ['var(--d1t)','var(--d2t)','var(--d3t)','var(--d4t)','var(--d5t)','var(--d6t)'];
  const DC = ['var(--d1)','var(--d2)','var(--d3)','var(--d4)','var(--d5)','var(--d6)'];
  const set = (el, txt) => { if (el) el.textContent = txt; };

  // Helper: configure button  
  const setBtn = (btn, text, visible, dark) => {
    if (!btn) return;
    btn.textContent = text;
    btn.style.visibility = visible ? 'visible' : 'hidden';
    btn.style.background = dark ? '#111' : '#fff';
    btn.style.color      = dark ? '#fff' : '#666';
    btn.style.border     = dark ? 'none' : '1px solid #DEDEDE';
  };

  if (step === 0) {
    if (badge) { badge.style.cssText = 'background:#F5F5F5;color:#888;font-size:14px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;'; badge.textContent = '0'; }
    set(nameEl, 'Datos del proyecto');
    set(metaEl, 'Información básica · paso 0 de 7');
    if (scoreEl) { scoreEl.textContent = '—'; scoreEl.style.color = '#CCC'; }
    setBtn(btnPrev, '← Inicio',    false, false);  // hidden on step 0
    setBtn(btnNext, 'Empezar D1 →', true,  true);
    if (btnNext) btnNext.onclick = () => stepNav(1);
    if (btnPrev) btnPrev.onclick = () => goLanding();

  } else if (step === 'summary') {
    if (badge) { badge.style.cssText = 'background:#ECF8F3;color:#087B50;font-size:14px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;'; badge.textContent = '✓'; }
    set(nameEl, 'Resumen y resultados');
    set(metaEl, 'Score final · Sigmoid Boost + Aging');
    const sf = typeof scoreFinal === 'function' ? scoreFinal(getReqDate()) : 0;
    if (scoreEl) { scoreEl.textContent = sf.toFixed(1); scoreEl.style.color = scColorHex(sf); }
    setBtn(btnPrev, '← D6',            true, false);
    setBtn(btnNext, '↺ Nueva evaluación', true, false);
    if (btnPrev) btnPrev.onclick = () => goStep(6);
    if (btnNext) btnNext.onclick = () => resetAll();

  } else if (step === 'charts') {
    if (badge) { badge.style.cssText = 'background:#EEF3FC;font-size:14px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;'; badge.textContent = '📊'; }
    set(nameEl, 'Gráficas de cartera');
    set(metaEl, (portfolioData?.length || 0) + ' proyectos');
    if (scoreEl) { scoreEl.textContent = portfolioData?.length || '—'; scoreEl.style.color = '#111'; }
    setBtn(btnPrev, '← Pools',       false, false);
    setBtn(btnNext, 'Ver resumen →',   true, true);
    if (btnNext) btnNext.onclick = () => goStep('summary');

  } else if (step === 'pools') {
    if (badge) { badge.style.cssText = 'background:#FAF5E6;font-size:14px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;'; badge.textContent = '🗂'; }
    set(nameEl, 'Clasificación por pools');
    set(metaEl, 'Nivel de ejecución por horas estimadas');
    if (scoreEl) { scoreEl.textContent = ''; }
    setBtn(btnPrev, '',              false, false);
    setBtn(btnNext, 'Ver gráficas →', true, true);
    if (btnNext) btnNext.onclick = () => goStep('charts');

  } else if (typeof step === 'number' && step >= 1 && step <= 6) {
    const d  = DIMS[step - 1];
    const di = step - 1;
    if (badge) {
      badge.style.cssText = `background:${DT[di]};color:${DC[di]};font-size:11px;font-weight:800;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;`;
      badge.textContent = d.id;
    }
    set(nameEl, d.nom);
    set(metaEl, `Dimensión ${step} de 6 · peso ${Math.round(d.peso * 100)}%`);
    const ds = typeof scoreDim === 'function'
      ? scoreDim(d.criterios.map(c => ({...c, val: c.val || 5}))).toFixed(1)
      : '—';
    if (scoreEl) { scoreEl.textContent = ds; scoreEl.style.color = DC[di]; }
    setBtn(btnPrev, step === 1 ? '← Datos' : `← D${step - 1}`, true, false);
    setBtn(btnNext, step === 6 ? 'Ver resumen →' : `D${step + 1} →`, true, true);
    if (btnPrev) btnPrev.onclick = () => stepNav(-1);
    if (btnNext) btnNext.onclick = () => stepNav(1);
  }
}
function renderConfigStep() {
  renderCfgDimRows();
  renderWeightEditor();
  dvLoadCfg();
}

function updateCfgTotal() {
  const total = DIMS.reduce((s, d) => {
    const v = parseInt(document.getElementById('cfg-val-' + d.id)?.value || 0);
    return s + (isNaN(v) ? 0 : v);
  }, 0);
  const el = document.getElementById('cfg-total');
  if (el) {
    el.textContent = total + '%';
    el.style.color = total === 100 ? 'var(--d3)' : 'var(--d1)';
  }
}

// ── Días a sumar para la entrega de proyectos en curso vencidos ──
function getOverdueDays() {
  var v = parseInt(localStorage.getItem('nexus_overdue_days'));
  return (Number.isFinite(v) && v > 0) ? v : 10;
}
function saveOverdueDays() {
  var inp = document.getElementById('cfg-overdue-days');
  var v = parseInt(inp && inp.value) || 10;
  if (v < 1) v = 1;
  localStorage.setItem('nexus_overdue_days', v);
  var lbl = document.getElementById('cfg-overdue-days-lbl');
  if (lbl) lbl.textContent = v;
  if (typeof recalcAndRenderPlanning === 'function') recalcAndRenderPlanning();
  else if (typeof renderSprintScreen === 'function') renderSprintScreen();
}
function initOverdueDays() {
  var inp = document.getElementById('cfg-overdue-days');
  if (inp) inp.value = getOverdueDays();
  var lbl = document.getElementById('cfg-overdue-days-lbl');
  if (lbl) lbl.textContent = getOverdueDays();
}
