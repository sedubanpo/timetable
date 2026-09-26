const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {extract} = require('./toolbar-attendance-test.cjs');
async function main() {
  const c = vm.createContext({});
  vm.runInContext(extract('resolveAttendanceRealtimeMode'), c);
  const user = {uid:'worker', getIdTokenResult(){throw Error('Stale claims must not be used');}};
  const db = data => ({collection(name){assert.equal(name,'users');return {doc(uid){assert.equal(uid,user.uid);return {get(options){assert.equal(options.source,'server');return Promise.resolve({exists:!!data,data:()=>data});}};}};}});
  for (const role of ['ADMIN','STAFF','DESK']) assert.equal(await c.resolveAttendanceRealtimeMode(db({role}),user),'admin');
  assert.equal(await c.resolveAttendanceRealtimeMode(db({role:'TEACHER'}),user),'teacher');
  assert.equal(await c.resolveAttendanceRealtimeMode(db({role:'INSTRUCTOR'}),user),'teacher');
  for(const data of [null,{}, {role:'STAFF',active:false},{role:'DESK',status:'퇴사'},{role:'ADMIN',employmentStatus:'ON_LEAVE'}]) await assert.rejects(c.resolveAttendanceRealtimeMode(db(data),user));
  await assert.rejects(c.resolveAttendanceRealtimeMode({collection:()=>({doc:()=>({get:()=>Promise.reject(Error('offline'))})})},user),/offline/);
  const result={textContent:'',classList:{add(){},remove(){}}};
  let applied=0, restarts=0;
  const r={authState:{loggedIn:true,loginId:'worker'},attendanceConnectionSequence:1,
    attendanceRealtimeState:{uid:'worker',mode:'teacher',unsubscribe(){},reports:[]},
    document:{getElementById:()=>result},window:{},renderAttendanceInbox(){},
    getLiveFirebaseFirestore:()=>Promise.resolve({}),getLiveFirebaseAuth:()=>Promise.resolve({currentUser:user}),
    resolveAttendanceRealtimeMode:()=>Promise.resolve('admin'),
    startAttendanceRealtime(){restarts++;r.attendanceConnectionSequence++;Object.assign(r.attendanceRealtimeState,{uid:'',mode:''});return Promise.resolve().then(()=>Object.assign(r.attendanceRealtimeState,{uid:'worker',mode:'admin',firebaseAdmin:true,error:''}));},
    buildAttendanceReportsQuery(db,mode,uid){assert.equal(mode,'admin');assert.equal(uid,'worker');return {get:()=>Promise.resolve({})};},
    applyAttendanceReportsSnapshot(){applied++;},markAttendanceDeskRepliesSeen(){throw Error('not a teacher');}
  };
  vm.createContext(r);vm.runInContext(extract('refreshAttendanceInbox'),r);
  await r.refreshAttendanceInbox();assert.equal(restarts,1);assert.equal(applied,1);assert.match(result.textContent,/방금/);
  r.attendanceRealtimeState.uid='';await r.refreshAttendanceInbox();assert.equal(restarts,2);assert.equal(applied,2);
  r.resolveAttendanceRealtimeMode=()=>Promise.reject(Error('offline'));
  await r.refreshAttendanceInbox();assert.equal(applied,2);assert.match(result.textContent,/못했습니다/);
  const source=fs.readFileSync(require('node:path').join(__dirname,'../docs/index.html'),'utf8');
  for(const name of ['resolveAttendanceRealtimeMode','startAttendanceRealtime','refreshAttendanceInbox','submitTeacherAttendanceReport','saveAttendanceInboxReply']) assert(source.includes(extract(name)),name+' mirror parity');
  console.log('PASS: all worker roles, stale claims ignored, inactive/missing roles rejected, refresh upgrades scope, missing connection recovery, read failure, mirror parity');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
