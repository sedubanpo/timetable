import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { default: playwright } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.resolve(root, process.env.VISITOR_MAP_EVIDENCE_DIR || '.superloopy/sessions/visitor-map-20260908/evidence');
const baseline = process.argv.includes('--baseline');
fs.mkdirSync(evidence, { recursive: true });
const source = fs.readFileSync(path.join(root, 'Index.html'));
const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(source); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await playwright.chromium.launch({ headless: true });
const results = { browser: browser.version(), baseline, cases: {}, errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
  page.on('pageerror', error => results.errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    authState = { loggedIn: true, isMaster: false, isLookup: true, teacherName: '', loginId: '2371' };
    accessMode = 'all'; currentSheetName = '9/8(화)'; availableSheets = [currentSheetName];
    applyRoleUi();
    document.getElementById('mainPage').style.display = 'flex';
    document.getElementById('introPage').style.display = 'none';
    document.getElementById('loginGate').style.display = 'none';
    window.qaLoadRooms = rooms => {
      lastData = { headers: rooms, grid: {18: rooms.map(() => ['개별 수학 검증강사T', '검증학생 검증중2'])}, version: String(Math.random()) };
      resetVisitorLookupIndexCache();
      document.getElementById('searchInput').value = '검증학생';
      visitorLookupLastKeyword = ''; searchTable(); renderVisitorLookupResults();
    };
    qaLoadRooms(['1강의실']);
  });
  const prefix = baseline ? 'baseline' : 'after';
  await page.screenshot({ path: path.join(evidence, `${prefix}-desktop-room1.png`), fullPage: true });
  results.cases.svgPresent = await page.locator('.visitor-floorplan').count() === 1;
  results.cases.nineRooms = await page.locator('.visitor-floorplan [data-room]').count() === 9;
  results.cases.selectedRoute = await page.locator('.visitor-map-route').count() === 1;
  if (!baseline) {
    for (let room = 1; room <= 9; room++) {
      await page.evaluate(room => qaLoadRooms([`${room}강의실`]), room);
      results.cases[`room${room}Active`] = await page.locator(`.visitor-floorplan [data-room='${room}'].active`).count() === 1;
      results.cases[`room${room}Route`] = await page.locator('.visitor-map-route').count() === 1;
      results.cases[`room${room}DoorGeometry`] = await page.locator('.visitor-map-route').evaluate((el, room) => {
        const doors = {1:[465,200],2:[610,200],3:[735,200],4:[850,200],5:[875,230],6:[795,260],7:[655,260],8:[515,260],9:[185,335]};
        const start = el.getPointAtLength(0), end = el.getPointAtLength(el.getTotalLength());
        return Math.abs(start.x-330)<1 && Math.abs(start.y-230)<1 && Math.abs(end.x-doors[room][0])<1 && Math.abs(end.y-doors[room][1])<1;
      }, room);
    }
    for (const [name, keyword] of [['blank', ''], ['noResult', '없는학생']]) {
      await page.evaluate(keyword => { document.getElementById('searchInput').value = keyword; searchTable(); }, keyword);
      results.cases[`${name}NoRoute`] = await page.locator('.visitor-map-route').count() === 0;
    }
    for (const room of ['2관 1강의실', '3관 1강의실', '10강의실', '알수없음']) {
      await page.evaluate(room => qaLoadRooms([room]), room);
      results.cases[`${room}NoRoute`] = await page.locator('.visitor-map-route').count() === 0;
      if (room.includes('관')) results.cases[`${room}NoMainMap`] = await page.locator('.visitor-floorplan').count() === 0;
    }
    await page.evaluate(() => qaLoadRooms(['1강의실', '9강의실']));
    const oldRoute = await page.locator('.visitor-map-route').getAttribute('d');
    await page.locator('.visitor-lookup-card').nth(1).click();
    results.cases.lessonSwitchRetargets = oldRoute !== await page.locator('.visitor-map-route').getAttribute('d');
    await page.locator('.visitor-lookup-card').nth(0).focus();
    await page.keyboard.press('Enter');
    results.cases.keyboardEnterSelects = await page.locator('.visitor-lookup-card').nth(0).getAttribute('aria-pressed') === 'true';
    results.cases.keyboardFocusRetained = await page.locator('.visitor-lookup-card').nth(0).evaluate(el => el === document.activeElement);
    await page.locator('.visitor-lookup-card').nth(1).focus();
    await page.keyboard.press('Space');
    results.cases.keyboardSpaceSelects = await page.locator('.visitor-lookup-card').nth(1).getAttribute('aria-pressed') === 'true';
    results.cases.keyboardSpaceFocusRetained = await page.locator('.visitor-lookup-card').nth(1).evaluate(el => el === document.activeElement);
    results.cases.reducedMotionStatic = await page.locator('.visitor-map-route').evaluate(el => getComputedStyle(el).animationName === 'none');
    results.cases.sameMapPreserved = await page.evaluate(() => {const svg=document.querySelector('.visitor-floorplan');renderVisitorLookupResults();return svg===document.querySelector('.visitor-floorplan');});
    await page.screenshot({ path: path.join(evidence, 'after-desktop-room9.png'), fullPage: true });
    await page.evaluate(() => {visitorLookupTab='study';renderVisitorLookupResults();});
    results.cases.studyNoRoute = await page.locator('.visitor-map-route').count() === 0;
    await page.evaluate(() => {visitorLookupTab='today';renderVisitorLookupResults();});
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(evidence, `${prefix}-mobile.png`), fullPage: true });
  if (!baseline) {
    results.cases.mobileHeaderNoOverlap = await page.evaluate(() => {
      const home=document.querySelector('.lookup-header-toggle').getBoundingClientRect();
      const search=document.getElementById('searchInput').getBoundingClientRect();
      return home.right<=search.left || search.right<=home.left || home.bottom<=search.top || search.bottom<=home.top;
    });
    await page.locator('.visitor-floorplan').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(evidence,'after-mobile-map.png')});
    results.cases.mobileMapReachable=await page.locator('.visitor-floorplan').isVisible();
  }
  if (!baseline) results.cases.mobileNoDocumentOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  results.cases.noPageErrors = results.errors.length === 0;
  fs.writeFileSync(path.join(evidence, `${prefix}-browser-results.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (!baseline) for (const [name, passed] of Object.entries(results.cases)) assert.equal(passed, true, name);
} finally { await browser.close(); server.close(); }
