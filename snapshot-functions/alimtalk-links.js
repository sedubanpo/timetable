'use strict';
const {hash}=require('./alimtalk-service');
const {studentNameKey,directorySchoolKey,exclusion}=require('./alimtalk-contract');
// Directory matches without a prior link apply only to the current guardian notice.
function createLinkResolver({findCandidates,resolveStudent,store,now=Date.now}){
 return async(actor,source,audience)=>{
  if(!source.complete)return source;
  const groups=new Map();for(const e of source.entries){if(!groups.has(e.sourceName))groups.set(e.sourceName,[]);groups.get(e.sourceName).push(e);}
  const names=[...groups.keys()],plans=[],issues={},guardianMatches=[],confirmedEntries=new Set();let next=0;
  await Promise.all(Array.from({length:Math.min(6,names.length)},async()=>{while(next<names.length){
   const name=names[next++],entries=groups.get(name);
   const excludedOnly=entries.every(e=>exclusion(e.lesson));
   try{
    const candidates=await findCandidates(name,source);
    let selected=candidates[0];
    // A cancelled day may still need its existing mapping refreshed; never create a new one for it.
    if(excludedOnly && (candidates.length!==1 || !(await store.mapping(actor.academyId,source.date,selected))))continue;
    if(candidates.length!==1){
     // An explicit, unchanged mapping can resolve a same-name case for this date.
     const confirmed=[];
     for(const id of candidates){const m=await store.mapping(actor.academyId,source.date,id);if(m&&!m.reusedIdentity&&m.verifiedBy&&m.entries?.length===entries.length&&entries.every(e=>m.entries.some(x=>x.id===e.id&&x.fingerprint===e.fingerprint)))confirmed.push(id);}
     if(confirmed.length!==1){issues[name]=candidates.length?'동명이인 · 학생 확인 필요':'신규·미등록 학생 · 원장 확인 필요';continue;}
     selected=confirmed[0];
    }
    const student=await resolveStudent(selected);
    if(student.id!==selected){issues[name]='원장 대표 학생 변경 · 다시 확인 필요';continue;}
    if(entries.every(e=>e.sourceSchool==='')&&studentNameKey(student.name)===name){
     const mapping=await store.mapping(actor.academyId,source.date,student.id);
     if(mapping?.confirmedMissingSchool&&mapping.verifiedBy&&mapping.identityRevision===student.identityRevision&&mapping.entries?.length===entries.length&&entries.every(e=>mapping.entries.some(x=>x.id===e.id&&x.fingerprint===e.fingerprint))){
      for(const entry of entries)confirmedEntries.add(entry);
      continue;
     }
     issues[name]='시간표 학교·학년 미기재 · 연결 추천 학생 선택 필요';continue;
    }
    const proof=await store.rememberedMapping(actor.academyId,student.id);
    const alias=proof?.date==='identity' && proof.studentId===student.id && proof.identityRevision===student.identityRevision && proof.verifiedBy ? proof.confirmedSourceSchool : null;
    if(studentNameKey(student.name)!==name||!directorySchoolKey(student.school,student.grade)||entries.some(e=>e.sourceSchool!==directorySchoolKey(student.school,student.grade) && (!alias || e.sourceSchool!==alias))){issues[name]='이름·학교·학년 불일치 · 원장 확인 필요';continue;}
    if(!proof){
     const guardian=student.recipients?.some(r=>['mother','father'].includes(r.id)&&r.verified===true);
     if(audience==='guardian' && candidates.length===1 && guardian &&
        !student.registrationInactive && !student.noticeDate && student.identityRevision){
      guardianMatches.push({id:student.id,identityRevision:student.identityRevision});
     }else issues[name]='처음 연결하는 학생 · 학생 확인 필요';
     continue;
    }
    if(proof.identityRevision!==student.identityRevision){issues[name]='원장 정보 변경 · 학생 연결 재확인 필요';continue;}
    plans.push({student,proof,entries});
   }catch(e){issues[name]=e.code==='IDENTITY_MAPPING_LIMIT'?'동명이인·원장 연결 확인 필요':'원장·기존 학생 연결 조회 확인 필요';}
  }}));
  const assigned=await store.dayAssignments(actor.academyId,source.date);
  // Cell IDs describe positions, not people. A room move or reordered cell can reuse
  // another verified student's old position. Release only through that student's
  // verified replacement plan, in the same transaction as all new assignments.
  const conflicts=new Map();
  const knownStudents=new Map(plans.map(p=>[p.student.id,p.student]));
  let safe=[...plans],removed;
  do{
   removed=false;
   const byId=new Map(safe.map(p=>[p.student.id,p]));
   safe=safe.filter(p=>{
    const blocked=p.entries.filter(e=>{
     const old=assigned[hash(e.id)];
     if(!old||old.studentId===p.student.id)return false;
     const owner=byId.get(old.studentId);
     return !owner||old.fingerprint===e.fingerprint||owner.entries.some(x=>x.id===e.id);
    });
    if(blocked.length){conflicts.set(studentNameKey(p.student.name),blocked);removed=true;}
    return !blocked.length;
   });
  }while(removed);

  // Look up only the previous owners needed for the explanation. A missing name
  // must not suppress a hold or prevent the rest of the roster from loading.
  for(const [name,entries] of conflicts){
   const details=[];
   for(const entry of entries.slice(0,3)){
    const id=assigned[hash(entry.id)].studentId;
    if(!knownStudents.has(id)){
     let student;
     try{student=await resolveStudent(id);}catch{}
     knownStudents.set(id,student?.id===id?student:null);
    }
    const previous=studentNameKey(knownStudents.get(id)?.name);
    const lesson=entry.lesson;
    const slot=[lesson.start,lesson.building,lesson.room,lesson.subject].filter(Boolean).join(' ');
    let owner=previous||'다른 학생';
    if(previous&&!groups.has(previous))owner+='(현재 시간표에 없음)';
    else if(conflicts.has(previous))owner+='(연결 확인 중)';
    details.push([slot,'기존 연결 '+owner].filter(Boolean).join(' · '));
   }
   const more=entries.length>details.length?' 외 '+(entries.length-details.length)+'곳':'';
   issues[name]='학생 연결 확인 필요 — '+details.join(' / ')+more+'. 원본 시간표에서 이 자리의 학생 이름과 순서를 확인해 주세요.';
  }

  if(safe.length)await store.synchronizeMappings(actor,source,safe,now());
  const entries=source.entries.map(e=>confirmedEntries.has(e)?{...e,lesson:{...e.lesson,reviewReasons:e.lesson.reviewReasons.filter(reason=>reason!=='학교·학년 확인 필요')}}:e);
  return {...source,entries,guardianMatches,linkIssues:issues,linkedStudentIds:safe.map(p=>p.student.id)};
 };
}
module.exports={createLinkResolver};
