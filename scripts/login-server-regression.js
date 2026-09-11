const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let role = 'ADMIN', status = 'ACTIVE', allow = true, missingUser = false, profileCode = 200;
let lookups = 0, batches = 0, rosters = 0, sheetReads = 0;
const logs = [];
const value = x => typeof x === 'boolean' ? {booleanValue:x} : typeof x === 'object'
  ? {mapValue:{fields:Object.fromEntries(Object.entries(x).map(([k,v])=>[k,value(v)]))}} : {stringValue:x};
const response = (code, body) => ({getResponseCode:()=>code,getContentText:()=>JSON.stringify(body)});
const scope = {
  console:{log:x=>logs.push(x)}, Utilities:{getUuid:()=> 'generated-request-id'},
  Session:{getScriptTimeZone:()=> 'Asia/Seoul'},
  ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'}, createTextOutput:body=>({body,setMimeType(){return this;}})},
  SpreadsheetApp:{openById(){sheetReads++;throw Error('unexpected sheet read');}},
  UrlFetchApp:{
    fetch(url){
      if(url.includes('accounts:lookup')) {lookups++;return response(200,{users:[{localId:'fixture',email:'fixture@sedu-auth.local'}]});}
      if(url.includes('runQuery')) {rosters++;return response(200,[]);}
      throw Error('unexpected sequential fetch');
    },
    fetchAll(requests){
      batches++;assert.equal(requests.length,3);
      assert.ok(requests.every(r=>r.headers.Authorization==='Bearer fixture-token'));
      const docs = [{role,status,name:'fixture teacher'},{},{apps:{liveTimetable:allow},permissions:{canManageSchedules:true}}];
      return requests.map((r,i)=>response(i===0&&missingUser?404:i===1?profileCode:200,
        {fields:Object.fromEntries(Object.entries(docs[i]).map(([k,v])=>[k,value(v)]))}));
    }
  }
};
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../Code.gs'),'utf8'),scope);
scope.attachDashboardAdminSession_=x=>x;
scope.isApiAuthorized_=()=>true;
let checks=0;
function check(fn){fn();checks++;}
check(()=>{const r=scope.authenticateFirebaseTeacher_('fixture-token',true);assert.equal(r.isMaster,true);assert.equal(r.teacherRosterDeferred,true);assert.equal(rosters,0);assert.equal(batches,1);assert.equal(lookups,1);});
check(()=>{scope.authenticateFirebaseTeacher_('fixture-token');assert.equal(rosters,1);});
check(()=>{scope.authenticateTeacher('','','fixture-token',true);assert.equal(rosters,1);});
check(()=>{assert.equal(scope.getAuthenticatedTeacherRoster('fixture-token').ok,true);assert.equal(rosters,2);});
role='INSTRUCTOR';
check(()=>assert.throws(()=>scope.getAuthenticatedTeacherRoster('fixture-token'),/ADMIN_REQUIRED/));
check(()=>assert.equal(scope.authenticateFirebaseTeacher_('fixture-token',true).isMaster,false));
check(()=>assert.throws(()=>scope.getAuthenticatedTeacherRoster(''),/AUTH_REQUIRED/));
status='DISABLED';check(()=>assert.throws(()=>scope.getAuthenticatedTeacherRoster('fixture-token'),/FIREBASE_BLOCKED/));
status='ACTIVE';allow=false;check(()=>assert.throws(()=>scope.authenticateFirebaseTeacher_('fixture-token',true),/FIREBASE_BLOCKED/));
allow=true;missingUser=true;check(()=>assert.throws(()=>scope.authenticateFirebaseTeacher_('fixture-token',true),/FIREBASE_BLOCKED/));
missingUser=false;profileCode=403;check(()=>assert.throws(()=>scope.authenticateFirebaseTeacher_('fixture-token',true),/FIREBASE_PROFILE_FETCH_FAILED/));
profileCode=404;check(()=>assert.equal(scope.authenticateFirebaseTeacher_('fixture-token',true).ok,true));
profileCode=200;
check(()=>{assert.equal(scope.authenticateTeacher('2371','2371').isLookup,true);assert.equal(sheetReads,0);});
check(()=>{const r=JSON.parse(scope.handleApiRequest_({action:'auth',idToken:'fixture-token',deferRoster:'1',requestId:'safe-request_1'}).body);assert.equal(r.requestId,'safe-request_1');assert.equal(typeof r.serverMs,'number');});
check(()=>{scope.handleApiRequest_({action:'secret-action',requestId:'invalid! token',pw:'secret-password',idToken:'secret-token'});const log=JSON.parse(logs.at(-1));assert.equal(log.action,'unknown');assert.equal(log.requestId,'generated-request-id');assert.ok(!logs.join('').includes('secret'));});
role='ADMIN';check(()=>{const before=rosters;const r=JSON.parse(scope.handleApiRequest_({action:'auth',idToken:'fixture-token',deferRoster:'1'}).body);assert.equal(r.teacherRosterDeferred,true);assert.equal(rosters,before);});
role='INSTRUCTOR';check(()=>assert.equal(JSON.parse(scope.handleApiRequest_({action:'teacher_roster',idToken:'fixture-token'}).body).ok,false));
check(()=>{scope.console.log=()=>{throw Error('logging unavailable');};assert.equal(JSON.parse(scope.handleApiRequest_({action:'ping'}).body).ok,true);});
console.log(`PASS ${checks} login server regression checks (synthetic only).`);
