'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require(process.env.ALIMTALK_JSDOM_PATH||'/tmp/timetable-alimtalk-test-tools/node_modules/jsdom');
function setup(){const dom=new JSDOM('<main id="host"></main>',{runScripts:'outside-only',url:'http://127.0.0.1/'}),w=dom.window;w.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};for(const f of ['alimtalk-contract.js','alimtalk-ui.js','alimtalk-review-ui.js'])w.eval(fs.readFileSync('assets/'+f,'utf8'));return {dom,w,host:w.document.getElementById('host')};}
const sample={date:'2026-10-28',sendEnabled:false,previewId:'synthetic',counts:{students:1,messages:1,numbers:1},rows:[{studentId:'s1',name:'가상학생',reasons:[],excluded:[],choices:[],text:'가상 본문'}]};
test('never-settling preview expires; late response cannot replace timeout; retry works',async()=>{const {dom,w,host}=setup();let resolve,n=0;const ui=w.TimetableAlimtalkUI.mount({host,context:()=>({studentId:'s1',date:sample.date}),deadline:10,api:()=>++n===1?new Promise(r=>resolve=r):Promise.resolve(sample)});await ui.load();assert(host.textContent.includes('초과'));resolve(sample);await new Promise(r=>setTimeout(r,5));assert(!host.textContent.includes('가상 본문'));await ui.load();assert(host.textContent.includes('가상 본문'));assert([...host.querySelectorAll('button')].find(b=>b.textContent==='학부모에게 발송').disabled);dom.window.close();});
test('student/date/session switch discards response and reset does not expose stale preview',async()=>{const {dom,w,host}=setup();let resolve,session='login1';const ui=w.TimetableAlimtalkUI.mount({host,context:()=>({studentId:'s1',date:sample.date,session}),api:()=>new Promise(r=>resolve=r)});const pending=ui.load();session='login2';resolve(sample);await pending;assert(!host.textContent.includes('가상 본문'));ui.reset();assert.equal(host.textContent,'');dom.window.close();});
test('review failure shows explicit retry and never calls mutation automatically',async()=>{const {dom,w,host}=setup();const calls=[];const ui=w.TimetableAlimtalkReviewUI.mount({host,context:()=>({date:sample.date}),api:async action=>{calls.push(action);throw Object.assign(Error(),{code:'FORBIDDEN'});}});await ui.open();assert(host.textContent.includes('FORBIDDEN'));assert(host.textContent.includes('연결 기록 다시 확인'));assert.deepEqual(calls,['inspect']);dom.window.close();});
test('double preview click shares one UI operation and disabled send remains locked',async()=>{const {dom,w,host}=setup();let resolve,calls=0;const ui=w.TimetableAlimtalkUI.mount({host,context:()=>({studentId:'s1',date:sample.date}),api:()=>{calls++;return new Promise(r=>resolve=r);}});const a=ui.load(),b=ui.load();resolve(sample);await Promise.all([a,b]);assert.equal(calls,1);assert([...host.querySelectorAll('button')].find(b=>b.textContent==='학부모에게 발송').disabled);dom.window.close();});
test('incomplete source shows actionable holds without exposing selectable partial entries',async()=>{const {dom,w,host}=setup();const calls=[];const ui=w.TimetableAlimtalkReviewUI.mount({host,context:()=>({date:sample.date}),api:async action=>{calls.push(action);return {date:sample.date,complete:false,entries:[{label:'must not show'}],issues:['ROOM_UNRECOGNIZED','PARTIAL_TIME_REVIEW_REQUIRED']};}});await ui.open();assert(host.textContent.includes('강의실로 해석할 수 없는'));assert(host.textContent.includes('실제 수업 시각'));assert(!host.textContent.includes('must not show'));assert.equal(host.querySelectorAll('input').length,0);assert.deepEqual(calls,['inspect']);assert(host.querySelector('[role=alert]'));dom.window.close();});

