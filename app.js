
const KEY="rutina_pwa_v4";
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36);
const localISO=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const fmtDate=k=>new Date(k+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"});
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

function load(){
  let x={appTitle:"RUTINA",routines:[],sessions:{}};
  try{x=JSON.parse(localStorage.getItem(KEY))||x}catch{}
  x.appTitle=x.appTitle||"RUTINA";x.routines=x.routines||[];x.sessions=x.sessions||{};
  x.routines.forEach(r=>{
    r.days=r.days||[];
    r.currentWeek=r.currentWeek||1;
    r.weekStartedAt=r.weekStartedAt||localISO();
    r.completedWeeks=r.completedWeeks||[];
    r.days.forEach(d=>{
      d.exercises=d.exercises||[];
      d.exercises.forEach(e=>{
        e.warmupSets=Math.max(0,Number(e.warmupSets||0));
        e.restSeconds=Math.max(0,Number(e.restSeconds??120));
        e.defaultReps=Number(e.defaultReps||0);
        e.unit=e.unit||"kg";e.sets=e.sets||[];
      });
    });
  });
  return x;
}
let db=load();
let nav="home", currentRoutineId=null, currentDayId=null;
let workoutTick=null, restTick=null, restEnd=0;
let timerState={routineId:null,dayId:null,week:0,startAt:null};

function save(){localStorage.setItem(KEY,JSON.stringify(db))}
function activeRoutine(){return db.routines.find(r=>r.id===currentRoutineId)||db.routines[0]}
function activeDay(){return activeRoutine()?.days.find(d=>d.id===currentDayId)}
function weekKey(rid,week,did){return `${rid}|W${week}|${did}`}
function getDayState(rid,week,did){
  const k=weekKey(rid,week,did);
  if(!db.sessions[k]) db.sessions[k]={rid,did,week,status:"pending",startedAt:null,finishedAt:null,durationSec:0,comments:"",sets:{}};
  return db.sessions[k];
}
function statusFor(rid,week,did){return getDayState(rid,week,did).status}
function totalWeekDays(r){return r.days.length}
function settledWeek(r){return r.days.length>0 && r.days.every(d=>statusFor(r.id,r.currentWeek,d.id)!=="pending")}
function formatTime(sec){sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return [h,m,s].map((v,i)=>i===0?String(v).padStart(2,"0"):String(v).padStart(2,"0")).join(":")}
function formatShortDuration(sec){sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60; if(h)return `${h}h ${m}m ${s}s`; if(m)return `${m}m ${s}s`; return `${s}s`}
function nextWeekIfNeeded(r){
  if(!settledWeek(r)) return false;
  r.completedWeeks.push({week:r.currentWeek,startedAt:r.weekStartedAt,closedAt:new Date().toISOString()});
  r.currentWeek++;
  r.weekStartedAt=localISO();
  save();
  showToast(`Semana ${r.currentWeek-1} terminada · Semana ${r.currentWeek} iniciada`);
  return true;
}
function dayDone(r,d){const s=getDayState(r.id,r.currentWeek,d.id);return s.status==="trained"||s.status==="skipped"}
function dayCompletedByExercises(r,d){
  const s=getDayState(r.id,r.currentWeek,d.id);
  if(!d.exercises.length)return false;
  return d.exercises.every(e=>e.sets.length>0 && e.sets.every((_,i)=>s.sets[setKey(e.id,"w",i)]?.done===true || s.sets[setKey(e.id,"s",i)]?.done===true));
}
function allWorkSetsDone(r,d,s){
  return d.exercises.length>0 && d.exercises.every(e=>{
    if(!e.sets.length)return false;
    return e.sets.every((_,i)=>s.sets[setKey(e.id,"s",i)]?.done===true);
  });
}
function setKey(eid,type,idx){return `${eid}|${type}|${idx}`}
function prevSession(r,d){
  if(r.currentWeek<=1)return null;
  return getDayState(r.id,r.currentWeek-1,d.id);
}
function previousExerciseRecord(r,d,e){
  const s=prevSession(r,d); if(!s||s.status!=="trained") return null;
  const vals=[];
  for(let i=0;i<e.sets.length;i++){
    const v=s.sets[setKey(e.id,"s",i)];
    if(v)vals.push(v);
  }
  return vals.length?vals:null;
}
function setCurrentDayStatus(status){
  const r=activeRoutine(),d=activeDay();
  if(!r||!d)return;
  const s=getDayState(r.id,r.currentWeek,d.id);
  s.status=status;
  if(status==="skipped"){s.startedAt=null;s.finishedAt=new Date().toISOString();s.durationSec=0}
  save();
}
function beginWorkout(){
  const r=activeRoutine(),d=activeDay(); if(!r||!d)return;
  const s=getDayState(r.id,r.currentWeek,d.id);
  if(s.status==="skipped"){showToast("Este día está marcado como no entrenado.");return}
  if(!s.startedAt)s.startedAt=new Date().toISOString();
  s.status="pending";timerState={routineId:r.id,dayId:d.id,week:r.currentWeek,startAt:s.startedAt};
  save();nav="workout";startWorkoutClock();render();
}
function startWorkoutClock(){
  stopWorkoutClock();
  workoutTick=setInterval(updateWorkoutTimer,500);updateWorkoutTimer();
}
function stopWorkoutClock(){if(workoutTick){clearInterval(workoutTick);workoutTick=null}}
function updateWorkoutTimer(){
  if(nav!=="workout")return;
  const r=activeRoutine(),d=activeDay();if(!r||!d)return;
  const s=getDayState(r.id,r.currentWeek,d.id);if(!s.startedAt)return;
  const sec=Math.floor((Date.now()-new Date(s.startedAt).getTime())/1000);
  const el=$("#workoutClock"); if(el)el.textContent=formatTime(sec);
}
function startRest(sec,exerciseName){
  clearInterval(restTick);restEnd=Date.now()+sec*1000;
  const box=$("#restBox");if(box)box.classList.add("show");
  const label=$("#restLabel");if(label)label.textContent=`Descanso · ${exerciseName}`;
  restTick=setInterval(()=>{
    const left=Math.max(0,Math.ceil((restEnd-Date.now())/1000));
    const el=$("#restClock");if(el)el.textContent=formatTime(left);
    if(left<=0){clearInterval(restTick);restTick=null;showToast("Descanso terminado")}
  },250);
}
function skipRest(){clearInterval(restTick);restTick=null;const box=$("#restBox");if(box)box.classList.remove("show")}
function endWorkout(){
  const r=activeRoutine(),d=activeDay();if(!r||!d)return;
  const s=getDayState(r.id,r.currentWeek,d.id);
  if(s.status==="trained")return;
  if(!allWorkSetsDone(r,d,s)){showToast("Todavía faltan sets de trabajo.");return}
  s.status="trained";s.finishedAt=new Date().toISOString();
  s.durationSec=s.startedAt?Math.max(0,Math.floor((new Date(s.finishedAt)-new Date(s.startedAt))/1000)):0;
  s.comments=$("#sessionComments")?.value??s.comments??"";
  save();stopWorkoutClock();skipRest();
  if(settledWeek(r)) nextWeekIfNeeded(r);
  nav="home";render();
}
function markNoTrain(){
  const r=activeRoutine(),d=activeDay();if(!r||!d)return;
  const s=getDayState(r.id,r.currentWeek,d.id);
  if(s.status==="trained"){showToast("Este día ya está terminado como entrenado.");return}
  setCurrentDayStatus("skipped");
  if(settledWeek(r)) nextWeekIfNeeded(r);
  nav="home";render();
}
function appReset(){localStorage.removeItem(KEY);db=load();currentRoutineId=null;currentDayId=null;nav="home";render();showToast("Datos borrados")}
function render(){
  $("#appTitle").textContent=db.appTitle||"RUTINA";
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.nav===nav));
  let html="";
  if(nav==="home")html=homeView();
  else if(nav==="routine")html=routineView();
  else if(nav==="stats")html=statsView();
  else if(nav==="day")html=dayView();
  else if(nav==="workout")html=workoutView();
  $("#screen").innerHTML=html;bind();
  if(nav==="workout")startWorkoutClock();
  else stopWorkoutClock();
}
function routineProgress(r){
  const states=r.days.map(d=>statusFor(r.id,r.currentWeek,d.id));
  const settled=states.filter(x=>x!=="pending").length;
  return {settled,total:r.days.length,pct:r.days.length?Math.round(settled/r.days.length*100):0};
}
function homeView(){
  const r=activeRoutine();
  if(!r)return `<div class="empty" style="margin-top:40px"><div style="font-size:48px">🏋️</div><h2 style="margin:12px 0 7px">Crea tu primera rutina</h2><p>Crea tus días, ejercicios y registra cada semana sin perder el historial.</p><button class="btn primary" style="margin-top:15px" data-action="new-routine">Crear rutina</button></div>`;
  const p=routineProgress(r),trainedToday=r.days.filter(d=>statusFor(r.id,r.currentWeek,d.id)==="trained").length;
  const completedSessions=Object.values(db.sessions).filter(s=>s.rid===r.id&&s.status==="trained").length;
  return `<section class="hero">
    <div class="between"><div><div class="eyebrow">RUTINA ACTIVA</div><div class="hero-title">${esc(r.name)}</div></div><div class="row"><button class="round-btn" data-action="edit-routine">✎</button><button class="round-btn" data-action="manage-routine">☰</button></div></div>
    <div class="hero-sub">Semana ${r.currentWeek} · ${p.settled}/${p.total} días registrados</div>
    <div class="progress"><span style="width:${p.pct}%"></span></div>
    <div class="small">${trainedToday} entrenamientos completados esta semana · ${completedSessions} sesiones históricas</div>
  </section>
  <div class="grid3">
    <div class="stat"><b>${streak()}</b><span>racha</span></div>
    <div class="stat"><b>${completedSessions}</b><span>días entrenados</span></div>
    <div class="stat"><b>${r.currentWeek-1}</b><span>semanas cerradas</span></div>
  </div>
  <div class="between"><div class="section-title" style="margin-top:0">Semana ${r.currentWeek}</div><button class="btn secondary" data-action="manage-routine">Editar</button></div>
  ${r.days.map((d,i)=>dayCard(r,d,i)).join("")}`;
}
function dayCard(r,d,i){
  const st=statusFor(r.id,r.currentWeek,d.id);
  const label=st==="trained"?"Entrenado":st==="skipped"?"No entrené":"Pendiente";
  const badge=st==="trained"?`<span class="badge-orange">✓ ENTRENADO</span>`:st==="skipped"?`<span class="badge-gray">NO ENTRENÉ</span>`:`<span class="pill">PENDIENTE</span>`;
  const sess=getDayState(r.id,r.currentWeek,d.id);
  return `<div class="card" data-open-day="${d.id}">
    <div class="day-card">
      <div class="day-badge">${i+1}</div>
      <div class="card-main"><div class="card-title">${esc(d.name)}</div><div class="card-meta">${d.exercises.length} ejercicios</div><div class="day-status"><span class="dot ${st==="trained"?"orange":st==="skipped"?"gray":""}"></span>${label}</div></div>
      <div class="check ${st==="trained"?"trained":st==="skipped"?"skipped":""}">${st==="trained"?"✓":st==="skipped"?"—":"→"}</div>
    </div>
    <div class="day-actions">
      ${st==="pending"?`<button class="btn primary" data-action="quick-start" data-did="${d.id}">Comenzar</button><button class="btn ghost" data-action="quick-skip" data-did="${d.id}">No entrené</button>`:""}
      ${st==="trained"&&sess.durationSec?`<span class="pill">Tiempo ${formatShortDuration(sess.durationSec)}</span>`:""}
      ${st==="skipped"?`<span class="pill">Día registrado como descanso</span>`:""}
    </div>
  </div>`;
}
function routineView(){
  const r=activeRoutine();
  if(!r) return `<div class="empty" style="margin-top:30px"><h2>Sin rutinas</h2><p style="margin-top:7px">Crea una rutina nueva para empezar.</p><button class="btn primary" style="margin-top:15px" data-action="new-routine">+ Nueva rutina</button></div>`;
  const p=routineProgress(r);
  return `<div class="between" style="margin-bottom:12px">
    <div><div class="eyebrow">RUTINA ACTIVA</div><h2>${esc(r.name)}</h2></div>
    <button class="btn primary" data-action="new-routine">+ Nueva</button>
  </div>
  <div class="card">
    <div class="between">
      <div><b>Semana ${r.currentWeek}</b><div class="small">${p.settled}/${p.total} días registrados. La rutina no tiene fecha de caducidad.</div></div>
      <div class="pill">${r.days.length} días</div>
    </div>
    <div class="row-actions">
      <button class="btn secondary" data-action="edit-routine">Editar rutina</button>
      <button class="btn danger" data-action="delete-routine">Borrar rutina</button>
    </div>
  </div>

  ${db.routines.length>1?`
    <div class="section-title">Mis rutinas</div>
    ${db.routines.map(x=>`<div class="card day-card" style="cursor:default">
      <div class="day-badge">${x===r?"✓":"•"}</div>
      <div class="card-main">
        <div class="card-title">${esc(x.name)}</div>
        <div class="card-meta">Semana ${x.currentWeek} · ${x.days.length} días · ${Object.values(db.sessions).filter(s=>s.rid===x.id&&s.status==="trained").length} sesiones</div>
      </div>
      <div class="row">
        ${x.id!==r.id?`<button class="btn secondary" data-action="switch-routine" data-rid="${x.id}">Usar</button>`:`<span class="badge-orange">ACTIVA</span>`}
      </div>
    </div>`).join("")}
  `:""}

  <div class="section-title">Semana ${r.currentWeek}</div>
  ${r.days.length ? r.days.map((d,i)=>`<div class="card day-card" data-open-day="${d.id}">
    <div class="day-badge">${i+1}</div><div class="card-main"><div class="card-title">${esc(d.name)}</div><div class="card-meta">${d.exercises.length} ejercicios</div></div><div class="check">→</div>
  </div>`).join("") : `<div class="empty">Esta rutina todavía no tiene días.<br><button class="btn secondary" style="margin-top:12px" data-action="add-day">+ Agregar día</button></div>`}
  <div class="card" style="margin-top:14px">
    <div class="between"><div><b>Semanas anteriores</b><div class="small">Los datos de peso, reps, sets, aproximaciones y tiempos se conservan.</div></div><span class="pill">${r.completedWeeks.length}</span></div>
  </div>
  ${r.completedWeeks.length ? r.completedWeeks.slice().reverse().map(w=>`<div class="week-card"><div class="week-title">Semana ${w.week}</div><div class="week-meta">Cerrada · ${fmtDate((w.closedAt||"").slice(0,10)||localISO())}</div></div>`).join("") : `<div class="empty">Todavía no hay semanas cerradas.</div>`}`;
}
function dayView(){
  const r=activeRoutine(),d=activeDay();if(!r||!d){nav="routine";return routineView()}
  const s=getDayState(r.id,r.currentWeek,d.id),st=s.status;
  return `<div class="between" style="margin-bottom:12px">
    <button class="round-btn" data-action="back-home">←</button>
    <div style="text-align:center;flex:1"><div class="eyebrow">SEMANA ${r.currentWeek}</div><h2>${esc(d.name)}</h2></div>
    <button class="round-btn" data-action="edit-day">✎</button>
  </div>
  <div class="card"><div class="between"><div><b>${d.exercises.length} ejercicios</b><div class="small">Escribe directamente los ejercicios que tú uses. No hay catálogo impuesto.</div></div><button class="btn secondary" data-action="add-exercise">+ Ejercicio</button></div>
  ${st!=="pending"?`<div style="margin-top:10px">${st==="trained"?`<span class="badge-orange">✓ ENTRENADO</span>`:`<span class="badge-gray">NO ENTRENÉ</span>`}</div>`:""}
  </div>
  ${d.exercises.length?d.exercises.map(e=>`<div class="card">
    <div class="exercise-head"><div><div class="exercise-name">${esc(e.name)}</div><div class="exercise-meta">${e.warmupSets} aproximaciones · ${e.sets.length} sets · ${e.defaultReps||"—"} reps · descanso ${formatShortDuration(e.restSeconds)}</div></div>
    <div class="actions"><button class="circle" data-action="edit-exercise" data-eid="${e.id}">✎</button><button class="circle" data-action="delete-exercise" data-eid="${e.id}">×</button></div></div>
  </div>`).join(""):`<div class="empty">Este día todavía no tiene ejercicios.</div>`}
  ${st==="pending"&&d.exercises.length?`<div class="sticky-cta"><button class="btn primary wide" data-action="start-workout">COMENZAR ENTRENAMIENTO</button><button class="btn ghost wide" style="margin-top:8px" data-action="no-train">NO ENTRENÉ</button></div>`:""}
  ${st==="trained"&&s.durationSec?`<div class="card"><div class="between"><div><b>Sesión terminada</b><div class="small">${fmtDate(s.finishedAt.slice(0,10))}</div></div><b>${formatTime(s.durationSec)}</b></div></div>`:""}`;
}
function workoutView(){
  const r=activeRoutine(),d=activeDay();if(!r||!d){nav="home";return homeView()}
  const s=getDayState(r.id,r.currentWeek,d.id);
  return `<div class="between" style="margin-bottom:12px">
    <button class="round-btn" data-action="back-day">←</button>
    <div style="text-align:center;flex:1"><div class="eyebrow">SEMANA ${r.currentWeek}</div><h2>${esc(d.name)}</h2></div>
    <button class="round-btn" data-action="finish-workout">✓</button>
  </div>
  <div class="timer-card"><div class="timer-label">TIEMPO DE ENTRENAMIENTO</div><div id="workoutClock" class="timer-time">00:00:00</div></div>
  <div id="restBox" class="rest"><div><div id="restLabel" class="rest-label">DESCANSO</div><div id="restClock" class="rest-time">00:00:00</div></div><button class="btn secondary" data-action="skip-rest">Saltar</button></div>
  ${d.exercises.map(e=>workoutExercise(r,d,s,e)).join("")}
  <div class="card"><label class="label">COMENTARIOS DE ESTA SESIÓN</label><textarea id="sessionComments" class="textarea" placeholder="Ej. buena técnica, subir peso la próxima semana...">${esc(s.comments||"")}</textarea></div>
  <div class="sticky-cta"><button class="btn primary wide" data-action="finish-workout">FINALIZAR AHORA</button><div class="small" style="text-align:center;margin-top:7px">Al completar el último set de trabajo, la sesión se guarda automáticamente.</div></div>`;
}
function workoutExercise(r,d,s,e){
  const unit=e.sessionUnit||e.unit||"kg";
  const completed=e.sets.length>0 && e.sets.every((_,i)=>s.sets[setKey(e.id,"s",i)]?.done===true);
  const prev=previousExerciseRecord(r,d,e);
  let warm="",work="";
  for(let i=0;i<e.warmupSets;i++)warm+=setRowHTML(e,s,i,"w",unit);
  for(let i=0;i<e.sets.length;i++)work+=setRowHTML(e,s,i,"s",unit);
  return `<div class="card ${completed?"exercise-complete":""}">
    <div class="exercise-head"><div><div class="exercise-name">${esc(e.name)}</div><div class="exercise-meta">${e.warmupSets} aproximaciones · ${e.sets.length} sets</div>${completed?'<div class="exercise-done-label">✓ EJERCICIO COMPLETO</div>':''}</div><button class="circle" data-action="exercise-menu" data-eid="${e.id}">⋯</button></div>
    <div class="segmented"><button class="${unit==="kg"?"active":""}" data-action="set-unit" data-eid="${e.id}" data-unit="kg">KG</button><button class="${unit==="lb"?"active":""}" data-action="set-unit" data-eid="${e.id}" data-unit="lb">LB</button></div>
    ${e.warmupSets?`<div class="subhead">APROXIMACIONES</div><div class="set-head"><span></span><span>PESO (${unit})</span><span>REPS</span><span></span></div>${warm}`:""}
    <div class="subhead">SETS DE TRABAJO</div><div class="set-head"><span></span><span>PESO (${unit})</span><span>REPS</span><span></span></div>${work}
    <div class="row-actions"><button class="btn secondary" data-action="add-set" data-eid="${e.id}">+ Set</button><button class="btn secondary" data-action="add-warmup" data-eid="${e.id}">+ Aproximación</button></div>
    ${prev?`<div class="prev"><b>Semana anterior:</b> ${prev.map(v=>`${v.weight||0} ${v.unit||unit} × ${v.reps||0}`).join(" · ")}`:`<div class="prev">Semana anterior: todavía no hay registro.</div>`}
  </div>`;
}
function setRowHTML(e,s,i,type,unit){
  const k=setKey(e.id,type,i),v=s.sets[k]||{weight:"",reps:e.defaultReps||"",unit,done:false};
  return `<div class="set-row ${v.done?"done":""}">
    <div class="set-num">${i+1}</div>
    <input class="set-input" type="number" step="0.5" inputmode="decimal" placeholder="0" value="${esc(v.weight)}" data-field="weight" data-eid="${e.id}" data-type="${type}" data-idx="${i}">
    <input class="set-input" type="number" step="1" inputmode="numeric" placeholder="${esc(e.defaultReps||"reps")}" value="${esc(v.reps)}" data-field="reps" data-eid="${e.id}" data-type="${type}" data-idx="${i}">
    <button class="set-done ${v.done?"done":""}" data-action="toggle-set" data-eid="${e.id}" data-type="${type}" data-idx="${i}">${v.done?"✓":""}</button>
  </div>`;
}
function statsView(){
  const r=activeRoutine();if(!r)return `<div class="empty">Crea una rutina.</div>`;
  const trained=Object.values(db.sessions).filter(s=>s.rid===r.id&&s.status==="trained").sort((a,b)=>(b.finishedAt||"").localeCompare(a.finishedAt||""));
  const skipped=Object.values(db.sessions).filter(s=>s.rid===r.id&&s.status==="skipped").sort((a,b)=>(b.finishedAt||"").localeCompare(a.finishedAt||""));
  const sessions=trained;
  const now=new Date(),year=now.getFullYear(),month=now.getMonth(),first=new Date(year,month,1),days=new Date(year,month+1,0).getDate(),start=first.getDay()||7;
  const dates=trained.map(s=>{const d=s.finishedAt?new Date(s.finishedAt):new Date(s.date+"T12:00:00");return localISO(d)});
  const cal=[];for(let i=1;i<start;i++)cal.push(`<div></div>`);
  for(let d=1;d<=days;d++){const k=localISO(new Date(year,month,d));cal.push(`<div class="cal-day ${dates.includes(k)?"done ":""}${k===localISO()?"today":""}">${d}</div>`)}
  return `<div class="between"><div><div class="eyebrow">PROGRESO</div><h2>Mi entrenamiento</h2></div><button class="round-btn" data-action="reset-data">↺</button></div>
  <div class="grid3"><div class="stat"><b>${streak()}</b><span>racha</span></div><div class="stat"><b>${trained.length}</b><span>días entrenados</span></div><div class="stat"><b>${r.currentWeek-1}</b><span>semanas cerradas</span></div></div>
  <div class="card"><div class="between"><h3 style="text-transform:capitalize">${now.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}</h3><span class="small">${trained.length} sesiones</span></div><div class="calendar">${["L","M","X","J","V","S","D"].map(x=>`<div class="cal-head">${x}</div>`).join("")}${cal.join("")}</div></div>
  <div class="section-title">Historial reciente</div>
  ${trained.slice(0,15).map(s=>{const d=r.days.find(x=>x.id===s.did);return `<div class="history"><b>${esc(d?.name||"Día")}</b><div class="vals">${fmtDate((s.finishedAt||s.date).slice(0,10))} · ${formatTime(s.durationSec||0)}</div>${s.comments?`<div class="vals">“${esc(s.comments)}”</div>`:""}</div>`}).join("")||`<div class="empty">Todavía no hay entrenamientos terminados.</div>`}
  ${skipped.length?`<div class="section-title">Días no entrenados</div>${skipped.slice(0,10).map(s=>{const d=r.days.find(x=>x.id===s.did);return `<div class="history"><b>${esc(d?.name||"Día")}</b><div class="vals">${fmtDate(s.date)} · No entrené</div></div>`}).join("")}`:""}`;
}
function streak(){
  const r=activeRoutine();if(!r)return 0;
  const days=[...new Set(Object.values(db.sessions).filter(s=>s.rid===r.id&&s.status==="trained").map(s=>(s.finishedAt||"").slice(0,10)).filter(Boolean))].sort().reverse();
  if(!days.length)return 0;let n=0,d=new Date(localISO());
  if(!days.includes(localISO()))d.setDate(d.getDate()-1);
  while(days.includes(localISO(d))){n++;d.setDate(d.getDate()-1)}
  return n;
}
function openModal(title,body,onSave,saveText="Guardar"){
  $("#modalRoot").innerHTML=`<div class="modal-bg" data-modal-bg><div class="modal"><div class="modal-top"><h3>${title}</h3><button class="close" data-modal-close>×</button></div>${body}<div class="modal-actions"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn primary" id="modalSave">${saveText}</button></div></div></div>`;
  $$("[data-modal-close]").forEach(b=>b.onclick=closeModal);
  $("[data-modal-bg]").addEventListener("click",e=>{if(e.target.dataset.modalBg!==undefined)closeModal()});
  $("#modalSave").onclick=()=>{onSave();closeModal();render()};
}
function closeModal(){$("#modalRoot").innerHTML=""}

