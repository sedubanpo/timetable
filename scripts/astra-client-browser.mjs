import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { default: playwright } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.resolve(root, process.env.ASTRA_EVIDENCE_DIR || '.superloopy/evidence/astra-browser');
fs.mkdirSync(evidence, { recursive: true });
const server = http.createServer((req,res) => {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'Index.html')));});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await playwright.chromium.launch({headless:true});
const results = {browser:browser.version(),cases:{},errors:[]};
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000},locale:'ko-KR',timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  page.on('pageerror', error => results.errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(() => {
    authState = {loggedIn:true,isMaster:false,isLookup:false,teacherName:'검증강사',loginId:'qa-teacher'};
    accessMode='teacher';
    currentSheetName='9/5(토)';
    availableSheets=['9/5(토)'];
    applyRoleUi();
    studentEnrollmentStatusState.identitiesByName = {
      alice:[{studentId:'qa-alice',active:true,school:'검증중2'}],
      bob:[{studentId:'qa-bob',active:true,school:'검증중2'}]
    };
    studentEnrollmentStatusState.byName = {alice:[{label:'등록 상태 확인'}]};
    lastData = {headers:['1강의실'],grid:{18:[['개별 수학 검증강사T','Alice 검증중2','Bob 검증중2']],19:[['개별 영어 검증강사T','Alice 검증중2']]},version:'qa'};
    teacherMobileSimpleView=false;
    document.getElementById('mainPage').style.display='flex';
    document.getElementById('introPage').style.display='none';
    document.getElementById('loginGate').style.display='none';
    document.getElementById('mainSheetSelector').innerHTML='<option>9/5(토)</option>';
    renderTable(lastData,true);
    // Avoid any service call while still exercising the actual rendered onclick handler.
    openTeacherAttendanceComposerFromButton = button => { window.qaClickedName=button.dataset.studentName; };
    window.qaDesktopButton=document.querySelector('#scheduleTable .teacher-attendance-report-btn[data-student-name="Alice"]');
    window.qaDesktopAttrs=Array.from(qaDesktopButton.attributes).map(a=>[a.name,a.value]);
  });
  results.cases.desktopButtonsBefore=await page.locator('#scheduleTable .teacher-attendance-report-btn').count()===3;
  await page.evaluate(() => {document.getElementById('searchInput').value='Alice';searchTable();});
  results.cases.desktopButtonIdentity=await page.evaluate(() => qaDesktopButton===document.querySelector('#scheduleTable .teacher-attendance-report-btn[data-student-name="Alice"]'));
  results.cases.desktopAttributes=await page.evaluate(() => JSON.stringify(qaDesktopAttrs)===JSON.stringify(Array.from(qaDesktopButton.attributes).map(a=>[a.name,a.value])));
  results.cases.enrollmentBadgesSurvive=await page.locator('#scheduleTable .enrollment-alert-badge').count()===2;
  await page.locator('#scheduleTable .teacher-attendance-report-btn[data-student-name="Alice"]').first().click();
  results.cases.desktopClick=await page.evaluate(()=>window.qaClickedName==='Alice');
  await page.screenshot({path:path.join(evidence,'desktop-search.png')});
  await page.evaluate(() => {document.getElementById('searchInput').value='';searchTable();});
  results.cases.desktopClear=await page.locator('#scheduleTable .teacher-attendance-report-btn').count()===3 && await page.locator('#scheduleTable .highlight-text').count()===0;
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    renderTable(lastData,true);
    window.qaMobileButton=document.querySelector('#teacherMobileList .teacher-attendance-report-btn[data-student-name="Alice"]');
    window.qaMobileAttrs=Array.from(qaMobileButton.attributes).map(a=>[a.name,a.value]);
    document.getElementById('searchInput').value='Alice';searchTable();
  });
  results.cases.mobileButtonIdentity=await page.evaluate(() => qaMobileButton===document.querySelector('#teacherMobileList .teacher-attendance-report-btn[data-student-name="Alice"]'));
  results.cases.mobileAttributes=await page.evaluate(() => JSON.stringify(qaMobileAttrs)===JSON.stringify(Array.from(qaMobileButton.attributes).map(a=>[a.name,a.value])));
  await page.locator('#teacherMobileList .teacher-attendance-report-btn[data-student-name="Alice"]').first().click();
  results.cases.mobileClick=await page.evaluate(()=>window.qaClickedName==='Alice');
  await page.screenshot({path:path.join(evidence,'mobile-search.png')});
  await page.evaluate(() => {document.getElementById('searchInput').value='';searchTable();openSelectionModal();document.getElementById('modalSearchInput').value='alice';filterStudentList();});
  await page.locator('.stu-chk').check();
  await page.evaluate(() => {document.getElementById('modalSearchInput').value='bob';filterStudentList();});
  await page.locator('.stu-chk').check();
  await page.evaluate(() => {document.getElementById('modalSearchInput').value='alice';filterStudentList();});
  results.cases.arrivalCheckboxPreserved=await page.locator('.stu-chk').isChecked();
  results.cases.arrivalBothRetained=await page.evaluate(() => selectedArrivalStudentNames.has('Alice')&&selectedArrivalStudentNames.has('Bob'));
  await page.screenshot({path:path.join(evidence,'arrival-selection.png')});
  await page.evaluate(() => generateSelectedMessage());
  results.cases.arrivalOutputIncludesBoth=await page.evaluate(() => document.getElementById('generatedMsg').value.includes('Alice, Bob'));
  await page.evaluate(() => {
    buildStudentImageMap();
    studentCardSentMap={Alice:{sent:false},Bob:{sent:false}};
    studentCardStatusLoading=false;
    filterStudentImageList();
    window.qaCardRequests=[];
    callServer=(method,args)=>new Promise((resolve,reject)=>qaCardRequests.push({method,args,resolve,reject}));
    markStudentCardSentStatus('Alice',true,{silent:true}).catch(()=>{});
    markStudentCardSentStatus('Bob',true,{silent:true});
  });
  results.cases.cardRowTogglesDisabled=await page.evaluate(() => Array.from(document.querySelectorAll('#studentImageList .student-list-toggle-btn')).every(button=>button.disabled));
  results.cases.cardSavesSerialized=await page.evaluate(()=>qaCardRequests.length===1&&!studentCardSentMap.Bob.sent);
  await page.evaluate(()=>qaCardRequests[0].reject(new Error('QA rollback')));
  await page.waitForFunction(()=>!studentCardStatusLoading);
  results.cases.cardFailureRollback=await page.evaluate(()=>!studentCardSentMap.Alice.sent);
  results.cases.cardRowTogglesReenabled=await page.evaluate(() => Array.from(document.querySelectorAll('#studentImageList .student-list-toggle-btn')).every(button=>!button.disabled));
  results.cases.noPageErrors=results.errors.length===0;
  fs.writeFileSync(path.join(evidence,'client-browser-results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  for(const [name,passed] of Object.entries(results.cases)) assert.equal(passed,true,name);
} finally {await browser.close();server.close();}
