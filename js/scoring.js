/* ── Global state — declared first so all modules can access ─ */
let _dvCfg = { url:'', tenant:'', clientId:'', secret:'', _serverManaged: false };
let _dvToken = null, _dvTokenExp = 0;

const CRIT_FIELD_MAP = {
  c1_1:'meso_legalriskscore',         c1_2:'meso_safetyriskscore',
  c1_3:'meso_reputationalriskscore',  c1_4:'meso_regulatoryobligationscore',
  c2_1:'meso_boardmandatescore',      c2_2:'meso_internationalexpansionscore',
  c2_3:'meso_innovationrdscore',      c2_4:'meso_strategicurgencyscore',
  c3_1:'meso_revenueimpactscore',     c3_2:'meso_efficiencysavingsscore',
  c3_3:'meso_roipaybackscore',        c3_4:'meso_servicequalityscore',
  c4_1:'meso_trlmaturityscore',       c4_2:'meso_erpintegrationscore',
  c4_3:'meso_scalabilityscore',       c4_4:'meso_cybersecuritygdprscore',
  c5_1:'meso_internalcapacityscore',  c5_2:'meso_changemanagementscore',
  c5_3:'meso_timetovaluescore',
  c6_1:'meso_employeeexperiencescore',c6_2:'meso_sustainabilityesgscore',
  c6_3:'meso_trainingandculturescore',
};

/* ══════════════════════════════════════════════════════════
   ALGORITMO: Sigmoid Boost (base e=2) + Aging Factor
   ══════════════════════════════════════════════════════════ */
const E = 2;

function sigmoidBoost(S, C0, B0, A0, C, B, A) {
  const base    = A0 / (1 + Math.pow(E, -B0 * (S - C0)));
  const boosted = A  / (1 + Math.pow(E, -B  * (S - C )));
  return Math.max(base, boosted, 1.0);
}

function scoreDim(criterios) {
  let num = 0, den = 0;
  criterios.forEach(c => {
    const b = sigmoidBoost(c.val, c.C0, c.B0, c.A0, c.C, c.B, c.A);
    num += c.pw * b * c.val;
    den += c.pw * b;
  });
  return den > 0 ? num / den : 0;
}

function agingFactor(reqDate) {
  if (!reqDate) return 1.0;
  const days = Math.max(0, (new Date() - new Date(reqDate)) / 86400000);
  return Math.min(1 + (days / 365) * 0.15, 1.25);
}

function regDateNote(S, days) {
  if (days > 730)  return 1;
  if (days > 365)  return 3;
  if (days > 180)  return 5;
  if (days > 90)   return 7;
  if (days > 30)   return 9;
  return 10;
}

function scoreBase() {
  return DIMS.reduce((a, d) => a + d.peso * scoreDim(d.criterios), 0);
}

function scoreFinal(reqDate) {
  const base = scoreBase();
  const af   = agingFactor(reqDate);
  return Math.min(base * af, 10);
}

/* ── PARÁMETROS ─────────────────────────────────────────── */
const DEF = {
  d1:{C0:3,B0:1,A0:2,C:7,B:2,A:9},
  d2:{C0:4,B0:1,A0:3,C:8,B:2,A:9},
  d3:{C0:4,B0:1,A0:3,C:8,B:2,A:8},
  d4:{C0:4,B0:1,A0:3,C:8,B:1.5,A:7},
  d5:{C0:4,B0:1,A0:3,C:8,B:1.5,A:7},
  d6:{C0:4,B0:1,A0:2,C:8,B:1,A:6},
};
const dp = k => ({...DEF[k]});

/* ── DIMENSIONES ────────────────────────────────────────── */
const DIMS = [
  { id:'D1',cls:'d1',nom:'Compliance, Legalidad y Seguridad Laboral',peso:0.30,
    ac:'var(--red-md)',lc:'var(--red-lt)',
    desc:'Dimensión CRÍTICA. D1 ≥ 8 → Auto-prioritario Estratégico. El criterio "Obligación regulatoria" se calcula automáticamente desde la fecha límite regulatoria si se introduce.',
    criterios:[
      {id:'c1_1',nom:'Riesgo legal o sancionador activo',pw:30,val:5,isReg:false,desc:'1=sin riesgo · 5=riesgo potencial · 10=expediente/inspección/incumplimiento (GMP,GDPR,PRL,AEMPS,Reglamento UE)',...dp('d1')},
      {id:'c1_2',nom:'Seguridad y salud trabajadores (PRL)',pw:30,val:5,isReg:false,desc:'1=sin impacto PRL · 5=riesgo ergonómico moderado · 10=riesgo grave accidente, exposición química, Ley 31/1995',...dp('d1')},
      {id:'c1_3',nom:'Riesgo reputacional o de negocio',pw:20,val:5,isReg:false,desc:'1=sin impacto · 5=riesgo queja cliente clave · 10=recall, alerta mercado, daño marca internacional',...dp('d1')},
      {id:'c1_4',nom:'Obligación regulatoria o normativa',pw:20,val:5,isReg:true,desc:'AUTO si hay fecha límite regulatoria: 1=>730 días · 3=365-730 · 5=180-365 · 7=90-180 · 9=30-90 · 10=<30 días o vencida',...dp('d1')},
    ]
  },
  { id:'D2',cls:'d2',nom:'Prioridad Estratégica del Consejo',peso:0.20,
    ac:'var(--gold)',lc:'var(--gold-lt)',
    desc:'Segundo escalón de máxima prioridad. Alineación con el plan estratégico del Consejo: expansión +100 países, innovación I+D, canal clínica.',
    criterios:[
      {id:'c2_1',nom:'Mandato expreso del Consejo o CEO',pw:35,val:5,isReg:false,desc:'1=no mencionado · 5=plan anual · 10=plan estratégico 2024-2027 con sponsor de comité de dirección',...dp('d2')},
      {id:'c2_2',nom:'Alineación con expansión internacional',pw:25,val:5,isReg:false,desc:'1=sin impacto · 5=mejora filial FR/PT/PL · 10=habilita crecimiento nuevos países o potencia +100 mercados',...dp('d2')},
      {id:'c2_3',nom:'Impacto en innovación y pipeline I+D',pw:20,val:5,isReg:false,desc:'1=sin relación · 5=mejora fase desarrollo fórmulas · 10=acelera time-to-market o digitaliza laboratorio',...dp('d2')},
      {id:'c2_4',nom:'Urgencia temporal (ventana de oportunidad)',pw:20,val:5,isReg:false,desc:'1=sin urgencia >18m · 5=oportunidad 6-12m · 10=riesgo negocio si no se ejecuta en <6 meses',...dp('d2')},
    ]
  },
  { id:'D3',cls:'d3',nom:'Valor de Negocio y ROI',peso:0.20,
    ac:'var(--green-md)',lc:'var(--green-lt)',
    desc:'Impacto económico directo: ingresos, ahorro de costes, margen y eficiencia. Referencia: ~90M EUR de facturación global.',
    criterios:[
      {id:'c3_1',nom:'Impacto en ingresos o margen bruto',pw:30,val:5,isReg:false,desc:'1=sin impacto · 5=mejora eficiencia canal · 10=nuevo canal, >10% ventas o >5pp margen',...dp('d3')},
      {id:'c3_2',nom:'Ahorro de costes operativos (3 años)',pw:25,val:5,isReg:false,desc:'1=sin ahorro · 5=2-5% costes área · 10=>15% costes proceso o >500k EUR/año',...dp('d3')},
      {id:'c3_3',nom:'ROI y periodo de payback',pw:25,val:5,isReg:false,desc:'1=ROI negativo o >5 años · 5=payback 2-3 años · 10=ROI>150% en 3 años, payback <12 meses',...dp('d3')},
      {id:'c3_4',nom:'Mejora de calidad / cero defectos',pw:20,val:5,isReg:false,desc:'1=sin impacto · 5=reducción incidencias · 10=elimina causa raíz, rechazos >50%',...dp('d3')},
    ]
  },
  { id:'D4',cls:'d4',nom:'Viabilidad Técnica e Integración',peso:0.12,
    ac:'var(--amber)',lc:'var(--amber-lt)',
    desc:'Madurez tecnológica e integración con ERP, LIMS, CRM, e-commerce. Curva boost más suave para no sobreponderar lo técnico vs. compliance y valor.',
    criterios:[
      {id:'c4_1',nom:'Madurez tecnológica (TRL)',pw:30,val:5,isReg:false,desc:'1=experimental · 5=TRL6 probada en entorno análogo · 10=TRL9 certificada en farma/cosmética similar',...dp('d4')},
      {id:'c4_2',nom:'Integración con sistemas actuales (ERP/LIMS/CRM)',pw:30,val:5,isReg:false,desc:'1=muy compleja, desarrollo extenso · 5=APIs estándar · 10=conector nativo con ecosistema mesoestetic',...dp('d4')},
      {id:'c4_3',nom:'Escalabilidad internacional (FR/PT/PL/+100)',pw:20,val:5,isReg:false,desc:'1=solución local sin escala · 5=1-2 filiales · 10=multi-idioma, multi-divisa, todos los mercados',...dp('d4')},
      {id:'c4_4',nom:'Ciberseguridad y GDPR (UE)',pw:20,val:5,isReg:false,desc:'1=sin controles · 5=controles básicos · 10=ISO27001/SOC2, DPA firmado, datos en UE',...dp('d4')},
    ]
  },
  { id:'D5',cls:'d5',nom:'Facilidad de Implantación',peso:0.10,
    ac:'var(--blue)',lc:'var(--blue-lt)',
    desc:'Capacidad real de ejecución: equipo, datos, cultura organizacional y velocidad hasta el primer valor entregado.',
    criterios:[
      {id:'c5_1',nom:'Capacidad interna (IT, datos, procesos)',pw:30,val:5,isReg:false,desc:'1=sin equipo IT · 5=equipo disponible con apoyo · 10=equipo IT propio + datos calidad + metodología',...dp('d5')},
      {id:'c5_2',nom:'Gestión del cambio y cultura digital',pw:35,val:5,isReg:false,desc:'1=alta resistencia · 5=apertura moderada · 10=área digitalmente madura, usuarios demandantes',...dp('d5')},
      {id:'c5_3',nom:'Tiempo hasta valor (go-live)',pw:35,val:5,isReg:false,desc:'1=>18 meses · 5=6-12 meses · 10=quick win <3m o MVP <6 meses',...dp('d5')},
    ]
  },
  { id:'D6',cls:'d6',nom:'Impacto en Personas y Sostenibilidad',peso:0.08,
    ac:'#71717A',lc:'var(--gray-lt)',
    desc:'Bienestar de los ~300 empleados y objetivos ESG: sostenibilidad medioambiental, reducción de residuos químicos y RSC.',
    criterios:[
      {id:'c6_1',nom:'Mejora de experiencia del empleado',pw:35,val:5,isReg:false,desc:'1=sin mejora · 5=elimina tareas repetitivas · 10=mejora ergonomía, conciliación, encuesta clima',...dp('d6')},
      {id:'c6_2',nom:'Impacto ESG / sostenibilidad medioambiental',pw:35,val:5,isReg:false,desc:'1=sin efecto · 5=reducción moderada · 10=reducción significativa CO₂, agua, residuos químicos',...dp('d6')},
      {id:'c6_3',nom:'Facilidad de formación y adopción',pw:30,val:5,isReg:false,desc:'1=>3 semanas · 5=1-2 semanas · 10=intuitivo, onboarding <3 días, disponible ES/FR/PT/PL',...dp('d6')},
    ]
  },
];

const DEF_PESOS = DIMS.map(d => d.peso);

