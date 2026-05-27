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

// meso_prioritypool picklist values (from solution)
// 0=Corto, 1=Medio, 2=Largo, 3=Sin estimar
function getPoolCode(p) {
  if (p.horas == null) return 3;
  const thrS = parseInt(document.getElementById('thr-s')?.value) || 30;
  const thrM = parseInt(document.getElementById('thr-m')?.value) || 100;
  if (p.horas < thrS) return 0;
  if (p.horas < thrM) return 1;
  return 2;
}

let _dvCfg = { url:'', tenant:'', clientId:'', secret:'' };
let _dvToken = null, _dvTokenExp = 0;

/* ── Config persistence ─────────────────────────────────────── */
function dvSaveCfg() {
  const g = id => (document.getElementById(id)?.value || '').trim();
  _dvCfg = {
    url:      g('cfg-dv-url'),
    tenant:   g('cfg-dv-tenant'),
    clientId: g('cfg-dv-clientid'),
    secret:   g('cfg-dv-secret'),
  };
  saveAllCreds();  // persist to localStorage
  toast('✓ Configuración Dataverse guardada');
}

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
function dvStatusShow(type, msg) {
  const el   = document.getElementById('cfg-dv-status');
  const msgEl= document.getElementById('cfg-dv-status-msg');
  const spin = document.getElementById('cfg-dv-spinner');
  const colors = {
    loading:{ bg:'#F3E8FF', c:'#742774' },
    ok:     { bg:'#ECF8F3', c:'#087B50' },
    error:  { bg:'#FEF0F1', c:'#CC1F26' },
  };
  const clr = colors[type] || colors.loading;
  if (el) { el.style.display='flex'; el.style.background=clr.bg; el.style.color=clr.c; }
  if (spin) spin.style.display = type==='loading' ? 'block' : 'none';
  if (msgEl) msgEl.textContent = msg;
}

/* ── OAuth2 token ───────────────────────────────────────────── */
async function dvGetToken() {
  if (_dvToken && Date.now() < _dvTokenExp) return _dvToken;
  const { url, tenant, clientId, secret } = _dvCfg;
  if (!tenant || !clientId || !secret || !url)
    throw new Error('Faltan credenciales en ⚙ Config → Dataverse');

  const resource = (url.endsWith('/') ? url : url + '/') + '.default';

  // Use /api/token proxy to avoid browser CORS block on login.microsoftonline.com
  // The client_secret never goes to Azure AD from the browser — it goes through Vercel
  let res;
  try {
    res = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id:     tenant,
        client_id:     clientId,
        client_secret: secret,
        scope:         resource,
      }),
    });
  } catch(e) {
    throw new Error('NET_ERR:' + e.message);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }
  if (!data.access_token) {
    throw new Error('No se recibió access_token del proxy');
  }

  _dvToken    = data.access_token;
  _dvTokenExp = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
  return _dvToken;
}

