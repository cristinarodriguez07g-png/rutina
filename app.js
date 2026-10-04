
const KEY="rutina_pwa_v2";
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36);
const today=()=>new Date().toISOString().slice(0,10);
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const fmt=k=>new Date(k+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short"});
const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function load(){
  let x;
  try{x=JSON.parse(localStorage.getItem(KEY))||{appTitle:"RUTINA",routines:[],sessions:{}}}
  catch{x={appTitle:"RUTINA",routines:[],sessions:{}}}
  x.appTitle=x.appTitle||"RUTINA"; x.routines=x.routines||[]; x.sessions=x.sessions||{};
  x.routines.forEach(r=>r.days?.forEach(d=>d.exercises?.forEach(e=>{
    e.warmupSets=Math.max(0,Number(e.warmupSets||0));
    e.restSeconds=Math.max(0,Number(e.restSeconds??150));
    e.unit=e.unit||"kg"; e.sessionUnit=e.sessionUnit||e.unit; e.sets=e.sets||[];
  })));
  return x;
}
let db=load();
let nav="home", currentRoutineId=null, currentDayId=null, currentExerciseId=null;
let restTimer={endAt:0,remaining:0,exerciseName:"",interval:null};

function save(){localStorage.setItem(KEY,JSON.stringify(db))}
function activeRoutine(){return db.routines.find(r=>r.id===currentRoutineId)||db.routines[0]}
function activeDay(){const r=activeRoutine();return r?.days.find(d=>d.id===currentDayId)}
function sessionKey(rid,did,date=today()){return `${rid}|${did}|${date}`}
function getSession(rid,did,date=today()){return db.sessions[sessionKey(rid,did,date)]}
function ensureSession(rid,did,date=today()){
  const k=sessionKey(rid,did,date);
  if(!db.sessions[k]) db.sessions[k]={rid,did,date,started:false,completed:false,comments:"",sets:{}};
  return db.sessions[k]
}
function setKey(eid,si){return `${eid}|${si}`}
function isDayComplete(rid,did,date=today()){
  const s=getSession(rid,did,date); if(!s) return false;
  const d=db.routines.find(r=>r.id===rid)?.days.find(x=>x.id===did); if(!d||!d.exercises.length) return false;
  return d.exercises.every(e=>e.sets.some((_,i)=>s.sets[setKey(e.id,i)]?.done));
}
function escapeAndRender(){render()}

function render(){
  document.getElementById("appTitle").textContent=db.appTitle||"RUTINA";
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.nav===nav));
  let html="";
  if(nav==="home") html=homeView();
  else if(nav==="routine") html=routineView();
  else if(nav==="stats") html=statsView();
  else if(nav==="day") html=dayView();
  else if(nav==="workout") html=workoutView();
  document.getElementById("screen").innerHTML=html;
  bind();
  updateRestTimerUI();
}

function homeView(){
  const r=db.routines[0];
  if(!r) return `<div class="empty" style="margin-top:40px"><div style="font-size:48px">🏋️</div><h2 style="margin:12px 0 7px">Crea tu primera rutina</h2><p>Nombre, días, ejercicios, series y progreso. Todo queda guardado en este iPhone.</p><button class="btn primary" style="margin-top:15px" data-action="new-routine">Crear rutina</button></div>`;
  const done=r.days.filter(d=>isDayComplete(r.id,d.id)).length;
  const total=r.days.length, sessions=Object.values(db.sessions).filter(s=>s.rid===r.id&&s.completed).length;
  return `<section class="hero">
    <div class="between"><div><div class="eyebrow">RUTINA ACTIVA</div><div class="hero-title">${escapeHtml(r.name)}</div></div><button class="round-btn" data-action="edit-routine">✎</button></div>
    <div class="hero-sub">${done}/${total} días completados</div>
    <div class="progress"><span style="width:${total?Math.round(done/total*100):0}%"></span></div>
    <div class="small">${sessions} sesiones guardadas en el historial</div>
  </section>
  <div class="grid3">
    <div class="stat"><b>${streak()}</b><span>racha actual</span></div>
    <div class="stat"><b>${sessions}</b><span>días entrenados</span></div>
    <div class="stat"><b>${weeksActive()}</b><span>semanas</span></div>
  </div>
  <div class="between"><div class="section-title" style="margin-top:0">Esta semana</div><button class="btn secondary" data-action="manage-routine">Editar</button></div>
  ${r.days.map((d,i)=>`<div class="card day-card" data-open-day="${d.id}">
    <div class="day-badge">${i+1}</div><div class="card-main"><div class="card-title">${escapeHtml(d.name||"Día "+(i+1))}</div><div class="card-meta">${d.exercises.length} ejercicios ${isDayComplete(r.id,d.id)?"· completado":""}</div></div>
    <div class="check ${isDayComplete(r.id,d.id)?"done":""}">${isDayComplete(r.id,d.id)?"✓":"→"}</div>
  </div>`).join("")}
  <button class="btn primary wide" data-action="start-suggested" style="margin-top:7px">Entrenar</button>`;
}

