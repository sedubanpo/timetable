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
  getSubjectName:()=> '국어',isTeacherHeader:s=>s.endsWith('T'),extractTeacherName:s=>s.replace('T','')};
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

// Check the actual monthly source, including rows beyond the original tail limit.
{
 const code=fs.readFileSync('Code.gs','utf8');
 const rows=Array.from({length:340},()=>['2026-09-28 18:00:00','가상','9/30(수)']);
 rows.push(['2026-12-31 18:00:00','가상','1/1(금)']);
 const monthServer={getSheetNames:()=>['9/30(수)'],getDashboardAdminSessionLogin_:t=>t==='ok',getTeacherViewOverrides_:()=>[],SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>rows.length+1,getRange:()=>({getDisplayValues:()=>rows})})})}};
 vm.runInNewContext(code.slice(code.indexOf('function teacherViewMonthKey_'),code.indexOf('function getTeacherViewLogs_')),monthServer);
 assert.equal(monthServer.getTeacherDashboardMonth('2026-09','ok').logs.length,340);
 assert.equal(monthServer.getTeacherDashboardMonth('2027-01','ok').logs.length,1);
 assert.throws(()=>monthServer.getTeacherDashboardMonth('2026-09',''),/ADMIN_SESSION/);
 const c=context();
 const sheets={'2026-09-28':'9/28(월)','2026-09-29':'9/29(화)','2026-09-30':'9/30(수)','2026-10-01':'10/1(목)'};
 const counts=c.dashboardDays([{teacherName:'가상',sheetName:'9/28(월)',viewedAt:'2026-09-27 20:00:00'},{teacherName:'가상',sheetName:'9/28(월)',viewedAt:'2026-09-28 09:00:00'}]);
 const rank=c.monthlyReadRank({sheets,counts,rosters:{'2026-09-28':{'가상':{}},'2026-09-30':{'가상':{},'다른':{}}},failed:new Set(['2026-09-29'])});
 assert.equal(rank.viewed['가상'],2);assert.equal(rank.missing['가상'],1);assert.equal(rank.missing['다른'],1);
 assert.equal(rank.scheduled['가상'],2);assert.equal(rank.days,3);assert.equal(rank.known,2);assert.equal(rank.failed,1);
 const data={month:'2026-09',sheets,counts,subjects:{},failed:new Set(),rosters:{'2026-09-28':{'가상':{subjects:{'국어':2}},'미확인':{}}}};
 c.teacherDashboardSelectedDate='2026-09-28';c.teacherDashboardHistoryDate='9/28(월)';c.teacherDashboardStatusFilter='all';c.teacherDashboardEditMode=false;c.teacherViewOverridesCache=[];
 const daily=c.renderReadDay(data,'');
 assert(daily.indexOf('미열람 <span>1명')<daily.indexOf('>열람 <span>1명'));assert(daily.includes('td-teacher-label kor'));assert(daily.includes('가상 2회 상세 열람 이력'));assert.match(c.teacherSubjectLabel('<img>',[]),/&lt;img&gt;/);
 c.teacherViewLogsCache=[{teacherName:'가상',sheetName:'9/28(월)',viewedAt:'2026-09-27 20:00:00'},{teacherName:'가상',sheetName:'9/28(월)',viewedAt:'2026-09-28 09:00:00'},{teacherName:'가상',sheetName:'9/29(화)',viewedAt:'2026-09-28 15:00:00'}];
 c.teacherViewOverridesCache=[{teacherName:'가상',sheetName:'9/28(월)',state:'viewed',count:9,updatedAt:'2026-09-28 10:00:00'}];
 c.els.tdReadPopup={showModal(){}};
 c.teacherReadDetail({dataset:{teacher:'가상'}});
 const detail=c.els.tdReadHistory.innerHTML;assert(detail.includes('실제 2회'));assert(detail.includes('관리자가 집계'));assert(detail.indexOf('09:00:00')<detail.indexOf('20:00:00'));assert(!detail.includes('15:00:00'));
 console.log('PASS: full-month records, year boundary, admin access, assignment-aware missing days, future/failed days, subject labels, popup raw timestamps and overrides.');
}
