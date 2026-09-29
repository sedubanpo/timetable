const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('Index.html','utf8'),mirror=fs.readFileSync('docs/index.html','utf8');
const from='      function escapeTeacherLogHtml(',to='      function getCurrentReportHour(';
const script=html.slice(html.indexOf(from),html.indexOf(to));
assert.equal(script,mirror.slice(mirror.indexOf(from),mirror.indexOf(to)));
for(const page of [html,mirror]) {
 for(const m of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim()) new vm.Script(m[1]);
 assert(page.includes(fs.readFileSync('scripts/teacher-dashboard.css','utf8')));
}
function context(){
 const storage=new Map(),els={};let now=Date.parse('2026-09-30T01:00:00Z');
 class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} }
 const c={Date:Clock,console,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  authState:{loggedIn:true,isMaster:true,loginId:'admin'},currentSheetName:'9/30(수)',availableSheets:['9/28(월)','9/29(화)','9/30(수)','10/1(목)'],
  teacherRoomStatsRequest:0,teacherRoomStatsLoading:false,teacherRoomStatsCache:null,teacherRoomStatsContext:'',teacherRoomStatsPromise:null,teacherDashboardActiveTab:'rooms',teacherDashboardBuilding:'all',teacherDashboardRoomSort:'hours',
  SCHEDULE_START_HOUR:8,SCHEDULE_END_HOUR:23,clientCache:{},lastData:null,
  document:{getElementById:id=>els[id]||(els[id]={value:'',innerHTML:'',textContent:'',classList:{add(){},toggle(){}},setAttribute(){}})},
  getScheduleSessionKey(){return c.authState.loginId;},getActiveTeacherName(){return '';},
  isTeacherHeader:s=>s.endsWith('T'),extractTeacherName:s=>s.replace('T','')};
 vm.createContext(c);vm.runInContext(script,c);
 c.tick=ms=>now+=ms;c.setTime=v=>now=Date.parse(v);c.storage=storage;c.els=els;
 c.reads=[];c.callServer=async(name,args)=>{c.reads.push(args[0]);return {headers:['1강의실','2관 1강의실'],grid:{13:[['가상T','개인정보 학생'],['테스트T']]}};};
 return c;
}
(async()=>{
 let c=context();await c.loadTeacherRoomStats(false);assert.equal(c.reads.length,3);assert.equal(c.teacherRoomStatsCache.teachers.length,2);
 assert(![...c.storage.values()].join('').includes('개인정보'));
 c.teacherRoomStatsCache=null;await c.loadTeacherRoomStats(false);assert.equal(c.reads.length,3,'reopen reuses days');
 c.tick(6*60000);await c.loadTeacherRoomStats(false);assert.deepEqual(c.reads.slice(3),['9/30(수)'],'only mutable date expires');
 c.availableSheets.push('9/27(일)');await c.loadTeacherRoomStats(false);assert.equal(c.reads.at(-1),'9/27(일)','new sheet does not invalidate other dates');
 let before=c.reads.length;await c.loadTeacherRoomStats(true);assert.equal(c.reads.length-before,4,'explicit refresh fetches past too');
 c.authState.loginId='other';before=c.reads.length;await c.loadTeacherRoomStats(false);assert.equal(c.reads.length-before,4,'account isolation');
 c=context();c.setTime('2026-09-29T14:59:00Z');await c.loadTeacherRoomStats(false);c.setTime('2026-09-29T15:01:00Z');let day=c.readTeacherRoomDay('9/29(화)');assert.equal(day,null,'yesterday needs one post-midnight capture');
 c=context();c.callServer=async(n,a)=>{c.reads.push(a[0]);if(a[0]==='9/29(화)')throw Error('offline');return {headers:[],grid:{}};};await c.loadTeacherRoomStats(false);assert.equal(c.teacherRoomStatsCache.failedSheets.length,1);before=c.reads.length;await c.loadTeacherRoomStats(false);assert.deepEqual(c.reads.slice(before),['9/29(화)'],'retry only missing');
 c=context();let resolve;c.callServer=()=>new Promise(r=>resolve=r);let pending=c.loadTeacherRoomStats(false);assert.equal(c.loadTeacherRoomStats(false),pending,'deduplicate in flight');c.authState.loginId='changed';resolve({headers:[],grid:{}});await pending;assert.equal(c.storage.size,0,'old response never persists');assert.equal(c.teacherRoomStatsCache,null);
 c=context();c.callServer=async()=>{throw Error('FORBIDDEN');};await c.loadTeacherRoomStats(false);assert.equal(c.teacherRoomStatsCache,null);assert.match(c.els.teacherViewLogList.innerHTML,/권한/);assert.equal(c.teacherRoomStatsLoading,false);
 c=context();c.authState.isMaster=false;await c.loadTeacherRoomStats(false);assert.equal(c.reads.length,0);
 c=context();let finishOld,finishNew;c.teacherDashboardLogRequest=0;c.teacherDashboardReturnFocus=null;c.els.teacherViewLogModal={close(){}};c.callServer=()=>new Promise(r=>finishOld=r);let old=c.loadTeacherRoomStats(false);c.closeTeacherViewLogModal();c.callServer=()=>new Promise(r=>finishNew=r);let fresh=c.loadTeacherRoomStats(false);finishOld({headers:[],grid:{}});await old;assert.equal(c.teacherRoomStatsLoading,true,'old close/reopen completion cannot reset new loading');assert.equal(c.storage.size,0);c.authState.loginId='stop';finishNew({headers:[],grid:{}});await fresh;
 console.log('PASS: HTML syntax/parity; per-day cache, expiry, KST finalization, added dates, force refresh, isolated account, aggregate privacy, partial retry, deduplication, stale response and permission handling.');
})().catch(e=>{console.error(e);process.exitCode=1;});
