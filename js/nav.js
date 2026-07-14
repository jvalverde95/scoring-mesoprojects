let previousStep = null;

/* ═══ EXTENDED NAVIGATION ══════════════════════════════ */
const NAV_PAGES = ['charts','pools','config','projects','eval','sprint','dashboard','wiki','planning','summary'];

function goStep(t) {
  if (window._sharedViewLocked) return;  // vista compartida: navegación bloqueada

  // Track where we're coming FROM (needed to detect manual eval → summary)
  previousStep = currentStep;

  // ── Wizard step 0 validation ────────────────────────────────
  if (typeof t === 'number' && t > 0 && currentStep === 0) {
    const nom  = document.getElementById('f-name')?.value?.trim();
    const area = document.getElementById('f-area')?.value?.trim() ||
                 document.getElementById('f-area')?.options?.[document.getElementById('f-area')?.selectedIndex]?.value?.trim();
    if (!nom)  { toast('⚠ Escribe un nombre para el proyecto'); document.getElementById('f-name')?.focus();  return; }
    if (!area) { toast('⚠ Selecciona un área antes de continuar'); document.getElementById('f-area')?.focus(); return; }
  }

  const SPECIAL = ['summary','charts','pools','config','projects','eval','sprint','dashboard','wiki','planning'];
  const isSpecial = SPECIAL.includes(t);
  const idx = isSpecial ? null : parseInt(t);

  // 1. Hide all steps, deactivate all nav
  document.querySelectorAll('.step').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.ndot').forEach((n, i) => {
    n.classList.toggle('active', !isSpecial && i+1 === idx);
    n.classList.toggle('done',   !isSpecial && typeof idx==='number' && i+1 < idx);
  });
  // Deactivate all nav items (lnav-item and legacy classes)
  document.querySelectorAll('.lnav-item, .nav-ico, .nsum').forEach(el => el.classList.remove('active'));

  // 1b. Show/hide wizard steps + .wh header based on step type
  const wizardPanel = document.getElementById('nav-dots');
  const whHeader    = document.getElementById('wiz-nav-bar');
  const isWizardStep = !isSpecial && typeof idx === 'number';
  const showWh = isWizardStep || ['summary','charts','pools'].includes(t);

  if (wizardPanel) wizardPanel.style.display = isWizardStep ? 'flex' : 'none';
  if (whHeader) whHeader.style.display = showWh ? 'flex' : 'none';

  // 2. Show the correct panel and activate nav
  if (t === 'summary') {
    const p = document.getElementById('step-summary');
    if (p) p.classList.add('on');
    const ns = document.getElementById('nav-sum');
    if (ns) ns.classList.add('active');
    updSummary();
    // If coming from wizard steps (manual eval), add to evaluator pool
    if (typeof previousStep === 'number' && previousStep >= 1 && previousStep <= 6) {
      if (typeof addManualEvalToPool === 'function') addManualEvalToPool();
    }
  
    if(typeof renderPriorityAnalysis==='function') renderPriorityAnalysis();} else if (NAV_PAGES.includes(t)) {
    const panel = document.getElementById('step-' + t);
    if (panel) panel.classList.add('on');
    const navEl = document.getElementById('nav-' + t);
    if (navEl) navEl.classList.add('active');
    if (t === 'charts')   refreshChartsStep();
    if (t === 'pools')    refreshPoolsStep();
    if (t === 'config') { if(typeof renderConfigStep==='function') renderConfigStep(); if(typeof renderDevRows==='function') renderDevRows();  if(typeof renderAlgoParams==='function') renderAlgoParams(); }
    if (t === 'projects') { if(typeof renderProjectsScreen==='function') renderProjectsScreen(); }
    if (t === 'eval')   { if(typeof renderEvalScreen==='function') renderEvalScreen(); }
    if (t === 'sprint')     {
      if(typeof renderSprintScreen==='function') renderSprintScreen();
      switchSprintTab('sprint');
    }
    if (t === 'planning') {
      if (typeof loadLocked      === 'function') loadLocked();
      if (typeof loadPlanningState=== 'function') loadPlanningState();
      if (typeof renderCalendar  === 'function') renderCalendar();
    
    if(typeof loadDevAssignments==='function') loadDevAssignments();
    if(typeof renderDevAssignPanel==='function') renderDevAssignPanel();}
    if (t === 'dashboard')  { if(typeof renderDashboard==='function') renderDashboard(); }
    if (t === 'wiki')      { if(typeof renderWikiThresholds==='function') renderWikiThresholds(); }
    if (t === 'config')    { if(typeof aiLoadKeywords==='function') aiLoadKeywords(); }
  } else {
    const p = document.getElementById('step-' + idx);
    if (p) p.classList.add('on');
  }

  // 3. Update state
  currentStep = isSpecial ? t : idx;
  updateProg();
  updateWizHeader(isSpecial ? t : idx);
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ═══ CHARTS STEP ═══════════════════════════════════════ */
const chartInst2 = {};

