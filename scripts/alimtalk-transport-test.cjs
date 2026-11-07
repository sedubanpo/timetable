'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(file){const text=fs.readFileSync(file,'utf8'),start=text.indexOf('      async function cardAlimtalkApi('),end=text.indexOf('      function openCardAlimtalkReview()',start);let calls=0,timer,cleared=false,refreshes=0,accepted=[];
const user={getIdToken:async()=> 'synthetic-token'},auth={currentUser:user};
const scope={AbortController,cardAlimtalkRequestGeneration:0,cardAlimtalkSelections:{},cardAlimtalkKey:()=> 'synthetic-context',rosterKey:()=> 'roster-context',reloadCardRoster:async()=>{refreshes++;},acceptCardRoster:(rows,key)=>accepted.push({rows,key}),getLiveFirebaseAuth:async()=>auth,fetch:async()=>{calls++;return {ok:true,json:async()=>({ok:true})};},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{cleared=true;}};
vm.createContext(scope);vm.runInContext(text.slice(start,end),scope);return {scope,user,auth,calls:()=>calls,expire:()=>timer(),cleared:()=>cleared,refreshes:()=>refreshes,accepted};}
for(const file of ['Index.html','docs/index.html']){
 test(file+': transport works without AbortSignal.timeout and clears deadline',async()=>{const f=setup(file);assert.equal((await f.scope.cardAlimtalkApi('testPreview',{})).ok,true);assert.equal(f.calls(),1);assert(f.cleared());});
 test(file+': auth/token/network/non-JSON errors are distinct and redact raw error text',async()=>{for(const [stage,code] of [['auth','AUTH_CONNECTION_FAILED'],['token','TOKEN_UNAVAILABLE'],['network','NETWORK_UNAVAILABLE'],['response','INVALID_RESPONSE']]){const f=setup(file),bad=async()=>{throw Error('private diagnostic must not escape');};if(stage==='auth')f.scope.getLiveFirebaseAuth=bad;if(stage==='token')f.user.getIdToken=bad;if(stage==='network')f.scope.fetch=bad;if(stage==='response')f.scope.fetch=async()=>({ok:true,json:bad});await assert.rejects(f.scope.cardAlimtalkApi('testPreview',{}),e=>e.code===code&&!e.message.includes('private'));assert(f.cleared());}});
 test(file+': hung token has finite deadline; late token never issues HTTP',async()=>{const f=setup(file);let resolve;f.user.getIdToken=()=>new Promise(r=>resolve=r);const p=f.scope.cardAlimtalkApi('testSend',{});await new Promise(r=>setImmediate(r));f.expire();await assert.rejects(p,{code:'TIMEOUT'});resolve('synthetic-late');await Promise.resolve();assert.equal(f.calls(),0);assert(f.cleared());});
 test(file+': account change during token retrieval prevents HTTP',async()=>{const f=setup(file);f.user.getIdToken=async()=>{f.auth.currentUser={};return 'synthetic-late';};await assert.rejects(f.scope.cardAlimtalkApi('testPreview',{}),{code:'SESSION_CHANGED'});assert.equal(f.calls(),0);});
 test(file+': server failure remains coded and no auto replay occurs',async()=>{const f=setup(file);let calls=0;f.scope.fetch=async()=>{calls++;return {ok:false,json:async()=>({code:'RESULT_UNCERTAIN'})};};await assert.rejects(f.scope.cardAlimtalkApi('testSend',{}),{code:'RESULT_UNCERTAIN'});assert.equal(calls,1);});
}

for(const file of ['Index.html','docs/index.html']){
 test(file+': mapping save refreshes roster before contact lookup, without replaying writes',async()=>{
  const f=setup(file),actions=[];
  f.scope.fetch=async(url,request)=>{actions.push(JSON.parse(request.body).action);return {ok:true,json:async()=>({studentId:'s1'})};};
  await f.scope.cardAlimtalkApi('saveMapping',{});
  assert.equal(f.scope.cardAlimtalkSelections['synthetic-context'],'s1');assert.equal(f.refreshes(),1);assert.deepEqual(actions,['saveMapping']);
 });
 test(file+': recovered mapping refreshes roster; unlinked candidate does not',async()=>{
  const f=setup(file);await f.scope.cardAlimtalkApi('reviewState',{});assert.equal(f.refreshes(),0);
  f.scope.fetch=async()=>({ok:true,json:async()=>({mappingRevision:'saved'})});await f.scope.cardAlimtalkApi('reviewState',{});assert.equal(f.refreshes(),1);
 });
 test(file+': bulk preview shares the exact server rows with the roster for both audiences',async()=>{
  for(const audience of ['student','guardian']){const f=setup(file),rows=[{name:'확인학생',studentId:'s1',issue:audience==='student'?'본인 번호 없음 · 학부모만 안내':''}];
   f.scope.fetch=async()=>({ok:true,json:async()=>({date:'2026-11-08',audience,rows})});
   const result=await f.scope.cardAlimtalkApi('batchPreview',{date:'2026-11-08',audience,mode:'unsent'});
   assert.equal(f.accepted[0].rows,result.rows);assert.equal(f.accepted[0].key,'roster-context');assert.equal(f.refreshes(),0);
  }
 });
 test(file+': failed save keeps holds; a previous student response cannot refresh current scope',async()=>{
  const f=setup(file);f.scope.fetch=async()=>({ok:false,json:async()=>({code:'MAPPING_CHANGED'})});
  await assert.rejects(f.scope.cardAlimtalkApi('saveMapping',{}),{code:'MAPPING_CHANGED'});assert.equal(f.refreshes(),0);
  f.scope.fetch=async()=>{f.scope.cardAlimtalkRequestGeneration++;return {ok:true,json:async()=>({studentId:'s1'})};};
  await assert.rejects(f.scope.cardAlimtalkApi('saveMapping',{}),{code:'SESSION_CHANGED'});assert.equal(f.refreshes(),0);
 });
 test(file+': completed preview cannot be overwritten by an older roster response',async()=>{
  const text=fs.readFileSync(file,'utf8'),start=text.indexOf('function acceptCardRoster('),end=text.indexOf('function rosterStudentId()',start);
  let resolve,renders=0;const scope={cardRosterRead:0,cardRosterRows:[],cardRosterError:'',cardRosterScope:'',studentCardMode:'message',rosterKey:()=> 'scope-a',isStudentImageModalOpen:()=>true,filterStudentImageList:()=>{renders++;},cardBatchContext:()=>({date:'2026-11-08',audience:'student'}),cardAlimtalkApi:()=>new Promise(r=>{resolve=r;}),TimetableBatchUI:{errorText:()=> '조회 실패'}};
  vm.createContext(scope);vm.runInContext(text.slice(start,end),scope);
  const pending=scope.reloadCardRoster(),fresh=[{name:'확인학생',issue:''}];scope.acceptCardRoster(fresh,'scope-a');resolve({rows:[{name:'확인학생',issue:'처음 연결하는 학생 · 학생 확인 필요'}]});await pending;
  assert.equal(scope.cardRosterRows,fresh);assert.equal(renders,2);
  scope.rosterKey=()=> 'scope-b';scope.acceptCardRoster([{name:'이전 날짜'}],'scope-a');assert.equal(scope.cardRosterRows,fresh);
 });
}
