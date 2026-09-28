const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sdk=fs.readFileSync('scripts/sdk-loader.fragment.js','utf8'),exportsCode=fs.readFileSync('scripts/export-loader.fragment.js','utf8');
for(const file of ['Index.html','docs/index.html']){
  const html=fs.readFileSync(file,'utf8');assert(html.includes(sdk.trimEnd()));assert(html.includes(exportsCode.trimEnd()));
  assert(!/<script[^>]+src="https:\/\/(?:cdn.sheetjs.com|html2canvas.hertzen.com)/.test(html),'export CDN must not block DOMContentLoaded');
  assert(!/\bhtml2canvas\(/.test(html),'every image export awaits its tool');
  assert(html.includes('preserveDisplay=!!retainDisplay || !!snapshotView'));
  assert(html.includes("C.setAttribute('role','button')"));
}
function fixture(){
  const scripts=[],timers=[];
  const c={window:{},Promise,Error,Object,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},document:{createElement:()=>({remove(){this.removed=true;}}),head:{appendChild:s=>scripts.push(s)}}};
  vm.createContext(c);vm.runInContext(sdk+exportsCode,c);return {c,scripts,timers};
}
(async()=>{
  let f=fixture();let ready=false;
  const a=f.c.loadLiveExternalScriptOnce('sdk',()=>ready),b=f.c.loadLiveExternalScriptOnce('sdk',()=>ready);
  assert.equal(a,b);assert.equal(f.scripts.length,1);const failure=assert.rejects(a,/다시 시도/);f.scripts[0].onerror();await failure;
  const retry=f.c.loadLiveExternalScriptOnce('sdk',()=>ready);assert.equal(f.scripts.length,2);ready=true;f.scripts[1].onload();await retry;
  f=fixture();const p=f.c.loadLiveExternalScriptOnce('sdk',()=>false),timeout=assert.rejects(p,/지연/);f.timers[0]();await timeout;assert.equal(f.scripts[0].removed,true);
  f=fixture();assert.equal(f.scripts.length,0,'no export load on login');
  const canvas=f.c.renderExportCanvas('target',{scale:2});assert.equal(f.scripts.length,1);
  f.c.window.html2canvas=(el,opt)=>({el,scale:opt.scale});f.scripts[0].onload();assert.deepEqual(await canvas,{el:'target',scale:2});
  assert.equal(await f.c.ensureExportLibrary('html2canvas'),f.c.window.html2canvas);
  f=fixture();const excel=f.c.ensureExportLibrary('XLSX');f.c.window.XLSX={utils:{}};f.scripts[0].onload();assert.equal(await excel,f.c.window.XLSX);
  console.log('PASS export deferred until use, all exports await dependency, SDK dedupe, bounded timeout, retry after failure, keyboard calendar and mirror parity');
})().catch(e=>{console.error(e);process.exitCode=1;});
