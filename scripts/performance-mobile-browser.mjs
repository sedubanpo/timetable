// Local actual-source fixture for in-app browser performance checks. No live services.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = `<script>
addEventListener('load', function() {
  authState = {loggedIn:true,isMaster:false,isLookup:false,loginId:'qa',teacherName:'검증강사'};
  accessMode='teacher';
  var now=new Date(); currentSheetName=(now.getMonth()+1)+'/'+now.getDate()+'(검증)';
  document.getElementById('mainPage').style.display='flex';
  document.getElementById('loginGate').style.display='none';
  document.body.classList.add('teacher-mode');
  document.getElementById('mainSheetSelector').innerHTML='<option>'+currentSheetName+'</option>';
  var data={headers:['1강의실','2강의실','휴강 명단','원장실'],grid:{},version:'qa-mobile'};
  for(var h=9;h<=23;h++) data.grid[h]=[['개별 수학 검증강사T','Alice 검증중2'],['정규 영어 검증강사T','Bob 검증고1'],[],[]];
  lastData=data;
  var originalCreate=document.createElement.bind(document), originalRender=renderTable;
  var counts={},renders=0;
  document.createElement=function(tag,options){counts[tag]=(counts[tag]||0)+1;return originalCreate(tag,options)};
  var output=document.createElement('pre');output.id='qaMobileMetrics';
  function report(){output.textContent=JSON.stringify({width:innerWidth,counts:counts,renders:renders,desktop:document.querySelectorAll('#scheduleTable *').length,mobile:document.querySelectorAll('#teacherMobileList *').length,tableDisplay:document.getElementById('scheduleTable').style.display,mobileDisplay:document.getElementById('teacherMobileList').style.display,timelineDisplay:document.getElementById('liveTimeline').style.display,search:document.getElementById('searchInput').value,scroll:document.getElementById('tableContainer').scrollTop,privacy:document.body.classList.contains('privacy-active'),selected:selectedTimetableStudent,userAgent:navigator.userAgent,platform:navigator.platform,dpr:devicePixelRatio,language:navigator.language});}
  renderTable=function(){counts={};renders++;var result=originalRender.apply(this,arguments);setTimeout(report,40);return result;};
  var controls=document.createElement('section');controls.id='qaMobileControls';
  function button(label,fn){var b=document.createElement('button');b.textContent=label;b.onclick=function(){fn();report()};controls.appendChild(b);}
  button('QA refresh',function(){renderTable(lastData,true)});
  button('QA change data',function(){lastData.grid[18][0]=['개별 수학 검증강사T','Carol 검증중3'];lastData.version='qa-changed';renderTable(lastData,true)});
  button('QA simple view',function(){toggleTeacherMobileSimpleView()});
  button('QA privacy',function(){togglePrivacy()});
  button('QA scroll',function(){document.getElementById('tableContainer').scrollTop=300});
  button('QA report',report);
  button('QA enrollment',function(){Object.assign(studentEnrollmentStatusState,buildEnrollmentStatusIndex([{studentId:'qa-alice',studentName:'Alice',school:'검증중2',status:'ACTIVE'},{studentId:'qa-bob',studentName:'Bob',school:'검증고1',status:'INACTIVE'}]));renderTable(lastData,true)});
  controls.appendChild(output);document.body.insertBefore(controls,document.body.firstChild);
  renderTable(lastData,true);
});
</script>`;
const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'");
  res.end(fs.readFileSync(path.join(root,'Index.html'),'utf8').replace('</body>',fixture+'</body>'));
});
server.listen(Number(process.env.PORT||4179),'127.0.0.1',()=>console.log('Mobile fixture http://127.0.0.1:'+server.address().port));
