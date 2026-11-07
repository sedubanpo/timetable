'use strict';
// A roster is a read. Only a reviewed, actor-bound ticket can cross the delivery boundary.
const {randomUUID}=require('node:crypto');
const rules=require('./alimtalk-contract');
const {hash}=require('./alimtalk-service');
const {verifiedStudentDay}=require('./alimtalk-verified-day');
const {withStudentDirectory}=require('./alimtalk-students');
const fail=code=>{throw Object.assign(Error(code),{code});};
const kinds={student:'student-daily-lessons',guardian:'daily-lessons'};
const outstanding=new Set(['REQUESTING','ACCEPTED','PROCESSING','UNKNOWN']);
const newest=(a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id);
const reason=c=>({
 CONTACT_CLEARANCE_REQUIRED:'받는 번호 확인 필요',MAPPING_CHANGED:'수업과 학생 다시 확인',
 STUDENT_COVERAGE_INCOMPLETE:'변경된 수업 다시 연결',STUDENT_IDENTITY_REVIEW_REQUIRED:'이름·학교 확인 필요',
 STUDENT_SCHOOL_MISMATCH:'학교·학년 확인 필요',CANONICAL_RECONFIRM_REQUIRED:'학생 원장 다시 확인'
}[c]||'학생·연락처 확인 필요');
async function pooled(items,fn){
 const result=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(6,items.length)},async()=>{while(next<items.length){const i=next++;result[i]=await fn(items[i]);}}));
 return result;
}
function createBatch({authorize,loadSource,resolveStudent,reviewStore,store,provider,services,now=Date.now}){
 async function actor(session){const a=await authorize(session);if(!a?.uid||a.role!=='ADMIN'||a.active!==true||a.academyId!=='banpo'||a.canSendTimetable!==true)fail('FORBIDDEN');return a;}
 async function reviewer(session){
  const a=await authorize(session,{reviewBatch:true});
  if(!a?.uid||a.active!==true||a.academyId!=='banpo'||!['ADMIN','STAFF','DESK'].includes(a.role))fail('FORBIDDEN');
  return a;
 }
 function validate({date,audience}){if(!rules.validDate(date)||typeof audience!=='string'||!Object.hasOwn(kinds,audience))fail('INVALID_REQUEST');}
 async function scan(a,{date,audience},only){
  const kind=kinds[audience];
  const [src,assign,hist]=await Promise.all([loadSource(a,date),reviewStore.dayAssignments(a.academyId,date),
   only?store.history(a.academyId,date,only):store.dayHistory(a.academyId,date,kind)]);
  if(!src.complete||!src.revision||src.date!==date||src.academyId!==a.academyId||src.entries.length>5000)fail('SOURCE_INCOMPLETE');
  const history=hist.filter(r=>r.studentId!=='__alimtalk_admin_test__'&&(r.kind||'daily-lessons')===kind).sort(newest);
  const ids=only||[...new Set([...Object.values(assign).map(v=>v.studentId),...history.map(r=>r.studentId)])];
  if(ids.length>350)fail('ROSTER_LIMIT');
  const rows=await pooled(ids,async id=>{
   const past=history.filter(r=>r.studentId===id),received=past.filter(r=>r.state==='DELIVERED');
   let student,name=past[0]?.variables?.['#{학생명}']||'',issue='';
   try{student=await resolveStudent(id);name=student.name;if(student.id!==id)fail('CANONICAL_RECONFIRM_REQUIRED');}
   catch(e){issue=reason(e.code);}
   const entries=src.entries.filter(e=>e.sourceName===name);
   // This draft is for classification/display only; never use it to authorize a recipient.
   const c=rules.compose({id,name,mappingVerified:true},date,entries.map(e=>({...e.lesson,studentId:id})));
   const version=hash([a.academyId,date,id,c.text]);
   let verified,recipients=[];
   if(!issue&&entries.length){
    try{
     const getStudent=async()=>({...student});
     const mapped=await verifiedStudentDay({actor:a,date,id,allowUnchangedCells:true,loadSource:async()=>src,resolveStudent:getStudent,
      reviewStore:{mapping:(...args)=>reviewStore.mapping(...args),dayAssignments:async()=>assign}});
     const day=await withStudentDirectory({loadMappedDay:async()=>mapped,resolveStudent:getStudent,
      readClearance:(actor,sid,d)=>reviewStore.clearance(actor.academyId,d,sid),now,audience})(a,date,[id]);
     verified=day.students[0];
     if(verified.holdReasons?.length)issue=reason(verified.holdReasons[0]);
     else if(c.reasons.length)issue=c.reasons.join(' · ');
     else if(!verified.recipients.length)issue=verified.recipientIssue||'이 발송 대상의 확인된 번호 없음';
     else recipients=verified.recipients.filter((r,i,all)=>r.verified&&all.findIndex(x=>x.phone===r.phone)===i);
    }catch(e){issue=reason(e.code);}
   }else if(!entries.length)issue='현재 시간표에 수업 없음 · 직접 확인';
   const items=recipients.map(r=>{
    const records=past.filter(x=>x.phone===r.phone);
    const delivered=records.find(x=>x.state==='DELIVERED'),pending=records.find(x=>outstanding.has(x.state));
    const state=pending?'pending':!delivered?'unsent':delivered.version===version?'sent':'changed';
    const latest=records[0];
    const ticket=hash([kind,date,id,r.id,r.phone,verified.mappingRevision,version,latest?.id||'',latest?.state||'',state]);
    return {ticket,state,recipient:r,previous:delivered?.text||'',lastState:latest?.state||'',studentId:id,name,date,version,text:c.text,variables:c.variables};
   });
   // A removed/replaced number is not evidence that the new number has received anything.
   const byPhone=new Map();for(const r of received)if(!byPhone.has(r.phone))byPhone.set(r.phone,r);
   const comparisons=[...byPhone.values()].filter(r=>r.version!==version).map(r=>({previous:r.text||'',relation:r.relation,receivedAt:r.createdAt}));
   const changed=items.some(t=>t.state==='changed')||(!items.length&&[...byPhone.values()].some(r=>r.version!==version));
   const state=changed?'changed':items.some(t=>t.state==='unsent')?'unsent':items.some(t=>t.state==='pending')?'pending':
    items.length?'sent':past.some(r=>outstanding.has(r.state))?'pending':received.length?'held':'unsent';
   return {id,name,state,issue,text:c.text,comparisons,items,failed:items.some(t=>t.lastState==='FAILED'),past};
  });
  if(!only){
   const seen=new Set(rows.map(r=>r.name));
   for(const e of src.entries)if(!seen.has(e.sourceName)&&!rules.exclusion(e.lesson)){
    seen.add(e.sourceName);rows.push({id:null,name:e.sourceName,state:'unsent',issue:'학생과 받는 번호 확인 필요',items:[],past:[]});
   }
  }
  return rows.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 }
 const summary=r=>({studentId:r.id,name:r.name,state:r.state,issue:r.issue,failed:!!r.failed});
 async function roster(session,input){
  const a=await reviewer(session);validate(input);await store.rate(a.uid,'batchRoster',now(),30);
  const rows=await scan(a,input);await reviewer(session);return {rows:rows.map(summary)};
 }
 async function prepare(session,input){
  const {date,audience,mode}=input;
  const a=await reviewer(session);validate(input);
  if(!['unsent','changed'].includes(mode))fail('INVALID_REQUEST');
  await store.rate(a.uid,'batchPreview',now(),15);
  const rows=await scan(a,input);
  const changes=mode==='changed'?rows.filter(r=>r.comparisons?.length).map(r=>({
   name:r.name,studentId:r.id,current:r.text,issue:r.issue,comparisons:r.comparisons
  })):[];
  if((mode==='unsent'||a.canSendTimetable)&&!rules.verifyTemplate(await provider.getTemplate(rules.templateId)))fail('TEMPLATE_MISMATCH');
  const access=await reviewer(session);
  if(!access.canSendTimetable||!a.canSendTimetable){
   const eligibleStudents=mode==='unsent'?rows.flatMap(r=>{
    const n=r.items.filter(x=>x.state==='unsent').length;
    return n?[{name:r.name,count:n,text:r.text}]:[];
   }):[];
   return {date,audience,mode,readOnly:true,eligibleStudents,changes,rows:rows.map(summary),items:[]};
  }
  const tickets=rows.flatMap(r=>r.items.filter(x=>x.state===mode));
  const previewId=randomUUID(),expires=now()+15*60000;
  await actor(session);
  if(tickets.length)await store.savePreview(previewId,{kind:'bulk',academyId:a.academyId,actor:a.uid,date,audience,mode,expires,
   tickets:Object.fromEntries(tickets.map(x=>[x.ticket,x.studentId]))});
  return {date,audience,mode,previewId,expires,changes,rows:rows.map(summary),items:tickets.map(x=>({
   ticket:x.ticket,studentId:x.studentId,name:x.name,relation:x.recipient.relation,masked:rules.mask(x.recipient.phone),previous:x.previous,text:x.text,retry:x.lastState==='FAILED'
  }))};
 }
 async function send(session,input){
  const start=Date.now(),a=await actor(session),{previewId,tickets}=input;
  if(input.confirmed!==true||!Array.isArray(tickets)||!tickets.length||tickets.length>4||
   tickets.some(t=>typeof t!=='string'||!/^[a-f0-9]{64}$/.test(t))||new Set(tickets).size!==tickets.length)fail('INVALID_REQUEST');
  const p=await store.preview(previewId);
  if(!p||p.kind!=='bulk'||p.academyId!==a.academyId||p.actor!==a.uid||p.expires<=now()||
    p.audience!==input.audience||p.date!==input.date||p.mode!==input.mode||tickets.some(t=>!Object.hasOwn(p.tickets,t)))fail('PREVIEW_EXPIRED');
  await store.rate(a.uid,'batchSend',now(),36);await store.rate('academy:'+a.academyId,'batchSend',now(),48);
  const ids=[...new Set(tickets.map(t=>p.tickets[t]))];
  const [rows,template]=await Promise.all([scan(a,p,ids),provider.getTemplate(rules.templateId)]);
  if(!rules.verifyTemplate(template))fail('TEMPLATE_MISMATCH');
  const fresh=rows.flatMap(r=>r.items.filter(x=>x.state===p.mode));
  const selected=tickets.map(t=>fresh.find(x=>x.ticket===t));
  if(selected.some(x=>!x))fail('BATCH_CHANGED');
  if(Date.now()-start>14000||p.expires<=now())fail('PREVIEW_EXPIRED');
  const settled=await Promise.allSettled(selected.map(async x=>{
   const r=await services[p.audience].dispatch(session,a,p.date,x,x.recipient,rows.find(r=>r.id===x.studentId).past,previewId,true);
   return {id:r.id,studentId:x.studentId,relation:r.relation,masked:r.masked,state:r.state,errorCode:r.errorCode};
  }));
  if(settled.some(x=>x.status==='rejected'))fail('RESULT_UNCERTAIN');
  return {results:settled.map(x=>x.value)};
 }
 async function refresh(session,input){
  const a=await actor(session);validate(input);const {ids,date,audience}=input;
  if(!Array.isArray(ids)||!ids.length||ids.length>5||ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)))fail('INVALID_REQUEST');
  await store.rate(a.uid,'batchRefresh',now(),32);
  const records=await Promise.all([...new Set(ids)].map(id=>store.get(id)));
  if(records.some(r=>!r||r.academyId!==a.academyId||r.date!==date||r.kind!==kinds[audience]||r.studentId==='__alimtalk_admin_test__'))fail('FORBIDDEN');
  const events=await Promise.all(records.map(async r=>{
   if(!outstanding.has(r.state)||!r.messageId)return null;
   return provider.lookup({messageId:r.messageId,groupId:r.groupId,key:r.id},AbortSignal.timeout(8000));
  }));
  await actor(session);
  await Promise.all(records.map((r,i)=>events[i]?services[audience].apply(r.id,events[i]):null));
  return {checked:records.length};
 }
 async function history(session,input){
  const a=await actor(session);validate(input);await store.rate(a.uid,'batchHistory',now(),30);
  const rows=await store.dayHistory(a.academyId,input.date,kinds[input.audience]);await actor(session);
  return {results:rows.filter(r=>r.studentId!=='__alimtalk_admin_test__').sort(newest).map(r=>({id:r.id,studentId:r.studentId,name:r.variables?.['#{학생명}']||'',createdAt:r.createdAt,
   state:r.state,relation:r.relation,masked:rules.mask(r.phone),errorCode:r.errorCode,text:r.text,batch:!!r.batchId}))};
 }
 return {batchRoster:roster,batchPreview:prepare,batchSend:send,batchHistory:history,batchRefresh:refresh};
}
module.exports={createBatch};
