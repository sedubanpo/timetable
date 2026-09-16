const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');
function load(source, names) {
  const ctx = vm.createContext({});
  for (const name of names) {
    const start = source.indexOf('function ' + name + '(');
    const end = source.indexOf('function ', start + 9);
    vm.runInContext(source.slice(start, end), ctx);
  }
  return ctx;
}
const a = load(client, ['isTeacherHeader', 'getSubjectName']);
const b = load(server, ['isTeacherHeader_', 'getSubjectName_']);
for (const [text, expected] of [
  ['생윤 1:1 정지호T', true], ['개별 수학 안준성T', true],
  ['상담 안준성T', true], ['정지호T', true],
  ['검증학생 검증고3 정규 정지호T', false],
  ['검증학생 정규 정지호T', false],
  ['검증학생 검증고3 정규 수학 개별 안준성T', false],
  ['검증학생 검증고3 정규 TEST 교재', false]
]) {
  assert.equal(a.isTeacherHeader(text), expected, text);
  assert.equal(b.isTeacherHeader_(text), expected, text);
}
for (const subject of ['생윤', '윤사', '생명과학', '지구과학', '사문', '수II']) {
  assert.equal(a.getSubjectName(subject + ' 1:1 정지호T'), subject);
  assert.equal(b.getSubjectName_(subject + ' 1:1 정지호T'), subject);
}
console.log('PASS client/server header parity and whole subject tokens (28 assertions).');
