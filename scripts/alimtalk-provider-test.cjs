'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createProvider}=require('../snapshot-functions/alimtalk-provider'),{createAdminTest}=require('../snapshot-functions/alimtalk-admin-test'),{fixture}=require('./alimtalk-fixture.cjs'),R=require('../snapshot-functions/alimtalk-contract');
global.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};
const key='a'.repeat(64),phone='01000000001';
const message={to:phone,type:'ATA',kakaoOptions:{pfId:R.pfId,templateId:R.templateId,variables:{},disableSms:true},customFields:{timetableKey:key}};
function setup(data){const calls=[];const provider=createProvider({apiKey:'mock',apiSecret:'mock',testPhone:phone,enableTestSend:true,request:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>data};}});return {provider,calls};}
test('single-message group, exact test destination, SMS off, no extra payload fields',async()=>{const x=setup({groupInfo:{groupId:'g1'},messageList:[{messageId:'m1',statusCode:'2000',customFields:{timetableKey:key}}],failedMessageList:[]});const r=await x.provider.sendOne({...message,replacements:[{to:'01000000002'}]});assert.equal(r.statusCode,'2000');const body=JSON.parse(x.calls[0].options.body);assert.equal(body.messages.length,1);assert.equal(body.messages[0].kakaoOptions.disableSms,true);assert(!body.messages[0].replacements);assert.equal(x.calls[0].options.redirect,'error');await assert.rejects(x.provider.sendOne({...message,to:'01000000002'}),{code:'TEST_RECIPIENT_REQUIRED'});assert.equal(x.calls.length,1);});
test('explicit registration failure retains provider code instead of acceptance',async()=>{const x=setup({groupInfo:{groupId:'g1'},failedMessageList:[{messageId:'m1',statusCode:'3040',customFields:{timetableKey:key}}]});assert.equal((await x.provider.sendOne(message)).registrationFailed,true);});
test('unknown transport response is never retried',async()=>{const x=setup({});await assert.rejects(x.provider.sendOne(message),{code:'UNKNOWN_RESULT'});assert.equal(x.calls.length,1);});
test('lookup scoped to exact message ID; missing IDs do not cause account-wide scan',async()=>{const x=setup({messageList:{m1:{messageId:'m1',groupId:'g1',type:'ATA',statusCode:'4000',customFields:{timetableKey:key}}}});assert.equal(await x.provider.lookup({key}),null);assert.equal(x.calls.length,0);assert.equal((await x.provider.lookup({key,messageId:'m1',groupId:'g1'})).statusCode,'4000');const u=new URL(x.calls[0].url);assert.equal(u.searchParams.get('criteria'),'messageId');assert.equal(u.searchParams.get('value'),'m1');assert.equal(u.searchParams.get('limit'),'2');await assert.rejects(x.provider.lookup({key:'b'.repeat(64),messageId:'m1',groupId:'g1'}),{code:'RESULT_MISMATCH'});});
test('test scope uses synthetic data and admin secret only; no real student redirect',async()=>{const f=fixture();const s=createAdminTest({...f.deps,testPhone:phone,now:()=>Date.parse('2026-10-28T03:00:00Z')});await assert.rejects(s.preview('',f.input),{code:'TEST_SCOPE_REQUIRED'});const input={date:'2026-10-28',targets:[{studentId:'__alimtalk_admin_test__',recipientIds:['admin-test']}]};const p=await s.preview('',input);assert.equal(p.testMode,true);assert(!JSON.stringify(p).includes(phone));assert(p.rows[0].text.includes('관리자 테스트(가상)'));await s.send('',{previewId:p.previewId});assert.equal(f.sent.length,1);assert.equal(f.sent[0].to,phone);await s.send('',{previewId:p.previewId});assert.equal(f.sent.length,1);});
test('specific failure codes retained; unknown provider codes are not success',()=>{const {status}=require('../snapshot-functions/alimtalk-service');assert.equal(status('3104'),'FAILED');assert.equal(status('1030'),'FAILED');assert.equal(status('3014'),'UNKNOWN');assert.equal(status('9999'),'UNKNOWN');});

