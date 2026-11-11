'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLinkResolver}=require('../snapshot-functions/alimtalk-links');
const {firestoreReviewStore}=require('../snapshot-functions/alimtalk-review-store');
const {hash}=require('../snapshot-functions/alimtalk-service');
const {verifiedStudentDay}=require('../snapshot-functions/alimtalk-verified-day');
const {withStudentDirectory}=require('../snapshot-functions/alimtalk-students');
global.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};
function memoryDb(){const data=new Map();let chain=Promise.resolve();const snap=(path)=>({id:path.split('/').at(-1),data:()=>structuredClone(data.get(path))});const doc=path=>({path,id:path.split('/').at(-1),get:async()=>snap(path)});const query=(c,filters=[],limit=Infinity)=>({doc:id=>doc(c+'/'+id),where:(key,op,value)=>query(c,[...filters,[key,value]],limit),limit:n=>query(c,filters,n),get:async()=>{const docs=[...data.keys()].filter(k=>k.startsWith(c+'/')&&filters.every(([key,v])=>data.get(k)[key]===v)).slice(0,limit).map(snap);return {docs,size:docs.length};}});return {data,collection:c=>query(c),runTransaction:fn=>{const run=chain.then(async()=>{const writes=[];const out=await fn({get:r=>r.get(),set:(r,v)=>writes.push([r.path,v]),create:(r,v)=>{assert(!data.has(r.path));writes.push([r.path,v]);}});writes.forEach(([k,v])=>data.set(k,structuredClone(v)));return out;});chain=run.catch(()=>{});return run;}};}
async function setup(){const db=memoryDb(),store=firestoreReviewStore(db),actor={uid:'staff',academyId:'banpo'},student={id:'s1',name:'가학생',school:'가상중',grade:'2',identityRevision:'identity-1',recipients:[{id:'mother',relation:'모',verified:true,phone:'01000000001'},{id:'student',relation:'학생',verified:true,phone:'01000000002'}]};let candidates=['s1'];const source={academyId:'banpo',date:'2026-11-08',complete:true,revision:'v2',capturedAt:200,entries:[{id:'new-cell',fingerprint:'new-fp',sourceName:'가학생',sourceSchool:'가상중2',lesson:{status:'정규'}}]};await store.saveMapping({academyId:'banpo',date:'2026-11-07',studentId:'s1',revision:'human-proof',verifiedBy:'staff',verifiedAt:100,identityRevision:student.identityRevision,entries:[{id:'old-cell',fingerprint:'old-fp'}]},null);const resolveStudent=async()=>structuredClone(student);const link=createLinkResolver({store,resolveStudent,findCandidates:async()=>candidates,now:()=>200});return {db,store,actor,student,source,link,resolveStudent,candidates:x=>candidates=x};}
test('confirmed legacy identity survives new dates and class changes without daily confirmation',async()=>{const x=await setup();const s=await x.link(x.actor,x.source);assert.deepEqual(s.linkIssues,{});assert.deepEqual(s.linkedStudentIds,['s1']);const proof=await x.store.rememberedMapping('banpo','s1');assert.equal(proof.date,'identity');assert.equal(proof.verifiedBy,'staff');const m=await x.store.mapping('banpo',s.date,'s1');assert(m.reusedIdentity);assert.equal(m.entries[0].id,'new-cell');const day=await verifiedStudentDay({actor:x.actor,date:s.date,id:'s1',allowUnchangedCells:true,loadSource:async()=>s,resolveStudent:x.resolveStudent,reviewStore:x.store});assert.equal(day.students[0].mappingVerified,true);const size=x.db.data.size;await Promise.all([x.link(x.actor,x.source),x.link(x.actor,x.source)]);assert.equal(x.db.data.size,size);x.source.entries[0].fingerprint='changed-time';x.source.capturedAt=201;await x.link(x.actor,x.source);assert.equal((await x.store.mapping('banpo',s.date,'s1')).entries[0].fingerprint,'changed-time');assert.equal((await x.store.rememberedMapping('banpo','s1')).revision,'human-proof');});
test('directory contacts are refreshed per preview and never copied into the reusable identity',async()=>{const x=await setup();const s=await x.link(x.actor,x.source);const loadMappedDay=()=>verifiedStudentDay({actor:x.actor,date:s.date,id:'s1',allowUnchangedCells:true,loadSource:async()=>s,resolveStudent:x.resolveStudent,reviewStore:x.store});const loader=audience=>withStudentDirectory({loadMappedDay,resolveStudent:x.resolveStudent,readClearance:async()=>null,audience});const before=await loader('student')(x.actor,s.date,['s1']);x.student.recipients[1].phone='01000000003';const after=await loader('student')(x.actor,s.date,['s1']);assert.equal(after.students[0].recipients[0].phone,'01000000003');assert.notEqual(after.students[0].mappingRevision,before.students[0].mappingRevision);assert.equal((await loader('guardian')(x.actor,s.date,['s1'])).students[0].recipients[0].phone,'01000000001');assert(!JSON.stringify(await x.store.rememberedMapping('banpo','s1')).includes('010'));x.student.recipients[1]={id:'student',verified:false,reason:'번호 없음'};const no=await loader('student')(x.actor,s.date,['s1']);assert.equal(no.students[0].recipientIssue,'본인 번호 없음 · 학부모만 안내');});
test('new, duplicate and changed identities stay held even if old date mapping exists',async()=>{for(const scenario of ['new','duplicate','school','identity','canonical']){const x=await setup();if(scenario==='new')x.db.data.clear();if(scenario==='duplicate')x.candidates(['s1','s2']);if(scenario==='school')x.source.entries[0].sourceSchool='다른중2';if(scenario==='identity')x.student.identityRevision='changed';if(scenario==='canonical')x.student.id='s2';const s=await x.link(x.actor,x.source);assert(s.linkIssues['가학생'],scenario);assert.deepEqual(s.linkedStudentIds,[]);assert.equal(await x.store.mapping('banpo',s.date,'s1'),null);}});
test('stale source and conflicting cell ownership cannot overwrite a verified mapping',async()=>{const x=await setup();await x.link(x.actor,x.source);x.source.capturedAt=199;x.source.entries[0].fingerprint='stale';await assert.rejects(x.link(x.actor,x.source),{code:'SOURCE_CHANGED'});assert.equal((await x.store.mapping('banpo',x.source.date,'s1')).entries[0].fingerprint,'new-fp');const y=await setup();await y.store.saveMapping({academyId:'banpo',date:y.source.date,studentId:'s2',revision:'conflicting',entries:[{id:'new-cell',fingerprint:'x'}]},null);assert.match((await y.link(y.actor,y.source)).linkIssues['가학생'],/학생 연결 확인 필요/);assert.equal((await y.store.dayAssignments('banpo',y.source.date))[hash('new-cell')].studentId,'s2');});

