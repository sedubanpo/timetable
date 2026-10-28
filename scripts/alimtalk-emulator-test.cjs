'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
// No ambient production credential may enter this test process.
for(const k of ['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_CONFIG','GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT'])delete process.env[k];
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:18829';process.env.GCLOUD_PROJECT='demo-timetable-alimtalk';
const serverRequire=require('node:module').createRequire(require('node:path').resolve('snapshot-functions/package.json'));
const {initializeApp,deleteApp}=serverRequire('firebase-admin/app');
const {getFirestore}=serverRequire('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-timetable-alimtalk'}),db=getFirestore(app);
const {firestoreReviewStore}=require('../snapshot-functions/alimtalk-review-store'),{firestoreStore}=require('../snapshot-functions/alimtalk-store');
const rs=firestoreReviewStore(db),ds=firestoreStore(db),id=()=>crypto.randomUUID();
after(async()=>{await db.terminate();await deleteApp(app);});
test('actual Firestore transaction: concurrent cross-student assignment has one winner, immutable audit',async()=>{
 const e=id(),student=id(),m={academyId:'banpo',date:'2026-10-28',studentId:student,revision:id(),entries:[{id:e,fingerprint:'synthetic'}]};
 const attempts=[m,{...m,studentId:id(),revision:id()}];const r=await Promise.allSettled(attempts.map(x=>rs.saveMapping(x,null)));assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.code,'ENTRY_ALREADY_ASSIGNED');
 const winner=attempts[r.findIndex(x=>x.status==='fulfilled')];const saved=await rs.mapping('banpo',m.date,winner.studentId);assert.equal(saved.revision,winner.revision);
 const c={academyId:'banpo',date:m.date,studentId:winner.studentId,revision:id()};
 const races=await Promise.allSettled([rs.saveClearance(c,null,winner.revision),rs.saveClearance({...c,revision:id()},null,winner.revision)]);assert.equal(races.filter(x=>x.status==='fulfilled').length,1);
 const updated={...winner,revision:id()};await rs.saveMapping(updated,winner.revision);
 const current=await rs.clearance('banpo',m.date,winner.studentId);await assert.rejects(rs.saveClearance({...c,revision:id()},current.revision,winner.revision),{code:'MAPPING_CHANGED'});
 assert((await db.collection('timetableAlimtalkReviewHistory').doc(winner.revision).get()).exists);
});
test('actual persistent dedupe: two callers claim once and fresh adapter recovers same record',async()=>{
 const key=crypto.createHash('sha256').update(id()).digest('hex'),record={id:key,state:'REQUESTING',synthetic:true};
 const r=await Promise.all([ds.claim(key,record),ds.claim(key,record)]);assert.equal(r.filter(x=>x.created).length,1);assert.deepEqual(await firestoreStore(db).get(key),record);
});
test('actual atomic rate limit: only configured number succeeds',async()=>{
 const who=id();const r=await Promise.allSettled(Array.from({length:4},()=>ds.rate(who,'synthetic',1,2)));assert.equal(r.filter(x=>x.status==='fulfilled').length,2);assert(r.filter(x=>x.status==='rejected').every(x=>x.reason.code==='RATE_LIMIT'));
});
