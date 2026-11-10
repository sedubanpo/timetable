'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./alimtalk-fixture.cjs'),{createBatch}=require('../snapshot-functions/alimtalk-batch');
const {createService,hash}=require('../snapshot-functions/alimtalk-service');
const {contactHash}=require('../snapshot-functions/alimtalk-students');
function setup(count=3){
 const f=fixture(),{day,deps}=f,date=day.date,people={},maps={},clear={},assign={},src={date,academyId:'banpo',revision:'v1',complete:true,entries:[]};
 let clock=100000,auth={...f.actor};
 const now=()=>++clock;deps.now=now;deps.authorize=async()=>({...auth});
 for(let i=1;i<=count;i++){
  const id='id'+i,eid='cell'+i,rev='map'+i,identityRevision='identity'+i;
  const recipients=['mother','father','student'].map((k,j)=>({id:k,relation:['모','부','학생'][j],phone:'0100000'+String(3*i+j).padStart(4,'0'),verified:true}));
  people[id]={id,name:'가상'+i,identityRevision,school:'검증중',grade:'2',recipients};
  src.entries.push({id:eid,fingerprint:eid,sourceName:people[id].name,sourceSchool:'검증중2',lesson:{...f.lesson,sourceId:eid,date}});
  maps[id]={date,academyId:'banpo',studentId:id,revision:rev,sourceRevision:'v1',verifiedBy:'operator',identityRevision,entries:[{id:eid,fingerprint:eid}]};
  assign[hash(eid)]={studentId:id,fingerprint:eid,revision:rev};
  clear[id]={date,academyId:'banpo',studentId:id,campusConfirmed:true,revision:'contact',mappingRevision:rev,identityRevision,checkedAt:100,checkedBy:'operator',
   recipients:Object.fromEntries(recipients.filter(r=>r.id!=='father').map(r=>[r.id,{allowed:true,phoneHash:contactHash(r.phone)}]))};
 }
 const store=deps.store;store.dayHistory=async(a,d,k)=>[...f.records.values()].filter(r=>r.date===d&&r.academyId===a&&r.kind===k).map(r=>structuredClone(r));
 const provider=deps.provider;let code=()=> '4000';provider.sendOne=async m=>{f.sent.push(structuredClone(m));const n=f.sent.length;return {messageId:'m'+n,groupId:'g'+n,statusCode:code(m,n)};};
 const services={student:createService({...deps,kind:'student-daily-lessons'}),guardian:createService(deps)};
 const b=createBatch({...deps,store,provider,now,services,loadSource:async()=>src,resolveStudent:async id=>people[id],
 reviewStore:{mapping:async(a,d,id)=>maps[id],dayAssignments:async()=>assign,clearance:async(a,d,id)=>clear[id]}});
 const base={date,audience:'guardian',mode:'unsent'};
 const preview=(args={})=>b.batchPreview('',{...base,...args});
 const send=(p,selected=p.items,over={})=>b.batchSend('',{date:p.date,audience:p.audience,mode:p.mode,previewId:p.previewId,confirmed:true,tickets:selected.map(t=>t.ticket),...over});
 return {f,src,clear,assign,maps,people,b,base,preview,send,auth,services,code:fn=>code=fn,expire:()=>clock+=1000000};
}
test('date roster and review do not send; separate audiences; incomplete IDs and duplicate numbers excluded',async()=>{
 const x=setup();delete x.clear.id2;x.src.entries.push({...x.src.entries[0],id:'unmapped',sourceName:'미연결'});
 x.people.id1.recipients[1].phone=x.people.id1.recipients[0].phone;x.clear.id1.recipients.father={...x.clear.id1.recipients.mother};
 const p=await x.preview(),q=await x.preview({audience:'student'});assert.equal(p.rows.length,4);assert.equal(p.items.length,2);assert(p.items.every(r=>r.relation==='모'));assert(q.items.every(r=>r.relation==='학생'));assert.equal(x.f.sent.length,0);
 assert(!JSON.stringify(p).includes('0100000'));assert(!p.items.some(i=>i.studentId==='id2'));
 await assert.rejects(x.send(p,p.items,{audience:'student'}),{code:'PREVIEW_EXPIRED'});await assert.rejects(x.send(p,p.items,{confirmed:false}),{code:'INVALID_REQUEST'});
 await x.send(p,[p.items[0]]);assert.equal(x.f.sent.length,1);assert.equal((await x.preview()).items.length,1);assert.equal((await x.preview({audience:'student'})).items.length,2);
});
test('mixed outcome, retry only failed recipient, uncertain and accepted never replay; durable audience-specific history',async()=>{
 const x=setup(4),codes=['4000','5000','3014','2000'];x.code((m,n)=>codes[n-1]||'4000');const p=await x.preview();await x.send(p);
 const states=(await x.b.batchRoster('',x.base)).rows.map(r=>r.state);assert.deepEqual(states,['sent','unsent','pending','pending']);
 const q=await x.preview();assert.deepEqual(q.items.map(r=>[r.studentId,r.retry]),[['id2',true]]);
 await Promise.allSettled([x.send(q),x.send(q)]);assert.equal(x.f.sent.length,5);assert.equal((await x.preview()).items.length,0);
 const history=await x.b.batchHistory('',x.base);assert.equal(history.results.length,5);assert(history.results.some(r=>r.state==='FAILED'));assert(history.results.every(r=>r.batch&&r.text&&r.masked));assert.equal((await x.b.batchHistory('',{...x.base,audience:'student'})).results.length,0);
});
test('only previously delivered changed numbers qualify; review invalidated by schedule/recipient changes; A → B → A supported',async()=>{
 const x=setup(),a=await x.preview();await x.send(a,[a.items[0]]);
 const entry=x.src.entries[0],old=entry.lesson.end;entry.lesson.end='18:00';entry.fingerprint='new';x.src.revision='v2';
 let p=await x.preview({mode:'changed'});assert.equal(p.items.length,0);assert.equal(p.rows[0].state,'changed');assert.match(p.rows[0].issue,/수업/);
 x.maps.id1.entries[0].fingerprint='new';x.assign[hash(entry.id)].fingerprint='new';p=await x.preview({mode:'changed'});assert.equal(p.items.length,1);
 assert.match(p.items[0].previous,/17:00/);assert.match(p.items[0].text,/18:00/);
 x.clear.id1.recipients.father={allowed:true,phoneHash:contactHash(x.people.id1.recipients[1].phone)};
 assert((await x.preview()).items.some(r=>r.relation==='부'));assert(!(await x.preview({mode:'changed'})).items.some(r=>r.relation==='부'));
 entry.lesson.end='19:00';await assert.rejects(x.send(p),{code:'BATCH_CHANGED'});assert.equal(x.f.sent.length,1);
 entry.lesson.end='18:00';await x.send(await x.preview({mode:'changed'}));entry.lesson.end=old;const reverted=await x.preview({mode:'changed'});await x.send(reverted);assert.equal(x.f.sent.length,3);
 x.src.entries.shift();const removed=await x.preview({mode:'changed'});assert.equal(removed.items.length,0);assert.equal(removed.rows[0].state,'changed');
});
test('actor, ttl, recipient hash, template and chunk limits checked at commit',async()=>{
 for(const what of ['actor','expire','phone','template','limit','auth']){
  const x=setup(5),p=await x.preview();
  if(what==='actor')x.auth.uid='other';if(what==='expire')x.expire();if(what==='phone')x.people.id1.recipients[0].phone='01000000099';
  if(what==='template')x.f.template.status='PENDING';if(what==='auth')x.auth.active=false;
  await assert.rejects(x.send(p,what==='limit'?p.items:[p.items[0]]));assert.equal(x.f.sent.length,0);
 }
});
test('review covers a full day larger than a single chunk without suppressing siblings or resending completed chunks',async()=>{
 const x=setup(52),same=x.people.id1.recipients[0].phone;x.people.id2.recipients[0].phone=same;x.clear.id2.recipients.mother.phoneHash=contactHash(same);
 const p=await x.preview();assert.equal(p.items.length,52);
 for(let i=0;i<52;i+=4)await x.send(p,p.items.slice(i,i+4));
 await assert.rejects(x.send(p,p.items.slice(0,4)),{code:'BATCH_CHANGED'});assert.equal(x.f.sent.length,52);assert.equal(x.f.sent.filter(m=>m.to===same).length,2);
});

