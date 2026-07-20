
/* ═══════════════════════════════════════════════════════════════
   MPG AREA MAPPING — decode area from work item name prefix
   e.g. "MPG-LOG-001 ..." → "Almacén y Logística"
   ═══════════════════════════════════════════════════════════════ */
const MPG_AREA_MAP = {
  'VTA':  'Backoffice y Ventas',
  'PLN':  'Planificación',
  'PROY': 'Proyectos',
  'SOL':  'Solicitudes de compra',
  'FIN':  'Finanzas',
  'LOG':  'Almacén y Logística',
  'INTC': 'Intercompany',
  'CAL':  'Calidad',
  'GEN':  'Operativa general / Multidepartamento',
  'IDI':  'I+D',
  'RRHH': 'Recursos Humanos',
  'COM':  'Compras',
  'VENT': 'Polonia ventas',
  'PRO':  'Producción',
  'OFT':  'Oficina técnica - Códigos',
  'EBD':  'Equipos y aparatología',
  'MAN':  'GMAO',
};

function mpgDecodeArea(title) {
  // Title format: "MPG-{CODE}-{num} ..." or "{CODE}-{num} ..."
  if (!title) return null;
  const m = title.match(/^(?:MPG-)?([A-Z]{2,5})-/i);
  if (!m) return null;
  const code = m[1].toUpperCase();
  return MPG_AREA_MAP[code] || null;
}

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

  // ── Si el Excel trae configuración embebida (Pesos/Boost/Umbrales), aplicarla ──
  // Así las notas se recalculan con la MISMA configuración que las generó.
  if (typeof _readConfigSheets === 'function') {
    try {
      const cfgApplied = _readConfigSheets(wb);
      if (cfgApplied) { window._cfgFromImport = true; }
    } catch(e){ console.error('config import', e); }
  }

  // Sheet priority — support our modelo + legacy formats
  const PREF = ['📊 Cartera','Cartera','Carga Herramienta','Carga de Proyectos','Ranking Proyectos','Sheet1','Hoja1'];
  let sn = wb.SheetNames[0];
  for (const p of PREF) { if (wb.SheetNames.includes(p)) { sn=p; break; } }
  _liveSheetName = sn;

  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, defval:null, raw:true, blankrows:false});

  // ── Detect sheet format ────────────────────────────────────────────────
  const isModelo  = sn === '📊 Cartera';
  const isRanking = sn === 'Ranking Proyectos';
  // Formato propio exportado por la app (exportPortfolioExcel):
  //   cabecera fila 1, F=Horas, S..AN (idx 18-39)=22 criterios
  let isAppExport = false;
  let _appHorasCol = -1, _appCrit0Col = -1, _appSfCol = -1;
  if (sn === 'Cartera' && raw.length > 1) {
    const h = (raw[0] || []).map(function(x){ return String(x||'').toLowerCase().trim(); });
    // Localiza columnas por NOMBRE de cabecera (robusto ante cambios de orden)
    _appHorasCol = h.findIndex(function(x){ return x.indexOf('horas') >= 0; });
    // Columna "Score final" (el score ya calculado que trae el Excel = fuente de verdad)
    _appSfCol = h.findIndex(function(x){ return x.indexOf('score final') >= 0; });
    if (_appSfCol < 0) _appSfCol = h.findIndex(function(x){ return x === 'score' || x.indexOf('score final')>=0; });
    // El primer criterio: busca la cabecera del primer criterio real, o 'c1_1', o 'riesgo legal'
    const crit0 = (typeof DIMS!=='undefined' && DIMS[0] && DIMS[0].criterios[0])
      ? String(DIMS[0].criterios[0].nom||'').toLowerCase() : '';
    _appCrit0Col = h.findIndex(function(x){ return (crit0 && x===crit0) || x==='c1_1' || x.indexOf('riesgo legal')>=0; });
    isAppExport = _appHorasCol >= 0 && _appCrit0Col >= 0;
  }

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
    const _probeCol = isAppExport ? _appHorasCol : 5;
    const hasCriteria = (isModelo || isAppExport)
      ? (typeof raw[r][_probeCol] === 'number')   // modelo: col F crit / appExport: col horas
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

    if (isAppExport) {
      // ── Formato propio de la app: columnas localizadas por cabecera ──
      let nValid = 0;
      CRIT_IDS.forEach(function(cid, j){
        const v = parseFloat(row[_appCrit0Col + j]);
        const s = (Number.isFinite(v) && v >= 1 && v <= 10) ? v : 5;  // conservar decimales
        scores[cid] = s;
        if (Number.isFinite(v) && v >= 1 && v <= 10) nValid++;
      });
      const horasApp = parseFloat(row[_appHorasCol]);
      if (Number.isFinite(horasApp) && horasApp > 0) scores.__horas = horasApp;
      // Score final que trae el Excel = fuente de verdad (no recalcular)
      if (_appSfCol >= 0) {
        const sfRaw = parseFloat(String(row[_appSfCol]).replace(',', '.'));
        if (Number.isFinite(sfRaw) && sfRaw > 0) scores.__sfExcel = sfRaw;
      }
      if (nValid < 4) {
        // Sin criterios válidos: intenta al menos conservar las horas y saltar a media
        if (!(Number.isFinite(horasApp) && horasApp > 0)) continue;
      }

    } else if (isModelo) {
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

    // Extraer horas del marcador __horas y limpiarlo de scores (no es un criterio)
    var _horas = (scores.__horas != null) ? scores.__horas : null;
    if (scores.__horas != null) delete scores.__horas;
    // Extraer el Score final que trae el Excel (fuente de verdad) y limpiarlo de scores
    var _sfExcel = (scores.__sfExcel != null) ? scores.__sfExcel : null;
    if (scores.__sfExcel != null) delete scores.__sfExcel;
    // Extraer el ID de ADO del inicio del nombre si existe (formato "854 — MPG-...")
    var _adoIdMatch = String(nom).match(/^\s*(\d{2,7})\s*[—\-–]/);
    var _adoId = _adoIdMatch ? parseInt(_adoIdMatch[1]) : null;
    projects.push({nom, area, sponsor, scores, reqDate, regDate: null,
      horas: _horas,
      adoId: _adoId,           // recuperado del nombre → permite re-sincronizar a ADO
      _sfExcel: _sfExcel,      // Score final del Excel = se usa tal cual (no recalcular)
      _fromExcel: true,        // marca: viene de Excel
      _manualEval: true,       // respeta sus notas en re-evaluaciones IA
      _excelScores: Object.assign({}, scores)  // copia de seguridad de las notas del Excel
    });
  }

  if (!projects.length) throw new Error('Sin proyectos válidos en "' + sn + '"');
  return projects;
}

