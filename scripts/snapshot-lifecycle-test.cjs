const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('Index.html','utf8'),app=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim()).pop();
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const elements=new Map(),timers=new Map();let id=0;
const el=k=>{if(!elements.has(k))elements.set(k,{style:{},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){}});return elements.get(k);};
const c={window:{innerWidth:1440,addEventListener(){}},document:{getElementById:el,addEventListener(){},body:{classList:{add(){},remove(){}}}},localStorage:{getItem(){return null;}},console,alert(){},setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval(){},clearInterval(){},Date,Intl,Promise,Set,Map,URLSearchParams};
vm.createContext(c);vm.runInContext(app,c);const run=s=>vm.runInContext(s,c);
run(`authState={loggedIn:true,isMaster:true,loginId:'a'};getActiveTeacherName=()=>'';isTeacherViewActive=()=>false;
closeOperationMemoAlert=clearOperationMemoHighlights=renderOperationCommonMemos=calendarSync=recordTeacherViewAfterSuccessfulLoad=()=>{};
loadOperationMemosForCurrentSheet=()=>Promise.resolve();renderTable=()=>{};
globalThis.applied=[];globalThis.preserves=[];processData=(d,r,id,preserve)=>{lastData=d;applied.push(d.version);preserves.push(preserve)};
globalThis.live=[];callServer=()=>new Promise((resolve,reject)=>live.push({resolve,reject}));
snapshotRequest=(action,sheet)=>Promise.resolve({sheet,savedAt:Date.now(),data:{headers:['room'],grid:{},version:'snapshot'}});`);
function tick(){for(const [id,t]of timers)if(t.ms===0){timers.delete(id);t.fn();}}
(async()=>{
  run("loadData('9/28(월)',true)");tick();await flush();assert.equal(run('snapshotView.sheet'),'9/28(월)');assert.equal(run('Object.keys(clientCache).length'),0);assert.equal(run('lastSuccessfulSchedule'),null);
  c.live[0].resolve({headers:['room'],grid:{},version:'live'});await flush();assert.equal(run('snapshotView'),null);assert.equal(run('lastData.version'),'live');assert.equal(el('snapshotNotice').hidden,false);assert.equal(el('snapshotSourceLabel').textContent,'실시간 시간표');
  assert.equal(c.preserves.at(-1),true,'live replacement preserves the current viewport');
  run("loadData('9/29(화)',true)");tick();await flush();c.live[1].reject(Error('API_TIMEOUT'));await flush();assert.equal(run('lastData.version'),'snapshot');assert.equal(run('snapshotView.sheet'),'9/29(화)');
  run("loadData('9/29(화)',true)");assert.equal(el('loading').style.display,'none','background refresh never covers a visible backup');tick();await flush();c.live[2].reject(Error('FIREBASE_BLOCKED'));await flush();assert.equal(run('snapshotView'),null);assert.equal(run('lastSuccessfulSchedule'),null);assert.equal(run('lastData.version'),'ERROR');
  run("snapshotRequest=()=>new Promise(resolve=>globalThis.resolveSnapshot=resolve);loadData('9/28(월)',true)");tick();await flush();
  run("authState.loginId='b';loadData('9/29(화)',true)");c.resolveSnapshot({sheet:'9/28(월)',savedAt:Date.now(),data:{version:'private-old'}});await flush();assert(!c.applied.includes('private-old'));
  c.live[3].resolve({version:'old-live'});c.live[4].resolve({headers:['room'],grid:{},version:'new-live'});await flush();assert.equal(run('lastData.version'),'new-live');
  run("snapshotRequest=(action,sheet)=>Promise.resolve({sheet,savedAt:Date.now(),data:{version:'older-backup'}});loadData('9/29(화)',true)");tick();await flush();assert.equal(run('lastData.version'),'new-live','visible live result is not downgraded to backup');
  c.live[5].reject(Error('FIREBASE_BLOCKED'));await flush();assert.equal(run('lastData.version'),'ERROR','revocation clears even a live cached view');assert.equal(run('Object.keys(clientCache).length'),0);
  console.log('PASS integrated snapshot display, live recovery, cache separation, timeout retention, revoked access clearing, stale account/date rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
