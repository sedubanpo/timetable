'use strict';
// Loopback-only synthetic workbench; no production SDK, secrets, network or persisted contacts.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
global.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};
const {fixture}=require('./alimtalk-fixture.cjs'),{createService}=require('../snapshot-functions/alimtalk-service');
const f=fixture(),service=createService(f.deps);
f.student.lessons.push({...f.lesson,sourceId:'cell-2',subject:'영어',teacher:'모의담당',building:'2관',room:'3강의실',type:'개별정규',start:'17:30',end:'19:30'});
const files={'/contract.js':'assets/alimtalk-contract.js','/ui.js':'assets/alimtalk-ui.js','/style.css':'assets/alimtalk.css'};
const page=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>시간표 카드 · 알림톡 모의 검증</title><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:#eef1f5;font-family:Arial,"Apple SD Gothic Neo",sans-serif;color:#183755}main{max-width:780px;margin:24px auto;padding:16px}header{padding-bottom:16px}h1{font-size:24px}.alimtalk-panel{max-width:650px}button{min-height:44px} .demo-notice{padding:12px;background:#fff7ed;color:#7c2d12}label{display:block}</style><main><header><h1>시간표 카드 · 알림톡 미리보기</h1><p class="demo-notice">합성 학생·더미 번호·모의 서버입니다. 실제 메시지는 발송되지 않습니다.</p><label>검증 시나리오 <select id="scenario"><option value="normal">정상 수신 완료</option><option value="timeout">요청 타임아웃</option><option value="changed">미리보기 이후 일정 변경</option><option value="failed">수신 실패</option><option value="unmapped">학생 ID 미연결</option></select></label><button id="open">알림톡 미리보기 열기</button><button id="results">발송 결과 열기</button></header><div id="panel" class="alimtalk-panel"></div></main><script src="/contract.js"></script><script src="/ui.js"></script><script>
const ui=TimetableAlimtalkUI.mount({host:document.getElementById('panel'),context:()=>({name:'가상학생',date:'2026-10-28',studentId:document.getElementById('scenario').value==='unmapped'?null:'synthetic-1'}),api:async(action,input)=>{const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,input,scenario:document.getElementById('scenario').value}),signal:AbortSignal.timeout(4000)});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.code),data);return data;}});
document.getElementById('open').onclick=()=>ui.load();document.getElementById('results').onclick=()=>ui.showResults();document.getElementById('scenario').onchange=()=>ui.reset();
</script></html>`;
http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(page);}
  if(req.method==='GET'&&files[req.url]){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'application/javascript');return res.end(fs.readFileSync(path.join(__dirname,'..',files[req.url])));}
  if(req.method!=='POST'||req.url!=='/api'){res.statusCode=404;return res.end();}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>20000){res.statusCode=413;return res.end();}}
  try{const {action,input,scenario}=JSON.parse(body);if(!['preview','send','results','reconcile'].includes(action))throw Error('INVALID_ACTION');
    if(action==='preview'){f.lesson.end='17:00';f.day.students[0].lessons[0].end='17:00';}
    if(action==='send'&&scenario==='changed')f.day.students[0].lessons[0].end='17:15';
    f.deps.provider.sendOne=async m=>{f.sent.push(m);if(scenario==='timeout')return new Promise(()=>{});return {messageId:'demo-message-'+f.sent.length,groupId:'demo-group-'+f.sent.length,statusCode:scenario==='failed'?'5000':'2000'};};
    f.deps.provider.lookup=async x=>({...x,statusCode:'4000'});
    const out=await service[action]('synthetic-admin',action==='reconcile'?input.id:input);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(out));
  }catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:e.code||'MOCK_ERROR'}));}
}).listen(8787,'127.0.0.1',()=>console.log('Synthetic-only workbench: http://127.0.0.1:8787'));
