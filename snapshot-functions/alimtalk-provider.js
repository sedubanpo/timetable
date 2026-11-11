'use strict';
// Only this server-side transport can reach SOLAPI. No retries of dispatch requests.
const crypto=require('node:crypto'),rules=require('./alimtalk-contract'),{fallbackText}=require('./alimtalk-fallback');
const fail=code=>{throw Object.assign(Error(code),{code});};
function createProvider({apiKey,apiSecret,request,testPhone='',enableTestSend=false,verifiedRecipientSend=false,fallbackFrom=''}){
 const testPhones=require('./alimtalk-test-recipients').testRecipients(testPhone).map(r=>r.phone);
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
 if(verifiedRecipientSend && fallbackFrom && !/^0[0-9]{8,10}$/.test(fallbackFrom))fail('INVALID_FALLBACK_SENDER');
 const smsFallback = verifiedRecipientSend && Boolean(fallbackFrom);
 return {
  smsFallback,
  async getTemplate(id,signal){if(id!==rules.templateId)fail('TEMPLATE_MISMATCH');return call('/kakao/v2/templates/'+id,'GET',null,signal);},
  async sendOne(m,signal){
   if(!verifiedRecipientSend&&(!enableTestSend||!testPhones.length))fail('SENDING_DISABLED');
   if((verifiedRecipientSend?!/^010\d{8}$/.test(m.to):!testPhones.includes(m.to))||m.type!=='ATA'||m.kakaoOptions?.pfId!==rules.pfId||m.kakaoOptions?.templateId!==rules.templateId||m.kakaoOptions?.disableSms!==(!smsFallback)||!(/^[a-f0-9]{64}$/).test(m.customFields?.timetableKey||''))fail('TEST_RECIPIENT_REQUIRED');
   const message={...(smsFallback?{from:fallbackFrom}:{}),to:m.to,type:'ATA',country:'82',autoTypeDetect:false,kakaoOptions:{pfId:rules.pfId,templateId:rules.templateId,variables:m.kakaoOptions.variables,disableSms:!smsFallback,buttons:[{buttonType:'WL',buttonName:'수업 문의',linkMo:'https://pf.kakao.com/_KIZxin',linkPc:'https://pf.kakao.com/_KIZxin'}]},customFields:{timetableKey:m.customFields.timetableKey}};
   // Provider-managed replacement only: same recipient, one LMS if ATA fails.
   // Never accept caller-supplied replacement recipients or content.
   if(smsFallback)message.replacements=[{to:m.to,from:fallbackFrom,type:'LMS',country:'82',subject:'반포 에스학원 수업 일정 안내',text:fallbackText(m.kakaoOptions.variables)}];
   const r=await call('/messages/v4/send-many/detail','POST',{messages:[message],showMessageList:true,allowDuplicates:false},signal);
   const good=r.messageList||[],bad=r.failedMessageList||[];
   if(!Array.isArray(good)||!Array.isArray(bad)||good.length+bad.length!==1)fail('UNKNOWN_RESULT');
   return event(good[0]||{...bad[0],registrationFailed:true},r.groupInfo?.groupId,m.customFields.timetableKey);
  },
  async lookup({messageId,groupId,key,phone,createdAt,smsFallback:expectedFallback},signal){
   if(!(/^[a-f0-9]{64}$/).test(key||''))fail('INVALID_RESULT');
   let matched;
   if(!messageId||!groupId){
    // A bounded recipient/time query is only a candidate search. The immutable key must match.
    if(!/^010\d{8}$/.test(phone||'')||!Number.isSafeInteger(createdAt)||createdAt<=0)return null;
    const start=createdAt-60000,end=createdAt+600000,matches=[],seen=new Set();let cursor;
    for(let page=0;page<3;page++){
     const q=new URLSearchParams({to:phone,startDate:new Date(start).toISOString(),endDate:new Date(end).toISOString(),limit:'100',...(cursor?{startKey:cursor}:{})});
     const result=await call('/messages/v4/list?'+q,'GET',null,signal);
     if(!result.messageList||typeof result.messageList!=='object'||Array.isArray(result.messageList))fail('INVALID_RESULT');
     for(const m of Object.values(result.messageList)){
      if(m.customFields?.timetableKey!==key||m.replacement===true||m.type!=='ATA')continue;
      const time=Date.parse(m.dateCreated);
      if(m.to!==phone||!Number.isFinite(time)||time<start||time>end||
       (messageId&&m.messageId!==messageId)||(groupId&&m.groupId!==groupId)||
       !/^[A-Za-z0-9_-]{1,100}$/.test(m.messageId||'')||!/^[A-Za-z0-9_-]{1,100}$/.test(m.groupId||''))fail('RESULT_MISMATCH');
      if(!matches.some(x=>x.messageId===m.messageId))matches.push(m);
     }
     if(!result.nextKey){cursor=null;break;}
     if(typeof result.nextKey!=='string'||seen.has(result.nextKey))fail('RECOVERY_SCAN_LIMIT');
     cursor=result.nextKey;seen.add(cursor);
    }
    if(cursor)fail('RECOVERY_SCAN_LIMIT');
    if(matches.length>1)fail('RECOVERY_AMBIGUOUS');
    if(!matches.length)return null;
    matched=matches[0];messageId=matched.messageId;groupId=matched.groupId;
   }else{
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(messageId)||!/^[A-Za-z0-9_-]{1,100}$/.test(groupId))fail('INVALID_RESULT');
    const q=new URLSearchParams({criteria:'messageId',cond:'eq',value:messageId,limit:'2'});
    const r=await call('/messages/v4/list?'+q,'GET',null,signal);
    if(!r.messageList||typeof r.messageList!=='object'||Array.isArray(r.messageList))fail('INVALID_RESULT');
    const rows=Object.values(r.messageList);if(!rows.length)return null;
    if(r.nextKey||rows.length!==1||rows[0].messageId!==messageId||rows[0].groupId!==groupId||rows[0].type!=='ATA'||rows[0].replacement===true)fail('RESULT_MISMATCH');
    matched=rows[0];
   }
   const original=event(matched,groupId,key);
   const {status}=require('./alimtalk-service');
   if(!expectedFallback || status(original.statusCode)!=='FAILED')return original;
   // Each dispatch owns a single-recipient group. Its final counts include the provider's replacement.
   if(!/^[A-Za-z0-9_-]{1,100}$/.test(groupId))fail('INVALID_RESULT');
   const group=await call('/messages/v4/groups/'+groupId,'GET',null,signal);
   if(group.groupId!==groupId)fail('RESULT_MISMATCH');
   const count=group.count;
   if(group.status!=='COMPLETE'||!count||count.sentPending!==0)return original;
   if(count.sentReplacement===1 && count.sentSuccess===1)return {...original,fallbackResult:'DELIVERED'};
   if(count.sentReplacement===1 && count.sentSuccess===0 && count.sentFailed>=1)return {...original,fallbackResult:'FAILED'};
   if(count.sentReplacement===0 && count.sentSuccess===0 && count.sentFailed===1)return {...original,fallbackResult:'NOT_SENT'};
   return original;
  }
 };
}
module.exports={createProvider};
