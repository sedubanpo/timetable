import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import assert from 'node:assert/strict';
import pw from '/Users/anjongseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=path.resolve('docs'),out=path.resolve('evidence/first-lesson');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+'/')||!fs.existsSync(f)||!fs.statSync(f).isFile())return res.writeHead(404).end();res.setHeader('Content-Type',/\.m?js$/.test(f)?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await pw.chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const results=[];
try{for(const [label,width,height] of [['desktop',1440,900],['mobile',390,844],['small',320,568]]){
const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/index.html');
await p.evaluate(()=>{
 window.F={calls:[],mode:'ok',auth:0};authState={loggedIn:true,isMaster:true,isLookup:false,teacherName:'',loginId:'synthetic'};currentSheetName='10/21(수)';isLookupViewActive=()=>authState.isLookup;LIVE_FIREBASE_CONFIG.projectId='demo-first-lesson';
 authorizeReviewRead=async()=>{F.auth++};const user={uid:'synthetic',getIdToken:async()=>'synthetic'};getLiveFirebaseAuth=async()=>({currentUser:user});
 const field=v=>Array.isArray(v)?{arrayValue:{values:v.map(field)}}:{stringValue:String(v)};const doc=(id,data)=>({document:{name:'projects/demo-first-lesson/databases/(default)/documents/fixture/'+id,fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,field(v)]))}});
 window.fetch=async(url,opts)=>{if(!String(url).includes('/projects/demo-first-lesson/'))throw Error('UNMOCKED');const q=JSON.parse(opts.body).structuredQuery;F.calls.push(q);if(F.mode==='never')return new Promise(()=>{});if(F.mode==='hold')await new Promise(r=>F.resolve=r);if(F.mode==='403'||F.mode==='401')return {ok:false,status:Number(F.mode)};
 const c=q.from[0].collectionId;if(!['students','studentLogs'].includes(c)||!q.where||q.limit>101)throw Error('UNSCOPED');
 const rows=c==='students'?[doc('s1',{studentId:'s1',studentName:'합성학생',school:'합성고'})]:F.mode==='empty'?[]:[doc('l1',{studentId:'s1',tags:['첫수업 정보'],createdByName:'담당 직원',createdAt:'2026-10-21',content:'첫수업 준비 안내\n학습 진도와 교재를 확인해 주세요.\n'+('긴 기록도 팝업 안에서만 스크롤됩니다. '.repeat(90))+'<img src=x onerror=alert(1)>'}),doc('l2',{studentId:'s1',tags:['학부모상담'],content:'다른 태그는 표시 금지'})];
 if(c==='studentLogs'&&F.mode==='limit')while(rows.length<101)rows.push(rows[0]);
 if(c==='students'&&F.mode==='ambiguous')rows.push(doc('s2',{studentId:'s2',studentName:'합성학생',school:'합성고'}));return {ok:true,json:async()=>rows};};
 document.getElementById('loginGate').style.display='none';document.getElementById('mainPage').style.display='flex';
 const table=document.getElementById('scheduleTable');table.innerHTML='<tbody><tr><th>시간</th><th>1강의실</th><th>2강의실</th></tr>'+Array.from({length:8},(_,i)=>'<tr style="height:120px"><th>'+(10+i)+':00</th><td><div class="fixture-student"></div></td><td>수업 시간표</td></tr>').join('')+'</tbody>';
 table.querySelectorAll('.fixture-student').forEach(el=>renderTableItem(el,'합성학생 합성고1 신규생'));
});
await p.waitForTimeout(160);assert.equal(await p.evaluate(()=>F.calls.length),0);assert(await p.locator('#firstLessonNotice').isVisible());
await p.screenshot({path:path.join(out,label+'-notice.png')});await p.locator('#firstLessonNotice .first-lesson-notice-list button').first().click();await p.waitForFunction(()=>!document.getElementById('firstLessonRetry').disabled);
assert((await p.locator('#firstLessonBody').textContent()).includes('학습 진도'));assert(!(await p.locator('#firstLessonBody').textContent()).includes('다른 태그'));assert.equal(await p.locator('#firstLessonBody img').count(),0);
const bounds=await p.locator('#firstLessonDialog').boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1);
assert(await p.locator('#firstLessonBody').evaluate(e=>e.scrollHeight>e.clientHeight&&e.scrollWidth<=e.clientWidth+1));await p.screenshot({path:path.join(out,label+'-detail.png')});
// A resize/table redraw can replace both the source trigger and notice opener.
await p.evaluate(()=>{document.querySelectorAll('#scheduleTable [data-first-lesson-name]').forEach(b=>b.replaceWith(b.cloneNode(true)));updateFirstLessonNotice();});
await p.locator('#firstLessonRetry').click();await p.waitForFunction(()=>!document.getElementById('firstLessonRetry').disabled);
assert((await p.locator('#firstLessonBody').textContent()).includes('학습 진도'));
await p.keyboard.press('Escape');assert(!(await p.locator('#firstLessonDialog').isVisible()));assert(await p.locator('#firstLessonNotice .first-lesson-notice-list button').first().evaluate(e=>document.activeElement===e));
for(const [mode,text] of [['empty','등록된 첫수업 정보가 없습니다'],['401','로그인이 만료'],['403','권한이 없습니다'],['ambiguous','동명이인'],['limit','일부만 표시하지']]){await p.evaluate(m=>F.mode=m,mode);await p.locator('[data-first-lesson-name]').first().click();await p.waitForFunction(()=>!document.getElementById('firstLessonRetry').disabled);assert((await p.locator('#firstLessonBody').textContent()).includes(text));await p.keyboard.press('Escape');}
await p.evaluate(()=>{F.mode='hold';openFirstLesson(document.querySelector('[data-first-lesson-name]'));});await p.waitForFunction(()=>F.resolve);await p.evaluate(()=>{invalidateFirstLesson();F.resolve();});assert(!(await p.locator('#firstLessonDialog').isVisible()));
await p.clock.install();await p.evaluate(()=>{F.mode='never';openFirstLesson(document.querySelector('[data-first-lesson-name]'));});await p.clock.runFor(8600);assert((await p.locator('#firstLessonBody').textContent()).includes('응답이 지연'));assert(!(await p.locator('#firstLessonRetry').isDisabled()));await p.keyboard.press('Escape');
await p.evaluate(()=>{document.querySelectorAll('[data-first-lesson-name]').forEach(b=>b.remove());updateFirstLessonNotice();});assert(!(await p.locator('#firstLessonNotice').isVisible()));
await p.evaluate(()=>{authState.isMaster=false;authState.teacherName='합성강사';});assert(await p.evaluate(()=>firstLessonButton('합성학생','합성고1','첫수업').includes('data-first-lesson-name')));
await p.evaluate(()=>{authState.isLookup=true;});assert.equal(await p.evaluate(()=>firstLessonButton('합성학생','합성고1','신규생')),'');assert.equal(await p.evaluate(()=>firstLessonButton('합성학생','합성고1','정규')),'');
assert.deepEqual(errors,[]);results.push({viewport:label,passed:true,bounds,checks:['auto notice without reads','scoped reads','long text','XSS text','empty','403','ambiguous','late response','teacher/admin/lookup','Escape','no overflow']});await ctx.close();
}fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS desktop/mobile/small; automatic notice, scoped data and state regression');}finally{await browser.close();server.close();}