function refreshChartsStep() {
  const empty = document.getElementById('charts-step-empty');
  const content = document.getElementById('charts-step-content');
  if (!portfolioData.length) {
    if(empty) empty.style.display='block';
    if(content) content.style.display='none';
    return;
  }
  if(empty) empty.style.display='none';
  if(content) content.style.display='block';
  renderCharts2();
}

function switchChart(name, btn) {
  // Works for both summary charts and charts-step
  const prefix = btn?.closest('#step-charts') ? 'chart2-' : 'chart-';
  document.querySelectorAll('.csec').forEach(s => s.classList.remove('on'));
  document.querySelectorAll('.ctab').forEach(b => b.classList.remove('on'));
  const sec = document.getElementById(prefix + name);
  if (sec) sec.classList.add('on');
  if (btn) btn.classList.add('on');
  if (prefix === 'chart2-') renderCharts2(name);
  else renderCharts();

  // Re-render analytics charts when switching tab (canvas needs visible size)
  if (typeof renderAnalyticsCharts === 'function') setTimeout(function(){ try{renderAnalyticsCharts();}catch(e){} }, 60);
}


const CLS_BG2 = {
  'PRIORITARIO ESTRATÉGICO (D1)':'rgba(204,31,38,.8)',
  'PRIORITARIO ESTRATÉGICO':'rgba(10,82,40,.85)',
  'ALTA PRIORIDAD':'rgba(26,58,110,.8)',
  'PRIORIDAD MEDIA':'rgba(192,120,0,.75)',
  'BAJA PRIORIDAD':'rgba(55,65,81,.6)',
  'DESCARTAR':'rgba(127,29,29,.6)',
};

function sn(nom){ const m=nom.match(/^(\d+)\s*[-–]\s*(.{0,26})/); return m?m[1]+' '+m[2].trim():nom.substring(0,26); }

const DIM_COLORS = ['#CC1F26','#C4974A','#087B50','#C07800','#1848A0','#5C6570'];
const DIM_NAMES  = ['D1 Compliance','D2 Estrategia','D3 ROI','D4 Técnica','D5 Implant.','D6 Personas'];

function _chartInsight(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = '💡 ' + text;
}

function _chartKPIs(p) {
  const avg   = p.length ? (p.reduce((s,x)=>s+(x.sf||0),0)/p.length).toFixed(1) : '—';
  const prio  = p.filter(x=>{ const c=clsf(x.sf||0); return c.et==='PRIORITARIO'||c.et==='PRIORITARIO ESTRATÉGICO'||c.et==='PRIORITARIO ESTRATÉGICO (D1)'||x.autoP; }).length;
  const est   = p.filter(x=>x.horas!=null).length;
  const noEst = p.length - est;
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('ck-avg',avg); s('ck-prio',prio); s('ck-est',est); s('ck-noest',noEst);
  const krow = document.getElementById('charts-kpi-row');
  if (krow) { krow.style.display = 'flex'; }
  const sub = document.getElementById('charts-subtitle');
  if (sub) sub.textContent = p.length+' proyectos · actualizado ahora';
}

function _ch_ranking(p) {
  const top = [...p].sort((a,b)=>(b.sf||0)-(a.sf||0)).slice(0,20);
  const el  = document.getElementById('ch-ranking-list');
  if (!el) return;
  const maxSf = Math.max(...top.map(x=>x.sf||0), 1);
  el.innerHTML = top.map((x,i)=>{
    const ds = x.dimScores || [0,0,0,0,0,0];
    const total = ds.reduce((a,b)=>a+b,0) || 1;
    const segs = ds.map((d,di)=>`<div style="height:100%;background:${DIM_COLORS[di]};opacity:.85;width:${(d/total*100).toFixed(1)}%"></div>`).join('');
    const cl = clsf(x.sf||0);
    const scoreColor = (x.sf||0)>=8?'#087B50':(x.sf||0)>=6.5?'#C07800':'#CC1F26';
    return `<div style="display:grid;grid-template-columns:24px 1fr 200px 48px;gap:8px;align-items:center;padding:4px 0">
      <div style="font-size:10px;font-weight:700;color:var(--ink3);text-align:center">${i+1}</div>
      <div style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink)" title="${x.nom}">${x.nom}</div>
      <div style="display:flex;height:14px;border-radius:3px;overflow:hidden;background:var(--b)">${segs}</div>
      <div style="font-size:13px;font-weight:700;text-align:right;color:${scoreColor};font-family:'Playfair Display',serif">${(x.sf||0).toFixed(1)}</div>
    </div>`;
  }).join('');
  // Insight
  const d1dom = top.slice(0,5).map(x=>(x.dimScores||[])[0]||0);
  const avgD1 = d1dom.reduce((a,b)=>a+b,0)/d1dom.length;
  const insight = avgD1>7 ? 'El top 5 tiene D1 Compliance muy alto ('+avgD1.toFixed(1)+') — los proyectos prioritarios vienen principalmente de obligaciones regulatorias'
    : 'El top 5 tiene D1 moderado ('+avgD1.toFixed(1)+') — la prioridad viene de valor estratégico y ROI, no solo de cumplimiento';
  _chartInsight('ch-ranking-insight', insight);
}

