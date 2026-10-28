'use strict';
// Explicitly invoked read-only check. Never prints credentials, provider body, or subprocess errors.
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),crypto=require('node:crypto'),rules=require('../snapshot-functions/alimtalk-contract');
const run=promisify(execFile);
async function secret(name){const {stdout}=await run('/opt/homebrew/bin/gcloud',['secrets','versions','access','latest','--secret='+name,'--project=fir-lms-prod'],{env:{...process.env,CLOUDSDK_PYTHON:'/Users/anjongseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'},timeout:15000,maxBuffer:8192});return stdout.trim();}
(async()=>{
 const [key,secretValue]=await Promise.all([secret('TIMETABLE_SOLAPI_API_KEY'),secret('TIMETABLE_SOLAPI_API_SECRET')]);
 if(!key||!secretValue)throw Error('EMPTY_SECRET');
 const date=new Date().toISOString(),salt=crypto.randomBytes(24).toString('hex'),signature=crypto.createHmac('sha256',secretValue).update(date+salt).digest('hex');
 const response=await fetch('https://api.solapi.com/kakao/v2/templates/'+rules.templateId,{method:'GET',headers:{Authorization:`HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`},redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok){console.log(JSON.stringify({authenticated:false,httpStatus:response.status,sendRequests:0}));process.exitCode=1;return;}
 const data=await response.json();
 const vars=(data.variables||[]).map(v=>typeof v==='string'?v:v.name).sort();
 const expected=['#{학생명}','#{수업일}','#{등원시각}','#{수업목록}'].sort();
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),authenticated:true,templateId:rules.templateId,approved:data.status==='APPROVED',templateMatches:rules.verifyTemplate(data),variablesMatch:JSON.stringify(vars)===JSON.stringify(expected),variableCount:vars.length,variableNames:vars,dormant:data.isDormant??data.dormant??'not-returned',buttonCount:Array.isArray(data.buttons)?data.buttons.length:0,sendRequests:0},null,2));
})().catch(()=>{console.log(JSON.stringify({ok:false,code:'PREFLIGHT_FAILED',sendRequests:0}));process.exitCode=1;});
