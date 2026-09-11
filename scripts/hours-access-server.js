const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let role = 'INSTRUCTOR', status = 'ACTIVE', rosterCode = 200;
const roster = [
  ['재직강사', 'INSTRUCTOR', 'ACTIVE'], ['퇴사강사', 'INSTRUCTOR', 'STOPPED'],
  ['중지강사', 'INSTRUCTOR', 'PAUSED'], ['비활성', 'INSTRUCTOR', 'DISABLED'],
  ['관리자', 'ADMIN', 'ACTIVE'], ['직원', 'STAFF', 'ACTIVE'], ['재직강사', 'INSTRUCTOR', 'ACTIVE']
].map(([name, role, status]) => ({document: {fields: Object.fromEntries(Object.entries({name, role, status}).map(([k,v]) => [k,{stringValue:v}]))}}));
const scope = {Utilities:{getUuid:()=> 'test-request'},console:{log(){}},UrlFetchApp:{fetch(url) {
  return {getResponseCode:()=>url.includes('runQuery') ? rosterCode : 200,
    getContentText:()=>JSON.stringify(url.includes('runQuery') ? roster : {users:[{localId:'fixture',email:'fixture@sedu-auth.local'}]})};
}}};
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../Code.gs'),'utf8'),scope);
scope.fetchFirebaseDocument_ = (_, collection) => collection === 'users'
  ? {role,status,name:'검증강사',loginId:'01042327428'}
  : collection === 'userAppAccess' ? {permissions:{canManageSchedules:true,canManageAccounts:true},apps:{liveTimetable:true}} : {};
scope.fetchFirebaseIdentityDocuments_ = token => ['users','userProfiles','userAppAccess'].map(collection => scope.fetchFirebaseDocument_(token,collection));
let checks = 0;
function check(fn) {fn(); checks++;}
check(()=>assert.equal(scope.authenticateFirebaseTeacher_('fixture').isMaster,false,'generic flags and legacy master id cannot elevate instructor'));
role='TEACHER'; check(()=>assert.equal(scope.authenticateFirebaseTeacher_('fixture').isMaster,false));
role='ADMIN'; check(()=>assert.equal(scope.authenticateFirebaseTeacher_('fixture').isMaster,true));
check(()=>assert.deepEqual(Array.from(scope.authenticateFirebaseTeacher_('fixture').teacherNames),['관리자','재직강사']));
role='STAFF'; check(()=>assert.equal(scope.authenticateFirebaseTeacher_('fixture').isMaster,true));
role='INSTRUCTOR';
for (const inactive of ['PAUSED','STOPPED','PENDING','DISABLED']) {
  status=inactive; check(()=>assert.throws(()=>scope.authenticateFirebaseTeacher_('fixture'),/FIREBASE_BLOCKED/));
}
status='ACTIVE'; role='STUDENT'; check(()=>assert.throws(()=>scope.authenticateFirebaseTeacher_('fixture'),/FIREBASE_BLOCKED/));
role='ADMIN'; rosterCode=403;
check(()=>{const result=scope.authenticateFirebaseTeacher_('fixture');assert.equal(result.teacherRosterUnavailable,true);assert.equal(result.teacherNames.length,0);});
rosterCode=200; role='INSTRUCTOR';
scope.getTeacherGridData=(sheet,teacher)=>({sheet,teacher});
scope.getFixedGridData=()=>({full:true});
scope.getTeacherSheetNames=teacher=>[teacher];
check(()=>assert.equal(scope.getAuthenticatedSchedule('9/8(화)','다른강사',false,'fixture').teacher,'검증강사'));
check(()=>assert.equal(scope.getAuthenticatedSchedule('9/8(화)','',false,'fixture').teacher,'검증강사'));
check(()=>assert.equal(scope.getAuthenticatedTeacherSheets('다른강사',false,'fixture')[0],'검증강사'));
role='ADMIN';
check(()=>assert.equal(scope.getAuthenticatedSchedule('9/8(화)','',false,'fixture').full,true));
check(()=>assert.equal(scope.getAuthenticatedSchedule('9/8(화)','재직강사',false,'fixture').teacher,'재직강사'));
scope.jsonOutput_ = value => value;
scope.isApiAuthorized_ = () => true;
scope.resolveTeacherViewAuditName_ = () => '';
role='INSTRUCTOR';
check(()=>assert.equal(scope.handleApiRequest_({action:'grid',sheet:'9/8(화)',teacher:'다른강사',idToken:'fixture',lite:'0'}).data.teacher,'검증강사'));
check(()=>assert.equal(scope.handleApiRequest_({action:'teacher_sheets',teacher:'다른강사',idToken:'fixture'}).sheets[0],'검증강사'));
status='DISABLED';
check(()=>assert.equal(scope.handleApiRequest_({action:'grid',sheet:'9/8(화)',idToken:'fixture',lite:'0'}).ok,false));
console.log(`PASS ${checks} authorization/roster checks; no production account data modified.`);
