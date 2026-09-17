const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
function harness() {
  let now = 0, failGet = false, failPut = false, maxBytes = Infinity;
  const entries = new Map(), counts = { reads: 0, digests: 0, filtered: 0, membershipBuilds: 0, teacherBytes: 0, membershipBytes: 0 };
  const sheets = new Map([
    ['2020-01-01', [['시간', '1강의실', '2강의실'], ['8:00', '3:1 수학 김샘T', '영어 AliceT'], ['', '학생A', '학생B'], ['', '수학 다른샘T', '']]],
    ['2026-09-17', [['시간', '1강의실', '2강의실'], ['9:00', '김샘T에게 확인필요', '과학 ALICE T'], ['', '수학 김샘T', '학생C']]],
    ['2026-09-18', [['시간', '1강의실'], ['8:00', '김샘T에게 확인필요'], ['', '학생D']]],
    ['2026-09-19', [['시간', '1강의실'], ['8:00', '수학 MatT'], ['', '학생E']]],
    ['2026-09-17 사본', [['시간', '1강의실'], ['8:00', '수학 김샘T']]],
    ['업무2026', [['시간', '1강의실'], ['8:00', '수학 김샘T']]]
  ]);
  const cache = {
    get(key) { if (failGet) throw Error('cache get unavailable'); const v = entries.get(key); return v && v.expires > now ? v.value : null; },
    put(key, value, seconds) {
      if (failPut || Buffer.byteLength(value) > maxBytes) throw Error('cache put limit');
      entries.set(key, { value, expires: now + seconds });
      if (key.startsWith('TEACHER_GRID_')) counts.teacherBytes += Buffer.byteLength(value);
      if (key.startsWith('SCHEDULE_TEACHERS_')) { counts.membershipBuilds++; counts.membershipBytes += Buffer.byteLength(value); }
    }
  };
  function sheet(name) { return { getName: () => name, getDataRange() { counts.reads++; return { getDisplayValues: () => sheets.get(name).map(row => row.slice()) }; } }; }
  const scope = {
    CacheService: { getScriptCache: () => cache },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheets: () => [...sheets.keys()].map(sheet), getSheetByName: name => sheets.has(name) ? sheet(name) : null }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest(algorithm, value) { counts.digests++; return [...crypto.createHash('sha256').update(value).digest()]; } }
  };
  vm.createContext(scope); vm.runInContext(source, scope);
  const teacherGrid = scope.getTeacherGridData;
  scope.getTeacherGridData = (...args) => { counts.filtered++; return teacherGrid(...args); };
  function old(name, force = false) {
    const selected = scope.normalizeTeacherName_(name);
    if (!selected) return scope.getSheetNames();
    return scope.getSheetNames().filter(date => {
      if (date.includes('사본')) return false;
      const data = scope.getTeacherGridData(date, selected, force);
      return data && !data.error && scope.teacherGridHasItems_(data);
    });
  }
  const plain = value => JSON.parse(JSON.stringify(value));
  return { scope, counts, entries, sheets, old: (...args) => plain(old(...args)), get: (...args) => plain(scope.getTeacherSheetNames(...args)), time: value => { now = value; }, failures: (get, put, limit = Infinity) => { failGet = get; failPut = put; maxBytes = limit; } };
}
const names = ['김샘', '김 샘 선생님', '다른샘', 'Alice', 'ALICE T', '없는강사', 'Matt', 'Mat', 'TT', ''];
for (const name of names) {
  const original = harness(), updated = harness();
  assert.deepEqual(updated.get(name), original.old(name), `old algorithm parity: ${name}`);
  assert.deepEqual(updated.get(name, true), original.old(name, true), `force parity: ${name}`);
}
const h = harness(), old = harness();
assert.deepEqual(h.get('김샘'), ['2020-01-01', '2026-09-17'], 'all history, valid 3:1 and note exclusion');
old.old('김샘'); h.get('Alice'); old.old('Alice');
assert.equal(h.counts.reads, 4); assert.equal(old.counts.reads, 4);
assert.equal(h.counts.filtered, 0); assert.equal(old.counts.filtered, 8);
assert.equal(h.counts.membershipBuilds, 4, 'second teacher shares membership');
const warm = { ...h.counts }; h.get('김샘');
assert.deepEqual(h.counts, warm, '120-second teacher-list hit does no work');
assert.equal(h.entries.get('TEACHER_SHEETS_V3_김샘').expires, 120);
assert.equal(h.entries.get('SCHEDULE_REVISION_V1_2020-01-01').expires, 15);
h.sheets.get('2020-01-01')[1][1] = '수학 새샘T';
assert.deepEqual(h.get('김샘'), ['2020-01-01', '2026-09-17'], 'list freshness window unchanged');
assert.deepEqual(h.get('김샘', true), ['2026-09-17'], 'force bypasses list/base/membership');
assert.equal(h.counts.reads, 8);
h.sheets.get('2020-01-01')[1][1] = '수학 김샘T';
h.time(120);
assert.deepEqual(h.get('김샘'), ['2020-01-01', '2026-09-17']);
assert.equal(h.counts.reads, 12, 'list expiry still reads each base after revision expiry');
const builds = h.counts.membershipBuilds;
h.time(240); h.get('김샘');
assert.equal(h.counts.membershipBuilds, builds, 'unchanged revision reuses membership');
assert.equal(h.counts.reads, 16, 'residual full-sheet revision reads explicit');
for (const mode of [[false, true], [true, false], [true, true], [false, false, 1]]) {
  const failing = harness(); failing.failures(...mode);
  assert.deepEqual(failing.get('김샘'), ['2020-01-01', '2026-09-17'], `cache failure/oversize ${mode}`);
}
const corrupt = harness(); corrupt.get('김샘');
corrupt.entries.set('SCHEDULE_TEACHERS_V1_2020-01-01', { value: '{bad', expires: 999 });
corrupt.entries.delete('TEACHER_SHEETS_V3_김샘');
assert.deepEqual(corrupt.get('김샘'), ['2020-01-01', '2026-09-17']);
for (const invalid of ['{bad', 'null', '{"version":"fake","grid":{},"headers":null}']) {
  const brokenBase = harness(); brokenBase.get('김샘');
  brokenBase.entries.set('SHEET_DATA_V64_2020-01-01', { value: invalid, expires: 999 });
  brokenBase.entries.delete('TEACHER_SHEETS_V3_김샘');
  assert.deepEqual(brokenBase.get('김샘'), ['2020-01-01', '2026-09-17'], 'corrupt base falls through to live read');
}
// Extra grid columns and out-of-hours rows never become visible dates.
const edge = harness();
edge.scope.getFixedGridData = () => ({ headers: ['room'], grid: { 8: [[], ['수학 유령T']], 23: [['수학 유령T']] }, version: 'edge' });
assert.deepEqual(edge.get('유령'), edge.old('유령'));
console.log(JSON.stringify({ ok: true, parityCases: names.length, coldTwoTeacherBaseline: old.counts, coldTwoTeacherUpdated: warm, residualReadsAfterTwoListExpiries: h.counts.reads, cacheFailureModes: 4 }, null, 2));
