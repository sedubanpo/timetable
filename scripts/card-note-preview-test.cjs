const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
for(const file of ['Index.html','docs/index.html']){
 const source=fs.readFileSync(file,'utf8');
 const extract=name=>{const start=source.indexOf('      function '+name+'('),end=source.indexOf('\n      function ',start+1);assert(start>=0,name);return source.slice(start,end);};
 const rows=[12,13].map(hour=>({hour,subject:'수학',teacher:'검증',room:'1강의실',classType:'개별',note:'12:30-14:30 내부 메모'}));
 const scope={console,Set,Map,Date,Promise,previewNoteDrafts:Object.create(null),currentSheetName:'9/21',getScheduleSessionKey:()=> 'test',studentCardHideNote:false,studentImageScheduleMap:{검증학생:rows}};
 vm.createContext(scope);
 ['previewNoteKey','previewNoteValue','previewNoteHidden','getExportTimeRange','getCardNoteTimeRange','formatCardHour','buildStudentCardViewModel'].forEach(n=>vm.runInContext(extract(n),scope));
 let model=scope.buildStudentCardViewModel('검증학생');
 assert.equal(model.timelineRows[0].start,12.5);assert.equal(model.timelineRows[0].end,14.5);assert.equal(scope.formatCardHour(12.5),'12:30');
 scope.studentCardHideNote=true;model=scope.buildStudentCardViewModel('검증학생');assert.equal(model.timelineRows[0].note,'');assert.equal(model.timelineRows[0].end,14.5);
 const key=scope.previewNoteKey('card','검증학생',rows[0]);
 scope.previewNoteDrafts[key]={text:'12:30-14:00 안내',hidden:true};
 model=scope.buildStudentCardViewModel('검증학생');assert.equal(model.timelineRows[0].end,14);assert.equal(model.timelineRows[0].note,'');assert.match(rows[0].note,/내부 메모/);
 for(const note of ['도착 12:30','12:30-14:30 / 13:00-14:00','12:99-14:30','18:30-20:30']){const r=scope.getCardNoteTimeRange({start:12,end:14,note});assert.equal(r.start,12,note);assert.equal(r.end,14,note);}
 assert.equal(scope.getCardNoteTimeRange({start:14,end:17,note:'2:30 - 5:00 선생님톡 확인'}).start,14.5);
 assert.equal(scope.getExportTimeRange({start:12,end:14,note:'12:30-14:30'}).end,14,'Excel strict bounds unchanged');
 scope.currentSheetName='9/22';assert.match(scope.previewNoteValue('card','검증학생',rows[0]),/내부 메모/);
 assert.match(source,/onclick="downloadAbsenceNoticeImage\(\)">이미지 저장<\/button>\s*<button[^>]+onclick="copyAbsenceNoticeImage\(\)">이미지 복사/);
 assert.match(source,/previewNoteHidden\("absence",name,v\)/);
 console.log(file+': half-hour shift, hidden-note time, temporary edits, source preservation, date isolation, ambiguous fallback, strict Excel isolation PASS');
}
