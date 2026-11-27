// Page adapter for the date-wide list. A roster read is independent of the highlighted student.
var cardBulkUI=null,cardRosterRows=null,cardRosterScope='',cardRosterError='',cardRosterRead=0;
var cardRosterSourceBlocked=false;
function cardBatchContext(){return {date:attendanceDateKey(currentSheetName),audience:cardAudience,session:getScheduleSessionKey()+'|'+timetableLoginSequence};}
function rosterKey(){return JSON.stringify(cardBatchContext());}
var cardRosterCache=new Map(),cardRosterCacheScope='';
function acceptCardRoster(rows,key,studentIds){
 if(key!==rosterKey()||!isStudentImageModalOpen()||studentCardMode!=='message'||!Array.isArray(rows))return;
 if(studentIds){
  if(!Array.isArray(cardRosterRows)||cardRosterScope!==key)return;
  const changed=new Map(rows.filter(r=>studentIds.includes(r.studentId)).map(r=>[r.studentId,r]));
  rows=cardRosterRows.map(r=>changed.get(r.studentId)||r);
 }
 cardRosterCache.set(key,{rows,at:Date.now()});
 // A completed preview supersedes older in-flight roster reads.
 cardRosterRead++;cardRosterScope=key;cardRosterRows=rows;cardRosterError='';cardRosterSourceBlocked=false;
 filterStudentImageList({background:true});
}
var cardRosterStudentReads=new Map();
async function reloadCardRosterStudents(options){
 const key=rosterKey(),ids=options.studentIds,read=Symbol();
 if(!Array.isArray(cardRosterRows)||cardRosterScope!==key)return reloadCardRoster({background:true});
 ids.forEach(id=>cardRosterStudentReads.set(key+'|'+id,read));
 // Pending is provisional: never claim receipt success from an accepted send response.
 if(options.submitted){
  const rows=cardRosterRows.filter(r=>ids.includes(r.studentId)).map(r=>({...r,state:'pending',failed:false,localStatus:'발송 결과 갱신 중'}));
  acceptCardRoster(rows,key,ids);
 }
 try{
  const response=await cardAlimtalkApi('batchRoster',{date:cardBatchContext().date,audience:cardAudience,studentIds:ids},true);
  if(!Array.isArray(response.rows))throw Object.assign(Error(),{code:'INVALID_RESPONSE'});
  const fresh=ids.filter(id=>cardRosterStudentReads.get(key+'|'+id)===read);
  const received=new Set(response.rows.map(r=>r.studentId));
  if(fresh.some(id=>!received.has(id)))throw Object.assign(Error(),{code:'INVALID_RESPONSE'});
  acceptCardRoster(response.rows,key,fresh);
 }catch(e){
  if(key===rosterKey()){
   if(e.code==='SOURCE_INCOMPLETE'&&ids.some(id=>cardRosterStudentReads.get(key+'|'+id)===read))return reloadCardRoster();
   const fresh=ids.filter(id=>cardRosterStudentReads.get(key+'|'+id)===read);
   acceptCardRoster((cardRosterRows||[]).filter(r=>fresh.includes(r.studentId)).map(r=>({...r,localStatus:'목록 갱신 지연 · 결과 확인'})),key,fresh);
  }
 }
}
async function reloadCardRoster(options={}){
 if(!isStudentImageModalOpen()||studentCardMode!=='message')return;
 if(options.studentIds?.length)return reloadCardRosterStudents(options);
 cardRosterStudentReads.clear();
 const ctx=cardBatchContext(),scope=JSON.stringify([ctx.session,ctx.date]);
 if(scope!==cardRosterCacheScope||!options.reuse){cardRosterCache.clear();cardRosterCacheScope=scope;}
 const key=rosterKey(),seq=++cardRosterRead;
 let entry=cardRosterCache.get(key);
 if(entry?.rows&&Date.now()-entry.at>=60000){cardRosterCache.delete(key);entry=null;}
 if(!entry){
  entry={};cardRosterCache.set(key,entry);
  entry.promise=cardAlimtalkApi('batchRoster',{date:ctx.date,audience:ctx.audience},true).then(r=>{
   if(!Array.isArray(r.rows))throw Object.assign(Error(),{code:'INVALID_RESPONSE'});
   if(cardRosterCache.get(key)===entry){entry.rows=r.rows;entry.sourceProblem=r.sourceProblem;entry.at=Date.now();delete entry.promise;}
   return r.rows;
  }).catch(e=>{if(cardRosterCache.get(key)===entry)cardRosterCache.delete(key);throw e;});
 }
 const existing=options.background&&cardRosterScope===key?cardRosterRows:null;
 cardRosterScope=key;cardRosterRows=entry.rows||existing||null;cardRosterError='';cardRosterSourceBlocked=false;filterStudentImageList({background:true});
 if(entry.rows)return;
 try{
  const rows=await entry.promise;
  if(seq!==cardRosterRead||key!==rosterKey()||!isStudentImageModalOpen()||studentCardMode!=='message')return;
  cardRosterRows=rows;
 }catch(e){if(seq!==cardRosterRead||key!==rosterKey())return;if(e.code==='SOURCE_INCOMPLETE'){cardRosterRows=null;cardRosterSourceBlocked=!!e.sourceProblem;}cardRosterError=TimetableBatchUI.errorText(e);}
 if(isStudentImageModalOpen()&&studentCardMode==='message')filterStudentImageList({background:true});
}
function cardRosterGroup(row){
 if(!row)return 'held';
 if(row.issue)return row.issue.includes('본인 번호 없음')?'guardianOnly':'held';
 if(row.state==='pending'&&row.trackingMissing)return 'unconfirmed';
 if(row.state==='unsent'&&row.failed)return 'failed';
 return row.state;
}
function rosterStudentId(){
 if(cardRosterScope!==rosterKey())return null;
 const matches=(cardRosterRows||[]).filter(r=>r.name===selectedStudentForImage);
 return matches.length===1?matches[0].studentId:null;
}
function openCardBulk(mode){
 resetCardAlimtalk();
 const host=document.getElementById('cardAlimtalkPanel');
 if(!cardBulkUI)cardBulkUI=TimetableBatchUI.mount({host,api:cardAlimtalkApi,context:cardBatchContext,refresh:reloadCardRoster,onBack:()=>filterStudentImageList()});
 const label=cardAudience==='student'?'학생 본인':'학부모';
 document.querySelector('#studentImageModal .student-preview-panel-title').textContent=label+' · '+currentSheetName;
 document.querySelector('#studentImageModal .student-preview-panel-sub').textContent=mode==='changed'?'수신 완료된 알림톡과 현재 시간표를 비교합니다.':mode==='history'?'수신자별 발송 결과를 확인하세요.':'발송 가능한 건수와 확인이 필요한 학생을 확인하세요.';
 host.hidden=false;host.dataset.bulk='true';host.dataset.bulkMode=mode;
 if(mode==='history')cardBulkUI.history();else cardBulkUI.review(mode);
 host.scrollIntoView({block:'nearest'});
}
// Open a fresh server-reviewed plan for exactly one student and the current audience.
function openCardRosterAction(name,state){
 if(cardBulkUI?.isSending()||cardRosterScope!==rosterKey())return;
 const rows=(cardRosterRows||[]).filter(r=>r.name===name);
 if(rows.length!==1||!rows[0].studentId||cardRosterGroup(rows[0])!==state)return;
 selectStudentImageItem(name,{skipListRender:true});refreshStudentImageListSelectionState();
 const target={studentId:rows[0].studentId,name};
 resetCardAlimtalk();
 const host=document.getElementById('cardAlimtalkPanel');
 if(!cardBulkUI)cardBulkUI=TimetableBatchUI.mount({host,api:cardAlimtalkApi,context:cardBatchContext,refresh:reloadCardRoster,onBack:()=>filterStudentImageList()});
 host.hidden=false;host.dataset.bulk='true';host.dataset.bulkMode='student';
 document.querySelector('#studentImageModal .student-preview-panel-title').textContent=name+' · '+currentSheetName;
 document.querySelector('#studentImageModal .student-preview-panel-sub').textContent=(cardAudience==='student'?'학생 본인':'학부모')+' · '+(['pending','unconfirmed'].includes(state)?'기존 발송의 수신 결과를 먼저 확인하세요.':'확인된 번호로 바로 발송합니다.');
 const task=['pending','unconfirmed'].includes(state)?cardBulkUI.history(target):cardBulkUI.quickSend(state==='changed'?'changed':'unsent',target);
 host.tabIndex=-1;host.focus({preventScroll:true});host.scrollIntoView({block:'nearest'});
 return task;
}
var rosterFilter='all';
const rosterFilters={all:'전체',changed:'변경 대상',unsent:'미발송',sent:'발송완료'};
function rosterCategory(row){
 if(row?.state==='changed')return 'changed';
 const state=cardRosterGroup(row);
 if(state==='sent')return 'sent';
 if(['held','unsent','failed'].includes(state)&&!row?.issue?.startsWith('안내 대상 수업 없음'))return 'unsent';
 return '';
}
const rosterChangeLabels={
 room:'강의실 변경',absence:'결석 전환',order:'과목 순서 변경',stop:'중지',wrong:'오발송',
 time:'시간 변경',teacher:'강사 변경',lessons:'수업 구성 변경',removed:'현재 수업 없음',
 mixed:'복합 변경',other:'변경 확인 필요'
};
function rosterComparisonType(previous,current,excluded){
 const day=body=>/^▶ 수업일: (\d{4}-\d{2}-\d{2})$/m.exec(body||'')?.[1];
 if(day(previous)&&day(current)&&day(previous)!==day(current))return 'wrong';
 const before=TimetableBatchUI.readLessons(previous),after=TimetableBatchUI.readLessons(current);
 if(!before||!after)return 'other';
 const subjects=list=>list.map(l=>l.subject);
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const reordered=same(subjects(before).sort(),subjects(after).sort())&&!same(subjects(before),subjects(after));
 const changes=new Set();
 if(reordered)changes.add('order');
 const slotsChanged=!same(before.map(l=>l.time),after.map(l=>l.time));
 for(const diff of TimetableBatchUI.lessonChanges(previous,current)){
  const old=diff.before,next=diff.after;
  if(!old||!next){
   changes.add(old&&excluded.includes(old.subject)?'absence':'lessons');
   continue;
  }
  if(old.subject!==next.subject||old.type!==next.type||old.status!==next.status)changes.add('lessons');
  if(old.room!==next.room)changes.add('room');
  if(old.teacher!==next.teacher)changes.add('teacher');
  if(old.time!==next.time&&(!reordered||slotsChanged))changes.add('time');
 }
 if(!changes.size&&previous.match(/^▶ 등원 시각: .+$/m)?.[0]!==current.match(/^▶ 등원 시각: .+$/m)?.[0])changes.add('time');
 return changes.size===1?[...changes][0]:changes.size?'mixed':'other';
}
function rosterChangeType(row){
 const issue=row.issue||'';
 if(/^오발송(?:$| ·)/.test(issue))return 'wrong';
 if(row.stoppedWithoutLessons||/^중지생 ·/.test(issue))return 'stop';
 if(issue.startsWith('안내 대상 수업 없음 · ')){
  const reasons=issue.slice('안내 대상 수업 없음 · '.length).split(', ').filter(r=>r!=='자동 생성 공강');
  if(reasons.length&&reasons.every(r=>['결석예고','결석','당일취소','당취'].includes(r)))return 'absence';
  return 'removed';
 }
 if(issue.startsWith('현재 시간표에 수업 없음'))return 'removed';
 const types=new Set((row.comparisons||[]).map(r=>rosterComparisonType(r.previous,row.current,row.absentSubjects||[])));
 return types.size===1?[...types][0]:types.size?'mixed':'other';
}
// Use the delivered body, not a reconstruction of a former timetable.
function renderRosterComparison(row){
 const host=document.getElementById('rosterComparison');
 if(!host)return;
 host.replaceChildren();host.hidden=row?.state!=='changed';
 if(host.hidden)return;
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const histories=new Map(),who=cardAudience==='student'?'학생 본인':'학부모';
 for(const record of row.comparisons||[]){
  if(!histories.has(record.previous))histories.set(record.previous,new Set());
  histories.get(record.previous).add(record.relation||who);
 }
 if(!histories.size)histories.set('',new Set([who]));
 for(const [before,relations] of histories){
  const grid=el('div','');grid.className='roster-versions';
  const current=row.current||'';
  const schedule=text=>{
   const match=/▶ 등원 시각:[^\n]*\n+\[수업 안내[^\]]*\]\n([\s\S]*?)\n\n수업 일정에 관한/.exec(text);
   return match?match[0].split('\n')[0]+'\n\n'+(match[1].trim()||'안내할 수업 없음'):text;
  };
  let left=schedule(before),right=schedule(current);
  if(left===right&&before!==current){left=before;right=current;}
  if(row.issue?.startsWith('안내 대상 수업 없음')||row.issue?.startsWith('현재 시간표에 수업 없음'))right=row.issue;
  for(const [heading,body] of [['변경 전 · '+[...relations].join('·')+' 수신본',left||'이전 본문 기록 없음'],['변경 후 · 현재 시간표',right||row.issue||'현재 본문 기록 없음']]){
   const pane=el('section',''),pre=el('pre','');
   const other=new Set((grid.childElementCount?left:right).split('\n'));
   body.split('\n').forEach((line,index)=>{
    if(index)pre.append('\n');
    pre.append(line&&!other.has(line)?el('mark',line):document.createTextNode(line));
   });
   pane.append(el('h3',heading),pre);grid.append(pane);
  }
  host.append(grid);
 }
}
function drawAlimtalkRoster(list,keyword,options={}){
 const ready=cardRosterScope===rosterKey()&&Array.isArray(cardRosterRows),byName=new Map();
 for(const row of ready?cardRosterRows:[]){if(!byName.has(row.name))byName.set(row.name,row);else byName.set(row.name,{name:row.name,state:'held',issue:'동명이인 · 개별 확인'});}
 const names=[...new Set([...Object.keys(studentImageScheduleMap),...byName.keys()].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
 const groups={changed:['시간표 변경','이전에 받은 안내와 현재 시간표가 다릅니다. 변경 발송을 누르면 최신 시간표를 바로 보냅니다.'],unsent:['발송 대기','발송 버튼을 누르면 확인된 번호로 바로 전송됩니다.'],failed:['발송 실패','실패 사유와 번호를 확인한 뒤 재시도하세요.'],unconfirmed:['접수 확인 필요','최초 발송의 접수 기록을 찾지 못했습니다. 결과 조회가 필요합니다.'],pending:['결과 확인 중','최종 수신 결과를 확인하고 있습니다.'],guardianOnly:['학부모만 안내','학생 본인 번호가 없어 학생 발송 대상에서 제외됩니다.'],held:['확인 필요','학생별 사유를 확인하고 정보를 보완해 주세요.'],sent:['수신 완료','현재 안내를 알림톡 또는 문자로 받았습니다.']};
 if(!ready&&cardRosterSourceBlocked)groups.held=['원본 수정 대기','원본 수정 후 명단을 다시 조회하세요.'];
 else if(!ready)groups.held=[cardRosterError?'조회 실패':'기록 확인 중',cardRosterError?'다시 확인을 눌러 조회해 주세요.':'서버 기록을 확인한 뒤 발송 상태를 표시합니다.'];
 const counts={all:names.length,changed:0,unsent:0,sent:0};
 if(ready)for(const name of names){const category=rosterCategory(byName.get(name));if(category)counts[category]++;}
 for(const b of document.querySelectorAll('[data-roster-filter]')){
  const key=b.dataset.rosterFilter;
  b.textContent=rosterFilters[key]+' '+(ready||key==='all'?counts[key]:'…');
  b.disabled=!ready&&key!=='all';
  b.setAttribute('aria-pressed',String(key===rosterFilter));
  b.onclick=()=>{rosterFilter=key;resetCardAlimtalk();list.scrollLeft=0;filterStudentImageList();};
 }
 const visible=names.filter(n=>(rosterFilter==='all'||(ready&&rosterCategory(byName.get(n))===rosterFilter))&&(!keyword||n.toLowerCase().includes(keyword)));
 const sections=new Map(),details=new Map();
 const detail=document.getElementById('rosterDetail');
 function showDetail(name,keepPanelTitle=false){
  if(!detail)return;
  const entry=details.get(name);
  if(!keepPanelTitle&&document.getElementById('cardMessageReferenceBody'))renderCardMessageReference();
  renderRosterComparison(entry?.row);
  detail.replaceChildren();
  if(entry){
   const caption=make('span',entry.caption);
   detail.append(caption,...entry.controls);
   if(entry.row?.issue==='시간 메모 확인 필요'&&entry.row.studentId&&document.getElementById('cardAlimtalkPanel')?.hidden){
    openCardAlimtalk(false);
   }
  }
 }
 list.replaceChildren();
 const make=(tag,s)=>{const n=document.createElement(tag);if(s!==undefined)n.textContent=s;return n;};
 const msg=document.getElementById('batchRosterStatus');msg.replaceChildren();
 const loading=!ready&&!cardRosterError;
 msg.classList.toggle('roster-loading',loading);list.setAttribute('aria-busy',String(loading));
 document.querySelectorAll('[data-card-audience]').forEach(b=>b.setAttribute('aria-busy',String(loading&&b.dataset.cardAudience===cardAudience)));
 if(loading){const spinner=make('span');spinner.className='batch-orbit';spinner.setAttribute('aria-hidden','true');msg.append(spinner);}

 if(!ready){
  const notice=make('span',cardRosterError||((cardAudience==='student'?'학생':'학부모')+' 발송 기록 확인 중…'));notice.style.whiteSpace='pre-line';msg.append(notice);
  if(cardRosterError){const retry=make('button','다시 확인');retry.type='button';retry.onclick=()=>reloadCardRoster();msg.append(retry);}
 }else{
  const eligible=cardRosterRows.filter(r=>!r.issue&&r.state==='unsent').length;
  const held=names.filter(name=>cardRosterGroup(byName.get(name))==='held').length;
  msg.textContent=(cardAudience==='student'?'학생 본인':'학부모')+' 기준 · 변경 대상 '+counts.changed+'명 · 미발송 '+counts.unsent+'명 · 발송 준비 '+eligible+'명'+(held?' · 확인 필요 '+held+'명 (일괄 발송에서 자동 제외)':'');
  const problem=cardRosterCache.get(rosterKey())?.sourceProblem;
  if(problem){const details=make('details');details.append(make('summary','일부 원본 행 확인 필요 · 다른 학생은 발송 가능'));const body=make('div',TimetableBatchUI.sourceProblemText(problem));body.style.whiteSpace='pre-line';details.append(body);msg.append(details);}
 }
 for(const name of visible){
  const row=byName.get(name),state=cardRosterGroup(row);
  const group=row?.state==='changed'?'changed':state;
  if(!sections.has(group))sections.set(group,[]);
  const b=make('button');b.type='button';b.className='recipient-student';b.dataset.studentName=name;b.setAttribute('aria-pressed',String(name===selectedStudentForImage));
  b.append(make('strong',name));
  const sub=row?.localStatus||row?.issue||(row?.trackingMissing?'접수 기록 연결 확인 필요':'')||(!studentImageScheduleMap[name]?'현재 수업 없음':row?.failed?'이전 발송 실패 · 결과 확인':!ready?groups.held[0]:!row?'시간표 대조 필요':state==='changed'?'시간표 변경 · 새 안내 필요':state==='unsent'?(row.waitReason||'현재 수신 번호로 수신 완료된 기록 없음'):state==='sent'?'수신 완료':'');
  const caption=sub||groups[group][0],controls=[];
  b.title=caption;
  details.set(name,{caption,controls,row});
  b.onclick=()=>{if(!studentImageScheduleMap[name]&&row?.state!=='changed'){openCardBulk('history');return;}
   selectStudentImageItem(name,{skipListRender:true});refreshStudentImageListSelectionState();showDetail(name);};
  const tile=make('div');tile.className='roster-student-card';tile.append(b);
  const actionLabel={unsent:'발송',failed:'재발송',changed:'변경 발송',pending:'결과 확인',unconfirmed:'접수 확인'}[state];
  if(ready&&row?.studentId&&row.issue==='시간 메모 확인 필요'){
   const review=make('button','비고 확인 후 개별 발송 준비');review.type='button';review.className='roster-student-action';
   review.onclick=()=>openCardAlimtalk(false);controls.push(review);
  }
  if(ready&&row?.studentId&&studentImageScheduleMap[name]&&actionLabel){
   const action=make('button',actionLabel);action.type='button';action.className='roster-student-action';
   action.setAttribute('aria-label',name+' '+(cardAudience==='student'?'학생 본인':'학부모')+' '+actionLabel);
   action.title=['pending','unconfirmed'].includes(state)?'기존 접수 기록과 수신 결과만 조회합니다.':'현재 수업일의 안내를 확인된 '+(cardAudience==='student'?'학생 번호':'학부모 번호')+'로 바로 발송합니다.';
   action.onclick=async()=>{
    if(cardBulkUI?.isSending())return;
    action.disabled=true;action.setAttribute('aria-busy','true');action.textContent=['pending','unconfirmed'].includes(state)?'조회 중':'발송 중';
    try{await openCardRosterAction(name,state);}finally{action.disabled=false;action.removeAttribute('aria-busy');action.textContent=actionLabel;}
   };controls.push(action);
  }
  if(studentImageScheduleMap[name]){const contactButton=make('button',/학교·학년 미기재/.test(row?.issue||'')?'연결 추천 학생':'등록·임시 연락처');contactButton.type='button';contactButton.className='roster-contact-action';contactButton.onclick=()=>openCardNoticeContacts();controls.push(contactButton);}
  sections.get(group).push(tile);
 }
 for(const [state,[title,description]] of Object.entries(groups)){
  const rows=sections.get(state)||[];if(!rows.length)continue;
  const g=make('section'),h=make('div'),grid=make('div');g.className='roster-group roster-'+state;h.className='roster-heading';h.title=description;
  h.append(make('strong',title),make('span',rows.length+'명'));grid.className='roster-tiles';
  if(state==='unsent'){
   const reasons=new Map();
   for(const tile of rows){
    const reason=tile.firstChild.title;
    if(!reasons.has(reason)){const label=make('p','대기 사유: '+reason);label.className='roster-wait-reason';reasons.set(reason,[label]);}
    reasons.get(reason).push(tile);
   }
   for(const items of reasons.values())grid.append(...items);
  }else if(state==='changed'){
   const tilesByType=new Map();
   for(const tile of rows){
    const type=rosterChangeType(byName.get(tile.firstChild.dataset.studentName));
    if(!tilesByType.has(type))tilesByType.set(type,[]);
    tilesByType.get(type).push(tile);
   }
   for(const [type,label] of Object.entries(rosterChangeLabels)){
    const tiles=tilesByType.get(type);if(!tiles)continue;
    const cluster=make('div'),tag=make('span',label);
    cluster.className='roster-change-cluster';cluster.setAttribute('role','group');cluster.setAttribute('aria-label',label);
    tag.className='roster-change-tag change-'+type;tiles[0].prepend(tag);
    cluster.append(...tiles);grid.append(cluster);
   }
  }else grid.append(...rows);
  const desc=make('p',description);desc.className='roster-description';g.append(h,desc,grid);list.append(g);
 }
 if(!visible.length)list.append(make('p',keyword?'검색 결과가 없습니다.':ready?'해당 상태의 학생이 없습니다.':'발송 상태를 확인하고 있습니다.'));
 // The editor owns its current student until the operator returns to the list.
 const keepPanel=options.background && document.getElementById('cardAlimtalkPanel')?.hidden===false;
 const selectable=visible.filter(n=>Object.hasOwn(studentImageScheduleMap,n)||byName.get(n)?.state==='changed');
 if(!keepPanel&&!selectable.includes(selectedStudentForImage)){
  if(selectable.length)selectStudentImageItem(selectable[0],{skipListRender:true});
  else if(selectedStudentForImage){selectedStudentForImage='';resetCardAlimtalk();renderCardMessageReference();}
 }
 refreshStudentImageListSelectionState();showDetail(selectedStudentForImage,keepPanel);
}