/* ── Helper: DV API call ────────────────────────────────────── */
async function dvApi(method, path, token, body=null) {
  const url = `${_dvCfg.url.replace(/\/$/,'')}/api/data/v9.2/${path}`;
  const headers = {
    'Authorization':    'Bearer ' + token,
    'Accept':           'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version':    '4.0',
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

/* ── Test connection — 6 diagnostic steps ───────────────────── */
async function dvTest() {
  dvSaveCfg();
  const { url, tenant, clientId, secret } = _dvCfg;

  // Step 1: required fields
  const missing = [];
  if (!url)      missing.push('URL del entorno');
  if (!tenant)   missing.push('Tenant ID');
  if (!clientId) missing.push('Client ID');
  if (!secret)   missing.push('Client Secret');
  if (missing.length) {
    dvStatusShow('error', '✗ Faltan: ' + missing.join(', ')); return;
  }

  // Step 2: URL format
  if (!url.startsWith('https://')) {
    dvStatusShow('error', '✗ URL debe empezar por https://  Ej: https://org1234.crm4.dynamics.com'); return;
  }

  // Step 3: token
  dvStatusShow('loading', '① Autenticando con Azure AD…');
  let token;
  try {
    token = await dvGetToken();
  } catch(e) {
    const m = e.message;
    const hints = {
      'NET_ERR':           ' → Error de red. Comprueba conexión a internet.',
      'AADSTS700016':      ' → Client ID no existe en este tenant.',
      'AADSTS7000215':     ' → Client Secret incorrecto o expirado.',
      'AADSTS50020':       ' → Tenant ID incorrecto.',
      'AADSTS650057':      ' → Falta permiso "Dynamics CRM → user_impersonation" en Azure AD → API permissions.',
      'AADSTS700082':      ' → Secreto expirado. Genera uno nuevo en Azure AD → Certificates & secrets.',
      'unauthorized_client':' → App sin permiso de Client Credentials. Verifica configuración en Azure AD.',
    };
    const hint = Object.entries(hints).find(([k]) => m.includes(k));
    dvStatusShow('error', '✗ Azure AD: ' + m + (hint ? hint[1] : '')); return;
  }

  // Step 4: ping Dataverse
  dvStatusShow('loading', '② Token ✓ — Conectando con Dataverse…');
  let res;
  try {
    res = await dvApi('GET', 'meso_projectscorings?$top=1&$select=meso_projectscoringid', token);
  } catch(e) {
    dvStatusShow('error', '✗ No se pudo conectar a ' + url + ' — ' + e.message); return;
  }

  // Step 5: interpret status
  const STATUS_HINTS = {
    401: '✗ Sin acceso (401) → Power Platform Admin Center → tu entorno → Usuarios de aplicación → añade tu app con rol "Administrador del sistema".',
    403: '✗ Sin permisos (403) → Asigna rol "Administrador del sistema" en Power Platform Admin Center.',
    404: '✗ Tabla meso_projectscoring no encontrada (404) → Verifica que importaste la solución ScoringDigitalProject v1.0.0.1 en este entorno.',
  };
  if (STATUS_HINTS[res.status]) {
    dvStatusShow('error', STATUS_HINTS[res.status]); return;
  }
  if (!res.ok) {
    let body = ''; try { body = await res.text(); } catch(_){}
    dvStatusShow('error', `✗ Error ${res.status}: ${body.substring(0,200)}`); return;
  }

  // Step 6: success
  const data = await res.json().catch(() => ({value:[]}));
  const envName = url.replace('https://','').split('.')[0];
  dvStatusShow('ok', `✓ Conectado · ${envName} · meso_projectscoring OK · ${data.value?.length??0} registros`);

  const badge = document.getElementById('cfg-dv-badge');
  if (badge) { badge.style.display='inline-block'; badge.textContent='✓ conectado'; }
  const syncBtn = document.getElementById('cfg-dv-sync-btn');
  if (syncBtn) syncBtn.disabled = false;
  const dvBtn = document.getElementById('pem-dv-btn');
  if (dvBtn) dvBtn.style.display = 'flex';
}

/* ── Build project record body ──────────────────────────────── */
function dvBuildBody(p) {
  const cl = clsf(p.sf || 0);
  const body = {
    // Main fields
    meso_auditname:           p.nom     || '',
    meso_departmentarea:      p.area    || '',
    meso_sponsor:             p.sponsor || '',
    meso_auditid:             p.adoId   || null,
    meso_requestdate:         p.reqDate || null,
    meso_daysinportfolio:     p.reqDate
      ? Math.round((Date.now() - new Date(p.reqDate)) / 86400000) : null,
    meso_estimatedhours:      p.horas   || null,
    meso_priorityclassification: cl.et  || '',
    meso_ispriorityauto:      !!(p.dimScores && p.dimScores[0] >= 8),
    meso_prioritypool:        getPoolCode(p),
    meso_syncdatetime:        new Date().toISOString(),
    // Scoring
    meso_finalscore:          +(p.sf  || 0).toFixed(3),
    meso_basescore:           +(p.sb  || 0).toFixed(3),
    meso_agingfactor:         +(p.af  || 1).toFixed(4),
    // Dimension scores
    meso_dimension1score:     +(p.dimScores?.[0] || 0).toFixed(3),
    meso_dimension2score:     +(p.dimScores?.[1] || 0).toFixed(3),
    meso_dimension3score:     +(p.dimScores?.[2] || 0).toFixed(3),
    meso_dimension4score:     +(p.dimScores?.[3] || 0).toFixed(3),
    meso_dimension5score:     +(p.dimScores?.[4] || 0).toFixed(3),
    meso_dimension6score:     +(p.dimScores?.[5] || 0).toFixed(3),
  };
  // 22 criterion scores → real field names
  Object.entries(CRIT_FIELD_MAP).forEach(([cid, field]) => {
    body[field] = Math.round(p.scores?.[cid] || 5);
  });
  return body;
}

/* ── Upsert single project ──────────────────────────────────── */
async function dvUpsertProject(p, token) {
  const body = dvBuildBody(p);

  // Check if record exists by auditid (ADO Work Item ID)
  let existingId = p._dvId || null;
  if (!existingId && p.adoId) {
    const chk = await dvApi('GET',
      `meso_projectscorings?$filter=meso_auditid eq ${p.adoId}&$select=meso_projectscoringid`,
      token
    );
    if (chk.ok) {
      const d = await chk.json();
      if (d.value?.length) existingId = d.value[0].meso_projectscoringid;
    }
  }

  const method = existingId ? 'PATCH' : 'POST';
  const path   = existingId
    ? `meso_projectscorings(${existingId})`
    : 'meso_projectscorings';

  const res = await dvApi(method, path, token, body);
  if (!res.ok && res.status !== 204) {
    const t = await res.text().catch(()=>'');
    throw new Error(`${res.status}: ${t.substring(0,120)}`);
  }
  if (res.status === 201) {
    try { const d=await res.json(); if(d.meso_projectscoringid) p._dvId=d.meso_projectscoringid; }
    catch(_){}
  } else if (existingId) {
    p._dvId = existingId;
  }
}

/* ── Sync full portfolio ─────────────────────────────────────── */
async function dvSyncAll() {
  if (!portfolioData.length) { toast('Sin proyectos para sincronizar'); return; }
  dvStatusShow('loading', `Sincronizando ${portfolioData.length} proyectos…`);
  try {
    const token = await dvGetToken();
    let ok=0, err=0;
    for (const p of portfolioData) {
      try { await dvUpsertProject(p, token); ok++; }
      catch(e) { err++; console.warn('DV:', p.nom, e.message); }
    }
    dvStatusShow(err?'error':'ok', `✓ ${ok} sincronizados${err?' · '+err+' errores (consola)':''}`);
    toast(`↑ Dataverse: ${ok} proyectos`);
  } catch(e) {
    dvStatusShow('error', '✗ ' + e.message);
  }
}

/* ── Save single project from edit modal ────────────────────── */
async function pemSaveDataverse() {
  const p = portfolioData[_pemIdx];
  if (!p) return;
  pemSave();
  try {
    const token = await dvGetToken();
    await dvUpsertProject(p, token);
    toast('✓ Guardado en Dataverse');
    dvStatusShow('ok', '✓ Proyecto guardado en Dataverse');
  } catch(e) {
    toast('✗ Dataverse: ' + e.message);
    dvStatusShow('error', '✗ ' + e.message);
  }
}