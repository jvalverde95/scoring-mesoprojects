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
  // Motor de reglas v2 — análisis semántico ponderado por intensidad de keyword
  const nom=(p.nom||'').toLowerCase();
  const desc=(p.adoDesc||'').toLowerCase();
  const tags=(p.adoTags||[]).join(' ').toLowerCase();
  const area=(p.area||'').toLowerCase();
  const c=nom+' '+desc+' '+tags+' '+area;

  // Helper: cuenta cuántas keywords de una lista aparecen, con peso
  const hits=(arr)=>arr.reduce((n,w)=>n+(c.includes(w)?1:0),0);
  // Escala: base 2, +inc por cada hit, cap 10
  const sc=(base,arr,inc)=>{ const h=hits(arr); return Math.max(1,Math.min(10, base + h*(inc||2))); };
  // Si hay match fuerte → valor alto directo
  const strong=(val,arr,fallback)=>arr.some(w=>c.includes(w))?val:(fallback!==undefined?fallback:2);

  // ── Léxicos temáticos ──
  const LEGAL    = ['reglamento','normativa','legal','gdpr','rgpd','reach','gmp','fda','obligatori','aduana','serializ','firma electr','cumplimiento','compliance','sox','iso','sancion'];
  const PRL      = ['prl','seguridad','salud','riesgo laboral','epi','accidente','peligro','ergonom','prevención','sustancia peligrosa','materia prima','química'];
  const REPUT    = ['reputacion','imagen','marca','cliente final','queja','reclamación','incidencia crítica','prensa','redes sociales'];
  const REGUL    = ['regulator','normativa','auditoría','auditoria','certificad','trazabilidad','caducidad','lote','coa','muestreo','validación'];
  const CONSEJO  = ['consejo','ceo','dirección general','comité','estratégic','mandato','prioridad alta','board','dirección'];
  const INTL     = ['internacional','polonia','poland','lituania','francia','portugal','export','filial','intercompany','global','multipaís','multipais'];
  const IDI      = ['i+d','idi','innovación','pipeline','formulación','nuevo producto','laboratorio','coptis','investigación','desarrollo producto'];
  const URGENT   = ['urgente','inmediato','plazo','deadline','crítico','ventana','campaña','temporada','ya','cuanto antes','bloqueante'];
  const INGRESOS = ['ingreso','venta','facturación','factura','margen','cobro','b2b','ecommerce','magento','pedido','cliente','revenue'];
  const AHORRO   = ['ahorro','coste','eficiencia','optimiz','automatiz','reducción','productividad','tiempo','manual','agiliz','simplific','lotes','batch','masiv'];
  const ROI      = ['roi','payback','retorno','inversión','rentab','beneficio','amortiz'];
  const CALIDAD  = ['calidad','cero defecto','coa','caducidad','trazabilidad','muestreo','no conformidad','reproceso','merma','control'];
  const SIMPLE   = ['campo','filtro','informe','vista','formulario','alerta','notificación','correo','listado','reporte','pantalla','botón','etiqueta'];
  const COMPLEX  = ['integra','middleware','api','salesforce','dsv','pim','datalake','coptis','lims','sincroniz','interfaz','conector','migración','arquitectura'];
  const ERP      = ['erp','dynamics','d365','sap','navision','business central','lims','crm','sistema'];
  const SECURITY = ['gdpr','rgpd','firma electr','seguridad','cifrad','acceso','permiso','rol','privacidad','dato personal','ciberseg'];
  const SCALE    = ['internacional','multipaís','multipais','filial','escalab','global','países','paises','+100'];
  const CHANGE   = ['cambio','adopción','cultura','formación','usuario','resistencia','proceso nuevo'];
  const QUICK    = ['rápido','quick win','sencillo','pequeño','simple','inmediato','semana'];
  const RRHH     = ['rrhh','empleado','nómina','nomina','personal','talento','contratación','onboarding','vacaciones','fichaje'];
  const ESG      = ['ecoembes','sostenib','residuo','medioambient','reciclaje','huella','co2','energía','esg','verde'];
  const TRAIN    = ['formación','training','tutorial','manual usuario','capacitación','aprendizaje'];
  const EMPLEXP  = ['experiencia empleado','satisfacción','bienestar','ergonom','carga de trabajo','clima laboral'];

  // ── D1 · Compliance / Legal / Riesgo ──
  const c1_1 = strong(9, LEGAL, sc(2,REGUL,2));
  const c1_2 = strong(9, PRL, 2);
  const c1_3 = sc(2, REPUT, 2.5);
  const c1_4 = strong(9, REGUL, strong(7,LEGAL,2));

  // ── D2 · Estratégico ──
  const c2_1 = strong(10, CONSEJO, sc(1,ERP,1.5));
  const c2_2 = strong(8, INTL, 1);
  const c2_3 = strong(8, IDI, 1);
  const c2_4 = sc(2, URGENT, 2.5);

  // ── D3 · ROI / Valor ──
  const c3_1 = strong(8, INGRESOS, 2);
  const c3_2 = strong(8, AHORRO, 2);
  const c3_3 = strong(7, ROI, hits(AHORRO)>1?6:3);
  const c3_4 = strong(8, CALIDAD, 3);

  // ── D4 · Técnica / TRL ──
  const isSimple=hits(SIMPLE)>0, isComplex=hits(COMPLEX)>0;
  const c4_1 = isSimple?9:isComplex?5:6;                 // madurez (simple=maduro)
  const c4_2 = strong(8, ERP, isComplex?5:6);            // integración
  const c4_3 = strong(8, SCALE, 5);                      // escalabilidad
  const c4_4 = strong(8, SECURITY, 5);                   // GDPR/ciberseg

  // ── D5 · Implantación ──
  const c5_1 = isSimple?8:isComplex?4:6;                 // capacidad interna
  const c5_2 = hits(CHANGE)>0?5:7;                        // gestión del cambio
  const c5_3 = strong(9, QUICK, isSimple?8:isComplex?3:6); // time-to-value

  // ── D6 · Personas / ESG ──
  const c6_1 = strong(8, EMPLEXP, hits(RRHH)>0?7:4);
  const c6_2 = strong(8, ESG, 2);
  const c6_3 = strong(8, TRAIN, isSimple?7:5);

  const vals={c1_1,c1_2,c1_3,c1_4,c2_1,c2_2,c2_3,c2_4,c3_1,c3_2,c3_3,c3_4,
              c4_1,c4_2,c4_3,c4_4,c5_1,c5_2,c5_3,c6_1,c6_2,c6_3};
  const map={};
  CRIT_IDS.forEach(cid=>{ map[cid]=Math.max(1,Math.min(10,Math.round(vals[cid]!=null?vals[cid]:5))); });
  return map;
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

  const descBreve = (document.getElementById('f-desc')?.value || '').trim();
  const proj = computeProj({ nom, area, sponsor: '', scores, reqDate, regDate: null });
  // Preserve ADO link if re-evaluating an existing project
  const existing = portfolioData.find(function(x){ return x.nom === proj.nom; });
  proj.horas     = existing ? (existing.horas ?? null) : null;
  proj.adoId     = existing ? (existing.adoId || null) : null;
  // Descripcion breve: la editada en el wizard, o la de ADO si no se toco
  proj.descripcion = descBreve || (existing ? (existing.descripcion || existing.adoDesc || '') : '');
  proj.adoDesc     = descBreve || (existing ? (existing.adoDesc || '') : '');
  proj.adoState  = existing ? (existing.adoState || '') : '';
  proj.adoType   = existing ? (existing.adoType || 'Manual') : 'Manual';
  proj.adoDesc   = existing ? (existing.adoDesc || '') : '';
  proj.adoRaw    = existing ? (existing.adoRaw || null) : null;
  proj._adoSynced= false;  // mark as needing re-sync
  proj._dvId     = existing ? (existing._dvId || null) : null;
  proj._selected = false;
  return proj;
}

