import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {default:playwright}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.resolve(root,process.env.HOURS_EVIDENCE_DIR||'.superloopy/sessions/hours-access-20260908/evidence');
fs.mkdirSync(evidence,{recursive:true});
const server=http.createServer((req,res)=>{if(req.url!=='/'){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'docs/index.html')));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await playwright.chromium.launch({headless:true});
const results={browser:browser.version(),cases:{},errors:[],diagnostics:{}};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'ko-KR',timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
 page.on('pageerror',e=>results.errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{
  currentSheetName='9/8(화)';availableSheets=[currentSheetName];availableTeacherNames=['김검증','박검증','이확인'];
  updateTeacherCalendarAvailability=()=>Promise.resolve([currentSheetName]);
  loadData=(sheet,force)=>{window.qaLoaded={sheet,force};};
  window.qaRole=admin=>{authState={loggedIn:true,isMaster:admin,isLookup:false,teacherName:admin?'':'김검증',loginId:admin?'qa-admin':'qa-teacher'};accessMode=admin?'all':'teacher';applyRoleUi();document.getElementById('mainPage').style.display='flex';document.getElementById('introPage').style.display='none';document.getElementById('loginGate').style.display='none';};
  qaRole(true);
 });
 results.cases.adminPickerVisible=await page.locator('#teacherPicker').isVisible();
 await page.locator('#teacherPickerTrigger').click();
 results.cases.openFocusSearch=await page.locator('#teacherPickerSearch').evaluate(e=>e===document.activeElement);
 results.cases.allOptions=await page.locator('#teacherPickerOptions button').count()===4;
 await page.locator('#teacherPickerSearch').fill('김');
 results.cases.koreanNameFilter=await page.locator('#teacherPickerOptions button').count()===1;
 await page.screenshot({path:path.join(evidence,'picker-desktop.png')});
 await page.locator('#teacherPickerOptions button').click();
 results.cases.chooseChangesSelector=await page.locator('#teacherViewSelector').inputValue()==='김검증';
 results.cases.chooseCloses=await page.locator('#teacherPickerPanel').isHidden();
 results.cases.chooseCallsLoad=await page.evaluate(()=>qaLoaded.sheet==='9/8(화)'&&qaLoaded.force);
 await page.locator('#teacherPickerTrigger').click();await page.locator('#teacherPickerSearch').fill('없는강사');
 results.cases.emptySearch=await page.locator('.teacher-picker-empty').textContent()==='검색 결과가 없습니다.';
 await page.keyboard.press('Escape');
 results.cases.escapeCloses=await page.locator('#teacherPickerPanel').isHidden();
 results.cases.escapeFocus=await page.locator('#teacherPickerTrigger').evaluate(e=>e===document.activeElement);
 for(const admin of [true,false])for(const width of [320,390,768]){
  await page.setViewportSize({width,height:900});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.evaluate(admin=>{document.getElementById('teacherViewSelector').value='__ALL__';qaRole(admin);},admin);
  const key=`${admin?'admin':'teacher'}${width}`;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  results.cases[key+'SearchBounds']=await page.locator('#searchInput').evaluate(e=>{const b=e.getBoundingClientRect();return b.width>=100&&b.left>=0&&b.right<=innerWidth;});
  if(admin){await page.locator('#teacherPickerTrigger').click();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));results.cases[key+'PickerInputBounds']=await page.locator('#teacherPickerSearch').evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth;});results.diagnostics[key]=await page.evaluate(()=>({panel:document.getElementById('teacherPickerPanel').getBoundingClientRect().toJSON(),input:document.getElementById('teacherPickerSearch').getBoundingClientRect().toJSON(),left:document.getElementById('teacherPickerPanel').style.left}));results.cases[key+'NoHorizontalScroll']=await page.evaluate(()=>scrollX===0);await page.locator('#teacherPickerSearch').fill('박');await page.screenshot({path:path.join(evidence,`${key}.png`)});await page.keyboard.press('Escape');}
  else {results.cases[key+'PickerHidden']=await page.locator('#teacherPicker').isHidden();await page.evaluate(()=>toggleTeacherPicker());results.cases[key+'CannotOpen']=await page.locator('#teacherPickerPanel').isHidden();const menuChecks=[];for(const selector of ['.excel-btn','button[onclick="runScheduleReview()"]','#teacherViewLogBtn','#absenceNoticeBtn','#attendanceReportBtn'])menuChecks.push({selector,visible:await page.locator(selector).isVisible()});results.diagnostics[key]=menuChecks;results.cases[key+'AdminMenusHidden']=menuChecks.every(e=>!e.visible);await page.screenshot({path:path.join(evidence,`${key}.png`)});}
 }
 results.cases.noPageErrors=results.errors.length===0;
 fs.writeFileSync(path.join(evidence,'picker-browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 for(const [name,passed]of Object.entries(results.cases))assert.equal(passed,true,name);
}finally{await browser.close();server.close();}
