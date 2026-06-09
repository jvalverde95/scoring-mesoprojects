/* ═══ PROJECT EDIT — renderPemBody ══════════════════════════ */
function renderPemBody(){
  const p=portfolioData[_pemIdx]; if(!p) return;
  const sf=p.sf||0, cl=clsf(sf);
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  const titleEl=document.getElementById('pem-title'), metaEl=document.getElementById('pem-meta');
  const scoreEl=document.getElementById('pem-score'), ctrEl=document.getElementById('pem-counter');
  if(titleEl) titleEl.textContent=p.nom.length>60?p.nom.substring(0,58)+'…':p.nom;
  if(metaEl)  metaEl.textContent=(p.area||'—')+' · '+(p.sponsor||'—')+(p.adoState?' · ADO: '+p.adoState:'');
  if(scoreEl){scoreEl.textContent=sf.toFixed(1);scoreEl.style.color=scColorHex(sf);}
  if(ctrEl)   ctrEl.textContent=(_pemIdx+1)+' de '+portfolioData.length;
  const DT=['var(--d1t)','var(--d2t)','var(--d3t)','var(--d4t)','var(--d5t)','var(--d6t)'];
  const DC=['var(--d1)','var(--d2)','var(--d3)','var(--d4)','var(--d5)','var(--d6)'];
  const dimSliders=DIMS.map((d,di)=>{
    const ds=scoreDim(d.criterios.map(c=>({...c,val:p.scores[c.id]||5})));
    const crits=d.criterios.map(c=>{const val=p.scores[c.id]||5;return `<div class="pem-crit"><div class="pem-crit-name">${c.nom.substring(0,28)}</div><div style="display:flex;align-items:center;gap:6px"><input type="range" class="pem-slider" min="1" max="10" step="1" value="${val}" style="flex:1;accent-color:${DC[di]}" oninput="pemSetScore(${_pemIdx},'${c.id}',this.value,this.nextElementSibling,${di})"/><span class="pem-crit-val" style="color:${DC[di]}">${val}</span></div></div>`;}).join('');
    return `<div class="pem-dim"><div class="pem-dim-hd"><div style="display:flex;align-items:center;gap:8px"><span style="width:28px;height:28px;border-radius:50%;background:${DT[di]};color:${DC[di]};font-size:8px;font-weight:800;display:inline-flex;align-items:center;justify-content:center">${d.id}</span><div><div style="font-size:11px;font-weight:600;color:var(--ink)">${d.nom}</div><div style="font-size:8px;color:var(--ink4)">Peso: ${Math.round(d.peso*100)}%</div></div></div><div class="pem-dim-score" id="pem-ds-${d.id}" style="color:${scColorHex(ds)}">${ds.toFixed(1)}</div></div><div class="pem-criteria">${crits}</div></div>`;
  }).join('');
  const body=document.getElementById('pem-body'); if(!body) return;
  body.innerHTML=`<div class="pem-row"><div class="pem-field"><div class="pem-label">Nombre</div><input class="pem-inp" type="text" value="${p.nom.replace(/"/g,'&quot;')}" oninput="portfolioData[${_pemIdx}].nom=this.value"/></div><div class="pem-field"><div class="pem-label">Área</div><input class="pem-inp" type="text" value="${p.area||''}" oninput="portfolioData[${_pemIdx}].area=this.value"/></div></div><div class="pem-row"><div class="pem-field"><div class="pem-label">Sponsor</div><input class="pem-inp" type="text" value="${p.sponsor||''}" oninput="portfolioData[${_pemIdx}].sponsor=this.value"/></div><div class="pem-field"><div class="pem-label">Horas estimadas</div><input class="pem-inp" type="number" min="1" value="${p.horas||''}" placeholder="horas" oninput="pemSetHoras(${_pemIdx},this.value)"/></div></div><div class="pem-row"><div class="pem-field"><div class="pem-label">Fecha de solicitud</div><input class="pem-inp" type="date" value="${p.reqDate||''}" oninput="portfolioData[${_pemIdx}].reqDate=this.value"/></div><div class="pem-field"><div class="pem-label">Clasificación</div><div style="padding:8px 11px;border-radius:6px;font-size:11px;font-weight:600;background:${cl.bg};color:${cl.c};border:1px solid ${cl.b}">${cl.et}</div></div></div><div style="font-size:9px;font-weight:700;color:#C0C0C0;letter-spacing:.14em;text-transform:uppercase;margin-top:4px;padding-top:12px;border-top:1px solid #F0F0F0">criterios por dimensión</div>${dimSliders}`;
}
function pemSetScore(projIdx,critId,val,valSpan,dimIdx){
  const v=parseInt(val);
  if(valSpan){valSpan.textContent=v;valSpan.style.color=scColorHex(v);}
  portfolioData[projIdx].scores[critId]=v;
  const p=portfolioData[projIdx], updated=computeProj(p);
  portfolioData[projIdx].sf=updated.sf;
  const scoreEl=document.getElementById('pem-score');
  if(scoreEl){scoreEl.textContent=updated.sf.toFixed(1);scoreEl.style.color=scColorHex(updated.sf);}
  const d=DIMS[dimIdx];
  const ds=scoreDim(d.criterios.map(c=>({...c,val:portfolioData[projIdx].scores[c.id]||5})));
  const dsEl=document.getElementById('pem-ds-'+d.id);
  if(dsEl){dsEl.textContent=ds.toFixed(1);dsEl.style.color=scColorHex(ds);}
}
function pemSetHoras(projIdx,val){
  const n=parseFloat(val); portfolioData[projIdx].horas=(Number.isFinite(n)&&n>0)?n:null;
}