function routineView(){
  const r=activeRoutine();
  if(!r) return `<div class="empty">No hay rutina todavía.</div>`;
  return `<div class="between" style="margin-bottom:12px"><div><div class="eyebrow">RUTINA</div><h2>${escapeHtml(r.name)}</h2></div><button class="round-btn" data-action="edit-routine">✎</button></div>
  <div class="card"><div class="between"><div><b>${r.days.length} días de entrenamiento</b><div class="small">Puedes crear, borrar y renombrar los días sin límite.</div></div><button class="btn secondary" data-action="add-day">+ Día</button></div></div>
  ${r.days.map((d,i)=>`<div class="card day-card" data-open-day="${d.id}">
    <div class="day-badge">${i+1}</div><div class="card-main"><div class="card-title">${escapeHtml(d.name)}</div><div class="card-meta">${d.exercises.length} ejercicios</div></div>
    <div class="check">→</div>
  </div>`).join("")}`;
}

function dayView(){
  const r=activeRoutine(), d=activeDay();
  if(!r||!d){nav="routine";return routineView()}
  const s=ensureSession(r.id,d.id);
  return `<div class="between" style="margin-bottom:13px">
    <button class="round-btn" data-action="back-routine">←</button>
    <div style="text-align:center;flex:1"><div class="eyebrow">${escapeHtml(r.name)}</div><h2>${escapeHtml(d.name)}</h2></div>
    <button class="round-btn" data-action="edit-day">✎</button>
  </div>
  <div class="card">
    <div class="between"><div><b>${d.exercises.length} ejercicios</b><div class="small">Añade todos los que necesites.</div></div><button class="btn secondary" data-action="add-exercise">+ Ejercicio</button></div>
  </div>
  ${d.exercises.length?d.exercises.map(e=>`<div class="card">
    <div class="exercise-head">
      <div><div class="exercise-name">${escapeHtml(e.name)}</div><div class="exercise-meta">${e.sets.length} sets · ${e.defaultReps||0} reps objetivo</div></div>
      <div class="actions"><button class="circle" data-action="edit-exercise" data-eid="${e.id}">✎</button><button class="circle" data-action="delete-exercise" data-eid="${e.id}">×</button></div>
    </div>
    <div class="small" style="margin-top:10px">Pulsa para registrar peso, reps, completado y ver tu semana anterior.</div>
  </div>`).join(""):`<div class="empty">Este día todavía no tiene ejercicios.</div>`}
  <div class="sticky-cta"><button class="btn primary wide" data-action="start-workout">COMENZAR ENTRENAMIENTO</button></div>`;
}

function workoutView(){
  const r=activeRoutine(), d=activeDay();
  if(!r||!d){nav="home";return homeView()}
  const s=ensureSession(r.id,d.id);
  return `<div class="between" style="margin-bottom:12px">
    <button class="round-btn" data-action="back-day">←</button>
    <div style="text-align:center;flex:1"><div class="eyebrow">ENTRENAMIENTO</div><h2>${escapeHtml(d.name)}</h2></div>
    <button class="round-btn" data-action="finish-workout">✓</button>
  </div>
  <div id="restTimerBox" class="rest-timer hidden"><div><div id="restLabel" class="rest-label">Descanso</div><div id="restTime" class="rest-time">00:00</div></div><button class="btn secondary" data-action="skip-rest">Saltar</button></div>
  ${d.exercises.length?d.exercises.map(e=>workoutExercise(r,d,s,e)).join(""):`<div class="empty">Agrega ejercicios a este día antes de entrenar.</div>`}
  <div class="card comment"><label class="label">COMENTARIOS DE ESTA SESIÓN</label><textarea class="textarea" data-session-comment placeholder="Ej. con aproximaciones, buena técnica, cansancio...">${escapeHtml(s.comments||"")}</textarea></div>
  <div class="sticky-cta"><button class="btn primary wide" data-action="finish-workout">TERMINAR ENTRENAMIENTO</button></div>`;
}

