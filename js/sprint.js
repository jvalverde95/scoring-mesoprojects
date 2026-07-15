/* ═══ SPRINT / EN MARCHA ════════════════════════════════════
   Developer capacity management and Sprint board rendering.
   ═══════════════════════════════════════════════════════════ */

// ── Developer capacity state ─────────────────────────────────
let devTeam = [];  // [{name, corto, medio, largo}]

// ¿El proyecto está cerrado en ADO? (el estado lo manda ADO — los cerrados no van a pools ni planificación)
function isProjClosed(p) {
  const st = String(p && p.adoState || '').toLowerCase().trim();
  return st==='closed' || st==='done' || st==='removed' || st==='completed' || st==='cerrado';
}


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
  // Tooltip enriquecido para las tarjetas (descripción, notas por dimensión, fechas, horas)
  var _DNAMES = ['D1 Compliance','D2 Estrategia','D3 ROI','D4 Técnica','D5 Implant.','D6 Personas'];
  var _liveTip = function(p, active){
    var pf=function(d){ if(!d)return '—'; var x=new Date(d); return x.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}); };
    var t = p.nom + '\n────────────────\n';
    t += 'Score: ' + (p.sf||0).toFixed(1) + '  ·  ' + ((clsf(p.sf||0).et)||'') + '\n';
    t += 'Área: ' + (p.area||'—') + '  ·  Prioridad ADO: P' + (p.adoPriority||3) + '\n';
    t += 'Horas: ' + (p.horas||0) + 'h\n';
    t += 'Inicio: ' + pf(_startDates[p.nom]) + (p.reqDate ? '  ·  Solicitado: ' + pf(p.reqDate) : '') + '\n';
    if (p.dimScores && p.dimScores.length) {
      t += '────────────────\n';
      t += p.dimScores.map(function(d,i){ return _DNAMES[i] + ': ' + (+d).toFixed(1); }).join('\n') + '\n';
    }
    var desc = (p.descripcion||p.adoDesc||'').toString().replace(/\s+/g,' ').trim();
    if (desc) t += '────────────────\n' + desc.substring(0,400);
    return t.replace(/"/g,'&quot;');
  };
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

  // ═══ 1) LISTA COMPLETA (sin filtros): determina orden y estado ABSOLUTOS ═══
  const fullSorted = portfolioData
    .filter(p => p.horas !== null && p.horas !== undefined && !isProjClosed(p))
    .sort((a, b) => (b.sf || 0) - (a.sf || 0));
  const fCortos = fullSorted.filter(p => p.horas < thrS);
  const fMedios = fullSorted.filter(p => p.horas >= thrS && p.horas < thrM);
  const fLargos = fullSorted.filter(p => p.horas >= thrM);

  // Mapas absolutos: orden dentro del pool y estado en-marcha (independientes del filtro)
  const ordMap = {}, activeMap = {};
  [[fCortos, cap.corto], [fMedios, cap.medio], [fLargos, cap.largo]].forEach(function(t){
    const arr = t[0], capN = t[1];
    arr.forEach(function(p, i){ ordMap[p.nom] = i + 1; activeMap[p.nom] = i < capN; });
  });

  // ═══ 2) FILTROS: solo ocultan tarjetas; orden y estado NO cambian ═══
  const areaSel = document.getElementById('sprint-filter-area');
  if (areaSel) {
    const areas = [...new Set(portfolioData.map(p => p.area).filter(Boolean))].sort();
    const cur = areaSel.value;
    if (areaSel.options.length !== areas.length + 1) {
      areaSel.innerHTML = '<option value="">Todas las áreas</option>'
        + areas.map(a => '<option value="' + a.replace(/"/g,'&quot;') + '">' + a + '</option>').join('');
      areaSel.value = cur;
    }
  }
  const topSel = document.getElementById('sprint-filter-top');
  const fArea = areaSel ? areaSel.value : '';
  const fTop  = (topSel && topSel.value) ? parseInt(topSel.value) : 0;
  const topSet = fTop ? new Set(fullSorted.slice(0, fTop).map(p => p.nom)) : null;
  const passes = p => (!fArea || p.area === fArea) && (!topSet || topSet.has(p.nom));

  const allCortos = fCortos.filter(passes);
  const allMedios = fMedios.filter(passes);
  const allLargos = fLargos.filter(passes);

  // Info del filtro: total visible y desglose por pool
  const infoEl = document.getElementById('sprint-filter-info');
  if (infoEl) {
    if (fArea || fTop) {
      const tot = allCortos.length + allMedios.length + allLargos.length;
      infoEl.textContent = tot + ' proyectos · ' + allCortos.length + ' cortos · '
        + allMedios.length + ' medios · ' + allLargos.length + ' largos';
    } else {
      infoEl.textContent = '';
    }
  }

  // ═══ 3) Estado en-marcha/próximo según el mapa ABSOLUTO (no según el filtro) ═══
  const inMarcha = {
    corto: allCortos.filter(p => activeMap[p.nom]),
    medio: allMedios.filter(p => activeMap[p.nom]),
    largo: allLargos.filter(p => activeMap[p.nom]),
  };
  const proximos = {
    corto: allCortos.filter(p => !activeMap[p.nom]),
    medio: allMedios.filter(p => !activeMap[p.nom]),
    largo: allLargos.filter(p => !activeMap[p.nom]),
  };

  const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setTxt('sprint-corto-count', `${inMarcha.corto.length}/${cap.corto}`);
  setTxt('sprint-medio-count', `${inMarcha.medio.length}/${cap.medio}`);
  setTxt('sprint-largo-count', `${inMarcha.largo.length}/${cap.largo}`);

  const renderCard = (p, isActive, ordNum) => {
    const cl = clsf(p.sf || 0);
    const _isP1 = parseInt(p.adoPriority) === 1;   // Prioridad 1 de ADO → marcado en rojo
    const border = _isP1 ? '2px solid #CC1F26' : (isActive ? '2px solid var(--d3)' : '1px dashed var(--b2)');
    const opacity = isActive ? '1' : '0.65';
    const _enCurso = !!(p.adoStartDate && String(p.adoStartDate).trim() !== '');
    const tag = _enCurso
      ? '<span style="font-size:8px;background:#087B50;color:#fff;padding:2px 6px;border-radius:20px;font-weight:700">🟢 EN CURSO</span>'
      : (isActive
        ? '<span style="font-size:8px;background:var(--d3);color:#fff;padding:2px 6px;border-radius:20px;font-weight:700">EN MARCHA</span>'
        : '<span style="font-size:8px;background:var(--surf);color:var(--ink4);padding:2px 6px;border-radius:20px">PRÓXIMO</span>');
    return `
      <div style="padding:10px 12px;background:${_isP1?'#FFF7F6':'#fff'};border-radius:8px;border:${border};
        cursor:pointer;opacity:${opacity};margin-bottom:6px"
        title="${_liveTip(p, isActive)}"
        onclick="openProjectEdit(portfolioData.indexOf(portfolioData.find(x=>x.nom==='${p.nom.replace(/'/g,"\'")}')))">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
          <div style="display:flex;gap:4px;align-items:center">
            ${tag}
          </div>
          <div style="text-align:right">
            <div style="font-size:14px;font-weight:900;color:${scColorHex(p.sf||0)};font-family:'Playfair Display',serif;line-height:1">
              ${(p.sf||0).toFixed(1)}
            </div>
            ${ordNum ? `<div style="font-size:8px;color:var(--ink4);font-weight:700;margin-top:2px">orden ${ordNum}</div>` : ''}
          </div>
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
          <span style="font-size:8px;color:var(--ink4)">${(p.adoStartDate && String(p.adoStartDate).trim()!=='') ? '🟢 En curso desde:' : (isActive?'🟢 Inicio:':'📅 Inicio est.:')}</span>
          <span style="font-size:9px;font-weight:700;color:${(p.adoStartDate && String(p.adoStartDate).trim()!=='') ? 'var(--d3)' : (isActive?'var(--d3)':'var(--ink3)')}">
            ${(p.adoStartDate && String(p.adoStartDate).trim()!=='') ? pFmt(new Date(p.adoStartDate)) : (_startDates[p.nom] ? pFmt(_startDates[p.nom]) : '—')}
          </span>
        </div>
      </div>`;
  };

  const renderCol = (active, next, capN) => {
    if (!active.length && !next.length) {
      return '<div style="font-size:10px;color:var(--ink4);text-align:center;padding:20px 0">Sin proyectos</div>';
    }
    const slots = Array(Math.max(capN, active.length)).fill(null).map((_, i) => {
      if (i < active.length) return renderCard(active[i], true, ordMap[active[i].nom]);
      return `<div style="padding:10px 12px;border:1px dashed var(--b2);border-radius:8px;
        text-align:center;font-size:9px;color:var(--ink4);opacity:0.4">Hueco libre</div>`;
    });
    const nextCards = next.map(p => renderCard(p, false, ordMap[p.nom]));
    const sep = nextCards.length
      ? '<div style="font-size:8px;color:var(--ink4);text-align:center;margin:8px 0;letter-spacing:.1em;text-transform:uppercase">· próximos ·</div>'
      : '';
    return slots.join('') + sep + nextCards.join('');
  };

  const setHTML = (id, v) => { const e = document.getElementById(id); if (e) e.innerHTML = v; };
  const _filtering = !!(fArea || fTop);
  setHTML('sprint-col-corto', renderCol(inMarcha.corto, proximos.corto, _filtering ? inMarcha.corto.length : cap.corto));
  setHTML('sprint-col-medio', renderCol(inMarcha.medio, proximos.medio, _filtering ? inMarcha.medio.length : cap.medio));
  setHTML('sprint-col-largo', renderCol(inMarcha.largo, proximos.largo, _filtering ? inMarcha.largo.length : cap.largo));

  // ── Próximo día libre GLOBAL: fin de toda la cola planificada ──
  // (la fecha en la que arrancaría un proyecto puesto el último de la cola)
  try {
    const elFree = document.getElementById('sprint-free-total');
    if (elFree && typeof planBuildTimeline === 'function') {
      const _tl = planBuildTimeline();
      if (_tl.length) {
        let maxEnd = 0;
        _tl.forEach(function(t){ const e = +t.endDate; if (e > maxEnd) maxEnd = e; });
        const d = new Date(maxEnd);
        const weeks = Math.max(0, Math.ceil((maxEnd - Date.now()) / (7*86400000)));
        elFree.innerHTML = '📅 Próximo día libre del equipo: <b style="color:#087B50;font-size:13px">'
          + d.toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'}) + '</b>'
          + ' <span style="color:#AAA;font-size:9px">· fin de toda la cola planificada ('+_tl.length+' proyectos, '+weeks+' semanas) — ahí empezaría un proyecto puesto el último</span>';
      } else {
        elFree.innerHTML = '';
      }
    }
  } catch(e){}

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
  const conts = [document.getElementById('priority-analysis-summary')].filter(Boolean);
  if (!conts.length) return;
  if (!portfolioData || !portfolioData.length) { conts.forEach(function(c){c.innerHTML='';}); return; }

  const thrS = parseInt(document.getElementById('thr-s')?.value) || 10;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 50;
  const cap  = getDevCapacity();

  // Orden y estado ABSOLUTOS por score dentro de cada pool
  const sorted = portfolioData.filter(p=>p.horas!=null && !isProjClosed(p)).sort((a,b)=>(b.sf||0)-(a.sf||0));
  const pools = {
    corto: sorted.filter(p=>p.horas<thrS),
    medio: sorted.filter(p=>p.horas>=thrS&&p.horas<thrM),
    largo: sorted.filter(p=>p.horas>=thrM),
  };
  const ordMap={}, poolMap={}, enMarcha=new Set();
  [['corto',cap.corto],['medio',cap.medio],['largo',cap.largo]].forEach(function(t){
    pools[t[0]].forEach(function(p,i){
      ordMap[p.nom]=i+1; poolMap[p.nom]=t[0];
      if(i<t[1]) enMarcha.add(p.nom);
    });
  });

  // ═══ TODOS los proyectos Prioridad 1 de ADO, ordenados por score ═══
  const p1 = portfolioData.filter(p=>parseInt(p.adoPriority)===1 && !isProjClosed(p))
    .sort((a,b)=>(b.sf||0)-(a.sf||0));
  // "Remarcados": P1 cuyo scoring NO los coloca en marcha → la prioridad declarada no se sostiene por nota
  const p1Injustificados = p1.filter(p=>!enMarcha.has(p.nom));
  // Inverso: en marcha por score pero sin P1 declarada
  const marchaNoP1 = portfolioData.filter(p=>enMarcha.has(p.nom) && parseInt(p.adoPriority)!==1 && !isProjClosed(p))
    .sort((a,b)=>(b.sf||0)-(a.sf||0));

  const pf2 = d => { if(!d) return null; const x=new Date(d); return isNaN(x)?null:x.toLocaleDateString('es-ES',{day:'2-digit',month:'short'}); };
  const poolTag = k => k==='corto'?'⚡ corto':k==='medio'?'◉ medio':k==='largo'?'▣ largo':'—';

  const p1Row = (p) => {
    const bad = !enMarcha.has(p.nom);   // P1 no justificado por scoring
    const ord = ordMap[p.nom], pk = poolMap[p.nom];
    return '<div style="display:grid;grid-template-columns:1fr 90px 70px 60px 90px 150px;gap:8px;align-items:center;'
      +'padding:8px 10px;border-radius:7px;margin-bottom:5px;'
      +(bad
        ? 'background:#FFF5F4;border:1.5px solid rgba(204,31,38,.45);'
        : 'background:#fff;border:1px solid rgba(120,150,200,.14);')
      +'" title="'+String(p.nom).replace(/"/g,'&quot;')+'">'
      +'<div style="min-width:0;overflow:hidden">'
        +'<div style="font-size:10px;font-weight:700;color:#1C2B4A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+p.nom+'</div>'
        +'<div style="font-size:8px;color:#999">'+(p.area||'—')+'</div>'
      +'</div>'
      +'<div style="text-align:center"><span style="font-size:13px;font-weight:900;color:'+scColorHex(p.sf||0)+';font-family:\'Playfair Display\',serif">'+(p.sf||0).toFixed(1)+'</span></div>'
      +'<div style="text-align:center;font-size:10px;color:#666">'+(p.horas!=null?p.horas+'h':'—')+'</div>'
      +'<div style="text-align:center;font-size:9px;color:#666">'+(pk?poolTag(pk):'—')+'</div>'
      +'<div style="text-align:center;font-size:9px;font-weight:700;color:'+(bad?'#CC1F26':'#087B50')+'">'
        +(ord?('orden '+ord):'sin horas')+'</div>'
      +'<div style="text-align:center">'
        +(bad
          ? '<span style="font-size:8px;background:#CC1F26;color:#fff;padding:3px 8px;border-radius:20px;font-weight:800">⚠ P1 NO justificada por score</span>'
          : '<span style="font-size:8px;background:#087B50;color:#fff;padding:3px 8px;border-radius:20px;font-weight:700">✓ En marcha por score</span>')
      +'</div>'
    +'</div>';
  };

  const smallRow = (p, tag, tagColor) =>
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;background:#fff;border:1px solid rgba(120,150,200,.14);border-radius:7px;margin-bottom:5px" title="'+String(p.nom).replace(/"/g,'&quot;')+'">'
      +'<div style="display:flex;align-items:center;gap:8px;min-width:0">'
        +'<span style="font-size:11px;font-weight:800;color:'+scColorHex(p.sf||0)+'">'+(p.sf||0).toFixed(1)+'</span>'
        +'<span style="font-size:10px;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+p.nom+'</span>'
      +'</div>'
      +'<span style="font-size:8px;background:'+tagColor+';color:#fff;padding:2px 7px;border-radius:20px;font-weight:700;white-space:nowrap">'+tag+'</span>'
    +'</div>';

  const html =
    // ═══ Bloque principal: TODOS los P1 ═══
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
      +'<span style="font-size:12px;font-weight:800;color:#1C2B4A">Proyectos con Prioridad 1 en ADO</span>'
      +'<span style="font-size:9px;background:#1C2B4A;color:#fff;padding:2px 8px;border-radius:20px;font-weight:700">'+p1.length+'</span>'
      +(p1Injustificados.length?'<span style="font-size:9px;background:#CC1F26;color:#fff;padding:2px 8px;border-radius:20px;font-weight:700">'+p1Injustificados.length+' sin justificar por score</span>':'')
    +'</div>'
    +'<div style="font-size:9px;color:#999;margin-bottom:10px">Ordenados por score. En rojo: la prioridad 1 declarada en ADO no se sostiene con la nota (no entran en marcha por scoring).</div>'
    +'<div style="display:grid;grid-template-columns:1fr 90px 70px 60px 90px 150px;gap:8px;padding:2px 10px;font-size:8px;color:#AAA;text-transform:uppercase;font-weight:700">'
      +'<div>Proyecto</div><div style="text-align:center">Score</div><div style="text-align:center">Horas</div><div style="text-align:center">Pool</div><div style="text-align:center">Orden</div><div style="text-align:center">Estado</div>'
    +'</div>'
    +(p1.length ? p1.map(p1Row).join('') : '<div style="font-size:11px;color:#999;padding:10px 0">No hay proyectos con Prioridad 1 de ADO. Carga desde ADO para traer las prioridades.</div>')
    // ═══ Bloque secundario: en marcha por score pero sin P1 ═══
    +'<div style="font-size:12px;font-weight:700;color:#C07800;margin:16px 0 8px">⚑ En marcha por score pero SIN Prioridad 1 en ADO ('+marchaNoP1.length+')</div>'
    +(marchaNoP1.length
      ? marchaNoP1.map(function(p){ return smallRow(p,'REVISAR PRIORIDAD EN ADO','#C07800'); }).join('')
      : '<div style="font-size:11px;color:#087B50;padding:4px 0">✓ Todos los proyectos en marcha tienen Prioridad 1.</div>');

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
  const projects = portfolioData.filter(p=>p.horas!=null && !isProjClosed(p)).map(function(p){
    return { nom:p.nom, sf:+(p.sf||0).toFixed(2), horas:p.horas, area:p.area||'',
      adoPriority:p.adoPriority||3, start:startDates[p.nom]||null,
      desc:(p.descripcion||p.adoDesc||'').toString().replace(/\s+/g,' ').trim().substring(0,400),
      dims:(p.dimScores||[]).map(function(d){return +(+d).toFixed(1);}),
      reqDate:p.reqDate||null,
      adoStart:(p.adoStartDate && String(p.adoStartDate).trim()!=='') ? p.adoStartDate : null };
  });
  // Próximo slot libre por pool: la fecha más temprana en que algún dev queda libre
  var freeSlots = {};
  try {
    var _tl2 = (typeof planBuildTimeline === 'function') ? planBuildTimeline() : [];
    ['corto','medio','largo'].forEach(function(pool){
      var perDev = {};
      (devTeam||[]).forEach(function(d){ if (pDevHours(d)[pool] > 0) perDev[d.name] = Date.now(); });
      _tl2.forEach(function(t){
        if (t.pool === pool && perDev[t.devName] != null) {
          var e = +t.endDate; if (e > perDev[t.devName]) perDev[t.devName] = e;
        }
      });
      var vals = Object.keys(perDev).map(function(k){ return perDev[k]; });
      if (vals.length) freeSlots[pool] = Math.min.apply(null, vals);
    });
  } catch(e){}
  return {
    v: 1,
    ts: Date.now(),
    title: 'En Marcha — mesoestetic',
    cap: cap, thr: { s:thr.s, m:thr.m },
    freeSlots: freeSlots,
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
  // ═══ 1) Lista COMPLETA: estado en-marcha y orden ABSOLUTOS (independientes del filtro) ═══
  const fullSorted = snap.projects.slice().sort((a,b)=>b.sf-a.sf);
  const fCortos = fullSorted.filter(p=>p.horas<thrS);
  const fMedios = fullSorted.filter(p=>p.horas>=thrS&&p.horas<thrM);
  const fLargos = fullSorted.filter(p=>p.horas>=thrM);
  const ordMap = {}, enMarcha = new Set();
  [[fCortos,cap.corto],[fMedios,cap.medio],[fLargos,cap.largo]].forEach(function(t){
    t[0].forEach(function(p,i){ ordMap[p.nom]=i+1; if(i<t[1]) enMarcha.add(p.nom); });
  });
  // ═══ 2) Filtros: SOLO ocultan tarjetas; estado y orden no cambian ═══
  const fArea = window._snapFilterArea || '';
  const fTop  = window._snapFilterTop  || '';
  const topSet = fTop ? new Set(fullSorted.slice(0, parseInt(fTop)).map(p=>p.nom)) : null;
  const passes = p => (!fArea || p.area === fArea) && (!topSet || topSet.has(p.nom));
  const sorted = fullSorted.filter(passes);
  const cortos = fCortos.filter(passes);
  const medios = fMedios.filter(passes);
  const largos = fLargos.filter(passes);

  const pf = (ms)=>{ if(!ms) return '—'; const d=new Date(ms); return d.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}); };
  const DNAMES = ['D1 Compliance','D2 Estrategia','D3 ROI','D4 Técnica','D5 Implant.','D6 Personas'];
  const pf2 = (ms)=>{ if(!ms) return '—'; const d=new Date(ms); return d.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}); };
  const tipOf = (p, active)=>{
    let t = p.nom + '\n';
    t += '────────────────\n';
    t += 'Score: ' + p.sf.toFixed(1) + '  ·  ' + (clsf(p.sf).et||'') + '\n';
    t += 'Área: ' + (p.area||'—') + '  ·  Prioridad ADO: P' + (p.adoPriority||3) + '\n';
    t += 'Horas: ' + p.horas + 'h  ·  ' + (active?'En marcha':'Próximo') + '\n';
    t += 'Inicio: ' + pf2(p.start) + (p.reqDate ? '  ·  Solicitado: ' + pf2(+new Date(p.reqDate)) : '') + '\n';
    if (p.dims && p.dims.length) {
      t += '────────────────\n';
      t += p.dims.map(function(d,i){ return DNAMES[i] + ': ' + d; }).join('\n') + '\n';
    }
    if (p.desc) { t += '────────────────\n' + p.desc; }
    return t;
  };
  const card = (p, active, ordNum)=>{
    const cl = clsf(p.sf);
    const _isP1 = parseInt(p.adoPriority) === 1;   // Prioridad 1 → marcado en rojo
    return '<div style="padding:10px 12px;background:'+(_isP1?'#FFF7F6':'#fff')+';border-radius:8px;border:'
      +(_isP1?'2px solid #CC1F26':(active?'2px solid var(--d3)':'1px dashed var(--b2)'))+';margin-bottom:6px;opacity:'+(active?'1':'0.65')+'" title="'+tipOf(p,active).replace(/"/g,'&quot;')+'">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">'
        +'<div style="display:flex;gap:4px;align-items:center">'
          +'<span style="font-size:8px;background:'+(active?'var(--d3)':'var(--surf)')+';color:'+(active?'#fff':'var(--ink4)')+';padding:2px 6px;border-radius:20px;font-weight:700">'+(active?'EN MARCHA':'PRÓXIMO')+'</span>'
        +'</div>'
        +'<div style="text-align:right"><div style="font-size:14px;font-weight:900;color:'+scColorHex(p.sf)+';font-family:\'Playfair Display\',serif;line-height:1">'+p.sf.toFixed(1)+'</div>'+(ordNum?'<div style="font-size:8px;color:var(--ink4);font-weight:700;margin-top:2px">orden '+ordNum+'</div>':'')+'</div>'
      +'</div>'
      +'<div style="font-size:10px;font-weight:'+(active?'800':'400')+';color:var(--ink);margin-bottom:3px">'+p.nom+'</div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
        +'<span style="font-size:9px;color:var(--ink3)">'+(p.area||'—')+'</span>'
        +'<span style="font-size:11px;font-weight:700;color:var(--ink3)">'+p.horas+'h</span>'
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:5px;padding-top:4px;border-top:1px solid var(--b2)">'
        +'<span style="font-size:8px;color:var(--ink4)">'+(p.adoStart?'🟢 En curso desde:':(active?'🟢 Inicio:':'📅 Inicio est.:'))+'</span>'
        +'<span style="font-size:11px;font-weight:800;color:'+((p.adoStart||active)?'var(--d3)':'var(--ink)')+'">'+(p.adoStart?pf(+new Date(p.adoStart)):pf(p.start))+'</span>'
      +'</div></div>';
  };

  const col = (title, arr, color, poolKey)=>{
    const slotTs = snap.freeSlots && snap.freeSlots[poolKey];
    const active = arr.filter(p=>enMarcha.has(p.nom));
    const next = arr.filter(p=>!enMarcha.has(p.nom));
    return '<div style="flex:1;min-width:0">'
      +'<div style="font-size:11px;font-weight:800;color:'+color+';margin-bottom:2px;text-transform:uppercase">'+title+' ('+arr.length+')</div>'
      +(slotTs ? '<div style="font-size:9px;color:#666;margin-bottom:8px">Próximo slot libre: <b style="color:#087B50">'+pf(slotTs)+'</b></div>' : '<div style="margin-bottom:8px"></div>')
      +active.map(p=>card(p,true,ordMap[p.nom])).join('')
      +(next.length?'<div style="font-size:9px;color:var(--ink4);margin:8px 0 6px;text-transform:uppercase">En cola ('+next.length+')</div>':'')
      +next.map(p=>card(p,false,ordMap[p.nom])).join('')   // TODOS los de la cola, sin recortar
      +'</div>';
  };

  const fecha = new Date(snap.ts).toLocaleString('es-ES',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  cont.innerHTML =
    '<div style="background:linear-gradient(135deg,#16243E,#1C2B4A);color:#fff;padding:16px 20px;border-radius:10px;margin-bottom:16px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
        +'<div><div style="font-size:18px;font-weight:800">Proyectos digitales de eficiencia y optimización de operativa</div>'
        +'<div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:2px">Vista compartida · snapshot del '+fecha+'</div>'
        +'<div style="font-size:10px;color:rgba(255,255,255,.5);margin-top:4px;font-style:italic">Los proyectos en <b style="color:rgba(255,255,255,.85)">negrita</b> son los que están actualmente en marcha</div></div>'
        +'<div style="font-size:11px;background:rgba(196,151,74,.2);color:#E8B96A;padding:6px 12px;border-radius:20px;font-weight:700">SOLO LECTURA</div>'
      +'</div></div>'
    +(function(){
        const areas=[...new Set(snap.projects.map(p=>p.area).filter(Boolean))].sort();
        return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
          +'<span style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.06em">Filtrar:</span>'
          +'<select onchange="window._snapFilterArea=this.value;renderSprintSnapshotView()" style="font-size:10px;padding:5px 8px;border:1px solid #DEDEDE;border-radius:6px;background:#fff;max-width:220px">'
            +'<option value="">Todas las áreas</option>'
            +areas.map(a=>'<option value="'+a.replace(/"/g,'&quot;')+'"'+(fArea===a?' selected':'')+'>'+a+'</option>').join('')
          +'</select>'
          +'<select onchange="window._snapFilterTop=this.value;renderSprintSnapshotView()" style="font-size:10px;padding:5px 8px;border:1px solid #DEDEDE;border-radius:6px;background:#fff">'
            +'<option value="">Todos los proyectos</option>'
            +[10,20,30].map(n=>'<option value="'+n+'"'+(fTop==String(n)?' selected':'')+'>Top '+n+' por nota</option>').join('')
          +'</select>'
          +((fArea||fTop)?'<span style="font-size:9px;color:#999">'+sorted.length+' proyectos · '+cortos.length+' cortos · '+medios.length+' medios · '+largos.length+' largos</span>':'')
        +'</div>';
      })()
    +'<div style="display:flex;gap:14px;align-items:flex-start">'
      +col('⚡ Cortos', cortos, '#C07800','corto')
      +col('◉ Medios', medios, '#1848A0','medio')
      +col('▣ Largos', largos, '#087B50','largo')
    +'</div>';

  // (análisis de prioridad NO se muestra en el snapshot)

}
