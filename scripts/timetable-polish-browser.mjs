import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const {default:pw}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd(), out=path.resolve(root,'.superloopy/sessions/timetable-polish-20260912/evidence');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');r.end(fs.readFileSync(path.join(root,'docs/index.html')));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await pw.chromium.launch();const cases={};
try {
 const page=await browser.newPage({viewport:{width:1280,height:900},locale:'ko-KR'});
 const logoUrl='https://raw.githubusercontent.com/whdtjd5294/whdtjd5294.github.io/main/sedu_logo.png';
 const logoResponse=await fetch(logoUrl);assert.equal(logoResponse.ok,true,'existing public logo available');const logo=Buffer.from(await logoResponse.arrayBuffer());
 await page.route('**/*',r=>r.request().url()===logoUrl?r.fulfill({contentType:'image/png',body:logo}):r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
 await page.locator('.gate-logo').evaluate(e=>e.decode());
 await page.evaluate(()=>startLoginProgress('gate'));
 cases.pending=await page.locator('#gateLoginBtn').isDisabled();
 cases.indeterminate=await page.locator('#gateLoginProgressFill').evaluate(e=>!e.style.width&&getComputedStyle(e).animationName==='loginProgressTravel');
 await page.screenshot({path:path.join(out,'login-1280-loading.png')});
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 cases.reducedMotion=await page.locator('#gateLoginProgressFill').evaluate(e=>getComputedStyle(e).animationName==='none');
 cases.loginFits=await page.locator('.gate-glass').evaluate(e=>e.getBoundingClientRect().right<=innerWidth);
 cases.labels=await page.getByLabel('아이디 (휴대폰 번호)',{exact:true}).count()===1;
 await page.screenshot({path:path.join(out,'login-390-reduced.png')});
 await page.evaluate(()=>{stopLoginProgress('gate',false);startLoginProgress('gate');});
 await page.waitForTimeout(450);
 cases.retryRetainsPending=await page.locator('#gateLoginProgress').evaluate(e=>e.classList.contains('is-visible')&&e.getAttribute('aria-busy')==='true');
 await page.evaluate(()=>stopLoginProgress('gate',false));
 cases.failureReenabled=!(await page.locator('#gateLoginBtn').isDisabled());
 await page.setViewportSize({width:1280,height:900});
 await page.evaluate(()=>{
  authState={loggedIn:true,isMaster:true,isLookup:false,teacherName:'',loginId:'qa'};accessMode='all';currentSheetName='9/12(토)';availableSheets=[currentSheetName];applyRoleUi();
  document.getElementById('loginGate').style.display='none';document.getElementById('mainPage').style.display='flex';document.getElementById('introPage').style.display='none';
  const headers=Array.from({length:14},(_,i)=>`${i+1}강의실`),grid={};
  for(let h=10;h<15;h++)grid[h]=headers.map((_,i)=>[`${i%2?'국어':'수학'} ${i%3?'개별':'1:1'} ${i%2?'김검증':'안검증'}T`,'한학생 검증고3 정규','다른학생 검증중2 '+(i%2?'당일취소':'지각')]);
  document.getElementById('tableContainer').classList.remove('dimming-enabled');
  lastData={headers,grid,version:'polish'};renderTable(lastData,true);
 });
 for(const width of [1280,1024,390]){
  await page.setViewportSize({width,height:900});await page.evaluate(()=>renderTable(lastData,true));
  await page.locator('#scheduleTable .student-name-button').first().click();
  cases['horizontalHeader'+width]=await page.locator('#scheduleTable .is-teacher').first().evaluate(e=>getComputedStyle(e).flexDirection==='row');
  cases['teacherFits'+width]=await page.locator('#scheduleTable .teacher-name').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().right<=e.closest('td').getBoundingClientRect().right+1));
  await page.screenshot({path:path.join(out,`table-${width}-selected.png`)});
  await page.keyboard.press('Escape');
 }
 cases.verticalStatus=await page.locator('#scheduleTable .status-note-btn').first().evaluate(e=>getComputedStyle(e).writingMode==='vertical-rl');
 cases.gold=await page.locator('#scheduleTable .oneonone-cell').first().evaluate(e=>getComputedStyle(e).boxShadow.includes('181, 138, 46'));
 await page.locator('#scheduleTable .student-name-button').first().click();
 cases.strongSelected=await page.locator('#scheduleTable .student-selected').first().evaluate(e=>getComputedStyle(e).outlineWidth==='3px');
 await page.locator('#scheduleTable .status-note-btn').first().click();cases.noteWorks=await page.locator('.note-bubble').count()===1;
 fs.writeFileSync(path.join(out,'polish-browser.json'),JSON.stringify({browser:browser.version(),cases},null,2));console.log(JSON.stringify(cases));
 for(const [key,value]of Object.entries(cases))assert.equal(value,true,key);
}finally{await browser.close();server.close();}
