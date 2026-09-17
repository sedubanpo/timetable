// Local-only synthetic UI fixture. Uses production CSS, toolbar and inbox markup.
const http = require('node:http');
const {extract,reports,source,names} = require('./toolbar-attendance-test.cjs');
const css = source.match(/<style>([\s\S]*?)<\/style>/)[1];
const toolbar = source.slice(source.indexOf('<div id="mainPage">'),source.indexOf('<div id="operationCommonMemoStrip"'));
// Find the next top-level modal/main block rather than duplicate its layout.
const inboxStart = source.indexOf('    <div id="attendanceInboxModal"');
const inboxEnd = source.indexOf('\n    <div ',inboxStart+10);
const inbox = source.slice(inboxStart,inboxEnd);
const runtime = names.concat(['attendanceStatusMeta','attendanceStatusBadgeHtml','attendanceTeacherTone','attendanceTeacherLabelHtml','attendanceAvatarHtml','attendanceSchoolGrade','attendanceStateLabel','formatAttendanceDateTime','renderAttendanceInbox','renderAttendanceInboxDatabase','reconcileAttendanceChat','openAttendanceDialog','closeAttendanceDialog','closeAttendanceInbox','handleAttendanceDialogKeydown']).map(extract).join('\n');
const homeGate = source.slice(source.indexOf('    <div id="loginGate">'),source.indexOf('    <div id="mobileLoading">'));
const body = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic toolbar QA</title><style>${css}</style><style>#mainPage{display:flex!important}.fixture-controls{padding:8px;background:#eef2ff;display:flex;gap:8px;flex-wrap:wrap}.fixture-controls button{min-height:32px}#scheduleTable{width:100%;min-width:1100px}#scheduleTable td{height:90px}#scheduleTable th{background:#0f1746;color:white}.logo-img{display:none}</style><div class="fixture-controls"><b>합성 데이터 QA · 외부 연결 없음</b><button onclick="fixture('stress')">45건 스트레스</button><button onclick="fixture('empty')">빈 상태</button><button onclick="fixture('error')">오류</button><button onclick="fixture('privacy')">보안 전환</button></div>${toolbar}<div class="table-container" id="tableContainer"><div id="liveTimeline" style="display:block;top:120px" data-time="13:00"></div><table id="scheduleTable"><thead><tr>${Array.from({length:15},(_,i)=>'<th>'+(i+1)+'강의실</th>').join('')}</tr></thead><tbody>${Array.from({length:6},()=>'<tr>'+Array.from({length:15},()=>'<td><div class="student-item is-teacher">과학 · 테스트강사T</div><div class="student-item is-student">가상학생 · 정규</div></td>').join('')+'</tr>').join('')}</tbody></table></div></div>${inbox}<div id="teacherAttendanceComposerModal" style="display:none"></div><script>
var authState={loggedIn:true,isLookup:false};var attendanceRealtimeState={firebaseAdmin:true,reports:[],loading:false,error:''};var attendanceWindowRenderKey='',attendanceWindowReports=null,attendanceInboxView='chat',attendanceInboxSelectedDateKey='',attendanceInboxDateStripInitialized=false,attendanceLastFocusedElement=null;var attendanceReplyEditors=new Map();
function escapeHtml(v){return String(v||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function renderAttendanceInboxDateNav(){} function renderAttendanceInboxDatabase(){} function refreshAttendanceInbox(){} function saveAttendanceInboxReply(){} function openAttendanceInbox(){if(attendanceRealtimeState.reports[0])openAttendanceWindowDetail(attendanceRealtimeState.reports[0].__id);} function setAttendanceInboxView(){attendanceInboxView='chat';renderAttendanceInbox();} function togglePrivacy(){document.body.classList.toggle('privacy-active');renderAttendanceWindow(true);} function toggleTimeline(){document.getElementById('liveTimeline').style.display=document.getElementById('timelineToggle').checked?'block':'none';} function filterTable(){} function toggleDimming(){} function toggleHide9(){}
${runtime}
document.body.insertAdjacentHTML('beforeend',${JSON.stringify(homeGate)});
document.getElementById('loginGate').style.display='none';
var pollingTimer=null;
${source.match(/^      function goHome\(\).*$/m)[0]}
function checkVisitorLookupDateRollover(){} function updateTimelinePosition(){}
${source.match(/^      function updateClock\(\).*$/m)[0]}
${source.match(/^      function navigateDay\(.*$/m)[0]}
var fixtureDate=new Date(),fixtureDateKey=(fixtureDate.getMonth()+1)+'-'+fixtureDate.getDate();
function getNavigableSheetNames(){return ['내일','오늘','어제'];}
function getCalendarSheetMap(){return {[fixtureDateKey]:['오늘']};}
function getPreferredSheetNameForDate(){return '오늘';}
function loadData(name){document.getElementById('mainSheetSelector').value=name;document.getElementById('calendarTrigger').textContent=name+' 선택됨';}
document.getElementById('mainSheetSelector').innerHTML='<option>내일</option><option selected>오늘</option><option>어제</option>';
${['refreshAttendanceMessages','refreshAttendanceInbox'].map(extract).join('\n')}
var attendanceConnectionSequence=1;attendanceRealtimeState.uid='fixture-admin';attendanceRealtimeState.mode='admin';
function getLiveFirebaseFirestore(){return Promise.resolve({});}
function buildAttendanceReportsQuery(){return {get(options){document.getElementById('fixtureRefreshCount').textContent='출결 조회 '+(++fixtureReads)+'회 · '+options.source;return Promise.resolve({});}};}
function applyAttendanceReportsSnapshot(){attendanceRealtimeState.loading=false;attendanceRealtimeState.error='';renderAttendanceInbox();}
var fixtureReads=0;const refreshCount=document.createElement('output');refreshCount.id='fixtureRefreshCount';refreshCount.textContent='출결 조회 0회';document.querySelector('.fixture-controls').appendChild(refreshCount);
const synthetic=${JSON.stringify(reports(new Date()).map((item,i)=>({...item,reporterName:'검증'+String(i%15+1).padStart(2,'0')+'T'})))};function fixture(mode){attendanceRealtimeState.error=mode==='error'?'offline':'';attendanceRealtimeState.reports=mode==='empty'?[]:synthetic;if(mode==='privacy')document.body.classList.toggle('privacy-active');renderAttendanceWindow(true);}
document.querySelectorAll('.top-bar button[style*="display:none"]').forEach(el=>el.style.display='');
document.getElementById('teacherLoginBtn').style.display='none';
document.getElementById('teacherLogoutBtn').style.display='';
document.getElementById('roleBadge').style.display='';
document.getElementById('roleBadge').textContent='관리자·전체 모드';
document.getElementById('teacherPicker').hidden=false;
document.getElementById('calendarTrigger').textContent='9/17(목) ▾';
updateClock();
const metrics=document.createElement('output');metrics.id='fixtureMetrics';metrics.setAttribute('aria-label','합성 화면 검증 수치');metrics.style.cssText='flex-basis:100%;font:11px monospace;white-space:normal';document.querySelector('.fixture-controls').appendChild(metrics);
function updateFixtureMetrics(){
 const y=selector=>{const el=document.querySelector(selector);return el?Math.round(el.getBoundingClientRect().top):'-';};
 const active=document.activeElement;const focused=active&&active.closest('[data-attendance-report-id]');
 metrics.textContent='viewport='+document.documentElement.clientWidth+' scrollWidth='+document.documentElement.scrollWidth+' | topY clock:'+y('#digitalClock')+' refresh:'+y('.refresh-btn')+' icons:'+y('.primary-actions')+' | row2Y search:'+y('#searchInput')+' summary:'+y('#attendanceWindow')+' actions:'+y('.action-group')+' | chips='+document.querySelectorAll('.attendance-window-chip').length+' | focusedReport='+(focused?focused.getAttribute('data-attendance-report-id'):'none');
 const row=document.querySelector('.toolbar-first-row');metrics.textContent+=' | toolbarWidth='+row.clientWidth+' contentWidth='+row.scrollWidth;
}
document.addEventListener('keydown',handleAttendanceDialogKeydown);fixture('stress');requestAnimationFrame(updateFixtureMetrics);window.addEventListener('resize',()=>requestAnimationFrame(updateFixtureMetrics));document.addEventListener('click',()=>requestAnimationFrame(updateFixtureMetrics));document.addEventListener('focusin',()=>requestAnimationFrame(updateFixtureMetrics));
</script></html>`;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const width=Math.min(2560,Math.max(320,Number(url.searchParams.get('width'))||1280));
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src 'none'; frame-src 'self'"});
  res.end(url.pathname==='/frame'?`<!doctype html><html lang="ko"><title>Responsive fixture ${width}</title><body style="margin:0"><iframe title="${width}px synthetic timetable" src="/?stress=1" style="display:block;border:0;width:${width}px;height:850px"></iframe></body></html>`:body);
});
server.listen(Number(process.env.PORT||4178),'127.0.0.1',()=>console.log('Synthetic toolbar fixture: http://127.0.0.1:'+server.address().port));
