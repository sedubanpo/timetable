const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
let now = 0;
const cached = new Map();
const cache = {
  get(key) { const entry = cached.get(key); return entry && entry.until > now ? entry.value : null; },
  put(key, value, seconds) { cached.set(key, { value, until: now + seconds }); }
};
let locked = false;
let acquisitions = 0;
let flushed = 0;
let scans = 0;
let rows = [['일자', '1강의실'], ['8:00', '수학 테스트T'], ['', '학생A']];
const sheet = {
  getDataRange() { scans++; return { getDisplayValues: () => rows.map(row => row.slice()) }; },
  getLastRow() { return rows.length; },
  getRange(row, col, count, width) {
    return {
      getDisplayValues: () => rows.slice(row - 1, row - 1 + count).map(item => item.slice(col - 1, col - 1 + width)),
      setValues(values) { assert(locked, 'sheet writes must hold script lock'); rows[row - 1] = values[0]; }
    };
  },
  appendRow(row) { assert(locked, 'append must hold script lock'); rows.push(row); }
};
const scope = {
  CacheService: { getScriptCache: () => cache },
  LockService: {
    getDocumentLock: () => null,
    getScriptLock: () => ({
      waitLock() { assert(!locked); locked = true; acquisitions++; },
      releaseLock() { assert(locked); locked = false; }
    })
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }),
    flush() { assert(locked, 'flush must occur before lock release'); flushed++; }
  },
  Session: { getScriptTimeZone: () => 'Asia/Seoul' },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (algorithm, text) => [...crypto.createHash(algorithm).update(text).digest()],
    formatDate: () => '2026-09-05 12:00:00'
  }
};
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), scope);

const first = scope.getFixedGridData('9/5(토)', false);
assert(!first.error, first.error);
assert.equal(scope.checkDataVersion('9/5(토)'), first.version);
const scanCount = scans;
scope.checkDataVersion('9/5(토)');
scope.getFixedGridData('9/5(토)', false);
assert.equal(scans, scanCount, 'hot cache must avoid repeated sheet scans');
rows[2][1] = '학생B';
now = 16;
assert.notEqual(scope.checkDataVersion('9/5(토)'), first.version, 'body edit must change revision');
const second = scope.getFixedGridData('9/5(토)', false);
assert(second.grid[8][0].includes('학생B'), 'cached grid must invalidate after content edit');
const teacher = scope.getTeacherGridData('9/5(토)', '테스트', false);
assert.equal(teacher.version, scope.checkDataVersion('9/5(토)'), 'teacher and poll revisions must match');
rows[2][1] = '학생C';
now = 32;
assert(scope.getTeacherGridData('9/5(토)', '테스트', false).grid[8][0].includes('학생C'), 'teacher cache must invalidate alongside base');

rows = [['sheet', 'student', 'sent', 'at', 'by', 'key'],
  ['9/5(토)', '학생A', '0', '', '', '9/5(토)||학생A'],
  ['9/5(토)', '학생A', '0', '', '', '9/5(토)||학생A']];
assert(scope.setStudentCardSentStatus_('9/5(토)', '학생A', true, 'admin').sent);
assert(scope.getStudentCardStatuses_('9/5(토)')['학생A'].sent, 'legacy duplicate must not mask new save');
scope.setStudentCardSentStatus_('9/5(토)', '학생B', true, 'admin');
scope.setStudentCardSentStatus_('9/5(토)', '학생B', false, 'admin');
assert.equal(rows.filter(row => row[1] === '학생B').length, 1);
assert.equal(scope.getStudentCardStatuses_('9/5(토)')['학생B'].sent, false);
rows = [['sheet', 'teacher', 'state', 'count', 'at', 'by']];
assert.equal(scope.setTeacherViewOverride_('9/5(토)', '테스트', 'viewed', 2, '01012345678').count, 2,
  'web-app override must work with null document lock');
assert.equal(acquisitions, 4);
assert.equal(flushed, 4);
assert.equal(locked, false);
console.log('Astra server checks passed: content revisions, cache invalidation, teacher polling, script locks, duplicate card state.');