test('operator-confirmed academic label is scoped to this identity and exact source label',async()=>{
  const x=await setup();
  const entry=x.source.entries[0];
  entry.sourceSchool='홈스쿨2';
  assert.ok((await x.link(x.actor,x.source)).linkIssues[x.student.name]);
  const review=require('../snapshot-functions/alimtalk-review').createReviewService({
    authorize:async()=>({...x.actor,role:'STAFF',active:true,canSendTimetable:true}),
    loadSource:async()=>x.source, searchStudents:async()=>[{...x.student,status:'ACTIVE'}],
    resolveStudent:x.resolveStudent, store:x.store
  });
  await review.saveMapping('',{date:x.source.date,studentId:x.student.id,sourceRevision:x.source.revision,
    entryIds:[entry.id],confirmed:true,confirmSchoolAlias:true});
  const src=await x.link(x.actor,x.source);
  assert.deepEqual(src.linkIssues,{});
  await verifiedStudentDay({actor:x.actor,date:src.date,id:x.student.id,loadSource:async()=>src,resolveStudent:x.resolveStudent,reviewStore:x.store});
  entry.sourceSchool='홈스쿨3';
  assert.ok((await x.link(x.actor,x.source)).linkIssues[x.student.name]);
});
test('all-absence update refreshes an existing day only, and later reinstatement reuses the identity',async()=>{
 const x=await setup(),e=x.source.entries[0];e.lesson.status='결석예고';await x.link(x.actor,x.source);
 assert.equal(await x.store.mapping('banpo',x.source.date,x.student.id),null);
 e.lesson.status='정규';await x.link(x.actor,x.source);
 e.lesson.status='결석예고';e.fingerprint='absent';await x.link(x.actor,x.source);
 assert.equal((await x.store.mapping('banpo',x.source.date,x.student.id)).entries[0].fingerprint,'absent');
 e.lesson.status='정규';e.fingerprint='back';await x.link(x.actor,x.source);
 assert.equal((await x.store.mapping('banpo',x.source.date,x.student.id)).entries[0].fingerprint,'back');
});

