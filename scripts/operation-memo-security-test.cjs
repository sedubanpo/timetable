'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const {createHandler}=require('../handoff-functions/operation-memo-http');
const html=fs.readFileSync('Index.html','utf8');
function span(from,to){return html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)));}
function page() {
  const els=new Map(),requests=[],alerts=[];let session='synthetic-session',reply={ok:true,status:200,json:async()=>({ok:true,items:[]})};
  function el(id){if(!els.has(id))els.set(id,{value:'',disabled:false,textContent:'',style:{},classList:{toggle(){}}});return els.get(id);}
  const ctx={document:{getElementById:el},authState:{loggedIn:true,isMaster:true,isLookup:false},operationMemoState:{configured:true,editingId:''},getScheduleSessionKey:()=>session,getLiveFirebaseAuth:async()=>({currentUser:{getIdToken:async()=>'synthetic-firebase-token'}}),setTimeout,clearTimeout,AbortController,crypto:require('node:crypto'),alert:m=>alerts.push(m),getOperationMemoDateKey:()=> '2026-10-01',currentSheetName:'10/1(목)',parseOperationMemoSchoolTarget:s=>({school:s,grade:''}),normalizeOperationMemoGrade:s=>s,loadOperationMemosForCurrentSheet:async()=>[],isOperationMemoAvailable:()=>true,isOperationMemoReadable:()=>true,renderOperationMemoSchoolWarningToggle(){},renderOperationMemoList(){},renderOperationMemoSourceSummary(){},fetch:async(url,opts)=>{requests.push({url,opts});if(reply instanceof Error)throw reply;return reply;}};
  vm.createContext(ctx);
  vm.runInContext(span('var operationMemoPendingWrite','function resolveOperationMemoSourceItems'),ctx);
  vm.runInContext(span('function openOperationMemoModal()','function findOperationMemoById'),ctx);
  el('operationMemoTypeInput').value='common';el('operationMemoSeverityInput').value='warning';el('operationMemoMessageInput').value='합성 입력';
  return {ctx,el,requests,alerts,run:s=>vm.runInContext(s,ctx),reply:r=>reply=r,session:s=>session=s};
}
test('frontend uses only Firebase token and fixed endpoint, never anonymous REST fallback',async()=>{
  const p=page();await p.run("fetchOperationMemos('2026-10-01')");
  assert.equal(p.requests.length,1);assert.equal(p.requests[0].url,'https://asia-northeast3-fir-lms-prod.cloudfunctions.net/timetableOperationMemoApi');assert.equal(p.requests[0].opts.headers.Authorization,'Bearer synthetic-firebase-token');assert.equal(p.requests[0].opts.headers.apikey,undefined);
  p.ctx.authState.isMaster=false;await assert.rejects(p.run("fetchOperationMemos('2026-10-01')"),/FORBIDDEN/);assert.equal(p.requests.length,1);
  p.ctx.authState.isMaster=true;p.ctx.authState.isLookup=true;await assert.rejects(p.run("fetchOperationMemos('2026-10-01')"),/FORBIDDEN/);
});
test('save failure preserves input/UUID and retries same body; repeated clicks do not duplicate',async()=>{
  const p=page();p.reply(Error('synthetic offline'));const first=p.run('saveOperationMemo()');await p.run('saveOperationMemo()');await first;
  assert.equal(p.requests.length,1);assert.equal(p.el('operationMemoMessageInput').value,'합성 입력');assert.equal(p.el('operationMemoMessageInput').disabled,true);
  const firstBody=p.requests[0].opts.body;const body=JSON.parse(firstBody);assert.equal(body.action,'create');assert.equal(body.data.created_by,undefined);assert.equal(body.data.updated_at,undefined);
  p.reply({ok:true,status:200,json:async()=>({ok:true,items:[]})});await p.run('saveOperationMemo()');assert.equal(p.requests[1].opts.body,firstBody);assert.equal(p.el('operationMemoMessageInput').value,'');assert.equal(p.el('operationMemoMessageInput').disabled,false);
});
test('actual frontend -> HTTP auth -> synthetic REST -> lost response retry creates one row',async()=>{
  const p=page(),rows=new Map();let loseResponse=true;
  const handler=createHandler({
    verifyToken:async token=>{assert.equal(token,'synthetic-firebase-token');return {uid:'synthetic-staff'};},
    loadAccount:async()=>[{role:'STAFF',status:'ACTIVE',name:'합성 직원'},{},{permissions:{canManageSchedules:true}}],
    serverKey:()=> 'sb_secret_synthetic_only',
    fetchImpl:async(url,opts)=>{
      const u=new URL(url);let out=[];
      if(opts.method==='POST'){const r=JSON.parse(opts.body);if(!rows.has(r.id)){rows.set(r.id,r);out=[r];}}
      if(opts.method==='GET'){const id=u.searchParams.get('id')?.slice(3);out=[...rows.values()].filter(r=>!id||r.id===id);}
      return {ok:true,status:200,json:async()=>structuredClone(out)};
    }
  });
  p.ctx.fetch=async(url,opts)=>{
    p.requests.push({url,opts});let code=200,body;
    const res={set(){},status:n=>{code=n;return res;},json:v=>{body=v;return res;}};
    await handler({method:'POST',headers:{authorization:opts.headers.Authorization},body:JSON.parse(opts.body)},res);
    if(loseResponse){loseResponse=false;throw Error('synthetic response lost after commit');}
    return {ok:code===200,status:code,json:async()=>body};
  };
  await p.run('saveOperationMemo()');assert.equal(rows.size,1);assert.equal(p.el('operationMemoMessageInput').value,'합성 입력');
  await p.run('saveOperationMemo()');assert.equal(rows.size,1);assert.equal(p.requests[0].opts.body,p.requests[1].opts.body);assert.equal(p.el('operationMemoMessageInput').value,'');assert.equal([...rows.values()][0].created_by,'synthetic-staff');
});
test('misconfigured API leaves input editable with no anonymous fallback',async()=>{
  const p=page();p.reply({ok:false,status:503,json:async()=>({ok:false,error:'SERVER_NOT_CONFIGURED'})});await p.run('saveOperationMemo()');
  assert.equal(p.el('operationMemoMessageInput').value,'합성 입력');assert.equal(p.el('operationMemoMessageInput').disabled,false);assert.equal(p.run('operationMemoPendingWrite'),null);assert.equal(p.requests.length,1);
});
test('pending save survives close/reopen; different session cannot replay it',async()=>{
  const p=page();p.reply(Error('synthetic offline'));await p.run('saveOperationMemo()');p.run('closeOperationMemoModal();openOperationMemoModal()');assert.equal(p.el('operationMemoMessageInput').value,'합성 입력');
  const n=p.requests.length;p.session('other-session');await p.run('saveOperationMemo()');assert.equal(p.requests.length,n);assert.match(p.alerts.at(-1),/같은 계정/);
});
test('account change during response is rejected and form is not cleared',async()=>{
  const p=page();p.ctx.fetch=async()=>{p.session('new-account');return {ok:true,json:async()=>({ok:true,items:[]})};};await p.run('saveOperationMemo()');assert.equal(p.el('operationMemoMessageInput').value,'합성 입력');
});
test('frontend update and delete both use authenticated fixed memo API with date and stable ID',async()=>{
  const p=page(),id='00000000-0000-4000-8000-000000000001';
  p.ctx.operationMemoState.editingId=id;p.ctx.operationMemoState.items=[{id,date_key:'2026-10-01'}];
  await p.run('saveOperationMemo()');assert.equal(JSON.parse(p.requests[0].opts.body).action,'update');assert.equal(JSON.parse(p.requests[0].opts.body).id,id);
  p.ctx.confirm=()=>true;p.ctx.isAutomaticOperationMemo=()=>false;
  vm.runInContext(span('function findOperationMemoById','function hasGasRunner()'),p.ctx);
  await p.run("deleteOperationMemo('"+id+"')");
  assert.deepEqual(JSON.parse(p.requests[1].opts.body),{action:'delete',id,date:'2026-10-01'});
  assert(p.requests.every(r=>r.opts.headers.Authorization==='Bearer synthetic-firebase-token' && r.url.endsWith('/timetableOperationMemoApi')));
});
test('definitive authentication, permission and input failures preserve form and unlock edits without fallback',async()=>{
  for(const [status,error] of [[401,'UNAUTHORIZED'],[403,'FORBIDDEN'],[400,'INVALID_DATA'],[409,'CONFLICT']]){
    const p=page();p.reply({ok:false,status,json:async()=>({ok:false,error})});await p.run('saveOperationMemo()');
    assert.equal(p.requests.length,1);assert.equal(p.el('operationMemoMessageInput').value,'합성 입력');assert.equal(p.el('operationMemoMessageInput').disabled,false);assert.equal(p.run('operationMemoPendingWrite'),null);
  }
});
test('deployment mirror and inline script syntax; no legacy request function remains',()=>{
  const deployed=fs.readFileSync('docs/index.html','utf8');
  for(const [a,b] of [['var operationMemoPendingWrite','function resolveOperationMemoSourceItems'],['function openOperationMemoModal()','function hasGasRunner()']]) assert.equal(span(a,b),deployed.slice(deployed.indexOf(a),deployed.indexOf(b,deployed.indexOf(a))));
  assert(deployed.includes('window.SeduHubAdapter='));assert(deployed.includes('src="hub-start.mjs"'));
  for(const source of [html,deployed]) {
    assert(!source.includes('function operationMemoSupabaseRequest'));
    for(const [,script] of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if(script.trim()) new vm.Script(script);
  }
});
