'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {handle,empty}=require('./core'),{database}=require('./test.cjs');
const who={uid:'admin',name:'관리자',admin:true};
function seed(db,day,uid,number=1){
 const path=`liveTimetableHandoffDays/${day}/teachers/${uid}`,id='operation-'+uid.padEnd(16,'x');
 db.data.set(path,{teacher:uid,latest:{number,operationId:id},draft:{secret:'UNSENT_PRIVATE_DRAFT'}});
 db.data.set(path+'/versions/'+id,{...empty(),rows:[{id:1,name:'합성 학생',start:840,end:900,type:'개별',note:''}],subjects:{14:'영어'},date:day,teacher:uid,uid,number,operationId:id,time:1,state:'미확인',fingerprint:'PRIVATE_FINGERPRINT'});
 return path;
}
test('준비 기간의 최신 전송본만 읽고 작성 중 초안·fingerprint 제외',async()=>{
 const db=database();seed(db,'2026-10-02','a',2);seed(db,'2026-10-04','a');seed(db,'2026-10-05','b');
 db.data.set('liveTimetableHandoffDays/2026-10-03/teachers/draft-only',{draft:{secret:'UNSENT_PRIVATE_DRAFT'}});
 const before=JSON.stringify([...db.data]);
 const out=await handle(db,who,{action:'review',date:'2026-10-02',endDate:'2026-10-05'});
 assert.equal(out.complete,true);assert.equal(out.items.length,3);assert.equal(out.items[0].number,2);
 assert(!JSON.stringify(out).includes('PRIVATE'));assert.equal(JSON.stringify([...db.data]),before,'read-only');
});
test('50명 다음 페이지의 전송본도 포함',async()=>{
 const db=database();for(let i=0;i<56;i++)seed(db,'2026-10-04','t'+String(i).padStart(3,'0'));
 const out=await handle(db,who,{action:'review',date:'2026-10-04'});assert.equal(out.items.length,56);
});
test('강사 권한·조회 기간·유실된 최신 버전은 실패로 반환',async()=>{
 const db=database();const path=seed(db,'2026-10-04','a');
 await assert.rejects(handle(db,{...who,admin:false},{action:'review',date:'2026-10-04'}),/FORBIDDEN/);
 await assert.rejects(handle(db,who,{action:'review',date:'2026-10-02',endDate:'2026-10-17'}),/INVALID_DATE/);
 db.data.delete(path+'/versions/operation-'+ 'a'.padEnd(16,'x'));
 await assert.rejects(handle(db,who,{action:'review',date:'2026-10-04'}),/SOURCE_INCOMPLETE/);
});
