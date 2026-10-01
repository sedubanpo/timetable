'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStore,handle,isPrivilegedKey}=require('./operation-memos');
const {createHandler}=require('./operation-memo-http');
const ID='00000000-0000-4000-8000-000000000001';
const DAY='2026-10-01';
const who={uid:'synthetic-staff-uid',name:'합성 직원',admin:true};
const data=()=>({date_key:DAY,sheet_name:'10/1(목)',student_name:'공동',target_school:'',target_grade:'',type:'common',message:'합성 메모',severity:'warning'});
function fixture() {
  const rows=new Map(),calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});const u=new URL(url),id=u.searchParams.get('id')?.slice(3),day=u.searchParams.get('date_key')?.slice(3);
    let out=[];
    if(opts.method==='POST') { const r=JSON.parse(opts.body);if(!rows.has(r.id)){rows.set(r.id,r);out=[r];} }
    if(opts.method==='GET') out=[...rows.values()].filter(r=>(!id||r.id===id)&&(!day||r.date_key===day));
    if(opts.method==='PATCH') {const r=rows.get(id);if(r?.date_key===day){Object.assign(r,JSON.parse(opts.body));out=[r];}}
    if(opts.method==='DELETE') {if(rows.get(id)?.date_key===day)rows.delete(id);return {ok:true,status:204};}
    return {ok:true,status:200,json:async()=>structuredClone(out)};
  };
  return {rows,calls,fetchImpl,store:createStore({key:'sb_secret_synthetic_only',fetchImpl})};
}
const request=(action,extra={})=>({action,date:DAY,id:ID,data:data(),...extra});
test('server auth rejects missing/invalid/revoked Firebase tokens before any storage/key access',async()=>{
  let reads=0;
  const h=createHandler({verifyToken:async()=>{throw Error('revoked');},loadAccount:async()=>{reads++;},serverKey:()=>{reads++;}});
  for(const authorization of [undefined,'Bearer synthetic-revoked']) {
    const out=await runHttp(h,{authorization});assert.equal(out.status,401);assert.equal(reads,0);
  }
});
test('confirmed memo read/write role gate is identical for every CRUD action; no raw MANAGER promotion',async()=>{
  const both={permissions:{canManageAccounts:true,canManageSchedules:true}};
  const cases=[['ADMIN',true,{},true],['STAFF',true,{permissions:{canManageSchedules:true}},true],['STAFF',true,{permissions:{canManageAccounts:true}},true],['STAFF',true,{},false],['TEACHER',true,both,false],['INSTRUCTOR',true,both,false],['DESK',true,both,false],['MANAGER',true,both,false],['ADMIN',false,{},false],['STAFF',false,both,false],['ADMIN',true,{apps:{liveTimetable:false}},false],['STAFF',true,{...both,apps:{liveTimetable:false}},false]];
  for(const [role,active,access,allowed] of cases) for(const action of ['list','create','update','delete']) {
    const f=fixture();let keys=0;
    if(action==='update'||action==='delete')f.rows.set(ID,{id:ID,...data(),active:true,created_by:'synthetic-original'});
    const h=createHandler({verifyToken:async()=>({uid:who.uid}),loadAccount:async()=>[{role,status:active?'ACTIVE':'DISABLED',name:'합성 직원'},{},access],serverKey:()=>{keys++;return 'sb_secret_synthetic_only';},fetchImpl:f.fetchImpl});
    const out=await runHttp(h,{authorization:'Bearer synthetic-firebase-token'},'POST',request(action));
    assert.equal(out.status,allowed?200:403,role+' '+action);assert.equal(keys,allowed?1:0);
    if(!allowed)assert.equal(f.calls.length,0,'denied '+role+' '+action+' never reaches storage');
  }
});
test('empty/anon/publishable server keys fail closed; privileged keys stay server-only',async()=>{
  for(const key of ['',undefined,'sb_publishable_synthetic_only','anon-synthetic', 'a.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.b']) assert.equal(isPrivilegedKey(key),false);
  const jwt='a.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.b';assert.equal(isPrivilegedKey(jwt),true);
  for(const key of ['','sb_publishable_synthetic_only']) {
    const h=createHandler({verifyToken:async()=>({uid:who.uid}),loadAccount:async()=>[{role:'ADMIN',status:'ACTIVE',name:'합성 직원'},{},{}],serverKey:()=>key,fetchImpl:()=>assert.fail('no request allowed')});
    assert.equal((await runHttp(h,{authorization:'Bearer synthetic'})).status,503);
  }
  const f=fixture();await handle(f.store,who,{action:'list',date:DAY});
  assert.equal(f.calls[0].opts.headers.Authorization,undefined);
  assert(!JSON.stringify(await handle(f.store,who,{action:'list',date:DAY})).includes('sb_secret'));
});
test('caller/table/creator spoof and cross-date mutation are rejected',async()=>{
  const f=fixture();
  for(const extra of [{uid:'another-user'},{table:'timetable_groups'},{role:'ADMIN'},{url:'https://evil.example'},{data:{...data(),created_by:'another-user'}}]) await assert.rejects(handle(f.store,who,request('create',extra)),/INVALID_DATA/);
  assert.equal(f.calls.length,0);
  await handle(f.store,who,request('create'));
  assert.equal(f.rows.get(ID).created_by,who.uid);
  await assert.rejects(handle(f.store,who,request('update',{date:'2026-10-02',data:{...data(),date_key:'2026-10-02'}})),/NOT_FOUND/);
  await handle(f.store,who,request('delete',{date:'2026-10-02'}));assert.equal(f.rows.size,1);
});
test('shared staff can update shared memos without changing legacy creator; no Supabase UUID coercion',async()=>{
  const f=fixture();f.rows.set(ID,{id:ID,...data(),created_by:'legacy-login-id',active:true});
  await handle(f.store,who,request('update',{data:{...data(),message:'합성 수정'}}));
  assert.equal(f.rows.get(ID).created_by,'legacy-login-id');assert.equal(f.rows.get(ID).message,'합성 수정');
});
test('response-loss create retry reuses UUID without duplicate; conflicting retry does not overwrite',async()=>{
  const f=fixture();await handle(f.store,who,request('create'));await handle(f.store,who,request('create'));
  assert.equal(f.rows.size,1);
  await assert.rejects(handle(f.store,who,request('create',{data:{...data(),message:'다른 내용'}})),/CONFLICT/);
  await assert.rejects(handle(f.store,{...who,uid:'another-staff'},request('create')),/CONFLICT/);
  assert.equal(f.rows.get(ID).message,'합성 메모');
});
test('list, update and idempotent delete use only fixed memo path and date scope',async()=>{
  const f=fixture();await handle(f.store,who,request('create'));assert.equal((await handle(f.store,who,{action:'list',date:DAY})).items.length,1);
  await handle(f.store,who,request('update'));await handle(f.store,who,request('delete'));await handle(f.store,who,request('delete'));
  assert.equal(f.rows.size,0);assert(f.calls.every(c=>new URL(c.url).pathname==='/rest/v1/operation_memos'));
  await assert.rejects(handle(f.store,{...who,admin:false},{action:'list',date:DAY}),/FORBIDDEN/);
});
test('invalid date/input, missing records and unknown actions never become successful writes',async()=>{
  const f=fixture();
  for(const d of [{...data(),date_key:'2026-02-30'},{...data(),type:'unknown'},{...data(),message:''},{...data(),message:'x'.repeat(3001)},{...data(),severity:'bad'}]) await assert.rejects(handle(f.store,who,request('create',{data:d})),/INVALID_DATA/);
  await assert.rejects(handle(f.store,who,request('update')),/NOT_FOUND/);
  await assert.rejects(handle(f.store,who,request('rpc')),/INVALID_ACTION/);
  const calls=f.calls.length;await assert.rejects(handle(f.store,who,{action:'attendance',date:DAY}),/INVALID_ACTION/);assert.equal(f.calls.length,calls);
  assert.equal(f.rows.size,0);
});
test('upstream failures and credential-bearing errors are sanitized; method and oversized input rejected',async()=>{
  const h=createHandler({verifyToken:async()=>({uid:who.uid}),loadAccount:async()=>[{role:'ADMIN',status:'ACTIVE',name:'합성 직원'},{},{}],serverKey:()=> 'sb_secret_synthetic_only',fetchImpl:async()=>{throw Error('synthetic credential detail');}});
  const out=await runHttp(h,{authorization:'Bearer synthetic'});assert.equal(out.status,503);assert.deepEqual(out.body,{ok:false,error:'UNAVAILABLE'});
  assert.equal((await runHttp(h,{authorization:'Bearer synthetic'},'GET')).status,405);
  assert.equal((await runHttp(h,{authorization:'Bearer synthetic'},'POST',{action:'list',date:DAY,padding:'x'.repeat(20001)})).status,400);
});
async function runHttp(handler,headers,method='POST',body={action:'list',date:DAY}) {
  const out={status:200,headers:{}};
  const res={set:(k,v)=>out.headers[k]=v,status:s=>{out.status=s;return res;},json:b=>{out.body=b;return res;}};
  await handler({method,headers,body},res);assert.equal(out.headers['Cache-Control'],'no-store');return out;
}
