/* ═══ ADO MODAL ════════════════════════════════════════════ */
function openAdoModal() {
  document.getElementById('ado-overlay').classList.add('open');
  adoStatusHide();
}
function closeAdoModal() {
  document.getElementById('ado-overlay').classList.remove('open');
}
function adoStatusShow(type, msg) {
  const el=document.getElementById('ado-status'), ml=document.getElementById('ado-status-msg');
  const colors={loading:{bg:'#EEF3FC',c:'#1848A0'},ok:{bg:'var(--d3t)',c:'var(--d3)'},error:{bg:'var(--d1t)',c:'var(--d1)'}};
  const clr=colors[type]||colors.loading;
  el.className='ado-status '+type; el.style.display='flex'; el.style.background=clr.bg; el.style.color=clr.c;
  if(ml) ml.textContent=msg;
}
function adoStatusHide(){ const el=document.getElementById('ado-status'); if(el) el.className='ado-status'; }
// Proxy helper — routes ADO calls through /api/ado to avoid CORS
async function adoProxy(org, project, path, pat, method='GET', body=null) {
  // PAT is now read server-side from ADO_PAT env var — not sent from browser
  const headers = {
    'Content-Type':  'application/json',
    'X-ADO-Path':    path,
  };
  // Only send org/project if they differ from env var defaults
  if (org)     headers['X-ADO-Org']     = org;
  if (project) headers['X-ADO-Project'] = project;
  // pat param kept for backwards compat but ignored (env var takes precedence)

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch('/api/ado', opts);
  return res;
}



async function adoConnect() {
  const org=document.getElementById('ado-org')?.value?.trim();
  const project=document.getElementById('ado-project')?.value?.trim();
  const pat=document.getElementById('ado-pat')?.value?.trim();
  if(!org||!project){adoStatusShow('error','Rellena organización y proyecto.');return;}
  const btn=document.getElementById('ado-connect-btn'); if(btn) btn.disabled=true;
  adoStatusShow('loading','Guardando credenciales...');
  try {
    const set=(id,v)=>{const e=document.getElementById(id);if(e&&v)e.value=v;};
    set('cfg-ado-org',org); set('cfg-ado-project',project); set('cfg-ado-pat',pat);
    adoStatusShow('ok','✓ Credenciales guardadas. Ve a ⚙ Config para elegir la query.');
    toast('Credenciales guardadas — abre ⚙ Config para elegir la query');
    setTimeout(()=>{closeAdoModal();goStep('config');},1000);
  } catch(e){ adoStatusShow('error',e.message); }
  finally{ if(btn) btn.disabled=false; }
}

async function adoFetchRequirements(org, project, pat, queryId) {
  // auth/base handled by adoProxy
  const runRes=await adoProxy(org, project, `_apis/wit/wiql/${queryId}?api-version=7.1`, pat);
  if(runRes.status===401) throw new Error('PAT inválido o sin permisos (401).');
  if(runRes.status===404) throw new Error(`Query "${queryId}" no encontrada (404).`);
  if(!runRes.ok) throw new Error(`Error ${runRes.status} ejecutando la query.`);
  const runData=await runRes.json();
  let ids=[];
  if(runData.workItems) ids=runData.workItems.map(w=>w.id);
  else if(runData.workItemRelations) ids=runData.workItemRelations.filter(r=>r.target).map(r=>r.target.id);
  ids=[...new Set(ids)];
  if(!ids.length) throw new Error('La query no devolvió work items.');
  const fields=[
    'System.Id','System.Title','System.WorkItemType','System.State',
    'System.AssignedTo','System.CreatedDate','System.Description',
    'System.AreaPath','System.Tags','Microsoft.VSTS.Common.Priority','System.Parent',
    // ── Fechas: dos vienen de ADO (fijas) y una la calcula la app ──
    'Custom.MPGStartDate','Custom.MPGTaskStartDate',  // MPG Start Date: inicio REAL (ADO manda)
    // Target Date: entrega comprometida (ADO manda). Se consultan las variantes
    // habituales según la plantilla de proceso y los campos personalizados MPG.
    'Microsoft.VSTS.Scheduling.TargetDate',
    'Microsoft.VSTS.Scheduling.FinishDate',
    'Microsoft.VSTS.Scheduling.DueDate',
    'Custom.MPGTargetDate','Custom.MPGEndDate','Custom.MPGTaskEndDate',
    'Custom.MPGEstimatedStartDate',                   // MPG Estimated Start Date: la calcula y escribe la APP
    // Effort / estimation fields — ADO uses different field names depending on process template
    'Microsoft.VSTS.Scheduling.OriginalEstimate',   // Scrum: Original Estimate (Hours)
    'Microsoft.VSTS.Scheduling.CompletedWork',       // Horas ya dedicadas
    'Microsoft.VSTS.Scheduling.RemainingWork',       // Horas pendientes
    'Microsoft.VSTS.Scheduling.StoryPoints',         // Agile: Story Points
    'Microsoft.VSTS.Scheduling.Effort',              // CMMI: Effort
    'Microsoft.VSTS.Scheduling.Size',                // CMMI: Size
    'System.IterationPath',
  ];
  const allItems=[];
  for(let i=0;i<ids.length;i+=200){
    const batch = ids.slice(i,i+200);
    let bData = null;
    // 1º intento: pedir la lista explícita de campos (respuesta más ligera)
    let bRes = await adoProxy(org, project, `_apis/wit/workitemsbatch?api-version=7.1`, pat, 'POST', {ids:batch, fields});
    if (bRes.ok) {
      bData = await bRes.json();
    } else {
      // 2º intento: si algún campo no existe en el tipo de work item, ADO rechaza la
      // petición entera. En ese caso se piden TODOS los campos (sin lista) para que
      // lleguen igualmente los que sí existan (Target Date, fechas MPG, etc.).
      console.warn('[ADO] Petición con lista de campos falló ('+bRes.status+'). Reintentando sin filtro de campos…');
      const bRes2 = await adoProxy(org, project, `_apis/wit/workitemsbatch?api-version=7.1`, pat, 'POST', {ids:batch, $expand:'fields'});
      if (!bRes2.ok) throw new Error(`Error ${bRes2.status} cargando detalles.`);
      bData = await bRes2.json();
    }
    allItems.push(...((bData && bData.value) || []));
  }
  return allItems;
}