/* ── COLORES ──────────────────────────────────────────────── */
function scColor(s) {
  if (s >= 8.5) return 'var(--green)';
  if (s >= 7.0) return 'var(--blue)';
  if (s >= 5.5) return 'var(--amber)';
  if (s >= 4.0) return 'var(--ink2)';
  return 'var(--red)';
}
function scColorHex(s) {
  if (s >= 8.5) return '#166534';
  if (s >= 7.0) return '#1E3A5F';
  if (s >= 5.5) return '#92400E';
  if (s >= 4.0) return '#3A3A3A';
  return '#991B1B';
}
// clsf() defined in wizard block with dynamic scoreThr
function recf(s, autoP, af, regDays) {
  let extra = '';
  if (af > 1.05) extra = ` El factor antigüedad (×${af.toFixed(2)}) ha elevado el score base en ${((af-1)*100).toFixed(0)}%.`;
  if (regDays !== null && regDays < 90) extra += ` ⚠ Fecha regulatoria en ${regDays} días — D1 c4 calculado automáticamente.`;
  if (autoP) return {t:`⚑ D1 ≥ 8 · Escalado automático a Prioritario Estratégico. Aprobación presupuestaria inmediata requerida. Seguimiento mensual en Consejo.${extra}`,bg:'var(--red-lt)',c:'var(--red)',b:'rgba(153,27,27,.2)'};
  if (s>=8.5)return{t:`Aprobación inmediata recomendada. Incluir en roadmap Q1 con sponsor ejecutivo. Seguimiento mensual en comité de dirección.${extra}`,bg:'var(--green-lt)',c:'var(--green)',b:'rgba(22,101,52,.2)'};
  if (s>=7.0)return{t:`Proyecto sólido. Incluir en planificación anual con presupuesto asignado. Revisar quick wins para acelerar ROI.${extra}`,bg:'var(--blue-lt)',c:'var(--blue)',b:'rgba(30,58,95,.15)'};
  if (s>=5.5)return{t:`Proyecto válido con mejoras necesarias. Analizar dimensiones débiles antes de aprobar. Considerar piloto o MVP.${extra}`,bg:'var(--amber-lt)',c:'var(--amber)',b:'rgba(146,64,14,.2)'};
  if (s>=4.0)return{t:`Proyecto poco maduro. Replantear el caso de negocio o posponer. Reevaluar en 6 meses.${extra}`,bg:'var(--gray-lt)',c:'var(--gray)',b:'rgba(55,65,81,.15)'};
  return{t:`Scoring insuficiente. Rechazar en la fase actual o transformar profundamente el planteamiento.${extra}`,bg:'var(--red-lt)',c:'var(--red)',b:'rgba(153,27,27,.2)'};
}

/* ── DATES ────────────────────────────────────────────────── */
function getRegDays() {
  const v = document.getElementById('f-reg').value;
  if (!v) return null;
  return Math.round((new Date(v) - new Date()) / 86400000);
}
function getReqDate() {
  return document.getElementById('f-req').value || null;
}
function updateRegCountdown() {
  const days = getRegDays();
  const el   = document.getElementById('reg-cd');
  if (days === null) { if(el) el.style.display = 'none'; return; }
  if(el) el.style.display = 'block';
  const absD = Math.abs(days);
  if (days < 0) {
    if(el){ el.className = 'reg-cd danger';
    el.textContent = `⚠ Fecha vencida hace ${absD} días — D1 c4 = 10 (automático)`; }
  } else if (days <= 30) {
    el.className = 'reg-countdown danger';
    el.textContent = `⚠ Vence en ${days} días — D1 c4 = 10 (automático)`;
  } else if (days <= 90) {
    el.className = 'reg-countdown danger';
    el.textContent = `⚠ Vence en ${days} días — D1 c4 = 9 (automático)`;
  } else if (days <= 180) {
    el.className = 'reg-countdown warning';
    el.textContent = `Vence en ${days} días — D1 c4 = 7 (automático)`;
  } else {
    el.className = 'reg-countdown safe';
    el.textContent = `Vence en ${days} días — D1 c4 = ${regDateNote(null, days)} (automático)`;
  }
  // Auto-set c1_4
  const note = regDateNote(null, days);
  const c = findCrit('c1_4');
  if (c) {
    c.val = note;
    const sl = document.getElementById('sl-c1_4');
    const cv = document.getElementById('cv-c1_4');
    if (sl) sl.value = note;
    if (cv) { cv.textContent = note; cv.style.color = scColorHex(note); }
    const cb = document.getElementById('cb-c1_4');
    if (cb) cb.textContent = 'boost: '+sigmoidBoost(note,c.C0,c.B0,c.A0,c.C,c.B,c.A).toFixed(2)+'×';
    const bp = document.getElementById('bp-c1_4');
    if (bp) bp.innerHTML = boostPreview(c);
    updDimScore('D1');
  }
}
function updateAgingNote() {
  const reqDate = getReqDate();
  const el = document.getElementById('f-req-note');
  if (!reqDate) { el.textContent = ''; return; }
  const days = Math.round((new Date() - new Date(reqDate)) / 86400000);
  if (days < 0) { el.textContent = 'Fecha futura'; return; }
  const af = agingFactor(reqDate);
  el.textContent = `${days} días en cartera · factor aging: ×${af.toFixed(3)} (+${((af-1)*100).toFixed(1)}%)`;
}

/* ── BOOST PREVIEW ────────────────────────────────────────── */
function boostPreview(c) {
  const maxB = 10;
  return Array.from({length:10},(_,i) => {
    const s = i+1;
    const b = sigmoidBoost(s, c.C0, c.B0, c.A0, c.C, c.B, c.A);
    const h = Math.min(Math.round((b/maxB)*28), 28);
    const col = scColorHex(b);
    const active = s === c.val;
    return `<div class="bp-col">
      <div class="bp-wrap"><div class="bp-bar" style="height:${h}px;background:${col};opacity:${active?1:0.35};outline:${active?'1.5px solid '+col:'none'};"></div></div>
      <div class="bp-lbl">${s}</div>
    </div>`;
  }).join('');
}

/* ── RENDER DIMS ──────────────────────────────────────────── */
// renderDims() replaced by renderDimSteps()


function toggleDim(id, h) {
  const b = document.getElementById('db-'+id);
  const o = b.classList.contains('open');
  b.classList.toggle('open',!o); h.classList.toggle('open',!o);
}
function toggleParams(id) {
  const el = document.getElementById('cp-'+id);
  el.style.display = el.style.display==='none' ? 'block' : 'none';
}
function findCrit(id) {
  for (const d of DIMS) { const c=d.criterios.find(x=>x.id===id); if(c)return c; }
  return null;
}
function setNota(cid, did, val) {
  const c = findCrit(cid); if(!c)return;
  c.val = parseInt(val);
  const cv=document.getElementById('cv-'+cid);
  if(cv){cv.textContent=val;cv.style.color=scColorHex(parseInt(val));}
  const cb=document.getElementById('cb-'+cid);
  if(cb)cb.textContent='boost: '+sigmoidBoost(c.val,c.C0,c.B0,c.A0,c.C,c.B,c.A).toFixed(2)+'×';
  const bp=document.getElementById('bp-'+cid);
  if(bp)bp.innerHTML=boostPreview(c);
  updDimScore(did); upd();
}
function setParam(cid, did, param, val) {
  const c=findCrit(cid); if(!c)return;
  const v=parseFloat(val); if(isNaN(v))return;
  c[param]=v;
  const cb=document.getElementById('cb-'+cid);
  if(cb)cb.textContent='boost: '+sigmoidBoost(c.val,c.C0,c.B0,c.A0,c.C,c.B,c.A).toFixed(2)+'×';
  const bp=document.getElementById('bp-'+cid);
  if(bp)bp.innerHTML=boostPreview(c);
  updDimScore(did); upd();
  showRecalcBar(cid, did);
}
function resetParams(cid, did) {
  const c=findCrit(cid); const d=DIMS.find(x=>x.id===did); if(!c||!d)return;
  const def=dp(d.cls); Object.assign(c,def);
  ['C0','B0','A0','C','B','A'].forEach(p=>{const i=document.getElementById('p-'+p+'-'+cid);if(i)i.value=c[p];});
  const cb=document.getElementById('cb-'+cid);
  if(cb)cb.textContent='boost: '+sigmoidBoost(c.val,c.C0,c.B0,c.A0,c.C,c.B,c.A).toFixed(2)+'×';
  const bp=document.getElementById('bp-'+cid);
  if(bp)bp.innerHTML=boostPreview(c);
  updDimScore(did); upd();
}
function updDimScore(did) {
  const d=DIMS.find(x=>x.id===did); if(!d)return;
  const ds=scoreDim(d.criterios);
  const el=document.getElementById('ds-'+did);
  if(el){el.textContent=ds.toFixed(1);el.style.color=scColorHex(ds);}
}

/* ── UPDATE UI ────────────────────────────────────────────── */
// radarChart declared in wizard

// upd() defined below


/* ── WEIGHT EDITOR ────────────────────────────────────────── */
function renderWeightEditor() {
  document.getElementById('w-rows').innerHTML=DIMS.map(d=>`
    <div class="w-row">
      <div class="w-did">${d.id}</div>
      <div class="w-dname" title="${d.nom}">${d.nom.split(' ').slice(0,2).join(' ')}</div>
      <input type="number" class="w-inp" id="wp-${d.id}"
        min="1" max="99" step="1" value="${Math.round(d.peso*100)}"
        oninput="setPeso('${d.id}',this)">
    </div>`).join('');
}
function setPeso(id,inp) {
  const v=parseInt(inp.value); if(isNaN(v)||v<1||v>99){inp.classList.add('err');return;}
  inp.classList.remove('err');
  const d=DIMS.find(x=>x.id===id); if(d)d.peso=v/100;
  checkTotal(); upd();
}
function checkTotal() {
  const t=DIMS.reduce((a,d)=>a+Math.round(d.peso*100),0);
  const el=document.getElementById('w-sum');
  if(el){el.textContent=t+'%';el.className='w-sum '+(t===100?'ok':'err');}
  DIMS.forEach(d=>{const i=document.getElementById('wp-'+d.id);if(i)i.classList.toggle('err',t!==100);});
}
function resetPesos() {
  DIMS.forEach((d,i)=>{d.peso=DEF_PESOS[i];const inp=document.getElementById('wp-'+d.id);if(inp){inp.value=Math.round(d.peso*100);inp.classList.remove('err');}});
  checkTotal(); upd(); toast('Pesos restaurados');
}

/* ── PORTFOLIO ────────────────────────────────────────────── */
let portfolioData=[];
let portSort='score', portFilter='all';

const CRIT_IDS=[];
DIMS.forEach(d=>d.criterios.forEach(c=>CRIT_IDS.push(c.id)));

/* ── CHART STATE ────────────────────────────────────── */
const chartInst={};
let curChart='bubble';
function destroyC(id){if(chartInst[id]){chartInst[id].destroy();delete chartInst[id];}}

/* ── LOAD EXCEL — robust reader ─────────────────────── */
/* ═══════════════════════════════════════════════════
   EXCEL LOADER — robusto + live reload (File System Access API)
   ═══════════════════════════════════════════════════ */
let _liveFileHandle = null;
let _liveInterval   = null;
let _liveLastMod    = null;
let _liveSheetName  = null;
let _savedHoras     = {};

