'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createRuntime,templateProvider}=require('../snapshot-functions/alimtalk-runtime'),R=require('../snapshot-functions/alimtalk-contract');
global.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};
function memoryDb(seed){const data=new Map(Object.entries(seed));let chain=Promise.resolve();const snap=(id,v)=>({id,exists:v!==undefined,data:()=>structuredClone(v)});const doc=path=>({get:async()=>snap(path.split('/').at(-1),data.get(path)),create:async v=>{assert(!data.has(path));data.set(path,structuredClone(v));},path});
 const query=(c,filters=[],limit=Infinity)=>({doc:id=>doc(c+'/'+id),where:(k,op,v)=>query(c,[...filters,[k,op,v]],limit),limit:n=>query(c,filters,n),get:async()=>{const rows=[...data].filter(([p,v])=>p.startsWith(c+'/')&&filters.every(([k,op,x])=>op==='=='?v[k]===x:op==='array-contains'?(v[k]||[]).includes(x):op==='in'?x.includes(v[k]):false)).slice(0,limit).map(([p,v])=>snap(p.split('/').at(-1),v));return {docs:rows,size:rows.length};}});
 return {collection:c=>query(c),runTransaction:fn=>{const p=chain.then(async()=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,v)=>writes.push([r.path,v]),create:(r,v)=>{assert(!data.has(r.path));writes.push([r.path,v]);}});for(const [p,v]of writes)data.set(p,structuredClone(v));return result;});chain=p.catch(()=>{});return p;}};}