test('roster shows a visible loader on the active audience and separates delivery holds',()=>{
 const dom=new JSDOM('<main id="studentImageModal"><button data-card-audience="guardian">학부모 발송</button><button data-card-audience="student">학생 발송</button><div id="batchRosterStatus" role="status"></div><div id="list"></div><div id="rosterDetail"></div><section id="rosterComparison" hidden></section></main>',{runScripts:'outside-only'}),w=dom.window;
 Object.assign(w,{studentCardMode:'message',cardAudience:'student',currentSheetName:'11/12',attendanceDateKey:()=> '2026-11-12',getScheduleSessionKey:()=> 'operator',timetableLoginSequence:1,studentImageScheduleMap:{가학생:[],나학생:[],다학생:[],라학생:[]},selectedStudentForImage:'가학생',refreshStudentImageListSelectionState:()=>{}});
 w.eval(fs.readFileSync('assets/alimtalk-roster.js','utf8'));const list=w.document.getElementById('list');
 w.drawAlimtalkRoster(list,'');assert.equal(list.getAttribute('aria-busy'),'true');assert(w.document.querySelector('#batchRosterStatus .batch-orbit'));assert.equal(w.document.querySelector('[data-card-audience=student]').getAttribute('aria-busy'),'true');assert.match(list.textContent,/기록 확인 중/);
 w.cardRosterScope=w.rosterKey();w.cardRosterRows=[{name:'가학생',state:'unsent'},{name:'나학생',state:'unsent',issue:'본인 번호 없음 · 학부모만 안내'},{name:'다학생',state:'unsent',issue:'학생 연결 확인 필요'},{name:'라학생',state:'unsent',failed:true}];
 w.drawAlimtalkRoster(list,'');assert.equal(list.getAttribute('aria-busy'),'false');assert(!w.document.querySelector('#batchRosterStatus .batch-orbit'));
 for(const [group,name] of [['unsent','가학생'],['guardianOnly','나학생'],['held','다학생'],['failed','라학생']])assert.equal(list.querySelector('.roster-'+group+' button strong').textContent,name);
 assert.match(list.querySelector('.roster-unsent .roster-wait-reason').textContent,/수신 완료된 기록 없음/);dom.window.close();
});

test('roster shortcuts are sibling controls, scoped to audience and status; ambiguous IDs and holds cannot send',()=>{
 const dom=new JSDOM('<main id="studentImageModal"><div id="batchRosterStatus"></div><div id="list"></div><div id="rosterDetail"></div><section id="rosterComparison" hidden></section></main>',{runScripts:'outside-only'}),w=dom.window;
 Object.assign(w,{studentCardMode:'message',cardAudience:'guardian',currentSheetName:'11/12',attendanceDateKey:()=> '2026-11-12',getScheduleSessionKey:()=> 'operator',timetableLoginSequence:1,studentImageScheduleMap:{대기:[],실패:[],확인:[],완료:[],동명:[],제외:[],변경:[]},selectedStudentForImage:'실패',refreshStudentImageListSelectionState:()=>{}});
 w.eval(fs.readFileSync('assets/alimtalk-roster.js','utf8'));const list=w.document.getElementById('list');
 w.cardRosterScope=w.rosterKey();w.cardRosterRows=[{name:'대기',studentId:'a',state:'unsent'},{name:'실패',studentId:'b',state:'unsent',failed:true},{name:'확인',studentId:'c',state:'pending'},{name:'완료',studentId:'d',state:'sent'},{name:'동명',studentId:'e',state:'unsent'},{name:'동명',studentId:'f',state:'unsent'},{name:'제외',studentId:'g',state:'unsent',issue:'본인 번호 없음'},{name:'변경',studentId:'h',state:'changed',current:'18:00 과학',comparisons:[{previous:'17:00 과학',relation:'모'},{previous:'17:00 과학',relation:'부'}]}];
 const calls=[];w.openCardRosterAction=(...args)=>calls.push(args);w.drawAlimtalkRoster(list,'');
 const detail=w.document.getElementById('rosterDetail'),pick=name=>list.querySelector('[data-student-name="'+name+'"]').click();
 w.selectStudentImageItem=name=>{w.selectedStudentForImage=name;};
 assert.equal(list.querySelectorAll('.roster-student-action').length,0);
 assert.equal(detail.querySelector('button').getAttribute('aria-label'),'실패 학부모 재발송');detail.querySelector('button').click();
 assert.deepEqual(calls,[['실패','failed']]);
 pick('변경');const comparison=w.document.querySelector('#rosterComparison');assert(!comparison.hidden);assert.deepEqual(Array.from(comparison.querySelectorAll('pre'),p=>p.textContent),['17:00 과학','18:00 과학']);assert.match(comparison.textContent,/모·부/);assert.equal(calls.length,1);detail.querySelector('.roster-student-action').click();
 assert.deepEqual(calls.at(-1),['변경','changed']);
 for(const name of ['동명','제외','완료']){pick(name);assert(comparison.hidden);assert.equal(detail.querySelectorAll('.roster-student-action').length,0);assert(detail.querySelector('.roster-contact-action'));}
 dom.window.close();
});

