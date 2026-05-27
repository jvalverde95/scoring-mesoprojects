/* ═══ EXTENDED NAVIGATION ══════════════════════════════ */
const NAV_PAGES = ['charts','pools','config'];

function goStep(t) {
  const SPECIAL = ['summary','charts','pools','config'];
  const isSpecial = SPECIAL.includes(t);
  const idx = isSpecial ? null : parseInt(t);

  // 1. Hide all steps, deactivate all nav
  document.querySelectorAll('.step').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.ndot').forEach((n, i) => {
    n.classList.toggle('active', !isSpecial && i+1 === idx);
    n.classList.toggle('done',   !isSpecial && typeof idx==='number' && i+1 < idx);
  });
  ['nav-sum','nav-charts','nav-pools','nav-config'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  // 2. Show the correct panel and activate nav
  if (t === 'summary') {
    const p = document.getElementById('step-summary');
    if (p) p.classList.add('on');
    const ns = document.getElementById('nav-sum');
    if (ns) ns.classList.add('active');
    updSummary();
  } else if (NAV_PAGES.includes(t)) {
    const panel = document.getElementById('step-' + t);
    if (panel) panel.classList.add('on');
    const navEl = document.getElementById('nav-' + t);
    if (navEl) navEl.classList.add('active');
    if (t === 'charts') refreshChartsStep();
    if (t === 'pools')  refreshPoolsStep();
    if (t === 'config') renderConfigStep();
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

function renderCharts2(name) {
  const active = name || document.querySelector('#step-charts .csec.on')?.id?.replace('chart2-','') || 'bubble';
  const p = portfolioData;

  if (active === 'bubble') {
    const id = 'c2-bubble';
    if (chartInst2[id]) { chartInst2[id].destroy(); delete chartInst2[id]; }
    const allCls = [...new Set(p.map(x => clsf(x.sf).et))];
    const datasets = allCls.map(cls => ({
      label: cls,
      data: p.filter(x => clsf(x.sf).et===cls).map(x => ({
        x: +x.dimScores[2].toFixed(2), y: +x.dimScores[0].toFixed(2),
        r: Math.max(5, x.dimScores[1]*2.2),
        nom: sn(x.nom), score: x.sf, area: x.area||''
      })),
      backgroundColor: CLS_BG2[cls]||'rgba(196,151,74,.7)',
      borderColor:'rgba(255,255,255,.5)', borderWidth:1.5
    }));
    const cv = document.getElementById(id); if(!cv) return;
    chartInst2[id] = new Chart(cv, {type:'bubble', data:{datasets},
      options:{responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{font:CHART_FONT,boxWidth:10,padding:10}},
          tooltip:{callbacks:{label:d=>[d.raw.nom,'Score: '+d.raw.score.toFixed(2)+' · '+d.raw.area,'D3 Valor: '+d.raw.x+' · D1 Compliance: '+d.raw.y]}}},
        scales:{x:{title:{display:true,text:'D3 — Valor de Negocio →',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
          y:{title:{display:true,text:'D1 — Compliance / Riesgo ↑',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}}}}});
  }
  if (active === 'bars') {
    const id = 'c2-bars';
    if (chartInst2[id]) { chartInst2[id].destroy(); delete chartInst2[id]; }
    const top = [...p].sort((a,b)=>b.sf-a.sf).slice(0,30);
    const cv = document.getElementById(id); if(!cv) return;
    chartInst2[id] = new Chart(cv, {type:'bar',
      data:{labels:top.map(x=>sn(x.nom)), datasets:[{label:'Score final',
        data:top.map(x=>+x.sf.toFixed(2)),
        backgroundColor:top.map(x=>CLS_BG2[clsf(x.sf).et]||'rgba(196,151,74,.7)'),
        borderRadius:3}]},
      options:{indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{x:{min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
          y:{ticks:{font:{family:'DM Sans',size:9}},grid:{display:false}}}}});
  }
  if (active === 'dept') {
    const id = 'c2-dept';
    if (chartInst2[id]) { chartInst2[id].destroy(); delete chartInst2[id]; }
    const byArea = {};
    p.forEach(x=>{ const a=x.area||'Sin área'; if(!byArea[a]) byArea[a]={sum:0,n:0}; byArea[a].sum+=x.sf; byArea[a].n++; });
    const sorted = Object.entries(byArea).sort((a,b)=>b[1].sum/b[1].n-a[1].sum/a[1].n);
    const cv = document.getElementById(id); if(!cv) return;
    chartInst2[id] = new Chart(cv, {type:'bar',
      data:{labels:sorted.map(([a])=>a), datasets:[
        {label:'Score medio',data:sorted.map(([,v])=>+(v.sum/v.n).toFixed(2)),backgroundColor:'rgba(196,151,74,.75)',borderColor:'#C4974A',borderWidth:1.5,borderRadius:4,yAxisID:'y'},
        {label:'Nº proyectos',data:sorted.map(([,v])=>v.n),type:'line',borderColor:'rgba(26,58,110,.7)',backgroundColor:'rgba(26,58,110,.1)',borderWidth:2,pointRadius:4,yAxisID:'y2'}]},
      options:{responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{font:CHART_FONT,boxWidth:10}}},
        scales:{y:{title:{display:true,text:'Score medio',font:CHART_FONT},min:0,max:10,ticks:{font:CHART_FONT}},
          y2:{position:'right',title:{display:true,text:'Nº proyectos',font:CHART_FONT},grid:{display:false},ticks:{font:CHART_FONT}},
          x:{ticks:{font:{family:'DM Sans',size:9}},grid:{display:false}}}}});
  }
  if (active === 'scatter') {
    const id = 'c2-scatter';
    if (chartInst2[id]) { chartInst2[id].destroy(); delete chartInst2[id]; }
    const cv = document.getElementById(id); if(!cv) return;
    chartInst2[id] = new Chart(cv, {type:'bubble',
      data:{datasets:[{label:'Proyectos',
        data:p.map(x=>({x:+x.dimScores[4].toFixed(2),y:+x.dimScores[2].toFixed(2),r:Math.max(4,x.dimScores[0]*1.8),nom:sn(x.nom),score:x.sf})),
        backgroundColor:p.map(x=>CLS_BG2[clsf(x.sf).et]||'rgba(196,151,74,.7)'),borderColor:'rgba(255,255,255,.4)',borderWidth:1.5}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:d=>[d.raw.nom,'D5: '+d.raw.x+' · D3: '+d.raw.y,'Score: '+d.raw.score.toFixed(2)]}}},
        scales:{x:{title:{display:true,text:'D5 — Facilidad de implantación →',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
          y:{title:{display:true,text:'D3 — Valor de negocio ↑',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}}}}});
  }
  if (active === 'heat') {
    const id = 'c2-heat';
    if (chartInst2[id]) { chartInst2[id].destroy(); delete chartInst2[id]; }
    const cv = document.getElementById(id); if(!cv) return;
    chartInst2[id] = new Chart(cv, {type:'bubble',
      data:{datasets:[{label:'Proyectos',
        data:p.map(x=>({x:+x.dimScores[0].toFixed(2),y:+x.dimScores[1].toFixed(2),r:Math.max(4,x.sf*1.4),nom:sn(x.nom),score:x.sf})),
        backgroundColor:p.map(x=>CLS_BG2[clsf(x.sf).et]||'rgba(196,151,74,.7)'),borderColor:'rgba(255,255,255,.4)',borderWidth:1}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:d=>[d.raw.nom,'D1: '+d.raw.x+' · D2: '+d.raw.y,'Score: '+d.raw.score.toFixed(2)]}}},
        scales:{x:{title:{display:true,text:'D1 — Compliance →',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
          y:{title:{display:true,text:'D2 — Estrategia ↑',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}}}}});
  }
  if (active === 'quad') {
    const id = 'c2-quad';
    if (chartInst2[id]) { chartInst2[id].destroy(); delete chartInst2[id]; }
    const cv = document.getElementById(id); if(!cv) return;
    chartInst2[id] = new Chart(cv, {type:'bubble',
      data:{datasets:[{label:'Proyectos',
        data:p.map(x=>({x:+x.dimScores[2].toFixed(2),y:+x.dimScores[1].toFixed(2),r:Math.max(4,x.dimScores[0]*1.6),nom:sn(x.nom),score:x.sf,cls:clsf(x.sf).et})),
        backgroundColor:p.map(x=>CLS_BG2[clsf(x.sf).et]||'rgba(196,151,74,.7)'),borderColor:'rgba(255,255,255,.4)',borderWidth:1.5}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:d=>[d.raw.nom,'D3: '+d.raw.x+' · D2: '+d.raw.y,'Score: '+d.raw.score.toFixed(2)+' · '+d.raw.cls]}}},
        scales:{x:{title:{display:true,text:'D3 — ROI / Valor →',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
          y:{title:{display:true,text:'D2 — Urgencia Estratégica ↑',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}}}}});
  }
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