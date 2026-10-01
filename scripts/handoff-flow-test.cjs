'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {handle, empty} = require('../handoff-functions/core');
const {database} = require('../handoff-functions/test.cjs');
const html = fs.readFileSync('docs/handoff.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function page() {
  const elements = new Map(), messages = [], timers = new Map(), requests = [];
  let timerId = 0, failAction = '', failAfterCommit = false;
  const db = database(), who = {uid:'flow-test', name:'합성 강사', admin:true};
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value:'', hidden:false, disabled:false, textContent:'', innerHTML:'', handlers:{},
      classList:{add(){},remove(){},toggle(){}},
      addEventListener(type, fn){this.handlers[type] = fn;}, setAttribute(){},
      select(){}, focus(){}, showModal(){this.open = true;}, close(){this.open = false;},
      querySelectorAll(selector){
        const key = selector.match(/\[data-(\w+)\]/)?.[1];
        if (!key) return [];
        this.buttons = [...this.innerHTML.matchAll(new RegExp('data-'+key+'="([^"]+)"', 'g'))]
          .map(m => ({dataset:{[key]:m[1]}}));
        return this.buttons;
      }
    });
    return elements.get(id);
  }
  for (const [id, value] of Object.entries({student:'',note:'',startHour:'14',startMinute:'00',endHour:'16',endMinute:'00',type:'개별',teacherSearch:'',stateFilter:'all'})) element(id).value=value;
  const ctx = {
    document:{getElementById:element},window:{addEventListener(){}},
    parent:{postMessage:m=>messages.push(m)},crypto,console,
    setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    confirm:()=>true
  };
  vm.createContext(ctx);vm.runInContext(script,ctx);
  ctx.callRpc = async body => {
    requests.push(structuredClone(body));
    if (body.action===failAction&&!failAfterCommit) throw Error('UNAVAILABLE');
    const result = await handle(db,who,body);
    if (body.action===failAction&&failAfterCommit) throw Error('TIMEOUT');
    return result;
  };
  vm.runInContext("parentOrigin='https://fixture.example';identity={uid:'flow-test',name:'합성 강사',admin:true};rpc=callRpc;",ctx);
  return {element,ctx,requests,messages,timers,db,run:s=>vm.runInContext(s,ctx),fail:(action,after=false)=>{failAction=action;failAfterCommit=after;}};
}
(async()=>{
  const p=page();await p.run("loadDay('2026-10-01')");
  p.element('startHour').onkeydown({key:'ArrowUp',preventDefault(){}});
  assert.equal(p.element('startHour').value,'15');assert(p.timers.size);
  await p.run('flush()');await p.run("loadDay('2026-10-01')");assert.equal(p.element('startHour').value,'15');
  p.element('student').value='합성 학생';
  p.element('entry').onsubmit({preventDefault(){}});
  const currentForm=p.element('student').value;
  await p.run("setMode('teacher')");assert.equal(p.element('student').value,currentForm);
  await p.run('send()');assert.equal(p.run('dirty'),false);
  assert.equal(p.run('revision'),3);assert.equal(p.requests.filter(r=>r.action==='submit').length,1);
  p.element('student').value='아직 입력 중';p.element('entry').handlers.input();
  const before=p.requests.length;await p.run("setMode('teacher')");
  assert.equal(p.element('student').value,'아직 입력 중');assert.equal(p.requests.length,before);
  p.element('student').value='';
  p.element('board').buttons.find(b=>b.dataset.edit).onclick();
  assert(p.timers.size, 'entering edit schedules persistence');p.element('student').value='합성 학생';p.element('note').value='수정 중';
  await p.run('flush()');await p.run("loadDay('2026-10-01')");
  assert.equal(p.run('editing'),11);assert.equal(p.element('note').value,'수정 중');
  await p.run('send()');assert.match(p.element('feedback').textContent,/수정을 마쳐/);
  p.element('entry').onsubmit({preventDefault(){}});
  p.fail('saveDraft');await p.run('send()');assert.equal(p.run('locked'),false);
  assert.equal(p.element('note').value,'');assert.equal(p.run('rows[0].note'),'수정 중');
  p.fail('');await p.run('flush()');
  p.fail('submit',true);await p.run('send()');
  assert.equal(p.run('locked'),true);const operation=p.run('pendingSubmit.operationId');
  p.fail('');await p.run('send()');assert.equal(p.run('locked'),false);assert.equal(p.run('pendingSubmit'),null);
  assert.equal(p.requests.filter(r=>r.action==='submit').at(-1).operationId,operation);
  assert.equal([...p.db.data.keys()].filter(k=>k.includes('/versions/')).length,2);
  await p.run("setMode('admin')");assert.equal(p.run('currentVersion().rows[0].note'),'수정 중');
  await p.run("changeStatus('반영 완료')");assert.equal(p.run('currentVersion().state'),'반영 완료');
  p.element('versions').value='1';p.element('versions').onchange();assert.equal(p.run('currentVersion().state'),'미확인');
  p.element('teacherSearch').value='없는 강사';p.element('teacherSearch').oninput();assert.equal(p.run('selected'),'');assert.match(p.element('board').innerHTML,/표시할 제출/);
  p.run("mode='teacher';dirty=true;rows[0].note='최종 확인';");
  p.ctx.callRpc=async b=>{if(b.action==='submit')throw Error('FORBIDDEN');return handle(p.db,{uid:'flow-test',name:'합성 강사',admin:true},b);};
  p.run('rpc=callRpc');await p.run('send()');assert.equal(p.run('locked'),false);assert.equal(p.run('pendingSubmit'),null);assert.match(p.element('status').textContent,/권한/);
  const q=page();q.fail('draft');await assert.rejects(q.run("loadDay('2026-10-02')"));q.run('requestClose()');assert.equal(q.messages.at(-1).type,'closed');
  console.log('PASS actual-page flow: numeric keys, same-tab preservation, unfinished edits, save failure, committed-response loss retry, immutable versions, filters, failed-load close');
})().catch(e=>{console.error(e);process.exitCode=1;});
