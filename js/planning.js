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
  var ROW_H    = 48;
  var HEAD_H   = 44;
  var ZOOM_LEVELS = [
    {name:'Semanas', dayPx:32},
    {name:'Meses',   dayPx:14},
    {name:'Trim.',   dayPx: 6},
  ];
  var zoomIdx = 0;

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
          txt.setAttribute('y', barY+17);
          txt.setAttribute('font-size','9');
          txt.setAttribute('font-weight','700');
          txt.setAttribute('fill', t.locked ? '#fff' : col);
          txt.setAttribute('clip-path','url(#'+clipId+')');
          txt.setAttribute('pointer-events','none');
          txt.textContent = t.proj.nom;
          g.appendChild(txt);

          // Score badge
          if (wpx > 60) {
            var score = document.createElementNS('http://www.w3.org/2000/svg','text');
            score.setAttribute('x', lx+wpx-18);
            score.setAttribute('y', barY+17);
            score.setAttribute('font-size','8');
            score.setAttribute('fill', t.locked?'rgba(255,255,255,.7)':col);
            score.setAttribute('opacity','.8');
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
      if (d.getDay()===1) {
        // Week tick
        _svgLine(svg, lx, 24, lx, HEAD_H, '#E0E0E0', 1, null);
        if (DPX >= 14) {
          var wt = document.createElementNS('http://www.w3.org/2000/svg','text');
          wt.setAttribute('x',lx+2); wt.setAttribute('y',38);
          wt.setAttribute('font-size','8'); wt.setAttribute('fill','#AAA');
          wt.textContent = d.getDate();
          svg.appendChild(wt);
        }
        // Month label (first week of month)
        if (d.getDate()<=7) {
          _svgLine(svg, lx, 0, lx, HEAD_H, '#CCCCCC', 1, null);
          var mt = document.createElementNS('http://www.w3.org/2000/svg','text');
          mt.setAttribute('x', lx+3); mt.setAttribute('y',15);
          mt.setAttribute('font-size','9'); mt.setAttribute('font-weight','700');
          mt.setAttribute('fill','#333'); mt.setAttribute('text-transform','uppercase');
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
      if (d.getDay()===1) {
        var isMonth = d.getDate()<=7;
        _svgLine(svg, lx, 0, lx, svgH, isMonth?'#E0E0E0':'#F5F5F5', 1, null);
      }
      // Weekend shading
      if (d.getDay()===6 && DPX>=10) {
        _svgRect(svg, lx, 0, DPX*2, svgH, 'rgba(0,0,0,.015)', 0);
      }
      d.setDate(d.getDate()+1);
    }
  }

  // ── Drag & resize ──────────────────────────────────────────
  function _startDragOrResize(e, t, ri, minDate, DPX) {
    e.preventDefault();
    var isResize = e.target.dataset.resize === '1';
    var nomEsc   = t.proj.nom;

    var origStartMs = +t.startDate;
    var origEndMs   = +t.endDate;
    var startX      = e.clientX;

    var ghost = null;
    if (!isResize) {
      ghost = _mkEl('div',
        'position:fixed;z-index:888;pointer-events:none;'
        +'background:rgba(17,17,17,.12);border:2px dashed #111;border-radius:6px;'
        +'padding:4px 8px;font-size:9px;font-weight:700;color:#111;white-space:nowrap;'
        +'display:flex;align-items:center;gap:4px');
      ghost.innerHTML = '↔ '+t.proj.nom.substring(0,25);
      ghost.style.left = (e.clientX+12)+'px';
      ghost.style.top  = (e.clientY-16)+'px';
      document.body.appendChild(ghost);
    }

    function onMove(ev) {
      var deltaPx   = ev.clientX - startX;
      var deltaDays = Math.round(deltaPx / DPX);
      if (ghost) {
        ghost.style.left = (ev.clientX+12)+'px';
        ghost.style.top  = (ev.clientY-16)+'px';
        var nd = new Date(origStartMs + deltaDays*86400000);
        ghost.innerHTML = '↔ '+t.proj.nom.substring(0,20)
          +'<br><span style="font-weight:400">'+pShort(nd)+'</span>';
      }
    }

    function onUp(ev) {
      if (ghost) ghost.remove();
      var deltaPx   = ev.clientX - startX;
      var deltaDays = Math.round(deltaPx / DPX);
      if (deltaDays === 0) { cleanup(); return; }

      if (isResize) {
        var ne = pAddDays(new Date(origEndMs), deltaDays);
        if (+ne <= origStartMs) { cleanup(); return; }
        var idx = lockedAssignments.findIndex(function(l){return l.nom===nomEsc;});
        var lk = {nom:nomEsc,devName:t.devName,
          startDate:new Date(origStartMs).toISOString(),endDate:ne.toISOString()};
        if(idx>=0) lockedAssignments[idx]=lk; else lockedAssignments.push(lk);
        pLogChange(nomEsc, pShort(new Date(origEndMs)), pShort(ne), t.devName);
      } else {
        var ns = pNextWork(new Date(origStartMs + deltaDays*86400000));
        ganttDoMove(nomEsc, t.devName, ns);
        cleanup(); return;
      }

      saveLocked();
      cleanup();
      renderCalendar();
    }

    function cleanup() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }

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
