(function(root){
'use strict';
const el=(tag,s,cls)=>{const n=document.createElement(tag);if(s!==undefined)n.textContent=s;if(cls)n.className=cls;return n;};
const button=(s,fn)=>{const b=el('button',s);b.type='button';b.onclick=fn;return b;};
const body=(title,text)=>{const d=el('details');d.append(el('summary',title),el('pre',text));return d;};
const audienceName=a=>a==='student'?'학생 본인':'학부모';
const errorText=e=>({BATCH_CHANGED:'시간표, 번호 또는 발송 기록이 바뀌었습니다. 명단과 본문을 다시 확인하세요.',
 PREVIEW_EXPIRED:'검토 시간이 지났거나 대상이 바뀌었습니다. 다시 검토하세요.',FORBIDDEN:'반포관 관리자 로그인이 필요합니다.',
 SOURCE_INCOMPLETE:'원본 시간표에 해석할 수 없는 수업이 있습니다.',RATE_LIMIT:'잠시 후 이력을 확인하고 다시 검토하세요.',
 TEMPLATE_MISMATCH:'승인된 알림톡 양식을 확인할 수 없습니다.'}[e?.code]||'서버에서 확인하지 못했습니다. '+(e?.code||''));
function readLessons(text){
 const match=/\[수업 안내[^\]\n]*\]\n([\s\S]*?)\n\n수업 일정에 관한/.exec((text||'').replace(/\r/g,''));
 if(!match)return null;
 const list=match[1].trim();
 if(!list)return [];
 const lessons=[];
 for(const block of list.split(/\n\s*\n/)){
  const [heading,teacher,room,...extra]=block.trim().split('\n');
  const parts=/^(?:[①-⑳]|\d+\.)\s+(\S+)(.*?)\s+(\d\d:\d\d)\s*[–~-]\s*(\d\d:\d\d)$/.exec(heading);
  if(!parts||!teacher||!room||extra.length)return null;
  const [instructor,...format]=teacher.split(' · ');
  lessons.push({subject:parts[1],status:parts[2].trim(),time:parts[3]+'–'+parts[4],
   teacher:instructor,room,type:format.join(' · ').replace(/\s+\d+(?:시간|분).*$/,'')});
 }
 return lessons;
}
const lessonFields={subject:'과목',status:'수업 구분',time:'시간',teacher:'강사',room:'장소',type:'수업 방식'};
function lessonChanges(previous,current){
 const old=readLessons(previous),next=readLessons(current);
 if(!old||!next)return null;
 const changes=[];
 // Remove unchanged occurrences first. Only pair revisions with an unambiguous counterpart.
 for(let i=old.length-1;i>=0;i--){
  const j=next.findIndex(l=>Object.keys(lessonFields).every(k=>old[i][k]===l[k]));
  if(j>=0){old.splice(i,1);next.splice(j,1);}
 }
 for(const keys of [['subject','time'],['subject','teacher','room','status'],['subject'],['time']]){
  for(const before of [...old]){
   const same=l=>keys.every(k=>l[k]===before[k]);
   const candidates=next.filter(same);
   if(candidates.length!==1||old.filter(same).length!==1)continue;
   const after=candidates[0];
   changes.push({before,after});old.splice(old.indexOf(before),1);next.splice(next.indexOf(after),1);
  }
 }
 return [...changes,...old.map(before=>({before})),...next.map(after=>({after}))];
}
function renderChanges(host,p,who){
 const changes=p.changes||[];
 const count=el('div',undefined,'change-overview');
 count.append(el('h3','변경 대상자 알림톡'),el('span',who+' · '+p.date));
 host.replaceChildren(count);
 if(!changes.length){
  const empty=el('section',undefined,'change-empty');
  empty.append(el('strong','변경된 안내가 없습니다'),el('p',who+'에게 전달된 알림톡 중 현재 시간표와 달라진 안내가 없습니다.'));
  host.append(empty);return;
 }
 host.append(el('p','수업 안내가 달라진 학생 '+changes.length+'명','change-count'));
 for(const student of changes){
  const group=el('section',undefined,'change-student');
  group.append(el('h4',student.name));
  if(student.issue)group.append(el('span',student.issue,'change-hold'));
  // Two guardians may have received different versions for the same student.
  const histories=new Map();
  for(const r of student.comparisons){
   if(!histories.has(r.previous))histories.set(r.previous,new Set());
   histories.get(r.previous).add(r.relation||who);
  }
  for(const [previous,relations] of histories){
   const diff=lessonChanges(previous,student.current);
   group.append(el('div',[...relations].join(' · ')+' 수신본 기준','change-caption'));
   for(const {before,after} of diff||[]){
    const lesson=after||before, row=el('div',undefined,'change-lesson');
    const kind=before&&after?'edit':after?'add':'remove';
    const label={edit:'변경',add:'추가',remove:'제외'}[kind];
    const title=el('div',undefined,'change-title');
    title.append(el('span',label,'change-tag '+kind),el('strong',lesson.subject+' '+lesson.status));
    row.append(title);
    if(kind==='edit'){
     for(const [key,caption] of Object.entries(lessonFields)){
      if(before[key]===after[key])continue;
      const line=el('div',undefined,'change-field');
      line.append(el('span',caption),el('del',before[key]||'미표기'),el('span','→'),el('strong',after[key]||'미표기'));
      row.append(line);
     }
     if(before.time===after.time)row.append(el('small',lesson.time));
    }else row.append(el('p',[lesson.time,lesson.teacher,lesson.room,lesson.type].filter(Boolean).join(' · ')));
    group.append(row);
   }
   if(!diff?.length)group.append(el('p','수업 목록 외 문구 또는 이전 양식의 변경입니다. 두 본문을 확인하세요.'));
   group.append(body('이전에 받은 본문',previous||'이전 본문 기록 없음'));
  }
  group.append(body('현재 안내 본문',student.current));host.append(group);
 }
}
function mount({host,api,context,refresh}){
 let seq=0;
 const reset=()=>{seq++;};
 function view(){const generation=++seq,key=JSON.stringify(context());host.hidden=false;host.replaceChildren();return ()=>generation===seq&&key===JSON.stringify(context());}
 const note=(s)=>el('p',s,'bulk-note');
 async function review(mode){
  const current=view(),{date,audience}=context(),who=audienceName(audience);
  host.append(note('최신 시간표와 발송 기록을 확인하고 있습니다…'));
  try{
   const p=await api('batchPreview',{date,audience,mode});if(!current())return;
   host.replaceChildren(el('h3',who+' · '+(mode==='changed'?'변경 대상자 발송':'미발송 일괄 발송')),note(date+' 수업 안내 · 받을 번호를 선택하고 본문을 확인하세요.'));
   if(mode==='changed'){
    renderChanges(host,p,who);
    if(p.readOnly||!p.items.length)return;
    host.append(el('h4','변경 안내를 받을 번호 선택'));
   }
   const data=p.items,held=mode==='changed'?[]:p.rows.filter(r=>r.issue);
   if(held.length){const h=el('details');h.append(el('summary','확인이 필요한 학생 '+held.length+'명'));held.forEach(r=>h.append(note(r.name+' · '+r.issue)));host.append(h);}
   if(!data.length){host.append(note(mode==='changed'?'이전에 받은 안내와 내용이 다르고, 받는 번호까지 확인된 대상이 없습니다.':'현재 발송할 수 있는 미발송 번호가 없습니다.'));return;}
   const chosen=new Set(),checks=[];
   const bulk=el('label',undefined,'bulk-pick'),all=el('input');all.type='checkbox';bulk.append(all,document.createTextNode(' 가능한 번호 전체 선택 ('+data.length+'건)'));host.append(bulk);
   const students=new Map();for(const item of data){if(!students.has(item.studentId))students.set(item.studentId,[]);students.get(item.studentId).push(item);}
   for(const items of students.values()){
    const group=el('section',undefined,'bulk-review-row');group.append(el('strong',items[0].name));
    for(const item of items){const l=el('label'),i=el('input');i.type='checkbox';checks.push([i,item.ticket]);i.onchange=()=>{if(i.checked)chosen.add(item.ticket);else chosen.delete(item.ticket);sync();};
     l.append(i,document.createTextNode(' '+item.relation+' · '+item.masked+(item.retry?' · 실패 건 재시도':'')));group.append(l);
    }
    group.append(body('보낼 본문 보기',items[0].text));host.append(group);
   }
   const foot=el('div',undefined,'bulk-confirm-footer'),count=el('strong'),verify=button('선택 내역 검토',confirm),title=mode==='changed'?'변경 알림톡':'시간표 알림톡';
   foot.append(count,verify);host.append(foot);
   all.onchange=()=>{for(const [i,t] of checks){i.checked=all.checked;if(i.checked)chosen.add(t);else chosen.delete(t);}sync();};
   function sync(){count.textContent=chosen.size+'건 선택';verify.disabled=!chosen.size;all.checked=chosen.size===data.length;all.indeterminate=chosen.size>0&&chosen.size<data.length;}
   sync();
   function confirm(){
    if(!current()||!chosen.size)return;
    const selection=data.filter(x=>chosen.has(x.ticket));host.replaceChildren(el('h3','최종 발송 확인'),note(date+' · '+who+' · '+title));
    for(const [id,items] of students){const picked=items.filter(x=>chosen.has(x.ticket));if(!picked.length)continue;
     const block=el('section',undefined,'bulk-review-row');block.append(el('strong',items[0].name),note(picked.map(x=>x.relation+' '+x.masked).join(' / ')),body('발송 본문 확인',items[0].text));host.append(block);}
    const ack=el('label',undefined,'bulk-pick'),ck=el('input');ck.type='checkbox';ack.append(ck,document.createTextNode(' 수신자와 발송 본문을 확인했습니다.'));
    const send=button(who+' '+selection.length+'건 발송',async()=>{
     if(send.disabled||!current()||!ck.checked)return;
     send.disabled=true;ck.disabled=true;back.disabled=true;const progress=note('발송 요청 중…');progress.setAttribute('role','status');host.append(progress);
     let done=0;const counts={};try{
      for(let i=0;i<selection.length;i+=4){if(!current())return;
       const part=selection.slice(i,i+4);const result=await api('batchSend',{date,audience,mode,previewId:p.previewId,confirmed:true,tickets:part.map(x=>x.ticket)});
       if(!current())return;
       for(const x of result.results){counts[x.state]=(counts[x.state]||0)+1;done++;}
       progress.textContent=selection.length+'건 중 '+done+'건 처리';
      }
      if(current())progress.textContent=done+'건 처리 · '+Object.entries(counts).map(([s,n])=>(root.TimetableAlimtalk.labels[s]||s)+' '+n+'건').join(' / ');
     }catch(e){if(current())progress.textContent=done+'건 처리 후 중단. '+errorText(e)+' 자동으로 재발송하지 않습니다. 전체 발송 이력을 확인하세요.';}
     if(current()){host.append(button('전체 발송 이력 보기',history));refresh();}
    });send.className='send-action';send.disabled=true;ck.onchange=()=>{send.disabled=!ck.checked;};
    const back=button('대상 다시 고르기',()=>review(mode));host.append(ack,back,send);ack.scrollIntoView?.({block:'nearest'});
   }
  }catch(e){if(current()){host.replaceChildren(note(errorText(e)),button('명단 다시 확인',()=>review(mode)));}}
 }
 async function history(){
  const current=view(),{date,audience}=context();
  host.append(note('발송 이력을 불러오는 중…'));
  try{
   const {results}=await api('batchHistory',{date,audience});if(!current())return;
   host.replaceChildren(el('h3',audienceName(audience)+' · 전체 발송 이력'),note(date+' 수업 안내 · 최근 요청 순'));
   if(!results.length)host.append(note('이 수업일에 해당 대상으로 발송한 알림톡이 없습니다.'));
   const pending=results.filter(r=>['REQUESTING','ACCEPTED','PROCESSING','UNKNOWN'].includes(r.state));
   if(pending.length){
    const update=button('미확정 '+pending.length+'건 결과 갱신',async()=>{
     update.disabled=true;
     try{for(let i=0;i<pending.length;i+=5){if(!current())return;await api('batchRefresh',{date,audience,ids:pending.slice(i,i+5).map(r=>r.id)});}
      if(current()){await history();refresh();}
     }catch(e){if(current()){host.append(note(errorText(e)));update.disabled=false;}}
    });host.append(update);
   }
   for(const r of results){const group=el('section',undefined,'bulk-review-row');
    const stamp=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(r.createdAt);
    group.append(el('strong',r.name+' · '+(root.TimetableAlimtalk.labels[r.state]||'결과 확인 필요')),note([r.relation,r.masked,stamp,r.batch?'일괄':'개별'].join(' · ')));
    if(r.errorCode)group.append(note('결과 코드: '+r.errorCode));
    if(r.text)group.append(body('보낸 본문',r.text));
    if(['REQUESTING','PROCESSING','ACCEPTED','UNKNOWN'].includes(r.state)){
     const check=button('수신 결과 조회',async()=>{check.disabled=true;try{await api(audience==='student'?'studentReconcile':'reconcile',{id:r.id});if(current()){await history();refresh();}}catch(e){if(current()){group.append(note(errorText(e)));check.disabled=false;}}});group.append(check);}
    host.append(group);}
  }catch(e){if(current())host.replaceChildren(note(errorText(e)),button('이력 다시 확인',history));}
 }
 return {review,history,reset,errorText};
}
root.TimetableBatchUI={mount,errorText,lessonChanges};
})(globalThis);
