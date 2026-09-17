const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
async function verify(file) {
  const source = [...fs.readFileSync(file, 'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim()).pop();
  const elements = new Map(), timers = new Map(); let id = 0;
  const element = key => { if (!elements.has(key)) elements.set(key, { style: {}, value: '9/17', classList: { add() {}, remove() {} } }); return elements.get(key); };
  const scope = { console, window: { addEventListener() {} }, document: { hidden: false, addEventListener() {}, getElementById: element, body: { classList: { remove() {} } } }, localStorage: { getItem() { return null; } }, setTimeout() {}, clearTimeout() {}, setInterval(fn, ms) { timers.set(++id, { fn, ms }); return id; }, clearInterval(k) { timers.delete(k); }, URLSearchParams, Date, Promise, Set, Map };
  vm.createContext(scope); vm.runInContext(source, scope);
  const run = code => vm.runInContext(code, scope);
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  run(`authState={loggedIn:true,isMaster:true,loginId:'qa'};currentSheetName='9/17';
    renderTable=resetVisitorLookupIndexCache=syncLookupDimmingState=()=>{};
    loadSharedSubjectIcons=()=>Promise.resolve();
    isStudentImageModalOpen=()=>false;
    loadOperationMemosForCurrentSheet=()=>Promise.resolve([]);loadStudentEnrollmentStatusWarnings=()=>Promise.resolve(false);
    globalThis.requests=[];callServer=(method,args)=>new Promise((resolve,reject)=>requests.push({method,args,resolve,reject}));
    processData({headers:[],grid:{},version:'same'},false);`);
  assert.equal(timers.size, 1);
  const tick = [...timers.values()][0];
  assert.equal(tick.ms, 60000, 'user-approved one-minute cadence');
  for (let i = 0; i < 30; i++) { tick.fn(); scope.requests.at(-1).resolve('same'); await flush(); }
  assert.equal(scope.requests.length, 30, '30 checks per simulated half-hour, previously60');
  scope.document.hidden = true; tick.fn(); assert.equal(scope.requests.length, 30);
  scope.document.hidden = false; element('mainPage').style.display = 'none'; tick.fn(); assert.equal(scope.requests.length, 30);
  element('mainPage').style.display = 'flex'; tick.fn(); tick.fn(); assert.equal(scope.requests.length, 31, 'pending version check coalesced');
  scope.requests.at(-1).resolve('changed'); await flush();
  assert.equal(element('updateAlert').style.display, 'block');
  run(`globalThis.manual=0;loadData=()=>{manual++};canCurrentUserSubmitAttendance=()=>false;refreshData();`);
  assert.equal(scope.manual, 1, 'manual refresh starts without waiting for poll');
  run(`processData({headers:[],grid:{},version:'next'},false)`); assert.equal(timers.size, 1, 'new data replaces timer');
  console.log(`${file}: 60s cadence, half-hour30 checks, hidden/home/inflight guard, update notice, immediate manual refresh PASS`);
}
(async () => { await verify('Index.html'); await verify('docs/index.html'); })().catch(e => { console.error(e); process.exitCode = 1; });
