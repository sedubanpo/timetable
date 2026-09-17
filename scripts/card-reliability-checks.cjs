const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
const app = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim()).pop();
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { style: {}, textContent: '', hidden: true, innerHTML: '', value: '', classList: { add() {}, remove() {} } });
  return elements.get(id);
};
const scope = { console, window: { addEventListener() {} }, document: { addEventListener() {}, getElementById: element, querySelectorAll: () => [] }, localStorage: { getItem: () => null }, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, alert() {}, URLSearchParams, Date, Promise, Set, Map };
vm.createContext(scope);
vm.runInContext(app, scope);
const run = code => vm.runInContext(code, scope);
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
run(`filterStudentImageList = renderStudentImagePreview = refreshStudentImageListSelectionState = () => {};
  authState = {loggedIn:false, loginId:''}; currentSheetName='day1';
  globalThis.requests=[]; callServer=(method,args)=>new Promise((resolve,reject)=>requests.push({method,args,resolve,reject}));`);
async function read(statuses) {
  run('loadStudentCardStatuses();');
  scope.nextStatuses = statuses;
  run('requests.at(-1).resolve(nextStatuses);');
  await flush();
}
(async () => {
  assert.match(run(`getStudentCardErrorDetail({code:'API_TIMEOUT',requestId:'req_12'})`), /응답 시간 초과.*req_12/);
  assert(!run(`getStudentCardErrorDetail({code:'secret student',requestId:'<secret>',message:'private'})`).includes('secret'));
  const logout = app.slice(app.indexOf('function logoutTeacher()'), app.indexOf('function logoutTeacher()') + 400);
  assert(logout.includes('studentCardStatusContext = ""') && logout.includes('studentCardStatusSequence++'), 'logout invalidates card history and pending requests');
  run(`markStudentCardSentStatus('Alice',true);`);
  assert.equal(run('requests.length'), 0, 'unknown status blocks writes');
  await read({ Alice: { sent: true, updatedAt: 'known' } });
  run(`loadStudentCardStatuses();requests.at(-1).reject(new Error('read unavailable'));`);
  await flush();
  assert.equal(run('studentCardSentMap.Alice.updatedAt'), 'known');
  assert.match(run(`getStudentCardStatusLabel('Alice')`), /이전 기록/);
  assert.equal(element('studentCardStatusNotice').hidden, false);
  assert.equal(run('canChangeStudentCardStatus()'), false);
  run(`currentSheetName='day2';loadStudentCardStatuses();requests.at(-1).reject(new Error('read unavailable'));`);
  await flush();
  assert.equal(run('Object.keys(studentCardSentMap).length'), 0, 'other sheet must not inherit history');
  assert.equal(run(`getStudentCardStatusLabel('Alice')`), '상태 확인 필요');
  await read({ Alice: { sent: false }, Bob: { sent: false } });
  run(`markStudentCardSentStatus('Alice',true,{silent:true});globalThis.count=requests.length;markStudentCardSentStatus('Bob',true);`);
  assert.equal(run('requests.length'), run('count'), 'write lock blocks second write');
  assert.equal(run('studentCardSentMap.Alice.sent'), false, 'no optimistic success');
  run(`requests.at(-1).reject(new Error('lost response'));`);
  await flush();
  assert.equal(run('requests.at(-1).method'), 'getStudentCardStatuses');
  assert.equal(run('studentCardStatusLoading'), true, 'lock retained through reconciliation');
  run(`requests.at(-1).resolve({Alice:{sent:true,updatedAt:'confirmed'}});`);
  await flush();
  assert.equal(run('studentCardSentMap.Alice.updatedAt'), 'confirmed');
  assert.equal(run('canChangeStudentCardStatus()'), true);
  run(`markStudentCardSentStatus('Alice',false,{silent:true}).catch(e=>globalThis.failure=e.code);requests.at(-1).reject(new Error('lost'));`);
  await flush();
  run(`requests.at(-1).resolve({Alice:{sent:true}});`);
  await flush();
  assert.equal(run('failure'), 'CARD_STATUS_MISMATCH');
  assert.match(run('studentCardStatusError'), /異|다릅니다/);
  await read({Alice:{sent:true}});
  run(`markStudentCardSentStatus('Alice',false,{silent:true}).catch(()=>{});requests.at(-1).reject(new Error('lost'));`);
  await flush();
  run(`requests.at(-1).reject(new Error('read lost'));`);
  await flush();
  assert.match(run('studentCardStatusError'), /저장 결과를 확인하지 못/);
  assert.equal(run('studentCardSentMap.Alice.sent'), true);
  assert.equal(run('canChangeStudentCardStatus()'), false);
  await read({Alice:{sent:false}});
  run(`markStudentCardSentStatus('Alice',true,{silent:true});requests.at(-1).reject(new Error('lost'));`);
  await flush();
  run(`globalThis.stale=requests.at(-1);authState.loginId='changed';loadStudentCardStatuses();stale.resolve({Alice:{sent:true}});requests.at(-1).reject(new Error('unavailable'));`);
  await flush();
  assert.equal(run('Object.keys(studentCardSentMap).length'), 0, 'reconciliation cannot cross session');
  assert.equal(run('requests.filter(r=>r.method==="setStudentCardSentStatus").length'), 4, 'mutations never replayed');

  let locked = false, failRead = false, failWrite = false;
  let rows = [['sheet','student','sent','at','by','key']];
  const sheet = {
    getLastRow() { return rows.length; },
    getRange(row, col, count, width) {
      assert(col >= 1 && col + width - 1 <= 6, 'card operations remain within six schema columns');
      return {
        createTextFinder(text) {
          return {
            matchCase(value) { assert.equal(value, true); return this; },
            matchEntireCell(value) { assert.equal(value, false); return this; },
            useRegularExpression(value) { assert.equal(value, false); return this; },
            matchFormulaText(value) { assert.equal(value, false); return this; },
            findAll() { if (failRead) throw new Error('permission'); return rows.slice(row - 1, row - 1 + count).flatMap((item, i) => String(item[col - 1] || '').includes(text) ? [{ getRow: () => row + i }] : []); }
          };
        },
        getDisplayValues() { if (failRead) throw new Error('permission'); return rows.slice(row - 1, row - 1 + count).map(item => item.slice(col - 1, col - 1 + width)); },
        setValues(values) { assert(locked); if (failWrite) throw new Error('write failed'); rows[row - 1] = values[0]; }
      };
    },
    appendRow(row) { assert(locked); if (failWrite) throw new Error('write failed'); rows.push(row); }
  };
  const server = { SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }), flush() { assert(locked); } }, LockService: { getScriptLock: () => ({ waitLock() { assert(!locked); locked=true; }, releaseLock() { assert(locked); locked=false; } }) }, Session: { getScriptTimeZone: () => 'Asia/Seoul' }, Utilities: { formatDate: () => 'now' } };
  vm.createContext(server); vm.runInContext(fs.readFileSync(path.join(root,'Code.gs'),'utf8'),server);
  assert.equal(typeof server.getStudentCardStatuses, 'function');
  assert.equal(typeof server.setStudentCardSentStatus, 'function');
  assert.equal(server.setStudentCardSentStatus('day','Alice',true,'').sent,true);
  assert.equal(server.getStudentCardStatuses('day').Alice.sent,true);
  failRead=true; assert.throws(()=>server.getStudentCardStatuses('day'),/permission/);
  failRead=false; failWrite=true; assert.throws(()=>server.setStudentCardSentStatus('day','Bob',true,''),/write failed/);
  assert.equal(locked,false,'failed mutation releases lock');
  console.log('Card reliability checks passed: native wrappers, read preservation/context isolation, unknown lock, reconciliation success/mismatch/unknown, session races, server locks.');
})().catch(error=>{console.error(error);process.exitCode=1;});
