/* ═══ SPRINT / EN MARCHA ════════════════════════════════════
   Developer capacity management and Sprint board rendering.
   ═══════════════════════════════════════════════════════════ */

// ── Developer capacity state ─────────────────────────────────
let devTeam = [];  // [{name, corto, medio, largo}]

function loadDevTeam() {
  // Version bump: forces the corrected default team to load once,
  // overriding any stale team saved in the browser from earlier sessions.
  const TEAM_VERSION = 'v3-2026';
  try {
    const savedVer = localStorage.getItem('meso_dev_team_ver');
    const saved    = localStorage.getItem('meso_dev_team');
    if (saved && savedVer === TEAM_VERSION) {
      devTeam = JSON.parse(saved);
    } else {
      devTeam = []; // stale or missing version → rebuild from defaults below
      localStorage.setItem('meso_dev_team_ver', TEAM_VERSION);
    }
  } catch(_) {}
  if (!devTeam.length) {
    // Equipo por defecto: jornada 09-14 y 15-17 (viernes solo 09-14)
    // Marc y Julio: LARGOS toda la manana, MEDIOS toda la tarde
    const schedLM = {
      L:[{start:'09:00',end:'14:00',pool:'largo'},{start:'15:00',end:'17:00',pool:'medio'}],
      M:[{start:'09:00',end:'14:00',pool:'largo'},{start:'15:00',end:'17:00',pool:'medio'}],
      X:[{start:'09:00',end:'14:00',pool:'largo'},{start:'15:00',end:'17:00',pool:'medio'}],
      J:[{start:'09:00',end:'14:00',pool:'largo'},{start:'15:00',end:'17:00',pool:'medio'}],
      V:[{start:'09:00',end:'14:00',pool:'largo'}]
    };
    // Carlos: CORTOS siempre, MEDIANOS martes manana + miercoles manana y tarde
    const schedC = {
      L:[{start:'09:00',end:'14:00',pool:'corto'},{start:'15:00',end:'17:00',pool:'corto'}],
      M:[{start:'09:00',end:'14:00',pool:'medio'},{start:'15:00',end:'17:00',pool:'corto'}],
      X:[{start:'09:00',end:'14:00',pool:'medio'},{start:'15:00',end:'17:00',pool:'medio'}],
      J:[{start:'09:00',end:'14:00',pool:'corto'},{start:'15:00',end:'17:00',pool:'corto'}],
      V:[{start:'09:00',end:'14:00',pool:'corto'}]
    };
    devTeam = [
      { name:'Marc',   corto:0, medio:1, largo:1, schedule: JSON.parse(JSON.stringify(schedLM)) },
      { name:'Julio',  corto:0, medio:1, largo:1, schedule: JSON.parse(JSON.stringify(schedLM)) },
      { name:'Carlos', corto:2, medio:1, largo:0, schedule: JSON.parse(JSON.stringify(schedC)) },
    ];
  }
}

function saveDevTeam() {
  try {
    localStorage.setItem('meso_dev_team', JSON.stringify(devTeam));
    localStorage.setItem('meso_dev_team_ver', 'v3-2026');
  } catch(_){}
}