function adoMapToProject(wi) {
  const f=wi.fields||{};
  const title=(f['System.Title']||`Work Item ${wi.id}`).trim();
  const assignee=f['System.AssignedTo'];
  // System.AssignedTo puede venir como objeto {displayName, uniqueName, ...} o como string "Nombre <email>"
  let sponsor='';
  if (assignee && typeof assignee==='object') {
    sponsor=(assignee.displayName||assignee.uniqueName||assignee.name||'').replace(/<[^>]+>/g,'').trim();
  } else if (assignee) {
    // string: puede ser "Nombre Apellido <email>" → quedarnos con el nombre
    sponsor=String(assignee).replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
  }
  const descRaw=f['System.Description']||'';
  const desc=descRaw.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().substring(0,400);
  const areaPath=f['System.AreaPath']||'';
  const areaFromPath=(areaPath.includes('\\') ? areaPath.split('\\').pop() : areaPath.split('/').pop()).trim();
  // Prefer MPG prefix decode (e.g. MPG-LOG-001 → Almacén y Logística)
  const area = (typeof mpgDecodeArea==='function' ? mpgDecodeArea(f['System.Title']||'') : null)
             || areaFromPath
             || 'Sin área';
  const tags=(f['System.Tags']||'').split(';').map(t=>t.trim()).filter(Boolean);
  let reqDate=null;
  const cd=f['System.CreatedDate'];
  if(cd) reqDate=cd.substring(0,10);
  const scores={}; CRIT_IDS.forEach(cid=>{scores[cid]=5;});
  // Horas → SOLO OriginalEstimate (campo estándar del proceso Scrum/ADO)
  // Ignoramos StoryPoints, Effort, Size — son métricas distintas
  const rawHours = f['Microsoft.VSTS.Scheduling.OriginalEstimate'] ?? null;
  const horas = rawHours !== null && rawHours !== ''
    ? parseFloat(rawHours) || null
    : null;

  // Diagnóstico (una sola vez por carga): lista en consola TODOS los campos con
  // formato fecha que devuelve este ADO, señalando cuál se ha usado como Target Date.
  if (!window._adoDateDiagShown) {
    var _dateFields = Object.keys(f).filter(function(k){
      var v = f[k];
      return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
    });
    if (_dateFields.length) {
      var _tgtFound = f['Custom.MPGTargetDate'] || f['Custom.MPGEndDate'] || f['Custom.MPGTaskEndDate']
                   || f['Microsoft.VSTS.Scheduling.TargetDate'] || f['Microsoft.VSTS.Scheduling.FinishDate']
                   || f['Microsoft.VSTS.Scheduling.DueDate'];
      console.log('[ADO] Campos de fecha disponibles en work item ' + wi.id + ':',
        _dateFields.map(function(k){ return k + ' = ' + f[k]; }));
      console.log('[ADO] Target Date detectada:', _tgtFound || '(ninguna) — si alguno de los campos de arriba es la fecha objetivo, indícalo para mapearlo');
      window._adoDateDiagShown = true;
    }
  }
  return {nom:`${wi.id} — ${title}`,area,sponsor,scores,
    horas,                          // ← mapped from ADO estimation field
    horasSource: rawHours !== null ? 'OriginalEstimate' : null,
    reqDate, regDate:null,
    adoAssigned: sponsor || '',     // System.AssignedTo (persona responsable) → "Pendiente de:"
    adoId:wi.id, adoTitle:title, adoType:f['System.WorkItemType']||'',
    adoState:f['System.State']||'', adoPriority:parseInt(f['Microsoft.VSTS.Common.Priority'])||3,
    adoIteration:f['System.IterationPath']||'',
    // Fecha de inicio según el tipo: Requirement → MPGStartDate, Task → MPGTaskStartDate.
    // Vacío = no iniciado (planificación normal). Con valor = en curso desde esa fecha.
    adoStartDate: (f['Custom.MPGStartDate'] || f['Custom.MPGTaskStartDate'] || null),
    // Target Date: fecha de entrega comprometida en ADO (fija, manda sobre la estimación)
    // Target Date es el campo estándar del sistema en ADO, así que tiene prioridad.
    // Los personalizados MPG solo se usan si el estándar no está informado.
    adoTargetDate: (f['Microsoft.VSTS.Scheduling.TargetDate']
                 || f['Microsoft.VSTS.Scheduling.FinishDate']
                 || f['Microsoft.VSTS.Scheduling.DueDate']
                 || f['Custom.MPGTargetDate'] || f['Custom.MPGEndDate'] || f['Custom.MPGTaskEndDate'] || null),
    // MPG Estimated Start Date: inicio ESTIMADO que calcula la app y sincroniza hacia ADO
    adoEstStartDate: (f['Custom.MPGEstimatedStartDate'] || null),
    // Seguimiento de esfuerzo: horas ya dedicadas y horas que faltan
    adoCompletedWork: (f['Microsoft.VSTS.Scheduling.CompletedWork'] != null
                        ? Number(f['Microsoft.VSTS.Scheduling.CompletedWork']) : null),
    adoRemainingWork: (f['Microsoft.VSTS.Scheduling.RemainingWork'] != null
                        ? Number(f['Microsoft.VSTS.Scheduling.RemainingWork']) : null),
    adoDesc:desc, adoTags:tags, adoRaw:f};
}

