/* ═══════════════════════════════════════════════════════════════
   NEXUS PLANNING ENGINE
   
   Data model:
   
   devTeam[i] = {
     name:     'Juan',
     schedule: {
       L: [ {start:'08:00', end:'14:00', pool:'largo'},
            {start:'16:00', end:'17:00', pool:'corto'} ],
       M: [...], X: [...], J: [...], V: [...]
     }
   }
   
   activeProjects[i] = {
     nom:     'SAP Integration',
     pool:    'largo',
     devName: 'Juan',
     endDate: '2025-09-30'   // user-set completion date
   }
   
   planificar() returns:
   timeline[i] = {
     proj, startDate, endDate, devName, pool, weeks, daysToStart
   }
   ═══════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────
let activeProjects = [];   // projects currently in progress (user-set)

const DAYS = ['L','M','X','J','V'];
const DAY_NAMES = { L:'Lunes', M:'Martes', X:'Miércoles', J:'Jueves', V:'Viernes' };
const POOL_COLORS = { corto:'#C07800', medio:'#1848A0', largo:'#087B50' };
const POOL_BGS    = { corto:'#FAF5E6', medio:'#EEF3FC', largo:'#ECF8F3' };

// ── Weekly hours per dev per pool ─────────────────────────────
function devWeeklyHours(dev) {
  const h = { corto:0, medio:0, largo:0 };
  if (!dev.schedule) {
    // Legacy format: direct hours
    h.corto = parseFloat(dev.corto) || 0;
    h.medio = parseFloat(dev.medio) || 0;
    h.largo = parseFloat(dev.largo) || 0;
    return h;
  }
  DAYS.forEach(d => {
    (dev.schedule[d] || []).forEach(slot => {
      const [sh, sm] = slot.start.split(':').map(Number);
      const [eh, em] = slot.end.split(':').map(Number);
      const mins = (eh*60+em) - (sh*60+sm);
      if (mins > 0 && h[slot.pool] !== undefined) {
        h[slot.pool] += mins / 60;
      }
    });
  });
  return h;
}

// ── Get pool for a project by hours ──────────────────────────
function projectPool(p) {
  if (p.pool) return p.pool; // manual override
  const thrS = parseInt(document.getElementById('thr-s')?.value) || 30;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 100;
  const h = p.horas || 0;
  if (h <= 0)    return null;
  if (h < thrS)  return 'corto';
  if (h < thrM)  return 'medio';
  return 'largo';
}

// ── Main planning engine ──────────────────────────────────────
function planificar() {
  if (!devTeam || !devTeam.length) return [];
  // 1. Build dev availability: earliest start per dev per pool
  //    = max(today, max endDate of active projects for that dev+pool)
  const today = new Date(); today.setHours(0,0,0,0);

  // devState: { devName: { pool: Date(nextAvailable) } }
  const devState = {};
  devTeam.forEach(dev => {
    devState[dev.name] = { corto: new Date(today), medio: new Date(today), largo: new Date(today) };
    // Block from active projects
    activeProjects.forEach(ap => {
      if (ap.devName === dev.name && ap.endDate) {
        const end = new Date(ap.endDate + 'T00:00:00');
        if (end > devState[dev.name][ap.pool]) {
          devState[dev.name][ap.pool] = new Date(end);
        }
      }
    });
  });

  // 2. Get queue: projects with hours, sorted by score desc, skip actives
  const activeNoms = new Set(activeProjects.map(a => a.nom));
  const queue = portfolioData
    .filter(p => p.horas > 0 && !activeNoms.has(p.nom) && projectPool(p))
    .sort((a, b) => (b.sf || 0) - (a.sf || 0));

  // 3. For each project: find best dev for its pool
  const timeline = [];
  queue.forEach(p => {
    const pool = projectPool(p);
    if (!pool) return;

    // Find dev with most weekly hours in this pool (and earliest available)
    let bestDev = null, bestStart = null;
    devTeam.forEach(dev => {
      const wh = devWeeklyHours(dev)[pool];
      if (wh <= 0) return; // dev not assigned to this pool
      const avail = devState[dev.name]?.[pool] || new Date(today);
      if (!bestDev || avail < bestStart || (avail.getTime() === bestStart.getTime() && wh > devWeeklyHours(bestDev)[pool])) {
        bestDev = dev;
        bestStart = new Date(avail);
      }
    });

    if (!bestDev) return; // no dev for this pool

    const wh     = devWeeklyHours(bestDev)[pool];
    const weeks  = p.horas / wh;
    const days   = Math.ceil(weeks * 5); // working days
    const endDate = addWorkingDays(new Date(bestStart), days);

    timeline.push({
      proj:      p,
      pool,
      devName:   bestDev.name,
      startDate: new Date(bestStart),
      endDate:   new Date(endDate),
      hoursPerWeek: wh,
      totalHours: p.horas,
      weeks: +weeks.toFixed(1),
    });

    // Block this dev+pool until end of this project
    devState[bestDev.name][pool] = new Date(endDate);
  });

  return timeline;
}

// ── Add N working days to a date ─────────────────────────────
function addWorkingDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

// ── Format date ───────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateShort(d) {
  if (!d) return '—';
  return d.toLocaleDateString('es-ES', { day:'2-digit', month:'short' });
}

// ── Render planning screen ────────────────────────────────────
function renderPlanning() {
  const el = document.getElementById('planning-content');
  if (!el) return;

  if (!devTeam.length) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:#AAA;font-size:13px">
      Configura el equipo de desarrollo en ⚙ Configuración → Equipo para activar la planificación.
      <br><br>
      <button class="cfg-apply" onclick="goStep('config')" style="font-size:10px">
        Ir a Configuración →
      </button>
    </div>`;
    return;
  }

  const timeline = planificar();
  if (!timeline.length) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:#AAA;font-size:13px">
      No hay proyectos con horas estimadas en la cartera para planificar.
    </div>`;
    return;
  }

  // Group by dev+pool
  const byDev = {};
  devTeam.forEach(dev => {
    byDev[dev.name] = { corto:[], medio:[], largo:[] };
  });
  timeline.forEach(t => {
    if (byDev[t.devName]) byDev[t.devName][t.pool].push(t);
  });

  // Active projects section
  const activeHtml = activeProjects.length ? `
    <div class="cfg-section" style="margin-bottom:16px">
      <div class="cfg-sec-title">🔄 Proyectos en curso</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin-top:10px">
        ${activeProjects.map((ap, i) => `
          <div style="background:#fff;border:1px solid #EBEBEB;border-radius:8px;padding:10px 12px;
            border-left:3px solid ${POOL_COLORS[ap.pool]||'#CCC'}">
            <div style="font-size:11px;font-weight:700;color:#111;margin-bottom:4px;
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ap.nom}</div>
            <div style="font-size:9px;color:#666">
              <span style="color:${POOL_COLORS[ap.pool]};font-weight:600">${ap.pool}</span>
              · ${ap.devName}
              · fin: <strong>${ap.endDate || '—'}</strong>
            </div>
            <button onclick="removeActiveProject(${i})"
              style="margin-top:6px;font-size:8px;color:#CC1F26;border:none;background:none;
                     cursor:pointer;padding:0">✕ quitar</button>
          </div>`).join('')}
      </div>
    </div>` : '';

  // Timeline per dev
  const devHtml = devTeam.map(dev => {
    const pools = ['corto','medio','largo'];
    const hasAny = pools.some(p => byDev[dev.name]?.[p]?.length > 0);
    if (!hasAny) return '';

    const wh = devWeeklyHours(dev);
    const poolRows = pools.map(pool => {
      const items = byDev[dev.name]?.[pool] || [];
      if (!items.length) return '';
      return `
        <div style="margin-bottom:12px">
          <div style="font-size:9px;font-weight:700;color:${POOL_COLORS[pool]};
            text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;
            display:flex;align-items:center;gap:6px">
            <span style="background:${POOL_COLORS[pool]};color:#fff;padding:2px 8px;
              border-radius:12px">${pool}</span>
            ${wh[pool].toFixed(1)}h/sem
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${items.map((t, qi) => `
              <div style="display:grid;grid-template-columns:28px 1fr auto auto;
                gap:8px;align-items:center;padding:8px 10px;
                background:${qi===0?POOL_BGS[pool]:'#FAFAF8'};
                border:1px solid ${qi===0?POOL_COLORS[pool]:'#EBEBEB'};
                border-radius:7px">
                <div style="font-size:10px;font-weight:800;color:${POOL_COLORS[pool]};
                  text-align:center">#${qi+1}</div>
                <div style="min-width:0">
                  <div style="font-size:11px;font-weight:${qi===0?700:500};color:#111;
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${t.proj.nom}
                  </div>
                  <div style="font-size:9px;color:#888;margin-top:1px">
                    ${t.proj.horas}h · ${t.weeks}sem · score ${(t.proj.sf||0).toFixed(1)}
                  </div>
                </div>
                <div style="text-align:center;font-size:9px;color:#666;white-space:nowrap">
                  <div style="font-weight:600;color:#111">${fmtDateShort(t.startDate)}</div>
                  <div style="color:#AAA">inicio</div>
                </div>
                <div style="text-align:center;font-size:9px;white-space:nowrap">
                  <div style="font-weight:700;color:${POOL_COLORS[pool]}">${fmtDateShort(t.endDate)}</div>
                  <div style="color:#AAA">fin est.</div>
                </div>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="cfg-section" style="margin-bottom:12px">
        <div class="cfg-sec-title" style="display:flex;align-items:center;justify-content:space-between">
          <span style='display:flex;align-items:center;gap:6px'><span style='width:24px;height:24px;border-radius:50%;background:#111;color:#fff;font-size:9px;display:inline-flex;align-items:center;justify-content:center;font-weight:700'>${dev.name.charAt(0).toUpperCase()}</span>${dev.name}</span>
          <span style="font-size:9px;color:#AAA;font-weight:400">
            ${Object.entries(wh).filter(([,v])=>v>0).map(([k,v])=>`${k}: ${v.toFixed(1)}h/sem`).join(' · ')}
          </span>
        </div>
        ${poolRows}
      </div>`;
  }).join('');

  // Summary KPIs
  const totalProjs = timeline.length;
  const lastEnd = timeline.reduce((max, t) => t.endDate > max ? t.endDate : max, new Date(0));
  const totalWeeks = Math.ceil((lastEnd - new Date()) / (7*24*3600*1000));

  el.innerHTML = `
    <!-- KPI strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
      ${[
        ['Proyectos planificados', totalProjs, '#111'],
        ['En curso', activeProjects.length, '#1848A0'],
        ['En cola', totalProjs, '#087B50'],
        ['Horizonte', totalWeeks > 0 ? totalWeeks+'sem' : '—', '#C07800'],
      ].map(([label, val, color]) => `
        <div style="background:#fff;border:1px solid #EBEBEB;border-radius:8px;
          padding:10px 14px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:${color}">${val}</div>
          <div style="font-size:9px;color:#AAA;text-transform:uppercase;
            letter-spacing:.1em;margin-top:2px">${label}</div>
        </div>`).join('')}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px">
      <button onclick="exportPlanningExcel()"
        style="padding:8px 16px;font-size:10px;font-weight:700;border-radius:7px;
               border:none;background:#087B50;color:#fff;cursor:pointer">
        ↓ Exportar planificación Excel
      </button>
      <button onclick="renderPlanning()"
        style="padding:8px 16px;font-size:10px;font-weight:600;border-radius:7px;
               border:1px solid #DEDEDE;background:#fff;color:#666;cursor:pointer">
        ↺ Recalcular
      </button>
    </div>
    ${activeHtml}
    ${devHtml}`;
}

// ── Add active project modal ─────────────────────────────────
function openAddActiveProject() {
  const modal = document.getElementById('active-proj-modal');
  if (!modal) return;
  
  // Fill project selector
  const sel = document.getElementById('ap-project-sel');
  if (sel) {
    sel.innerHTML = '<option value="">— Selecciona proyecto —</option>'
      + portfolioData
          .filter(p => p.horas > 0)
          .sort((a,b) => (b.sf||0)-(a.sf||0))
          .map(p => `<option value="${p.nom}">${p.nom.substring(0,50)} · ${p.horas}h</option>`)
          .join('');
  }
  
  // Fill dev selector
  const devSel = document.getElementById('ap-dev-sel');
  if (devSel) {
    devSel.innerHTML = devTeam.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  }

  // Set default end date to 30 days from now
  const end = document.getElementById('ap-end-date');
  if (end) {
    const d = new Date(); d.setDate(d.getDate() + 30);
    end.value = d.toISOString().split('T')[0];
  }

  modal.style.display = 'flex';
}

function closeActiveModal() {
  const m = document.getElementById('active-proj-modal');
  if (m) m.style.display = 'none';
}

function saveActiveProject() {
  const nom    = document.getElementById('ap-project-sel')?.value;
  const devN   = document.getElementById('ap-dev-sel')?.value;
  const endD   = document.getElementById('ap-end-date')?.value;
  const poolOv = document.getElementById('ap-pool-sel')?.value;

  if (!nom || !devN || !endD) { toast('Completa todos los campos'); return; }

  // Determine pool
  const p = portfolioData.find(pr => pr.nom === nom);
  const pool = poolOv || (p ? projectPool(p) : 'medio');

  activeProjects.push({ nom, devName:devN, endDate:endD, pool });
  savePlanningState();
  closeActiveModal();
  renderPlanning();
  toast(`✓ "${nom.substring(0,30)}" marcado como en curso`);
}

function removeActiveProject(i) {
  activeProjects.splice(i, 1);
  savePlanningState();
  renderPlanning();
}

// ── Schedule config per dev ──────────────────────────────────
function renderScheduleEditor() {
  const el = document.getElementById('schedule-editor');
  if (!el) return;

  if (!devTeam.length) {
    el.innerHTML = '<div style="color:#AAA;font-size:11px;padding:10px 0">Añade desarrolladores en la sección anterior.</div>';
    return;
  }

  el.innerHTML = devTeam.map((dev, di) => {
    const wh = devWeeklyHours(dev);
    const schedHtml = DAYS.map(day => {
      const slots = dev.schedule?.[day] || [];
      return `
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px">
          <div style="width:24px;font-size:9px;font-weight:700;color:#666;
            padding-top:8px;flex-shrink:0">${day}</div>
          <div id="slots-${di}-${day}" style="display:flex;flex-wrap:wrap;gap:4px;flex:1">
            ${slots.map((s,si) => renderSlotTag(di, day, si, s)).join('')}
          </div>
          <button onclick="addSlot(${di},'${day}')"
            style="font-size:10px;padding:4px 8px;border:1px dashed #CCC;
                   background:#fff;border-radius:5px;cursor:pointer;color:#888;
                   flex-shrink:0;white-space:nowrap"
            onmouseover="this.style.borderColor='#C4974A'"
            onmouseout="this.style.borderColor='#CCC'">+ slot</button>
        </div>`;
    }).join('');

    return `
      <div style="background:#fff;border:1px solid #EBEBEB;border-radius:8px;
        padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;color:#111">👤 ${dev.name}</div>
          <div style="font-size:9px;color:#AAA">
            ${Object.entries(wh).filter(([,v])=>v>0)
              .map(([k,v])=>`<span style="color:${POOL_COLORS[k]}">${k}: ${v.toFixed(1)}h/sem</span>`)
              .join(' · ')}
          </div>
        </div>
        ${schedHtml}
      </div>`;
  }).join('');
}

function renderSlotTag(di, day, si, slot) {
  const col = POOL_COLORS[slot.pool] || '#CCC';
  const bg  = POOL_BGS[slot.pool]   || '#F5F5F5';
  return `<div style="display:inline-flex;align-items:center;gap:4px;
    padding:3px 8px;border-radius:20px;font-size:9px;font-weight:600;
    background:${bg};border:1px solid ${col};color:${col}">
    ${slot.start}–${slot.end} ${slot.pool}
    <button onclick="removeSlot(${di},'${day}',${si})"
      style="background:none;border:none;color:${col};cursor:pointer;
             font-size:10px;padding:0;line-height:1">×</button>
  </div>`;
}

function addSlot(di, day) {
  // Show inline mini-form
  const container = document.getElementById(`slots-${di}-${day}`);
  if (!container) return;
  
  // Defaults: 09:00-13:00 largo
  const form = document.createElement('div');
  form.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px;background:#F5F5F5;border-radius:6px;font-size:9px';
  form.innerHTML = `
    <input type="time" value="09:00" style="border:1px solid #DDD;border-radius:4px;padding:2px 4px;font-size:9px;width:70px">
    <span style="color:#AAA">→</span>
    <input type="time" value="13:00" style="border:1px solid #DDD;border-radius:4px;padding:2px 4px;font-size:9px;width:70px">
    <select style="border:1px solid #DDD;border-radius:4px;padding:2px;font-size:9px">
      <option value="corto">corto</option>
      <option value="medio">medio</option>
      <option value="largo" selected>largo</option>
    </select>
    <button style="background:#111;color:#fff;border:none;border-radius:4px;
      padding:2px 6px;cursor:pointer;font-size:9px">✓</button>
    <button style="background:none;border:none;color:#AAA;cursor:pointer;font-size:10px">✕</button>`;
  
  const inputs  = form.querySelectorAll('input[type=time]');
  const selects = form.querySelectorAll('select');
  const btns    = form.querySelectorAll('button');
  const startIn = inputs[0], endIn = inputs[1];
  const poolSel = selects[0];
  const confirmBtn = btns[0], cancelBtn = btns[1];

  cancelBtn.onclick = () => form.remove();
  confirmBtn.onclick = () => {
    const startIn = form.querySelectorAll('input[type=time]')[0];
    const endIn   = form.querySelectorAll('input[type=time]')[1];
    const poolSel = form.querySelector('select');
    const start = startIn.value;
    const end   = endIn.value;
    const pool  = poolSel.value;
    if (!start || !end || start >= end) { toast('Horario inválido'); return; }
    if (!devTeam[di].schedule) devTeam[di].schedule = {};
    if (!devTeam[di].schedule[day]) devTeam[di].schedule[day] = [];
    devTeam[di].schedule[day].push({ start, end, pool });
    devTeam[di].schedule[day].sort((a,b) => a.start.localeCompare(b.start));
    saveDevCapacity();
    renderScheduleEditor();
    if (typeof renderPlanning === 'function') renderPlanning();
    form.remove();
  };
  container.appendChild(form);
}

function removeSlot(di, day, si) {
  devTeam[di].schedule?.[day]?.splice(si, 1);
  saveDevCapacity();
  renderScheduleEditor();
  renderPlanning();
}

// ── Persistence ───────────────────────────────────────────────
function savePlanningState() {
  try {
    localStorage.setItem('nexus_active_projects', JSON.stringify(activeProjects));
  } catch(_) {}
}

function loadPlanningState() {
  try {
    const saved = localStorage.getItem('nexus_active_projects');
    if (saved) activeProjects = JSON.parse(saved);
  } catch(_) {}
}

// Export planning to Excel
function exportPlanningExcel() {
  const timeline = planificar();
  if (!timeline.length) { toast('Sin datos para exportar'); return; }

  const wb = XLSX.utils.book_new();
  const headers = ['Desarrollador','Pool','#','Proyecto','Horas',
                   'h/sem','Semanas','Inicio','Fin estimado','Score'];
  const rows = [];

  const byDev = {};
  devTeam.forEach(d => { byDev[d.name] = { corto:0, medio:0, largo:0 }; });
  timeline.forEach((t, i) => {
    const qi = timeline.filter(x => x.devName===t.devName && x.pool===t.pool)
                       .indexOf(t) + 1;
    rows.push([
      t.devName, t.pool, qi, t.proj.nom, t.totalHours,
      t.hoursPerWeek.toFixed(1), t.weeks,
      fmtDate(t.startDate), fmtDate(t.endDate),
      (t.proj.sf||0).toFixed(2)
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [12,8,4,40,8,8,8,14,14,8].map(w => ({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws, 'Planificación');

  // Active projects sheet
  if (activeProjects.length) {
    const ah = ['Proyecto','Desarrollador','Pool','Fin en curso'];
    const ar = activeProjects.map(a => [a.nom, a.devName, a.pool, a.endDate]);
    const ws2 = XLSX.utils.aoa_to_sheet([ah, ...ar]);
    XLSX.utils.book_append_sheet(wb, ws2, 'En curso');
  }

  XLSX.writeFile(wb, `nexus_planning_${new Date().toISOString().split('T')[0]}.xlsx`);
  toast(`✓ Planificación exportada (${timeline.length} proyectos)`);
}

/* ═══════════════════════════════════════════════════════════════
   NEXUS CALENDAR VIEWS
   
   Three views: Gantt · Monthly · Weekly
   All read from planificar() + activeProjects
   Drag-and-drop in Gantt locks the assignment
   ═══════════════════════════════════════════════════════════════ */

