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

assert(index.includes('withFirestoreTimeout(loadPage("", []), 20000'), "enrollment timeout regression");
assert(index.includes("isMobile !== lastResponsiveMobile"), "resize breakpoint guard missing");
assert(index.includes("escapeHtml(entry.name)"), "mobile teacher names must be escaped");
assert(index.includes("escapeHtml(parsed.name || \"학생\")"), "detailed mobile teacher names must be escaped");
assert(index.includes("absence-card-title'>\" + escapeHtml(name)"), "absence preview names must be escaped");
assert(index.includes("data-operation-memo-base-title"), "operation memo refresh must preserve schedule warning titles");

const legacyNames = extractFunction(server, "getLegacyTeacherNamesForAuth_");
assert(!/\bbreak\s*;/.test(legacyNames), "teacher list must scan every row");
assert(legacyNames.includes("teacherNames.sort()"), "teacher list must be stable");
const legacyAuth = extractFunction(server, "authenticateTeacher");
assert(legacyAuth.includes("matchedAccount"), "authentication must defer return until all names are collected");

console.log("review checks passed");
