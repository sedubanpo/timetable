'use strict';
const {hash}=require('./alimtalk-service');
const fail=code=>{throw Object.assign(Error(code),{code});};
// Admin SDK only. Transactions preserve ownership of every source occurrence and audit history.
function firestoreReviewStore(db){
 const key=(a,d,s)=>hash([a,d,s]),maps=db.collection('timetableStudentMappings'),days=db.collection('timetableStudentMappingDays'),reviews=db.collection('timetableAlimtalkClearances'),audit=db.collection('timetableAlimtalkReviewHistory');
 const bounded=v=>{if(Buffer.byteLength(JSON.stringify(v))>800000)fail('MAPPING_LIMIT');};
 return {
  async dayAssignments(a,d){return (await days.doc(key(a,d,'day')).get()).data()?.assignments||{};},
  async mapping(a,d,s){return (await maps.doc(key(a,d,s)).get()).data()||null;},
  async clearance(a,d,s){return (await reviews.doc(key(a,d,s)).get()).data()||null;},
  async rememberedMapping(a,id){
   const ref=maps.doc(key(a,'identity',id)),saved=(await ref.get()).data();
   if(saved)return {...saved,proofKey:ref.id||key(a,'identity',id)};
   const records=await maps.where('studentId','==',id).limit(101).get();
   if(records.size>100)fail('IDENTITY_MAPPING_LIMIT');
   const candidates=records.docs.map(d=>({...d.data(),proofKey:d.id})).filter(m=>m.academyId===a&&m.studentId===id&&m.verifiedBy&&m.revision&&m.identityRevision&&Number.isFinite(m.verifiedAt)&&m.entries?.length);
   return candidates.sort((a,b)=>b.verifiedAt-a.verifiedAt)[0]||null;
  },
  async synchronizeMappings(actor,source,plans,at){
   const dayRef=days.doc(key(actor.academyId,source.date,'day'));
   return db.runTransaction(async tx=>{
    const daySnap=await tx.get(dayRef),assignments={...(daySnap.data()?.assignments||{})};
    const rows=await Promise.all(plans.map(async p=>{
     const ref=maps.doc(key(actor.academyId,source.date,p.student.id)),linkRef=maps.doc(key(actor.academyId,'identity',p.student.id));
     const [oldSnap,proofSnap,linkSnap]=await Promise.all([tx.get(ref),tx.get(maps.doc(p.proof.proofKey)),tx.get(linkRef)]);
     const proof=proofSnap.data(),old=oldSnap.data();
     if(linkSnap.data()&&linkSnap.data().revision!==p.proof.revision)fail('MAPPING_CONFLICT');
     if(!proof||proof.revision!==p.proof.revision||proof.identityRevision!==p.student.identityRevision)fail('MAPPING_CONFLICT');
     if(old?.sourceCapturedAt>source.capturedAt)fail('SOURCE_CHANGED');
     const entries=p.entries.map(e=>({id:e.id,fingerprint:e.fingerprint}));
     const unchanged=old?.identityRevision===p.student.identityRevision&&old?.entries?.length===entries.length&&entries.every(e=>old.entries.some(x=>x.id===e.id&&x.fingerprint===e.fingerprint)&&assignments[hash(e.id)]?.studentId===p.student.id&&assignments[hash(e.id)]?.revision===old.revision);
     const value={academyId:actor.academyId,date:source.date,studentId:p.student.id,sourceRevision:source.revision,revision:require('node:crypto').randomUUID(),verifiedBy:proof.verifiedBy,verifiedAt:proof.verifiedAt,identityRevision:p.student.identityRevision,entries,sourceCapturedAt:source.capturedAt,syncedAt:at,syncedBy:actor.uid,reusedIdentity:true};
     return {p,ref,linkRef,old,value,unchanged,link:linkSnap.data()};
    }));
    for(const r of rows)if(!r.unchanged)for(const e of r.old?.entries||[]){if(assignments[hash(e.id)]?.studentId===r.value.studentId)delete assignments[hash(e.id)];}
    for(const r of rows)if(!r.unchanged)for(const e of r.value.entries){const k=hash(e.id);if(assignments[k]&&assignments[k].studentId!==r.value.studentId)fail('ENTRY_ALREADY_ASSIGNED');assignments[k]={studentId:r.value.studentId,fingerprint:e.fingerprint,revision:r.value.revision};}
    const next={academyId:actor.academyId,date:source.date,assignments};bounded(next);
    for(const r of rows){
     if(!r.link)tx.set(r.linkRef,{academyId:actor.academyId,date:'identity',studentId:r.p.student.id,name:r.p.student.name,school:r.p.student.school,grade:r.p.student.grade,identityRevision:r.p.student.identityRevision,revision:r.p.proof.revision,verifiedBy:r.p.proof.verifiedBy,verifiedAt:r.p.proof.verifiedAt});
     if(!r.unchanged){tx.set(r.ref,r.value);tx.create(audit.doc(r.value.revision),{kind:'mapping-auto-refresh',...r.value});}
    }
    if(rows.some(r=>!r.unchanged))tx.set(dayRef,next);
   });
  },
  async saveMapping(value,expected){
   bounded(value);const ref=maps.doc(key(value.academyId,value.date,value.studentId)),dayRef=days.doc(key(value.academyId,value.date,'day'));
   return db.runTransaction(async tx=>{const [oldSnap,daySnap]=await Promise.all([tx.get(ref),tx.get(dayRef)]),old=oldSnap.data(),day=daySnap.data()||{assignments:{}};
    if((old?.revision||null)!==expected)fail('MAPPING_CONFLICT');
    const assignments={...day.assignments};
    for(const e of old?.entries||[]){const k=hash(e.id);if(assignments[k]?.studentId===value.studentId)delete assignments[k];}
    for(const e of value.entries){const k=hash(e.id);if(assignments[k]&&assignments[k].studentId!==value.studentId)fail('ENTRY_ALREADY_ASSIGNED');assignments[k]={studentId:value.studentId,fingerprint:e.fingerprint,revision:value.revision};}
    const next={academyId:value.academyId,date:value.date,assignments};bounded(next);
    if(value.identityLink)tx.set(maps.doc(key(value.academyId,'identity',value.studentId)),{academyId:value.academyId,date:'identity',studentId:value.studentId,...value.identityLink,identityRevision:value.identityRevision,revision:value.revision,verifiedBy:value.verifiedBy,verifiedAt:value.verifiedAt});
    tx.set(ref,value);tx.set(dayRef,next);tx.create(audit.doc(value.revision),{kind:'mapping',...value});
   });
  },
  async saveClearance(value,expected,mappingRevision){
   bounded(value);const id=key(value.academyId,value.date,value.studentId),ref=reviews.doc(id);
   return db.runTransaction(async tx=>{const [oldSnap,mappingSnap]=await Promise.all([tx.get(ref),tx.get(maps.doc(id))]);
    if((oldSnap.data()?.revision||null)!==expected)fail('REVIEW_CONFLICT');
    if(mappingSnap.data()?.revision!==mappingRevision)fail('MAPPING_CHANGED');
    tx.set(ref,value);tx.create(audit.doc(value.revision),{kind:'clearance',...value});
   });
  }
 };
}
module.exports={firestoreReviewStore};
