(function(root){
 'use strict';
 const norm=s=>String(s||'').replace(/\s/g,'').toLowerCase();
 const subjectMatches=(value,exam)=>[exam.subject,...exam.aliases||[]].some(s=>norm(s)===norm(value));
 const studentMatches=(s,school)=>!school||[s.school,s.school+s.grade,s.school+s.grade+'학년'].some(x=>norm(x)===norm(school));
 function normalize(board,history,handoffs,operating,sources){
  if(!board||board.schema!==1||board.complete!==true)throw Error('S_LMS_SOURCE_INCOMPLETE');
  const data={complete:Object.values(sources).every(s=>s.state==='ready'),sources,students:structuredClone(board.students),exams:board.exams,history:[],plans:[],submissions:[],live:[],unresolved:[]};
  for(const s of data.students){const raw=s.subjects||[];s.subjects=data.exams.filter(e=>raw.some(v=>subjectMatches(v,e)||e.major&&norm(v).includes(norm(e.major)))).map(e=>e.subject);s.subjectAmbiguousExams=data.exams.filter(e=>raw.some(v=>e.major&&norm(v).includes(norm(e.major)))&&!raw.some(v=>subjectMatches(v,e))).map(e=>e.id);}
  const plans=root.ExamReviewAdapters.fromDailySnapshots(board.snapshots,data.exams);data.plans=plans.plans;if(!plans.complete)data.complete=false;
  for(const row of history&&history.rows||[]){const matches=data.students.filter(s=>s.id===row.studentId||(s.aliases||[]).includes(row.studentId));if(matches.length!==1)continue;for(const e of data.exams)if(subjectMatches(row.subject,e)||e.major&&norm(row.subject)===norm(e.major))data.history.push({student:matches[0].id,subject:e.subject,date:row.date,attended:true});}
  if(handoffs){const h=root.ExamReviewAdapters.fromHandoffs(handoffs,data.students,data.exams);data.submissions=h.submissions;data.unresolved.push(...h.unresolved);}
  for(const day of operating)for(const [name,detail]of Object.entries(day.snapshot.studentDetails||{})){
   for(const o of detail.occurrences||[]){
    const matches=data.students.filter(s=>norm(s.name)===norm(name)&&studentMatches(s,o.school));
    if(matches.length!==1){data.unresolved.push({date:day.date,name,reason:'운영표 학생 연결 확인 필요'});continue;}
    const s=matches[0],teachers=(board.teachers||[]).filter(t=>norm(t.name)===norm(String(o.teacher||'').replace(/T$/,'')));
    for(const exam of data.exams.filter(e=>e.date>day.date&&subjectMatches(o.subject,e))){
     const row={student:s.id,exam:exam.id,subject:exam.subject,date:day.date,start:o.hour*60,end:(o.hour+1)*60,teacher:String(o.teacher||'').replace(/T$/,''),teacherId:teachers.length===1?teachers[0].id:'',room:o.room,cancelled:/결석|취소|당취|휴강|자습/.test(o.status||''),identityAmbiguous:!o.school||teachers.length!==1};
     const prev=data.live.find(x=>x.student===row.student&&x.exam===row.exam&&x.date===row.date&&x.teacher===row.teacher&&x.room===row.room&&x.cancelled===row.cancelled&&x.end===row.start);if(prev)prev.end=row.end;else data.live.push(row);
    }
   }
  }
  return data;
 }
 const api={normalize,subjectMatches};if(typeof module!=='undefined')module.exports=api;else root.ExamReviewData=api;
})(typeof window!=='undefined'?window:globalThis);
