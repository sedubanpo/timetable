const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
function extract(name) {
  const start = source.indexOf('      function ' + name + '(');
  assert(start >= 0, name + ' exists');
  const end = source.indexOf('\n      }', start);
  return source.slice(start, end + 8).trim();
}
const names = ['attendanceWindowMessages', 'renderAttendanceWindow', 'openAttendanceWindowDetail', 'attendanceLocalDateKey', 'attendanceDateFromKey', 'attendanceReportDateKey', 'attendanceReporterLabel'];
function reports(now) {
  const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  return [now.getHours()-1, now.getHours(), now.getHours()+1].flatMap(hour => Array.from({length:15}, (_, i) => ({__id:`fixture-${hour}-${i}`, dateKey:key, hour, reporterName:`테스트강사${String(i+1).padStart(2,'0')}`, studentName:`가상학생${i+1}`, status:i%2?'지각':'출석', note:'합성 테스트 전달 내용', effectiveDeskState:'NEW'})));
}
if (require.main === module) {
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [2026, 8, 17, 13])); } }
  let privacy = false, calls = 0;
  const host = {hidden:false, innerHTML:'', replaceChildren(){this.innerHTML='';}, contains(){return false;}, querySelector(){return null;}, querySelectorAll(){return [];}};
  const search = {value:'old'}, filter = {value:'NEW'};
  const article = {getAttribute(){return 'fixture-detail';}, scrollIntoView(){this.scrolled=true;}, focus(){this.focused=true;}};
  const context = {Date, console, authState:{loggedIn:true,isLookup:false}, attendanceRealtimeState:{firebaseAdmin:true,reports:[],loading:false,error:''}, attendanceWindowRenderKey:'',attendanceWindowReports:null, escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll("'",'&#39;'), document:{body:{classList:{contains:()=>privacy}},activeElement:null,getElementById:id=>({attendanceWindow:host,attendanceInboxSearch:search,attendanceInboxStateFilter:filter}[id]),querySelectorAll:()=>[article]},openAttendanceDialog:()=>calls++,renderAttendanceInbox:()=>calls++};
  context.Date = FixedDate;
  vm.createContext(context); vm.runInContext(names.map(extract).join('\n'),context);
  const now = new Date(2026,8,17,13);
  let rows = reports(now);
  assert.equal(context.attendanceWindowMessages(rows,now).length,45);
  rows.push({...rows[0],dateKey:'2026-09-16'}, {...rows[0],__id:'evening',hour:18,reportedAtMs:300}, {...rows[0],__id:'morning',hour:9,reportedAtMs:200});
  assert.equal(context.attendanceWindowMessages(rows,now).length,47);
  assert.deepEqual(Array.from(context.attendanceWindowMessages(rows,now).slice(0,2),x=>x.__id),['evening','morning']);
  assert.equal(context.attendanceWindowMessages(rows,new Date(2026,8,18,0)).length,0);
  assert.equal(context.attendanceWindowMessages([],now).length,0);
  const sameTeacher = [{...rows[0],__id:'first'},{...rows[0],__id:'second',studentName:'다른학생'}];
  assert.equal(context.attendanceWindowMessages(sameTeacher,now).length,2);
  context.attendanceRealtimeState.reports=reports(now); context.renderAttendanceWindow(true);
  assert.equal((host.innerHTML.match(/data-report-id=/g)||[]).length,45);
  assert(host.innerHTML.includes('가상학생'));
  assert(!host.innerHTML.includes('attendance-window-lane'));assert(!host.innerHTML.includes('is-new'));assert(!host.innerHTML.includes('전후'));
  privacy=true; context.renderAttendanceWindow(true); assert(!host.innerHTML.includes('가상학생')); assert(!host.innerHTML.includes('합성 테스트 전달 내용'));
  context.authState.isLookup=true; context.renderAttendanceWindow(true); assert(host.hidden); assert.equal(host.innerHTML,'');
  context.authState.isLookup=false;context.attendanceRealtimeState.firebaseAdmin=false;context.renderAttendanceWindow(true);assert(host.hidden);
  context.attendanceRealtimeState.firebaseAdmin=true;context.authState.loggedIn=false;context.renderAttendanceWindow(true);assert(host.hidden);assert.equal(host.innerHTML,'');
  context.authState.loggedIn=true;context.attendanceRealtimeState.loading=true;context.renderAttendanceWindow(true);assert(host.innerHTML.includes('불러오는 중'));context.attendanceRealtimeState.loading=false;
  context.attendanceRealtimeState.firebaseAdmin=true;context.attendanceRealtimeState.error='offline';context.renderAttendanceWindow(true);assert(host.innerHTML.includes('연결 확인'));
  context.attendanceRealtimeState.error='';context.attendanceRealtimeState.reports=[];context.renderAttendanceWindow(true);assert(host.innerHTML.includes('오늘 접수된 출결 메시지가 없습니다'));assert(!host.innerHTML.includes('data-report-id='));
  context.attendanceRealtimeState.reports=[{__id:'fixture-detail',dateKey:'2026-09-17'}];context.openAttendanceWindowDetail('missing');assert.equal(calls,0);
  context.openAttendanceWindowDetail('fixture-detail');assert.equal(calls,2);assert(article.focused&&article.scrolled);assert.equal(search.value,'');assert.equal(filter.value,'ALL');assert.equal(context.attendanceInboxSelectedDateKey,'2026-09-17');
  assert(!/fetch\(|onSnapshot\(|setInterval\(/.test(names.slice(0,3).map(extract).join('\n')));
  const mirror = fs.readFileSync(path.join(root,'docs/index.html'),'utf8');
  for(const name of names.slice(0,3)) assert(mirror.includes(extract(name)), name+' mirror parity');
  console.log('PASS: received-only single strip, 45 reports, latest-first all today hours, no fabricated hour rows, day rollover, privacy, roles, empty/error, exact detail focus, no polling, mirror parity.');
}
module.exports = {extract, reports, source, names};
