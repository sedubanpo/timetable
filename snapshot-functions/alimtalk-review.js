'use strict';
// Administrator mapping/review API domain service. HTTP/Firestore adapters are injected.
const crypto=require('node:crypto');
const {hash}=require('./alimtalk-service');
const {contactHash}=require('./alimtalk-students');
const {mask,validDate}=require('./alimtalk-contract');
const fail=code=>{throw Object.assign(Error(code),{code});};
function createReviewService({authorize,loadSource,searchStudents,resolveStudent,store,now=Date.now}){
  async function auth(session){const a=await authorize(session);if(a?.role!=='ADMIN'||a.active!==true||a.academyId!=='banpo'||a.canSendTimetable!==true)fail('FORBIDDEN');return a;}
  async function source(a,input){if(!validDate(input.date))fail('INVALID_DATE');const s=await loadSource(a,input.date);if(!s?.complete||!s.revision||!Array.isArray(s.entries)||s.entries.length>5000||s.date!==input.date||s.academyId!==a.academyId)fail('SOURCE_UNVERIFIED');if(new Set(s.entries.map(x=>x.id)).size!==s.entries.length||s.entries.some(e=>!e.id||!e.fingerprint))fail('SOURCE_AMBIGUOUS');return s;}
  async function inspect(session,input){const a=await auth(session),s=await source(a,input);await auth(session);return {date:s.date,revision:s.revision,entries:s.entries.map(e=>({id:e.id,fingerprint:e.fingerprint,label:e.label,summary:e.summary}))};}
  async function candidates(session,{query}){const a=await auth(session);if(typeof query!=='string'||!query.trim()||query.length>128)fail('INVALID_QUERY');const rows=await searchStudents(a,query.trim());if(!Array.isArray(rows)||rows.length>20)fail('CANDIDATE_LIMIT');await auth(session);return {candidates:rows.map(r=>({id:r.id,name:r.name,school:r.school,grade:r.grade,status:r.status}))};}
  async function saveMapping(session,input){
    const a=await auth(session),s=await source(a,input);
    if(s.revision!==input.sourceRevision)fail('SOURCE_CHANGED');
    if(input.confirmed!==true||!Array.isArray(input.entryIds)||!input.entryIds.length||input.entryIds.length>5000||new Set(input.entryIds).size!==input.entryIds.length)fail('MAPPING_CONFIRMATION_REQUIRED');
    const entries=input.entryIds.map(id=>s.entries.find(e=>e.id===id));if(entries.some(e=>!e))fail('SOURCE_CHANGED');
    const student=await resolveStudent(input.studentId);if(student.id!==input.studentId)fail('CANONICAL_RECONFIRM_REQUIRED');
    const revision=crypto.randomUUID();
    const mapping={academyId:a.academyId,date:s.date,studentId:student.id,sourceRevision:s.revision,revision,verifiedBy:a.uid,verifiedAt:now(),entries:entries.map(e=>({id:e.id,fingerprint:e.fingerprint})),identityRevision:student.identityRevision};
    // compareAndSet must reject already assigned entries and stale expected revision atomically.
    await auth(session);await store.saveMapping(mapping,input.expectedRevision||null);
    return {studentId:student.id,revision,name:student.name};
  }
  async function contactChoices(session,input){const a=await auth(session);if(!validDate(input.date))fail('INVALID_DATE');const s=await resolveStudent(input.studentId);if(s.id!==input.studentId)fail('CANONICAL_RECONFIRM_REQUIRED');const mapping=await store.mapping(a.academyId,input.date,s.id);if(!mapping||mapping.identityRevision!==s.identityRevision)fail('MAPPING_REQUIRED');await auth(session);return {studentId:s.id,name:s.name,mappingRevision:mapping.revision,contactVersion:hash(s.recipients),choices:s.recipients.map(r=>({id:r.id,relation:r.relation,masked:mask(r.phone),available:r.verified,reason:r.reason}))};}
  async function saveClearance(session,input){
    const a=await auth(session);if(!validDate(input.date)||input.campusConfirmed!==true||input.contactConfirmed!==true||typeof input.note!=='string'||!input.note.trim()||input.note.length>500||!Array.isArray(input.relations)||!input.relations.length||input.relations.some(r=>!['student','father','mother'].includes(r)))fail('CONTACT_CONFIRMATION_REQUIRED');
    const student=await resolveStudent(input.studentId);if(student.id!==input.studentId)fail('CANONICAL_RECONFIRM_REQUIRED');
    const mapping=await store.mapping(a.academyId,input.date,student.id);
    if(!mapping||mapping.revision!==input.mappingRevision||mapping.identityRevision!==student.identityRevision)fail('MAPPING_CHANGED');
    if(hash(student.recipients)!==input.contactVersion)fail('CONTACT_CHANGED');
    const recipients={};for(const relation of new Set(input.relations)){const r=student.recipients.find(r=>r.id===relation);if(!r?.verified)fail('CONTACT_UNVERIFIED');recipients[relation]={allowed:true,phoneHash:contactHash(r.phone)};}
    const record={academyId:a.academyId,studentId:student.id,date:input.date,mappingRevision:mapping.revision,identityRevision:student.identityRevision,revision:crypto.randomUUID(),checkedBy:a.uid,checkedAt:now(),campusConfirmed:true,recipients,note:input.note.trim()};
    await auth(session);await store.saveClearance(record,input.expectedRevision||null,mapping.revision);
    return {revision:record.revision,checkedAt:record.checkedAt};
  }
  async function reviewState(session,input){const a=await auth(session);if(!validDate(input.date))fail('INVALID_DATE');const s=await resolveStudent(input.studentId);if(s.id!==input.studentId)fail('CANONICAL_RECONFIRM_REQUIRED');const m=await store.mapping(a.academyId,input.date,s.id),r=typeof store.clearance==='function'?await store.clearance(a.academyId,input.date,s.id):null;await auth(session);return {studentId:s.id,mappingRevision:m?.revision||null,clearanceRevision:r?.revision||null};}
  return {inspect,candidates,saveMapping,contactChoices,saveClearance,reviewState};
}
module.exports={createReviewService};
