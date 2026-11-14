'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./alimtalk-fixture.cjs'),{createBatch}=require('../snapshot-functions/alimtalk-batch');
const {createService,hash}=require('../snapshot-functions/alimtalk-service');
const {contactHash}=require('../snapshot-functions/alimtalk-students');
function setup(count=3,options={}){
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
 const b=createBatch({...deps,store,provider,now,services,...options,loadSource:async()=>src,resolveStudent:async id=>people[id],
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
  const x=setup(41),p=await x.preview();
  if(what==='actor')x.auth.uid='other';if(what==='expire')x.expire();if(what==='phone')x.people.id1.recipients[0].phone='01000000099';
  if(what==='template')x.f.template.status='PENDING';if(what==='auth')x.auth.active=false;
  await assert.rejects(x.send(p,what==='limit'?p.items:[p.items[0]]));assert.equal(x.f.sent.length,0);
 }
});
test('review covers a full day larger than a single chunk without suppressing siblings or resending completed chunks',async()=>{
 const x=setup(52),same=x.people.id1.recipients[0].phone;x.people.id2.recipients[0].phone=same;x.clear.id2.recipients.mother.phoneHash=contactHash(same);
 const p=await x.preview();assert.equal(p.items.length,52);
 for(let i=0;i<52;i+=40)await x.send(p,p.items.slice(i,i+40));
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
 const {rows}=await x.b.batchRoster('',x.base);
 assert.equal(rows[0].current,p.changes[0].current);assert.deepEqual(rows[0].comparisons,p.changes[0].comparisons);
 assert(!JSON.stringify(rows).includes('0100000'));
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

test('forty-recipient request preserves atomic claims, bounded reads and eight-worker concurrency',async()=>{
 const x=setup(41),p=await x.preview();assert.equal(p.batchSize,40);
 await assert.rejects(x.send(p),{code:'INVALID_REQUEST'});assert.equal(x.f.sent.length,0);
 const history=x.f.deps.store.history,reads=[];x.f.deps.store.history=async(a,d,ids)=>{reads.push(ids.length);assert(ids.length<=10);return history(a,d,ids);};
 const sendOne=x.f.deps.provider.sendOne;let active=0,peak=0;
 x.f.deps.provider.sendOne=async(...args)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));try{return await sendOne(...args);}finally{active--;}};
 await x.send(p,p.items.slice(0,40));assert.equal(x.f.sent.length,40);assert.equal(peak,8);assert.deepEqual(reads,[10,10,10,10]);
 await assert.rejects(x.send(p,p.items.slice(0,40)),{code:'BATCH_CHANGED'});assert.equal(x.f.sent.length,40);
 await Promise.allSettled([x.send(p,p.items.slice(40)),x.send(p,p.items.slice(40))]);assert.equal(x.f.sent.length,41);
});
test('changed last recipient rejects the entire forty-person plan before dispatch',async()=>{
 const x=setup(40),p=await x.preview();x.people.id40.recipients[0].phone='01000009999';
 await assert.rejects(x.send(p),{code:'BATCH_CHANGED'});assert.equal(x.f.sent.length,0);
});
test('queue stops taking new recipients on deadline or unexpected dispatch failure',async()=>{
 for(const failure of ['deadline','error']){
  let elapsed=0,calls=0;const x=setup(40,{wallNow:()=>elapsed}),p=await x.preview();
  x.services.guardian.dispatch=async()=>{calls++;await new Promise(r=>setImmediate(r));if(failure==='error')throw Error('offline failure');elapsed=81000;return {id:'fake',state:'ACCEPTED'};};
  await assert.rejects(x.send(p),{code:'RESULT_UNCERTAIN'});assert.equal(calls,8);
 }
});

test('history repairs missing receipts once per minute and batch refresh no longer skips ID-less records',async()=>{
 const x=setup(1),id='d'.repeat(64);let reads=0;
 const r={id,academyId:'banpo',date:x.base.date,kind:'daily-lessons',studentId:'id1',phone:x.people.id1.recipients[0].phone,relation:'모',createdAt:1,state:'UNKNOWN',errorCode:'RESULT_UNCERTAIN',messageId:null,groupId:null};
 await x.f.deps.store.claim(id,r);x.f.deps.provider.lookup=async input=>{reads++;assert.equal(input.phone,r.phone);assert.equal(input.createdAt,1);return null;};
 let h=await x.b.batchHistory('',x.base);assert.equal(reads,1);assert.equal(h.results[0].trackingIssue,'RECEIPT_NOT_FOUND');assert.equal(h.results[0].state,'UNKNOWN');
 await x.b.batchHistory('',x.base);assert.equal(reads,1);
 x.f.deps.provider.lookup=async input=>{reads++;return {key:input.key,messageId:'found',groupId:'group',statusCode:'4000'};};
 await x.b.batchRefresh('',{...x.base,ids:[id]});h=await x.b.batchHistory('',x.base);assert.equal(reads,2);assert.equal(h.results[0].state,'DELIVERED');assert.equal(h.results[0].trackingMissing,false);assert.equal(x.f.sent.length,0);
});

