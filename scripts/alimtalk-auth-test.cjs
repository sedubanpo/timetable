'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
global.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};
const {createAuthorizer}=require('../snapshot-functions/alimtalk-auth');
function setup(){const data={user:{status:'ACTIVE',role:'ADMIN'},scope:{enabled:true,campusId:'banpo'},access:{apps:{deskPortal:true,liveTimetable:true}}};const calls=[];const auth=createAuthorizer({verifyIdToken:async(t,revoke)=>{calls.push(revoke);return {uid:'mock'};},readAccount:async()=>data});return {data,calls,auth};}
const session={authorization:'Bearer synthetic-token'};
test('strict administrator and campus independent of Origin; revocation checked each call',async()=>{const f=setup();await f.auth({...session,origin:'https://any.invalid'});await f.auth(session);assert.deepEqual(f.calls,[true,true]);f.data.scope.enabled=false;await assert.rejects(f.auth(session),{code:'FORBIDDEN'});});
test('delegated account manager, inactive, disabled, leave, missing scope and app denied',async()=>{for(const mutate of [d=>{d.user.role='STAFF';d.access.permissions={canManageAccounts:true};},d=>d.user.active=false,d=>d.user.isActive=false,d=>d.user.disabled=true,d=>d.user.status='DISABLED',d=>d.user.employmentStatus='휴직',d=>d.scope.campusId='other',d=>d.access.apps.deskPortal=false,d=>d.access.apps.liveTimetable=false]){const f=setup();mutate(f.data);await assert.rejects(f.auth(session),{code:'FORBIDDEN'});}});
test('invalid token and missing authorization fail without data fallback',async()=>{const f=setup();await assert.rejects(f.auth({}),{code:'FORBIDDEN'});const auth=createAuthorizer({verifyIdToken:async()=>{throw Error('expired');},readAccount:async()=>{throw Error('SHOULD_NOT_READ');}});await assert.rejects(auth(session),{code:'FORBIDDEN'});});
