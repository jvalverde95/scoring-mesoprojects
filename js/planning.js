/* ═══════════════════════════════════════════════════════════════
   NEXUS PLANNING & GANTT ENGINE  v4 — definitive
   ═══════════════════════════════════════════════════════════════

   STATE:
   - devTeam[]          global from sprint.js  {name, schedule:{L,M,X,J,V:[{start,end,pool}]}}
   - portfolioData[]    global from scoring.js
   - activeProjects[]   [{nom, devName, pool, endDate}]        ← in-progress, user-set
   - lockedAssignments[] [{nom, devName, startDate, endDate}]  ← dragged in Gantt
   - ganttHistory[]     change log

   ENGINE FLOW:
   planBuildTimeline() → sorted by score → auto-assign OR use lock
   planCascade()       → takes CURRENT timeline (not re-built), pushes followers
   renderCalendar()    → dispatches to renderGanttV3/MonthV3/WeekV3
                         uses container ID passed as param so works anywhere
   ═══════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────
var activeProjects    = [];
var lockedAssignments = [];
var ganttHistory      = [];
var calView           = 'gantt';
var calRefDate        = new Date();
var _dragNom          = null;   // track dragged project name

const POOL_COLORS = { corto:'#C07800', medio:'#1848A0', largo:'#087B50' };
const POOL_BGS    = { corto:'#FAF5E6', medio:'#EEF3FC', largo:'#ECF8F3' };
const CAL_DAYS    = ['L','M','X','J','V'];

// ── Persistence ────────────────────────────────────────────────
function savePlanningState() {
  try { localStorage.setItem('nexus_ap', JSON.stringify(activeProjects)); } catch(e) {}
}
function loadPlanningState() {
  try { var s=localStorage.getItem('nexus_ap'); if(s) activeProjects=JSON.parse(s); } catch(e) {}
}
function saveLocked() {
  try { localStorage.setItem('nexus_lk', JSON.stringify(lockedAssignments)); } catch(e) {}
}
function loadLocked() {
  try { var s=localStorage.getItem('nexus_lk'); if(s) lockedAssignments=JSON.parse(s); } catch(e) {}
}

// ── Utilities ──────────────────────────────────────────────────
function pFmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
}
function pShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'short'});
}
function pEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function pAddDays(date, n) {
  var d = new Date(date), added = 0;
  while (added < n) {
    d.setDate(d.getDate()+1);
    var dw = d.getDay();
    if (dw!==0 && dw!==6) added++;
  }
  return d;
}
function pNextWork(date) {
  var d = new Date(date);
  while (d.getDay()===0 || d.getDay()===6) d.setDate(d.getDate()+1);
  return d;
}
function pWeekStart(date) {
  var d = new Date(date);
  var diff = (d.getDay()===0 ? -6 : 1-d.getDay());
  d.setDate(d.getDate()+diff); d.setHours(0,0,0,0);
  return d;
}

// ── Weekly hours per dev per pool ──────────────────────────────
function pDevHours(dev) {
  var h = {corto:0, medio:0, largo:0};
  if (!dev) return h;
  if (dev.schedule) {
    CAL_DAYS.forEach(function(day) {
      (dev.schedule[day]||[]).forEach(function(slot) {
        var sh=parseInt(slot.start),sm=parseInt(slot.start.split(':')[1]||0);
        var eh=parseInt(slot.end),  em=parseInt(slot.end.split(':')[1]||0);
        var mins=(eh*60+em)-(sh*60+sm);
        if (mins>0 && h[slot.pool]!==undefined) h[slot.pool]+=mins/60;
      });
    });
  } else {
    h.corto=parseFloat(dev.corto)||0;
    h.medio=parseFloat(dev.medio)||0;
    h.largo=parseFloat(dev.largo)||0;
  }
  return h;
}

// ── Pool assignment ────────────────────────────────────────────
function pPool(p) {
  if (p.pool) return p.pool;
  var thrS=parseInt((document.getElementById('thr-s')||{}).value)||30;
  var thrM=parseInt((document.getElementById('thr-m')||{}).value)||100;
  var h=p.horas||0;
  if (h<=0) return null;
  if (h<thrS) return 'corto';
  if (h<thrM) return 'medio';
  return 'largo';
}

// ── Build timeline ─────────────────────────────────────────────
// Returns array of timeline items WITHOUT modifying lockedAssignments
function planBuildTimeline() {
  if (!devTeam || !devTeam.length) return [];

  var today = new Date(); today.setHours(0,0,0,0);

  // Build availability map per dev+pool
  var avail = {};
  devTeam.forEach(function(dev) {
    avail[dev.name] = {corto:new Date(today), medio:new Date(today), largo:new Date(today)};
  });

  // Block for active (in-progress) projects
  activeProjects.forEach(function(ap) {
    if (ap.endDate && avail[ap.devName] && avail[ap.devName][ap.pool]) {
      var end = new Date(ap.endDate+'T00:00:00');
      if (end > avail[ap.devName][ap.pool]) avail[ap.devName][ap.pool]=new Date(end);
    }
  });

  // Index locked assignments by nom
  var lockMap = {};
  lockedAssignments.forEach(function(l){ lockMap[l.nom]=l; });

  // Queue: projects with hours, sorted by score desc
  var activeNoms = {};
  activeProjects.forEach(function(a){ activeNoms[a.nom]=true; });
  var queue = (portfolioData||[])
    .filter(function(p){ return (p.horas||0)>0 && !activeNoms[p.nom] && pPool(p); })
    .slice().sort(function(a,b){ return (b.sf||0)-(a.sf||0); });

  var timeline = [];

  queue.forEach(function(p) {
    var pool = pPool(p);
    if (!pool) return;

    // Locked override
    if (lockMap[p.nom]) {
      var l = lockMap[p.nom];
      var devObj = devTeam.find(function(d){ return d.name===l.devName; })||{};
      var wh = pDevHours(devObj)[pool]||1;
      var item = {
        proj:p, pool:pool, devName:l.devName,
        startDate: new Date(l.startDate),
        endDate:   new Date(l.endDate),
        hoursPerWeek: wh,
        totalHours: p.horas,
        weeks: +(p.horas/wh).toFixed(1),
        locked: true
      };
      timeline.push(item);
      // Update avail so subsequent auto-assigned don't overlap
      if (avail[l.devName] && avail[l.devName][pool]) {
        var le = new Date(l.endDate);
        if (le > avail[l.devName][pool]) avail[l.devName][pool]=le;
      }
      return;
    }

    // Auto-assign: best dev = most hours in pool, earliest available
    var bestDev=null, bestStart=null, bestWh=0;
    devTeam.forEach(function(dev) {
      var wh = pDevHours(dev)[pool];
      if (wh<=0) return;
      var da = (avail[dev.name]||{})[pool] || new Date(today);
      if (!bestDev || da<bestStart || (da.getTime()===bestStart.getTime() && wh>bestWh)) {
        bestDev=dev; bestStart=new Date(da); bestWh=wh;
      }
    });
    if (!bestDev) return;

    var days  = Math.ceil((p.horas/bestWh)*5);
    var start = pNextWork(new Date(bestStart));
    var end   = pAddDays(new Date(start), days);

    timeline.push({
      proj:p, pool:pool, devName:bestDev.name,
      startDate:start, endDate:end,
      hoursPerWeek:bestWh, totalHours:p.horas,
      weeks:+(p.horas/bestWh).toFixed(1), locked:false
    });

    avail[bestDev.name][pool] = new Date(end);
  });

  return timeline;
}

// ── Cascade: push followers GIVEN an existing timeline ─────────
// Does NOT call planBuildTimeline() — avoids infinite rebuild loops
function planCascade(timeline, movedNom, newEnd, devName, pool) {
  var cursor = new Date(newEnd);
  // Get followers: same dev+pool, not the moved one, sorted by current startDate
  var chain = timeline
    .filter(function(t){ return t.devName===devName && t.pool===pool && t.proj.nom!==movedNom; })
    .slice().sort(function(a,b){ return a.startDate-b.startDate; });

  chain.forEach(function(t) {
    if (t.startDate < cursor) {
      var dur = Math.max(1, Math.ceil((t.endDate-t.startDate)/86400000));
      var ns  = pNextWork(new Date(cursor));
      var ne  = pAddDays(new Date(ns), dur);
      // Update or add lock for this follower
      var idx2 = lockedAssignments.findIndex(function(l){ return l.nom===t.proj.nom; });
      var lock = {nom:t.proj.nom, devName:devName, startDate:ns.toISOString(), endDate:ne.toISOString()};
      if (idx2>=0) lockedAssignments[idx2]=lock;
      else lockedAssignments.push(lock);
      // Also update the in-memory timeline item so next iteration is correct
      t.startDate=new Date(ns); t.endDate=new Date(ne);
      cursor=new Date(ne);
    } else {
      cursor=new Date(t.endDate);
    }
  });
  saveLocked();
}

// ── Change history ─────────────────────────────────────────────
function pLogChange(nom, from, to, dev) {
  ganttHistory.unshift({ts:new Date(), nom:nom, from:from, to:to, dev:dev});
  if (ganttHistory.length>30) ganttHistory.pop();
  pRenderHistory();
}
function pRenderHistory() {
  var el=document.getElementById('gantt-history');
  var ct=document.getElementById('changelog-count');
  if (ct) ct.textContent=ganttHistory.length;
  if (!el) return;
  if (!ganttHistory.length) {
    el.innerHTML='<div style="font-size:10px;color:#CCC;padding:8px 0">Sin cambios registrados.</div>';
    return;
  }
  el.innerHTML=ganttHistory.map(function(h){
    var ts=h.ts.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    var dt=h.ts.toLocaleDateString('es-ES',{day:'2-digit',month:'short'});
    return '<div style="display:flex;gap:10px;padding:6px 8px;background:#fff;border-radius:6px;border:1px solid #F0F0F0;font-size:10px;align-items:flex-start;margin-bottom:4px">'
      +'<div style="flex-shrink:0;color:#AAA;white-space:nowrap">'+dt+' '+ts+'</div>'
      +'<div style="flex:1;color:#555"><strong>'+h.nom+'</strong>'
      +(h.dev?' → <span style="color:#1848A0">'+h.dev+'</span>':'')
      +' · <span style="text-decoration:line-through;color:#AAA">'+h.from+'</span>'
      +' → <span style="color:#087B50;font-weight:700">'+h.to+'</span></div>'
      +'</div>';
  }).join('');
}
function ganttClearLog() {
  ganttHistory=[];
  pRenderHistory();
}
function ganttGoToday() {
  calRefDate=new Date();
  renderCalendar();
}

// ── Main render ────────────────────────────────────────────────
// containerId: the element to render into
// If called from step-planning → 'calendar-container'
// If called from step-sprint   → 'calendar-container-sprint' (not used, redirect to step-planning)
function renderCalendar() {
  var el=document.getElementById('calendar-container');
  if (!el) return;

  var hasDev  = devTeam && devTeam.length>0;
  var hasProj = portfolioData && portfolioData.some(function(p){ return (p.horas||0)>0; });

  if (!hasDev || !hasProj) {
    var steps=[];
    if (!hasDev)  steps.push('1 · Ve a <strong>⚙ Config → Equipo</strong> y añade un desarrollador con horario semanal');
    if (!hasProj) steps.push((hasDev?'1':'2')+' · <strong>Importa proyectos</strong> con horas estimadas');
    steps.push((steps.length+1)+' · Pulsa <strong>↺ Recalcular</strong>');

    el.innerHTML='<div style="max-width:480px;margin:40px auto;text-align:center">'
      +'<div style="font-size:40px;margin-bottom:16px">📅</div>'
      +'<div style="font-size:14px;font-weight:700;color:#111;margin-bottom:8px">Configura la planificación</div>'
      +'<div style="display:flex;flex-direction:column;gap:8px;text-align:left;margin-bottom:20px">'
      +steps.map(function(s){ return '<div style="padding:10px 14px;background:#F7F7F5;border-radius:8px;font-size:11px;color:#555">'+s+'</div>'; }).join('')
      +'</div>'
      +'<button onclick="planLoadDemo()" style="padding:10px 24px;font-size:11px;font-weight:700;border-radius:8px;border:none;background:#111;color:#fff;cursor:pointer;margin-right:8px">▶ Ver demo</button>'
      +'<button onclick="goStep(\'config\')" style="padding:10px 20px;font-size:11px;font-weight:600;border-radius:8px;border:1.5px solid #DEDEDE;background:#fff;color:#666;cursor:pointer">⚙ Config</button>'
      +'</div>';
    return;
  }

  var timeline=planBuildTimeline();
  if (!timeline.length) {
    el.innerHTML='<div style="padding:40px;text-align:center;color:#AAA;font-size:13px">'
      +'Sin proyectos planificables. Comprueba que los devs tienen franjas horarias en el pool correcto.'
      +'</div>';
    return;
  }

  if (calView==='gantt') renderGanttV4(el, timeline);
  if (calView==='month') renderMonthV4(el, timeline);
  if (calView==='week')  renderWeekV4(el, timeline);
}

// ════════════════════════════════════════════════════════════════
// GANTT V4 — robust, no-disappear
// ════════════════════════════════════════════════════════════════
function renderGanttV4(el, timeline) {
  var today=new Date(); today.setHours(0,0,0,0);

  // Date bounds
  var allMs = timeline.reduce(function(a,t){ a.push(+t.startDate,+t.endDate); return a; },[]);
  var minMs  = Math.min.apply(null,allMs);
  var maxMs  = Math.max.apply(null,allMs);
  var minDate=pWeekStart(new Date(minMs - 7*86400000));
  var maxDate=new Date(maxMs+21*86400000);
  if (+today < +minDate) minDate=pWeekStart(new Date(+today-7*86400000));

  var totalDays=Math.ceil((maxDate-minDate)/86400000);
  var DAY_PX   =Math.max(20,Math.min(40,Math.floor(920/totalDays)));
  var LABEL_W  =160;
  var ROW_H    =52;
  var HEAD_H   =44;
  var totalW   =totalDays*DAY_PX;

  // Week/month markers for header
  var markers=[];
  var d=new Date(minDate);
  while(d<=maxDate){
    var lx=Math.round((d-minDate)/86400000)*DAY_PX;
    if(d.getDay()===1){
      markers.push({lx:lx, label:d.getDate(), isMonth:d.getDate()<=7,
        monthLabel:d.toLocaleDateString('es-ES',{month:'short',year:'2-digit'})});
    }
    d.setDate(d.getDate()+1);
  }

  var todayX=Math.round((today-minDate)/86400000)*DAY_PX;

  // Grid lines HTML (reused in header and each row)
  var gridHtml=markers.map(function(m){
    return '<div style="position:absolute;left:'+m.lx+'px;top:0;bottom:0;width:1px;background:'+(m.isMonth?'#DEDEDE':'#F0F0F0')+';pointer-events:none"></div>';
  }).join('');

  // Header scale
  var scaleHtml=markers.map(function(m){
    return (m.isMonth
      ? '<div style="position:absolute;left:'+(m.lx+3)+'px;top:3px;font-size:9px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:.05em;pointer-events:none;white-space:nowrap">'+m.monthLabel+'</div>'
      : '<div style="position:absolute;left:'+(m.lx+2)+'px;top:22px;font-size:8px;color:#AAA;pointer-events:none">'+m.label+'</div>');
  }).join('');

  // Today marker
  var todayHtml='<div style="position:absolute;left:'+todayX+'px;top:0;bottom:0;width:2px;background:rgba(204,31,38,.55);pointer-events:none;z-index:20"></div>'
    +'<div style="position:absolute;left:'+(todayX-10)+'px;bottom:2px;font-size:7px;font-weight:800;color:#CC1F26;pointer-events:none;white-space:nowrap">▼HOY</div>';

  // Dev rows
  var devNames=[]; var seen={};
  timeline.forEach(function(t){ if(!seen[t.devName]){seen[t.devName]=true;devNames.push(t.devName);} });

  var rowsHtml=devNames.map(function(devName,ri){
    var dev=devTeam.find(function(d){return d.name===devName;})||{name:devName};
    var wh=pDevHours(dev);
    var projs=timeline.filter(function(t){return t.devName===devName;}).sort(function(a,b){return a.startDate-b.startDate;});

    var whHtml=Object.keys(wh).filter(function(k){return wh[k]>0;}).map(function(k){
      return '<span style="color:'+POOL_COLORS[k]+';font-weight:600">'+k+' '+wh[k].toFixed(0)+'h</span>';
    }).join(' · ');

    var barsHtml=projs.map(function(t){
      var lx=Math.max(0,Math.round((t.startDate-minDate)/86400000)*DAY_PX);
      var wpx=Math.max(4,Math.round((t.endDate-t.startDate)/86400000)*DAY_PX)-2;
      var col=POOL_COLORS[t.pool]||'#888';
      var bg=t.locked?col:(POOL_BGS[t.pool]||'#F5F5F5');
      var tc=t.locked?'#fff':col;
      var elapsed=Math.max(0,Math.min(1,(+today-+t.startDate)/(+t.endDate-+t.startDate||1)));
      var pct=Math.round(elapsed*100);
      var maxCh=Math.max(0,Math.floor((wpx-20)/6.5));
      var lbl=t.proj.nom.length>maxCh?t.proj.nom.slice(0,maxCh)+'…':t.proj.nom;
      var nomEsc=pEsc(t.proj.nom);
      var devEsc=pEsc(devName);

      return '<div'
        +' draggable="true"'
        +' data-nom="'+nomEsc+'" data-dev="'+devEsc+'" data-pool="'+t.pool+'"'
        +' ondragstart="ganttBarDragStart(event)"'
        +' ondragend="ganttBarDragEnd(event)"'
        +' ondblclick="ganttBarUnlock(\''+nomEsc+'\')"'
        +' title="'+nomEsc+'&#10;'+t.proj.horas+'h · '+t.weeks+'sem · score '+(t.proj.sf||0).toFixed(1)+'&#10;'
          +pShort(t.startDate)+' → '+pShort(t.endDate)+(t.locked?'&#10;🔒 Bloqueado — dbl-clic para liberar':'&#10;Auto-planificado')+'"'
        +' style="position:absolute;left:'+lx+'px;width:'+wpx+'px;top:9px;height:34px;'
          +'border-radius:6px;cursor:grab;overflow:hidden;'
          +'border:'+(t.locked?'2px':'1.5px')+' solid '+col+';'
          +'box-shadow:'+(t.locked?'0 2px 8px rgba(0,0,0,.18)':'none')+';'
          +'transition:box-shadow .15s;">'
        // bg fill
        +'<div style="position:absolute;inset:0;background:'+bg+'"></div>'
        // progress
        +(pct>0&&pct<100?'<div style="position:absolute;left:0;top:0;bottom:0;width:'+pct+'%;background:'+col+';opacity:.2"></div>':'')
        // label
        +'<div style="position:relative;z-index:2;height:100%;display:flex;align-items:center;padding:0 6px;gap:4px;pointer-events:none">'
          +(t.locked?'<span style="font-size:9px;flex-shrink:0">🔒</span>':'')
          +(wpx>40?'<span style="font-size:8.5px;font-weight:700;color:'+tc+';white-space:nowrap;overflow:hidden;flex:1">'+lbl+'</span>':'')
          +(wpx>60&&pct>0&&pct<100?'<span style="font-size:7px;color:'+tc+';opacity:.8;flex-shrink:0">'+pct+'%</span>':'')
          +(wpx>50?'<span style="font-size:7px;color:'+tc+';opacity:.7;flex-shrink:0">'+(t.proj.sf||0).toFixed(1)+'</span>':'')
        +'</div>'
        // resize handle
        +'<div onmousedown="ganttResizeStart(event,\''+nomEsc+'\',\''+devEsc+'\')" '
          +'style="position:absolute;right:0;top:0;bottom:0;width:8px;cursor:ew-resize;z-index:5;'
          +'background:rgba(0,0,0,.05);border-radius:0 6px 6px 0"></div>'
        +'</div>';
    }).join('');

    var bg=ri%2===0?'#fff':'#FDFDFD';
    return '<div style="display:flex;border-bottom:1px solid #F0F0F0;background:'+bg+'"'
      +' ondragover="event.preventDefault()"'
      +' ondrop="ganttRowDrop(event,\''+pEsc(devName)+'\')"'
      +'>'
      // Label
      +'<div style="width:'+LABEL_W+'px;flex-shrink:0;padding:8px 12px;border-right:1px solid #EBEBEB;'
        +'display:flex;flex-direction:column;justify-content:center">'
        +'<div style="display:flex;align-items:center;gap:6px">'
          +'<div style="width:22px;height:22px;border-radius:50%;background:#111;color:#fff;'
            +'font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
            +devName.charAt(0).toUpperCase()
          +'</div>'
          +'<span style="font-size:10px;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+devName+'</span>'
        +'</div>'
        +'<div style="font-size:8px;color:#AAA;margin-top:3px">'+whHtml+'</div>'
      +'</div>'
      // Gantt area — this is the drop target for position calculation
      +'<div id="gantt-row-'+ri+'" style="flex:1;position:relative;height:'+ROW_H+'px;min-width:'+totalW+'px;overflow:hidden"'
        +' ondragover="event.preventDefault()"'
        +' ondrop="ganttAreaDrop(event,\''+pEsc(devName)+'\','+ri+')"'
        +'>'
        +gridHtml
        +todayHtml
        +barsHtml
      +'</div>'
      +'</div>';
  }).join('');

  el.innerHTML=
    '<div style="border:1px solid #EBEBEB;border-radius:10px;overflow-x:auto;'
      +'box-shadow:0 2px 8px rgba(0,0,0,.04)">'
    // Header
    +'<div style="display:flex;border-bottom:2px solid #EBEBEB;position:sticky;top:0;z-index:50;background:#fff">'
      +'<div style="width:'+LABEL_W+'px;flex-shrink:0;border-right:1px solid #EBEBEB;background:#FAFAF8;'
        +'padding:8px 12px;font-size:8px;font-weight:700;color:#AAA;text-transform:uppercase;'
        +'letter-spacing:.1em;display:flex;align-items:flex-end">Equipo</div>'
      +'<div style="flex:1;position:relative;height:'+HEAD_H+'px;min-width:'+totalW+'px;background:#FAFAF8;overflow:hidden">'
        +gridHtml+scaleHtml+todayHtml
      +'</div>'
    +'</div>'
    // Rows
    +'<div style="min-width:'+(totalW+LABEL_W)+'px">'+rowsHtml+'</div>'
    +'</div>'
    // Legend
    +'<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:9px;color:#888;align-items:center">'
    +Object.keys(POOL_COLORS).map(function(k){
      return '<span style="display:flex;align-items:center;gap:4px">'
        +'<span style="width:10px;height:10px;border-radius:2px;background:'+POOL_BGS[k]+';border:1.5px solid '+POOL_COLORS[k]+'"></span>'+k
        +'</span>';
    }).join('')
    +'<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:#087B50;border:2px solid #087B50"></span>bloqueado</span>'
    +'<span>Arrastra para mover · efecto dominó · dbl-clic para liberar · ▐ para redimensionar</span>'
    +'</div>';

  // Store render params globally for drop calculation
  window._ganttRender = {minDate:minDate, maxDate:maxDate, totalDays:totalDays, DAY_PX:DAY_PX, LABEL_W:LABEL_W};
}

// ── Gantt drag events ──────────────────────────────────────────
function ganttBarDragStart(e) {
  _dragNom = e.currentTarget.dataset.nom;
  e.dataTransfer.setData('text/plain', _dragNom);
  e.dataTransfer.effectAllowed = 'move';
  // Make bar semi-transparent
  setTimeout(function(){ e.currentTarget.style.opacity='.4'; }, 0);
}
function ganttBarDragEnd(e) {
  e.currentTarget.style.opacity = '1';
}
function ganttBarUnlock(nom) {
  lockedAssignments = lockedAssignments.filter(function(l){ return l.nom!==nom; });
  saveLocked();
  pLogChange(nom, '🔒 bloqueado', '↺ automático', '');
  renderCalendar();
  toast('↺ "'+nom.substring(0,28)+'" → planificación automática');
}

// Drop on row (for dev reassignment — position at start of row)
function ganttRowDrop(e, targetDev) {
  e.preventDefault();
  // Delegate to area drop with no position info → place at dev's next available
  var nom = e.dataTransfer.getData('text/plain') || _dragNom;
  if (!nom) return;
  ganttDoMove(nom, targetDev, null);
}

// Drop on gantt area (precise position from mouse X)
function ganttAreaDrop(e, targetDev, rowIdx) {
  e.preventDefault();
  var nom = e.dataTransfer.getData('text/plain') || _dragNom;
  if (!nom) return;

  var r = window._ganttRender;
  if (!r) { ganttDoMove(nom, targetDev, null); return; }

  // Get the gantt area element (not including label)
  var areaEl = document.getElementById('gantt-row-'+rowIdx);
  if (!areaEl) { ganttDoMove(nom, targetDev, null); return; }
  var rect = areaEl.getBoundingClientRect();
  var dropX = e.clientX - rect.left;
  var dropDays = Math.max(0, Math.round(dropX / r.DAY_PX));
  var newStart = new Date(r.minDate);
  newStart.setDate(newStart.getDate() + dropDays);
  newStart = pNextWork(newStart);
  ganttDoMove(nom, targetDev, newStart);
}

// Core move logic
function ganttDoMove(nom, targetDev, newStart) {
  var timeline = planBuildTimeline();
  var t = timeline.find(function(x){ return x.proj.nom===nom; });
  if (!t) { _dragNom=null; return; }

  var pool = t.pool;

  // Compute duration from current assignment
  var durDays = Math.max(1, Math.ceil((+t.endDate - +t.startDate)/86400000));

  // If no position given, use dev's next available after their last project
  if (!newStart) {
    var devProjs = timeline.filter(function(x){ return x.devName===targetDev && x.pool===pool && x.proj.nom!==nom; });
    var lastEnd = devProjs.reduce(function(mx,x){ return x.endDate>mx?x.endDate:mx; }, new Date());
    newStart = pNextWork(lastEnd.getTime()>Date.now() ? lastEnd : new Date());
  }

  // Anti-overlap: push past any conflict for targetDev+pool
  var conflicts = timeline.filter(function(x){
    return x.proj.nom!==nom && x.devName===targetDev && x.pool===pool
      && +x.startDate < +newStart+durDays*86400000 && +x.endDate > +newStart;
  }).sort(function(a,b){ return a.startDate-b.startDate; });

  conflicts.forEach(function(c) {
    if (+c.endDate > +newStart) {
      newStart = pNextWork(new Date(+c.endDate));
    }
  });

  var newEnd = pAddDays(new Date(newStart), durDays);

  var prevDev   = t.devName;
  var prevStart = pShort(t.startDate);

  // Save lock for the moved project
  var idx = lockedAssignments.findIndex(function(l){ return l.nom===nom; });
  var lock = {nom:nom, devName:targetDev, startDate:newStart.toISOString(), endDate:newEnd.toISOString()};
  if (idx>=0) lockedAssignments[idx]=lock; else lockedAssignments.push(lock);

  // Rebuild timeline with the new lock applied, then cascade followers
  var timeline2 = planBuildTimeline();
  planCascade(timeline2, nom, newEnd, targetDev, pool);
  // Also cascade original dev if dev changed
  if (prevDev !== targetDev) {
    var timeline3 = planBuildTimeline();
    planCascade(timeline3, nom, t.startDate, prevDev, pool);
  }

  pLogChange(nom, prevStart+' ('+prevDev+')', pShort(newStart)+' ('+targetDev+')', targetDev);
  _dragNom = null;
  renderCalendar();
  toast('✓ "'+nom.substring(0,28)+'" → '+targetDev+' · '+pShort(newStart));
}

// ── Resize ─────────────────────────────────────────────────────
var _resizeState = null;
function ganttResizeStart(e, nom, dev) {
  e.preventDefault(); e.stopPropagation();
  var timeline = planBuildTimeline();
  var t = timeline.find(function(x){ return x.proj.nom===nom; });
  if (!t) return;
  _resizeState = {nom:nom, dev:dev, origStart:new Date(t.startDate), origEnd:new Date(t.endDate), mouseX:e.clientX};

  function onMove(ev) {
    if (!_resizeState) return;
    var r = window._ganttRender;
    if (!r) return;
    var deltaDays = Math.round((ev.clientX - _resizeState.mouseX) / r.DAY_PX);
    if (deltaDays===0) return;
    var ne = pAddDays(new Date(_resizeState.origEnd), deltaDays);
    if (+ne <= +_resizeState.origStart) return;
    var idx2 = lockedAssignments.findIndex(function(l){ return l.nom===_resizeState.nom; });
    var lock = {nom:_resizeState.nom, devName:_resizeState.dev,
      startDate:_resizeState.origStart.toISOString(), endDate:ne.toISOString()};
    if (idx2>=0) lockedAssignments[idx2]=lock; else lockedAssignments.push(lock);
    _resizeState.origEnd = ne;
    _resizeState.mouseX  = ev.clientX;
    saveLocked();
  }
  function onUp() {
    if (_resizeState) {
      pLogChange(_resizeState.nom, pShort(_resizeState.origStart), pShort(_resizeState.origEnd), _resizeState.dev);
      renderCalendar();
    }
    _resizeState = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ════════════════════════════════════════════════════════════════
// MONTHLY VIEW V4
// ════════════════════════════════════════════════════════════════
function renderMonthV4(el, timeline) {
  var y=calRefDate.getFullYear(), m=calRefDate.getMonth();
  var first=new Date(y,m,1), last=new Date(y,m+1,0);
  var name=first.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  var startDow=(first.getDay()+6)%7;
  var cells=[];
  for(var i=0;i<startDow;i++) cells.push(null);
  for(var i=1;i<=last.getDate();i++) cells.push(new Date(y,m,i));

  var html2=cells.map(function(day){
    if(!day) return '<div style="background:#FAFAFA;border:1px solid #F5F5F5;border-radius:6px;min-height:80px"></div>';
    var isToday=day.toDateString()===new Date().toDateString();
    var isWk=day.getDay()===0||day.getDay()===6;
    var active=timeline.filter(function(t){ return +t.startDate<=+day && +t.endDate>+day; });
    var tags=active.slice(0,3).map(function(t){
      return '<div style="font-size:8px;font-weight:600;padding:2px 5px;border-radius:3px;'
        +'background:'+POOL_BGS[t.pool]+';border:1px solid '+POOL_COLORS[t.pool]+';color:'+POOL_COLORS[t.pool]+';'
        +'margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+t.proj.nom+' · '+t.devName+'">'
        +t.proj.nom.substring(0,16)+'</div>';
    }).join('');
    var more=active.length-3;
    return '<div style="background:'+(isWk?'#FAFAFA':'#fff')+';'
      +'border:'+(isToday?'2px solid #C4974A':'1px solid #EBEBEB')+';border-radius:6px;min-height:80px;padding:5px;overflow:hidden">'
      +'<div style="font-size:9px;font-weight:'+(isToday?700:400)+';color:'+(isToday?'#C4974A':'#999')+';margin-bottom:3px">'+day.getDate()+'</div>'
      +tags+(more>0?'<div style="font-size:8px;color:#AAA">+'+more+'</div>':'')
      +'</div>';
  }).join('');

  el.innerHTML=
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
      +'<button onclick="calNav(-1)" style="padding:6px 14px;border:1px solid #DEDEDE;border-radius:6px;background:#fff;cursor:pointer;font-size:11px">←</button>'
      +'<div style="font-size:14px;font-weight:700;color:#111;text-transform:capitalize">'+name+'</div>'
      +'<button onclick="calNav(1)" style="padding:6px 14px;border:1px solid #DEDEDE;border-radius:6px;background:#fff;cursor:pointer;font-size:11px">→</button>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px">'
    +['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(function(d){
      return '<div style="font-size:9px;font-weight:700;color:#AAA;text-align:center;text-transform:uppercase;padding:4px 0">'+d+'</div>';
    }).join('')
    +'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">'+html2+'</div>';
}

// ════════════════════════════════════════════════════════════════
// WEEKLY VIEW V4
// ════════════════════════════════════════════════════════════════
function renderWeekV4(el, timeline) {
  var ws=pWeekStart(calRefDate);
  var days=[];
  for(var i=0;i<5;i++){ var d=new Date(ws); d.setDate(d.getDate()+i); days.push(d); }
  var label=pShort(days[0])+' – '+pShort(days[4]);

  var hdr=days.map(function(d){
    var isT=d.toDateString()===new Date().toDateString();
    return '<div style="text-align:center;padding:8px 4px;border-left:1px solid #EBEBEB;background:'+(isT?'#FEF9EC':'#FAFAF8')+'">'
      +'<div style="font-size:9px;font-weight:700;color:'+(isT?'#C4974A':'#888')+';text-transform:uppercase">'
        +d.toLocaleDateString('es-ES',{weekday:'short'})+'</div>'
      +'<div style="font-size:12px;font-weight:'+(isT?700:400)+';color:'+(isT?'#C4974A':'#111')+'">'+d.getDate()+'</div>'
    +'</div>';
  }).join('');

  var rows=devTeam.map(function(dev){
    var devTL=timeline.filter(function(t){return t.devName===dev.name;});
    var wh=pDevHours(dev);
    var whT=Object.keys(wh).filter(function(k){return wh[k]>0;})
      .map(function(k){return '<span style="color:'+POOL_COLORS[k]+'">'+wh[k].toFixed(0)+'h</span>';}).join(' ');

    var cells=days.map(function(day){
      var dw=['D','L','M','X','J','V','S'][day.getDay()];
      var slots=(dev.schedule||{})[dw]||[];
      var ap=devTL.find(function(t){return +t.startDate<=+day && +t.endDate>+day;});
      var sHtml=slots.length?slots.map(function(slot){
        var sh=parseInt(slot.start),sm=parseInt(slot.start.split(':')[1]||0);
        var eh=parseInt(slot.end),  em=parseInt(slot.end.split(':')[1]||0);
        var h=((eh*60+em)-(sh*60+sm))/60;
        var col=POOL_COLORS[slot.pool];
        var bg=ap&&ap.pool===slot.pool?POOL_BGS[slot.pool]:'#F7F7F5';
        var prj=ap&&ap.pool===slot.pool?ap.proj.nom.substring(0,18):'—';
        return '<div style="margin-bottom:2px;padding:3px 5px;border-radius:4px;background:'+bg+';border-left:3px solid '+col+'">'
          +'<div style="font-size:7px;color:'+col+';font-weight:700">'+slot.start+'–'+slot.end+' '+slot.pool+' '+h+'h</div>'
          +'<div style="font-size:8px;color:#555;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+prj+'</div>'
          +'</div>';
      }).join('')
      :'<div style="font-size:8px;color:#DDD;padding:6px;text-align:center">—</div>';
      return '<div style="border-left:1px solid #EBEBEB;padding:5px 4px;min-height:70px">'+sHtml+'</div>';
    }).join('');

    return '<div style="display:grid;grid-template-columns:100px repeat(5,1fr);border-bottom:1px solid #F0F0F0">'
      +'<div style="padding:8px;background:#FAFAF8;border-right:1px solid #EBEBEB;display:flex;flex-direction:column;justify-content:center">'
        +'<div style="font-size:10px;font-weight:700;color:#111">'+dev.name+'</div>'
        +'<div style="font-size:8px;color:#AAA;margin-top:2px">'+whT+'</div>'
      +'</div>'
      +cells
      +'</div>';
  }).join('');

  el.innerHTML=
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
      +'<button onclick="calNav(-1)" style="padding:6px 14px;border:1px solid #DEDEDE;border-radius:6px;background:#fff;cursor:pointer;font-size:11px">← Semana anterior</button>'
      +'<div style="font-size:13px;font-weight:700;color:#111">'+label+'</div>'
      +'<button onclick="calNav(1)" style="padding:6px 14px;border:1px solid #DEDEDE;border-radius:6px;background:#fff;cursor:pointer;font-size:11px">Semana siguiente →</button>'
    +'</div>'
    +'<div style="border:1px solid #EBEBEB;border-radius:8px;overflow:hidden">'
      +'<div style="display:grid;grid-template-columns:100px repeat(5,1fr);background:#FAFAF8;border-bottom:2px solid #EBEBEB">'
        +'<div style="padding:8px;font-size:9px;font-weight:700;color:#AAA;text-transform:uppercase">Dev</div>'
        +hdr
      +'</div>'
      +rows
    +'</div>';
}

// ── Calendar navigation ────────────────────────────────────────
function calNav(dir) {
  if (calView==='month') {
    calRefDate=new Date(calRefDate.getFullYear(), calRefDate.getMonth()+dir, 1);
  } else {
    calRefDate=new Date(+calRefDate+dir*7*86400000);
  }
  renderCalendar();
}

function switchCalView(v) {
  calView=v;
  ['gantt','month','week'].forEach(function(name){
    var btn=document.getElementById('cal-btn-'+name);
    if(!btn) return;
    var on=name===v;
    btn.style.background  =on?'#111':'transparent';
    btn.style.color       =on?'#fff':'#666';
    btn.style.borderColor =on?'#111':'transparent';
  });
  renderCalendar();
}

// ── Active project management ──────────────────────────────────
function openAddActiveProject() {
  var modal=document.getElementById('active-proj-modal');
  if(!modal) return;
  var sel=document.getElementById('ap-project-sel');
  if(sel) {
    sel.innerHTML='<option value="">— Selecciona —</option>'
      +(portfolioData||[]).filter(function(p){return (p.horas||0)>0;})
        .sort(function(a,b){return (b.sf||0)-(a.sf||0);})
        .map(function(p){return '<option value="'+pEsc(p.nom)+'">'+p.nom.substring(0,50)+' · '+p.horas+'h</option>';})
        .join('');
  }
  var dsel=document.getElementById('ap-dev-sel');
  if(dsel) dsel.innerHTML=devTeam.map(function(d){return '<option>'+d.name+'</option>';}).join('');
  var end=document.getElementById('ap-end-date');
  if(end){var nd=new Date();nd.setDate(nd.getDate()+30);end.value=nd.toISOString().split('T')[0];}
  modal.style.display='flex';
}
function closeActiveModal() {
  var m=document.getElementById('active-proj-modal'); if(m) m.style.display='none';
}
function saveActiveProject() {
  var nom =(document.getElementById('ap-project-sel')||{}).value;
  var dev =(document.getElementById('ap-dev-sel')||{}).value;
  var end =(document.getElementById('ap-end-date')||{}).value;
  var pool=(document.getElementById('ap-pool-sel')||{}).value;
  if(!nom||!dev||!end){toast('Completa todos los campos');return;}
  var p=(portfolioData||[]).find(function(pr){return pr.nom===nom;});
  var rPool=pool||(p?pPool(p):'medio');
  activeProjects.push({nom:nom,devName:dev,endDate:end,pool:rPool});
  savePlanningState();
  pLogChange(nom,'—',end,dev);
  closeActiveModal();
  renderCalendar();
  toast('✓ "'+nom.substring(0,28)+'" en curso hasta '+end);
}
function removeActiveProject(i) {
  activeProjects.splice(i,1);
  savePlanningState();
  renderCalendar();
}

// ── Demo data ──────────────────────────────────────────────────
function planLoadDemo() {
  if (!devTeam.length) {
    devTeam.push({name:'Ana García',schedule:{
      L:[{start:'09:00',end:'13:00',pool:'largo'},{start:'15:00',end:'17:00',pool:'corto'}],
      M:[{start:'09:00',end:'13:00',pool:'largo'},{start:'15:00',end:'17:00',pool:'medio'}],
      X:[{start:'09:00',end:'14:00',pool:'largo'}],
      J:[{start:'09:00',end:'13:00',pool:'medio'},{start:'15:00',end:'17:00',pool:'corto'}],
      V:[{start:'09:00',end:'13:00',pool:'largo'}]
    }});
    devTeam.push({name:'Marc Torres',schedule:{
      L:[{start:'08:00',end:'12:00',pool:'medio'},{start:'14:00',end:'16:00',pool:'corto'}],
      M:[{start:'08:00',end:'12:00',pool:'largo'}],
      X:[{start:'08:00',end:'12:00',pool:'largo'},{start:'14:00',end:'16:00',pool:'medio'}],
      J:[{start:'08:00',end:'12:00',pool:'largo'}],
      V:[{start:'08:00',end:'12:00',pool:'medio'},{start:'14:00',end:'16:00',pool:'corto'}]
    }});
    if(typeof saveDevCapacity==='function') saveDevCapacity();
  }
  if (!(portfolioData||[]).some(function(p){return (p.horas||0)>0;})) {
    var demos=[
      {nom:'Integración SAP-CRM',horas:160,sf:9.1,sb:8.5,af:1.07,scores:{},dimScores:[9,8,9,7,7,5],reqDate:'2024-12-01',area:'IT',sponsor:'COO'},
      {nom:'Portal empleado RRHH',horas:80, sf:7.8,sb:7.2,af:1.08,scores:{},dimScores:[6,7,8,6,8,7],reqDate:'2025-01-15',area:'RRHH',sponsor:'CHRO'},
      {nom:'Automatización GMP',  horas:200,sf:8.9,sb:8.3,af:1.05,scores:{},dimScores:[10,7,8,8,6,5],reqDate:'2024-11-01',area:'Calidad',sponsor:'CTO'},
      {nom:'App comerciales',     horas:120,sf:7.5,sb:7.0,af:1.06,scores:{},dimScores:[5,8,8,7,7,6],reqDate:'2025-02-01',area:'Ventas',sponsor:'CSO'},
      {nom:'BI Supply Chain',     horas:60, sf:7.2,sb:6.8,af:1.04,scores:{},dimScores:[5,7,7,5,8,5],reqDate:'2025-01-01',area:'Ops',sponsor:'COO'},
      {nom:'GDPR Governance',     horas:40, sf:8.3,sb:7.8,af:1.09,scores:{},dimScores:[10,6,5,6,7,5],reqDate:'2024-10-01',area:'Legal',sponsor:'CLO'},
    ];
    demos.forEach(function(d){d._selected=false;d.autoP=d.dimScores[0]>=8;(portfolioData=portfolioData||[]).push(d);});
    if(typeof renderPortfolio==='function') renderPortfolio();
  }
  toast('✓ Datos demo cargados');
  renderCalendar();
}

// ── Schedule editor in Config ──────────────────────────────────
function renderScheduleEditor() {
  var el=document.getElementById('schedule-editor');
  if(!el) return;
  if(!devTeam.length){
    el.innerHTML='<div style="color:#AAA;font-size:11px;padding:8px 0">Añade desarrolladores arriba para configurar su horario.</div>';
    return;
  }
  el.innerHTML=devTeam.map(function(dev,di){
    var wh=pDevHours(dev);
    var whT=Object.keys(wh).filter(function(k){return wh[k]>0;})
      .map(function(k){return '<span style="color:'+POOL_COLORS[k]+';font-weight:600">'+k+': '+wh[k].toFixed(1)+'h/sem</span>';}).join(' · ');

    var rows=CAL_DAYS.map(function(day){
      var slots=(dev.schedule||{})[day]||[];
      var tags=slots.map(function(s,si){
        var col=POOL_COLORS[s.pool];
        return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:20px;font-size:9px;font-weight:600;background:'+POOL_BGS[s.pool]+';border:1px solid '+col+';color:'+col+'">'
          +s.start+'–'+s.end+' '+s.pool
          +'<button onclick="planRemoveSlot('+di+',\''+day+'\','+si+')" style="background:none;border:none;color:'+col+';cursor:pointer;font-size:10px;padding:0;margin-left:2px;line-height:1">×</button>'
          +'</span>';
      }).join('');
      return '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;min-height:28px">'
        +'<div style="width:18px;font-size:9px;font-weight:700;color:#888;padding-top:5px;flex-shrink:0">'+day+'</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:3px;flex:1">'+tags+'</div>'
        +'<button onclick="planAddSlot('+di+',\''+day+'\')" style="font-size:9px;padding:3px 8px;border:1px dashed #CCC;background:#fff;border-radius:5px;cursor:pointer;color:#888;flex-shrink:0;white-space:nowrap" onmouseover="this.style.borderColor=\'#C4974A\'" onmouseout="this.style.borderColor=\'#CCC\'">+ franja</button>'
      +'</div>';
    }).join('');

    return '<div style="background:#fff;border:1px solid #EBEBEB;border-radius:8px;padding:12px;margin-bottom:8px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
        +'<div style="font-size:11px;font-weight:700;color:#111">'+dev.name+'</div>'
        +'<div style="font-size:9px;color:#888">'+( whT||'Sin franjas' )+'</div>'
      +'</div>'
      +rows
      +'</div>';
  }).join('');
}

function planAddSlot(di, day) {
  var start=prompt('Hora inicio (HH:MM):','09:00');
  if(!start||!/^\d{2}:\d{2}$/.test(start)){if(start!==null)toast('Formato inválido. Usa HH:MM');return;}
  var end=prompt('Hora fin (HH:MM):','13:00');
  if(!end||!/^\d{2}:\d{2}$/.test(end)){if(end!==null)toast('Formato inválido. Usa HH:MM');return;}
  var pool=prompt('Pool (corto/medio/largo):','largo');
  if(!pool||!['corto','medio','largo'].includes(pool)){if(pool!==null)toast('Pool debe ser: corto, medio o largo');return;}
  if(start>=end){toast('La hora fin debe ser posterior a la de inicio');return;}
  if(!devTeam[di].schedule) devTeam[di].schedule={};
  if(!devTeam[di].schedule[day]) devTeam[di].schedule[day]=[];
  devTeam[di].schedule[day].push({start:start,end:end,pool:pool});
  devTeam[di].schedule[day].sort(function(a,b){return a.start.localeCompare(b.start);});
  if(typeof saveDevCapacity==='function') saveDevCapacity();
  renderScheduleEditor();
  toast('✓ '+start+'–'+end+' '+pool+' → '+devTeam[di].name+' '+day);
}

function planRemoveSlot(di, day, si) {
  if(devTeam[di].schedule&&devTeam[di].schedule[day])
    devTeam[di].schedule[day].splice(si,1);
  if(typeof saveDevCapacity==='function') saveDevCapacity();
  renderScheduleEditor();
}

// ── Export ─────────────────────────────────────────────────────
function exportPlanningExcel() {
  var timeline=planBuildTimeline();
  if(!timeline.length){toast('Sin datos para exportar');return;}
  var wb=XLSX.utils.book_new();
  var hdr=['Dev','Pool','#','Proyecto','Horas','h/sem','Semanas','Inicio','Fin est.','Score'];
  var rows=timeline.map(function(t){
    var qi=timeline.filter(function(x){return x.devName===t.devName&&x.pool===t.pool;}).indexOf(t)+1;
    return [t.devName,t.pool,qi,t.proj.nom,t.totalHours,+t.hoursPerWeek.toFixed(1),t.weeks,
            pFmt(t.startDate),pFmt(t.endDate),+(t.proj.sf||0).toFixed(2)];
  });
  var ws=XLSX.utils.aoa_to_sheet([hdr].concat(rows));
  ws['!cols']=[14,8,4,40,8,7,8,14,14,7].map(function(w){return {wch:w};});
  XLSX.utils.book_append_sheet(wb,ws,'Planificación');
  if(activeProjects.length){
    var ws2=XLSX.utils.aoa_to_sheet([['Proyecto','Dev','Pool','Fin en curso']]
      .concat(activeProjects.map(function(a){return [a.nom,a.devName,a.pool,a.endDate];})));
    XLSX.utils.book_append_sheet(wb,ws2,'En curso');
  }
  XLSX.writeFile(wb,'nexus_planning_'+new Date().toISOString().split('T')[0]+'.xlsx');
  toast('✓ '+timeline.length+' proyectos exportados');
}
