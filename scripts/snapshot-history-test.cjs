const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function fixture(){
  const elements=new Map();const element=()=>({open:false,isConnected:true,children:[],textContent:'',setAttribute(){},removeAttribute(){},appendChild(child){this.children.push(child);this.firstChild=this.children[0];},replaceChildren(){this.children=[];},showModal(){this.open=true;},close(){this.open=false;},focus(){this.focused=true;}});
  const el=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const c={Date,Intl,Promise,Error,AbortController,setTimeout,clearTimeout,authState:{loggedIn:true,loginId:'a'},currentSheetName:'9/30(수)',getScheduleSessionKey:()=>c.authState.loginId,document:{getElementById:el,createElement:element,activeElement:el('trigger')}};
  vm.createContext(c);vm.runInContext(fs.readFileSync('scripts/snapshot-client.fragment.js','utf8'),c);
  c.lastSuccessfulSchedule={sheet:c.currentSheetName,session:'a',data:{snapshotReceipt:{capturedAt:Date.now(),body:'signed'}}};
  return {c,el};
}
(async()=>{
  const {c,el}=fixture();let calls=[];c.snapshotRequest=async(...args)=>{calls.push(args);return {saved:[{sheet:c.currentSheetName}]};};
  await c.saveScheduleSnapshot();assert.equal(calls[0][3].body,'signed');assert(el('snapshotNoticeText').textContent.includes('조회한 시간표 저장 완료'));
  c.snapshotView={savedAt:Date.now()};await c.saveScheduleSnapshot();assert(!calls[1][3],'backup must never become a signed live save');
  c.snapshotView=null;c.lastSuccessfulSchedule.data.snapshotReceipt.capturedAt=Date.now()-7200001;await c.saveScheduleSnapshot();assert.equal(calls[2][3],null);
  c.snapshotRequest=async()=>{throw Error('INVALID_RECEIPT');};await c.saveScheduleSnapshot();assert(el('snapshotNoticeText').textContent.includes('검증에 실패'));assert.equal(el('snapshotSaveBtn').disabled,false);
  let resolve;c.snapshotRequest=()=>new Promise(r=>resolve=r);const pending=c.openSnapshotHistory();assert(el('snapshotHistoryDialog').open);c.closeSnapshotHistory();resolve({items:[{savedAt:Date.now(),capturedAt:Date.now(),date:'2026-09-30',changes:2,actor:'stale'}]});await pending;assert.equal(el('snapshotHistoryBody').children.length,0);
  const switched=c.openSnapshotHistory();c.authState.loginId='b';resolve({items:[{actor:'other account'}]});await switched;assert.equal(el('snapshotHistoryBody').children.length,0);
  c.closeSnapshotHistory();c.snapshotRequest=async()=>({items:[{savedAt:Date.now(),capturedAt:Date.now(),date:'2026-09-30',changes:0,actor:'<img onerror=attack>'}]});await c.openSnapshotHistory();const row=el('snapshotHistoryBody').children[0];assert.equal(row.children[3].textContent,'<img onerror=attack>');assert.equal(row.children[2].textContent,'변경 없음');
  c.snapshotRequest=async()=>{throw Error('FORBIDDEN');};await c.openSnapshotHistory();assert.equal(el('snapshotHistoryBody').children.length,0);assert(el('snapshotHistoryStatus').textContent.includes('관리자 로그인'));
  console.log('PASS signed manual capture selection, backup/expiry exclusion, no invalid-receipt fallback, history close/account races, safe text rendering, denied-history clearing');
})().catch(e=>{console.error(e);process.exitCode=1;});
