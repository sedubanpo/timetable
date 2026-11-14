'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require(process.env.ALIMTALK_JSDOM_PATH||'/tmp/timetable-alimtalk-test-tools/node_modules/jsdom');
const source=fs.readFileSync('assets/alimtalk-notice-contacts-ui.js','utf8');
const sample=()=>({date:'2026-11-15',name:'가상학생',school:'가상고3',sourceFingerprint:'source',lessons:['19:00 한국사 · 검증T'],candidates:[{id:'s',name:'가상학생',school:'가상고',grade:'3',inactive:true,matches:true,contactVersion:'version',expectedRevision:null,choices:[{id:'student',relation:'학생',canEnter:true,reason:'번호 없음'},{id:'mother',relation:'모',available:true,masked:'010-****-0002',canEnter:false},{id:'father',relation:'부',canEnter:true,reason:'번호 없음'}]}]});
function setup(api,data=sample()){
 const dom=new JSDOM('<main class="alimtalk-panel"></main>',{runScripts:'outside-only'}),w=dom.window,host=w.document.querySelector('main'),ctx={date:data.date,name:data.name,session:'desk'},calls=[];
 w.eval(source);const ready=[];const ui=w.TimetableNoticeContactsUI.mount({host,context:()=>({...ctx}),onReady:r=>ready.push(r),api:async(a,i)=>{calls.push([a,JSON.parse(JSON.stringify(i))]);return a==='noticeContactOptions'?data:api(a,i);}});
 const submit=()=>host.querySelector('form').onsubmit({preventDefault(){}});
 return {dom,w,host,ctx,calls,ready,ui,submit};
}
test('form masks existing contacts, requires confirmation, saves missing relationships once and never sends',async()=>{
 let finish;const f=setup(()=>new Promise(r=>finish=r));try{
 await f.ui.open();assert.match(f.host.textContent,/중지 · 임시 참여/);assert.match(f.host.textContent,/010-\*\*\*\*-0002/);assert.equal(f.host.querySelectorAll('input[type=tel]').length,2);
 await f.submit();assert.equal(f.calls.length,1);assert.match(f.host.textContent,/체크해 주세요/);
 f.host.querySelector('input[type=tel]').value='010-0000-0001';f.host.querySelector('input[type=checkbox]').checked=true;
 const pending=f.submit();assert.equal(f.host.querySelector('form').getAttribute('aria-busy'),'true');await f.submit();assert.equal(f.calls.length,2);
 finish({studentId:'s'});await pending;assert.equal(f.calls[1][0],'saveNoticeContacts');assert.deepEqual(f.calls[1][1].temporary,{student:'010-0000-0001',father:''});assert.match(f.host.textContent,/아직 알림톡을 보내지 않았습니다/);
 f.host.querySelector('button').click();assert.equal(f.ready.length,1);assert(!f.calls.some(([a])=>/send/i.test(a)));
 }finally{f.dom.window.close();}
});
test('existing temporary contact can be kept masked, replaced or removed; errors retain entered values',async()=>{
 const data=sample();Object.assign(data.candidates[0].choices[0],{available:true,temporary:true,masked:'010-****-0003'});
 const f=setup(async()=>{throw {code:'INVALID_PHONE'};},data);try{
 await f.ui.open();const boxes=f.host.querySelectorAll('input[type=checkbox]');boxes[1].checked=true;await f.submit();assert.deepEqual(f.calls.at(-1)[1].keepTemporary,['student']);
 const input=f.host.querySelector('input[type=tel]');input.value='010123';input.dispatchEvent(new f.w.Event('input'));assert(!boxes[0].checked);await f.submit();assert.equal(input.value,'010123');assert.match(f.host.textContent,/11자리/);assert(!input.disabled);
 input.value='';await f.submit();assert.equal(f.calls.at(-1)[1].temporary.student,'');assert.deepEqual(f.calls.at(-1)[1].keepTemporary,[]);
 }finally{f.dom.window.close();}
});
test('same-name candidate selection is explicit and session switch prevents stale save or completion',async()=>{
 const data=sample();data.candidates.push({...data.candidates[0],id:'s2'});let finish;
 const f=setup(()=>new Promise(r=>finish=r),data);try{
 await f.ui.open();const select=f.host.querySelector('select');assert.equal(select.value,'');assert(f.host.querySelector('button[type=submit]').disabled);
 select.value='s2';select.dispatchEvent(new f.w.Event('change'));f.host.querySelector('input[type=checkbox]').checked=true;
 const pending=f.submit();f.ctx.session='new';finish({studentId:'s2'});await pending;assert(!f.host.textContent.includes('저장 완료'));assert.equal(f.ready.length,0);
 await f.submit();assert.equal(f.calls.length,2);
 }finally{f.dom.window.close();}
});
test('shipped HTML embeds the tested contacts UI and roster adapter identically',()=>{
 const roster=fs.readFileSync('assets/alimtalk-roster.js','utf8').trim();for(const path of ['Index.html','docs/index.html']){const html=fs.readFileSync(path,'utf8');assert(html.includes(source.trim()),path);assert(html.includes(roster),path);}
});
