'use strict';
const {hash}=require('./alimtalk-service');
const {directorySchoolKey}=require('./alimtalk-contract');
const fail=code=>{throw Object.assign(Error(code),{code});};
async function verifiedStudentDay({actor,date,id,signal,loadSource,resolveStudent,reviewStore,allowUnchangedCells=false}){
  const student=await resolveStudent(id,signal);
  if(student.id!==id)fail('CANONICAL_RECONFIRM_REQUIRED');
  const source=await loadSource(actor,date,signal);
  if(source.linkIssues?.[student.name])fail('STUDENT_IDENTITY_REVIEW_REQUIRED');
  const [m,assignments]=await Promise.all([reviewStore.mapping(actor.academyId,date,student.id),reviewStore.dayAssignments(actor.academyId,date)]);
  if(!source.complete||source.date!==date||source.academyId!==actor.academyId)fail('SOURCE_INCOMPLETE');
  if(!m||m.studentId!==student.id||m.academyId!==actor.academyId||m.date!==date||!m.verifiedBy||!m.revision||(!m.sourceRevision||!allowUnchangedCells&&m.sourceRevision!==source.revision)||m.identityRevision!==student.identityRevision)fail('MAPPING_CHANGED');
  const entries=source.entries.filter(e=>e.sourceName===student.name);
  if(!entries.length||entries.some(e=>!e.sourceSchool)||new Set(entries.map(e=>e.sourceSchool)).size!==1)fail('STUDENT_IDENTITY_REVIEW_REQUIRED');
  const directorySchool=directorySchoolKey(student.school,student.grade);
  if(!directorySchool||entries[0].sourceSchool!==directorySchool)fail('STUDENT_SCHOOL_MISMATCH');
  if(!Array.isArray(m.entries)||entries.length!==m.entries.length||entries.some(e=>!m.entries.some(x=>x.id===e.id&&x.fingerprint===e.fingerprint)||assignments[hash(e.id)]?.studentId!==student.id||assignments[hash(e.id)]?.revision!==m.revision||assignments[hash(e.id)]?.fingerprint!==e.fingerprint))fail('STUDENT_COVERAGE_INCOMPLETE');
  return {academyId:actor.academyId,date,complete:true,revision:source.revision,mappingRevision:m.revision,students:[{id:student.id,name:student.name,mappingVerified:true,mappingRevision:m.revision,lessons:entries.map(e=>({...e.lesson,studentId:student.id})),identityRevision:student.identityRevision}]};
}
module.exports={verifiedStudentDay};
