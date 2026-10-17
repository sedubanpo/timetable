'use strict';
const crypto=require('node:crypto');
const fail=code=>{throw Object.assign(new Error(code),{code});};
async function handle(db,who,uid,input){
 if(!['ADMIN','STAFF','DESK'].includes(who.role))fail('FORBIDDEN');
 const student=typeof input.student==='string'?input.student.trim():'';
 if(!student||student.length>100)fail('INVALID_ACTION');
 const id=crypto.createHash('sha256').update(JSON.stringify(['banpo',student])).digest('hex');
 const ref=building=>db.collection('liveTimetableAnnexGuides').doc(id+'-'+building);
 if(input.action==='annex_guide_mark'){
  if(![2,3].includes(input.building)||typeof input.done!=='boolean')fail('INVALID_ACTION');
  await ref(input.building).set({student,building:input.building,done:input.done,updatedAt:Date.now(),updatedBy:uid});
 }
 const result={};for(const building of [2,3]){const snap=await ref(building).get(),d=snap.data();result[building]=d?{done:d.done===true,updatedAt:d.updatedAt}:null;}
 return {guides:result};
}
module.exports={handle};