function workoutExercise(r,d,s,e){
  const prev=previousRecord(r.id,d.id,e.id,today());
  const currentUnit=e.sessionUnit||e.unit||"kg";
  const warmupRows=Array.from({length:e.warmupSets||0},(_,i)=>setRow(e,s,d,i,{warmup:true},currentUnit));
  const workRows=e.sets.map((set,i)=>setRow(e,s,d,i,{warmup:false},currentUnit)).join("");
  return `<div class="card exercise-card">
    <div class="exercise-head">
      <div><div class="exercise-name">${escapeHtml(e.name)}</div><div class="exercise-meta">${e.warmupSets||0} aproximaciones · ${e.sets.length} sets · objetivo ${e.defaultReps||"—"} reps</div></div>
      <button class="circle" data-action="exercise-menu" data-eid="${e.id}">⋯</button>
    </div>
    <div class="segmented">
      <button class="${currentUnit==="kg"?"active":""}" data-action="set-unit" data-eid="${e.id}" data-unit="kg">KG</button>
      <button class="${currentUnit==="lb"?"active":""}" data-action="set-unit" data-eid="${e.id}" data-unit="lb">LB</button>
    </div>
    ${e.warmupSets?`<div class="subhead">APROXIMACIONES</div><div class="set-head"><span></span><span>PESO (${currentUnit})</span><span>REPS</span><span></span></div>${warmupRows.join("")}`:""}
    <div class="subhead">SETS DE TRABAJO</div><div class="set-head"><span></span><span>PESO (${currentUnit})</span><span>REPS</span><span></span></div>${workRows}
    <div class="row-actions"><button class="btn secondary" data-action="add-set" data-eid="${e.id}">+ Agregar set</button><button class="btn secondary" data-action="add-warmup" data-eid="${e.id}">+ Aproximación</button></div>
    ${prev?`<div class="prev"><b>Semana anterior:</b> ${prev.map(x=>`${x.weight||0} ${x.unit||"kg"} × ${x.reps||0}`).join(" · ")}</div>`:"<div class=\"prev\">Semana anterior: todavía no hay registro.</div>"}
  </div>`;
}
function setRow(e,s,d,si,opts,unit){
  const key=opts.warmup?setKey(e.id,"w"+si):setKey(e.id,si);
  const base=opts.warmup?{weight:"",reps:"",unit,done:false}: {weight:"",reps:e.sets[si]?.reps||"",unit,done:false};
  const v=s.sets[key]||base;
  return `<div class="set-row ${v.done?"done":""}">
    <div class="set-num">${si+1}</div>
    <input class="set-input" type="number" step="0.5" inputmode="decimal" placeholder="0" value="${escapeHtml(v.weight)}" data-field="weight" data-eid="${e.id}" data-si="${si}" data-warmup="${opts.warmup}">
    <input class="set-input" type="number" step="1" inputmode="numeric" placeholder="${escapeHtml(e.defaultReps||"reps")}" value="${escapeHtml(v.reps)}" data-field="reps" data-eid="${e.id}" data-si="${si}" data-warmup="${opts.warmup}">
    <button class="set-done ${v.done?"done":""}" data-action="toggle-set" data-eid="${e.id}" data-si="${si}" data-warmup="${opts.warmup}">${v.done?"✓":""}</button>
  </div>`;
}

