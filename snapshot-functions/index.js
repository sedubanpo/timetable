'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {onRequest}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {defineSecret}=require('firebase-functions/params');
const crypto=require('node:crypto');
const core=require('./core');
initializeApp();
const secret=defineSecret('TIMETABLE_SNAPSHOT_SECRET');
const source='https://script.google.com/macros/s/AKfycbyI3P-cTCEMrk0mqe3QTorgXQZGoaITzqs-oqCQQ3eIbsZofe8B3wj6WTruKaCfpmUIQA/exec';
async function sync(sheet) {
  const db=getFirestore(), lease=db.collection('liveTimetableSnapshotJobs').doc('writer');
  const owner=crypto.randomUUID(), now=Date.now();
  await db.runTransaction(async tx=>{
    const current=await tx.get(lease);
    if(current.exists && current.data().until>now) coreFail('SAVE_IN_PROGRESS');
    tx.set(lease,{owner,until:now+180000});
  });
  try {
    const body=JSON.stringify({action:'snapshot_export',issuedAt:Date.now(),sheet:sheet||'',nonce:owner});
    const signature=crypto.createHmac('sha256',secret.value()).update(body).digest('base64url');
    let response;
    try { response=await fetch(source,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body,signature}),signal:AbortSignal.timeout(75000)}); }
    catch(error) { console.warn('snapshotSourceTransport',{name:error.name||'Error',code:error.cause?.code||'UNKNOWN'});coreFail('SOURCE_UNAVAILABLE'); }
    if(!response.ok) coreFail('SOURCE_UNAVAILABLE');
    let payload;try{payload=await response.json();}catch{console.warn('snapshotSourceFormat',{status:response.status,contentType:response.headers?.get('content-type')||''});coreFail('SOURCE_UNAVAILABLE');}
    if(!payload.ok || !Array.isArray(payload.snapshots) || !payload.snapshots.length || payload.snapshots.length>2) coreFail('SOURCE_UNAVAILABLE');
    for(const snapshot of payload.snapshots) {
      core.validate(snapshot);
      if(sheet ? snapshot.sheet!==sheet : !core.dates().includes(snapshot.date)) coreFail('INVALID_SNAPSHOT');
    }
    const saved=[];
    for(const snapshot of payload.snapshots) { await core.save(db,snapshot); saved.push({sheet:snapshot.sheet,savedAt:snapshot.capturedAt}); }
    await core.saveCatalog(db,payload.sheets,payload.catalogCapturedAt);
    return saved;
  } finally {
    await db.runTransaction(async tx=>{const current=await tx.get(lease);if(current.data()?.owner===owner)tx.delete(lease);});
  }
}
function coreFail(code){const e=new Error(code);e.code=code;throw e;}
async function authenticate(req) {
  if(req.body?.lookupToken) return core.verifyLookup(req.body.lookupToken,secret.value());
  const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];
  if(!token)coreFail('UNAUTHORIZED');
  let user;try{user=await getAuth().verifyIdToken(token,true);}catch{coreFail('UNAUTHORIZED');}
  const db=getFirestore();
  const docs=await Promise.all(['users','userProfiles','userAppAccess'].map(c=>db.collection(c).doc(user.uid).get()));
  const account=docs[0].data()||{}, profile=docs[1].data()||{}, access=docs[2].data()||{};
  const who=core.identity(account,profile,access);
  const name=String(account.name||profile.displayName||access.instructorName||'').trim();
  let loginId=String(account.loginId||profile.instructorId||String(user.email||'').split('@')[0]||user.uid).trim();
  if (/^\d[\d -]+$/.test(loginId)) { loginId=loginId.replace(/\D/g,''); if(loginId.length===8)loginId='010'+loginId; else if(loginId.length===10 && loginId.startsWith('10'))loginId='0'+loginId; }
  who.login={ok:true,success:true,authSource:'firebase',firebaseUid:user.uid,loginId,teacherName:name,name,
    isMaster:who.full,isLookup:false,role:who.full?'ADMIN':'TEACHER',teacherNames:[],teacherRosterDeferred:who.full};
  return who;
}
exports.timetableSnapshotApi=onRequest({region:'asia-northeast3',timeoutSeconds:100,memory:'256MiB',maxInstances:3,cors:true,secrets:[secret]},async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
  try {
    const who=await authenticate(req), {action,sheet,teacher}=req.body||{};
    if(action==='bootstrap') {
      // Identity is verified before any date metadata is read; no Apps Script dependency.
      let dates;try{dates=await core.catalog(getFirestore());}catch{dates={sheets:[],savedSheets:[],catalogSavedAt:null};}
      return res.json({ok:true,identity:who.login||null,...dates});
    }
    if(!['read','rooms','save'].includes(action))coreFail('INVALID_ACTION');
    core.dateForSheet(sheet);
    if(action==='save') {
      if(who.role!=='ADMIN')coreFail('FORBIDDEN');
      return res.json({ok:true,saved:await sync(sheet)});
    }
    return res.json({ok:true,...await core.read(getFirestore(),sheet,who,teacher,action==='rooms')});
  }catch(error){
    const known=['UNAUTHORIZED','FORBIDDEN','INVALID_ACTION','INVALID_SHEET','INVALID_SNAPSHOT','SNAPSHOT_NOT_FOUND','SAVE_IN_PROGRESS','SOURCE_UNAVAILABLE','SNAPSHOT_TOO_LARGE'];
    const code=known.includes(error.code)?error.code:'UNAVAILABLE';
    console.warn('timetableSnapshotApi',{code});
    res.status(code==='UNAUTHORIZED'?401:code==='FORBIDDEN'?403:code==='SNAPSHOT_NOT_FOUND'?404:code==='SAVE_IN_PROGRESS'?409:503).json({ok:false,error:code});
  }
});
exports.timetableSnapshotEveryTwoHours=onSchedule({schedule:'0 */2 * * *',timeZone:'Asia/Seoul',region:'asia-northeast3',timeoutSeconds:120,memory:'256MiB',maxInstances:1,retryCount:0,secrets:[secret]},async()=>{
  try {await sync('');}catch(error){if(error.code==='SAVE_IN_PROGRESS')return;console.error('timetableSnapshotSync',{code:error.code||'UNAVAILABLE'});throw new Error('SNAPSHOT_SYNC_FAILED');}
});