/* ═══ CFG ADO ══════════════════════════════════════════════ */
let _adoCreds=null, _adoConnected=false;

function _cfgAdoCreds(){
  return {
    org:     (document.getElementById('cfg-ado-org')?.value     || '').trim(),
    project: (document.getElementById('cfg-ado-project')?.value || '').trim(),
    // PAT is optional — if empty, server uses ADO_PAT env var
    pat:     (document.getElementById('cfg-ado-pat')?.value     || '').trim(),
  };
}

function cfgAdoStatusShow(type,msg){
  const el=document.getElementById('cfg-ado-status'),
        sp=document.getElementById('cfg-ado-spinner'),
        ml=document.getElementById('cfg-ado-status-msg');
  const c={loading:{bg:'#EEF3FC',c:'#1848A0'},ok:{bg:'var(--d3t)',c:'var(--d3)'},error:{bg:'var(--d1t)',c:'var(--d1)'}};
  const clr=c[type]||c.loading;
  if(el){el.style.display='flex';el.style.background=clr.bg;el.style.color=clr.c;}
  if(sp) sp.style.display=type==='loading'?'block':'none';
  if(ml) ml.textContent=msg;
}

function cfgAdoQuerySelected(queryId){
  const sel=document.getElementById('cfg-ado-query-select');
  const note=document.getElementById('cfg-ado-query-note');
  const btn=document.getElementById('cfg-ado-load-btn');
  const prev=document.getElementById('cfg-ado-preview');
  if(!queryId){if(note)note.textContent='Selecciona una query';if(btn)btn.disabled=true;return;}
  const mi=document.getElementById('cfg-ado-query-id'); if(mi) mi.value=queryId;
  const opt=sel?.querySelector(`option[value="${queryId}"]`);
  if(note&&opt) note.textContent=`Query: "${opt.dataset.name}" · Tipo: ${opt.dataset.queryType||''}`;
  if(btn) btn.disabled=false;
  if(prev) prev.textContent='Listo para cargar';
  saveAllCreds();
}

async function cfgAdoTest(){
  const {org, project} = _cfgAdoCreds();
  if (!org)     { cfgAdoStatusShow('error', 'Rellena la organización (campo Org).'); return; }
  if (!project) { cfgAdoStatusShow('error', 'Rellena el proyecto (campo Proyecto).'); return; }

  cfgAdoStatusShow('loading', `Conectando… org="${org}" proyecto="${project}"`);

  try {
    // Step 1: list all projects in the org (org-level call, no project in URL)
    const listRes = await adoProxy(org, null, '_apis/projects?api-version=7.1');
    const listBody = await listRes.json().catch(() => ({}));

    if (listRes.status === 401) throw new Error('PAT inválido (401). Crea un nuevo PAT en ADO con scope Work Items Read + Project Read y actualiza ADO_PAT en Vercel.');
    if (listRes.status === 403) throw new Error('Sin permisos (403). El PAT necesita scope "Project and Team (Read)".');
    if (listRes.status === 404) throw new Error(`Organización "${org}" no encontrada (404). URL: ${listBody.url || 'https://dev.azure.com/' + org}. Verifica ADO_ORG en Vercel.`);
    if (!listRes.ok) throw new Error(`Error ${listRes.status}: ${listBody.detail || listBody.message || JSON.stringify(listBody).substring(0,200)}`);

    const allProjects = listBody.value || [];
    if (!allProjects.length) throw new Error('La organización no tiene proyectos o el PAT no tiene permisos de lectura.');

    // Step 2: find project (case-insensitive)
    const projMatch = allProjects.find(p =>
      p.name.toLowerCase() === project.toLowerCase() ||
      p.name.toLowerCase().replace(/\s/g,'') === project.toLowerCase().replace(/\s/g,'')
    );

    if (!projMatch) {
      const names = allProjects.map(p => `"${p.name}"`).join(', ');
      throw new Error(`Proyecto "${project}" no encontrado. Proyectos disponibles: ${names}. Actualiza ADO_PROJECT en Vercel con el nombre exacto.`);
    }

    const projName = projMatch.name;
    // Update field with exact name
    const projField = document.getElementById('cfg-ado-project');
    if (projField) projField.value = projName;

    cfgAdoStatusShow('loading', `"${projName}" encontrado. Cargando queries…`);

    // Step 3: load queries
    const qRes = await adoProxy(org, projName, '_apis/wit/queries?$depth=2&$expand=all&api-version=7.1');
    if (!qRes.ok) {
      const qBody = await qRes.json().catch(() => ({}));
      throw new Error(`No se pudieron cargar las queries (${qRes.status}): ${qBody.message||''}`);
    }
    const qData = await qRes.json();

    const allQueries = [];
    function walkQueries(node, path='') {
      if (!node) return;
      const fullPath = path ? `${path} / ${node.name}` : node.name;
      if (node.queryType) allQueries.push({ id:node.id, name:node.name, path:fullPath, queryType:node.queryType });
      if (node.children) node.children.forEach(c => walkQueries(c, path ? fullPath : node.name));
    }
    (qData.value || [qData]).forEach(root => walkQueries(root, ''));

    const sel = document.getElementById('cfg-ado-query-select');
    if (sel) {
      sel.innerHTML = '<option value="">— Selecciona una query —</option>';
      allQueries.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.id; opt.textContent = q.path || q.name;
        opt.dataset.queryType = q.queryType; opt.dataset.name = q.name;
        sel.appendChild(opt);
      });
    }

    const autoMatch = allQueries.find(q =>
      q.name.toLowerCase().includes('evolutivo') ||
      q.name.toLowerCase().includes('pendientes') ||
      q.name.toLowerCase().includes('gaps')
    );
    if (autoMatch && sel) { sel.value = autoMatch.id; cfgAdoQuerySelected(autoMatch.id); }

    const qs = document.getElementById('cfg-ado-query-section');
    if (qs) qs.style.display = 'block';

    const badge = document.getElementById('cfg-ado-conn-badge');
    if (badge) {
      badge.style.display = 'inline-block';
      badge.style.background = '#EEF3FC'; badge.style.color = '#0078D4';
      badge.style.border = '1px solid rgba(0,120,212,.2)';
      badge.textContent = `✓ ${projName} · ${allQueries.length} queries`;
    }

    cfgAdoStatusShow('ok', `✓ Conectado · "${projName}" · ${allQueries.length} queries${autoMatch ? ` · "${autoMatch.name}" pre-seleccionada` : ''}`);
    saveAllCreds();

  } catch(e) {
    cfgAdoStatusShow('error', '✗ ' + e.message);
    const qs = document.getElementById('cfg-ado-query-section');
    if (qs) qs.style.display = 'none';
  }
}

