// Page adapter for the date-wide list. A roster read is independent of the highlighted student.
var cardBulkUI=null,cardRosterRows=null,cardRosterScope='',cardRosterError='',cardRosterRead=0;
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
 cardRosterRead++;cardRosterScope=key;cardRosterRows=rows;cardRosterError='';
 filterStudentImageList();
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
   if(cardRosterCache.get(key)===entry){entry.rows=r.rows;entry.at=Date.now();delete entry.promise;}
   return r.rows;
  }).catch(e=>{if(cardRosterCache.get(key)===entry)cardRosterCache.delete(key);throw e;});
 }
 const existing=options.background&&cardRosterScope===key?cardRosterRows:null;
 cardRosterScope=key;cardRosterRows=entry.rows||existing||null;cardRosterError='';filterStudentImageList();
 if(entry.rows)return;
 try{
  const rows=await entry.promise;
  if(seq!==cardRosterRead||key!==rosterKey()||!isStudentImageModalOpen()||studentCardMode!=='message')return;
  cardRosterRows=rows;
 }catch(e){if(seq!==cardRosterRead||key!==rosterKey())return;cardRosterError=TimetableBatchUI.errorText(e);}
 if(isStudentImageModalOpen()&&studentCardMode==='message')filterStudentImageList();
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
 if(!cardBulkUI)cardBulkUI=TimetableBatchUI.mount({host,api:cardAlimtalkApi,context:cardBatchContext,refresh:reloadCardRoster});
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
 if(!cardBulkUI)cardBulkUI=TimetableBatchUI.mount({host,api:cardAlimtalkApi,context:cardBatchContext,refresh:reloadCardRoster});
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
function drawAlimtalkRoster(list,keyword){
 const ready=cardRosterScope===rosterKey()&&Array.isArray(cardRosterRows),byName=new Map();
 for(const row of ready?cardRosterRows:[]){if(!byName.has(row.name))byName.set(row.name,row);else byName.set(row.name,{name:row.name,state:'held',issue:'동명이인 · 개별 확인'});}
 const names=[...new Set([...Object.keys(studentImageScheduleMap),...byName.keys()].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
 const groups={changed:['시간표 변경 · 안내 필요','이전에 받은 안내와 현재 시간표가 다릅니다. 변경 발송을 누르면 최신 시간표를 바로 보냅니다.'],unsent:['발송 대기','발송 버튼을 누르면 확인된 번호로 바로 전송됩니다.'],failed:['발송 실패','실패 사유와 번호를 확인한 뒤 재시도하세요.'],unconfirmed:['접수 확인 필요','최초 발송의 접수 기록을 찾지 못했습니다. 결과 조회가 필요합니다.'],pending:['결과 확인 중','최종 수신 결과를 확인하고 있습니다.'],guardianOnly:['학부모만 안내','학생 본인 번호가 없어 학생 발송 대상에서 제외됩니다.'],held:['확인 필요','학생별 사유를 확인하고 정보를 보완해 주세요.'],sent:['수신 완료','현재 안내를 알림톡 또는 문자로 받았습니다.']};
 if(!ready)groups.held=[cardRosterError?'조회 실패':'기록 확인 중',cardRosterError?'다시 확인을 눌러 조회해 주세요.':'서버 기록을 확인한 뒤 발송 상태를 표시합니다.'];
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
 const sections=new Map(),scrollLeft=list.scrollLeft;
 list.replaceChildren();
 const make=(tag,s)=>{const n=document.createElement(tag);if(s!==undefined)n.textContent=s;return n;};
 const msg=document.getElementById('batchRosterStatus');msg.replaceChildren();
 const loading=!ready&&!cardRosterError;
 msg.classList.toggle('roster-loading',loading);list.setAttribute('aria-busy',String(loading));
 document.querySelectorAll('[data-card-audience]').forEach(b=>b.setAttribute('aria-busy',String(loading&&b.dataset.cardAudience===cardAudience)));
 if(loading){const spinner=make('span');spinner.className='batch-orbit';spinner.setAttribute('aria-hidden','true');msg.append(spinner);}

 if(!ready){
  msg.append(make('span',cardRosterError||((cardAudience==='student'?'학생':'학부모')+' 발송 기록 확인 중…')));
  if(cardRosterError){const retry=make('button','다시 확인');retry.type='button';retry.onclick=()=>reloadCardRoster();msg.append(retry);}
 }else{msg.textContent=(cardAudience==='student'?'학생 본인':'학부모')+' 기준 · 변경 대상 '+counts.changed+'명 · 미발송 '+counts.unsent+'명';}
 for(const name of visible){
  const row=byName.get(name),state=cardRosterGroup(row);
  if(!sections.has(state))sections.set(state,[]);
  const b=make('button');b.type='button';b.className='recipient-student';b.dataset.studentName=name;b.setAttribute('aria-pressed',String(name===selectedStudentForImage));
  b.append(make('strong',name));
  const sub=row?.localStatus||row?.issue||(row?.trackingMissing?'접수 기록 연결 확인 필요':'')||(!studentImageScheduleMap[name]?'현재 수업 없음':row?.failed?'이전 발송 실패 · 결과 확인':!ready?'기록 확인 중':!row?'시간표 대조 필요':state==='changed'?'시간표 변경 · 새 안내 필요':state==='unsent'?'발송 대기 · 발송 가능':state==='sent'?'수신 완료':'');
  if(sub){const label=make('small',sub);if(state==='changed')label.className='roster-change-label';b.append(label);}
  b.onclick=()=>{if(!studentImageScheduleMap[name]){openCardBulk('history');return;}selectStudentImageItem(name,{skipListRender:true});refreshStudentImageListSelectionState();};
  const tile=make('div');tile.className='roster-student-card';tile.append(b);
  if(row?.state==='changed'&&row.studentId){
   const compare=make('button','변경 비교');compare.type='button';compare.className='roster-compare';
   compare.setAttribute('aria-label',name+' 변경 전후 비교');
   compare.onclick=()=>{if(studentImageScheduleMap[name])selectStudentImageItem(name,{skipListRender:true});refreshStudentImageListSelectionState();resetCardAlimtalk();const host=document.getElementById('cardAlimtalkPanel');
    if(!cardBulkUI)cardBulkUI=TimetableBatchUI.mount({host,api:cardAlimtalkApi,context:cardBatchContext,refresh:reloadCardRoster});
    host.dataset.bulk='true';host.dataset.bulkMode='compare';cardBulkUI.compare({studentId:row.studentId,name});host.scrollIntoView({block:'nearest'});
   };tile.append(compare);
  }
  const actionLabel={unsent:'발송',failed:'재발송',changed:'변경 발송',pending:'결과 확인',unconfirmed:'접수 확인'}[state];
  if(ready&&row?.studentId&&studentImageScheduleMap[name]&&actionLabel){
   const action=make('button',actionLabel);action.type='button';action.className='roster-student-action';
   action.setAttribute('aria-label',name+' '+(cardAudience==='student'?'학생 본인':'학부모')+' '+actionLabel);
   action.title=['pending','unconfirmed'].includes(state)?'기존 접수 기록과 수신 결과만 조회합니다.':'현재 수업일의 안내를 확인된 '+(cardAudience==='student'?'학생 번호':'학부모 번호')+'로 바로 발송합니다.';
   action.onclick=async()=>{
    if(cardBulkUI?.isSending())return;
    action.disabled=true;action.setAttribute('aria-busy','true');action.textContent=['pending','unconfirmed'].includes(state)?'조회 중':'발송 중';
    try{await openCardRosterAction(name,state);}finally{action.disabled=false;action.removeAttribute('aria-busy');action.textContent=actionLabel;}
   };tile.append(action);
  }
  sections.get(state).push(tile);
 }
 for(const [state,[title,description]] of Object.entries(groups)){
  const rows=sections.get(state)||[];if(!rows.length)continue;
  const g=make('section'),h=make('div'),grid=make('div');g.className='roster-group roster-'+state;h.className='roster-heading';h.title=description;
  h.append(make('strong',title),make('span',rows.length+'명'));grid.className='roster-tiles';grid.append(...rows);const desc=make('p',description);desc.className='roster-description';g.append(h,desc,grid);list.append(g);
 }
 if(!visible.length)list.append(make('p',keyword?'검색 결과가 없습니다.':ready?'해당 상태의 학생이 없습니다.':'발송 상태를 확인하고 있습니다.'));
 const selectable=visible.filter(n=>Object.hasOwn(studentImageScheduleMap,n));
 if(!selectable.includes(selectedStudentForImage)){
  if(selectable.length)selectStudentImageItem(selectable[0],{skipListRender:true});
  else if(selectedStudentForImage){selectedStudentForImage='';resetCardAlimtalk();renderCardMessageReference();}
 }
 refreshStudentImageListSelectionState();list.scrollLeft=scrollLeft;
}
