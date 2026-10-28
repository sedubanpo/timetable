import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import pw from '/Users/anjongseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const before=execFileSync('git',['show','fa603073:docs/index.html'],{maxBuffer:4e6});
const server=http.createServer((q,r)=>{const u=new URL(q.url,'http://local');if(u.pathname==='/before.html')return r.end(before);if(u.pathname==='/after.html')return r.end(fs.readFileSync('docs/index.html'));const f=path.resolve('docs','.'+u.pathname);if(!f.startsWith(path.resolve('docs')+'/')||!fs.existsSync(f)||!fs.statSync(f).isFile())return r.writeHead(404).end();r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'application/octet-stream');r.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await pw.chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),report=[];
try{for(const width of [1440,390])for(const version of ['before','after']){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});let blocked=0;await context.route('**/*',r=>{if(r.request().url().startsWith(base+'/'))return r.continue();blocked++;return r.abort()});
 const page=await context.newPage();await page.goto(base+'/'+version+'.html',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async version=>{
  LIVE_FIREBASE_CONFIG.projectId='demo-cost';authState={loggedIn:true,isMaster:true,loginId:'synthetic'};const user={uid:'synthetic',getIdToken:async()=> 'mock'},auth={currentUser:user};getLiveFirebaseAuth=async()=>auth;
  let calls=0;window.fetch=async(url,opts)=>{if(!String(url).includes('/documents/events?')&&!String(url).includes('timetableSnapshotApi'))throw Error('MISSING_MOCK');calls++;await new Promise(r=>setTimeout(r,25));return {ok:true,status:200,json:async()=>({ok:true,documents:[],data:{version:'mock'}})}};
  let samples=[];for(let i=0;i<12;i++){let n=calls,t=performance.now();await Promise.all(Array.from({length:3},()=>fetchSlmsSchoolEventsCollection('mock',()=>true,'synthetic')));samples.push({ms:performance.now()-t,http:calls-n,warm:i%2===1});}
  let n=calls;await Promise.all(Array.from({length:3},()=>snapshotRequest('read','10/28(수)','')));const snapshotCalls=calls-n;
  // Render the real production grid; all downstream business methods mocked explicitly.
  accessMode='all';currentSheetName='10/28(수)';document.getElementById('mainPage').style.display='flex';document.getElementById('introPage').style.display='none';document.getElementById('loginGate').style.display='none';
  loadOperationMemosForCurrentSheet=async()=>[];loadStudentEnrollmentStatusWarnings=async()=>false;loadSharedSubjectIcons=async()=>{};loadCardTeacherAssets=async()=>{};loadFirstLesson=async()=>{};
  const data={headers:['1강의실'],grid:{10:[['개별 수학 합성강사T','합성학생 합성고1 정규']]},version:'mock'};lastData=data;renderTable(data,true);
  return {samples,snapshotCalls,gridVisible:document.body.textContent.includes('합성학생')};
 },version);
 assert(result.gridVisible);assert.equal(result.snapshotCalls,version==='after'?1:3);assert(result.samples.every(s=>s.http===(version==='after'?1:3)));
 await page.screenshot({path:`evidence/cost-20261028/${version}-${width}.png`});report.push({version,width,blocked,...result});await context.close();
 }
 fs.writeFileSync('evidence/cost-20261028/browser-comparison.json',JSON.stringify(report,null,2));console.log('PASS production HTML PC/mobile; 12 repeated synthetic batches per viewport; events/snapshot 3 -> 1; static-only outbound allowlist');
}finally{await browser.close();server.close()}
