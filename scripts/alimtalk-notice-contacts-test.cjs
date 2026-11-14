'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRuntime}=require('../snapshot-functions/alimtalk-runtime');
const R=require('../snapshot-functions/alimtalk-contract');
const {createStudentAdapter,contacts,withStudentDirectory}=require('../snapshot-functions/alimtalk-students');
const {applyNoticeContacts,validRecord}=require('../snapshot-functions/alimtalk-notice-contacts');
function memoryDb(seed){
 const data=new Map(Object.entries(seed));let chain=Promise.resolve();
 const snap=(id,v)=>({id,exists:v!==undefined,data:()=>structuredClone(v)});
 const doc=path=>({id:path.split('/').at(-1),path,get:async()=>snap(path.split('/').at(-1),data.get(path)),create:async v=>{assert(!data.has(path));data.set(path,structuredClone(v));}});
 const query=(c,filters=[],limit=Infinity)=>({doc:id=>doc(c+'/'+id),where:(k,op,v)=>query(c,[...filters,[k,op,v]],limit),limit:n=>query(c,filters,n),get:async()=>{const docs=[...data].filter(([p,v])=>p.startsWith(c+'/')&&filters.every(([k,op,x])=>op==='=='?v[k]===x:op==='array-contains'?(v[k]||[]).includes(x):op==='in'?x.includes(v[k]):false)).slice(0,limit).map(([p,v])=>snap(p.split('/').at(-1),v));return {docs,size:docs.length};}});
 return {data,collection:c=>query(c),runTransaction:fn=>{const p=chain.then(async()=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,v)=>writes.push([r.path,v]),create:(r,v)=>{assert(!data.has(r.path));writes.push([r.path,v]);}});for(const [p,v]of writes)data.set(p,structuredClone(v));return result;});chain=p.catch(()=>{});return p;}};
}
function fixture({guest=false,missing=false}={}){
 let now=Date.parse('2026-11-14T07:00:00Z');const date='2026-11-15',name='가상학생';
 const grid={},owners={};for(let h=8;h<=23;h++){grid[h]=[[]];owners[h]=[[]];}grid[19]=[['특강 한국사 검증T',name+' 가상고3 오늘만']];
 const snapshot={schema:1,date,sheet:'11/15(일)',capturedAt:now,data:{headers:['1강의실'],version:'v1',grid},owners,rooms:{rooms:['1강의실'],rows:[]}};
 const seed={'users/admin':{status:'ACTIVE',role:'ADMIN'},'userAppAccess/admin':{apps:{deskPortal:true,liveTimetable:true}},'intranetStaffScopes/admin':{enabled:true,campusId:'banpo'},'liveTimetableSnapshotJobs/catalog':{sheets:['11/15(일)']}};
 if(!guest)seed['students/s1']={name,school:'가상고',grade:'3',status:'INACTIVE',...(!missing?{studentContact:'01000000001',motherContact:'01000000002'}:{})};
 const db=memoryDb(seed),sent=[];
 const request=async(url,options)=>{
  if(url.includes('/macros/'))return {ok:true,json:async()=>({ok:true,snapshots:[snapshot]})};
  if(options.method==='GET')return {ok:true,json:async()=>({templateId:R.templateId,channelId:R.pfId,name:R.templateName,status:'APPROVED',content:R.content})};
  assert.equal(url,'https://api.solapi.com/messages/v4/send-many/detail');const messages=JSON.parse(options.body).messages;sent.push(...messages);
  return {ok:true,json:async()=>({groupInfo:{groupId:'g'},messageList:messages.map((m,i)=>({messageId:'m'+i,customFields:m.customFields,statusCode:'2000'}))})};
 };
 const handler=createRuntime({db,auth:{verifyIdToken:async()=>({uid:'admin'})},sourceUrl:'https://script.google.com/macros/s/mock/exec',sourceSecret:'x'.repeat(32),apiKey:'test',apiSecret:'test',fallbackFrom:'0212345678',request,now:()=>now});
 const api=async(action,input)=>{let code=200,result;await handler({method:'POST',path:'/',headers:{origin:'https://sedubanpo.github.io',authorization:'Bearer synthetic','content-type':'application/json'},body:{action,input}}, {set(){},status(c){code=c;return this;},json(v){result=v;return this;}});return {code,...result};};
 async function form(){const result=await api('noticeContactOptions',{date,name});assert.equal(result.code,200);const c=result.candidates[0];return {...c,date,name,studentId:c.id,sourceFingerprint:result.sourceFingerprint,temporary:{},confirmed:true};}
 return {db,api,form,date,name,snapshot,sent};
}
test('stopped student: explicitly confirm the day, use registration contacts in both audiences, keep status unchanged',async()=>{
 const f=fixture();let r=await f.api('batchRoster',{date:f.date,audience:'student'});assert(r.rows.every(r=>r.issue));
 const input=await f.form();assert.equal(input.inactive,true);assert(!JSON.stringify(input).includes('01000000001'));
 assert.equal((await f.api('saveNoticeContacts',input)).code,200);
 for(const [audience,phone] of [['student','01000000001'],['guardian','01000000002']]){
  const p=await f.api('batchPreview',{date:f.date,audience,mode:'unsent'});assert.equal(p.items.length,1);assert.equal(p.items[0].studentId,'s1');
  const sent=await f.api('batchSend',{date:f.date,audience,mode:'unsent',previewId:p.previewId,tickets:p.items.map(i=>i.ticket),confirmed:true});assert.equal(sent.code,200);assert.equal(f.sent.at(-1).to,phone);
 }
 assert.equal(f.db.data.get('students/s1').status,'INACTIVE');
});
for(const guest of [false,true])test((guest?'unregistered guest':'stopped student')+': missing phone can be saved per relationship and used in preview',async()=>{
 const f=fixture({guest,missing:true}),input=await f.form();input.temporary={student:'010-0000-0003',mother:'01000000004'};
 const saved=await f.api('saveNoticeContacts',input);assert.equal(saved.code,200);
 for(const audience of ['student','guardian']){const p=await f.api('batchPreview',{date:f.date,audience,mode:'unsent'});assert.equal(p.items.length,1);assert.match(p.items[0].masked,audience==='student'?/0003$/:/0004$/);}
 const form=await f.form();assert(form.choices.find(c=>c.id==='student').temporary);assert(!JSON.stringify(form).includes('01000000003'));
 const records=[...f.db.data].filter(([k])=>k.startsWith('timetableAlimtalkReviewHistory/'));assert(records.length);assert(!JSON.stringify(records).includes('01000000003'));
 if(guest)assert(![...f.db.data.keys()].some(k=>k.startsWith('students/')));
 assert.equal(f.sent.length,0);
});
test('temporary phone modification invalidates previous batch tickets before provider send',async()=>{
 const f=fixture({missing:true});let input=await f.form();input.temporary={student:'01000000003'};assert.equal((await f.api('saveNoticeContacts',input)).code,200);
 const p=await f.api('batchPreview',{date:f.date,audience:'student',mode:'unsent'});
 input=await f.form();input.temporary={student:'01000000005'};assert.equal((await f.api('saveNoticeContacts',input)).code,200);
 const result=await f.api('batchSend',{date:f.date,audience:'student',mode:'unsent',previewId:p.previewId,tickets:p.items.map(i=>i.ticket),confirmed:true});assert.notEqual(result.code,200);assert.equal(f.sent.length,0);
});
test('unknown relationship, bad phone, missing confirmation and overriding registration phone rejected',async()=>{
 for(const patch of [{temporary:{student:'010999'}},{temporary:{other:'01000000003'}},{confirmed:false},{temporary:{student:'01000000003'}}]){
  const f=fixture(),input=await f.form();Object.assign(input,patch);const r=await f.api('saveNoticeContacts',input);assert.notEqual(r.code,200);assert.equal(f.sent.length,0);assert(![...f.db.data.keys()].some(k=>k.startsWith('timetableNoticeContacts/')));
 }
});
test('source, contact, identity and concurrent changes fail before saving',async()=>{
 for(const kind of ['source','phone','identity','concurrent']){
  const f=fixture(),input=await f.form();
  if(kind==='source')f.snapshot.data.grid[20]=[['특강 한국사 검증T',f.name+' 가상고3 오늘만']];
  if(kind==='phone')f.db.data.get('students/s1').motherContact='01000000009';
  if(kind==='identity')f.db.data.get('students/s1').school='다른고';
  if(kind==='concurrent')assert.equal((await f.api('saveNoticeContacts',input)).code,200);
  assert.notEqual((await f.api('saveNoticeContacts',input)).code,200,kind);
 }
});
test('lesson memo holds stay held after contacts are saved',async()=>{
 const f=fixture();f.snapshot.data.grid[19][0][1]+=' 19:30-21:30 수업';const input=await f.form();assert.equal((await f.api('saveNoticeContacts',input)).code,200);
 const p=await f.api('batchPreview',{date:f.date,audience:'student',mode:'unsent'});assert.equal(p.items.length,0);assert(p.rows.some(r=>r.issue.includes('시간 메모')));
});
test('same-name candidates require explicit identity and cannot use mismatching school',async()=>{
 const f=fixture();f.db.data.set('students/s2',{name:f.name,school:'다른고',grade:'3',status:'INACTIVE',studentContact:'01000000008'});
 const opts=await f.api('noticeContactOptions',{date:f.date,name:f.name});assert.equal(opts.candidates.length,2);assert.equal(opts.candidates.filter(c=>c.matches).length,1);
 const input=await f.form();input.studentId='s2';assert.equal((await f.api('saveNoticeContacts',input)).code,'STUDENT_SCHOOL_MISMATCH');
});
test('registration contact has priority; date/identity mismatch never grants temporary attendance',async()=>{
 const student={id:'s',identityRevision:'i',registrationInactive:true,recipients:contacts({studentContact:'01000000001'})},actor={academyId:'banpo'},date='2026-11-15';
 const record={academyId:'banpo',date,studentId:'s',identityRevision:'i',checkedBy:'a',checkedAt:1,confirmed:true,revision:'r',recipients:{student:{phone:'01000000002'}}};
 assert.equal(applyNoticeContacts(student,record).recipients[0].phone,'01000000001');assert(validRecord(record,actor,date,student));assert(!validRecord(record,actor,'2026-11-16',student));assert(!validRecord(record,actor,date,{...student,identityRevision:'changed'}));
 const load=withStudentDirectory({loadMappedDay:async()=>({students:[{id:'s',mappingVerified:true,mappingRevision:'m'}]}),resolveStudent:async()=>student,readClearance:async()=>null,readNoticeContacts:async()=>record});
 assert((await load(actor,'2026-11-16',['s'])).students[0].holdReasons.includes('TEMPORARY_ATTENDANCE_REQUIRED'));
});
test('teacher, disabled, deleted and wrong campus cannot use temporary contacts',async()=>{
 const f=fixture();f.db.data.get('users/admin').role='TEACHER';assert.equal((await f.api('noticeContactOptions',{date:f.date,name:f.name})).code,'FORBIDDEN');
 for(const patch of [{disabled:true},{isDeleted:true},{campusId:'other'},{status:'UNKNOWN'}]){const resolve=createStudentAdapter({allowInactiveNotices:true,readStudent:async()=>({name:'가상',status:'INACTIVE',...patch}),findMappings:async()=>[]});await assert.rejects(resolve('s'),{code:'STUDENT_NOT_ACTIVE'});}
});
test('removing the last temporary number holds the student and invalidates prepared tickets',async()=>{
 const f=fixture({missing:true});let input=await f.form();input.temporary={student:'01000000003'};assert.equal((await f.api('saveNoticeContacts',input)).code,200);
 const prepared=await f.api('batchPreview',{date:f.date,audience:'student',mode:'unsent'});
 input=await f.form();input.temporary={};assert.equal((await f.api('saveNoticeContacts',input)).code,200);
 const preview=await f.api('batchPreview',{date:f.date,audience:'student',mode:'unsent'});assert.equal(preview.items.length,0);
 const send=await f.api('batchSend',{date:f.date,audience:'student',mode:'unsent',previewId:prepared.previewId,tickets:prepared.items.map(i=>i.ticket),confirmed:true});assert.notEqual(send.code,200);assert.equal(f.sent.length,0);
});
test('inactive flags change identity proof even when status remains ACTIVE',async()=>{
 const doc={name:'가상학생',status:'ACTIVE',school:'가상고',grade:'3'};
 const resolve=createStudentAdapter({allowInactiveNotices:true,readStudent:async()=>doc,findMappings:async()=>[]});
 const active=await resolve('s');doc.isActive=false;const inactive=await resolve('s');assert(inactive.registrationInactive);assert.notEqual(active.identityRevision,inactive.identityRevision);
});
test('same-name stopped and active records remain selectable and an explicit daily choice prepares only that student',async()=>{
 const f=fixture();f.db.data.set('students/s2',{name:f.name,school:'가상고',grade:'3',status:'ACTIVE',studentContact:'01000000008'});
 const opts=await f.api('noticeContactOptions',{date:f.date,name:f.name});assert.equal(opts.candidates.filter(c=>c.matches).length,2);
 const input=await f.form();assert.equal((await f.api('saveNoticeContacts',input)).code,200);
 const p=await f.api('batchPreview',{date:f.date,audience:'student',mode:'unsent'});assert.equal(p.items.length,1);assert.equal(p.items[0].studentId,'s1');
});
test('deleted or foreign-campus registry entries cannot be bypassed by creating a guest',async()=>{
 for(const patch of [{isDeleted:true},{disabled:true},{campusId:'other'}]){const f=fixture();Object.assign(f.db.data.get('students/s1'),patch);const r=await f.api('noticeContactOptions',{date:f.date,name:f.name});assert.notEqual(r.code,200);assert(!r.candidates);}
});
