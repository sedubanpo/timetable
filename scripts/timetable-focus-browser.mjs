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
 await page.evaluate(()=>{
   lastData={headers:['1강의실','2강의실'],grid:{12:[['개별 수학 검증강사T','검증학생 검증고3 정규 10/17(토) 확정, 선생님 톡 확인 시수 포함 X, 지각, 10:09 도착'],['개별 영어 다른강사T','다른학생 다른고2 지각']],13:[[],['1:1 수학 검증강사T','검증학생 검증고3 결석예고']]}};
   renderTable(lastData,false);
 });
 await page.locator('.student-name-button').filter({hasText:'검증학생'}).first().click();
 assert.equal(await page.locator('.student-selected').count(),2);
 await page.locator('button.teacher-name').filter({hasText:'검증강사'}).first().click();
 assert.equal(await page.locator('.teacher-focused').count(),2);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.teacher-focused').count(),0);
 await page.locator('#searchInput').fill('검증학생');assert.equal(await page.locator('#teacherSearchCopy').isVisible(),false);
 await page.locator('#searchInput').fill('강사');assert.equal(await page.locator('#teacherSearchCopy').isVisible(),false);
 await page.locator('#searchInput').fill('검증강사');assert(await page.locator('#teacherSearchCopy').isVisible());
 const rows=await page.evaluate(()=>teacherSearchExportRows(searchedScheduleTeacher()));
 assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.hour),[12,13]);assert(rows.every(r=>!r.students.join().includes('다른학생')));
 await page.evaluate(()=>updateTimelinePosition());
 assert(await page.evaluate(()=>document.getElementById('liveTimeline').getBoundingClientRect().width<=document.querySelector('.time-cell').getBoundingClientRect().width+1));
 const bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await (await teacherSearchImageBlob(searchedScheduleTeacher(),teacherSearchExportRows(searchedScheduleTeacher()))).arrayBuffer())));
 fs.writeFileSync(out+'/teacher-copy.png',Buffer.from(bytes));
 await page.evaluate(()=>{window.copiedImage=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{window.copiedImage=await items[0].getType('image/png');}}});});
 await page.locator('#teacherSearchCopy').click();await page.waitForFunction(()=>window.copiedImage&&window.copiedImage.size>1000);
 await page.screenshot({path:out+'/focus-desktop.png'});
 await page.locator('#searchInput').fill('');assert.equal(await page.locator('#teacherSearchCopy').isVisible(),false);
 await page.locator('button.teacher-name').filter({hasText:'검증강사'}).first().click();
 await page.locator('.student-name-button').filter({hasText:'검증학생'}).first().click();
 await page.screenshot({path:out+'/focus-selection.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS student marker, teacher outlines, search copy conditions, PNG clipboard payload and time-column marker');
}finally{await browser.close();server.close();}
