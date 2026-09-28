const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const core=require('./core');
function fixture(){
  const data=new Map(),secret='fixture-secret'.repeat(4);let sourceCalls=0,failSource=false;
  const now=Date.now(),date=core.dates(now)[0],parts=date.split('-'),sheet=Number(parts[1])+'/'+Number(parts[2])+'(월)';
  const snapshot={schema:1,date,sheet,capturedAt:now,data:{headers:['1강의실'],grid:{},version:'v1'},owners:{},rooms:{rooms:['1강의실'],rows:[]}};
  for(let h=8;h<=23;h++){snapshot.data.grid[h]=[['개별 수학 가상T','학생A']];snapshot.owners[h]=[['가상']];}
  const ref=id=>({id,get:async()=>({exists:data.has(id),data:()=>data.get(id)})});
  const db={collection:c=>({doc:id=>ref(c+'/'+id),where:()=>({select:()=>({get:async()=>({docs:[...data].filter(([k])=>k.startsWith(c+'/')).map(([,d])=>({data:()=>d}))})})})}),runTransaction:async fn=>fn({get:r=>r.get(),set:(r,d)=>data.set(r.id,d),delete:r=>data.delete(r.id)})};
  data.set('users/u',{role:'ADMIN',status:'ACTIVE',name:'가상'});
  const exports={},context={exports,console:{warn(){},error(){}},AbortSignal,Date,fetch:async(url,opts)=>{
    sourceCalls++;const envelope=JSON.parse(opts.body);assert.equal(envelope.signature,crypto.createHmac('sha256',secret).update(envelope.body).digest('base64url'));
    return {ok:true,json:async()=>failSource?{ok:false}:{ok:true,snapshots:[snapshot],sheets:[sheet,'10/3(토)'],catalogCapturedAt:now}};
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
test('bootstrap verifies fresh identity and returns date-only metadata without Apps Script',async()=>{
  const f=fixture();await f.request({action:'save',sheet:f.sheet});
  f.data.set('users/u',{role:'TEACHER',status:'ACTIVE',name:'가상',loginId:'01011112222'});
  const result=await f.request({action:'bootstrap'});
  assert.equal(result.identity.isMaster,false);assert.equal(result.identity.firebaseUid,'u');
  assert.equal(result.identity.teacherName,'가상');assert.equal(result.identity.loginId,'01011112222');
  assert(result.sheets.includes('10/3(토)'));assert.equal(result.savedSheets[0].sheet,f.sheet);
  assert(!JSON.stringify(result).includes('학생A'));assert(!JSON.stringify(result).includes('grid'));
  assert.equal(f.calls(),1,'bootstrap must not call origin');
  f.data.set('userAppAccess/u',{apps:{liveTimetable:false}});
  assert.equal((await f.request({action:'bootstrap'})).status,403);
  assert.equal((await f.request({action:'bootstrap'},'expired')).status,401);
});
test('bootstrap still works before catalog provisioning; no student data in date fallback',async()=>{
  const f=fixture();let result=await f.request({action:'bootstrap'});
  assert.equal(result.identity.isMaster,true);assert.equal(result.sheets.length,0);assert.equal(f.calls(),0);
  await f.request({action:'save',sheet:f.sheet});
  f.data.delete('liveTimetableSnapshotJobs/catalog');
  result=await f.request({action:'bootstrap'});assert.deepEqual([...result.sheets],[f.sheet]);
  assert(!JSON.stringify(result).includes('학생A'));
  f.data.set('liveTimetableSnapshotJobs/catalog',{sheets:['1/1(목)'],capturedAt:Date.now()-8*86400000});
  result=await f.request({action:'bootstrap'});assert(!result.sheets.includes('1/1(목)'));
});
