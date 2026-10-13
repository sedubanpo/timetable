const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
for(const file of ['Index.html','docs/index.html']){
const source=fs.readFileSync(file,'utf8');for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
const ctx={lastData:{headers:['1강의실'],grid:{12:[['수학 A 1:1','학생1 정규','학생2 결석예고']],13:[[]],14:[[]],15:[['영어 B 개별','학생3 정규']]}},SCHEDULE_END_HOUR:23,isTeacherHeader:s=>/수학|영어/.test(s),parseStudentRawText:s=>({name:s.split(' ')[0],school:'중1',status:s.split(' ')[1]}),shouldHideStatus:s=>s==='휴강'||s==='당일취소',isAbsenceNoticeStatus:s=>s==='결석예고',Date:class extends Date{getHours(){return 12}},escapeHtml:s=>s,extractTeacherName:s=>s.split(' ')[1],detectClassType:s=>s.split(' ')[2]};vm.createContext(ctx);
for(const name of ['visitorTeacherKey','visitorRoomState','visitorRoomNotice','visitorStudyUntil']){const a=source.indexOf('      function '+name+'('),b=source.indexOf('\n      function ',a+1);vm.runInContext(source.slice(a,b),ctx);}
assert.equal(ctx.visitorRoomState('1강의실',12).count,1);
assert.equal(ctx.visitorStudyUntil('1강의실',13).hour,15);
assert.equal(ctx.visitorStudyUntil('1강의실',13).known,true);
assert.match(ctx.visitorRoomNotice({room:'1강의실',hour:15,teacher:'B'}),/입실 전 대기/);
assert.match(ctx.visitorRoomNotice({room:'1강의실',hour:15,teacher:'A'}),/입실 전 대기/);
assert.match(ctx.visitorRoomNotice({room:'1강의실',hour:12,teacher:'A'}),/입실 전 선생님/);
assert.equal(ctx.visitorStudyUntil('1강의실',15).known,false);
ctx.lastData=null;assert.equal(ctx.visitorRoomState('1강의실',12),null);
console.log(file+': occupancy exclusions, preceding class, same-teacher class, next lesson and missing data passed');
}
