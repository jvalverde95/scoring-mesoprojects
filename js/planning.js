/* ═══════════════════════════════════════════════════════════════
   NEXUS PLANNING & GANTT ENGINE  v3 — clean rewrite
   ═══════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────
let activeProjects    = [];   // [{nom, devName, pool, endDate}]
let lockedAssignments = [];   // [{nom, devName, startDate(ISO), endDate(ISO)}]
let ganttHistory      = [];   // change log
let calView           = 'gantt';
let calRefDate        = new Date();
let dragState         = null;

const POOL_COLORS = { corto:'#C07800', medio:'#1848A0', largo:'#087B50' };
const POOL_BGS    = { corto:'#FAF5E6', medio:'#EEF3FC', largo:'#ECF8F3' };
const CAL_DAYS    = ['L','M','X','J','V'];

// ── Persistence ───────────────────────────────────────────────
function savePlanningState() {
  try { localStorage.setItem('nexus_active_projects', JSON.stringify(activeProjects)); } catch(_) {}
}
function loadPlanningState() {
  try { const s = localStorage.getItem('nexus_active_projects'); if (s) activeProjects = JSON.parse(s); } catch(_) {}
}
function saveLocked() {
  try { localStorage.setItem('nexus_locked', JSON.stringify(lockedAssignments)); } catch(_) {}
}
function loadLocked() {
  try { const s = localStorage.getItem('nexus_locked'); if (s) lockedAssignments = JSON.parse(s); } catch(_) {}
}

// ── Utilities ─────────────────────────────────────────────────
function planFmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
}
function planFmtShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day:'2-digit', month:'short' });
}
function planEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function planAddDays(date, days) {
  const d = new Date(date); let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}
function planNextWorkday(date) {
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
function planWeekStart(date) {
  const d = new Date(date);
  const diff = (d.getDay() === 0 ? -6 : 1 - d.getDay());
  d.setDate(d.getDate() + diff); d.setHours(0,0,0,0);
  return d;
}

// ── Weekly hours per dev per pool ─────────────────────────────
function planDevWeeklyHours(dev) {
  const h = { corto:0, medio:0, largo:0 };
  if (!dev) return h;
  if (dev.schedule) {
    CAL_DAYS.forEach(day => {
      (dev.schedule[day] || []).forEach(slot => {
        const [sh,sm] = slot.start.split(':').map(Number);
        const [eh,em] = slot.end.split(':').map(Number);
        const mins = (eh*60+em) - (sh*60+sm);
        if (mins > 0 && h[slot.pool] !== undefined) h[slot.pool] += mins / 60;
      });
    });
  } else {
    // Legacy {corto, medio, largo} total hours per week
    h.corto = parseFloat(dev.corto) || 0;
    h.medio = parseFloat(dev.medio) || 0;
    h.largo = parseFloat(dev.largo) || 0;
  }
  return h;
}

// ── Pool for a project ────────────────────────────────────────
function planProjectPool(p) {
  if (p.pool) return p.pool;
  const thrS = parseInt(document.getElementById('thr-s')?.value) || 30;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 100;
  const h = p.horas || 0;
  if (h <= 0)   return null;
  if (h < thrS) return 'corto';
  if (h < thrM) return 'medio';
  return 'largo';
}

// ── Main engine: build full timeline ─────────────────────────
function planBuildTimeline() {
  if (!devTeam || !devTeam.length) return [];

  const today = new Date(); today.setHours(0,0,0,0);

  // Dev availability: next free date per dev per pool
  const avail = {};
  devTeam.forEach(dev => {
    avail[dev.name] = { corto: new Date(today), medio: new Date(today), largo: new Date(today) };
  });

  // Block dev+pool for active (in-progress) projects
  activeProjects.forEach(ap => {
    if (ap.endDate && avail[ap.devName] && avail[ap.devName][ap.pool]) {
      const end = new Date(ap.endDate + 'T00:00:00');
      if (end > avail[ap.devName][ap.pool]) avail[ap.devName][ap.pool] = new Date(end);
    }
  });

  // Apply locked assignments
  const locked = {};
  lockedAssignments.forEach(l => { locked[l.nom] = l; });

  // Queue: projects with hours, sorted by score desc
  const activeNoms = new Set(activeProjects.map(a => a.nom));
  const queue = (portfolioData || [])
    .filter(p => (p.horas || 0) > 0 && !activeNoms.has(p.nom) && planProjectPool(p))
    .sort((a, b) => (b.sf || 0) - (a.sf || 0));

  const timeline = [];

  queue.forEach(p => {
    const pool = planProjectPool(p);
    if (!pool) return;

    // Check if this project has a locked assignment
    if (locked[p.nom]) {
      const l = locked[p.nom];
      timeline.push({
        proj:         p,
        pool,
        devName:      l.devName,
        startDate:    new Date(l.startDate),
        endDate:      new Date(l.endDate),
        hoursPerWeek: planDevWeeklyHours(devTeam.find(d=>d.name===l.devName))[pool] || 1,
        totalHours:   p.horas,
        weeks:        +(p.horas / (planDevWeeklyHours(devTeam.find(d=>d.name===l.devName))[pool] || 1)).toFixed(1),
        locked:       true,
      });
      // Update avail for that dev+pool
      if (avail[l.devName]) {
        const end = new Date(l.endDate);
        if (end > avail[l.devName][pool]) avail[l.devName][pool] = end;
      }
      return;
    }

    // Auto-assign: find dev with capacity for this pool, earliest available
    let bestDev = null, bestStart = null, bestWh = 0;
    devTeam.forEach(dev => {
      const wh = planDevWeeklyHours(dev)[pool];
      if (wh <= 0) return;
      const devAvail = avail[dev.name]?.[pool] || new Date(today);
      if (!bestDev || devAvail < bestStart ||
          (devAvail.getTime() === bestStart.getTime() && wh > bestWh)) {
        bestDev = dev; bestStart = new Date(devAvail); bestWh = wh;
      }
    });

    if (!bestDev) return;

    const wh      = bestWh;
    const weeks   = p.horas / wh;
    const days    = Math.ceil(weeks * 5);
    const start   = planNextWorkday(new Date(bestStart));
    const end     = planAddDays(new Date(start), days);

    timeline.push({
      proj: p, pool, devName: bestDev.name,
      startDate: start, endDate: end,
      hoursPerWeek: wh, totalHours: p.horas, weeks: +weeks.toFixed(1),
      locked: false,
    });

    avail[bestDev.name][pool] = new Date(end);
  });

  return timeline;
}

// ── Cascade: push all following projects for same dev+pool ────
function planCascade(nom, newEnd, devName, pool) {
  const timeline = planBuildTimeline();
  const chain = timeline
    .filter(t => t.devName === devName && t.pool === pool && t.proj.nom !== nom)
    .sort((a, b) => a.startDate - b.startDate);

  let cursor = new Date(newEnd);
  chain.forEach(t => {
    if (t.startDate < cursor) {
      const dur = Math.ceil((t.endDate - t.startDate) / 86400000);
      const ns  = planNextWorkday(new Date(cursor));
      const ne  = planAddDays(new Date(ns), dur);
      const idx = lockedAssignments.findIndex(l => l.nom === t.proj.nom);
      const lock = { nom: t.proj.nom, devName, startDate: ns.toISOString(), endDate: ne.toISOString() };
      if (idx >= 0) lockedAssignments[idx] = lock;
      else lockedAssignments.push(lock);
      cursor = new Date(ne);
    } else {
      cursor = new Date(t.endDate);
    }
  });
  saveLocked();
}

// ── Change history ────────────────────────────────────────────
function planLogChange(nom, from, to, dev) {
  ganttHistory.unshift({ ts: new Date(), nom, from, to, dev });
  if (ganttHistory.length > 30) ganttHistory.pop();
  planRenderHistory();
}
function planRenderHistory() {
  const el = document.getElementById('gantt-history');
  const count = document.getElementById('changelog-count');
  if (count) count.textContent = ganttHistory.length;
  if (!el) return;
  if (!ganttHistory.length) {
    el.innerHTML = '<div style="font-size:10px;color:#CCC;padding:8px 0">Sin cambios registrados.</div>';
    return;
  }
  el.innerHTML = ganttHistory.map(h => {
    const ts = h.ts.toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'});
    const dt = h.ts.toLocaleDateString('es-ES', {day:'2-digit',month:'short'});
    return `<div style="display:flex;gap:10px;padding:6px 8px;background:#fff;border-radius:6px;
      border:1px solid #F0F0F0;font-size:10px;align-items:flex-start">
      <div style="flex-shrink:0;color:#AAA;white-space:nowrap">${dt} ${ts}</div>
      <div style="flex:1;color:#555">
        <strong>${h.nom}</strong>
        ${h.dev ? `→ <span style="color:#1848A0">${h.dev}</span>` : ''}
        · <span style="text-decoration:line-through;color:#AAA">${h.from}</span>
        → <span style="color:#087B50;font-weight:700">${h.to}</span>
      </div>
    </div>`;
  }).join('');
}
function ganttClearLog() {
  ganttHistory = [];
  planRenderHistory();
}
function ganttGoToday() {
  calRefDate = new Date();
  renderCalendar();
}

// ── Main render dispatcher ────────────────────────────────────
function renderCalendar() {
  const el = document.getElementById('calendar-container');
  if (!el) return;

  // Check prerequisites
  const hasDev  = devTeam && devTeam.length > 0;
  const hasProj = portfolioData && portfolioData.some(p => (p.horas||0) > 0);

  if (!hasDev || !hasProj) {
    const steps = [];
    if (!hasDev)  steps.push('1 · Ve a <strong>⚙ Config → Equipo</strong> y añade al menos un desarrollador con horario semanal');
    if (!hasProj) steps.push((hasDev?'1':'2') + ' · <strong>Importa proyectos</strong> desde Excel o ADO y asegúrate de que tienen horas estimadas');
    steps.push((steps.length+1) + ' · Vuelve aquí y pulsa <strong>↺ Recalcular</strong>');

    el.innerHTML = `<div style="max-width:500px;margin:40px auto;text-align:center">
      <div style="font-size:40px;margin-bottom:16px">📅</div>
      <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:8px">Configura la planificación</div>
      <div style="font-size:12px;color:#888;margin-bottom:20px">Para ver el Gantt necesitas:</div>
      <div style="text-align:left;display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
        ${steps.map(s=>`<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 14px;
          background:#F7F7F5;border-radius:8px;font-size:11px;color:#555;line-height:1.5">${s}</div>`).join('')}
      </div>
      <button onclick="planLoadDemo()" style="padding:10px 24px;font-size:11px;font-weight:700;
        border-radius:8px;border:none;background:#111;color:#fff;cursor:pointer;margin-right:8px">
        ▶ Ver demo con datos de ejemplo
      </button>
      <button onclick="goStep('config')" style="padding:10px 24px;font-size:11px;font-weight:600;
        border-radius:8px;border:1.5px solid #DEDEDE;background:#fff;color:#666;cursor:pointer">
        ⚙ Ir a Configuración
      </button>
    </div>`;
    return;
  }

  const timeline = planBuildTimeline();
  if (!timeline.length) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:#AAA;font-size:13px">
      Los proyectos no tienen desarrollador asignado con capacidad en el pool correspondiente.<br><br>
      Comprueba que los desarrolladores tienen <strong>franjas horarias</strong> configuradas en ⚙ Config.
    </div>`;
    return;
  }

  if (calView === 'gantt') renderGanttV3(el, timeline);
  if (calView === 'month') renderMonthV3(el, timeline);
  if (calView === 'week')  renderWeekV3(el, timeline);
}

// ── Demo data loader ──────────────────────────────────────────
function planLoadDemo() {
  // Set demo devTeam
  if (!devTeam.length) {
    devTeam.push({
      name: 'Ana García',
      schedule: {
        L:[{start:'09:00',end:'13:00',pool:'largo'},{start:'15:00',end:'17:00',pool:'corto'}],
        M:[{start:'09:00',end:'13:00',pool:'largo'},{start:'15:00',end:'17:00',pool:'medio'}],
        X:[{start:'09:00',end:'14:00',pool:'largo'}],
        J:[{start:'09:00',end:'13:00',pool:'medio'},{start:'15:00',end:'17:00',pool:'corto'}],
        V:[{start:'09:00',end:'13:00',pool:'largo'}],
      }
    });
    devTeam.push({
      name: 'Marc Torres',
      schedule: {
        L:[{start:'08:00',end:'12:00',pool:'medio'},{start:'14:00',end:'16:00',pool:'corto'}],
        M:[{start:'08:00',end:'12:00',pool:'largo'}],
        X:[{start:'08:00',end:'12:00',pool:'largo'},{start:'14:00',end:'16:00',pool:'medio'}],
        J:[{start:'08:00',end:'12:00',pool:'largo'}],
        V:[{start:'08:00',end:'12:00',pool:'medio'},{start:'14:00',end:'16:00',pool:'corto'}],
      }
    });
    if (typeof saveDevCapacity === 'function') saveDevCapacity();
  }
  // Set demo portfolio
  if (!portfolioData.some(p=>p.horas>0)) {
    const demos = [
      {nom:'Integración SAP-CRM', horas:160, sf:9.1, sb:8.5, af:1.07, dimScores:[9,8,9,7,7,5], scores:{}, reqDate:'2024-12-01', area:'IT', sponsor:'COO'},
      {nom:'Portal empleado RRHH', horas:80,  sf:7.8, sb:7.2, af:1.08, dimScores:[6,7,8,6,8,7], scores:{}, reqDate:'2025-01-15', area:'RRHH', sponsor:'CHRO'},
      {nom:'Automatización GMP',   horas:200, sf:8.9, sb:8.3, af:1.05, dimScores:[10,7,8,8,6,5], scores:{}, reqDate:'2024-11-01', area:'Calidad', sponsor:'CTO'},
      {nom:'App móvil comerciales', horas:120, sf:7.5, sb:7.0, af:1.06, dimScores:[5,8,8,7,7,6], scores:{}, reqDate:'2025-02-01', area:'Ventas', sponsor:'CSO'},
      {nom:'BI Supply Chain',       horas:60,  sf:7.2, sb:6.8, af:1.04, dimScores:[5,7,7,5,8,5], scores:{}, reqDate:'2025-01-01', area:'Operaciones', sponsor:'COO'},
      {nom:'GDPR Data Governance',  horas:40,  sf:8.3, sb:7.8, af:1.09, dimScores:[10,6,5,6,7,5], scores:{}, reqDate:'2024-10-01', area:'Legal', sponsor:'CLO'},
    ];
    demos.forEach(d => { d._selected=false; d.autoP=d.dimScores[0]>=8; portfolioData.push(d); });
    if (typeof renderPortfolio === 'function') renderPortfolio();
  }
  toast('✓ Datos de demo cargados');
  renderCalendar();
}

// ════════════════════════════════════════════════════════════════
// GANTT V3
// ════════════════════════════════════════════════════════════════
function renderGanttV3(el, timeline) {
  const today = new Date(); today.setHours(0,0,0,0);

  // Date bounds
  const allDates = timeline.flatMap(t => [t.startDate, t.endDate]);
  let minDate = new Date(Math.min(...allDates));
  let maxDate = new Date(Math.max(...allDates));
  // Padding: start 1 week before first project, end 3 weeks after last
  minDate.setDate(minDate.getDate() - 7);
  maxDate.setDate(maxDate.getDate() + 21);
  // Always show today
  if (today < minDate) minDate = new Date(today.getTime() - 7*86400000);
  minDate = planWeekStart(minDate);

  const totalDays = Math.ceil((maxDate - minDate) / 86400000);
  const DAY_PX    = Math.max(18, Math.min(36, Math.floor(880 / totalDays)));
  const LABEL_W   = 150;
  const ROW_H     = 54;
  const HEAD_H    = 44;
  const totalW    = totalDays * DAY_PX;

  // Build months + weeks for header
  const months = [], weeks = [];
  let d = new Date(minDate);
  while (d <= maxDate) {
    const lx = Math.round((d - minDate) / 86400000) * DAY_PX;
    if (d.getDate() === 1 || d.getTime() === minDate.getTime()) {
      months.push({ left: lx, label: d.toLocaleDateString('es-ES',{month:'short',year:'2-digit'}) });
    }
    if (d.getDay() === 1) weeks.push({ left: lx, day: d.getDate(), isMonth: d.getDate() <= 7 });
    d.setDate(d.getDate() + 1);
  }

  // Today line x
  const todayX = Math.round((today - minDate) / 86400000) * DAY_PX;

  // Group by dev
  const devNames = [...new Set(timeline.map(t => t.devName))];

  // Build rows HTML
  const rowsHtml = devNames.map((devName, ri) => {
    const dev      = devTeam.find(d => d.name === devName) || { name: devName };
    const wh       = planDevWeeklyHours(dev);
    const projs    = timeline.filter(t => t.devName === devName).sort((a,b) => a.startDate-b.startDate);

    const whText = Object.entries(wh).filter(([,v])=>v>0)
      .map(([k,v]) => `<span style="color:${POOL_COLORS[k]};font-weight:600">${k} ${v.toFixed(0)}h</span>`)
      .join(' · ');

    const bars = projs.map(t => {
      const lx  = Math.max(0, Math.round((t.startDate - minDate) / 86400000) * DAY_PX);
      const wpx = Math.max(4, Math.round((t.endDate - t.startDate) / 86400000) * DAY_PX) - 2;
      const col = POOL_COLORS[t.pool] || '#888';
      const bg  = t.locked ? col : POOL_BGS[t.pool] || '#F5F5F5';
      const tc  = t.locked ? '#fff' : col;
      const pct = Math.round(Math.max(0,Math.min(1,(today-t.startDate)/(t.endDate-t.startDate||1)))*100);
      const maxChars = Math.max(0, Math.floor((wpx-20)/6.5));
      const lbl = t.proj.nom.length > maxChars ? t.proj.nom.slice(0,maxChars)+'…' : t.proj.nom;

      return `<div draggable="true"
          data-nom="${planEsc(t.proj.nom)}" data-dev="${planEsc(devName)}" data-pool="${t.pool}"
          ondragstart="planGanttDragStart(event)"
          ondblclick="planGanttUnlock('${planEsc(t.proj.nom)}')"
          title="${planEsc(t.proj.nom)}&#10;${t.proj.horas}h · ${t.weeks}sem · score ${(t.proj.sf||0).toFixed(1)}&#10;${planFmtShort(t.startDate)} → ${planFmtShort(t.endDate)}&#10;${t.locked?'🔒 Bloqueado manualmente — dbl-clic para liberar':'Auto-planificado'}"
          style="position:absolute;left:${lx}px;width:${wpx}px;top:10px;height:34px;
            border-radius:6px;cursor:grab;overflow:hidden;
            border:${t.locked?'2px':'1.5px'} solid ${col};
            box-shadow:${t.locked?'0 2px 8px rgba(0,0,0,.15)':'none'};
            transition:box-shadow .15s;">
          <!-- bg -->
          <div style="position:absolute;inset:0;background:${bg}"></div>
          <!-- progress -->
          ${pct>0&&pct<100?`<div style="position:absolute;left:0;top:0;bottom:0;
            width:${pct}%;background:${col};opacity:.2"></div>`:''}
          <!-- content -->
          <div style="position:relative;z-index:2;height:100%;display:flex;
            align-items:center;padding:0 6px;gap:4px;pointer-events:none">
            ${t.locked?`<span style="font-size:9px;flex-shrink:0">🔒</span>`:''}
            ${wpx>40?`<span style="font-size:8px;font-weight:700;color:${tc};
              white-space:nowrap;overflow:hidden;flex:1">${lbl}</span>`:''}
            ${wpx>60&&pct>0&&pct<100?`<span style="font-size:7px;color:${tc};opacity:.8;flex-shrink:0">${pct}%</span>`:''}
            ${wpx>50?`<span style="font-size:7px;color:${tc};opacity:.7;flex-shrink:0">${(t.proj.sf||0).toFixed(1)}</span>`:''}
          </div>
          <!-- resize handle -->
          <div onmousedown="planResizeStart(event,'${planEsc(t.proj.nom)}','${planEsc(devName)}')"
            style="position:absolute;right:0;top:0;bottom:0;width:8px;
              cursor:ew-resize;z-index:5"></div>
        </div>`;
    }).join('');

    const bg = ri%2===0 ? '#fff' : '#FDFDFD';
    return `
      <div style="display:flex;border-bottom:1px solid #F0F0F0;background:${bg}"
        ondragover="event.preventDefault()"
        ondrop="planGanttDrop(event,'${planEsc(devName)}')"
        data-dev="${planEsc(devName)}">
        <div style="width:${LABEL_W}px;flex-shrink:0;padding:8px 12px;
          border-right:1px solid #EBEBEB;display:flex;flex-direction:column;justify-content:center">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:22px;height:22px;border-radius:50%;background:#111;color:#fff;
              font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;
              flex-shrink:0">${devName.charAt(0).toUpperCase()}</div>
            <span style="font-size:10px;font-weight:700;color:#111;overflow:hidden;
              text-overflow:ellipsis;white-space:nowrap">${devName}</span>
          </div>
          <div style="font-size:8px;color:#AAA;margin-top:3px">${whText}</div>
        </div>
        <div style="flex:1;position:relative;height:${ROW_H}px;min-width:${totalW}px;overflow:hidden"
          ondragover="event.preventDefault()"
          ondrop="planGanttDrop(event,'${planEsc(devName)}')">
          ${weeks.map(w=>`<div style="position:absolute;left:${w.left}px;top:0;bottom:0;
            width:1px;background:${w.isMonth?'#E0E0E0':'#F0F0F0'}"></div>`).join('')}
          <div style="position:absolute;left:${todayX}px;top:0;bottom:0;width:2px;
            background:rgba(204,31,38,.5);z-index:20;pointer-events:none"></div>
          ${bars}
        </div>
      </div>`;
  }).join('');

  // Header
  const monthsHtml = months.map(m =>
    `<div style="position:absolute;left:${m.left+2}px;top:4px;font-size:9px;font-weight:700;
      color:#111;text-transform:uppercase;letter-spacing:.06em;pointer-events:none;
      border-left:1px solid #D0D0D0;padding-left:4px">${m.label}</div>`
  ).join('');
  const weeksHtml = weeks.map(w =>
    `<div style="position:absolute;left:${w.left+2}px;top:24px;font-size:8px;
      color:#AAA;pointer-events:none">${w.day}</div>`
  ).join('');
  const todayHdr = `<div style="position:absolute;left:${todayX}px;top:0;bottom:0;
    width:2px;background:rgba(204,31,38,.5);pointer-events:none"></div>
    <div style="position:absolute;left:${todayX-10}px;bottom:2px;font-size:7px;
      font-weight:800;color:#CC1F26;pointer-events:none;white-space:nowrap">▼HOY</div>`;

  el.innerHTML = `
    <div style="border:1px solid #EBEBEB;border-radius:10px;overflow-x:auto;overflow-y:visible;
      box-shadow:0 2px 8px rgba(0,0,0,.04)">
      <!-- Header -->
      <div style="display:flex;border-bottom:2px solid #EBEBEB;position:sticky;top:0;z-index:50;background:#fff">
        <div style="width:${LABEL_W}px;flex-shrink:0;border-right:1px solid #EBEBEB;
          background:#FAFAF8;padding:8px 12px;font-size:8px;font-weight:700;color:#AAA;
          text-transform:uppercase;letter-spacing:.1em;display:flex;align-items:flex-end">
          Equipo
        </div>
        <div style="flex:1;position:relative;height:${HEAD_H}px;min-width:${totalW}px;
          background:#FAFAF8;overflow:hidden">
          ${weeks.map(w=>`<div style="position:absolute;left:${w.left}px;top:0;bottom:0;
            width:1px;background:${w.isMonth?'#E0E0E0':'#F0F0F0'}"></div>`).join('')}
          ${monthsHtml}${weeksHtml}${todayHdr}
        </div>
      </div>
      <!-- Rows -->
      <div style="min-width:${totalW+LABEL_W}px">${rowsHtml}</div>
    </div>
    <!-- Legend -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:9px;color:#888;align-items:center">
      ${Object.entries(POOL_COLORS).map(([k,c])=>`
        <span style="display:flex;align-items:center;gap:4px">
          <span style="width:10px;height:10px;border-radius:2px;background:${POOL_BGS[k]};border:1.5px solid ${c}"></span>${k}
        </span>`).join('')}
      <span style="display:flex;align-items:center;gap:4px">
        <span style="width:10px;height:10px;border-radius:2px;background:#087B50;border:2px solid #087B50"></span>bloqueado
      </span>
      <span>· Arrastra → mueve (efecto dominó) · Doble clic → liberar · ▐ borde derecho → redimensionar</span>
    </div>`;
}

// ── Gantt drag & drop ─────────────────────────────────────────
function planGanttDragStart(e) {
  dragState = { nom: e.currentTarget.dataset.nom, dev: e.currentTarget.dataset.dev };
  e.dataTransfer.setData('text/plain', e.currentTarget.dataset.nom);
  e.currentTarget.style.opacity = '.6';
}

function planGanttDrop(e, targetDev) {
  e.preventDefault();
  const nom = e.dataTransfer.getData('text/plain') || dragState?.nom;
  if (!nom) return;

  const timeline = planBuildTimeline();
  const t = timeline.find(x => x.proj.nom === nom);
  if (!t) { dragState = null; return; }

  // Compute drop x → date
  const rowEl  = e.currentTarget;
  const rect   = rowEl.getBoundingClientRect();
  const allD   = timeline.flatMap(t2=>[t2.startDate,t2.endDate]);
  const minDate = planWeekStart(new Date(Math.min(...allD)-7*86400000));
  const maxDate = new Date(Math.max(...allD));
  maxDate.setDate(maxDate.getDate()+21);
  const totalDays = Math.ceil((maxDate-minDate)/86400000);
  const dayPx     = Math.max(18,Math.min(36,Math.floor(880/totalDays)));
  const dropX     = e.clientX - rect.left - 150; // subtract label width
  const dropDays  = Math.max(0, Math.round(dropX/dayPx));
  let   newStart  = new Date(minDate);
  newStart.setDate(newStart.getDate()+dropDays);
  newStart = planNextWorkday(newStart);

  // Duration in working days
  const durDays = Math.max(1, Math.ceil((t.endDate - t.startDate)/86400000));
  let   newEnd  = planAddDays(new Date(newStart), durDays);

  // Anti-overlap: push past any conflict for targetDev+pool
  timeline
    .filter(x => x.proj.nom!==nom && x.devName===targetDev && x.pool===t.pool
      && x.startDate < newEnd && x.endDate > newStart)
    .sort((a,b) => a.startDate-b.startDate)
    .forEach(c => {
      if (c.endDate > newStart) {
        newStart = planNextWorkday(new Date(c.endDate));
        newEnd   = planAddDays(new Date(newStart), durDays);
      }
    });

  const prevDev   = t.devName;
  const prevStart = planFmtShort(t.startDate);

  // Save lock
  const idx = lockedAssignments.findIndex(l=>l.nom===nom);
  const lock = { nom, devName:targetDev, startDate:newStart.toISOString(), endDate:newEnd.toISOString() };
  if (idx>=0) lockedAssignments[idx]=lock; else lockedAssignments.push(lock);

  // Cascade domino
  planCascade(nom, newEnd, targetDev, t.pool);
  if (prevDev !== targetDev) planCascade(nom, t.startDate, prevDev, t.pool);

  planLogChange(nom, `${prevStart} (${prevDev})`, `${planFmtShort(newStart)} (${targetDev})`, targetDev);
  dragState = null;
  renderCalendar();
  toast(`✓ "${nom.substring(0,28)}" → ${targetDev} · ${planFmtShort(newStart)}`);
}

function planGanttUnlock(nom) {
  lockedAssignments = lockedAssignments.filter(l=>l.nom!==nom);
  saveLocked();
  planLogChange(nom, '🔒 bloqueado', '↺ automático', '');
  renderCalendar();
  toast(`↺ "${nom.substring(0,28)}" → planificación automática`);
}

// ── Resize ────────────────────────────────────────────────────
let planResizeState = null;
function planResizeStart(e, nom, dev) {
  e.preventDefault(); e.stopPropagation();
  const timeline = planBuildTimeline();
  const t = timeline.find(x=>x.proj.nom===nom);
  if (!t) return;
  planResizeState = { nom, dev, origEnd: new Date(t.endDate), startX: e.clientX, origStart: new Date(t.startDate) };

  const onMove = ev => {
    if (!planResizeState) return;
    const allD = planBuildTimeline().flatMap(t2=>[t2.startDate,t2.endDate]);
    const tot  = Math.ceil((new Date(Math.max(...allD))-new Date(Math.min(...allD)))/86400000)+28;
    const dpx  = Math.max(18,Math.min(36,Math.floor(880/tot)));
    const delta= Math.round((ev.clientX-planResizeState.startX)/dpx);
    if (delta===0) return;
    const ne = planAddDays(new Date(planResizeState.origEnd), delta);
    if (ne <= planResizeState.origStart) return;
    const idx = lockedAssignments.findIndex(l=>l.nom===planResizeState.nom);
    const lock = { nom:planResizeState.nom, devName:planResizeState.dev,
      startDate:planResizeState.origStart.toISOString(), endDate:ne.toISOString() };
    if (idx>=0) lockedAssignments[idx]=lock; else lockedAssignments.push(lock);
    planResizeState.origEnd = ne;
    planResizeState.startX  = ev.clientX;
    saveLocked();
  };
  const onUp = () => {
    if (planResizeState) {
      planLogChange(planResizeState.nom,
        planFmtShort(planResizeState.origStart), planFmtShort(planResizeState.origEnd),
        planResizeState.dev);
      renderCalendar();
    }
    planResizeState = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ════════════════════════════════════════════════════════════════
// MONTHLY VIEW
// ════════════════════════════════════════════════════════════════
function renderMonthV3(el, timeline) {
  const y = calRefDate.getFullYear(), m = calRefDate.getMonth();
  const first = new Date(y,m,1), last = new Date(y,m+1,0);
  const name  = first.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  const startDow = (first.getDay()+6)%7;
  const cells = [...Array(startDow).fill(null),
    ...Array.from({length:last.getDate()},(_,i)=>new Date(y,m,i+1))];

  const html = cells.map(day => {
    if (!day) return `<div style="background:#FAFAFA;border:1px solid #F5F5F5;border-radius:6px;min-height:90px"></div>`;
    const isToday   = day.toDateString()===new Date().toDateString();
    const isWeekend = day.getDay()===0||day.getDay()===6;
    const active    = timeline.filter(t=>t.startDate<=day&&t.endDate>day);
    const tags      = active.slice(0,3).map(t=>{
      const col = POOL_COLORS[t.pool], bg = POOL_BGS[t.pool];
      return `<div style="font-size:8px;font-weight:600;padding:2px 5px;border-radius:3px;
        background:${bg};border:1px solid ${col};color:${col};margin-bottom:2px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
        title="${t.proj.nom} · ${t.devName}">
        ${t.proj.nom.substring(0,18)}
      </div>`;
    }).join('');
    const more = active.length-3;
    return `<div style="background:${isWeekend?'#FAFAFA':'#fff'};
      border:${isToday?'2px solid #C4974A':'1px solid #EBEBEB'};border-radius:6px;
      min-height:90px;padding:5px;overflow:hidden">
      <div style="font-size:9px;font-weight:${isToday?800:400};
        color:${isToday?'#C4974A':'#999'};margin-bottom:3px">${day.getDate()}</div>
      ${tags}
      ${more>0?`<div style="font-size:8px;color:#AAA">+${more}</div>`:''}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <button onclick="calNav(-1)" style="padding:6px 14px;border:1px solid #DEDEDE;
        border-radius:6px;background:#fff;cursor:pointer;font-size:11px">←</button>
      <div style="font-size:14px;font-weight:700;color:#111;text-transform:capitalize">${name}</div>
      <button onclick="calNav(1)" style="padding:6px 14px;border:1px solid #DEDEDE;
        border-radius:6px;background:#fff;cursor:pointer;font-size:11px">→</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px">
      ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>`
        <div style="font-size:9px;font-weight:700;color:#AAA;text-align:center;
          text-transform:uppercase;letter-spacing:.06em;padding:4px 0">${d}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${html}</div>`;
}

// ════════════════════════════════════════════════════════════════
// WEEKLY VIEW
// ════════════════════════════════════════════════════════════════
function renderWeekV3(el, timeline) {
  const ws   = planWeekStart(calRefDate);
  const days = Array.from({length:5},(_,i)=>{ const d=new Date(ws); d.setDate(d.getDate()+i); return d; });
  const label= `${planFmtShort(days[0])} – ${planFmtShort(days[4])}`;

  const hdr = days.map(d=>{
    const isT = d.toDateString()===new Date().toDateString();
    return `<div style="text-align:center;padding:8px 4px;border-left:1px solid #EBEBEB;
      background:${isT?'#FEF9EC':'#FAFAF8'}">
      <div style="font-size:9px;font-weight:700;color:${isT?'#C4974A':'#888'};
        text-transform:uppercase">${d.toLocaleDateString('es-ES',{weekday:'short'})}</div>
      <div style="font-size:12px;font-weight:${isT?800:400};color:${isT?'#C4974A':'#111'}">${d.getDate()}</div>
    </div>`;
  }).join('');

  const rows = devTeam.map(dev=>{
    const devTimeline = timeline.filter(t=>t.devName===dev.name);
    const cells = days.map(day=>{
      const dow = ['D','L','M','X','J','V','S'][day.getDay()];
      const slots = dev.schedule?.[dow] || [];
      const activeProj = devTimeline.find(t=>t.startDate<=day&&t.endDate>day);
      const slotsHtml  = slots.length ? slots.map(slot=>{
        const [sh,sm]=slot.start.split(':').map(Number);
        const [eh,em]=slot.end.split(':').map(Number);
        const h=((eh*60+em)-(sh*60+sm))/60;
        const col=POOL_COLORS[slot.pool];
        const bg =activeProj&&activeProj.pool===slot.pool?POOL_BGS[slot.pool]:'#F7F7F5';
        const proj=activeProj&&activeProj.pool===slot.pool?activeProj.proj.nom.substring(0,18):'—';
        return `<div style="margin-bottom:3px;padding:3px 6px;border-radius:4px;
          background:${bg};border-left:3px solid ${col}">
          <div style="font-size:7px;color:${col};font-weight:700">${slot.start}–${slot.end} ${slot.pool} ${h}h</div>
          <div style="font-size:8px;color:#555;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${proj}</div>
        </div>`;
      }).join('')
      : `<div style="font-size:8px;color:#DDD;padding:6px;text-align:center">—</div>`;
      return `<div style="border-left:1px solid #EBEBEB;padding:5px 4px;min-height:70px">${slotsHtml}</div>`;
    }).join('');

    const wh = planDevWeeklyHours(dev);
    const whT = Object.entries(wh).filter(([,v])=>v>0)
      .map(([k,v])=>`<span style="color:${POOL_COLORS[k]}">${v.toFixed(0)}h</span>`).join(' ');
    return `<div style="display:grid;grid-template-columns:100px repeat(5,1fr);border-bottom:1px solid #F0F0F0">
      <div style="padding:8px;background:#FAFAF8;border-right:1px solid #EBEBEB;
        display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:10px;font-weight:700;color:#111">${dev.name}</div>
        <div style="font-size:8px;color:#AAA;margin-top:2px">${whT}</div>
      </div>
      ${cells}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <button onclick="calNav(-1)" style="padding:6px 14px;border:1px solid #DEDEDE;
        border-radius:6px;background:#fff;cursor:pointer;font-size:11px">← Semana anterior</button>
      <div style="font-size:13px;font-weight:700;color:#111">${label}</div>
      <button onclick="calNav(1)" style="padding:6px 14px;border:1px solid #DEDEDE;
        border-radius:6px;background:#fff;cursor:pointer;font-size:11px">Semana siguiente →</button>
    </div>
    <div style="border:1px solid #EBEBEB;border-radius:8px;overflow:hidden">
      <div style="display:grid;grid-template-columns:100px repeat(5,1fr);
        background:#FAFAF8;border-bottom:2px solid #EBEBEB">
        <div style="padding:8px;font-size:9px;font-weight:700;color:#AAA;
          text-transform:uppercase;letter-spacing:.08em">Dev</div>
        ${hdr}
      </div>
      ${rows}
    </div>`;
}

// ── Navigation ────────────────────────────────────────────────
function calNav(dir) {
  if (calView==='month') {
    calRefDate = new Date(calRefDate.getFullYear(), calRefDate.getMonth()+dir, 1);
  } else {
    calRefDate = new Date(calRefDate);
    calRefDate.setDate(calRefDate.getDate()+dir*7);
  }
  renderCalendar();
}

function switchCalView(view) {
  calView = view;
  ['gantt','month','week'].forEach(v=>{
    const btn = document.getElementById('cal-btn-'+v);
    if (!btn) return;
    const active = v===view;
    btn.style.background  = active?'#111':'transparent';
    btn.style.color       = active?'#fff':'#666';
    btn.style.borderColor = active?'#111':'transparent';
  });
  renderCalendar();
}

// ── Active project management ─────────────────────────────────
function openAddActiveProject() {
  const modal = document.getElementById('active-proj-modal');
  if (!modal) return;
  const sel = document.getElementById('ap-project-sel');
  if (sel) {
    sel.innerHTML = '<option value="">— Selecciona —</option>' +
      (portfolioData||[]).filter(p=>(p.horas||0)>0).sort((a,b)=>(b.sf||0)-(a.sf||0))
        .map(p=>`<option value="${planEsc(p.nom)}">${p.nom.substring(0,50)} · ${p.horas}h</option>`).join('');
  }
  const devSel = document.getElementById('ap-dev-sel');
  if (devSel) devSel.innerHTML = devTeam.map(d=>`<option>${d.name}</option>`).join('');
  const end = document.getElementById('ap-end-date');
  if (end) { const d=new Date(); d.setDate(d.getDate()+30); end.value=d.toISOString().split('T')[0]; }
  modal.style.display = 'flex';
}
function closeActiveModal() {
  const m = document.getElementById('active-proj-modal');
  if (m) m.style.display = 'none';
}
function saveActiveProject() {
  const nom  = document.getElementById('ap-project-sel')?.value;
  const dev  = document.getElementById('ap-dev-sel')?.value;
  const end  = document.getElementById('ap-end-date')?.value;
  const pool = document.getElementById('ap-pool-sel')?.value;
  if (!nom||!dev||!end) { toast('Completa todos los campos'); return; }
  const p = (portfolioData||[]).find(pr=>pr.nom===nom);
  const resolvedPool = pool || (p?planProjectPool(p):'medio');
  activeProjects.push({nom,devName:dev,endDate:end,pool:resolvedPool});
  savePlanningState();
  planLogChange(nom,'—',end,dev);
  closeActiveModal();
  renderCalendar();
  toast(`✓ "${nom.substring(0,28)}" marcado como en curso hasta ${end}`);
}
function removeActiveProject(i) {
  activeProjects.splice(i,1);
  savePlanningState();
  renderCalendar();
}

// ── Schedule editor in Config ─────────────────────────────────
function renderScheduleEditor() {
  const el = document.getElementById('schedule-editor');
  if (!el) return;
  if (!devTeam.length) {
    el.innerHTML = '<div style="color:#AAA;font-size:11px;padding:8px 0">Añade desarrolladores arriba para configurar su horario.</div>';
    return;
  }
  el.innerHTML = devTeam.map((dev,di)=>{
    const wh  = planDevWeeklyHours(dev);
    const whT = Object.entries(wh).filter(([,v])=>v>0)
      .map(([k,v])=>`<span style="color:${POOL_COLORS[k]};font-weight:600">${k}: ${v.toFixed(1)}h/sem</span>`).join(' · ');
    const rows = CAL_DAYS.map(day=>{
      const slots = dev.schedule?.[day]||[];
      const tags  = slots.map((s,si)=>{
        const col = POOL_COLORS[s.pool];
        return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;
          border-radius:20px;font-size:9px;font-weight:600;background:${POOL_BGS[s.pool]};
          border:1px solid ${col};color:${col}">
          ${s.start}–${s.end} ${s.pool}
          <button onclick="planRemoveSlot(${di},'${day}',${si})"
            style="background:none;border:none;color:${col};cursor:pointer;font-size:10px;padding:0;margin-left:2px;line-height:1">×</button>
        </span>`;
      }).join('');
      return `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;min-height:28px">
        <div style="width:18px;font-size:9px;font-weight:700;color:#888;padding-top:5px;flex-shrink:0">${day}</div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;flex:1">${tags}</div>
        <button onclick="planAddSlot(${di},'${day}')"
          style="font-size:9px;padding:3px 8px;border:1px dashed #CCC;background:#fff;
                 border-radius:5px;cursor:pointer;color:#888;flex-shrink:0;white-space:nowrap"
          onmouseover="this.style.borderColor='#C4974A'" onmouseout="this.style.borderColor='#CCC'">
          + franja
        </button>
      </div>`;
    }).join('');
    return `<div style="background:#fff;border:1px solid #EBEBEB;border-radius:8px;padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:#111">${dev.name}</div>
        <div style="font-size:9px;color:#888">${whT||'Sin franjas configuradas'}</div>
      </div>
      ${rows}
    </div>`;
  }).join('');
}

function planAddSlot(di, day) {
  const container = document.querySelector(`#schedule-editor .dev-slot-${di}-${day}`) ||
    (() => {
      // Find the + button and insert form before it
      const allBtns = document.querySelectorAll('#schedule-editor button');
      return null;
    })();

  // Create inline form using a simple prompt approach
  const start = prompt('Hora inicio (HH:MM):', '09:00');
  if (!start) return;
  const end = prompt('Hora fin (HH:MM):', '13:00');
  if (!end) return;
  const pool = prompt('Pool (corto/medio/largo):', 'largo');
  if (!pool || !['corto','medio','largo'].includes(pool)) { toast('Pool inválido'); return; }
  if (start >= end) { toast('La hora fin debe ser posterior a la de inicio'); return; }

  if (!devTeam[di].schedule) devTeam[di].schedule = {};
  if (!devTeam[di].schedule[day]) devTeam[di].schedule[day] = [];
  devTeam[di].schedule[day].push({ start, end, pool });
  devTeam[di].schedule[day].sort((a,b) => a.start.localeCompare(b.start));

  if (typeof saveDevCapacity === 'function') saveDevCapacity();
  renderScheduleEditor();
  toast(`✓ Franja ${start}–${end} ${pool} añadida a ${devTeam[di].name} · ${day}`);
}

function planRemoveSlot(di, day, si) {
  devTeam[di].schedule?.[day]?.splice(si, 1);
  if (typeof saveDevCapacity === 'function') saveDevCapacity();
  renderScheduleEditor();
}

// ── Export ────────────────────────────────────────────────────
function exportPlanningExcel() {
  const timeline = planBuildTimeline();
  if (!timeline.length) { toast('Sin datos para exportar'); return; }
  const wb = XLSX.utils.book_new();
  const headers = ['Dev','Pool','#','Proyecto','Horas','h/sem','Semanas','Inicio','Fin est.','Score'];
  const rows = timeline.map((t,i) => {
    const qi = timeline.filter(x=>x.devName===t.devName&&x.pool===t.pool).indexOf(t)+1;
    return [t.devName, t.pool, qi, t.proj.nom, t.totalHours,
            +t.hoursPerWeek.toFixed(1), t.weeks,
            planFmtDate(t.startDate), planFmtDate(t.endDate), +(t.proj.sf||0).toFixed(2)];
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [14,8,4,40,8,7,8,14,14,7].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws, 'Planificación');
  if (activeProjects.length) {
    const ws2 = XLSX.utils.aoa_to_sheet([['Proyecto','Dev','Pool','Fin en curso'],
      ...activeProjects.map(a=>[a.nom,a.devName,a.pool,a.endDate])]);
    XLSX.utils.book_append_sheet(wb, ws2, 'En curso');
  }
  XLSX.writeFile(wb, `nexus_planning_${new Date().toISOString().split('T')[0]}.xlsx`);
  toast(`✓ ${timeline.length} proyectos exportados`);
}
