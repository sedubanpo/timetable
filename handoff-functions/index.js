'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {onRequest}=require('firebase-functions/v2/https');
const core=require('./core');
const {defineSecret}=require('firebase-functions/params');
const {createHandler}=require('./operation-memo-http');
initializeApp();
// Reference only: no secret is created or configured by this local patch.
const memoServerKey=defineSecret('TIMETABLE_SUPABASE_SERVER_KEY');
exports.timetableOperationMemoApi=onRequest({region:'asia-northeast3',timeoutSeconds:30,memory:'256MiB',maxInstances:3,cors:['https://sedubanpo.github.io','https://script.google.com',/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/],secrets:[memoServerKey]},createHandler({
 verifyToken:(token,revoked)=>getAuth().verifyIdToken(token,revoked),
 loadAccount:async uid=>Promise.all(['users','userProfiles','userAppAccess'].map(async c=>(await getFirestore().collection(c).doc(uid).get()).data()||{})),
 serverKey:()=>memoServerKey.value()
}));
exports.timetableHandoffApi=onRequest({region:'asia-northeast3',timeoutSeconds:30,memory:'256MiB',maxInstances:3,cors:true},async(req,res)=>{
 res.set('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
 try{if(!req.body||Buffer.byteLength(JSON.stringify(req.body))>180000)throw {code:'INVALID_DATA'};const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];let user;try{user=await getAuth().verifyIdToken(token||'',true);}catch{throw {code:'UNAUTHORIZED'};}const db=getFirestore();const docs=await Promise.all(['users','userProfiles','userAppAccess'].map(c=>db.collection(c).doc(user.uid).get()));const who=core.identity(...docs.map(d=>d.data()||{}),user.uid);res.json({ok:true,...await core.handle(db,who,req.body)});
 }catch(e){const codes={UNAUTHORIZED:401,FORBIDDEN:403,CONFLICT:409,NOT_FOUND:404,INVALID_DATA:400,INVALID_DATE:400,INVALID_OPERATION:400,INVALID_ACTION:400,OVERLAP:400,UNFINISHED_INPUT:400};const code=codes[e.code]?e.code:'UNAVAILABLE';console.warn('timetableHandoffApi',{code});res.status(codes[code]||503).json({ok:false,error:code});}
});
