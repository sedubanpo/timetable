'use strict';
const rules=require('../assets/alimtalk-contract');
function fixture(){
  const clone=v=>v===undefined?undefined:structuredClone(v);
  const records=new Map(),previews=new Map(),rates=new Map();let chain=Promise.resolve();
  const atomic=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
  const store={savePreview:async(id,p)=>previews.set(id,clone(p)),preview:async id=>clone(previews.get(id)),get:async id=>clone(records.get(id)),
    claim:(id,r)=>atomic(()=>{if(records.has(id))return {created:false,record:clone(records.get(id))};records.set(id,clone(r));return {created:true,record:clone(r)};}),
    update:(id,fn)=>atomic(()=>{const r=fn(clone(records.get(id)));records.set(id,clone(r));return clone(r);}),
    history:async(a,d,ids)=>[...records.values()].filter(r=>r.academyId===a&&r.date===d&&ids.includes(r.studentId)).map(clone),
    rate:async(uid,action,now,limit)=>atomic(()=>{const key=uid+action,old=rates.get(key),n=old&&old.until>now?old.count:0;if(n>=limit)throw Object.assign(Error('RATE_LIMIT'),{code:'RATE_LIMIT'});rates.set(key,{count:n+1,until:now+60000});})};
  const actor={uid:'mock-admin',role:'ADMIN',active:true,academyId:'banpo',canSendTimetable:true};
  const lesson={sourceId:'cell-1',studentId:'synthetic-1',date:'2026-10-28',subject:'수학',teacher:'가상담당',building:'본관',room:'6강의실',type:'1:1',start:'16:00',end:'17:00',status:'정규'};
  const student={id:'synthetic-1',name:'가상학생',mappingVerified:true,recipients:[{id:'guardian-1',relation:'보호자',phone:'01000000001',verified:true}],lessons:[lesson]};
  const day={academyId:'banpo',date:'2026-10-28',complete:true,revision:'source-1',mappingRevision:'map-1',students:[student]};
  const template={templateId:rules.templateId,channelId:rules.pfId,name:rules.templateName,status:'APPROVED',content:rules.content};
  const sent=[];
  const provider={getTemplate:async()=>clone(template),sendOne:async m=>{sent.push(clone(m));return {messageId:'mock-message-'+sent.length,groupId:'mock-group-'+sent.length,statusCode:'2000'};},lookup:async()=>null};
  const input={date:day.date,targets:[{studentId:student.id,recipientIds:['guardian-1']}]};
  const deps={authorize:async()=>clone(actor),loadDay:async()=>clone(day),store,provider,webhookSecret:'synthetic-webhook-secret',deadline:40};
  return {actor,lesson,student,day,template,sent,input,deps,records};
}
module.exports={fixture};