function deleteRoutine(){
  const r=activeRoutine();
  if(!r) return;
  if(db.routines.length===1){
    if(!confirm(`¿Borrar la rutina "${r.name}"? No habrá otra rutina activa. Esta acción también borrará su historial guardado.`)) return;
  }else{
    if(!confirm(`¿Borrar la rutina "${r.name}"? También se borrará su historial guardado.`)) return;
  }
  db.routines=db.routines.filter(x=>x.id!==r.id);
  Object.keys(db.sessions).forEach(k=>{ if(k.startsWith(r.id+"|")) delete db.sessions[k]; });
  currentRoutineId=db.routines[0]?.id||null;
  currentDayId=null;
  nav="home";
  save();
  render();
  showToast("Rutina borrada");
}
function switchRoutine(rid){
  const r=db.routines.find(x=>x.id===rid);
  if(!r)return;
  currentRoutineId=r.id;
  currentDayId=null;
  nav="home";
  save();
  render();
  showToast(`Rutina activa: ${r.name}`);
}
function addRoutine(){
  openModal("Nueva rutina",`<div class="form"><div><label class="label">NOMBRE</label><input id="mName" class="input" placeholder="Ej. PPL X LEG"></div><div class="small">No se define una duración de semanas. La rutina continúa indefinidamente.</div></div>`,()=>{
    const r={id:uid(),name:$("#mName").value.trim()||"Mi rutina",days:[],currentWeek:1,weekStartedAt:localISO(),completedWeeks:[]};
    db.routines.push(r);currentRoutineId=r.id;save();
  });
}
function editRoutine(){const r=activeRoutine();openModal("Editar rutina",`<div><label class="label">NOMBRE</label><input id="mName" class="input" value="${esc(r.name)}"></div>`,()=>{r.name=$("#mName").value.trim()||r.name;save()})}
function addDay(){const r=activeRoutine();openModal("Agregar día",`<div><label class="label">NOMBRE DEL DÍA</label><input id="mName" class="input" placeholder="Ej. Lunes - Pecho"></div>`,()=>{r.days.push({id:uid(),name:$("#mName").value.trim()||`Día ${r.days.length+1}`,exercises:[]});save()})}
function editDay(){const d=activeDay();openModal("Editar día",`<div><label class="label">NOMBRE</label><input id="mName" class="input" value="${esc(d.name)}"></div>`,()=>{d.name=$("#mName").value.trim()||d.name;save()})}
function addExercise(editId=null){
  const d=activeDay(),e=editId?d.exercises.find(x=>x.id===editId):null;
  openModal(e?"Editar ejercicio":"Agregar ejercicio",`
  <div class="form">
    <div><label class="label">NOMBRE DEL EJERCICIO</label><input id="mName" class="input" placeholder="Ej. Press banca" value="${esc(e?.name||"")}"></div>
    <div class="two">
      <div><label class="label">APROXIMACIONES</label><input id="mWarm" class="input" type="number" min="0" step="1" value="${e?.warmupSets??1}"></div>
      <div><label class="label">SETS DE TRABAJO</label><input id="mSets" class="input" type="number" min="1" step="1" value="${e?.sets?.length||3}"></div>
    </div>
    <div class="two">
      <div><label class="label">REPS OBJETIVO</label><input id="mReps" class="input" type="number" min="0" step="1" value="${e?.defaultReps||8}"></div>
      <div><label class="label">DESCANSO (MINUTOS)</label><input id="mRest" class="input" type="number" min="0" step="0.25" value="${e?((e.restSeconds||120)/60):2}"></div>
    </div>
    <div><label class="label">UNIDAD INICIAL</label><select id="mUnit" class="select"><option value="kg" ${(e?.unit||"kg")==="kg"?"selected":""}>Kilogramos (kg)</option><option value="lb" ${(e?.unit||"kg")==="lb"?"selected":""}>Libras (lb)</option></select></div>
  </div>`,
  ()=>{
    const name=$("#mName").value.trim()||"Ejercicio";const warm=Math.max(0,parseInt($("#mWarm").value||0,10));
    const sets=Math.max(1,parseInt($("#mSets").value||1,10));const reps=Math.max(0,parseInt($("#mReps").value||0,10));
    const rest=Math.max(0,Math.round(Number($("#mRest").value||0)*60));const unit=$("#mUnit").value;
    if(e){e.name=name;e.warmupSets=warm;e.defaultReps=reps;e.restSeconds=rest;e.unit=unit;e.sets=e.sets||[];while(e.sets.length<sets)e.sets.push({reps});while(e.sets.length>sets)e.sets.pop()}
    else d.exercises.push({id:uid(),name,warmupSets:warm,defaultReps:reps,restSeconds:rest,unit,sets:Array.from({length:sets},()=>({reps}))});
    save();
  });
}
function deleteExercise(eid){const d=activeDay();if(confirm("¿Eliminar este ejercicio?")){d.exercises=d.exercises.filter(e=>e.id!==eid);save();render()}}
function addSet(eid){const e=activeDay().exercises.find(x=>x.id===eid);e.sets.push({reps:e.defaultReps||""});save();render()}
function addWarmup(eid){const e=activeDay().exercises.find(x=>x.id===eid);e.warmupSets=(e.warmupSets||0)+1;save();render()}
function setUnit(eid,unit){
  const r=activeRoutine(),d=activeDay(),e=d.exercises.find(x=>x.id===eid),s=getDayState(r.id,r.currentWeek,d.id),old=e.sessionUnit||e.unit||"kg";
  if(old===unit)return;e.sessionUnit=unit;
  [...Array(e.warmupSets)].forEach((_,i)=>convertSet(s,e,"w",i,old,unit));
  [...Array(e.sets.length)].forEach((_,i)=>convertSet(s,e,"s",i,old,unit));save();render();
}
function convertSet(s,e,type,i,old,unit){const k=setKey(e.id,type,i),v=s.sets[k];if(!v||v.weight==="")return;const n=Number(v.weight);if(Number.isNaN(n))return;v.weight=(unit==="lb"?n*2.2046226218:n/2.2046226218).toFixed(1);v.unit=unit}
function updateSet(eid,type,idx,field,val){
  const r=activeRoutine(),d=activeDay(),e=d.exercises.find(x=>x.id===eid),s=getDayState(r.id,r.currentWeek,d.id),k=setKey(eid,type,idx);
  if(!s.sets[k])s.sets[k]={weight:"",reps:e.defaultReps||"",unit:e.sessionUnit||e.unit||"kg",done:false};
  s.sets[k][field]=val;s.status="pending";save();
}
function autoCompleteDayIfReady(r,d,s){
  if(s.status==="trained" || s.status==="skipped") return false;
  if(!allWorkSetsDone(r,d,s)) return false;
  s.status="trained";
  s.finishedAt=new Date().toISOString();
  s.durationSec=s.startedAt?Math.max(0,Math.floor((new Date(s.finishedAt)-new Date(s.startedAt))/1000)):0;
  s.comments=$("#sessionComments")?.value ?? s.comments ?? "";
  save();
  stopWorkoutClock();
  skipRest();
  if(settledWeek(r)) nextWeekIfNeeded(r);
  return true;
}
function toggleSet(eid,type,idx){
  const r=activeRoutine(),d=activeDay(),e=d.exercises.find(x=>x.id===eid),s=getDayState(r.id,r.currentWeek,d.id),k=setKey(eid,type,idx);
  if(!s.sets[k])s.sets[k]={weight:"",reps:e.defaultReps||"",unit:e.sessionUnit||e.unit||"kg",done:false};
  s.sets[k].done=!s.sets[k].done;s.startedAt=s.startedAt||new Date().toISOString();s.status="pending";
  save();
  if(s.sets[k].done)startRest(e.restSeconds||0,e.name);
  const justFinished = type==="s" && autoCompleteDayIfReady(r,d,s);
  if(justFinished){
    nav="home";
    render();
    showToast("Entrenamiento terminado y guardado");
    return;
  }
  render();
}
function exerciseMenu(eid){
  const d=activeDay(),e=d.exercises.find(x=>x.id===eid);
  openModal("Opciones del ejercicio",`<div class="form"><button class="btn secondary wide" id="editEx">Editar ejercicio</button><button class="btn danger wide" id="delEx">Eliminar ejercicio</button></div>`,()=>{},"Cerrar");
  $("#editEx").onclick=()=>{closeModal();addExercise(eid)};$("#delEx").onclick=()=>{closeModal();deleteExercise(eid)};$("#modalSave").onclick=closeModal;
}
function settings(){openModal("Ajustes",`<div class="form"><div><label class="label">NOMBRE MOSTRADO</label><input id="mTitle" class="input" value="${esc(db.appTitle||"RUTINA")}"></div></div>`,()=>{db.appTitle=$("#mTitle").value.trim()||"RUTINA";save()})}
function bind(){
  $$(".nav-btn").forEach(b=>b.onclick=()=>{nav=b.dataset.nav;render()});
  $("#settingsBtn").onclick=settings;
  $$("[data-open-day]").forEach(el=>el.onclick=()=>{currentDayId=el.dataset.openDay;nav="day";render()});
  $$("[data-action]").forEach(el=>el.onclick=()=>handle(el.dataset.action,el));
  $$("[data-field]").forEach(i=>i.oninput=()=>updateSet(i.dataset.eid,i.dataset.type,Number(i.dataset.idx),i.dataset.field,i.value));
  $("#sessionComments")?.addEventListener("input",()=>{const r=activeRoutine(),d=activeDay(),s=getDayState(r.id,r.currentWeek,d.id);s.comments=$("#sessionComments").value;save()});
}
function handle(a,el){
  if(a==="new-routine")return addRoutine();
  if(a==="edit-routine")return editRoutine();
  if(a==="delete-routine")return deleteRoutine();
  if(a==="switch-routine")return switchRoutine(el.dataset.rid);
  if(a==="manage-routine"){nav="routine";return render()}
  if(a==="add-day")return addDay();
  if(a==="edit-day")return editDay();
  if(a==="add-exercise")return addExercise();
  if(a==="edit-exercise")return addExercise(el.dataset.eid);
  if(a==="delete-exercise")return deleteExercise(el.dataset.eid);
  if(a==="start-workout")return beginWorkout();
  if(a==="quick-start"){currentDayId=el.dataset.did;return beginWorkout()}
  if(a==="quick-skip"){currentDayId=el.dataset.did;return markNoTrain()}
  if(a==="no-train")return markNoTrain();
  if(a==="back-home"){nav="home";return render()}
  if(a==="back-day"){nav="day";return render()}
  if(a==="finish-workout")return endWorkout();
  if(a==="skip-rest")return skipRest();
  if(a==="toggle-set")return toggleSet(el.dataset.eid,el.dataset.type,Number(el.dataset.idx));
  if(a==="add-set")return addSet(el.dataset.eid);
  if(a==="add-warmup")return addWarmup(el.dataset.eid);
  if(a==="set-unit")return setUnit(el.dataset.eid,el.dataset.unit);
  if(a==="exercise-menu")return exerciseMenu(el.dataset.eid);
  if(a==="reset-data"){if(confirm("¿Borrar todos los datos guardados en este navegador?"))appReset()}
}
window.addEventListener("load",()=>{currentRoutineId=db.routines[0]?.id||null;render()});