function statsView(){
  const r=activeRoutine();
  if(!r) return `<div class="empty">Crea una rutina para empezar a medir tu progreso.</div>`;
  const sessions=Object.values(db.sessions).filter(s=>s.rid===r.id&&s.completed).sort((a,b)=>b.date.localeCompare(a.date));
  const dates=[...new Set(sessions.map(s=>s.date))];
  const now=new Date(); const first=new Date(now.getFullYear(),now.getMonth(),1), daysIn=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(), start=first.getDay()||7;
  const monthName=now.toLocaleDateString("es-MX",{month:"long",year:"numeric"});
  const cal=[];
  for(let i=1;i<start;i++) cal.push(`<div></div>`);
  for(let d=1;d<=daysIn;d++){
    const k=iso(new Date(now.getFullYear(),now.getMonth(),d));
    cal.push(`<div class="cal-day ${dates.includes(k)?"done ":""}${k===today()?"today":""}">${d}</div>`);
  }
  return `<div class="between"><div><div class="eyebrow">PROGRESO</div><h2>Mi entrenamiento</h2></div><button class="round-btn" data-action="reset-data">↺</button></div>
    <div class="grid3">
      <div class="stat"><b>${streak()}</b><span>racha</span></div>
      <div class="stat"><b>${sessions.length}</b><span>días entrenados</span></div>
      <div class="stat"><b>${weeksActive()}</b><span>semanas</span></div>
    </div>
    <div class="card"><div class="month-nav"><h3 style="text-transform:capitalize">${monthName}</h3><span class="small">${sessions.length} sesiones</span></div>
      <div class="calendar">${["L","M","X","J","V","S","D"].map(x=>`<div class="cal-head">${x}</div>`).join("")}${cal.join("")}</div>
    </div>
    <div class="section-title">Historial reciente</div>
    ${sessions.slice(0,12).map(s=>{
      const d=r.days.find(x=>x.id===s.did);
      return `<div class="history"><b>${escapeHtml(d?.name||"Día")}</b><div class="vals">${fmt(s.date)} · sesión completada</div>${s.comments?`<div class="vals">“${escapeHtml(s.comments)}”</div>`:""}</div>`;
    }).join("") || `<div class="empty">Todavía no hay entrenamientos terminados.</div>`}`;
}

function previousRecord(rid,did,eid,date){
  const candidates=Object.values(db.sessions).filter(s=>s.rid===rid&&s.did===did&&s.date<date&&s.completed).sort((a,b)=>b.date.localeCompare(a.date));
  for(const s of candidates){
    const vals=[];
    let i=0;
    while(true){
      const v=s.sets[setKey(eid,i)];
      if(!v) break;
      vals.push(v);i++;
    }
    if(vals.length)return vals;
  }
  return null;
}
function streak(){
  const r=activeRoutine(); if(!r)return 0;
  const dates=[...new Set(Object.values(db.sessions).filter(s=>s.rid===r.id&&s.completed).map(s=>s.date))].sort().reverse();
  if(!dates.length)return 0;
  let n=0,cur=new Date(today()+"T12:00:00");
  // A streak counts consecutive training days; if today has not been done, allow yesterday as start.
  if(!dates.includes(today())) cur.setDate(cur.getDate()-1);
  while(dates.includes(iso(cur))){n++;cur.setDate(cur.getDate()-1)}
  return n;
}
function weeksActive(){
  const r=activeRoutine(); if(!r)return 0;
  const ws=new Set(Object.values(db.sessions).filter(s=>s.rid===r.id&&s.completed).map(s=>{
    const d=new Date(s.date+"T12:00:00"); const day=d.getDay()||7; d.setDate(d.getDate()-day+1); return iso(d)
  }));
  return ws.size;
}
function showToast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>t.classList.remove("show"),1800)}