function saveManualToPortfolio() {
  const proj = _buildManualProject();
  if (!proj.nom) { toast('El proyecto no tiene nombre'); return; }
  proj._manualEval = true;  // marca: editado a mano → protegido en re-evaluación masiva

  // Check for duplicate
  const dup = portfolioData.findIndex(p => p.nom === proj.nom);
  if (dup >= 0) {
    // Update existing — preserve fields that the wizard doesn't manage
    const prev = portfolioData[dup];
    Object.assign(portfolioData[dup], proj);
    // Restore non-wizard fields from previous state
    portfolioData[dup].horas      = prev.horas ?? proj.horas;
    portfolioData[dup].adoId      = prev.adoId || proj.adoId;
    portfolioData[dup].adoType    = prev.adoType || proj.adoType;
    portfolioData[dup].adoState   = prev.adoState || proj.adoState;
    portfolioData[dup].adoDesc    = prev.adoDesc || proj.adoDesc;
    portfolioData[dup].adoRaw     = prev.adoRaw  || proj.adoRaw;
    portfolioData[dup]._dvId      = prev._dvId   || proj._dvId;
    portfolioData[dup]._adoSynced = false;  // force re-sync after score change
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

/* ═══════════════════════════════════════════════════════════════
   RE-EVALUACIÓN MASIVA CON IA — toda la cartera en cualquier momento
   Aplica ruleScoresCriterios v2 + computeProj a cada proyecto.
   Respeta proyectos editados manualmente si el usuario lo pide.
   ═══════════════════════════════════════════════════════════════ */
function aiReevaluateAll(opts) {
  opts = opts || {};
  if (!portfolioData || !portfolioData.length) { toast('No hay proyectos en la cartera'); return; }

  const skipManual = opts.skipManual !== false; // por defecto respeta los marcados manuales
  let done = 0, skipped = 0;

  portfolioData.forEach(function(p) {
    if (skipManual && p._manualEval) { skipped++; return; }
    try {
      const scores = ruleScoresCriterios(p);
      CRIT_IDS.forEach(function(cid){ p.scores[cid] = scores[cid]; });
      delete p._sfExcel;  // la IA recalcula el score → el del Excel ya no aplica
      const computed = computeProj(p);
      Object.assign(p, computed);
      p._aiScored = true;
      p._aiScoredAt = new Date().toISOString();
      done++;
    } catch(e) { console.error('reeval', p.nom, e); }
  });

  // Persistir y refrescar todas las vistas
  if (typeof savePortfolio === 'function') savePortfolio();
  if (typeof schedulePublish === 'function') schedulePublish();   // sincroniza con el almacén web (GitHub)
  if (typeof renderPortfolio === 'function') renderPortfolio();
  if (typeof renderPools === 'function') renderPools();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderChartsStep === 'function') renderChartsStep();
  if (typeof renderEvalScreen === 'function') renderEvalScreen();

  toast('✓ IA re-evaluó ' + done + ' proyectos' + (skipped ? ' · ' + skipped + ' manuales respetados' : ''));
}

// Variante: re-evalúa TODO incluyendo los manuales (con confirmación)
function aiReevaluateAllForce() {
  if (!portfolioData.length) { toast('No hay proyectos'); return; }
  const manuals = portfolioData.filter(p=>p._manualEval).length;
  const msg = manuals
    ? 'Esto re-evaluará los ' + portfolioData.length + ' proyectos con IA, incluyendo ' + manuals + ' editados manualmente. ¿Continuar?'
    : 'Re-evaluar los ' + portfolioData.length + ' proyectos con IA?';
  if (confirm(msg)) aiReevaluateAll({ skipManual: false });
}