test('one history refresh applies terminal lookup results without sending and rejects mixed audiences',async()=>{
 const x=setup(2);x.code(()=> '2000');const p=await x.preview();const {results}=await x.send(p);
 x.f.deps.provider.lookup=async({key,messageId,groupId})=>({key,messageId,groupId,statusCode:key===results[0].id?'4000':'5000'});
 const args={...x.base,ids:results.map(r=>r.id)};await assert.rejects(x.b.batchRefresh('',{...args,audience:'student'}),{code:'FORBIDDEN'});
 await x.b.batchRefresh('',args);const h=await x.b.batchHistory('',args);assert.deepEqual(h.results.map(r=>r.state).sort(),['DELIVERED','FAILED']);assert.equal(x.f.sent.length,2);
});
test('staff review compares the last delivery even when contact is held, and never issues tickets',async()=>{
 const x=setup(1);await x.send(await x.preview());
 x.src.entries[0].lesson.end='18:00';delete x.clear.id1;
 Object.assign(x.auth,{role:'STAFF',canSendTimetable:false});
 const p=await x.preview({mode:'changed'});
 assert.equal(p.readOnly,true);assert.deepEqual(p.items,[]);assert(!p.previewId);
 assert.equal(p.changes.length,1);assert.match(p.changes[0].issue,/번호/);
 assert.match(p.changes[0].current,/18:00/);assert.match(p.changes[0].comparisons[0].previous,/17:00/);
 assert(!JSON.stringify(p).includes('0100000'));
 assert.deepEqual((await x.preview({mode:'changed',audience:'student'})).changes,[]);
 assert.deepEqual((await x.preview()).eligibleStudents,[]);await assert.rejects(x.send(p),{code:'FORBIDDEN'});
});
test('staff unsent preview matches admin eligibility per audience without saving or disclosing delivery tickets',async()=>{
 const x=setup(3);delete x.clear.id2;delete x.clear.id3.recipients.student;
 x.clear.id1.recipients.father={allowed:true,phoneHash:contactHash(x.people.id1.recipients[1].phone)};
 const admin=await x.preview();
 Object.assign(x.auth,{role:'DESK',canSendTimetable:false});
 x.f.deps.store.savePreview=()=>{throw Error('STAFF_TICKET_WRITE');};
 for(const [audience,counts,held] of [['student',[1],2],['guardian',[2,1],1]]){
  const p=await x.preview({audience});
  assert(p.readOnly);assert(!p.previewId);assert.deepEqual(p.items,[]);
  assert.deepEqual(p.eligibleStudents.map(r=>r.count),counts);assert.equal(p.rows.filter(r=>r.issue).length,held);
  assert(!/0100000|"ticket"/.test(JSON.stringify(p)));assert(p.eligibleStudents.every(r=>r.text));
 }
 await assert.rejects(x.send(admin),{code:'FORBIDDEN'});assert.equal(x.f.sent.length,0);
});
test('lesson comparison ignores numbering, highlights changed fields, separates ambiguous and removed lessons',()=>{
 require('../assets/alimtalk-batch-ui');
 const diff=globalThis.TimetableBatchUI.lessonChanges;
 const block=(n,s,time,room='1강의실')=>n+' '+s+' '+time+'\n가상T · 개별 1시간\n본관 '+room;
 const body=blocks=>'[수업 안내: 과목·시간·강사·관·강의실]\n'+blocks.join('\n\n')+'\n\n수업 일정에 관한 변경 문의';
 const math=block('①','수학 정규','10:00–12:00'),sci=block('②','과학 보충','14:00–15:00');
 const changes=diff(body([math,sci]),body([sci.replace('②','①'),block('②','수학 정규','11:00–12:00','2강의실'),block('③','영어 오늘만','17:00–18:00')]));
 assert.equal(changes.length,2);assert.equal(changes[0].before.time,'10:00–12:00');assert.equal(changes[0].after.room,'본관 2강의실');assert(!changes[1].before);
 assert.equal(diff(body([sci]),body([]))[0].after,undefined);assert.equal(diff('이전 양식',body([])),null);
});

