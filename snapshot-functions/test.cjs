const {test}=require('node:test'), assert=require('node:assert/strict'),crypto=require('node:crypto');
const core=require('./core');
const now=Date.parse('2026-09-28T13:00:00Z');
function sample(){const data={headers:['1강의실','2강의실'],version:'v1',grid:{}},owners={};for(let h=8;h<=23;h++){data.grid[h]=[['개별 수학 가상T','학생A 비밀고3'],['개별 국어 다른T','학생B']];owners[h]=[['가상'],['다른']];}return {schema:1,date:'2026-09-28',sheet:'9/28(월)',capturedAt:now,data,owners,rooms:{rooms:data.headers,rows:[]}};}
test('KST today/tomorrow and year boundary',()=>{assert.deepEqual(core.dates(Date.parse('2026-12-31T15:00:00Z')),['2027-01-01','2027-01-02']);assert.equal(core.dateForSheet('1/1(금)',Date.parse('2026-12-31T13:00:00Z')),'2027-01-01');assert.throws(()=>core.dateForSheet('2/30(월)',now));});
test('fresh roles, disabled/access revoked and staff management parity',()=>{
  assert.equal(core.identity({role:'ADMIN',status:'ACTIVE'}).full,true);
  assert.equal(core.identity({role:'STAFF',status:'ACTIVE',name:'가상'},{},{permissions:{canManageSchedules:true}}).full,true);
  assert.equal(core.identity({role:'TEACHER',status:'ACTIVE',name:'가상'},{},{permissions:{canManageSchedules:true}}).full,false);
  for(const u of [{role:'ADMIN',status:'DISABLED'},{role:'STUDENT',status:'ACTIVE'},{}])assert.throws(()=>core.identity(u));
  assert.throws(()=>core.identity({role:'ADMIN',status:'ACTIVE'},{},{apps:{liveTimetable:false}}));
});
test('teacher response excludes other teachers and mixed-owner cells',()=>{
  const s=sample(),who={full:false,name:'가상'};
  let result=core.project(s,who,'다른',false,now);assert(!JSON.stringify(result).includes('학생B'));assert(JSON.stringify(result).includes('학생A'));
  s.owners[8][0].push('다른');result=core.project(s,who,'',false,now);assert.equal(result.data.grid[8][0].length,0);
  const rooms=core.project(s,who,'',true,now);assert(!JSON.stringify(rooms).includes('학생'));assert(!JSON.stringify(rooms).includes('비밀'));
});
test('lookup signature expiry tamper and audience',()=>{
  const secret='a'.repeat(40), make=p=>{const b=Buffer.from(JSON.stringify(p)).toString('base64url');return b+'.'+crypto.createHmac('sha256',secret).update(b).digest('base64url');};
  const p={aud:'timetable-snapshot-lookup',exp:now+1000};assert.equal(core.verifyLookup(make(p),secret,now).role,'LOOKUP');
  assert.throws(()=>core.verifyLookup(make(p)+'x',secret,now));assert.throws(()=>core.verifyLookup(make(p),secret,now+2000));assert.throws(()=>core.verifyLookup(make({...p,aud:'admin'}),secret,now));
});
test('incomplete, oversized, future and expired snapshots rejected',()=>{
  for(const change of [s=>s.data.headers=[],s=>delete s.data.grid[8],s=>s.capturedAt=now-86400001,s=>s.capturedAt=now+120000,s=>s.data.grid[8][0]=[null]]){const s=sample();change(s);assert.throws(()=>core.validate(s,now));}
});
test('last known good preserved on invalid or older writes; date-key isolation',async()=>{
  const docs=new Map();const db={collection:()=>({doc:id=>({id,get:async()=>({exists:docs.has(id),data:()=>docs.get(id)})})}),runTransaction:async fn=>fn({get:ref=>ref.get(),set:(ref,d)=>docs.set(ref.id,d)})};
  const good=sample();assert.equal(await core.save(db,good,now),true);assert.equal(await core.save(db,{...good,capturedAt:now-1000},now),false);
  const bad=sample();delete bad.data.grid[9];await assert.rejects(core.save(db,bad,now));
  const result=await core.read(db,good.sheet,{full:true},'',false,now);assert.equal(result.savedAt,now);
  await assert.rejects(core.read(db,'9/29(화)',{full:true},'',false,now));
});
