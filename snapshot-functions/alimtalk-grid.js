'use strict';
const {hash}=require('./alimtalk-service'),core=require('./core');
const {exclusion}=require('./alimtalk-contract');
const fail=code=>{throw Object.assign(Error(code),{code});};
// Conservative grammar: unsupported cells are held, never guessed or silently omitted.
const subject=/^(수학|수II|수I|수1|수2|미적|기하|확통|과학|물리|물리학|화학|생명과학|생명|지구과학|물|화|생|지|국어|언매|화작|영어|사회|한국사|역사|사탐|생활과윤리|윤리와사상|생윤|윤사|한국지리|세계지리|한지|세지|사회문화|사문|정치와법|정법|경제|동아시아사|동사|세계사|컨설팅|클리닉|면접)(?:[12ⅠⅡ])?$/;
const classType=/^(개별정규|개별|정규|[1-9][0-9]*:1|특강|보강|보충|직보)$/;
const statuses=new Set(['정규','보강','보충','일반보충','당취보충','자습','오늘만','신규생','첫수업','결석','결석예고','당일취소','당취','휴강','지각','병결','직보','특강']);
function parseSnapshot(snapshot,now=Date.now()){
 core.validate(snapshot,now);const entries=[],issues=[];
 for(let hour=8;hour<=23;hour++)snapshot.data.grid[hour].forEach((items,col)=>{
  if(!items.length)return;
  const roomText=snapshot.data.headers[col],room=roomText.match(/^(?:(본관|2관|3관)\s*)?(\d+강의실)$/);
  const headers=items.filter(s=>/^(?:(?:\S+)\s+)+[가-힣A-Za-z]+T$/.test(s.trim())&&s.trim().split(/\s+/).slice(0,-1).every(t=>subject.test(t)||classType.test(t)));
  const header=headers.length===1?headers[0]:null,tokens=header?.trim().split(/\s+/)||[];
  for(let index=0;index<items.length;index++){
   const raw=items[index].trim();if(!raw||headers.includes(items[index]))continue;
   if(/^(자습|자기주도학습)$/.test(raw))continue; // Explicit label, not a named student's lesson.
   const parts=raw.split(/\s+/),name=parts[0],school=parts.slice(1).find(s=>/[초중고]\d+$/.test(s));
   if(!/^[가-힣A-Za-z]+$/.test(name)||(!school&&!(header&&parts.slice(1).some(s=>statuses.has(s))))){issues.push('STUDENT_TEXT_UNRECOGNIZED');continue;}
   const found=parts.slice(1).filter(s=>statuses.has(s)),cancel=found.find(s=>exclusion({status:s}));
   const status=/휴강/.test(roomText)?'휴강':cancel||found[0]||'';
   // Preserve every identifiable occurrence, including held/cancelled lessons.
   // Human ID mapping cannot clear a lesson hold; compose independently blocks that student.
   const reviewReasons=[];
   if(!school)reviewReasons.push('학교·학년 확인 필요');
   if(!exclusion({status})){
    if(!room)reviewReasons.push('강의실 표기 확인 필요');
    if(/\d{1,2}\s*:\s*\d{2}|\d{1,2}\s*시|시간\s*변경/.test(raw))reviewReasons.push('시간 메모 확인 필요');
   }
   const id=hash([snapshot.sheet,snapshot.date,hour,col,index]),fingerprint=hash(['source-parser-v2',raw,headers,roomText]);
   const lesson={sourceId:id,date:snapshot.date,start:String(hour).padStart(2,'0')+':00',end:String(hour+1).padStart(2,'0')+':00',subject:tokens.find(t=>subject.test(t))||'',type:tokens.find(t=>classType.test(t))||'',teacher:header?tokens.at(-1).slice(0,-1):'',building:room?(room[1]||'본관'):'',room:room?room[2]:'',status,reviewReasons};
   // Missing teacher/subject/type remains a student's hold reason in compose.
   entries.push({id,fingerprint,sourceName:name,sourceSchool:school||'',label:name+' · '+(school||'학교·학년 미기재'),summary:lesson.subject+' '+lesson.start+'–'+lesson.end+' · '+lesson.building+' '+lesson.room+' · '+lesson.teacher+(reviewReasons.length?' · [발송 보류: '+reviewReasons.join(' / ')+']':'' )+(exclusion({status})?' · [제외: '+status+']':''),lesson});
  }
 });
 return {academyId:'banpo',date:snapshot.date,revision:snapshot.data.version,complete:issues.length===0,entries,issues:[...new Set(issues)]};
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
