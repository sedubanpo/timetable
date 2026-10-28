'use strict';
const {createService,hash}=require('./alimtalk-service');
const {testRecipients}=require('./alimtalk-test-recipients');
const {mask}=require('./alimtalk-contract');
const fail=code=>{throw Object.assign(Error(code),{code});};
// Real schedule, administrator recipients only. Never loads guardian contacts for delivery.
// Unlike general delivery, this explicitly reviewed test requires coverage of every
// occurrence of the selected name, not assignments for unrelated students.
function createRealAdminTest({authorize,store,provider,testPhone,loadSource,resolveStudent,reviewStore,now=Date.now}){
 const recipients=testRecipients(testPhone);
 const service=createService({authorize,store,provider,now,kind:'admin-real-lessons',loadDay:async(actor,date,ids,signal)=>{
  if(ids.length!==1||!recipients.length)fail('TEST_SCOPE_REQUIRED');
  const student=await resolveStudent(ids[0],signal);
  if(student.id!==ids[0])fail('CANONICAL_RECONFIRM_REQUIRED');
  const [source,m,assignments]=await Promise.all([loadSource(actor,date,signal),reviewStore.mapping(actor.academyId,date,student.id),reviewStore.dayAssignments(actor.academyId,date)]);
  if(!source.complete||source.date!==date||source.academyId!==actor.academyId)fail('SOURCE_INCOMPLETE');
  if(!m||m.studentId!==student.id||m.academyId!==actor.academyId||m.date!==date||!m.verifiedBy||!m.revision||m.sourceRevision!==source.revision||m.identityRevision!==student.identityRevision)fail('MAPPING_CHANGED');
  const entries=source.entries.filter(e=>e.sourceName===student.name);
  if(!entries.length||entries.some(e=>!e.sourceSchool)||new Set(entries.map(e=>e.sourceSchool)).size!==1)fail('STUDENT_IDENTITY_REVIEW_REQUIRED');
  const school=String(student.school||'').trim().replace(/고등학교$/,'고').replace(/중학교$/,'중').replace(/초등학교$/,'초');
  const grade=String(student.grade||'').trim().match(/^(?:초|중|고)?([1-6])(?:학년)?$/)?.[1];
  if(!school||!grade||entries[0].sourceSchool!==school+grade)fail('STUDENT_SCHOOL_MISMATCH');
  if(!Array.isArray(m.entries)||entries.length!==m.entries.length||entries.some(e=>!m.entries.some(x=>x.id===e.id&&x.fingerprint===e.fingerprint)||assignments[hash(e.id)]?.studentId!==student.id||assignments[hash(e.id)]?.revision!==m.revision||assignments[hash(e.id)]?.fingerprint!==e.fingerprint))fail('STUDENT_COVERAGE_INCOMPLETE');
  return {academyId:actor.academyId,date,complete:true,revision:source.revision,mappingRevision:m.revision,students:[{id:student.id,name:student.name,mappingVerified:true,mappingRevision:m.revision,lessons:entries.map(e=>({...e.lesson,studentId:student.id})),recipients}]};
 }});
 return {...service,async preview(s,i){return {...await service.preview(s,i),testMode:true,realScheduleTest:true,testRecipient:recipients.map(r=>mask(r.phone)).join(' / ')};}};
}
module.exports={createRealAdminTest};
