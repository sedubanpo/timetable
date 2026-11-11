'use strict';
// Entirely synthetic: no transport or production messages.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require(process.env.ALIMTALK_JSDOM_PATH||'/tmp/timetable-alimtalk-test-tools/node_modules/jsdom');
function setup(api){
 const dom=new JSDOM('<main id="studentImageModal"><div class="batch-bar"><button>대상 전환</button></div><aside></aside></main>',{runScripts:'outside-only'}),w=dom.window,host=w.document.querySelector('aside');
 w.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};
 for(const f of ['alimtalk-contract.js','alimtalk-batch-ui.js'])w.eval(fs.readFileSync('assets/'+f,'utf8'));
 const ui=w.TimetableBatchUI.mount({host,api,context:()=>({date:'2026-11-12',audience:'student'}),refresh:()=>{}});
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
