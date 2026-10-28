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
  async saveMapping(value,expected){
   bounded(value);const ref=maps.doc(key(value.academyId,value.date,value.studentId)),dayRef=days.doc(key(value.academyId,value.date,'day'));
   return db.runTransaction(async tx=>{const [oldSnap,daySnap]=await Promise.all([tx.get(ref),tx.get(dayRef)]),old=oldSnap.data(),day=daySnap.data()||{assignments:{}};
    if((old?.revision||null)!==expected)fail('MAPPING_CONFLICT');
    const assignments={...day.assignments};
    for(const e of old?.entries||[]){const k=hash(e.id);if(assignments[k]?.studentId===value.studentId)delete assignments[k];}
    for(const e of value.entries){const k=hash(e.id);if(assignments[k]&&assignments[k].studentId!==value.studentId)fail('ENTRY_ALREADY_ASSIGNED');assignments[k]={studentId:value.studentId,fingerprint:e.fingerprint,revision:value.revision};}
    const next={academyId:value.academyId,date:value.date,assignments};bounded(next);
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
