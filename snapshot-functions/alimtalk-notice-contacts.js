'use strict';
// Date-scoped contacts for temporary attendance. Never changes the registration record.
const {randomUUID}=require('node:crypto');
const {hash}=require('./alimtalk-service');
const {mask,validDate,directorySchoolKey,exclusion}=require('./alimtalk-contract');
const fail=code=>{throw Object.assign(Error(code),{code});};
const guestId=(date,name,school)=>'notice_'+hash(['banpo',date,name,school]);
function validRecord(r,actor,date,student,now=Date.now()){
 return !!r&&r.academyId===actor.academyId&&r.date===date&&r.studentId===student.id&&r.identityRevision===student.identityRevision&&r.confirmed===true&&!!r.checkedBy&&!!r.revision&&Number.isFinite(r.checkedAt)&&r.checkedAt<=now;
}
function applyNoticeContacts(student,record){
 return {...student,recipients:student.recipients.map(r=>{
  const saved=record?.recipients?.[r.id];
  // A directory number always wins. Conflicts need repair in registration management.
  return !r.verified&&r.reason==='번호 없음'&&saved&&/^010\d{8}$/.test(saved.phone)?{...r,phone:saved.phone,verified:true,reason:'',temporary:true}:r;
 })};
}
function createNoticeContactsService({authorize,loadSource,searchStudents,resolveStudent,store,now=Date.now}){
 async function auth(session){const a=await authorize(session);if(!a?.uid||!a.active||!['ADMIN','STAFF','DESK'].includes(a.role)||a.academyId!=='banpo'||!a.canSendTimetable)fail('FORBIDDEN');return a;}
 async function context(a,input){
  if(!validDate(input.date)||typeof input.name!=='string'||!input.name.trim()||input.name.length>100)fail('INVALID_REQUEST');
  const source=await loadSource(a,input.date);
  if(!source.complete||source.academyId!==a.academyId||source.date!==input.date)fail('SOURCE_INCOMPLETE');
  const entries=source.entries.filter(e=>e.sourceName===input.name);
  if(!entries.length||entries.every(e=>exclusion(e.lesson)))fail('NO_NOTICE_LESSONS');
  const schools=[...new Set(entries.map(e=>e.sourceSchool))];
  if(schools.length!==1||!schools[0])fail('STUDENT_SCHOOL_MISMATCH');
  const candidates=await searchStudents(a,input.name);
  if(!Array.isArray(candidates)||candidates.length>20)fail('CANDIDATE_LIMIT');
  const rows=[];
  for(const c of candidates){
   try{const s=await resolveStudent(c.id);if(s.id!==c.id)continue;rows.push(s);}catch(e){if(e.code!=='STUDENT_NOT_ACTIVE')throw e;}
  }
  if(candidates.length&&!rows.length)fail('STUDENT_IDENTITY_REVIEW_REQUIRED');
  return {source,entries,school:schools[0],rows,fingerprint:hash(entries.map(e=>[e.id,e.fingerprint]))};
 }
 function guest(date,name,school){
  const m=/^(.*?)([1-6])$/.exec(school);
  if(!m&&school!=='재수생')fail('STUDENT_SCHOOL_MISMATCH');
  const id=guestId(date,name,school);
  return {id,name,school:m?m[1]:'재수생',grade:m?m[2]:'',noticeDate:date,registrationInactive:true,identityRevision:hash([id,name,school]),recipients:[['student','학생'],['mother','모'],['father','부']].map(([id,relation])=>({id,relation,phone:'',verified:false,reason:'번호 없음'}))};
 }
 async function options(session,input){
  const a=await auth(session),c=await context(a,input),students=c.rows.length?c.rows:[guest(input.date,input.name,c.school)];
  const candidates=[];
  for(const s of students){
   const record=await store.noticeContacts(a.academyId,input.date,s.id);
   const effective=validRecord(record,a,input.date,s,now())?applyNoticeContacts(s,record):s;
   candidates.push({id:s.id,name:s.name,school:s.school,grade:s.grade,inactive:!!s.registrationInactive,guest:!!s.noticeDate,matches:s.name===input.name&&directorySchoolKey(s.school,s.grade)===c.school,
    contactVersion:hash([s.identityRevision,s.recipients]),expectedRevision:record?.revision||null,
    choices:effective.recipients.map(r=>({id:r.id,relation:r.relation,masked:mask(r.phone),available:r.verified,temporary:!!r.temporary,canEnter:s.recipients.find(x=>x.id===r.id).reason==='번호 없음',reason:r.reason}))});
  }
  await auth(session);
  return {date:input.date,name:input.name,school:c.school,sourceFingerprint:c.fingerprint,candidates,lessons:c.entries.filter(e=>!exclusion(e.lesson)).map(e=>e.summary)};
 }
 async function save(session,input){
  const a=await auth(session),c=await context(a,input);
  if(input.confirmed!==true||input.sourceFingerprint!==c.fingerprint)fail('SOURCE_CHANGED');
  let student=c.rows.find(s=>s.id===input.studentId);
  if(!student&&c.rows.length===0){student=guest(input.date,input.name,c.school);if(student.id!==input.studentId)fail('STUDENT_IDENTITY_REVIEW_REQUIRED');}
  if(!student||student.name!==input.name||directorySchoolKey(student.school,student.grade)!==c.school)fail('STUDENT_SCHOOL_MISMATCH');
  if(hash([student.identityRevision,student.recipients])!==input.contactVersion)fail('CONTACT_CHANGED');
  const old=await store.noticeContacts(a.academyId,input.date,student.id);
  if((old?.revision||null)!==(input.expectedRevision||null))fail('REVIEW_CONFLICT');
  if(!input.temporary||typeof input.temporary!=='object'||Array.isArray(input.temporary)||Object.keys(input.temporary).some(k=>!['student','mother','father'].includes(k)))fail('INVALID_RECIPIENTS');
  // Only missing relationships can be filled; blank removes an earlier temporary number.
  const recipients={};
  for(const [id,value] of Object.entries(input.temporary)){
   if(typeof value!=='string'||value.length>30)fail('INVALID_PHONE');
   const phone=value.replace(/[\s()-]/g,'');if(!phone)continue;
   if(!/^010\d{8}$/.test(phone))fail('INVALID_PHONE');
   if(student.recipients.find(r=>r.id===id)?.reason!=='번호 없음')fail('DIRECTORY_CONTACT_EXISTS');
   recipients[id]={phone};
  }
  // Unchanged temporary values can be retained without exposing full numbers in reads.
  if(input.keepTemporary!==undefined&&(!Array.isArray(input.keepTemporary)||input.keepTemporary.length>3))fail('INVALID_RECIPIENTS');
  for(const id of input.keepTemporary||[]){
   if(!['student','mother','father'].includes(id)||Object.hasOwn(input.temporary,id)||!validRecord(old,a,input.date,student,now())||!old.recipients?.[id]||student.recipients.find(r=>r.id===id)?.reason!=='번호 없음')fail('CONTACT_CHANGED');
   recipients[id]=old.recipients[id];
  }
  const record={academyId:a.academyId,date:input.date,studentId:student.id,identityRevision:student.identityRevision,revision:randomUUID(),checkedBy:a.uid,checkedAt:now(),confirmed:true,recipients};
  const effective=applyNoticeContacts(student,record);
  if(!effective.recipients.some(r=>r.verified)&&!validRecord(old,a,input.date,student,now()))fail('CONTACT_REQUIRED');
  const mapping={academyId:a.academyId,date:input.date,studentId:student.id,sourceRevision:c.source.revision,sourceCapturedAt:c.source.capturedAt,revision:randomUUID(),verifiedBy:a.uid,verifiedAt:now(),identityRevision:student.identityRevision,entries:c.entries.map(e=>({id:e.id,fingerprint:e.fingerprint}))};
  if(!student.noticeDate)mapping.identityLink={name:student.name,school:student.school,grade:student.grade};
  const existing=await store.mapping(a.academyId,input.date,student.id);
  await auth(session);
  await store.saveNoticeContacts({record,mapping,guest:student.noticeDate?student:null},input.expectedRevision||null,existing?.revision||null);
  return {studentId:student.id,date:input.date,revision:record.revision};
 }
 return {noticeContactOptions:options,saveNoticeContacts:save};
}
module.exports={createNoticeContactsService,guestId,validRecord,applyNoticeContacts};