test('provider failures expose only fixed categories, never provider response secrets',async()=>{const original=console.warn,logs=[];console.warn=(...args)=>logs.push(args);try{for(const [status,errorCode,expected] of [[403,'SignatureDoesNotMatch','PROVIDER_SIGNATURE_MISMATCH'],[403,'RequestTimeTooSkewed','PROVIDER_CLOCK_SKEW'],[403,'InvalidAPIKey','PROVIDER_KEY_INVALID'],[403,'DuplicatedSignature','PROVIDER_SIGNATURE_REUSED'],[403,'unknown private value','PROVIDER_ACCESS_DENIED'],[429,null,'PROVIDER_RATE_LIMIT'],[500,null,'PROVIDER_UNAVAILABLE']]){const p=createProvider({apiKey:'synthetic',apiSecret:'synthetic',request:async()=>({ok:false,status,json:async()=>({errorCode,errorMessage:'private response'})})});await assert.rejects(p.getTemplate(R.templateId),e=>e.code===expected&&!e.message.includes('private'));}assert(!JSON.stringify(logs).includes('private'));}finally{console.warn=original;}});

test('fallback outcome belongs to the original ATA group; reconciliation only reads',async()=>{
 const calls=[];
 const original={messageId:'m1',groupId:'g1',type:'ATA',customFields:{timetableKey:key},statusCode:'3104'};
 let group={groupId:'g1',status:'SENDING'};
 const p=createProvider({apiKey:'mock',apiSecret:'mock',request:async(url,options)=>{
   calls.push(options.method);return {ok:true,json:async()=>url.includes('/list?')?{messageList:{m1:original}}:group};
 }});
 const id={messageId:'m1',groupId:'g1',key,smsFallback:true};
 assert.equal((await p.lookup(id)).fallbackResult,undefined);
 group={groupId:'g1',status:'COMPLETE',count:{sentPending:0,sentReplacement:1,sentSuccess:1,sentFailed:1}};
 assert.equal((await p.lookup(id)).fallbackResult,'DELIVERED');
 group.count.sentSuccess=0;group.count.sentFailed=2;assert.equal((await p.lookup(id)).fallbackResult,'FAILED');
 group.count.sentReplacement=0;group.count.sentFailed=1;assert.equal((await p.lookup(id)).fallbackResult,'NOT_SENT');
 group.groupId='other';await assert.rejects(p.lookup(id),{code:'RESULT_MISMATCH'});
 original.statusCode='4000';assert.equal((await p.lookup(id)).statusCode,'4000');assert(calls.every(m=>m==='GET'));
});

test('late and duplicate ATA failure reports cannot reopen a completed SMS or allow a premature retry',async()=>{
 const {createService}=require('../snapshot-functions/alimtalk-service'),f=fixture(),svc=createService(f.deps);
 const id=key;
 await f.deps.store.claim(id,{id,state:'ACCEPTED',groupId:'g1',messageId:'m1',smsFallback:true});
 const event={key:id,messageId:'m1',groupId:'g1',statusCode:'3104'};
 assert.equal((await svc.apply(id,event)).state,'PROCESSING');
 const done=await svc.apply(id,{...event,fallbackResult:'DELIVERED'});
 assert.equal(done.state,'DELIVERED');assert.equal(done.ataErrorCode,'3104');
 assert.equal((await svc.apply(id,event)).fallbackResult,'DELIVERED');
});

