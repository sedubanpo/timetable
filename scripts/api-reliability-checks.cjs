const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('Index.html','utf8');
const source=html.slice(html.indexOf('      function apiJsonp('),html.indexOf('      // Auth-only retry policy'));
function fixture(){
 let now=0,id=0;const timers=new Map(),scripts=[],window={};
 const head={appendChild(s){s.parentNode=head;scripts.push(s);},removeChild(s){s.parentNode=null;}};
 const ctx={window,document:{createElement:()=>({}),head},getApiBaseUrl:()=>'https://example.invalid/exec',setTimeout:(f,d)=>{timers.set(++id,{f,at:now+d});return id;},clearTimeout:i=>timers.delete(i),Date,Math,Promise,Error,encodeURIComponent};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,scripts,window,reply(i,p){window[new URL(scripts[i].src).searchParams.get('callback')](p);},advance(target){while(true){const next=[...timers.entries()].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);now=next[1].at;next[1].f();}now=target;}};
}
async function main(){
 let f=fixture(),p=f.ctx.apiJsonp({action:'grid',idToken:'SECRET',sheet:'PRIVATE'},{timeoutMs:25000,retries:1});
 f.advance(31500);assert.equal(f.scripts.length,2);f.reply(0,{ok:true,data:{version:'late'}});assert.equal((await p).data.version,'late');
 f.reply(1,{ok:true,data:{version:'ignored'}});f.advance(65000);
 assert(!JSON.stringify(f.window.__seduApiDiagnostics).includes('SECRET'));assert(!JSON.stringify(f.window.__seduApiDiagnostics).includes('PRIVATE'));
 f=fixture();p=f.ctx.apiJsonp({action:'teacher_view_override_set'},{timeoutMs:15000,retries:1}).catch(e=>e);
 f.scripts[0].onerror();f.advance(64000);assert.equal(f.scripts.length,1);f.advance(65000);
 assert.equal((await p).code,'API_NETWORK');
 f=fixture();p=f.ctx.apiJsonp({action:'grid'},{retries:1});
 f.reply(0,{ok:false,error:'Service temporarily unavailable'});f.advance(1500);assert.equal(f.scripts.length,2);
 f.reply(1,{ok:true});assert.equal((await p).ok,true);
 f=fixture();p=f.ctx.apiJsonp({action:'grid'},{retries:1});
 f.advance(31500);f.reply(0,{ok:false,error:'Service temporarily unavailable'});
 f.reply(1,{ok:true,data:{version:'second'}});assert.equal((await p).data.version,'second');
 f=fixture();p=f.ctx.apiJsonp({action:'grid'},{retries:1});f.reply(0,{ok:false,error:'UNAUTHORIZED'});assert.equal((await p).error,'UNAUTHORIZED');f.advance(65000);assert.equal(f.scripts.length,1);
 f=fixture();p=f.ctx.apiJsonp({action:'grid'},{retries:1}).catch(e=>e);f.advance(65000);assert.equal((await p).code,'API_TIMEOUT');assert.equal(f.scripts.length,2);
 const app=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim()).pop();
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{style:{},value:'',classList:{add(){},remove(){}}});return elements.get(id);};
 const s={window:{innerWidth:1440,addEventListener(){}},document:{getElementById:el,addEventListener(){},body:{classList:{add(){},remove(){}}}},localStorage:{getItem(){return null;}},console,alert(){},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},URLSearchParams,Date,Promise,Set,Map};
 vm.createContext(s);vm.runInContext(app,s);
 const run=c=>vm.runInContext(c,s),flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 run('renderTable=d=>{globalThis.renderedVersion=d.version;};');
 run(`authState={loggedIn:true,isMaster:true,loginId:'qa'};getActiveTeacherName=()=>'';closeOperationMemoAlert=clearOperationMemoHighlights=renderOperationCommonMemos=calendarSync=recordTeacherViewAfterSuccessfulLoad=()=>{};isTeacherViewActive=()=>false;globalThis.applied=[];processData=d=>{lastData=d;applied.push(d.version);};callServer=()=>Promise.resolve({headers:['room'],grid:{},version:'good'});loadData('day',true);`);
 await flush();assert.equal(run('lastData.version'),'good');
 run(`callServer=()=>Promise.reject(Error('API failure'));loadData('day',true);`);await flush();assert.equal(run('lastData.version'),'good');assert.equal(s.applied.length,1);assert(el('updateText').textContent.includes('갱신 실패'));
 run(`callServer=()=>Promise.resolve({error:'native server error'});loadData('day',true);`);await flush();assert.equal(run('lastData.version'),'good');
 run(`loadData('different-day',true);`);await flush();assert.equal(run('lastData.version'),'ERROR');
 run(`loadData('day',true);`);await flush();assert.equal(s.renderedVersion,'good');assert.equal(run('currentVersion'),'good');
 run(`authState.loginId='other';loadData('day',true);`);await flush();assert.equal(run('lastData.version'),'ERROR');
 const rpcSource=html.slice(html.indexOf('      function callServer('),html.indexOf('      window.onload'));
 run(rpcSource);
 const runner={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){this.failure=fn;return this;},getSheetNames(){}};
 s.google={script:{run:runner}};s.window.google=s.google;s.setTimeout=(fn,ms)=>{s.nativeTimer=fn;assert.equal(ms,65000);return 1;};
 run("globalThis.rpcResult='pending';callServer('getSheetNames',[]).then(()=>rpcResult='success').catch(e=>rpcResult=e.code)");
 s.nativeTimer();await flush();assert.equal(s.rpcResult,'API_TIMEOUT');runner.success({});await flush();assert.equal(s.rpcResult,'API_TIMEOUT');
 console.log('PASS late first response, bounded retry/deadline, no mutation replay, transient-only read retry, redacted diagnostics, retained same-context grid, native error retention, cross-date/account isolation.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
