'use strict';
// Entirely synthetic: no transport or production messages.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require(process.env.ALIMTALK_JSDOM_PATH||'/tmp/timetable-alimtalk-test-tools/node_modules/jsdom');
function setup(api,refresh=()=>{}){
 const dom=new JSDOM('<main id="studentImageModal"><div class="batch-bar"><button>대상 전환</button></div><aside></aside></main>',{runScripts:'outside-only'}),w=dom.window,host=w.document.querySelector('aside');
 w.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};
 for(const f of ['alimtalk-contract.js','alimtalk-batch-ui.js'])w.eval(fs.readFileSync('assets/'+f,'utf8'));
 const ui=w.TimetableBatchUI.mount({host,api,context:()=>({date:'2026-11-12',audience:'student'}),refresh});
 const find=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
 return {dom,w,host,ui,find};
}
const preview={items:[{ticket:'synthetic',studentId:'s',name:'가상학생',relation:'학생',masked:'가상 번호',text:'가상 본문'}],rows:[{name:'가상학생'},{name:'번호없는학생',issue:'본인 번호 없음 · 학부모만 안내'},{name:'미연결학생',issue:'학생 연결 확인 필요'}],batchSize:40,previewId:'synthetic'};
async function start(s){await s.ui.review('unsent');const all=s.host.querySelector('.bulk-pick input');all.click();s.host.querySelector('.bulk-send-footer input').click();return s.host.querySelector('.send-action').onclick();}
test('preparation separates parent-only students from repairable holds and resets confirmation on selection changes',async()=>{
 const s=setup(async()=>preview);try{await s.ui.review('unsent');
 assert.deepEqual([...s.host.querySelectorAll('.bulk-holds summary')].map(x=>x.textContent),['학부모만 안내 1명','정보 확인 필요 1명']);
 assert.match(s.host.querySelector('.bulk-selection').textContent,/2026-11-12 · 학생 본인 · 0건 선택/);
 const all=s.host.querySelector('.bulk-pick input'),ack=s.host.querySelector('.bulk-send-footer input'),send=s.host.querySelector('.send-action');
 assert(send.disabled);all.click();ack.click();assert(!send.disabled);all.click();assert(send.disabled);assert(!ack.checked);
 }finally{s.dom.window.close();}
});
test('accepted messages stay explicitly unconfirmed; active range, elapsed time and modal lock are visible',async()=>{
 let finish;const s=setup(async action=>action==='batchPreview'?preview:new Promise(r=>finish=r));
 try{const operation=start(s);await new Promise(r=>setImmediate(r));assert(s.ui.isSending());
 assert.match(s.host.querySelector('.batch-active').textContent,/1–1번째/);assert.match(s.host.querySelector('.batch-elapsed').textContent,/경과/);
 assert.equal(s.host.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'0');assert(s.w.document.querySelector('.batch-bar').inert);
 finish({results:[{state:'ACCEPTED'}]});await operation;
 assert.equal(s.host.querySelector('.batch-journey').dataset.state,'submitted');assert.match(s.host.textContent,/최종 수신 결과는 아직 확인 중/);assert(!s.ui.isSending());assert(!s.w.document.querySelector('.batch-bar').inert);
 }finally{s.dom.window.close();}
});
test('known preflight rejection explains unsent remainder; uncertain outcome never offers automatic retry',async()=>{
 for(const code of ['BATCH_CHANGED','TIMEOUT']){
  let calls=0;const s=setup(async action=>{if(action==='batchPreview')return preview;calls++;throw Object.assign(Error(),{code});});
  try{await start(s);assert.equal(calls,1);assert(s.find('전체 발송 이력 보기'));
   if(code==='BATCH_CHANGED'){assert.match(s.host.textContent,/남은 1건은 발송하지 않았습니다/);assert(s.find('남은 대상 다시 확인'));}
   else{assert.match(s.host.textContent,/접수되었을 수 있습니다/);assert(!s.find('남은 대상 다시 확인'));}
  }finally{s.dom.window.close();}
 }
});
test('history counts linked SMS receipt as resolved while keeping original failure visible; filters do not send',async()=>{
 const calls=[],record={name:'가상학생',relation:'학생',masked:'가상 번호',createdAt:1,text:'가상 본문'};
 const s=setup(async action=>{calls.push(action);assert.equal(action,'batchHistory');return {results:[{...record,id:'sms',state:'DELIVERED',channel:'LMS',originalDeliveryId:'original'},{...record,id:'original',state:'FAILED'},{...record,id:'failed',state:'FAILED'},{...record,id:'pending',state:'ACCEPTED'}]};});
 try{await s.ui.history();assert(s.find('전체 3건'));assert(s.find('수신 완료 1건'));s.find('확인 필요 1건').click();
 assert.equal(s.host.querySelectorAll('.history-chain:not([hidden])').length,1);assert.equal(s.host.querySelector('.history-chain:not([hidden])').dataset.result,'attention');
 s.find('수신 완료 1건').click();const resolved=s.host.querySelector('.history-chain:not([hidden])');assert.match(resolved.textContent,/문자 수신 완료/);assert.match(resolved.textContent,/실패/);assert.deepEqual(calls,['batchHistory']);
 }finally{s.dom.window.close();}
});
test('bulk history refresh shows progress, deduplicates clicks, and never calls send',async()=>{
 let finish;const calls=[],row={name:'가상학생',relation:'학생',masked:'가상 번호',createdAt:1,state:'ACCEPTED'};
 const s=setup(async action=>{calls.push(action);if(action==='batchHistory')return {results:Array.from({length:6},(_,i)=>({...row,id:'s'+i}))};assert.equal(action,'batchRefresh');await new Promise(r=>finish=r);return {checked:5};});
 try{await s.ui.history();const b=s.find('미확정 6건 결과 갱신'),pending=b.onclick();await b.onclick();assert.match(s.host.querySelector('.roster-loading').textContent,/0 \/ 6건/);finish();await new Promise(r=>setImmediate(r));assert.match(s.host.querySelector('.roster-loading').textContent,/5 \/ 6건/);finish();await pending;assert.deepEqual(calls,['batchHistory','batchRefresh','batchRefresh','batchHistory']);}
 finally{s.dom.window.close();}
});

