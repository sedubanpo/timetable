// Real UI + fake authentication/data. No production service requests or accounts.
const fs=require('node:fs'),http=require('node:http'),{execFileSync}=require('node:child_process');
http.createServer((req,res)=>{
  if(req.url.startsWith('/slow-export')){setTimeout(()=>{res.setHeader('Content-Type','text/javascript');res.end('/* simulated slow export CDN */');},2000);return;}
  res.setHeader('Content-Type','text/html;charset=utf-8');
  if(req.url.startsWith('/timing')){
    const file=req.url.includes('before')?execFileSync('git',['show','e7bd0b2:Index.html'],{encoding:'utf8'}):fs.readFileSync('Index.html','utf8');
    const scripts=(file.match(/<script[^>]+src="https:\/\/(?:cdn.sheetjs.com|html2canvas.hertzen.com)[^>]+><\/script>/g)||[]).map((s,i)=>s.replace(/src="[^"]+"/,'src="/slow-export?i='+i+'"')).join('');
    res.end('<!doctype html><html><head>'+scripts+'</head><body><output id="result">준비 중</output><script>document.addEventListener("DOMContentLoaded",()=>{document.getElementById("result").textContent="DOM 준비: "+Math.round(performance.now())+"ms";});</script></body></html>');return;
  }
  let html=fs.readFileSync('Index.html','utf8');
  // Eliminate nonessential remote images/fonts in the local-only fixture.
  html=html.replace(/<link[^>]+>/g,'').replace(/@import[^;]+;/g,'').replace(/<img\b[^>]*>/g,'');
  const d=new Date(),sheet=(d.getMonth()+1)+'/'+d.getDate()+'('+['일','월','화','수','목','금','토'][d.getDay()]+')';
  const grid={};for(let h=8;h<=23;h++)grid[h]=[['개별 수학 가상T','합성학생 테스트중2 정규'],['개별 수학 가상T','예시학생 테스트고1 정규']];
  const data={headers:['1강의실','2강의실'],grid,version:'fixture-v1'};
  const fixture=`
    var fixtureSheet=${JSON.stringify(sheet)},fixtureData=${JSON.stringify(data)},fixtureLive=[];
    var fixtureUser={uid:'synthetic',email:'01000000000@sedu-auth.local',getIdToken:()=>Promise.resolve('synthetic')};
    getLiveFirebaseAuth=()=>Promise.resolve({currentUser:fixtureUser});
    resolveLiveFirebaseIdToken=()=>Promise.resolve('synthetic');
    loadNotice=initOperationMemoFeature=loadSharedSubjectIcons=refreshOptionalTeacherRoster=updateSnapshotSaveAccess=startAttendanceRealtime=recordTeacherViewAfterSuccessfulLoad=()=>{};
    loadOperationMemosForCurrentSheet=()=>Promise.resolve([]);loadStudentEnrollmentStatusWarnings=()=>Promise.resolve(false);
    loadSavedLoginCredentials=()=>{};saveLoginCredentials=()=>{};
    callServer=(method)=>method==='getTeacherGridData'||method==='getFixedGridData'?new Promise((resolve,reject)=>fixtureLive.push({resolve,reject})):new Promise(()=>{});
    window.fetch=async(url,options)=>{var action=JSON.parse(options.body).action;return {ok:true,status:200,json:async()=>action==='bootstrap'?{ok:true,identity:{ok:true,firebaseUid:'synthetic',loginId:'01000000000',teacherName:'가상',isMaster:false},sheets:[fixtureSheet]}:{ok:true,sheet:fixtureSheet,savedAt:Date.now()-120000,data:fixtureData}};};
    document.addEventListener('DOMContentLoaded',()=>{
      var panel=document.createElement('div');panel.style.cssText='position:fixed;bottom:8px;right:8px;z-index:30000;background:white;color:#0f1746;padding:8px;font-size:12px;border:1px solid #aaa';
      panel.innerHTML='<span>합성 테스트 · 운영 연결 없음</span> <button id="fixtureRefresh">백업 갱신</button> <button id="fixtureLive">원본 응답</button> <button id="fixtureFailure">원본 실패</button>';
      document.body.appendChild(panel);
      document.getElementById('fixtureRefresh').onclick=()=>loadData(fixtureSheet,true);
      document.getElementById('fixtureLive').onclick=()=>fixtureLive.splice(0).forEach(p=>p.resolve(fixtureData));
      document.getElementById('fixtureFailure').onclick=()=>fixtureLive.splice(0).forEach(p=>p.reject(Error('API_TIMEOUT')));
    });
  `;
  html=html.replace(/\n    <\/script>\s*<\/body>/,'\n'+fixture+'\n    </script>\n</body>');res.end(html);
}).listen(4193,'127.0.0.1',()=>console.log('Synthetic entry flow: http://127.0.0.1:4193 (timing?before / timing?after)'));
