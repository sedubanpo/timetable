'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
global.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};
const {createStudentAdapter,contacts,withStudentDirectory,firestoreStudentReader,contactHash}=require('../snapshot-functions/alimtalk-students');
const {createService}=require('../snapshot-functions/alimtalk-service');
const {fixture}=require('./alimtalk-fixture.cjs');
function setup(){
  const f=fixture(),id=f.student.id;
  const docs={[id]:{name:'가상학생',status:'ACTIVE',canonicalStudentId:id,motherContact:'010-0000-0001',motherPhone:'01000000001'}};
  const maps=[];
  const resolve=createStudentAdapter({readStudent:async id=>structuredClone(docs[id]||null),findMappings:async id=>structuredClone(maps.filter(m=>m.canonicalStudentId===id||m.aliasStudentIds.includes(id)))});
  f.student.mappingRevision='operator-confirmed-1';
  f.input.targets[0].recipientIds=['mother'];
  let clearance=null;
  const makeClearance=async()=>{const s=await resolve(id);return {academyId:'banpo',studentId:id,date:f.day.date,mappingRevision:f.student.mappingRevision,identityRevision:s.identityRevision,revision:'review-1',checkedBy:'mock-admin',checkedAt:1,campusConfirmed:true,recipients:{mother:{allowed:true,phoneHash:contactHash('01000000001')}}};};
  // Synthetic review record is explicitly seeded; no production auto-approval.
  const readClearance=async()=>{if(clearance===null)clearance=await makeClearance();return clearance;};
  f.deps.loadDay=withStudentDirectory({loadMappedDay:async()=>structuredClone(f.day),resolveStudent:resolve,readClearance});
  return {...f,docs,maps,resolve,service:createService(f.deps)};
}
test('canonical document ID and server contact only; browser/source phone ignored',async()=>{
  const f=setup();f.input.targets[0].phone='01099999999';f.student.recipients[0].phone='01088888888';
  const p=await f.service.preview('',f.input);assert.equal(p.counts.messages,1);assert(!JSON.stringify(p).includes('01000000001'));
  await f.service.send('',{previewId:p.previewId});assert.equal(f.sent[0].to,'01000000001');
});
test('explicit alias resolves, name and studentId field do not override document identity',async()=>{
  const f=setup(),id=f.student.id;f.docs.old={mergedInto:id,isAlias:true};f.docs[id].studentId='different-legacy-field';
  assert.equal((await f.resolve('old')).id,id);assert.equal((await f.resolve(id)).id,id);
  await assert.rejects(f.resolve('가상학생'),{code:'STUDENT_NOT_FOUND'});
});
test('mapping document can resolve missing old ID without roster scan',async()=>{
  const f=setup();f.maps.push({status:'ACTIVE',canonicalStudentId:f.student.id,aliasStudentIds:['legacy']});
  assert.equal((await f.resolve('legacy')).id,f.student.id);
});
test('conflicting representative, cycles, unresolved alias and missing canonical rejected',async()=>{
  for(const mode of ['conflict','cycle','alias','missing']){
    const f=setup(),id=f.student.id;
    if(mode==='conflict')f.docs[id].mergedInto='other';
    if(mode==='cycle'){f.docs[id].canonicalStudentId='other';f.docs.other={canonicalStudentId:id};}
    if(mode==='alias')f.docs[id].isAlias=true;
    if(mode==='missing')f.docs[id].canonicalStudentId='missing';
    await assert.rejects(f.resolve(id));
  }
});
test('unknown or inactive student state never silently active',async()=>{
  for(const patch of [{status:undefined},{status:'PAUSED'},{active:false},{isActive:false}]){
    const f=setup();Object.assign(f.docs[f.student.id],patch);await assert.rejects(f.resolve(f.student.id),{code:'STUDENT_NOT_ACTIVE'});
  }
});
test('contacts preserve explicit relationships and reject conflicts and unknown guardian',()=>{
  const c=contacts({studentContact:'010-0000-0001',studentPhone:'01000000002',motherContact:'01000000003',motherPhone:'01000000003',guardianPhone:'01000000004',guardianOwner:'unknown'});
  assert.equal(c[0].verified,false);assert.equal(c[0].phone,'');assert.equal(c[1].verified,false);assert.equal(c[2].verified,true);assert.equal(c.length,3);
});
test('no recipient default; selected conflicting contact held',async()=>{
  const f=setup();f.input.targets[0].recipientIds=[];assert.equal((await f.service.preview('',f.input)).counts.messages,0);
  f.input.targets[0].recipientIds=['mother'];f.docs[f.student.id].motherPhone='01000000009';
  const p=await f.service.preview('',f.input);assert.equal(p.counts.messages,0);await assert.rejects(f.service.send('',{previewId:p.previewId}),{code:'HELD'});
});
test('phone change after preview requires reconfirmation and sends nothing',async()=>{
  const f=setup(),p=await f.service.preview('',f.input);f.docs[f.student.id].motherPhone=f.docs[f.student.id].motherContact='01000000002';
  assert.equal((await f.service.send('',{previewId:p.previewId})).requiresNewPreview,true);assert.equal(f.sent.length,0);
});
test('merge after preview and fresh alias preview held, cannot bypass history with new ID',async()=>{
  const f=setup(),p=await f.service.preview('',f.input),id=f.student.id;
  f.docs.next={...f.docs[id],canonicalStudentId:'next'};f.docs[id]={isAlias:true,mergedInto:'next'};
  assert.equal((await f.service.send('',{previewId:p.previewId})).changed,true);
  const q=await f.service.preview('',f.input);assert.equal(q.counts.messages,0);assert.equal(f.sent.length,0);
});
test('source mapping ambiguity and unverified mapping hold without guessed identity',async()=>{
  for(const mode of ['unverified','duplicate']){const f=setup();if(mode==='unverified')f.student.mappingVerified=false;else f.day.students.push(structuredClone(f.student));
    const p=await f.service.preview('',f.input);assert.equal(p.counts.messages,0);assert(p.rows[0].reasons.length);}
});
test('aborted reads and missing mock fail closed',async()=>{
  const f=setup(),c=new AbortController();c.abort();await assert.rejects(f.resolve(f.student.id,c.signal),{code:'ABORTED'});
  const r=createStudentAdapter({readStudent:async()=>{throw Error('MISSING_MOCK');},findMappings:async()=>[]});await assert.rejects(r('id'),/MISSING_MOCK/);
});
test('Firestore reader limits mapping queries and rejects overflow',async()=>{
  const calls=[];const db={collection:c=>({doc:id=>({get:async()=>({data:()=>({name:'synthetic'})})}),where:(...w)=>({limit:n=>({get:async()=>{calls.push([c,w,n]);return {size:21,docs:[]};}})})})};
  const r=firestoreStudentReader(db);await assert.rejects(r.findMappings('id'),{code:'IDENTITY_MAPPING_LIMIT'});assert.equal(calls.length,2);assert(calls.every(c=>c[2]===21));
});