test('student shortcut selects only that stable ID; opens full body and requires confirmation before retry',async()=>{
 const calls=[],p={...preview,items:[{...preview.items[0],retry:true},{...preview.items[0],studentId:'other',ticket:'other-ticket',name:'다른학생'}],rows:[{studentId:'s',name:'가상학생'},{studentId:'other',name:'다른학생'}]};
 const s=setup(async(action,input)=>{calls.push({action,input});if(action==='batchPreview')return p;if(action==='batchSend')return {results:[{state:'ACCEPTED'}]};throw Error(action);});
 try{await s.ui.review('unsent',{studentId:'s',name:'가상학생'});
 assert(!s.host.textContent.includes('다른학생'));assert.equal(s.host.querySelectorAll('.bulk-review-row input').length,1);assert(s.host.querySelector('.bulk-review-row input').checked);
 assert(s.host.querySelector('.bulk-review-row details').open);assert(s.host.querySelector('.send-action').disabled);assert.match(s.host.textContent,/실패 건 재시도/);assert.equal(calls.length,1);
 s.host.querySelector('.bulk-send-footer input').click();await s.host.querySelector('.send-action').onclick();
 assert.equal(calls.length,2);assert.deepEqual(Array.from(calls[1].input.tickets),['synthetic']);assert.equal(calls[1].input.audience,'student');assert.equal(calls[1].input.confirmed,true);
 }finally{s.dom.window.close();}
});
test('pending shortcut refreshes only the selected student and exposes retry only after confirmed failure',async()=>{
 const calls=[];let state='UNKNOWN';const row={studentId:'s',name:'가상학생',id:'one',relation:'학생',masked:'가상 번호',createdAt:1};
 const s=setup(async(action,input)=>{calls.push({action,input});if(action==='batchHistory')return {results:[{...row,state},{...row,id:'other',studentId:'other',name:'다른학생',state:'UNKNOWN'}]};if(action==='batchRefresh'){state='FAILED';return {}; }throw Error(action);});
 try{await s.ui.history({studentId:'s',name:'가상학생'});assert(!s.host.textContent.includes('다른학생'));assert(!s.find('실패·미접수 건 재발송'));assert(!s.host.querySelector('.send-action'));
 await s.find('미확정 1건 결과 갱신').onclick();assert(s.find('실패·미접수 건 재발송'));assert(!s.host.textContent.includes('다른학생'));assert.deepEqual(Array.from(calls[1].input.ids),['one']);assert(calls.every(c=>!c.action.includes('Send')));
 }finally{s.dom.window.close();}
});
test('scoped preview with no eligible tickets never offers send and retains scope when opening history',async()=>{
 const s=setup(async action=>action==='batchPreview'?{...preview,items:[],rows:[{studentId:'s',state:'sent'}]}:{results:[]});
 try{await s.ui.review('unsent',{studentId:'s',name:'가상학생'});assert(!s.host.querySelector('.send-action'));await s.find('이 학생 발송 이력 보기').onclick();assert.match(s.host.querySelector('h3').textContent,/가상학생/);}finally{s.dom.window.close();}
});

