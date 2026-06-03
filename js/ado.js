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
function adoBasicAuth(pat){ return 'Basic '+btoa(':'+pat); }

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
  const fields=['System.Id','System.Title','System.WorkItemType','System.State',
    'System.AssignedTo','System.CreatedDate','System.Description',
    'System.AreaPath','System.Tags','Microsoft.VSTS.Common.Priority','System.Parent'];
  const allItems=[];
  for(let i=0;i<ids.length;i+=200){
    const bRes=await adoProxy(org, project, `_apis/wit/workitemsbatch?api-version=7.1`, pat, 'POST', {ids:ids.slice(i,i+200),fields});
    if(!bRes.ok) throw new Error(`Error ${bRes.status} cargando detalles.`);
    const bData=await bRes.json(); allItems.push(...(bData.value||[]));
  }
  return allItems;
}

function adoMapToProject(wi) {
  const f=wi.fields||{};
  const title=(f['System.Title']||`Work Item ${wi.id}`).trim();
  const assignee=f['System.AssignedTo'];
  const sponsor=typeof assignee==='object'?(assignee.displayName||assignee.uniqueName||'').replace(/<[^>]+>/g,'').trim():String(assignee||'').replace(/<[^>]+>/g,'').trim();
  const descRaw=f['System.Description']||'';
  const desc=descRaw.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().substring(0,400);
  const areaPath=f['System.AreaPath']||'';
  const area=(areaPath.includes('\\') ? areaPath.split('\\').pop() : areaPath.split('/').pop()).trim()||'Sin área';
  const tags=(f['System.Tags']||'').split(';').map(t=>t.trim()).filter(Boolean);
  let reqDate=null;
  const cd=f['System.CreatedDate'];
  if(cd) reqDate=cd.substring(0,10);
  const scores={}; CRIT_IDS.forEach(cid=>{scores[cid]=5;});
  return {nom:`${wi.id} — ${title}`,area,sponsor,scores,reqDate,regDate:null,
    adoId:wi.id,adoTitle:title,adoType:f['System.WorkItemType']||'',
    adoState:f['System.State']||'',adoPriority:parseInt(f['Microsoft.VSTS.Common.Priority'])||3,
    adoDesc:desc,adoTags:tags,adoRaw:f};
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

function cfgAdoSaveCreds(){
  const c=_cfgAdoCreds();
  const set=(id,v)=>{const e=document.getElementById(id);if(e&&v)e.value=v;};
  set('ado-org',c.org); set('ado-project',c.project); if(c.pat) set('ado-pat',c.pat);
  saveAllCreds();
  toast('Credenciales guardadas');
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
  const {org,project,pat}=_cfgAdoCreds();
  // org and project required; PAT optional (server uses ADO_PAT env var if not provided)
  if(!org||!project){cfgAdoStatusShow('error','Rellena organización y proyecto.');return;}
  cfgAdoStatusShow('loading','Verificando credenciales...');
  try{
    // Step 1: List all projects to find the correct name (avoids 404 from case/space issues)
    cfgAdoStatusShow('loading', 'Conectando con Azure DevOps…');
    let allProjects = [];
    try {
      const listRes = await adoProxy(org, null, '_apis/projects?api-version=7.1', pat);
      if (listRes.status === 401) throw new Error('PAT inválido o sin permisos (401). Comprueba el token en Azure DevOps → User Settings → Personal Access Tokens.');
      if (listRes.status === 403) throw new Error('Sin permisos (403). El PAT necesita scope "Project and Team (Read)".');
      if (!listRes.ok) throw new Error(`Error HTTP ${listRes.status} conectando con Azure DevOps.`);
      const listData = await listRes.json();
      allProjects = listData.value || [];
    } catch(fetchErr) {
      if (fetchErr.message.includes('PAT') || fetchErr.message.includes('permisos') || fetchErr.message.includes('HTTP')) throw fetchErr;
      throw new Error('No se puede conectar con Azure DevOps: ' + fetchErr.message);
    }

    // Find project by name (case-insensitive)
    const projMatch = allProjects.find(p =>
      p.name.toLowerCase() === project.toLowerCase() ||
      p.name.toLowerCase().includes(project.toLowerCase()) ||
      project.toLowerCase().includes(p.name.toLowerCase())
    );
    const projName = projMatch ? projMatch.name : project;
    const projId   = projMatch ? projMatch.id   : project;

    if (!projMatch && allProjects.length > 0) {
      // Show available projects in the error to help user
      const names = allProjects.map(p => p.name).join(', ');
      throw new Error(`Proyecto "${project}" no encontrado. Proyectos disponibles: ${names}`);
    }

    cfgAdoStatusShow('loading', `✓ Conectado · "${projName}" · Cargando queries…`);

    // Step 2: Load queries using the exact project name from ADO
    let qRes;
    try {
      qRes = await adoProxy(org, projName,
        `_apis/wit/queries?$depth=2&$expand=all&api-version=7.1`, pat);
    } catch(fetchErr) {
      throw new Error('Error de red cargando queries: ' + fetchErr.message);
    }
    if(!qRes.ok) throw new Error(`No se pudieron cargar las queries (${qRes.status}).`);
    // Update project field with exact name for future use
    const projField = document.getElementById('cfg-ado-project');
    if (projField && projMatch) projField.value = projName;
    const qData=await qRes.json();
    const allQueries=[];
    function walkQueries(node,path=''){
      if(!node) return;
      const fullPath=path?`${path} / ${node.name}`:node.name;
      if(node.queryType) allQueries.push({id:node.id,name:node.name,path:fullPath,queryType:node.queryType});
      if(node.children) node.children.forEach(c=>walkQueries(c,path?fullPath:node.name));
    }
    (qData.value||[qData]).forEach(root=>walkQueries(root,''));
    const sel=document.getElementById('cfg-ado-query-select');
    if(sel){
      sel.innerHTML='<option value="">— Selecciona una query —</option>';
      allQueries.forEach(q=>{
        const opt=document.createElement('option');
        opt.value=q.id; opt.textContent=q.path||q.name;
        opt.dataset.queryType=q.queryType; opt.dataset.name=q.name;
        sel.appendChild(opt);
      });
    }
    const autoMatch=allQueries.find(q=>q.name.toLowerCase().includes('evolutivo')||q.name.toLowerCase().includes('pendientes')||q.name.toLowerCase().includes('gaps'));
    if(autoMatch){sel.value=autoMatch.id;cfgAdoQuerySelected(autoMatch.id);}
    const qs=document.getElementById('cfg-ado-query-section'); if(qs) qs.style.display='block';
    const badge=document.getElementById('cfg-ado-conn-badge');
    if(badge){badge.style.display='inline-block';badge.style.background='#EEF3FC';badge.style.color='#0078D4';badge.style.border='1px solid rgba(0,120,212,.2)';badge.textContent=`✓ conectado · ${allQueries.length} queries`;}
    cfgAdoStatusShow('ok',`✓ Conectado · "${projData.name}" · ${allQueries.length} queries${autoMatch?` · "${autoMatch.name}" pre-seleccionada`:''}`);
    saveAllCreds();
  } catch(e){
    cfgAdoStatusShow('error','✗ '+e.message);
    const qs=document.getElementById('cfg-ado-query-section'); if(qs) qs.style.display='none';
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
    cfgAdoStatusShow('ok',`✓ ${filtered.length} work items listos · Abriendo evaluador...`);
    toast(`✓ ${filtered.length} work items del ADO`);
    saveAllCreds();
    setTimeout(()=>openAiModal(filtered),300);
  } catch(e){ cfgAdoStatusShow('error','✗ '+e.message); }
}