// ── Locked assignments (moved in Gantt) ───────────────────────
// { nom, devName, startDate (ISO), endDate (ISO) }
let lockedAssignments = [];

function saveLocked() {
  try { localStorage.setItem('nexus_locked', JSON.stringify(lockedAssignments)); } catch(_) {}
}
function loadLocked() {
  try {
    const s = localStorage.getItem('nexus_locked');
    if (s) lockedAssignments = JSON.parse(s);
  } catch(_) {}
}

// Build full timeline merging locked + auto
function buildTimeline() {
  const base = planificar();
  // Apply any locked overrides
  const lockedMap = {};
  lockedAssignments.forEach(l => { lockedMap[l.nom] = l; });
  return base.map(t => {
    const lock = lockedMap[t.proj.nom];
    if (lock) return {
      ...t,
      devName:   lock.devName,
      startDate: new Date(lock.startDate),
      endDate:   new Date(lock.endDate),
      locked:    true,
    };
    return t;
  });
}

// ── Calendar state ────────────────────────────────────────────
let calView      = 'gantt';   // 'gantt' | 'month' | 'week'
let calRefDate   = new Date();// anchor date
let dragState    = null;      // {nom, origStart, origDev, mouseOffset}

// ── Render calendar container ─────────────────────────────────
function renderCalendar() {
  const el = document.getElementById('calendar-container');
  if (!el) return;

  const timeline = buildTimeline();
  if (!timeline.length) {
    el.innerHTML = `<div style="padding:48px;text-align:center;color:#AAA;font-size:13px">
      No hay proyectos planificados. Configura el equipo y asegúrate de que los proyectos tienen horas estimadas.
    </div>`;
    return;
  }

  if (calView === 'gantt')  renderGantt(el, timeline);
  if (calView === 'month')  renderMonth(el, timeline);
  if (calView === 'week')   renderWeek(el, timeline);
}

