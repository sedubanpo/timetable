import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { default: playwright } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Local fixtures only: never writes to Firebase or the deployed timetable.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.resolve(root, process.env.ASTRA_EVIDENCE_DIR || '.superloopy/evidence/astra-browser');
fs.mkdirSync(evidence, { recursive: true });
const baseline = process.argv.includes('--baseline');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root, 'Index.html')));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await playwright.chromium.launch({ headless: true });
const results = { baseline, browser: browser.version(), platform: process.platform, cases: {} };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    authState = { loggedIn: true, isMaster: true, isLookup: false, teacherName: 'QA 데스크' };
    attendanceRealtimeState.firebaseAdmin = true;
    attendanceRealtimeState.uid = 'qa-desk';
    attendanceRealtimeState.mode = 'admin';
    attendanceRealtimeState.loading = false;
    attendanceRealtimeState.error = '';
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    window.qaToday = attendanceLocalDateKey(now);
    window.qaYesterday = attendanceLocalDateKey(yesterday);
    attendanceRealtimeState.reports = [now, yesterday].map((date, i) => ({
      __id: 'fixture-' + i, reporterUid: 'qa-teacher', reporterName: '검증강사', studentName: '검증학생',
      school: '검증중', grade: '2', sheetName: attendanceDateLabel(date), dateKey: attendanceLocalDateKey(date),
      hour: 18, room: '3강의실', status: '지각', note: '자동 검증용 전달 내용',
      effectiveDeskState: 'NEW', deskState: 'NEW', deskReply: '', reportedAtMs: date.getTime()
    }));
    document.getElementById('mainPage').style.display = 'block';
    document.getElementById('introPage').style.display = 'none';
    document.getElementById('loginGate').style.display = 'none';
    openAttendanceInbox();
  });
  await page.waitForTimeout(80);
  results.cases.todayAnchor = await page.evaluate(() => {
    const nav = document.getElementById('attendanceInboxDateNav');
    const today = nav.querySelector('[aria-pressed="true"]');
    return Math.abs(today.getBoundingClientRect().left - nav.getBoundingClientRect().left) <= 3 && nav.scrollLeft > 0;
  });
  const reply = page.locator('.attendance-chat-thread textarea');
  await reply.fill('작성 중인 답변 — 보존 필요');
  await reply.evaluate(el => el.setSelectionRange(4, 8));
  results.cases.draftAndFocus = await page.evaluate(() => {
    const before = document.activeElement;
    // A real snapshot from another report must not destroy the active editor/IME/undo stack.
    renderAttendanceInbox();
    const after = document.querySelector('.attendance-chat-thread textarea');
    return after === before && after.value === '작성 중인 답변 — 보존 필요' && after.selectionStart === 4 && after.selectionEnd === 8;
  });
  results.cases.dateFocus = await page.evaluate(() => {
    const button = document.querySelector('.attendance-date-button[aria-pressed="true"]');
    button.focus(); renderAttendanceInbox();
    return document.activeElement === button;
  });
  await page.evaluate(() => { selectAttendanceInboxDate(window.qaYesterday); selectAttendanceInboxDate(window.qaToday); });
  results.cases.draftAcrossDates = await reply.inputValue() === '작성 중인 답변 — 보존 필요';
  results.cases.explicitDate = await page.evaluate(() => attendanceReportDateKey({ dateKey: '2025-01-03', sheetName: '1/3(금)', reportedAtMs: new Date(2026, 8, 5).getTime() }) === '2025-01-03');
  results.cases.invalidDate = await page.evaluate(() => attendanceDateFromKey('2026-02-31') === null);
  await page.screenshot({ path: path.join(evidence, baseline ? 'baseline-chat.png' : 'desktop-chat.png') });
  if (!baseline) {
    await page.evaluate(() => setAttendanceInboxView('database'));
    results.cases.tableContainment = await page.evaluate(() => {
      const row = document.querySelector('.attendance-db-table tbody tr');
      return [0, 3].every(i => {
        const cell = row.cells[i].getBoundingClientRect();
        const badge = row.cells[i].firstElementChild.getBoundingClientRect();
        return badge.left >= cell.left && badge.right <= cell.right;
      });
    });
    await page.screenshot({ path: path.join(evidence, 'desktop-database.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    results.cases.mobileContained = await page.evaluate(() => document.querySelector('.attendance-inbox-box').scrollWidth <= document.querySelector('.attendance-inbox-box').clientWidth);
    await page.screenshot({ path: path.join(evidence, 'mobile-database.png') });
    await page.evaluate(() => { attendanceRealtimeState.firebaseAdmin = false; setAttendanceInboxView('chat'); });
    results.cases.teacherReadOnly = await page.locator('.attendance-inbox-controls').count() === 0;
    await page.screenshot({ path: path.join(evidence, 'mobile-teacher.png') });
    results.cases.snapshotAvoidsGridRebuild = await page.evaluate(() => {
      let rebuilds = 0;
      const render = renderTable; renderTable = () => { rebuilds++; };
      applyAttendanceReportsSnapshot({ docs: attendanceRealtimeState.reports.map(report => ({ id: report.__id, data: () => ({ ...report }) })) }, 'qa-teacher', 'teacher');
      renderTable = render;
      return rebuilds === 0;
    });
    results.cases.longHistoryBounded = await page.evaluate(() => {
      attendanceRealtimeState.reports.push({ __id: 'ancient', dateKey: '1900-01-01', reportedAtMs: 1 });
      renderAttendanceInbox();
      return document.querySelectorAll('.attendance-date-button').length <= 32 && !!document.querySelector('[data-date-key="1900-01-01"]');
    });
    results.cases.logoutCancelsConnection = await page.evaluate(async () => {
      let resolveDb;
      let subscriptions = 0;
      getLiveFirebaseFirestore = () => new Promise(resolve => { resolveDb = resolve; });
      getLiveFirebaseAuth = () => Promise.resolve({ currentUser: { uid: 'qa-teacher' } });
      resolveAttendanceRealtimeMode = () => Promise.resolve('admin');
      buildAttendanceReportsQuery = () => ({ onSnapshot: () => { subscriptions++; return () => {}; } });
      startAttendanceRealtime();
      stopAttendanceRealtime();
      resolveDb({});
      await new Promise(resolve => setTimeout(resolve, 0));
      return subscriptions === 0 && attendanceRealtimeState.uid === '' && attendanceReplyEditors.size === 0;
    });
  }
  fs.writeFileSync(path.join(evidence, baseline ? 'baseline.json' : 'browser-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (!baseline) for (const [name, passed] of Object.entries(results.cases)) assert.equal(passed, true, name);
} finally { await browser.close(); server.close(); }
