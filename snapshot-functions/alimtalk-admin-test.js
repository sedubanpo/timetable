'use strict';
const {createService}=require('./alimtalk-service');
const R=require('./alimtalk-contract');
const fail=code=>{throw Object.assign(Error(code),{code});};
// Fixed synthetic schedule, separate IDs: never reroutes a real student's message.
function createAdminTest({authorize,store,provider,testPhone,now=Date.now}){
 const id='__alimtalk_admin_test__';
 const today=()=>new Date(now()+9*3600000).toISOString().slice(0,10);
 const service=createService({authorize,store,provider,now,loadDay:async(actor,date,ids)=>{
  if(date!==today()||ids.length!==1||ids[0]!==id)fail('TEST_SCOPE_REQUIRED');
  if(!/^010\d{8}$/.test(testPhone||''))fail('TEST_PHONE_NOT_CONFIGURED');
  const lessons=[{sourceId:'admin-test-1',studentId:id,date,subject:'수학',teacher:'테스트담당',building:'본관',room:'6강의실',type:'1:1',start:'16:00',end:'17:00',status:'정규'}];
  return {academyId:actor.academyId,date,complete:true,revision:'admin-test-v1',mappingRevision:'admin-test-v1',students:[{id,name:'관리자 테스트(가상)',mappingVerified:true,lessons,recipients:[{id:'admin-test',relation:'관리자 본인 · 테스트 전용',phone:testPhone,verified:true}]}]};
 }});
 return {...service,async preview(s,input){return {...await service.preview(s,input),testMode:true,testRecipient:R.mask(testPhone)};}};
}
module.exports={createAdminTest};
