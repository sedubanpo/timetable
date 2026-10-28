'use strict';
// Delivery core; all transports and authorization are injected server-side.
const crypto=require('node:crypto');
const rules=require('./alimtalk-contract');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const bounded=async(fn,ms=8000)=>{let timer;const controller=new AbortController();try{return await Promise.race([Promise.resolve().then(()=>fn(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error('TIMEOUT'),{code:'TIMEOUT'}));},ms);})]);}finally{clearTimeout(timer);}};
function status(code){const c=String(code);if(['3014','3048'].includes(c))return 'UNKNOWN';return {'2000':'ACCEPTED','3000':'PROCESSING','4000':'DELIVERED','5000':'FAILED'}[c]||(/^[123]\d{3}$/.test(c)?'FAILED':'UNKNOWN');}
function verifyWebhook(secret,header){
  if(typeof secret!=='string'||!secret||typeof header!=='string'||!/^[a-f0-9]{40}$/.test(header))return false;
  return crypto.timingSafeEqual(Buffer.from(crypto.createHash('sha1').update(secret).digest('hex')),Buffer.from(header));
}
function createService({authorize,loadDay,store,provider,now=Date.now,deadline=8000,webhookSecret}){
  async function auth(session){const a=await bounded(()=>authorize(session),deadline);if(!a?.uid||a.role!=='ADMIN'||a.active!==true||a.academyId!=='banpo'||a.canSendTimetable!==true)fail('FORBIDDEN');return a;}
  async function plan(actor,input){
    if(!rules.validDate(input.date)||!Array.isArray(input.targets)||!input.targets.length||input.targets.length>20)fail('INVALID_REQUEST');
    if(input.targets.some(t=>typeof t.studentId!=='string'||!t.studentId||t.studentId.length>128))fail('STUDENT_ID_REQUIRED');
    if(input.targets.some(t=>t.recipientIds!==undefined&&(!Array.isArray(t.recipientIds)||t.recipientIds.length>10||t.recipientIds.some(id=>typeof id!=='string'||id.length>128))))fail('INVALID_RECIPIENTS');
    if(new Set(input.targets.map(t=>t.studentId)).size!==input.targets.length)fail('DUPLICATE_STUDENT');
    const [day,template]=await Promise.all([bounded(signal=>loadDay(actor,input.date,input.targets.map(t=>t.studentId),signal),deadline),bounded(signal=>provider.getTemplate(rules.templateId,signal),deadline)]);
    if(day.academyId!==actor.academyId||day.date!==input.date||day.complete!==true||!day.revision||!day.mappingRevision)fail('SOURCE_NOT_VERIFIED');
    const rows=[];
    for(const target of input.targets){
      const matches=day.students.filter(s=>s.id===target.studentId);
      if(matches.length!==1){rows.push({studentId:target.studentId,reasons:['학생 ID 연결 불명확'],excluded:[],recipients:[]});continue;}
      const s=matches[0],c=rules.compose(s,input.date,s.lessons),recipients=[];
      if(s.holdReasons?.length)c.reasons.push('학생 원장·대표 ID·연락처 연결 재확인 필요');
      if(!rules.verifyTemplate(template))c.reasons.push('템플릿 승인·본문·변수 재확인 필요');
      if(!Array.isArray(target.recipientIds)||!target.recipientIds.length)c.reasons.push('수신자를 직접 선택해 주세요');
      for(const id of new Set(target.recipientIds||[])){
        const candidates=(s.recipients||[]).filter(r=>r.id===id);
        const r=candidates[0];
        if(candidates.length!==1||!r.relation||r.verified!==true||!/^010\d{8}$/.test(r.phone||'')){c.reasons.push('수신자 관계·번호 연결 확인 필요');continue;}
        if(!recipients.some(p=>p.phone===r.phone))recipients.push({id:r.id,relation:r.relation,phone:r.phone,masked:rules.mask(r.phone)});
      }
      const version=hash([actor.academyId,input.date,s.id,c.lessons,c.excluded,s.mappingRevision||day.mappingRevision]);
      rows.push({studentId:s.id,name:s.name,date:input.date,version,text:c.text,variables:c.variables,reasons:[...new Set(c.reasons)],excluded:c.excluded,recipients,
        choices:(s.recipients||[]).map(r=>({id:r.id,relation:r.relation||'관계 확인 필요',masked:rules.mask(r.phone||'')}))});
    }
    const fingerprint=hash(rows);
    return {rows,fingerprint,date:input.date,templateVerified:rules.verifyTemplate(template)};
  }
  function publicPlan(p){return {...p,rows:p.rows.map(r=>({...r,recipients:r.recipients.map(({phone,...r})=>r)})),counts:{students:p.rows.filter(r=>!r.reasons.length).length,messages:p.rows.filter(r=>!r.reasons.length).reduce((n,r)=>n+r.recipients.length,0),numbers:new Set(p.rows.filter(r=>!r.reasons.length).flatMap(r=>r.recipients.map(x=>x.phone))).size}};}
  function publicRecord(r){if(!r)return null;const {phone,variables,...rest}=r;return {...rest,masked:rules.mask(phone),label:rules.labels[r.state]};}
  async function preview(session,input){const a=await auth(session);await store.rate(a.uid,'preview',now(),30);const p=await plan(a,input);await auth(session);const id=crypto.randomUUID();await store.savePreview(id,{actor:a.uid,academyId:a.academyId,input,plan:p,expires:now()+300000});await auth(session);return {...publicPlan(p),previewId:id};}
  async function send(session,{previewId,confirmChanges=false}){
    const a=await auth(session);await store.rate(a.uid,'send',now(),10);await store.rate('academy:'+a.academyId,'send',now(),30);
    const saved=await store.preview(previewId);
    if(!saved||saved.actor!==a.uid||saved.academyId!==a.academyId||saved.expires<=now())fail('PREVIEW_EXPIRED');
    const fresh=await plan(a,saved.input);
    if(fresh.fingerprint!==saved.plan.fingerprint)return {changed:true,previous:publicPlan(saved.plan),current:publicPlan(fresh),requiresNewPreview:true};
    if(fresh.rows.some(r=>r.reasons.length))fail('HELD');
    const prior=await store.history(a.academyId,fresh.date,fresh.rows.map(r=>r.studentId));
    if(prior.some(p=>['REQUESTING','UNKNOWN'].includes(p.state)))fail('PREVIOUS_RESULT_UNCERTAIN');
    const changes=fresh.rows.flatMap(r=>prior.filter(p=>p.studentId===r.studentId&&p.version!==r.version).map(p=>({studentId:r.studentId,previous:p.text,current:r.text})));
    if(changes.length&&!confirmChanges)return {requiresChangeConfirmation:true,changes};
    // Revalidate authorization after source/template I/O and before each irreversible boundary.
    const results=[];
    for(const row of fresh.rows)for(const recipient of row.recipients){
      await auth(session);
      const id=hash([a.academyId,row.studentId,fresh.date,recipient.phone,'daily-lessons',row.version]);
      const record={id,academyId:a.academyId,studentId:row.studentId,date:fresh.date,version:row.version,phone:recipient.phone,relation:recipient.relation,text:row.text,variables:row.variables,kind:'daily-lessons',actor:a.uid,createdAt:now(),state:'REQUESTING',messageId:null,groupId:null,errorCode:null};
      const claim=await store.claim(id,record);
      if(!claim.created){results.push(publicRecord(claim.record));continue;}
      try{
        // One message per provider group: siblings sharing a number never suppress one another.
        const r=await bounded(signal=>provider.sendOne({to:recipient.phone,type:'ATA',kakaoOptions:{pfId:rules.pfId,templateId:rules.templateId,variables:row.variables,disableSms:true},customFields:{timetableKey:id}},signal),deadline);
        if(!r?.messageId||!r?.groupId)fail('UNKNOWN_RESULT');
        await apply(id,{...r,key:id});
      }catch{await store.update(id,old=>(['DELIVERED','FAILED'].includes(old.state)?old:{...old,state:'UNKNOWN',errorCode:'RESULT_UNCERTAIN',updatedAt:now()}));}
      results.push(publicRecord(await store.get(id)));
    }
    return {results};
  }
  async function results(session,input){const a=await auth(session);if(!rules.validDate(input.date)||!Array.isArray(input.studentIds)||input.studentIds.length>20||input.studentIds.some(id=>typeof id!=='string'||!id))fail('INVALID_REQUEST');await store.rate(a.uid,'results',now(),30);const records=await store.history(a.academyId,input.date,input.studentIds);for(let i=0;i<records.length;i++){const r=records[i];if(r.state==='REQUESTING'&&now()-r.createdAt>deadline)records[i]=await store.update(r.id,old=>old.state==='REQUESTING'?{...old,state:'UNKNOWN',errorCode:'RESULT_UNCERTAIN'}:old);}await auth(session);return {results:records.map(publicRecord)};}
  async function reconcile(session,id){const a=await auth(session);await store.rate(a.uid,'reconcile',now(),10);const old=await store.get(id);if(!old||old.academyId!==a.academyId)fail('FORBIDDEN');
    const r=await bounded(signal=>provider.lookup({messageId:old.messageId,groupId:old.groupId,key:id},signal),deadline);
    if(!r||r.key!==id||!r.messageId||!r.groupId)return publicRecord(old); // Absence is not proof that a timeout was never sent.
    const result=await apply(id,r);await auth(session);return publicRecord(result);
  }
  async function apply(id,event){return store.update(id,old=>{
    if(!old||event.key!==id||(old.messageId&&old.messageId!==event.messageId)||(old.groupId&&old.groupId!==event.groupId))fail('RESULT_MISMATCH');
    const next=event.registrationFailed===true?'FAILED':status(event.statusCode),terminal=['DELIVERED','FAILED'];
    if(terminal.includes(old.state))return old; // duplicate and stale events cannot undo a final result
    if(old.state==='PROCESSING'&&next==='ACCEPTED')return old;
    return {...old,state:next,messageId:event.messageId,groupId:event.groupId,errorCode:next==='FAILED'||next==='UNKNOWN'?String(event.statusCode):null,updatedAt:now()};
  });}
  async function webhook(header,events){if(!verifyWebhook(webhookSecret,header))fail('UNAUTHORIZED');if(!Array.isArray(events)||events.length>100)fail('INVALID_REQUEST');
    // Persist before acknowledging; failed storage returns non-2xx to permit provider retry.
    for(const e of events){const id=e.customFields?.timetableKey;if(id===undefined)continue;if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)||!e.messageId||!e.groupId)fail('INVALID_RESULT');if(!await store.get(id))continue;await apply(id,{...e,key:id});}return {ok:true};}
  return {preview,send,results,reconcile,webhook};
}
module.exports={createService,status,verifyWebhook,hash};
