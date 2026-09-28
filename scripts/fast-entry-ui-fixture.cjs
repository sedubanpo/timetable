// Synthetic only: origin never resolves, while real startup/calendar helpers remain usable.
const fs=require('node:fs'),http=require('node:http');
http.createServer((req,res)=>{
  const source=fs.readFileSync('Index.html','utf8');
  const intro=source.slice(source.indexOf('    <div id="introPage">'),source.indexOf('    <div id="introPage">')+source.slice(source.indexOf('    <div id="introPage">')).indexOf('\n'));
  const script=fs.readFileSync('scripts/fast-entry.fragment.js','utf8');
  const init=source.slice(source.indexOf('      function initApp('),source.indexOf('      function getTeacherViewAuditRequest('));
  const build=source.slice(source.indexOf('      function buildSheetMapFromNames('),source.indexOf('      function getTodaySheetNameFromMap('));
  const d=new Date(),prefix=(d.getMonth()+1)+'/'+d.getDate(),sheet=prefix+'('+['일','월','화','수','목','금','토'][d.getDay()]+')';
  res.setHeader('Content-Type','text/html;charset=utf-8');
  res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+source.match(/<style>[\s\S]*?<\/style>/)[0]+intro+'<div id="mainPage"></div><script>'+build+script+init+`
    var authState={loggedIn:true,loginId:'synthetic',isLookup:false},availableSheets=[],sheetNamesLoaded=false,currentSheetName='',sheetMap={},currentDate=new Date(),teacherCalendarRequestId=0,scheduleLoadSequence=0;
    function getScheduleSessionKey(){return 'synthetic';}function loadSheetNamesCache(){return [];}function saveSheetNamesCache(){}function populateMainSheetSelector(){}function calendarSync(){}function applyRoleUi(){}function isLookupViewActive(){return false;}function isTeacherViewActive(){return true;}function getCalendarSheetMap(){return sheetMap;}function callServer(){return new Promise(()=>{});}function snapshotRequest(){return new Promise(()=>{});}
    function loadData(name){document.getElementById('calendarLoadStatus').textContent=name+' · 백업 시간표 조회 시작 (원본 응답은 대기 중)';}
    rememberTimetableBootstrap({loginId:'synthetic',startupSheets:${JSON.stringify([sheet])}});startAppAfterAuth();
  </script></html>`);
}).listen(4192,'127.0.0.1',()=>console.log('Fast entry fixture http://127.0.0.1:4192'));
