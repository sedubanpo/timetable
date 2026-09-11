#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'Index.html'),'utf8');
const baseline=process.argv.includes('--baseline');
// Extract real production functions at their top-level indentation boundary.
function extract(name){const start=source.indexOf('      function '+name+'(');assert(start>=0,name);const next=source.indexOf('\n      function ',start+1);const scriptEnd=source.indexOf('</script>',start);return source.slice(start,next<0?scriptEnd:Math.min(next,scriptEnd));}
let rows=[];
const context={SCHEDULE_START_HOUR:8,SCHEDULE_END_HOUR:23,currentSheetName:'9/8(화)',
  alert:message=>{throw Error(message);},
  extractTeacherName:text=>text.split('|')[1],getSubjectName:text=>text.split('|')[2],getTypeBadgeText:text=>text.split('|')[3],
  parseStudentRawText:text=>{const [name,school,status,note]=text.split('|');return {name,school,status,note,full:school};},
  shouldHideStatus:()=>false,normalizeStatusLabel:value=>value,
  XLSX:{utils:{json_to_sheet:value=>{rows=value;return {'!ref':'A1:J9'};},book_new:()=>({}),book_append_sheet:()=>{}},writeFile:()=>{}}
};
vm.createContext(context);
for(const name of ['normalizeSchoolNameForExport','normalizeExportClassType','mapExportAttendanceStatus','buildExportClassName','getExportTimeRange','formatTime','exportScheduleToExcel'])vm.runInContext(extract(name),context);
function run(entries){
  const rooms=[...new Set(entries.map(e=>e.room||'1강의실'))];const grid={};
  for(const e of entries){const hour=e.hour;grid[hour]??=rooms.map(()=>[]);const cell=grid[hour][rooms.indexOf(e.room||'1강의실')];cell.push(`T|${e.teacher||'검증강사'}|${e.subject||'수학'}|${e.type||'개별'}`,`${e.name||'검증학생'}|${e.school||'검증중2'}|${e.status||'출석'}|${e.note||''}`);}
  context.lastData={headers:rooms,grid};rows=[];vm.runInContext('exportScheduleToExcel()',context);return rows.filter(r=>r['이름']);
}
const results={};
let output=run([{hour:18,note:'교재 지참'},{hour:19,note:'숙제 확인'},{hour:20,note:'교재 지참'}]);
results.notesDoNotSplit=output.length===1&&output[0]['시간']===3;
results.allDistinctNotesPreserved=output.length===1&&output[0]['참고'].includes('교재 지참')&&output[0]['참고'].includes('숙제 확인')&&output[0]['참고'].split('교재 지참').length===2;
output=run([{hour:18,status:'지각',note:'10분 지각'},{hour:19,status:'출석'}]);
results.lateAttendanceMerges=output.length===1&&output[0]['시간']===2;
results.latenessPreserved=output.length===1&&(output[0]['출결'].includes('지각')||output[0]['참고'].includes('지각'));
output=run([{hour:18},{hour:19,status:'당일취소'},{hour:20}]);
results.cancellationSeparated=output.length===3&&output[1]['출결']==='당일취소';
output=run([{hour:18},{hour:19,status:'결석예고'}]);results.absenceSeparated=output.length===2;
output=run([{hour:18},{hour:20}]);results.gapSeparated=output.length===2;
output=run([{hour:18,room:'1강의실'},{hour:19,room:'2강의실'}]);results.roomBoundarySeparated=output.length===2;
output=run([{hour:18,school:'가중2'},{hour:19,school:'나중2'}]);results.schoolIdentitySeparated=output.length===2;
for(const key of ['teacher','subject','type']){output=run([{hour:18},{hour:19,[key]:'다른값'}]);results[`${key}IdentitySeparated`]=output.length===2;}
output=run([{hour:8},{hour:9},{hour:22},{hour:23}]);results.timeBoundaries=output.length===2&&output.every(r=>r['시간']===2)&&output[1]['종료']==='오전 12:00';
for (const [label,note,start,end,hours] of [
 ['halfHourBoth','9/11(금) 확정, 3:30-5:30','오후 3:30','오후 5:30',2],
 ['explicitPeriod','오후 3:30 ~ 오후 5:30','오후 3:30','오후 5:30',2],
 ['arrivalOnly','지각 5:14','오후 3:00','오후 6:00',3],
 ['invalidMinutes','15:14-17:30','오후 3:00','오후 6:00',3],
 ['outsideBlock','19:30-22:00','오후 3:00','오후 6:00',3],
 ['conflicting','15:30-17:30 / 15:30-18:00','오후 3:00','오후 6:00',3]
]) {
 output=run([{hour:15,note},{hour:16},{hour:17}]);
 results[label]=output.length===1&&output[0]['시작']===start&&output[0]['종료']===end&&output[0]['시간']===hours&&output[0]['참고']===note;
}
output=run([{hour:19,note:'9/11(금) 확정, 19:30-22:00'},{hour:20},{hour:21}]);
results.halfHourStart=output.length===1&&output[0]['시작']==='오후 7:30'&&output[0]['종료']==='오후 10:00'&&output[0]['시간']===2.5;
console.log(JSON.stringify({baseline,results},null,2));
if(!baseline)for(const [name,passed]of Object.entries(results))assert.equal(passed,true,name);