function _ch_dims(p) {
  const el = document.getElementById('ch-dims-list');
  if (!el) return;
  const avgs = DIMS.map((_,di)=> p.length ? p.reduce((s,x)=>s+((x.dimScores||[])[di]||0),0)/p.length : 0);
  const maxAvg = Math.max(...avgs, 1);
  el.innerHTML = DIMS.map((d,di)=>{
    const avg = avgs[di];
    const warn = avg < 6.0;
    return `<div style="display:grid;grid-template-columns:130px 1fr 48px;gap:8px;align-items:center">
      <div style="font-size:11px;font-weight:600;color:${DIM_COLORS[di]}">${DIM_NAMES[di]}</div>
      <div style="position:relative;height:8px;background:var(--b);border-radius:4px;overflow:visible">
        <div style="position:absolute;left:0;top:0;height:100%;width:${(avg/10*100).toFixed(1)}%;background:${DIM_COLORS[di]};border-radius:4px;opacity:.85"></div>
        <div style="position:absolute;left:60%;top:-4px;width:1.5px;height:16px;background:rgba(0,0,0,.2)"></div>
      </div>
      <div style="font-size:12px;font-weight:700;text-align:right;color:${DIM_COLORS[di]}">${avg.toFixed(1)}${warn?' ⚠':''}</div>
    </div>`;
  }).join('');
  const warnings = DIMS.filter((_,di)=>avgs[di]<6.0).map((_,di)=>DIM_NAMES[di]);
  const insight = warnings.length
    ? `${warnings.join(' y ')} ${warnings.length>1?'están por debajo':'está por debajo'} del umbral 6.0 — la cartera tiene debilidades en estas dimensiones que pueden limitar la capacidad de priorización`
    : 'Todas las dimensiones superan el umbral de 6.0 — la cartera está bien balanceada';
  _chartInsight('ch-dims-insight', insight);
}

function _ch_quad(p) {
  const id = 'c2-quad';
  if (chartInst2[id]) { chartInst2[id].destroy(); delete chartInst2[id]; }
  const cv = document.getElementById(id); if (!cv) return;
  chartInst2[id] = new Chart(cv, {
    type:'bubble',
    data:{datasets:[{
      label:'Proyectos',
      data: p.map(x=>({
        x:+((x.dimScores||[])[2]||0).toFixed(2),
        y:+((x.dimScores||[])[1]||0).toFixed(2),
        r: Math.max(4,((x.dimScores||[])[0]||0)*1.6),
        nom:sn(x.nom), score:x.sf||0, cls:clsf(x.sf||0).et
      })),
      backgroundColor: p.map(x=>CLS_BG2[clsf(x.sf||0).et]||'rgba(196,151,74,.7)'),
      borderColor:'rgba(255,255,255,.5)', borderWidth:1.5
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{top:24,right:24,bottom:8,left:8}},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:d=>[d.raw.nom,'ROI: '+d.raw.x+' · Estrategia: '+d.raw.y,'Score: '+d.raw.score.toFixed(2)+' · '+d.raw.cls]}},
      },
      scales:{
        x:{title:{display:true,text:'D3 — ROI / Valor de negocio →',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
        y:{title:{display:true,text:'D2 — Urgencia Estratégica ↑',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}}
      }
    }
  });
  const qw = p.filter(x=>((x.dimScores||[])[2]||0)>=5.5 && ((x.dimScores||[])[1]||0)>=5.5).length;
  _chartInsight('ch-quad-insight', qw+' proyectos en zona "Quick wins" (alto ROI + alta urgencia estratégica) — candidatos prioritarios para el próximo sprint');
}