/* Core parser: arrayBuffer → raw project array */
function parseExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, {type:'array', cellDates:true, raw:true, cellNF:false});

  // Sheet priority — support our modelo + legacy formats
  const PREF = ['📊 Cartera','Carga Herramienta','Carga de Proyectos','Ranking Proyectos','Sheet1','Hoja1'];
  let sn = wb.SheetNames[0];
  for (const p of PREF) { if (wb.SheetNames.includes(p)) { sn=p; break; } }
  _liveSheetName = sn;

  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, defval:null, raw:true, blankrows:false});

  // ── Detect sheet format ────────────────────────────────────────────────
  const isModelo  = sn === '📊 Cartera';
  const isRanking = sn === 'Ranking Proyectos';

  // ── Find header row and data start ────────────────────────────────────
  // Look for row where col B looks like a project name (length > 5, not a header label)
  let dataStart = -1;
  for (let r = 0; r < Math.min(15, raw.length); r++) {
    const row = raw[r]; if (!row) continue;
    const b = String(row[1]||'').trim();
    // Skip header rows (short labels or contain "nombre/proyecto")
    if (!b || b.length < 4) continue;
    if (/^(nombre|proyecto|name|nº|#|rank|columna|título)/i.test(b)) continue;
    // Data row: col B = project name + either criteria cols (integers 1-10) or score col has float
    const hasCriteria = isModelo
      ? (typeof raw[r][5] === 'number')   // modelo: col F = first criterion
      : [3,4,5,6,7].some(c => { const v=Number(raw[r][c]); return Number.isFinite(v)&&v>=1&&v<=10&&Number.isInteger(v); });
    if (hasCriteria || b.length > 8) { dataStart = r; break; }
  }
  if (dataStart === -1) throw new Error('No se encontraron filas de datos en "' + sn + '"');

  const projects = [];

  for (let r = dataStart; r < raw.length; r++) {
    const row = raw[r]; if (!row) continue;

    // ── Project name ──────────────────────────────────────────────────
    const nom = String(row[1]||'').trim();
    if (!nom || nom.length < 3) continue;
    if (/^(nombre|proyecto|name|nº|#|rank|—|total)/i.test(nom)) continue;

    const area     = String(row[2]||'').trim() || 'Sin área';
    const sponsor  = String(row[3]||'').trim() || '';
    const fechaRaw = row[4];
    let reqDate = null;

    // Parse date from col E
    if (fechaRaw) {
      const s = String(fechaRaw).trim();
      // DD/MM/YYYY
      const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      // YYYY-MM-DD
      const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m1) reqDate = `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
      else if (m2) reqDate = s.substring(0,10);
      else if (typeof fechaRaw==='number' && fechaRaw>40000 && fechaRaw<70000) {
        const d = new Date(new Date(1899,11,30).getTime() + fechaRaw*86400000);
        reqDate = d.toISOString().split('T')[0];
      }
    }

    const scores = {};

    if (isModelo) {
      // ── mesoestetic_scoring_modelo.xlsx ────────────────────────────────
      // Cols F-AA (idx 5-26) = 22 criteria in order
      // Col AJ (idx 35) = pre-computed Score Final (use as reference, but recalc in app)
      let nValid = 0;
      CRIT_IDS.forEach((cid, j) => {
        const v = parseFloat(row[5 + j]);
        const s = (Number.isFinite(v) && v >= 1 && v <= 10) ? Math.round(v) : 5;
        scores[cid] = s;
        if (Number.isFinite(v) && v >= 1 && v <= 10) nValid++;
      });
      if (nValid < 4) continue;

      // Also read horas from col AM (idx 38)
      const horasVal = parseFloat(row[38]);
      if (Number.isFinite(horasVal) && horasVal > 0) {
        // Will be attached after computeProj
        scores.__horas = horasVal;
      }

    } else if (isRanking) {
      // ── Ranking sheet: cols F-K (idx 5-10) = D1-D6 dim averages ─────────
      const dimAvgs = [5,6,7,8,9,10].map(c => {
        const v = parseFloat(row[c]); return Number.isFinite(v) ? v : 5;
      });
      DIMS.forEach((d, di) => {
        d.criterios.forEach(c => { scores[c.id] = Math.round(Math.max(1,Math.min(10,dimAvgs[di]))); });
      });

    } else {
      // ── Legacy Carga Herramienta: criteria start at col D (idx 3) ──────
      // Auto-detect first score col
      let firstScoreCol = 3;
      for (let c = 2; c < Math.min(row.length, 10); c++) {
        const v = Number(row[c]);
        if (Number.isFinite(v) && v >= 1 && v <= 10 && Number.isInteger(v)) { firstScoreCol = c; break; }
      }
      let nValid = 0;
      CRIT_IDS.forEach((cid, j) => {
        const v = parseFloat(row[firstScoreCol + j]);
        const s = (Number.isFinite(v) && v >= 1 && v <= 10) ? Math.round(v) : 5;
        scores[cid] = s;
        if (Number.isFinite(v) && v >= 1 && v <= 10) nValid++;
      });
      if (nValid < 4) continue;
    }

    projects.push({nom, area, sponsor, scores, reqDate, regDate: null});
  }

  if (!projects.length) throw new Error('Sin proyectos válidos en "' + sn + '"');
  return projects;
}

/* Apply projects to app, preserving horas */
function applyProjects(projects, filename) {
  const prevHoras = {};
  portfolioData.forEach(p => { if (p.horas!=null) prevHoras[p.nom]=p.horas; });
  Object.assign(prevHoras, _savedHoras);

  portfolioData = projects.map(p => {
    const proj = computeProj(p);
    const excelHoras = (p.scores && p.scores.__horas != null) ? p.scores.__horas : null;
    proj.horas = excelHoras ?? prevHoras[p.nom] ?? null;
    proj._dvId = null;  // will be set by upsert
    proj._selected = false;
    return proj;
  });
  portfolioData.forEach(p=>{ if(p.horas===undefined) p.horas=null; });

  renderPortfolio(); renderPools();
  const el=document.getElementById('portfolio'); if(el) el.style.display='block';
  const cp=document.getElementById('charts-panel'); if(cp) cp.style.display='block';
  const bc=document.getElementById('btn-clear'); if(bc) bc.style.display='flex';
  const bt=document.getElementById('bulk-toolbar'); if(bt) bt.style.display='flex';
  try { renderCharts(); } catch(_) {}
  if (typeof renderDashboard === 'function') renderDashboard();

  toast(`✓ ${portfolioData.length} proyectos cargados · exporta a Excel cuando quieras`);
}

/* One-time file input load */
function loadExcel(inp) {
  const file=inp.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      const projects=parseExcelBuffer(e.target.result);
      applyProjects(projects, file.name);
      const ei=document.getElementById('ib-info');
      const withSponsor=portfolioData.filter(p=>p.sponsor).length;
      const withHoras=portfolioData.filter(p=>p.horas!=null).length;
      if(ei) ei.textContent=portfolioData.length+' proyectos · hoja "'+_liveSheetName+'" · '+
        (withHoras?withHoras+' con horas · ':'')+(withSponsor?withSponsor+' con sponsor · ':'')+file.name;
      toast('✓ '+portfolioData.length+' proyectos importados de "'+_liveSheetName+'"');
    } catch(err) { console.error(err); toast('Error: '+err.message); }
    inp.value='';
  };
  reader.readAsArrayBuffer(file);
}

/* Live reload — File System Access API (Chrome/Edge) */
async function connectLiveExcel() {
  if (!('showOpenFilePicker' in window)) {
    toast('Live reload no disponible. Usa Chrome o Edge.');
    document.getElementById('excel-input').click(); return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      types:[{description:'Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx','.xls']}}]
    });
    _liveFileHandle=handle; _liveLastMod=null;
    clearInterval(_liveInterval);
    await refreshLiveExcel(true);
    _liveInterval=setInterval(()=>refreshLiveExcel(false), 3000);
    updateLiveBadge(true);
    toast('🔴 Live conectado — actualiza automáticamente al guardar el Excel');
  } catch(e) { if(e.name!=='AbortError') toast('Error: '+e.message); }
}

async function refreshLiveExcel(force=false) {
  if (!_liveFileHandle) return;
  try {
    const file=await _liveFileHandle.getFile();
    const mod=file.lastModified;
    if (!force && mod===_liveLastMod) return;
    _liveLastMod=mod;
    const buf=await file.arrayBuffer();
    const projects=parseExcelBuffer(buf);
    applyProjects(projects, file.name);
    const ts=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const ei=document.getElementById('ib-info');
    if(ei) ei.textContent='🔴 Live · '+portfolioData.length+' proyectos · "'+_liveSheetName+'" · '+ts;
    if(!force) toast('↻ Actualizado · '+portfolioData.length+' proyectos · '+ts);
  } catch(e) { console.warn('Live reload error:',e.message); }
}

function disconnectLiveExcel() {
  clearInterval(_liveInterval); _liveInterval=null;
  _liveFileHandle=null; _liveLastMod=null;
  updateLiveBadge(false);
}

function manualRefresh() {
  if (_liveFileHandle) refreshLiveExcel(true);
  else { toast('Sin fichero live conectado'); document.getElementById('excel-input').click(); }
}

function updateLiveBadge(active) {
  const btn=document.getElementById('btn-live');
  const btnRef=document.getElementById('btn-refresh');
  if (!btn) return;
  if (active) {
    btn.textContent='⏹ live activo'; btn.style.background='#8A1A20';
    btn.onclick=()=>{ disconnectLiveExcel(); clearPortfolio(); };
    if(btnRef) btnRef.style.display='flex';
  } else {
    btn.textContent='⚡ conectar live'; btn.style.background='#065438';
    btn.onclick=connectLiveExcel;
    if(btnRef) btnRef.style.display='none';
  }
}

function computeProj(proj) {
  if (proj.horas === undefined) proj.horas = null;
  if (proj.sponsor === undefined) proj.sponsor = '';
  // Temporarily apply scores to DIMS copies for computation
  const dimScores=DIMS.map(d=>{
    let num=0,den=0;
    d.criterios.forEach(c=>{
      let s=proj.scores[c.id]||5;
      // Auto-reg for c1_4
      if(c.id==='c1_4'&&proj.regDate){
        const days=Math.round((new Date(proj.regDate)-new Date())/86400000);
        s=regDateNote(null,days);
      }
      const b=sigmoidBoost(s,c.C0,c.B0,c.A0,c.C,c.B,c.A);
      num+=c.pw*b*s; den+=c.pw*b;
    });
    return den>0?num/den:0;
  });
  const sb=DIMS.reduce((a,d,i)=>a+d.peso*dimScores[i],0);
  const af=agingFactor(proj.reqDate);
  const sf=Math.min(sb*af,10);
  const d1=dimScores[0];
  const regDays=proj.regDate?Math.round((new Date(proj.regDate)-new Date())/86400000):null;
  return{...proj,dimScores,sb,af,sf,d1,autoP:d1>=8,regDays};
}

function sortPort(by,btn) {
  portSort=by;
  document.querySelectorAll('.sort-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderPortfolio();
}
function filterPort(f,btn) {
  portFilter=f;
  document.querySelectorAll('.pf-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderPortfolio();
}


function filterPortfolio(query) {
  const q = (query || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#port-tbl tbody tr');
  let visible = 0;
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const show = !q || text.includes(q);
    row.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  // Update count
  const countEl = document.getElementById('port-count');
  if (countEl) {
    const total = rows.length;
    countEl.textContent = q
      ? `${visible} de ${total} proyectos · filtrando "${query}"`
      : `${total} proyecto${total !== 1 ? 's' : ''}`;
  }
}

function renderPortfolio() {
  portfolioData=portfolioData.map(p=>computeProj(p));
  const sorted=[...portfolioData].sort((a,b)=>{
    if(portSort==='score')return b.sf-a.sf;
    if(portSort==='aging')return b.sf-a.sf;
    if(portSort==='reg'){
      if(a.regDays===null&&b.regDays===null)return 0;
      if(a.regDays===null)return 1;
      if(b.regDays===null)return -1;
      return a.regDays-b.regDays;
    }
    return a.nom.localeCompare(b.nom);
  });
  const tbody=document.getElementById('port-tbody');
  tbody.innerHTML='';
  let vis=0;
  sorted.forEach((p,idx)=>{
    const cl=clsf(p.sf);
    const pool=getPool(p);
    const hide=portFilter!=='all'&&(
      portFilter==='REG'?(p.regDays===null||p.regDays>90)
      :portFilter==='LARGO'?pool!=='L'
      :portFilter==='MEDIO'?pool!=='M'
      :portFilter==='CORTO'?pool!=='S'
      :portFilter==='SINPOOL'?p.horas!==null&&p.horas!==undefined
      :!cl.et.includes(portFilter)
    );
    if(!hide)vis++;
    const rank    = idx < 3 ? ['gold','silver','bronze'][idx] : '';
    const realIdx = portfolioData.indexOf(p);
    const dimCells= (p.dimScores||[0,0,0,0,0,0]).map(ds=>
      `<td style="text-align:center;color:${scColorHex(ds)};font-weight:600;font-size:11px;">${ds.toFixed(1)}</td>`
    ).join('');
    const agingStr= p.af>1.001
      ? `<span class="aging-badge" style="background:#F7FEE7;color:#3F6212;">+${((p.af-1)*100).toFixed(0)}%</span>`
      : '<span style="color:#C0C0C0;font-size:10px;">—</span>';
    const clsStyle= p.autoP
      ? 'background:var(--d1t);color:var(--d1);border-color:rgba(204,31,38,.2);'
      : `background:${cl.bg};color:${cl.c};border-color:${cl.b};`;
    const regStr  = p.regDays===null
      ? '<span style="color:#C0C0C0;font-size:10px;">—</span>'
      : p.regDays<0
        ? `<span class="reg-badge" style="background:var(--d1t);color:var(--d1);">VENCIDA</span>`
        : p.regDays<30
          ? `<span class="reg-badge" style="background:var(--d1t);color:var(--d1);">⚠ ${p.regDays}d</span>`
          : p.regDays<90
            ? `<span class="reg-badge" style="background:var(--d4t);color:var(--d4);">${p.regDays}d</span>`
            : `<span class="reg-badge" style="background:var(--d3t);color:var(--d3);">${p.regDays}d</span>`;
    const dvDot = p._dvId
      ? `<span title="Guardado en Dataverse" style="color:var(--d3);font-size:10px">●</span>`
      : `<span title="Solo local" style="color:var(--ink4);font-size:10px">○</span>`;
    const tr=document.createElement('tr');
    tr.className=hide?'hidden':'';
    tr.innerHTML=`
      <td style="text-align:center;width:32px;">
        <input type="checkbox" style="width:13px;height:13px;accent-color:var(--d1);cursor:pointer"
          ${p._selected?'checked':''}
          onchange="toggleProjectSelect(${realIdx},this.checked)"
          onclick="event.stopPropagation()">
      </td>
      <td><span class="rank ${rank}">${idx+1}</span></td>
      <td style="font-weight:600;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${p.nom}">${dvDot} ${p.nom}</td>
      <td style="font-size:10px;color:var(--ink3);white-space:nowrap;">${p.area||'—'}</td>
      ${dimCells}
      <td style="text-align:center;font-family:'Playfair Display',serif;font-size:16px;">${p.sb.toFixed(1)}</td>
      <td style="text-align:center;">${agingStr}</td>
      <td style="text-align:center;font-family:'Playfair Display',serif;font-size:18px;color:${scColorHex(p.sf)};">${p.sf.toFixed(1)}</td>
      <td><span class="cls-badge" style="${clsStyle}">${p.autoP?'⚑ AUTO':cl.et}</span></td>
      <td style="text-align:center;">${regStr}</td>
      <td style="text-align:center;">
        <input type="number" class="hours-inp"
          value="${p.horas!==null&&p.horas!==undefined?p.horas:''}"
          min="0" step="1" placeholder="h"
          title="Estimación técnica en horas"
          onchange="setHoras(${realIdx},this.value)"
          onclick="event.stopPropagation()">
      </td>
      <td style="text-align:center;">${renderPoolTag(pool)}</td>
      <td><button class="load-btn" onclick="loadIntoEval(${realIdx})">Evaluar →</button></td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('port-count').textContent=`${vis} de ${portfolioData.length} proyectos`;
  if(typeof renderProjectsScreen==='function') renderProjectsScreen();
  if(typeof renderDashboard==='function') renderDashboard();
  document.getElementById('port-empty').style.display=vis===0?'block':'none';
  document.getElementById('port-tbl').style.display=vis===0?'none':'table';
  // Update bulk toolbar
  const bt=document.getElementById('bulk-toolbar');
  if(bt) bt.style.display = portfolioData.length > 0 ? 'flex' : 'none';
  updateBulkDeleteBtn();
  renderPools();
}

/* ── POOL / HOURS SYSTEM ───────────────────────────────── */
function getThr() {
  const s = parseInt(document.getElementById('thr-s').value) || 30;
  const m = parseInt(document.getElementById('thr-m').value) || 100;
  return { s: Math.min(s,m-1), m };
}
function getPool(p) {
  if (p.horas === null || p.horas === undefined || p.horas === '') return null;
  const h = parseFloat(p.horas);
  if (isNaN(h)) return null;
  const { s, m } = getThr();
  if (h < s)  return 'S';
  if (h < m)  return 'M';
  return 'L';
}
function renderPoolTag(pool) {
  if (!pool) return '<span class="pool-none">—</span>';
  const map = {
    'L': '<span class="pool-tag pool-L">🔴 Largo</span>',
    'M': '<span class="pool-tag pool-M">🟡 Medio</span>',
    'S': '<span class="pool-tag pool-S">🟢 Corto</span>',
  };
  return map[pool] || '<span class="pool-none">—</span>';
}
function setHoras(idx, val) {
  if (!portfolioData[idx]) return;
  const v = val === '' ? null : parseFloat(val);
  portfolioData[idx].horas = isNaN(v) ? null : v;
  renderPools();
  // Refresh pool tag in same row without full re-render
  const rows = document.querySelectorAll('#port-tbody tr');
  rows.forEach(tr => {
    const btn = tr.querySelector('.load-btn');
    if (btn && btn.getAttribute('onclick').includes(`(${idx})`)) {
      const poolCell = tr.cells[tr.cells.length - 2];
      if (poolCell) poolCell.innerHTML = renderPoolTag(getPool(portfolioData[idx]));
    }
  });
}
function renderPools() {
  const panel = document.getElementById('pool-panel');
  if (!portfolioData.length) { if(panel) panel.style.display='none'; return; }
  if(panel) panel.style.display='block';
  const { s, m } = getThr();
  const pools = { L:[], M:[], S:[], null:[] };
  portfolioData.forEach(p => {
    const pool = getPool(p);
    (pools[pool] || pools[null]).push(p);
  });
  // Sort each pool by sf desc
  ['L','M','S'].forEach(k => pools[k].sort((a,b) => b.sf - a.sf));

  const poolDefs = [
    { key:'L', label:`Largos (≥${m}h)`, sub:'Alta complejidad técnica', cls:'pool-L',
      color:'#991B1B', bg:'#FEF2F2' },
    { key:'M', label:`Medianos (${s}–${m}h)`, sub:'Complejidad media', cls:'pool-M',
      color:'#92400E', bg:'#FFFBEB' },
    { key:'S', label:`Cortos (<${s}h)`, sub:'Quick wins / tareas puntuales', cls:'pool-S',
      color:'#065F46', bg:'#ECFDF5' },
  ];

  document.getElementById('pool-grid').innerHTML = poolDefs.map(pd => {
    const items = pools[pd.key];
    const itemsHtml = items.length === 0
      ? `<div class="pool-empty">Sin proyectos en este pool</div>`
      : items.map(p => {
          const cl = clsf(p.sf);
          const clsStyle = `background:${cl.bg};color:${cl.c};border-color:${cl.b};`;
          return `<div class="pool-item">
            <div class="pool-item-left">
              <div class="pool-item-name" title="${p.nom}">${p.nom.substring(0,52)}</div>
              <div class="pool-item-meta">${p.area||'—'} · ${p.horas}h</div>
            </div>
            <div class="pool-item-right">
              <span class="cls-badge" style="${clsStyle};font-size:7px;padding:2px 7px;">${cl.et.split(' ')[0]}</span>
              <span class="pool-score" style="color:${scColorHex(p.sf)};">${p.sf.toFixed(1)}</span>
            </div>
          </div>`;
        }).join('');

    return `<div class="pool-col">
      <div class="pool-col-header" style="background:${pd.bg};">
        <div>
          <div class="pool-col-ttl">
            <span class="pool-tag ${pd.cls}">${pd.label}</span>
            <span class="pool-count-badge">${items.length}</span>
          </div>
          <div style="font-size:9px;color:${pd.color};margin-top:4px;opacity:.7;">${pd.sub}</div>
        </div>
        <div style="font-family:'Inter',sans-serif;font-size:22px;color:${pd.color};opacity:.6;">
          ${items.length > 0 ? (items.reduce((a,p)=>a+p.sf,0)/items.length).toFixed(1)+' avg' : '—'}
        </div>
      </div>
      <div style="max-height:380px;overflow-y:auto;">${itemsHtml}</div>
    </div>`;
  }).join('');
}

/* ── BENCHMARK vs PORTFOLIO ─────────────────────────── */
function renderBenchmark(proj) {
  if(!portfolioData.length) return;

  // Compute portfolio averages per dimension
  const dimAvgs = DIMS.map((_,di) => {
    const vals = portfolioData.map(p => p.dimScores[di]);
    return vals.reduce((a,b)=>a+b,0) / vals.length;
  });

  // Current project dim scores
  const projDimScores = DIMS.map(d => scoreDim(d.criterios));

  // Overall stats
  const allScores = portfolioData.map(p=>p.sf).sort((a,b)=>a-b);
  const avgScore = allScores.reduce((a,b)=>a+b,0)/allScores.length;
  const rank = portfolioData.filter(p=>p.sf >= proj.sf).length;

  document.getElementById('bench-panel').style.display = 'block';
  document.getElementById('bench-proj-name').textContent = proj.nom;
  document.getElementById('bench-count').textContent =
    `${portfolioData.length} proyectos · Score medio cartera: ${avgScore.toFixed(2)} · Este proyecto: rank #${rank} de ${portfolioData.length}`;

  const rows = DIMS.map((d, di) => {
    const pv = projDimScores[di];
    const av = dimAvgs[di];
    const max = 10;
    const pvPct = (pv/max*100).toFixed(1);
    const avPct = (av/max*100).toFixed(1);
    const diff = pv - av;
    const diffStr = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
    const diffColor = diff >= 0.3 ? '#4ADE80' : diff <= -0.3 ? '#FCA5A5' : '#888';
    return `<div class="bench-row">
      <div class="bench-id">${d.id}</div>
      <div>
        <div style="font-size:9px;color:#555;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${d.nom.split(',')[0]}
        </div>
        <div class="bench-track">
          <div class="bench-fill-avg" style="width:${avPct}%;"></div>
          <div class="bench-fill-proj" style="width:${pvPct}%;opacity:.9;"></div>
          <div class="bench-avg-line" style="left:${avPct}%;"></div>
        </div>
      </div>
      <div class="bench-val">${pv.toFixed(1)}</div>
      <div style="font-size:9px;font-weight:700;color:${diffColor};text-align:right;">${diffStr}</div>
    </div>`;
  }).join('');

  document.getElementById('bench-rows').innerHTML = rows;
}

function loadIntoEval(idx) {
  const p=portfolioData[idx]; if(!p)return;
  document.getElementById('f-name').value=p.nom;
  if(p.reqDate)document.getElementById('f-req').value=p.reqDate;
  if(p.regDate)document.getElementById('f-reg').value=p.regDate;
  if(document.getElementById('f-area') && p.area) document.getElementById('f-area').value=p.area;
  DIMS.forEach(d=>d.criterios.forEach(c=>{
    const v=p.scores[c.id]||5; c.val=v;
    const sl=document.getElementById('sl-'+c.id);if(sl)sl.value=v;
    const cv=document.getElementById('cv-'+c.id);if(cv){cv.textContent=v;cv.style.color=scColorHex(v);}
    const cb=document.getElementById('cb-'+c.id);if(cb)cb.textContent='boost: '+sigmoidBoost(v,c.C0,c.B0,c.A0,c.C,c.B,c.A).toFixed(2)+'×';
    const bp=document.getElementById('bp-'+c.id);if(bp)bp.innerHTML=boostPreview(c);
  }));
  upd();
  // Render benchmark AFTER upd() so dim scores are fresh
  renderBenchmark(p);
  document.getElementById('bench-panel').scrollIntoView({behavior:'smooth',block:'start'});
  toast(`"${p.nom}" cargado · comparativa activada`);
}

/* ── CHARTS ─────────────────────────────────────────── */
const CLS_BG={
  'PRIORITARIO ESTRATÉGICO (D1)':'rgba(220,38,38,.8)',
  'PRIORITARIO ESTRATÉGICO':'rgba(13,92,46,.85)',
  'ALTA PRIORIDAD':'rgba(30,58,95,.8)',
  'PRIORIDAD MEDIA':'rgba(146,64,14,.75)',
  'BAJA PRIORIDAD':'rgba(55,65,81,.6)',
  'DESCARTAR':'rgba(127,29,29,.6)',
};
const CLS_BORDER={
  'PRIORITARIO ESTRATÉGICO (D1)':'#DC2626',
  'PRIORITARIO ESTRATÉGICO':'#0D5C2E',
  'ALTA PRIORIDAD':'#1E3A5F',
  'PRIORIDAD MEDIA':'#92400E',
  'BAJA PRIORIDAD':'#374151',
  'DESCARTAR':'#7F1D1D',
};
const CHART_FONT={family:'DM Sans',size:10};

function renderCharts(){
  if(!portfolioData.length) return;
  switch(curChart){
    case 'bubble':  renderBubble();  break;
    case 'bars':    renderBars();    break;
    case 'dept':    renderDept();    break;
    case 'scatter': renderScatter(); break;
    case 'heat':    renderHeat();    break;
    case 'quad':    renderQuad();    break;
  }
}


// ① BUBBLE: D3 x-axis · D1 y-axis · size=D2 · color=classification
function renderBubble(){
  destroyC('bubble');
  const allCls=[...new Set(portfolioData.map(p=>clsf(p.sf).et))];
  const datasets=allCls.map(cls=>{
    const pts=portfolioData.filter(p=>clsf(p.sf).et===cls).map(p=>({
      x:+p.dimScores[2].toFixed(2), y:+p.dimScores[0].toFixed(2),
      r:Math.max(4,p.dimScores[1]*2),
      nom:sn(p.nom), score:p.sf, area:p.area||''
    }));
    return{label:cls,data:pts,
      backgroundColor:CLS_BG[cls]||'rgba(100,100,100,.6)',
      borderColor:CLS_BORDER[cls]||'#888',borderWidth:1.5};
  });
  chartInst.bubble=new Chart(document.getElementById('c-bubble'),{
    type:'bubble',data:{datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:true,position:'bottom',labels:{font:CHART_FONT,boxWidth:10,padding:10}},
        tooltip:{callbacks:{label:d=>[`${d.raw.nom}`,`Score: ${d.raw.score.toFixed(2)} · ${d.raw.area}`,`D3 Valor: ${d.raw.x} · D1 Compliance: ${d.raw.y}`]}}
      },
      scales:{
        x:{title:{display:true,text:'D3 — Valor de Negocio',font:CHART_FONT,color:'#8A8A8A'},
           min:0,max:10,grid:{color:'rgba(0,0,0,.05)'},ticks:{font:CHART_FONT}},
        y:{title:{display:true,text:'D1 — Compliance / Riesgo',font:CHART_FONT,color:'#8A8A8A'},
           min:0,max:10,grid:{color:'rgba(0,0,0,.05)'},ticks:{font:CHART_FONT}},
      }
    }
  });
}

// ② BARS: top 30 by score
function renderBars(){
  destroyC('bars');
  const top=portfolioData.slice().sort((a,b)=>b.sf-a.sf).slice(0,30);
  chartInst.bars=new Chart(document.getElementById('c-bars'),{
    type:'bar',
    data:{
      labels:top.map(p=>sn(p.nom)),
      datasets:[{
        label:'Score final',
        data:top.map(p=>+p.sf.toFixed(2)),
        backgroundColor:top.map(p=>CLS_BG[clsf(p.sf).et]||'rgba(196,151,74,.7)'),
        borderColor:top.map(p=>CLS_BORDER[clsf(p.sf).et]||'#C4974A'),
        borderWidth:1,borderRadius:3,
      }]
    },
    options:{
      indexAxis:'y',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:d=>`Score: ${d.raw} — ${clsf(d.raw).et}`}}},
      scales:{
        x:{min:0,max:10,grid:{color:'rgba(0,0,0,.05)'},ticks:{font:CHART_FONT}},
        y:{ticks:{font:{family:'DM Sans',size:9}},grid:{display:false}},
      }
    }
  });
}

