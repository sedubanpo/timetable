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

assert(index.includes('withFirestoreTimeout(loadPage("", []), 20000'), "enrollment timeout regression");
assert(index.includes("isMobile !== lastResponsiveMobile"), "resize breakpoint guard missing");
assert(index.includes("escapeHtml(entry.name)"), "mobile teacher names must be escaped");
assert(index.includes("escapeHtml(parsed.name || \"학생\")"), "detailed mobile teacher names must be escaped");
assert(index.includes("absence-card-title'>\" + escapeHtml(name)"), "absence preview names must be escaped");

const legacyNames = extractFunction(server, "getLegacyTeacherNamesForAuth_");
assert(!/\bbreak\s*;/.test(legacyNames), "teacher list must scan every row");
assert(legacyNames.includes("teacherNames.sort()"), "teacher list must be stable");
const legacyAuth = extractFunction(server, "authenticateTeacher");
assert(legacyAuth.includes("matchedAccount"), "authentication must defer return until all names are collected");

console.log("review checks passed");