function _ch_areas(p) {
  const el = document.getElementById('ch-areas-table');
  if (!el) return;
  const byArea = {};
  p.forEach(x=>{
    const a = x.area||'Sin área';
    if (!byArea[a]) byArea[a]={sum:0,n:0,top:null};
    byArea[a].sum += x.sf||0; byArea[a].n++;
    if (!byArea[a].top || (x.sf||0)>byArea[a].top.sf) byArea[a].top=x;
  });
  const sorted = Object.entries(byArea).sort((a,b)=>b[1].sum/b[1].n - a[1].sum/a[1].n);
  const maxAvg = Math.max(...sorted.map(([,v])=>v.sum/v.n), 1);
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr>
      <th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--b);color:var(--ink3);font-weight:500">Área</th>
      <th style="text-align:center;padding:5px 8px;border-bottom:1px solid var(--b);color:var(--ink3);font-weight:500">Score</th>
      <th style="text-align:center;padding:5px 8px;border-bottom:1px solid var(--b);color:var(--ink3);font-weight:500">N</th>
      <th style="padding:5px 8px;border-bottom:1px solid var(--b);color:var(--ink3);font-weight:500">Distribución</th>
      <th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--b);color:var(--ink3);font-weight:500">Top proyecto</th>
    </tr></thead>
    <tbody>${sorted.map(([area,v])=>{
      const avg = v.sum/v.n;
      const pct = (avg/maxAvg*100).toFixed(1);
      const c   = avg>=7.5?'#087B50':avg>=6?'#C07800':'#CC1F26';
      const bg  = avg>=7.5?'#E8F5F0':avg>=6?'#FEF9EC':'#FEF0F1';
      return `<tr>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--b);font-weight:600;color:var(--ink)">${area}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--b);text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:20px;background:${bg};color:${c};font-weight:700;font-size:11px">${avg.toFixed(1)}</span></td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--b);text-align:center;color:var(--ink3)">${v.n}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--b)">
          <div style="background:var(--b);border-radius:3px;height:6px;overflow:hidden">
            <div style="height:6px;border-radius:3px;background:${c};width:${pct}%"></div>
          </div>
        </td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--b);color:var(--ink3);font-size:10px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.top?sn(v.top.nom)+' '+((v.top.sf||0).toFixed(1)):'—'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
  const best = sorted[0]; const worst = sorted[sorted.length-1];
  _chartInsight('ch-areas-insight', best ? `${best[0]} lidera con score ${(best[1].sum/best[1].n).toFixed(1)} · ${worst[0]} tiene el score más bajo (${(worst[1].sum/worst[1].n).toFixed(1)}) — revisar si hay proyectos ESG o estratégicos sin evaluar en esa área` : '');
}

function _ch_dist(p) {
  const el = document.getElementById('ch-dist-list');
  if (!el) return;
  const CLS_ORDER = ['PRIORITARIO ESTRATÉGICO (D1)','PRIORITARIO ESTRATÉGICO','ALTA PRIORIDAD','PRIORIDAD MEDIA','BAJA PRIORIDAD','DESCARTAR'];
  const CLS_COLORS_DIST = {'PRIORITARIO ESTRATÉGICO (D1)':'#CC1F26','PRIORITARIO ESTRATÉGICO':'#087B50','ALTA PRIORIDAD':'#1848A0','PRIORIDAD MEDIA':'#C07800','BAJA PRIORIDAD':'#5C6570','DESCARTAR':'#B4B2A9'};
  const CLS_BG_DIST = {'PRIORITARIO ESTRATÉGICO (D1)':'#FEF0F1','PRIORITARIO ESTRATÉGICO':'#E8F5F0','ALTA PRIORIDAD':'#EEF3FC','PRIORIDAD MEDIA':'#FEF9EC','BAJA PRIORIDAD':'#F4F4F4','DESCARTAR':'#F4F4F4'};
  const counts = {}; p.forEach(x=>{ const k=clsf(x.sf||0).et; counts[k]=(counts[k]||0)+1; });
  const max = Math.max(...Object.values(counts), 1);
  el.innerHTML = CLS_ORDER.filter(k=>counts[k]).map(k=>`
    <div style="display:grid;grid-template-columns:180px 1fr 40px;gap:10px;align-items:center">
      <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;background:${CLS_BG_DIST[k]||'#F4F4F4'};color:${CLS_COLORS_DIST[k]||'#888'}">${k}</span>
      <div style="background:var(--b);border-radius:3px;height:8px;overflow:hidden">
        <div style="height:8px;border-radius:3px;background:${CLS_COLORS_DIST[k]||'#888'};width:${((counts[k]||0)/max*100).toFixed(1)}%;opacity:.85"></div>
      </div>
      <div style="font-size:12px;font-weight:700;text-align:right;color:var(--ink)">${counts[k]||0}</div>
    </div>`).join('');
  const med = (counts['PRIORIDAD MEDIA']||0) + (counts['BAJA PRIORIDAD']||0);
  _chartInsight('ch-dist-insight', med+' proyectos ('+((med/p.length)*100).toFixed(0)+'%) en zona media/baja — candidatos a reevaluar con el agente técnico para afinar D4/D5');
}

function _ch_matrix(p) {
  const el = document.getElementById('ch-matrix-grid');
  if (!el) return;
  const zones = [
    {key:'hh', label:'D1 alto + D2 alto', sub:'Proyectos clave', color:'#1848A0', bg:'#EEF3FC', fn:x=>((x.dimScores||[])[0]||0)>=5.5&&((x.dimScores||[])[1]||0)>=5.5},
    {key:'hl', label:'D1 alto + D2 bajo', sub:'Urgentes no estratégicos', color:'#CC1F26', bg:'#FEF0F1', fn:x=>((x.dimScores||[])[0]||0)>=5.5&&((x.dimScores||[])[1]||0)<5.5},
    {key:'lh', label:'D1 bajo + D2 alto', sub:'Inversión estratégica', color:'#C4974A', bg:'#FEF9EC', fn:x=>((x.dimScores||[])[0]||0)<5.5&&((x.dimScores||[])[1]||0)>=5.5},
    {key:'ll', label:'D1 bajo + D2 bajo', sub:'Baja prioridad', color:'#5C6570', bg:'#F4F4F4', fn:x=>((x.dimScores||[])[0]||0)<5.5&&((x.dimScores||[])[1]||0)<5.5},
  ];
  el.innerHTML = zones.map(z=>{
    const members = p.filter(z.fn);
    const top3 = members.sort((a,b)=>(b.sf||0)-(a.sf||0)).slice(0,3).map(x=>`<div style="font-size:10px;color:var(--ink3);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x.nom}</div>`).join('');
    return `<div style="border:1px solid var(--b);border-radius:8px;padding:12px;background:${z.bg}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="font-size:11px;font-weight:700;color:${z.color}">${z.label}</div>
        <div style="font-size:18px;font-weight:900;color:${z.color};font-family:'Playfair Display',serif">${members.length}</div>
      </div>
      <div style="font-size:9px;color:${z.color};opacity:.8;margin-bottom:6px">${z.sub}</div>
      ${top3}
    </div>`;
  }).join('');
  const hl = p.filter(zones[1].fn).length;
  _chartInsight('ch-matrix-insight', hl+' proyectos en "Urgente no estratégico" — los que más drenan al equipo sin generar ventaja competitiva · ¿se pueden agrupar, aplazar o automatizar?');
}

