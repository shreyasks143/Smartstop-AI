// ─── Data ─────────────────────────────────────────────────────────
const STATIONS = {
  Purple:["Whitefield (Kadugodi)","Hopefarm Channasandra","Kadugodi Tree Park","Pattandur Agrahara","Sri Sathya Sai Hospital","Nallurhalli","Kundalahalli","Seetharampalya","Hoodi","Garudacharapalya","Singayyanapalya","Krishnarajapura","Benniganahalli","Baiyappanahalli","Swami Vivekananda Road","Indiranagar","Halasuru","Trinity","Mahatma Gandhi Road","Cubbon Park","Vidhana Soudha","Sir M Visvesvaraya","Majestic","KSR Railway Station","Magadi Road","Hosahalli","Vijayanagar","Attiguppe","Deepanjali Nagar","Mysuru Road","Pantharapalya","Rajarajeshwari Nagar","Jnanabharathi","Pattanagere","Kengeri Bus Terminal","Kengeri","Challaghatta"],
  Green:["Madavara","Chikkabidarakallu","Manjunath Nagar","Nagasandra","Dasarahalli","Jalahalli","Peenya Industry","Peenya","Goraguntepalya","Yeshwanthpur","Sandal Soap Factory","Mahalakshmi","Rajajinagar","Mahakavi Kuvempu Road","Srirampura","Sampige Road","Majestic","Chickpete","KR Market","National College","Lalbagh","South End Circle","Jayanagar","RV Road","Banashankari","Jayaprakash Nagar","Yelachenahalli","Konanakunte Cross","Doddakallasandra","Vajarahalli","Thalaghattapura","Silk Institute"]
};

let state = {
  user: '',
  elderlyMode: false,
  history: JSON.parse(localStorage.getItem('ss_history')||'{}'),
  fleetMap: {},
  journey: { active:false, route:[], current:0, target:0, destName:'' },
  kpi: { onboard:0, sos:0, pred:0, stops:0 },
  logLines: [],
};

// ─── Toast ─────────────────────────────────────────────────────────
function toast(msg, type='info', dur=3200) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `show ${type}`;
  setTimeout(()=>{ el.className = el.className.replace('show',''); }, dur);
}

// ─── Log ───────────────────────────────────────────────────────────
function log(msg, cls='normal') {
  const t = new Date().toLocaleTimeString('en-IN',{hour12:false});
  const el = document.getElementById('event-log');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-time">[${t}]</span> <span class="log-${cls}">${msg}</span>`;
  el.insertBefore(line, el.firstChild);
}