test('history distinguishes missing receipt from confirmed acceptance and provides recovery action without send',async()=>{
 const s=setup(async()=>({results:[{id:'missing',studentId:'s',name:'가상학생',state:'UNKNOWN',createdAt:1,lastResultCheckAt:1000,trackingMissing:true,trackingIssue:'RECEIPT_NOT_FOUND',errorCode:'RESULT_UNCERTAIN'}]}));
 try{await s.ui.history({studentId:'s',name:'가상학생'});assert.match(s.host.textContent,/일치하는 접수 기록을 찾지 못했습니다/);assert.match(s.host.textContent,/최근 결과 조회/);assert(s.find('접수 기록 다시 찾기'));assert(!s.find('실패·미접수 건 재발송'));}finally{s.dom.window.close();}
});

test('one-click sends only fresh target tickets once and releases UI without waiting for roster refresh',async()=>{
 const calls=[];let resolvePreview;
 const s=setup(async(action,input)=>{calls.push({action,input});if(action==='batchPreview')return new Promise(r=>resolvePreview=r);return {results:[{studentId:'s',state:'ACCEPTED'}]};});
 try{
 const send=s.ui.quickSend('unsent',{studentId:'s',name:'가상학생'});
 assert(s.ui.isSending());await s.ui.quickSend('unsent',{studentId:'s',name:'가상학생'});assert.equal(calls.length,1);
 resolvePreview({...preview,items:[...preview.items,{...preview.items[0],studentId:'other',ticket:'other'}]});await send;
 assert.deepEqual(calls.map(r=>r.action),['batchPreview','batchSend']);assert.deepEqual(Array.from(calls[0].input.studentIds),['s']);
 assert.deepEqual(Array.from(calls[1].input.tickets),['synthetic']);assert(calls[1].input.confirmed);
 assert(!s.ui.isSending());assert(!s.w.document.querySelector('.batch-bar').inert);assert.equal(s.host.querySelectorAll('input').length,0);
 assert.match(s.host.textContent,/다음 학생에게 이어서 발송/);assert(!s.host.textContent.includes('수신 완료'));
 }finally{s.dom.window.close();}
});
test('one-click never sends held, pending, read-only or stale plans and never replays a timeout',async()=>{
 for(const outcome of ['pending','held','readonly','stale','timeout']){
 const calls=[];let finish;
 const s=setup(async(action)=>{calls.push(action);if(action==='batchPreview'){
  if(outcome==='stale')return new Promise(r=>finish=r);
  return {...preview,readOnly:outcome==='readonly',items:['pending','held'].includes(outcome)?[]:preview.items};
 }throw Object.assign(Error(),{code:'TIMEOUT'});});
 try{const op=s.ui.quickSend('unsent',{studentId:'s',name:'가상학생'});if(outcome==='stale'){s.ui.reset();finish(preview);}await op;
 assert.deepEqual(calls,outcome==='timeout'?['batchPreview','batchSend']:['batchPreview']);assert(!s.ui.isSending());
 if(outcome==='timeout')assert.match(s.host.textContent,/자동으로 다시 보내지 않습니다/);
 }finally{s.dom.window.close();}
 }
});