/* Apply projects to app, preserving horas */
function applyProjects(projects, filename, mergeMode, allowAdd) {
  const prevHoras = {};
  portfolioData.forEach(p => { if (p.horas!=null) prevHoras[p.nom]=p.horas; });
  Object.assign(prevHoras, _savedHoras);

  // Procesa cada proyecto entrante (calcula score, horas, flags)
  const incoming = projects.map(p => {
    // Auto-detect area from MPG prefix if not set
    if (!p.area && typeof mpgDecodeArea === 'function') {
      p.area = mpgDecodeArea(p.nom) || p.area || '';
    }
    // Reflejar la descripcion de ADO en el campo descripcion breve
    if (!p.descripcion && p.adoDesc) p.descripcion = p.adoDesc;
    const proj = computeProj(p);
    // Si el proyecto viene de Excel con Score final, ESE es el score bueno (no recalcular).
    // Evita que el orden difiera del Excel por diferencias de parámetros del algoritmo.
    if (p._sfExcel != null && Number.isFinite(p._sfExcel)) {
      proj.sf = p._sfExcel;
      proj._sfExcel = p._sfExcel;
    }
    // Horas: Excel directo (p.horas) > marcador legacy __horas > previas > ADO
    const excelHoras = (p.horas != null) ? p.horas : ((p.scores && p.scores.__horas != null) ? p.scores.__horas : null);
    proj.horas = excelHoras ?? prevHoras[p.nom] ?? null;
    // Preservar flags de Excel
    if (p._fromExcel) { proj._fromExcel = true; proj._manualEval = true; }
    proj._dvId = null;
    proj._selected = false;
    if (proj.horas === undefined) proj.horas = null;
    return proj;
  });

  if (mergeMode && portfolioData.length) {
    // ── MERGE: actualiza coincidencias (por adoId o nombre), conserva el resto ──
    const keyOf = function(p){ return p.adoId != null ? ('id:'+p.adoId) : ('nom:'+(p.nom||'').trim().toLowerCase()); };
    const idx = {};
    portfolioData.forEach(function(p,i){ idx[keyOf(p)] = i; });
    let updated = 0, added = 0, skipped = 0;
    incoming.forEach(function(np){
      const k = keyOf(np);
      if (idx[k] !== undefined) {
        const prev = portfolioData[idx[k]];
        // ── El Excel SOLO actualiza notas, horas, área y descripción ──
        // Los metadatos que provienen de ADO se conservan SIEMPRE (la prioridad NUNCA
        // se toca desde el Excel, porque el Excel no es la fuente de verdad de ese campo).
        np.adoPriority = (prev.adoPriority != null) ? prev.adoPriority : np.adoPriority;
        np.adoId       = (prev.adoId != null)       ? prev.adoId       : np.adoId;
        np.adoStartDate= (prev.adoStartDate != null && prev.adoStartDate !== '') ? prev.adoStartDate : np.adoStartDate;  // fecha inicio: SIEMPRE de ADO
        np.adoTags     = prev.adoTags     || np.adoTags;
        np.adoType     = prev.adoType     || np.adoType;
        np.adoState    = prev.adoState    || np.adoState;
        np.adoAssigned = prev.adoAssigned || np.adoAssigned;   // responsable de ADO → "Pendiente de:"
        np.adoIteration= prev.adoIteration|| np.adoIteration;
        // Descripción: la de ADO manda si el Excel no trae una propia
        if (!np.adoDesc && prev.adoDesc) np.adoDesc = prev.adoDesc;
        if (!np.descripcion && (prev.descripcion || prev.adoDesc)) np.descripcion = prev.descripcion || prev.adoDesc;
        // Sponsor de ADO si el Excel no lo trae
        if (!np.sponsor && prev.sponsor) np.sponsor = prev.sponsor;
        // ══ PUNTUACIONES GUARDADAS: PRIORIDAD ABSOLUTA ══
        // Si el proyecto tiene puntuación guardada (_scoreLocked) o el origen no aporta
        // nota real, se conservan SIEMPRE las existentes. Lo guardado manda sobre ADO.
        var _npHasRealScore = (np._sfExcel != null) ||
          (np.scores && Object.keys(np.scores).length && Object.values(np.scores).some(function(v){ return v != null && v !== 0; }));
        if (prev._scoreLocked || !_npHasRealScore) {
          if (prev.scores && Object.keys(prev.scores).length) np.scores = prev.scores;
          if (prev.sf != null) np.sf = prev.sf;
          if (prev.dimScores && prev.dimScores.length) np.dimScores = prev.dimScores;
          if (prev._sfExcel != null) np._sfExcel = prev._sfExcel;
          if (prev._manualEval) np._manualEval = prev._manualEval;
          if (prev._fromExcel) np._fromExcel = prev._fromExcel;
          if (prev._scoreLocked) np._scoreLocked = true;
        }
        // Horas: si el origen no las trae, conservar las guardadas
        if ((np.horas == null || np.horas === 0) && prev.horas != null) np.horas = prev.horas;
        portfolioData[idx[k]] = np;   // sobrescribe el que coincide
        updated++;
      } else {
        // Desde ADO (allowAdd) SÍ se añaden los proyectos nuevos: ADO es la fuente
        // de verdad de qué proyectos existen. Desde Excel NO, para no resucitar
        // proyectos cerrados que ADO ya no devuelve.
        if (allowAdd) {
          portfolioData.push(np);
          idx[k] = portfolioData.length - 1;
          added++;
        } else {
          skipped++;
        }
      }
    });
    portfolioData.forEach(p=>{ if(p.horas===undefined) p.horas=null; });
    window._mergeStats = { updated: updated, added: added, skipped: skipped, kept: portfolioData.length - updated - added };
  } else {
    // ── REPLACE: reemplaza toda la cartera (carga desde ADO o Excel sin merge) ──
    portfolioData = incoming;
    portfolioData.forEach(p=>{ if(p.horas===undefined) p.horas=null; });
    window._mergeStats = null;
  }

  renderPortfolio(); renderPools();
  const el=document.getElementById('portfolio'); if(el) el.style.display='block';
  const cp=document.getElementById('charts-panel'); if(cp) cp.style.display='block';
  const bc=document.getElementById('btn-clear'); if(bc) bc.style.display='flex';
  const bt=document.getElementById('bulk-toolbar'); if(bt) bt.style.display='flex';
  try { renderCharts(); } catch(_) {}
  if (typeof renderDashboard === 'function') renderDashboard();
  // Refrescar En Marcha y planificación con las nuevas notas (reordena por score)
  // IMPORTANTE: limpiar locks/activos viejos para que la planificación se recalcule
  // LIMPIA por score (evita fechas congeladas de sesiones anteriores, p. ej. 2028).
  if (typeof clearPlanningLocks === 'function') { try { clearPlanningLocks(); } catch(_) {} }
  if (typeof renderSprintScreen === 'function') { try { renderSprintScreen(); } catch(_) {} }
  if (typeof renderPlanningSummary === 'function') { try { renderPlanningSummary(); } catch(_) {} }
  if (typeof renderCalendar === 'function') { try { renderCalendar(); } catch(_) {} }
  if (typeof renderDevAssignPanel === 'function') { try { renderDevAssignPanel(); } catch(_) {} }
  // Replanificar SIEMPRE tras cargar Excel: el nuevo orden por nota reordena las fechas de ejecución
  if (typeof replanAndNotify === 'function') { try { replanAndNotify(null, {fromExcel:true}); } catch(_) {} }
  if (typeof savePortfolio === 'function') {
    try {
      if (savePortfolio()) {
        setTimeout(function(){
          toast('💾 Guardado · ' + portfolioData.length + ' proyectos almacenados. No necesitarás recargar el Excel al volver.');
        }, 1200);
      }
    } catch(_) {}
  }
  if (typeof schedulePublish === 'function') { try { schedulePublish(); } catch(_) {} }

  if (window._mergeStats) {
    const m = window._mergeStats;
    toast('✓ Fusionado · '+m.updated+' actualizados'+(m.added?', '+m.added+' nuevos':'')+', '+m.kept+' conservados'
      + (m.skipped ? ' · '+m.skipped+' ignorados (no están en ADO, p. ej. cerrados)' : ''));
  } else {
    toast('✓ '+portfolioData.length+' proyectos cargados · exporta a Excel cuando quieras');
  }
}

