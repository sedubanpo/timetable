const fs=require('node:fs'),http=require('node:http');
http.createServer((req,res)=>{
 const h=fs.readFileSync('Index.html','utf8');
 const funcs=h.slice(h.indexOf('      function escapeTeacherLogHtml('),h.indexOf('      function getCurrentReportHour('));
 const modal=h.slice(h.indexOf('    <dialog id="teacherViewLogModal"'),h.indexOf('    <div id="operationMemoModal">'));
 res.setHeader('Content-Type','text/html;charset=utf-8');
 res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${h.match(/<style>[\s\S]*?<\/style>/)[0]}<body><button onclick="openTeacherViewLogModal()">합성 대시보드 열기</button><p>UI 검증용 합성 데이터 · 운영 요청 없음</p>${modal}<script>
 var authState={loggedIn:true,isMaster:true,loginId:'synthetic-dashboard',dashboardAdminToken:'fixture'};
 var currentSheetName='9/30(수)',availableSheets=['9/28(월)','9/29(화)','9/30(수)'],SCHEDULE_START_HOUR=8,SCHEDULE_END_HOUR=23,clientCache={};
 var teacherViewLogsCache=[],teacherViewOverridesCache=[],teacherViewLogWeekIndex=0,teacherViewLogSelectedDateIndex=0,teacherDashboardActiveTab='log',teacherDashboardEditMode=false,teacherRoomStatsCache=null,teacherRoomStatsLoading=false,teacherRoomStatsPromise=null,teacherRoomStatsRequest=0,teacherRoomStatsContext='',teacherDashboardLogRequest=0,teacherDashboardReturnFocus=null,teacherDashboardStatusFilter='all',teacherDashboardHistoryDate='',teacherDashboardBuilding='all',teacherDashboardRoomSort='hours';
 var names=['강가람','김하늘','김여름','문다온','박지음','서이든','송라온','오지안','윤서우','이도담','이로운','정해솔','최다솜','한마루'];
 var lastData={headers:['1강의실','2강의실','2관 1강의실','3관 1강의실'],grid:{}};
 for(var hour=11;hour<23;hour++)lastData.grid[hour]=Array.from({length:4},(_,i)=>[names[(hour+i)%names.length]+'T','합성 학생']);
 function getScheduleSessionKey(){return 'fixture';}function getActiveTeacherName(){return '';}function getAdminSelectedTeacher(){return '';}
 function isTeacherHeader(s){return s.endsWith('T');}function extractTeacherName(s){return s.replace(/T$/,'');}function withDashboardAdminSession(fn){return fn('fixture');}
 var logs=[];availableSheets.forEach((sheet,di)=>names.slice(0,11).forEach((name,i)=>{for(var n=0;n<(i%5)+1;n++)logs.push({teacherName:name,sheetName:sheet,viewedAt:'2026-09-29 '+String(14+i%9).padStart(2,'0')+':'+String(n*11).padStart(2,'0')+':00',loginId:'fixture'});}));
 async function callServer(name,args){await new Promise(r=>setTimeout(r,120));if(name==='getTeacherViewLogs')return logs;if(name==='getTeacherViewOverrides')return [];if(name==='getFixedGridData')return lastData;if(name==='setTeacherViewOverride')return {ok:true};throw Error('Unknown fixture request');}
 ${funcs}
 openTeacherViewLogModal();
 </script></body></html>`);
}).listen(4192,'127.0.0.1',()=>console.log('Synthetic teacher dashboard: http://127.0.0.1:4192'));
