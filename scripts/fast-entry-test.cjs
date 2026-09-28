const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const fragment=fs.readFileSync('scripts/fast-entry.fragment.js','utf8');
for(const file of ['Index.html','docs/index.html']) {
  const html=fs.readFileSync(file,'utf8');assert(html.includes(fragment.trimEnd()));
  const init=html.slice(html.indexOf('      function initApp('),html.indexOf('      function renderCalendar('));
  assert(!init.includes('updateTeacherCalendarAvailability('),'no full-sheet scan on entry');
}
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(){
  let calls=[],elements=new Map(),resolveNames,resolveQuick;
  const el=id=>{if(!elements.has(id))elements.set(id,{style:{}});return elements.get(id);};
  const c={Promise,Error,Object,Array,Date,AbortController,setTimeout,clearTimeout,SNAPSHOT_API_URL:'https://example.invalid',
    authState:{loggedIn:true,loginId:'teacher'},availableSheets:[],sheetNamesLoaded:false,currentSheetName:'',scheduleLoadSequence:0,
    document:{getElementById:el},getScheduleSessionKey:()=>c.authState.loginId,
    initApp:n=>{c.availableSheets=n;c.initial=n;},loadSheetNamesCache:()=>[],saveSheetNamesCache(){},buildSheetMapFromNames:n=>n,
    populateMainSheetSelector(){},renderCalendar(){},calendarSync(){},
    snapshotRequest:()=>new Promise(r=>resolveQuick=r),
    callServer:(method,args)=>{calls.push({method,args});return new Promise(r=>resolveNames=r);},
    fetch:async()=>({ok:true,status:200,json:async()=>({ok:true,identity:{ok:true,firebaseUid:'u',loginId:'teacher'},sheets:['9/28(월)']})})};
  vm.createContext(c);vm.runInContext(fragment,c);
  return {c,calls,el,names:v=>resolveNames(v),quick:v=>resolveQuick(v)};
}
(async()=>{
  let f=fixture();const res=await f.c.authenticateTimetableFast('teacher','secret','id-token');
  assert.equal(res.firebaseUid,'u');assert.equal(f.calls.length,0,'fast auth avoids GAS');
  f.c.rememberTimetableBootstrap(res);await f.c.startAppAfterAuth();
  assert.equal(f.c.initial[0],'9/28(월)');assert.equal(f.el('introLoading').style.display,'none');
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'getSheetNames');
  f.c.currentSheetName='9/28(월)';f.el('mainPage').style.display='flex';
  f.names(['9/28(월)','9/29(화)']);await flush();assert.equal(f.el('mainPage').style.display,'flex','late dates do not navigate away');
  f=fixture();f.c.fetch=async()=>({ok:false,status:403});await assert.rejects(f.c.authenticateTimetableFast('teacher','secret','token'),e=>e.code==='ACCESS_DENIED');assert.equal(f.calls.length,0,'denial never downgraded');
  f=fixture();f.c.fetch=async()=>{throw Error('network');};const p=f.c.authenticateTimetableFast('teacher','secret','token');await flush();assert.equal(f.calls[0].method,'authenticateTeacher');f.names({ok:true});await p;
  f=fixture();await f.c.startAppAfterAuth();f.c.authState.loginId='other';f.names(['private-old']);f.quick({sheets:['old']});await flush();assert.equal(f.c.availableSheets.length,0,'stale account callback ignored');
  f=fixture();await f.c.startAppAfterAuth();f.quick({sheets:['9/29(화)']});await flush();assert.equal(f.c.availableSheets[0],'9/29(화)','snapshot dates usable while original is pending');
  f=fixture();f.c.rememberTimetableBootstrap({loginId:'teacher',startupSheets:['9/29(화)'],startupCatalogSavedAt:Date.now()-60000});
  await f.c.startAppAfterAuth();assert.equal(f.calls.length,0,'recent catalog skips origin on login and Home');assert.equal(f.el('calendarRetryBtn').hidden,false);
  await f.c.startAppAfterAuth(true);assert.equal(f.calls.length,1,'explicit calendar refresh still checks origin');
  f=fixture();f.c.rememberTimetableBootstrap({loginId:'teacher',startupSheets:['9/29(화)'],startupCatalogSavedAt:Date.now()-7200001});await f.c.startAppAfterAuth();assert.equal(f.calls.length,1,'older catalog refreshes in background');
  const snapshotFragment=fs.readFileSync('scripts/snapshot-client.fragment.js','utf8');let delay;
  const timing={setTimeout:(fn,ms)=>{delay=ms;return 1;},clearTimeout(){},Date,Intl,Promise,Number};vm.createContext(timing);vm.runInContext(snapshotFragment,timing);
  timing.withScheduleSnapshot(new Promise(()=>{}),'9/28(월)','',()=>{},false);assert.equal(delay,0);
  console.log('PASS fast verified auth, no GAS login dependency, immediate calendar, no entry-wide scan, nonblocking refresh, denial, legacy fallback, stale identity and immediate snapshot query');
  console.log('Deterministic timing: snapshot request start 8000ms -> 0ms; calendar ready with unresolved origin (no production latency claim).');
})().catch(e=>{console.error(e);process.exitCode=1;});
