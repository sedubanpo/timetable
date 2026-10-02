'use strict';
const crypto=require('node:crypto');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function date(value){if(typeof value!=='string'||!/^20\d\d-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('INVALID_DATE');return value;}
function text(v,max){if(typeof v!=='string'||v.length>max)fail('INVALID_DATA');return v.trim();}
function identity(user,profile={},access={},uid){const role=String(user.role||'').toUpperCase();if(user.status!=='ACTIVE'||!['ADMIN','STAFF','DESK','TEACHER','INSTRUCTOR'].includes(role)||access.apps?.liveTimetable===false)fail('FORBIDDEN');const admin=role==='ADMIN'||role==='STAFF'&&(access.permissions?.canManageAccounts===true||access.permissions?.canManageSchedules===true);const name=String(user.name||profile.displayName||access.instructorName||'').trim();if(!name)fail('FORBIDDEN');return {uid,name,admin};}
function validate(value){if(!value||!Array.isArray(value.rows)||value.rows.length>200||!value.subjects||Array.isArray(value.subjects)||typeof value.subjects!=='object')fail('INVALID_DATA');const ids=new Set();const rows=value.rows.map(r=>{if(!r||!Number.isSafeInteger(r.id)||r.id<1||ids.has(r.id)||!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<480||r.end>1440||r.end<=r.start||!['개별','1:1','그룹'].includes(r.type))fail('INVALID_DATA');ids.add(r.id);const name=text(r.name,30);if(!name)fail('INVALID_DATA');return {id:r.id,name,start:r.start,end:r.end,type:r.type,note:text(r.note||'',150)};});for(let i=0;i<rows.length;i++)for(let j=0;j<i;j++){const a=rows[i],b=rows[j];if(a.name.replace(/\s/g,'')===b.name.replace(/\s/g,'')&&a.start<b.end&&a.end>b.start)fail('OVERLAP');}const subjects={};for(const [h,v] of Object.entries(value.subjects)){if(!/^(?:[89]|1\d|2[0-3])$/.test(h))fail('INVALID_DATA');subjects[h]=text(v,60);}const form=Array.isArray(value.form)?value.form:['','14','00','16','00','개별',''];if(form.length!==7)fail('INVALID_DATA');form.forEach((v,i)=>text(v,i===0?30:i===6?150:12));const editing=value.editing==null?null:value.editing;if(editing!==null&&!rows.some(r=>r.id===editing))fail('INVALID_DATA');return {rows,subjects,form:[...form],editing};}
const empty=()=>({rows:[],subjects:{},form:['','14','00','16','00','개별',''],editing:null});
function op(value){if(typeof value!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(value))fail('INVALID_OPERATION');return value;}
const metadata=v=>({number:v.number,time:v.time,state:v.state,statusRevision:v.statusRevision||0,operationId:v.operationId});
async function handle(db,who,b){const action=b.action;if(action==='identity')return {identity:who};const day=date(b.date),collection=db.collection('liveTimetableHandoffDays').doc(day).collection('teachers');
 if(action==='list'){if(!who.admin)fail('FORBIDDEN');let q=collection.orderBy('__name__').limit(51);if(b.cursor)q=q.startAfter(text(b.cursor,128));const snap=await q.get(),docs=snap.docs.slice(0,50);return {items:docs.filter(d=>d.data().latest).map(d=>({uid:d.id,teacher:d.data().teacher,date:day,latest:d.data().latest})),cursor:snap.docs.length>50?docs.at(-1).id:null};}
 if(action==='review'){
  if(!who.admin)fail('FORBIDDEN');
  const end=date(b.endDate||day);
  if(end<day||(Date.parse(end)-Date.parse(day))/86400000>14)fail('INVALID_DATE');
  const items=[];
  for(let d=day;d<=end;d=new Date(Date.parse(d)+86400000).toISOString().slice(0,10)){
   const teachers=db.collection('liveTimetableHandoffDays').doc(d).collection('teachers');
   let cursor=null,count=0;
   do{
    let q=teachers.orderBy('__name__').limit(51);if(cursor)q=q.startAfter(cursor);
    const page=await q.get(),docs=page.docs.slice(0,50);count+=docs.length;
    if(count>300)fail('SOURCE_INCOMPLETE');
    const submitted=docs.filter(doc=>doc.data().latest);
    const refs=submitted.map(doc=>teachers.doc(doc.id).collection('versions').doc(op(doc.data().latest.operationId)));
    const versions=refs.length?(db.getAll?await db.getAll(...refs):await Promise.all(refs.map(ref=>ref.get()))):[];
    versions.forEach((version,i)=>{
     const value=version.data(),doc=submitted[i],meta=doc.data().latest;
     if(!version.exists||!value||value.date!==d||value.uid!==doc.id||value.operationId!==meta.operationId||value.number!==meta.number)fail('SOURCE_INCOMPLETE');
     const validated=validate(value);
     items.push({date:d,teacher:value.teacher,uid:value.uid,number:value.number,time:value.time,state:value.state,rows:validated.rows,subjects:validated.subjects});
    });
    if(Buffer.byteLength(JSON.stringify(items))>2000000)fail('SOURCE_INCOMPLETE');
    cursor=page.docs.length>50?docs.at(-1).id:null;
   }while(cursor);
  }
  return {items,complete:true,start:day,end};
 }
 const uid=action==='draft'||action==='saveDraft'||action==='submit'?who.uid:(b.uid||who.uid);if(uid!==who.uid&&!who.admin)fail('FORBIDDEN');if(typeof uid!=='string'||!uid||uid.length>128||uid.includes('/'))fail('INVALID_DATA');const ref=collection.doc(uid);
 if(action==='draft'){const doc=(await ref.get()).data()||{};let latest=null;if(doc.latest)latest=(await ref.collection('versions').doc(doc.latest.operationId).get()).data()||null;return {revision:doc.revision||0,draft:doc.draft||empty(),latest};}
 if(action==='versions'){const snap=await ref.collection('versions').orderBy('number','desc').limit(50).get();return {versions:snap.docs.map(d=>d.data())};}
 if(action==='status'){if(!who.admin)fail('FORBIDDEN');if(!['미확인','확인 중','반영 완료'].includes(b.state))fail('INVALID_DATA');const ver=ref.collection('versions').doc(op(b.operationId));return db.runTransaction(async tx=>{const [ds,vs]=await Promise.all([tx.get(ref),tx.get(ver)]);if(!vs.exists)fail('NOT_FOUND');const v=vs.data();if(v.state===b.state&&v.statusRevision===b.statusRevision+1)return {version:v};if(v.statusRevision!==b.statusRevision)fail('CONFLICT');const updated={...v,state:b.state,statusRevision:v.statusRevision+1,statusAt:Date.now(),statusBy:who.uid};tx.update(ver,{state:updated.state,statusRevision:updated.statusRevision,statusAt:updated.statusAt,statusBy:updated.statusBy});if(ds.data()?.latest?.operationId===b.operationId)tx.update(ref,{latest:metadata(updated)});return {version:updated};});}
 if(!['saveDraft','submit'].includes(action))fail('INVALID_ACTION');const operationId=op(b.operationId),payload=validate(b.data),fingerprint=hash({action,payload});if(!Number.isSafeInteger(b.revision)||b.revision<0)fail('INVALID_DATA');if(action==='submit'&&(!payload.rows.length||payload.form[0].trim()||payload.form[6].trim()||payload.editing!==null))fail('UNFINISHED_INPUT');
 return db.runTransaction(async tx=>{const doc=(await tx.get(ref)).data()||{},ver=ref.collection('versions').doc(operationId);const previous=action==='submit'?(await tx.get(ver)).data():null;if(previous){if(previous.fingerprint!==fingerprint)fail('INVALID_OPERATION');return {revision:previous.draftRevision,version:previous};}if(doc.lastOperation===operationId){if(doc.fingerprint!==fingerprint)fail('INVALID_OPERATION');return {revision:doc.revision};}if((doc.revision||0)!==b.revision)fail('CONFLICT');const revision=b.revision+1,now=Date.now();const update={teacher:who.name,revision,draft:payload,updatedAt:now,lastOperation:operationId,fingerprint};let version=null;if(action==='submit'){version={...payload,number:(doc.latest?.number||0)+1,operationId,fingerprint,time:now,state:'미확인',statusRevision:0,draftRevision:revision,teacher:who.name,uid:who.uid,date:day};tx.create(ver,version);update.latest=metadata(version);}tx.set(ref,update,{merge:true});return {revision,...(version?{version}:{})};});
}
module.exports={handle,identity,validate,date,empty};
