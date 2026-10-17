import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const {default:pw}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd(),out='/private/tmp/visitor-media-proof';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const name=req.url.split('?')[0].slice(1)||'index.html',f=path.join(root,'docs',name);if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',/\.(js|mjs)$/.test(f)?'text/javascript':f.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await pw.chromium.launch({channel:'chrome',headless:true});
const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
let publication=null;const requests=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},timezoneId:'Asia/Seoul'});
 await page.clock.install({time:new Date('2026-10-13T12:30:15+09:00')});await page.clock.pauseAt(new Date('2026-10-13T12:30:16+09:00'));
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=route.request().url();if(url.includes('timetableSnapshotApi')){const b=route.request().postDataJSON();requests.push(b);if(b.action==='visitor_banner_save')publication={url:'https://fixture.test/banner.gif',title:b.title,enabled:true};if(b.action==='visitor_banner_hide'&&publication)publication.enabled=false;return route.fulfill({json:{ok:true,portraits:[{name:'검증강사',owner:'user:fixture',url:'https://fixture.test/portrait.svg'}],banner:publication}});}
 if(url==='https://fixture.test/portrait.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#dbeafe"/><circle cx="40" cy="30" r="15" fill="#245bb2"/></svg>'});
 if(url==='https://fixture.test/banner.gif')return route.fulfill({contentType:'image/gif',body:gif});
 return url.startsWith('http://127.0.0.1:')?route.continue():route.abort();});
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{
  authState={loggedIn:true,isMaster:true,isLookup:false,role:'ADMIN',loginId:'admin'};currentSheetName='10/17(토)';
  getLiveFirebaseAuth=()=>Promise.resolve({onAuthStateChanged:()=>()=>{},currentUser:{uid:'fixture',getIdToken:()=>Promise.resolve('fixture-token')}});
  getLiveFirebaseFirestore=()=>Promise.resolve({collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({role:'STAFF',status:'ACTIVE'})})})})});
  applyRoleUi();document.body.classList.add('staff-toolbar-embedded');
  document.getElementById('mainPage').style.display='flex';document.getElementById('introPage').style.display='none';document.getElementById('loginGate').style.display='none';
  document.getElementById('calendarTrigger').textContent='10/17(토) ▾';
  document.getElementById('attendanceInboxBtn').style.display='';document.getElementById('attendanceInboxCount').textContent='38';document.getElementById('attendanceInboxCount').classList.add('is-visible');
  lastData={headers:['1강의실','2강의실'],grid:{10:[['개별 수학 검증강사T','검증학생 검증고3 정규'],[]],11:[[],[]]}};renderTable(lastData,false);setSnapshotNotice(null,'원본 조회 기준 · 자동 갱신');document.getElementById('attendanceWindow').hidden=false;document.getElementById('attendanceWindow').textContent='오늘 접수된 출결 메시지가 없습니다.';
 });
 await page.locator('#snapshotSaveBtn').waitFor();
 
 for(const selector of ['#attendanceInboxBtn','.excel-btn','#snapshotSaveBtn'])assert(await page.locator('.staff-actions > '+selector).isVisible());
 assert.equal(await page.locator('#attendanceReportBtn').isVisible(),false);
 await page.getByText('업무 도구',{exact:false}).first().click();assert(await page.locator('#attendanceReportBtn').isVisible());
 await page.screenshot({path:out+'/staff-menu.png'});
 await page.keyboard.press('Escape');assert.equal(await page.locator('#attendanceReportBtn').isVisible(),false);
 await page.locator('.staff-menu summary').nth(1).click();assert.equal(await page.locator('#privacyToggle').count(),1);
 await page.keyboard.press('Escape');
 for(const width of [1920,1440,390]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:out+'/staff-'+width+'.png'});
 }
 await page.evaluate(()=>{authState.isMaster=false;authState.isLookup=true;syncStaffToolbar();});
 assert.equal(await page.locator('.staff-toolbar').count(),0);
 assert.equal(await page.locator('.top-bar > .search-wrapper').count(),1);
 assert.equal(await page.locator('.nav-group button').count(),3);
 assert.equal(await page.locator('.action-group #snapshotSaveBtn').count(),1);
 assert.deepEqual(errors,[]);
 console.log('PASS direct actions, grouped menus, Escape, responsive layout and visitor restoration');
}finally{await browser.close();server.close();}