/* One-time file input load */
function loadExcel(inp) {
  const file=inp.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      window._cfgFromImport = false;
      const projects=parseExcelBuffer(e.target.result);
      applyProjects(projects, file.name, true);  // Excel = merge (no borra los que no vienen)
      if (window._cfgFromImport) {
        toast('⚙ Configuración (pesos + boost) restaurada desde el Excel · notas recalculadas');
      }
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
    applyProjects(projects, file.name, true);  // Excel = merge
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
  // Si se clica la misma columna, invierte la dirección; si es otra, dirección por defecto
  if (window.portSort === by) {
    window.portSortDir = (window.portSortDir===undefined?1:window.portSortDir) * -1;
  } else {
    window.portSortDir = 1;
  }
  portSort=by;
  document.querySelectorAll('.sort-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  if(typeof updateSortIndicators==='function') updateSortIndicators();
  renderPortfolio();
}

// Sincroniza las flechas ▲▼ en las cabeceras de columna clicables
function updateSortIndicators() {
  document.querySelectorAll('th[data-sort]').forEach(function(th){
    const key = th.getAttribute('data-sort');
    const base = th.getAttribute('data-label') || th.textContent.replace(/[▲▼↕]/g,'').trim();
    th.setAttribute('data-label', base);
    if (key === window.portSort) {
      const arrow = (window.portSortDir===-1) ? ' ▲' : ' ▼';
      th.innerHTML = base + '<span style="font-size:9px;color:var(--d2)">'+arrow+'</span>';
      th.style.color = 'var(--d2)';
    } else {
      th.innerHTML = base + '<span style="font-size:8px;color:#BBB"> ↕</span>';
      th.style.color = '';
    }
  });
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
  // NO recalcular a ciegas: respetar los scores que vienen del Excel o de una copia
  // guardada. Solo se computan los proyectos que aún no tienen puntuación calculada.
  portfolioData = portfolioData.map(function(p){
    if (p && (p.sf !== undefined && p.sf !== null) && p.dimScores && p.dimScores.length) return p;
    return computeProj(p);
  });
  const _dir = (window.portSortDir===undefined?1:window.portSortDir);  // 1=desc, -1=asc
  const _num = (x)=> (x===null||x===undefined||isNaN(x)) ? -Infinity : +x;
  const sorted=[...portfolioData].sort((a,b)=>{
    let r=0;
    switch(portSort){
      case 'score': r = b.sf - a.sf; break;
      case 'base':  r = (b.sb||0) - (a.sb||0); break;
      case 'aging': r = (b.af||1) - (a.af||1); break;
      case 'horas': r = _num(b.horas) - _num(a.horas); break;
      case 'inicio': {
        const ad = (a.adoStartDate && String(a.adoStartDate).trim()!=='') ? new Date(a.adoStartDate).getTime() : Infinity;
        const bd = (b.adoStartDate && String(b.adoStartDate).trim()!=='') ? new Date(b.adoStartDate).getTime() : Infinity;
        r = ad - bd;  // los que tienen fecha (en curso) primero, por fecha ascendente
        break;
      }
      case 'area':  r = (a.area||'').localeCompare(b.area||''); break;
      case 'pool':  { const ord={S:0,M:1,L:2}; r = (ord[getPool(a)]??9) - (ord[getPool(b)]??9); break; }
      case 'clas':  r = (b.sf||0) - (a.sf||0); break;
      case 'd1': r=(b.dimScores?.[0]||0)-(a.dimScores?.[0]||0); break;
      case 'd2': r=(b.dimScores?.[1]||0)-(a.dimScores?.[1]||0); break;
      case 'd3': r=(b.dimScores?.[2]||0)-(a.dimScores?.[2]||0); break;
      case 'd4': r=(b.dimScores?.[3]||0)-(a.dimScores?.[3]||0); break;
      case 'd5': r=(b.dimScores?.[4]||0)-(a.dimScores?.[4]||0); break;
      case 'd6': r=(b.dimScores?.[5]||0)-(a.dimScores?.[5]||0); break;
      case 'reg':
        if(a.regDays===null&&b.regDays===null) r=0;
        else if(a.regDays===null) r=1;
        else if(b.regDays===null) r=-1;
        else r = a.regDays-b.regDays;
        break;
      case 'name': r = a.nom.localeCompare(b.nom); break;
      default: r = b.sf - a.sf;
    }
    // 'name','area' ordenan A→Z por defecto; 'reg' días ascendente; el resto descendente
    const naturalAsc = (portSort==='name'||portSort==='area'||portSort==='reg'||portSort==='inicio');
    return naturalAsc ? r * (_dir===-1 ? -1 : 1) : r * _dir;
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
    tr.style.cursor='pointer';
    tr.title='Clic para evaluación rápida';
    tr.addEventListener('click', function(ev){
      // No abrir si el clic fue en un control interactivo (checkbox, input horas, botones)
      if (ev.target.closest('input,button,a,select')) return;
      openProjectEdit(realIdx);
    });
    tr.innerHTML=`
      <td style="text-align:center;width:32px;">
        <input type="checkbox" style="width:13px;height:13px;accent-color:var(--d1);cursor:pointer"
          ${p._selected?'checked':''}
          onchange="toggleProjectSelect(${realIdx},this.checked)"
          onclick="event.stopPropagation()">
      </td>
      <td><span class="rank ${rank}">${idx+1}</span></td>
      <td style="font-weight:600;max-width:300px;min-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${p.nom}">${dvDot} ${p.nom}</td>
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
      <td style="text-align:center;white-space:nowrap;font-size:10px;">${
        (p.adoStartDate && String(p.adoStartDate).trim()!=='')
          ? `<span style="color:var(--d3);font-weight:700" title="En curso desde ${new Date(p.adoStartDate).toLocaleDateString('es-ES')}">🟢 ${new Date(p.adoStartDate).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'2-digit'})}</span>`
          : `<span style="color:#BBB">—</span>`
      }</td>
      <td style="text-align:center;">${renderPoolTag(pool)}</td>
      <td><button class="load-btn" onclick="loadIntoEval(${realIdx})">Evaluar →</button></td>
      <td style="text-align:center;white-space:nowrap">
        ${p.adoId ? `<button
          id="ado-write-btn-${p.adoId}"
          onclick="event.stopPropagation();adoSyncProject('${p.nom.replace(/'/g,'\\')}')"
          title="Guardar Score ${p.sf.toFixed(2)} en ADO\nCampo: ${p.adoType==='Task'?'MPGTaskScore':'MPGScore'}\nWork Item: ${p.adoId}"
          style="padding:3px 9px;font-size:9px;font-weight:700;border-radius:5px;cursor:pointer;
            border:1px solid ${p._adoSynced?'#087B50':'rgba(24,72,160,.4)'};
            background:${p._adoSynced?'#ECF8F3':'rgba(24,72,160,.07)'};
            color:${p._adoSynced?'#087B50':'#1848A0'};
            transition:all .15s"
          onmouseover="this.style.background='#1848A0';this.style.color='#fff';this.style.borderColor='#1848A0'"
          onmouseout="this.style.background='${p._adoSynced?'#ECF8F3':'rgba(24,72,160,.07)'  }';this.style.color='${p._adoSynced?'#087B50':'#1848A0'}';this.style.borderColor='${p._adoSynced?'#087B50':'rgba(24,72,160,.4)'}'"
          >${p._adoSynced ? '✓ ADO' : '↑ ADO'}</button>`
         : '<span style="font-size:9px;color:#CCC">sin ADO</span>'}
      </td>
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

  if(typeof updateSortIndicators==='function') updateSortIndicators();
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
  // Navigate to the WIZARD (step-0) — that's where the criterion sliders live
  if(typeof goStep==='function') goStep(0);
  setTimeout(function(){
    document.getElementById('f-name').value=p.nom;
    var descEl=document.getElementById('f-desc'); if(descEl) descEl.value = p.adoDesc || p.descripcion || '';
    if(p.reqDate)document.getElementById('f-req').value=p.reqDate;
    if(p.regDate)document.getElementById('f-reg').value=p.regDate;
    const areaEl=document.getElementById('f-area');
    if(areaEl && p.area){
      let matched=false;
      for(let i=0;i<areaEl.options.length;i++){
        if(areaEl.options[i].value===p.area){areaEl.selectedIndex=i;matched=true;break;}
      }
      if(!matched){
        for(let i=0;i<areaEl.options.length;i++){
          if(areaEl.options[i].value.includes(p.area)||p.area.includes(areaEl.options[i].value)){
            areaEl.selectedIndex=i;break;
          }
        }
      }
    }
    DIMS.forEach(d=>d.criterios.forEach(c=>{
      const v=p.scores[c.id]||5; c.val=v;
      const sl=document.getElementById('sl-'+c.id);if(sl)sl.value=v;
      const cv=document.getElementById('cv-'+c.id);if(cv){cv.textContent=v;cv.style.color=scColorHex(v);}
      const cb=document.getElementById('cb-'+c.id);if(cb)cb.textContent='boost: '+sigmoidBoost(v,c.C0,c.B0,c.A0,c.C,c.B,c.A).toFixed(2)+'×';
      const bp=document.getElementById('bp-'+c.id);if(bp)bp.innerHTML=boostPreview(c);
    }));
    upd();
    // Re-eval banner inside the wizard: save + back actions, always visible context
    const notice=document.getElementById('reeval-notice');
    if(notice){
      notice.style.display='flex';
      notice.innerHTML=
        '<span style="font-size:14px">↺</span>'
        +'<div style="flex:1;min-width:200px">'
          +'<b>Re-evaluando:</b> '+p.nom.substring(0,55)
          +' <span style="color:#888">· score actual '+(p.sf||0).toFixed(2)+'</span>'
        +'</div>'
        +'<button onclick="saveManualToPortfolio();document.getElementById(\'reeval-notice\').style.display=\'none\';goStep(\'eval\')" '
          +'style="padding:7px 14px;font-size:10px;font-weight:700;border-radius:7px;border:none;'
          +'background:#087B50;color:#fff;cursor:pointer">✓ Guardar y volver</button>'
        +'<button onclick="document.getElementById(\'reeval-notice\').style.display=\'none\';goStep(\'eval\')" '
          +'style="padding:7px 12px;font-size:10px;font-weight:600;border-radius:7px;'
          +'border:1.5px solid #DEDEDE;background:#fff;color:#666;cursor:pointer">Cancelar</button>';
    }
    if(typeof renderBenchmark==='function') renderBenchmark(p);
    toast('"'+p.nom.substring(0,30)+'" cargado · ajusta los sliders y pulsa Guardar');
  }, 150);
}

function renderEvalProjectBanner(p) {
  const banner=document.getElementById('eval-project-banner');
  if(!banner) return;
  if(!p){banner.style.display='none';return;}
  const pool=typeof getPool==='function'?getPool(p):'';
  const poolColors={S:'#C07800',M:'#1848A0',L:'#087B50'};
  const col=poolColors[pool]||'#888';
  banner.style.display='block';
  banner.innerHTML=
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
    +'<div style="display:flex;align-items:center;gap:10px">'
      +'<div style="width:8px;height:40px;border-radius:3px;background:'+col+'"></div>'
      +'<div>'
        +'<div style="font-size:11px;font-weight:700;color:#111">'+p.nom.substring(0,60)+'</div>'
        +'<div style="font-size:9px;color:#888;margin-top:2px">'
          +(p.area||'Sin área')+' · '+(p.adoType||'Manual')+' · '+(p.adoId?'ADO #'+p.adoId:'sin ID')
        +'</div>'
      +'</div>'
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:8px">'
      +'<div style="text-align:center;padding:6px 12px;background:#F7F7F5;border-radius:6px">'
        +'<div style="font-size:16px;font-weight:800;color:'+(typeof scColorHex==="function"?scColorHex(p.sf||0):"#111")+'">'+( p.sf||0).toFixed(2)+'</div>'
        +'<div style="font-size:8px;color:#AAA;text-transform:uppercase">Score actual</div>'
      +'</div>'
      +'<button onclick="saveManualToPortfolio();renderEvalProjectBanner(null)" '
        +'style="padding:8px 16px;font-size:10px;font-weight:700;border-radius:7px;'
        +'border:none;background:#087B50;color:#fff;cursor:pointer">'
        +'✓ Guardar evaluación'
      +'</button>'
      +(p.adoId?('<span style="display:inline-block">'+'<button id="eval-banner-ado-btn" style="padding:8px 12px;font-size:10px;font-weight:700;border-radius:7px;border:1.5px solid #1848A0;background:#EEF3FC;color:#1848A0;cursor:pointer">↑ ADO</button></span>')  :'')




    +'</div>'
    +'</div>';
  // Wire ADO button onclick (can't use inline quotes safely)
  if(p.adoId){
    const adoBtn=document.getElementById('eval-banner-ado-btn');
    if(adoBtn){ const _nom=p.nom; adoBtn.onclick=function(){ adoSyncProject(_nom); }; }
  }
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
      <div id="dim-ov-${di+1}" class="dim-overview-bar"></div>
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

function updateDimOverview() {
  const COLORS = ['#CC1F26','#C4974A','#087B50','#C07800','#1848A0','#5C6570'];
  const BGS    = ['#FEF0F1','#FAF6EC','#ECF8F3','#FAF5E6','#EEF3FC','#F4F5F6'];
  DIMS.forEach((d, di) => {
    const el = document.getElementById('dim-ov-' + (di+1));
    if (!el) return;
    const ds = scoreDim(d.criterios.map(c => ({...c, val: c.val || 5}))).toFixed(1);
    el.innerHTML = DIMS.map((dd, ddi) => {
      const ddScore = scoreDim(dd.criterios.map(c => ({...c, val: c.val || 5}))).toFixed(1);
      const isActive = ddi === di;
      return '<span style="display:inline-flex;flex-direction:column;align-items:center;'
        + 'padding:3px 8px;border-radius:6px;font-size:8px;font-weight:700;'
        + 'background:' + (isActive ? COLORS[ddi] : BGS[ddi]) + ';'
        + 'color:' + (isActive ? '#fff' : COLORS[ddi]) + ';'
        + 'border:1px solid ' + (isActive ? COLORS[ddi] : 'transparent') + ';'
        + 'min-width:36px;text-align:center;gap:1px" title="' + dd.nom + '">'
        + '<span>' + dd.id + '</span>'
        + '<span style="font-size:10px">' + ddScore + '</span>'
        + '</span>';
    }).join('');
  });
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
          r:Math.max(5,p.dimScores[1]*2.5),nom:p.nom,score:p.sf,area:p.area||''})),
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
        plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>top[items[0].dataIndex].nom,label:d=>`Score: ${d.raw} — ${clsf(d.raw).et}`}}},
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
        data:portfolioData.map(p=>({x:+p.dimScores[4].toFixed(2),y:+p.dimScores[2].toFixed(2),r:Math.max(5,p.dimScores[0]*2),nom:p.nom,score:p.sf})),
        backgroundColor:portfolioData.map(p=>CLS_BG[clsf(p.sf).et]||'rgba(196,151,74,.7)'),
        borderColor:'rgba(255,255,255,.5)',borderWidth:1.5}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:d=>[d.raw.nom,'D5: '+d.raw.x+' · D3: '+d.raw.y,'Score: '+d.raw.score.toFixed(2)]}}},
        scales:{x:{title:{display:true,text:'D5 — Facilidad de implantación →',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}},
                y:{title:{display:true,text:'D3 — Valor de negocio ↑',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}}}}});
  } else if (curChart2==='heat') {
    chart2Inst.heat = new Chart(canvas, {type:'bubble',
      data:{datasets:[{label:'Proyectos',
        data:portfolioData.map(p=>({x:+p.dimScores[0].toFixed(2),y:+p.dimScores[1].toFixed(2),r:Math.max(5,p.sf*1.5),nom:p.nom,score:p.sf})),
        backgroundColor:portfolioData.map(p=>CLS_BG[clsf(p.sf).et]||'rgba(196,151,74,.7)'),
        borderColor:'rgba(255,255,255,.4)',borderWidth:1}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:d=>[d.raw.nom,'D1: '+d.raw.x+' · D2: '+d.raw.y,'Score: '+d.raw.score.toFixed(2)]}}},
        scales:{x:{title:{display:true,text:'D1 — Compliance / Riesgo →',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}},
                y:{title:{display:true,text:'D2 — Prioridad Estratégica ↑',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}}}}});
  } else if (curChart2==='quad') {
    chart2Inst.quad = new Chart(canvas, {type:'bubble',
      data:{datasets:[{label:'Proyectos',
        data:portfolioData.map(p=>({x:+p.dimScores[2].toFixed(2),y:+p.dimScores[1].toFixed(2),r:Math.max(5,p.dimScores[0]*1.8),nom:p.nom,score:p.sf})),
        backgroundColor:portfolioData.map(p=>CLS_BG[clsf(p.sf).et]||'rgba(196,151,74,.7)'),
        borderColor:'rgba(255,255,255,.4)',borderWidth:1.5}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:d=>[d.raw.nom,'D3: '+d.raw.x+' · D2: '+d.raw.y,'Score: '+d.raw.score.toFixed(2)]}}},
        scales:{x:{title:{display:true,text:'D3 — ROI / Valor →',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}},
                y:{title:{display:true,text:'D2 — Urgencia Estratégica ↑',font:FONT,color:'#888'},min:0,max:10,ticks:{font:FONT},grid:{color:'rgba(0,0,0,.04)'}}}}});
  }

  // Gráficas comparativas avanzadas (radar, áreas, distribución, varianza, aging, correlación)
  if (typeof renderAnalyticsCharts === 'function') { try { renderAnalyticsCharts(); } catch(e){ console.error('analytics',e); } }
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
          <div style="display:flex;gap:4px;opacity:0;transition:opacity .15s;flex-shrink:0"
            onmouseenter="this.style.opacity='1'"
            onmouseleave="this.style.opacity='0'"
            onclick="event.stopPropagation()">
            <button onclick="event.stopPropagation();reEvalProject(${idx})"
              title="Reevaluar este proyecto"
              style="padding:4px 8px;background:#EEF3FC;border:1px solid #1848A0;
                     border-radius:4px;color:#1848A0;font-size:9px;font-weight:600;cursor:pointer;
                     transition:all .15s"
              onmouseover="this.style.background='#1848A0';this.style.color='#fff'"
              onmouseout="this.style.background='#EEF3FC';this.style.color='#1848A0'">
              ↺ Reevaluar
            </button>
            <button onclick="event.stopPropagation();dvDeleteOne(${idx})"
              title="Eliminar proyecto"
              style="padding:4px 8px;background:none;border:1px solid var(--d1);
                     border-radius:4px;color:var(--d1);font-size:9px;cursor:pointer">
              ✕
            </button>
          </div>`;
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

  updateDimOverview();
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
function goLanding() {
  const landing = document.getElementById('landing');
  landing.style.display = 'flex';
  landing.style.transition = 'none';   // reset fade-out transition from doLogin
  landing.style.opacity = '1';         // FIX: doLogin left opacity:0 -> white screen
  document.getElementById('shell').style.display = 'none';
  document.getElementById('bar').style.display = 'none';
  // Re-init particle canvas (it may have been sized while hidden)
  if (typeof initLandingCanvas === 'function') setTimeout(initLandingCanvas, 50);
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
    'ID ADO', 'Nombre', 'Área', 'Sponsor', 'Descripción', 'Fecha solicitud', 'Horas estimadas',
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
    (p.descripcion || p.adoDesc || '').toString().replace(/\s+/g,' ').trim(),
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

  _appendConfigSheets(wb);  // la config viaja con la cartera
  XLSX.writeFile(wb, `mesoestetic_scoring_${new Date().toISOString().split('T')[0]}.xlsx`);
  toast(`✓ ${portfolioData.length} proyectos exportados`);
}

function exportCarteraConPlanning() {
  // Export cartera in EXACT same import format + planning dates columns
  if (!portfolioData.length) { toast('Sin proyectos para exportar'); return; }

  const wb = XLSX.utils.book_new();

  // Build planning timeline for dates
  const timeline = typeof planBuildTimeline === 'function' ? planBuildTimeline() : [];
  const tlMap = {};
  timeline.forEach(t => { tlMap[t.proj.nom] = t; });

  // Same headers as import format + 3 extra planning cols at end
  const headers = [
    'ID ADO', 'Nombre', 'Área', 'Sponsor', 'Fecha solicitud', 'Horas estimadas',
    'Score final', 'Score base', 'Aging factor',
    'D1 Compliance', 'D2 Estratégico', 'D3 ROI', 'D4 Técnica', 'D5 Implantación', 'D6 Personas',
    'Clasificación', 'Pool', 'Auto-prioritario',
    ...CRIT_IDS.map(id => {
      const dim = DIMS.find(d => d.criterios.some(c => c.id === id));
      const crit = dim?.criterios.find(c => c.id === id);
      return crit?.nom || id;
    }),
    // Planning columns appended at end
    '— Dev asignado', '— Inicio planificado', '— Fin planificado', '— Pool planning'
  ];

  const fmtD = d => d ? new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'}) : '';

  const rows = portfolioData.map(p => {
    const t = tlMap[p.nom];
    return [
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
      getPool(p) || '',
      p.autoP ? 'Sí' : 'No',
      ...CRIT_IDS.map(id => Math.round(p.scores?.[id] ?? 5)),
      // Planning data
      t ? t.devName : '',
      t ? fmtD(t.startDate) : '',
      t ? fmtD(t.endDate)   : '',
      t ? t.pool            : ''
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Column widths — same as import + extra cols
  ws['!cols'] = headers.map((h, i) => ({
    wch: i < 6 ? 18 : i < 9 ? 10 : i < 15 ? 12 : i >= headers.length-4 ? 18 : 14
  }));

  // Header row style
  const nH = headers.length;
  for (let c = 0; c < nH; c++) {
    const addr = XLSX.utils.encode_cell({r:0, c});
    if (!ws[addr]) ws[addr] = {v:'', t:'s'};
    const isPlanning = c >= nH - 4;
    ws[addr].s = {
      fill: {fgColor:{rgb: isPlanning ? '1848A0' : '111111'}, patternType:'solid'},
      font: {color:{rgb:'FFFFFF'}, bold:true, sz:9},
      alignment: {horizontal:'center', vertical:'center', wrapText:false}
    };
  }

  // Data rows: alternate shading + pool color on Pool column
  const POOL_COL_IDX = headers.indexOf('Pool');
  const POOL_BG = {S:'FAF5E6', M:'EEF3FC', L:'ECF8F3'};
  const POOL_FG = {S:'C07800', M:'1848A0', L:'087B50'};

  rows.forEach((row, ri) => {
    const pool = row[POOL_COL_IDX] || '';
    const bg   = ri % 2 === 0 ? 'FFFFFF' : 'F9F9F9';
    row.forEach((_, ci) => {
      const addr = XLSX.utils.encode_cell({r: ri+1, c: ci});
      if (!ws[addr]) ws[addr] = {v:'', t:'s'};
      const isPool    = ci === POOL_COL_IDX;
      const isName    = ci === 1;
      const isPlan    = ci >= nH - 4;
      ws[addr].s = {
        fill: {fgColor:{rgb: isPool ? (POOL_BG[pool]||'FFFFFF') : (isPlan ? 'EEF3FC' : bg)}, patternType:'solid'},
        font: {
          bold: isName || isPool,
          sz:   9,
          color:{rgb: isPool ? (POOL_FG[pool]||'333333') : (isPlan ? '1848A0' : '333333')}
        },
        alignment: {horizontal: ci < 2 || ci >= 6 ? 'left' : 'center', vertical:'center'},
        border: {
          right:  {style:'thin', color:{rgb:'E8E8E8'}},
          bottom: {style:'thin', color:{rgb:'E8E8E8'}}
        }
      };
    });
  });

  XLSX.utils.book_append_sheet(wb, ws, '📊 Cartera');

  const fname = `nexus_cartera_${new Date().toISOString().split('T')[0]}.xlsx`;
  _appendConfigSheets(wb);  // la config viaja con la cartera
  XLSX.writeFile(wb, fname);
  toast(`✓ Cartera exportada · ${portfolioData.length} proyectos · formato importación`);
}


/* ═══════════════════════════════════════════════════════════════
   EXPORT CARTERA EN FORMATO PLANTILLA (idéntico al Excel de carga)
   Descarga la plantilla, inyecta los datos de portfolioData,
   ajusta la fórmula de Aging por proyecto y genera el Excel.
   ═══════════════════════════════════════════════════════════════ */
function exportCarteraPlantilla() {
  if (!portfolioData || !portfolioData.length) {
    toast('Sin proyectos para exportar'); return;
  }

  toast('⏳ Preparando Excel…');

  // Fetch the template xlsx from same origin
  fetch('./plantilla_carga.xlsx')
    .then(function(res) {
      if (!res.ok) throw new Error('No se encontró la plantilla (plantilla_carga.xlsx)');
      return res.arrayBuffer();
    })
    .then(function(buffer) {
      var wb = XLSX.read(buffer, {type:'array', cellFormula:true, cellDates:true, bookVBA:false});
      var ws = wb.Sheets['📊 Cartera'];
      if (!ws) throw new Error('Hoja "📊 Cartera" no encontrada en plantilla');

      // Sort projects by score desc (same order as app)
      var sorted = portfolioData.slice().sort(function(a,b){
        return (b.sf||0) - (a.sf||0);
      });

      // Column mapping (1-indexed = col numbers in spreadsheet):
      // A=1  B=2  C=3  D=4  E=5  F=6  G=7  H=8  I=9  J=10  K=11
      // L=12  M=13  N=14  O=15  P=16  Q=17  R=18  S=19  T=20  U=21
      // V=22  W=23  X=24  Y=25  Z=26  AA=27  AB=28  AM=39  AN=40

      // Criterion order mapping: scores object keys → column positions
      // F=R.legal  G=PRL  H=Reput.  I=Reg.  J=Consejo  K=Int.
      // L=I+D  M=Urg.  N=Ingr.  O=Ahorro  P=ROI  Q=Cal.
      // R=TRL  S=Integr.  T=Esc.  U=GDPR  V=Cap.IT  W=Cambio
      // X=TtV  Y=Emp.  Z=ESG  AA=Form.  AB=D1_score(manual in some rows)
      // The criterion IDs in app match the column letter positions
      var CRIT_COL = {}; // map crit_id → col letter
      // Build from CRIT_IDS array (defined globally in scoring.js)
      var letters = ['F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA'];
      if (typeof CRIT_IDS !== 'undefined') {
        CRIT_IDS.forEach(function(id, i) { if (letters[i]) CRIT_COL[id] = letters[i]; });
      }

      function setCell(colLetter, row, value, formula) {
        var addr = colLetter + row;
        if (!ws[addr]) ws[addr] = {};
        if (formula) {
          ws[addr].t = 'n'; ws[addr].f = formula; delete ws[addr].v;
        } else {
          ws[addr].v = value;
          ws[addr].t = (value === null || value === undefined || value === '') ? 's'
            : typeof value === 'number' ? 'n' : 's';
          delete ws[addr].f;
        }
      }

      sorted.forEach(function(p, i) {
        var row = 6 + i;

        // Parse reqDate → year, month, day for Aging formula
        var reqDate = String(p.reqDate || '');
        var y = 2025, mo = 1, da = 1;
        // Formats: DD/MM/YYYY or YYYY-MM-DD
        var mDate = reqDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        var mDate2 = reqDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (mDate)  { da=parseInt(mDate[1]); mo=parseInt(mDate[2]); y=parseInt(mDate[3]); }
        if (mDate2) { y=parseInt(mDate2[1]); mo=parseInt(mDate2[2]); da=parseInt(mDate2[3]); }

        // A: row number
        setCell('A', row, i+1);
        // B: name
        setCell('B', row, p.nom || '');
        // C: area
        setCell('C', row, p.area || '');
        // D: sponsor
        setCell('D', row, p.sponsor || '');
        // E: reqDate
        setCell('E', row, reqDate);

        // Criteria scores: F through AA (columns 6-27)
        var crit_scores = CRIT_IDS || [];
        crit_scores.forEach(function(id, ci) {
          var letter = letters[ci];
          if (!letter) return;
          var val = Math.round(p.scores && p.scores[id] !== undefined ? p.scores[id] : 5);
          setCell(letter, row, val);
        });

        // AM: horas
        setCell('AM', row, p.horas || '');

        // Formula columns: AB-AK, AN
        // These use the template formulas adapted for the current row
        // Adapt them from row 6 formula by replacing row number
        var formulaCols = ['AB','AC','AD','AE','AF','AG','AH','AJ','AK','AL','AN'];
        formulaCols.forEach(function(col) {
          var templateAddr = col + '6';
          var templateCell = ws[templateAddr];
          if (templateCell && templateCell.f) {
            // Replace row references: number after letter(s) = 6 → row
            var newFormula = templateCell.f.replace(
              /([A-Z]{1,2})6\b/g,
              function(match, colRef) { return colRef + row; }
            );
            setCell(col, row, null, newFormula);
          }
        });

        // AI: Aging formula with correct DATE for this project
        var agingFormula = "=MIN(1+MAX(0,TODAY()-DATE("+y+","+mo+","+da+"))/365*'⚙ Parámetros'!B33,'⚙ Parámetros'!B34)";
        setCell('AI', row, null, agingFormula);
      });

      // Update sheet range
      var lastRow = 5 + sorted.length;
      var origRef = ws['!ref'] || 'A1:AN199';
      ws['!ref'] = 'A1:AN' + Math.max(lastRow, 199);

      // Write and download
      var date = new Date().toISOString().split('T')[0];
      _appendConfigSheets(wb);  // la config viaja con la cartera
  XLSX.writeFile(wb, 'nexus_cartera_' + date + '.xlsx');
      toast('✓ Cartera exportada · ' + sorted.length + ' proyectos · formato plantilla con fórmulas');
    })
    .catch(function(err) {
      console.error('Export error:', err);
      toast('✗ Error exportando: ' + err.message + '. Asegúrate de que plantilla_carga.xlsx está en el servidor.');
    });
}


function autoDetectArea(name) {
  var area = typeof mpgDecodeArea === 'function' ? mpgDecodeArea(name) : null;
  if (!area) return;
  var sel = document.getElementById('f-area');
  if (!sel) return;
  // Set select to matching option
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === area) {
      sel.selectedIndex = i;
      break;
    }
  }
}


/* ═══════════════════════════════════════════════════════════════
   EVAL SCREEN — project selector + pending list
   ═══════════════════════════════════════════════════════════════ */

function renderEvalScreen() {
  // Populate project selector
  const sel = document.getElementById('eval-project-select');
  if (sel) {
    const current = sel.value;
    sel.innerHTML = '<option value="">— Selecciona un proyecto de la cartera —</option>';
    // Sort by score desc
    const sorted = portfolioData.slice().sort(function(a,b){ return (b.sf||0)-(a.sf||0); });
    sorted.forEach(function(p, i) {
      const realIdx = portfolioData.indexOf(p);
      const pool    = typeof getPool === 'function' ? getPool(p) : '';
      const poolLbl = {S:'⚡ Corto',M:'◉ Medio',L:'▣ Largo'}[pool] || '';
      const synced  = p._adoSynced ? ' ✓ADO' : '';
      const opt     = document.createElement('option');
      opt.value     = realIdx;
      opt.textContent = (p.sf||0).toFixed(1) + ' · ' + p.nom.substring(0,50)
        + (p.area ? ' ['+p.area+']' : '') + (poolLbl ? ' '+poolLbl : '') + synced;
      if (String(realIdx) === current) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // Pending list: projects with score = 0 or all criteria at default (5)
  const pendingEl = document.getElementById('eval-pending-list');
  if (pendingEl) {
    const pending = portfolioData.filter(function(p){
      return !p.sf || p.sf < 1 ||
        (p.scores && CRIT_IDS.every(function(cid){ return (p.scores[cid]||5) === 5; }));
    });
    if (!pending.length) {
      pendingEl.innerHTML = '<span style="color:#087B50">✓ Todos los proyectos evaluados</span>';
    } else {
      pendingEl.innerHTML = '<span style="color:#C07800">⚠ '+ pending.length +' proyectos sin evaluar — haz clic para evaluar</span>: '
        + pending.slice(0,5).map(function(p){
            const ri = portfolioData.indexOf(p);
            return '<a href="#" onclick="event.preventDefault();evalSelectProject('+ri+')" '
              +'style="color:#1848A0;margin-left:6px">'+p.nom.substring(0,25)+'</a>';
          }).join(', ')
        + (pending.length > 5 ? ' y ' + (pending.length-5) + ' más…' : '');
    }
  }
}

function evalSelectProject(idxStr) {
  const idx = parseInt(idxStr);
  if (isNaN(idx) || idx < 0 || idx >= portfolioData.length) return;
  // Update selector UI
  const sel = document.getElementById('eval-project-select');
  if (sel) sel.value = idx;
  // Load into eval wizard (step-0)
  loadIntoEval(idx);
}

/* ═══════════════════════════════════════════════════════════════
   ANALÍTICA AVANZADA — gráficas comparativas con Chart.js
   Tooltips con NOMBRE COMPLETO · radar dimensional · barras por área ·
   doughnut distribución · varianza por criterio · scatter aging ·
   matriz de correlación entre dimensiones
   ═══════════════════════════════════════════════════════════════ */
var _anaCharts = {};
function _anaDestroy(id){ if(_anaCharts[id]){ _anaCharts[id].destroy(); delete _anaCharts[id]; } }
  // nombre COMPLETO para tooltips

// Tooltip común que muestra el nombre completo + multilínea
function _anaTooltip(extraLines){
  return {
    enabled:true,
    backgroundColor:'rgba(22,36,62,.96)',
    titleColor:'#fff', bodyColor:'#D8E0F0',
    titleFont:{size:11,weight:'700'}, bodyFont:{size:10},
    padding:10, cornerRadius:8, displayColors:false,
    callbacks: extraLines
  };
}

function renderAnalyticsCharts() {
  if (typeof Chart === 'undefined' || !portfolioData || !portfolioData.length) return;
  const DNAMES = ['D1 Compliance','D2 Estrategia','D3 ROI','D4 Técnica','D5 Implant.','D6 Personas'];
  const DCOLS  = ['#CC1F26','#C4974A','#087B50','#C07800','#1848A0','#5C6570'];

  // ── 1. RADAR dimensional: media cartera vs top-5 vs bottom-5 ──
  const radarEl = document.getElementById('cv-dims-radar');
  if (radarEl) {
    _anaDestroy('dims');
    const avgDim = i => portfolioData.reduce((s,p)=>s+((p.dimScores&&p.dimScores[i])||0),0)/portfolioData.length;
    const sorted = portfolioData.slice().sort((a,b)=>(b.sf||0)-(a.sf||0));
    const top = sorted.slice(0,5), bot = sorted.slice(-5);
    const avgOf = (arr,i)=>arr.reduce((s,p)=>s+((p.dimScores&&p.dimScores[i])||0),0)/(arr.length||1);
    _anaCharts.dims = new Chart(radarEl,{
      type:'radar',
      data:{ labels:DNAMES, datasets:[
        {label:'Media cartera', data:[0,1,2,3,4,5].map(avgDim),
          borderColor:'#1848A0', backgroundColor:'rgba(24,72,160,.12)', borderWidth:2, pointRadius:3},
        {label:'Top 5', data:[0,1,2,3,4,5].map(i=>avgOf(top,i)),
          borderColor:'#087B50', backgroundColor:'rgba(8,123,80,.08)', borderWidth:2, pointRadius:3},
        {label:'Bottom 5', data:[0,1,2,3,4,5].map(i=>avgOf(bot,i)),
          borderColor:'#CC1F26', backgroundColor:'rgba(204,31,38,.06)', borderWidth:2, pointRadius:3, borderDash:[4,3]},
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{position:'bottom',labels:{font:{size:10},boxWidth:12,padding:12}},
          tooltip:_anaTooltip({label:c=>c.dataset.label+': '+c.formattedValue}) },
        scales:{ r:{ min:0,max:10,ticks:{stepSize:2,font:{size:8},backdropColor:'transparent'},
          grid:{color:'rgba(120,150,200,.18)'}, pointLabels:{font:{size:9,weight:'600'}} } } }
    });
  }

  // ── 2. BARRAS por área × dimensión (apiladas) ──
  const areasEl = document.getElementById('cv-areas-bars');
  if (areasEl) {
    _anaDestroy('areas');
    const byArea = {};
    portfolioData.forEach(p=>{ const a=p.area||'Otros'; (byArea[a]=byArea[a]||[]).push(p); });
    const areaNames = Object.keys(byArea).sort((a,b)=>byArea[b].length-byArea[a].length).slice(0,8);
    const ds = [0,1,2,3,4,5].map(i=>({
      label:DNAMES[i], backgroundColor:DCOLS[i], borderRadius:3,
      data:areaNames.map(a=>{
        const arr=byArea[a]; return +(arr.reduce((s,p)=>s+((p.dimScores&&p.dimScores[i])||0)*[0.30,0.20,0.20,0.12,0.10,0.08][i],0)/arr.length).toFixed(2);
      })
    }));
    _anaCharts.areas = new Chart(areasEl,{
      type:'bar',
      data:{ labels:areaNames.map(a=>a.length>16?a.substring(0,15)+'…':a), datasets:ds },
      options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y',
        plugins:{ legend:{position:'bottom',labels:{font:{size:9},boxWidth:10,padding:8}},
          tooltip:_anaTooltip({
            title:items=>areaNames[items[0].dataIndex],
            label:c=>c.dataset.label+': '+c.formattedValue+' pts ponderados'}) },
        scales:{ x:{stacked:true,grid:{color:'rgba(120,150,200,.12)'},ticks:{font:{size:9}}},
                 y:{stacked:true,grid:{display:false},ticks:{font:{size:9,weight:'600'}}} } }
    });
  }

  // ── 3. DOUGHNUT distribución por clasificación ──
  const distEl = document.getElementById('cv-dist-pie');
  if (distEl) {
    _anaDestroy('dist');
    const buckets={};
    portfolioData.forEach(p=>{ const cl=clsf(p.sf||0).et||'—'; buckets[cl]=(buckets[cl]||0)+1; });
    const labels=Object.keys(buckets);
    const CLR={'PRIORITARIO ESTRATÉGICO (D1)':'#CC1F26','PRIORITARIO ESTRATÉGICO':'#0A5228',
      'ALTA PRIORIDAD':'#1848A0','PRIORIDAD MEDIA':'#C07800','PRIORIDAD BAJA':'#5C6570','DESCARTABLE':'#AAB'};
    _anaCharts.dist = new Chart(distEl,{
      type:'doughnut',
      data:{ labels, datasets:[{ data:labels.map(l=>buckets[l]),
        backgroundColor:labels.map(l=>CLR[l]||'#999'), borderWidth:2, borderColor:'#fff' }]},
      options:{ responsive:true, maintainAspectRatio:false, cutout:'58%',
        plugins:{ legend:{position:'right',labels:{font:{size:10},boxWidth:12,padding:10}},
          tooltip:_anaTooltip({label:c=>c.label+': '+c.parsed+' proyectos ('+Math.round(c.parsed/portfolioData.length*100)+'%)'}) } }
    });
  }

  // ── 4. VARIANZA por criterio (barras) ──
  const gapsEl = document.getElementById('cv-gaps-bars');
  if (gapsEl && typeof CRIT_IDS!=='undefined') {
    _anaDestroy('gaps');
    const stats = CRIT_IDS.map(cid=>{
      const vals=portfolioData.map(p=>(p.scores&&p.scores[cid])||5);
      const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
      const variance=vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length;
      let nom=cid; DIMS.forEach(d=>d.criterios.forEach(c=>{if(c.id===cid)nom=c.nom;}));
      return {cid,nom,variance:+variance.toFixed(2),mean:+mean.toFixed(1)};
    }).sort((a,b)=>b.variance-a.variance).slice(0,12);
    _anaCharts.gaps = new Chart(gapsEl,{
      type:'bar',
      data:{ labels:stats.map(s=>s.nom.length>20?s.nom.substring(0,19)+'…':s.nom),
        datasets:[{ data:stats.map(s=>s.variance), borderRadius:4,
          backgroundColor:stats.map(s=>s.variance>4?'#CC1F26':s.variance>2?'#C07800':'#087B50') }]},
      options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y',
        plugins:{ legend:{display:false},
          tooltip:_anaTooltip({ title:items=>stats[items[0].dataIndex].nom,
            label:c=>'Varianza: '+c.formattedValue+' · media: '+stats[c.dataIndex].mean }) },
        scales:{ x:{grid:{color:'rgba(120,150,200,.12)'},ticks:{font:{size:9}}},
                 y:{grid:{display:false},ticks:{font:{size:9}}} } }
    });
  }

  // ── 5. SCATTER aging: antigüedad (x) × score final (y) ──
  const agingEl = document.getElementById('cv-aging-scatter');
  if (agingEl) {
    _anaDestroy('aging');
    const pts = portfolioData.map(p=>{
      const days = p.reqDate ? Math.max(0,(Date.now()-new Date(p.reqDate))/86400000) : 0;
      return { x:+(days/30).toFixed(1), y:+(p.sf||0).toFixed(2), nom:p.nom, af:p.af||1, area:p.area||'' };
    });
    _anaCharts.aging = new Chart(agingEl,{
      type:'scatter',
      data:{ datasets:[{ data:pts,
        backgroundColor:pts.map(pt=>pt.af>1.1?'#CC1F26':pt.af>1.02?'#C07800':'#1848A0'),
        pointRadius:6, pointHoverRadius:9 }]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false},
          tooltip:_anaTooltip({
            title:items=>pts[items[0].dataIndex].nom,
            label:c=>['Score: '+pts[c.dataIndex].y, 'Antigüedad: '+pts[c.dataIndex].x+' meses',
                      'Aging: ×'+pts[c.dataIndex].af.toFixed(2), pts[c.dataIndex].area] }) },
        scales:{ x:{title:{display:true,text:'Antigüedad (meses)',font:{size:9}},grid:{color:'rgba(120,150,200,.12)'},ticks:{font:{size:9}}},
                 y:{title:{display:true,text:'Score final',font:{size:9}},min:0,max:10,grid:{color:'rgba(120,150,200,.12)'},ticks:{font:{size:9}}} } }
    });
  }

  // ── 6. MATRIZ DE CORRELACIÓN entre dimensiones ──
  const corrEl = document.getElementById('cv-corr-matrix');
  if (corrEl) {
    _anaDestroy('corr');
    const dimVals = i => portfolioData.map(p=>(p.dimScores&&p.dimScores[i])||0);
    const pearson = (a,b)=>{
      const n=a.length, ma=a.reduce((x,y)=>x+y,0)/n, mb=b.reduce((x,y)=>x+y,0)/n;
      let num=0,da=0,db=0;
      for(let i=0;i<n;i++){ num+=(a[i]-ma)*(b[i]-mb); da+=(a[i]-ma)**2; db+=(b[i]-mb)**2; }
      return (da&&db)? num/Math.sqrt(da*db) : 0;
    };
    const cells=[];
    for(let i=0;i<6;i++) for(let j=0;j<6;j++){
      const r = i===j?1:pearson(dimVals(i),dimVals(j));
      cells.push({x:j,y:5-i,v:+r.toFixed(2),di:i,dj:j});
    }
    _anaCharts.corr = new Chart(corrEl,{
      type:'scatter',
      data:{ datasets:[{ data:cells.map(c=>({x:c.x,y:c.y})),
        pointStyle:'rect', pointRadius:24,
        backgroundColor:cells.map(c=>{
          const v=c.v; if(v>0) return 'rgba(8,123,80,'+(0.15+v*0.7)+')';
          return 'rgba(204,31,38,'+(0.15+Math.abs(v)*0.7)+')';
        }) }]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false},
          tooltip:_anaTooltip({
            title:items=>{const c=cells[items[0].dataIndex];return DNAMES[c.di]+' × '+DNAMES[c.dj];},
            label:c=>'Correlación: '+cells[c.dataIndex].v }) },
        scales:{
          x:{min:-0.5,max:5.5,ticks:{stepSize:1,callback:v=>DNAMES[v]?DNAMES[v].split(' ')[0]:'',font:{size:9}},grid:{display:false}},
          y:{min:-0.5,max:5.5,ticks:{stepSize:1,callback:v=>DNAMES[5-v]?DNAMES[5-v].split(' ')[0]:'',font:{size:9}},grid:{display:false}} } }
    });
    // Insight: strongest correlation pair
    const offdiag=cells.filter(c=>c.di<c.dj);
    const strong=offdiag.reduce((mx,c)=>Math.abs(c.v)>Math.abs(mx.v)?c:mx,offdiag[0]);
    const ins=document.getElementById('ch-corr-insight');
    if(ins&&strong) ins.innerHTML='Relación más fuerte: <b>'+DNAMES[strong.di]+' ↔ '+DNAMES[strong.dj]
      +'</b> (r='+strong.v+'). '+(strong.v>0.5?'Tienden a puntuar juntas.':strong.v<-0.3?'Tienden a oponerse.':'Relación débil.');
  }
}