// ③ DEPT: avg score by area
function renderDept(){
  destroyC('dept');
  const byArea={};
  portfolioData.forEach(p=>{
    const a=p.area||'Sin área';
    if(!byArea[a]) byArea[a]={sum:0,n:0};
    byArea[a].sum+=p.sf; byArea[a].n++;
  });
  const sorted=Object.entries(byArea).sort((a,b)=>b[1].sum/b[1].n - a[1].sum/a[1].n);
  const labels=sorted.map(([a])=>a);
  const avgs=sorted.map(([,v])=>+(v.sum/v.n).toFixed(2));
  const counts=sorted.map(([,v])=>v.n);
  chartInst.dept=new Chart(document.getElementById('c-dept'),{
    type:'bar',
    data:{labels,datasets:[
      {label:'Score medio',data:avgs,backgroundColor:'rgba(196,151,74,.75)',borderColor:'#C4974A',borderWidth:1.5,borderRadius:4,yAxisID:'y'},
      {label:'Nº proyectos',data:counts,type:'line',borderColor:'rgba(30,58,95,.7)',backgroundColor:'rgba(30,58,95,.1)',borderWidth:2,pointRadius:4,yAxisID:'y2'},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,position:'bottom',labels:{font:CHART_FONT,boxWidth:10}}},
      scales:{
        y:{title:{display:true,text:'Score medio',font:CHART_FONT},min:0,max:10,ticks:{font:CHART_FONT}},
        y2:{position:'right',title:{display:true,text:'Nº proyectos',font:CHART_FONT},grid:{display:false},ticks:{font:CHART_FONT}},
        x:{ticks:{font:{family:'DM Sans',size:9}},grid:{display:false}},
      }
    }
  });
}

