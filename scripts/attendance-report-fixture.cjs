const fs=require('node:fs'),http=require('node:http');
http.createServer((req,res)=>{
 const h=fs.readFileSync('docs/index.html','utf8');
 const funcs=h.slice(h.indexOf('      function getCurrentReportHour('),h.indexOf('      function isTeacherHeader('));
 const modal=h.slice(h.indexOf('    <div id="attendanceReportModal"'),h.indexOf('    <div id="teacherAttendanceComposerModal"'));
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>출결 보고 · 합성 데이터 검증</title>${h.match(/<style>[\s\S]*?<\/style>/)[0]}<body><button onclick="openAttendanceReportModal()">합성 출결 보고 열기</button><p>UI 검증용 합성 데이터 · 운영 요청 없음</p>${modal}<script src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script><script>
 var attendanceReportPayload=null,currentAttendanceReportText='',attendanceReportHourOffset=0,attendanceReportHideResolved=false,attendanceReportTextMode='simple';
 var currentSheetName='10/3(토)',SCHEDULE_START_HOUR=20,SCHEDULE_END_HOUR=21;
 var lastData={headers:['1강의실','2강의실','3관 1강의실'],grid:{20:[['개별 영어 가상강사T','서하늘|반포고2|지각|10/3(토) 확정, 곧 등원 예정','김가람|서초고2|정규|','최다온|서초고2|결석예고|개인 일정으로 결석예고'],['1:1 수학 예시강사T','윤여름|서문여고2|결석예고|개인 일정으로 결석예고'],['개별 사회 테스트강사T','이도담|세화고1|당일취소|발열로 오늘 수업에 참여하기 어렵습니다.']],21:[['개별 영어 가상강사T','서하늘|반포고2|지각|10/3(토) 확정, 곧 등원 예정','김가람|서초고2|정규|','최다온|서초고2|결석예고|개인 일정으로 결석예고'],['1:1 수학 예시강사T','윤여름|서문여고2|결석예고|개인 일정으로 결석예고'],['개별 사회 테스트강사T','이도담|세화고1|당일취소|발열로 오늘 수업에 참여하기 어렵습니다.']]}};
 function getScheduleSessionKey(){return 'synthetic';}function normalizeStatusLabel(x){return x;}function isTeacherHeader(x){return x.endsWith('T');}function getSubjectName(x){return x.split(' ')[1];}function extractTeacherName(x){return x.split(' ')[2].replace(/T$/,'');}function detectClassType(x){return x.split(' ')[0];}function parseStudentRawText(x){var a=x.split('|');return {name:a[0],school:a[1],status:a[2],note:a[3]};}function renderExportCanvas(el,opts){return html2canvas(el,opts);}
 ${funcs}
 openAttendanceReportModal();
 </script></body></html>`);
}).listen(4194,'127.0.0.1',()=>console.log('Synthetic attendance report: http://127.0.0.1:4194'));