function cfgAdoGetTypes(){
  if(document.getElementById('cfg-ado-type-all')?.checked) return [];
  const map=[['cfg-ado-type-req','Requirement'],['cfg-ado-type-task','Task'],
             ['cfg-ado-type-us','User Story'],['cfg-ado-type-bug','Bug'],['cfg-ado-type-feat','Feature']];
  const types=map.filter(([id])=>document.getElementById(id)?.checked).map(([,t])=>t);
  return types.length?types:[];
}

async function cfgAdoLoad(){
  const {org,project,pat}=_cfgAdoCreds();
  const selVal=document.getElementById('cfg-ado-query-select')?.value;
  const manualId=document.getElementById('cfg-ado-query-id')?.value?.trim();
  const queryId=selVal||manualId;
  if(!queryId){cfgAdoStatusShow('error','Selecciona una query.');return;}
  if(!org||!project){cfgAdoStatusShow('error','Rellena organización y proyecto.');return;}
  const types=cfgAdoGetTypes();
  const opt=document.getElementById('cfg-ado-query-select')?.querySelector(`option[value="${queryId}"]`);
  const qname=opt?.dataset?.name||queryId;
  cfgAdoStatusShow('loading',`Ejecutando query "${qname}"...`);
  try{
    // Use exact project name from field (may have been corrected by cfgAdoTest)
    const exactProject = document.getElementById('cfg-ado-project')?.value?.trim() || project;
    const allItems=await adoFetchRequirements(org,exactProject,pat,queryId);
    const filtered=types.length?allItems.filter(wi=>types.includes(wi.fields?.['System.WorkItemType'])):allItems;
    if(!filtered.length) throw new Error(`Sin work items${types.length?' del tipo ('+types.join(', ')+')':''} en esta query.`);
    _adoCreds={org,project,pat,queryId}; _adoConnected=true;
    const badge=document.getElementById('ado-badge');
    if(badge){badge.className='ado-badge connected';document.getElementById('ado-badge-lbl').textContent=`ADO · ${filtered.length} items`;}
    const prev=document.getElementById('cfg-ado-preview'); if(prev) prev.textContent='';
    // ── Hours summary ─────────────────────────────────────────────
    const withHours    = filtered.filter(wi => {
      const f = wi.fields || {};
      return (f['Microsoft.VSTS.Scheduling.OriginalEstimate'] != null && f['Microsoft.VSTS.Scheduling.OriginalEstimate'] !== '') ||
             (f['Microsoft.VSTS.Scheduling.StoryPoints']      != null && f['Microsoft.VSTS.Scheduling.StoryPoints']      !== '') ||
             (f['Microsoft.VSTS.Scheduling.Effort']           != null && f['Microsoft.VSTS.Scheduling.Effort']           !== '');
    });
    const withoutHours = filtered.filter(wi => !withHours.includes(wi));

    // Show summary banner before opening modal
    const summaryHtml = `
      <div style="background:#F7F7F5;border:1px solid #EBEBEB;border-radius:8px;padding:12px 16px;margin-top:10px;font-size:11px">
        <div style="font-weight:700;color:#111;margin-bottom:8px">
          ✓ ${filtered.length} work items cargados de Azure DevOps
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px;color:#087B50">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" fill="#ECF8F3" stroke="#087B50" stroke-width="1"/>
              <path d="M3.5 6l2 2 3-3" stroke="#087B50" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span><strong>${withHours.length}</strong> con horas estimadas</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;color:#C07800">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" fill="#FAF5E6" stroke="#C07800" stroke-width="1"/>
              <path d="M6 3.5v3M6 8h.01" stroke="#C07800" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span><strong>${withoutHours.length}</strong> sin horas — las podrás asignar en Pools</span>
          </div>
        </div>
        ${withHours.length > 0 ? `
        <div style="margin-top:8px;font-size:10px;color:#666">
          Campo mapeado: <code style="background:#F0F0F0;padding:1px 5px;border-radius:3px">OriginalEstimate / StoryPoints / Effort</code>
        </div>` : ''}
      </div>`;

    cfgAdoStatusShow('ok', `✓ ${filtered.length} work items · ${withHours.length} con horas · abriendo evaluador…`);
    toast(`✓ ${filtered.length} work items del ADO`);
    saveAllCreds();

    // Show summary in the preview area
    const previewEl = document.getElementById('cfg-ado-preview');
    if (previewEl) previewEl.innerHTML = summaryHtml;

    setTimeout(() => openAiModal(filtered), 600);
  } catch(e){ cfgAdoStatusShow('error','✗ '+e.message); }
}


