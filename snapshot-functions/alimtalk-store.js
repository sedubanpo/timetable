'use strict';
// Proposed Admin SDK store. Not instantiated by any deployed function.
// Client access must remain denied; no security rules are changed by this work.
function firestoreStore(db){
  const records=db.collection('timetableAlimtalkDeliveries');
  const previews=db.collection('timetableAlimtalkPreviews');
  return {
    async savePreview(id,value){await previews.doc(id).create(value);},
    async preview(id){if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return null;return (await previews.doc(id).get()).data()||null;},
    async get(id){if(!/^[a-f0-9]{64}$/.test(id))return null;return (await records.doc(id).get()).data()||null;},
    async claim(id,value){return db.runTransaction(async tx=>{const ref=records.doc(id),snap=await tx.get(ref);if(snap.exists)return {created:false,record:snap.data()};tx.create(ref,value);return {created:true,record:value};});},
    async update(id,fn){return db.runTransaction(async tx=>{const ref=records.doc(id),snap=await tx.get(ref);const value=fn(snap.data()||null);tx.set(ref,value);return value;});},
    async history(academyId,date,studentIds){
      // Bounded query; overflow is explicit, never silently a complete history.
      const snap=await records.where('academyId','==',academyId).where('date','==',date).where('studentId','in',studentIds).limit(201).get();
      if(snap.size>200)throw Object.assign(new Error('HISTORY_LIMIT'),{code:'HISTORY_LIMIT'});
      return snap.docs.map(d=>d.data());
    },
    async rate(uid,action,now,limit){
      const id=require('node:crypto').createHash('sha256').update(uid+'|'+action).digest('hex');
      return db.runTransaction(async tx=>{const ref=db.collection('timetableAlimtalkLimits').doc(id),snap=await tx.get(ref),old=snap.data();const count=old&&old.until>now?old.count:0;
        if(count>=limit)throw Object.assign(new Error('RATE_LIMIT'),{code:'RATE_LIMIT'});
        tx.set(ref,{count:count+1,until:old&&old.until>now?old.until:now+60000});});
    }
  };
}
module.exports={firestoreStore};
