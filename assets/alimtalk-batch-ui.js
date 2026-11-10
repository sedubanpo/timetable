(function(root){
'use strict';
const el=(tag,s,cls)=>{const n=document.createElement(tag);if(s!==undefined)n.textContent=s;if(cls)n.className=cls;return n;};
const button=(s,fn)=>{const b=el('button',s);b.type='button';b.onclick=fn;return b;};
const body=(title,text)=>{const d=el('details');d.append(el('summary',title),el('pre',text));return d;};
const audienceName=a=>a==='student'?'학생 본인':'학부모';
const errorText=e=>({BATCH_CHANGED:'시간표, 번호 또는 발송 기록이 바뀌었습니다. 명단과 본문을 다시 확인하세요.',
 PREVIEW_EXPIRED:'검토 시간이 지났거나 대상이 바뀌었습니다. 다시 검토하세요.',FORBIDDEN:'반포관 실무자 권한을 확인할 수 없습니다. 허브 로그인과 시간표·데스크 접근 권한을 확인해 주세요.',
 RESULT_UNCERTAIN:'서버에서 이번 묶음의 결과를 확정하지 못했습니다.',TIMEOUT:'서버 응답이 늦어 이번 묶음의 결과를 확인하지 못했습니다.',NETWORK_UNAVAILABLE:'네트워크 연결이 끊겼습니다.',SOURCE_INCOMPLETE:'원본 시간표에 해석할 수 없는 수업이 있습니다.',RATE_LIMIT:'잠시 후 이력을 확인하고 다시 검토하세요.',
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
 const BATCH_SIZE=4;
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
 async function review(mode){
  if(sending)return;
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
   if(mode==='unsent'&&p.readOnly){
    const head=el('div',undefined,'change-overview');
    head.append(el('h3',who+' 일괄 발송 미리보기'),el('span',date+' · 조회 전용'));
    const eligible=p.eligibleStudents,held=p.rows.filter(r=>r.issue);
    const counts=el('p','전체 '+p.rows.length+'명 · 발송 가능 '+eligible.reduce((n,r)=>n+r.count,0)+'건 · 확인 필요 '+held.length+'명','change-count');
    host.replaceChildren(head,counts);
    if(eligible.length){
     host.append(el('h4','발송 가능한 학생'));
     for(const r of eligible)host.append(body(r.name+' · '+r.count+'건 · 본문 보기',r.text));
    }
    if(held.length){
     host.append(el('h4','확인이 필요한 학생'));
     const reasons=new Map();
     for(const r of held){if(!reasons.has(r.issue))reasons.set(r.issue,[]);reasons.get(r.issue).push(r.name);}
     for(const [reason,names] of reasons){
      const group=el('section',undefined,'bulk-review-row');
      group.append(el('strong',reason+' · '+names.length+'명'),el('p',names.join(', '),'bulk-names'));host.append(group);
     }
    }
    return;
   }
   const data=p.items,held=mode==='changed'?[]:p.rows.filter(r=>r.issue);
   if(mode==='unsent')host.append(el('p','전체 '+p.rows.length+'명 · 발송 가능 '+data.length+'건 · 확인 필요 '+held.length+'명','change-count'));
   if(held.length){const h=el('details');h.append(el('summary','확인이 필요한 학생 '+held.length+'명'));held.forEach(r=>h.append(note(r.name+' · '+r.issue)));host.append(h);}
   if(!data.length){host.append(note(mode==='changed'?'이전에 받은 안내와 내용이 다르고, 받는 번호까지 확인된 대상이 없습니다.':'현재 발송할 수 있는 미발송 번호가 없습니다.'));return;}
   const chosen=new Set(),checks=[];
   const bulk=el('label',undefined,'bulk-pick'),all=el('input');all.type='checkbox';bulk.append(all,document.createTextNode(' 가능한 번호 전체 선택 ('+data.length+'건)'));host.append(bulk);
   const students=new Map();for(const item of data){if(!students.has(item.studentId))students.set(item.studentId,[]);students.get(item.studentId).push(item);}
   host.append(note('알림톡 전달에 실패하면 같은 번호로 문자 대체 발송을 시도합니다.'));
   const list=el('details',undefined,'bulk-pick-list');
   list.append(el('summary','수신자별 선택 · 본문 보기 ('+data.length+'건)'));host.append(list);
   for(const items of students.values()){
    const group=el('section',undefined,'bulk-review-row');group.append(el('strong',items[0].name));
    for(const item of items){const l=el('label'),i=el('input');i.type='checkbox';checks.push([i,item.ticket]);i.onchange=()=>{if(i.checked)chosen.add(item.ticket);else chosen.delete(item.ticket);sync();};
     l.append(i,document.createTextNode(' '+item.relation+' · '+item.masked+(item.retry?' · 실패 건 재시도':'')));group.append(l);
    }
    group.append(body('보낼 본문 보기',items[0].text));list.append(group);
   }
   const foot=el('div',undefined,'bulk-confirm-footer bulk-send-footer');
   const ack=el('label',undefined,'bulk-pick'),ck=el('input');ck.type='checkbox';
   ack.append(ck,document.createTextNode(' 수신자와 본문을 확인했습니다.'));
   const send=button('',start);send.className='send-action';foot.append(ack,send);host.append(foot);
   all.onchange=()=>{for(const [i,t] of checks){i.checked=all.checked;if(i.checked)chosen.add(t);else chosen.delete(t);}sync();};
   function sync(){ck.checked=false;ck.disabled=!chosen.size;all.checked=chosen.size===data.length;all.indeterminate=chosen.size>0&&!all.checked;update();}
   function update(){send.textContent=who+' '+chosen.size+'건 '+(mode==='changed'?'변경 안내 발송':'발송');send.disabled=!chosen.size||!ck.checked||sending;}
   ck.onchange=update;sync();
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
    const hint=note('최대 4건씩 자동으로 이어집니다. 이 화면을 열어 두세요.'),live=el('p',undefined,'batch-sr');live.setAttribute('role','status');
    card.append(meta,top,line,track,hint,live);host.replaceChildren(card);card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView?.({block:'nearest'});
    let done=0,offset=0;const counts=new Map();
    function paint(batch){number.textContent=done+' / '+total+'건 처리';step.textContent=batch+' / '+batches+' 묶음';track.setAttribute('aria-valuenow',String(done));fill.style.width=(100*done/total)+'%';live.textContent=number.textContent+' · '+step.textContent;}
    try{
     for(offset=0;offset<total;offset+=BATCH_SIZE){
      if(!current())return;
      const part=selection.slice(offset,offset+BATCH_SIZE),batch=1+offset/BATCH_SIZE;paint(batch);
      const result=await api('batchSend',{date,audience,mode,previewId:p.previewId,confirmed:true,tickets:part.map(x=>x.ticket)});
      if(!current())return;
      if(!Array.isArray(result?.results)||result.results.length!==part.length||!result.results.every(x=>x&&Object.hasOwn(root.TimetableAlimtalk.labels,x.state)))throw Object.assign(Error(),{code:'RESULT_UNCERTAIN'});
      for(const x of result.results)counts.set(x.state,(counts.get(x.state)||0)+1);
      done+=part.length;paint(batch);
     }
     card.dataset.state=counts.has('FAILED')||counts.has('UNKNOWN')?'attention':'done';title.textContent='발송 요청 처리 완료';
     hint.textContent='수신 완료 여부는 발송 이력에서 확인하세요.';
    }catch(e){
     if(!current())return;
     card.dataset.state='attention';title.textContent='발송을 멈췄습니다';
     const thisBatch=Math.min(BATCH_SIZE,total-offset);
     hint.textContent=errorText(e)+' 이후 '+Math.max(0,total-offset-thisBatch)+'건은 요청하지 않았습니다. 자동으로 재시도하지 않습니다.';
     card.append(note('중단된 묶음 '+thisBatch+'건은 이력에서 먼저 확인하세요.'));
    }finally{
     sending=false;unlock();
     if(current()){
      if(counts.size){const chips=el('div',undefined,'batch-totals');for(const [state,n] of counts)chips.append(el('span',root.TimetableAlimtalk.labels[state]+' '+n+'건'));card.append(chips);}
      live.textContent=title.textContent+' · '+number.textContent;
      card.append(button('전체 발송 이력 보기',history));refresh();
     }
    }
   }
  }catch(e){if(current()){host.replaceChildren(note(errorText(e)),button('명단 다시 확인',()=>review(mode)));}}
 }
 async function history(){
  if(sending)return;
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
   // Keep each follow-up beside its original, with the latest activity first.
   const chains=new Map();
   for(const row of results){
    const key=row.originalDeliveryId||row.id;
    if(!chains.has(key))chains.set(key,[]);
    chains.get(key).push(row);
   }
   for(const r of Array.from(chains.values()).flat()){const group=el('section',undefined,'bulk-review-row');
    const stamp=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(r.createdAt);
    group.append(el('strong',r.name+' · '+root.TimetableAlimtalk.historyLabel(r)),note([r.relation,r.masked,stamp,r.originalDeliveryId?'문자 재발송':r.batch?'일괄 알림톡':'개별 알림톡'].join(' · ')));
    if(r.originalDeliveryId&&r.updatedAt){
     const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(r.updatedAt);
     group.append(note('솔라피 결과 확인 · '+time));
    }
    if(r.fallbackResult)group.append(note(({CHECKING:'문자 대체 결과 확인 중',DELIVERED:'대체 문자 수신 완료',FAILED:'대체 문자 발송 실패',NOT_SENT:'대체 문자 미발송'})[r.fallbackResult]+' · 알림톡 실패 '+r.ataErrorCode));
    if(r.errorCode)group.append(note('결과 코드: '+r.errorCode));
    if(r.text)group.append(body('보낸 본문',r.text));
    if(['REQUESTING','PROCESSING','ACCEPTED','UNKNOWN'].includes(r.state)){
     const check=button('수신 결과 조회',async()=>{check.disabled=true;try{await api(audience==='student'?'studentReconcile':'reconcile',{id:r.id});if(current()){await history();refresh();}}catch(e){if(current()){group.append(note(errorText(e)));check.disabled=false;}}});group.append(check);}
    host.append(group);}
  }catch(e){if(current())host.replaceChildren(note(errorText(e)),button('이력 다시 확인',history));}
 }
 return {review,history,reset,errorText,isSending:()=>sending};
}
root.TimetableBatchUI={mount,errorText,lessonChanges};
})(globalThis);
