const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const fragment=fs.readFileSync('scripts/snapshot-client.fragment.js','utf8');
for(const file of ['Index.html','docs/index.html'])assert(fs.readFileSync(file,'utf8').includes(fragment.trimEnd()),file+' snapshot helper parity');
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function fixture(){let timer;const c={setTimeout(fn){timer=fn;return 1;},clearTimeout(){timer=null;},Date,Intl,Promise,Number};vm.createContext(c);vm.runInContext(fragment,c);return {c,tick(){timer();}};}
(async()=>{
  let f=fixture(),resolveLive,reads=0,display=[];
  const saved={sheet:'9/28(월)',savedAt:Date.now(),data:{version:'saved'}};
  f.c.snapshotRequest=async()=>{reads++;return saved;};
  let p=f.c.withScheduleSnapshot(new Promise(r=>resolveLive=r),saved.sheet,'',r=>display.push(r.data.version),false);
  f.tick();await flush();assert.deepEqual(display,['saved']);assert.equal(reads,1);resolveLive({version:'live'});assert.equal((await p).version,'live');
  f=fixture();let rejectLive;display=[];f.c.snapshotRequest=async()=>saved;
  p=f.c.withScheduleSnapshot(new Promise((_,r)=>rejectLive=r),saved.sheet,'',r=>display.push(r.data.version),false);
  f.tick();await flush();rejectLive(Error('API_TIMEOUT'));assert.equal((await p).__snapshotHandled,true);assert.deepEqual(display,['saved']);
  f=fixture();f.c.snapshotRequest=()=>{throw Error('must not read');};await assert.rejects(f.c.withScheduleSnapshot(Promise.reject(Error('FORBIDDEN')),saved.sheet,'',()=>{},false));
  f=fixture();let resolveSaved;display=[];f.c.snapshotRequest=()=>new Promise(r=>resolveSaved=r);
  p=f.c.withScheduleSnapshot(new Promise(r=>resolveLive=r),saved.sheet,'',r=>display.push(r),false);f.tick();resolveLive({version:'live'});await p;resolveSaved(saved);await flush();assert.equal(display.length,0);
  f=fixture();f.c.snapshotRequest=async()=>({...saved,savedAt:Date.now()-86400001});await assert.rejects(f.c.withScheduleSnapshot(Promise.reject(Error('API_TIMEOUT')),saved.sheet,'',()=>{throw Error('stale');},false));
  console.log('PASS snapshot parity, delayed fallback, live recovery, no duplicate read, permission rejection, late snapshot discard and expiry');
})().catch(e=>{console.error(e);process.exitCode=1;});
