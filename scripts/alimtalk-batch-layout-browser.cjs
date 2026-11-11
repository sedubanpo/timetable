const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),assert=require('node:assert/strict');
// Static production layout with synthetic data only; all network requests are blocked.
const output=process.env.UX_SCREENSHOT_DIR||'/tmp/timetable-ux-review';fs.mkdirSync(output,{recursive:true});
(async()=>{
const b=await chromium.launch({channel:'chrome',headless:true});
try{
for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
const page=await b.newPage({viewport:{width,height}});await page.route('**/*',r=>r.abort());
const html=fs.readFileSync('Index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
await page.setContent(html);
await page.addScriptTag({path:'assets/alimtalk-contract.js'});await page.addScriptTag({path:'assets/alimtalk-batch-ui.js'});
await page.evaluate(async()=>{
 document.querySelectorAll('style').forEach(n=>document.head.append(n));const modal=document.getElementById('studentImageModal');document.body.replaceChildren(modal);document.body.className='';modal.style.display='flex';modal.dataset.cardMode='message';
 document.querySelectorAll('[data-card-audience]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.cardAudience==='student')));document.getElementById('batchInitial').textContent='학생 일괄 발송';
 const host=document.getElementById('cardAlimtalkPanel');host.hidden=false;host.dataset.bulk='true';
 document.querySelectorAll('[data-card-channel=image]').forEach(n=>n.hidden=true);
 document.querySelector('.student-preview-panel-title').textContent='학생 본인 · 11/12(목)';
 document.querySelector('.student-preview-panel-sub').textContent='받을 번호와 본문을 확인하세요.';
 document.querySelector('.student-list').textContent='가상 검증 명단';
 const items=Array.from({length:42},(_,i)=>({ticket:'t'+i,studentId:'s'+i,name:'검증학생 '+(i+1),masked:'010-****-0000',relation:'학생',text:'[가상 수업 안내]\n수학 17:00–19:00\n검증용 본문입니다.'}));
 window.fakeApi=async(action,input)=>{
 if(action==='batchPreview')return {items,rows:[...items,{name:'검증학생 43',issue:'본인 번호 없음 · 학부모만 안내'},{name:'검증학생 44',issue:'학생 연결 확인 필요'}],batchSize:40,previewId:'offline'};
 if(action==='batchSend'){await new Promise(r=>window.finish=r);return {results:input.tickets.map(()=>({state:'ACCEPTED'}))};}
 if(action==='batchHistory')return {results:['FAILED','DELIVERED','ACCEPTED'].map((state,i)=>({id:'r'+i,name:'검증학생 '+(i+1),relation:'학생',masked:'010-****-0000',createdAt:Date.now(),state,text:'가상 검증 본문'}))};
 throw Error('Unexpected API');};
 window.ui=TimetableBatchUI.mount({host,api:fakeApi,context:()=>({date:'2026-11-12',audience:'student'}),refresh:()=>{}});
 await ui.review('unsent');
});
await page.screenshot({path:output+'/'+label+'-prepare.png'});
await page.getByLabel(/가능한 번호 전체/).check();await page.getByLabel(/수신자와 본문을 확인/).check();await page.locator('#cardAlimtalkPanel .send-action').click();
await page.screenshot({path:output+'/'+label+'-sending.png'});
assert(await page.locator('.batch-active').isVisible());assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'0');
await page.evaluate(()=>finish());await page.waitForFunction(()=>document.querySelector('.batch-active').textContent.includes('41–42'));await page.evaluate(()=>finish());
await page.getByRole('button',{name:'전체 발송 이력 보기'}).click();
await page.getByRole('button',{name:'확인 필요 1건'}).click();
await page.screenshot({path:output+'/'+label+'-history.png'});
assert.equal(await page.locator('.history-chain:visible').count(),1);
const overflow=await page.locator('#cardAlimtalkPanel').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));assert(overflow.scroll<=overflow.width+1,JSON.stringify(overflow));
console.log(label,'prepare, sending, history verified',overflow);
await page.close();
}
}finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
