(function(root){
'use strict';
const el=(tag,s,cls)=>{const n=document.createElement(tag);if(s!==undefined)n.textContent=s;if(cls)n.className=cls;return n;};
const button=(s,fn)=>{const b=el('button',s);b.type='button';b.onclick=fn;return b;};
const body=(title,text)=>{const d=el('details');d.append(el('summary',title),el('pre',text));return d;};
const audienceName=a=>a==='student'?'학생 본인':'학부모';
const errorText=e=>({BATCH_CHANGED:'시간표, 번호 또는 발송 기록이 바뀌었습니다. 명단과 본문을 다시 확인하세요.',
 PREVIEW_EXPIRED:'검토 시간이 지났거나 대상이 바뀌었습니다. 다시 검토하세요.',FORBIDDEN:'반포관 실무자 권한을 확인할 수 없습니다. 허브 로그인과 시간표·데스크 접근 권한을 확인해 주세요.',
 RESULT_UNCERTAIN:'서버에서 이번 묶음의 결과를 확정하지 못했습니다.',TIMEOUT:'서버 응답이 늦어 이번 묶음의 결과를 확인하지 못했습니다.',NETWORK_UNAVAILABLE:'네트워크 연결이 끊겼습니다.',SOURCE_INCOMPLETE:'원본 시간표에 해석할 수 없는 수업이 있습니다.',RATE_LIMIT:'잠시 후 이력을 확인하고 다시 검토하세요.',
 RECEIPT_FOUND:'기존 접수 기록이 확인되거나 상태가 바뀌었습니다. 발송 이력을 갱신해 주세요.',RECEIPT_REVIEW_REQUIRED:'접수 미확정 기록만 미접수 확인 처리할 수 있습니다.',RECEIPT_REVIEW_TOO_EARLY:'최초 요청 후 10분 동안은 접수 기록을 다시 확인해 주세요.',
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
 let seq=0,sending=false;

 // Only lock this modal. Session and date changes still invalidate outstanding requests.
 function lock(){
  const modal=host.closest('#studentImageModal');
  const controls=Array.from(modal?.querySelectorAll('.card-modal-head button,.card-mode-tabs,.batch-bar,.student-list-panel,.card-actions')||[]).filter(n=>!n.inert);
  for(const n of controls)n.inert=true;
  const warn=e=>{e.preventDefault();e.returnValue='';};
  root.addEventListener('beforeunload',warn);
  return ()=>{for(const n of controls)n.inert=false;root.removeEventListener('beforeunload',warn);};
 }
 const reset=()=>{seq++;};
 function view(){const generation=++seq,key=JSON.stringify(context());host.hidden=false;host.replaceChildren();return ()=>generation===seq&&key===JSON.stringify(context());}
 const note=(s)=>el('p',s,'bulk-note');
 function loading(message){
  const box=el('div',undefined,'roster-loading');box.setAttribute('role','status');
  const spinner=el('span',undefined,'batch-orbit');spinner.setAttribute('aria-hidden','true');
  box.append(spinner,note(message));return box;
 }
 function holds(rows){
  for(const [title,items,help] of [
   ['학부모만 안내',rows.filter(r=>r.issue?.includes('본인 번호 없음')),'학생 본인 번호가 없어 이번 학생 발송에서 제외됩니다. 학부모 수신 여부는 학부모 발송 메뉴에서 확인하세요.'],
   ['정보 확인 필요',rows.filter(r=>r.issue&&!r.issue.includes('본인 번호 없음')),'아래 사유를 확인하고 학생·연락처 정보를 보완한 뒤 명단을 다시 확인하세요.']
  ]){
   if(!items.length)continue;
   const details=el('details',undefined,'bulk-holds');details.append(el('summary',title+' '+items.length+'명'),note(help));
   items.forEach(r=>details.append(note(r.name+' · '+r.issue)));host.append(details);
  }
 }
 function studentBack(target){
  if(target)host.prepend(button('← 학생 목록',()=>{reset();host.hidden=true;delete host.dataset.bulk;}));
 }
 // The card button is the user's send instruction. Server checks still run before dispatch.
 async function quickSend(mode,target){
  if(sending||!target?.studentId)return;
  const current=view(),ctx=context(),{date,audience}=ctx,who=audienceName(audience);
  sending=true;const unlock=lock();let attempted=false,results=null;
  const title=el('h3',target.name+' · '+who),status=loading('받는 번호와 최신 시간표를 확인하고 있습니다…');
  host.append(title,note(date+' 수업 안내'),status);
  try{
   const p=await api('batchPreview',{date,audience,mode,studentIds:[target.studentId]});if(!current())return;
   if(p.readOnly)throw Object.assign(Error(),{code:'FORBIDDEN'});
   const items=(p.items||[]).filter(r=>r.studentId===target.studentId);
   if(!items.length){
    const row=(p.rows||[]).find(r=>r.studentId===target.studentId);
    status.replaceChildren(note(row?.issue||'현재 발송 가능한 번호가 없습니다. 기존 발송 결과를 확인해 주세요.'));
    return;
   }
   host.append(note(items.map(r=>r.relation+' · '+r.masked).join(' / ')),body('발송 본문',items[0].text));
   status.querySelector('p').textContent=who+' '+items.length+'건 발송 중…';
   attempted=true;
   const response=await api('batchSend',{date,audience,mode,previewId:p.previewId,confirmed:true,tickets:items.map(r=>r.ticket)});
   if(!current())return;
   if(!Array.isArray(response?.results)||response.results.length!==items.length||!response.results.every(r=>r.studentId===target.studentId&&Object.hasOwn(root.TimetableAlimtalk.labels,r.state)))throw Object.assign(Error(),{code:'RESULT_UNCERTAIN'});
   results=response.results;
   const allDelivered=results.every(r=>r.state==='DELIVERED'),attention=results.some(r=>['FAILED','UNKNOWN'].includes(r.state));
   status.replaceChildren(el('strong',allDelivered?'수신 완료':attention?'발송 결과 확인 필요':'발송 요청 접수 완료'),note(allDelivered?'안내 수신이 확인되었습니다.':attention?'실패 또는 미확정 건은 발송 이력에서 확인하세요.':'최종 수신 결과는 확인 중입니다. 다음 학생에게 이어서 발송할 수 있습니다.'));
  }catch(e){
   if(current())status.replaceChildren(note(errorText(e)),note(attempted?'접수 여부는 발송 이력에서 확인하세요. 같은 요청을 자동으로 다시 보내지 않습니다.':'발송 전 확인을 완료하지 못해 보내지 않았습니다.'));
  }finally{
   sending=false;unlock();
   if(current()){
    status.setAttribute('role','status');
    host.append(button('이 학생 발송 이력 보기',()=>history(target)));
    studentBack(target);
    // Updating one student never clears or blocks the rest of the roster.
    refresh({studentIds:[target.studentId],submitted:attempted,results,background:true});
   }
  }
 }
 async function review(mode,target=null){
  if(sending)return;
  const current=view(),{date,audience}=context(),who=audienceName(audience),showHistory=()=>history(target),reviewAgain=()=>review(mode,target);
  host.append(loading('최신 시간표와 발송 기록을 확인하고 있습니다…'));
  try{
   const response=await api('batchPreview',{date,audience,mode,...(target?{studentIds:[target.studentId]}:{})});if(!current())return;
   // Filter by stable student ID, never by display name; send only these server-issued tickets.
   const p=target?{...response,items:response.items.filter(r=>r.studentId===target.studentId),rows:response.rows.filter(r=>r.studentId===target.studentId),changes:(response.changes||[]).filter(r=>r.studentId===target.studentId),eligibleStudents:(response.eligibleStudents||[]).filter(r=>r.studentId===target.studentId)}:response;
   host.replaceChildren(el('h3',(target?target.name+' · ':'')+who+' · '+(mode==='changed'?'변경 대상자 발송':target?'발송 확인':'발송 대기 명단')),note(date+' 수업 안내 · 받을 번호를 선택하고 본문을 확인하세요.'));
   studentBack(target);
   if(target&&p.readOnly){host.append(note('조회 전용 권한입니다. 발송 권한이 있는 실무자 계정으로 확인해 주세요.'));return;}
   if(mode==='changed'&&!target){
    renderChanges(host,p,who);
    if(p.readOnly||!p.items.length)return;
    host.append(el('h4','변경 안내를 받을 번호 선택'));
   }
   if(p.readOnly){
    const head=el('div',undefined,'change-overview');
    head.append(el('h3',who+' 일괄 발송 미리보기'),el('span',date+' · 조회 전용'));
    const eligible=p.eligibleStudents,held=p.rows.filter(r=>r.issue);
    const counts=el('p','전체 '+p.rows.length+'명 · 발송 가능 '+eligible.reduce((n,r)=>n+r.count,0)+'건 · 제외 '+held.length+'명','change-count');
    host.replaceChildren(head,counts);
    if(eligible.length){
     host.append(el('h4','발송 가능한 학생'));
     for(const r of eligible)host.append(body(r.name+' · '+r.count+'건 · 본문 보기',r.text));
    }
    holds(held);
    return;
   }
   const BATCH_SIZE=[8,40].includes(p.batchSize)?p.batchSize:4;
   const data=p.items,held=mode==='changed'?[]:p.rows.filter(r=>r.issue);
   if(mode==='unsent')host.append(el('p','전체 '+p.rows.length+'명 · 발송 가능 '+data.length+'건 · 제외 '+held.length+'명','change-count'));
   holds(held);
   if(!data.length){host.append(note(mode==='changed'?'이전에 받은 안내와 내용이 다르고, 받는 번호까지 확인된 대상이 없습니다.':'현재 발송할 수 있는 대기 번호가 없습니다. 수신 결과는 전체 발송 이력에서 확인하세요.'));host.append(button(target?'이 학생 발송 이력 보기':'전체 발송 이력 보기',showHistory));return;}
   const chosen=new Set(),checks=[];
   const bulk=el('label',undefined,'bulk-pick'),all=el('input');all.type='checkbox';bulk.append(all,document.createTextNode(' 가능한 번호 전체 선택 ('+data.length+'건)'));if(!target)host.append(bulk);
   const students=new Map();for(const item of data){if(!students.has(item.studentId))students.set(item.studentId,[]);students.get(item.studentId).push(item);}
   host.append(note('알림톡 전달에 실패하면 같은 번호로 문자 대체 발송을 시도합니다.'));
   const list=el('details',undefined,'bulk-pick-list');
   if(target)list.open=true;
   list.append(el('summary','수신자별 선택 · 본문 보기 ('+data.length+'건)'));host.append(list);
   for(const items of students.values()){
    const group=el('section',undefined,'bulk-review-row');group.append(el('strong',items[0].name));
    for(const item of items){const l=el('label'),i=el('input');i.type='checkbox';checks.push([i,item.ticket]);i.onchange=()=>{if(i.checked)chosen.add(item.ticket);else chosen.delete(item.ticket);sync();};
     l.append(i,document.createTextNode(' '+item.relation+' · '+item.masked+(item.retry?' · 실패 건 재시도':'')));group.append(l);
    }
    const content=body('보낼 본문 보기',items[0].text);if(target)content.open=true;group.append(content);
    if(mode==='changed'&&target)group.append(body('이전에 받은 본문',items[0].previous||'이전 본문 기록 없음'));list.append(group);
   }
   const foot=el('div',undefined,'bulk-confirm-footer bulk-send-footer');
   const ack=el('label',undefined,'bulk-pick'),ck=el('input');ck.type='checkbox';
   ack.append(ck,document.createTextNode(' 수신자와 본문을 확인했습니다.'));
   const selected=el('strong',undefined,'bulk-selection'),guidance=el('span',undefined,'bulk-guidance');
   const send=button('',start);send.className='send-action';
   foot.append(selected,ack,guidance,send);host.append(foot);
   all.onchange=()=>{for(const [i,t] of checks){i.checked=all.checked;if(i.checked)chosen.add(t);else chosen.delete(t);}sync();};
   function sync(){ck.checked=false;ck.disabled=!chosen.size;all.checked=chosen.size===data.length;all.indeterminate=chosen.size>0&&!all.checked;update();}
   function update(){selected.textContent=date+' · '+who+' · '+chosen.size+'건 선택';guidance.textContent=!chosen.size?'받을 번호를 선택하세요.':!ck.checked?'수신자와 본문 확인 후 체크해 주세요.':'선택한 번호로만 발송합니다.';send.textContent=who+' '+chosen.size+'건 '+(mode==='changed'?'변경 안내 발송':'발송');send.disabled=!chosen.size||!ck.checked||sending;}
   ck.onchange=update;
   if(target)for(const [i,t] of checks){i.checked=true;chosen.add(t);}
   sync();
   async function start(){
    if(sending||send.disabled||!current()||!ck.checked||!chosen.size)return;
    sending=true;send.disabled=true;const unlock=lock();
    const selection=data.filter(x=>chosen.has(x.ticket)),total=selection.length,batches=Math.ceil(total/BATCH_SIZE);
    const card=el('section',undefined,'batch-journey'),meta=el('span',date+'  /  '+who+'  /  '+(mode==='changed'?'변경 안내':'시간표 안내'),'batch-meta');
    const title=el('h3','알림톡 발송 중'),icon=el('span',undefined,'batch-orbit');icon.setAttribute('aria-hidden','true');
    const top=el('div',undefined,'batch-journey-head');top.append(icon,title);
    const number=el('strong'),step=el('span'),line=el('div',undefined,'batch-line');line.append(number,step);
    const track=el('div',undefined,'batch-track'),fill=el('span');track.append(fill);track.setAttribute('role','progressbar');
    track.setAttribute('aria-label','발송 요청 처리');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(total));
    const active=el('p',undefined,'batch-active'),elapsed=el('span',undefined,'batch-elapsed');
    const hint=note('처리 건수는 서버 응답 후 갱신됩니다. 이 화면을 열어 두세요.'),live=el('p',undefined,'batch-sr');live.setAttribute('role','status');
    card.append(meta,top,line,track,active,elapsed,hint,live);host.replaceChildren(card);card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView?.({block:'nearest'});
    let done=0,offset=0;const counts=new Map(),started=Date.now();
    const tick=()=>{const seconds=Math.floor((Date.now()-started)/1000);elapsed.textContent='경과 '+Math.floor(seconds/60)+'분 '+String(seconds%60).padStart(2,'0')+'초';};
    tick();const timer=root.setInterval(()=>{if(current())tick();else root.clearInterval(timer);},1000);
    function paint(batch){number.textContent=done+' / '+total+'건 처리';step.textContent=batch+' / '+batches+' 묶음';track.setAttribute('aria-valuenow',String(done));fill.style.width=(100*done/total)+'%';live.textContent=number.textContent+' · '+step.textContent;}
    try{
     for(offset=0;offset<total;offset+=BATCH_SIZE){
      if(!current())return;
      const part=selection.slice(offset,offset+BATCH_SIZE),batch=1+offset/BATCH_SIZE;paint(batch);active.textContent=(offset+1)+'–'+(offset+part.length)+'번째 안내를 처리하고 있습니다…';
      const result=await api('batchSend',{date,audience,mode,previewId:p.previewId,confirmed:true,tickets:part.map(x=>x.ticket)});
      if(!current())return;
      if(!Array.isArray(result?.results)||result.results.length!==part.length||!result.results.every(x=>x&&Object.hasOwn(root.TimetableAlimtalk.labels,x.state)))throw Object.assign(Error(),{code:'RESULT_UNCERTAIN'});
      for(const x of result.results)counts.set(x.state,(counts.get(x.state)||0)+1);
      done+=part.length;paint(batch);
     }
     const attention=counts.has('FAILED')||counts.has('UNKNOWN'),delivered=counts.get('DELIVERED')||0;
     card.dataset.state=attention?'attention':delivered===total?'done':'submitted';
     title.textContent=attention?'발송 결과를 확인해 주세요':delivered===total?'모든 안내 수신 완료':'발송 요청 접수 완료';
     active.textContent=total+'건의 요청 처리를 마쳤습니다.';
     hint.textContent=attention?'실패 또는 결과 미확정 건이 있습니다. 이력에서 결과와 받는 번호를 먼저 확인하세요.':delivered===total?'선택한 모든 안내의 수신 완료가 확인되었습니다.':'접수된 안내의 최종 수신 결과는 아직 확인 중입니다. 아래에서 수신 결과를 확인하세요.';
    }catch(e){
     if(!current())return;
     card.dataset.state='attention';title.textContent='발송을 멈췄습니다';
     const thisBatch=Math.min(BATCH_SIZE,total-offset);
     active.textContent='확인된 처리 '+done+'건 · 전체 '+total+'건';
     const notStarted=['BATCH_CHANGED','PREVIEW_EXPIRED','TEMPLATE_MISMATCH','RATE_LIMIT'].includes(e?.code);
     hint.textContent=errorText(e)+(notStarted?' 남은 '+(total-offset)+'건은 발송하지 않았습니다.':' 이후 '+Math.max(0,total-offset-thisBatch)+'건은 요청하지 않았습니다. 자동으로 재시도하지 않습니다.');
     if(notStarted)card.append(button('남은 대상 다시 확인',reviewAgain));
     else card.append(note('중단된 묶음 '+thisBatch+'건은 접수되었을 수 있습니다. 중복 발송을 막기 위해 이력에서 먼저 확인하세요.'));
    }finally{
     root.clearInterval(timer);tick();sending=false;unlock();
     if(current()){
      if(counts.size){const chips=el('div',undefined,'batch-totals');for(const [state,n] of counts)chips.append(el('span',root.TimetableAlimtalk.labels[state]+' '+n+'건'));card.append(chips);}
      live.textContent=title.textContent+' · '+number.textContent;
      const results=button(target?'이 학생 발송 이력 보기':'전체 발송 이력 보기',showHistory);results.className='send-action';card.append(results);refresh(target?{studentIds:[target.studentId],submitted:true,background:true}:{background:true});
     }
    }
   }
  }catch(e){if(current()){host.replaceChildren(note(errorText(e)),button('명단 다시 확인',reviewAgain));}}
 }
 async function recoverUnreceived(record,target){
  if(sending)return;
  const current=view(),{date,audience}=context();
  host.append(el('h3',record.name+' · 미접수 확인 후 신규 발송'),note(date+' · '+audienceName(audience)+' · '+record.masked),
   note('솔라피 발송 내역에서 이 수신번호와 최초 요청 시각의 메시지가 없는지 확인한 경우에만 진행하세요. 조회 오류만으로 미접수라고 판단하면 중복 수신될 수 있습니다.'),body('기존 요청 본문',record.text||''));
  const label=el('label',undefined,'bulk-pick'),ack=el('input');ack.type='checkbox';
  label.append(ack,document.createTextNode(' 솔라피 발송 내역에서 해당 요청이 없는 것을 확인했습니다.'));
  const send=button('미접수 확인하고 이 학생에게 신규 발송',async()=>{
   if(sending||!ack.checked||!current())return;
   sending=true;const unlock=lock();send.disabled=true;ack.disabled=true;
   const progress=loading('기존 접수 기록을 마지막으로 확인하고 있습니다…');host.append(progress);
   let released=false;
   try{await api('batchReleaseUnreceived',{date,audience,id:record.id,studentId:record.studentId,confirmedNotReceived:true});released=true;}
   catch(e){if(current()){progress.replaceChildren(note(errorText(e)),note('새 메시지는 발송하지 않았습니다. 발송 이력에서 현재 상태를 확인하세요.'));}}
   finally{sending=false;unlock();}
   if(current()){
    if(released)await quickSend('unsent',target);
    else host.append(button('발송 이력 확인',()=>history(target)));
   }
  });send.disabled=true;ack.onchange=()=>{send.disabled=!ack.checked;};
  host.append(label,send,button('취소 · 발송 이력으로',()=>history(target)));
 }
 async function history(target=null){
  if(sending)return;
  const current=view(),{date,audience}=context(),showHistory=()=>history(target);
  host.append(loading(audienceName(audience)+' 발송 이력을 불러오고 있습니다…'));
  try{
   const response=await api('batchHistory',{date,audience});if(!current())return;
   if(target||response.recoveryChecked)refresh(target?{studentIds:[target.studentId],background:true}:{background:true});
   const results=target?response.results.filter(r=>r.studentId===target.studentId):response.results;
   host.replaceChildren(el('h3',(target?target.name+' · ':'')+audienceName(audience)+' · '+(target?'발송 이력':'전체 발송 이력')),note(date+' 수업 안내 · 최근 요청 순'));
   studentBack(target);
   if(response.recoveryDeferred)host.append(note('접수 기록 자동 확인이 지연됐습니다. 결과 갱신으로 다시 확인해 주세요.'));
   if(!results.length){host.append(note('이 수업일에 해당 대상으로 발송한 안내 기록이 없습니다.'));return;}
   let refreshing=false;
   const pending=results.filter(r=>['REQUESTING','ACCEPTED','PROCESSING','UNKNOWN'].includes(r.state));
   if(target){
    if(pending.length)host.append(note(pending.some(r=>r.trackingMissing)?'이전 요청의 접수 여부를 확인하지 못했습니다. 조회 버튼은 기존 기록만 찾으며 새 메시지를 보내지 않습니다.':'아직 수신 결과가 확정되지 않았습니다. 결과를 갱신한 뒤 실패가 확인되면 재발송할 수 있습니다.'));
    else if(results.some(r=>['FAILED','NOT_ACCEPTED'].includes(r.state))&&!results.some(r=>r.state==='DELIVERED'))host.append(button('실패·미접수 건 재발송',()=>quickSend('unsent',target)));
   }
   if(pending.length){
    let progress;
    const update=button('미확정 '+pending.length+'건 결과 갱신',async()=>{
     if(refreshing)return;refreshing=true;update.disabled=true;
     progress?.remove();progress=loading('수신 결과 확인 중 · 0 / '+pending.length+'건');update.after(progress);
     try{for(let i=0;i<pending.length;i+=5){if(!current())return;await api('batchRefresh',{date,audience,ids:pending.slice(i,i+5).map(r=>r.id)});if(!current())return;progress.querySelector('p').textContent='수신 결과 확인 중 · '+Math.min(i+5,pending.length)+' / '+pending.length+'건';}
      if(current()){await showHistory();refresh(target?{studentIds:[target.studentId],background:true}:{background:true});}
     }catch(e){if(current()){progress.replaceChildren(note(errorText(e)+' 결과 갱신을 다시 눌러 주세요.'));update.disabled=false;}}finally{refreshing=false;}
    });host.append(update);
   }
   // Keep each follow-up beside its original, with the latest activity first.
   const chains=new Map(),byId=new Map(results.map(r=>[r.id,r]));
   const rootId=row=>{let r=row;const seen=new Set();while((r.retryOf||r.originalDeliveryId)&&!seen.has(r.id)){seen.add(r.id);const id=r.retryOf||r.originalDeliveryId;if(!byId.has(id))return id;r=byId.get(id);}return r.id;};
   for(const row of results){
    const key=rootId(row);
    if(!chains.has(key))chains.set(key,[]);
    chains.get(key).push(row);
   }
   const category=rows=>rows.some(r=>r.state==='DELIVERED')?'delivered':rows.some(r=>['FAILED','UNKNOWN','NOT_ACCEPTED'].includes(r.state))?'attention':'pending';
   const groups=Array.from(chains.values());
   const filters=el('div',undefined,'history-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','발송 결과 필터');
   const list=el('div'),announcement=el('p',undefined,'bulk-note');announcement.setAttribute('role','status');
   const entries=[],buttons=[];
   for(const [key,label] of [['all','전체'],['attention','확인 필요'],['pending','결과 대기'],['delivered','수신 완료']]){
    const n=key==='all'?groups.length:groups.filter(rows=>category(rows)===key).length;
    const filter=button(label+' '+n+'건',()=>{
     buttons.forEach(([b,k])=>b.setAttribute('aria-pressed',String(key===k)));
     entries.forEach(([node,k])=>node.hidden=key!=='all'&&key!==k);
     announcement.textContent=n?label+' '+n+'건 표시':'해당하는 안내가 없습니다.';
    });filter.setAttribute('aria-pressed',String(key==='all'));buttons.push([filter,key]);filters.append(filter);
   }
   host.append(note('발송 기록 기준입니다. 재발송은 원래 기록과 묶고, 수신 완료되면 이전 실패는 참고 이력으로 남깁니다.'),filters,announcement,list);
   for(const rows of groups){
    const chain=el('div',undefined,'history-chain'),kind=category(rows);chain.dataset.result=kind;entries.push([chain,kind]);list.append(chain);
    if(rows.length>1){const latest=rows.find(r=>r.state==='DELIVERED')||rows[0];chain.append(el('strong',latest.name+' · '+(kind==='delivered'?'재발송 수신 완료':'재발송 결과 확인'),'history-chain-title'));}
    for(const r of rows){const group=el('section',undefined,'bulk-review-row');
    const stamp=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(r.createdAt);
    group.append(el('strong',r.name+' · '+root.TimetableAlimtalk.historyLabel(r)),note([r.relation,r.masked,stamp,r.retryOf?'알림톡 재발송':r.originalDeliveryId?'문자 재발송':r.batch?'일괄 알림톡':'개별 알림톡'].join(' · ')));
    if(r.originalDeliveryId&&r.updatedAt){
     const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(r.updatedAt);
     group.append(note('솔라피 결과 확인 · '+time));
    }
    if(r.fallbackResult)group.append(note(({CHECKING:'문자 대체 결과 확인 중',DELIVERED:'대체 문자 수신 완료',FAILED:'대체 문자 발송 실패',NOT_SENT:'대체 문자 미발송'})[r.fallbackResult]+' · 알림톡 실패 '+r.ataErrorCode));
    if(r.recoveryResolution)group.append(note('담당자 미접수 확인 · '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(r.recoveryResolution.confirmedAt)+' · 기존 기록을 보존하고 신규 발송을 허용했습니다.'));
    if(r.trackingMissing&&r.state==='UNKNOWN'){
     group.append(note(r.trackingIssue==='RECEIPT_NOT_FOUND'?'솔라피에서 이 요청과 일치하는 접수 기록을 찾지 못했습니다. 연락처 등록 문제가 아니라, 최초 요청의 접수 여부가 확인되지 않은 상태입니다. 조회를 반복해도 기록이 없으면 이 상태가 유지됩니다.':'발송 응답에서 접수번호를 확보하지 못했습니다. 번호·요청 시각·발송 식별자로 접수 기록을 다시 확인합니다.'));
    }
    if(r.lastResultCheckAt)group.append(note('최근 결과 조회 · '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(r.lastResultCheckAt)));
    if(r.errorCode)group.append(note('결과 코드: '+r.errorCode));
    if(r.text)group.append(body('보낸 본문',r.text));
    if(['REQUESTING','PROCESSING','ACCEPTED','UNKNOWN'].includes(r.state)){
     const check=button(r.trackingMissing?'접수 기록 다시 찾기':'수신 결과 조회',async()=>{if(refreshing)return;refreshing=true;check.disabled=true;check.textContent='수신 결과 확인 중…';try{await api(audience==='student'?'studentReconcile':'reconcile',{id:r.id});if(current()){await showHistory();refresh(target?{studentIds:[target.studentId],background:true}:{background:true});}}catch(e){if(current()){group.append(note(errorText(e)));check.disabled=false;check.textContent='수신 결과 다시 조회';}}finally{refreshing=false;}});group.append(check);}
    if(r.state==='UNKNOWN'&&r.trackingMissing&&r.trackingIssue==='RECEIPT_NOT_FOUND'&&Date.now()-r.createdAt>=600000){
     const scoped={studentId:r.studentId,name:r.name};
     group.append(button('솔라피 미접수 확인 후 신규 발송',()=>recoverUnreceived(r,scoped)));
    }
    chain.append(group);}
   }
  }catch(e){if(current())host.replaceChildren(note(errorText(e)),button('이력 다시 확인',showHistory));}
 }
 return {review,quickSend,history,reset,errorText,isSending:()=>sending};
}
root.TimetableBatchUI={mount,errorText,lessonChanges};
})(globalThis);