function _ch_aging(p) {
  const el = document.getElementById('ch-aging-table');
  const soon = document.getElementById('ch-aging-soon');
  if (!el) return;
  const withAging = p.filter(x=>(x.af||1)>1.001).sort((a,b)=>(b.af||1)-(a.af||1)).slice(0,8);
  el.innerHTML = withAging.length ? `<table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr>
      <th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--b);color:var(--ink3);font-weight:500">Proyecto</th>
      <th style="text-align:center;padding:5px 8px;border-bottom:1px solid var(--b);color:var(--ink3);font-weight:500">Score base</th>
      <th style="text-align:center;padding:5px 8px;border-bottom:1px solid var(--b);color:var(--ink3);font-weight:500">Aging</th>
      <th style="text-align:center;padding:5px 8px;border-bottom:1px solid var(--b);color:var(--ink3);font-weight:500">Score final</th>
      <th style="text-align:center;padding:5px 8px;border-bottom:1px solid var(--b);color:var(--ink3);font-weight:500">Ganancia</th>
    </tr></thead>
    <tbody>${withAging.map(x=>{
      const gain = ((x.sf||0)-(x.sb||0)).toFixed(1);
      return `<tr>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--b);font-size:11px;overflow:hidden;text-overflow:ellipsis;max-width:200px;white-space:nowrap">${sn(x.nom)}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--b);text-align:center;color:var(--ink3)">${(x.sb||0).toFixed(1)}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--b);text-align:center;color:#087B50;font-weight:600">×${(x.af||1).toFixed(2)}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--b);text-align:center;font-weight:700;color:var(--ink)">${(x.sf||0).toFixed(1)}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid var(--b);text-align:center"><span style="display:inline-block;padding:2px 7px;border-radius:20px;background:#E8F5F0;color:#087B50;font-size:11px;font-weight:600">+${gain}</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>` : '<div style="font-size:11px;color:var(--ink4)">Sin proyectos con aging activo</div>';
  // Soon
  if (soon) {
    const changing = p.filter(x=>{
      if(!x.reqDate) return false;
      const days = Math.round((Date.now()-new Date(x.reqDate))/86400000);
      return days>270 && days<365 && (x.sf||0)<7.5;
    }).slice(0,4);
    soon.innerHTML = changing.length
      ? changing.map(x=>`<span style="padding:4px 10px;background:#FEF9EC;border-radius:4px;font-size:10px;color:#C07800">${sn(x.nom)}</span>`).join('')
      : '<span style="font-size:10px;color:var(--ink4)">Ninguno en los próximos 90 días</span>';
  }
  _chartInsight('ch-aging-insight', withAging.length+' proyectos tienen boost de antigüedad — revisar capacidad del equipo para absorber los que suban de clasificación');
}

