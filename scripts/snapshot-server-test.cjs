const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const secret='test-only-'.repeat(5),now=Date.parse('2026-09-28T13:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const c={Date:Clock,console,PropertiesService:{getScriptProperties:()=>({getProperty:()=>secret})},Utilities:{
  Charset:{UTF_8:'UTF_8'},
  base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),computeHmacSha256Signature:(s,k,charset)=>{if(s!=='snapshot-protocol:9/30(수):한글:😀')assert.equal(charset,'UTF_8','all operational HMAC must explicitly use UTF-8');return crypto.createHmac('sha256',k).update(s).digest();},
  formatDate:(date,tz,format)=>{const d=new Date(+date+9*3600000);return format==='yyyy'?String(d.getUTCFullYear()):format==='M/d'?`${d.getUTCMonth()+1}/${d.getUTCDate()}`:d.toISOString().slice(0,10);}
}};
vm.createContext(c);vm.runInContext(fs.readFileSync('Code.gs','utf8'),c);
c.jsonOutput_=v=>v;c.getSheetNames=()=>['9/28(월)','9/29(화)'];
let reads=0;c.getFixedGridData=(sheet,force)=>{assert.equal(force,true);reads++;return {headers:['1강의실'],version:'valid',capturedAt:now,grid:{13:[['개별 수학 가상T','개인학생 비밀고3','비고 상담내용']]}};};
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
const base={headers:['1강의실'],version:'live',capturedAt:now-30000,grid:{13:[['개별 수학 가상T','합성 학생']]}};
const signed=c.attachSnapshotReceipt_(base,'9/28(월)');assert(signed.snapshotReceipt);assert(!base.snapshotReceipt,'receipt must not mutate shared cache');
const verified=core.verifyReceipt(signed.snapshotReceipt,secret,'9/28(월)',now);assert.equal(verified.data.version,'live');assert.equal(verified.capturedAt,now-30000,'receipt preserves read time instead of signing time');assert(!JSON.stringify(verified.rooms).includes('합성 학생'));
let authenticatedReads=0;
c.authenticateFirebaseTeacher_=()=>({isMaster:true});c.getFixedGridData=()=>{authenticatedReads++;return base;};
assert(c.getAuthenticatedSchedule('9/28(월)','',false,'token').snapshotReceipt);assert.equal(authenticatedReads,1);
c.authenticateFirebaseTeacher_=()=>({isMaster:false,teacherName:'가상'});c.getTeacherGridData=()=>({headers:base.headers,grid:{},version:'filtered'});
assert(!c.getAuthenticatedSchedule('9/28(월)','',false,'token').snapshotReceipt);
c.isApiAuthorized_=()=>true;c.jsonOutput_=v=>v;c.resolveTeacherViewAuditName_=()=>'';
c.authenticateFirebaseTeacher_=()=>({isMaster:true});
assert(c.dispatchApiRequest_({action:'grid',sheet:'9/28(월)',idToken:'token',lite:'0'}).data.snapshotReceipt);
assert(!c.dispatchApiRequest_({action:'grid',sheet:'9/28(월)',idToken:'token',lite:'0',teacher:'가상'}).data.snapshotReceipt);
assert(!c.dispatchApiRequest_({action:'grid',sheet:'9/28(월)',lite:'0'}).data.snapshotReceipt);
console.log('PASS signed live capture, no extra origin reads, cached payload immutability, native/JSONP admin-only receipt and teacher/anonymous exclusion');

const manualBody=JSON.stringify({action:'snapshot_export',issuedAt:now,sheet:'9/28(월)',nonce:'unicode'});
c.exportScheduleSnapshots_=sheet=>{assert.equal(sheet,'9/28(월)');return [verified];};
assert.equal(c.doPost(request(manualBody)).ok,true);
assert.equal(c.snapshotEncodingDiagnostics_().explicitMatchesUtf8,true);
console.log('PASS explicit UTF-8 on all production HMAC paths, Korean manual request and fixed non-secret runtime probe');