// ═══ GANTT VIEW — see gantt engine below

// ═══ MONTHLY VIEW ═════════════════════════════════════════════
function renderMonth(el, timeline) {
  const y = calRefDate.getFullYear(), m = calRefDate.getMonth();
  const firstDay = new Date(y, m, 1);
  const lastDay  = new Date(y, m + 1, 0);
  const monthName = firstDay.toLocaleDateString('es-ES', { month:'long', year:'numeric' });

  // Build day cells
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null); // empty prefix
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(y, m, d));

  const cellsHtml = cells.map(day => {
    if (!day) return `<div style="background:#FAFAFA;border:1px solid #F5F5F5;
      border-radius:6px;min-height:80px"></div>`;

    const isToday = day.toDateString() === new Date().toDateString();
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

    // Projects active on this day
    const active = timeline.filter(t =>
      t.startDate <= day && t.endDate > day
    );

    const projTags = active.slice(0, 3).map(t => {
      const col = POOL_COLORS[t.pool];
      const bg  = t.locked ? col : POOL_BGS[t.pool];
      const tc  = t.locked ? '#fff' : col;
      // Daily hours for this project on this day
      const dev = devTeam.find(d => d.name === t.devName);
      const dow = ['D','L','M','X','J','V','S'][day.getDay()];
      const slots = dev?.schedule?.[dow] || [];
      const poolSlots = slots.filter(s => s.pool === t.pool);
      const hToday = poolSlots.reduce((sum, s) => {
        const [sh, sm] = s.start.split(':').map(Number);
        const [eh, em] = s.end.split(':').map(Number);
        return sum + ((eh*60+em) - (sh*60+sm)) / 60;
      }, 0);

      return `<div style="font-size:8px;font-weight:600;padding:2px 5px;border-radius:3px;
        background:${bg};color:${tc};border:1px solid ${col};margin-bottom:2px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%"
        title="${t.proj.nom} · ${t.devName}${hToday>0?' · '+hToday.toFixed(1)+'h':''}">
        ${t.proj.nom.substring(0,16)}${hToday > 0 ? ` <span style="opacity:.7">${hToday.toFixed(0)}h</span>` : ''}
      </div>`;
    }).join('');

    const moreCount = active.length - 3;

    return `<div style="background:${isWeekend?'#FAFAFA':'#fff'};
      border:1.5px solid ${isToday?'#C4974A':'#EBEBEB'};border-radius:6px;
      min-height:90px;padding:5px;overflow:hidden">
      <div style="font-size:9px;font-weight:${isToday?800:500};
        color:${isToday?'#C4974A':'#888'};margin-bottom:4px">
        ${day.getDate()}
      </div>
      ${projTags}
      ${moreCount > 0 ? `<div style="font-size:8px;color:#AAA">+${moreCount} más</div>` : ''}
    </div>`;
  }).join('');

  el.innerHTML = `
    <!-- Month nav -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <button onclick="calNav(-1)" style="padding:6px 14px;border:1px solid #DEDEDE;
        border-radius:6px;background:#fff;cursor:pointer;font-size:11px">← Anterior</button>
      <div style="font-size:14px;font-weight:700;color:#111;text-transform:capitalize">
        ${monthName}
      </div>
      <button onclick="calNav(1)" style="padding:6px 14px;border:1px solid #DEDEDE;
        border-radius:6px;background:#fff;cursor:pointer;font-size:11px">Siguiente →</button>
    </div>
    <!-- Day headers -->
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px">
      ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d =>
        `<div style="font-size:9px;font-weight:700;color:#AAA;text-align:center;
          text-transform:uppercase;letter-spacing:.08em;padding:4px 0">${d}</div>`
      ).join('')}
    </div>
    <!-- Day grid -->
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
      ${cellsHtml}
    </div>`;
}

// ═══ WEEKLY VIEW ══════════════════════════════════════════════
function renderWeek(el, timeline) {
  const weekStart = startOfWeek(calRefDate);
  const weekDays  = Array.from({length:5}, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const weekLabel = `${fmtDateShort(weekDays[0])} – ${fmtDateShort(weekDays[4])}`;

  // Build header
  const dayHeaders = weekDays.map(d => {
    const isToday = d.toDateString() === new Date().toDateString();
    return `<div style="text-align:center;padding:8px 4px;
      border-left:1px solid #EBEBEB;background:${isToday?'#FEF9EC':'#FAFAF8'}">
      <div style="font-size:9px;font-weight:700;color:${isToday?'#C4974A':'#888'};
        text-transform:uppercase;letter-spacing:.08em">
        ${d.toLocaleDateString('es-ES',{weekday:'short'})}
      </div>
      <div style="font-size:11px;font-weight:${isToday?800:500};
        color:${isToday?'#C4974A':'#111'}">
        ${d.getDate()}
      </div>
    </div>`;
  }).join('');

  // Build rows per dev
  const rowsHtml = devTeam.map(dev => {
    const devProjs = timeline.filter(t => t.devName === dev.name);

    const cellsHtml = weekDays.map(day => {
      const dow = ['D','L','M','X','J','V','S'][day.getDay()];
      const slots = dev.schedule?.[dow] || [];

      // Project active on this day for this dev
      const activeProj = devProjs.find(t => t.startDate <= day && t.endDate > day);

      // Show slots with project or free
      const slotsHtml = slots.length ? slots.map(slot => {
        const [sh,sm] = slot.start.split(':').map(Number);
        const [eh,em] = slot.end.split(':').map(Number);
        const h = ((eh*60+em)-(sh*60+sm))/60;
        const col = POOL_COLORS[slot.pool];
        const bg  = activeProj && activeProj.pool === slot.pool
          ? POOL_BGS[slot.pool] : '#F7F7F5';
        const projName = activeProj && activeProj.pool === slot.pool
          ? activeProj.proj.nom.substring(0,18) : '—';

        return `<div style="margin-bottom:3px;padding:4px 6px;border-radius:4px;
          background:${bg};border-left:3px solid ${col}">
          <div style="font-size:7px;color:${col};font-weight:700">
            ${slot.start}–${slot.end} · ${slot.pool} · ${h}h
          </div>
          <div style="font-size:8px;color:#555;font-weight:600;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${projName}
          </div>
        </div>`;
      }).join('') : `<div style="font-size:8px;color:#DDD;padding:4px;text-align:center">—</div>`;

      return `<div style="border-left:1px solid #EBEBEB;padding:6px 4px;min-height:80px">
        ${slotsHtml}
      </div>`;
    }).join('');

    const wh = devWeeklyHours(dev);
    return `
      <div style="display:grid;grid-template-columns:100px repeat(5,1fr);
        border-bottom:1px solid #F0F0F0;">
        <div style="padding:10px 8px;background:#FAFAF8;border-right:1px solid #EBEBEB;
          display:flex;flex-direction:column;justify-content:center">
          <div style="font-size:10px;font-weight:700;color:#111">${dev.name}</div>
          <div style="font-size:8px;color:#AAA;margin-top:2px">
            ${Object.entries(wh).filter(([,v])=>v>0)
              .map(([k,v])=>`<span style="color:${POOL_COLORS[k]}">${v.toFixed(0)}h</span>`)
              .join(' ')}
          </div>
        </div>
        ${cellsHtml}
      </div>`;
  }).join('');

  el.innerHTML = `
    <!-- Week nav -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <button onclick="calNav(-1)" style="padding:6px 14px;border:1px solid #DEDEDE;
        border-radius:6px;background:#fff;cursor:pointer;font-size:11px">← Semana anterior</button>
      <div style="font-size:13px;font-weight:700;color:#111">${weekLabel}</div>
      <button onclick="calNav(1)" style="padding:6px 14px;border:1px solid #DEDEDE;
        border-radius:6px;background:#fff;cursor:pointer;font-size:11px">Semana siguiente →</button>
    </div>
    <!-- Grid -->
    <div style="border:1px solid #EBEBEB;border-radius:8px;overflow:hidden">
      <!-- Header -->
      <div style="display:grid;grid-template-columns:100px repeat(5,1fr);
        background:#FAFAF8;border-bottom:2px solid #EBEBEB">
        <div style="padding:8px;font-size:9px;font-weight:700;color:#AAA;
          text-transform:uppercase;letter-spacing:.1em">Dev</div>
        ${dayHeaders}
      </div>
      ${rowsHtml}
    </div>`;
}

// ── Navigation helpers ────────────────────────────────────────
function calNav(dir) {
  if (calView === 'month') {
    calRefDate = new Date(calRefDate.getFullYear(), calRefDate.getMonth() + dir, 1);
  } else {
    calRefDate = new Date(calRefDate);
    calRefDate.setDate(calRefDate.getDate() + dir * 7);
  }
  renderCalendar();
}

function switchCalView(view) {
  calView = view;
  ['gantt','month','week'].forEach(v => {
    const btn = document.getElementById('cal-btn-'+v);
    if (btn) {
      btn.style.background = v === view ? '#111' : '#fff';
      btn.style.color      = v === view ? '#fff' : '#666';
      btn.style.borderColor= v === view ? '#111' : '#DEDEDE';
    }
  });
  renderCalendar();
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ═══════════════════════════════════════════════════════════════
   NEXUS GANTT ENGINE v2
   
   Key features:
   • No-overlap constraint: drag cascades all following projects (domino)
   • One project per dev per moment
   • Change history with timestamps
   • Resize handles on bars
   • Milestone markers (today line)
   • Critical path highlight (longest chain)
   • Progress % on bars
   • Mini-map / zoom
   ═══════════════════════════════════════════════════════════════ */

// ── Change history ────────────────────────────────────────────
let ganttHistory = [];

function ganttLogChange(action, nom, from, to, dev) {
  ganttHistory.unshift({
    ts:     new Date(),
    action, nom, from, to, dev,
  });
  if (ganttHistory.length > 50) ganttHistory.pop();
  renderGanttHistory();
}

function renderGanttHistory() {
  const el    = document.getElementById('gantt-history');
  const count = document.getElementById('changelog-count');
  if (count) count.textContent = ganttHistory.length;
  if (!el) return;

  if (!ganttHistory.length) {
    el.innerHTML = '<div style="font-size:10px;color:#CCC;padding:8px 0">Sin cambios registrados.</div>';
    return;
  }

  el.innerHTML = ganttHistory.map(h => {
    const ts = h.ts.toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'});
    const date = h.ts.toLocaleDateString('es-ES',{day:'2-digit',month:'short'});
    let detail = '';
    if (h.action === 'move') {
      detail = `<strong>${h.nom}</strong> → <span style="color:#1848A0">${h.dev}</span> · 
        <span style="text-decoration:line-through;color:#AAA">${h.from}</span> → 
        <span style="color:#087B50;font-weight:700">${h.to}</span>`;
    } else if (h.action === 'unlock') {
      detail = `<strong>${h.nom}</strong> desbloqueado → planificación automática`;
    } else if (h.action === 'active') {
      detail = `<strong>${h.nom}</strong> marcado como <em>en curso</em> hasta ${h.to}`;
    }
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:6px 8px;
      background:#fff;border-radius:6px;border:1px solid #F0F0F0;font-size:10px">
      <div style="flex-shrink:0;color:#AAA;white-space:nowrap">${date} ${ts}</div>
      <div style="flex:1;color:#555">${detail}</div>
    </div>`;
  }).join('');
}

