const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('Index.html', 'utf8');
const code = source.slice(source.indexOf('      function apiLoginJsonp('), source.indexOf('      var optionalRosterRequestKey'));
function fixture() {
  let now = 0, id = 0; const jobs = new Map(), scripts = [];
  const win = {};
  const head = { appendChild(s) { scripts.push(s); s.parentNode = head; }, removeChild(s) { s.parentNode = null; } };
  const context = { window: win, document: { head, createElement: () => ({}) }, getApiBaseUrl: () => 'https://example.invalid/exec',
    Date: { now: () => now }, Math, Promise, Error, Number, Object, encodeURIComponent,
    setTimeout(fn, delay) { jobs.set(++id, { fn, time: now + delay }); return id; }, clearTimeout(id) { jobs.delete(id); } };
  vm.createContext(context); vm.runInContext(code, context);
  return { win, scripts, start: () => context.apiLoginJsonp({action:'auth',pw:'SECRET',idToken:'TOKEN'}),
    reply(index, value) { win[new URL(scripts[index].src).searchParams.get('callback')](value); },
    advance(ms) { const end=now+ms; for (;;) { const next=[...jobs].filter(([,j])=>j.time<=end).sort((a,b)=>a[1].time-b[1].time)[0]; if(!next)break; now=next[1].time; jobs.delete(next[0]); next[1].fn(); } now=end; } };
}
(async () => {
  let f=fixture(), p=f.start(); f.reply(0,{ok:true,serverMs:100}); assert.equal((await p).ok,true); f.advance(65000); assert.equal(f.scripts.length,1);
  f=fixture(); p=f.start(); f.advance(31000); f.reply(0,{ok:true}); assert.equal((await p).ok,true); f.advance(1000); assert.equal(f.scripts.length,1);
  f=fixture(); p=f.start(); f.advance(32000); assert.equal(f.scripts.length,2); f.reply(0,{ok:true}); assert.equal((await p).ok,true); f.reply(1,{ok:false}); assert.ok(f.scripts.every(s=>!s.parentNode));
  assert.ok(!JSON.stringify(f.win.__seduApiDiagnostics).includes('SECRET')); assert.ok(!JSON.stringify(f.win.__seduApiDiagnostics).includes('TOKEN'));
  f=fixture(); p=f.start().catch(e=>e); f.advance(65000); assert.match((await p).message,/API 호출 시간 초과/); assert.equal(f.scripts.length,2); f.reply(0,{ok:true});
  f=fixture(); p=f.start(); f.scripts[0].onerror(); f.advance(1500); assert.equal(f.scripts.length,2); f.reply(1,{ok:false,error:'DENIED'}); assert.equal((await p).ok,false); f.advance(65000); assert.equal(f.scripts.length,2);
  let calls=0, refreshes=0, replyRoster;
  const rosterContext={authState:{loggedIn:true,isMaster:true,loginId:'qa'},availableTeacherNames:[],Date,Error,
    getLiveFirebaseAuth:()=>Promise.resolve({currentUser:{getIdToken:()=>Promise.resolve('token')}}),
    callServer:()=>{calls++; return new Promise(resolve=>{replyRoster=resolve;});},populateTeacherSelector:()=>refreshes++};
  vm.createContext(rosterContext);
  vm.runInContext(source.slice(source.indexOf('      var optionalRosterRequestKey'),source.indexOf('      function callServer(')),rosterContext);
  rosterContext.refreshOptionalTeacherRoster(); rosterContext.refreshOptionalTeacherRoster();
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(calls,1);
  vm.runInContext('optionalRosterRequestKey=""; authState.loggedIn=false;',rosterContext);
  replyRoster({ok:true,teacherNames:['stale']}); await new Promise(resolve=>setImmediate(resolve)); assert.equal(refreshes,0);
  rosterContext.authState={loggedIn:true,isMaster:false,loginId:'teacher'}; rosterContext.refreshOptionalTeacherRoster(); assert.equal(calls,1);
  rosterContext.authState={loggedIn:true,isMaster:true,loginId:'admin2'}; rosterContext.refreshOptionalTeacherRoster(); await new Promise(resolve=>setImmediate(resolve));
  replyRoster({ok:true,teacherNames:['active']}); await new Promise(resolve=>setImmediate(resolve)); assert.equal(refreshes,1); assert.equal(rosterContext.availableTeacherNames[0],'active');
  console.log('Login transport and roster passed: late replies, deadline, retry, denial, cleanup, safe diagnostics; roster deduplication, logout race, teacher exclusion and async success.');
})().catch(e=>{console.error(e);process.exitCode=1;});
