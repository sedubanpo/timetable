'use strict';
// HTTP adapter for the existing Functions codebase. Deployment export is intentionally separate.
function createHandler({review,delivery,allowedOrigins,allowSend=false,deadline=8000}){
 if(!Array.isArray(allowedOrigins)||!allowedOrigins.length)throw Error('ORIGIN_CONFIG_REQUIRED');
 return async(req,res)=>{
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
  if(!Object.hasOwn(routes,action)||!input||typeof input!=='object'||Array.isArray(input))return res.status(400).json({code:'INVALID_REQUEST'});
  if(action==='send'&&!allowSend)return res.status(409).json({code:'SENDING_DISABLED'});
  // HTTP timeout cannot cancel an already issued transaction/provider request.
  // Mutation timeout is explicitly uncertain; clients must reconcile, never auto-replay.
  // Deployment remains gated on durable recovery UI and hosting deadline validation.
  let timer;
  try{const result=await Promise.race([routes[action](session,input),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('TIMEOUT'),{code:'TIMEOUT'})),deadline);})]);return res.json(action==='preview'?{...result,sendEnabled:allowSend}:result);}
  catch(e){const mutation=['saveMapping','saveClearance','send'].includes(action);if(e.code==='TIMEOUT'&&mutation)return res.status(504).json({code:'RESULT_UNCERTAIN',retry:false});const code=typeof e.code==='string'&&/^[A-Z_]{1,60}$/.test(e.code)?e.code:'REQUEST_FAILED';return res.status(code==='FORBIDDEN'?403:code==='TIMEOUT'?504:409).json({code});}
  finally{clearTimeout(timer);}
 };
}
module.exports={createHandler};
