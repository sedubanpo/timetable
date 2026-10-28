'use strict';
const crypto=require('node:crypto'),rules=require('./alimtalk-contract'),core=require('./core');
const {createAuthorizer,firestoreAccountReader}=require('./alimtalk-auth');
const {createStudentAdapter,firestoreStudentReader,withStudentDirectory}=require('./alimtalk-students');
const {createSourceReader}=require('./alimtalk-source');
const {parseSnapshot,createMappedDay}=require('./alimtalk-grid');
const {createReviewService}=require('./alimtalk-review');
const {firestoreReviewStore}=require('./alimtalk-review-store');
const {firestoreStore}=require('./alimtalk-store');
const {createService}=require('./alimtalk-service');
const {createHandler}=require('./alimtalk-http');
const fail=code=>{throw Object.assign(Error(code),{code});};
const templateProvider=options=>require('./alimtalk-provider').createProvider(options);
function createRuntime({db,auth,sourceUrl,sourceSecret,apiKey,apiSecret,request,testPhone='',webhookSecret='',enableTestSend=false,now=Date.now}){
 if(typeof request!=='function')fail('TRANSPORT_REQUIRED');
 const authorize=createAuthorizer({verifyIdToken:(t,r)=>auth.verifyIdToken(t,r),readAccount:firestoreAccountReader(db)});
 const rs=firestoreReviewStore(db),store=firestoreStore(db),resolveStudent=createStudentAdapter(firestoreStudentReader(db));
 const reader=createSourceReader({sourceUrl,secret:sourceSecret,now,request:async(url,options)=>{
  const response=await request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:options.body,signal:options.signal});
  if(!response.ok)fail('SOURCE_UNAVAILABLE');return response.json();
 }});
 const loadSource=async(actor,date,signal)=>{
  if(actor.academyId!=='banpo'||!rules.validDate(date))fail('FORBIDDEN');
  const catalog=(await db.collection('liveTimetableSnapshotJobs').doc('catalog').get()).data();
  const sheets=(catalog?.sheets||[]).filter(s=>{try{return core.dateForSheet(s,now())===date;}catch{return false;}});
  if(sheets.length!==1)fail('SOURCE_SHEET_UNCONFIRMED');
  return parseSnapshot(await reader({sheet:sheets[0],date,signal}),now());
 };
 const review=createReviewService({authorize,loadSource,resolveStudent,store:rs,now,searchStudents:async(actor,query)=>{
  // Exact-name candidates only; no bootstrap/full roster and never auto choose.
  if(query.includes('/'))fail('INVALID_QUERY');
  const direct=await db.collection('students').doc(query).get();
  let docs=direct.exists?[direct]:[];
  if(!docs.length){const snap=await db.collection('students').where('name','==',query).limit(21).get();if(snap.size>20)fail('CANDIDATE_LIMIT');docs=snap.docs;}
  return docs.filter(d=>{const s=d.data();return !s.isDeleted&&!s.deletedAt&&!s.isAlias&&!s.mergedInto&&s.identityStatus!=='ALIAS';}).map(d=>{const s=d.data();return {id:d.id,name:s.name||'',school:s.school||'',grade:s.grade||'',status:s.status||''};});
 }});
 const mapped=createMappedDay({loadSource,readDayAssignments:rs.dayAssignments,readMapping:rs.mapping});
 const delivery=createService({authorize,loadDay:withStudentDirectory({loadMappedDay:mapped,resolveStudent,readClearance:(a,id,d)=>rs.clearance(a.academyId,d,id),now}),store,provider:templateProvider({apiKey,apiSecret,request}),webhookSecret,now});
 // Every review action is rate limited too; permission is checked before rate-store writes.
 for(const action of Object.keys(review)){const original=review[action];review[action]=async(session,input)=>{const a=await authorize(session);await store.rate(a.uid,'review:'+action,now(),20);return original(session,input);};}
 const testDelivery=require('./alimtalk-admin-test').createAdminTest({authorize,store,provider:templateProvider({apiKey,apiSecret,request,testPhone,enableTestSend}),testPhone,now});
 return createHandler({review,delivery,testDelivery,allowTestSend:enableTestSend&&/^010\d{8}$/.test(testPhone),allowedOrigins:['https://sedubanpo.github.io'],allowSend:false});
}
module.exports={createRuntime,templateProvider};
