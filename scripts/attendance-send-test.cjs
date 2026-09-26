const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract}=require('./toolbar-attendance-test.cjs');
async function main(){
  let previous=null, writes=[], fail=false;
  const ref={collection:()=>ref,doc:()=>ref};
  const db={collection:()=>ref,runTransaction:async fn=>{
    if(fail) throw Error('offline');
    const pending=[];
    await fn({get:async()=>({exists:!!previous,data:()=>previous}),set:(r,v)=>pending.push(['set',v]),update:(r,v)=>pending.push(['update',v])});
    writes=pending;
  }};
  const result={textContent:'',classList:{add(){},remove(){}}};
  const submit={disabled:false},note={value:'합성 메모'};
  const c={attendanceComposerContext:{studentId:'synthetic',studentName:'가상학생',school:'가상학교',sheetName:'9/26',dateKey:'2026-09-26',hour:13,room:'1',subject:'수학',lessonType:'개별'},
    attendanceConnectionSequence:1,authState:{loginId:'test',teacherName:'가상강사'},
    canCurrentUserSubmitAttendance:()=>true,document:{getElementById:id=>({teacherAttendanceSubmit:submit,teacherAttendanceResult:result,teacherAttendanceNote:note}[id]),querySelector:()=>({value:'지각'})},
    getLiveFirebaseFirestore:()=>Promise.resolve(db),getLiveFirebaseAuth:()=>Promise.resolve({currentUser:{uid:'test'}}),
    attendanceReportId:()=> 'synthetic',firebase:{firestore:{FieldValue:{serverTimestamp:()=> 'server'}}},lastData:null,window:{},
  };
  vm.createContext(c);vm.runInContext(extract('submitTeacherAttendanceReport'),c);
  await c.submitTeacherAttendanceReport();assert.equal(writes.length,2);assert.equal(writes[0][0],'set');assert.equal(writes[0][1].teacherRevision,1);assert.equal(writes[1][1].type,'TEACHER_SUBMITTED');
  previous={teacherRevision:3};await c.submitTeacherAttendanceReport();assert.equal(writes[0][0],'update');assert.equal(writes[0][1].teacherRevision,4);
  assert.deepEqual(Object.keys(writes[0][1]).sort(),['status','note','teacherRevision','deskState','reportedAt','reportedAtMs'].sort());
  fail=true;await c.submitTeacherAttendanceReport();assert.match(result.textContent,/전달하지 못했습니다/);assert.equal(note.value,'합성 메모');assert.equal(submit.disabled,false);
  fail=false;previous={reporterUid:'teacher',studentId:'synthetic',teacherRevision:4,deskRevision:1};
  const textarea={value:'확인했습니다'},select={value:'RESOLVED'};
  const article={getAttribute:()=> 'synthetic',querySelector:s=>s==='select'?select:textarea};
  const button={disabled:false,closest:()=>article};
  c.attendanceRealtimeState={uid:'test',firebaseAdmin:true};c.attendanceReplyEditors=new Map();c.alert=()=>{throw Error('unexpected failure');};
  vm.runInContext(extract('saveAttendanceInboxReply'),c);await c.saveAttendanceInboxReply(button);
  assert.equal(writes.length,3);assert.equal(writes[0][1].deskHandledTeacherRevision,4);assert.equal(writes[0][1].deskRevision,2);assert.equal(writes[1][1].type,'DESK_REPLIED');assert.equal(writes[2][1].seen,false);assert.equal(button.disabled,false);
  console.log('PASS: synthetic initial send, resend restricted fields, failure retains input, atomic desk reply/event/notification');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