/* ═══════════════════════════════════════════════════════════════
   AUTO-SYNC: "EVOLUTIVO D365 GAPs Pendientes"
   Runs automatically on page load if credentials are available.
   Also exposes adoAutoSync() for manual re-trigger.
   ═══════════════════════════════════════════════════════════════ */

const ADO_AUTO_QUERY_NAME = 'EVOLUTIVO D365 GAPs Pendientes';
let   _autoSyncTimer      = null;

function adoSyncStatusBar(state, msg, count) {
  // Update the sync indicator in #bar
  const el  = document.getElementById('ado-sync-badge');
  const lbl = document.getElementById('ado-sync-label');
  if (!el) return;

  const styles = {
    syncing: { bg:'#1848A0', color:'#fff',   icon:'⟳', spin:true  },
    ok:      { bg:'#087B50', color:'#fff',   icon:'✓', spin:false },
    warn:    { bg:'#C07800', color:'#fff',   icon:'⚠', spin:false },
    error:   { bg:'#CC1F26', color:'#fff',   icon:'✗', spin:false },
    idle:    { bg:'#3D3D3D', color:'#AAAAAA',icon:'◌', spin:false },
  };
  const s = styles[state] || styles.idle;

  el.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:3px 10px 3px 8px;'
    +'border-radius:20px;cursor:pointer;transition:all .2s;'
    +'background:'+s.bg+';color:'+s.color+';font-size:9px;font-weight:700;'
    +'letter-spacing:.04em;user-select:none';
  el.title = msg || '';

  // Icon
  const iconEl = el.querySelector('.sync-icon');
  if (iconEl) {
    iconEl.textContent = s.icon;
    iconEl.style.display  = 'inline';
    iconEl.style.animation= s.spin ? 'ado-spin .8s linear infinite' : 'none';
  }
  // Label
  if (lbl) {
    if (state === 'ok' && count != null)     lbl.textContent = 'ADO · '+count+' items';
    else if (state === 'syncing')            lbl.textContent = 'Sincronizando…';
    else if (state === 'error')              lbl.textContent = 'ADO · error';
    else if (state === 'warn')               lbl.textContent = 'ADO · sin datos';
    else                                     lbl.textContent = 'ADO';
  }
}

