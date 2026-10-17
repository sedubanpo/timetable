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
 await page.evaluate(()=>{authState={loggedIn:true,isMaster:true,isLookup:false,loginId:'admin'};getLiveFirebaseAuth=()=>Promise.resolve({currentUser:{getIdToken:()=>Promise.resolve('fixture-token')}});applyRoleUi();});
 await page.evaluate(()=>openVisitorBannerAdmin());await page.locator('#visitorBannerMessage').filter({hasText:'현재 표시 중인 배너가 없습니다.'}).waitFor();
 await page.locator('#visitorBannerTitle').fill('테스트 특강');await page.locator('#visitorBannerFile').setInputFiles({name:'animation.gif',mimeType:'image/gif',buffer:gif});
 await page.locator('#visitorBannerSave').click();await page.locator('#visitorBannerMessage').filter({hasText:'저장했습니다.'}).waitFor();assert.equal(requests.find(r=>r.action==='visitor_banner_save').image,'data:image/gif;base64,'+gif.toString('base64'));
 await page.screenshot({path:out+'/admin.png'});await page.getByRole('button',{name:'배너 설정 닫기'}).click();
 await page.evaluate(()=>{authState={loggedIn:true,isMaster:false,isLookup:true,loginId:'2371',snapshotLookupToken:'fixture-lookup'};currentSheetName='10/13(화)';accessMode='all';lastData={headers:['4강의실'],grid:{12:[[]],19:[['개별 국어 검증강사T','검증학생 검증고3']]}};applyRoleUi();document.getElementById('mainPage').style.display='flex';document.getElementById('introPage').style.display='none';document.getElementById('loginGate').style.display='none';resetVisitorLookupIndexCache();document.getElementById('searchInput').value='검증학생';searchTable();});
 await page.locator('.visitor-portrait img').waitFor();assert(await page.locator('.visitor-portrait img').evaluate(i=>i.complete&&i.naturalWidth>0));assert.equal(await page.locator('#snapshotNotice').isVisible(),false);assert.equal(await page.locator('#visitorBannerAdminBtn').isVisible(),false);
 assert(requests.some(r=>r.action==='visitor_media'&&r.lookupToken==='fixture-lookup'));
 assert(await page.locator('.visitor-banner').evaluate(e=>{const p=e.parentElement.getBoundingClientRect(),r=e.getBoundingClientRect();return r.width/p.width>.18&&r.width/p.width<.21;}));
 assert(await page.evaluate(()=>{const left=document.querySelector('.visitor-lookup-left').getBoundingClientRect(),map=document.querySelector('.visitor-lookup-right').getBoundingClientRect(),news=document.querySelector('.visitor-banner').getBoundingClientRect();return Math.abs(left.top-map.top)<2&&left.right<=map.left+1&&map.right<news.left&&map.width>left.width;}));
 assert(await page.locator('.visitor-floorplan').evaluate(e=>e.getBoundingClientRect().width>900&&e.getBoundingClientRect().height>400));
 assert(await page.locator('.visitor-room-map-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 assert(await page.locator('.visitor-lookup-card').first().evaluate(e=>e.getBoundingClientRect().height<155));
 await page.evaluate(()=>{visitorBanner=[1,2,3].map(i=>({enabled:true,url:'https://fixture.test/banner.gif',title:'특강 '+i}));renderVisitorBanner();});assert.equal(await page.locator('.visitor-banner-list img').count(),3);assert(await page.locator('.visitor-banner-list img').first().evaluate(e=>Math.abs(e.getBoundingClientRect().width/e.getBoundingClientRect().height-1.8)<.02));
 await page.screenshot({path:out+'/desktop.png',fullPage:true});
 assert(await page.locator('.visitor-lookup-card-name').first().innerText().then(t=>t.includes('검증학생')&&t.includes('국어 · 개별')));
 for(const width of [1920,1024,768]){await page.setViewportSize({width,height:1080});assert(await page.evaluate(()=>{const a=document.getElementById('roomOverviewBtn').getBoundingClientRect(),b=document.getElementById('digitalClock').getBoundingClientRect();return a.bottom+8<=b.top||a.right+8<=b.left||b.right+8<=a.left;}),'clock and room button must not overlap at '+width);}
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: admin GIF upload, lookup-auth portraits, source bar hidden, 80/20 layout, mobile overflow, no page errors');
}finally{await browser.close();server.close();}