test('scoped preparation and roster only resolve the requested student; foreign tickets and uncertain recipients remain blocked',async()=>{
 const x=setup(3),p=await x.preview({audience:'student',studentIds:['id2']});
 assert.deepEqual(p.rows.map(r=>r.studentId),['id2']);assert.deepEqual(p.items.map(r=>r.studentId),['id2']);
 const other=await x.preview({audience:'student',studentIds:['id3']});
 await assert.rejects(x.send(p,other.items),{code:'PREVIEW_EXPIRED'});assert.equal(x.f.sent.length,0);
 x.code(()=> '3014');await x.send(p);
 assert.equal((await x.preview({audience:'student',studentIds:['id2']})).items.length,0);
 const roster=await x.b.batchRoster('',{...x.base,audience:'student',studentIds:['id2']});
 assert.deepEqual(roster.rows.map(r=>[r.studentId,r.state]),[['id2','pending']]);assert.equal(x.f.sent.length,1);
 for(const studentIds of [[],['id1','id1'],[''],[null],Array(21).fill('id1')])await assert.rejects(x.preview({studentIds}),{code:'INVALID_REQUEST'});
});

test('operator-confirmed missing receipt preserves the original and permits exactly one scoped new attempt',async()=>{
 const x=setup(2);x.f.deps.provider.sendOne=async m=>{x.f.sent.push(m);throw Object.assign(Error(),{code:'TIMEOUT'});};
 const p=await x.preview({audience:'student',studentIds:['id1']});const sent=await x.send(p),id=sent.results[0].id;
 const input={date:x.base.date,audience:'student',studentId:'id1',id,confirmedNotReceived:true};
 assert.equal((await x.preview({audience:'student',studentIds:['id1']})).items.length,0);
 await assert.rejects(x.b.batchReleaseUnreceived('',input),{code:'RECEIPT_REVIEW_TOO_EARLY'});x.expire();
 for(const bad of [{confirmedNotReceived:false},{audience:'guardian'},{studentId:'id2'}])await assert.rejects(x.b.batchReleaseUnreceived('',{...input,...bad}));
 const original=structuredClone(x.f.records.get(id));
 await Promise.all([x.b.batchReleaseUnreceived('',input),x.b.batchReleaseUnreceived('',input)]);
 const resolved=x.f.records.get(id);assert.equal(resolved.state,'NOT_ACCEPTED');assert.equal(resolved.text,original.text);assert.equal(resolved.recoveryResolution.previousErrorCode,'RESULT_UNCERTAIN');assert.equal(resolved.recoveryResolution.confirmedBy,x.auth.uid);
 assert.equal(x.f.sent.length,1);
 x.f.deps.provider.sendOne=async m=>{x.f.sent.push(m);return {messageId:'retry-message',groupId:'retry-group',statusCode:'4000'};};
 const next=await x.preview({audience:'student',studentIds:['id1']});assert.equal(next.items.length,1);
 await Promise.allSettled([x.send(next),x.send(next)]);assert.equal(x.f.sent.length,2);
 const history=await x.b.batchHistory('',input);assert.equal(history.results.length,2);assert(history.results.some(r=>r.retryOf===id&&r.state==='DELIVERED'));assert(history.results.some(r=>r.id===id&&r.state==='NOT_ACCEPTED'));
 assert.equal((await x.preview({audience:'student',studentIds:['id1']})).items.length,0);
});
test('missing receipt release fails closed on recovered receipts, lookup error or revoked authorization',async()=>{
 for(const mode of ['found','error','auth']){
  const x=setup(1);x.f.deps.provider.sendOne=async()=>{throw Object.assign(Error(),{code:'TIMEOUT'});};
  const result=await x.send(await x.preview());const id=result.results[0].id;x.expire();
  x.f.deps.provider.lookup=async({key})=>{if(mode==='error')throw Error('provider offline');if(mode==='auth'){x.auth.active=false;return null;}return {key,messageId:'recovered',groupId:'group',statusCode:'4000'};};
  await assert.rejects(x.b.batchReleaseUnreceived('',{...x.base,id,studentId:'id1',confirmedNotReceived:true}));
  assert.equal(x.f.records.get(id).state,mode==='found'?'DELIVERED':'UNKNOWN');assert.equal(x.f.sent.length,0);
 }
});
test('a late provider receipt after operator resolution blocks the prepared resend',async()=>{
 const x=setup(1);x.f.deps.provider.sendOne=async()=>{throw Object.assign(Error(),{code:'TIMEOUT'});};
 const r=await x.send(await x.preview()),id=r.results[0].id;x.expire();
 await x.b.batchReleaseUnreceived('',{...x.base,id,studentId:'id1',confirmedNotReceived:true});
 const p=await x.preview();
 x.f.deps.provider.lookup=async({key})=>({key,messageId:'late',groupId:'late-group',statusCode:'4000'});
 await assert.rejects(x.send(p));assert.equal(x.f.records.get(id).state,'DELIVERED');assert.equal(x.f.sent.length,0);
});

