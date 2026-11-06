// Page adapter for the date-wide list. A roster read is independent of the highlighted student.
var cardBulkUI=null,cardRosterRows=null,cardRosterScope='',cardRosterError='',cardRosterRead=0;
function cardBatchContext(){return {date:attendanceDateKey(currentSheetName),audience:cardAudience,session:getScheduleSessionKey()+'|'+timetableLoginSequence};}
function rosterKey(){return JSON.stringify(cardBatchContext());}
async function reloadCardRoster(){
 if(!isStudentImageModalOpen()||studentCardMode!=='message')return;
 const key=rosterKey(),seq=++cardRosterRead;
 cardRosterScope=key;cardRosterRows=null;cardRosterError='';filterStudentImageList();
 try{
  const {date,audience}=cardBatchContext();
  const r=await cardAlimtalkApi('batchRoster',{date,audience},true);
  if(seq!==cardRosterRead||key!==rosterKey()||!isStudentImageModalOpen()||studentCardMode!=='message')return;
  cardRosterRows=r.rows;
 }catch(e){if(seq!==cardRosterRead||key!==rosterKey())return;cardRosterError=TimetableBatchUI.errorText(e);}
 if(isStudentImageModalOpen()&&studentCardMode==='message')filterStudentImageList();
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
 host.hidden=false;host.dataset.bulk='true';
 if(mode==='history')cardBulkUI.history();else cardBulkUI.review(mode);
 host.scrollIntoView({block:'nearest'});
}
function drawAlimtalkRoster(list,keyword){
 const ready=cardRosterScope===rosterKey()&&Array.isArray(cardRosterRows),byName=new Map();
 for(const row of ready?cardRosterRows:[]){if(!byName.has(row.name))byName.set(row.name,row);else byName.set(row.name,{name:row.name,state:'held',issue:'동명이인 · 개별 확인'});}
 const names=[...new Set([...Object.keys(studentImageScheduleMap),...byName.keys()].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
 const groups={changed:['변경 발송','이전에 받은 안내와 달라진 일정'],unsent:['미발송','아직 받지 않은 번호가 있는 학생'],sent:['발송','현재 안내 수신 완료'],pending:['결과 확인 중','접수 또는 결과 미확정'],held:['확인 필요','기록 확인 전에는 발송하지 않습니다.']};
 const visible=names.filter(n=>!keyword||n.toLowerCase().includes(keyword));
 const sections=new Map();
 list.replaceChildren();
 const make=(tag,s)=>{const n=document.createElement(tag);if(s!==undefined)n.textContent=s;return n;};
 const msg=document.getElementById('batchRosterStatus');msg.replaceChildren();
 if(!ready){
  msg.append(make('span',cardRosterError||'서버 발송 기록 확인 중…'));
  if(cardRosterError){const retry=make('button','다시 확인');retry.type='button';retry.onclick=reloadCardRoster;msg.append(retry);}
 }else{msg.textContent=(cardAudience==='student'?'학생 본인':'학부모')+' 기준 · '+names.length+'명';}
 for(const name of visible){
  const row=byName.get(name),state=row?.state||'held';
  if(!sections.has(state))sections.set(state,[]);
  const b=make('button');b.type='button';b.className='recipient-student';b.dataset.studentName=name;b.setAttribute('aria-pressed',String(name===selectedStudentForImage));
  b.append(make('strong',name));
  const sub=row?.issue||(!studentImageScheduleMap[name]?'현재 수업 없음':row?.failed?'실패 이력':!ready?'':!row?'시간표 대조 필요':'');
  if(sub)b.append(make('small',sub));
  b.onclick=()=>{if(!studentImageScheduleMap[name]){openCardBulk('history');return;}selectStudentImageItem(name,{skipListRender:true});refreshStudentImageListSelectionState();};
  sections.get(state).push(b);
 }
 for(const [state,[title,description]] of Object.entries(groups)){
  const rows=sections.get(state)||[];if(!rows.length)continue;
  const g=make('section'),h=make('div'),grid=make('div');g.className='roster-group roster-'+state;h.className='roster-heading';h.title=description;
  h.append(make('strong',title),make('span',rows.length+'명'));grid.className='roster-tiles';grid.append(...rows);g.append(h,grid);list.append(g);
 }
 if(!visible.length)list.append(make('p','검색 결과가 없습니다.'));
 const selectable=visible.filter(n=>Object.hasOwn(studentImageScheduleMap,n));
 if(!selectable.includes(selectedStudentForImage)){
  if(selectable.length)selectStudentImageItem(selectable[0],{skipListRender:true});
  else if(selectedStudentForImage){selectedStudentForImage='';resetCardAlimtalk();renderCardMessageReference();}
 }
 refreshStudentImageListSelectionState();
}