test('authorized staff operate both audiences and histories; revoked access cannot refresh or send',async()=>{
 for(const role of ['STAFF','DESK']){
  const x=setup(1);Object.assign(x.auth,{role,canSendTimetable:true});
  for(const audience of ['guardian','student']){
   const p=await x.preview({audience});assert(p.previewId);assert.equal(p.items.length,1);
   assert.equal((await x.b.batchHistory('',{...x.base,audience})).results.length,0);
   const sent=await x.send(p);assert.equal(sent.results.length,1);
   const history=await x.b.batchHistory('',{...x.base,audience});assert.equal(history.results.length,1);assert(!JSON.stringify(history).includes('0100000'));
   await x.b.batchRefresh('',{...x.base,audience,ids:history.results.map(r=>r.id)});
  }
  x.auth.active=false;
  await assert.rejects(x.b.batchHistory('',x.base),{code:'FORBIDDEN'});
  await assert.rejects(x.b.batchRefresh('',{...x.base,ids:[]}),{code:'FORBIDDEN'});
 }
});
test('a fully cancelled verified day has no initial recipient; earlier delivery remains visible to change review',async()=>{
 const x=setup(1),prior=await x.preview();await x.send(prior);x.src.entries[0].lesson.status='결석예고';
 const student=await x.preview({audience:'student'});assert.deepEqual(student.rows,[]);assert.deepEqual(student.items,[]);
 const changes=await x.preview({mode:'changed'});assert.equal(changes.rows[0].state,'changed');assert.match(changes.rows[0].issue,/결석예고/);assert.equal(changes.items.length,0);
});

