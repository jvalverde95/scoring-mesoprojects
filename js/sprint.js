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
      <!-- Name -->
      <input type="text" value="${dev.name}" placeholder="Nombre desarrollador"
        style="border:none;background:transparent;font-size:11px;font-weight:600;color:var(--ink);outline:none;min-width:0"
        onchange="devTeam[${i}].name=this.value;saveDevTeam();updateDevCapSummary();if(typeof renderScheduleEditor==='function')renderScheduleEditor()">
      <!-- Hours: computed from schedule if available, else legacy fields -->
      <div style="text-align:center">
        <div style="font-size:8px;color:var(--d3);font-weight:700;margin-bottom:2px">CORTO</div>
        <div id="dev-h-corto-${i}" style="font-size:11px;font-weight:700;color:var(--d3);padding:3px;border:1px solid var(--d3);border-radius:4px;min-height:24px;display:flex;align-items:center;justify-content:center">
          ${typeof pDevHours==='function'?pDevHours(dev).corto.toFixed(0)+'h':(dev.corto||0)}</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:8px;color:var(--d4);font-weight:700;margin-bottom:2px">MEDIO</div>
        <div id="dev-h-medio-${i}" style="font-size:11px;font-weight:700;color:var(--d4);padding:3px;border:1px solid var(--d4);border-radius:4px;min-height:24px;display:flex;align-items:center;justify-content:center">
          ${typeof pDevHours==='function'?pDevHours(dev).medio.toFixed(0)+'h':(dev.medio||0)}</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:8px;color:var(--d1);font-weight:700;margin-bottom:2px">LARGO</div>
        <div id="dev-h-largo-${i}" style="font-size:11px;font-weight:700;color:var(--d1);padding:3px;border:1px solid var(--d1);border-radius:4px;min-height:24px;display:flex;align-items:center;justify-content:center">
          ${typeof pDevHours==='function'?pDevHours(dev).largo.toFixed(0)+'h':(dev.largo||0)}</div>
      </div>
      <button onclick="removeDevRow(${i})"
        style="background:none;border:none;color:var(--d1);cursor:pointer;font-size:14px;padding:0">✕</button>
    </div>
  `).join('');
  updateDevCapSummary();
}

function addDevRow() {
  const idx = devTeam.length;
  devTeam.push({
    name: `Desarrollador ${idx + 1}`,
    corto: 0, medio: 0, largo: 0,
    schedule: { L:[], M:[], X:[], J:[], V:[] }
  });
  renderDevRows();
  if (typeof renderScheduleEditor === 'function') renderScheduleEditor();
  // Scroll to schedule editor so user sees it
  setTimeout(() => {
    const el = document.getElementById('schedule-editor');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
  toast(`✓ "${devTeam[idx].name}" añadido · Configura su horario abajo`);
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
  // Returns number of developers with capacity in each pool
  // (= max simultaneous projects per pool)
  return devTeam.reduce((acc, d) => {
    const wh = typeof pDevHours === 'function'
      ? pDevHours(d)
      : { corto: d.corto||0, medio: d.medio||0, largo: d.largo||0 };
    return {
      corto: acc.corto + (wh.corto > 0 ? 1 : 0),
      medio: acc.medio + (wh.medio > 0 ? 1 : 0),
      largo: acc.largo + (wh.largo > 0 ? 1 : 0),
    };
  }, { corto: 0, medio: 0, largo: 0 });
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
    // Sync to pools panel inputs (one-way, no callbacks triggered)
    const setVal = (id, v) => { const e = document.getElementById(id); if (e && e.value != v) e.value = v; };
    setVal('thr-s', s);
    setVal('thr-m', m);
    // Update labels
    const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setTxt('cfg-thr-largo-lbl', m);
    setTxt('thr-s-lbl', s);
    setTxt('thr-m-lbl', m);
    // Re-render pools without triggering oninput
    if (typeof renderPoolsStep === 'function') renderPoolsStep();
    if (typeof renderPools === 'function') renderPools();
  } finally {
    _syncingThr = false;
  }
}

/* ── Sprint screen rendering ─────────────────────────────────── */
function renderSprintScreen() {
  updateDevCapSummary();
  const thrS = parseInt(document.getElementById('thr-s')?.value) || 30;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 100;
  const cap  = getDevCapacity();

  // All projects with hours, sorted by score desc
  const sorted = portfolioData
    .filter(p => p.horas !== null && p.horas !== undefined)
    .sort((a, b) => (b.sf || 0) - (a.sf || 0));

  const allCortos = sorted.filter(p => p.horas < thrS);
  const allMedios = sorted.filter(p => p.horas >= thrS && p.horas < thrM);
  const allLargos = sorted.filter(p => p.horas >= thrM);

  // "En marcha" = top N by score according to team capacity
  const inMarcha = {
    corto: allCortos.slice(0, cap.corto),
    medio: allMedios.slice(0, cap.medio),
    largo: allLargos.slice(0, cap.largo),
  };
  // "Próximos" = next in queue after capacity
  const proximos = {
    corto: allCortos.slice(cap.corto, cap.corto + 3),
    medio: allMedios.slice(cap.medio, cap.medio + 3),
    largo: allLargos.slice(cap.largo, cap.largo + 3),
  };

  const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setTxt('sprint-corto-count', `${inMarcha.corto.length}/${cap.corto}`);
  setTxt('sprint-medio-count', `${inMarcha.medio.length}/${cap.medio}`);
  setTxt('sprint-largo-count', `${inMarcha.largo.length}/${cap.largo}`);

  const renderCard = (p, isActive) => {
    const cl = clsf(p.sf || 0);
    const border = isActive ? '2px solid var(--d3)' : '1px dashed var(--b2)';
    const opacity = isActive ? '1' : '0.65';
    const tag = isActive
      ? '<span style="font-size:8px;background:var(--d3);color:#fff;padding:2px 6px;border-radius:20px;font-weight:700">EN MARCHA</span>'
      : '<span style="font-size:8px;background:var(--surf);color:var(--ink4);padding:2px 6px;border-radius:20px">PRÓXIMO</span>';
    return `
      <div style="padding:10px 12px;background:#fff;border-radius:8px;border:${border};
        cursor:pointer;opacity:${opacity};margin-bottom:6px"
        onclick="openProjectEdit(portfolioData.indexOf(portfolioData.find(x=>x.nom==='${p.nom.replace(/'/g,"\'")}')))"
        title="${p.nom}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
          ${tag}
          <span style="font-size:14px;font-weight:900;color:${scColorHex(p.sf||0)};font-family:'Playfair Display',serif">
            ${(p.sf||0).toFixed(1)}
          </span>
        </div>
        <div style="font-size:10px;font-weight:700;color:var(--ink);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px">
          ${p.nom}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:9px;color:var(--ink3)">${p.area||'—'}</span>
          <span style="font-size:8px;padding:2px 6px;border-radius:20px;
            background:${cl.bg||'var(--surf)'};color:${cl.c||'var(--ink3)'}">${cl.et||'—'}</span>
          <span style="font-size:9px;color:var(--ink3)">${p.horas}h</span>
        </div>
      </div>`;
  };

  const renderCol = (active, next, capN) => {
    if (!active.length && !next.length) {
      return '<div style="font-size:10px;color:var(--ink4);text-align:center;padding:20px 0">Sin proyectos</div>';
    }
    const slots = Array(Math.max(capN, active.length)).fill(null).map((_, i) => {
      if (i < active.length) return renderCard(active[i], true);
      return `<div style="padding:10px 12px;border:1px dashed var(--b2);border-radius:8px;
        text-align:center;font-size:9px;color:var(--ink4);opacity:0.4">Hueco libre</div>`;
    });
    const nextCards = next.map(p => renderCard(p, false));
    const sep = nextCards.length
      ? '<div style="font-size:8px;color:var(--ink4);text-align:center;margin:8px 0;letter-spacing:.1em;text-transform:uppercase">· próximos ·</div>'
      : '';
    return slots.join('') + sep + nextCards.join('');
  };

  const setHTML = (id, v) => { const e = document.getElementById(id); if (e) e.innerHTML = v; };
  setHTML('sprint-col-corto', renderCol(inMarcha.corto, proximos.corto, cap.corto));
  setHTML('sprint-col-medio', renderCol(inMarcha.medio, proximos.medio, cap.medio));
  setHTML('sprint-col-largo', renderCol(inMarcha.largo, proximos.largo, cap.largo));
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

