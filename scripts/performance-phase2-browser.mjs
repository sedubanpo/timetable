import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { default: playwright } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.resolve(root, process.env.PHASE2_EVIDENCE_DIR || '.superloopy/sessions/performance-phase2-20260917/evidence/browser');
fs.mkdirSync(evidence, { recursive: true });
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root, 'Index.html')));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    authState = { loggedIn: true, isMaster: false, isLookup: false, loginId: 'qa', teacherName: '검증강사' };
    accessMode = 'teacher'; currentSheetName = '9/17(목)';
    document.getElementById('mainPage').style.display = 'flex';
    document.getElementById('mainSheetSelector').innerHTML = '<option>9/17(목)</option>';
    const fixtureAuth = { currentUser: { uid: 'qa', getIdToken: () => Promise.resolve('synthetic') } };
    getLiveFirebaseAuth = () => Promise.resolve(fixtureAuth);
    let rows = [{ studentId: 'qa-alice', studentName: 'Alice', school: '검증중2', status: 'INACTIVE' }];
    fetchEnrollmentStatusStudents = () => Promise.resolve(rows);
    loadOperationMemosForCurrentSheet = () => Promise.resolve([]);
    const render = renderTable;
    let renders = 0;
    renderTable = function(...args) { renders++; return render(...args); };
    const data = { headers: ['1강의실'], grid: { 18: [['개별 수학 검증강사T', 'Alice 검증중2']] }, version: 'qa' };
    async function settle() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
    processData(data, false); await settle();
    const initialRenders = renders;
    const initialWarning = document.querySelectorAll('#scheduleTable .enrollment-alert-badge').length;
    studentEnrollmentStatusState.loadedAt = 0;
    renders = 0; processData(data, false);
    const node = document.querySelector('#scheduleTable .student-item');
    const fallbackNode = document.getElementById('scheduleTable').firstElementChild;
    await settle();
    const sameRenders = renders;
    const sameNode = node ? node === document.querySelector('#scheduleTable .student-item') : fallbackNode === document.getElementById('scheduleTable').firstElementChild;
    rows = [{ ...rows[0], status: 'ACTIVE' }];
    studentEnrollmentStatusState.loadedAt = 0;
    renders = 0; processData(data, false); await settle();
    const changedRenders = renders;
    const changedWarning = document.querySelectorAll('#scheduleTable .enrollment-alert-badge').length;
    if (pollingTimer) clearInterval(pollingTimer);
    return { initialRenders, initialWarning, sameRenders, sameNode, changedRenders, changedWarning };
  });
  assert.equal(result.initialRenders, 2);
  assert.equal(result.initialWarning, 1);
  assert.equal(result.sameRenders, 1);
  assert.equal(result.sameNode, true);
  assert.equal(result.changedRenders, 2);
  assert.equal(result.changedWarning, 0);
  fs.writeFileSync(path.join(evidence, 'enrollment-render.json'), JSON.stringify({ browser: browser.version(), ...result }, null, 2));
  console.log(JSON.stringify(result));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