// ④ SCATTER: D5 ease (x) vs D3 value (y), size=D1
function renderScatter(){
  destroyC('scatter');
  const datasets=[{
    label:'Proyectos',
    data:portfolioData.map(p=>({
      x:+p.dimScores[4].toFixed(2), y:+p.dimScores[2].toFixed(2),
      r:Math.max(4,p.dimScores[0]*1.8),
      nom:sn(p.nom),score:p.sf
    })),
    backgroundColor:portfolioData.map(p=>CLS_BG[clsf(p.sf).et]||'rgba(196,151,74,.7)'),
    borderColor:'rgba(255,255,255,.5)',borderWidth:1.5,
  }];
  // Quadrant lines
  chartInst.scatter=new Chart(document.getElementById('c-scatter'),{
    type:'bubble',data:{datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:d=>[d.raw.nom,`D5 Facilidad: ${d.raw.x} · D3 Valor: ${d.raw.y}`,`Score: ${d.raw.score.toFixed(2)}`]}},
        annotation:{annotations:{
          vLine:{type:'line',xMin:5.5,xMax:5.5,borderColor:'rgba(0,0,0,.15)',borderWidth:1,borderDash:[4,4]},
          hLine:{type:'line',yMin:5.5,yMax:5.5,borderColor:'rgba(0,0,0,.15)',borderWidth:1,borderDash:[4,4]},
        }}
      },
      scales:{
        x:{title:{display:true,text:'D5 — Facilidad de implantación →',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
        y:{title:{display:true,text:'D3 — Valor de negocio ↑',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
      }
    }
  });
}

// ⑤ HEATMAP D1 × D2 (scatter with density)
function renderHeat(){
  destroyC('heat');
  const datasets=[{
    label:'Proyectos',
    data:portfolioData.map(p=>({
      x:+p.dimScores[0].toFixed(2), y:+p.dimScores[1].toFixed(2),
      r:Math.max(4,p.sf*1.4),
      nom:sn(p.nom),score:p.sf
    })),
    backgroundColor:portfolioData.map(p=>CLS_BG[clsf(p.sf).et]||'rgba(196,151,74,.7)'),
    borderColor:'rgba(255,255,255,.4)',borderWidth:1,
  }];
  chartInst.heat=new Chart(document.getElementById('c-heat'),{
    type:'bubble',data:{datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:d=>[d.raw.nom,`D1: ${d.raw.x} · D2: ${d.raw.y}`,`Score final: ${d.raw.score.toFixed(2)}`]}}
      },
      scales:{
        x:{title:{display:true,text:'D1 — Compliance / Riesgo →',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
        y:{title:{display:true,text:'D2 — Prioridad Estratégica ↑',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
      }
    }
  });
}

// ⑥ STRATEGIC QUAD: D3 (x) vs D2 (y)
function renderQuad(){
  destroyC('quad');
  const datasets=[{
    label:'Proyectos',
    data:portfolioData.map(p=>({
      x:+p.dimScores[2].toFixed(2), y:+p.dimScores[1].toFixed(2),
      r:Math.max(4,p.dimScores[0]*1.6),
      nom:sn(p.nom),score:p.sf,cls:clsf(p.sf).et
    })),
    backgroundColor:portfolioData.map(p=>CLS_BG[clsf(p.sf).et]||'rgba(196,151,74,.7)'),
    borderColor:'rgba(255,255,255,.4)',borderWidth:1.5,
  }];
  chartInst.quad=new Chart(document.getElementById('c-quad'),{
    type:'bubble',data:{datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:d=>[d.raw.nom,`D3 Valor: ${d.raw.x} · D2 Estrategia: ${d.raw.y}`,`Score: ${d.raw.score.toFixed(2)} · ${d.raw.cls}`]}}
      },
      scales:{
        x:{title:{display:true,text:'D3 — ROI / Valor de negocio →',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
        y:{title:{display:true,text:'D2 — Urgencia Estratégica ↑',font:CHART_FONT,color:'#8A8A8A'},min:0,max:10,ticks:{font:CHART_FONT},grid:{color:'rgba(0,0,0,.04)'}},
      }
    }
  });
}

function clearPortfolio() {
  disconnectLiveExcel();
  portfolioData=[];
  const _portEl2=document.getElementById('portfolio');if(_portEl2)_portEl2.style.display='none';
  document.getElementById('btn-clear').style.display='none';
  document.getElementById('bench-panel').style.display='none';
  if(document.getElementById('pool-panel'))
    document.getElementById('pool-panel').style.display='none';
  const _cp2=document.getElementById('charts-panel');if(_cp2)_cp2.style.display='none';
  document.getElementById('ib-info').textContent='Importa el Excel para evaluar y comparar múltiples proyectos';
  toast('Cartera limpiada');
}

/* ── RESET ────────────────────────────────────────────────── */
function resetAll() {
  DIMS.forEach((d,i)=>{
    d.peso=DEF_PESOS[i];
    d.criterios.forEach(c=>{
      c.val=5;
      const def=dp(d.cls); Object.assign(c,def);
      const sl=document.getElementById('sl-'+c.id);if(sl)sl.value=5;
      const cv=document.getElementById('cv-'+c.id);if(cv){cv.textContent='5';cv.style.color=scColorHex(5);}
      const cb=document.getElementById('cb-'+c.id);if(cb)cb.textContent='boost: '+sigmoidBoost(5,c.C0,c.B0,c.A0,c.C,c.B,c.A).toFixed(2)+'×';
      const bp=document.getElementById('bp-'+c.id);if(bp)bp.innerHTML=boostPreview(c);
      ['C0','B0','A0','C','B','A'].forEach(p=>{const i=document.getElementById('p-'+p+'-'+c.id);if(i)i.value=c[p];});
    });
  });
  ['f-name','f-sponsor','f-desc','f-eval'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  ['f-area','f-type'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('f-req').value='';
  document.getElementById('f-reg').value='';
  renderWeightEditor(); upd(); toast('Nueva evaluación iniciada');
}

/* ── SAVE JSON ────────────────────────────────────────────── */
function guardar() {
  const reqDate=getReqDate(), regDays=getRegDays();
  const sb=scoreBase(), af=agingFactor(reqDate), sf=Math.min(sb*af,10);
  const data={
    version:'3.0',algoritmo:'sigmoid-boost-aging',empresa:'mesoestetic Pharma Group S.L.',
    fecha_evaluacion:new Date().toISOString().split('T')[0],
    proyecto:{
      nombre:document.getElementById('f-name').value,
      area:document.getElementById('f-area').value,
      tipo:document.getElementById('f-type').value,
      sponsor:document.getElementById('f-sponsor').value,
      descripcion:document.getElementById('f-desc').value,
      evaluadores:document.getElementById('f-eval').value,
      fecha_solicitud:reqDate,
      fecha_limite_regulatoria:document.getElementById('f-reg').value||null,
      dias_plazo_regulatorio:regDays,
    },
    scoring:{
      score_base:parseFloat(sb.toFixed(3)),
      aging_factor:parseFloat(af.toFixed(4)),
      score_final:parseFloat(sf.toFixed(3)),
      clasificacion:clsf(sf).et,
      auto_prioritario:scoreDim(DIMS[0].criterios)>=8,
      dimensiones:DIMS.map(d=>({
        id:d.id,nombre:d.nom,peso_global:d.peso,
        score:parseFloat(scoreDim(d.criterios).toFixed(3)),
        criterios:d.criterios.map(c=>({
          nombre:c.nom,peso_dim:c.pw,nota:c.val,
          boost:parseFloat(sigmoidBoost(c.val,c.C0,c.B0,c.A0,c.C,c.B,c.A).toFixed(3)),
          auto_regulatorio:c.isReg&&regDays!==null,
          params:{C0:c.C0,B0:c.B0,A0:c.A0,C:c.C,B:c.B,A:c.A}
        }))
      }))
    }
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`mesoestetic_scoring_v3_${(data.proyecto.nombre||'proyecto').replace(/\s+/g,'_')}.json`;
  a.click();
  toast('Evaluación guardada (v3 · sigmoid boost · aging)');
}

function toast(msg) {
  const el=document.getElementById('toast');
  el.textContent=msg;el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2600);
}

/* ── RECALC BAR ───────────────────────────────────────────── */
let recalcTimer = null;
function showRecalcBar(cid, did) {
  const reqDate = getReqDate();
  const sb = scoreBase();
  const af = agingFactor(reqDate);
  const sf = Math.min(sb * af, 10);
  const d = DIMS.find(x => x.id === did);
  const c = findCrit(cid);
  const cl = clsf(sf);

  const bar = document.getElementById('rbar');
  const rbScore = document.getElementById('rb-score');
  const rbDetail = document.getElementById('rb-detail');
  const rbCls = document.getElementById('rb-cls');

  rbScore.textContent = sf.toFixed(2) + ' / 10';
  rbScore.style.color = scColorHex(sf);
  rbDetail.textContent = `Parámetro ${cid.split('_').pop().toUpperCase()} de "${c ? c.nom : did}" modificado · Boost recalculado`;
  rbCls.textContent = clsf(sf).et;
  rbCls.style.background = cl.bg;
  rbCls.style.color = cl.c;
  rbCls.style.borderColor = cl.b;

  bar.style.display = 'flex';

  // Flash the hero score
  const heroScore = document.getElementById('sum-score') || document.getElementById('wh-score');
  heroScore.classList.remove('score-changed');
  void heroScore.offsetWidth; // reflow
  heroScore.classList.add('score-changed');
  setTimeout(() => heroScore.classList.remove('score-changed'), 400);

  // Show recalc badge in hero
  const hRecalc = null; // removed in wizard
  if (hRecalc) { hRecalc.style.display = 'block'; }

  // Auto-hide bar after 6 seconds
  if (recalcTimer) clearTimeout(recalcTimer);
  recalcTimer = setTimeout(() => {
    bar.style.display = 'none';
    if (hRecalc) hRecalc.style.display = 'none';
  }, 6000);
}



/* ══════════════════════════════════════════════════════
   WIZARD — single block, no duplicates
   ══════════════════════════════════════════════════════ */
let currentStep = 0;
let radarChart = null;

// Dynamic scoring thresholds (configurable)
let scoreThr = {s1:8.5, s2:7.0, s3:5.5, s4:4.0};

function clsf(s) {
  if (s>=scoreThr.s1) return {et:'PRIORITARIO ESTRATÉGICO',bg:'var(--s1t)',c:'var(--s1c)',b:'rgba(10,82,40,.2)'};
  if (s>=scoreThr.s2) return {et:'ALTA PRIORIDAD',         bg:'var(--s2t)',c:'var(--s2c)',b:'rgba(26,58,110,.2)'};
  if (s>=scoreThr.s3) return {et:'PRIORIDAD MEDIA',         bg:'var(--s3t)',c:'var(--s3c)',b:'rgba(122,74,0,.2)'};
  if (s>=scoreThr.s4) return {et:'BAJA PRIORIDAD',          bg:'var(--s4t)',c:'var(--s4c)',b:'rgba(58,66,72,.18)'};
  return               {et:'DESCARTAR / REPLANTEAR',        bg:'var(--d1t)',c:'var(--d1)', b:'rgba(204,31,38,.2)'};
}


function stepNav(dir) {
  const n = currentStep + dir;
  if (n < 0 || n > 7) return;
  goStep(n === 7 ? 'summary' : n);
}

function updateProg() {
  const pct = (currentStep==='summary'||currentStep===7) ? 100 :
              (currentStep==='charts'||currentStep==='pools'||currentStep==='config') ? 100 :
              Math.round((parseInt(currentStep)||0)/7*100);
  const el = document.getElementById('wiz-prog');
  if (el) el.style.width = pct + '%';
}


function renderNav() {
  document.getElementById('nav-dots').innerHTML = DIMS.map((d, i) => `
    <div class="ndot ${currentStep===i+1?'active':currentStep>i+1?'done':''}"
         onclick="goStep(${i+1})" title="${d.nom}">
      <div class="nd-id">${d.id}</div>
      <div class="nd-sc" id="nav-s-${d.id}">${scoreDim(d.criterios).toFixed(1)}</div>
    </div>`).join('');
}

function renderDimSteps() {
  document.getElementById('dim-steps').innerHTML = DIMS.map((d, di) => `
    <div class="step" id="step-${di+1}">
      <div class="dim-banner">${d.desc}</div>
      <div class="c-list">
        ${d.criterios.map((c, ci) => `
          <div class="c-card">
            <div class="c-top">
              <div class="c-left">
                <div class="c-num">criterio ${ci+1} de ${d.criterios.length} · ${d.id}</div>
                <div class="c-name">${c.nom}</div>
                <div class="c-desc">${c.desc}</div>
                <div class="c-tags">
                  <span class="c-tag">peso dim: ${c.pw}%</span>
                  ${c.isReg ? '<span class="auto-tag">⚡ auto desde fecha regulatoria</span>' : ''}
                </div>
              </div>
              <div class="c-right">
                <div class="c-val" id="cv-${c.id}" style="color:${scColorHex(c.val)}">${c.val}</div>
                <div class="c-boost" id="cb-${c.id}">boost: ${sigmoidBoost(c.val,c.C0,c.B0,c.A0,c.C,c.B,c.A).toFixed(2)}×</div>
                <div style="display:flex;align-items:center;gap:8px">
                  <input type="range" class="c-slider" min="1" max="10" step="1" value="${c.val}"
                    id="sl-${c.id}" ${c.isReg?'disabled style="opacity:.4;cursor:not-allowed;"':''}
                    oninput="setNota('${c.id}','${d.id}',this.value);document.getElementById('ni-${c.id}').value=this.value">
                  <input type="number" id="ni-${c.id}" min="1" max="10" step="1" value="${c.val}"
                    ${c.isReg?'disabled':''}
                    style="width:46px;height:32px;border:1.5px solid var(--b);border-radius:6px;text-align:center;font-size:14px;font-weight:700;font-family:'Playfair Display',serif;color:${scColorHex(c.val)};background:var(--surf)"
                    oninput="setNota('${c.id}','${d.id}',this.value);document.getElementById('sl-${c.id}').value=this.value;this.style.color=scColorHex(parseInt(this.value)||5)">
                </div>
                <div class="c-scale"><span>1</span><span>5</span><span>10</span></div>
              </div>
            </div>
            <div class="b-mini" id="bp-${c.id}">${boostPreview(c)}</div>
            <span class="p-tog" onclick="toggleParams('${c.id}')">⚙ parámetros del algoritmo</span>
            <div class="c-params" id="cp-${c.id}" style="display:none">
              <div class="p-ttl">Boost(S) = max(σ_base, σ_boost, 1) · base e=2</div>
              <div class="p-grid">
                ${['C0','B0','A0','C','B','A'].map((p,pi) => `
                  <div class="pf-f">
                    <div class="pf-l">${['C₀','β₀','α₀','C','β','α'][pi]}</div>
                    <input type="number" class="pf-i" id="p-${p}-${c.id}" value="${c[p]}"
                      min="0.1" max="15" step="0.1" oninput="setParam('${c.id}','${d.id}','${p}',this.value)">
                  </div>`).join('')}
              </div>
              <button class="p-rst" onclick="resetParams('${c.id}','${d.id}')">↺ restaurar por defecto</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}


/* ── CHARTS STEP ──────────────────────────────────── */
const chart2Inst = {};
let curChart2 = 'bubble';


function renderChartsStep() {
  if (!portfolioData.length) {
    document.getElementById('charts-step-empty').style.display='block';
    document.getElementById('charts-step-content').style.display='none';
    return;
  }
  document.getElementById('charts-step-empty').style.display='none';
  document.getElementById('charts-step-content').style.display='block';

  // Render chart in chart2 canvas
  const canvasId = 'c2-' + curChart2;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (chart2Inst[curChart2]) { chart2Inst[curChart2].destroy(); delete chart2Inst[curChart2]; }

  const CLS_BG={
    'PRIORITARIO ESTRATÉGICO (D1)':'rgba(204,31,38,.8)',
    'PRIORITARIO ESTRATÉGICO':'rgba(10,82,40,.85)',
    'ALTA PRIORIDAD':'rgba(26,58,110,.8)',
    'PRIORIDAD MEDIA':'rgba(122,74,0,.75)',
    'BAJA PRIORIDAD':'rgba(58,66,72,.6)',
    'DESCARTAR / REPLANTEAR':'rgba(138,26,32,.6)',
  };
  const CLS_BORDER={
    'PRIORITARIO ESTRATÉGICO (D1)':'#CC1F26',
    'PRIORITARIO ESTRATÉGICO':'#0A5228',
    'ALTA PRIORIDAD':'#1A3A6E',
    'PRIORIDAD MEDIA':'#7A4A00',
    'BAJA PRIORIDAD':'#3A4248',
    'DESCARTAR / REPLANTEAR':'#8A1A20',
  };
  const FONT = {family:'DM Sans',size:10};
  const sn = p => p.nom.length>32 ? p.nom.substring(0,30)+'…' : p.nom;

  if (curChart2==='bubble') {
    const allCls=[...new Set(portfolioData.map(p=>clsf(p.sf).et))];
    chart2Inst.bubble = new Chart(canvas, {type:'bubble',
      data:{datasets:allCls.map(cls=>({label:cls,
        data:portfolioData.filter(p=>clsf(p.sf).et===cls).map(p=>({
          x:+p.dimScores[2].toFixed(2),y:+p.dimScores[0].toFixed(2),
          r:Math.max(5,p.dimScores[1]*2.5),nom:sn(p),score:p.sf,area:p.area||''})),
        backgroundColor:CLS_BG[cls]||'rgba(100,100,100,.6)',
        borderColor:CLS_BORDER[cls]||'#888',borderWidth:1.5}))},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{font:FONT,boxWidth:10,padding:10}},
          tooltip:{callbacks:{label:d=>[d.raw.nom,'Score: '+d.raw.score.toFixed(2)+' · '+d.raw.area,'D3: '+d.raw.x+' · D1: '+d.raw.y]}}},
        scales:{x:{title:{display:true,text:'D3 — Valor de negocio →',font:FONT,color:'#888'},min:0,max:10,grid:{color:'rgba(0,0,0,.04)'},ticks:{font:FONT}},
                y:{title:{display:true,text:'D1 — Compliance / Riesgo ↑',font:FONT,color:'#888'},min:0,max:10,grid:{color:'rgba(0,0,0,.04)'},ticks:{font:FONT}}}}});
  } else if (curChart2==='bars') {
    const top=[...portfolioData].sort((a,b)=>b.sf-a.sf).slice(0,30);
    chart2Inst.bars = new Chart(canvas, {type:'bar',
      data:{labels:top.map(p=>sn(p)),
        datasets:[{label:'Score',data:top.map(p=>+p.sf.toFixed(2)),
          backgroundColor:top.map(p=>CLS_BG[clsf(p.sf).et]||'rgba(196,151,74,.7)'),
          borderColor:top.map(p=>CLS_BORDER[clsf(p.sf).et]||'#C4974A'),
          borderWidth:1,borderRadius:3}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:d=>`Score: ${d.raw} — ${clsf(d.raw).et}`}}},
        scales:{x:{min:0,max:10,grid:{color:'rgba(0,0,0,.04)'},ticks:{font:FONT}},
                y:{ticks:{font:{family:'DM Sans',size:9}},grid:{display:false}}}}});
  } else if (curChart2==='dept') {
    const byArea={};
    portfolioData.forEach(p=>{const a=p.area||'Sin área';if(!byArea[a])byArea[a]={sum:0,n:0};byArea[a].sum+=p.sf;byArea[a].n++;});
    const sorted=Object.entries(byArea).sort((a,b)=>b[1].sum/b[1].n-a[1].sum/a[1].n);
    chart2Inst.dept = new Chart(canvas, {type:'bar',
      data:{labels:sorted.map(([a])=>a),datasets:[
        {label:'Score medio',data:sorted.map(([,v])=>+(v.sum/v.n).toFixed(2)),backgroundColor:'rgba(196,151,74,.75)',borderColor:'#C4974A',borderWidth:1.5,borderRadius:4,yAxisID:'y'},
        {label:'Nº proyectos',data:sorted.map(([,v])=>v.n),type:'line',borderColor:'rgba(26,58,110,.7)',backgroundColor:'rgba(26,58,110,.1)',borderWidth:2,pointRadius:4,yAxisID:'y2'}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{font:FONT,boxWidth:10}}},
        scales:{y:{title:{display:true,text:'Score medio',font:FONT},min:0,max:10,ticks:{font:FONT}},
                y2:{position:'right',title:{display:true,text:'Nº proyectos',font:FONT},grid:{display:false},ticks:{font:FONT}},
                x:{ticks:{font:{family:'DM Sans',size:9}},grid:{display:false}}}}});
  } else if (curChart2==='scatter') {
    chart2Inst.scatter = new Chart(canvas, {type:'bubble',
      data:{datasets:[{label:'Proyectos',
        data:portfolioData.map(p=>({x:+p.dimScores[4].toFixed(2),y:+p.dimScores[2].toFixed(2),r:Math.max(5,p.dimScores[0]*2),nom:sn(p),score:p.sf})),
        backgroundColor:portfolioData.map(p=>CLS_BG[clsf(p.sf).et]||'rgba(196,151,74,.7)'),
        borderColor:'rgba(255,255,255,.5)',borderWidth:1.5}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:d=>[d.raw.nom,'D5: '+d.raw.x+' · D3: '+d.raw.y,'Score: '+d.raw.score.toFixed(2)]}}},
        scales:{x:{title:{display:true,text:'D5 — Facilidad de implantación →',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}},
                y:{title:{display:true,text:'D3 — Valor de negocio ↑',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}}}}});
  } else if (curChart2==='heat') {
    chart2Inst.heat = new Chart(canvas, {type:'bubble',
      data:{datasets:[{label:'Proyectos',
        data:portfolioData.map(p=>({x:+p.dimScores[0].toFixed(2),y:+p.dimScores[1].toFixed(2),r:Math.max(5,p.sf*1.5),nom:sn(p),score:p.sf})),
        backgroundColor:portfolioData.map(p=>CLS_BG[clsf(p.sf).et]||'rgba(196,151,74,.7)'),
        borderColor:'rgba(255,255,255,.4)',borderWidth:1}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:d=>[d.raw.nom,'D1: '+d.raw.x+' · D2: '+d.raw.y,'Score: '+d.raw.score.toFixed(2)]}}},
        scales:{x:{title:{display:true,text:'D1 — Compliance / Riesgo →',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}},
                y:{title:{display:true,text:'D2 — Prioridad Estratégica ↑',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}}}}});
  } else if (curChart2==='quad') {
    chart2Inst.quad = new Chart(canvas, {type:'bubble',
      data:{datasets:[{label:'Proyectos',
        data:portfolioData.map(p=>({x:+p.dimScores[2].toFixed(2),y:+p.dimScores[1].toFixed(2),r:Math.max(5,p.dimScores[0]*1.8),nom:sn(p),score:p.sf})),
        backgroundColor:portfolioData.map(p=>CLS_BG[clsf(p.sf).et]||'rgba(196,151,74,.7)'),
        borderColor:'rgba(255,255,255,.4)',borderWidth:1.5}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:d=>[d.raw.nom,'D3: '+d.raw.x+' · D2: '+d.raw.y,'Score: '+d.raw.score.toFixed(2)]}}},
        scales:{x:{title:{display:true,text:'D3 — ROI / Valor →',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}},
                y:{title:{display:true,text:'D2 — Urgencia Estratégica ↑',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}}}}});
  }
}

