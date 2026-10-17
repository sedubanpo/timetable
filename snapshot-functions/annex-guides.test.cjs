const {test}=require('node:test'),assert=require('node:assert/strict');const {handle}=require('./annex-guides');
test('per-student and building guide state persists, supports undo, protects reads and writes',async()=>{const data=new Map();const db={collection:()=>({doc:id=>({set:async v=>data.set(id,v),get:async()=>({data:()=>data.get(id)})})})};
for(const role of ['ADMIN','STAFF','DESK']){await handle(db,{role},'uid',{action:'annex_guide_mark',student:'학생A',building:2,done:true});}
let r=await handle(db,{role:'STAFF'},'uid',{action:'annex_guide_read',student:'학생A'});assert(r.guides[2].done);assert.equal(r.guides[3],null);assert.equal((await handle(db,{role:'ADMIN'},'uid',{action:'annex_guide_read',student:'학생B'})).guides[2],null);
await handle(db,{role:'ADMIN'},'uid',{action:'annex_guide_mark',student:'학생A',building:2,done:false});assert.equal((await handle(db,{role:'ADMIN'},'uid',{action:'annex_guide_read',student:'학생A'})).guides[2].done,false);
for(const role of ['LOOKUP','TEACHER'])for(const action of ['annex_guide_read','annex_guide_mark'])await assert.rejects(handle(db,{role},'uid',{action,student:'학생A',building:2,done:true}),{code:'FORBIDDEN'});
await assert.rejects(handle(db,{role:'ADMIN'},'uid',{action:'annex_guide_mark',student:'학생A',building:4,done:true}),{code:'INVALID_ACTION'});
});
