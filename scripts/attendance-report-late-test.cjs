const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');

for (const file of ['Index.html','docs/index.html']) {
  // Use the production grid parser: a normalized status (당취보충 → 보충)
  // must consume the status cell so later words such as 지각 stay in the note.
  const a=fs.readFileSync(file,'utf8');
  const scope = vm.createContext({
    TimetableAlimtalk: require('../assets/alimtalk-contract'),
    currentSheetName: '11/14(토)', SCHEDULE_START_HOUR: 10, SCHEDULE_END_HOUR: 10,
    attendanceReportHourOffset: 0, attendanceReportHiddenStatuses: new Set(), getScheduleSessionKey: () => "test"
  });
  const note = '11/14(토) 수업은 10/31(토) 당취에 대한 보충, 10분 지각 예정';
  const raw = '검증학생b 가상고3 당취보충 ' + note;
  scope.lastData = {headers:['3관 1강의실'],grid:{10:[['개별 사회 검증T', raw, '다른학생 가상고3 정규']]}};
  for (const name of ['isTeacherHeader','getSubjectName','extractTeacherName','detectClassType',
    'detectStudentStatusFromTokens','detectStudentStatus','normalizeNoticeText','normalizeStatusLabel','parseStudentRawText']) {
    const start = a.indexOf('      function ' + name + '(');
    assert(start >= 0);
    vm.runInContext(a.slice(start,a.indexOf('\n      function ', start+1)),scope);
  }
  vm.runInContext(a.slice(a.indexOf('      function getCurrentReportHour('),a.indexOf('      function isTeacherHeader(')),scope);
  const report = scope.buildAttendanceReport();
  assert.deepEqual([report.activeCount,report.lateCount,report.absentCount], [1,1,0]);
  assert.equal(report.items[0].name,'검증학생b');
  assert.equal(report.items[0].status,'지각');
  assert.equal(report.items[0].note,note);
  assert.match(scope.composeAttendanceReportText(report),/10분 지각 예정/);
  assert.match(scope.attendanceTeacherMessages(report)[0].text,/10분 지각 예정/);
  scope.lastData.grid[10][0][1] = raw.replace(', 10분 지각 예정','');
  assert.equal(scope.buildAttendanceReport().activeCount,2);
}
