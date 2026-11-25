'use strict';
const crypto=require('node:crypto'),rules=require('./alimtalk-contract'),core=require('./core');
const {createAuthorizer,firestoreAccountReader}=require('./alimtalk-auth');
const {createStudentAdapter,firestoreStudentReader,withStudentDirectory}=require('./alimtalk-students');
const {createSourceReader}=require('./alimtalk-source');
const {parseSnapshot}=require('./alimtalk-grid');
const {createReviewService}=require('./alimtalk-review');
const {firestoreReviewStore}=require('./alimtalk-review-store');
const {firestoreStore}=require('./alimtalk-store');
const {createService}=require('./alimtalk-service');
const {createHandler}=require('./alimtalk-http');
const fail=code=>{throw Object.assign(Error(code),{code});};
const templateProvider=options=>require('./alimtalk-provider').createProvider(options);
function selectSourceSheet(names,date,now){
 const matches=names.filter(name=>{
  if(date==='2026-11-19'&&name!=='11/19(목) 수능')return false;
  try{return core.dateForSheet(name,now)===date;}catch{return false;}
 });
 if(matches.length!==1)fail('SOURCE_SHEET_UNCONFIRMED');
 return matches[0];
}
function createRuntime({db,auth,sourceUrl,sourceSecret,apiKey,apiSecret,request,fallbackFrom='',testPhone='',webhookSecret='',enableTestSend=false,now=Date.now}){
 if(typeof request!=='function')fail('TRANSPORT_REQUIRED');
 const authorize=createAuthorizer({verifyIdToken:(t,r)=>auth.verifyIdToken(t,r),readAccount:firestoreAccountReader(db)});
 const rs=firestoreReviewStore(db),store=firestoreStore(db);
 const directoryStudent=createStudentAdapter({...firestoreStudentReader(db),allowInactiveNotices:true});
 const resolveStudent=async(id,signal)=>{
  if(/^notice_[a-f0-9]{64}$/.test(id)){const guest=await rs.noticeGuest(id);if(!guest||guest.id!==id||!guest.noticeDate)fail('STUDENT_NOT_FOUND');return guest;}
  return directoryStudent(id,signal);
 };
 async function directoryNameDocs(name){
  const snapshots=await Promise.all(rules.studentNameSpellings(name).map(spelling=>db.collection('students').where('name','==',spelling).limit(21).get()));
  const docs=[...new Map(snapshots.flatMap(s=>s.docs.map(doc=>[doc.id,doc]))).values()];
  if(docs.length>20)fail('CANDIDATE_LIMIT');
  return docs;
 }
 const searchStudents=async(actor,name)=>{
  const docs=await directoryNameDocs(name);
  const candidates=docs.filter(d=>{const s=d.data();return !s.isDeleted&&!s.deletedAt&&!s.isAlias&&!s.mergedInto&&s.identityStatus!=='ALIAS'&&s.status!=='MERGED'&&s.disabled!==true&&(!s.campusId||s.campusId===actor.academyId);}).map(d=>({...d.data(),id:d.id}));
  if(docs.length&&!candidates.length)fail('STUDENT_IDENTITY_REVIEW_REQUIRED');
  return candidates;
 };
 const reader=createSourceReader({sourceUrl,secret:sourceSecret,now,request:async(url,options)=>{
  const response=await request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:options.body,signal:options.signal});
  if(!response.ok)fail('SOURCE_UNAVAILABLE');return response.json();
 }});
 const linkSource=require('./alimtalk-links').createLinkResolver({store:rs,resolveStudent,now,findCandidates:async(name,source,audience)=>{
  const candidates=await searchStudents({academyId:'banpo'},name);
  const usable=candidates.filter(s=>['ACTIVE','RETURNED','INACTIVE','STOPPED','PAUSED','SUSPENDED','중지','휴원','퇴원'].includes(s.status));
  const schools=[...new Set(source.entries.filter(e=>e.sourceName===name).map(e=>e.sourceSchool))];
  if(usable.length){
   if((audience==='guardian'||audience==='student') && schools.length===1 && schools[0]){
    const exact=usable.filter(s=>rules.directorySchoolKey(s.school,s.grade)===schools[0]);
    if(exact.length===1)return [exact[0].id];
   }
   return usable.map(s=>s.id);
  }
  if(schools.length===1)return (await require('./alimtalk-notice-contacts').existingGuests(rs,source.date,name,schools[0])).map(s=>s.id);
  return [];

 }});
 const loadSource=async(actor,date,signal,audience)=>{
  if(actor.academyId!=='banpo'||!rules.validDate(date))fail('FORBIDDEN');
  const catalog=(await db.collection('liveTimetableSnapshotJobs').doc('catalog').get()).data();
  const sheet=selectSourceSheet(catalog?.sheets||[],date,now());
  const [snapshot,assignments]=await Promise.all([reader({sheet,date,signal}),rs.dayAssignments(actor.academyId,date)]);
  return linkSource(actor,parseSnapshot(snapshot,now(),assignments),audience);
 };
 const review=createReviewService({authorize,loadSource,resolveStudent,store:rs,now,searchStudents:async(actor,query)=>{
  // Exact-name candidates only; no bootstrap/full roster and never auto choose.
  if(query.includes('/'))fail('INVALID_QUERY');
  const direct=await db.collection('students').doc(query).get();
  let docs=direct.exists?[direct]:[];
  if(!docs.length)docs=await directoryNameDocs(query);
  return docs.filter(d=>{const s=d.data();return !s.isDeleted&&!s.deletedAt&&!s.isAlias&&!s.mergedInto&&s.identityStatus!=='ALIAS';}).map(d=>{const s=d.data();return {id:d.id,name:s.name||'',school:s.school||'',grade:s.grade||'',status:s.status||''};});
 }});
 const mapped=async(actor,date,ids,signal,audience)=>{
  if(ids.length!==1)fail('SELECT_ONE_STUDENT');
  return require('./alimtalk-verified-day').verifiedStudentDay({actor,date,id:ids[0],signal,audience,loadSource,resolveStudent,reviewStore:rs,allowUnchangedCells:true});
 };
 function deliveryFor(audience,kind){
  const loadDay=withStudentDirectory({
   loadMappedDay:(actor,date,ids,signal)=>mapped(actor,date,ids,signal,audience),resolveStudent,readClearance:(actor,id,date)=>rs.clearance(actor.academyId,date,id),readNoticeContacts:(actor,id,date)=>rs.noticeContacts(actor.academyId,date,id),now,audience
  });
  return createService({authorize,loadDay,store,provider:templateProvider({apiKey,apiSecret,request,verifiedRecipientSend:true,fallbackFrom}),webhookSecret,now,kind});
 }
 const delivery=deliveryFor('guardian','daily-lessons');
 const studentDelivery=deliveryFor('student','student-daily-lessons');
 Object.assign(review,require('./alimtalk-notice-contacts').createNoticeContactsService({authorize,loadSource,searchStudents,resolveStudent,store:rs,now}));
 const batch=require('./alimtalk-batch').createBatch({authorize,loadSource,resolveStudent,reviewStore:rs,store,
  provider:templateProvider({apiKey,apiSecret,request}),services:{student:studentDelivery,guardian:delivery},now});
 // Every review action is rate limited too; permission is checked before rate-store writes.
 for(const action of Object.keys(review)){const original=review[action];review[action]=async(session,input)=>{const a=await authorize(session);await store.rate(a.uid,'review:'+action,now(),20);return original(session,input);};}
 const testDelivery=require('./alimtalk-admin-test').createAdminTest({authorize,store,provider:templateProvider({apiKey,apiSecret,request,testPhone,enableTestSend}),testPhone,now});
 const realTestDelivery=require('./alimtalk-real-admin-test').createRealAdminTest({authorize,store,provider:templateProvider({apiKey,apiSecret,request,testPhone,enableTestSend}),testPhone,loadSource,resolveStudent,reviewStore:rs,now});
 return createHandler({review,delivery,studentDelivery,batch,testDelivery,realTestDelivery,allowTestSend:enableTestSend&&require('./alimtalk-test-recipients').testRecipients(testPhone).length>0,allowedOrigins:['https://sedubanpo.github.io'],allowSend:true});
}
module.exports={createRuntime,templateProvider,selectSourceSheet};