test('assembled HTTP runtime: source → mapping → recorded contact → preview; explicit guardian confirmation; no outbound fallback',async()=>{
 const now=Date.parse('2026-10-28T03:00:00Z'),date='2026-10-28',grid={},owners={};for(let h=8;h<=23;h++){grid[h]=[[]];owners[h]=[[]];}grid[16]=[['1:1 수학 가상T','가학생 가상중2 정규','다른학생 가상중1 정규']];const snapshot={schema:1,date,sheet:'10/28(수)',capturedAt:now,data:{headers:['1강의실'],version:'v1',grid},owners,rooms:{rooms:['1강의실'],rows:[]}};
 const db=memoryDb({'users/admin':{status:'ACTIVE',role:'ADMIN'},'userAppAccess/admin':{apps:{deskPortal:true}},'intranetStaffScopes/admin':{enabled:true,campusId:'banpo'},'liveTimetableSnapshotJobs/catalog':{sheets:['10/28(수)']},'students/s1':{name:'가학생',school:'가상중',grade:'2',fatherContact:'01000000002',studentContact:'01000000003',status:'ACTIVE',motherContact:'01000000001'}}),calls=[];
 const request=async(url,options)=>{calls.push([url,options.method]);if(url==='https://script.google.com/macros/s/mock/exec'&&options.method==='POST')return {ok:true,json:async()=>({ok:true,snapshots:[snapshot]})};if(url==='https://api.solapi.com/kakao/v2/templates/'+R.templateId&&options.method==='GET')return {ok:true,json:async()=>({templateId:R.templateId,channelId:R.pfId,name:R.templateName,status:'APPROVED',content:R.content})};if(url==='https://api.solapi.com/messages/v4/send-many/detail'&&options.method==='POST'){
   const {messages}=JSON.parse(options.body);assert.equal(messages.length,1);assert(['01000000001','01000000003'].includes(messages[0].to));assert.equal(messages[0].kakaoOptions.disableSms,true);
   return {ok:true,json:async()=>({groupInfo:{groupId:'g'},messageList:[{messageId:'m',customFields:messages[0].customFields,statusCode:'2000'}]})};
 }throw Error('UNMOCKED_OUTBOUND');};
 const handler=createRuntime({db,auth:{verifyIdToken:async(t,r)=>{assert.equal(r,true);return {uid:'admin'};}},sourceUrl:'https://script.google.com/macros/s/mock/exec',sourceSecret:'synthetic-source-secret'.repeat(2),apiKey:'synthetic-key',apiSecret:'synthetic-secret',request,now:()=>now});
 async function api(action,input){const res={code:200,set(){return this;},status(c){this.code=c;return this;},json(v){this.body=v;return this;},end(){}};await handler({method:'POST',headers:{origin:'https://sedubanpo.github.io','content-type':'application/json',authorization:'Bearer synthetic'},body:{action,input}},res);return res;}
 const source=(await api('inspect',{date})).body;assert.equal((await api('candidates',{query:'가학생'})).body.candidates[0].id,'s1');
 assert.equal((await api('saveMapping',{date,sourceRevision:source.revision,entryIds:source.entries.filter(e=>e.sourceName==='가학생' || e.label.startsWith('가학생')).map(e=>e.id),studentId:'s1',confirmed:true})).code,200);
 const c=(await api('contactChoices',{date,studentId:'s1'})).body;assert.equal((await api('saveClearance',{...c,date,relations:['mother','student'],campusConfirmed:true,contactConfirmed:true,note:'모의 확인'})).code,200);
 const p=(await api('preview',{date,targets:[{studentId:'s1',recipientIds:['mother']}]})).body;assert.equal(p.counts.messages,1);assert.equal(p.sendEnabled,true);assert.deepEqual(p.rows[0].choices.map(r=>r.id),['mother']);assert(!JSON.stringify(p).includes('01000000001'));
 for(const id of ['student','father']){
  const held=(await api('preview',{date,targets:[{studentId:'s1',recipientIds:[id]}]})).body;
  assert.equal(held.counts.messages,0);assert.equal((await api('send',{previewId:held.previewId})).body.code,'HELD');
 }
 const roster=(await api('batchRoster',{date,audience:'guardian'})).body;
 assert.equal(roster.rows.find(r=>r.studentId==='s1').state,'unsent');assert.equal(roster.rows.find(r=>r.name==='다른학생').studentId,null);
 const bulk=(await api('batchPreview',{date,audience:'guardian',mode:'unsent'})).body;assert.deepEqual(bulk.items.map(i=>i.relation),['모']);
 assert.equal((await api('batchSend',{date,audience:'student',mode:'unsent',previewId:bulk.previewId,tickets:bulk.items.map(i=>i.ticket),confirmed:true})).body.code,'PREVIEW_EXPIRED');
 const studentPlan=async ids=>(await api('studentPreview',{date,targets:[{studentId:'s1',recipientIds:ids}]})).body;
 const studentPreview=await studentPlan(['student']);
 assert.deepEqual(studentPreview.rows[0].choices.map(r=>r.id),['student']);
 assert.equal((await studentPlan(['mother'])).counts.messages,0);
 assert.equal((await api('studentSend',{previewId:p.previewId})).body.code,'PREVIEW_EXPIRED');
 assert(calls.every(([u,m])=>m==='GET'||u.includes('/macros/')));
 for(let i=0;i<2;i++)assert.equal((await api('send',{previewId:p.previewId})).body.results[0].state,'ACCEPTED');
 assert.equal(calls.filter(([u])=>u.includes('/send-many/')).length,1);
 const sent=(await api('studentSend',{previewId:studentPreview.previewId})).body;
 assert.equal(sent.results[0].masked,'010-****-0003');
 assert.equal((await api('studentResults',{date,studentIds:['s1']})).body.results.length,1);
 assert.equal((await api('results',{date,studentIds:['s1']})).body.results.length,1);
});
test('provider hard lock remains even when HTTP handler bypassed',async()=>{let calls=0;const p=templateProvider({apiKey:'synthetic',apiSecret:'synthetic',request:async()=>{calls++;}});await assert.rejects(p.sendOne({}),{code:'SENDING_DISABLED'});assert.equal(calls,0);});