test('missing receipt recovery requires operator acknowledgement and sends only the selected student once',async()=>{
 const calls=[],row={id:'missing',studentId:'s',name:'가상학생',masked:'가상번호',state:'UNKNOWN',createdAt:1,trackingMissing:true,trackingIssue:'RECEIPT_NOT_FOUND'};
 const s=setup(async(action,input)=>{calls.push({action,input});if(action==='batchHistory')return {results:[row]};if(action==='batchReleaseUnreceived')return {resolved:true};if(action==='batchPreview')return preview;if(action==='batchSend')return {results:[{studentId:'s',state:'ACCEPTED'}]};throw Error(action);});
 try{await s.ui.history({studentId:'s',name:'가상학생'});await s.find('솔라피 미접수 확인 후 신규 발송').onclick();
 const send=s.find('미접수 확인하고 이 학생에게 신규 발송');assert(send.disabled);await send.onclick();assert.equal(calls.length,1);
 s.host.querySelector('input[type=checkbox]').click();assert(!send.disabled);await send.onclick();
 assert.deepEqual(calls.map(c=>c.action),['batchHistory','batchReleaseUnreceived','batchPreview','batchSend']);assert.equal(calls[1].input.id,'missing');assert.equal(calls[1].input.studentId,'s');assert(calls[1].input.confirmedNotReceived);assert.equal(calls[3].input.tickets.length,1);
 }finally{s.dom.window.close();}
});
test('failed receipt recovery never reaches a new dispatch',async()=>{
 const calls=[],row={id:'missing',studentId:'s',name:'가상학생',state:'UNKNOWN',createdAt:1,trackingMissing:true,trackingIssue:'RECEIPT_NOT_FOUND'};
 const s=setup(async(action)=>{calls.push(action);if(action==='batchHistory')return {results:[row]};throw Object.assign(Error(),{code:'RECEIPT_FOUND'});});
 try{await s.ui.history({studentId:'s',name:'가상학생'});await s.find('솔라피 미접수 확인 후 신규 발송').onclick();s.host.querySelector('input').click();await s.find('미접수 확인하고 이 학생에게 신규 발송').onclick();assert.deepEqual(calls,['batchHistory','batchReleaseUnreceived']);assert.match(s.host.textContent,/새 메시지는 발송하지 않았습니다/);}finally{s.dom.window.close();}
});


test('opening delivered student history refreshes that card even without missing-receipt recovery',async()=>{
 const updates=[];
 const s=setup(async()=>({results:[{id:'done',studentId:'s',name:'가상학생',state:'DELIVERED',createdAt:1}]}),input=>updates.push(input));
 try{await s.ui.history({studentId:'s',name:'가상학생'});assert(s.find('수신 완료 1건'));assert.equal(updates.length,1);assert.deepEqual(Array.from(updates[0].studentIds),['s']);assert.equal(updates[0].background,true);}finally{s.dom.window.close();}
});

test('changed schedule shortcut sends one fresh target plan for the current audience without extra checkboxes',async()=>{
 const calls=[];
 const s=setup(async(action,input)=>{calls.push({action,input});if(action==='batchPreview')return {...preview,items:[...preview.items,{...preview.items[0],studentId:'other',ticket:'not-selected'}]};if(action==='batchSend')return {results:[{state:'ACCEPTED'}]};throw Error(action);});
 try{await s.ui.quickSend('changed',{studentId:'s',name:'가상학생'});assert.deepEqual(calls.map(c=>c.action),['batchPreview','batchSend']);for(const c of calls){assert.equal(c.input.mode,'changed');assert.equal(c.input.audience,'student');}assert.deepEqual(Array.from(calls[1].input.tickets),['synthetic']);assert.equal(s.host.querySelectorAll('input').length,0);}finally{s.dom.window.close();}
});