function _ch_gaps(p) {
  const el = document.getElementById('ch-gaps-list');
  if (!el) return;
  const varByCrit = {};
  CRIT_IDS.forEach(cid=>{
    const vals = p.map(x=>(x.scores||{})[cid]||5);
    const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
    const variance = vals.reduce((a,b)=>a+(b-avg)**2,0)/vals.length;
    varByCrit[cid] = { sigma: Math.sqrt(variance), avg };
  });
  const sorted = Object.entries(varByCrit).sort((a,b)=>b[1].sigma-a[1].sigma).slice(0,8);
  const maxSigma = Math.max(...sorted.map(([,v])=>v.sigma), 1);
  el.innerHTML = sorted.map(([cid,v])=>{
    // Find crit name from DIMS
    let critNom = cid;
    DIMS.forEach((d,di)=>{ const c=d.criterios.find(x=>x.id===cid); if(c) critNom=DIM_NAMES[di]+' · '+c.nom.substring(0,30); });
    return `<div style="display:grid;grid-template-columns:220px 1fr 48px;gap:8px;align-items:center">
      <div style="font-size:10px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${critNom}">${critNom}</div>
      <div style="background:var(--b);border-radius:3px;height:6px;overflow:hidden">
        <div style="height:6px;border-radius:3px;background:#C07800;width:${(v.sigma/maxSigma*100).toFixed(1)}%;opacity:.85"></div>
      </div>
      <div style="font-size:11px;text-align:right;color:#C07800;font-weight:600">σ=${v.sigma.toFixed(1)}</div>
    </div>`;
  }).join('');
  const topGap = sorted[0];
  if (topGap) {
    let topNom = topGap[0];
    DIMS.forEach((d,di)=>{ const c=d.criterios.find(x=>x.id===topGap[0]); if(c) topNom=c.nom.substring(0,40); });
    _chartInsight('ch-gaps-insight', `"${topNom}" tiene la mayor varianza (σ=${topGap[1].sigma.toFixed(1)}) — el equipo evalúa este criterio de forma muy dispar · considera añadir una escala de referencia o ejemplos por valor`);
  }
}

function renderCharts2(name) {
  const p = portfolioData;
  if (!p.length) return;
  const active = name || document.querySelector('#step-charts .csec.on')?.id?.replace('chart2-','') || 'ranking';
  _chartKPIs(p);
  if (active==='ranking') _ch_ranking(p);
  else if (active==='dims')   _ch_dims(p);
  else if (active==='quad')   _ch_quad(p);
  else if (active==='areas')  _ch_areas(p);
  else if (active==='dist')   _ch_dist(p);
  else if (active==='matrix') _ch_matrix(p);
  else if (active==='aging')  _ch_aging(p);
  else if (active==='gaps')   _ch_gaps(p);
}



/* ═══ POOLS STEP ════════════════════════════════════════ */
function syncThresholds(which, val) {
  // Sync thr-s/thr-m inputs between summary and pools step
  const v = parseInt(val) || (which==='s'?30:100);
  if (which === 's') {
    const a=document.getElementById('thr-s'), b=document.getElementById('thr-s2');
    if(a) a.value=v; if(b) b.value=v;
  } else {
    const a=document.getElementById('thr-m'), b=document.getElementById('thr-m2');
    if(a) a.value=v; if(b) b.value=v;
    const lbl=document.getElementById('thr-l-lbl'); if(lbl) lbl.textContent=v+'h';
    const lbl2=document.getElementById('thr-l-lbl2'); if(lbl2) lbl2.textContent=v+'h';
  }
  updThresholds();
  refreshPoolsStep();
}

function refreshPoolsStep() {
  renderPoolsStep();
}

/* ── Manual evaluation shortcut ─────────────────────────────── */
function startManualEval() {
  // Reset wizard to step 0 for a fresh manual evaluation
  resetAll();
  goStep(0);
  // Scroll to top
  const stepsScroll = document.getElementById('steps-scroll');
  if (stepsScroll) stepsScroll.scrollTop = 0;
  toast('Nueva evaluación — rellena los datos y puntúa cada criterio');
}

function startApp() {
  document.getElementById('landing').style.display='none';
  document.getElementById('shell').style.display='';
  document.getElementById('bar').style.display='';
  goStep(0);
}

function enterApp() {
  document.getElementById('landing').style.display='none';
  document.getElementById('shell').style.display='';
  document.getElementById('bar').style.display='';
  goStep('dashboard');  // always start at dashboard
  // Si no hay proyectos cargados, exigir la carga del Excel (modal sin cierre)
  if (!portfolioData || portfolioData.length === 0) {
    setTimeout(showMandatoryExcelUpload, 300);
  }
}