/* ═══════════════════════════════════════════════════════════════
   CONFIGURACIÓN DE PARÁMETROS DEL ALGORITMO (DEF: α, β, C por dimensión)
   ═══════════════════════════════════════════════════════════════ */
const DEF_DEFAULTS = {
  d1:{C0:3,B0:1,A0:2,C:7,B:2,A:9},
  d2:{C0:4,B0:1,A0:3,C:8,B:2,A:9},
  d3:{C0:4,B0:1,A0:3,C:8,B:2,A:8},
  d4:{C0:4,B0:1,A0:3,C:8,B:1.5,A:7},
  d5:{C0:4,B0:1,A0:3,C:8,B:1.5,A:7},
  d6:{C0:4,B0:1,A0:2,C:8,B:1,A:6},
};
const ALGO_DIM_LABELS = { d1:'D1 Compliance', d2:'D2 Estrategia', d3:'D3 ROI',
  d4:'D4 Técnica', d5:'D5 Implantación', d6:'D6 Personas' };
const ALGO_DIM_COLORS = { d1:'#CC1F26', d2:'#C4974A', d3:'#087B50', d4:'#C07800', d5:'#1848A0', d6:'#5C6570' };

function loadAlgoParams() {
  try {
    const saved = localStorage.getItem('meso_algo_params');
    if (saved) {
      const obj = JSON.parse(saved);
      Object.keys(obj).forEach(k=>{ if(DEF[k]) Object.assign(DEF[k], obj[k]); });
    }
  } catch(_) {}
}

