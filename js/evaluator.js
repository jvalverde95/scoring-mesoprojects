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
        <div class="ev-card-actions">
          ${scoreNum}${tag}
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" class="ev-hours-inp" id="ev-hrs-${i}"
              value="${p.horas||''}" placeholder="horas" min="1"
              style="${p.horas ? 'border-color:#087B50;background:#ECF8F3;color:#087B50' : ''}"
              title="${p.horasSource ? 'Mapeado desde ADO: '+p.horasSource : 'Introduce las horas estimadas'}"
              oninput="aiSetHoras(${i},this.value)"/>
            <span style="font-size:8px;font-weight:600;white-space:nowrap;${p.horas ? 'color:#087B50' : 'color:#BBB'}">
              ${p.horas ? 'ADO✓' : 'h'}
            </span>
          </div>
          ${btn}
        </div>
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
async function aiImportAll() {
  if (!_aiScored.length) { toast('Sin proyectos para cargar'); return; }

  // ── 1. Build local portfolio ──────────────────────────────
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
  try { renderCharts(); } catch(_) {}
  if (typeof renderDashboard === 'function') renderDashboard();
  closeAiModal();

  const scored = _aiScored.filter(s => s.status !== 'pending').length;
  toast(`✓ ${portfolioData.length} proyectos cargados · ${scored} evaluados`);

  // Go to pools so user sees their projects immediately
  goStep('pools');

}

/* ── Add completed manual wizard eval to evaluator pool ─────── */
function addManualEvalToPool() {
  // Called when wizard reaches summary — show the "Guardar en cartera" banner
  const nom  = (document.getElementById('f-name')?.value || '').trim();
  const area = (document.getElementById('f-area')?.value || '').trim();

  // Don't show if name is empty or default
  if (!nom || nom === 'Mi proyecto' || nom === '') return;

  // Show the save banner in the summary screen
  const banner = document.getElementById('save-to-portfolio-banner');
  if (banner) banner.style.display = 'block';
}

function _buildManualProject() {
  // Build the project object from current wizard state
  const nom     = (document.getElementById('f-name')?.value || '').trim();
  const areaEl  = document.getElementById('f-area');
  const area    = areaEl?.value?.trim() || areaEl?.options?.[areaEl.selectedIndex]?.text || '';
  const reqDate = document.getElementById('f-req')?.value || null;

  const scores = {};
  CRIT_IDS.forEach(cid => {
    const el = document.getElementById('sl-' + cid);
    scores[cid] = el ? (parseInt(el.value) || 5) : 5;
  });

  const proj = computeProj({ nom, area, sponsor: '', scores, reqDate, regDate: null });
  proj.horas     = null;
  proj.adoId     = null;
  proj.adoState  = '';
  proj.adoType   = 'Manual';
  proj._dvId     = null;
  proj._selected = false;
  return proj;
}

function saveManualToPortfolio() {
  const proj = _buildManualProject();
  if (!proj.nom) { toast('El proyecto no tiene nombre'); return; }

  // Check for duplicate
  const dup = portfolioData.findIndex(p => p.nom === proj.nom);
  if (dup >= 0) {
    // Update existing
    Object.assign(portfolioData[dup], proj);
    portfolioData[dup].horas = portfolioData[dup].horas;  // preserve hours
    toast(`✓ "${proj.nom}" actualizado en cartera`);
  } else {
    portfolioData.push(proj);
    toast(`✓ "${proj.nom}" añadido a la cartera`);
  }

  // Hide the banner
  const banner = document.getElementById('save-to-portfolio-banner');
  if (banner) banner.style.display = 'none';

  // Show portfolio sections
  ['portfolio','charts-panel','btn-clear','bulk-toolbar'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.style.display = id.includes('btn') || id === 'bulk-toolbar' ? 'flex' : 'block';
  });

  renderPortfolio();
  renderPools();
  try { renderCharts(); } catch(_) {}
  if (typeof renderDashboard === 'function') renderDashboard();

  // Go to pools to see it
  goStep('pools');
}

function saveManualAndSync() {
  saveManualToPortfolio();
  toast('✓ Guardado en cartera · Exporta a Excel cuando quieras');
}

/* ═══ AI KEYWORD CONFIGURATION ═══════════════════════════════════════════
   Allows users to customise the keywords used by the auto-scorer per
   dimension, stored in localStorage and used by ruleScoresCriterios().
   ════════════════════════════════════════════════════════════════════════ */