function closeModal(){
  $("#modalRoot").innerHTML="";
}
function openModal(title, body, onSave, saveText="Guardar"){
  $("#modalRoot").innerHTML=`<div class="modal-bg" data-modal-backdrop><div class="modal"><div class="modal-top"><h3>${title}</h3><button class="close" type="button" data-modal-close aria-label="Cerrar">×</button></div>${body}<div class="modal-actions"><button class="btn ghost" type="button" data-modal-close>Cancelar</button><button class="btn primary" type="button" id="modalSave">${saveText}</button></div></div></div>`;
  $$('[data-modal-close]').forEach(b=>b.onclick=closeModal);
  $("[data-modal-backdrop]").onclick=(ev)=>{if(ev.target===ev.currentTarget)closeModal()};
  $("#modalSave").onclick=()=>{onSave();closeModal();render()};
}
function editRoutine(){
  const r=activeRoutine();
  openModal("Editar rutina",`<div class="form"><div><label class="label">NOMBRE DE LA RUTINA</label><input class="input" id="mName" value="${escapeHtml(r?.name||"")}"></div></div>`,
    ()=>{r.name=$("#mName").value.trim()||"Mi rutina";save()});
}
function addRoutine(){
  openModal("Nueva rutina",`<div class="form"><div><label class="label">NOMBRE</label><input class="input" id="mName" placeholder="Ej. PPL X UP"></div></div>`,
    ()=>{const r={id:uid(),name:$("#mName").value.trim()||"Mi rutina",days:[]};db.routines.push(r);currentRoutineId=r.id;save()});
}
function addDay(){
  const r=activeRoutine();
  openModal("Agregar día",`<div class="form"><div><label class="label">NOMBRE DEL DÍA</label><input class="input" id="mName" placeholder="Ej. Lunes - Pecho"></div></div>`,
    ()=>{r.days.push({id:uid(),name:$("#mName").value.trim()||`Día ${r.days.length+1}`,exercises:[]});save()});
}
function editDay(){
  const d=activeDay();
  openModal("Editar día",`<div class="form"><div><label class="label">NOMBRE</label><input class="input" id="mName" value="${escapeHtml(d.name)}"></div><div class="small">Puedes escribir libremente: Lunes - Pecho, Martes - Espalda, etc.</div></div>`,
    ()=>{d.name=$("#mName").value.trim()||d.name;save()});
}
function addExercise(eid=null){
  const d=activeDay();
  const e=eid?d.exercises.find(x=>x.id===eid):null;
  const setCount=e?.sets?.length||3;
  openModal(e?"Editar ejercicio":"Agregar ejercicio",`
    <div class="form">
      <div><label class="label">EJERCICIO</label><input class="input" id="mName" value="${escapeHtml(e?.name||"")}" placeholder="Ej. Press banca"></div>
      <div class="two">
        <div><label class="label">APROXIMACIONES</label><input class="input" id="mWarm" type="number" min="0" step="1" value="${e?.warmupSets||0}"></div>
        <div><label class="label">SETS DE TRABAJO</label><input class="input" id="mSets" type="number" min="1" step="1" value="${setCount}"></div>
      </div>
      <div class="two">
        <div><label class="label">REPS OBJETIVO</label><input class="input" id="mReps" type="number" min="0" step="1" value="${e?.defaultReps||8}"></div>
        <div><label class="label">DESCANSO</label><input class="input" id="mRest" type="number" min="0" step="15" value="${Math.round((e?.restSeconds??150)/60)}"><div class="tiny muted" style="margin-top:5px">minutos; empieza al completar una serie</div></div>
      </div>
      <div><label class="label">UNIDAD INICIAL</label>
        <select class="select" id="mUnit"><option value="kg" ${(e?.unit||"kg")==="kg"?"selected":""}>Kilogramos (kg)</option><option value="lb" ${(e?.unit||"kg")==="lb"?"selected":""}>Libras (lb)</option></select>
      </div>
    </div>`,
    ()=>{
      const name=$("#mName").value.trim()||"Ejercicio";
      const warm=Math.max(0,parseInt($("#mWarm").value||0,10));
      const n=Math.max(1,parseInt($("#mSets").value||3,10));
      const reps=Math.max(0,parseInt($("#mReps").value||0,10));
      const restMin=Math.max(0,parseFloat($("#mRest").value||0));
      const restSeconds=Math.round(restMin*60);
      if(e){
        e.name=name;e.defaultReps=reps;e.unit=$("#mUnit").value;e.restSeconds=restSeconds;e.warmupSets=warm;e.sessionUnit=e.sessionUnit||e.unit;
        while(e.sets.length<n)e.sets.push({reps});while(e.sets.length>n)e.sets.pop()
      }else d.exercises.push({id:uid(),name,defaultReps:reps,unit:$("#mUnit").value,sessionUnit:$("#mUnit").value,restSeconds,warmupSets:warm,sets:Array.from({length:n},()=>({reps}))});
      save();
    });
}

