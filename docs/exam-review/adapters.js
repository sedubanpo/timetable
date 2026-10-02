(function(root){
  'use strict';
  const norm=s=>String(s||'').trim().replace(/\s+/g,'').toLowerCase();
  const examKey=(student,subject,date)=>[student,norm(subject),date].join('|');
  function fromDailySnapshots(snapshots,exams){
    const plans=[];let complete=true;
    for(const snapshot of snapshots){
      if(snapshot.schema!==1||snapshot.source!=='s-lms-rendered-board'||!Array.isArray(snapshot.items))throw Error('INVALID_S_LMS_RESPONSE');
      complete=complete&&snapshot.complete===true;
      for(const x of snapshot.items){
        if(x.date!==snapshot.date||!x.studentId)throw Error('INVALID_S_LMS_RESPONSE');
        const exam=exams.find(e=>e.date===x.examDate&&[e.subject,...e.aliases||[]].some(v=>norm(v)===norm(x.subject))&&norm(e.school)===norm(x.school)&&(e.grade==='전학년'||String(e.grade)===String(x.grade)));
        if(!exam){plans.push({student:x.studentId,exam:null,subject:x.subject,date:x.date,start:x.start,end:x.end,teacher:x.teacher,teacherId:x.teacherId,confirmed:['확정','대체진행'].includes(x.progressStatus),examAmbiguous:true});continue;}
        plans.push({student:x.studentId,exam:exam.id,subject:exam.subject,date:x.date,start:x.start,end:x.end,teacher:x.teacher,teacherId:x.teacherId,confirmed:['확정','대체진행'].includes(x.progressStatus),cancelled:x.progressStatus==='미진행',statusId:x.statusId,progressStatus:x.progressStatus,note:x.note||''});
      }
    }
    return {complete,plans};
  }
  function fromHandoffs(response,students,exams){
    if(!response||response.complete!==true||!Array.isArray(response.items))throw Error('HANDOFF_SOURCE_INCOMPLETE');
    // Choose the whole latest version before expanding its rows; deleted rows stay deleted.
    const batches=new Map();
    for(const b of response.items){
      if(!b.uid||!b.date||!Number.isSafeInteger(b.number)||!Array.isArray(b.rows))throw Error('INVALID_HANDOFF_RESPONSE');
      const key=b.uid+'|'+b.date,prev=batches.get(key);if(!prev||b.number>prev.number)batches.set(key,b);
    }
    const submissions=[],unresolved=[];
    for(const b of batches.values())for(const row of b.rows){
      const matches=students.filter(s=>s.active!==false&&norm(s.name)===norm(row.name));
      if(matches.length!==1){unresolved.push({date:b.date,name:row.name,reason:'학생 연결 확인 필요'});continue;}
      const student=matches[0];
      const segments=[];
      for(let h=Math.floor(row.start/60);h*60<row.end;h++){
        const subject=String((b.subjects||{})[h]||'').trim(),start=Math.max(row.start,h*60),end=Math.min(row.end,(h+1)*60),prev=segments.at(-1);
        if(prev&&norm(prev.subject)===norm(subject)&&prev.end===start)prev.end=end;else segments.push({subject,start,end});
      }
      for(const segment of segments){
        const candidates=exams.filter(e=>norm(e.school)===norm(student.school)&&(e.grade==='전학년'||String(e.grade)===String(student.grade))&&[e.subject,...e.aliases||[]].some(v=>norm(v)===norm(segment.subject))&&e.date>b.date);
        // Without an explicit exam ID, a free-text submission is a confirmation candidate.
        const exam=candidates.sort((a,b)=>a.date.localeCompare(b.date))[0];
        if(!exam){unresolved.push({date:b.date,name:row.name,reason:'시험 과목 연결 확인 필요'});continue;}
        submissions.push({student:student.id,subject:exam.subject,exam:exam.id,date:b.date,start:segment.start,end:segment.end,teacher:b.teacher,teacherId:b.uid,version:b.number,batchId:b.uid+'|'+b.date+'|'+b.number,note:row.note||'',identityAmbiguous:true,examAmbiguous:candidates.length!==1,key:examKey(student.id,exam.subject,exam.date)});
      }
    }
    return {submissions,unresolved};
  }
  const api={fromDailySnapshots,fromHandoffs};if(typeof module!=='undefined')module.exports=api;else root.ExamReviewAdapters=api;
})(typeof window!=='undefined'?window:this);