function renderAlgoParams() {
  const body = document.getElementById('algo-params-body');
  if (!body) return;
  const PARAMS = ['C0','B0','A0','C','B','A'];
  body.innerHTML = Object.keys(DEF).map(function(k){
    const p = DEF[k];
    const boost8 = sigmoidBoost(8, p.C0,p.B0,p.A0,p.C,p.B,p.A).toFixed(2);
    const cells = PARAMS.map(function(prm){
      const border = prm==='C' ? 'border-left:2px solid #DDE5F2;' : '';
      return '<td style="padding:4px 6px;text-align:center;'+border+'">'
        +'<input type="number" step="0.5" value="'+p[prm]+'" '
        +'data-dim="'+k+'" data-param="'+prm+'" '
        +'onchange="updateAlgoParam(this)" '
        +'style="width:46px;padding:4px 5px;font-size:10px;text-align:center;'
        +'border:1px solid #DEDEDE;border-radius:5px;font-family:inherit"></td>';
    }).join('');
    return '<tr>'
      +'<td style="padding:6px 8px;font-weight:700;color:'+ALGO_DIM_COLORS[k]+'">'+ALGO_DIM_LABELS[k]+'</td>'
      +cells
      +'<td style="padding:6px 8px;text-align:center;font-weight:700;color:'+ALGO_DIM_COLORS[k]+'" id="algo-boost8-'+k+'">'+boost8+'×</td>'
      +'</tr>';
  }).join('');
}

