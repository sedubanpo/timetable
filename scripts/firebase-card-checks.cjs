const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const path = require('node:path');
const root = path.join(__dirname, '..');
const files = ['Index.html', 'docs/index.html'];
function harness(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const provider = source.slice(source.indexOf('      // Card history has a single'), source.indexOf('      function normalizeEnrollmentStudentName'));
  const router = source.slice(source.indexOf('      function callServer('), source.indexOf('      window.onload'));
  let session = 'session-A';
  const auth = { currentUser: { uid: 'admin-1' } };
  const state = { config: { activeDatasetId: 'dataset-A', migrationComplete: true }, docs: new Map(), reads: [], writes: [], transactions: 0 };
  const snapshot = value => ({ exists: !!value, data: () => value, metadata: { fromCache: !!state.cache, hasPendingWrites: false } });
  const ref = p => ({ path: p, async get(options) {
    assert.equal(options.source, 'server'); state.reads.push(p);
    if (state.failReads) throw new Error('offline');
    if (p.endsWith('/statuses')) return { metadata: { fromCache: !!state.cache }, forEach: fn => { for (const [key, data] of state.docs) if (key.startsWith(p + '/')) fn(snapshot(data)); } };
    const data = p === 'liveTimetableCardConfig/banpo' ? state.config : state.docs.get(p);
    return snapshot(state.wrongOperation && p !== 'liveTimetableCardConfig/banpo' && data ? { ...data, operationId: 'other' } : data);
  }, doc: id => ref(p + '/' + id) });
  const db = { doc: ref, collection: ref, async runTransaction(fn) {
    state.transactions++;
    if (state.beforeTx) state.beforeTx();
    const writes = [];
    const tx = { get: async r => snapshot(r.path === 'liveTimetableCardConfig/banpo' ? state.config : state.docs.get(r.path)), set: (r, data) => writes.push([r.path, data]) };
    await fn(tx);
    if (state.retryTx) { const firstOperation = writes[0][1].operationId; writes.length = 0; await fn(tx); assert.equal(writes[0][1].operationId, firstOperation, 'stable operation ID on retry'); }
    if (state.failWrite) throw new Error('permission-denied');
    if (state.pauseCommit) await new Promise(resolve => { state.release = resolve; });
    for (const [key, data] of writes) { state.docs.set(key, data); state.writes.push([key, data]); }
    if (state.lostResponse) throw new Error('lost response');
  } };
  const context = { crypto: webcrypto, TextEncoder, Uint8Array, setTimeout: (fn, ms) => setTimeout(fn, state.fastDeadline ? 5 : ms), clearTimeout, getScheduleSessionKey: () => session, getLiveFirebaseAuth: async () => auth, getLiveFirebaseFirestore: async () => db, firebase: { firestore: { FieldValue: { serverTimestamp: () => ({ toDate: () => new Date('2026-09-17T00:00:00Z') }) } } }, hasGasRunner: () => { throw new Error('GAS MUST NOT BE CALLED'); } };
  vm.createContext(context); vm.runInContext(provider + router, context);
  return { state, auth, context, session: value => { session = value; }, call: (method, args) => context.callServer(method, args), read: sheet => context.callServer('getStudentCardStatuses', [sheet]), write: (sheet, student, sent) => context.callServer('setStudentCardSentStatus', [sheet, student, sent, 'untrusted-login-id']) };
}
(async () => {
  for (const file of files) {
    const h = harness(file);
    const sheet = '  9/17 특강 [가]  ', student = '홍/길동 😀';
    const hash = name => createHash('sha256').update(JSON.stringify([name.trim()])).digest('hex');
    assert.equal(await h.context.liveCardHash(student), hash(student));
    assert.notEqual(await h.context.liveCardHash('가 나'), await h.context.liveCardHash('가나'));
    assert.notEqual(await h.context.liveCardHash('é'), await h.context.liveCardHash('é'));
    h.state.config = null;
    await assert.rejects(h.read(sheet), { code: 'CARD_STORAGE_NOT_READY' });
    assert.equal(h.state.transactions, 0);
    h.state.config = { activeDatasetId: '../bad', migrationComplete: true };
    await assert.rejects(h.read(sheet), { code: 'CARD_STORAGE_NOT_READY' });
    h.state.config = { activeDatasetId: 'dataset-A', migrationComplete: true };
    await assert.rejects(h.write(sheet, student, true), /refresh required/);
    await h.read(sheet);
    const result = await h.write(sheet, student, true);
    assert.equal(result.updatedBy, 'admin-1'); assert.equal(result.updatedAt, '2026-09-17T00:00:00.000Z'); assert.equal(result.revision, 1);
    assert.equal(h.state.writes[0][0], `liveTimetableCardStores/dataset-A/sheets/${hash(sheet)}/statuses/${hash(student)}`);
    assert.deepEqual(Object.keys(h.state.writes[0][1]).sort(), ['operationId','revision','sent','sheetName','studentName','updatedAt','updatedBy'].sort());
    const imported = h.state.docs.get(h.state.writes[0][0]); imported.legacyUpdatedAt = 'legacy-date'; imported.legacyUpdatedBy = 'legacy-actor';
    assert.equal((await h.read(sheet))[student].updatedAt, 'legacy-date', 'imported first revision preserves displayed audit date');
    h.state.retryTx = true;
    const result2 = await h.write(sheet, student, false); assert.equal(result2.revision, 2); assert.notEqual(result.operationId, result2.operationId);
    assert.equal(result2.legacyUpdatedAt, 'legacy-date'); assert.equal(result2.legacyUpdatedBy, 'legacy-actor');
    assert.equal(result2.updatedAt, '2026-09-17T00:00:00.000Z', 'subsequent changes show server timestamp');
    h.state.retryTx = false;
    h.state.config.activeDatasetId = 'dataset-B';
    await assert.rejects(h.write(sheet, student, true), /dataset changed/);
    h.state.config.activeDatasetId = 'dataset-A';
    h.state.beforeTx = () => { h.state.config.activeDatasetId = 'dataset-B'; };
    await assert.rejects(h.write(sheet, student, true), /dataset changed/);
    h.state.config.activeDatasetId = 'dataset-A';
    h.state.beforeTx = () => { h.auth.currentUser = { uid: 'different' }; };
    await assert.rejects(h.write(sheet, student, true), /session changed/);
    h.state.beforeTx = null; h.auth.currentUser = { uid: 'admin-1' };
    await h.read(sheet);
    h.state.wrongOperation = true;
    await assert.rejects(h.write(sheet, student, true), /confirmation mismatch/);
    h.state.wrongOperation = false;
    h.state.failWrite = true;
    const count = h.state.transactions;
    await assert.rejects(h.write(sheet, student, true), /permission-denied/);
    assert.equal(h.state.transactions, count + 1, 'no mutation replay');
    h.state.failWrite = false; h.state.cache = true;
    await assert.rejects(h.read(sheet), /server unavailable/);
    h.state.cache = false; h.state.failReads = true;
    await assert.rejects(h.read(sheet), /offline/);
    h.state.failReads = false; h.state.pauseCommit = true; h.state.fastDeadline = true;
    await assert.rejects(h.write(sheet, student, true), { code: 'API_TIMEOUT' });
    await assert.rejects(h.read(sheet), /still pending/);
    await assert.rejects(h.write(sheet, student, true), /still pending/);
    h.state.release(); await new Promise(resolve => setTimeout(resolve, 1));
    const confirmed = await h.read(sheet); assert.equal(confirmed[student].sent, true);
    h.auth.currentUser = null;
    await assert.rejects(h.read(sheet), /session changed/);
    console.log('PASS', file, 'direct Firebase card provider: identity, config, server reads, auth, correlation, no replay, pending lock');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
