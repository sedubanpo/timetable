#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "Index.html");
const mirrorPath = path.join(root, "docs", "index.html");
const codePath = path.join(root, "Code.gs");
const index = fs.readFileSync(indexPath, "utf8");
const mirror = fs.readFileSync(mirrorPath, "utf8");
const server = fs.readFileSync(codePath, "utf8");

function extractFunction(source, name) {
  const start = source.indexOf("function " + name + "(");
  assert(start >= 0, "missing function: " + name);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error("unterminated function: " + name);
}

assert.strictEqual(index, mirror, "Index.html and docs/index.html diverged");

const inlineScripts = Array.from(index.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
  .map((match) => match[1])
  .filter((script) => script.trim());
assert(inlineScripts.length >= 2, "expected configuration and application scripts");
inlineScripts.forEach((script, i) => new vm.Script(script, { filename: "Index.inline." + i + ".js" }));
new vm.Script(server, { filename: "Code.gs" });

const appScript = inlineScripts[inlineScripts.length - 1];
const sandbox = {
  window: { innerWidth: 1280, addEventListener() {} },
  document: {},
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  console,
  alert() {},
  setTimeout() { return 1; },
  clearTimeout() {},
  setInterval() { return 1; },
  clearInterval() {},
  requestAnimationFrame() { return 1; },
  cancelAnimationFrame() {},
  URLSearchParams,
  Date,
  Promise,
  Set,
  Map
};
vm.createContext(sandbox);
vm.runInContext(appScript, sandbox, { timeout: 2000 });
sandbox.nonStudentKeywords = new Set(["자습", "자기주도", "수학", "영어", "국어", "과학"]);

[
  "normalizeReviewNameToken",
  "isNonStudentName",
  "extractReviewStudentName",
  "buildReviewSnapshot",
  "getReviewIssueBadge",
  "getReviewSeverity",
  "addCurrentSnapshotIssues",
  "getReviewIssueLocations",
  "getReviewIssueReason",
  "renderReviewTimetableIssueCard",
  "renderReviewIssueList",
  "renderReviewCurrentTimetable"
].forEach((name) => vm.runInContext(extractFunction(appScript, name), sandbox));

const enrollment = sandbox.buildEnrollmentStatusIndex([
  { studentName: "김 학생", status: "중지" },
  { studentName: "김학생", status: "ACTIVE" },
  { studentName: "이학생", status: "보류" },
  { studentName: "박학생", status: "퇴원" },
  { studentName: "박학생", status: "중지" }
]);
assert(!enrollment.byName["김학생"], "active same-name record must suppress warning");
assert.strictEqual(enrollment.byName["이학생"][0].label, "보류");
assert.strictEqual(enrollment.byName["박학생"].length, 2);

const specialQuery = "[정규](A)+?";
assert.doesNotThrow(() => new RegExp(sandbox.escapeRegExp(specialQuery), "gi"));

const fakeElement = {
  innerHTML: "",
  classList: { add() {} }
};
sandbox.renderTableItem(fakeElement, "<img src=x onerror=alert(1)> 강남고1");
assert(!fakeElement.innerHTML.includes("<img"), "student text must not inject HTML");
assert(fakeElement.innerHTML.includes("&lt;img"), "student text should be escaped");

const highlighted = { innerHTML: "", classList: { add() {} } };
assert.doesNotThrow(() => sandbox.highlightItem(highlighted, "김[학생 강남고1", "["));
assert(highlighted.innerHTML.includes("highlight-text"), "special-character search should highlight");

const anomalyData = {
  headers: ["1강의실", "2강의실", "3강의실", "4강의실"],
  grid: {
    9: [["개별 수학 박강사T", "박학생 반포고1 정규", "최학생 반포고2 정규"], [], [], []],
    10: [
      ["개별 수학 박강사T", "박학생 반포고1 정규", "결석학생 서초고2 결석예고"],
      ["개별 영어 김강사T", "김학생 세화고1 정규"],
      ["1:1 국어 이강사T", "김학생 세화고1 보강", "김학생 다른고1 정규", "결석학생 서초고2 결석예고"],
      []
    ],
    11: [["개별 수학 박강사T", "박학생 반포고1 정규"], [], [], ["개별 과학 이강사T", "이학생 서문여고2 정규"]],
    13: [[], ["개별 영어 김강사T", "최학생 반포고2 정규"], [], ["개별 과학 이강사T", "이학생 서문여고2 정규"]]
  }
};
const anomalyIndex = sandbox.buildStudentScheduleAnomalyIndex(anomalyData);
assert.strictEqual(anomalyIndex.duplicateGroups, 1, "same name and school in one hour should form one duplicate group");
assert.strictEqual(anomalyIndex.gapStudents, 1, "non-consecutive hours should form one gap warning");
assert(sandbox.getStudentScheduleAnomalyReasons(anomalyIndex, "김학생 세화고1 정규", 10, 1).includes("동일 시간대 중복 입력"));
assert(sandbox.getStudentScheduleAnomalyReasons(anomalyIndex, "김학생 세화고1 보강", 10, 2).includes("동일 시간대 중복 입력"));
assert.deepStrictEqual(
  Array.from(sandbox.getStudentScheduleAnomalyReasons(anomalyIndex, "김학생 다른고1 정규", 10, 2)),
  [],
  "same name with a different school/grade must not be grouped"
);
assert(sandbox.getStudentScheduleAnomalyReasons(anomalyIndex, "이학생 서문여고2 정규", 11, 3).includes("수업 시간 중간 공백 확인"));
assert(sandbox.getStudentScheduleAnomalyReasons(anomalyIndex, "이학생 서문여고2 정규", 13, 3).includes("수업 시간 중간 공백 확인"));
assert.deepStrictEqual(
  Array.from(sandbox.getStudentScheduleAnomalyReasons(anomalyIndex, "박학생 반포고1 정규", 10, 0)),
  [],
  "continuous lessons must not be warned"
);
assert.deepStrictEqual(
  Array.from(sandbox.getStudentScheduleAnomalyReasons(anomalyIndex, "최학생 반포고2 정규", 13, 1)),
  [],
  "separate lessons with different teachers/subjects must not be treated as an internal gap"
);
assert.deepStrictEqual(
  Array.from(sandbox.getStudentScheduleAnomalyReasons(anomalyIndex, "결석학생 서초고2 결석예고", 10, 0)),
  [],
  "absence notices must not create schedule anomalies"
);
const anomalyClasses = [];
const anomalyElement = {
  title: "등록 상태 경고: 중지",
  classList: { add(name) { anomalyClasses.push(name); } },
  setAttribute(name, value) { this[name] = value; }
};
sandbox.applyStudentScheduleAnomalyWarning(anomalyElement, "김학생 세화고1 정규", 10, 1, anomalyIndex);
assert(anomalyClasses.includes("schedule-anomaly"), "anomaly element must receive the warning class");
assert(anomalyElement.title.includes("동일 시간대 중복 입력"), "anomaly tooltip must explain the warning");
assert(anomalyElement.title.includes("등록 상태 경고: 중지"), "schedule warning must preserve enrollment warning text");

const reviewScheduleData = {
  headers: ["1강의실", "2강의실", "3강의실", "4강의실"],
  grid: {
    14: [
      ["개별 수학 박선생T", "김학생 세화고1 정규 확인필요"],
      ["개별 영어 이선생T", "김학생 세화고1 정규"],
      ["개별 국어 최선생T", "김학생 다른고1 정규"],
      []
    ],
    16: [[], [], [], ["1:1 과학 정선생T"]],
    18: [["개별 수학 박선생T", "이학생 서초고2 정규"], [], [], []]
  }
};
const reviewSnapshot = sandbox.buildReviewSnapshot(reviewScheduleData);
const reviewIssues = [];
sandbox.addCurrentSnapshotIssues(reviewSnapshot, reviewIssues);
const checkIssue = reviewIssues.find((issue) => issue.type === "check");
assert(checkIssue, "check-needed issue must be preserved");
assert.strictEqual(checkIssue.teacher, "박선생T", "check-needed issue must include its teacher");
assert.strictEqual(checkIssue.subject, "수학", "check-needed issue must include its subject");
assert.strictEqual(checkIssue.students[0].name, "김학생", "check-needed issue must include its student");
const duplicateIssues = reviewIssues.filter((issue) => issue.type === "duplicate");
assert.strictEqual(duplicateIssues.length, 1, "same-name student at another school must not create an extra duplicate issue");
assert.deepStrictEqual(Array.from(duplicateIssues[0].rooms), ["1강의실", "2강의실"]);
const singleIssue = reviewIssues.find((issue) => issue.type === "single" && issue.studentName === "이학생");
assert(singleIssue && singleIssue.teacher === "박선생T", "one-hour issue must retain exact class context");
const reviewTimetableHtml = sandbox.renderReviewCurrentTimetable(reviewSnapshot, reviewIssues);
assert(reviewTimetableHtml.includes("aria-label='현재표 오류 시간표'"), "current errors must render as a semantic timetable");
assert(reviewTimetableHtml.includes("박선생T"), "timetable cards must show the teacher");
assert(reviewTimetableHtml.includes("수학"), "timetable cards must show the subject");
assert(reviewTimetableHtml.includes("확인필요 표시"), "timetable cards must explain the check-needed error");
assert(reviewTimetableHtml.includes("1강의실") && reviewTimetableHtml.includes("14:00"), "timetable must preserve room and time coordinates");

assert(index.includes('withFirestoreTimeout(loadPage("", []), 20000'), "enrollment timeout regression");
assert(index.includes("isMobile !== lastResponsiveMobile"), "resize breakpoint guard missing");
assert(index.includes("escapeHtml(entry.name)"), "mobile teacher names must be escaped");
assert(index.includes("escapeHtml(parsed.name || \"학생\")"), "detailed mobile teacher names must be escaped");
assert(index.includes("absence-card-title'>\" + escapeHtml(name)"), "absence preview names must be escaped");
assert(index.includes("data-operation-memo-base-title"), "operation memo refresh must preserve schedule warning titles");
assert(index.includes('role="dialog" aria-modal="true" aria-labelledby="reviewModalTitle"'), "review modal semantics missing");
assert(index.includes("button.setAttribute('aria-selected'"), "review tabs must expose selected state");

assert(index.includes("function recordTeacherViewAfterSuccessfulLoad(teacherName, sheetName)"), "teacher view logging helper missing");
assert(index.includes("if (d && !d.error) recordTeacherViewAfterSuccessfulLoad(teacherName, n);"), "successful teacher-grid loads must record a view");
assert(!index.includes("if (auditView && authState.loggedIn"), "teacher view logging must not depend on an optional route flag");
assert(index.includes("teacherViewLogKeys.delete(key);"), "failed teacher view logs must be retryable");

vm.runInContext(extractFunction(appScript, "recordTeacherViewAfterSuccessfulLoad"), sandbox);
vm.runInContext(`
  globalThis.__teacherViewCalls = [];
  authState = { loggedIn: true, isMaster: false, isLookup: false, teacherName: "배유진", loginId: "teacher-1" };
  accessMode = "teacher";
  teacherViewLogKeys = new Set();
  callServer = function(method, args) {
    globalThis.__teacherViewCalls.push({ method: method, args: args });
    return Promise.resolve(true);
  };
  recordTeacherViewAfterSuccessfulLoad("배유진", "8/8(토)");
  recordTeacherViewAfterSuccessfulLoad("배유진", "8/8(토)");
  authState.isMaster = true;
  recordTeacherViewAfterSuccessfulLoad("배유진", "8/9(일)");
  authState = { loggedIn: true, isMaster: false, isLookup: false, teacherName: "김광수", loginId: "teacher-2" };
  recordTeacherViewAfterSuccessfulLoad("김광수", "8/8(토)");
`, sandbox);
const teacherViewCalls = JSON.parse(vm.runInContext("JSON.stringify(globalThis.__teacherViewCalls)", sandbox));
assert.strictEqual(teacherViewCalls.length, 2, "each non-admin teacher account must log its own viewed sheet once per page session");
assert.strictEqual(teacherViewCalls[0].method, "logTeacherView");
assert.deepStrictEqual(teacherViewCalls[0].args, ["배유진", "8/8(토)", "teacher-1"]);
assert.deepStrictEqual(teacherViewCalls[1].args, ["김광수", "8/8(토)", "teacher-2"], "view logging must not be limited to one teacher name");

assert(index.includes('action: "teacher_view_override_set"'), "admin override save API call is missing");
assert(index.includes("function buildEffectiveTeacherViewLogs(logs, overrides)"), "effective dashboard count helper is missing");
assert(index.includes("실제 로그로 복원"), "admin dashboard must provide a safe restore action");
assert(server.includes('DASHBOARD_ADMIN_SESSION_REQUIRED'), "admin override API must reject a missing admin session");
assert(server.includes('attachDashboardAdminSession_'), "admin login must issue a dashboard edit session");

const sourceLogs = [
  { viewedAt: "2026-08-08 09:00:00", teacherName: "배유진", sheetName: "8/8(토)", loginId: "teacher-1" },
  { viewedAt: "2026-08-08 09:10:00", teacherName: "배유진", sheetName: "8/8(토)", loginId: "teacher-1" },
  { viewedAt: "2026-08-08 09:20:00", teacherName: "김광수", sheetName: "8/8(토)", loginId: "teacher-2" }
];
const effectiveLogs = sandbox.buildEffectiveTeacherViewLogs(sourceLogs, [
  { teacherName: "배유진T", sheetName: "8/8(토)", state: "viewed", count: 3, updatedAt: "2026-08-08 12:00:00", updatedBy: "admin" },
  { teacherName: "김광수", sheetName: "8/8(토)", state: "missing", count: 0, updatedAt: "2026-08-08 12:00:00", updatedBy: "admin" }
]);
assert.strictEqual(effectiveLogs.filter((item) => item.teacherName === "배유진" && item.sheetName === "8/8(토)").length, 3, "manual viewed count must replace raw count exactly");
assert.strictEqual(effectiveLogs.filter((item) => item.teacherName === "김광수" && item.sheetName === "8/8(토)").length, 0, "manual missing state must remove the effective view count");
assert(effectiveLogs.filter((item) => item.teacherName === "배유진").every((item) => item.isManualOverride), "manual count must remain distinguishable from raw logs");

vm.runInContext(`
  currentSheetName = "8/8(토)";
  teacherDashboardEditMode = true;
  authState = { loggedIn: true, isMaster: true, isLookup: false, teacherName: "", loginId: "admin", dashboardAdminToken: "session-token" };
  teacherViewOverridesCache = [{ teacherName: "배유진", sheetName: "8/8(토)", state: "missing", count: 0, updatedAt: "2026-08-08 12:00:00", updatedBy: "admin" }];
`, sandbox);
const adminDashboardCard = sandbox.renderCurrentTeacherLogPanel(null, ["배유진"]);
assert(adminDashboardCard.includes("관리자 조정"), "manual state must be visible to administrators");
assert(adminDashboardCard.includes("teacher-log-adjust-panel"), "admin dashboard must expose direct adjustment controls");
assert(adminDashboardCard.includes("실제 로그로 복원"), "admin dashboard must make rollback explicit");
vm.runInContext("authState.isMaster = false;", sandbox);
const teacherDashboardCard = sandbox.renderCurrentTeacherLogPanel(null, ["배유진"]);
assert(!teacherDashboardCard.includes("teacher-log-adjust-panel"), "non-admin dashboards must not render adjustment controls");

assert(server.includes('if (!logTeacherView_(logTeacher, logSheet, logLoginId))'), "server must expose a failed log write to the client");
const logApiSandbox = {
  isApiAuthorized_() { return true; },
  jsonOutput_(payload) { return payload; },
  logTeacherView_() { return false; }
};
vm.createContext(logApiSandbox);
vm.runInContext(extractFunction(server, "handleApiRequest_"), logApiSandbox);
const failedLogResponse = JSON.parse(JSON.stringify(logApiSandbox.handleApiRequest_({
  action: "teacher_view_log", teacher: "배유진", sheet: "8/8(토)", loginId: "teacher-1"
})));
assert.deepStrictEqual(failedLogResponse, { ok: false, error: "LOG_SAVE_FAILED" }, "a failed write must make the client retryable");
logApiSandbox.logTeacherView_ = function() { return true; };
const savedLogResponse = JSON.parse(JSON.stringify(logApiSandbox.handleApiRequest_({
  action: "teacher_view_log", teacher: "배유진", sheet: "8/8(토)", loginId: "teacher-1"
})));
assert.deepStrictEqual(savedLogResponse, { ok: true }, "a successful write must preserve the normal response");

logApiSandbox.getDashboardAdminSessionLogin_ = function() { return ""; };
const deniedOverrideResponse = JSON.parse(JSON.stringify(logApiSandbox.handleApiRequest_({
  action: "teacher_view_override_set", teacher: "배유진", sheet: "8/8(토)", state: "viewed", count: "2", adminToken: "invalid"
})));
assert.deepStrictEqual(deniedOverrideResponse, { ok: false, error: "DASHBOARD_ADMIN_SESSION_REQUIRED" }, "override writes must require a server-validated admin session");
logApiSandbox.getDashboardAdminSessionLogin_ = function() { return "admin"; };
logApiSandbox.setTeacherViewOverride_ = function(sheetName, teacherName, state, count, editor) {
  return { sheetName, teacherName, state, count, updatedBy: editor };
};
const savedOverrideResponse = JSON.parse(JSON.stringify(logApiSandbox.handleApiRequest_({
  action: "teacher_view_override_set", teacher: "배유진", sheet: "8/8(토)", state: "viewed", count: "2", adminToken: "valid"
})));
assert.deepStrictEqual(savedOverrideResponse, {
  ok: true,
  override: { sheetName: "8/8(토)", teacherName: "배유진", state: "viewed", count: 2, updatedBy: "admin" }
}, "server must persist a validated admin adjustment");

const legacyNames = extractFunction(server, "getLegacyTeacherNamesForAuth_");
assert(!/\bbreak\s*;/.test(legacyNames), "teacher list must scan every row");
assert(legacyNames.includes("teacherNames.sort()"), "teacher list must be stable");
const legacyAuth = extractFunction(server, "authenticateTeacher");
assert(legacyAuth.includes("matchedAccount"), "authentication must defer return until all names are collected");

const boundaryGrid = {
  headers: ["1강의실"],
  grid: {
    8: [["개별 수학 박선생T", "아침학생 세화고1 정규"]],
    9: [["개별 수학 박선생T", "아침학생 세화고1 정규"]],
    22: [["1:1 영어 이선생T", "야간학생 반포고2 정규"]],
    23: [["1:1 영어 이선생T", "야간학생 반포고2 정규"]]
  }
};
sandbox.boundaryGrid = boundaryGrid;
vm.runInContext("lastData = boundaryGrid; currentSheetName = '8/5(수)'; buildStudentImageMap();", sandbox);
const morningCard = vm.runInContext("buildStudentCardViewModel('아침학생')", sandbox);
const lateCard = vm.runInContext("buildStudentCardViewModel('야간학생')", sandbox);
assert.strictEqual(morningCard.timelineRows[0].start, 8, "student card must start an early class at 08:00");
assert.strictEqual(morningCard.timelineRows[0].end, 10, "student card must merge the 08:00-10:00 class");
assert.strictEqual(lateCard.timelineRows[0].start, 22, "student card must start a late class at 22:00");
assert.strictEqual(lateCard.timelineRows[0].end, 24, "student card must include the 23:00-24:00 slot");
assert.strictEqual(vm.runInContext("formatTime(24)", sandbox), "오전 12:00", "midnight export label must be correct");
assert.strictEqual(vm.runInContext("hasVisibleScheduleStudentsAtHour(boundaryGrid, 9)", sandbox), true, "a real 09:00 class must override the summary-row hide toggle");

const automaticMemos = sandbox.buildSlmsOperationMemoItems([
  { __id: "common", date: "2026-08-18", target: "용강중 공통", eventName: "개학식", eventType: "기타 일정" },
  { __id: "grade", startDate: "2026-08-18", endDate: "2026-08-19", targetSchool: "서울고", targetGrade: "2학년", title: "개학식" },
  { __id: "outside", date: "2026-08-20", school: "서초고", grade: "전체", eventName: "개학식" },
  { __id: "duplicate", date: "2026-08-18", school: "용강중", grade: "전학년", eventName: "개학식", eventType: "기타 일정" },
  { __id: "edited", date: "2026-08-13", isoDate: "2026-08-18", endDate: "2026-08-13", endIsoDate: "", school: "수도여고", grade: "공통", eventName: "여름방학", eventType: "개학식", title: "개학식", note: "" },
  { __id: "vacation", date: "2026-07-21", isoDate: "2026-07-21", endDate: "2026-08-21", endIsoDate: "2026-08-21", target: "수도여고", eventName: "여름방학", eventType: "여름방학", title: "여름방학", note: "8/21(금) 등교" }
], "2026-08-18");
assert.strictEqual(automaticMemos.length, 3, "same-date S-LMS school events must be included and duplicates removed");
assert.strictEqual(automaticMemos[0].target_school, "용강중", "automatic memo must retain its school");
assert.strictEqual(automaticMemos[0].target_grade, "", "common school events must apply to every grade");
assert.strictEqual(automaticMemos[0].read_only, true, "S-LMS memos must be read-only");
assert.strictEqual(automaticMemos[1].target_grade, "2", "grade-specific events must retain their numeric grade");
assert.strictEqual(automaticMemos[2].date_key, "2026-08-18", "S-LMS isoDate must override a stale legacy date");
assert.strictEqual(automaticMemos[2].message, "개학식", "S-LMS eventType must override a stale legacy eventName");
assert.strictEqual(sandbox.buildSlmsOperationMemoItems([{ date: "2026-08-13", isoDate: "2026-08-18", school: "수도여고", eventName: "여름방학", eventType: "개학식" }], "2026-08-13").length, 0, "an edited S-LMS event must not appear on its stale legacy date");
assert.strictEqual(sandbox.buildSlmsOperationMemoItems([{ date: "2026-07-21", isoDate: "2026-07-21", endDate: "2026-08-21", endIsoDate: "2026-08-21", target: "수도여고", eventName: "여름방학", eventType: "여름방학" }], "2026-08-13").length, 0, "a ranged S-LMS vacation must not repeat as a warning on every day in the range");
const retainedAutomatic = sandbox.resolveOperationMemoSourceItems({ items: [], error: new Error("temporary") }, automaticMemos, true);
assert.strictEqual(retainedAutomatic.length, 3, "a same-date source failure must retain the last successful automatic items");
assert.strictEqual(sandbox.resolveOperationMemoSourceItems({ items: [], error: new Error("temporary") }, automaticMemos, false).length, 0, "a new date must not leak stale automatic items");
assert(index.includes("S-LMS 자동") && index.includes("읽기 전용") && index.includes("전학년"), "automatic memo source and coverage labels must remain visible");
assert(index.includes('id="operationMemoSchoolWarningToggle"') && index.includes("학교 일정 경고"), "operation memo modal must expose the school warning toggle");
assert(index.includes("aria-pressed=\"true\"") && index.includes('button.setAttribute(\'aria-label\', "학교 일정 경고 "'), "school warning toggle must expose its state and action accessibly");

const preferenceStorage = new Map();
sandbox.localStorage = {
  getItem(key) { return preferenceStorage.has(key) ? preferenceStorage.get(key) : null; },
  setItem(key, value) { preferenceStorage.set(key, String(value)); },
  removeItem(key) { preferenceStorage.delete(key); }
};
sandbox.testOperationMemoItems = automaticMemos.concat([
  { id: "manual-school", type: "school", target_school: "서울고", target_grade: "2", message: "수기 확인", active: true }
]);
vm.runInContext("operationMemoState.items = testOperationMemoItems", sandbox);
assert.strictEqual(sandbox.areOperationMemoSchoolWarningsVisible(), true, "school warnings must default to visible");
assert.strictEqual(sandbox.getVisibleOperationMemoItems().length, 4, "default view must include automatic and manual memos");
preferenceStorage.set("sedu_operation_memo_school_warnings_visible_v1", "false");
assert.strictEqual(sandbox.areOperationMemoSchoolWarningsVisible(), false, "stored off preference must remain off after state reads");
assert.strictEqual(sandbox.getVisibleOperationMemoItems().length, 1, "off preference must hide only automatic school events");
assert.strictEqual(sandbox.getVisibleOperationMemoItems()[0].id, "manual-school", "manual operation memos must remain visible when school warnings are off");

let exportedRows = null;
sandbox.XLSX = {
  utils: {
    json_to_sheet(rows) { exportedRows = rows; return { "!ref": "A1:J3" }; },
    book_new() { return {}; },
    book_append_sheet() {}
  },
  writeFile() {}
};
vm.runInContext("exportScheduleToExcel()", sandbox);
assert(exportedRows.some((row) => row["이름"] === "아침학생" && row["시작"] === "오전 8:00" && row["종료"] === "오전 10:00" && row["시간"] === 2), "timesheet must include and merge 08:00-10:00");
assert(exportedRows.some((row) => row["이름"] === "야간학생" && row["시작"] === "오후 10:00" && row["종료"] === "오전 12:00" && row["시간"] === 2), "timesheet must include and merge 22:00-24:00");

const serverSandbox = {
  SCHEDULE_START_HOUR: 8,
  SCHEDULE_END_HOUR: 23,
  CacheService: { getScriptCache() { return { get() { return null; }, put() {} }; } },
  SpreadsheetApp: {
    getActiveSpreadsheet() {
      return {
        getSheetByName() {
          const values = [
            ["", "1강의실"],
            ["오전 8:00", "개별 수학 박선생T"],
            ["~ 9:00", "아침학생 세화고1 정규"],
            ["오전 9:00", "개별 영어 최선생T"],
            ["~ 10:00", "오전학생 세화고2 정규"],
            ["오전 11:00 ~ 오후 12:00", "개별 국어 김선생T"],
            ["", "낮학생 반포고1 정규"],
            ["오후 8:00", "개별 과학 정선생T"],
            ["~ 9:00", "저녁학생 서초고2 정규"],
            ["오후 11:00 ~ 오전 12:00", "1:1 영어 이선생T"],
            ["", "야간학생 반포고2 정규"]
          ];
          return {
            getDataRange() { return { getDisplayValues() { return values; } }; },
            getLastRow() { return values.length; },
            getLastColumn() { return values[0].length; },
            getRange() { return { getDisplayValue() { return ""; } }; }
          };
        }
      };
    }
  }
};
vm.createContext(serverSandbox);
vm.runInContext(extractFunction(server, "parseScheduleStartHour_"), serverSandbox);
vm.runInContext(extractFunction(server, "getFixedGridData"), serverSandbox);
vm.runInContext(extractFunction(server, "toLitePayload_"), serverSandbox);
const parsedBoundary = serverSandbox.getFixedGridData("8/5(수)", true);
assert(parsedBoundary.grid[8][0].some((item) => item.includes("아침학생")), "server parser must retain the 08:00 block");
assert(parsedBoundary.grid[9][0].some((item) => item.includes("오전학생")), "server parser must retain the 09:00 block");
assert(!parsedBoundary.grid[9][0].some((item) => item.includes("저녁학생")), "an evening range end must not move students into the morning slot");
assert(parsedBoundary.grid[11][0].some((item) => item.includes("낮학생")), "server parser must use the first meridiem in a mixed AM/PM range");
assert(parsedBoundary.grid[20][0].some((item) => item.includes("저녁학생")), "server parser must keep evening students with their evening teacher");
assert(parsedBoundary.grid[23][0].some((item) => item.includes("야간학생")), "server parser must retain the 23:00 block");
const liteBoundary = serverSandbox.toLitePayload_(parsedBoundary);
assert(liteBoundary.rows.some((row) => row.hour === 8), "lite API must include 08:00 rows");
assert(liteBoundary.rows.some((row) => row.hour === 23), "lite API must include 23:00 rows");

assert(!/for\s*\(var\s+(?:h|hour|hh|sh|t|time)\s*=\s*9\s*;[^\n]*<=\s*23/.test(index), "client schedule consumers must not retain the old 09:00-23:00 range");
assert(!/for\s*\(var\s+h\s*=\s*9\s*;[^\n]*<=\s*23/.test(server), "server schedule consumers must not retain the old 09:00-23:00 range");

console.log("review checks passed");
