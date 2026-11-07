'use strict';
const {hash}=require('./alimtalk-service');
const {directorySchoolKey,exclusion}=require('./alimtalk-contract');
// Reuse only a human-confirmed identity. A schedule row is never proof of identity.
function createLinkResolver({findCandidates,resolveStudent,store,now=Date.now}){
 return async(actor,source)=>{
  if(!source.complete)return source;
  const groups=new Map();for(const e of source.entries){if(!groups.has(e.sourceName))groups.set(e.sourceName,[]);groups.get(e.sourceName).push(e);}
  const names=[...groups.keys()],plans=[],issues={};let next=0;
  await Promise.all(Array.from({length:Math.min(6,names.length)},async()=>{while(next<names.length){
   const name=names[next++],entries=groups.get(name);
   if(entries.every(e=>exclusion(e.lesson)))continue;
   try{
    const candidates=await findCandidates(name);
    let selected=candidates[0];
    if(candidates.length!==1){
     // An explicit, unchanged mapping can resolve a same-name case for this date.
     const confirmed=[];
     for(const id of candidates){const m=await store.mapping(actor.academyId,source.date,id);if(m&&!m.reusedIdentity&&m.verifiedBy&&m.entries?.length===entries.length&&entries.every(e=>m.entries.some(x=>x.id===e.id&&x.fingerprint===e.fingerprint)))confirmed.push(id);}
     if(confirmed.length!==1){issues[name]=candidates.length?'동명이인 · 학생 확인 필요':'신규·미등록 학생 · 원장 확인 필요';continue;}
     selected=confirmed[0];
    }
    const student=await resolveStudent(selected);
    if(student.id!==selected){issues[name]='원장 대표 학생 변경 · 다시 확인 필요';continue;}
    if(student.name!==name||!directorySchoolKey(student.school,student.grade)||entries.some(e=>e.sourceSchool!==directorySchoolKey(student.school,student.grade))){issues[name]='이름·학교·학년 불일치 · 원장 확인 필요';continue;}
    const proof=await store.rememberedMapping(actor.academyId,student.id);
    if(!proof){issues[name]='처음 연결하는 학생 · 학생 확인 필요';continue;}
    if(proof.identityRevision!==student.identityRevision){issues[name]='원장 정보 변경 · 학생 연결 재확인 필요';continue;}
    plans.push({student,proof,entries});
   }catch(e){issues[name]=e.code==='IDENTITY_MAPPING_LIMIT'?'동명이인·원장 연결 확인 필요':'원장·기존 학생 연결 조회 확인 필요';}
  }}));
  const assigned=await store.dayAssignments(actor.academyId,source.date);
  const safe=plans.filter(p=>{if(p.entries.some(e=>assigned[hash(e.id)]&&assigned[hash(e.id)].studentId!==p.student.id)){issues[p.student.name]='기존 수업 연결 불일치 · 학생 확인 필요';return false;}return true;});
  if(safe.length)await store.synchronizeMappings(actor,source,safe,now());
  return {...source,linkIssues:issues,linkedStudentIds:safe.map(p=>p.student.id)};
 };
}
module.exports={createLinkResolver};