function ganttClearLog() {
  ganttHistory = [];
  renderGanttHistory();
}

// ── Today button ──────────────────────────────────────────────
function ganttGoToday() {
  calRefDate = new Date();
  renderCalendar();
}

// ── Cascade / domino effect ───────────────────────────────────
// After moving a project, push all subsequent projects for same dev+pool
function cascadeAfter(timeline, movedNom, newEnd, devName, pool) {
  // Get all projects for this dev+pool after the moved one, sorted by startDate
  const chain = timeline
    .filter(t => t.devName === devName && t.pool === pool && t.proj.nom !== movedNom)
    .sort((a,b) => a.startDate - b.startDate);

  let cursor = new Date(newEnd);
  chain.forEach(t => {
    if (t.startDate < cursor) {
      // Push this project to start after cursor
      const dur = Math.ceil((t.endDate - t.startDate) / 86400000); // working days
      const newStart = nextWorkingDay(new Date(cursor));
      const newEnd2  = addWorkingDays(new Date(newStart), dur);

      const existing = lockedAssignments.findIndex(l => l.nom === t.proj.nom);
      const lock = {
        nom:       t.proj.nom,
        devName:   t.devName,
        startDate: newStart.toISOString(),
        endDate:   newEnd2.toISOString(),
      };
      if (existing >= 0) lockedAssignments[existing] = lock;
      else lockedAssignments.push(lock);

      cursor = new Date(newEnd2);
      // Update the in-memory timeline object too for next iteration
      t.startDate = new Date(newStart);
      t.endDate   = new Date(newEnd2);
    } else {
      cursor = new Date(t.endDate);
    }
  });
  saveLocked();
}