test('targeted roster refresh keeps other students usable, preserves scroll and ignores late results after audience change',async()=>{
 const dom=new JSDOM('<main id="studentImageModal"><div id="batchRosterStatus"></div><div id="list"></div><div id="rosterDetail"></div><section id="rosterComparison" hidden></section></main>',{runScripts:'outside-only'}),w=dom.window;
 Object.assign(w,{studentCardMode:'message',cardAudience:'student',currentSheetName:'11/12',attendanceDateKey:()=> '2026-11-12',getScheduleSessionKey:()=> 'operator',timetableLoginSequence:1,studentImageScheduleMap:{가학생:[],나학생:[]},selectedStudentForImage:'가학생',refreshStudentImageListSelectionState:()=>{},isStudentImageModalOpen:()=>true});
 w.eval(fs.readFileSync('assets/alimtalk-roster.js','utf8'));const list=w.document.getElementById('list');
 w.cardRosterScope=w.rosterKey();w.cardRosterRows=[{name:'가학생',studentId:'a',state:'unsent'},{name:'나학생',studentId:'b',state:'unsent'}];w.filterStudentImageList=()=>w.drawAlimtalkRoster(list,'');w.filterStudentImageList();list.scrollTop=123;
 const calls=[];let finish;w.cardAlimtalkApi=(action,input)=>{calls.push({action,input});return new Promise(r=>finish=r);};
 try{
 const first=w.reloadCardRoster({studentIds:['a'],submitted:true,background:true});
 assert.equal(w.cardRosterRows[0].state,'pending');assert.equal(list.getAttribute('aria-busy'),'false');assert.equal(list.scrollTop,123);
 w.selectStudentImageItem=name=>{w.selectedStudentForImage=name;};
 list.querySelector('[data-student-name="나학생"]').click();
 assert.equal(w.document.querySelector('#rosterDetail .roster-student-action').getAttribute('aria-label'),'나학생 학생 본인 발송');
 finish({rows:[{name:'가학생',studentId:'a',state:'sent'}]});await first;
 assert.deepEqual(Array.from(w.cardRosterRows,r=>r.state),['sent','unsent']);assert.deepEqual(Array.from(calls[0].input.studentIds),['a']);
 const late=w.reloadCardRoster({studentIds:['a'],background:true});w.cardAudience='guardian';w.cardRosterScope=w.rosterKey();w.cardRosterRows=[{name:'가학생',studentId:'a',state:'unsent'}];
 finish({rows:[{name:'가학생',studentId:'a',state:'sent'}]});await late;assert.equal(w.cardRosterRows[0].state,'unsent');
 }finally{dom.window.close();}
});

test('individual history resolves a fallback on open and retains other receipts when a lookup fails',async()=>{
 const {dom,w,host}=setup(),calls=[];
 const checking={state:'PROCESSING',fallbackResult:'CHECKING'};
 const rows=[{id:'pending',...checking},{id:'ready',...checking},{id:'ordinary',state:'DELIVERED'}];
 const ui=w.TimetableAlimtalkUI.mount({host,context:()=>({studentId:'s',date:sample.date}),api:async(action,input)=>{
  calls.push([action,input.id]);
  if(action==='results')return {results:rows.map(r=>({...r}))};
  assert.equal(action,'reconcile');
  if(input.id==='pending')throw Error('offline');
  return {id:input.id,state:'DELIVERED',fallbackResult:'DELIVERED'};
 }});
 try{
  await ui.showResults();
  assert.deepEqual(calls,[['results',undefined],['reconcile','pending'],['reconcile','ready']]);
  assert.match(host.textContent,/대체 문자 수신 완료/);assert.match(host.textContent,/문자 대체 결과 확인 중/);assert.match(host.textContent,/조회가 지연/);
 }finally{dom.window.close();}
});

test('one eligible number and a checked timetable need no extra preview click; reuse only unchanged notes and body across audiences',async()=>{
 const {dom,w,host}=setup(),ctx={date:sample.date,studentId:'s1',session:'desk',audience:'guardian'};
 let body='10:00–13:00 / 16:00–19:00',available=true;
 const calls=[],ui=w.TimetableAlimtalkUI.mount({host,context:()=>ctx,api:async(action,{targets:[t]})=>{
  calls.push(action);assert.equal(action,'preview');
  const id=ctx.audience==='student'?'student':'mother',key=ctx.audience+body;
  const confirmed=t.reviewedMemo===key,ready=available&&confirmed&&t.recipientIds.join()===id;
  return {previewId:'p',counts:{students:+ready,messages:+ready,numbers:+ready},rows:[{studentId:'s1',text:body,
   choices:available?[{id,relation:id,masked:'***'}]:[],reasons:ready?[]:['보류'],memoReview:{key,confirmed,notes:['확인할 비고']}}]};
 }});
 try{
  await ui.load();assert(host.querySelector('input').checked);assert(host.querySelector('.send-action').disabled);
  host.querySelectorAll('input')[1].click();await new Promise(r=>setTimeout(r,0));
  assert(!host.querySelector('.send-action').disabled);
  ui.reset();ctx.audience='student';await ui.load();
  assert(!host.querySelector('.send-action').disabled);assert(host.querySelectorAll('input')[1].checked);
  ui.reset();body+=' 수정';await ui.load();assert(host.querySelector('.send-action').disabled);
  ui.reset();available=false;await ui.load();assert(host.querySelector('.send-action').disabled);
  assert(!calls.includes('send'));
 }finally{dom.window.close();}
});
