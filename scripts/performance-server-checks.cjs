const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
let now = 0;
let reads = 0;
let digests = 0;
let ranges = [];
let locked = false;
let lockCount = 0;
let flushCount = 0;
const entries = new Map();
const cache = {
  get(key) { const entry = entries.get(key); return entry && entry.expires > now ? entry.value : null; },
  put(key, value, seconds) { entries.set(key, { value, expires: now + seconds }); }
};
let rows = [['일자', '1강의실'], ['8:00', '수학 테스트T'], ['', '학생A']];
const sheet = {
  getDataRange() { reads++; return { getDisplayValues: () => rows.map(row => row.slice()) }; },
  getLastRow() { return rows.length; },
  getRange(row, col, count, width) {
    assert(row >= 1 && count >= 1);
    return {
      createTextFinder(text) {
        return {
          matchCase(value) { assert.equal(value, true); return this; },
          matchEntireCell(value) { assert.equal(value, false); return this; },
          useRegularExpression(value) { assert.equal(value, false); return this; },
          matchFormulaText(value) { assert.equal(value, false); return this; },
          findAll() { return rows.slice(row - 1, row - 1 + count).flatMap((item, i) => String(item[col - 1] || '').includes(text) ? [{ getRow: () => row + i }] : []); }
        };
      },
      getDisplayValues() { ranges.push({ row, col, count, width }); return rows.slice(row - 1, row - 1 + count).map(item => item.slice(col - 1, col - 1 + width)); },
      setValues(values) { assert(locked); rows[row - 1] = values[0]; }
    };
  },
  appendRow(row) { assert(locked); rows.push(row); }
};
const scope = {
  CacheService: { getScriptCache: () => cache },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => name === 'missing' ? null : sheet }), flush() { assert(locked); flushCount++; } },
  LockService: { getScriptLock: () => ({ waitLock(ms) { assert.equal(ms, 5000); assert(!locked); locked = true; lockCount++; }, releaseLock() { assert(locked); locked = false; } }) },
  Session: { getScriptTimeZone: () => 'Asia/Seoul' },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest(algorithm, value) { digests++; return [...crypto.createHash(algorithm).update(value).digest()]; },
    formatDate: () => '2026-09-17 12:00:00'
  }
};
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), scope);
function gridRead(expectedReads, expectedDigests, force = false) {
  const before = reads, hashes = digests;
  const result = scope.getFixedGridData('9/17', force);
  assert(!result.error, result.error);
  assert.equal(reads - before, expectedReads);
  assert.equal(digests - hashes, expectedDigests);
  return result;
}
const initial = gridRead(1, 1);
assert.equal(entries.get(scope.scheduleRevisionCacheKey_('9/17')).expires, 15);
assert.equal(gridRead(0, 0).version, initial.version);
now = 15;
assert.equal(gridRead(1, 1).version, initial.version, 'unchanged expiry remains valid');
rows[2][1] = '학생B';
assert.equal(gridRead(0, 0).version, initial.version, 'existing freshness window is unchanged');
now = 30;
const changed = gridRead(1, 1);
assert.notEqual(changed.version, initial.version);
assert(changed.grid[8][0].includes('학생B'));
rows[2][1] = '학생C';
assert(gridRead(1, 1, true).grid[8][0].includes('학생C'), 'force ignores warm revision');
assert.equal(scope.checkDataVersion('9/17'), gridRead(0, 0).version);
rows[2][1] = '학생D';
now = 45;
const polled = scope.checkDataVersion('9/17');
assert.equal(gridRead(1, 1).version, polled, 'separate version request still invalidates the grid');
rows[2][1] = '학생E';
now = 60;
const beforeTeacher = reads;
const teacher = scope.getTeacherGridData('9/17', '테스트', false);
assert.equal(reads - beforeTeacher, 1);
assert(teacher.grid[8][0].includes('학생E'));
assert.equal(scope.checkDataVersion('missing'), 'ERROR');
assert(scope.getFixedGridData('missing', true).error);

// Compare bounded history against the original full-history semantics.
rows = [['at', 'teacher', 'sheet', 'login', 'unrelated']];
for (let i = 0; i < 1000; i++) rows.push([String(i), i % 311 === 0 ? '희소' : '일반', '9/17', 'id', 'extra']);
function originalLogs(teacherName, limit) {
  const selected = String(teacherName || '').trim();
  const max = Math.max(1, Math.min(parseInt(limit, 10) || 120, 300));
  return rows.slice(1).filter(row => !selected || String(row[1] || '').trim() === selected).slice(-max).reverse().map(row => ({ viewedAt: row[0], teacherName: row[1], sheetName: row[2], loginId: row[3] }));
}
for (const name of ['', '희소', '일반', '없는강사']) {
  for (const limit of [undefined, 1, 3, 300, 900, -1]) {
    ranges = [];
    const actual = scope.getTeacherViewLogs_(name, limit);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), originalLogs(name, limit));
    assert(ranges.every(range => range.width === 4));
    assert.equal(ranges.length, 1, 'history uses one range call, including sparse/absent teachers');
    if (!name) assert(ranges[0].count <= 300, 'unfiltered log reads only its tail');
    else assert.equal(ranges[0].count, 1000, 'filtered history retains every historical match');
  }
}
ranges = [];
scope.getTeacherViewLogs_('', 120);
assert.equal(ranges[0].count, 120);
rows = [['at', 'teacher', 'sheet', 'login']];
assert.equal(scope.getTeacherViewLogs_('', 120).length, 0);

rows = [['sheet', 'student', 'sent', 'at', 'by', 'key', 'unrelated'],
  ['9/17', '학생A', '0', '', '', ''], ['9/17', '학생A', '0', '', '', '9/17||학생A']];
ranges = [];
scope.setStudentCardSentStatus_('9/17', '학생A', true, 'admin');
assert.equal(rows[1][2], '0', 'old duplicate preserved');
assert.equal(rows[2][2], '1', 'latest duplicate updated');
assert(scope.getStudentCardStatuses_('9/17')['학생A'].sent);
scope.setStudentCardSentStatus_('9/17', '학생B', true, 'admin');
assert.equal(rows.length, 4);
assert(ranges.every(range => range.width === 5 || range.width === 6));
assert.equal(lockCount, 2);
assert.equal(flushCount, 2);
assert(!locked);
console.log('PASS performance server checks: cold/changed/expired grid 1 read + 1 hash; warm 0; force fresh; teacher/manual edit parity; bounded history exact parity including sparse old matches; projected card reads + latest duplicate + locks.');
