'use strict';
// Existing GAS read contract only. No snapshot sync, DB save, fetch default or credentials.
const crypto=require('node:crypto'),core=require('./core'),{validDate}=require('./alimtalk-contract');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createSourceReader({request,sourceUrl,secret,now=Date.now,deadline=8000}){
  if(typeof request!=='function'||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(sourceUrl||'')||typeof secret!=='string'||secret.length<32)fail('SOURCE_NOT_CONFIGURED');
  if(!Number.isFinite(deadline)||deadline<1||deadline>8000)fail('INVALID_DEADLINE');
  return async function read({sheet,date,signal}){
    if(!validDate(date)||core.dateForSheet(sheet,now())!==date)fail('INVALID_SOURCE_DATE');
    if(signal?.aborted)fail('ABORTED');
    const controller=new AbortController();let timer,rejectAbort;
    const aborted=new Promise((_,reject)=>{rejectAbort=()=>{controller.abort();reject(Object.assign(Error('ABORTED'),{code:'ABORTED'}));};});
    signal?.addEventListener('abort',rejectAbort,{once:true});
    const started=now(),body=JSON.stringify({action:'snapshot_export',sheet,issuedAt:started,nonce:crypto.randomUUID()});
    const signature=crypto.createHmac('sha256',secret).update(body).digest('base64url');
    try{
      const payload=await Promise.race([
        Promise.resolve().then(()=>{if(controller.signal.aborted)fail('ABORTED');return request(sourceUrl,{body:JSON.stringify({body,signature}),signal:controller.signal});}),
        aborted,
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('SOURCE_TIMEOUT'),{code:'SOURCE_TIMEOUT'}));},deadline);})
      ]);
      if(signal?.aborted)fail('ABORTED');
      if(!payload?.ok||!Array.isArray(payload.snapshots)||payload.snapshots.length!==1)fail('SOURCE_INCOMPLETE');
      const snapshot=payload.snapshots[0];core.validate(snapshot,now());
      if(snapshot.date!==date||snapshot.sheet!==sheet||snapshot.capturedAt<started||snapshot.capturedAt>now())fail('SOURCE_NOT_FRESH');
      return snapshot;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',rejectAbort);}
  };
}
module.exports={createSourceReader};
