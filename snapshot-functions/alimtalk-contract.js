/* Shared image-card / Alimtalk rules. No credentials, contacts or transport. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TimetableAlimtalk=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const templateId='KA01TP261028065644021KW04bfNV32J';
  const pfId='KA01PF261023080711057TMM3XbQDxHN';
  const templateName='에스학원 반포 하루 수업 상세 안내';
  // Exact text observed in the SOLAPI detail UI on 2026-10-28. Recheck server-side before send.
  const content='[에스학원 반포 수업 일정 안내]\n\n#{학생명} 학생의 확정된 수업 일정을 안내드립니다.\n\n- 수업일: #{수업일}\n- 등원 시각: #{등원시각}\n\n[수업 안내: 과목·시간·강사·관·강의실]\n#{수업목록}\n\n위 수업 일정에 관한 문의는 아래 ‘수업 문의’ 버튼을 이용해 주세요.\n\n감사합니다.\n에스학원 반포';
  const labels={REQUESTING:'요청 중',ACCEPTED:'접수',PROCESSING:'처리 중',DELIVERED:'수신 완료',FAILED:'실패',UNKNOWN:'결과 확인 필요'};
  function exclusion(row){
    if(row.generated===true||row.isBreak===true)return '자동 생성 공강';
    const s=String(row.status||'').trim();
    if(['결석예고','결석','당일취소','당취','휴강'].includes(s))return s;
    return '';
  }
  function time(s){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s)))return NaN;return Number(s.slice(0,2))*60+Number(s.slice(3));}
  function clock(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;}
  function normalize(rows,studentId,date){
    const reasons=[],excluded=[],lessons=[];
    if(!studentId)reasons.push('학생 ID 연결 필요');
    if(!validDate(date))reasons.push('한국 기준 대상일 확인 필요');
    for(const r of rows){
      if(r.studentId!==studentId||r.date!==date){reasons.push('학생 ID 또는 대상일 불일치');continue;}
      const why=exclusion(r);if(why){excluded.push({sourceId:r.sourceId||'',reason:why});continue;}
      if(Array.isArray(r.reviewReasons)&&r.reviewReasons.length){reasons.push(...r.reviewReasons.map(reason=>['시간 메모 확인 필요','강의실 표기 확인 필요'].includes(reason)?reason:'원본 수업 확인 필요'));continue;}
      const fields=['subject','teacher','building','room','type','sourceId'];
      if(fields.some(k=>typeof r[k]!=='string'||!r[k].trim())){reasons.push('필수 수업 정보 누락');continue;}
      const start=time(r.start),end=time(r.end);
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){reasons.push('수업 시각 확인 필요');continue;}
      lessons.push({subject:r.subject.trim(),teacher:r.teacher.trim(),building:r.building.trim(),room:r.room.trim(),type:r.type.trim(),start,end,sourceIds:[r.sourceId]});
    }
    lessons.sort((a,b)=>a.start-b.start||a.end-b.end||JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const merged=[];
    for(const l of lessons){
      const last=merged[merged.length-1];
      const same=last&&['subject','teacher','building','room','type'].every(k=>last[k]===l[k]);
      // Only adjacent repeated cells merge. Overlapping entries always require human review.
      if(last&&l.start<last.end)reasons.push('수업 시간 충돌');
      if(same&&last.end===l.start){last.end=l.end;last.sourceIds.push(...l.sourceIds);}else merged.push(l);
    }
    if(!merged.length)reasons.push('발송할 유효 수업 없음');
    return {lessons:merged,excluded,reasons:[...new Set(reasons)]};
  }
  function compose(student,date,rows){
    const result=normalize(rows,student.id,date);
    if(!student.name||student.mappingVerified!==true)result.reasons.push('학생 ID 매핑 미확인');
    const variables={'#{학생명}':student.name||'','#{수업일}':date,'#{등원시각}':result.lessons.length?clock(result.lessons[0].start):'',
      '#{수업목록}':result.lessons.map((l,i)=>(i<20?String.fromCharCode(0x2460+i):String(i+1)+'.')+' '+l.subject+' '+clock(l.start)+'–'+clock(l.end)+'\n'+l.teacher.replace(/(?:\s*선생님|T)$/,'')+' 선생님 · '+l.building+' · '+l.room+' · '+l.type).join('\n')};
    const text=content.replace(/#\{[^}]+\}/g,key=>variables[key]);
    if(text.length>1000)result.reasons.push('본문 1,000자 제한 초과');
    if(/#\{[^}]+\}/.test(text))result.reasons.push('치환되지 않은 변수 또는 입력 확인 필요');
    return {...result,text,variables};
  }
  function verifyTemplate(t){
    return !!t&&t.templateId===templateId&&(t.channelId||t.pfId)===pfId&&t.name===templateName&&t.status==='APPROVED'&&t.content===content&&!t.isDeleted&&!t.isHidden;
  }
  function mask(phone){return /^010\d{8}$/.test(phone)?phone.slice(0,3)+'-****-'+phone.slice(-4):'번호 확인 필요';}
  return {templateId,pfId,templateName,content,labels,exclusion,normalize,compose,verifyTemplate,mask,validDate};
});