async function movedStudents(){
 const db=memoryDb(),store=firestoreReviewStore(db),actor={uid:'staff',academyId:'banpo'},date='2026-11-12';
 const students=['a','b','c'].map((id,i)=>({id,name:['가학생','나학생','다학생'][i],school:'가상중',grade:'2',identityRevision:'identity-'+id}));
 for(const [i,s] of students.entries())await store.saveMapping({academyId:'banpo',date,studentId:s.id,revision:'old-'+s.id,verifiedBy:'staff',verifiedAt:100,identityRevision:s.identityRevision,sourceRevision:'old',sourceCapturedAt:100,entries:[{id:'cell-'+i,fingerprint:'old-fp-'+s.id}]},null);
 const source={academyId:'banpo',date,complete:true,revision:'new',capturedAt:200,entries:students.map((s,i)=>({id:'cell-'+(i+1),fingerprint:'new-fp-'+s.id,sourceName:s.name,sourceSchool:'가상중2',lesson:{status:'정규'}}))};
 const resolveStudent=async id=>students.find(s=>s.id===id);
 const link=createLinkResolver({store,resolveStudent,findCandidates:async name=>students.filter(s=>s.name===name).map(s=>s.id),now:()=>200});
 return {db,store,actor,source,students,resolveStudent,link};
}
test('room moves release vacated positions atomically across verified students and keep all current lessons',async()=>{
 const x=await movedStudents(),src=await x.link(x.actor,x.source);
 assert.deepEqual(src.linkIssues,{});assert.equal(src.linkedStudentIds.length,3);
 const assignments=await x.store.dayAssignments('banpo',src.date);assert.equal(assignments[hash('cell-0')],undefined);
 for(const s of x.students){const day=await verifiedStudentDay({actor:x.actor,date:src.date,id:s.id,allowUnchangedCells:true,loadSource:async()=>src,resolveStudent:x.resolveStudent,reviewStore:x.store});assert.equal(day.students[0].lessons.length,1);}
 // Idempotent reads and older source revisions cannot reverse the move.
 await x.link(x.actor,x.source);
 await assert.rejects(x.link(x.actor,{...x.source,capturedAt:150}),{code:'SOURCE_CHANGED'});
});
test('a broken identity in a relocation chain keeps dependent students held without stealing positions',async()=>{
 const x=await movedStudents();x.students[2].identityRevision='changed';
 const src=await x.link(x.actor,x.source);assert.equal(src.linkedStudentIds.length,0);assert.equal(Object.keys(src.linkIssues).length,3);
 const assignments=await x.store.dayAssignments('banpo',src.date);assert.equal(assignments[hash('cell-1')].studentId,'b');assert.equal(assignments[hash('cell-2')].studentId,'c');
});
test('same-fingerprint ownership conflict is not treated as a room move',async()=>{
 const x=await movedStudents();x.source.entries[0].fingerprint='old-fp-b';
 const src=await x.link(x.actor,x.source);assert(src.linkIssues['가학생']);assert(!src.linkedStudentIds.includes('a'));
});
test('transaction rechecks ownership revision before releasing a vacated position',async()=>{
 const x=await movedStudents();
 const real=x.store.synchronizeMappings;x.store.synchronizeMappings=async(...args)=>{
  const key='timetableStudentMappingDays/'+hash(['banpo',x.source.date,'day']);
  const day=x.db.data.get(key);day.assignments[hash('cell-1')].revision='concurrent-manual-review';
  return real(...args);
 };
 await assert.rejects(x.link(x.actor,x.source),{code:'ENTRY_ALREADY_ASSIGNED'});
 assert.equal((await x.store.mapping('banpo',x.source.date,'a')).revision,'old-a');
});