/* ═══ DASHBOARD ════════════════════════════════════════════
   KPI rendering for the main dashboard screen.
   ═══════════════════════════════════════════════════════════ */
function renderDashboard() {
  if (!portfolioData) return;

  const thrS = parseInt(document.getElementById('thr-s')?.value) || 30;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 100;
  const total       = portfolioData.length;
  const scored      = portfolioData.filter(p => (p.sf||0) > 0).length;
  const estimated   = portfolioData.filter(p => p.horas != null).length;
  const unestimated = total - estimated;
  const priority    = portfolioData.filter(p => {
    const cl = clsf(p.sf||0);
    return cl.et==='PRIORITARIO ESTRATÉGICO'||cl.et==='PRIORITARIO ESTRATÉGICO (D1)'||p.autoP;
  }).length;
  const avgScore = total > 0
    ? (portfolioData.reduce((s,p)=>s+(p.sf||0),0)/total).toFixed(1) : '—';
  const thrSn = thrS, thrMn = thrM;
  const allCortos = portfolioData.filter(p=>p.horas!=null&&p.horas<thrSn).sort((a,b)=>(b.sf||0)-(a.sf||0));
  const allMedios = portfolioData.filter(p=>p.horas!=null&&p.horas>=thrSn&&p.horas<thrMn).sort((a,b)=>(b.sf||0)-(a.sf||0));
  const allLargos = portfolioData.filter(p=>p.horas!=null&&p.horas>=thrMn).sort((a,b)=>(b.sf||0)-(a.sf||0));
  const cap       = getDevCapacity();
  const inMarcha  = allCortos.slice(0,cap.corto).length + allMedios.slice(0,cap.medio).length + allLargos.slice(0,cap.largo).length;
  const capTotal  = cap.corto + cap.medio + cap.largo;
  const nNone=unestimated, nS=allCortos.length, nM=allMedios.length, nL=allLargos.length;
  const maxPool=Math.max(nNone,nS,nM,nL,1);
  const totalHours=portfolioData.filter(p=>p.horas!=null).reduce((s,p)=>s+(p.horas||0),0);
  const hCorto=allCortos.reduce((s,p)=>s+(p.horas||0),0);
  const hMedio=allMedios.reduce((s,p)=>s+(p.horas||0),0);
  const hLargo=allLargos.reduce((s,p)=>s+(p.horas||0),0);

  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  const setW=(id,pct)=>{const e=document.getElementById(id);if(e)e.style.width=Math.min(120,Math.round(pct))+'px';};

  set('kpi-total', total);
  set('kpi-scored', scored);
  const pct = total > 0 ? Math.round(scored/total*100)+'%' : '0%';
  set('kpi-scored-pct', pct);
  set('kpi-unestimated', unestimated);
  set('kpi-priority', priority);
  set('kpi-avg-score', avgScore);
  set('kpi-sprint', inMarcha);
  set('kpi-sprint-cap', 'cap: '+capTotal);
  set('kpi-total-hours', totalHours > 0 ? totalHours.toLocaleString('es-ES') + 'h' : '—');
  set('dash-h-corto', hCorto+'h cortos');
  set('dash-h-medio', hMedio+'h medios');
  set('dash-h-largo', hLargo+'h largos');

  // Score ring
  const ring = document.getElementById('kpi-score-ring');
  if (ring && avgScore !== '—') {
    const pctRing = parseFloat(avgScore)/10;
    const circ = 2*Math.PI*14;
    ring.setAttribute('stroke-dasharray', (circ*pctRing).toFixed(1)+' '+circ.toFixed(1));
    ring.setAttribute('stroke', parseFloat(avgScore)>=7?'var(--d3)':parseFloat(avgScore)>=5?'#C07800':'var(--d1)');
  }

  set('pool-n-none', nNone); setW('pool-bar-none', nNone/maxPool*120);
  set('pool-n-s',    nS);    setW('pool-bar-s',    nS/maxPool*120);
  set('pool-n-m',    nM);    setW('pool-bar-m',    nM/maxPool*120);
  set('pool-n-l',    nL);    setW('pool-bar-l',    nL/maxPool*120);

  // Top 5
  const top5El = document.getElementById('dash-top5');
  if (top5El) {
    if (!total) {
      top5El.innerHTML='<div style="font-size:10px;color:var(--ink4);text-align:center;padding:20px 0">Sin proyectos</div>';
    } else {
      const top5=[...portfolioData].sort((a,b)=>(b.sf||0)-(a.sf||0)).slice(0,5);
      top5El.innerHTML=top5.map((p,i)=>{
        const c=(p.sf||0)>=8?'#087B50':(p.sf||0)>=6.5?'#C07800':'#CC1F26';
        return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--b);cursor:pointer" onclick="goStep('summary')">
          <div style="font-size:11px;font-weight:700;color:var(--ink4);width:16px;flex-shrink:0">${i+1}</div>
          <div style="flex:1;font-size:10px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nom}</div>
          <div style="font-size:13px;font-weight:900;color:${c};font-family:'Playfair Display',serif">${(p.sf||0).toFixed(1)}</div>
        </div>`;
      }).join('');
    }
  }

  // Classification breakdown
  const clsEl = document.getElementById('dash-cls-breakdown');
  if (clsEl && total) {
    const clsMap={};
    portfolioData.forEach(p=>{const k=p.autoP?'AUTO-PRIO':clsf(p.sf||0).et;clsMap[k]=(clsMap[k]||0)+1;});
    const maxN=Math.max(...Object.values(clsMap),1);
    const CLS_CLR={'PRIORITARIO ESTRATÉGICO':'#087B50','PRIORITARIO ESTRATÉGICO (D1)':'#CC1F26','AUTO-PRIO':'#CC1F26','ALTA PRIORIDAD':'#1848A0','PRIORIDAD MEDIA':'#C07800','BAJA PRIORIDAD':'#5C6570','DESCARTAR / REPLANTEAR':'#B4B2A9'};
    clsEl.innerHTML=Object.entries(clsMap).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`
      <div style="display:flex;align-items:center;gap:6px">
        <div style="font-size:9px;color:${CLS_CLR[k]||'#888'};flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${k}</div>
        <div style="height:4px;border-radius:2px;background:${CLS_CLR[k]||'#888'};opacity:.8;width:${Math.round(n/maxN*50)}px"></div>
        <div style="font-size:10px;font-weight:700;color:var(--ink);min-width:16px;text-align:right">${n}</div>
      </div>`).join('');
  }

  // System status
  const adoOk = typeof _adoConnected!=='undefined' && _adoConnected;
  const dvOk  = typeof _dvCfg!=='undefined' && _dvCfg.url;
  const teamN = typeof devTeam!=='undefined' ? devTeam.length : 0;
  const setBadge=(id,ok,text)=>{
    const e=document.getElementById(id); if(!e) return;
    e.textContent=text;
    e.style.background=ok?'var(--d3t)':'var(--surf)';
    e.style.color=ok?'var(--d3)':'var(--ink4)';
    e.style.borderColor=ok?'rgba(8,123,80,.2)':'var(--b)';
  };
  setBadge('dash-ado-status', adoOk, adoOk?'✓ conectado':'sin conectar');
  setBadge('dash-dv-status',  !!dvOk, dvOk?'✓ conectado':'sin conectar');
  setBadge('dash-team-status', teamN>0, teamN>0?teamN+' miembro'+(teamN>1?'s':''):'no config.');

  // Last sync
  set('dash-last-sync', total>0?'Portfolio · actualizado '+new Date().toLocaleTimeString('es-ES'):'Portfolio · sin datos');

  // Alerts
  const alerts=[];
  if (unestimated>0) alerts.push(`${unestimated} proyecto${unestimated>1?'s':''} sin horas estimadas — asígnalas en la pantalla Pools`);
  if (!adoOk && !dvOk) alerts.push('Azure DevOps y Dataverse no conectados — configura las credenciales en ⚙ Config');
  if (scored<total*0.5 && total>5) alerts.push(`Solo el ${Math.round(scored/total*100)}% de los proyectos está puntuado — usa Evaluar para puntuar el resto`);
  const alertsEl=document.getElementById('dash-alerts');
  const alertsList=document.getElementById('dash-alerts-list');
  if (alertsEl && alertsList) {
    if (alerts.length) {
      alertsEl.style.display='block';
      alertsList.innerHTML=alerts.map(a=>`<div style="font-size:10px;color:#C07800;display:flex;align-items:flex-start;gap:6px"><span style="flex-shrink:0">·</span>${a}</div>`).join('');
    } else {
      alertsEl.style.display='none';
    }
  }
}

/* ── Wiki: update threshold values from config ──────────────── */
function renderWikiThresholds() {
  const thrS = document.getElementById('thr-s')?.value || 30;
  const thrM = document.getElementById('thr-m')?.value || 100;
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('wiki-thr-s', thrS); s('wiki-thr-s2b', thrS); s('wiki-thr-m', thrM); s('wiki-thr-m2', thrM);
  // scoreThr values
  if (typeof scoreThr !== 'undefined') {
    s('wiki-thr-s1', scoreThr.s1);
    s('wiki-thr-s2', scoreThr.s2);
    s('wiki-thr-s3', scoreThr.s3);
    s('wiki-thr-s4', scoreThr.s4);
  }
}
