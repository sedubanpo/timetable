const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const secret='test-only-'.repeat(5),now=Date.parse('2026-09-28T13:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const c={Date:Clock,console,PropertiesService:{getScriptProperties:()=>({getProperty:()=>secret})},Utilities:{
  base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),computeHmacSha256Signature:(s,k)=>crypto.createHmac('sha256',k).update(s).digest(),
  formatDate:(date,tz,format)=>{const d=new Date(+date+9*3600000);return format==='yyyy'?String(d.getUTCFullYear()):format==='M/d'?`${d.getUTCMonth()+1}/${d.getUTCDate()}`:d.toISOString().slice(0,10);}
}};
vm.createContext(c);vm.runInContext(fs.readFileSync('Code.gs','utf8'),c);
c.jsonOutput_=v=>v;c.getSheetNames=()=>['9/28(월)','9/29(화)'];
let reads=0;c.getFixedGridData=(sheet,force)=>{assert.equal(force,true);reads++;return {headers:['1강의실'],version:'valid',grid:{13:[['개별 수학 가상T','개인학생 비밀고3','비고 상담내용']]}};};
const body=JSON.stringify({action:'snapshot_export',issuedAt:now,sheet:'',nonce:'test'});
const request=(text,signature)=>({postData:{contents:JSON.stringify({body:text,signature:signature||crypto.createHmac('sha256',secret).update(text).digest('base64url')})}});
const result=c.doPost(request(body));assert.equal(result.ok,true);assert.equal(result.snapshots.length,2);assert.equal(reads,2);
const core=require('../snapshot-functions/core');for(const item of result.snapshots)core.validate(item,now);
assert(!JSON.stringify(result.snapshots[0].rooms).includes('비밀'));assert(!JSON.stringify(result.snapshots[0].rooms).includes('개인학생'));
assert.equal(c.doPost(request(body,'bad')).ok,false);assert.equal(reads,2);
assert.equal(c.doPost(request(JSON.stringify({action:'snapshot_export',issuedAt:now-120001}))).ok,false);
const token=c.issueSnapshotLookupToken_();assert.equal(core.verifyLookup(token,secret,now).role,'LOOKUP');
c.getFixedGridData=()=>({error:'unavailable'});assert.equal(c.doPost(request(body)).ok,false);
console.log('PASS signed POST export, forced origin reads, today/tomorrow, expiry, failed export, anonymized rooms and cross-runtime lookup signature');
