/* Shared image-card / Alimtalk rules. No credentials, contacts or transport. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TimetableAlimtalk=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const templateId='KA01TP261031071126880OfXypO8g3NZ';
  const pfId='KA01PF261023080711057TMM3XbQDxHN';
  const templateName='반포관 등원 안내 알림톡';
  // Exact text observed in the SOLAPI template API on 2026-11-06. Recheck server-side before send.
  const content="[에스학원 수업 일정 안내]\n#{학생명} 학생의 수업 안내드립니다.\n\n▶ 수업일: #{수업일}\n▶ 등원 시각: #{등원시각}\n\n[수업 안내: 과목·시간·강사·관·강의실]\n#{수업목록}\n\n수업 일정에 관한 변경 문의는 아래 ‘수업 문의’ 버튼을 이용해 주세요 💬\n\n전과목, 소수 정예 수업\n 💫 반포 에스학원";
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
  // A clock without 오전/오후 is resolved only against this lesson's grid block.
  // Attendance lateness does not change the scheduled lesson category.
  function scheduleStatus(status){const s=String(status||'').trim();return s==='지각'?'정규':s;}
  function lessonStatusLabel(status,todayOnly){
    const labels={정규:'정규',보충:'보충',보강:'보강',결석보강:'결석보강',당취보충:'당취보충',일반보충:'보충',오늘만:'오늘만',첫수업:'첫수업',신규생:'신규생'};
    const label=Object.hasOwn(labels,status)?labels[status]:'';
    return todayOnly&&label!=='오늘만'?[label,'오늘만'].filter(Boolean).join(' · '):label;
  }
  // Retaker labels are academic fields. Do not search free-text notes for them.
  function isRetakerLabel(value){
    return /^(?:고3@|재수(?:생|[12])?|삼수(?:생)?|교육청(?:[123](?:학년)?)?)$/.test(String(value||'').replace(/\s+/g,''));
  }
  function isHomeschoolLabel(label){
    return /^홈스쿨(?:링)?[1-6]$/.test(String(label||''));
  }
  function directorySchoolKey(school,grade){
    const name=String(school||'').trim();
    const level=String(grade||'').trim();
    if(isRetakerLabel(name)||isRetakerLabel(level)||isRetakerLabel(name+level))return '재수생';
    const digit=level.match(/^(?:초|중|고)?([1-6])(?:학년)?$/);
    if(!name||!digit)return '';
    return name.replace(/고등학교$/,'고').replace(/중학교$/,'중').replace(/초등학교$/,'초')+digit[1];
  }
  // Each grid cell is scoped before adjacent lessons are merged. Only a dated
  // heading starts a new entry; dates mentioned inside an explanation do not.
  function timeNoteForDate(note,date){
    const text=String(note||'').trim();
    if(!text||!validDate(date))return text;
    const heading=/(?:^|[;,，\n]|\s+\/\s+)\s*(?:(\d{4})-(\d{1,2})-(\d{1,2})|(?:(\d{4})\s*[/년]\s*)?(\d{1,2})\s*[/월]\s*(\d{1,2})일?)(?!\d)(?:\s*\([월화수목금토일](?:요일)?\))?/g;
    const entries=[...text.matchAll(heading)];
    if(!entries.length)return text;
    const kept=[text.slice(0,entries[0].index)];
    entries.forEach((entry,index)=>{
      const body=text.slice(entry.index+entry[0].length,entries[index+1]?.index??text.length);
      const month=Number(entry[2]||entry[5]),day=Number(entry[3]||entry[6]);
      const targetYear=Number(date.slice(0,4));
      let year=Number(entry[1]||entry[4]||targetYear);
      if(!entry[1]&&!entry[4]){
        const distance=month-Number(date.slice(5,7));
        if(distance>6)year--;
        if(distance< -6)year++;
      }
      const key=[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
      const effectiveFrom=/^\s*(?:부터|이후)/.test(body)&&key<=date;
      const effectiveUntil=/^\s*까지/.test(body)&&date<=key;
      const oneDayOnly=body.includes('오늘만');
      // Keep ambiguous date ranges for review rather than discard an applicable instruction.
      if(!validDate(key)||key===date||/^\s*[-~～–]/.test(body)||(!oneDayOnly&&(effectiveFrom||effectiveUntil)))kept.push(body);
    });
    return kept.join(' ').trim();
  }
  function readTimeNote(note,status,date){
    note=timeNoteForDate(note,date);
    // Only 오늘만 introduces this shorthand. Dates and durations are not clock ranges.
    const todayRange=/(오늘만\s*)(\d{1,2})\s*[-~～–—]\s*(\d{1,2})\s*시(?![간\d]|\s*\d)/g;
    let todayOnly=false;
    note=String(note||'').replace(todayRange,(_,prefix,start,end)=>{
      todayOnly=true;
      return prefix+start+':00-'+end+':00';
    });
    // Explicit arrival records are attendance notes, not lesson start/end overrides.
    if(status==='지각'||/지각/.test(note))note=note.replace(/(?:오전|오후)?\s*\d{1,2}:\d{2}\s*도착(?:\s*예정)?/g,' ');
    const token='(오전|오후)?\\s*(\\d+)(?::(\\d+)|\\s*시(?:\\s*(\\d+)\\s*분?)?)';
    const pattern=new RegExp('(?:^|[^\\d:])'+token+'\\s*[-~～–—]\\s*'+token+'(?![\\d:])','g');
    function candidates(hour,minute,period){
      hour=Number(hour);minute=Number(minute);
      if(hour>24||minute>=60||minute%30||hour===24&&minute)return [];
      const hours=period?(hour>=1&&hour<=12?[hour%12+(period==='오후'?12:0)]:[]):hour>=1&&hour<=12?[hour%12,hour%12+12]:[hour];
      return hours.map(h=>h*60+minute);
    }
    const ranges=[];
    let rest=note.replace(pattern,(_,p1,h1,m1,k1,p2,h2,m2,k2)=>{
      ranges.push([candidates(h1,m1||k1||0,p1),candidates(h2,m2||k2||0,p2)]);return ' ';
    });
    // The makeup ends at the stated time. Its start comes from its own grid block.
    if(status==='보강'||status==='결석보강')rest=rest.replace(/(?:^|[,，]\s*|\s+)(오전|오후)?\s*(\d{1,2}):(\d{2})\s*까지\s*(?:결석)?보강(?=$|[\s.,，])/g,(_,period,hour,minute)=>{
      ranges.push([null,candidates(hour,minute,period)]);
      return ' ';
    });
    const held=/\d+\s*분\s*\d+\s*초|\d+:\d+:\d+/.test(note)||/\d{1,2}\s*:\s*\d{2}|\d+\s*시(?!간)|시간\s*변경/.test(rest)
      ||ranges.some(([a,b])=>(a!==null&&!a.length)||!b.length);
    return {ranges,held,todayOnly};
  }
  function applyTimeNotes(block){
    let selected=null;
    for(const [starts,ends] of block.timeRanges){
      const possible=(starts||[block.start]).flatMap(start=>ends.filter(end=>end>start&&start>=block.start-30&&end<=block.end+30).map(end=>[start,end]));
      if(possible.length!==1||(selected&&(selected[0]!==possible[0][0]||selected[1]!==possible[0][1])))return false;
      selected=possible[0];
    }
    if(selected)[block.start,block.end]=selected;
    return true;
  }
  function cardTimeRange(startHour,endHour,note,status){
    const parsed=readTimeNote(note,status);
    const block={start:startHour*60,end:endHour*60,timeRanges:parsed.ranges};
    if(parsed.held||!applyTimeNotes(block))return {start:startHour,end:endHour,todayOnly:false};
    return {start:block.start/60,end:block.end/60,todayOnly:parsed.todayOnly};
  }
  function normalize(rows,studentId,date){
    const reasons=[],excluded=[],lessons=[];
    if(!studentId)reasons.push('학생 ID 연결 필요');
    if(!validDate(date))reasons.push('한국 기준 대상일 확인 필요');
    for(const r of rows){
      if(r.studentId!==studentId||r.date!==date){reasons.push('학생 ID 또는 대상일 불일치');continue;}
      const why=exclusion(r);if(why){excluded.push({sourceId:r.sourceId||'',reason:why});continue;}
      const review=Array.isArray(r.reviewReasons)?r.reviewReasons:[];
      const timeHeld=review.includes('시간 메모 확인 필요');
      if(review.length){
        reasons.push(...review.map(reason=>['시간 메모 확인 필요','강의실 표기 확인 필요'].includes(reason)?reason:'원본 수업 확인 필요'));
        // Show the complete grid interval in a held preview; never treat an ambiguous note as a new start.
        if(review.some(reason=>reason!=='시간 메모 확인 필요'))continue;
      }
      const fields=['subject','teacher','building','room','type','sourceId'];
      if(fields.some(k=>typeof r[k]!=='string'||!r[k].trim())){reasons.push('필수 수업 정보 누락');continue;}
      const start=time(r.start),end=r.end==='24:00'?1440:time(r.end);
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){reasons.push('수업 시각 확인 필요');continue;}
      lessons.push({subject:r.subject.trim(),teacher:r.teacher.trim(),building:r.building.trim(),room:r.room.trim(),type:r.type.trim(),status:scheduleStatus(r.status),timeHeld,timeRanges:[...(r.timeRanges||[])],todayOnly:r.todayOnly===true,start,end,sourceIds:[r.sourceId]});
    }
    lessons.sort((a,b)=>a.start-b.start||a.end-b.end||JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const merged=[];
    for(const l of lessons){
      const last=merged[merged.length-1];
      const same=last&&['subject','teacher','building','room','type','status'].every(k=>last[k]===l[k]);
      // Only adjacent repeated cells merge. Overlapping entries always require human review.
      if(last&&l.start<last.end)reasons.push('수업 시간 충돌');
      if(same&&last.end===l.start){last.end=l.end;last.timeHeld||=l.timeHeld;last.todayOnly=last.todayOnly||l.todayOnly;last.timeRanges.push(...l.timeRanges);last.sourceIds.push(...l.sourceIds);}else merged.push(l);
    }
    for(const block of merged){
      if(!block.timeHeld&&!applyTimeNotes(block))reasons.push('시간 메모 확인 필요');
      delete block.timeHeld;delete block.timeRanges;
    }
    merged.sort((a,b)=>a.start-b.start||a.end-b.end);
    if(merged.some((l,i)=>i>0&&l.start<merged[i-1].end))reasons.push('수업 시간 충돌');
    if(!merged.length)reasons.push('발송할 유효 수업 없음');
    return {lessons:merged,excluded,reasons:[...new Set(reasons)]};
  }
  function formatLesson(l, index){
    const number=index<20?String.fromCharCode(0x2460+index):(index+1)+'.';
    const minutes=l.end-l.start, hours=Math.floor(minutes/60), rest=minutes%60;
    const duration=[hours&&hours+'시간',rest&&rest+'분'].filter(Boolean).join(' ');
    const teacher=l.teacher?l.teacher.replace(/(?:\s*(?:선생님|T))+$/iu,'').trimEnd()+'T':'강사 확인 필요';
    return [
      number+' '+[l.subject,lessonStatusLabel(l.status,l.todayOnly)].filter(Boolean).join(' ')+' '+clock(l.start)+'–'+clock(l.end)+(l.end===1440?'(자정)':''),
      teacher+' · '+l.type+' '+duration,
      l.building+' '+l.room
    ].join('\n');
  }
  function compose(student,date,rows){
    const result=normalize(rows,student.id,date);
    if(!student.name||student.mappingVerified!==true)result.reasons.push('학생 ID 매핑 미확인');
    const variables={'#{학생명}':student.name||'','#{수업일}':date,'#{등원시각}':result.lessons.length?clock(result.lessons[0].start):'',
      '#{수업목록}':result.lessons.map(formatLesson).join('\n\n')};
    const text=content.replace(/#\{[^}]+\}/g,key=>variables[key]);
    if(text.length>1000)result.reasons.push('본문 1,000자 제한 초과');
    if(/#\{[^}]+\}/.test(text))result.reasons.push('치환되지 않은 변수 또는 입력 확인 필요');
    return {...result,text,variables};
  }
  function verifyTemplate(t){
    return !!t&&t.templateId===templateId&&(t.channelId||t.pfId)===pfId&&t.name===templateName&&t.status==='APPROVED'&&t.content===content&&!t.isDeleted&&!t.isHidden;
  }
  function mask(phone){return /^010\d{8}$/.test(phone)?phone.slice(0,3)+'-****-'+phone.slice(-4):'번호 확인 필요';}
  return {templateId,pfId,templateName,content,labels,exclusion,isRetakerLabel,isHomeschoolLabel,directorySchoolKey,timeNoteForDate,scheduleStatus,readTimeNote,cardTimeRange,lessonStatusLabel,normalize,formatLesson,compose,verifyTemplate,mask,validDate};
});