function nextWorkingDay(date) {
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

// ── Improved Gantt render ─────────────────────────────────────
function renderGantt(el, timeline) {
  if (!timeline.length) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:#AAA">
      Sin proyectos planificados. Configura el equipo y las horas de los proyectos.
    </div>`;
    return;
  }

  // Date range
  const today   = new Date(); today.setHours(0,0,0,0);
  const allDates = timeline.flatMap(t => [t.startDate, t.endDate]);
  let   minDate  = new Date(Math.min(...allDates));
  let   maxDate  = new Date(Math.max(...allDates));
  // Show at least 3 months
  const minSpan = 90 * 86400000;
  if (maxDate - minDate < minSpan) maxDate = new Date(minDate.getTime() + minSpan);
  // Always include today
  if (today < minDate) minDate = new Date(today.getTime() - 7*86400000);
  minDate = startOfWeek(minDate);
  maxDate.setDate(maxDate.getDate() + 14);

  const totalDays = Math.ceil((maxDate - minDate) / 86400000);
  const DAY_PX    = Math.max(20, Math.min(40, Math.floor(900 / totalDays)));
  const ROW_H     = 52;
  const HEAD_H    = 48;
  const LABEL_W   = 160;

  // Build weeks/months for header
  const headerMonths = [], headerWeeks = [];
  let d = new Date(minDate);
  while (d <= maxDate) {
    const leftPx = Math.round((d - minDate) / 86400000) * DAY_PX;
    if (d.getDate() <= 7) {
      headerMonths.push({
        label: d.toLocaleDateString('es-ES',{month:'short',year:'2-digit'}).replace(' ',`'`),
        left: leftPx
      });
    }
    if (d.getDay() === 1) { // Monday
      headerWeeks.push({
        label: d.getDate(),
        left: leftPx,
        isMonth: d.getDate() <= 7
      });
    }
    d.setDate(d.getDate() + 1);
  }

  // Today line
  const todayLeft = Math.round((today - minDate) / 86400000) * DAY_PX;

  // Group timeline by dev
  const devOrder = [...new Set(timeline.map(t => t.devName))];
  const totalW   = totalDays * DAY_PX;

  // Build grid lines (weeks)
  const gridLines = headerWeeks.map(w =>
    `<div style="position:absolute;left:${w.left}px;top:0;bottom:0;
      width:1px;background:${w.isMonth?'#E0E0E0':'#F5F5F5'}"></div>`
  ).join('');

  // Compute critical path (longest chain of sequential projects)
  const criticalDevs = new Set();
  devOrder.forEach(devName => {
    const devTimeline = timeline.filter(t => t.devName === devName);
    ['corto','medio','largo'].forEach(pool => {
      const chain = devTimeline.filter(t => t.pool === pool).sort((a,b) => a.startDate-b.startDate);
      if (chain.length > 0) {
        const totalHours = chain.reduce((s,t) => s + t.totalHours, 0);
        if (totalHours > 200) chain.forEach(t => criticalDevs.add(t.proj.nom));
      }
    });
  });

  // Build rows
  const rowsHtml = devOrder.map((devName, ri) => {
    const dev      = devTeam.find(d => d.name === devName) || { name: devName };
    const wh       = devWeeklyHours(dev);
    const devProjs = timeline.filter(t => t.devName === devName)
                             .sort((a,b) => a.startDate - b.startDate);

    const bars = devProjs.map((t, qi) => {
      const leftPx  = Math.max(0, Math.round((t.startDate - minDate) / 86400000) * DAY_PX);
      const widthPx = Math.max(2, Math.round((t.endDate - t.startDate) / 86400000) * DAY_PX);
      const col     = POOL_COLORS[t.pool] || '#888';
      const bgLight = POOL_BGS[t.pool]   || '#F5F5F5';
      const isCrit  = criticalDevs.has(t.proj.nom);
      const isLocked= t.locked;

      // Progress: if start is in past, compute %
      const elapsed = Math.max(0, Math.min(1,
        (today - t.startDate) / (t.endDate - t.startDate || 1)
      ));
      const progressW = Math.round(widthPx * elapsed);
      const pct = Math.round(elapsed * 100);

      const labelLen = Math.max(0, Math.floor((widthPx - 16) / 6.5));
      const label    = t.proj.nom.substring(0, labelLen) + (t.proj.nom.length > labelLen ? '…' : '');

      return `
        <div class="gantt-bar${isLocked?' gantt-locked':''}"
          data-nom="${escHtml(t.proj.nom)}"
          data-dev="${escHtml(devName)}"
          data-pool="${t.pool}"
          data-start="${t.startDate.toISOString()}"
          data-end="${t.endDate.toISOString()}"
          data-days="${Math.round((t.endDate - t.startDate)/86400000)}"
          draggable="true"
          ondragstart="ganttDragStart(event)"
          ondblclick="ganttUnlock('${escHtml(t.proj.nom)}')"
          title="${escHtml(t.proj.nom)}&#10;${t.proj.horas}h · ${t.weeks}sem&#10;${fmtDate(t.startDate)} → ${fmtDate(t.endDate)}&#10;Score: ${(t.proj.sf||0).toFixed(1)}&#10;${isLocked?'🔒 Asignado manualmente':'Auto-planificado'}&#10;Doble clic para desbloquear"
          style="
            position:absolute;
            left:${leftPx}px;
            width:${widthPx}px;
            top:10px;height:32px;
            border-radius:6px;
            cursor:grab;
            overflow:hidden;
            border:${isLocked?`2px solid ${col}`:`1.5px solid ${col}`};
            ${isCrit && !isLocked ? `box-shadow:0 0 0 2px rgba(204,31,38,.2);` : ''}
          ">
          <!-- Background -->
          <div style="position:absolute;inset:0;background:${isLocked?col:bgLight}"></div>
          <!-- Progress fill -->
          ${pct > 0 ? `<div style="position:absolute;left:0;top:0;bottom:0;width:${progressW}px;
            background:${isLocked?'rgba(255,255,255,.2)':col};opacity:${isLocked?.4:.25}"></div>` : ''}
          <!-- Content -->
          <div style="position:relative;z-index:2;display:flex;align-items:center;
            height:100%;padding:0 6px;gap:4px;pointer-events:none">
            ${isLocked ? `<span style="font-size:8px;flex-shrink:0">🔒</span>` : ''}
            <span style="font-size:9px;font-weight:700;
              color:${isLocked?'#fff':col};
              white-space:nowrap;overflow:hidden;flex:1">
              ${label}
            </span>
            ${pct > 0 && pct < 100 ? `<span style="font-size:8px;color:${isLocked?'rgba(255,255,255,.8)':col};
              opacity:.8;flex-shrink:0">${pct}%</span>` : ''}
            <span style="font-size:8px;color:${isLocked?'rgba(255,255,255,.7)':col};
              flex-shrink:0;opacity:.7">${(t.proj.sf||0).toFixed(1)}</span>
          </div>
          <!-- Resize handle right -->
          <div class="gantt-resize"
            data-nom="${escHtml(t.proj.nom)}"
            data-dev="${escHtml(devName)}"
            style="position:absolute;right:0;top:0;bottom:0;width:8px;
              cursor:ew-resize;background:${isLocked?'rgba(255,255,255,.2)':'transparent'};
              border-radius:0 6px 6px 0"
            onmousedown="ganttResizeStart(event)">
          </div>
        </div>`;
    }).join('');

    const bgRow = ri % 2 === 0 ? '#fff' : '#FDFDFD';
    const whLabel = Object.entries(wh).filter(([,v])=>v>0)
      .map(([k,v]) => `<span style="display:inline-block;width:6px;height:6px;
        border-radius:50%;background:${POOL_COLORS[k]};margin-right:2px"></span>${v.toFixed(0)}h`)
      .join(' ');

    return `
      <div style="display:flex;border-bottom:1px solid #F5F5F5;background:${bgRow}"
        ondragover="event.preventDefault()"
        ondrop="ganttDrop(event,'${escHtml(devName)}')"
        data-dev="${escHtml(devName)}">
        <!-- Dev label -->
        <div style="width:${LABEL_W}px;flex-shrink:0;padding:10px 14px;
          border-right:1px solid #EBEBEB;display:flex;flex-direction:column;justify-content:center">
          <div style="font-size:11px;font-weight:700;color:#111;display:flex;align-items:center;gap:6px">
            <span style="width:22px;height:22px;border-radius:50%;background:#111;color:#fff;
              font-size:9px;font-weight:800;display:inline-flex;align-items:center;
              justify-content:center;flex-shrink:0">${devName.charAt(0).toUpperCase()}</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${devName}</span>
          </div>
          <div style="font-size:8px;color:#AAA;margin-top:3px">${whLabel}</div>
        </div>
        <!-- Gantt row area -->
        <div style="flex:1;position:relative;height:${ROW_H}px;min-width:${totalW}px;overflow:hidden">
          ${gridLines}
          <!-- Today vertical line -->
          <div style="position:absolute;left:${todayLeft}px;top:0;bottom:0;
            width:2px;background:rgba(204,31,38,.6);z-index:30;pointer-events:none"></div>
          ${bars}
        </div>
      </div>`;
  }).join('');

  // Week scale header
  const weekScaleHtml = headerWeeks.map(w =>
    `<div style="position:absolute;left:${w.left}px;top:${w.isMonth?0:16}px;
      font-size:${w.isMonth?9:8}px;font-weight:${w.isMonth?700:400};
      color:${w.isMonth?'#111':'#AAA'};white-space:nowrap;
      padding-left:3px;border-left:${w.isMonth?'1px solid #D0D0D0':'none'}">
      ${w.isMonth ? w.label.toUpperCase() : w.label}
    </div>`
  ).join('');

  // Today label in header
  const todayLabelHtml = `<div style="position:absolute;left:${todayLeft}px;bottom:2px;
    transform:translateX(-50%);font-size:7px;font-weight:800;color:#CC1F26;
    white-space:nowrap;pointer-events:none">▼ HOY</div>`;

  el.innerHTML = `
    <div style="border:1px solid #EBEBEB;border-radius:10px;overflow:hidden;
      box-shadow:0 2px 8px rgba(0,0,0,.04)">
      <!-- Scale header -->
      <div style="display:flex;border-bottom:2px solid #EBEBEB">
        <div style="width:${LABEL_W}px;flex-shrink:0;border-right:1px solid #EBEBEB;
          background:#FAFAF8;padding:8px 14px;font-size:9px;font-weight:700;color:#AAA;
          text-transform:uppercase;letter-spacing:.1em;display:flex;align-items:flex-end">
          Equipo
        </div>
        <div style="flex:1;position:relative;height:${HEAD_H}px;min-width:${totalW}px;
          background:#FAFAF8;overflow:hidden">
          ${gridLines}
          ${weekScaleHtml}
          ${todayLabelHtml}
          <div style="position:absolute;left:${todayLeft}px;top:0;bottom:0;
            width:2px;background:rgba(204,31,38,.6);pointer-events:none"></div>
        </div>
      </div>
      <!-- Rows -->
      <div style="min-width:${totalW + LABEL_W}px">
        ${rowsHtml}
      </div>
    </div>
    <!-- Legend -->
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:9px;color:#AAA;
      align-items:center">
      ${Object.entries(POOL_COLORS).map(([k,c]) => `
        <span style="display:flex;align-items:center;gap:4px">
          <span style="width:12px;height:12px;border-radius:3px;background:${POOL_BGS[k]};
            border:1.5px solid ${c}"></span>${k}
        </span>`).join('')}
      <span style="display:flex;align-items:center;gap:4px">
        <span style="width:12px;height:12px;border-radius:3px;background:#087B50;
          border:2px solid #087B50"></span>bloqueado (manual)
      </span>
      <span style="color:#888">Arrastra → mueve con efecto dominó · Doble clic → desbloquear</span>
    </div>`;
}

// ── Override ganttDrop with domino cascade ────────────────────
function ganttDrop(e, targetDev) {
  e.preventDefault();
  const nom = e.dataTransfer.getData('text/plain');
  if (!nom || !dragState) return;

  const timeline  = buildTimeline();
  const t         = timeline.find(x => x.proj.nom === nom);
  if (!t) { dragState = null; return; }

  // Compute drop position → new start date
  const rowEl  = e.currentTarget;
  const allDates = timeline.flatMap(t2 => [t2.startDate, t2.endDate]);
  let   minDate  = new Date(Math.min(...allDates));
  const maxDate  = new Date(Math.max(...allDates));
  const totalDays= Math.ceil((maxDate - minDate) / 86400000) + 14;
  const dayPx    = Math.max(20, Math.min(40, Math.floor(900 / totalDays)));
  minDate        = startOfWeek(minDate);

  const rowRect  = rowEl.querySelector('[data-dev]')?.getBoundingClientRect()
                || rowEl.getBoundingClientRect();
  const dropX    = e.clientX - rowRect.left - 160; // subtract label width
  const dropDay  = Math.max(0, Math.round(dropX / dayPx));
  let   newStart = new Date(minDate);
  newStart.setDate(newStart.getDate() + dropDay);
  newStart = nextWorkingDay(newStart);

  // Compute new end
  const durDays = t.locked
    ? Math.ceil((t.endDate - t.startDate) / 86400000)
    : Math.ceil((t.proj.horas / (devWeeklyHours(devTeam.find(d=>d.name===targetDev)||{})
        [t.pool] || 1)) * 5);
  const newEnd = addWorkingDays(new Date(newStart), durDays);

  const prevStart = fmtDateShort(t.startDate);
  const prevDev   = t.devName;

  // Check for overlap with other projects of targetDev+pool
  // If overlap → push newStart after the conflicting end
  const conflicts = timeline.filter(x =>
    x.proj.nom !== nom &&
    x.devName === targetDev &&
    x.pool === t.pool &&
    x.startDate < newEnd &&
    x.endDate > newStart
  ).sort((a,b) => a.startDate - b.startDate);

  if (conflicts.length) {
    const lastConflictEnd = new Date(Math.max(...conflicts.map(c => c.endDate)));
    newStart = nextWorkingDay(new Date(lastConflictEnd));
    newEnd.setTime(addWorkingDays(new Date(newStart), durDays).getTime());
  }

  // Save locked assignment
  const existing = lockedAssignments.findIndex(l => l.nom === nom);
  const lock = { nom, devName:targetDev, startDate:newStart.toISOString(), endDate:newEnd.toISOString() };
  if (existing >= 0) lockedAssignments[existing] = lock;
  else lockedAssignments.push(lock);

  // 🎯 CASCADE: push all subsequent projects for targetDev+pool
  cascadeAfter(timeline, nom, newEnd, targetDev, t.pool);

  // If dev changed → also cascade original dev+pool
  if (prevDev !== targetDev) {
    cascadeAfter(timeline, nom, t.startDate, prevDev, t.pool);
  }

  saveLocked();
  ganttLogChange('move', nom,
    `${prevStart} (${prevDev})`,
    `${fmtDateShort(newStart)}–${fmtDateShort(newEnd)} (${targetDev})`,
    targetDev
  );
  dragState = null;
  renderCalendar();
  toast(`🎯 "${nom.substring(0,25)}" → ${targetDev} · ${fmtDateShort(newStart)}`);
}

// ── Resize handle ─────────────────────────────────────────────
let resizeState = null;
function ganttResizeStart(e) {
  e.preventDefault();
  e.stopPropagation();
  const bar   = e.currentTarget.parentElement;
  const nom   = bar.dataset.nom;
  const dev   = bar.dataset.dev;
  const start = new Date(bar.dataset.start);
  const end   = new Date(bar.dataset.end);
  resizeState = { nom, dev, start, end, startX: e.clientX };

  const onMove = (ev) => {
    if (!resizeState) return;
    // Calculate delta days from mouse move
    const timeline  = buildTimeline();
    const allDates  = timeline.flatMap(t=>[t.startDate,t.endDate]);
    const totalDays = Math.ceil((new Date(Math.max(...allDates)) - new Date(Math.min(...allDates)))/86400000)+14;
    const dayPx     = Math.max(20, Math.min(40, Math.floor(900/totalDays)));
    const deltaDays = Math.round((ev.clientX - resizeState.startX) / dayPx);
    if (deltaDays === 0) return;

    const newEnd = addWorkingDays(new Date(resizeState.end), deltaDays);
    if (newEnd <= resizeState.start) return;

    const existing = lockedAssignments.findIndex(l=>l.nom===resizeState.nom);
    const lock = { nom:resizeState.nom, devName:resizeState.dev,
                   startDate:resizeState.start.toISOString(), endDate:newEnd.toISOString() };
    if (existing>=0) lockedAssignments[existing]=lock;
    else lockedAssignments.push(lock);

    resizeState.startX = ev.clientX;
    resizeState.end = new Date(newEnd);
    saveLocked();
  };

  const onUp = () => {
    if (resizeState) {
      ganttLogChange('move', resizeState.nom,
        fmtDateShort(resizeState.start),
        fmtDateShort(resizeState.end),
        resizeState.dev
      );
      renderCalendar();
    }
    resizeState = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── Override ganttUnlock ──────────────────────────────────────
function ganttUnlock(nom) {
  lockedAssignments = lockedAssignments.filter(l => l.nom !== nom);
  saveLocked();
  ganttLogChange('unlock', nom, '', 'automático', '');
  renderCalendar();
  toast(`↺ "${nom.substring(0,25)}" → planificación automática`);
}
