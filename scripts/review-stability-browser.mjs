import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import assert from 'node:assert/strict';
import pw from '/Users/anjongseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const server=http.createServer((q,r)=>{const u=new URL(q.url,'http://local');const root=u.pathname.startsWith('/before/')?'/private/tmp/snapshot-desk-access/docs':path.resolve('docs');const file=path.join(root,u.pathname.replace(/^\/(before|after)\//,'')||'index.html');if(!file.startsWith(root)||!fs.existsSync(file)){r.writeHead(404).end();return;}r.setHeader('Content-Type',/\.(js|mjs)$/.test(file)?'text/javascript':'text/html');r.end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await pw.chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});const report=[];
try{for(const version of ['before','after']){const context=await browser.newContext({serviceWorkers:'block'});let outbound=0;await context.route('**/*',r=>{if(r.request().url().startsWith('http://127.0.0.1:'+server.address().port+'/'))return r.continue();outbound++;return r.abort();});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/'+version+'/index.html',{waitUntil:'domcontentloaded'});
const html=fs.readFileSync(version==='before'?'/private/tmp/snapshot-desk-access/docs/index.html':'docs/index.html','utf8');
const managerSource=version==='after'?html.slice(html.indexOf('      // Each source owns'),html.indexOf('      function runScheduleReview()')):'';
const privateSource=html.slice(html.indexOf('        function withReviewTimeout('),html.indexOf('function buildReviewExternalIssues',html.indexOf('        function withReviewTimeout(')));
const result=await page.evaluate(async ({version,privateSource,managerSource})=>{
 (0,eval)(privateSource);
 authState={loggedIn:true,isMaster:true,isLookup:false,loginId:'synthetic'};currentSheetName='10/17(토)';
 const user={uid:'synthetic-user',getIdToken:async()=> 'synthetic-token'};const auth={currentUser:user};getLiveFirebaseAuth=async()=>auth;
 // Only synthetic adapters; unrecognized calls fail, no network fallback.
 let requests=[],mode='ok';window.fetch=async(url,opts={})=>{requests.push(String(url).includes('Handoff')?'identity':String(url).includes('OperationMemo')?'attendance':String(url).includes('/events?')?'events':String(url).includes('/jikboStatuses?')?'statuses':'UNKNOWN');const kind=requests.at(-1);if(kind==='UNKNOWN')throw Error('UNMOCKED_REQUEST');await new Promise(r=>setTimeout(r,80));if(kind==='identity')return {ok:true,status:200,json:async()=>({ok:true,identity:{uid:user.uid,admin:true}})};if(kind==='attendance')return {ok:false,status:400,json:async()=>({ok:false,error:'INVALID_ACTION'})};if(mode===kind||mode==='both')return {ok:false,status:503,json:async()=>({})};return {ok:true,status:200,json:async()=>({documents:[]})};};
 loadStudentEnrollmentStatusWarnings=async()=>false;window.buildReviewEnrollmentStatusWarnings=()=>[];window.addReviewDateDays=(d)=>d;window.getReviewCurrentStudentMap=()=>({});
 const snapshot={allStudentNames:{},students:[]};let times=[],runs=[];
 for(let i=0;i<40;i++){if(version==='after'&&i%2===0)invalidateReviewReads('DATA');else if(version==='before'&&i%2===0)window.seduReviewContextCache={};let start=performance.now(),n=requests.length;const raw=await loadReviewExternalContext('2026-10-17',snapshot);times.push(performance.now()-start);runs.push({warm:i%2===1,requests:requests.slice(n),attendance:raw.attendanceStatus.state});}
 let cases=[];if(version==='after'){for(const failure of ['events','statuses','both']){mode=failure;invalidateReviewReads('DATA');const raw=await loadReviewExternalContext('2026-10-17',snapshot);cases.push({failure,states:raw.sourceStates,attendance:raw.attendanceStatus.state});}mode='ok';invalidateReviewReads('DATA');const raw=await loadReviewExternalContext('2026-10-17',snapshot);if(raw.attendanceStatus.state!=='unsupported')throw Error('unsupported marked successful');}
 let ui=null,uiTimes=[];
 mode='ok';lastData={headers:['1강의실'],grid:{10:[['개별 수학 합성강사T','합성학생 합성고1 정규']]}};callServer=async()=>null;
 for(let i=0;i<20;i++){
  if(i%2===0){if(version==='after')invalidateReviewReads('DATA');else window.seduReviewContextCache={};}
  const start=performance.now();runScheduleReview();
  const host=document.getElementById('reviewResultList');let usable=null;
  while(true){const text=host.textContent;if(usable===null&&host.querySelector('[data-review-panel]'))usable=performance.now()-start;
   if(!text.includes('검토 중')&&!text.includes('불러오는 중')&&!text.includes('조회 중'))break;
   if(performance.now()-start>2000)throw Error('UI_PERFORMANCE_TIMEOUT');await new Promise(r=>setTimeout(r,2));}
  uiTimes.push({warm:i%2===1,usable,complete:performance.now()-start});
 }
 ui={visible:document.getElementById('reviewModal').style.display,text:document.getElementById('reviewResultList').textContent.includes('미지원')};
 if(version==='after'&&!ui.text)throw Error('Actual review modal lacks unsupported state');
 return {times,runs,cases,ui,uiTimes};
},{version,privateSource,managerSource});report.push({version,...result,blockedExternal:outbound,consoleErrors:errors});await context.close();}
const after=report[1];assert(after.runs.filter(r=>r.warm).every(r=>r.requests.length===1&&r.requests[0]==='identity'));assert(after.runs.every(r=>r.attendance==='unsupported'));assert(after.cases.find(c=>c.failure==='events').states.statuses.state==='ready');assert(after.cases.find(c=>c.failure==='statuses').states.events.state==='ready');assert(after.cases.find(c=>c.failure==='both').states.events.state==='unavailable');
fs.writeFileSync('investigation/browser.json',JSON.stringify(report,null,2));console.log('Production HTML with intercepted outbound: passed; before/after cold/warm 20 pairs each');
}finally{await browser.close();server.close();}
