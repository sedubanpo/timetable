'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {testRecipients}=require('../snapshot-functions/alimtalk-test-recipients');
const {createProvider}=require('../snapshot-functions/alimtalk-provider');
const {createAdminTest}=require('../snapshot-functions/alimtalk-admin-test');
const {fixture}=require('./alimtalk-fixture.cjs'),R=require('../snapshot-functions/alimtalk-contract');
global.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};
const a='01000000001',b='01000000002',c='01000000003';
test('original recipient preserved; added recipients selectable; invalid lists fail closed',()=>{
 assert.deepEqual(testRecipients(a+'\n'+b).map(r=>[r.id,r.phone]),[['admin-test',a],['admin-test-1',b]]);
 for(const input of ['',null,a+','+a,a+',invalid',Array.from({length:6},(_,i)=>'0100000000'+i).join(',')])assert.deepEqual(testRecipients(input),[]);
});
test('provider uses only selected allowlisted destination and no fallback SMS',async()=>{
 const calls=[],key='a'.repeat(64);
 const p=createProvider({apiKey:'mock',apiSecret:'mock',testPhone:a+','+b,enableTestSend:true,request:async(u,o)=>{calls.push(JSON.parse(o.body));return {ok:true,json:async()=>({groupInfo:{groupId:'g'},messageList:[{messageId:'m',statusCode:'2000',customFields:{timetableKey:key}}]})};}});
 const msg={to:b,type:'ATA',kakaoOptions:{pfId:R.pfId,templateId:R.templateId,variables:{},disableSms:true},customFields:{timetableKey:key}};
 await p.sendOne(msg);assert.equal(calls[0].messages[0].to,b);assert.equal(calls[0].messages[0].kakaoOptions.disableSms,true);
 await assert.rejects(p.sendOne({...msg,to:c}),{code:'TEST_RECIPIENT_REQUIRED'});assert.equal(calls.length,1);
});
test('additional recipient is never selected automatically; selected recipient dedupes',async()=>{
 const f=fixture(),s=createAdminTest({...f.deps,testPhone:a+','+b,now:()=>Date.parse('2026-10-28T03:00:00Z')});
 const input={date:'2026-10-28',targets:[{studentId:'__alimtalk_admin_test__',recipientIds:[]}]};
 const held=await s.preview('',input);assert.equal(held.counts.messages,0);assert.equal(held.rows[0].choices.length,2);
 input.targets[0].recipientIds=['admin-test-1'];const p=await s.preview('',input);assert.equal(p.counts.messages,1);assert(!JSON.stringify(p).includes(b));
 await s.send('',{previewId:p.previewId});await s.send('',{previewId:p.previewId});assert.equal(f.sent.length,1);assert.equal(f.sent[0].to,b);
});
test('recipient removal after preview prevents stale preview sending',async()=>{
 const f=fixture(),now=()=>Date.parse('2026-10-28T03:00:00Z');
 const s=createAdminTest({...f.deps,testPhone:a+','+b,now});
 const p=await s.preview('',{date:'2026-10-28',targets:[{studentId:'__alimtalk_admin_test__',recipientIds:['admin-test']}]});
 const changed=createAdminTest({...f.deps,testPhone:b,now});
 const r=await changed.send('',{previewId:p.previewId});assert.equal(r.requiresNewPreview,true);assert.equal(f.sent.length,0);
});