test('missing student number takes precedence over time memo; guardian remains a separate review',async()=>{
 const x=setup(1),date='2026-11-14';
 x.maps.id1.date=x.src.date=date;x.clear.id1=null;
 Object.assign(x.people.id1.recipients[2],{verified:false,phone:'',reason:'번호 없음'});
 Object.assign(x.src.entries[0].lesson,{date,timeNoteText:'기존 11-14시 수업이나, 10-13시 구성',reviewReasons:['시간 메모 확인 필요']});
 const roster=audience=>x.b.batchRoster('',{date,audience});
 assert.equal((await roster('student')).rows[0].issue,'본인 번호 없음 · 학부모만 안내');
 assert.equal((await roster('guardian')).rows[0].issue,'시간 메모 확인 필요');
 assert.equal(x.f.sent.length,0);
});

test('recorded arrival keeps the delivered guardian roster current without hiding a student’s unsent notice or a later schedule change',async()=>{
 const x=setup(1);
 await x.send(await x.preview()); // local fake provider
 const {readTimeNote}=require('../snapshot-functions/alimtalk-contract');
 const note=readTimeNote('확정, 지각, 16:13 등원','정규',x.base.date);
 const lesson=x.src.entries[0].lesson;
 lesson.timeRanges=note.ranges;lesson.reviewReasons=note.held?['시간 메모 확인 필요']:[];
 const [parent]= (await x.b.batchRoster('',x.base)).rows;
 assert.equal(parent.state,'sent');assert(!parent.issue);
 assert.deepEqual((await x.preview({mode:'changed'})).items,[]);
 const [student]=(await x.b.batchRoster('',{...x.base,audience:'student'})).rows;
 assert.equal(student.state,'unsent');assert(!student.issue);
 lesson.status='오늘만';
 assert.equal((await x.preview({mode:'changed'})).items.length,1);
});

test('header timing holds exclude the whole student for both audiences while ready students can prepare and send',async()=>{
 for(const audience of ['guardian','student']){
  const x=setup(3);
  x.src.entries[1].lesson.reviewReasons=['강사 메모 확인 필요'];
  x.src.entries[1].lesson.headerNote='15일만 18시까지 수업 가능';
  const p=await x.preview({audience});
  assert.equal(p.items.length,2);assert.deepEqual(p.items.map(r=>r.studentId),['id1','id3']);
  assert.match(p.rows.find(r=>r.studentId==='id2').issue,/강사 메모 확인 필요.*15일만 18시까지/);
  assert.equal(x.f.sent.length,0);
  await x.send(p);assert.equal(x.f.sent.length,2);
 }
});
test('a new teacher timing hold after preview invalidates the send tickets',async()=>{
 const x=setup(1),p=await x.preview();
 x.src.entries[0].lesson.reviewReasons=['강사 메모 확인 필요'];x.src.entries[0].lesson.headerNote='18시까지 수업 가능';
 await assert.rejects(x.send(p),{code:'BATCH_CHANGED'});assert.equal(x.f.sent.length,0);
});


test('saved memo review removes roster hold for both audiences; bulk rechecks actual content and contacts',async()=>{
 const {memoScheduleKey}=require('../snapshot-functions/alimtalk-service'),rules=require('../snapshot-functions/alimtalk-contract');
 const x=setup(1),id='id1',lesson=x.src.entries[0].lesson;
 lesson.reviewReasons=['시간 메모 확인 필요'];lesson.timeNoteText='시간 확인';
 assert.equal((await x.preview()).items.length,0);
 const student={...x.people[id],mappingVerified:true,lessons:[{...lesson,studentId:id}]};
 const c=rules.compose(student,x.base.date,student.lessons);
 await x.f.deps.store.saveMemoReview({academyId:'banpo',date:x.base.date,studentId:id,scheduleKey:memoScheduleKey('banpo',x.base.date,student,c),checkedAt:1,checkedBy:'operator'});
 const p=await x.preview();assert.equal(p.rows[0].issue,'');assert.equal(p.items.length,1);
 lesson.timeNoteText='비고 문구 보완';x.src.revision='unrelated-refresh';
 assert.equal((await x.preview({audience:'student'})).items.length,1);
 lesson.end='18:00';assert.equal((await x.preview()).items.length,0);await assert.rejects(x.send(p),{code:'BATCH_CHANGED'});
 lesson.end='17:00';delete x.clear.id1;assert.equal((await x.preview()).items.length,0);
 assert.equal(x.f.sent.length,0);
});
