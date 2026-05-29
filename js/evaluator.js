/* ═══ AI EVALUATOR ENGINE ══════════════════════════════════ */
let _aiItems=[], _aiScored=[], _aiRunning=false, _aiStopped=false;

function aiItemStatus(item){
  const scored=item.status==='scored'||item.status==='complete';
  const hasH=item.proj.horas!=null&&item.proj.horas>0;
  if(scored&&hasH) return 'complete'; if(scored) return 'scored'; return 'pending';
}
function renderAiColumns(){
  const pending=[],scored=[],complete=[];
  _aiScored.forEach((item,i)=>{const st=aiItemStatus(item);item._col=st;if(st==='complete')complete.push({item,i});else if(st==='scored')scored.push({item,i});else pending.push({item,i});});
  const setCol=(colId,items)=>{const el=document.getElementById(colId);if(!el)return;el.innerHTML=items.length===0?'<div style="padding:20px;text-align:center;color:#CCC;font-size:11px">Sin proyectos</div>':items.map(({item,i})=>buildAiCard(item,i)).join('');};
  setCol('ai-col-pending',pending);setCol('ai-col-scored',scored);setCol('ai-col-complete',complete);
  const s=(id,n)=>{const e=document.getElementById(id);if(e)e.textContent=n;};
  s('ai-cnt-pending',pending.length);s('ai-cnt-scored',scored.length);s('ai-cnt-complete',complete.length);
  const done=scored.length+complete.length, total=_aiScored.length;
  const lbl=document.getElementById('ai-prog-lbl'),fill=document.getElementById('ai-prog-fill');
  if(lbl) lbl.textContent=`${done} de ${total} evaluados · ${complete.length} completos`;
  if(fill) fill.style.width=(total?Math.round(done/total*100):0)+'%';
}
function buildAiCard(item,i){
  const p=item.proj,sf=item.status!=='pending'?ruleScore(p):null;
  const col=sf!==null?scColorHex(sf):'#BBBBBB', cl=sf!==null?clsf(sf):null;
  const tag=cl?`<span class="ev-tag" style="background:${cl.bg};color:${cl.c};border-color:${cl.b}">${cl.et}</span>`:'<span class="ev-tag" style="background:#F5F5F5;color:#AAA;border-color:#E5E5E5">Sin evaluar</span>';
  const btn=item.status==='pending'?`<button class="ev-btn score" onclick="aiScoreOne(${i})">✦ Evaluar</button>`:`<button class="ev-btn rescore" onclick="aiScoreOne(${i})">↻ Reevaluar</button>`;
  const scoreNum=sf!==null?`<div class="ev-score-big" style="color:${col}">${sf.toFixed(1)}</div>`:'<div class="ev-score-big" style="color:#DDD">—</div>';
  return `<div class="ev-card${item.selected?' selected':''}" id="ev-card-${i}">
    <div style="display:flex;align-items:flex-start;gap:8px">
      <input type="checkbox" class="ev-check" id="ev-chk-${i}" onchange="_aiScored[${i}].selected=this.checked" ${item.selected?'checked':''}/>
      <div style="flex:1;min-width:0">
        <div class="ev-card-name">${p.nom}</div>
        <div class="ev-card-meta">${p.area||'—'} · ${p.sponsor||'—'} · ${p.reqDate||'—'}${p.adoType?' · '+p.adoType:''}</div>
        ${p.adoDesc?`<div class="ev-card-desc">${p.adoDesc}</div>`:''}
        <div class="ev-card-actions">${scoreNum}${tag}<input type="number" class="ev-hours-inp" id="ev-hrs-${i}" value="${p.horas||''}" placeholder="h" min="1" oninput="aiSetHoras(${i},this.value)"/><span style="font-size:9px;color:#BBB">h</span>${btn}</div>
      </div>
    </div>
  </div>`;
}
function ruleScore(p){
  const s=ruleScoresCriterios(p);
  CRIT_IDS.forEach(cid=>{p.scores[cid]=s[cid]||5;});
  return computeProj(p).sf;
}
function ruleScoresCriterios(p){
  const nom=(p.nom||'').toLowerCase(),desc=(p.adoDesc||'').toLowerCase(),tags=(p.adoTags||[]).join(' ').toLowerCase();
  const c=nom+' '+desc+' '+tags;
  const isConsejo=['portal b2b','b2b','magento','dsv','conciliaci'].some(x=>c.includes(x));
  const isLegal=['reglamento','normativa','legal','gdpr','reach','gmp','fda','obligatori','aduanas','serializ','firma electr'].some(x=>c.includes(x));
  const isAudit=['auditoría','auditoria','coa','muestreo','military','certificado','calidad','trazabilidad','caducidad','bloqueo'].some(x=>c.includes(x));
  const isRisk=['siniestro','impago','fraude','crédito concedido'].some(x=>c.includes(x));
  const isEfic=['eficiencia','optimiz','ahorro','autom','masiv','simplific','agiliz','proceso por lotes','batch'].some(x=>c.includes(x));
  const isIncome=['factura','cobro','pago','impago','conciliaci','b2b','magento','venta'].some(x=>c.includes(x));
  const isSimple=['campo','filtro','informe','vista','formulario','alerta','notificación','correo'].some(x=>c.includes(x));
  const isComplex=['integra','middleware','api','salesforce','dsv','pim','datalake','coptis'].some(x=>c.includes(x));
  let d1=[isLegal?9:isAudit?8:isRisk?5:2, ['peligro','advertencia','prl','safety','pesada','materia prima'].some(x=>c.includes(x))?9:isAudit?5:2, isRisk?9:isAudit?7:['cliente','factura','error'].some(x=>c.includes(x))?5:2, isLegal?9:isAudit?8:isConsejo?5:2];
  let d2=[isConsejo?10:['salesforce','coptis','docuware','integra','datalake'].some(x=>c.includes(x))?7:1, ['poland','lituania','international','externo'].some(x=>c.includes(x))?8:1, ['datalake','bi ','analytics','ia ','machine learning'].some(x=>c.includes(x))?8:isConsejo?6:1, isConsejo?9:3];
  let d3=[isConsejo?9:isIncome?7:2, isEfic?8:isConsejo?6:2, ['conciliaci','impago','crédito'].some(x=>c.includes(x))?9:isIncome?7:isEfic?6:2, ['calidad','coa','caducidad','trazabilidad','muestreo'].some(x=>c.includes(x))?8:['cliente','servicio'].some(x=>c.includes(x))?6:3];
  let d4=[isSimple?9:isComplex?5:5, isSimple?9:isComplex?5:5, 5, ['gdpr','firma electr','auditoría'].some(x=>c.includes(x))?8:5];
  let d5=[isSimple?8:isComplex?4:5, 6, isSimple?9:isComplex?3:6];
  let d6=[['rrhh','empleado','nómina','nomina'].some(x=>c.includes(x))?9:4, ['ecoembes','sostenib','residuo','medioambient'].some(x=>c.includes(x))?8:2, ['formación','training'].some(x=>c.includes(x))?8:5];
  const all=[...d1,...d2,...d3,...d4,...d5,...d6].map(v=>Math.max(1,Math.min(10,Math.round(v))));
  const map={};CRIT_IDS.forEach((cid,i)=>{map[cid]=all[i]||5;});return map;
}
function aiScoreOne(idx){
  const item=_aiScored[idx]; if(!item) return;
  const scores=ruleScoresCriterios(item.proj);
  CRIT_IDS.forEach(cid=>{item.proj.scores[cid]=scores[cid];});
  item.status=item.proj.horas>0?'complete':'scored';
  renderAiColumns();
}
async function aiScoreAll(){
  _aiStopped=false;_aiRunning=true;
  const btn=document.getElementById('ai-score-all-btn'),stop=document.getElementById('ai-stop-btn');
  if(btn) btn.disabled=true; if(stop) stop.style.display='flex';
  for(let i=0;i<_aiScored.length;i++){
    if(_aiStopped) break;
    if(_aiScored[i].status!=='pending') continue;
    aiScoreOne(i);
    if(i%10===0) await new Promise(r=>setTimeout(r,0));
  }
  _aiRunning=false; if(btn) btn.disabled=false; if(stop) stop.style.display='none';
  toast(`✓ ${_aiScored.filter(s=>s.status!=='pending').length} proyectos evaluados`);
}
function aiStopScoring(){
  _aiStopped=true;_aiRunning=false;
  const stop=document.getElementById('ai-stop-btn'); if(stop) stop.style.display='none';
}
function aiSetHoras(idx,val){
  const item=_aiScored[idx]; if(!item) return;
  const n=parseFloat(val); item.proj.horas=(Number.isFinite(n)&&n>0)?n:null;
  if(item.status!=='pending') item.status=item.proj.horas>0?'complete':'scored';
  clearTimeout(aiSetHoras._t); aiSetHoras._t=setTimeout(()=>renderAiColumns(),400);
}
function aiBulkHoras(){
  const val=parseFloat(document.getElementById('ai-bulk-horas')?.value);
  if(!Number.isFinite(val)||val<=0){toast('Selecciona un valor de horas');return;}
  let count=0;
  _aiScored.forEach(item=>{if(item.selected){item.proj.horas=val;if(item.status!=='pending')item.status='complete';count++;}});
  renderAiColumns(); toast(`✓ ${count} proyectos: ${val}h asignadas`);
}
function aiImportAll() {
  if (!_aiScored.length) { toast('Sin proyectos para cargar'); return; }

  // Build local portfolio
  portfolioData = _aiScored.map(item => {
    const p = item.proj;
    const proj = computeProj({
      nom: p.nom, area: p.area, sponsor: p.sponsor,
      scores: p.scores, reqDate: p.reqDate, regDate: p.regDate,
    });
    proj.horas    = p.horas    || null;
    proj.adoId    = p.adoId    || null;
    proj.adoState = p.adoState || '';
    proj.adoType  = p.adoType  || '';
    proj._dvId    = null;
    proj._selected= false;
    return proj;
  });
  portfolioData.forEach(p => { if (p.horas === undefined) p.horas = null; });

  // Show portfolio
  renderPortfolio(); renderPools();
  ['portfolio','charts-panel'].forEach(id => {
    const e = document.getElementById(id); if (e) e.style.display = 'block';
  });
  ['btn-clear','bulk-toolbar'].forEach(id => {
    const e = document.getElementById(id); if (e) e.style.display = 'flex';
  });
  try { renderCharts(); } catch(_) {}  // guard for non-browser envs
  closeAiModal();
  goStep('summary');

  const scored = _aiScored.filter(s => s.status !== 'pending').length;
  toast(`✓ ${portfolioData.length} proyectos cargados en la app · ${scored} evaluados`);
}