async function adoAutoSync(silent) {
  // Load creds from DOM (loadAllCreds must have run first)
  const org     = (document.getElementById('cfg-ado-org')?.value     || '').trim();
  const project = (document.getElementById('cfg-ado-project')?.value || '').trim();
  const pat     = (document.getElementById('cfg-ado-pat')?.value     || '').trim();

  if (!org || !project) {
    if (!silent) toast('Configura organización y proyecto ADO en ⚙ Config');
    adoSyncStatusBar('idle', 'Credenciales ADO no configuradas');
    return;
  }

  adoSyncStatusBar('syncing', 'Buscando query "'+ADO_AUTO_QUERY_NAME+'"...');
  if (typeof updateLandingAdoStatus === 'function') updateLandingAdoStatus('syncing', 'Conectando con Azure DevOps…');

  try {
    // Step 1: list all queries to find the one by name
    const qRes = await adoProxy(org, project,
      '_apis/wit/queries?$depth=2&api-version=7.1', pat);
    if (qRes.status === 401) throw new Error('PAT inválido o sin permisos (401)');
    if (!qRes.ok) throw new Error('Error '+qRes.status+' listando queries');
    const qData = await qRes.json();

    // Walk the query tree to find matching name
    let queryId = null;
    function walkQueries(node) {
      if (!node) return;
      if (node.name && node.name.toLowerCase().trim() === ADO_AUTO_QUERY_NAME.toLowerCase().trim()) {
        queryId = node.id;
        return;
      }
      if (node.children) node.children.forEach(walkQueries);
    }
    if (qData.value) qData.value.forEach(walkQueries);
    else walkQueries(qData);

    if (!queryId) {
      // Try partial match
      function walkPartial(node) {
        if (!node) return;
        if (node.name && node.name.toLowerCase().includes('evolutivo') &&
            (node.name.toLowerCase().includes('gap') || node.name.toLowerCase().includes('pendiente'))) {
          if (!queryId) queryId = node.id;
        }
        if (node.children) node.children.forEach(walkPartial);
      }
      if (qData.value) qData.value.forEach(walkPartial);
      else walkPartial(qData);
    }

    if (!queryId) {
      adoSyncStatusBar('warn', 'Query "'+ADO_AUTO_QUERY_NAME+'" no encontrada. Configúrala en ⚙ Config.');
      if (!silent) toast('⚠ Query "'+ADO_AUTO_QUERY_NAME+'" no encontrada en ADO');
      return;
    }

    adoSyncStatusBar('syncing', 'Ejecutando query…');

    // Step 2: execute the query
    const allItems = await adoFetchRequirements(org, project, pat, queryId);
    if (!allItems.length) {
      adoSyncStatusBar('warn', 'La query no devolvió work items');
      return;
    }

    // Step 3: apply to portfolio
    // IMPORTANTE: si ya hay cartera cargada (restaurada de una copia guardada o del Excel),
    // ADO debe FUSIONAR — actualizar metadatos y añadir los que falten — pero NUNCA
    // machacar los scores y horas ya guardados. Solo hace replace si la cartera está vacía.
    const mapped = allItems.map(wi => adoMapToProject(wi));
    // ¿Hay cartera cargada o guardada? Entonces SIEMPRE merge, nunca replace.
    var _hasSaved = false;
    try { _hasSaved = !!localStorage.getItem('nexus_portfolio_v1'); } catch(_) {}
    const _hadData = !!(portfolioData && portfolioData.length) || _hasSaved;
    if (_hadData) console.log('[ado] fusionando con la cartera existente (scores guardados protegidos)');
    if (typeof applyProjects === 'function') {
      applyProjects(mapped, ADO_AUTO_QUERY_NAME, _hadData, true);   // merge si ya hay datos, y SÍ añade los nuevos de ADO
    }

    // ── Auto-score SOLO los proyectos nuevos, sin puntuación previa ──
    // Nunca se recalculan los que ya tienen score: del Excel, evaluados a mano,
    // o restaurados de una copia guardada. Solo se puntúan los recién llegados de ADO.
    if (typeof ruleScoresCriterios === 'function' && typeof computeProj === 'function') {
      let scored = 0;
      portfolioData.forEach(function(p) {
        try {
          // Respetar TODO lo que ya tenga puntuación (Excel, manual o guardado)
          if (p._scoreLocked || p._fromExcel || p._manualEval || p._sfExcel != null) { return; }
          if (p.sf !== undefined && p.sf !== null && p.dimScores && p.dimScores.length) { return; }
          // Asegurar que el objeto de criterios existe antes de escribir en él
          if (!p.scores || typeof p.scores !== 'object') p.scores = {};
          // Apply rule-based criterion scores from Description + Title
          var critScores = ruleScoresCriterios(p) || {};
          CRIT_IDS.forEach(function(cid) { p.scores[cid] = critScores[cid] != null ? critScores[cid] : 5; });
          // Recompute dimension scores + final score
          var computed = computeProj(p);
          if (computed) Object.assign(p, computed);
          scored++;
        } catch(e) { console.warn('[ado autoscore]', p && p.nom, e && e.message); }
      });
      // Red de seguridad: ningún proyecto puede quedarse sin score válido,
      // porque las vistas hacen .toFixed() sobre él y romperían el render.
      portfolioData.forEach(function(p){
        if (p.sf == null || isNaN(p.sf)) p.sf = 0;
        if (!Array.isArray(p.dimScores) || p.dimScores.length < 6) p.dimScores = [0,0,0,0,0,0];
        p.dimScores = p.dimScores.map(function(d){ return (d == null || isNaN(d)) ? 0 : +d; });
        if (!p.scores || typeof p.scores !== 'object') p.scores = {};
      });
      // Re-render with new scores
      if (typeof renderPortfolio === 'function') renderPortfolio();
      if (typeof renderPools     === 'function') renderPools();
      // Guardar la cartera fusionada (mantiene scores previos + añade los nuevos de ADO)
      if (typeof savePortfolio === 'function') savePortfolio();
      adoSyncStatusBar('ok',
        '✓ '+allItems.length+' items · '+(scored?scored+' nuevos puntuados':'scores guardados respetados'),
        allItems.length);
      if (!silent) toast(scored ? ('✓ '+scored+' proyectos nuevos puntuados desde ADO')
                                : '✓ Sincronizado con ADO · puntuaciones guardadas intactas');
    }

    // Save the resolved queryId for manual re-use
    _adoCreds = { org, project, pat, queryId };
    _adoConnected = true;

    // Update badge in #bar
    const badge = document.getElementById('ado-badge');
    if (badge) {
      badge.className = 'ado-badge connected';
      const lbl2 = document.getElementById('ado-badge-lbl');
      if (lbl2) lbl2.textContent = 'ADO · '+allItems.length+' items';
    }

    adoSyncStatusBar('ok', '✓ '+allItems.length+' work items sincronizados', allItems.length);
    if (!silent) toast('✓ ADO: '+allItems.length+' items de "'+ADO_AUTO_QUERY_NAME+'" cargados');

    // Save queryId so Config tab can re-use it
    const qIdEl = document.getElementById('cfg-ado-query-id');
    if (qIdEl) qIdEl.value = queryId;
    if (typeof saveAllCreds === 'function') saveAllCreds();

  } catch(err) {
    adoSyncStatusBar('error', '✗ '+err.message);
    if (typeof updateLandingAdoStatus === 'function') updateLandingAdoStatus('error', '✗ ADO: '+err.message.substring(0,40));
    if (!silent) toast('✗ ADO sync: '+err.message);
    console.error('[ADO auto-sync]', err);
  }
}

// ── Initialize on page load ───────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // Inject spinner CSS
  if (!document.getElementById('ado-spin-style')) {
    const st = document.createElement('style');
    st.id = 'ado-spin-style';
    st.textContent = '@keyframes ado-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }

  // loadAllCreds populates the form fields from localStorage
  if (typeof loadAllCreds === 'function') loadAllCreds();

  // Auto-sync after a short delay (gives DOM time to settle)
  setTimeout(function() {
    const org = (document.getElementById('cfg-ado-org')?.value || '').trim();
    const pat = (document.getElementById('cfg-ado-pat')?.value || '').trim();
    if (org) {
      // We have at least org: attempt auto-sync silently
      adoAutoSync(true);
    } else {
      adoSyncStatusBar('idle', 'Configura credenciales ADO en ⚙ Config');
    }
  }, 800);
});