test('RETURNED accepted by user policy; deleted and disabled documents rejected',async()=>{
  const f=setup();f.docs[f.student.id].status='RETURNED';assert.equal((await f.resolve(f.student.id)).id,f.student.id);
  for(const patch of [{isDeleted:true},{deletedAt:'synthetic-date'},{disabled:true}]){const g=setup();Object.assign(g.docs[g.student.id],patch);await assert.rejects(g.resolve(g.student.id),{code:'STUDENT_NOT_ACTIVE'});}
});
test('missing contact/campus review never inferred from administrator campus',async()=>{
  const f=setup();f.deps.loadDay=withStudentDirectory({loadMappedDay:async()=>structuredClone(f.day),resolveStudent:f.resolve});
  const p=await createService(f.deps).preview('',f.input);assert.equal(p.counts.messages,0);assert(p.rows[0].reasons.length);
});
test('review scope, identity, mapping, relation, number and revocation checked again before send',async()=>{
  for(const mutate of [r=>r.academyId='other',r=>r.studentId='other',r=>r.date='2026-10-29',r=>r.mappingRevision='old',r=>r.identityRevision='old',r=>r.campusConfirmed=false,r=>r.checkedBy='',r=>r.checkedAt=Infinity,r=>r.recipients.mother.allowed=false,r=>r.recipients.mother.phoneHash='wrong']){
    const f=setup(),s=await f.resolve(f.student.id);
    const review={academyId:'banpo',studentId:s.id,date:f.day.date,mappingRevision:f.student.mappingRevision,identityRevision:s.identityRevision,revision:'r1',checkedBy:'mock-admin',checkedAt:1,campusConfirmed:true,recipients:{mother:{allowed:true,phoneHash:contactHash('01000000001')}}};
    f.deps.loadDay=withStudentDirectory({loadMappedDay:async()=>structuredClone(f.day),resolveStudent:f.resolve,readClearance:async()=>review});
    const service=createService(f.deps),p=await service.preview('',f.input);assert.equal(p.counts.messages,1);mutate(review);
    const result=await service.send('',{previewId:p.previewId});assert.equal(result.requiresNewPreview,true);assert.equal(f.sent.length,0);
  }
});
