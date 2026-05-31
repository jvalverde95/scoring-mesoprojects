let previousStep = null;

/* ═══ EXTENDED NAVIGATION ══════════════════════════════ */
const NAV_PAGES = ['charts','pools','config','projects','eval','sprint','dashboard','wiki'];

function goStep(t) {
  // Track where we're coming FROM (needed to detect manual eval → summary)
  previousStep = currentStep;

  const SPECIAL = ['summary','charts','pools','config','projects','eval','sprint','dashboard','wiki'];
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

  // 1b. Show/hide wizard steps panel based on step type
  const wizardPanel = document.getElementById('nav-dots');
  if (wizardPanel) {
    const isWizardStep = !isSpecial && typeof idx === 'number';
    wizardPanel.style.display = isWizardStep ? 'flex' : 'none';
  }

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
  } else if (NAV_PAGES.includes(t)) {
    const panel = document.getElementById('step-' + t);
    if (panel) panel.classList.add('on');
    const navEl = document.getElementById('nav-' + t);
    if (navEl) navEl.classList.add('active');
    if (t === 'charts')   refreshChartsStep();
    if (t === 'pools')    refreshPoolsStep();
    if (t === 'config') { if(typeof renderConfigStep==='function') renderConfigStep(); if(typeof renderDevRows==='function') renderDevRows(); }
    if (t === 'projects') { if(typeof renderProjectsScreen==='function') renderProjectsScreen(); }
    if (t === 'eval')   { if(typeof renderEvalScreen==='function') renderEvalScreen(); }
    if (t === 'sprint')     { if(typeof renderSprintScreen==='function') renderSprintScreen(); }
    if (t === 'dashboard')  { if(typeof renderDashboard==='function') renderDashboard(); }
    if (t === 'wiki')      { if(typeof renderWikiThresholds==='function') renderWikiThresholds(); }
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
  if (krow) krow.style.display = 'grid';
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
  const shell = document.getElementById('shell');
  if (shell) shell.scrollTop = 0;
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
  // Go to dashboard if projects exist, else to projects screen
  if (portfolioData.length > 0) {
    goStep('dashboard');
  } else {
    goStep('dashboard');  // always start at dashboard
  }
}