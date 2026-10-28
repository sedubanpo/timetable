const vm=require('node:vm'),fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const old=cp.execFileSync('git',['show','6a83611:docs/index.html'],{maxBuffer:4e6}).toString();
const current=fs.readFileSync('docs/index.html','utf8');
function make(html){const start=html.indexOf('      function withScheduleSnapshot('),end=html.indexOf('      function loadData(',start);const c={setTimeout,clearTimeout,Date,Promise};vm.createContext(c);vm.runInContext(html.slice(start,end),c);return c;}
(async()=>{for(const [version,html]of [['old',old],['new',current]])for(const code of ['SNAPSHOT_EXPIRED','INVALID_SNAPSHOT','SNAPSHOT_NOT_FOUND','SNAPSHOT_TOO_LARGE']){
 const c=make(html);c.snapshotRequest=async()=>{throw Error(code)};let shown=false;
 assert.equal((await c.withScheduleSnapshot(Promise.resolve({version:'live'}),'day','',()=>{shown=true},false)).version,'live');assert.equal(shown,false);
 const fail=c.withScheduleSnapshot(Promise.reject(Error('SOURCE_UNAVAILABLE')),'day','',()=>{shown=true},false);await assert.rejects(fail,e=>version==='old'?e.message==='SOURCE_UNAVAILABLE':e.message.includes('새로고침'));assert.equal(shown,false);
 await assert.rejects(c.withScheduleSnapshot(Promise.reject(Error('FORBIDDEN')),'day','',()=>{},false),/FORBIDDEN/);
}console.log('PASS old/new clients reject expired/corrupt backup, preserve live success and auth failure; new client adds retry guidance');})().catch(e=>{console.error(e);process.exitCode=1});