/* ── POOLS STEP ───────────────────────────────────── */
function updThresholds() { syncThresholds('s', document.getElementById('thr-s')?.value||30); }

function renderPoolsStep() {
  const thrS = parseInt(document.getElementById('thr-s')?.value) || 30;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 100;

  // Bucket projects
  const pools = { L:[], M:[], S:[], N:[] };
  portfolioData.forEach(p => {
    const h = p.horas != null ? parseFloat(p.horas) : null;
    const k = h === null ? 'N' : h < thrS ? 'S' : h < thrM ? 'M' : 'L';
    pools[k].push(p);
  });
  ['L','M','S','N'].forEach(k => pools[k].sort((a,b) => b.sf - a.sf));

  const total = portfolioData.length || 1;

  // Update summary cards — ids match HTML above (l, m, s, n)
  const cardDefs = [
    { k:'L', suffix:'l', range: '≥'+thrM+'h' },
    { k:'M', suffix:'m', range: thrS+'–'+thrM+'h' },
    { k:'S', suffix:'s', range: '<'+thrS+'h' },
    { k:'N', suffix:'n', range: '' },
  ];
  cardDefs.forEach(({k, suffix, range}) => {
    const cnt = pools[k].length;
    const cntEl = document.getElementById('pcv-'+suffix+'-count');
    const barEl = document.getElementById('pcv-'+suffix+'-bar');
    const rangeEl = document.getElementById('pcv-'+suffix+'-range');
    if (cntEl)   cntEl.textContent  = cnt;
    if (barEl)   barEl.style.width  = Math.round(cnt/total*100)+'%';
    if (rangeEl) rangeEl.textContent = range;
  });
  // Update threshold label
  const lbl2 = document.getElementById('thr-l-lbl2');
  if (lbl2) lbl2.textContent = thrS+'h';

  const empty = document.getElementById('pool-step-empty');
  const grid  = document.getElementById('pool-step-grid');

  if (!portfolioData.length) {
    if (empty) empty.style.display = 'block';
    if (grid)  grid.style.display  = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (grid)  grid.style.display  = 'block';

  // Column definitions — LARGO(L) | MEDIO(M) | CORTO(S) | SIN ESTIMAR(N)
  const colDefs = [
    { k:'L', id:'pool-col-L', label:'Largos',      sub:'≥'+thrM+'h · Alta complejidad',       bc:'#CC1F26', bg:'#FEF0F1', brd:'rgba(204,31,38,.2)'  },
    { k:'M', id:'pool-col-M', label:'Medianos',     sub:thrS+'–'+thrM+'h · Complejidad media', bc:'#C07800', bg:'#FAF5E6', brd:'rgba(192,120,0,.2)'  },
    { k:'S', id:'pool-col-S', label:'Cortos',       sub:'<'+thrS+'h · Quick wins',             bc:'#087B50', bg:'#ECF8F3', brd:'rgba(8,123,80,.2)'   },
    { k:'N', id:'pool-col-N', label:'Sin estimar',  sub:'horas no definidas',                  bc:'#AAAAAA', bg:'#F8F8F8', brd:'#E5E5E5'             },
  ];

  colDefs.forEach(pd => {
    const col = document.getElementById(pd.id);
    if (!col) return;
    const items = pools[pd.k];

    const header = `
      <div style="padding:10px 14px;background:${pd.bg};border-bottom:1px solid ${pd.brd};flex-shrink:0;
                  display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:1">
        <div>
          <div style="font-size:10px;font-weight:700;color:${pd.bc};letter-spacing:.08em;text-transform:uppercase">${pd.label}</div>
          <div style="font-size:8px;color:${pd.bc};opacity:.6;margin-top:2px">${pd.sub}</div>
        </div>
        <span style="font-size:11px;font-weight:800;color:${pd.bc};background:#fff;
                     border:1.5px solid ${pd.brd};border-radius:20px;padding:2px 10px">${items.length}</span>
      </div>`;

    const rows = items.length === 0
      ? `<div style="padding:28px 16px;text-align:center;color:#CCC;font-size:10px">Sin proyectos</div>`
      : items.map(p => {
          const idx = portfolioData.indexOf(p);
          const cl  = clsf(p.sf);
          const sfCol = scColorHex(p.sf);
          const nom = p.nom.length > 46 ? p.nom.substring(0,44)+'…' : p.nom;
          return `<div onclick="openProjectEdit(${idx})"
            style="display:flex;align-items:center;gap:10px;padding:9px 14px;
                   border-bottom:1px solid #F5F5F5;cursor:pointer;background:#fff;transition:background .1s"
            onmouseover="this.style.background='#FAFAFA'" onmouseout="this.style.background='#fff'">
            <div style="flex:1;min-width:0">
              <div style="font-size:10px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
                   title="${p.nom.replace(/"/g,'&quot;')}">${nom}</div>
              <div style="font-size:8px;color:#AAA;margin-top:1px">${p.area||'—'} · ${p.horas!=null?p.horas+'h':'—h'}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">
              <span style="font-family:'Inter',sans-serif;font-size:15px;font-weight:800;color:${sfCol};line-height:1">${p.sf.toFixed(1)}</span>
              <span style="font-size:7px;font-weight:700;padding:1px 6px;border-radius:20px;white-space:nowrap;
                           background:${cl.bg};color:${cl.c};border:1px solid ${cl.b}">${cl.et.split(' ').slice(0,2).join(' ')}</span>
            </div>
          </div>
          <button onclick="event.stopPropagation();dvDeleteOne(${idx})"
            title="Eliminar proyecto"
            style="opacity:0;padding:4px 8px;background:none;border:1px solid var(--d1);
                   border-radius:4px;color:var(--d1);font-size:9px;cursor:pointer;
                   transition:opacity .15s;flex-shrink:0;margin-left:4px"
            onmouseover="this.style.opacity='1'"
            onmouseout="this.style.opacity='0'">✕</button>`;
        }).join('');

    col.innerHTML = header + `<div style="overflow-y:auto;max-height:500px">${rows}</div>`;
  });
}

/* ── CONFIG STEP ──────────────────────────────────── */
const DIM_CLR_LIST = ['var(--d1)','var(--d2)','var(--d3)','var(--d4)','var(--d5)','var(--d6)'];
const DIM_BG_LIST  = ['var(--d1t)','var(--d2t)','var(--d3t)','var(--d4t)','var(--d5t)','var(--d6t)'];

function renderCfgDimRows() {
  const cont = document.getElementById('cfg-dim-rows');
  if (!cont) return;
  cont.innerHTML = DIMS.map((d,i) => `
    <div class="dim-cfg-row">
      <div class="dim-cfg-badge" style="background:${DIM_BG_LIST[i]};color:${DIM_CLR_LIST[i]}">${d.id}</div>
      <div>
        <div class="dim-cfg-name">${d.nom}</div>
        <div class="dim-cfg-sub">Peso actual: ${Math.round(d.peso*100)}%</div>
      </div>
      <div class="dim-cfg-pct">
        <input type="range" class="dim-cfg-slider" min="1" max="60" step="1"
          value="${Math.round(d.peso*100)}" id="cfg-slider-${d.id}"
          oninput="onCfgSlider('${d.id}',this.value)">
        <input type="number" class="dim-cfg-val" min="1" max="60" step="1"
          value="${Math.round(d.peso*100)}" id="cfg-val-${d.id}"
          oninput="onCfgVal('${d.id}',this.value)">
        <span style="font-size:11px;color:var(--ink3)">%</span>
      </div>
    </div>`).join('');
  updateCfgTotal();
}

function onCfgSlider(id, val) {
  const inp = document.getElementById('cfg-val-'+id);
  if (inp) inp.value = val;
  updateCfgTotal();
}
function onCfgVal(id, val) {
  const sl = document.getElementById('cfg-slider-'+id);
  if (sl) sl.value = val;
  updateCfgTotal();
}
function applyCfgThresholds() {
  scoreThr.s1=parseFloat(document.getElementById('cfg-thr-s1')?.value||8.5);
  scoreThr.s2=parseFloat(document.getElementById('cfg-thr-s2')?.value||7.0);
  scoreThr.s3=parseFloat(document.getElementById('cfg-thr-s3')?.value||5.5);
  scoreThr.s4=parseFloat(document.getElementById('cfg-thr-s4')?.value||4.0);
  if(portfolioData.length){portfolioData=portfolioData.map(p=>computeProj(p));renderPortfolio();}
  upd(); toast('✓ Umbrales de clasificación actualizados');
}
function resetCfgThresholds() {
  scoreThr={s1:8.5,s2:7.0,s3:5.5,s4:4.0};
  ['s1','s2','s3','s4'].forEach(k=>{const el=document.getElementById('cfg-thr-'+k);if(el)el.value=scoreThr[k];});
  toast('Umbrales restaurados a valores por defecto');
}
function applyCfgPools() {
  const s=parseInt(document.getElementById('cfg-thr-short')?.value||30);
  const m=parseInt(document.getElementById('cfg-thr-medium')?.value||100);
  const thrS=document.getElementById('thr-s'); if(thrS) thrS.value=s;
  const thrS2=document.getElementById('thr-s2'); if(thrS2) thrS2.value=s;
  const thrM=document.getElementById('thr-m'); if(thrM) thrM.value=m;
  const thrM2=document.getElementById('thr-m2'); if(thrM2) thrM2.value=m;
  syncThresholds('s',s); syncThresholds('m',m);
  toast('✓ Umbrales de pools aplicados');
}
function resetCfgPools() {
  ['cfg-thr-short','thr-s','thr-s2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=30;});
  ['cfg-thr-medium','thr-m','thr-m2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=100;});
  syncThresholds('s',30); toast('Pools restaurados');
}

/* upd() — clean version, only touches DOM that exists in wizard */
function upd() {
  updateRegCountdown();
  updateAgingNote();

  // Update nav dimension scores
  DIMS.forEach(d => {
    const el = document.getElementById('nav-s-' + d.id);
    if (el) el.textContent = scoreDim(d.criterios).toFixed(1);
  });

  // Update wizard header score (dim or summary)
  if (currentStep >= 1 && currentStep <= 6) {
    const d = DIMS[currentStep - 1];
    const ds = scoreDim(d.criterios);
    const se = document.getElementById('wh-score');
    if (se) { se.textContent = ds.toFixed(1); se.style.color = scColorHex(ds); }
  } else if (currentStep === 7) {
    const sf = scoreFinal(getReqDate());
    const se = document.getElementById('wh-score');
    if (se) { se.textContent = sf.toFixed(1); se.style.color = scColorHex(sf); }
    updSummary();
  }

  // Recalc portfolio if loaded
  if (portfolioData.length > 0) renderPortfolio();
  checkTotal();
}

function updSummary() {
  const reqDate = getReqDate(), regDays = getRegDays();
  const sb = scoreBase(), af = agingFactor(reqDate);
  const sf = Math.min(sb * af, 10);
  const d1 = scoreDim(DIMS[0].criterios), autoP = d1 >= 8;
  const cl = clsf(sf), re = recf(sf, autoP, af, regDays);

  const nom = document.getElementById('f-name').value.trim() || 'sin nombre';
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('sum-name', nom);
  const area = document.getElementById('f-area').value, tipo = document.getElementById('f-type').value;
  set('sum-meta', [area,tipo].filter(Boolean).join(' · '));

  let pills = '';
  if (reqDate) {
    const days = Math.round((new Date() - new Date(reqDate)) / 86400000);
    pills += `<span class="sh-dp">📅 ${days} días en cartera</span>`;
  }
  if (regDays !== null) {
    const c2 = regDays < 30 ? 'danger' : regDays < 90 ? 'warn' : '';
    pills += `<span class="sh-dp ${c2}">⚠ ${regDays < 0 ? 'VENCIDO hace '+Math.abs(regDays)+'d' : 'plazo: '+regDays+'d'}</span>`;
  }
  const dp = document.getElementById('sum-dates'); if (dp) dp.innerHTML = pills;

  const se = document.getElementById('sum-score');
  if (se) { se.textContent = sf.toFixed(1); se.style.color = autoP ? '#FC9CA0' : scColorHex(sf); }
  set('sum-base', af > 1.001 ? `base: ${sb.toFixed(2)} × ${af.toFixed(3)} aging` : '');

  const ce = document.getElementById('sum-cls');
  if (ce) { ce.textContent = autoP ? '⚑ auto-prioritario' : cl.et; ce.style.background = autoP?'var(--d1t)':cl.bg; ce.style.color = autoP?'var(--d1)':cl.c; ce.style.borderColor = autoP?'rgba(204,31,38,.3)':cl.b; }

  const re_el = document.getElementById('sum-rec');
  if (re_el) { re_el.textContent = re.t; re_el.style.background = re.bg; re_el.style.color = re.c; re_el.style.borderColor = re.b; }

  const dd = document.getElementById('sum-dims');
  if (dd) dd.innerHTML = DIMS.map((d, di) => {
    const ds = scoreDim(d.criterios), col = scColorHex(ds);
    return `<div class="sd-box" onclick="goStep(${di+1})" title="${d.nom}">
      <div class="sd-id">${d.id}</div>
      <div class="sd-val" style="color:${col}">${ds.toFixed(1)}</div>
      <div class="sd-name">${d.nom.split(',')[0].split(' ').slice(0,3).join(' ')}</div>
      <div class="sd-bar"><div class="sd-fill" style="width:${ds*10}%;background:${col}"></div></div>
    </div>`;
  }).join('');

  // Quick stats
  const dimScoresArr = DIMS.map(d => ({id:d.id, nom:d.nom, score:scoreDim(d.criterios)}));
  const best  = dimScoresArr.reduce((a,b) => b.score>a.score?b:a);
  const worst = dimScoresArr.reduce((a,b) => b.score<a.score?b:a);
  const setSafe = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  setSafe('qs-base',  sb.toFixed(2));
  setSafe('qs-aging', af>1.001 ? '×'+af.toFixed(3) : '×1.000');
  setSafe('qs-aging-sub', af>1.001 ? '+'+((af-1)*100).toFixed(1)+'% por antigüedad' : 'sin fecha de solicitud');
  setSafe('qs-best',  best.score.toFixed(1));
  setSafe('qs-best-sub', best.id+' — '+best.nom.split(',')[0]);
  setSafe('qs-worst', worst.score.toFixed(1));
  setSafe('qs-worst-sub', worst.id+' — '+worst.nom.split(',')[0]);

  // Quick stats colors
  const qbest = document.getElementById('qs-best');
  if(qbest) qbest.style.color = scColorHex(best.score);
  const qworst = document.getElementById('qs-worst');
  if(qworst) qworst.style.color = scColorHex(worst.score);

  // Dim mini list
  const dmlRows = document.getElementById('dml-rows');
  const dmlTotal = document.getElementById('dml-total');
  if(dmlRows) dmlRows.innerHTML = DIMS.map((d,di) => {
    const ds = scoreDim(d.criterios), col = scColorHex(ds);
    return `<div class="dml-row" onclick="goStep(${di+1})">
      <div class="dml-id">${d.id}</div>
      <div class="dml-name">${d.nom.split(',')[0]}</div>
      <div class="dml-bar-wrap"><div class="dml-bar-fill" style="width:${ds*10}%;background:${col}"></div></div>
      <div class="dml-val" style="color:${col}">${ds.toFixed(1)}</div>
    </div>`;
  }).join('');
  if(dmlTotal) { dmlTotal.textContent = sf.toFixed(1); dmlTotal.style.color = scColorHex(sf); }

  // Radar
  const data = DIMS.map(d => parseFloat(scoreDim(d.criterios).toFixed(2)));
  if (radarChart) { radarChart.data.datasets[0].data = data; radarChart.update(); }
  else {
    const cv = document.getElementById('radar');
    if (cv) radarChart = new Chart(cv, {
      type: 'radar',
      data: { labels: DIMS.map(d => d.id + ' ' + d.nom.split(' ').slice(0,2).join(' ')),
        datasets: [{ label: 'Score', data, backgroundColor: 'rgba(196,151,74,.06)',
          borderColor: 'rgba(196,151,74,.7)', borderWidth: 1.5,
          pointBackgroundColor: data.map(v => scColorHex(v)),
          pointBorderColor: '#fff', pointBorderWidth: 1.5, pointRadius: 4, pointHoverRadius: 6 }] },
      options: { responsive:true, maintainAspectRatio:false,
        plugins: { legend: { display: false } },
        scales: { r: { min:0, max:10, ticks: { stepSize:2, font:{size:9,family:'DM Sans'}, color:'#C0C0C0', backdropColor:'transparent' },
          grid: { color:'rgba(0,0,0,.05)' }, angleLines: { color:'rgba(0,0,0,.05)' },
          pointLabels: { font:{size:9,family:'DM Sans'}, color:'#888' } } } }
    });
  }
}


/* ── LANDING ────────────────────────────────────────── */
function landingAdoConnect() {
  startApp();
  setTimeout(() => goStep('config'), 80);
}
function goLanding() {
  document.getElementById('landing').style.display = 'flex';
  document.getElementById('shell').style.display = 'none';
  document.getElementById('bar').style.display = 'none';
}
function triggerExcelUpload() {
  document.getElementById('land-excel-input').click();
}
function handleLandingExcel(inp) {
  // Switch to app, then trigger load
  startApp();
  // Small delay so the app DOM renders
  setTimeout(() => {
    // Copy file to the main excel input and trigger
    const mainInp = document.getElementById('excel-input');
    // Transfer files via DataTransfer
    try {
      const dt = new DataTransfer();
      dt.items.add(inp.files[0]);
      mainInp.files = dt.files;
      loadExcel(mainInp);
    } catch(e) {
      // Fallback: directly call loadExcel with landing input
      loadExcel(inp);
    }
    inp.value = '';
    // Go to summary to show portfolio
    goStep('summary');
  }, 100);
}
/* ── HARDCODED CREDENTIALS (optional) ────────────────────────
   Edit the values below to auto-fill credentials on startup.
   Leave empty ('') to require manual entry in ⚙ Config.
   ⚠ Only use this if the repo is PRIVATE — never commit
     real secrets to a public repository.
   ──────────────────────────────────────────────────────────── */
/* ── CREDENTIALS CONFIGURATION ──────────────────────────────
   All credentials must be set in Vercel → Settings → Environment Variables.
   DO NOT put secrets in this file — it is committed to git.

   Required Vercel env vars:
     DV_URL            = https://yourorg.crm4.dynamics.com
     DV_TENANT_ID      = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
     DV_CLIENT_ID      = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
     DV_CLIENT_SECRET  = your-client-secret-value
     ADO_ORG           = YourAzureDevOpsOrg
     ADO_PROJECT       = YourProject
     ADO_PAT           = your-personal-access-token

   The app auto-configures from /api/config at startup.
   Nothing below needs to be changed.
   ─────────────────────────────────────────────────────────── */
const HARDCODED_CREDS = {
  // Leave these empty — credentials come from Vercel env vars via /api/config
  ado_org:     '',
  ado_project: '',
  ado_pat:     '',    // NOT used — PAT lives in ADO_PAT env var
  dv_url:      '',    // Will be auto-populated from /api/config
  dv_tenant:   '',
  dv_clientid: '',
  dv_secret:   '',    // NOT used — secret lives in DV_CLIENT_SECRET env var
};


function exportPortfolioExcel() {
  if (!portfolioData.length) { toast('Sin proyectos para exportar'); return; }

  const wb = XLSX.utils.book_new();

  // Main sheet: one row per project
  const headers = [
    'ID ADO', 'Nombre', 'Área', 'Sponsor', 'Fecha solicitud', 'Horas estimadas',
    'Score final', 'Score base', 'Aging factor',
    'D1 Compliance', 'D2 Estratégico', 'D3 ROI', 'D4 Técnica', 'D5 Implantación', 'D6 Personas',
    'Clasificación', 'Pool', 'Auto-prioritario',
    ...CRIT_IDS.map(id => {
      const dim = DIMS.find(d => d.criterios.some(c => c.id === id));
      const crit = dim?.criterios.find(c => c.id === id);
      return crit?.nom || id;
    })
  ];

  const rows = portfolioData.map(p => [
    p.adoId || '',
    p.nom   || '',
    p.area  || '',
    p.sponsor || '',
    p.reqDate || '',
    p.horas   ?? '',
    +(p.sf  || 0).toFixed(3),
    +(p.sb  || 0).toFixed(3),
    +(p.af  || 1).toFixed(4),
    ...((p.dimScores || [0,0,0,0,0,0]).map(d => +d.toFixed(3))),
    clsf(p.sf || 0).et || '',
    getPoolCode(p) || '',
    p.autoP ? 'Sí' : 'No',
    ...CRIT_IDS.map(id => Math.round(p.scores?.[id] ?? 5))
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Column widths
  ws['!cols'] = headers.map((h, i) => ({
    wch: i < 6 ? 18 : i < 9 ? 10 : i < 15 ? 12 : 14
  }));

  XLSX.utils.book_append_sheet(wb, ws, 'Cartera');

  // Summary sheet
  const cls_counts = {};
  portfolioData.forEach(p => {
    const k = clsf(p.sf || 0).et;
    cls_counts[k] = (cls_counts[k] || 0) + 1;
  });
  const summary = [
    ['Resumen de cartera', ''],
    ['Fecha exportación', new Date().toLocaleString('es-ES')],
    ['Total proyectos', portfolioData.length],
    ['Puntuados', portfolioData.filter(p => (p.sf||0) > 0).length],
    ['Con horas estimadas', portfolioData.filter(p => p.horas != null).length],
    ['Score medio', +(portfolioData.reduce((s,p)=>s+(p.sf||0),0)/portfolioData.length).toFixed(2)],
    ['', ''],
    ['Clasificación', 'Proyectos'],
    ...Object.entries(cls_counts).sort((a,b)=>b[1]-a[1])
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(summary);
  ws2['!cols'] = [{wch:28},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumen');

  XLSX.writeFile(wb, `mesoestetic_scoring_${new Date().toISOString().split('T')[0]}.xlsx`);
  toast(`✓ ${portfolioData.length} proyectos exportados`);
}
