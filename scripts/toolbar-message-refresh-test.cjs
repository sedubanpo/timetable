const assert = require('node:assert/strict');
const vm = require('node:vm');
const {extract} = require('./toolbar-attendance-test.cjs');

async function test() {
  let reads = 0, applied = 0, rejectRead = false, resolveRead;
  const label = {textContent:'메시지 갱신'};
  const button = {disabled:false,querySelector:()=>label};
  const result = {textContent:'',classList:{add(){},remove(){}}};
  const originalReports = [{__id:'preserved'}];
  const context = {
    authState:{loggedIn:true,isLookup:false}, attendanceConnectionSequence:1,
    attendanceRealtimeState:{uid:'admin',mode:'admin',firebaseAdmin:true,reports:originalReports},
    document:{getElementById:()=>result}, window:{console:null},
    renderAttendanceInbox(){}, getLiveFirebaseFirestore:()=>Promise.resolve({}),
    buildAttendanceReportsQuery:()=>({get(options){
      assert.equal(options.source,'server'); reads++;
      if(rejectRead) return Promise.reject(new Error('offline'));
      return new Promise(resolve=>{resolveRead=resolve;});
    }}),
    applyAttendanceReportsSnapshot(){applied++;context.attendanceRealtimeState.loading=false;},
    markAttendanceDeskRepliesSeen(){throw new Error('Admin refresh must not mark teacher replies');},
    refreshData(){throw new Error('Must not reload timetable');}
  };
  vm.createContext(context);
  vm.runInContext(['refreshAttendanceMessages','refreshAttendanceInbox'].map(extract).join('\n'),context);
  let pending = context.refreshAttendanceMessages(button);
  assert(button.disabled);
  assert.equal(context.refreshAttendanceMessages(button),undefined);
  await Promise.resolve(); resolveRead({}); await pending;
  assert.equal(reads,1); assert.equal(applied,1);
  assert.equal(label.textContent,'메시지 갱신'); assert(!button.disabled);
  assert(result.textContent.includes('방금'));
  rejectRead=true; await context.refreshAttendanceMessages(button);
  assert.equal(context.attendanceRealtimeState.reports,originalReports);
  assert(result.textContent.includes('기존 내역은 그대로')); assert(!button.disabled);
  rejectRead=false; pending=context.refreshAttendanceMessages(button);
  await Promise.resolve(); context.attendanceConnectionSequence++; resolveRead({}); await pending;
  assert.equal(applied,1); assert.equal(result.textContent,'');
  context.authState.loggedIn=false;
  assert.equal(context.refreshAttendanceMessages(button),undefined); assert.equal(reads,3);
  console.log('PASS: attendance-only server read, duplicate guard, success, failure preservation, label restoration, stale session rejection, logged-out guard.');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
