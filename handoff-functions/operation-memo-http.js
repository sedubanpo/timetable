'use strict';
const {identity}=require('./core');
const memo=require('./operation-memos');
const STATUS={UNAUTHORIZED:401,FORBIDDEN:403,INVALID_DATA:400,INVALID_ACTION:400,NOT_FOUND:404,CONFLICT:409,SERVER_NOT_CONFIGURED:503,UNAVAILABLE:503};
// Dependencies are injected for offline tests; no credentials or real DB calls in tests.
function createHandler({verifyToken,loadAccount,serverKey,fetchImpl}) {
  return async(req,res)=>{
    res.set('Cache-Control','no-store');
    if (req.method!=='POST') return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
    try {
      const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];
      let user; try { if (!token) throw Error(); user=await verifyToken(token,true); if (!user?.uid) throw Error(); } catch { throw Object.assign(new Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'}); }
      const [account,profile,access]=await loadAccount(user.uid);
      const who=identity(account,profile,access,user.uid);
      if (!who.admin) throw Object.assign(new Error('FORBIDDEN'),{code:'FORBIDDEN'});
      if (!req.body || Buffer.byteLength(JSON.stringify(req.body))>20000) throw Object.assign(new Error('INVALID_DATA'),{code:'INVALID_DATA'});
      const store=memo.createStore({key:serverKey(),fetchImpl});
      return res.json({ok:true,...await memo.handle(store,who,req.body)});
    } catch(error) {
      const code=Object.hasOwn(STATUS,error.code)?error.code:'UNAVAILABLE';
      return res.status(STATUS[code]).json({ok:false,error:code});
    }
  };
}
module.exports={createHandler};
