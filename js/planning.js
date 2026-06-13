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
  var thrS=parseInt((document.getElementById('thr-s')||{}).value)||10;
  var thrM=parseInt((document.getElementById('thr-m')||{}).value)||50;
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

  el.innerHTML = '';
  if (calView==='horas') { renderHourlyView(el, timeline); return; }
  if (calView==='gantt') renderGanttV4(el, timeline);
  if (calView==='month') renderMonthV4(el, timeline);
  if (calView==='week')  renderWeekV4(el, timeline);
}

// ════════════════════════════════════════════════════════════════
// GANTT V4 — robust, no-disappear
// ════════════════════════════════════════════════════════════════
// renderGanttV4 → replaced by GANTT module below

// ── Gantt drag events ──────────────────────────────────────────
// ganttBarDragStart moved to GANTT module

// ganttBarDragEnd moved to GANTT module

// ganttBarUnlock moved to GANTT module


// Drop on row (for dev reassignment — position at start of row)
// ganttRowDrop moved to GANTT module


// Drop on gantt area (precise position from mouse X)
// ganttAreaDrop moved to GANTT module


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
// ganttResizeStart moved to GANTT module


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
  ['horas','gantt','month','week'].forEach(function(name){
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
  var el = document.getElementById('schedule-editor');
  if (!el) return;
  if (!devTeam.length) {
    el.innerHTML = '<div style="color:#AAA;font-size:11px;padding:8px 0">Añade desarrolladores arriba para configurar su horario.</div>';
    return;
  }

  el.innerHTML = devTeam.map(function(dev, di) {
    var wh  = pDevHours(dev);
    var whT = Object.keys(wh).filter(function(k){ return wh[k]>0; })
      .map(function(k){ return '<span style="color:'+POOL_COLORS[k]+';font-weight:600">'+k+': '+wh[k].toFixed(1)+'h/sem</span>'; }).join(' · ');

    var rows = CAL_DAYS.map(function(day) {
      var slots = (dev.schedule||{})[day] || [];
      var tags  = slots.map(function(s, si) {
        var col = POOL_COLORS[s.pool];
        return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:20px;'
          +'font-size:9px;font-weight:600;background:'+POOL_BGS[s.pool]+';border:1px solid '+col+';color:'+col+'">'
          +s.start+'–'+s.end+' '+s.pool
          +'<button onclick="planRemoveSlot('+di+',\''+day+'\','+si+')" '
            +'style="background:none;border:none;color:'+col+';cursor:pointer;font-size:10px;padding:0;margin-left:2px;line-height:1">×</button>'
          +'</span>';
      }).join('');

      // Copy button: copies ALL slots from this day
      var hasSlotsInDay = slots.length > 0;
      var copyBtn = '<button onclick="planCopyDay('+di+',\''+day+'\')" '
        +'title="Copiar franjas de este día" '
        +'style="padding:2px 7px;font-size:8px;border:1px solid #DEDEDE;border-radius:4px;'
          +'background:#fff;color:#888;cursor:pointer;white-space:nowrap;'
          +(hasSlotsInDay?'':'opacity:.4;')+'transition:all .15s" '
        +'onmouseover="this.style.borderColor=\'#C4974A\';this.style.color=\'#C4974A\'"'
        +'onmouseout="this.style.borderColor=\'#DEDEDE\';this.style.color=\'#888\'">'
        +'⎘ Copiar</button>';

      // Paste button: pastes clipboard to this day
      var pasteBtn = '<button onclick="planPasteDay('+di+',\''+day+'\')" '
        +'title="Pegar franjas en este día" '
        +'style="padding:2px 7px;font-size:8px;border:1px solid #DEDEDE;border-radius:4px;'
          +'background:#fff;color:#888;cursor:pointer;white-space:nowrap;transition:all .15s" '
        +'onmouseover="this.style.borderColor=\'#1848A0\';this.style.color=\'#1848A0\'"'
        +'onmouseout="this.style.borderColor=\'#DEDEDE\';this.style.color=\'#888\'">'
        +'⎙ Pegar</button>';

      return '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;min-height:30px">'
        // Day label
        +'<div style="width:18px;font-size:9px;font-weight:700;color:#888;padding-top:7px;flex-shrink:0">'+day+'</div>'
        // Slot tags
        +'<div style="display:flex;flex-wrap:wrap;gap:3px;flex:1;align-items:center">'+tags+'</div>'
        // Actions
        +'<div style="display:flex;gap:3px;flex-shrink:0;align-items:center">'
          +copyBtn+pasteBtn
          +'<button onclick="planAddSlot('+di+',\''+day+'\')" '
            +'style="font-size:9px;padding:3px 8px;border:1px dashed #CCC;background:#fff;border-radius:5px;'
              +'cursor:pointer;color:#888;white-space:nowrap" '
            +'onmouseover="this.style.borderColor=\'#C4974A\'" '
            +'onmouseout="this.style.borderColor=\'#CCC\'">+ franja</button>'
        +'</div>'
      +'</div>';
    }).join('');

    // "Copy to all days" button
    var copyAllBtn = '<button onclick="planCopyToAllDays('+di+')" '
      +'title="Copiar el día Lunes a todos los días" '
      +'style="margin-top:8px;padding:4px 10px;font-size:9px;border:1px solid #DEDEDE;border-radius:5px;'
        +'background:#fff;color:#666;cursor:pointer;width:100%;text-align:center" '
      +'onmouseover="this.style.background=\'#F5F5F5\'" '
      +'onmouseout="this.style.background=\'#fff\'">'
      +'⎘ Copiar Lunes → todos los días (L→M,X,J,V)</button>';

    return '<div style="background:#fff;border:1px solid #EBEBEB;border-radius:8px;padding:12px;margin-bottom:8px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
        +'<div style="display:flex;align-items:center;gap:8px">'
          +'<div style="width:28px;height:28px;border-radius:50%;background:#111;color:#fff;'
            +'font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">'
            +dev.name.charAt(0).toUpperCase()
          +'</div>'
          +'<div style="font-size:11px;font-weight:700;color:#111">'+dev.name+'</div>'
        +'</div>'
        +'<div style="font-size:9px;color:#888;text-align:right">'+(whT||'Sin franjas configuradas')+'</div>'
      +'</div>'
      +rows
      +copyAllBtn
    +'</div>';
  }).join('');
}

// ── Clipboard for slots ───────────────────────────────────────
var _slotClipboard = null;  // [{start,end,pool}]
var _clipSource    = '';     // label like "L"

function planCopyDay(di, day) {
  var slots = JSON.parse(JSON.stringify((devTeam[di].schedule||{})[day]||[]));
  if (!slots.length) { toast('No hay franjas en '+day+' para copiar'); return; }
  _slotClipboard = slots;
  _clipSource    = day;
  toast('⎘ '+slots.length+' franja(s) de '+day+' copiadas · Usa "Pegar" en otro día');
}

function planPasteDay(di, day) {
  if (!_slotClipboard || !_slotClipboard.length) { toast('Primero copia un día con ⎘ Copiar'); return; }
  if (!devTeam[di].schedule) devTeam[di].schedule = {};
  // Merge: add slots that don't already exist (avoid duplicates by start time)
  var existing = devTeam[di].schedule[day] || [];
  var added = 0;
  _slotClipboard.forEach(function(s) {
    var dup = existing.some(function(e){ return e.start===s.start && e.end===s.end && e.pool===s.pool; });
    if (!dup) { existing.push(JSON.parse(JSON.stringify(s))); added++; }
  });
  devTeam[di].schedule[day] = existing.sort(function(a,b){ return a.start.localeCompare(b.start); });
  if (typeof saveDevCapacity === 'function') saveDevCapacity();
  renderScheduleEditor();
  toast('⎙ '+added+' franja(s) de '+_clipSource+' pegadas en '+day+(added<_slotClipboard.length?' (algunas ya existían)':''));
}

function planCopyToAllDays(di) {
  var lSlots = JSON.parse(JSON.stringify((devTeam[di].schedule||{})['L']||[]));
  if (!lSlots.length) { toast('No hay franjas en Lunes para copiar'); return; }
  if (!devTeam[di].schedule) devTeam[di].schedule = {};
  ['M','X','J','V'].forEach(function(day) {
    devTeam[di].schedule[day] = JSON.parse(JSON.stringify(lSlots));
  });
  if (typeof saveDevCapacity === 'function') saveDevCapacity();
  renderScheduleEditor();
  toast('⎘ Franjas del Lunes copiadas a M, X, J, V para '+devTeam[di].name);
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
  var timeline = planBuildTimeline();
  if (!timeline.length) { toast('Sin datos para exportar'); return; }

  var wb = XLSX.utils.book_new();

  // ── Sheet 1: CALENDAR (projects as rows, dates as columns) ──
  var allMs = timeline.reduce(function(a,t){a.push(+t.startDate,+t.endDate);return a;},[]);
  var minDate = pWeekStart(new Date(Math.min.apply(null,allMs)));
  var maxDate = new Date(Math.max.apply(null,allMs));
  maxDate.setDate(maxDate.getDate()+7);

  // Build working days list
  var workDays = [];
  var d = new Date(minDate);
  while (+d <= +maxDate) {
    if (d.getDay()!==0 && d.getDay()!==6) workDays.push(new Date(d));
    d.setDate(d.getDate()+1);
  }

  // HEADER ROW 1: fixed cols + YEAR (when changes)
  var hdr1 = ['Proyecto','Dev','Pool','Score','Horas','Inicio','Fin'];
  var hdr2 = ['','','','','','','']; // months
  var hdr3 = ['','','','','','','']; // days
  var currentYear = null, currentMonth = null;

  workDays.forEach(function(day) {
    var yr = day.getFullYear().toString();
    var mo = day.toLocaleDateString('es-ES',{month:'short'}).toUpperCase();
    hdr1.push(yr !== currentYear ? yr : '');
    hdr2.push(mo !== currentMonth ? mo : '');
    hdr3.push(day.getDate());
    currentYear  = yr;
    currentMonth = mo;
  });

  // DATA ROWS: sorted by score desc
  var sortedTL = timeline.slice().sort(function(a,b){return (b.proj.sf||0)-(a.proj.sf||0);});
  var rows = sortedTL.map(function(t) {
    var row = [
      t.proj.nom,
      t.devName,
      t.pool,
      +(t.proj.sf||0).toFixed(2),
      t.totalHours,
      pFmt(t.startDate),
      pFmt(t.endDate)
    ];
    workDays.forEach(function(day) {
      if (+t.startDate <= +day && +day < +t.endDate) {
        row.push('■'); // active day
      } else {
        row.push('');
      }
    });
    return row;
  });

  var wsData = [hdr1, hdr2, hdr3].concat(rows);
  var ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  var colWidths = [40,14,8,7,7,14,14].concat(workDays.map(function(){return 3;}));
  ws['!cols'] = colWidths.map(function(w){return {wch:w};});

  // Row heights
  ws['!rows'] = [{hpx:16},{hpx:16},{hpx:14}];

  // Apply colors using XLSX cell styles
  // Header rows: dark background
  var POOL_COLOR_HEX = {corto:'C07800', medio:'1848A0', largo:'087B50'};
  var POOL_BG_HEX    = {corto:'FAF5E6', medio:'EEF3FC', largo:'ECF8F3'};

  // Style cells manually
  var range = XLSX.utils.decode_range(ws['!ref']);
  var nFixedCols = 7;

  for (var R = 0; R <= range.e.r; R++) {
    for (var C = 0; C <= range.e.c; C++) {
      var addr = XLSX.utils.encode_cell({r:R, c:C});
      if (!ws[addr]) ws[addr] = {v:'', t:'s'};

      var isHeaderRow = R < 3;
      var isFixedCol  = C < nFixedCols;
      var cellVal = ws[addr].v;

      // Build style object
      var style = {
        font:      {name:'Calibri', sz: isHeaderRow ? 9 : 10},
        alignment: {horizontal: isFixedCol ? 'left' : 'center', vertical:'center', wrapText:false},
        border: {
          right:  {style:'thin', color:{rgb:'E0E0E0'}},
          bottom: {style:'thin', color:{rgb:'E0E0E0'}}
        }
      };

      if (R === 0) {
        // Year row: dark bg
        style.fill = {fgColor:{rgb:'111111'}, patternType:'solid'};
        style.font.color = {rgb:'FFFFFF'};
        style.font.bold  = true;
      } else if (R === 1) {
        // Month row: mid grey
        style.fill = {fgColor:{rgb:'3D3D3D'}, patternType:'solid'};
        style.font.color = {rgb:'FFFFFF'};
        style.font.bold  = true;
        style.font.sz    = 8;
      } else if (R === 2) {
        // Day numbers
        style.fill = {fgColor:{rgb:'F5F5F5'}, patternType:'solid'};
        style.font.color = {rgb:'666666'};
        style.font.sz    = 8;
      } else {
        // Data rows
        var rowTL = sortedTL[R-3];
        if (rowTL && isFixedCol) {
          // Fixed columns: pool color
          var pool = rowTL.pool;
          if (C === 0) { // project name: bold
            style.font.bold = true;
          }
          if (C === 2) { // pool column: colored
            style.fill = {fgColor:{rgb: POOL_BG_HEX[pool]||'F5F5F5'}, patternType:'solid'};
            style.font.color = {rgb: POOL_COLOR_HEX[pool]||'333333'};
            style.font.bold  = true;
          }
          if (C === 5 || C === 6) { // dates: light blue
            style.fill = {fgColor:{rgb:'EEF3FC'}, patternType:'solid'};
            style.font.color = {rgb:'1848A0'};
          }
        } else if (rowTL && !isFixedCol) {
          // Calendar cells
          if (cellVal === '■') {
            // Active day: pool color
            var pool2 = rowTL.pool;
            style.fill = {fgColor:{rgb: POOL_COLOR_HEX[pool2]||'087B50'}, patternType:'solid'};
            style.font.color = {rgb: POOL_COLOR_HEX[pool2]||'087B50'};
            style.font.sz    = 8;
          } else {
            style.fill = {fgColor:{rgb:'FFFFFF'}, patternType:'solid'};
          }
          // Alternate row shading
          if ((R-3) % 2 === 1 && cellVal !== '■') {
            style.fill = {fgColor:{rgb:'FAFAFA'}, patternType:'solid'};
          }
        }
      }
      ws[addr].s = style;
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Calendario');

  // ── Sheet 2: SUMMARY LIST ─────────────────────────────────
  var hdrs2 = ['Dev','Pool','#','Proyecto','Inicio','Fin','Horas','h/sem','Semanas','Score'];
  var rows2 = sortedTL.map(function(t,i) {
    var qi = sortedTL.filter(function(x){return x.devName===t.devName&&x.pool===t.pool;}).indexOf(t)+1;
    return [t.devName, t.pool, qi, t.proj.nom,
            pFmt(t.startDate), pFmt(t.endDate),
            t.totalHours, +t.hoursPerWeek.toFixed(1), t.weeks,
            +(t.proj.sf||0).toFixed(2)];
  });

  var ws2 = XLSX.utils.aoa_to_sheet([hdrs2].concat(rows2));
  ws2['!cols'] = [14,8,4,40,14,14,8,7,8,7].map(function(w){return {wch:w};});

  // Color sheet 2 header
  var range2 = XLSX.utils.decode_range(ws2['!ref']);
  for (var C2=0; C2<=range2.e.c; C2++) {
    var addr2 = XLSX.utils.encode_cell({r:0,c:C2});
    if (!ws2[addr2]) ws2[addr2]={v:'',t:'s'};
    ws2[addr2].s = {
      fill:{fgColor:{rgb:'111111'},patternType:'solid'},
      font:{color:{rgb:'FFFFFF'},bold:true,sz:9},
      alignment:{horizontal:'center',vertical:'center'}
    };
  }
  // Color data rows by pool
  for (var R2=1; R2<=range2.e.r; R2++) {
    var tRow = rows2[R2-1];
    var pool3 = tRow ? tRow[1] : '';
    for (var C2=0; C2<=range2.e.c; C2++) {
      var addr3 = XLSX.utils.encode_cell({r:R2,c:C2});
      if (!ws2[addr3]) ws2[addr3]={v:'',t:'s'};
      var s3 = {
        fill:{fgColor:{rgb: C2===1 ? (POOL_BG_HEX[pool3]||'FFFFFF') : (R2%2===0?'FAFAFA':'FFFFFF')},patternType:'solid'},
        font:{sz:9, bold: C2===3, color:{rgb: C2===1?(POOL_COLOR_HEX[pool3]||'333333'):'333333'}},
        alignment:{horizontal: C2===2?'center':'left', vertical:'center'},
        border:{right:{style:'thin',color:{rgb:'E0E0E0'}},bottom:{style:'thin',color:{rgb:'E0E0E0'}}}
      };
      ws2[addr3].s = s3;
    }
  }
  XLSX.utils.book_append_sheet(wb, ws2, 'Lista');

  // ── Sheet 3: EN CURSO ──────────────────────────────────────
  if (activeProjects.length) {
    var ws3 = XLSX.utils.aoa_to_sheet(
      [['Proyecto','Desarrollador','Pool','Fin en curso']].concat(
        activeProjects.map(function(a){return [a.nom,a.devName,a.pool,a.endDate];})));
    ws3['!cols'] = [{wch:40},{wch:16},{wch:8},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws3, 'En curso');
  }

  var fname = 'nexus_planning_'+new Date().toISOString().split('T')[0]+'.xlsx';
  XLSX.writeFile(wb, fname);
  toast('✓ Exportado · Calendario ('+workDays.length+' días) · Lista · En curso');
}

/* ═══════════════════════════════════════════════════════════════
   NEXUS GANTT V5 — Professional resource Gantt
   
   Features:
   • SVG-based rendering for crisp, pixel-perfect bars
   • Two-row header: months (top) + weeks (bottom)
   • Per-dev rows with pool-coloured bars and progress overlay
   • "Resource view" below Gantt: shows daily slot occupation
     with project transitions highlighted
   • Drag: ghost cursor, snap to week, no-overlap, domino cascade
   • Resize: right handle, updates duration
   • Tooltip: rich popup on hover
   • Zoom: 3 levels (week/month/quarter scale)
   • Today marker with pulsing dot
   • Critical path: longest chain highlighted
   • Mini-map: scrollbar overview
   ═══════════════════════════════════════════════════════════════ */

var GANTT = (function() {

  // ── Constants ───────────────────────────────────────────────
  var LABEL_W  = 180;
  var ROW_H    = 54;
  var HEAD_H   = 44;
  var ZOOM_LEVELS = [
    {name:'Horas',   dayPx:999},
    {name:'Día',     dayPx:60},
    {name:'Semanas', dayPx:32},
    {name:'Meses',   dayPx:14},
    {name:'Trim.',   dayPx: 6},
  ];
  var zoomIdx = 1; // Default: Semanas (0=Horas, 1=Semanas, 2=Meses, 3=Trim)

  // Pool visual config
  var PCOL = { corto:'#C07800', medio:'#1848A0', largo:'#087B50' };
  var PBGG = { corto:'rgba(192,120,0,.10)', medio:'rgba(24,72,160,.10)', largo:'rgba(8,123,80,.10)' };

  // State
  var _tl   = [];          // timeline
  var _cont = null;        // container element
  var _drag = null;        // drag state
  var _tip  = null;        // tooltip el

  // ── Entry point ────────────────────────────────────────────
  function render(container, timeline) {
    _cont = container;
    _tl   = timeline;
    _tip  = null;
    _build();
  }

  // ── Build ──────────────────────────────────────────────────
  function _build() {
    if (!_tl.length) return;

    var DPX = ZOOM_LEVELS[zoomIdx].dayPx;
    // Hourly view: delegate to renderHourlyView
    if (DPX >= 999) {
      if (_cont) { _cont.innerHTML = ''; renderHourlyView(_cont, _tl); }
      return;
    }

    // Date bounds
    var allMs = _tl.reduce(function(a,t){a.push(+t.startDate,+t.endDate);return a;},[]);
    var minDate = pWeekStart(new Date(Math.min.apply(null,allMs) - 7*86400000));
    var maxDate = new Date(Math.max.apply(null,allMs) + 28*86400000);
    var today   = new Date(); today.setHours(0,0,0,0);
    if (+today < +minDate) minDate = pWeekStart(new Date(+today - 7*86400000));

    var totalDays = Math.ceil((maxDate - minDate) / 86400000);
    var totalW    = totalDays * DPX;

    // Dev order (preserves sort from timeline)
    var devSeen = {}; var devNames = [];
    _tl.forEach(function(t){ if(!devSeen[t.devName]){devSeen[t.devName]=1;devNames.push(t.devName);} });

    var svgH = HEAD_H + devNames.length * ROW_H;

    // ── Outer wrapper ────────────────────────────────────────
    _cont.innerHTML = '';

    // Toolbar
    var toolbar = _mkEl('div', 'display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap');
    // Zoom
    var zLabel = _mkEl('span','font-size:9px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.1em');
    zLabel.textContent = 'Escala:';
    toolbar.appendChild(zLabel);
    ZOOM_LEVELS.forEach(function(z,i){
      var btn = _mkEl('button',
        'padding:5px 12px;font-size:9px;font-weight:600;border-radius:5px;cursor:pointer;'
        +'border:1.5px solid '+(i===zoomIdx?'#111':'#DEDEDE')+';'
        +'background:'+(i===zoomIdx?'#111':'#fff')+';'
        +'color:'+(i===zoomIdx?'#fff':'#666')+';transition:all .15s');
      btn.textContent = z.name;
      btn.onclick = function(){ zoomIdx=i; _build(); };
      toolbar.appendChild(btn);
    });

    // Summary counts
    var summary = _mkEl('div','margin-left:auto;display:flex;gap:12px;font-size:9px;color:#888;align-items:center');
    var pools = {corto:0,medio:0,largo:0};
    _tl.forEach(function(t){ pools[t.pool]=(pools[t.pool]||0)+1; });
    Object.keys(pools).forEach(function(k){
      if(!pools[k]) return;
      var dot = _mkEl('span','display:inline-flex;align-items:center;gap:4px');
      dot.innerHTML = '<span style="width:8px;height:8px;border-radius:2px;background:'+PBGG[k]+';border:1.5px solid '+PCOL[k]+'"></span>'
        +'<span style="color:'+PCOL[k]+';font-weight:600">'+k+' '+pools[k]+'</span>';
      summary.appendChild(dot);
    });
    toolbar.appendChild(summary);
    _cont.appendChild(toolbar);

    // Scroll wrapper
    var wrap = _mkEl('div',
      'border:1px solid #E8E8E8;border-radius:10px;overflow:hidden;'
      +'box-shadow:0 2px 12px rgba(0,0,0,.06);background:#fff');

    // Sticky header row
    var headerRow = _mkEl('div',
      'display:flex;position:sticky;top:0;z-index:40;background:#fff;border-bottom:2px solid #E8E8E8');

    // Dev label corner
    var corner = _mkEl('div',
      'width:'+LABEL_W+'px;flex-shrink:0;background:#F7F7F5;border-right:1px solid #E8E8E8;'
      +'padding:8px 14px;font-size:8px;font-weight:700;color:#AAA;text-transform:uppercase;'
      +'letter-spacing:.1em;display:flex;align-items:flex-end');
    corner.textContent = 'Desarrollador';
    headerRow.appendChild(corner);

    // Time scale SVG
    var scaleWrap = _mkEl('div','flex:1;overflow-x:auto;overflow-y:hidden;background:#F7F7F5');
    var scaleSvg  = _svgEl('svg', totalW, HEAD_H);
    _buildScale(scaleSvg, minDate, totalDays, DPX, today);
    scaleWrap.appendChild(scaleSvg);
    headerRow.appendChild(scaleWrap);
    wrap.appendChild(headerRow);

    // Body (dev rows)
    var body = _mkEl('div','display:flex');
    var labelsCol = _mkEl('div','width:'+LABEL_W+'px;flex-shrink:0;border-right:1px solid #E8E8E8');
    var ganttCol  = _mkEl('div','flex:1;overflow-x:auto;overflow-y:visible');

    // Main Gantt SVG
    var ganttSvg = _svgEl('svg', totalW, svgH);
    ganttSvg.setAttribute('style','display:block;cursor:default');

    // Grid lines into Gantt SVG
    _buildGrid(ganttSvg, minDate, totalDays, DPX, devNames.length);

    // Today line
    var todayX = Math.round((today - minDate)/86400000)*DPX;
    _svgLine(ganttSvg, todayX, 0, todayX, svgH, 'rgba(204,31,38,.5)', 2, '4,3');
    // Pulsing today dot at top
    var todayDot = _svgCircle(ganttSvg, todayX, 4, 4, '#CC1F26');
    todayDot.innerHTML = '<animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite"/>'
      +'<animate attributeName="opacity" values="1;.5;1" dur="2s" repeatCount="indefinite"/>';

    // Dev rows
    devNames.forEach(function(devName, ri) {
      var dev  = (devTeam||[]).find(function(d){return d.name===devName;}) || {name:devName};
      var wh   = pDevHours(dev);
      var y    = ri * ROW_H;

      // Row bg (alternate)
      var rowBg = _svgRect(ganttSvg, 0, y, totalW, ROW_H, ri%2===0?'#fff':'#FAFAFA', 0);
      rowBg.setAttribute('opacity','1');

      // Project bars
      var devProjs = _tl.filter(function(t){return t.devName===devName;})
                        .sort(function(a,b){return a.startDate-b.startDate;});

      devProjs.forEach(function(t, pi) {
        var lx   = Math.max(0, Math.round((t.startDate - minDate)/86400000)*DPX);
        var wpx  = Math.max(3, Math.round((t.endDate - t.startDate)/86400000)*DPX) - 2;
        var col  = PCOL[t.pool]  || '#888';
        var bgc  = PBGG[t.pool]  || 'rgba(0,0,0,.05)';
        var barY = y + (ROW_H - 28)/2;

        // Bar group
        var g = document.createElementNS('http://www.w3.org/2000/svg','g');
        g.setAttribute('class','gantt-bar-g');
        g.setAttribute('data-nom', t.proj.nom);
        g.setAttribute('data-dev', devName);
        g.setAttribute('data-pool', t.pool);
        g.setAttribute('data-sx', lx);
        g.setAttribute('data-wpx', wpx);
        g.setAttribute('data-bary', barY);
        g.setAttribute('data-row', ri);
        g.setAttribute('style','cursor:grab');

        // Bar background
        var bar = _svgRoundRect(g, lx, barY, wpx, 28, 5);
        bar.setAttribute('fill', t.locked ? col : bgc);
        bar.setAttribute('stroke', col);
        bar.setAttribute('stroke-width', t.locked ? '2' : '1.5');
        if (t.locked) bar.setAttribute('filter','url(#shadow)');

        // Progress overlay (if started)
        var elapsed = Math.max(0,Math.min(1,(+today-+t.startDate)/(+t.endDate-+t.startDate||1)));
        if (elapsed>0 && elapsed<1) {
          var prog = _svgRoundRect(g, lx, barY, Math.round(wpx*elapsed), 28, 5);
          prog.setAttribute('fill', t.locked ? 'rgba(255,255,255,.25)' : col);
          prog.setAttribute('opacity', t.locked ? '1' : '0.2');
          prog.setAttribute('pointer-events','none');
        }

        // Label (clip to bar width)
        if (wpx > 20) {
          var clipId = 'clip-'+ri+'-'+pi;
          var defs = ganttSvg.querySelector('defs') || ganttSvg.insertBefore(document.createElementNS('http://www.w3.org/2000/svg','defs'), ganttSvg.firstChild);
          var clip = document.createElementNS('http://www.w3.org/2000/svg','clipPath');
          clip.setAttribute('id', clipId);
          var clipRect = document.createElementNS('http://www.w3.org/2000/svg','rect');
          clipRect.setAttribute('x', lx+4); clipRect.setAttribute('y', barY);
          clipRect.setAttribute('width', wpx-20); clipRect.setAttribute('height', 28);
          clip.appendChild(clipRect); defs.appendChild(clip);

          var txt = document.createElementNS('http://www.w3.org/2000/svg','text');
          txt.setAttribute('x', lx+8+(t.locked?12:0));
          txt.setAttribute('y', barY+13);
          txt.setAttribute('font-size','8.5');
          txt.setAttribute('font-weight','700');
          txt.setAttribute('fill', t.locked ? '#fff' : col);
          txt.setAttribute('clip-path','url(#'+clipId+')');
          txt.setAttribute('pointer-events','none');
          txt.textContent = t.proj.nom;
          g.appendChild(txt);

          // Dates line below name (if bar wide enough)
          if (wpx > 100) {
            var datesTxt = document.createElementNS('http://www.w3.org/2000/svg','text');
            var clipId3 = 'clipd-'+ri+'-'+pi;
            var def3 = ganttSvg.querySelector('defs');
            var cl3 = document.createElementNS('http://www.w3.org/2000/svg','clipPath');
            cl3.setAttribute('id', clipId3);
            var cr3 = document.createElementNS('http://www.w3.org/2000/svg','rect');
            cr3.setAttribute('x', lx+4); cr3.setAttribute('y', barY+16);
            cr3.setAttribute('width', wpx-8); cr3.setAttribute('height', 12);
            cl3.appendChild(cr3); def3.appendChild(cl3);
            datesTxt.setAttribute('x', lx+8+(t.locked?12:0));
            datesTxt.setAttribute('y', barY+26);
            datesTxt.setAttribute('font-size','7');
            datesTxt.setAttribute('fill', t.locked?'rgba(255,255,255,.75)':col);
            datesTxt.setAttribute('opacity','.85');
            datesTxt.setAttribute('clip-path','url(#'+clipId3+')');
            datesTxt.setAttribute('pointer-events','none');
            datesTxt.textContent = pShort(t.startDate)+' → '+pShort(t.endDate);
            g.appendChild(datesTxt);
          }

          // Score badge top-right
          if (wpx > 55) {
            var score = document.createElementNS('http://www.w3.org/2000/svg','text');
            score.setAttribute('x', lx+wpx-20);
            score.setAttribute('y', barY+13);
            score.setAttribute('font-size','7.5');
            score.setAttribute('fill', t.locked?'rgba(255,255,255,.8)':col);
            score.setAttribute('font-weight','700');
            score.setAttribute('opacity','.85');
            score.setAttribute('pointer-events','none');
            score.textContent = (t.proj.sf||0).toFixed(1);
            g.appendChild(score);
          }

          // Lock icon
          if (t.locked) {
            var lock = document.createElementNS('http://www.w3.org/2000/svg','text');
            lock.setAttribute('x', lx+4); lock.setAttribute('y', barY+17);
            lock.setAttribute('font-size','9'); lock.setAttribute('fill','#fff');
            lock.setAttribute('pointer-events','none');
            lock.textContent = '🔒';
            g.appendChild(lock);
          }
        }

        // Resize handle (right edge)
        var handle = _svgRect(g, lx+wpx-6, barY, 6, 28, 'rgba(0,0,0,.0)', 0);
        handle.setAttribute('rx','3');
        handle.setAttribute('style','cursor:ew-resize');
        handle.setAttribute('data-resize','1');

        // Events on the group
        g.addEventListener('mousedown',  function(e){ _startDragOrResize(e,t,ri,minDate,DPX); });
        g.addEventListener('mouseenter', function(e){ _showTip(e,t); });
        g.addEventListener('mouseleave', _hideTip);
        g.addEventListener('dblclick',   function(){ ganttBarUnlock(t.proj.nom); });

        ganttSvg.appendChild(g);
      });

      // Row separator
      _svgLine(ganttSvg, 0, y+ROW_H-1, totalW, y+ROW_H-1, '#F0F0F0', 1, null);

      // Dev label
      var labelDiv = _mkEl('div',
        'height:'+ROW_H+'px;padding:0 14px;display:flex;flex-direction:column;'
        +'justify-content:center;border-bottom:1px solid #F0F0F0;'
        +'background:'+(ri%2===0?'#fff':'#FAFAFA'));

      var nameRow = _mkEl('div','display:flex;align-items:center;gap:6px');
      var avatar = _mkEl('div',
        'width:22px;height:22px;border-radius:50%;background:#111;color:#fff;'
        +'font-size:9px;font-weight:800;display:flex;align-items:center;'
        +'justify-content:center;flex-shrink:0');
      avatar.textContent = devName.charAt(0).toUpperCase();
      nameRow.appendChild(avatar);
      var nameSpan = _mkEl('span','font-size:10px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
      nameSpan.textContent = devName;
      nameRow.appendChild(nameSpan);
      labelDiv.appendChild(nameRow);

      var whDiv = _mkEl('div','font-size:8px;color:#AAA;margin-top:2px;display:flex;gap:6px');
      Object.keys(wh).forEach(function(k){
        if(!wh[k]) return;
        var s = _mkEl('span','color:'+PCOL[k]+';font-weight:600');
        s.textContent = k+' '+wh[k].toFixed(0)+'h';
        whDiv.appendChild(s);
      });
      labelDiv.appendChild(whDiv);
      labelsCol.appendChild(labelDiv);
    });

    // SVG shadow filter
    var defs = ganttSvg.querySelector('defs') || ganttSvg.insertBefore(document.createElementNS('http://www.w3.org/2000/svg','defs'), ganttSvg.firstChild);
    defs.innerHTML += '<filter id="shadow" x="-5%" y="-10%" width="110%" height="130%">'
      +'<feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".15"/></filter>';

    ganttCol.appendChild(ganttSvg);
    body.appendChild(labelsCol);
    body.appendChild(ganttCol);
    wrap.appendChild(body);
    _cont.appendChild(wrap);

    // ── Resource view ────────────────────────────────────────
    _buildResourceView();

    // ── Tooltip ──────────────────────────────────────────────
    _tip = _mkEl('div',
      'position:fixed;z-index:999;background:#111;color:#fff;padding:10px 14px;'
      +'border-radius:8px;font-size:11px;pointer-events:none;display:none;'
      +'box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:280px;line-height:1.6;'
      +'font-family:Inter,sans-serif');
    document.body.appendChild(_tip);

    // Sync horizontal scroll between scale and gantt
    ganttCol.addEventListener('scroll', function(){
      scaleWrap.scrollLeft = ganttCol.scrollLeft;
    });
    scaleWrap.addEventListener('scroll', function(){
      ganttCol.scrollLeft = scaleWrap.scrollLeft;
    });

    // Scroll today into view
    setTimeout(function(){
      var scrollTarget = Math.max(0, todayX - 200);
      ganttCol.scrollLeft = scrollTarget;
      scaleWrap.scrollLeft = scrollTarget;
    }, 100);
  }

  // ── Resource view ──────────────────────────────────────────
  function _buildResourceView() {
    if (!devTeam || !devTeam.length) return;

    var DPX = ZOOM_LEVELS[zoomIdx].dayPx;
    var allMs = _tl.reduce(function(a,t){a.push(+t.startDate,+t.endDate);return a;},[]);
    var minDate = pWeekStart(new Date(Math.min.apply(null,allMs) - 7*86400000));
    var maxDate = new Date(Math.max.apply(null,allMs) + 28*86400000);
    var today = new Date(); today.setHours(0,0,0,0);

    var section = _mkEl('div','margin-top:16px');
    var hdr = _mkEl('div',
      'font-size:10px;font-weight:700;color:#888;text-transform:uppercase;'
      +'letter-spacing:.1em;margin-bottom:8px;display:flex;align-items:center;gap:8px');
    hdr.innerHTML = 'Ocupación por desarrollador y slot'
      +'<span style="font-size:9px;color:#AAA;font-weight:400;text-transform:none;letter-spacing:0">'
      +'— cada franja de color = slot activo · transición de proyecto marcada con ▲</span>';
    section.appendChild(hdr);

    devTeam.forEach(function(dev) {
      var devTL = _tl.filter(function(t){return t.devName===dev.name;});
      if (!devTL.length) return;

      var devWrap = _mkEl('div',
        'background:#fff;border:1px solid #EBEBEB;border-radius:8px;margin-bottom:8px;overflow:hidden');

      // Dev header
      var devHdr = _mkEl('div',
        'padding:8px 14px;background:#F7F7F5;border-bottom:1px solid #EBEBEB;'
        +'display:flex;align-items:center;gap:8px');
      var av = _mkEl('div',
        'width:20px;height:20px;border-radius:50%;background:#111;color:#fff;'
        +'font-size:8px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0');
      av.textContent = dev.name.charAt(0).toUpperCase();
      devHdr.appendChild(av);
      var dn = _mkEl('span','font-size:10px;font-weight:700;color:#111');
      dn.textContent = dev.name;
      devHdr.appendChild(dn);
      devWrap.appendChild(devHdr);

      // Slot rows
      ['L','M','X','J','V'].forEach(function(day) {
        var slots = (dev.schedule||{})[day] || [];
        if (!slots.length) return;

        slots.forEach(function(slot) {
          var slotRow = _mkEl('div',
            'display:flex;align-items:stretch;border-bottom:1px solid #F7F7F5;min-height:28px');

          // Day+slot label
          var slotLabel = _mkEl('div',
            'width:180px;flex-shrink:0;padding:4px 14px;border-right:1px solid #F0F0F0;'
            +'display:flex;align-items:center;gap:6px;background:#FAFAFA');
          var dayBadge = _mkEl('span',
            'font-size:8px;font-weight:700;color:#888;width:14px;text-align:center');
          dayBadge.textContent = day;
          slotLabel.appendChild(dayBadge);
          var slotTime = _mkEl('span',
            'font-size:8px;color:'+PCOL[slot.pool]+';font-weight:600;'
            +'background:'+PBGG[slot.pool]+';padding:1px 5px;border-radius:3px;'
            +'border:1px solid '+PCOL[slot.pool]+';white-space:nowrap');
          slotTime.textContent = slot.start+'–'+slot.end+' '+slot.pool;
          slotLabel.appendChild(slotTime);
          slotRow.appendChild(slotLabel);

          // Timeline bar for this slot
          var slotTimeline = _mkEl('div',
            'flex:1;overflow-x:auto;overflow-y:hidden;position:relative;height:28px;'
            +'background:repeating-linear-gradient(90deg,transparent,transparent '+(DPX*7-1)+'px,#F0F0F0 '+(DPX*7)+'px)');

          // Container SVG
          var totalDays = Math.ceil((maxDate - minDate)/86400000);
          var svgW = totalDays * DPX;
          var slotSvg = _svgEl('svg', svgW, 28);
          slotSvg.setAttribute('style','display:block');

          // Render project blocks for this slot pool
          // Find all dates where this slot is used (weekday matches day)
          var DAYMAP = {L:1,M:2,X:3,J:4,V:5};
          var wdTarget = DAYMAP[day];
          var sh=parseInt(slot.start), sm=parseInt(slot.start.split(':')[1]||0);
          var eh=parseInt(slot.end),   em=parseInt(slot.end.split(':')[1]||0);
          var slotH = ((eh*60+em)-(sh*60+sm))/60;

          // For each project in this pool for this dev, find the weeks it covers
          devTL.filter(function(t){return t.pool===slot.pool;})
               .forEach(function(t, ti, arr) {
            var col = PCOL[t.pool];
            // Iterate over days within project duration
            var d = new Date(t.startDate);
            var prevX = null;
            while (+d < +t.endDate) {
              if (d.getDay()===wdTarget) {
                var lx = Math.round((d - minDate)/86400000)*DPX;
                var wpx = DPX;

                var blk = _svgRect(slotSvg, lx+1, 3, wpx-2, 22, t.locked?col:PBGG[t.pool], 0);
                blk.setAttribute('rx','2');
                blk.setAttribute('fill', t.locked?col:PBGG[t.pool]);
                blk.setAttribute('stroke', col);
                blk.setAttribute('stroke-width','1');

                // Transition marker: first day of this project
                if (+d <= +t.startDate || (+d - +t.startDate) < 7*86400000) {
                  if (prevX === null) {
                    var tri = document.createElementNS('http://www.w3.org/2000/svg','polygon');
                    tri.setAttribute('points', (lx+DPX/2)+',2 '+(lx+DPX/2-4)+',10 '+(lx+DPX/2+4)+',10');
                    tri.setAttribute('fill', col);
                    slotSvg.appendChild(tri);
                  }
                }

                // Hours label in block
                if (DPX >= 18) {
                  var htxt = document.createElementNS('http://www.w3.org/2000/svg','text');
                  htxt.setAttribute('x', lx+DPX/2); htxt.setAttribute('y', 17);
                  htxt.setAttribute('font-size','7'); htxt.setAttribute('text-anchor','middle');
                  htxt.setAttribute('fill', t.locked?'#fff':col);
                  htxt.setAttribute('font-weight','600'); htxt.setAttribute('pointer-events','none');
                  htxt.textContent = slotH+'h';
                  slotSvg.appendChild(htxt);
                }
                prevX = lx;
              }
              d.setDate(d.getDate()+1);
            }
          });

          // Today marker
          var todayX = Math.round((today - minDate)/86400000)*DPX;
          var tl2 = _svgRect(slotSvg, todayX, 0, 2, 28, 'rgba(204,31,38,.4)', 0);
          slotSvg.appendChild(tl2);

          slotTimeline.appendChild(slotSvg);
          slotRow.appendChild(slotTimeline);
          devWrap.appendChild(slotRow);
        });
      });

      section.appendChild(devWrap);
    });

    _cont.appendChild(section);
  }

  // ── Scale header ───────────────────────────────────────────
  function _buildScale(svg, minDate, totalDays, DPX, today) {
    var d = new Date(minDate);
    var prevMonthX = 0;
    while (+d <= +new Date(+minDate + totalDays*86400000)) {
      var lx = Math.round((d - minDate)/86400000)*DPX;
      if (DPX >= 50) {
        // ── DAILY ZOOM ──────────────────────────────────────
        var isWknd = d.getDay()===0||d.getDay()===6;
        var isMon  = d.getDay()===1;
        // Month label on 1st
        if (d.getDate()===1) {
          _svgLine(svg, lx, 0, lx, HEAD_H, '#BBBBBB', 1, null);
          var mth = document.createElementNS('http://www.w3.org/2000/svg','text');
          mth.setAttribute('x',lx+3); mth.setAttribute('y',11);
          mth.setAttribute('font-size','8'); mth.setAttribute('font-weight','700');
          mth.setAttribute('fill','#333');
          mth.textContent = d.toLocaleDateString('es-ES',{month:'short',year:'2-digit'}).toUpperCase();
          svg.appendChild(mth);
        }
        // Day number
        var dd2 = document.createElementNS('http://www.w3.org/2000/svg','text');
        dd2.setAttribute('x',lx+2); dd2.setAttribute('y',28);
        dd2.setAttribute('font-size','8');
        dd2.setAttribute('fill',isWknd?'#CCCCCC':isMon?'#333':'#999');
        dd2.setAttribute('font-weight',isMon?'700':'400');
        dd2.textContent = d.getDate();
        svg.appendChild(dd2);
        // Short day name
        var dwn = document.createElementNS('http://www.w3.org/2000/svg','text');
        dwn.setAttribute('x',lx+2); dwn.setAttribute('y',40);
        dwn.setAttribute('font-size','7');
        dwn.setAttribute('fill',isWknd?'#DDDDDD':'#BBB');
        dwn.textContent = d.toLocaleDateString('es-ES',{weekday:'short'}).slice(0,2).toUpperCase();
        svg.appendChild(dwn);
      } else if (d.getDay()===1) {
        // ── WEEK/MONTH/QUARTER ZOOM ──────────────────────────
        _svgLine(svg, lx, 24, lx, HEAD_H, '#E0E0E0', 1, null);
        if (DPX >= 14) {
          var wt = document.createElementNS('http://www.w3.org/2000/svg','text');
          wt.setAttribute('x',lx+2); wt.setAttribute('y',38);
          wt.setAttribute('font-size','8'); wt.setAttribute('fill','#AAA');
          wt.textContent = d.getDate();
          svg.appendChild(wt);
        }
        if (d.getDate()<=7) {
          _svgLine(svg, lx, 0, lx, HEAD_H, '#CCCCCC', 1, null);
          var mt = document.createElementNS('http://www.w3.org/2000/svg','text');
          mt.setAttribute('x',lx+3); mt.setAttribute('y',15);
          mt.setAttribute('font-size','9'); mt.setAttribute('font-weight','700');
          mt.setAttribute('fill','#333');
          mt.textContent = d.toLocaleDateString('es-ES',{month:'short',year:'2-digit'}).toUpperCase();
          svg.appendChild(mt);
        }
      }
      d.setDate(d.getDate()+1);
    }
    // Today line in header
    var todayX = Math.round((today - minDate)/86400000)*DPX;
    _svgLine(svg, todayX, 0, todayX, HEAD_H, 'rgba(204,31,38,.5)', 2, '3,2');
  }

  // ── Grid ───────────────────────────────────────────────────
  function _buildGrid(svg, minDate, totalDays, DPX, nRows) {
    var svgH = nRows * ROW_H;
    var d = new Date(minDate);
    while (+d <= +new Date(+minDate + totalDays*86400000)) {
      var lx = Math.round((d - minDate)/86400000)*DPX;
      if (DPX >= 50) {
        // Daily zoom: line every day
        var isWk = d.getDay()===0||d.getDay()===6;
        _svgLine(svg, lx, 0, lx, svgH, isWk?'#E8E8E8':'#F5F5F5', 1, null);
        if (isWk) _svgRect(svg, lx, 0, DPX, svgH, 'rgba(0,0,0,.018)', 0);
      } else {
        if (d.getDay()===1) {
          var isMonth = d.getDate()<=7;
          _svgLine(svg, lx, 0, lx, svgH, isMonth?'#E0E0E0':'#F5F5F5', 1, null);
        }
        // Weekend shading
        if (d.getDay()===6 && DPX>=10) {
          _svgRect(svg, lx, 0, DPX*2, svgH, 'rgba(0,0,0,.015)', 0);
        }
      }
      d.setDate(d.getDate()+1);
    }
  }

  // ── Drag & resize ──────────────────────────────────────────
  function _startDragOrResize(e, t, ri, minDate, DPX) {
    e.preventDefault();
    e.stopPropagation();
    var isResize    = e.target.dataset.resize === '1';
    var nomEsc      = t.proj.nom;
    var origStartMs = +t.startDate;
    var origEndMs   = +t.endDate;
    var durDays     = Math.max(1, Math.ceil((origEndMs - origStartMs) / 86400000));

    // Use ganttCol scrollLeft to compensate for horizontal scroll
    var ganttColEl = null;
    if (_cont) {
      var allDivs = _cont.querySelectorAll('div');
      for (var qi=0; qi<allDivs.length; qi++) {
        if (allDivs[qi].style.overflowX === 'auto') { ganttColEl = allDivs[qi]; break; }
      }
    }
    var startClientX  = e.clientX;
    var startScrollL  = ganttColEl ? ganttColEl.scrollLeft : 0;

    // Ghost tooltip
    var ghost = _mkEl('div',
      'position:fixed;z-index:999;pointer-events:none;white-space:nowrap;'
      +'background:#111;color:#fff;padding:6px 12px;border-radius:8px;'
      +'font-size:10px;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,.3);'
      +'display:'+(isResize?'none':'block'));
    ghost.textContent = (isResize?'↔':'↔ ') + (isResize ? 'Redimensionar' : t.proj.nom.substring(0,28));
    ghost.style.left = (e.clientX+14)+'px';
    ghost.style.top  = (e.clientY-20)+'px';
    document.body.appendChild(ghost);

    function getDeltaDays(clientX) {
      var scrollDelta = ganttColEl ? ganttColEl.scrollLeft - startScrollL : 0;
      var deltaPx = (clientX - startClientX) + scrollDelta;
      return Math.round(deltaPx / DPX);
    }

    function onMove(ev) {
      var dd = getDeltaDays(ev.clientX);
      var nd = new Date(origStartMs + dd * 86400000);
      ghost.textContent = (isResize ? '⟷ Fin: ' : '↔ ') + (isResize ? pShort(new Date(origEndMs + dd*86400000)) : t.proj.nom.substring(0,20)+' · '+pShort(nd));
      ghost.style.left = (ev.clientX+14)+'px';
      ghost.style.top  = (ev.clientY-20)+'px';
    }

    function onUp(ev) {
      ghost.remove();
      var deltaDays = getDeltaDays(ev.clientX);

      if (isResize) {
        if (deltaDays === 0) { cleanup(); return; }
        var ne = pAddDays(new Date(origEndMs), deltaDays);
        if (+ne <= origStartMs + 86400000) { cleanup(); return; }
        var rix = lockedAssignments.findIndex(function(l){ return l.nom===nomEsc; });
        var lk = {nom:nomEsc, devName:t.devName,
          startDate: new Date(origStartMs).toISOString(), endDate: ne.toISOString()};
        if (rix>=0) lockedAssignments[rix]=lk; else lockedAssignments.push(lk);
        var tl2 = planBuildTimeline();
        planCascade(tl2, nomEsc, ne, t.devName, t.pool);
        pLogChange(nomEsc, pShort(new Date(origEndMs)), pShort(ne), t.devName);
        saveLocked();
        cleanup();
        renderCalendar();
      } else {
        if (deltaDays === 0) { cleanup(); return; }
        var ns = pNextWork(new Date(origStartMs + deltaDays * 86400000));
        ganttDoMove(nomEsc, t.devName, ns);
        cleanup();
      }
    }

    function cleanup() {
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }

    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  // ── Tooltip ────────────────────────────────────────────────
  function _showTip(e, t) {
    if (!_tip) return;
    var elapsed = Math.max(0,Math.min(1,(+new Date()-+t.startDate)/(+t.endDate-+t.startDate||1)));
    _tip.innerHTML =
      '<div style="font-weight:700;font-size:12px;margin-bottom:6px;line-height:1.3">'
        +t.proj.nom+'</div>'
      +'<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px;font-size:10px;opacity:.85">'
        +'<span>Pool</span><span style="color:'+PCOL[t.pool]+';font-weight:600">'+t.pool+'</span>'
        +'<span>Dev</span><span>'+t.devName+'</span>'
        +'<span>Horas</span><span>'+t.totalHours+'h a '+t.hoursPerWeek.toFixed(1)+'h/sem</span>'
        +'<span>Duración</span><span>'+t.weeks+' semanas</span>'
        +'<span>Inicio</span><span>'+pFmt(t.startDate)+'</span>'
        +'<span>Fin est.</span><span>'+pFmt(t.endDate)+'</span>'
        +'<span>Score</span><span style="font-weight:700">'+(t.proj.sf||0).toFixed(2)+'</span>'
        +(elapsed>0&&elapsed<1?'<span>Progreso</span><span>'+Math.round(elapsed*100)+'%</span>':'')
        +(t.locked?'<span>Estado</span><span style="color:#C4974A">🔒 Bloqueado</span>':
          '<span>Estado</span><span style="color:#087B50">↺ Auto-planificado</span>')
      +'</div>'
      +'<div style="margin-top:6px;font-size:9px;opacity:.5">Dbl-clic para liberar · Arrastra para mover</div>';
    _tip.style.display = 'block';
    _moveTip(e);
  }
  function _moveTip(e) {
    if (!_tip||_tip.style.display==='none') return;
    var x = e.clientX+16, y = e.clientY-10;
    var w = _tip.offsetWidth, h = _tip.offsetHeight;
    if (x+w > window.innerWidth-10)  x = e.clientX-w-10;
    if (y+h > window.innerHeight-10) y = e.clientY-h-10;
    _tip.style.left = x+'px';
    _tip.style.top  = y+'px';
    document.onmousemove = _moveTip;
  }
  function _hideTip() {
    if (_tip) _tip.style.display='none';
    document.onmousemove = null;
  }

  // ── SVG helpers ────────────────────────────────────────────
  function _svgEl(tag, w, h) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    el.setAttribute('width', w);
    el.setAttribute('height', h);
    el.setAttribute('viewBox', '0 0 '+w+' '+h);
    return el;
  }
  function _svgRect(parent, x, y, w, h, fill, rx) {
    var r = document.createElementNS('http://www.w3.org/2000/svg','rect');
    r.setAttribute('x',x); r.setAttribute('y',y);
    r.setAttribute('width',w); r.setAttribute('height',h);
    r.setAttribute('fill',fill||'none');
    if (rx) r.setAttribute('rx',rx);
    parent.appendChild(r);
    return r;
  }
  function _svgRoundRect(parent, x, y, w, h, rx) {
    var r = document.createElementNS('http://www.w3.org/2000/svg','rect');
    r.setAttribute('x',x); r.setAttribute('y',y);
    r.setAttribute('width',w); r.setAttribute('height',h);
    r.setAttribute('rx',rx||4);
    parent.appendChild(r);
    return r;
  }
  function _svgLine(parent, x1, y1, x2, y2, stroke, sw, dash) {
    var l = document.createElementNS('http://www.w3.org/2000/svg','line');
    l.setAttribute('x1',x1);l.setAttribute('y1',y1);
    l.setAttribute('x2',x2);l.setAttribute('y2',y2);
    l.setAttribute('stroke',stroke||'#DDD');
    l.setAttribute('stroke-width',sw||1);
    if (dash) l.setAttribute('stroke-dasharray',dash);
    l.setAttribute('pointer-events','none');
    parent.appendChild(l);
    return l;
  }
  function _svgCircle(parent,cx,cy,r,fill) {
    var c=document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx',cx);c.setAttribute('cy',cy);c.setAttribute('r',r);
    c.setAttribute('fill',fill||'#111');
    parent.appendChild(c);
    return c;
  }
  function _mkEl(tag, style) {
    var el = document.createElement(tag);
    if (style) el.style.cssText = style;
    return el;
  }

  // ── Public API ─────────────────────────────────────────────
  return { render: render };
})();

// Hook into renderCalendar
function renderGanttV4(el, timeline) {
  GANTT.render(el, timeline);
}

/* ═══════════════════════════════════════════════════════════════
   PLANNING SUMMARY + CHAT ASSISTANT
   ═══════════════════════════════════════════════════════════════ */

// ── Render planning summary (occupancy + next slots) ──────────
function renderPlanningSummary() {
  var timeline = planBuildTimeline();
  if (!timeline.length) return;

  var today = new Date(); today.setHours(0,0,0,0);

  // ── Occupancy summary ──────────────────────────────────────
  var sumEl = document.getElementById('plan-summary-content');
  if (sumEl) {
    // Group by dev
    var devMap = {};
    timeline.forEach(function(t) {
      if (!devMap[t.devName]) devMap[t.devName] = {corto:[],medio:[],largo:[]};
      devMap[t.devName][t.pool].push(t);
    });

    var html = Object.keys(devMap).map(function(devName) {
      var pools = devMap[devName];
      var totalH = timeline.filter(function(t){return t.devName===devName;})
                           .reduce(function(s,t){return s+t.totalHours;}, 0);
      var lastEnd = timeline.filter(function(t){return t.devName===devName;})
                            .reduce(function(mx,t){return t.endDate>mx?t.endDate:mx;}, today);
      var horizonWeeks = Math.max(0, Math.ceil((+lastEnd - +today)/(7*86400000)));

      return '<div style="padding:8px 0;border-bottom:1px solid #F5F5F5">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
          +'<div style="font-size:10px;font-weight:700;color:#111">'+devName+'</div>'
          +'<div style="font-size:9px;color:#AAA">'+totalH+'h · '+horizonWeeks+' sem</div>'
        +'</div>'
        +'<div style="display:flex;gap:4px;flex-wrap:wrap">'
        +Object.keys(pools).map(function(pool) {
          var items = pools[pool];
          if (!items.length) return '';
          var col = POOL_COLORS[pool];
          return '<span style="font-size:8px;padding:2px 8px;border-radius:12px;'
            +'background:'+POOL_BGS[pool]+';border:1px solid '+col+';color:'+col+';font-weight:600">'
            +items.length+' '+pool+'</span>';
        }).join('')
        +'</div>'
        +'</div>';
    }).join('');

    // Overall stats
    var totalProjs = timeline.length;
    var totalH2 = timeline.reduce(function(s,t){return s+t.totalHours;},0);
    var globalEnd = timeline.reduce(function(mx,t){return t.endDate>mx?t.endDate:mx;},today);
    var globalWeeks = Math.ceil((+globalEnd-+today)/(7*86400000));

    sumEl.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">'
      +[['Proyectos',totalProjs,'#111'],['Total horas',totalH2+'h','#1848A0'],['Horizonte',globalWeeks+' sem','#087B50']]
        .map(function(k){ return '<div style="text-align:center;padding:6px;background:#F7F7F5;border-radius:6px">'
          +'<div style="font-size:16px;font-weight:800;color:'+k[2]+'">'+k[1]+'</div>'
          +'<div style="font-size:8px;color:#AAA;text-transform:uppercase;letter-spacing:.08em">'+k[0]+'</div>'
          +'</div>'; }).join('')
      +'</div>'
      + html;
  }

  // ── Next free slots ────────────────────────────────────────
  var slotsEl = document.getElementById('plan-next-slots');
  if (slotsEl) {
    var devSlots = (devTeam||[]).map(function(dev) {
      var devTL = timeline.filter(function(t){return t.devName===dev.name;});
      var wh = pDevHours(dev);
      var slots = Object.keys(wh).filter(function(k){return wh[k]>0;}).map(function(pool) {
        var poolTL = devTL.filter(function(t){return t.pool===pool;})
                         .sort(function(a,b){return a.endDate-b.endDate;});
        var nextFree = poolTL.length
          ? pNextWork(new Date(poolTL[poolTL.length-1].endDate))
          : pNextWork(new Date());
        return {pool:pool, nextFree:nextFree, wh:wh[pool]};
      });
      return {devName:dev.name, slots:slots};
    });

    slotsEl.innerHTML = devSlots.map(function(d) {
      return '<div style="padding:6px 0;border-bottom:1px solid #F5F5F5">'
        +'<div style="font-size:10px;font-weight:700;color:#111;margin-bottom:4px">'+d.devName+'</div>'
        +d.slots.map(function(s) {
          var col = POOL_COLORS[s.pool];
          var isNow = +s.nextFree <= +today + 7*86400000; // within a week
          return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">'
            +'<span style="font-size:8px;padding:1px 6px;border-radius:10px;'
              +'background:'+POOL_BGS[s.pool]+';color:'+col+';border:1px solid '+col+';font-weight:600">'+s.pool+'</span>'
            +'<span style="font-size:10px;color:'+( isNow?'#087B50':'#555' )+';font-weight:'+(isNow?700:400)+'">'+pShort(s.nextFree)+'</span>'
            +'<span style="font-size:8px;color:#AAA">'+s.wh.toFixed(1)+'h/sem</span>'
            +(isNow?'<span style="font-size:8px;color:#087B50;font-weight:700">← disponible pronto</span>':'')
            +'</div>';
        }).join('')
        +'</div>';
    }).join('');
  }
}

// ── CHAT ASSISTANT ─────────────────────────────────────────────
var _chatHistory = [];

function planChatQuestion(q) {
  var inp = document.getElementById('plan-chat-input');
  if (inp) inp.value = q;
  planChatSend();
}

function planChatSend() {
  var inp = document.getElementById('plan-chat-input');
  if (!inp || !inp.value.trim()) return;
  var q = inp.value.trim();
  inp.value = '';

  _chatAddMsg('user', q);
  var answer = _planChatAnswer(q);
  setTimeout(function(){ _chatAddMsg('assistant', answer); }, 200);
}

function _chatAddMsg(role, text) {
  var container = document.getElementById('plan-chat-msgs');
  if (!container) return;

  // Remove placeholder if present
  var placeholder = container.querySelector('div[style*="color:#AAA"]');
  if (placeholder && !_chatHistory.length) placeholder.remove();

  var isUser = role === 'user';
  var msg = document.createElement('div');
  msg.style.cssText = 'display:flex;gap:8px;align-items:flex-start;'+(isUser?'flex-direction:row-reverse':'');
  
  var avatar = document.createElement('div');
  avatar.style.cssText = 'width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;'
    +'align-items:center;justify-content:center;font-size:10px;'
    +(isUser?'background:#111;color:#fff':'background:#ECF8F3;color:#087B50');
  avatar.textContent = isUser ? '👤' : '🤖';

  var bubble = document.createElement('div');
  bubble.style.cssText = 'max-width:85%;padding:8px 12px;border-radius:8px;font-size:10px;line-height:1.6;'
    +(isUser
      ?'background:#111;color:#fff;border-radius:8px 2px 8px 8px'
      :'background:#F7F7F5;color:#333;border-radius:2px 8px 8px 8px;border:1px solid #EBEBEB');
  bubble.innerHTML = text;

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;

  _chatHistory.push({role:role, text:text});
}

function _planChatAnswer(q) {
  var tl = planBuildTimeline();
  var qLow = (q||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  var today = new Date(); today.setHours(0,0,0,0);
  var has = function(){ for(var i=0;i<arguments.length;i++){ if(qLow.indexOf(arguments[i])>=0) return true; } return false; };

  // ── PRIORIZAR / cambiar evaluación de un proyecto ──
  // "prioriza X", "sube X", "marca X como prioritario", "baja X"
  if (has('prioriz','sube','subir','marca','prioritario','baja','bajar','desprioriz','aumenta','reduce')) {
    var up = has('prioriz','sube','subir','prioritario','aumenta','marca');
    var down = has('baja','bajar','desprioriz','reduce');
    // extraer nombre
    var hint = qLow.replace(/\b(prioriza|priorizar|sube|subir|baja|bajar|marca|como|prioritario|despriorizar|desprioriza|aumenta|aumentar|reduce|reducir|el|la|proyecto|proy|nota|de)\b/g,' ').replace(/\s+/g,' ').trim();
    if (hint.length < 2) return '✏️ Dime qué proyecto priorizar. Ej: <em>"prioriza el portal B2B"</em>';
    var m = portfolioData.filter(function(p){ return p.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(hint); });
    if (!m.length) return '🔍 No encontré ningún proyecto con "<strong>'+hint+'</strong>".';
    if (m.length > 1) return '🔍 Hay '+m.length+' proyectos con "<strong>'+hint+'</strong>". Sé más específico:<br>'+m.slice(0,6).map(function(p){return '· '+p.nom;}).join('<br>');
    var proj = m[0];
    // Ajustar: subir = poner D1-D3 altos; bajar = reducir
    var delta = down ? -2 : +2;
    ['c1_1','c1_4','c2_1','c3_1','c3_3'].forEach(function(cid){
      proj.scores[cid] = Math.max(1, Math.min(10, (proj.scores[cid]||5) + delta));
    });
    var before = (proj.sf||0).toFixed(2);
    Object.assign(proj, computeProj(proj));
    proj._manualEval = true;
    if (typeof renderPortfolio==='function') renderPortfolio();
    if (typeof renderPools==='function') renderPools();
    if (typeof renderDashboard==='function') renderDashboard();
    if (typeof renderCalendar==='function') renderCalendar();
    return (down?'🔽':'🔼')+' <strong>'+proj.nom+'</strong><br>'
      +'Score: '+before+' → <strong>'+(proj.sf||0).toFixed(2)+'</strong> · pool '+(getPool(proj)||'—')+'<br>'
      +'<span style="color:#888;font-size:10px">Evaluación ajustada y planificación recalculada.</span>';
  }

  // ── PONER NOTA concreta a un criterio/dimensión ──
  // "pon D1 a 9 en X", "sube ROI de X a 8"
  var noteM = qLow.match(/(d[1-6]|roi|compliance|legal|estrateg|tecnic|personas)\D*(\d{1,2})/);
  if (noteM && has('pon','poner','ajusta','cambia','set')) {
    var dimMap={d1:0,compliance:0,legal:0,d2:1,estrateg:1,d3:2,roi:2,d4:3,tecnic:3,d5:4,d6:5,personas:5};
    var di = dimMap[noteM[1]]; var val = Math.max(1,Math.min(10,parseInt(noteM[2])));
    var hint2 = qLow.replace(/.*\ben\b/,'').replace(/el proyecto|proyecto/g,'').trim();
    var mm = portfolioData.filter(function(p){return p.nom.toLowerCase().includes(hint2)&&hint2.length>2;});
    if (mm.length===1 && di!=null) {
      var pr=mm[0];
      var dimCrits=DIMS[di].criterios.map(function(c){return c.id;});
      dimCrits.forEach(function(cid){pr.scores[cid]=val;});
      Object.assign(pr,computeProj(pr)); pr._manualEval=true;
      if(typeof renderPortfolio==='function')renderPortfolio();
      if(typeof renderDashboard==='function')renderDashboard();
      return '✏️ <strong>'+pr.nom+'</strong> · '+DIMS[di].nom+' = '+val+'<br>Nuevo score: <strong>'+(pr.sf||0).toFixed(2)+'</strong>';
    }
  }

  if (!tl.length) return '⚠️ No hay proyectos planificados. Configura el equipo con horario semanal y carga proyectos con horas estimadas.';

  // ── SIGUIENTE proyecto que empieza ── (antes que "inicio" genérico)
  if (has('siguiente','proximo','next') && has('empie','proyecto','inicia','cola')) {
    var upcoming = tl.filter(function(t){return +t.startDate > +today;}).sort(function(a,b){return a.startDate-b.startDate;});
    if (!upcoming.length) return '✅ No hay proyectos pendientes de empezar — todo está en curso o terminado.';
    var n = upcoming[0];
    return '⏭ <strong>Siguiente en empezar:</strong><br><strong>'+n.proj.nom+'</strong><br>'
      +'Dev: '+n.devName+' · pool '+n.pool+'<br>Inicio: <strong>'+pFmt(n.startDate)+'</strong> · fin '+pFmt(n.endDate);
  }

  // ── LIBRE / disponibilidad por desarrollador ──
  if (has('libre','dispon','availab') || (has('cuando') && has('dev','desarrollador'))) {
    var byDev={};
    tl.forEach(function(t){ if(!byDev[t.devName]||+t.endDate>+byDev[t.devName])byDev[t.devName]=+t.endDate; });
    var rows = Object.keys(byDev).map(function(d){
      var free=pNextWork(new Date(byDev[d]));
      return '👤 <strong>'+d+'</strong>: libre el '+pFmt(free);
    });
    if(!rows.length) return 'No hay desarrolladores con proyectos asignados.';
    return '🗓 <strong>Disponibilidad del equipo:</strong><br>'+rows.join('<br>');
  }

  // ── CORTOS ──
  if (has('corto','short')) return _chatListPool(tl,'corto','⚡ Proyectos CORTOS');
  // ── MEDIOS ──
  if (has('medio','mediano','medium')) return _chatListPool(tl,'medio','◉ Proyectos MEDIOS');
  // ── LARGOS ──
  if (has('larg','long')) return _chatListPool(tl,'largo','▣ Proyectos LARGOS');

  // ── INICIO de un proyecto concreto ──
  if (has('empie','inicia','inicio','start','cuando')) {
    var nameHint = qLow.replace(/cuando empie[az]a?|cuando se inicia?|inicio de|fecha de inicio|empie[az]a?|inicia?|inicio|start|cuando/g,'').replace(/el proyecto|proyecto|proy/g,'').trim();
    if (nameHint.length > 2) {
      var matches = tl.filter(function(t){return t.proj.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(nameHint);});
      if (matches.length===1){ var t=matches[0]; var started=+t.startDate<=+today;
        return '📅 <strong>'+t.proj.nom+'</strong><br>Pool '+t.pool+' · Dev '+t.devName+'<br>'
          +(started?'🟢 En curso desde ':'Inicio: ')+'<strong>'+pFmt(t.startDate)+'</strong><br>Fin: '+pFmt(t.endDate)
          +'<br>Score '+(t.proj.sf||0).toFixed(2)+' · '+t.totalHours+'h';
      }
      if (matches.length>1) return '🔍 '+matches.length+' coinciden con "'+nameHint+'":<br>'+matches.slice(0,8).map(function(t){return '· '+t.proj.nom+' ('+pFmt(t.startDate)+')';}).join('<br>');
      return '🔍 Sin coincidencias con "<strong>'+nameHint+'</strong>".';
    }
  }

  // ── LISTAR todo ──
  if (has('list','muestra','todos','ver','completa','general','planificad','cartera')) {
    var sorted=tl.slice().sort(function(a,b){return a.startDate-b.startDate;});
    return '📋 <strong>'+sorted.length+' proyectos planificados:</strong><br>'
      + sorted.slice(0,15).map(function(t){
          return '<span style="color:'+POOL_COLORS[t.pool]+'">●</span> '+t.proj.nom.substring(0,38)
            +' <span style="color:#888">'+pFmt(t.startDate)+'→'+pFmt(t.endDate)+'</span>';
        }).join('<br>')
      + (sorted.length>15?'<br><span style="color:#888">…y '+(sorted.length-15)+' más</span>':'');
  }

  // ── CUÁNTOS / resumen ──
  if (has('cuanto','cuantos','total','resumen','estadis')) {
    var pools={corto:0,medio:0,largo:0}; tl.forEach(function(t){pools[t.pool]++;});
    var totalH=tl.reduce(function(s,t){return s+t.totalHours;},0);
    var maxEnd=tl.reduce(function(mx,t){return +t.endDate>+mx?t.endDate:mx;},today);
    return '📊 <strong>Resumen de planificación:</strong><br>'
      +'Total: '+tl.length+' proyectos · '+Math.round(totalH)+'h<br>'
      +'⚡ Cortos: '+pools.corto+' · ◉ Medios: '+pools.medio+' · ▣ Largos: '+pools.largo+'<br>'
      +'Fin de cola: <strong>'+pFmt(maxEnd)+'</strong>';
  }

  // ── AYUDA (fallback) ──
  return '🤖 <strong>Puedo ayudarte con:</strong><br>'
    +'• <em>"prioriza el portal B2B"</em> — sube la nota de un proyecto<br>'
    +'• <em>"baja el proyecto X"</em> — reduce su prioridad<br>'
    +'• <em>"pon D1 a 9 en X"</em> — fija la nota de una dimensión<br>'
    +'• <em>"¿cuándo empieza X?"</em> — fecha de un proyecto<br>'
    +'• <em>"siguiente proyecto"</em> — el próximo en empezar<br>'
    +'• <em>"¿cuándo está libre cada dev?"</em><br>'
    +'• <em>"muestra los cortos / medios / largos"</em><br>'
    +'• <em>"lista todos"</em> · <em>"resumen"</em>';
}

function _chatListPool(tl, pool, title) {
  var items = tl.filter(function(t){return t.pool===pool;}).sort(function(a,b){return a.startDate-b.startDate;});
  if (!items.length) return title+'<br>No hay proyectos en este pool.';
  return title+' ('+items.length+'):<br>'
    + items.slice(0,12).map(function(t){
        return '· '+t.proj.nom.substring(0,36)+' <span style="color:#888">'+pFmt(t.startDate)+'</span>';
      }).join('<br>')
    + (items.length>12?'<br><span style="color:#888">…y '+(items.length-12)+' más</span>':'');
}

// ── renderCalendar override to also update summary ─────────────
var _origRenderCalendar = renderCalendar;
renderCalendar = function() {
  _origRenderCalendar();
  renderPlanningSummary();
};

/* ═══════════════════════════════════════════════════════════════
   AUTO-RECALCULATE HOOKS
   Called whenever: scoring changes, slots change, hours change
   ═══════════════════════════════════════════════════════════════ */

// Register hooks after DOM is ready
(function() {
  function _scheduleRecalc() {
    if (typeof renderCalendar !== 'function') return;
    // Only recalc if planning screen is active
    var planStep = document.getElementById('step-planning');
    if (planStep && planStep.classList.contains('on')) {
      renderCalendar();
    }
  }

  // Hook into saveDevCapacity (slots change)
  var _origSaveDev = typeof saveDevCapacity !== 'undefined' ? saveDevCapacity : null;
  if (_origSaveDev) {
    saveDevCapacity = function() {
      _origSaveDev.apply(this, arguments);
      _scheduleRecalc();
    };
  }

  // Hook into saveManualToPortfolio (hours/score change)
  var _origSaveManual = typeof saveManualToPortfolio !== 'undefined' ? saveManualToPortfolio : null;
  if (_origSaveManual) {
    saveManualToPortfolio = function() {
      _origSaveManual.apply(this, arguments);
      setTimeout(_scheduleRecalc, 300);
    };
  }
})();

/* ═══════════════════════════════════════════════════════════════
   NEXT FREE SLOT BANNER — prominent display
   ═══════════════════════════════════════════════════════════════ */
function renderNextSlotBanner() {
  var el = document.getElementById('plan-next-slot-banner');
  if (!el) return;

  var timeline = planBuildTimeline();
  var today    = new Date(); today.setHours(0,0,0,0);

  if (!devTeam || !devTeam.length || !timeline.length) {
    el.style.display = 'none'; return;
  }

  // ── Global next free date: after ALL queued projects ────────
  var globalEnd = timeline.reduce(function(mx,t){
    return +t.endDate > +mx ? t.endDate : mx;
  }, today);
  var globalFree    = pNextWork(new Date(globalEnd));
  var daysUntilFree = Math.max(0, Math.ceil((+globalFree - +today)/86400000));
  var weeksUntil    = (daysUntilFree/5).toFixed(1);
  var freeUrgency   = daysUntilFree<=7 ? '#087B50' : daysUntilFree<=30 ? '#C07800' : '#1848A0';
  var freeBg        = daysUntilFree<=7 ? '#ECF8F3' : daysUntilFree<=30 ? '#FAF5E6' : '#EEF3FC';
  var freeLabel     = daysUntilFree===0 ? 'Disponible hoy'
    : daysUntilFree===1 ? 'Mañana'
    : daysUntilFree<=7  ? 'En '+daysUntilFree+' días'
    : weeksUntil+' semanas';

  // ── Per-dev cards ────────────────────────────────────────────
  var devCards = (devTeam||[]).map(function(dev) {
    var devTL  = timeline.filter(function(t){return t.devName===dev.name;})
                         .sort(function(a,b){return a.startDate-b.startDate;});
    if (!devTL.length) return '';

    var inProgress = devTL.filter(function(t){return +t.startDate<=+today && +today<+t.endDate;});
    var upcoming   = devTL.filter(function(t){return +t.startDate>+today;});
    var lastEnd    = devTL.reduce(function(mx,t){return +t.endDate>+mx?+t.endDate:mx;},+today);
    var devFree    = pNextWork(new Date(lastEnd));
    var devDays    = Math.max(0,Math.ceil((+devFree-+today)/86400000));
    var devUrgency = devDays<=7?'#087B50':devDays<=30?'#C07800':'#555';
    var devBg      = devDays<=7?'#ECF8F3':devDays<=30?'#FAF5E6':'#F7F7F7';

    var inProgHtml = inProgress.length
      ? inProgress.map(function(t){
          var col = POOL_COLORS[t.pool];
          var pct = Math.round(Math.max(0,Math.min(1,(+today-+t.startDate)/(+t.endDate-+t.startDate||1)))*100);
          return '<div style="margin-bottom:4px;background:#F7F7F7;border-radius:6px;padding:5px 8px">'
            +'<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:3px">'
              +'<div style="font-size:9px;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">'+t.proj.nom.substring(0,28)+(t.proj.nom.length>28?'…':'')+'</div>'
              +'<span style="font-size:7px;font-weight:700;padding:1px 5px;border-radius:8px;flex-shrink:0;background:'+POOL_BGS[t.pool]+';color:'+col+';border:1px solid '+col+'">'+t.pool+'</span>'
            +'</div>'
            +'<div style="display:flex;align-items:center;gap:6px">'
              +'<div style="flex:1;height:4px;background:#E8E8E8;border-radius:2px;overflow:hidden">'
                +'<div style="width:'+pct+'%;height:100%;background:'+col+';border-radius:2px"></div>'
              +'</div>'
              +'<span style="font-size:8px;color:'+col+';font-weight:600;white-space:nowrap">'+pct+'%</span>'
              +'<span style="font-size:8px;color:#AAA;white-space:nowrap">→ '+pShort(t.endDate)+'</span>'
            +'</div>'
          +'</div>';
        }).join('')
      : '<div style="font-size:9px;color:#AAA;padding:4px 0;font-style:italic">Sin proyectos en curso</div>';

    var upcomingHtml = upcoming.slice(0,3).map(function(t,qi){
      var col = POOL_COLORS[t.pool];
      return '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #F5F5F5">'
        +'<div style="width:16px;height:16px;border-radius:50%;background:'+col+';color:#fff;'
          +'font-size:8px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(qi+1)+'</div>'
        +'<div style="flex:1;min-width:0">'
          +'<div style="font-size:9px;font-weight:600;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+t.proj.nom.substring(0,24)+(t.proj.nom.length>24?'…':'')+'</div>'
          +'<div style="font-size:8px;color:#AAA">'+pShort(t.startDate)+' → '+pShort(t.endDate)+'</div>'
        +'</div>'
        +'<span style="font-size:7px;font-weight:700;padding:1px 5px;border-radius:8px;flex-shrink:0;background:'+POOL_BGS[t.pool]+';color:'+col+';border:1px solid '+col+'">'+t.pool+'</span>'
      +'</div>';
    }).join('') + (upcoming.length > 3
      ? '<div style="font-size:8px;color:#AAA;padding:4px 0">+'+( upcoming.length-3)+' proyectos más en cola</div>'
      : '');

    return '<div style="background:#fff;border:1.5px solid #EBEBEB;border-radius:10px;overflow:hidden;flex:1;min-width:260px;max-width:360px">'
      // Header
      +'<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#FAFAFA;border-bottom:1px solid #F0F0F0">'
        +'<div style="display:flex;align-items:center;gap:8px">'
          +'<div style="width:28px;height:28px;border-radius:50%;background:#111;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">'+dev.name.charAt(0).toUpperCase()+'</div>'
          +'<div>'
            +'<div style="font-size:11px;font-weight:700;color:#111">'+dev.name+'</div>'
            +'<div style="font-size:8px;color:#AAA">'+devTL.length+' proy · '+inProgress.length+' en curso</div>'
          +'</div>'
        +'</div>'
        // Free date chip
        +'<div style="text-align:right">'
          +'<div style="font-size:7px;color:#AAA;text-transform:uppercase;letter-spacing:.06em">Libre en</div>'
          +'<div style="font-size:11px;font-weight:800;color:'+devUrgency+'">'+pShort(devFree)+'</div>'
          +'<div style="font-size:8px;background:'+devBg+';color:'+devUrgency+';padding:1px 6px;border-radius:8px;font-weight:600">'+( devDays===0?'Hoy':devDays===1?'Mañana':devDays<=7?devDays+'d':Math.ceil(devDays/7)+'sem')+'</div>'
        +'</div>'
      +'</div>'
      // In progress
      +'<div style="padding:8px 12px;border-bottom:1px solid #F0F0F0">'
        +'<div style="font-size:8px;font-weight:700;color:#AAA;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px">🟢 En curso</div>'
        +inProgHtml
      +'</div>'
      // Upcoming
      +'<div style="padding:8px 12px">'
        +'<div style="font-size:8px;font-weight:700;color:#AAA;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px">⏭ Próximos en cola</div>'
        +(upcomingHtml || '<div style="font-size:9px;color:#AAA;font-style:italic">Sin proyectos pendientes</div>')
      +'</div>'
    +'</div>';
  }).filter(Boolean).join('');

  el.style.display = 'block';
  el.innerHTML =
    // Global free date — BIG prominent display
    '<div style="background:linear-gradient(135deg,'+freeBg+',#fff);border:2px solid '+freeUrgency+';'
      +'border-radius:12px;padding:16px 20px;margin-bottom:14px;'
      +'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">'
      +'<div>'
        +'<div style="font-size:10px;font-weight:700;color:'+freeUrgency+';text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px">'
          +'📅 Próxima fecha libre en el calendario'
        +'</div>'
        +'<div style="font-size:11px;color:#666;max-width:400px">'
          +'Cuando se completen TODOS los proyectos actualmente en cartera'
        +'</div>'
      +'</div>'
      +'<div style="text-align:right">'
        +'<div style="font-size:32px;font-weight:900;color:'+freeUrgency+';letter-spacing:-.5px;line-height:1">'
          +pShort(globalFree)
        +'</div>'
        +'<div style="font-size:13px;font-weight:700;color:'+freeUrgency+';margin-top:2px">'+freeLabel+'</div>'
        +'<div style="font-size:10px;color:#AAA">'+timeline.length+' proyectos · '+globalFree.getFullYear()+'</div>'
      +'</div>'
    +'</div>'
    // Dev cards
    +'<div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">'
      +'Estado por desarrollador'
    +'</div>'
    +'<div style="display:flex;gap:12px;flex-wrap:wrap">'+devCards+'</div>';
}



// Override renderCalendar to also update banner
(function(){
  var _orig = renderCalendar;
  renderCalendar = function() {
    _orig();
    renderNextSlotBanner();
  };
})();

/* ═══════════════════════════════════════════════════════════════
   GANTT HOURLY VIEW
   Shows slots by hour within each working day
   ═══════════════════════════════════════════════════════════════ */

function renderHourlyView(el, timeline) {
  var today = new Date(); today.setHours(0,0,0,0);
  var ws = pWeekStart(calRefDate);
  // Show 5 working days
  var days = [];
  for (var i=0; i<5; i++) {
    var d = new Date(ws); d.setDate(d.getDate()+i); days.push(d);
  }

  var HOUR_START = 7, HOUR_END = 20;
  var HOURS = HOUR_END - HOUR_START;
  var HOUR_PX = 56;   // pixels per hour
  var ROW_H2  = 50;
  var LABEL_W = 160;
  var DAY_W   = HOURS * HOUR_PX;
  var totalW  = days.length * DAY_W;

  var dayLabel = days[0].toLocaleDateString('es-ES',{day:'2-digit',month:'short'})
    +' – '+days[4].toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});

  // Week navigation
  var nav2 = document.createElement('div');
  nav2.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px';
  nav2.innerHTML =
    '<button onclick="calNav(-1)" style="padding:6px 14px;border:1px solid #DEDEDE;border-radius:6px;background:#fff;cursor:pointer;font-size:11px">← Semana anterior</button>'
    +'<div style="font-size:13px;font-weight:700;color:#111">'+dayLabel+'  <span style="font-size:10px;color:#888;font-weight:400">— vista horaria</span></div>'
    +'<button onclick="calNav(1)" style="padding:6px 14px;border:1px solid #DEDEDE;border-radius:6px;background:#fff;cursor:pointer;font-size:11px">Semana siguiente →</button>';
  el.appendChild(nav2);

  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'border:1px solid #EBEBEB;border-radius:10px;overflow:hidden;overflow-x:auto;box-shadow:0 2px 8px rgba(0,0,0,.04)';

  // Build hour columns header
  var headerRow = document.createElement('div');
  headerRow.style.cssText = 'display:flex;border-bottom:2px solid #EBEBEB;position:sticky;top:0;z-index:30;background:#fff;min-width:'+(LABEL_W+totalW)+'px';

  var cornerDiv = document.createElement('div');
  cornerDiv.style.cssText = 'width:'+LABEL_W+'px;flex-shrink:0;border-right:1px solid #EBEBEB;background:#FAFAF8;padding:8px 12px;font-size:8px;font-weight:700;color:#AAA;text-transform:uppercase;letter-spacing:.1em;display:flex;align-items:flex-end';
  cornerDiv.textContent = 'Dev / Slot';
  headerRow.appendChild(cornerDiv);

  var timeHeader = document.createElement('div');
  timeHeader.style.cssText = 'flex:1;position:relative;height:44px;min-width:'+totalW+'px;background:#FAFAF8;overflow:hidden';

  // Day columns
  days.forEach(function(day, di) {
    var isToday = day.toDateString() === today.toDateString();
    var dayX = di * DAY_W;

    // Day label
    var dl = document.createElementNS('http://www.w3.org/2000/svg','text');
    // Use div instead for simplicity
    var dayLabel2 = document.createElement('div');
    dayLabel2.style.cssText = 'position:absolute;left:'+dayX+'px;top:3px;width:'+DAY_W+'px;'
      +'text-align:center;font-size:9px;font-weight:700;color:'+(isToday?'#C4974A':'#555');
    dayLabel2.textContent = day.toLocaleDateString('es-ES',{weekday:'short',day:'2-digit',month:'short'}).toUpperCase();
    timeHeader.appendChild(dayLabel2);

    // Hour ticks
    for (var h = HOUR_START; h < HOUR_END; h++) {
      var hx = dayX + (h - HOUR_START) * HOUR_PX;
      var tick = document.createElement('div');
      tick.style.cssText = 'position:absolute;left:'+hx+'px;top:20px;'
        +'font-size:7px;color:#CCC;border-left:1px solid #F0F0F0;padding-left:2px;height:24px;'
        +'display:flex;align-items:flex-end';
      tick.textContent = h+'h';
      timeHeader.appendChild(tick);
    }

    // Day separator
    if (di > 0) {
      var sep = document.createElement('div');
      sep.style.cssText = 'position:absolute;left:'+dayX+'px;top:0;bottom:0;width:2px;background:#E0E0E0';
      timeHeader.appendChild(sep);
    }

    // Today highlight
    if (isToday) {
      var todayHl = document.createElement('div');
      todayHl.style.cssText = 'position:absolute;left:'+dayX+'px;top:0;width:'+DAY_W+'px;bottom:0;background:rgba(196,151,74,.06)';
      timeHeader.appendChild(todayHl);
    }
  });

  headerRow.appendChild(timeHeader);
  wrapper.appendChild(headerRow);

  // Dev rows
  var body = document.createElement('div');
  body.style.cssText = 'min-width:'+(LABEL_W+totalW)+'px';

  (devTeam||[]).forEach(function(dev, ri) {
    var devTL = timeline.filter(function(t){return t.devName===dev.name;});
    var wh = pDevHours(dev);
    var DAYMAP = {L:1,M:2,X:3,J:4,V:5};

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;border-bottom:1px solid #F0F0F0;background:'+(ri%2===0?'#fff':'#FDFDFD');

    // Label
    var lbl = document.createElement('div');
    lbl.style.cssText = 'width:'+LABEL_W+'px;flex-shrink:0;padding:8px 12px;border-right:1px solid #EBEBEB;'
      +'display:flex;flex-direction:column;justify-content:center';
    lbl.innerHTML = '<div style="display:flex;align-items:center;gap:6px">'
      +'<div style="width:22px;height:22px;border-radius:50%;background:#111;color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center">'+dev.name.charAt(0).toUpperCase()+'</div>'
      +'<span style="font-size:10px;font-weight:700;color:#111">'+dev.name+'</span>'
      +'</div>'
      +'<div style="font-size:8px;color:#AAA;margin-top:2px">'
      +Object.keys(wh).filter(function(k){return wh[k]>0;}).map(function(k){
        return '<span style="color:'+POOL_COLORS[k]+'">'+k+' '+wh[k].toFixed(0)+'h</span>';
      }).join(' ')+'</div>';

    // Time area
    var timeArea = document.createElement('div');
    timeArea.style.cssText = 'flex:1;position:relative;height:'+ROW_H2+'px;min-width:'+totalW+'px;overflow:hidden';

    // Grid: hour lines
    days.forEach(function(day, di) {
      var dayX = di * DAY_W;
      var isToday = day.toDateString()===today.toDateString();
      if (isToday) {
        var hl = document.createElement('div');
        hl.style.cssText='position:absolute;left:'+dayX+'px;top:0;width:'+DAY_W+'px;height:100%;background:rgba(196,151,74,.05)';
        timeArea.appendChild(hl);
      }
      var sep = document.createElement('div');
      sep.style.cssText='position:absolute;left:'+dayX+'px;top:0;width:2px;height:100%;background:'+(di>0?'#E0E0E0':'transparent');
      timeArea.appendChild(sep);
      for (var h=HOUR_START; h<HOUR_END; h++) {
        var hx = dayX + (h-HOUR_START)*HOUR_PX;
        var htick = document.createElement('div');
        htick.style.cssText='position:absolute;left:'+hx+'px;top:0;width:1px;height:100%;background:#F5F5F5';
        timeArea.appendChild(htick);
      }
    });

    // Slot blocks
    var dayKeyMap = {0:'D',1:'L',2:'M',3:'X',4:'J',5:'V',6:'S'};
    days.forEach(function(day, di) {
      var dayKey = dayKeyMap[day.getDay()];
      var slots = (dev.schedule||{})[dayKey] || [];
      var dayX = di * DAY_W;

      slots.forEach(function(slot) {
        var sh = parseInt(slot.start), sm = parseInt(slot.start.split(':')[1]||0);
        var eh = parseInt(slot.end),   em = parseInt(slot.end.split(':')[1]||0);
        var startFrac = (sh + sm/60) - HOUR_START;
        var durFrac   = (eh + em/60) - (sh + sm/60);
        if (startFrac < 0 || durFrac <= 0) return;

        var lx = dayX + startFrac * HOUR_PX;
        var wpx = durFrac * HOUR_PX - 2;
        if (wpx <= 0) return;

        var col = POOL_COLORS[slot.pool] || '#888';
        var bg  = POOL_BGS[slot.pool]   || '#F5F5F5';

        // Find which project is active on this day for this pool
        var activeProj = devTL.find(function(t){
          return t.pool===slot.pool && +t.startDate<=+day && +day<+t.endDate;
        });

        var projName = activeProj ? activeProj.proj.nom : '';
        var hours = durFrac.toFixed(1);
        var barH2 = ROW_H2 - 10;

        var slotDiv = document.createElement('div');
        slotDiv.style.cssText = 'position:absolute;left:'+lx+'px;width:'+wpx+'px;top:5px;height:'+barH2+'px;'
          +'border-radius:5px;overflow:hidden;'
          +'border:'+(activeProj?'2px':'1px')+' solid '+col+';'
          +'background:'+(activeProj?col:bg)+';'
          +'cursor:'+(activeProj?'grab':'default')+';'
          +'user-select:none;transition:box-shadow .1s;';
        if (activeProj) {
          slotDiv.title = projName + '\n' + slot.start+'–'+slot.end+' · '+slot.pool+' · '+hours+'h' + '\n' + pShort(activeProj.startDate)+' → '+pShort(activeProj.endDate) + '\nScore: '+(activeProj.proj.sf||0).toFixed(2);
        }

        // Content
        var inner = document.createElement('div');
        inner.style.cssText = 'height:100%;padding:2px 5px;display:flex;flex-direction:column;justify-content:center;pointer-events:none';
        // Row 1: pool + hours
        var r1 = document.createElement('div');
        r1.style.cssText = 'font-size:7px;font-weight:700;color:'+(activeProj?'rgba(255,255,255,.75)':col)+';letter-spacing:.04em';
        r1.textContent = slot.pool.toUpperCase()+' '+hours+'h';
        inner.appendChild(r1);
        // Row 2: project name (always shown if there is one)
        if (projName) {
          var r2 = document.createElement('div');
          r2.style.cssText = 'font-size:'+(wpx>80?'8.5':'7.5')+'px;font-weight:700;'
            +'color:'+(activeProj?'#fff':col)+';'
            +'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
            +'max-width:'+(wpx-10)+'px;line-height:1.2';
          r2.textContent = wpx > 60 ? projName : projName.substring(0,Math.max(3,Math.floor(wpx/6)));
          inner.appendChild(r2);
          // Row 3: dates (only if wide)
          if (wpx > 120 && activeProj) {
            var r3 = document.createElement('div');
            r3.style.cssText = 'font-size:7px;color:rgba(255,255,255,.65);margin-top:1px';
            r3.textContent = pShort(activeProj.startDate)+' → '+pShort(activeProj.endDate);
            inner.appendChild(r3);
          }
        }
        slotDiv.appendChild(inner);

        // Drag support for active project slots
        if (activeProj) {
          var nomForDrag = activeProj.proj.nom;
          var devForDrag = dev.name;
          var slotStartMs = +activeProj.startDate;
          var slotEndMs   = +activeProj.endDate;
          var durD = Math.max(1, Math.ceil((slotEndMs - slotStartMs)/86400000));

          slotDiv.addEventListener('mouseenter', function(){this.style.boxShadow='0 2px 10px rgba(0,0,0,.25)';});
          slotDiv.addEventListener('mouseleave', function(){this.style.boxShadow='none';});

          slotDiv.addEventListener('mousedown', function(ev) {
            ev.preventDefault(); ev.stopPropagation();
            var startX = ev.clientX;
            var HOUR_PX2 = 56;
            var ghost2 = document.createElement('div');
            ghost2.style.cssText = 'position:fixed;z-index:999;pointer-events:none;white-space:nowrap;'
              +'background:#111;color:#fff;padding:6px 12px;border-radius:8px;'
              +'font-size:10px;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,.3)';
            ghost2.textContent = '↔ ' + nomForDrag.substring(0,30);
            ghost2.style.left = (ev.clientX+14)+'px';
            ghost2.style.top  = (ev.clientY-20)+'px';
            document.body.appendChild(ghost2);
            document.body.style.userSelect = 'none';

            var DAYS_PX = HOUR_PX2 * 8; // pixels per full working day
            function onHourMove(e2) {
              var deltaPx = e2.clientX - startX;
              var deltaDays = deltaPx / DAYS_PX;
              var nd = new Date(slotStartMs + deltaDays*86400000);
              ghost2.textContent = '↔ '+nomForDrag.substring(0,20)+' · '+pShort(nd);
              ghost2.style.left = (e2.clientX+14)+'px';
              ghost2.style.top  = (e2.clientY-20)+'px';
            }
            function onHourUp(e2) {
              ghost2.remove(); document.body.style.userSelect = '';
              var deltaPx = e2.clientX - startX;
              // Snap to nearest working day (each DAYS_PX pixels = 1 day)
              var deltaDays = Math.round(deltaPx / DAYS_PX);
              if (deltaDays !== 0) {
                var ns = pNextWork(new Date(slotStartMs + deltaDays*86400000));
                ganttDoMove(nomForDrag, devForDrag, ns);
              }
              document.removeEventListener('mousemove', onHourMove);
              document.removeEventListener('mouseup', onHourUp);
            }
            document.addEventListener('mousemove', onHourMove);
            document.addEventListener('mouseup', onHourUp);
          });
        }

        timeArea.appendChild(slotDiv);
      });

      // Current time indicator (today only)
      if (day.toDateString()===today.toDateString()) {
        var now = new Date();
        var nowFrac = (now.getHours() + now.getMinutes()/60) - HOUR_START;
        if (nowFrac >= 0 && nowFrac <= HOURS) {
          var nowX = dayX + nowFrac * HOUR_PX;
          var nowLine = document.createElement('div');
          nowLine.style.cssText='position:absolute;left:'+nowX+'px;top:0;width:2px;height:100%;'
            +'background:rgba(204,31,38,.7);z-index:10';
          timeArea.appendChild(nowLine);
          var nowDot = document.createElement('div');
          nowDot.style.cssText='position:absolute;left:'+(nowX-4)+'px;top:0;width:8px;height:8px;'
            +'border-radius:50%;background:#CC1F26;z-index:11';
          timeArea.appendChild(nowDot);
        }
      }
    });

    row.appendChild(lbl);
    row.appendChild(timeArea);
    body.appendChild(row);
  });

  wrapper.appendChild(body);
  el.appendChild(wrapper);

  // Legend
  var legend = document.createElement('div');
  legend.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:9px;color:#888;align-items:center';
  Object.keys(POOL_COLORS).forEach(function(k){
    legend.innerHTML += '<span style="display:flex;align-items:center;gap:4px">'
      +'<span style="width:10px;height:10px;border-radius:2px;background:'+POOL_BGS[k]+';border:1.5px solid '+POOL_COLORS[k]+'"></span>'+k+' libre'
      +'</span>'
      +'<span style="display:flex;align-items:center;gap:4px">'
      +'<span style="width:10px;height:10px;border-radius:2px;background:'+POOL_COLORS[k]+';border:2px solid '+POOL_COLORS[k]+'"></span>'+k+' en proyecto'
      +'</span>';
  });
  legend.innerHTML += '<span>· Franja con color sólido = proyecto asignado en ese slot</span>';
  el.appendChild(legend);
}