/* ═══════════════════════════════════════════════════════════════
   WRITE-BACK: Guardar scoring en Azure DevOps
   
   Campos según tipo de work item:
   • Requirement → Custom.MPGScore
   • Task        → Custom.MPGTaskScore
   
   API: PATCH _apis/wit/workitems/{id}?api-version=7.1
   Content-Type: application/json-patch+json
   Body: [{"op":"add","path":"/fields/Custom.MPGScore","value":8.75}]
   ═══════════════════════════════════════════════════════════════ */

// Field ref names per work item type
const ADO_SCORE_FIELDS = {
  'Requirement': 'Custom.MPGScore',
  'Task':        'Custom.MPGTaskScore',
};
// Fallback for unknown types
const ADO_SCORE_FIELD_DEFAULT = 'Custom.MPGScore';

function adoScoreField(workItemType) {
  if (!workItemType) return ADO_SCORE_FIELD_DEFAULT;
  // Case-insensitive match
  const t = workItemType.trim().toLowerCase();
  for (const [k,v] of Object.entries(ADO_SCORE_FIELDS)) {
    if (k.toLowerCase() === t) return v;
  }
  return ADO_SCORE_FIELD_DEFAULT;
}

// ── Write score for a single work item ───────────────────────
async function adoWriteScore(adoId, workItemType, score, pool, autoP) {
  const {org, project, pat} = _cfgAdoCreds();
  if (!org || !project) throw new Error('Configura organización y proyecto ADO en ⚙ Config');

  const field = adoScoreField(workItemType);
  const scoreVal = Math.round(score * 100) / 100; // 2 decimal places

  // Build JSON Patch document
  const patchOps = [
    { op: 'add', path: '/fields/' + field, value: scoreVal },
  ];

  const path = `_apis/wit/workitems/${adoId}?api-version=7.1`;
  const res = await adoProxy(org, project, path, pat, 'PATCH', patchOps);

  if (res.status === 401) throw new Error('PAT sin permisos de escritura (401). Crea un PAT con scope "Work Items: Read & Write".');
  if (res.status === 400) {
    const body = await res.json().catch(()=>({}));
    // Field not found → try to diagnose
    const msg = body.message || body.error || JSON.stringify(body).substring(0,120);
    throw new Error(`Campo "${field}" no encontrado (400). ${msg}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(()=>'');
    throw new Error(`Error ${res.status} al actualizar ${adoId}: ${txt.substring(0,100)}`);
  }

  return await res.json();
}

// ── Escribir la fecha estimada de inicio calculada por la app ──
// Campo destino en ADO: Custom.MPGEstimatedStartDate ("MPG Estimated Start Date").
// Solo se escribe en proyectos que NO tienen fecha real (MPG Start Date) ni Target Date:
// esos ya tienen fechas propias en ADO y la app no debe tocarlos.
const ADO_EST_START_FIELD = 'Custom.MPGEstimatedStartDate';

async function adoWriteEstStart(adoId, dateISO) {
  const {org, project, pat} = _cfgAdoCreds();
  if (!org || !project) throw new Error('Configura organización y proyecto ADO en ⚙ Config');
  const patchOps = [{ op: 'add', path: '/fields/' + ADO_EST_START_FIELD, value: dateISO }];
  const path = `_apis/wit/workitems/${adoId}?api-version=7.1`;
  const res = await adoProxy(org, project, path, pat, 'PATCH', patchOps);
  if (res.status === 401) throw new Error('PAT sin permisos de escritura (401).');
  if (res.status === 400) {
    const body = await res.json().catch(()=>({}));
    throw new Error('Campo "' + ADO_EST_START_FIELD + '" no encontrado (400). ' + (body.message||'').substring(0,100));
  }
  if (!res.ok) throw new Error('Error ' + res.status + ' al actualizar ' + adoId);
  return await res.json();
}

// ── Enviar a ADO las fechas estimadas de inicio de toda la cartera ──
async function adoSyncEstimatedDates() {
  if (typeof planBuildTimeline !== 'function') { toast('Planificación no disponible'); return; }
  const tl = planBuildTimeline();
  if (!tl.length) { toast('No hay planificación. Configura el equipo en Configuración.'); return; }

  // Solo los que la app planifica: sin fecha real de inicio y sin Target Date en ADO
  // A quién se le escribe la fecha estimada:
  //  · Sin fechas en ADO      → la app la calcula y la escribe (caso principal)
  //  · Con MPG Start Date     → el planificador usa esa fecha REAL, pero la estimada
  //                             se escribe igualmente como referencia informativa
  //  · Con Target Date        → entrega comprometida: la app no toca ese proyecto
  const eligible = tl.filter(function(t){
    const p = t.proj;
    if (!p.adoId) return false;
    const tieneTarget = !!(p.adoTargetDate && String(p.adoTargetDate).trim() !== '');
    return !tieneTarget;
  });
  const conInicioReal = eligible.filter(function(t){
    return !!(t.proj.adoStartDate && String(t.proj.adoStartDate).trim() !== '');
  }).length;

  if (!eligible.length) {
    toast('No hay proyectos a los que escribir la fecha estimada: todos tienen Target Date comprometida en ADO.');
    return;
  }
  if (!confirm('Se enviará la fecha estimada de inicio de ' + eligible.length + ' proyectos al campo\n'
      + '"MPG Estimated Start Date" de Azure DevOps.\n\n'
      + (conInicioReal ? ('De ellos, ' + conInicioReal + ' ya tienen MPG Start Date: el planificador seguirá usando\n'
          + 'esa fecha real; la estimada se escribe solo como referencia.\n\n') : '')
      + 'Los proyectos con Target Date comprometida quedan excluidos.\n\n¿Continuar?')) return;

  adoSyncStatusBar('syncing', 'Enviando fechas estimadas a ADO…');
  let ok = 0; const errors = [];
  for (const t of eligible) {
    try {
      // Fecha a escribir: la que calcula el planificador.
      // En proyectos en curso, t.startDate es la fecha REAL de ADO; en ese caso se
      // escribe igualmente (queda como confirmación de la fecha que maneja la app).
      const iso = new Date(t.startDate).toISOString().split('T')[0];
      await adoWriteEstStart(t.proj.adoId, iso);
      t.proj.adoEstStartDate = iso;
      ok++;
    } catch(err) {
      errors.push(t.proj.adoId + ': ' + err.message.substring(0,60));
    }
    await new Promise(function(r){ setTimeout(r, 120); });
  }
  adoSyncStatusBar('ok', '✓ ' + ok + '/' + eligible.length + ' fechas estimadas enviadas', ok);
  if (errors.length) {
    console.error('[adoSyncEstimatedDates]', errors);
    toast('⚠ ' + ok + ' enviadas · ' + errors.length + ' con error');
    setTimeout(function(){
      alert('Errores al enviar fechas estimadas (' + errors.length + '):\n\n'
        + errors.slice(0,8).join('\n')
        + '\n\nCausa habitual: el campo "MPG Estimated Start Date" no existe en ese tipo de work item, o el PAT no tiene permiso de escritura.');
    }, 600);
  } else {
    toast('✓ ' + ok + ' fechas estimadas de inicio enviadas a ADO');
  }
}

// ── Sync a single project to ADO ─────────────────────────────
async function adoSyncProject(nom) {
  const p = portfolioData.find(function(x){ return x.nom === nom; });
  if (!p) { toast('Proyecto no encontrado'); return; }
  if (!p.adoId) { toast('Este proyecto no tiene ID de ADO'); return; }

  const btnId = 'ado-write-btn-' + p.adoId;
  const btn   = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.textContent = '⟳ Guardando…'; }

  try {
    await adoWriteScore(p.adoId, p.adoType, p.sf || 0, getPool(p), p.autoP);
    toast('✓ Score ' + (p.sf||0).toFixed(2) + ' guardado en ADO · ' + p.nom.substring(0,30));
    if (btn) { btn.textContent = '✓ Guardado'; btn.style.background = '#087B50'; }
    // Mark as synced
    p._adoSynced = true;
    p._adoSyncedAt = new Date().toISOString();
    setTimeout(function(){
      if (btn) { btn.disabled=false; btn.textContent='↑ ADO'; btn.style.background=''; }
    }, 3000);
  } catch(err) {
    toast('✗ ' + err.message);
    if (btn) { btn.disabled=false; btn.textContent='↑ ADO'; btn.style.background='#CC1F26'; }
    setTimeout(function(){ if(btn) btn.style.background=''; }, 2000);
    console.error('[adoSyncProject]', err);
  }
}

// ── Sync ALL projects to ADO ──────────────────────────────────
async function adoSyncAllScores() {
  const conId    = portfolioData.filter(function(p){ return p.adoId; });
  const eligible = portfolioData.filter(function(p){ return p.adoId && (p.sf||0) > 0; });
  if (!eligible.length) {
    if (!conId.length) {
      toast('Ningún proyecto tiene ID de ADO. Carga proyectos desde ADO, o usa un Excel exportado por la app (el nombre debe empezar por el nº de work item).');
    } else {
      toast('Hay '+conId.length+' proyectos con ID ADO pero sin score > 0. Evalúalos primero.');
    }
    return;
  }

  // Confirmación: es una escritura real sobre ADO
  if (!confirm('Se enviarán las puntuaciones de ' + eligible.length + ' proyectos al campo de score de Azure DevOps.\n\n'
      + 'Esto sobrescribe el valor actual en ADO de cada work item.\n\n¿Continuar?')) {
    return;
  }

  const btn = document.getElementById('ado-sync-all-btn');
  if (btn) { btn.disabled=true; btn.textContent='⟳ Sincronizando…'; }

  adoSyncStatusBar('syncing', 'Guardando scores en ADO…');

  let ok=0, errors=[];
  for (const p of eligible) {
    try {
      await adoWriteScore(p.adoId, p.adoType, p.sf||0, getPool(p), p.autoP);
      p._adoSynced = true;
      p._adoSyncedAt = new Date().toISOString();
      ok++;
    } catch(err) {
      errors.push(p.adoId + ': ' + err.message.substring(0,60));
    }
    // Small delay to avoid rate-limiting
    await new Promise(function(r){ setTimeout(r, 120); });
  }

  adoSyncStatusBar('ok', '✓ ' + ok + '/' + eligible.length + ' scores guardados en ADO', ok);

  if (errors.length) {
    console.error('[adoSyncAll errors]', errors);
    toast('⚠ ' + ok + ' enviados · ' + errors.length + ' con error');
    // Mostrar el detalle de los primeros errores para poder actuar
    setTimeout(function(){
      alert('Errores al enviar scores a ADO (' + errors.length + '):\n\n'
        + errors.slice(0,8).join('\n')
        + (errors.length > 8 ? '\n\n…y ' + (errors.length-8) + ' más (ver consola).' : '')
        + '\n\nCausa habitual: el PAT no tiene permiso de escritura, o el campo de score no existe en ese tipo de work item.');
    }, 600);
  } else {
    toast('✓ ' + ok + ' scores enviados a ADO correctamente');
  }

  if (btn) {
    btn.disabled  = false;
    btn.textContent = '✓ ' + ok + '/' + eligible.length + ' sincronizados';
    setTimeout(function(){ btn.textContent='↑ Guardar todos en ADO'; }, 3000);
  }

  if (typeof renderPortfolio === 'function') renderPortfolio();
}
