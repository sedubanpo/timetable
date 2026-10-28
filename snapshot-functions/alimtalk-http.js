'use strict';
// HTTP adapter for the existing Functions codebase. Deployment export is intentionally separate.
function createHandler({review,delivery,allowedOrigins,allowSend=false,testDelivery,realTestDelivery,allowTestSend=false,deadline=8000}){
 if(!Array.isArray(allowedOrigins)||!allowedOrigins.length)throw Error('ORIGIN_CONFIG_REQUIRED');
 return async(req,res)=>{
  if(req.path==='/webhook'){
   if(req.method!=='POST'||!Array.isArray(req.body)||req.body.length>100||Buffer.byteLength(JSON.stringify(req.body))>100000)return res.status(400).json({code:'INVALID_RESULT'});
   let timer;try{await Promise.race([delivery.webhook(req.headers['x-solapi-secret'],req.body),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TIMEOUT')),4000);})]);return res.status(200).json({ok:true});}
   catch{return res.status(503).json({code:'WEBHOOK_NOT_APPLIED'});}finally{clearTimeout(timer);}
  }
  const origin=req.headers.origin;
  if(origin&&!allowedOrigins.includes(origin))return res.status(403).json({code:'FORBIDDEN'});
  if(origin){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');}
  res.set('Cache-Control','no-store');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({code:'METHOD_NOT_ALLOWED'});
  if(!req.headers['content-type']?.startsWith('application/json'))return res.status(415).json({code:'JSON_REQUIRED'});
  if(!req.body||Buffer.byteLength(JSON.stringify(req.body))>100000)return res.status(413).json({code:'REQUEST_LIMIT'});
  const {action,input}=req.body,session={authorization:req.headers.authorization};
  const routes={reviewState:review.reviewState,inspect:review.inspect,candidates:review.candidates,saveMapping:review.saveMapping,contactChoices:review.contactChoices,saveClearance:review.saveClearance,preview:delivery.preview,send:delivery.send,results:delivery.results,reconcile:(s,i)=>delivery.reconcile(s,i.id)};
  if(testDelivery)Object.assign(routes,{testPreview:testDelivery.preview,testSend:testDelivery.send,testResults:testDelivery.results,testReconcile:(s,i)=>testDelivery.reconcile(s,i.id)});
  if(realTestDelivery)Object.assign(routes,{realTestPreview:realTestDelivery.preview,realTestSend:realTestDelivery.send,realTestResults:realTestDelivery.results,realTestReconcile:(s,i)=>realTestDelivery.reconcile(s,i.id)});
  if(!Object.hasOwn(routes,action)||!input||typeof input!=='object'||Array.isArray(input))return res.status(400).json({code:'INVALID_REQUEST'});
  if((action==='send'&&!allowSend)||(['testSend','realTestSend'].includes(action)&&!allowTestSend))return res.status(409).json({code:'SENDING_DISABLED'});
  // HTTP timeout cannot cancel an already issued transaction/provider request.
  // Mutation timeout is explicitly uncertain; clients must reconcile, never auto-replay.
  // Deployment remains gated on durable recovery UI and hosting deadline validation.
  let timer;
  try{const result=await Promise.race([routes[action](session,input),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('TIMEOUT'),{code:'TIMEOUT'})),deadline);})]);return res.json(['preview','testPreview','realTestPreview'].includes(action)?{...result,sendEnabled:action!=='preview'?allowTestSend:allowSend}:result);}
  catch(e){const mutation=['saveMapping','saveClearance','send','testSend','realTestSend'].includes(action);if(e.code==='TIMEOUT'&&mutation)return res.status(504).json({code:'RESULT_UNCERTAIN',retry:false});const code=typeof e.code==='string'&&/^[A-Z_]{1,60}$/.test(e.code)?e.code:'REQUEST_FAILED';return res.status(code==='FORBIDDEN'?403:code==='TIMEOUT'?504:409).json({code});}
  finally{clearTimeout(timer);}
 };
}
module.exports={createHandler};
