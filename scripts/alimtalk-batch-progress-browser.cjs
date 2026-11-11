// Offline bulk UI exercise; the fake transport cannot reach a messaging service.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:760,height:580}});
  await page.route('**/*',r=>r.abort());
  for(const [audience,total,stop] of [['guardian',42,false],['student',39,false],['student',17,true]]){
   await page.setContent('<meta charset=utf-8><style>body{font:16px system-ui,sans-serif;margin:28px}h3{margin-top:0}#cardAlimtalkPanel{max-width:680px} button{padding:8px}</style><main id="studentImageModal"><div class="batch-bar"><button>대상 전환</button></div><aside id="cardAlimtalkPanel"></aside></main>');
   await page.addScriptTag({path:'assets/alimtalk-contract.js'});await page.addScriptTag({path:'assets/alimtalk-batch-ui.js'});
   await page.addStyleTag({path:'assets/alimtalk-batch.css'});
   await page.evaluate(async({audience,total,stop})=>{
    const data=Array.from({length:total},(_,i)=>({ticket:'t'+i,studentId:'s'+i,name:'검증학생 '+(i+1),masked:'가상 번호',text:'가상 수업 안내',relation:audience==='student'?'학생':'모'}));
    window.chunks=[];window.step=null;
    const api=async(action,input)=>{
     if(action==='batchPreview')return {items:data,rows:data,batchSize:8,previewId:'offline'};
     if(action!=='batchSend')throw Error('Unexpected API');
     chunks.push(input.tickets.slice());
     if(chunks.length===2)await new Promise(resolve=>window.step=resolve);
     if(stop&&chunks.length===2)throw Object.assign(Error(),{code:'TIMEOUT'});
     return {results:input.tickets.map((_,i)=>({state:i?'ACCEPTED':'DELIVERED'}))};
    };
    await TimetableBatchUI.mount({host:document.querySelector('aside'),context:()=>({date:'2026-11-11',audience}),api,refresh:()=>{}}).review('unsent');
   },{audience,total,stop});
   const all=page.getByLabel(/가능한 번호 전체/),ack=page.getByLabel(/수신자와 본문/),send=page.locator('.send-action');
   await all.check();await ack.check();await page.locator('.bulk-pick-list summary').first().click();const first=page.locator('.bulk-review-row input').first();await first.uncheck();assert(await send.isDisabled());await first.check();await ack.check();await send.dblclick({timeout:2000}).catch(()=>{});
   await page.waitForFunction(()=>!!window.step);
   assert.deepEqual(await page.evaluate(()=>chunks.map(x=>x.length)),[8,8]);assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'8');
   assert.equal(await page.locator('.batch-bar').evaluate(x=>x.inert),true);
   if(!stop&&audience==='guardian'&&process.env.PROGRESS_SCREENSHOT)await page.locator('.batch-journey').screenshot({path:process.env.PROGRESS_SCREENSHOT});
   if(stop){await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.batch-orbit').evaluate(x=>getComputedStyle(x).animationName),'none');}
   await page.evaluate(()=>step());await page.getByRole('button',{name:'전체 발송 이력 보기'}).waitFor();
   assert.equal(await page.locator('.batch-bar').evaluate(x=>x.inert),false);
   const chunks=await page.evaluate(()=>window.chunks);
   if(stop){assert.equal(chunks.length,2);assert.match(await page.locator('aside').innerText(),/이후 1건은 요청하지 않았습니다/);}
   else {assert.equal(chunks.flat().length,total);assert.equal(new Set(chunks.flat()).size,total);assert(chunks.every(c=>c.length<=8));assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),String(total));}
   console.log(audience,total,stop?'stopped safely':'complete',chunks.map(x=>x.length).join(','));
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
