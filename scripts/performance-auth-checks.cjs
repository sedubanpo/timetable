const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const events = [];
let clock = 0;
let reads = 0;
let lookupCalls = 0;
let documentCalls = 0;
let disabled = false;
let lookupStatus = 200;
let documentStatus = 200;
let role = 'INSTRUCTOR';
let status = 'ACTIVE';
let appAllowed = true;
let rows = [];
const response = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
const string = value => ({ stringValue: value });
const scope = {
  Date: { now: () => clock },
  console: { log: line => events.push(JSON.parse(line)) },
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => ({ getDataRange: () => {
    reads++;
    return { getValues: () => rows };
  } }) }) },
  UrlFetchApp: {
    fetch(url, options) {
      lookupCalls++;
      assert.equal(JSON.parse(options.payload).idToken, 'PRIVATE_TOKEN');
      clock += 7;
      return response(lookupStatus, { users: [{ localId: 'PRIVATE_UID', email: 'PRIVATE_EMAIL', disabled }] });
    },
    fetchAll(requests) {
      documentCalls++;
      assert.equal(requests.length, 3);
      requests.forEach(request => assert.equal(request.headers.Authorization, 'Bearer PRIVATE_TOKEN'));
      clock += 11;
      return [
        response(documentStatus, { fields: { role: string(role), status: string(status), name: string('PRIVATE_TEACHER'), loginId: string('PRIVATE_LOGIN') } }),
        response(200, { fields: {} }),
        response(200, { fields: { apps: { mapValue: { fields: { liveTimetable: { booleanValue: appAllowed } } } } } })
      ];
    }
  }
};
vm.createContext(scope);
vm.runInContext(source, scope);
const plain = value => JSON.parse(JSON.stringify(value));

// Restore exactly the removed list bookkeeping to form a legacy reference.
const modernLegacy = source.match(/function authenticateTeacher\([^]*?\n}\n/)[0];
assert(!modernLegacy.includes('teacherNames.sort()'));
assert(!modernLegacy.includes('teacherNames.indexOf'));
const reference = modernLegacy.replace('function authenticateTeacher(', 'function originalAuthenticateTeacher(')
  .replace('  var matchedAccount = null;', '  var teacherNames = [];\n  var matchedAccount = null;')
  .replace('    var dbPw =', '    if (dbName && teacherNames.indexOf(dbName) === -1) teacherNames.push(dbName);\n    var dbPw =')
  .replace('    return {\n      ok: true,\n      success: true,\n      loginId: matchedAccount.loginId,', '    teacherNames.sort();\n    return {\n      ok: true,\n      success: true,\n      loginId: matchedAccount.loginId,');
vm.runInContext(reference, scope);
rows = [
  ['id', 'name', '', '', '', '', 'pw'],
  ['010-1111-2222', 'First', '', '', '', '', 'secret'],
  ['01011112222', 'Duplicate', '', '', '', '', 'second'],
  ['01033334444', 'Blank', '', '', '', '', ''],
  ['01042327428', 'Master', '', '', '', '', 'adminpw'],
  ['', 'Skipped', '', '', '', '', '']
];
for (const credentials of [
  ['010-1111-2222', 'secret'], ['11112222', 'secret'], ['01011112222', 'second'],
  ['01011112222', 'wrong'], ['01033334444', '01033334444'], ['01033334444', '33334444'],
  ['01042327428', 'adminpw'], ['nonexistent', 'wrong'],
  [scope.LOOKUP_LOGIN_ID, scope.LOOKUP_LOGIN_PASSWORD]
]) {
  const before = reads;
  const actual = scope.authenticateTeacher(...credentials);
  const actualReads = reads - before;
  const expected = scope.originalAuthenticateTeacher(...credentials);
  assert.deepEqual(plain(actual), plain(expected));
  assert.equal(reads - before - actualReads, actualReads);
}
assert(source.includes('var result = { byId: byId, teacherNames: teacherNames };'), 'real roster helper remains');

// Every call still fetches fresh authorization; timing covers common internals.
scope.getTeacherGridData = (sheet, teacher) => ({ sheet, teacher });
scope.getTeacherSheetNames = teacher => [teacher];
const first = scope.authenticateTeacher('', '', 'PRIVATE_TOKEN', true);
assert.equal(first.teacherName, 'PRIVATE_TEACHER');
assert.deepEqual(plain(scope.getAuthenticatedTeacherSheets('forged', false, 'PRIVATE_TOKEN')), ['PRIVATE_TEACHER']);
assert.deepEqual(plain(scope.getAuthenticatedSchedule('day', 'forged', false, 'PRIVATE_TOKEN')), { sheet: 'day', teacher: 'PRIVATE_TEACHER' });
assert.equal(lookupCalls, 3);
assert.equal(documentCalls, 3);
assert.deepEqual(events.slice(0, 2), [
  { stage: 'auth_lookup', durationMs: 7, succeeded: true },
  { stage: 'auth_documents', durationMs: 11, succeeded: true }
]);
for (const mutate of [() => { disabled = true; }, () => { status = 'INACTIVE'; }, () => { role = 'STUDENT'; }, () => { appAllowed = false; }]) {
  disabled = false; status = 'ACTIVE'; role = 'INSTRUCTOR'; appAllowed = true;
  mutate();
  assert.throws(() => scope.getAuthenticatedSchedule('day', 'forged', false, 'PRIVATE_TOKEN'), /FIREBASE_BLOCKED/);
}
disabled = false; status = 'ACTIVE'; role = 'INSTRUCTOR'; appAllowed = true;
lookupStatus = 401;
assert.throws(() => scope.authenticateFirebaseTeacher_('PRIVATE_TOKEN', true), /FIREBASE_AUTH_FAILED/);
assert.equal(events.at(-1).succeeded, false);
lookupStatus = 200; documentStatus = 403;
assert.throws(() => scope.authenticateFirebaseTeacher_('PRIVATE_TOKEN', true), /FIREBASE_PROFILE_FETCH_FAILED/);
assert.deepEqual(events.at(-1), { stage: 'auth_documents', durationMs: 11, succeeded: false });
documentStatus = 200;

// Instrumentation never changes operation results/errors or leaks context.
const error = new Error('PRIVATE_RAW_ERROR');
assert.throws(() => scope.measureAuthStage_('auth_lookup', () => { throw error; }), caught => caught === error);
const count = events.length;
assert.equal(scope.measureAuthStage_('PRIVATE_STAGE', () => 42), 42);
assert.equal(events.length, count);
for (const event of events) {
  assert.deepEqual(Object.keys(event).sort(), ['durationMs', 'stage', 'succeeded']);
  assert(Number.isFinite(event.durationMs) && event.durationMs >= 0);
  assert.equal(typeof event.succeeded, 'boolean');
  assert(['auth_lookup', 'auth_documents'].includes(event.stage));
}
assert(!JSON.stringify(events).includes('PRIVATE_'));
scope.console.log = () => { throw new Error('logging unavailable'); };
assert.equal(scope.measureAuthStage_('auth_lookup', () => 23), 23);
assert.throws(() => scope.measureAuthStage_('auth_documents', () => { throw error; }), caught => caught === error);
scope.console = undefined;
assert.equal(scope.measureAuthStage_('auth_lookup', () => 24), 24);
assert.equal(scope.authenticateFirebaseTeacher_('PRIVATE_TOKEN', true).ok, true);
console.log('PASS auth: 9 legacy differential fixtures; fresh per-request authorization/revocation; fixed-label numeric timing and privacy/failure isolation.');