function updateAlgoParam(inp) {
  const k = inp.dataset.dim, prm = inp.dataset.param;
  const v = parseFloat(inp.value);
  if (isNaN(v)) { inp.style.borderColor='#CC1F26'; return; }
  inp.style.borderColor='#DEDEDE';
  DEF[k][prm] = v;
  // Live update the @8 boost preview for this dimension
  const p = DEF[k];
  const cell = document.getElementById('algo-boost8-'+k);
  if (cell) cell.textContent = sigmoidBoost(8, p.C0,p.B0,p.A0,p.C,p.B,p.A).toFixed(2)+'×';
}

function applyAlgoParams() {
  // Re-apply DEF params to every criterion in DIMS (criteria inherit dimension params via dp)
  DIMS.forEach(function(d){
    const k = d.cls; // 'd1'..'d6'
    if (!DEF[k]) return;
    d.criterios.forEach(function(c){
      c.C0=DEF[k].C0; c.B0=DEF[k].B0; c.A0=DEF[k].A0;
      c.C=DEF[k].C;   c.B=DEF[k].B;   c.A=DEF[k].A;
    });
  });
  // Persist
  try { localStorage.setItem('meso_algo_params', JSON.stringify(DEF)); } catch(_){}
  // Recompute entire portfolio
  if (portfolioData && portfolioData.length) {
    portfolioData.forEach(function(p){ Object.assign(p, computeProj(p)); });
    if (typeof renderPortfolio==='function') renderPortfolio();
    if (typeof renderPools==='function') renderPools();
    if (typeof renderDashboard==='function') renderDashboard();
    if (typeof renderChartsStep==='function') renderChartsStep();
  }
  renderAlgoParams();
  toast('✓ Parámetros aplicados · '+(portfolioData?portfolioData.length:0)+' proyectos recalculados');
}