function deleteExercise(eid){
  if(confirm("¿Eliminar este ejercicio y sus registros de sesiones?")){
    const d=activeDay();d.exercises=d.exercises.filter(e=>e.id!==eid);save();render()
  }
}
function deleteDay(){
  const r=activeRoutine(), d=activeDay();
  if(confirm(`¿Eliminar "${d.name}"? Los historiales de ese día también dejarán de aparecer en esta rutina.`)){
    r.days=r.days.filter(x=>x.id!==d.id);
    Object.keys(db.sessions).forEach(k=>{if(k.startsWith(r.id+"|"+d.id+"|"))delete db.sessions[k]});
    save();nav="routine";render()
  }
}
function setUnit(eid,unit){
  const d=activeDay(),e=d.exercises.find(x=>x.id===eid),s=ensureSession(activeRoutine().id,d.id);
  const old=e.sessionUnit||e.unit||"kg";
  if(old===unit)return;
  const convert=v=>{
    if(!v||v.weight===""||Number.isNaN(Number(v.weight)))return;
    v.weight=unit==="lb"?(Number(v.weight)*2.20462).toFixed(1):(Number(v.weight)/2.20462).toFixed(1);v.unit=unit
  };
  Object.entries(s.sets).forEach(([k,v])=>{if(k.startsWith(e.id+"|"))convert(v)});
  e.sessionUnit=unit;save();render();
}
function updateSet(eid,si,field,val,warmup=false){
  const r=activeRoutine(),d=activeDay(),e=d.exercises.find(x=>x.id===eid),s=ensureSession(r.id,d.id);
  const key=setKey(eid,warmup?"w"+si:si); if(!s.sets[key]) s.sets[key]={weight:"",reps:warmup?"":e.sets[si]?.reps||"",unit:e.sessionUnit||e.unit||"kg",done:false};
  s.sets[key][field]=val; save();
}
function startRestTimer(e){
  const secs=Math.max(0,Number(e.restSeconds||0));
  if(!secs){restTimer={endAt:0,remaining:0,exerciseName:"",interval:null};return}
  clearInterval(restTimer.interval);
  restTimer.endAt=Date.now()+secs*1000;restTimer.remaining=secs;restTimer.exerciseName=e.name;
  updateRestTimerUI();
  restTimer.interval=setInterval(()=>{restTimer.remaining=Math.max(0,Math.ceil((restTimer.endAt-Date.now())/1000));updateRestTimerUI();if(restTimer.remaining<=0){clearInterval(restTimer.interval);showToast("Descanso terminado");}},250);
}
function stopRestTimer(){clearInterval(restTimer.interval);restTimer={endAt:0,remaining:0,exerciseName:"",interval:null};updateRestTimerUI()}
function formatTime(sec){const m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
function updateRestTimerUI(){
  const box=$("#restTimerBox");if(!box)return;
  if(!restTimer.remaining){box.classList.add("hidden");return}
  box.classList.remove("hidden");
  const time=$("#restTime");if(time)time.textContent=formatTime(restTimer.remaining);
  const label=$("#restLabel");if(label)label.textContent=`Descanso · ${restTimer.exerciseName}`;
}
function toggleSet(eid,si,warmup=false){
  const r=activeRoutine(),d=activeDay(),e=d.exercises.find(x=>x.id===eid),s=ensureSession(r.id,d.id);
  const key=setKey(eid,warmup?"w"+si:si); if(!s.sets[key]) s.sets[key]={weight:"",reps:warmup?"":e.sets[si]?.reps||"",unit:e.sessionUnit||e.unit||"kg",done:false};
  s.sets[key].done=!s.sets[key].done;s.started=true;save();
  if(s.sets[key].done){startRestTimer(e)}else if(restTimer.exerciseName===e.name){stopRestTimer()}
  render();updateRestTimerUI();
}
function addSet(eid){const d=activeDay(),e=d.exercises.find(x=>x.id===eid);e.sets.push({reps:e.defaultReps||""});save();render()}
function addWarmup(eid){const d=activeDay(),e=d.exercises.find(x=>x.id===eid);e.warmupSets=(e.warmupSets||0)+1;save();render()}

function finishWorkout(){
  const r=activeRoutine(),d=activeDay(),s=ensureSession(r.id,d.id);
  s.completed=true;s.started=true;s.comments=$("[data-session-comment]")?.value||s.comments||"";
  s.finishedAt=new Date().toISOString();save();showToast("Entrenamiento guardado");nav="home";render();
}
function exerciseMenu(eid){
  openModal("Opciones del ejercicio",`<div class="form">
    <button class="btn secondary wide" id="editE">Editar nombre / sets</button>
    <button class="btn danger wide" id="delE">Eliminar ejercicio</button>
  </div>`,()=>{}, "Cerrar");
  $("#modalSave").onclick=()=>{$("#modalRoot").innerHTML="";render()};
  $("#editE").onclick=()=>{$("#modalRoot").innerHTML="";addExercise(eid)};
  $("#delE").onclick=()=>{$("#modalRoot").innerHTML="";deleteExercise(eid)};
}
function settings(){
  openModal("Ajustes",`<div class="form">
    <div><label class="label">NOMBRE MOSTRADO</label><input class="input" id="mAppTitle" value="${escapeHtml(db.appTitle||"RUTINA")}"></div>
    <div class="small">Los datos se guardan localmente en este navegador. Exportar/importar será una mejora de la siguiente versión.</div>
  </div>`,()=>{db.appTitle=$("#mAppTitle").value.trim()||"RUTINA";save()});
}
function resetData(){
  if(confirm("Esto borrará rutinas y progreso guardado en este dispositivo. ¿Continuar?")){
    localStorage.removeItem(KEY);db=load();currentRoutineId=null;currentDayId=null;nav="home";render();showToast("Datos borrados")
  }
}
function bind(){
  $$(".nav-btn").forEach(b=>b.onclick=()=>{nav=b.dataset.nav;render()});
  $("#settingsBtn").onclick=settings;
  $$("[data-open-day]").forEach(el=>el.onclick=()=>{currentDayId=el.dataset.openDay;currentRoutineId=activeRoutine()?.id;nav="day";render()});
  $$("[data-action]").forEach(el=>el.onclick=()=>action(el.dataset.action,el));
  $$("[data-field]").forEach(inp=>inp.oninput=()=>updateSet(inp.dataset.eid,Number(inp.dataset.si),inp.dataset.field,inp.value,inp.dataset.warmup==="true"));
  $$("[data-session-comment]").forEach(t=>t.oninput=()=>{const s=ensureSession(activeRoutine().id,activeDay().id);s.comments=t.value;save()});
}
function action(a,el){
  if(a==="new-routine") return addRoutine();
  if(a==="edit-routine") return editRoutine();
  if(a==="manage-routine"){nav="routine";return render()}
  if(a==="add-day") return addDay();
  if(a==="edit-day") return editDay();
  if(a==="delete-day") return deleteDay();
  if(a==="add-exercise") return addExercise();
  if(a==="edit-exercise") return addExercise(el.dataset.eid);
  if(a==="delete-exercise") return deleteExercise(el.dataset.eid);
  if(a==="start-workout"){nav="workout";return render()}
  if(a==="start-suggested"){currentDayId=activeRoutine()?.days[0]?.id;nav="workout";return render()}
  if(a==="back-routine"){nav="routine";return render()}
  if(a==="back-day"){nav="day";return render()}
  if(a==="finish-workout") return finishWorkout();
  if(a==="toggle-set") return toggleSet(el.dataset.eid,Number(el.dataset.si),el.dataset.warmup==="true");
  if(a==="skip-rest"){stopRestTimer();return;}
  if(a==="add-set") return addSet(el.dataset.eid);
  if(a==="add-warmup") return addWarmup(el.dataset.eid);
  if(a==="set-unit") return setUnit(el.dataset.eid,el.dataset.unit);
  if(a==="exercise-menu") return exerciseMenu(el.dataset.eid);
  if(a==="reset-data") return resetData();
}
window.addEventListener("load",()=>{
  if(db.routines[0])currentRoutineId=db.routines[0].id;
  render();
});
