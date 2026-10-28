'use strict';
// Server secret only. Preserve the original single-number format; fail closed
// for malformed lists instead of silently dropping an intended recipient.
function testRecipients(value){
 if(typeof value!=='string'||!value.trim())return [];
 const phones=value.split(/[\s,]+/).filter(Boolean);
 if(phones.length>5||phones.some(p=>!/^010\d{8}$/.test(p))||new Set(phones).size!==phones.length)return [];
 return phones.map((phone,index)=>({id:index===0?'admin-test':'admin-test-'+index,relation:index===0?'관리자 본인 · 테스트 전용':'추가 관리자 · 테스트 전용',phone,verified:true}));
}
module.exports={testRecipients};
