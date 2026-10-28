'use strict';
// Only this server-side transport can reach SOLAPI. No retries of dispatch requests.
const crypto=require('node:crypto'),rules=require('./alimtalk-contract');
const fail=code=>{throw Object.assign(Error(code),{code});};
function createProvider({apiKey,apiSecret,request,testPhone='',enableTestSend=false}){
 if(typeof request!=='function')fail('TRANSPORT_REQUIRED');
 async function call(path,method,body,signal){
  const date=new Date().toISOString(),salt=crypto.randomBytes(24).toString('hex');
  const signature=crypto.createHmac('sha256',apiSecret).update(date+salt).digest('hex');
  const r=await request('https://api.solapi.com'+path,{method,headers:{Authorization:`HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal});
  if(!r.ok){
   // Never forward provider bodies: they may contain account or request information.
   const known={InvalidAPIKey:'PROVIDER_KEY_INVALID',SignatureDoesNotMatch:'PROVIDER_SIGNATURE_MISMATCH',RequestTimeTooSkewed:'PROVIDER_CLOCK_SKEW',DuplicatedSignature:'PROVIDER_SIGNATURE_REUSED'};
   let detail;try{detail=await r.json();}catch{}
   const code=Object.hasOwn(known,detail?.errorCode)?known[detail.errorCode]:({400:'PROVIDER_REQUEST_REJECTED',401:'PROVIDER_AUTH_REJECTED',403:'PROVIDER_ACCESS_DENIED',404:'PROVIDER_RESOURCE_NOT_FOUND',429:'PROVIDER_RATE_LIMIT'}[r.status]||'PROVIDER_UNAVAILABLE');
   console.warn('timetableAlimtalkProviderFailure',{code,status:Number.isInteger(r.status)?r.status:0,operation:method==='GET'?'read':'send'});
   fail(code);
  }return r.json();
 }
 function event(m,groupId,key){
  if(!m?.messageId||!groupId||m.customFields?.timetableKey!==key)fail('RESULT_MISMATCH');
  return {messageId:m.messageId,groupId,key,statusCode:String(m.statusCode||''),registrationFailed:m.registrationFailed===true};
 }
 return {
  async getTemplate(id,signal){if(id!==rules.templateId)fail('TEMPLATE_MISMATCH');return call('/kakao/v2/templates/'+id,'GET',null,signal);},
  async sendOne(m,signal){
   if(!enableTestSend||!/^010\d{8}$/.test(testPhone))fail('SENDING_DISABLED');
   if(m.to!==testPhone||m.type!=='ATA'||m.kakaoOptions?.pfId!==rules.pfId||m.kakaoOptions?.templateId!==rules.templateId||m.kakaoOptions?.disableSms!==true||!(/^[a-f0-9]{64}$/).test(m.customFields?.timetableKey||''))fail('TEST_RECIPIENT_REQUIRED');
   const message={to:testPhone,type:'ATA',country:'82',autoTypeDetect:false,kakaoOptions:{pfId:rules.pfId,templateId:rules.templateId,variables:m.kakaoOptions.variables,disableSms:true,buttons:[{buttonType:'WL',buttonName:'수업 문의',linkMo:'https://pf.kakao.com/_KIZxin',linkPc:'https://pf.kakao.com/_KIZxin'}]},customFields:{timetableKey:m.customFields.timetableKey}};
   const r=await call('/messages/v4/send-many/detail','POST',{messages:[message],showMessageList:true,allowDuplicates:false},signal);
   const good=r.messageList||[],bad=r.failedMessageList||[];
   if(!Array.isArray(good)||!Array.isArray(bad)||good.length+bad.length!==1)fail('UNKNOWN_RESULT');
   return event(good[0]||{...bad[0],registrationFailed:true},r.groupInfo?.groupId,m.customFields.timetableKey);
  },
  async lookup({messageId,groupId,key},signal){
   // No ID after timeout: do not scan unrelated account history or infer absence.
   if(!messageId)return null;
   if(!/^[A-Za-z0-9_-]{1,100}$/.test(messageId)||!groupId||!(/^[a-f0-9]{64}$/).test(key||''))fail('INVALID_RESULT');
   const q=new URLSearchParams({criteria:'messageId',cond:'eq',value:messageId,limit:'2'});
   const r=await call('/messages/v4/list?'+q,'GET',null,signal);
   if(!r.messageList||typeof r.messageList!=='object'||Array.isArray(r.messageList))fail('INVALID_RESULT');
   const rows=Object.values(r.messageList);if(!rows.length)return null;
   if(r.nextKey||rows.length!==1||rows[0].messageId!==messageId||rows[0].groupId!==groupId||rows[0].type!=='ATA'||rows[0].replacement===true)fail('RESULT_MISMATCH');
   return event(rows[0],groupId,key);
  }
 };
}
module.exports={createProvider};