function renderDevRows() {
  const cont = document.getElementById('dev-rows');
  if (!cont) return;

  const COLORS = {corto:'#C07800', medio:'#1848A0', largo:'#087B50'};
  const BGS    = {corto:'#FAF5E6', medio:'#EEF3FC', largo:'#ECF8F3'};
  const LABELS = {corto:'Cortos',  medio:'Medios',  largo:'Largos'};

  cont.innerHTML = devTeam.map((dev, i) => {
    const wh = typeof pDevHours === 'function' ? pDevHours(dev) : {corto:0,medio:0,largo:0};
    const hasSchedule = dev.schedule && Object.values(dev.schedule).some(d=>d.length>0);
    const initial = (dev.name || '?').charAt(0).toUpperCase();
    // Avatar color based on index
    const avatarColors = ['#111','#1848A0','#087B50','#C07800','#CC1F26','#5C6570'];
    const avatarColor  = avatarColors[i % avatarColors.length];

    const poolCols = ['corto','medio','largo'].map(pool => `
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
        <label style="font-size:8px;font-weight:700;color:${COLORS[pool]};
          text-transform:uppercase;letter-spacing:.04em">${LABELS[pool]}</label>
        <div style="position:relative">
          <input type="number" min="0" max="10" value="${dev[pool]||0}"
            style="width:52px;text-align:center;border:2px solid ${COLORS[pool]};
                   border-radius:7px;font-size:16px;font-weight:800;color:${COLORS[pool]};
                   padding:4px 2px;background:${BGS[pool]};outline:none;
                   box-shadow:inset 0 1px 3px rgba(0,0,0,.06)"
            title="${LABELS[pool]}: nº máximo de proyectos simultáneos"
            onchange="devTeam[${i}].${pool}=parseInt(this.value)||0;saveDevTeam();updateDevCapSummary()"
            onfocus="this.style.boxShadow='0 0 0 3px ${COLORS[pool]}33'"
            onblur="this.style.boxShadow='inset 0 1px 3px rgba(0,0,0,.06)'">
        </div>
        ${hasSchedule && wh[pool]>0
          ? `<span style="font-size:7px;color:#AAA">${wh[pool].toFixed(0)}h/sem</span>`
          : `<span style="font-size:7px;color:#DDD">—h/sem</span>`}
      </div>`).join('');

    return `
      <div style="display:flex;align-items:center;gap:14px;padding:12px 14px;
        background:#fff;border-radius:10px;border:1px solid #EBEBEB;
        box-shadow:0 1px 4px rgba(0,0,0,.05);transition:box-shadow .15s"
        onmouseover="this.style.boxShadow='0 3px 12px rgba(0,0,0,.08)'"
        onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,.05)'">

        <!-- Avatar -->
        <div style="width:38px;height:38px;border-radius:50%;background:${avatarColor};
          color:#fff;font-size:15px;font-weight:800;display:flex;align-items:center;
          justify-content:center;flex-shrink:0;letter-spacing:-.01em">
          ${initial}
        </div>

        <!-- Name input -->
        <div style="flex:1;min-width:0">
          <div style="font-size:8px;font-weight:700;color:#AAA;text-transform:uppercase;
            letter-spacing:.1em;margin-bottom:3px">Nombre</div>
          <input type="text" value="${dev.name}" placeholder="Nombre del desarrollador"
            style="width:100%;border:none;border-bottom:2px solid #F0F0F0;background:transparent;
                   font-size:13px;font-weight:700;color:#111;outline:none;padding:2px 0;
                   transition:border-color .15s"
            onfocus="this.style.borderColor='#C4974A'"
            onblur="this.style.borderColor='#F0F0F0'"
            onchange="devTeam[${i}].name=this.value;saveDevTeam();updateDevCapSummary();
              // Update avatar initial
              const av=this.closest('div[style*=border-radius:10px]').querySelector('div[style*=border-radius:50%]');
              if(av)av.textContent=this.value.charAt(0).toUpperCase();
              if(typeof renderScheduleEditor==='function')renderScheduleEditor()">
        </div>

        <!-- Pool capacity inputs -->
        <div style="display:flex;gap:10px;align-items:flex-end">
          ${poolCols}
        </div>

        <!-- Delete -->
        <button onclick="removeDevRow(${i})"
          style="width:28px;height:28px;border-radius:50%;border:1.5px solid #FFDDDD;
                 background:#FFF5F5;color:#CC1F26;cursor:pointer;font-size:13px;
                 display:flex;align-items:center;justify-content:center;flex-shrink:0;
                 transition:all .15s"
          onmouseover="this.style.background='#CC1F26';this.style.color='#fff'"
          onmouseout="this.style.background='#FFF5F5';this.style.color='#CC1F26'"
          title="Eliminar desarrollador">✕</button>
      </div>`;
  }).join('');

  updateDevCapSummary();
}

