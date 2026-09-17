const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const header = ['sheet', 'student', 'sent', 'at', 'by', 'key'];
const copy = value => JSON.parse(JSON.stringify(value));
function harness(initial) {
  const state = { rows: copy(initial), locked: false, reads: [], finds: [], events: [], fail: '', missing: false };
  const sheet = {
    getLastRow: () => state.rows.length,
    getRange(row, col, count, width) {
      assert(row >= 1 && count >= 1 && col + width <= 7);
      return {
        createTextFinder(text) {
          assert.equal(width, 1);
          const flags = {};
          return {
            matchCase(v) { flags.case = v; return this; },
            matchEntireCell(v) { flags.entire = v; return this; },
            useRegularExpression(v) { flags.regex = v; return this; },
            matchFormulaText(v) { flags.formula = v; return this; },
            findAll() {
              assert.deepEqual(flags, { case: true, entire: false, regex: false, formula: false });
              if (state.fail === 'find') throw new Error('find failed');
              state.finds.push({ row, col, count, text });
              // Reverse API result order to prove product code explicitly sorts.
              return state.rows.slice(row - 1, row - 1 + count).flatMap((r, i) => String(r[col - 1] || '').includes(text) ? [{ getRow: () => row + i }] : []).reverse();
            }
          };
        },
        getDisplayValues() {
          if (state.fail === 'read') throw new Error('read failed');
          state.reads.push({ row, col, count, width });
          return state.rows.slice(row - 1, row - 1 + count).map(r => Array.from({ length: width }, (_, i) => r[col - 1 + i] || ''));
        },
        setValues(values) {
          assert(state.locked); if (state.fail === 'write') throw new Error('write failed');
          state.events.push('write');
          values.forEach((r, i) => { state.rows[row - 1 + i] = r.slice(); });
        }
      };
    },
    appendRow(row) { assert(state.locked); if (state.fail === 'write') throw new Error('write failed'); state.events.push('append'); state.rows.push(row); },
    hideSheet() { state.events.push('hide'); }
  };
  const ss = { getSheetByName: () => state.missing ? null : sheet, insertSheet: () => { state.missing = false; state.rows = []; return sheet; }, getSheets: () => [sheet, sheet] };
  const scope = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() { assert(state.locked); state.events.push('flush'); if (state.fail === 'flush') throw new Error('flush failed'); } },
    LockService: { getScriptLock: () => ({ waitLock(ms) { assert.equal(ms, 5000); if (state.fail === 'lock') throw new Error('lock failed'); assert(!state.locked); state.locked = true; state.events.push('lock'); }, releaseLock() { assert(state.locked); state.locked = false; state.events.push('release'); } }) },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' }, Utilities: { formatDate: () => 'now' }
  };
  vm.createContext(scope); vm.runInContext(source, scope);
  return { state, scope };
}
function originalRead(rows, day) {
  const result = {}; day = String(day || '').trim();
  if (!day) return result;
  rows.slice(1).forEach(r => {
    const date = String(r[0] || '').trim(), student = String(r[1] || '').trim();
    if (!date || !student || date !== day) return;
    result[student] = { studentName: student, sent: String(r[2] || '') === '1', updatedAt: String(r[3] || ''), updatedBy: String(r[4] || '') };
  });
  return result;
}
function assertRetired(h, day, student, sent = true) {
  const before = copy(h.state.rows);
  assert.throws(() => h.scope.setStudentCardSentStatus(day, student, sent, 'editor'), error => error.code === 'CARD_STORAGE_MOVED' && /새로고침/.test(error.message));
  assert.deepEqual(h.state.rows, before, 'retired writer preserves archive');
  assert.deepEqual(h.state.events, []);
  assert.deepEqual(h.state.reads, []);
  assert.deepEqual(h.state.finds, []);
}
const rows = [header];
for (let i = 0; i < 10000; i++) rows.push(['old-' + i, 'Other-' + i, '0', 'old', 'editor', 'old-' + i + '||Other-' + i]);
const day = '9/17(목).[A]+$', student = 'Alice.*[1]';
rows[20] = [day, student, '0', 'first', 'one', day + '||' + student];
rows[21] = [' \t' + day + '\u00a0', ' ' + student + ' ', '1', 'latest', 'two', ''];
rows[300] = [day + 'tail', student, '0', 'partial-day', '', 'other-key'];
rows[301] = [day.toLowerCase(), student.toLowerCase(), '1', 'case', '', ''];
rows[302] = [day, '', '1', 'blank-student', '', ''];
rows[303] = ['', student, '0', 'blank-day', '', ''];
rows[304] = [day, 'Bob', ' 1', 'space-sent', '', day + '||Bob'];
rows[305] = [day, student + 'tail', '0', 'partial-student', '', day + '||' + student + 'tail'];
rows[800] = ['inconsistent-date', 'inconsistent-student', '0', '', '', ' ' + day + '||' + student + ' '];
rows[900] = [day, student, '0', 'nonblank-key-precedence', '', 'unrelated-key'];
rows[950] = [' ' + day + ' ', ' ' + student + ' ', '0', 'last-legacy', '', ' \t'];
let parity = 0;
for (const dataset of [rows, [header], [], [header, ...rows.slice(1).reverse()]]) {
  const { scope } = harness(dataset);
  for (const d of [day, ' ' + day + ' ', day.toLowerCase(), 'missing', '', 'old-9999']) {
    assert.deepEqual(copy(scope.getStudentCardStatuses(d)), originalRead(dataset, d)); parity++;
  }
  for (const s of [student, student.toLowerCase(), 'Bob', 'missing', student + 'tail']) {
    const h = harness(dataset);
    assertRetired(h, day, s);
    parity++;
  }
}
const moving = harness(rows);
for (const [d, s, legacyDate, legacyStudent] of [['a', 'b||c', 'a||b', 'c'], ['a||b', 'c', 'a', 'b||c'], ['a', 'b||', 'a||b', '']]) {
  const dataset = [header, [legacyDate, legacyStudent, '0', '', '', '']];
  const h = harness(dataset);
  assertRetired(h, d, s);
}
assertRetired(moving, day, student);
moving.state.rows = [header, ['inserted', 'Other', '', '', '', ''], ...moving.state.rows.slice(1).reverse()];
assertRetired(moving, day, student, false);
assert.deepEqual(copy(moving.scope.getStudentCardStatuses(day)), originalRead(moving.state.rows, day), 'archive reads follow current sorted rows');
for (const fail of ['find', 'read', 'write', 'flush', 'lock']) {
  const h = harness(rows); h.state.fail = fail;
  assertRetired(h, day, student);
  assert.equal(h.state.locked, false);
  if (fail === 'find' || fail === 'read') assert.throws(() => h.scope.getStudentCardStatuses(day), /학생카드 발송 기록을 읽지 못했습니다/);
}
const missing = harness([header]); missing.state.missing = true;
assert.deepEqual(copy(missing.scope.getStudentCardStatuses(day)), {});
assertRetired(missing, day, student);
assert.equal(missing.state.rows.length, 1);
const blank = harness(rows);
assertRetired(blank, '', student);
assert.equal(blank.state.events.length, 0);
const metrics = {};
for (const mode of ['read', 'write']) {
  const h = harness(rows);
  if (mode === 'read') h.scope.getStudentCardStatuses(day); else assertRetired(h, day, student);
  metrics[mode] = { historyRows: rows.length - 1, originalCells: rows.length * 6, transferredCells: h.state.reads.reduce((sum, r) => sum + r.count * r.width, 0), payloadReadCalls: h.state.reads.length, finderCalls: h.state.finds.length };
  assert(metrics[mode].transferredCells < metrics[mode].originalCells / 10, 'sparse candidates with span fallback still reduce fixture transfer');
  assert(metrics[mode].payloadReadCalls <= 3);
}
assert.equal(metrics.read.finderCalls, 1); assert.equal(metrics.write.finderCalls, 0);
assert.equal(metrics.write.transferredCells, 0);
const contiguous = harness([header, ...Array.from({ length: 100 }, () => [day, student, '0', '', '', ''])]);
contiguous.scope.getStudentCardStatuses(day);
assert.equal(contiguous.state.reads.length, 1, 'contiguous matches batch into one payload read');
const scatteredRows = [header, ...Array.from({ length: 1000 }, (_, i) => [i % 10 === 0 ? day : 'other', i % 10 === 0 ? student : 'Other', '0', '', '', ''])];
for (const mode of ['read', 'write']) {
  const h = harness(scatteredRows);
  if (mode === 'read') assert.deepEqual(copy(h.scope.getStudentCardStatuses(day)), originalRead(scatteredRows, day));
  else assertRetired(h, day, student);
  assert(h.state.reads.length <= 3, '100 scattered candidates must not produce 100 RPCs');
}
console.log(JSON.stringify({ result: 'PASS', parityCases: parity, metrics, covered: 'archive read parity: duplicates, case, regex literals, partial matches, reverse finder order, sorted/inserted rows, empty/missing, errors, contiguous batches; retired writes preserve archive without reads, writes, locks, or flush' }, null, 2));
