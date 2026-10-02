(function(root){
  const dayMs=86400000;
  const plus=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*dayMs).toISOString().slice(0,10);
  const timed=x=>Number.isInteger(x.start)&&Number.isInteger(x.end)&&x.start>=0&&x.end<=1440&&x.end>x.start;
  const same=(a,b)=>timed(a)&&timed(b)&&a.date===b.date&&a.start===b.start&&a.end===b.end&&!!a.teacher&&((a.teacherId||b.teacherId)?!!a.teacherId&&a.teacherId===b.teacherId:a.teacher===b.teacher);
  function latestSubmissions(rows){
    const groups=new Map();
    // Real submissions replace the teacher's whole date, including removed students.
    for(const x of rows){const k=x.batchId?`${x.teacherId||x.teacher}|${x.date}`:`${x.student}|${x.subject}|${x.exam}|${x.date}|${x.teacherId||x.teacher}`;
      const previous=groups.get(k)||[];const version=Number(x.version||0),current=Number(previous[0]?.version||0);
      if(!previous.length||version>current)groups.set(k,[x]);else if(version===current)previous.push(x);
    }
    return [...groups.values()].flat();
  }
  // A missing operating sheet affects only dates needed by this comparison.
  function operatingReady(data,start,end){
    const source=data.sources?.operating;
    if(!source)return data.complete===true;
    if(source.state==='ready')return true;
    const missing=source.missingDates;
    return source.state==='unavailable'&&Array.isArray(missing)&&missing.length>0&&missing.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d))&&!missing.some(d=>d>=start&&d<end);
  }
  function assess(data,asOf,days=14){
    const end=plus(asOf,days),oldest=plus(asOf,-56),start=data.preparationStart||asOf;
    const latest=latestSubmissions(data.submissions||[]);
    return data.students.filter(s=>s.active!==false).flatMap(student=>data.exams.filter(exam=>exam.school===student.school&&(exam.grade==='전학년'||String(exam.grade)===String(student.grade))&&exam.date>asOf&&exam.date<=end).flatMap(exam=>{
      const enrolled=student.subjects.includes(exam.subject);
      const history=(data.history||[]).filter(x=>x.student===student.id&&x.subject===exam.subject&&x.date>=oldest&&x.date<asOf&&x.attended).sort((a,b)=>b.date.localeCompare(a.date));
      if(!enrolled&&!history.length)return [];
      const match=x=>x.student===student.id&&x.subject===exam.subject&&x.exam===exam.id;
      const inWindow=x=>x.date>=start&&x.date<exam.date;
      const allPlans=(data.plans||[]).filter(match),allSubmitted=latest.filter(match),allLive=(data.live||[]).filter(match);
      const plans=allPlans.filter(x=>!x.cancelled&&x.confirmed!==false&&inWindow(x)),submissions=allSubmitted.filter(x=>!x.cancelled&&inWindow(x)),live=allLive.filter(x=>!x.cancelled&&inWindow(x));
      const plan=plans[0]||allPlans[0],submitted=submissions[0]||allSubmitted[0];
      let state,reason;
      const operatingComplete=operatingReady(data,start,exam.date);
      const otherSourcesReady=Object.entries(data.sources||{}).filter(([k])=>k!=='operating').every(([,x])=>x.state==='ready');
      const complete=operatingComplete&&otherSourcesReady&&(data.complete===true||data.planSourceComplete===true&&data.sources?.operating?.state==='unavailable');
      if(!complete){state='자료 확인 필요';reason='필요한 자료가 전부 조회되지 않았습니다. 편성 여부와 일치를 판단하지 않습니다.';}
      else if(!enrolled){state='자료 확인 필요';reason='최근 공개 수업 기록은 있으나 현재 수강 여부를 확인해야 합니다.';}
      else if(student.identityAmbiguous){state='자료 확인 필요';reason='S-LMS 학생 식별 자료가 이름 기준으로 합쳐져 있어 학생 ID 연결을 확인해야 합니다.';}
      else if((student.subjectAmbiguousExams||[]).includes(exam.id)){state='자료 확인 필요';reason='수강 과목과 시험의 세부 과목 연결을 확인해 주세요.';}
      else if(student.suppressed){state='자료 확인 필요';reason='S-LMS의 미진행·보류·직보 불필요 설정과 사유를 확인해 주세요.';}
      else if([...plans,...submissions,...live].some(x=>x.identityAmbiguous||x.examAmbiguous)){state='자료 확인 필요';reason='학생 또는 시험 과목 연결이 모호합니다. 이름만으로 일치시키지 않습니다.';}
      else if(allPlans.some(x=>x.confirmed===false&&!x.cancelled&&inWindow(x))){state='자료 확인 필요';reason='S-LMS 직보 상태가 아직 미정입니다. 담당 강사와 일정을 확정해 주세요.';}
      else if(!plans.length&&!submissions.length&&!live.length){
        const cancelled=[...allPlans,...allSubmitted,...allLive].some(x=>x.cancelled&&inWindow(x));
        state=cancelled?'내용 불일치':'편성 필요';reason=cancelled?'취소된 대비 수업의 대체 일정이 없습니다.':'시험 전에 진행할 대비 일정이 없습니다.';
      }
      else if(!plans.length){state=submissions.length&&!live.length?'운영표 미반영':'자료 확인 필요';reason=submissions.length&&!live.length?'강사가 전달한 대비 수업을 운영 시간표에 반영해야 합니다.':'S-LMS 대비 계획이 확정되지 않았습니다.';}
      else if([...plans,...submissions,...live].some(x=>!timed(x)||!x.teacher)){state='자료 확인 필요';reason='시작·종료 시간 또는 담당 강사가 미정입니다.';}
      else if(allSubmitted.some(x=>x.cancelled&&inWindow(x))&&!submissions.length&&plans.some(p=>allSubmitted.some(x=>x.cancelled&&x.date===p.date))){state='내용 불일치';reason='최신 강사 제출에서 취소한 수업의 대체 계획을 확인해 주세요.';}
      else if(!live.length){state='운영표 미반영';reason='확정한 대비 계획이 운영 시간표에 없습니다.';}
      else if(!plans.every(p=>live.some(x=>same(p,x)))||!live.every(x=>plans.some(p=>same(p,x)))||!submissions.every(s=>plans.some(p=>same(p,s)))){state='내용 불일치';reason='준비 기간의 날짜·시간·담당 강사 또는 수업 회차가 서로 다릅니다.';}
      else {state='계획 일치';reason=submissions.length?'직보 계획, 최신 강사 제출, 운영 시간표가 일치합니다.':'직보 계획과 운영 시간표가 일치합니다. 강사 제출은 아직 없습니다.';}
      return [{key:student.id+':'+exam.id,student,exam,plan,submitted,submissions,live,plans,state,reason,history,enrolled,operatingComplete}];
    })).sort((a,b)=>a.exam.date.localeCompare(b.exam.date)||a.student.name.localeCompare(b.student.name,'ko'));
  }
  function daily(data,date){
    const assessed=assess(data,date,30);
    return (data.plans||[]).filter(x=>x.date===date&&!x.cancelled).map((x,i)=>{
      const student=data.students.find(s=>s.id===x.student),exam=data.exams.find(e=>e.id===x.exam);
      if(!student||student.active===false||student.suppressed)return null;
      const result=assessed.find(r=>r.student.id===x.student&&r.exam.id===x.exam);
      const live=(data.live||[]).filter(l=>l.student===x.student&&l.subject===x.subject&&l.exam===x.exam&&l.date===date&&!l.cancelled);
      const complete=data.sources?data.sources.board?.state==='ready'&&data.planSourceComplete!==false&&operatingReady(data,date,plus(date,1)):data.complete===true;
      const state=!complete?'운영표 조회 불가':!timed(x)?'시간 미정':student.identityAmbiguous||x.identityAmbiguous||x.examAmbiguous||x.confirmed===false?'자료 확인 필요':live.some(l=>same(x,l))?'계획 일치':live.length?'시간·강사 차이':'운영표 미반영';
      return {...x,id:'daily-'+i,name:student.name,school:student.school,live:live[0]||null,state,result};
    }).filter(Boolean);
  }
  const api={assess,daily,operatingReady,latestSubmissions,timed,same,plus};if(typeof module!=='undefined')module.exports=api;else root.ExamReadiness=api;
})(typeof window!=='undefined'?window:this);
