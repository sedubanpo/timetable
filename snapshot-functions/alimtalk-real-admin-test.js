'use strict';
const {verifiedStudentDay}=require('./alimtalk-verified-day');
const {createService}=require('./alimtalk-service');
const {testRecipients}=require('./alimtalk-test-recipients');
const {mask}=require('./alimtalk-contract');
const fail=code=>{throw Object.assign(Error(code),{code});};
// Real schedule, administrator recipients only. Never loads guardian contacts for delivery.
function createRealAdminTest({authorize,store,provider,testPhone,loadSource,resolveStudent,reviewStore,now=Date.now}){
 const recipients=testRecipients(testPhone);
 const adminAuthorize=async session=>{const actor=await authorize(session);if(actor?.role!=='ADMIN')fail('FORBIDDEN');return actor;};
 const service=createService({authorize:adminAuthorize,store,provider,now,kind:'admin-real-lessons',loadDay:async(actor,date,ids,signal)=>{
  if(ids.length!==1||!recipients.length)fail('TEST_SCOPE_REQUIRED');
  const day=await verifiedStudentDay({actor,date,id:ids[0],signal,loadSource,resolveStudent,reviewStore});
  day.students[0].recipients=recipients;
  return day;
 }});
 return {...service,async preview(s,i){return {...await service.preview(s,i),testMode:true,realScheduleTest:true,testRecipient:recipients.map(r=>mask(r.phone)).join(' / ')};}};
}
module.exports={createRealAdminTest};
