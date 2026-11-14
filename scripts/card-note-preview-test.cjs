const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
for(const file of ['Index.html','docs/index.html']){
 const source=fs.readFileSync(file,'utf8');
 const extract=name=>{const start=source.indexOf('      function '+name+'('),end=source.indexOf('\n      function ',start+1);assert(start>=0,name);return source.slice(start,end);};
 const rows=[12,13].map(hour=>({hour,subject:'수학',teacher:'검증',room:'1강의실',classType:'개별',note:'12:30-14:30 내부 메모'}));
 const scope={TimetableAlimtalk:require("../assets/alimtalk-contract"),console,Set,Map,Date,Promise,previewNoteDrafts:Object.create(null),currentSheetName:'9/21',getScheduleSessionKey:()=> 'test',studentCardHideNote:false,studentImageScheduleMap:{검증학생:rows}};
 vm.createContext(scope);
 ['attendanceDateKey','previewNoteKey','previewNoteValue','previewNoteHidden','getExportTimeRange','getCardNoteTimeRange','formatCardHour','buildStudentCardViewModel'].forEach(n=>vm.runInContext(extract(n),scope));
 let model=scope.buildStudentCardViewModel('검증학생');
 assert.equal(model.timelineRows[0].start,12.5);assert.equal(model.timelineRows[0].end,14.5);assert.equal(scope.formatCardHour(12.5),'12:30');
 scope.studentCardHideNote=true;model=scope.buildStudentCardViewModel('검증학생');assert.equal(model.timelineRows[0].note,'');assert.equal(model.timelineRows[0].end,14.5);
 const key=scope.previewNoteKey('card','검증학생',rows[0]);
 scope.previewNoteDrafts[key]={text:'12:30-14:00 안내',hidden:true};
 model=scope.buildStudentCardViewModel('검증학생');assert.equal(model.timelineRows[0].end,14.5,'unchanged second interval still ends at 14:30');assert.equal(model.timelineRows[0].note,'');assert.match(rows[0].note,/내부 메모/);
 for(const note of ['도착 12:30','12:30-14:30 / 13:00-14:00','12:99-14:30','18:30-20:30']){const r=scope.getCardNoteTimeRange({start:12,end:14,note});assert.equal(r.start,12,note);assert.equal(r.end,14,note);}
 assert.equal(scope.getCardNoteTimeRange({start:14,end:17,note:'2:30 - 5:00 선생님톡 확인'}).start,14.5);
 assert.equal(scope.getExportTimeRange({start:12,end:14,note:'12:30-14:30'}).end,14,'Excel strict bounds unchanged');
 const cutoff={start:16,end:17,note:'11/7(토), 16:30까지 보강',status:'결석보강'};
 assert.equal(scope.getCardNoteTimeRange(cutoff).end,16.5);
 assert.equal(scope.getCardNoteTimeRange({...cutoff,status:'정규'}).end,17);
 const social=[13,14,15].map(hour=>({hour,subject:'사탐',teacher:'검증',room:'6강의실',classType:'개별',
   school:'검증고3',status:hour===15?'보충':'정규',note:hour===15?'확정, 3:00-3:30':'확정'}));
 scope.studentImageScheduleMap['정규보충검증']=social;
 const lessons=Array.from(scope.buildStudentCardViewModel('정규보충검증').timelineRows,r=>[r.start,r.end,r.status]);
 assert.deepEqual(lessons,[[13,15,'정규'],[15,15.5,'보충']]);
 // Exercise the raw grid entry (the status parser otherwise consumes the word 보강 at the end of the note).
 Object.assign(scope,{currentSheetName:'11/7(토)',SCHEDULE_START_HOUR:16,SCHEDULE_END_HOUR:16,lastData:{headers:['스터디카페'],grid:{
   16:[['1:1 과학 검증T','검증학생 가상초5 결석보강 11/7(토), 16:30까지 보강']]
 }}});
 for(const n of ['getSubjectName','extractTeacherName','isTeacherHeader','detectClassType','detectStudentCardClassType','detectStudentStatus','detectStudentStatusFromTokens','normalizeNoticeText','normalizeStatusLabel','parseStudentRawText','buildStudentImageMap']){
   vm.runInContext(extract(n),scope);
 }
 scope.buildStudentImageMap();
 const makeup=scope.buildStudentCardViewModel('검증학생').timelineRows[0];
 assert.equal(makeup.status,'결석보강');assert.equal(makeup.end,16.5);assert.match(makeup.timeNote,/16:30까지 보강/);
 // The real frontend parser retains attendance details but schedule grouping uses the source status.
 for(const status of ['정규','지각','보충','첫수업','신규생']){
  Object.assign(scope,{SCHEDULE_START_HOUR:10,SCHEDULE_END_HOUR:11,lastData:{headers:['1강의실'],grid:{
   10:[['개별 국어 검증T','검증학생 가상중3 '+status+' 지각, 10:11 도착']],
   11:[['개별 국어 검증T','검증학생 가상중3 '+(status==='지각'?'정규':status)]]
  }}});
  scope.buildStudentImageMap();
  const scheduled=scope.buildStudentCardViewModel('검증학생').timelineRows;
  assert.equal(scheduled.length,1,status);assert.equal(scheduled[0].start,10);assert.equal(scheduled[0].end,12);
  assert.equal(scheduled[0].status,status==='지각'?'정규':status);
  assert.equal(scope.TimetableAlimtalk.lessonStatusLabel(scheduled[0].status,false),status==='지각'?'정규':status);
 }
 assert.equal(scope.parseStudentRawText('검증학생 가상중3 정규 지각, 10:11 도착').status,'지각','live attendance still shows lateness');
 for(const label of ['고3@','재수','재수1','재수2','교육청']){
  scope.SCHEDULE_START_HOUR=10;scope.SCHEDULE_END_HOUR=12;
  scope.lastData={headers:['1강의실'],grid:{}};
  for(let h=10;h<13;h++)scope.lastData.grid[h]=[['개별 수학 검증T','검증학생 '+label+' 정규 10/31(토) 확정 10:30–12:00']];
  scope.buildStudentImageMap();
  const rows=scope.buildStudentCardViewModel('검증학생').timelineRows;
  assert.equal(rows.length,1);assert.equal(rows[0].school,'재수생');assert.equal(rows[0].start,10);assert.equal(rows[0].end,13);
  scope.lastData.grid[12][0][1]='검증학생 '+label+' 정규 11/7(토) 확정, 10:30–13:00';
  scope.buildStudentImageMap();assert.equal(scope.buildStudentCardViewModel('검증학생').timelineRows[0].start,10.5);
 }
 scope.currentSheetName='9/22';assert.match(scope.previewNoteValue('card','검증학생',rows[0]),/내부 메모/);
 assert.match(source,/onclick="downloadAbsenceNoticeImage\(\)">이미지 저장<\/button>\s*<button[^>]+onclick="copyAbsenceNoticeImage\(\)">이미지 복사/);
 assert.match(source,/previewNoteHidden\("absence",name,v\)/);
 console.log(file+': half-hour shift, hidden-note time, temporary edits, source preservation, date isolation, ambiguous fallback, strict Excel isolation PASS');
}

// Headers with notes use the same strict grammar on both browser mirrors and the server.
for(const file of ['Index.html','docs/index.html']){
 const source=fs.readFileSync(file,'utf8'),start=source.indexOf('      function isTeacherHeader('),end=source.indexOf('\n      function ',start+1);
 const scope={TimetableAlimtalk:require('../assets/alimtalk-contract')};vm.createContext(scope);vm.runInContext(source.slice(start,end),scope);
 assert.equal(scope.isTeacherHeader('수학 개별 검증T , 15일만 18시까지 수업 가능'),true);
 assert.equal(scope.isTeacherHeader('검증학생 가상중2 정규 검증T , 18시까지'),false);
}