// Modal obligatorio de carga de Excel al iniciar sesión (no se puede cerrar sin cargar)
function showMandatoryExcelUpload() {
  if (window._sharedViewLocked || window._sprintSnapshot) return;  // vista de directores: nunca pedir Excel
  if (portfolioData && portfolioData.length > 0) return;  // ya hay datos
  var ov = document.getElementById('mandatory-excel-overlay');
  if (ov) { ov.style.display = 'flex'; return; }
  ov = document.createElement('div');
  ov.id = 'mandatory-excel-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:900;background:rgba(12,18,32,.85);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:14px;padding:32px;max-width:520px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4)">'
      +'<div style="font-size:20px;font-weight:800;color:#1C2B4A;margin-bottom:8px">Carga la cartera de proyectos</div>'
      +'<div style="font-size:13px;color:#555;line-height:1.5;margin-bottom:20px">Para empezar a trabajar necesitas cargar el Excel con los proyectos y sus puntuaciones. Selecciona el archivo exportado por la herramienta.</div>'
      +'<div id="mandatory-excel-drop" onclick="document.getElementById(\'mandatory-excel-input\').click()" '
        +'style="border:2px dashed #C4974A;border-radius:12px;padding:36px 20px;text-align:center;cursor:pointer;background:#FDFAF3;transition:.2s">'
        +'<div style="font-size:34px;margin-bottom:8px">📊</div>'
        +'<div style="font-size:14px;font-weight:700;color:#1C2B4A;margin-bottom:4px">Selecciona el archivo Excel</div>'
        +'<div style="font-size:11px;color:#999">Formato .xlsx o .xls</div>'
      +'</div>'
      +'<input type="file" id="mandatory-excel-input" accept=".xlsx,.xls" style="display:none" onchange="handleMandatoryExcel(this)">'
      +'<div id="mandatory-excel-status" style="font-size:11px;color:#087B50;margin-top:14px;text-align:center;display:none"></div>'
      +'<div style="font-size:10px;color:#BBB;margin-top:18px;text-align:center">Esta ventana no se cerrará hasta que cargues la cartera.</div>'
    +'</div>';
  document.body.appendChild(ov);
}

function handleMandatoryExcel(inp) {
  if (!inp || !inp.files || !inp.files.length) return;
  var statusEl = document.getElementById('mandatory-excel-status');
  if (statusEl) { statusEl.style.display='block'; statusEl.textContent='Cargando…'; statusEl.style.color='#888'; }
  // Delegar en loadExcel; comprobar el resultado tras un instante
  try {
    loadExcel(inp);
  } catch(e) {
    if (statusEl) { statusEl.textContent='Error al cargar: '+e.message; statusEl.style.color='#C0392B'; }
    return;
  }
  // loadExcel es asíncrono (FileReader); comprobamos periódicamente si ya hay datos
  var tries = 0;
  var iv = setInterval(function(){
    tries++;
    if (portfolioData && portfolioData.length > 0) {
      clearInterval(iv);
      if (statusEl) { statusEl.textContent='✓ '+portfolioData.length+' proyectos cargados'; statusEl.style.color='#087B50'; }
      setTimeout(function(){
        var ov = document.getElementById('mandatory-excel-overlay');
        if (ov) ov.style.display='none';
      }, 700);
    } else if (tries > 40) {  // ~8s sin éxito
      clearInterval(iv);
      if (statusEl) { statusEl.textContent='No se detectaron proyectos. Revisa el archivo e inténtalo de nuevo.'; statusEl.style.color='#C0392B'; }
    }
  }, 200);
}

function switchSprintTab(tab) {
  const sprintTab  = document.getElementById('sprint-tab');
  const planTab    = document.getElementById('planning-tab');
  const btnSprint  = document.getElementById('tab-sprint');
  const btnPlan    = document.getElementById('tab-planning');

  if (sprintTab)  sprintTab.style.display  = tab === 'sprint'   ? '' : 'none';
  if (planTab)    planTab.style.display    = tab === 'planning' ? '' : 'none';

  if (btnSprint) {
    btnSprint.style.background = tab==='sprint' ? '#111' : '#fff';
    btnSprint.style.color      = tab==='sprint' ? '#fff' : '#666';
    btnSprint.style.borderColor= tab==='sprint' ? '#111' : '#DEDEDE';
  }
  if (btnPlan) {
    btnPlan.style.background = tab==='planning' ? '#111' : '#fff';
    btnPlan.style.color      = tab==='planning' ? '#fff' : '#666';
    btnPlan.style.borderColor= tab==='planning' ? '#111' : '#DEDEDE';
  }

  if (tab === 'planning') {
    // Redirect to dedicated planning screen
    goStep('planning');
  }
}


/* ═══════════════════════════════════════════════════════════════
   LOGIN + LANDING ANIMATIONS
   ═══════════════════════════════════════════════════════════════ */

function doLogin() {
  var user = (document.getElementById('login-user')?.value || '').trim().toLowerCase();
  var pass = (document.getElementById('login-pass')?.value || '').trim();
  var errEl = document.getElementById('login-error');

  // Validate
  if (!user || !pass) {
    if (errEl) { errEl.textContent = 'Introduce usuario y contraseña'; errEl.style.display = 'block'; }
    return;
  }
  if (user !== 'admin' || pass !== '1234') {
    if (errEl) { errEl.textContent = 'Usuario o contraseña incorrectos'; errEl.style.display = 'block'; }
    // Shake animation
    var panel = document.getElementById('login-panel');
    if (panel) {
      panel.style.animation = 'loginShake .4s ease';
      setTimeout(function(){ panel.style.animation = ''; }, 400);
    }
    return;
  }

  if (errEl) errEl.style.display = 'none';

  // Fade out landing
  var landing = document.getElementById('landing');
  if (landing) {
    landing.style.transition = 'opacity .4s ease';
    landing.style.opacity = '0';
    setTimeout(function() {
      enterApp();
    }, 400);
  } else {
    enterApp();
  }
}