function resetAlgoParams() {
  Object.keys(DEF_DEFAULTS).forEach(function(k){ Object.assign(DEF[k], JSON.parse(JSON.stringify(DEF_DEFAULTS[k]))); });
  try { localStorage.removeItem('meso_algo_params'); } catch(_){}
  applyAlgoParams();
  toast('↺ Parámetros restaurados a valores por defecto');
}

document.addEventListener('DOMContentLoaded', function(){ if(typeof loadAlgoParams==='function') loadAlgoParams(); });

/* ═══════════════════════════════════════════════════════════════
   CONFIGURACIÓN POR EXCEL — exportar/importar pesos + parámetros boost
   Al importar, recalcula toda la cartera con los nuevos valores.
   ═══════════════════════════════════════════════════════════════ */
function exportConfigExcel() {
  if (typeof XLSX === 'undefined') { toast('Librería Excel no disponible'); return; }
  const wb = XLSX.utils.book_new();

  // ── Hoja 1: Pesos por dimensión ──
  const pesosRows = [['Dimensión','Código','Peso (%)']];
  DIMS.forEach(function(d){
    pesosRows.push([d.nom, d.id, Math.round(d.peso*100)]);
  });
  pesosRows.push([]);
  pesosRows.push(['TOTAL','', DIMS.reduce(function(s,d){return s+Math.round(d.peso*100);},0)]);
  const wsPesos = XLSX.utils.aoa_to_sheet(pesosRows);
  wsPesos['!cols'] = [{wch:36},{wch:10},{wch:12}];
  XLSX.utils.book_append_sheet(wb, wsPesos, 'Pesos');

  // ── Hoja 2: Parámetros del algoritmo (boost) por dimensión ──
  const boostRows = [['Dimensión','Código','C0 (centro base)','B0 (pendiente base)','A0 (techo base)','C (centro boost)','B (pendiente boost)','A (techo boost)','Boost @ nota 8']];
  Object.keys(DEF).forEach(function(k){
    const p = DEF[k];
    const lbl = (typeof ALGO_DIM_LABELS!=='undefined' && ALGO_DIM_LABELS[k]) ? ALGO_DIM_LABELS[k] : k.toUpperCase();
    boostRows.push([lbl, k, p.C0, p.B0, p.A0, p.C, p.B, p.A,
      +sigmoidBoost(8,p.C0,p.B0,p.A0,p.C,p.B,p.A).toFixed(2)]);
  });
  const wsBoost = XLSX.utils.aoa_to_sheet(boostRows);
  wsBoost['!cols'] = [{wch:18},{wch:8},{wch:16},{wch:18},{wch:14},{wch:16},{wch:18},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, wsBoost, 'Boost');

  // ── Hoja 3: Umbrales (clasificación + pools) ──
  const thrRows = [['Parámetro','Valor']];
  const thrS = document.getElementById('thr-s')?.value;
  const thrM = document.getElementById('thr-m')?.value;
  if (thrS!=null) thrRows.push(['Umbral pool Corto (horas ≤)', thrS]);
  if (thrM!=null) thrRows.push(['Umbral pool Medio (horas ≤)', thrM]);
  const wsThr = XLSX.utils.aoa_to_sheet(thrRows);
  wsThr['!cols'] = [{wch:34},{wch:12}];
  XLSX.utils.book_append_sheet(wb, wsThr, 'Umbrales');

  // ── Hoja 4: Instrucciones ──
  const info = [
    ['CONFIGURACIÓN NEXUS — Pesos y Parámetros del Algoritmo'],
    [''],
    ['Cómo usar este archivo:'],
    ['1. Edita los valores en las hojas "Pesos" y "Boost".'],
    ['2. En la app, ve a Configuración → "Importar configuración (Excel)".'],
    ['3. Al cargar, la cartera se recalcula automáticamente con los nuevos valores.'],
    [''],
    ['Pesos: deben sumar 100. Cada dimensión es un % entre 1 y 99.'],
    [''],
    ['Parámetros boost (por dimensión):'],
    ['  C0, B0, A0 = curva base (gobierna notas bajas).'],
    ['  C, B, A    = curva de boost (notas altas).'],
    ['  C = umbral donde se dispara el boost (típico 7-8).'],
    ['  A = techo de amplificación (a mayor A, más premia notas altas).'],
    ['  B = pendiente (a mayor B, transición más brusca).'],
    [''],
    ['No cambies la columna "Código" (d1..d6, D1..D6): es la clave de mapeo.'],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(info);
  wsInfo['!cols'] = [{wch:70}];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Instrucciones');

  const fecha = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, 'Nexus_Configuracion_'+fecha+'.xlsx');
  toast('✓ Configuración exportada a Excel');
}

