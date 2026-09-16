import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const {default:playwright}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd(), evidence=path.join(root,'.superloopy/sessions/toolbar-20260916/evidence');
fs.mkdirSync(evidence,{recursive:true});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync('docs/index.html'));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await playwright.chromium.launch({headless:true});
const cases={};
try {
 const page=await browser.newPage({viewport:{width:1920,height:900},locale:'ko-KR'});
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{
  window.noticeMock={reads:0,stops:0,callbacks:[],errors:[]};
  window.mockAuth={currentUser:{uid:'qa-user',email:firebaseEmailForLoginId('qa-admin')},onAuthStateChanged:fn=>{noticeMock.authCallback=fn;return ()=>{};}};
  getLiveFirebaseAuth=()=>Promise.resolve(mockAuth);
  getLiveFirebaseFirestore=()=>Promise.resolve({collection:name=>{if(name!=='dashboardSnapshots')throw Error(name);return {doc:id=>{if(id!=='GLOBAL_NOTICE')throw Error(id);return {onSnapshot:(success,error)=>{noticeMock.reads++;noticeMock.callbacks.push(success);noticeMock.errors.push(error);return ()=>noticeMock.stops++;}};}};}});
  authState={loggedIn:true,isMaster:true,isLookup:false,loginId:'qa-admin',teacherName:''};accessMode='all';
  applyRoleUi();
  document.getElementById('mainPage').style.display='flex';
  document.getElementById('introPage').style.display='none';
  document.getElementById('loginGate').style.display='none';
  updateLoadingBar();
  const headers=Array.from({length:14},(_,i)=>(i+1)+'강의실'),grid={};
  for(let h=16;h<19;h++)grid[h]=headers.map(()=>['과학 3:1 검증강사T','가학생 검증고2 정규','나학생 검증고2 정규']);
  lastData={headers,grid};renderTable(lastData,true);
 });
 await page.waitForFunction(()=>noticeMock.reads===1);
 cases.activeNotices=await page.evaluate(()=>{
  noticeMock.callbacks[0]({exists:true,data:()=>({items:[{content:'시험기간 안내'},{content:'숨긴 공지',active:false},{content:'보강 안내',active:true}]})});
  return document.getElementById('noticeText').textContent==='📢 시험기간 안내   •   보강 안내';
 });
 cases.legacyAndEmpty=await page.evaluate(()=>normalizeLiveNotice({content:'이전 공지'}).join()==='이전 공지'&&normalizeLiveNotice({items:[],content:'이전 공지'}).length===0);
 cases.safeText=await page.evaluate(()=>{noticeMock.callbacks[0]({exists:true,data:()=>({items:[{content:'<img src=x onerror=alert(1)>'}]})});return !document.querySelector('#noticeText img');});
 await page.evaluate(()=>noticeMock.callbacks[0]({exists:true,data:()=>({items:[{content:'S-LMS 시험기간 및 보강 안내'}]})}));
 cases.removedEmptyRoom=await page.locator('.empty-btn').count()===0;
 cases.renamed=await page.locator('button[onclick="runScheduleReview()"]').innerText()==='시간표 점검';
 cases.fourActions=await page.locator('.primary-actions button').count()===4;
 cases.fullscreen=await page.locator('.action-group button:last-child').evaluate(e=>e.classList.contains('fullscreen-btn')&&!e.querySelector('span')&&e.getAttribute('aria-label')==='전체화면');
 cases.countdown=await page.locator('.loading-bar-container').evaluate(e=>Math.abs(e.getBoundingClientRect().width-83.33)<1&&e.title.includes('다음 업데이트까지')&&/^\d{2}:\d{2}$/.test(e.textContent));
 cases.layout=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect(),home=rect('.top-bar > div:first-child'),search=rect('.search-wrapper'),actions=rect('.primary-actions');return Math.abs(home.left-search.left)<2&&search.top>home.top&&actions.top<search.top;});
 for(const width of [1920,1440,390]){
  await page.setViewportSize({width,height:900});
  cases['noOverflow'+width]=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  await page.screenshot({path:path.join(evidence,'toolbar-'+width+'.png')});
 }
 cases.noRepeatedSubscription=await page.evaluate(()=>{loadNotice();return noticeMock.reads===1;});
 cases.logoutClears=await page.evaluate(()=>{authState.loggedIn=false;loadNotice();noticeMock.callbacks[0]({exists:true,data:()=>({content:'stale secret'})});return document.getElementById('noticeText').textContent==='S-LMS 공지사항'&&noticeMock.stops===1;});
 cases.lookupNoRead=await page.evaluate(()=>{authState.loggedIn=true;authState.isLookup=true;loadNotice();return noticeMock.reads===1;});
 await page.evaluate(()=>{authState.isLookup=false;loadNotice();});
 await page.waitForFunction(()=>noticeMock.reads===2);
 cases.errorClears=await page.evaluate(()=>{noticeMock.callbacks[1]({exists:true,data:()=>({content:'secret'})});noticeMock.errors[1](Error('denied'));noticeMock.callbacks[1]({exists:true,data:()=>({content:'stale secret'})});return document.getElementById('noticeText').textContent.includes('불러오지 못했습니다');});
 await page.evaluate(()=>loadNotice());
 await page.waitForFunction(()=>noticeMock.reads===3);
 cases.authChangeClears=await page.evaluate(()=>{mockAuth.currentUser=null;noticeMock.authCallback(null);noticeMock.callbacks[2]({exists:true,data:()=>({content:'stale secret'})});return document.getElementById('noticeText').textContent==='S-LMS 공지사항';});
 await page.evaluate(()=>{mockAuth.currentUser={uid:'other',email:'other@example.com'};loadNotice();});
 await page.waitForTimeout(50);
 cases.identityMismatchNoRead=await page.evaluate(()=>noticeMock.reads===3&&document.getElementById('noticeText').textContent.includes('불러오지 못했습니다'));
 cases.teacherGating=await page.evaluate(()=>{
  authState.isMaster=false;authState.teacherName='검증강사';accessMode='teacher';applyRoleUi();
  return Array.from(document.querySelectorAll('.primary-actions button')).every(e=>getComputedStyle(e).display==='none') &&
    getComputedStyle(document.querySelector('button[onclick="runScheduleReview()"]')).display==='none';
 });
 cases.visitorGating=await page.evaluate(()=>{
  authState.isLookup=true;applyRoleUi();
  return getComputedStyle(document.querySelector('.primary-actions')).display==='none' &&
    getComputedStyle(document.querySelector('.search-wrapper')).display!=='none' &&
    getComputedStyle(document.querySelector('.action-group')).display==='none';
 });
 fs.writeFileSync(path.join(evidence,'toolbar-browser.json'),JSON.stringify({browser:browser.version(),cases},null,2));
 assert(Object.values(cases).every(Boolean),JSON.stringify(cases,null,2));
 console.log(JSON.stringify(cases,null,2));
} finally {await browser.close();server.close();}