// Landing canvas: animated particles + constellation lines
function initLandingCanvas() {
  var canvas = document.getElementById('landing-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Particles
  var NUM = 60;
  var particles = [];
  for (var i = 0; i < NUM; i++) {
    particles.push({
      x:   Math.random() * canvas.width,
      y:   Math.random() * canvas.height,
      r:   Math.random() * 1.5 + 0.3,
      vx:  (Math.random() - .5) * .35,
      vy:  (Math.random() - .5) * .35,
      a:   Math.random() * .7 + .2,
    });
  }

  // Mezcla de particulas: oro (ambicion) y azul (tecnologia)
  var palettes = [[196,151,74],[111,168,255],[120,210,225]];
  particles.forEach(function(p,i){ p.col = palettes[i % 3 === 0 ? 1 : (i % 7 === 0 ? 2 : 0)]; });
  var gold = [196, 151, 74];

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw lines between close particles
    for (var i = 0; i < particles.length; i++) {
      for (var j = i + 1; j < particles.length; j++) {
        var dx = particles[i].x - particles[j].x;
        var dy = particles[i].y - particles[j].y;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 130) {
          var opacity = (1 - dist/130) * .3;
          ctx.strokeStyle = 'rgba('+gold[0]+','+gold[1]+','+gold[2]+','+opacity+')';
          ctx.lineWidth = .6;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw particles
    particles.forEach(function(p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      var pc = p.col || gold;
      ctx.fillStyle = 'rgba('+pc[0]+','+pc[1]+','+pc[2]+','+p.a+')';
      ctx.fill();

      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// Update landing ADO status indicator
function updateLandingAdoStatus(state, msg) {
  var el = document.getElementById('landing-ado-status');
  if (!el) return;
  var colors = { ok:'#4CAF50', error:'#FF6B6B', syncing:'#C4974A', idle:'rgba(255,255,255,.3)' };
  var col = colors[state] || colors.idle;
  el.innerHTML = '<div style="width:6px;height:6px;border-radius:50%;background:'+col+';'
    +(state==='syncing'?'animation:pulseGlow 1s infinite':'')+'"></div>'
    +'<span style="color:'+col+'">'+msg+'</span>';
}

// Init on load
document.addEventListener('DOMContentLoaded', function() {
  initLandingCanvas();
  // Auto-focus login
  setTimeout(function(){
    var u = document.getElementById('login-user');
    if (u) u.focus();
  }, 300);
});

// ── Detección de enlace compartido de "En Marcha" ──
document.addEventListener('DOMContentLoaded', function(){
  try {
    if (typeof loadSprintSnapshotFromURL === 'function' && loadSprintSnapshotFromURL()) {
      // Es un enlace compartido: MODO BLOQUEADO de solo lectura, sin acceso al resto de la web
      setTimeout(function(){ enterSharedViewMode(); }, 200);
    }
  } catch(e) { console.error('snapshot init', e); }
});

// Activa una vista aislada: solo la pantalla En Marcha, sin navegación ni otras opciones
function enterSharedViewMode() {
  // Ocultar landing
  const landing = document.getElementById('landing');
  if (landing) landing.style.display = 'none';
  // Mostrar shell pero ocultar TODA la navegación
  const shell = document.getElementById('shell');
  if (shell) shell.style.display = 'block';
  const lnav = document.getElementById('lnav');
  if (lnav) lnav.style.display = 'none';            // sin menú lateral
  const bar = document.getElementById('bar');
  if (bar) bar.style.display = 'none';              // sin barra superior
  // Quitar margen que dejaba sitio al menú lateral
  const scroll = document.getElementById('steps-scroll');
  if (scroll) { scroll.style.marginLeft = '0'; scroll.style.left = '0'; scroll.style.width = '100%'; }
  // Ocultar el botón de compartir (los directores no re-comparten)
  document.querySelectorAll('[onclick*="shareSprintSnapshot"]').forEach(function(b){
    const wrap = b.closest('div'); if (wrap) wrap.style.display = 'none'; else b.style.display='none';
  });
  // Ocultar botones de navegación interna (Ver planificación, Configurar equipo…): no funcionan en vista compartida
  document.querySelectorAll('#step-sprint [onclick*="goStep"]').forEach(function(b){ b.style.display='none'; });
  // Mostrar SOLO el step de En Marcha, ocultar el resto
  document.querySelectorAll('.step').forEach(function(s){
    s.classList.remove('on');
    if (s.id === 'step-sprint') s.classList.add('on');
  });
  // Renderizar la vista de snapshot (solo lectura)
  if (typeof renderSprintSnapshotView === 'function') renderSprintSnapshotView();
  // Bloquear navegación por si algún control intentara cambiar de pantalla
  window._sharedViewLocked = true;
}