test('missing receipt recovery scopes recipient/time and requires immutable key, original ATA and unique complete results',async()=>{
 const createdAt=Date.parse('2026-11-11T11:08:30Z'),m={messageId:'m1',groupId:'g1',to:phone,type:'ATA',statusCode:'4000',dateCreated:new Date(createdAt).toISOString(),customFields:{timetableKey:key}};
 const x=setup({messageList:{other:{...m,messageId:'other',customFields:{timetableKey:'b'.repeat(64)}},sms:{...m,messageId:'sms',type:'LMS',replacement:true},m1:m}});
 const result=await x.provider.lookup({key,phone,createdAt});assert.equal(result.messageId,'m1');
 const q=new URL(x.calls[0].url).searchParams;assert.equal(q.get('to'),phone);assert.equal(q.get('startDate'),new Date(createdAt-60000).toISOString());assert.equal(q.get('endDate'),new Date(createdAt+600000).toISOString());assert.equal(x.calls[0].options.method,'GET');
 for(const bad of [{...m,to:'01000000002'},{...m,dateCreated:new Date(createdAt+900000).toISOString()}])await assert.rejects(setup({messageList:{bad}}).provider.lookup({key,phone,createdAt}),{code:'RESULT_MISMATCH'});
 await assert.rejects(setup({messageList:{m1:m,m2:{...m,messageId:'m2'}}}).provider.lookup({key,phone,createdAt}),{code:'RECOVERY_AMBIGUOUS'});
 await assert.rejects(setup({messageList:{m1:m},nextKey:'repeat'}).provider.lookup({key,phone,createdAt}),{code:'RECOVERY_SCAN_LIMIT'});
 assert.equal(await setup({messageList:{}}).provider.lookup({key,phone,createdAt}),null);
});
test('missing group ID recovers only the known message and cannot attach another original',async()=>{
 const createdAt=Date.now(),m={messageId:'m2',groupId:'g1',to:phone,type:'ATA',dateCreated:new Date(createdAt).toISOString(),customFields:{timetableKey:key}};
 await assert.rejects(setup({messageList:{m2:m}}).provider.lookup({key,phone,createdAt,messageId:'m1'}),{code:'RESULT_MISMATCH'});
});
test('lost send response recovers receipt once without a second send and preserves source identity',async()=>{
 const f=fixture(),{createService}=require('../snapshot-functions/alimtalk-service');let sends=0,lookups=0;
 f.deps.provider.sendOne=async()=>{sends++;throw Object.assign(Error(),{code:'TIMEOUT'});};
 f.deps.provider.lookup=async input=>{lookups++;assert.equal(input.phone,phone);assert(Number.isSafeInteger(input.createdAt));return {key:input.key,messageId:'recovered',groupId:'group',statusCode:'4000'};};
 const svc=createService(f.deps),p=await svc.preview('',f.input),r=await svc.send('',{previewId:p.previewId});
 assert.equal(sends,1);assert.equal(lookups,1);assert.equal(r.results[0].state,'DELIVERED');assert.equal(r.results[0].trackingMissing,false);assert.equal(r.results[0].requestErrorCode,'TIMEOUT');
});
test('empty recovery preserves UNKNOWN and blocks resending; later reconciliation links authoritative receipt',async()=>{
 const f=fixture(),{createService}=require('../snapshot-functions/alimtalk-service');let sends=0;
 f.deps.provider.sendOne=async()=>{sends++;throw Object.assign(Error(),{code:'TIMEOUT'});};
 const svc=createService(f.deps),p=await svc.preview('',f.input),r=await svc.send('',{previewId:p.previewId});
 assert.equal(r.results[0].state,'UNKNOWN');assert.equal(r.results[0].trackingIssue,'RECEIPT_NOT_FOUND');assert(r.results[0].lastResultCheckAt);
 await assert.rejects(svc.send('',{previewId:p.previewId}),{code:'PREVIOUS_RESULT_UNCERTAIN'});assert.equal(sends,1);
 f.deps.provider.lookup=async x=>({key:x.key,messageId:'m',groupId:'g',statusCode:'2000'});
 const fixed=await svc.reconcile('',r.results[0].id);assert.equal(fixed.state,'ACCEPTED');assert.equal(fixed.trackingMissing,false);assert.equal(fixed.trackingIssue,null);assert.equal(sends,1);
});