const AI_KW_DEFAULTS = {
  d1: 'gdpr,normativa,legal,regulatorio,obligatorio,gmp,compliance,ley,reglamento,iso,auditoria,sancionador,licencia,rgpd',
  d2: 'expansión,internacional,innovación,consejo,estrategia,transformación,roadmap,competitividad,diferenciación,plan director',
  d3: 'ahorro,ingresos,roi,coste,eficiencia,ventas,rentabilidad,reducción,optimización,productividad,facturación',
  d4: 'integración,api,erp,sap,migración,infraestructura,arquitectura,datos,cloud,seguridad,ciberseguridad,deuda técnica',
  d5: 'automatización,quick win,configuración,parametrizar,formación,implantación,rollout,despliegue,piloto,pruebas',
  d6: 'empleado,formación,sostenibilidad,bienestar,esg,medioambiente,diversidad,conciliación,cultura,clima laboral',
};

function aiSaveKeywords() {
  const cfg = {
    d1: document.getElementById('ai-kw-d1')?.value || AI_KW_DEFAULTS.d1,
    d2: document.getElementById('ai-kw-d2')?.value || AI_KW_DEFAULTS.d2,
    d3: document.getElementById('ai-kw-d3')?.value || AI_KW_DEFAULTS.d3,
    d4: document.getElementById('ai-kw-d4')?.value || AI_KW_DEFAULTS.d4,
    d5: document.getElementById('ai-kw-d5')?.value || AI_KW_DEFAULTS.d5,
    d6: document.getElementById('ai-kw-d6')?.value || AI_KW_DEFAULTS.d6,
    boostPrio1:     parseFloat(document.getElementById('ai-boost-prio1')?.value     || 2),
    tagsCompliance: document.getElementById('ai-tags-compliance')?.value || '',
    autoprioThr:    parseFloat(document.getElementById('ai-autoprio-thr')?.value    || 8),
  };
  try {
    localStorage.setItem('meso_ai_keywords_v1', JSON.stringify(cfg));
    toast('✓ Configuración del evaluador guardada');
  } catch(_) { toast('✗ Error guardando configuración'); }
}

function aiLoadKeywords() {
  let cfg = AI_KW_DEFAULTS;
  try {
    const saved = localStorage.getItem('meso_ai_keywords_v1');
    if (saved) cfg = { ...AI_KW_DEFAULTS, ...JSON.parse(saved) };
  } catch(_) {}

  const set = (id, val) => { const e = document.getElementById(id); if (e) e.value = val || ''; };
  set('ai-kw-d1', cfg.d1); set('ai-kw-d2', cfg.d2);
  set('ai-kw-d3', cfg.d3); set('ai-kw-d4', cfg.d4);
  set('ai-kw-d5', cfg.d5); set('ai-kw-d6', cfg.d6);
  set('ai-tags-compliance', cfg.tagsCompliance || '');

  const setRange = (id, valId, val) => {
    const e = document.getElementById(id); if (e) e.value = val;
    const v = document.getElementById(valId); if (v) v.textContent = val;
  };
  setRange('ai-boost-prio1',  'ai-boost-prio1-val',  cfg.boostPrio1  ?? 2);
  setRange('ai-autoprio-thr', 'ai-autoprio-thr-val', cfg.autoprioThr ?? 8);
}

function aiGetKeywords() {
  try {
    const saved = localStorage.getItem('meso_ai_keywords_v1');
    if (saved) return { ...AI_KW_DEFAULTS, ...JSON.parse(saved) };
  } catch(_) {}
  return { ...AI_KW_DEFAULTS };
}

function aiTestScore() {
  const input = document.getElementById('ai-test-input')?.value?.trim();
  const result = document.getElementById('ai-test-result');
  if (!input || !result) return;

  // Build a fake work item from the text
  const fakeWi = {
    id: 0,
    fields: {
      'System.Title':       input.split('\n')[0] || input,
      'System.Description': input,
      'System.Tags':        '',
      'System.WorkItemType':'Requirement',
      'System.State':       'Active',
      'Microsoft.VSTS.Common.Priority': 3,
    }
  };

  // Map to project and score
  const proj = adoMapToProject(fakeWi);
  const scored = ruleScoresCriterios(proj);
  const full = computeProj({ ...proj, scores: scored });

  result.style.display = 'block';
  result.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px">
      ${['D1 Compliance','D2 Estrategia','D3 ROI','D4 Técnica','D5 Implant.','D6 Personas'].map((d,i) => `
        <div style="background:var(--surf);border-radius:5px;padding:6px 8px;text-align:center;border:1px solid var(--b)">
          <div style="font-size:9px;color:var(--ink3)">${d}</div>
          <div style="font-size:14px;font-weight:700;color:var(--ink)">${(full.dimScores?.[i]||0).toFixed(1)}</div>
        </div>`).join('')}
    </div>
    <div style="font-size:12px;font-weight:700;color:var(--ink)">
      Score final: <span style="color:${full.sf>=7.5?'var(--d3)':full.sf>=5?'#C07800':'var(--d1)'}">${full.sf.toFixed(2)}</span>
      → <span style="font-size:10px">${clsf(full.sf).et}</span>
    </div>`;
}