function addDevRow() {
  const idx2 = devTeam.length;
  devTeam.push({
    name: `Desarrollador ${idx2 + 1}`,
    corto: 1,   // default: 1 project simultaneously
    medio: 1,
    largo: 1,
    schedule: { L:[], M:[], X:[], J:[], V:[] }
  });
  renderDevRows();
  if (typeof renderScheduleEditor === 'function') renderScheduleEditor();
  setTimeout(() => {
    const el = document.getElementById('schedule-editor');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
  saveDevTeam();
  toast(`✓ "${devTeam[idx2].name}" añadido · Ajusta el nº de proyectos simultáneos y configura el horario`);
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
  // Sum of manually-set project slots per dev per pool
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
    const s = parseInt(document.getElementById('cfg-thr-s')?.value) || 10;
    const m = parseInt(document.getElementById('cfg-thr-m')?.value) || 50;
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
  // Si venimos de un enlace compartido, mostrar la vista de solo lectura
  if (window._sprintSnapshot) { renderSprintSnapshotView(); return; }

  // Lookup de fechas de inicio esperadas desde la planificación
  var _startDates = {};
  try {
    if (typeof planBuildTimeline === 'function') {
      planBuildTimeline().forEach(function(t){
        if (t.proj && t.proj.nom) _startDates[t.proj.nom] = t.startDate;
      });
    }
  } catch(e){}

  updateDevCapSummary();
  const thrS = parseInt(document.getElementById('thr-s')?.value) || 10;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 50;
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
          <div style="display:flex;gap:4px;align-items:center">
            ${tag}
            ${_prioBadge(p.adoPriority)}
          </div>
          <span style="font-size:14px;font-weight:900;color:${scColorHex(p.sf||0)};font-family:'Playfair Display',serif">
            ${(p.sf||0).toFixed(1)}
          </span>
        </div>
        <div style="font-size:10px;font-weight:700;color:var(--ink);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px" title="${p.nom}">
          ${p.nom}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:9px;color:var(--ink3)">${p.area||'—'}</span>
          <span style="font-size:8px;padding:2px 6px;border-radius:20px;
            background:${cl.bg||'var(--surf)'};color:${cl.c||'var(--ink3)'}">${cl.et||'—'}</span>
          <span style="font-size:9px;color:var(--ink3)">${p.horas}h</span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;padding-top:4px;border-top:1px solid var(--b2)">
          <span style="font-size:8px;color:var(--ink4)">${isActive?'🟢 Inicio:':'📅 Inicio est.:'}</span>
          <span style="font-size:9px;font-weight:700;color:${isActive?'var(--d3)':'var(--ink3)'}">
            ${_startDates[p.nom] ? pFmt(_startDates[p.nom]) : '—'}
          </span>
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

  if (typeof renderPriorityAnalysis==='function') renderPriorityAnalysis();
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



/* ── applyBulkHorasEval ──────────────────────────────────────── */
function applyBulkHorasEval() {
  const val = parseInt(document.getElementById('eval-horas-masivo')?.value);
  if (!val) { toast('Selecciona un valor de horas'); return; }
  const thrS = parseInt(document.getElementById('thr-s')?.value) || 10;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 50;
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

  const thrS = parseInt(document.getElementById('thr-s')?.value) || 10;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 50;
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
          <div style="flex:1;font-size:10px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${p.nom}">${p.nom}</div>
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

  // Analytics avanzados (fila 2 + mini-charts)
  if (typeof renderDashboardAnalytics === 'function') renderDashboardAnalytics();
}

/* ── Wiki: update threshold values from config ──────────────── */
function renderWikiThresholds() {
  const thrS = document.getElementById('thr-s')?.value || 10;
  const thrM = document.getElementById('thr-m')?.value || 50;
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

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD — ANALYTICS AVANZADOS (KPIs fila 2 + mini-charts)
   Llamado desde renderDashboard vía hook
   ═══════════════════════════════════════════════════════════════ */
function renderDashboardAnalytics() {
  if (!portfolioData || !portfolioData.length) return;
  // Guard: only render charts when the dashboard step is visible (prevents Chart.js resize loop)
  const stepEl = document.getElementById('step-dashboard');
  const stepVisible = stepEl && stepEl.classList.contains('on');
  const set = (id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};

  // Horas totales cartera
  const totalH = portfolioData.reduce((s,p)=>s+(parseFloat(p.horas)||0),0);
  const withH  = portfolioData.filter(p=>p.horas!=null).length;
  set('kpi2-hours', totalH>=1000 ? (totalH/1000).toFixed(1)+'k h' : Math.round(totalH)+'h');
  set('kpi2-hours-sub', withH+'/'+portfolioData.length+' con estimación');

  // Mediana de score
  const scores = portfolioData.map(p=>p.sf||0).filter(s=>s>0).sort((a,b)=>a-b);
  const median = scores.length ? scores[Math.floor(scores.length/2)] : 0;
  set('kpi2-median', median ? median.toFixed(2) : '—');

  // % sincronizado a ADO
  const withAdo  = portfolioData.filter(p=>p.adoId).length;
  const synced   = portfolioData.filter(p=>p._adoSynced).length;
  set('kpi2-synced', withAdo ? Math.round(synced/withAdo*100)+'%' : '—');
  set('kpi2-synced-sub', synced+'/'+withAdo+' work items');

  // Aging activo (af > 1)
  const aged = portfolioData.filter(p=>(p.af||1)>1.001).length;
  set('kpi2-aging', aged);

  // Áreas distintas
  const areas = {};
  portfolioData.forEach(p=>{ if(p.area) areas[p.area]=(areas[p.area]||0)+1; });
  const areaNames = Object.keys(areas);
  set('kpi2-areas', areaNames.length);
  const topArea = areaNames.sort((a,b)=>areas[b]-areas[a])[0];
  set('kpi2-areas-sub', topArea ? 'top: '+topArea.substring(0,18) : '—');

  // Fin de cola global
  if (typeof planBuildTimeline === 'function' && typeof pShort === 'function') {
    try {
      const tl = planBuildTimeline();
      if (tl.length) {
        const maxEnd = tl.reduce((mx,t)=>+t.endDate>+mx?t.endDate:mx, new Date());
        set('kpi2-queue', pShort(maxEnd));
      } else set('kpi2-queue','—');
    } catch(e){ set('kpi2-queue','—'); }
  }

  // ── Mini-chart 1: histograma de scores ──
  if (typeof Chart !== 'undefined' && stepVisible) {
    const histEl = document.getElementById('dash-hist');
    if (histEl) {
      destroyC('dash-hist');
      const bins = [0,0,0,0,0,0,0,0,0,0]; // 0-1,1-2,...9-10
      portfolioData.forEach(p=>{
        const s = Math.min(9, Math.max(0, Math.floor(p.sf||0)));
        bins[s]++;
      });
      chartInst['dash-hist'] = new Chart(histEl, {
        type:'bar',
        data:{ labels:['0-1','1-2','2-3','3-4','4-5','5-6','6-7','7-8','8-9','9-10'],
          datasets:[{ data:bins,
            backgroundColor:bins.map((_,i)=> i>=8?'#0A5228':i>=6?'#087B50':i>=4?'#C07800':'#CC1F26'),
            borderRadius:4, barPercentage:.8 }]},
        options:{ plugins:{legend:{display:false}},
          scales:{ x:{grid:{display:false},ticks:{font:{size:8}}},
                   y:{grid:{color:'#F3F3F1'},ticks:{font:{size:8},stepSize:1}} },
          maintainAspectRatio:false, responsive:true }
      });
    }

    // ── Mini-chart 2: horas por área (top 6) ──
    const areaEl = document.getElementById('dash-area-hours');
    if (areaEl) {
      destroyC('dash-area-hours');
      const areaH = {};
      portfolioData.forEach(p=>{
        if(p.area && p.horas) areaH[p.area]=(areaH[p.area]||0)+parseFloat(p.horas);
      });
      const top = Object.entries(areaH).sort((a,b)=>b[1]-a[1]).slice(0,6);
      chartInst['dash-area-hours'] = new Chart(areaEl, {
        type:'bar',
        data:{ labels: top.map(t=>t[0].substring(0,16)),
          datasets:[{ data: top.map(t=>Math.round(t[1])),
            backgroundColor:'#C4974A', borderRadius:4, barPercentage:.7 }]},
        options:{ indexAxis:'y', plugins:{legend:{display:false}},
          scales:{ x:{grid:{color:'#F3F3F1'},ticks:{font:{size:8}}},
                   y:{grid:{display:false},ticks:{font:{size:9}}} },
          maintainAspectRatio:false, responsive:true }
      });
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   PRIORIDAD ADO — badge + análisis de discrepancias
   Microsoft.VSTS.Common.Priority (1=máxima … 4=mínima) → p.adoPriority
   ═══════════════════════════════════════════════════════════════ */
function _prioBadge(prio) {
  const p = parseInt(prio) || 3;
  const styles = {
    1: { bg:'#CC1F26', txt:'P1' },
    2: { bg:'#C07800', txt:'P2' },
    3: { bg:'#5C6570', txt:'P3' },
    4: { bg:'#AAB2C0', txt:'P4' },
  };
  const s = styles[p] || styles[3];
  return '<span style="font-size:8px;background:'+s.bg+';color:#fff;padding:2px 6px;'
    +'border-radius:20px;font-weight:700" title="Prioridad ADO '+p+'">'+s.txt+'</span>';
}

function renderPriorityAnalysis() {
  const conts = [document.getElementById('priority-analysis'),
                 document.getElementById('priority-analysis-summary')].filter(Boolean);
  if (!conts.length) return;
  if (!portfolioData || !portfolioData.length) { conts.forEach(function(c){c.innerHTML='';}); return; }

  const thrS = parseInt(document.getElementById('thr-s')?.value) || 10;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 50;
  const cap  = getDevCapacity();

  // Cuáles están "en marcha" ahora (top por score según capacidad)
  const sorted = portfolioData.filter(p=>p.horas!=null).sort((a,b)=>(b.sf||0)-(a.sf||0));
  const cortos = sorted.filter(p=>p.horas<thrS);
  const medios = sorted.filter(p=>p.horas>=thrS&&p.horas<thrM);
  const largos = sorted.filter(p=>p.horas>=thrM);
  const enMarcha = new Set([
    ...cortos.slice(0,cap.corto),
    ...medios.slice(0,cap.medio),
    ...largos.slice(0,cap.largo),
  ].map(p=>p.nom));

  // Proyectos prioridad 1 en ADO
  const p1 = portfolioData.filter(p=>parseInt(p.adoPriority)===1);

  // Discrepancias
  const p1NoMarcha = p1.filter(p=>!enMarcha.has(p.nom));         // P1 pero NO en marcha (deberían estar)
  const marchaNoP1 = portfolioData.filter(p=>enMarcha.has(p.nom) && parseInt(p.adoPriority)!==1); // en marcha pero NO P1

  const row = (p, extra) => {
    const cl = clsf(p.sf||0);
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;'
      +'padding:7px 10px;background:#fff;border:1px solid rgba(120,150,200,.14);border-radius:7px;margin-bottom:5px;'
      +'cursor:pointer" onclick="openProjectEdit(portfolioData.indexOf(portfolioData.find(x=>x.nom===\''+p.nom.replace(/'/g,"\\'")+'\')))" title="'+p.nom+'">'
      +'<div style="display:flex;align-items:center;gap:6px;min-width:0">'
        +_prioBadge(p.adoPriority)
        +'<span style="font-size:10px;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px">'+p.nom+'</span>'
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
        +'<span style="font-size:9px;color:#888">'+(p.horas||0)+'h</span>'
        +'<span style="font-size:11px;font-weight:800;color:'+scColorHex(p.sf||0)+'">'+(p.sf||0).toFixed(1)+'</span>'
        +(extra||'')
      +'</div></div>';
  };

  let html = '';

  // Resumen
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">'
    +'<div class="dash-mini"><div class="dm-lbl">Prioridad 1 en ADO</div><div class="dm-val">'+p1.length+'</div></div>'
    +'<div class="dash-mini"><div class="dm-lbl">En marcha ahora</div><div class="dm-val">'+enMarcha.size+'</div></div>'
    +'<div class="dash-mini"><div class="dm-lbl">Discrepancias</div><div class="dm-val" style="color:'+((p1NoMarcha.length||marchaNoP1.length)?'#CC1F26':'#087B50')+'">'+(p1NoMarcha.length+marchaNoP1.length)+'</div></div>'
    +'</div>';

  // P1 que deberían estar en marcha pero no lo están
  html += '<div style="margin-bottom:16px">'
    +'<div style="font-size:12px;font-weight:700;color:#CC1F26;margin-bottom:8px">⚠ Prioridad 1 en ADO que NO están en marcha ('+p1NoMarcha.length+')</div>';
  if (p1NoMarcha.length) {
    html += '<div style="font-size:10px;color:#888;margin-bottom:8px">Estos proyectos están marcados como máxima prioridad en ADO pero no están entre los activos. Deberían entrar en marcha.</div>';
    html += p1NoMarcha.map(p=>row(p,'<span style="font-size:8px;background:#CC1F26;color:#fff;padding:2px 6px;border-radius:20px;font-weight:700">DEBERÍA ENTRAR</span>')).join('');
  } else {
    html += '<div style="font-size:11px;color:#087B50;padding:8px 0">✓ Todos los proyectos prioridad 1 están en marcha.</div>';
  }
  html += '</div>';

  // En marcha que NO son P1
  html += '<div>'
    +'<div style="font-size:12px;font-weight:700;color:#C07800;margin-bottom:8px">⚑ En marcha pero NO son Prioridad 1 ('+marchaNoP1.length+')</div>';
  if (marchaNoP1.length) {
    html += '<div style="font-size:10px;color:#888;margin-bottom:8px">Estos proyectos están activos pero en ADO no tienen prioridad máxima. Revisa si deberían ceder el puesto.</div>';
    html += marchaNoP1.map(p=>row(p,'<span style="font-size:8px;background:#C07800;color:#fff;padding:2px 6px;border-radius:20px;font-weight:700">REVISAR</span>')).join('');
  } else {
    html += '<div style="font-size:11px;color:#087B50;padding:8px 0">✓ Todos los proyectos en marcha son prioridad 1.</div>';
  }
  html += '</div>';

  conts.forEach(function(c){ c.innerHTML = html; });
}

/* ═══════════════════════════════════════════════════════════════
   SNAPSHOT COMPARTIBLE DE "EN MARCHA"
   Genera un enlace con el estado actual codificado (sin servidor).
   Al abrirlo, los directores ven exactamente esa foto, desde cualquier PC.
   ═══════════════════════════════════════════════════════════════ */
function _buildSprintSnapshot() {
  // Captura mínima necesaria para reconstruir la vista En Marcha
  const cap = getDevCapacity();
  const thr = getThr();
  const startDates = {};
  try {
    if (typeof planBuildTimeline === 'function') {
      planBuildTimeline().forEach(function(t){ if(t.proj&&t.proj.nom) startDates[t.proj.nom]=+t.startDate; });
    }
  } catch(e){}
  const projects = portfolioData.filter(p=>p.horas!=null).map(function(p){
    return { nom:p.nom, sf:+(p.sf||0).toFixed(2), horas:p.horas, area:p.area||'',
      adoPriority:p.adoPriority||3, start:startDates[p.nom]||null };
  });
  return {
    v: 1,
    ts: Date.now(),
    title: 'En Marcha — mesoestetic',
    cap: cap, thr: { s:thr.s, m:thr.m },
    projects: projects,
  };
}

function shareSprintSnapshot() {
  if (!portfolioData || !portfolioData.length) { toast('No hay proyectos para compartir'); return; }
  try {
    const snap = _buildSprintSnapshot();
    const json = JSON.stringify(snap);
    // Comprime con encodeURIComponent + base64 (unicode-safe)
    const b64 = btoa(unescape(encodeURIComponent(json)));
    const url = location.origin + location.pathname + '#marcha=' + b64;
    // Copia al portapapeles
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function(){
        toast('🔗 Enlace copiado · compártelo con los directores ('+snap.projects.length+' proyectos)');
      }, function(){ _showSnapshotLink(url); });
    } else {
      _showSnapshotLink(url);
    }
  } catch(e) { console.error('snapshot', e); toast('✗ No se pudo generar el enlace: '+e.message); }
}

function _showSnapshotLink(url) {
  // Fallback: muestra el enlace en un prompt para copiar manualmente
  const ov = document.getElementById('snapshot-link-overlay');
  const inp = document.getElementById('snapshot-link-input');
  if (ov && inp) { inp.value = url; ov.style.display='flex'; inp.select(); }
  else { window.prompt('Copia este enlace para compartir:', url); }
}

// Lee el snapshot del hash de la URL (si existe) al cargar la página
function loadSprintSnapshotFromURL() {
  const h = location.hash || '';
  const m = h.match(/[#&]marcha=([^&]+)/);
  if (!m) return false;
  try {
    const json = decodeURIComponent(escape(atob(m[1])));
    const snap = JSON.parse(json);
    if (!snap || !snap.projects) return false;
    window._sprintSnapshot = snap;   // marca modo "vista compartida"
    return true;
  } catch(e) { console.error('snapshot load', e); return false; }
}

// Renderiza la vista de solo lectura del snapshot (para directores)
function renderSprintSnapshotView() {
  const snap = window._sprintSnapshot;
  if (!snap) return;
  const cont = document.getElementById('sprint-tab');
  if (!cont) return;

  const thrS = snap.thr.s, thrM = snap.thr.m, cap = snap.cap;
  const sorted = snap.projects.slice().sort((a,b)=>b.sf-a.sf);
  const cortos = sorted.filter(p=>p.horas<thrS);
  const medios = sorted.filter(p=>p.horas>=thrS&&p.horas<thrM);
  const largos = sorted.filter(p=>p.horas>=thrM);
  const enMarcha = new Set([
    ...cortos.slice(0,cap.corto), ...medios.slice(0,cap.medio), ...largos.slice(0,cap.largo),
  ].map(p=>p.nom));

  const pf = (ms)=>{ if(!ms) return '—'; const d=new Date(ms); return d.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}); };
  const card = (p, active)=>{
    const cl = clsf(p.sf);
    return '<div style="padding:10px 12px;background:#fff;border-radius:8px;border:'
      +(active?'2px solid var(--d3)':'1px dashed var(--b2)')+';margin-bottom:6px;opacity:'+(active?'1':'0.65')+'" title="'+p.nom+'">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">'
        +'<div style="display:flex;gap:4px;align-items:center">'
          +'<span style="font-size:8px;background:'+(active?'var(--d3)':'var(--surf)')+';color:'+(active?'#fff':'var(--ink4)')+';padding:2px 6px;border-radius:20px;font-weight:700">'+(active?'EN MARCHA':'PRÓXIMO')+'</span>'
          +_prioBadge(p.adoPriority)
        +'</div>'
        +'<span style="font-size:14px;font-weight:900;color:'+scColorHex(p.sf)+';font-family:\'Playfair Display\',serif">'+p.sf.toFixed(1)+'</span>'
      +'</div>'
      +'<div style="font-size:10px;font-weight:700;color:var(--ink);margin-bottom:3px" title="'+p.nom+'">'+p.nom+'</div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
        +'<span style="font-size:9px;color:var(--ink3)">'+(p.area||'—')+'</span>'
        +'<span style="font-size:9px;color:var(--ink3)">'+p.horas+'h</span>'
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:5px;padding-top:4px;border-top:1px solid var(--b2)">'
        +'<span style="font-size:8px;color:var(--ink4)">'+(active?'🟢 Inicio:':'📅 Inicio est.:')+'</span>'
        +'<span style="font-size:9px;font-weight:700;color:'+(active?'var(--d3)':'var(--ink3)')+'">'+pf(p.start)+'</span>'
      +'</div></div>';
  };

  const col = (title, arr, color)=>{
    const active = arr.filter(p=>enMarcha.has(p.nom));
    const next = arr.filter(p=>!enMarcha.has(p.nom));
    return '<div style="flex:1;min-width:0">'
      +'<div style="font-size:11px;font-weight:800;color:'+color+';margin-bottom:8px;text-transform:uppercase">'+title+' ('+active.length+')</div>'
      +active.map(p=>card(p,true)).join('')
      +(next.length?'<div style="font-size:9px;color:var(--ink4);margin:8px 0 6px;text-transform:uppercase">En cola</div>':'')
      +next.slice(0,5).map(p=>card(p,false)).join('')
      +'</div>';
  };

  const fecha = new Date(snap.ts).toLocaleString('es-ES',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  cont.innerHTML =
    '<div style="background:linear-gradient(135deg,#16243E,#1C2B4A);color:#fff;padding:16px 20px;border-radius:10px;margin-bottom:16px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
        +'<div><div style="font-size:18px;font-weight:800">🚀 Proyectos en marcha</div>'
        +'<div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:2px">Vista compartida · snapshot del '+fecha+'</div></div>'
        +'<div style="font-size:11px;background:rgba(196,151,74,.2);color:#E8B96A;padding:6px 12px;border-radius:20px;font-weight:700">SOLO LECTURA</div>'
      +'</div></div>'
    +'<div style="display:flex;gap:14px;align-items:flex-start">'
      +col('⚡ Cortos', cortos, '#C07800')
      +col('◉ Medios', medios, '#1848A0')
      +col('▣ Largos', largos, '#087B50')
    +'</div>';

  // Análisis de prioridad sobre el snapshot
  const p1 = snap.projects.filter(p=>parseInt(p.adoPriority)===1);
  const p1NoMarcha = p1.filter(p=>!enMarcha.has(p.nom));
  const marchaNoP1 = snap.projects.filter(p=>enMarcha.has(p.nom)&&parseInt(p.adoPriority)!==1);
  const pa = document.getElementById('priority-analysis');
  if (pa) {
    const rowP=(p,tag,tagColor)=>'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;background:#fff;border:1px solid rgba(120,150,200,.14);border-radius:7px;margin-bottom:5px" title="'+p.nom+'"><div style="display:flex;align-items:center;gap:6px;min-width:0">'+_prioBadge(p.adoPriority)+'<span style="font-size:10px;color:#333">'+p.nom+'</span></div><span style="font-size:8px;background:'+tagColor+';color:#fff;padding:2px 6px;border-radius:20px;font-weight:700">'+tag+'</span></div>';
    pa.innerHTML = '<div style="font-size:12px;font-weight:700;color:#CC1F26;margin-bottom:8px">⚠ Prioridad 1 que NO están en marcha ('+p1NoMarcha.length+')</div>'
      +(p1NoMarcha.length?p1NoMarcha.map(p=>rowP(p,'DEBERÍA ENTRAR','#CC1F26')).join(''):'<div style="font-size:11px;color:#087B50;padding:6px 0">✓ Todos los P1 están en marcha.</div>')
      +'<div style="font-size:12px;font-weight:700;color:#C07800;margin:14px 0 8px">⚑ En marcha pero NO son P1 ('+marchaNoP1.length+')</div>'
      +(marchaNoP1.length?marchaNoP1.map(p=>rowP(p,'REVISAR','#C07800')).join(''):'<div style="font-size:11px;color:#087B50;padding:6px 0">✓ Todos los activos son P1.</div>');
  }
}
