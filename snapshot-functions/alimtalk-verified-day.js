'use strict';
const {hash}=require('./alimtalk-service');
const {directorySchoolKey}=require('./alimtalk-contract');
const fail=code=>{throw Object.assign(Error(code),{code});};
async function verifiedStudentDay({actor,date,id,signal,audience,loadSource,resolveStudent,reviewStore,allowUnchangedCells=false}){
  const student=await resolveStudent(id,signal);
  if(student.id!==id)fail('CANONICAL_RECONFIRM_REQUIRED');
  const source=await loadSource(actor,date,signal,audience);
  if(source.linkIssues?.[student.name])fail('STUDENT_IDENTITY_REVIEW_REQUIRED');
  const [m,assignments]=await Promise.all([reviewStore.mapping(actor.academyId,date,student.id),reviewStore.dayAssignments(actor.academyId,date)]);
  if(!source.complete||source.date!==date||source.academyId!==actor.academyId)fail('SOURCE_INCOMPLETE');
  const entries=source.entries.filter(e=>e.sourceName===student.name);
  if(!entries.length||entries.some(e=>!e.sourceSchool)||new Set(entries.map(e=>e.sourceSchool)).size!==1)fail('STUDENT_IDENTITY_REVIEW_REQUIRED');
  const directorySchool=directorySchoolKey(student.school,student.grade);
  const alias=m?.identityLink;
  const confirmedAlias=alias?.name===student.name && alias.school===student.school && alias.grade===student.grade &&
    alias.confirmedSourceSchool===entries[0].sourceSchool;
  if(!directorySchool||(entries[0].sourceSchool!==directorySchool&&!confirmedAlias))fail('STUDENT_SCHOOL_MISMATCH');
  let revision;
  const match=audience==='guardian' && source.guardianMatches?.find(candidate=>candidate.id===id);
  if(!m && match && match.identityRevision===student.identityRevision){
    if(entries.some(e=>assignments[hash(e.id)]))fail('STUDENT_COVERAGE_INCOMPLETE');
    revision=hash(['directory-guardian',actor.academyId,date,id,student.identityRevision,entries.map(e=>[e.id,e.fingerprint])]);
  }else{
    if(!m||m.studentId!==student.id||m.academyId!==actor.academyId||m.date!==date||!m.verifiedBy||!m.revision||(!m.sourceRevision||!allowUnchangedCells&&m.sourceRevision!==source.revision)||m.identityRevision!==student.identityRevision)fail('MAPPING_CHANGED');
    if(!Array.isArray(m.entries)||entries.length!==m.entries.length||entries.some(e=>!m.entries.some(x=>x.id===e.id&&x.fingerprint===e.fingerprint)||assignments[hash(e.id)]?.studentId!==student.id||assignments[hash(e.id)]?.revision!==m.revision||assignments[hash(e.id)]?.fingerprint!==e.fingerprint))fail('STUDENT_COVERAGE_INCOMPLETE');
    revision=m.revision;
  }
  return {academyId:actor.academyId,date,complete:true,revision:source.revision,mappingRevision:revision,students:[{id:student.id,name:student.name,mappingVerified:true,mappingRevision:revision,lessons:entries.map(e=>({...e.lesson,studentId:student.id})),identityRevision:student.identityRevision}]};
}
module.exports={verifiedStudentDay};