test('a confirmed SMS at the corrected number counts as delivered and retains the original failure',async()=>{
 const x=setup(1), audience='student', input={...x.base,audience};
 const plan=await x.preview({audience});
 const id='id1', phone=x.people[id].recipients.find(r=>r.id==='student').phone;
 const version=hash(['banpo',input.date,id,plan.items[0].text]);
 const original={id:'original',academyId:'banpo',date:input.date,studentId:id,version,kind:'student-daily-lessons',phone:'01000009999',
  state:'FAILED',errorCode:'3104',relation:'학생',createdAt:1};
 x.f.records.set(original.id,original);
 x.f.records.set('retry',{...original,id:'retry',phone,state:'DELIVERED',errorCode:null,channel:'LMS',originalDeliveryId:'original',createdAt:2,updatedAt:3});
 const {results}=await x.b.batchHistory('',input);
 assert.deepEqual(results.map(r=>[r.originalDeliveryId,r.masked.slice(-4),r.state]),[['original',phone.slice(-4),'DELIVERED'],[null,'9999','FAILED']]);
 assert.equal(require('../assets/alimtalk-contract').historyLabel(results[0]),'문자 수신 완료');
 assert.equal((await x.preview({audience})).items.length,0);
 assert.equal((await x.b.batchHistory('',x.base)).results.length,0);
 assert.equal(x.f.sent.length,0);
});
