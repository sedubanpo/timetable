// Actual page + synthetic schedule; all external requests are blocked. No live data writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const { default: pw } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd();
const server = http.createServer((req, res) => {
  const name = req.url.split('?')[0];
  const file = name === '/' ? (process.env.PERF_HTML || path.join(root, 'docs/index.html')) : path.join(root, 'docs', name);
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.setHeader('Content-Type', file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : 'text/html');
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await pw.chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Seoul' });
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    if (route.request().url().startsWith('http://127.0.0.1:')) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await page.clock.install({ time: new Date('2026-10-17T12:30:00+09:00') });
  await page.clock.pauseAt(new Date('2026-10-17T12:30:01+09:00'));
  await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'domcontentloaded' });
  const counts = await page.evaluate(() => {
    authState = { loggedIn: true, isMaster: true, isLookup: false, role: 'ADMIN', loginId: 'fixture' };
    currentSheetName = '10/17(토)'; accessMode = 'all';
    document.getElementById('mainPage').style.display = 'flex';
    document.getElementById('introPage').style.display = 'none';
    document.getElementById('loginGate').style.display = 'none';
    const headers = Array.from({ length: 14 }, (_, i) => (i + 1) + '강의실');
    const grid = {};
    for (let h = 9; h < 22; h++) grid[h] = headers.map((_, i) => [
      '개별 ' + (i % 2 ? '영어' : '수학') + ' 검증강사' + String.fromCharCode(65 + i) + 'T',
      ...Array.from({ length: 6 }, (_, s) => '검증학생' + i + '_' + s + ' 검증고2 정규')
    ]);
    lastData = { headers, grid }; renderTable(lastData, true);
    return { cells: document.querySelectorAll('.cell-inner').length, items: document.querySelectorAll('#scheduleTable .student-item').length };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const before = await metrics();
  const results = [];
  for (const query of ['검증학생1_', '영어', '없는학생', '', '검증강사D', '']) {
    const started = process.hrtime.bigint();
    results.push(await page.evaluate(query => {
      document.getElementById('searchInput').value = query;
      searchTable();
      // Flush the final layout, outside the measured JS duration.
      document.getElementById('scheduleTable').getBoundingClientRect();
      return { query, visibleCells: [...document.querySelectorAll('.cell-inner')].filter(e => !e.classList.contains('hidden-cell')).length,
        highlights: document.querySelectorAll('#scheduleTable .highlight-text').length };
    }, query));
    results.at(-1).elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  }
  const after = await metrics();
  assert.deepEqual(results.map(r => r.visibleCells), [13, 91, 0, 182, 13, 182]);
  assert(results[0].highlights > 0); assert.equal(results.at(-1).highlights, 0);
  const beforeClock = await metrics();
  const clock = await page.evaluate(() => {
    const original = updateTimelinePosition; let updates = 0;
    updateTimelinePosition = function() { updates++; return original(); };
    for (let i = 0; i < 60; i++) updateClock();
    updateTimelinePosition = original;
    return { updates };
  });
  const afterClock = await metrics();
  if (!process.env.PERF_BASELINE) {
    assert(after.LayoutCount - before.LayoutCount < 50, 'search must batch geometry reads instead of relayout per item');
    assert(clock.updates <= 1, 'same-minute clock ticks must not relayout the timetable');
    await page.clock.setSystemTime(new Date('2026-10-17T13:00:00+09:00'));
    await page.evaluate(() => updateClock());
    assert.equal(await page.locator('.time-current').evaluate(e => e.parentElement.dataset.hour), '13');
    assert.equal(await page.locator('#liveTimeline').getAttribute('data-time'), '13:00');
    await page.evaluate(() => { document.getElementById('timelineToggle').checked = false; updateTimelinePosition(); });
    assert.equal(await page.locator('#liveTimeline').evaluate(e => e.style.display), 'none');
    await page.evaluate(() => { document.getElementById('timelineToggle').checked = true; updateTimelinePosition(); });
    assert.equal(await page.locator('#liveTimeline').evaluate(e => e.style.display), 'block');
    await page.clock.runFor(32);
    await page.evaluate(() => { window.timelineCalls = 0; window.originalTimelinePosition = updateTimelinePosition; updateTimelinePosition = () => { window.timelineCalls++; originalTimelinePosition(); }; for (let i = 0; i < 20; i++) document.getElementById('tableContainer').dispatchEvent(new Event('scroll')); });
    await page.clock.runFor(32);
    assert.equal(await page.evaluate(() => window.timelineCalls), 1, 'scroll burst coalesces into one frame');
    await page.evaluate(() => { updateTimelinePosition = originalTimelinePosition; });
    const hiddenClock = await page.evaluate(() => {
      const original = updateTimelinePosition; let count = 0;
      updateTimelinePosition = () => { count++; original(); };
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      lastClockMinute = -1; updateClock();
      const hidden = count;
      delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
      updateTimelinePosition = original;
      return { hidden, resumed: count };
    });
    assert.deepEqual(hiddenClock, { hidden: 0, resumed: 1 });
    assert(!external.some(u => u.startsWith('https://fonts.googleapis.com/css2?family=Pretendard')), 'no unavailable render-blocking font CSS');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      authState = { loggedIn: true, isMaster: false, isLookup: false, loginId: 'fixture-teacher', teacherName: '검증강사A' };
      accessMode = 'teacher';
      lastData = { headers: ['1강의실'], grid: { 12: [['개별 수학 검증강사AT', '검증학생 검증고2 정규']], 13: [['개별 국어 검증강사AT', '검증학생 검증고2 정규']] } };
      document.getElementById('searchInput').value = ''; renderTable(lastData, true);
    });
    const mobileResults = [];
    for (const query of ['수학', '국어', '없는학생', '']) mobileResults.push(await page.evaluate(query => {
      document.getElementById('searchInput').value = query; searchTable();
      return [...document.querySelectorAll('.teacher-hour-card, .teacher-simple-hour-card')].filter(e => e.style.display !== 'none').length;
    }, query));
    assert.deepEqual(mobileResults, [1, 1, 0, 2], 'mobile search/clear preserve lesson matching');
  }
  assert.deepEqual(errors, []);
  const report = { ...counts, search: results, searchLayoutCount: after.LayoutCount - before.LayoutCount,
    searchLayoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000, clock,
    clockLayoutCount: afterClock.LayoutCount - beforeClock.LayoutCount };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.PERF_OUTPUT) fs.writeFileSync(process.env.PERF_OUTPUT, JSON.stringify(report, null, 2));
} finally { await browser.close(); server.close(); }
