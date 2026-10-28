'use strict';
// Local emulator only; no credentials and no production fallback.
const assert=require('node:assert/strict');
const base='http://127.0.0.1:18829/v1/projects/demo-timetable-alimtalk/databases/(default)/documents';
const cols=['timetableStudentMappings','timetableStudentMappingDays','timetableAlimtalkClearances','timetableAlimtalkReviewHistory','timetableAlimtalkDeliveries','timetableAlimtalkPreviews','timetableAlimtalkLimits'];
const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=role=>enc({alg:'none',typ:'JWT'})+'.'+enc({sub:'synthetic-'+role,user_id:'synthetic-'+role,role,aud:'demo-timetable-alimtalk',iss:'https://securetoken.google.com/demo-timetable-alimtalk',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'custom'}})+'.';
(async()=>{let passed=0;
// Positive control: valid emulator JWT reaches an explicitly allowed own-scope read.
for(const role of ['ADMIN','INSTRUCTOR','STAFF']){
 const r=await fetch(base+'/intranetStaffScopes/synthetic-'+role,{headers:{Authorization:'Bearer '+token(role)},signal:AbortSignal.timeout(5000)});
 assert.equal(r.status,404,'valid authenticated own-scope read must reach missing document');
}

for(const role of [null,'ADMIN','INSTRUCTOR','STAFF'])for(const col of cols){
 const headers={'Content-Type':'application/json',...(role?{Authorization:'Bearer '+token(role)}:{})};
 for(const [method,suffix,body] of [['GET','/'+col+'/synthetic',null],['GET','/'+col,null],['PATCH','/'+col+'/synthetic',{fields:{synthetic:{booleanValue:true}}}],['DELETE','/'+col+'/synthetic',null]]){
 const r=await fetch(base+suffix,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});assert.equal(r.status,403,`${role||'anonymous'} ${col} ${method}: ${r.status}`);passed++;
 }
}
console.log(`PASS ${passed} local emulator access-denial cases; 7 collections x 4 identities x get/list/write/delete. Production requests: 0.`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
