const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const core=require('./core');
function fixture(){
  const data=new Map(),secret='fixture-secret'.repeat(4);let sourceCalls=0,failSource=false;
  const now=Date.now(),date=core.dates(now)[0],parts=date.split('-'),sheet=Number(parts[1])+'/'+Number(parts[2])+'(월)';
  const snapshot={schema:1,date,sheet,capturedAt:now,data:{headers:['1강의실'],grid:{},version:'v1'},owners:{},rooms:{rooms:['1강의실'],rows:[]}};
  for(let h=8;h<=23;h++){snapshot.data.grid[h]=[['개별 수학 가상T','학생A']];snapshot.owners[h]=[['가상']];}
  const ref=id=>({id,get:async()=>({exists:data.has(id),data:()=>data.get(id)})});
  const db={collection:c=>({doc:id=>ref(c+'/'+id)}),runTransaction:async fn=>fn({get:r=>r.get(),set:(r,d)=>data.set(r.id,d),delete:r=>data.delete(r.id)})};
  data.set('users/u',{role:'ADMIN',status:'ACTIVE',name:'가상'});
  const exports={},context={exports,console:{warn(){},error(){}},AbortSignal,Date,fetch:async(url,opts)=>{
    sourceCalls++;const envelope=JSON.parse(opts.body);assert.equal(envelope.signature,crypto.createHmac('sha256',secret).update(envelope.body).digest('base64url'));
    return {ok:true,json:async()=>failSource?{ok:false}:{ok:true,snapshots:[snapshot]}};
  },require:name=>({
    'firebase-admin/app':{initializeApp(){}},'firebase-admin/auth':{getAuth:()=>({verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(token!=='valid')throw Error('auth');return {uid:'u'};}})},
    'firebase-admin/firestore':{getFirestore:()=>db},'firebase-functions/v2/https':{onRequest:(config,handler)=>Object.assign(handler,{config})},
    'firebase-functions/v2/scheduler':{onSchedule:(config,handler)=>Object.assign(handler,{config})},'firebase-functions/params':{defineSecret:()=>({value:()=>secret})},'node:crypto':crypto,'./core':core
  })[name]};
  vm.runInNewContext(fs.readFileSync(__dirname+'/index.js','utf8'),context);
  async function request(body,token='valid'){let status=200,result;await exports.timetableSnapshotApi({method:'POST',body,headers:{authorization:'Bearer '+token}},{set(){},status(s){status=s;return this;},json(v){result=v;return this;}});return {status,...result};}
  return {data,sheet,snapshot,exports,request,fail(){failSource=true;},calls:()=>sourceCalls};
}
test('manual ADMIN save, private read, failure preservation and fresh revocation',async()=>{
  const f=fixture();assert.equal((await f.request({action:'save',sheet:f.sheet})).ok,true);assert.equal(f.calls(),1);
  const read=await f.request({action:'read',sheet:f.sheet});assert.equal(read.data.version,'v1');assert.equal(f.calls(),1,'read must not use GAS');
  f.fail();assert.equal((await f.request({action:'save',sheet:f.sheet})).ok,false);assert.equal((await f.request({action:'read',sheet:f.sheet})).data.version,'v1');
  f.data.set('users/u',{role:'TEACHER',status:'ACTIVE',name:'다른'});assert.equal((await f.request({action:'save',sheet:f.sheet})).status,403);
  const restricted=await f.request({action:'read',sheet:f.sheet,teacher:'가상'});assert(!JSON.stringify(restricted).includes('학생A'));
  f.data.set('users/u',{role:'ADMIN',status:'DISABLED'});assert.equal((await f.request({action:'read',sheet:f.sheet})).status,403);
  assert.equal((await f.request({action:'read',sheet:f.sheet},'expired')).status,401);
});
test('two-hour job and concurrent writer lease',async()=>{
  const f=fixture();assert.equal(f.exports.timetableSnapshotEveryTwoHours.config.schedule,'0 */2 * * *');
  await f.exports.timetableSnapshotEveryTwoHours();assert.equal(f.calls(),1);
  f.data.set('liveTimetableSnapshotJobs/writer',{owner:'other',until:Date.now()+100000});
  assert.equal((await f.request({action:'save',sheet:f.sheet})).status,409);assert.equal(f.calls(),1);
});
