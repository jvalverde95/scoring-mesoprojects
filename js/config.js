/* ═══ CONFIG STEP ══════════════════════════════════════════ */
function applyCfgWeights(){
  const total=DIMS.reduce((s,d)=>{const v=parseInt(document.getElementById('cfg-val-'+d.id)?.value||0);return s+(isNaN(v)?0:v);},0);
  if(total!==100){toast('Los pesos deben sumar 100% (ahora: '+total+'%)');return;}
  DIMS.forEach(d=>{const v=parseInt(document.getElementById('cfg-val-'+d.id)?.value||0);d.peso=v/100;});
  renderWeightEditor();
  if(portfolioData.length){portfolioData=portfolioData.map(p=>computeProj(p));renderPortfolio();}
  upd(); toast('✓ Pesos aplicados');
}
function resetCfgWeights(){
  const defs=[0.30,0.20,0.20,0.12,0.10,0.08];
  DIMS.forEach((d,i)=>{d.peso=defs[i];const sl=document.getElementById('cfg-slider-'+d.id),vl=document.getElementById('cfg-val-'+d.id);if(sl)sl.value=Math.round(defs[i]*100);if(vl)vl.value=Math.round(defs[i]*100);});
  updateCfgTotal(); applyCfgWeights();
}

/* ═══ WIZARD HEADER ════════════════════════════════════════ */
function updateWizHeader(step){
  const badge=document.getElementById('wh-badge'), nameEl=document.getElementById('wh-name'),
        metaEl=document.getElementById('wh-meta'), scoreEl=document.getElementById('wh-score'),
        btnPrev=document.getElementById('btn-prev'), btnNext=document.getElementById('btn-next');
  const DT=['var(--d1t)','var(--d2t)','var(--d3t)','var(--d4t)','var(--d5t)','var(--d6t)'];
  const DC=['var(--d1)','var(--d2)','var(--d3)','var(--d4)','var(--d5)','var(--d6)'];
  const set=(el,txt)=>{if(el) el.textContent=txt;};
  const vis=(el,v)=>{if(el) el.style.visibility=v;};
  const nxt=(txt,cls,fn)=>{if(btnNext){btnNext.textContent=txt;btnNext.className='wb '+cls;btnNext.onclick=fn;}};
  const prv=(txt,fn)=>{if(btnPrev){btnPrev.style.visibility='visible';btnPrev.textContent=txt;btnPrev.onclick=fn;}};
  if(step===0){
    if(badge){badge.style.cssText='background:var(--surf);color:var(--ink4);font-size:16px;';badge.textContent='📋';}
    set(nameEl,'datos del proyecto');set(metaEl,'información básica · paso 0 de 7');
    if(scoreEl){scoreEl.textContent='—';scoreEl.style.color='var(--ink4)';}
    vis(btnPrev,'hidden'); nxt('empezar D1 →','next',()=>stepNav(1));
  } else if(step==='summary'){
    if(badge){badge.style.cssText='background:var(--gl);font-size:14px;';badge.textContent='✓';}
    set(nameEl,'resumen y resultados');set(metaEl,'scoring final · sigmoid boost + aging factor');
    const sf=scoreFinal(getReqDate());
    if(scoreEl){scoreEl.textContent=sf.toFixed(1);scoreEl.style.color=scColorHex(sf);}
    vis(btnPrev,'visible');prv('← D6',()=>goStep(6));nxt('↺ nueva evaluación','fin',()=>resetAll());
  } else if(step==='charts'){
    if(badge){badge.style.cssText='background:#EEF3FC;font-size:16px;';badge.textContent='📊';}
    set(nameEl,'gráficas de cartera');set(metaEl,(portfolioData.length||0)+' proyectos');
    if(scoreEl){scoreEl.textContent=portfolioData.length||'—';scoreEl.style.color='var(--ink)';}
    vis(btnPrev,'hidden');nxt('ir al resumen →','next',()=>goStep('summary'));
  } else if(step==='pools'){
    if(badge){badge.style.cssText='background:#FAF5E6;font-size:16px;';badge.textContent='🗂';}
    set(nameEl,'clasificación por nivel');set(metaEl,'pools de ejecución por horas');
    const counts={L:0,M:0,S:0};portfolioData.forEach(p=>{const pool=getPool(p);if(pool)counts[pool]++;});
    if(scoreEl){scoreEl.textContent=counts.L+'/'+counts.M+'/'+counts.S;scoreEl.style.color='var(--ink)';}
    vis(btnPrev,'hidden');nxt('ir al resumen →','next',()=>goStep('summary'));
  } else if(step==='config'){
    if(badge){badge.style.cssText='background:var(--surf);font-size:16px;';badge.textContent='⚙';}
    set(nameEl,'configuración del modelo');set(metaEl,'pesos · umbrales · Dataverse');
    if(scoreEl){scoreEl.textContent='—';scoreEl.style.color='var(--ink4)';}
    vis(btnPrev,'hidden');nxt('aplicar y volver →','fin',()=>goStep('summary'));
  } else {
    const d=DIMS[step-1]; if(!d) return;
    if(badge){badge.style.cssText=`background:${DT[step-1]};color:${DC[step-1]};font-size:10px;font-weight:800;`;badge.textContent=d.id;}
    set(nameEl,d.nom);set(metaEl,`Peso: ${Math.round(d.peso*100)}% · ${d.criterios.length} criterios · paso ${step} de 7`);
    const ds=scoreDim(d.criterios);
    if(scoreEl){scoreEl.textContent=ds.toFixed(1);scoreEl.style.color=scColorHex(ds);}
    vis(btnPrev,'visible');prv(step===1?'← datos':`← D${step-1}`,()=>stepNav(-1));
    nxt(step===6?'ver resumen →':`D${step+1} →`,step===6?'fin':'next',()=>stepNav(1));
  }
}
function renderConfigStep() {
  renderCfgDimRows();
  renderWeightEditor();
  dvLoadCfg();
}

function updateCfgTotal() {
  const total = DIMS.reduce((s, d) => {
    const v = parseInt(document.getElementById('cfg-val-' + d.id)?.value || 0);
    return s + (isNaN(v) ? 0 : v);
  }, 0);
  const el = document.getElementById('cfg-total');
  if (el) {
    el.textContent = total + '%';
    el.style.color = total === 100 ? 'var(--d3)' : 'var(--d1)';
  }
}