function importConfigExcel(input) {
  if (typeof XLSX === 'undefined') { toast('Librería Excel no disponible'); return; }
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
      let nPesos = 0, nBoost = 0, nThr = 0;

      // ── Pesos ──
      if (wb.SheetNames.indexOf('Pesos') >= 0) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets['Pesos'], {header:1});
        rows.slice(1).forEach(function(r){
          const code = (r[1]||'').toString().trim();         // D1..D6
          const peso = parseFloat(r[2]);
          if (code && !isNaN(peso) && peso>0) {
            const d = DIMS.find(function(x){return x.id===code;});
            if (d) { d.peso = peso/100; nPesos++; }
          }
        });
      }

      // ── Boost params ──
      if (wb.SheetNames.indexOf('Boost') >= 0) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets['Boost'], {header:1});
        rows.slice(1).forEach(function(r){
          const code = (r[1]||'').toString().trim().toLowerCase();  // d1..d6
          if (DEF[code]) {
            const nums = ['C0','B0','A0','C','B','A'].map(function(_,i){return parseFloat(r[2+i]);});
            if (nums.every(function(v){return !isNaN(v);})) {
              DEF[code].C0=nums[0]; DEF[code].B0=nums[1]; DEF[code].A0=nums[2];
              DEF[code].C=nums[3];  DEF[code].B=nums[4];  DEF[code].A=nums[5];
              nBoost++;
            }
          }
        });
        // Propagar DEF a los criterios de cada dimensión
        DIMS.forEach(function(d){
          const k = d.cls;
          if (!DEF[k]) return;
          d.criterios.forEach(function(c){
            c.C0=DEF[k].C0; c.B0=DEF[k].B0; c.A0=DEF[k].A0;
            c.C=DEF[k].C;   c.B=DEF[k].B;   c.A=DEF[k].A;
          });
        });
      }

      // ── Umbrales ──
      if (wb.SheetNames.indexOf('Umbrales') >= 0) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets['Umbrales'], {header:1});
        rows.slice(1).forEach(function(r){
          const label = (r[0]||'').toString().toLowerCase();
          const val = parseFloat(r[1]);
          if (isNaN(val)) return;
          if (label.indexOf('corto')>=0) { const el=document.getElementById('thr-s'); if(el){el.value=val;nThr++;} }
          if (label.indexOf('medio')>=0) { const el=document.getElementById('thr-m'); if(el){el.value=val;nThr++;} }
        });
      }

      // Persistir
      try { localStorage.setItem('meso_algo_params', JSON.stringify(DEF)); } catch(_){}
      try { localStorage.setItem('meso_weights', JSON.stringify(DIMS.map(function(d){return {id:d.id,peso:d.peso};}))); } catch(_){}

      // Recalcular toda la cartera
      if (portfolioData && portfolioData.length) {
        portfolioData.forEach(function(p){ Object.assign(p, computeProj(p)); });
      }
      // Refrescar vistas
      if (typeof renderWeightEditor==='function') renderWeightEditor();
      if (typeof renderAlgoParams==='function') renderAlgoParams();
      if (typeof renderPortfolio==='function') renderPortfolio();
      if (typeof renderPools==='function') renderPools();
      if (typeof renderDashboard==='function') renderDashboard();
      if (typeof renderChartsStep==='function') renderChartsStep();

      toast('✓ Configuración importada · '+nPesos+' pesos, '+nBoost+' dimensiones boost'
        + (portfolioData&&portfolioData.length ? ' · '+portfolioData.length+' proyectos recalculados' : ''));
    } catch(err) {
      console.error('importConfigExcel', err);
      toast('✗ Error al leer el Excel: '+err.message);
    }
    input.value = '';  // permite recargar el mismo archivo
  };
  reader.readAsArrayBuffer(file);
}

function loadSavedWeights(){
  try{
    var saved=localStorage.getItem('meso_weights');
    if(saved){ JSON.parse(saved).forEach(function(w){ var d=DIMS.find(function(x){return x.id===w.id;}); if(d&&w.peso)d.peso=w.peso; }); }
  }catch(_){}
}
document.addEventListener('DOMContentLoaded', function(){ if(typeof loadSavedWeights==='function') loadSavedWeights(); });

/* ═══════════════════════════════════════════════════════════════
   CONFIG EMBEBIDA EN LA CARTERA — viaja con cada export/import
   _appendConfigSheets(wb)  → añade hojas Pesos/Boost/Umbrales a un libro
   _readConfigSheets(wb)    → lee esas hojas si existen y aplica la config
   ═══════════════════════════════════════════════════════════════ */
function _appendConfigSheets(wb) {
  if (typeof XLSX === 'undefined') return;
  try {
    // Hoja Pesos
    const pesos = [['Dimensión','Código','Peso (%)']];
    DIMS.forEach(function(d){ pesos.push([d.nom, d.id, Math.round(d.peso*100)]); });
    const wsP = XLSX.utils.aoa_to_sheet(pesos);
    wsP['!cols']=[{wch:36},{wch:10},{wch:12}];
    XLSX.utils.book_append_sheet(wb, wsP, '⚙ Pesos');

    // Hoja Boost (parámetros sigmoid por dimensión)
    const boost = [['Dimensión','Código','C0','B0','A0','C','B','A']];
    Object.keys(DEF).forEach(function(k){
      const p=DEF[k];
      const lbl=(typeof ALGO_DIM_LABELS!=='undefined'&&ALGO_DIM_LABELS[k])?ALGO_DIM_LABELS[k]:k.toUpperCase();
      boost.push([lbl,k,p.C0,p.B0,p.A0,p.C,p.B,p.A]);
    });
    const wsB = XLSX.utils.aoa_to_sheet(boost);
    wsB['!cols']=[{wch:18},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8}];
    XLSX.utils.book_append_sheet(wb, wsB, '⚙ Boost');

    // Hoja Umbrales
    const thr = [['Parámetro','Valor']];
    const thrS=document.getElementById('thr-s')?.value, thrM=document.getElementById('thr-m')?.value;
    if(thrS!=null) thr.push(['Umbral pool Corto (horas <)', thrS]);
    if(thrM!=null) thr.push(['Umbral pool Medio (horas <)', thrM]);
    const wsT = XLSX.utils.aoa_to_sheet(thr);
    wsT['!cols']=[{wch:34},{wch:12}];
    XLSX.utils.book_append_sheet(wb, wsT, '⚙ Umbrales');
  } catch(e){ console.error('_appendConfigSheets', e); }
}

function _readConfigSheets(wb) {
  // Devuelve true si encontró y aplicó configuración
  if (typeof XLSX === 'undefined' || !wb || !wb.SheetNames) return false;
  let applied = false;

  // Pesos
  if (wb.SheetNames.indexOf('⚙ Pesos') >= 0) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['⚙ Pesos'], {header:1});
    rows.slice(1).forEach(function(r){
      const code=(r[1]||'').toString().trim();
      const peso=parseFloat(r[2]);
      if(code && !isNaN(peso) && peso>0){
        const d=DIMS.find(function(x){return x.id===code;});
        if(d){ d.peso=peso/100; applied=true; }
      }
    });
  }
  // Boost
  if (wb.SheetNames.indexOf('⚙ Boost') >= 0) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['⚙ Boost'], {header:1});
    rows.slice(1).forEach(function(r){
      const code=(r[1]||'').toString().trim().toLowerCase();
      if(DEF[code]){
        const nums=['C0','B0','A0','C','B','A'].map(function(_,i){return parseFloat(r[2+i]);});
        if(nums.every(function(v){return !isNaN(v);})){
          DEF[code].C0=nums[0];DEF[code].B0=nums[1];DEF[code].A0=nums[2];
          DEF[code].C=nums[3]; DEF[code].B=nums[4]; DEF[code].A=nums[5];
          applied=true;
        }
      }
    });
    // Propagar a los criterios
    DIMS.forEach(function(d){
      const k=d.cls; if(!DEF[k])return;
      d.criterios.forEach(function(c){
        c.C0=DEF[k].C0;c.B0=DEF[k].B0;c.A0=DEF[k].A0;c.C=DEF[k].C;c.B=DEF[k].B;c.A=DEF[k].A;
      });
    });
  }
  // Umbrales
  if (wb.SheetNames.indexOf('⚙ Umbrales') >= 0) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['⚙ Umbrales'], {header:1});
    rows.slice(1).forEach(function(r){
      const label=(r[0]||'').toString().toLowerCase();
      const val=parseFloat(r[1]);
      if(isNaN(val))return;
      if(label.indexOf('corto')>=0){const el=document.getElementById('thr-s');if(el){el.value=val;applied=true;}}
      if(label.indexOf('medio')>=0){const el=document.getElementById('thr-m');if(el){el.value=val;applied=true;}}
    });
  }

  if (applied) {
    // Persistir la config aplicada
    try { localStorage.setItem('meso_algo_params', JSON.stringify(DEF)); } catch(_){}
    try { localStorage.setItem('meso_weights', JSON.stringify(DIMS.map(function(d){return {id:d.id,peso:d.peso};}))); } catch(_){}
    if (typeof renderWeightEditor==='function') renderWeightEditor();
    if (typeof renderAlgoParams==='function') renderAlgoParams();
  }
  return applied;
}
