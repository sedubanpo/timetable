'use strict';
// Admin SDK store used by the timetable delivery runtime.
// Client access must remain denied; no security rules are changed by this work.
function firestoreStore(db){
  const records=db.collection('timetableAlimtalkDeliveries');
  const previews=db.collection('timetableAlimtalkPreviews');
  const memoReviews=db.collection('timetableAlimtalkMemoReviews');
  const memoId=(a,d,s)=>require('node:crypto').createHash('sha256').update(JSON.stringify([a,d,s])).digest('hex');
  return {
    async memoReview(academyId,date,studentId){return (await memoReviews.doc(memoId(academyId,date,studentId)).get()).data()||null;},
    async saveMemoReview(record){
      const ref=memoReviews.doc(memoId(record.academyId,record.date,record.studentId));
      await db.runTransaction(async tx=>{
        tx.set(ref,record);
        tx.set(ref.collection('history').doc(require('node:crypto').randomUUID()),record);
      });
    },
    async observeSchedule(record,current,capturedAt){
      const ref=records.doc(record.id);
      await db.runTransaction(async tx=>{
        const data=(await tx.get(ref)).data();
        if(!data||data.state!=='DELIVERED'||(data.scheduleObservedAt||0)>=capturedAt)return;
        const previous=data.lastObservedSchedule??data.text;
        if(previous!==current){
          tx.set(ref.collection('scheduleChanges').doc(String(capturedAt)),{previous,current,capturedAt});
        }
        tx.update(ref,{scheduleObservedAt:capturedAt,lastObservedSchedule:current});
      });
    },
    async recentChanges(id){
      const result=await records.doc(id).collection('scheduleChanges').orderBy('capturedAt','desc').limit(20).get();
      return result.docs.map(doc=>doc.data());
    },
    async savePreview(id,value){await previews.doc(id).create(value);},
    async preview(id){if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return null;return (await previews.doc(id).get()).data()||null;},
    async get(id){if(!/^[a-f0-9]{64}$/.test(id))return null;return (await records.doc(id).get()).data()||null;},
    async claim(id,value){return db.runTransaction(async tx=>{const ref=records.doc(id),snap=await tx.get(ref);if(snap.exists)return {created:false,record:snap.data()};tx.create(ref,value);return {created:true,record:value};});},
    async claimRetry(id,value,parentId,expectedState){return db.runTransaction(async tx=>{
      const ref=records.doc(id),parent=records.doc(parentId),snap=await tx.get(ref),prior=await tx.get(parent);
      if(snap.exists)return {created:false,record:snap.data()};
      if(!prior.exists||prior.data().state!==expectedState)throw Object.assign(Error('RECEIPT_FOUND'),{code:'RECEIPT_FOUND'});
      tx.create(ref,value);return {created:true,record:value};
    });},
    async update(id,fn){return db.runTransaction(async tx=>{const ref=records.doc(id),snap=await tx.get(ref);const value=fn(snap.data()||null);tx.set(ref,value);return value;});},
    async history(academyId,date,studentIds){
      // Bounded query; overflow is explicit, never silently a complete history.
      const snap=await records.where('academyId','==',academyId).where('date','==',date).where('studentId','in',studentIds).limit(201).get();
      if(snap.size>200)throw Object.assign(new Error('HISTORY_LIMIT'),{code:'HISTORY_LIMIT'});
      return snap.docs.map(d=>d.data());
    },
    async dayHistory(academyId,date,kind){
      const snap=await records.where('academyId','==',academyId).where('date','==',date).where('kind','==',kind).limit(1501).get();
      if(snap.size>1500)throw Object.assign(Error('HISTORY_LIMIT'),{code:'HISTORY_LIMIT'});
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
