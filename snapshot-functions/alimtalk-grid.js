'use strict';
const {hash}=require('./alimtalk-service'),core=require('./core');
const {studentNameKey,studentNameSpellings,parseLessonHeader,exclusion,isRetakerLabel,isEducationOfficeYear,isHomeschoolLabel,readTimeNote,isSaturdayChoiceNote}=require('./alimtalk-contract');
const fail=code=>{throw Object.assign(Error(code),{code});};
// Conservative grammar: unsupported cells are held, never guessed or silently omitted.
const statuses=new Set(['정규','보강','결석보강','보충','일반보충','당취보충','자습','오늘만','신규생','첫수업','결석','결석예고','당일취소','당취','휴강','지각','병결','직보','특강']);
// Keep the verified row reference when only the order of names in a grid cell changes.
// Old day mappings contain positional hashes, including rows beyond today's shortened list.
function retainCellReferences(entries,positionId,cellLength,assignments,knownFingerprints,assignmentCount){
 const savedAt=id=>assignments[hash(id)]?.fingerprint;
 const needsMatch=entries.some(e=>knownFingerprints.has(e.fingerprint)&&savedAt(e.id)!==e.fingerprint);
 if(!needsMatch)return;
 const previous=new Map(),counts=new Map();
 for(const e of entries)counts.set(e.fingerprint,(counts.get(e.fingerprint)||0)+1);
 for(let i=0;i<cellLength+assignmentCount;i++){
  const id=positionId(i),fp=savedAt(id);
  if(counts.has(fp))previous.set(fp,previous.has(fp)?null:id);
 }
 const reserved=new Map();
 for(const e of entries){
  const id=previous.get(e.fingerprint);
  if(id&&counts.get(e.fingerprint)===1)reserved.set(id,e.id);
 }
 for(const e of entries){
  let id=previous.get(e.fingerprint);
  if(!id||counts.get(e.fingerprint)!==1){
   // Follow the displacement chain to the unused position, preserving a
   // one-to-one assignment even if another row in this cell was edited.
   id=e.id;
   while(reserved.has(id))id=reserved.get(id);
  }
  e.id=id;
  e.lesson.sourceId=id;
 }
}
function parseSnapshot(snapshot,now=Date.now(),assignments={}){
 core.validate(snapshot,now);const entries=[],issues=[],locations=[];
 const saved=Object.values(assignments),knownFingerprints=new Set(saved.map(row=>row.fingerprint));
 for(let hour=8;hour<=23;hour++)snapshot.data.grid[hour].forEach((items,col)=>{
  if(!items.length)return;
  const roomText=snapshot.data.headers[col],room=roomText.match(/^(?:(본관|2관|3관)\s*)?(\d+강의실|스터디카페)$/);
  const headers=items.filter(s=>parseLessonHeader(s));
  const header=headers.length===1?parseLessonHeader(headers[0]):null;
  const cellEntries=[],positionId=index=>hash([snapshot.sheet,snapshot.date,hour,col,index]);
  for(let index=0;index<items.length;index++){
   const raw=items[index].trim();if(!raw||headers.includes(items[index]))continue;
   if(/^(자습|자기주도(?:\s*학습)?)$/.test(raw))continue; // Explicit label, not a named student's lesson.
   const chunks=raw.match(/\S+\s*/g),parts=chunks.map(s=>s.trimEnd()),name=studentNameKey(parts[0]);
   const schoolToken=(isRetakerLabel(parts[1])||isHomeschoolLabel(parts[1])||isEducationOfficeYear(parts[1]))?parts[1]:parts.slice(1).find(s=>/[초중고]\d+$/.test(s));
   const school=isRetakerLabel(schoolToken)?'재수생':schoolToken;
   if(!/^[가-힣A-Za-z]+$/.test(name)||(!school&&!(header&&parts.slice(1).some(s=>statuses.has(s))))){
    issues.push('STUDENT_TEXT_UNRECOGNIZED');
    if(locations.length<20){
     const kind=/[가-힣A-Za-z]\s*T(?:$|[\s,，:：])/.test(raw)?'header':'row';
     // Show the first word only. Memos and contact details are unnecessary for finding the row.
     const first=/^[가-힣A-Za-z]{1,16}$/.test(name)?name:'';
     locations.push({hour,room:room?(room[1]||'본관')+' '+room[2]:(col+1)+'번째 강의실 열',position:index+1,kind,first});
    }
    continue;
   }
   // A cancellation mentioned in the memo can describe an earlier lesson.
   // Only the status field and a dedicated closure room set this lesson's status.
   const statusIndex=schoolToken?parts.indexOf(schoolToken)+1:1;
   const fieldStatus=statuses.has(parts[statusIndex])?parts[statusIndex]:'';
   const status=/휴강/.test(roomText)?'휴강':fieldStatus;
   // Preserve every identifiable occurrence, including held/cancelled lessons.
   // Human ID mapping cannot clear a lesson hold; compose independently blocks that student.
   const reviewReasons=[];
   const noteIndex=statusIndex+(fieldStatus?1:0);
   const note=chunks.slice(noteIndex).join(''),timeNote=readTimeNote(note,status,snapshot.date);
   if(!school)reviewReasons.push('학교·학년 확인 필요');
   if(!exclusion({status})){
    if(!room)reviewReasons.push('강의실 표기 확인 필요');
    if(header?.note){
     const memo=readTimeNote(header.note,status,snapshot.date);
     if(memo.held||memo.ranges.length)reviewReasons.push('강사 메모 확인 필요');
    }
    if(timeNote.held)reviewReasons.push('시간 메모 확인 필요');
   }
   const id=positionId(index);
   // Reuse a verified legacy fingerprint even if this spelling or its row position changed.
   const fingerprints=studentNameSpellings(name).map(spelling=>hash(['source-parser-v2',spelling+raw.slice(parts[0].length),headers,roomText]));
   const prior=assignments[hash(id)]?.fingerprint;
   const fingerprint=fingerprints.includes(prior)?prior:fingerprints.find(fp=>knownFingerprints.has(fp))||fingerprints[0];
   const lesson={sourceId:id,date:snapshot.date,start:String(hour).padStart(2,'0')+':00',end:String(hour+1).padStart(2,'0')+':00',subject:header?.subject||'',type:header?.type||'',teacher:header?.teacher||'',...(header?.note?{headerNote:header.note}:{}),building:room?(room[1]||'본관'):'',room:room?room[2]:'',status,...(timeNote.held||timeNote.ranges.length?{timeNoteText:note}:{}),todayOnly:timeNote.todayOnly,timeRanges:timeNote.ranges,...(timeNote.held&&isSaturdayChoiceNote(note,snapshot.date)?{saturdayChoiceNote:true}:{}),reviewReasons};
   // Missing teacher/subject/type remains a student's hold reason in compose.
   cellEntries.push({id,fingerprint,sourceName:name,sourceSchool:school||'',label:name+' · '+(school||'학교·학년 미기재'),summary:lesson.subject+' '+lesson.start+'–'+lesson.end+' · '+lesson.building+' '+lesson.room+' · '+lesson.teacher+(reviewReasons.length?' · [발송 보류: '+reviewReasons.join(' / ')+']':'' )+(exclusion({status})?' · [제외: '+status+']':''),lesson});
  }
  retainCellReferences(cellEntries,positionId,items.length,assignments,knownFingerprints,saved.length);
  entries.push(...cellEntries);
 });
 return {academyId:'banpo',date:snapshot.date,capturedAt:snapshot.capturedAt,revision:snapshot.data.version,complete:issues.length===0,entries,issues:[...new Set(issues)],...(issues.length?{sourceProblem:{sheet:snapshot.sheet,count:issues.length,locations}}:{})};
}
function createMappedDay({loadSource,readDayAssignments,readMapping}){
 return async(actor,date,ids,signal)=>{
  const source=await loadSource(actor,date,signal);if(!source.complete||source.date!==date||source.academyId!==actor.academyId)fail('SOURCE_INCOMPLETE');
  const assignments=await readDayAssignments(actor.academyId,date),byStudent=new Map();
  // Every named source occurrence must be accounted for; otherwise one student's lessons could be omitted.
  for(const e of source.entries){const a=assignments?.[hash(e.id)];if(!a||a.fingerprint!==e.fingerprint)fail('SOURCE_MAPPING_INCOMPLETE');if(!byStudent.has(a.studentId))byStudent.set(a.studentId,[]);byStudent.get(a.studentId).push(e);}
  const students=[];
  for(const id of ids){if(signal?.aborted)fail('ABORTED');const m=await readMapping(actor.academyId,date,id),entries=byStudent.get(id)||[];
   if(!m||m.studentId!==id||m.academyId!==actor.academyId||m.date!==date||m.sourceRevision!==source.revision||!m.verifiedBy||!m.revision||!entries.length||entries.length!==m.entries.length||entries.some(e=>!m.entries.some(x=>x.id===e.id&&x.fingerprint===e.fingerprint)||assignments[hash(e.id)].revision!==m.revision))fail('SOURCE_MAPPING_CHANGED');
   students.push({id,mappingVerified:true,mappingRevision:m.revision,lessons:entries.map(e=>({...e.lesson,studentId:id}))});
  }
  return {academyId:actor.academyId,date,complete:true,revision:source.revision,mappingRevision:hash(students.map(s=>s.mappingRevision)),students};
 };
}
module.exports={parseSnapshot,createMappedDay};