/* ── Add completed manual wizard eval to evaluator pool ─────── */
function addManualEvalToPool() {
  const nom  = document.getElementById('f-name')?.value?.trim();
  const area = document.getElementById('f-area')?.value?.trim();
  if (!nom || nom === 'Mi proyecto') return;  // Skip if default/empty name

  // Check if already in pool
  const alreadyIn = _aiScored.some(item => item.proj?.nom === nom || item.proj?.adoId === nom);
  if (alreadyIn) return;

  // Build scores from current wizard state
  const scores = {};
  CRIT_IDS.forEach(cid => {
    const el = document.getElementById('sl-' + cid);
    scores[cid] = el ? parseInt(el.value) || 5 : 5;
  });

  const proj = {
    nom, area,
    sponsor: '',
    scores,
    reqDate: document.getElementById('f-req')?.value || null,
    regDate: null,
    adoId: null, adoState: '', adoType: 'Manual',
    adoDesc: 'Evaluación manual desde el wizard',
    adoTags: [], horas: null,
  };

  const item = {
    wi: { id: Date.now(), fields: { 'System.Title': nom } },
    proj,
    status: 'scored',
    selected: false,
  };

  _aiScored.push(item);

  // Show evaluator columns if modal was open, or just update count
  const badge = document.getElementById('ai-scored-count');
  if (badge) badge.textContent = _aiScored.filter(s=>s.status!=='pending').length;

  toast(`✓ "${nom}" añadido a proyectos evaluados — pulsa ↓ Cargar en cartera para añadirlo`);
}