// ─── View Switching ────────────────────────────────────────────────
function switchView(v, btn) {
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(x=>x.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  btn.classList.add('active');
  if(v==='driver') updateFleetChart();
  if(v==='sensor') updateSensorView();
}

// ─── Login ─────────────────────────────────────────────────────────
function appLogin() {
  const n = document.getElementById('login-name').value.trim();
  if(!n){ toast('Please enter your name','warning'); return; }
  state.user = n;
  document.getElementById('login-overlay').style.display='none';
  document.getElementById('nav-name').textContent = n;
  document.getElementById('nav-avatar').textContent = n[0].toUpperCase();
  toast(`Welcome, ${n}! AI system ready 🚇`,'success');
  log(`Passenger "${n}" authenticated — session started`,'success');
  populateSimStops();
}

// ─── Stops Loading ─────────────────────────────────────────────────
function loadStops() {
  const line = document.getElementById('line-sel').value;
  const sel  = document.getElementById('src-sel');
  sel.innerHTML = '<option value="">— Select Entry Stop —</option>';
  document.getElementById('ai-block').style.display='none';
  document.getElementById('manual-wrap').style.display='none';
  if(!line) return;
  STATIONS[line].forEach(s=>{ const o=document.createElement('option'); o.value=o.textContent=s; sel.appendChild(o); });
  state.kpi.stops++;
  updateKPIs();
}

// ─── AI Inference ──────────────────────────────────────────────────
function runAI() {
  const line = document.getElementById('line-sel').value;
  const src  = document.getElementById('src-sel').value;
  if(!line||!src) return;

  let dest='', meta='', conf=0;
  const hist = state.history[state.user]?.[src];
  if(hist) {
    dest = Object.keys(hist).sort((a,b)=>hist[b]-hist[a])[0];
    meta = `Behavioural Intelligence: ${hist[dest]} similar trips found in your profile.`;
    conf = 95;
  } else {
    const stops = STATIONS[line];
    dest = stops[Math.floor(stops.length*0.75)]; // typical far stop
    meta = 'Population Model: High-volume interchange inferred from network dataset.';
    conf = 72;
  }

  document.getElementById('ai-dest-text').textContent = dest;
  document.getElementById('ai-meta-text').textContent = meta;
  document.getElementById('ai-conf-label').textContent = `Confidence: ${conf}%`;
  setTimeout(()=>{ document.getElementById('ai-conf-fill').style.width = conf+'%'; },100);
  document.getElementById('ai-block').style.display='block';
  document.getElementById('manual-wrap').style.display='none';

  state.kpi.pred++;
  updateKPIs();
  log(`AI predicted destination for "${state.user}": ${dest} (${conf}% confidence)`,'success');
}

// ─── Manual Mode ───────────────────────────────────────────────────
function showManual() {
  const line = document.getElementById('line-sel').value;
  const sel  = document.getElementById('manual-sel');
  sel.innerHTML = '';
  STATIONS[line].forEach(s=>{ const o=document.createElement('option'); o.value=o.textContent=s; sel.appendChild(o); });
  document.getElementById('ai-block').style.display='none';
  document.getElementById('manual-wrap').style.display='block';
}

// ─── Confirm Journey ───────────────────────────────────────────────
function confirmJourney(fromAI) {
  const line = document.getElementById('line-sel').value;
  const src  = document.getElementById('src-sel').value;
  const dest = fromAI ? document.getElementById('ai-dest-text').textContent
                      : document.getElementById('manual-sel').value;

  const route = STATIONS[line];
  const si = route.indexOf(src), ti = route.indexOf(dest);
  if(si<0||ti<0||si===ti){ toast('Invalid route selection','warning'); return; }

  state.journey = { active:true, route, current:si, target:ti, destName:dest };
  state.fleetMap[dest] = (state.fleetMap[dest]||0)+1;
  state.kpi.onboard++;
  updateKPIs();
  updateHeroStats();
  updateSensorKPI();

  // UI transitions
  document.getElementById('setup-form').style.display='none';
  document.getElementById('tracking-active').style.display='block';
  const mc = document.getElementById('map-card');
  mc.style.opacity='1'; mc.style.pointerEvents='auto';
  document.getElementById('tracking-dest').textContent = dest;
  document.getElementById('dest-display').classList.add('locked');
  document.getElementById('tracking-sub').textContent = `Destination: ${dest}`;

  // Elderly mode sync
  document.getElementById('elder-dest-text').textContent = dest;
  addMilestone('🚇','Journey started','Boarded at '+src);

  updateTimeline();
  log(`Journey confirmed for "${state.user}" — ${src} → ${dest}`,'success');
  toast(`Journey started! AI tracking to ${dest} 🎯`,'success');
  if(state.elderlyMode) voiceAnnounce();
}

// ─── Timeline ──────────────────────────────────────────────────────
function updateTimeline() {
  const {route, current, target} = state.journey;
  const el = document.getElementById('route-path');
  el.innerHTML='';

  // Show window: 3 before current, current, up to 3 after, target area
  const show = new Set();
  for(let i=Math.max(0,current-2);i<=Math.min(route.length-1,current+3);i++) show.add(i);
  for(let i=Math.max(0,target-1);i<=Math.min(route.length-1,target+1);i++) show.add(i);

  let prev=-1;
  [...show].sort((a,b)=>a-b).forEach(i=>{
    if(prev!==-1 && i-prev>1){
      const skip=document.createElement('div');
      skip.style.cssText='padding:4px 0;font-size:11px;color:var(--muted);padding-left:4px';
      skip.textContent=`··· ${i-prev-1} stops ···`;
      el.appendChild(skip);
    }
    const div=document.createElement('div');
    div.className='stop-row'+(i<current?' passed':i===current?' current':i===target?' target':'');
    const badge = i===current?`<span class="stop-badge tag-teal tag" style="margin-left:auto">HERE</span>`:
                  i===target?`<span class="stop-badge tag-coral tag" style="margin-left:auto">DEST</span>`:'';
    div.innerHTML=`<span class="stop-name">${route[i]}</span>${badge}`;
    el.appendChild(div);
    prev=i;
  });

  // Progress %
  const total=Math.abs(target-current)+Math.abs(current-(target>current?target:current));
  const traveled=Math.abs(current-(state.journey.route.indexOf(document.getElementById('src-sel').value)||current));
  const totalDist=Math.abs(target-(state.journey.route.indexOf(document.getElementById('src-sel').value)||0))||1;
  const pct=Math.round(traveled/totalDist*100);
  document.getElementById('prog-fill').style.width=Math.min(pct,100)+'%';
  document.getElementById('prog-pct').textContent=Math.min(pct,100)+'%';
}

// ─── Advance Station ───────────────────────────────────────────────
function advanceStation() {
  if(!state.journey.active) return;
  const {route, target} = state.journey;
  if(state.journey.current >= route.length-1) return;
  state.journey.current++;
  const cur = state.journey.current;
  const curName = route[cur];
  log(`Vehicle arrived at: ${curName}`,'normal');
  updateTimeline();
  state.kpi.stops++;
  updateKPIs();
  updateSensorKPI();
  addMilestone('📍',`Passed ${curName}`, new Date().toLocaleTimeString());
  updateGPSDisplay(curName);

  if(cur === target-1) {
    toast(`🔔 NEXT STOP: ${route[target]} — Prepare to alight!`,'warning',5000);
    log(`⚡ PROXIMITY ALERT — Next stop is destination: ${route[target]}`,'alert');
    addMilestone('🔔','Pre-arrival alert sent',`Next: ${route[target]}`);
    if(state.elderlyMode) voiceAnnounce();
  }

  if(cur === target) {
    toast(`🎉 ARRIVED at ${curName}! Have a safe onward journey.`,'success',5000);
    log(`✅ Passenger "${state.user}" arrived at destination: ${curName}`,'success');
    addMilestone('✅','Arrived at destination',curName);
    saveTrip();
    state.fleetMap[curName] = Math.max(0,(state.fleetMap[curName]||1)-1);
    state.kpi.onboard = Math.max(0,state.kpi.onboard-1);
    updateHeroStats();
    updateKPIs();
    updateFleetChart();
    setTimeout(resetJourney, 3000);
  }
}

// ─── Save Trip ─────────────────────────────────────────────────────
function saveTrip() {
  const src = document.getElementById('src-sel').value;
  const dest = state.journey.destName;
  if(!state.history[state.user]) state.history[state.user]={};
  if(!state.history[state.user][src]) state.history[state.user][src]={};
  state.history[state.user][src][dest] = (state.history[state.user][src][dest]||0)+1;
  localStorage.setItem('ss_history', JSON.stringify(state.history));
}

// ─── Reset Journey ─────────────────────────────────────────────────
function resetJourney() {
  state.journey = {active:false, route:[], current:0, target:0, destName:''};
  document.getElementById('setup-form').style.display='block';
  document.getElementById('tracking-active').style.display='none';
  document.getElementById('ai-block').style.display='none';
  document.getElementById('manual-wrap').style.display='none';
  document.getElementById('line-sel').value='';
  document.getElementById('src-sel').innerHTML='<option>— Select Entry Stop —</option>';
  const mc=document.getElementById('map-card');
  mc.style.opacity='.3'; mc.style.pointerEvents='none';
  document.getElementById('tracking-dest').textContent='—';
  document.getElementById('dest-display').classList.remove('locked');
  document.getElementById('route-path').innerHTML='';
  document.getElementById('prog-fill').style.width='0';
  document.getElementById('prog-pct').textContent='0%';
}

// ─── SOS ───────────────────────────────────────────────────────────
function triggerSOS() {
  state.kpi.sos++;
  updateKPIs();
  toast('🆘 SOS TRANSMITTED — Driver and caregivers notified!','danger',6000);
  log(`!!! SOS ALERT !!! User: "${state.user}" — GPS: 12.9716N 77.5946E`,'danger');
  addMilestone('🆘','SOS Alert Triggered', new Date().toLocaleTimeString());
  navigator.vibrate && navigator.vibrate([300,100,300,100,300]);
}

// ─── Elderly Mode ──────────────────────────────────────────────────
function toggleElderly() {
  state.elderlyMode = document.getElementById('elderly-toggle').checked;
  toast(state.elderlyMode ? '👴 Elderly Mode ON — enhanced alerts active' : 'Standard mode', state.elderlyMode?'info':'info');
  log(`Elderly mode ${state.elderlyMode?'ENABLED':'DISABLED'} for "${state.user}"`, state.elderlyMode?'alert':'normal');
}

function voiceAnnounce() {
  const dest = state.journey.active ? state.journey.destName : 'your destination';
  const msg = state.journey.active
    ? `Alert. Your destination, ${dest}, is approaching. Please prepare to alight.`
    : `SmartStop AI Elderly Assist Mode is active. Your journey is being monitored.`;
  if('speechSynthesis' in window) {
    const utt = new SpeechSynthesisUtterance(msg);
    utt.rate=0.9; utt.pitch=1; utt.volume=1;
    window.speechSynthesis.speak(utt);
  }
  toast('🔊 Voice alert spoken','info');
}

function showNotifyCaregiver() { notifyCaregiver('all contacts'); }
function notifyCaregiver(name) {
  toast(`📲 ${name} notified about your journey status`,'success');
  log(`Caregiver notification sent to: ${name}`,'success');
  addMilestone('📲',`${name} notified`,new Date().toLocaleTimeString());
}

// ─── Milestones ────────────────────────────────────────────────────
function addMilestone(icon, title, time) {
  const feed = document.getElementById('milestone-feed');
  const item = document.createElement('div');
  item.className='milestone-item';
  item.innerHTML=`<div class="ms-icon" style="background:rgba(11,122,117,.1)">${icon}</div><div class="ms-text"><div class="ms-title">${title}</div><div class="ms-time">${time}</div></div>`;
  feed.insertBefore(item, feed.firstChild);
}

// ─── Fleet Chart ───────────────────────────────────────────────────
function updateFleetChart() {
  const el = document.getElementById('fleet-chart');
  const entries = Object.entries(state.fleetMap).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){ el.innerHTML='<div style="text-align:center;padding:40px;color:var(--muted);font-size:14px">No demand data yet.<br>Passengers must start journeys first.</div>'; return; }
  const max = Math.max(...entries.map(([,v])=>v));
  el.innerHTML = entries.slice(0,8).map(([stop,pax])=>{
    const pct = Math.round(pax/max*100);
    const col = pct>70?'var(--coral)':pct>40?'var(--amber)':'var(--teal)';
    return `<div class="fleet-item"><div class="fleet-meta"><span class="stop">${stop}</span><span class="pax">${pax} PAX</span></div><div class="fleet-track"><div class="fleet-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
  }).join('');
}

// ─── Simulate PAX ──────────────────────────────────────────────────
function addSimPax() {
  const stop = document.getElementById('sim-stop').value;
  if(!stop){toast('Select a stop','warning');return;}
  state.fleetMap[stop]=(state.fleetMap[stop]||0)+1;
  state.kpi.onboard++;
  updateFleetChart();
  updateKPIs();
  updateHeroStats();
  log(`Simulated passenger added — Destination: ${stop}`,'normal');
  toast(`+1 PAX heading to ${stop}`,'info');
}

function populateSimStops() {
  const sel=document.getElementById('sim-stop');
  const all=[...STATIONS.Purple,...STATIONS.Green];
  all.forEach(s=>{const o=document.createElement('option');o.value=o.textContent=s;sel.appendChild(o);});
}

// ─── KPIs ──────────────────────────────────────────────────────────
function updateKPIs() {
  document.getElementById('kpi-onboard').textContent=state.kpi.onboard;
  document.getElementById('kpi-sos').textContent=state.kpi.sos;
  document.getElementById('kpi-pred').textContent=state.kpi.pred;
  document.getElementById('kpi-stops').textContent=state.kpi.stops;
}
function updateHeroStats() { document.getElementById('stat-onboard').textContent=state.kpi.onboard; }
function updateSensorKPI() { document.getElementById('sensor-count').innerHTML=state.kpi.onboard+' <span class="sensor-unit">PAX</span>'; drawMiniGraph(); }
function updateSensorView() { updateSensorKPI(); }

// ─── Sensor Buttons ────────────────────────────────────────────────
function boardPax(){ state.kpi.onboard++; updateHeroStats(); updateKPIs(); updateSensorKPI(); log('Door sensor: +1 passenger boarded','success'); }
function alightPax(){ if(state.kpi.onboard>0){state.kpi.onboard--;} updateHeroStats(); updateKPIs(); updateSensorKPI(); log('Door sensor: -1 passenger alighted','normal'); }

// ─── Mini Graph ────────────────────────────────────────────────────
const graphHistory=[0,0,0,0,0,0,0,0,0,0];
function drawMiniGraph(){
  graphHistory.push(state.kpi.onboard);
  graphHistory.shift();
  const el=document.getElementById('count-graph');
  if(!el)return;
  const max=Math.max(...graphHistory,1);
  el.innerHTML='<div style="display:flex;align-items:flex-end;height:100%;gap:3px;padding:4px">'
    +graphHistory.map(v=>`<div class="mini-bar" style="flex:1;height:${Math.max(6,Math.round(v/max*36))}px"></div>`).join('')+'</div>';
}

// ─── GPS Display ───────────────────────────────────────────────────
function updateGPSDisplay(stopName){
  document.getElementById('gps-stop').textContent=stopName;
  const lat=(12.9716+Math.random()*0.02-0.01).toFixed(4);
  const lon=(77.5946+Math.random()*0.02-0.01).toFixed(4);
  document.getElementById('gps-pos').textContent=`${lat}° N, ${lon}° E`;
}

// ─── Init ──────────────────────────────────────────────────────────
populateSimStops();
log('SmartStop AI — Prototype interface loaded','success');
log('Namma Metro network data loaded (Purple & Green Lines)','normal');
log('Waiting for passenger login...','normal');

// Simulate live KPI tick
setInterval(()=>{
  if(state.journey.active){
    const fl=state.fleetMap; let total=0;
    Object.values(fl).forEach(v=>total+=v);
    document.getElementById('stat-onboard').textContent=state.kpi.onboard;
  }
},5000);
