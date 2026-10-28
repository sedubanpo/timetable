'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
global.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};
const {createSourceReader}=require('../snapshot-functions/alimtalk-source');
const now=Date.parse('2026-10-28T03:00:00Z'),secret='synthetic-only-secret'.repeat(2),sourceUrl='https://script.google.com/macros/s/mock-only/exec';
function snapshot(){const grid={},owners={};for(let h=8;h<=23;h++){grid[h]=[[]];owners[h]=[[]];}return {schema:1,sheet:'10/28(수)',date:'2026-10-28',capturedAt:now,data:{headers:['1강의실'],version:'mock',grid},owners,rooms:{rooms:['1강의실'],rows:[]}};}
const input={sheet:'10/28(수)',date:'2026-10-28'};
function reader(request,deadline=40){return createSourceReader({request,sourceUrl,secret,now:()=>now,deadline});}
test('fresh signed existing GAS export without persistence',async()=>{
  let count=0;const r=reader(async(url,options)=>{count++;assert.equal(url,sourceUrl);const e=JSON.parse(options.body),b=JSON.parse(e.body);assert.equal(b.action,'snapshot_export');assert.equal(b.sheet,input.sheet);assert.equal(e.signature,crypto.createHmac('sha256',secret).update(e.body).digest('base64url'));return {ok:true,snapshots:[snapshot()]};});
  assert.equal((await r(input)).data.version,'mock');assert.equal(count,1);
});
test('stale, wrong date, ambiguous and failed exports never accepted',async()=>{
  const old=snapshot();old.capturedAt--;const wrong=snapshot();wrong.date='2026-10-29';
  for(const p of [{ok:true,snapshots:[old]},{ok:true,snapshots:[wrong]},{ok:true,snapshots:[snapshot(),snapshot()]},{ok:false}])await assert.rejects(reader(async()=>p)(input));
});
test('finite deadline and cancellation even when transport never settles',async()=>{
  await assert.rejects(reader(()=>new Promise(()=>{}),5)(input),{code:'SOURCE_TIMEOUT'});
  const c=new AbortController();const p=reader(()=>new Promise(()=>{}))({...input,signal:c.signal});c.abort();await assert.rejects(p,{code:'ABORTED'});
});
test('no default transport, credential or URL fallback',()=>{
  assert.throws(()=>createSourceReader({sourceUrl,secret}));assert.throws(()=>createSourceReader({request:async()=>{},sourceUrl:'http://localhost',secret}));
});