/* ═══════════════════════════════════════════════════════
   DATAVERSE — based on ScoringDigitalProject solution
   Tables (real logical names from exported solution):
     meso_projectscoring       → main project + all 22 scores
     meso_auditevaluation      → evaluation history
     meso_criteriaconfiguration→ criteria catalogue
     meso_dimensionconfiguration→ dimension config
     meso_globalparameters     → thresholds & aging
     meso_scorecriterio        → normalized criterion scores
   ═══════════════════════════════════════════════════════ */

// ── Dataverse field mapping (real field names from solution) ─────────────────
const DV_TABLES = {
  project:   'meso_projectscorings',          // collection endpoint (plural)
  audit:     'meso_auditevaluations',
  criteria:  'meso_criteriaconfigurations',
  dimension: 'meso_dimensionconfigurations',
  params:    'meso_globalparameterss',
  score:     'meso_scoreciterios',
};

// Map from app criterion IDs → real Dataverse field names in meso_ProjectScoring

/* ═══════════════════════════════════════════════════════════════
   DATAVERSE MODULE
   Solution: ScoringDigitalProject v1.0.0.1 · Publisher: MESO
   
   Real table names (logical, lowercase for API):
     meso_projectscoring       → /api/data/v9.2/meso_projectscorings
     meso_auditevaluation      → /api/data/v9.2/meso_auditevaluations
     meso_criteriaconfiguration→ /api/data/v9.2/meso_criteriaconfigurations
     meso_dimensionconfiguration→/api/data/v9.2/meso_dimensionconfigurations
     meso_globalparameters     → /api/data/v9.2/meso_globalparameterss
     meso_scorecriterio        → /api/data/v9.2/meso_scoreciterios

   Criterion ID → real field name in meso_ProjectScoring:
     c1_1 → meso_legalriskscore          c1_2 → meso_safetyriskscore
     c1_3 → meso_reputationalriskscore   c1_4 → meso_regulatoryobligationscore
     c2_1 → meso_boardmandatescore       c2_2 → meso_internationalexpansionscore
     c2_3 → meso_innovationrdscore       c2_4 → meso_strategicurgencyscore
     c3_1 → meso_revenueimpactscore      c3_2 → meso_efficiencysavingsscore
     c3_3 → meso_roipaybackscore         c3_4 → meso_servicequalityscore
     c4_1 → meso_trlmaturityscore        c4_2 → meso_erpintegrationscore
     c4_3 → meso_scalabilityscore        c4_4 → meso_cybersecuritygdprscore
     c5_1 → meso_internalcapacityscore   c5_2 → meso_changemanagementscore
     c5_3 → meso_timetovaluescore
     c6_1 → meso_employeeexperiencescore c6_2 → meso_sustainabilityesgscore
     c6_3 → meso_trainingandculturescore
   ═══════════════════════════════════════════════════════════════ */
// meso_prioritypool picklist values (from solution)
// 0=Corto, 1=Medio, 2=Largo, 3=Sin estimar

/* ── Config persistence ─────────────────────────────────────── */
function dvLoadCfg() {
  // dvLoadCfg is now handled by loadAllCreds() in INIT — kept for compatibility
  try {
    const set = (id, val) => { if (!val) return; const e=document.getElementById(id); if(e) e.value=val; };
    set('cfg-dv-url',      sessionStorage.getItem('dv_url'));
    set('cfg-dv-tenant',   sessionStorage.getItem('dv_tenant'));
    set('cfg-dv-clientid', sessionStorage.getItem('dv_cid'));
  } catch(_){}
}

/* ── Status display ─────────────────────────────────────────── */
/* ── OAuth2 token ───────────────────────────────────────────── */
/* ── Helper: DV API call ────────────────────────────────────── */
/* ── Test connection — 6 diagnostic steps ───────────────────── */
/* ── Build project record body ──────────────────────────────── */
/* ── Upsert single project ──────────────────────────────────── */
/* ── Sync full portfolio ─────────────────────────────────────── */
/* ── Save single project from edit modal ────────────────────── */

/* ═══ INIT — runs after all modules loaded ══════════════════ */
document.addEventListener('DOMContentLoaded', function() {

  // ── UI setup ─────────────────────────────────────────────────
  const fReq = document.getElementById('f-req');
  if (fReq) fReq.value = new Date().toISOString().split('T')[0];

  ['f-name','f-area','f-type'].forEach(id => {
    const e = document.getElementById(id);
    if (e) { e.addEventListener('change', upd); e.addEventListener('input', upd); }
  });

  renderDimSteps();
  renderNav();
  renderWeightEditor();
  upd();
  goStep('dashboard');

  // ── Load team capacity & AI keywords from localStorage ───────
  if (typeof loadDevTeam  === 'function') loadDevTeam();
  if (typeof loadPlanningState === 'function') loadPlanningState();
  if (typeof loadLocked       === 'function') loadLocked();
  if (typeof renderScheduleEditor === 'function') renderScheduleEditor();
  if (typeof aiLoadKeywords === 'function') aiLoadKeywords();

  // ── Load ADO config from localStorage ────────────────────────
  try { loadAllCreds(); } catch(e) { console.warn('loadAllCreds:', e.message); }

  // ── Render empty dashboard ────────────────────────────────────
  if (typeof renderDashboard === 'function') renderDashboard();

});
