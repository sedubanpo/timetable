import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import pw from '/Users/anjongseong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const browser = await pw.chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  for (const width of [320, 390]) {
    const page = await browser.newPage({viewport: {width, height: 844}, isMobile: true, hasTouch: true, timezoneId: 'Asia/Seoul'});
    const url = 'http://localhost/teacher-mobile';
    await page.route('**/*', route => route.request().url() === url
      ? route.fulfill({contentType: 'text/html', body: html}) : route.abort());
    await page.clock.install({time: new Date('2026-11-14T14:59:00+09:00')});
    await page.goto(url);
    await page.evaluate(() => {
      authState = {loggedIn: true, isMaster: false, isLookup: false, teacherName: '검증강사', loginId: 'fixture'};
      accessMode = 'teacher';
      document.body.classList.add('teacher-mode');
      document.getElementById('mainPage').style.display = 'flex';
      document.getElementById('loginGate').style.display = 'none';
      document.getElementById('introPage').style.display = 'none';
      currentSheetName = '11/14(토)';
      const header = '개별 사탐 검증강사T';
      lastData = {headers: ['1강의실'], grid: {
        13: [[header, '가학생 가상고3 정규']],
        14: [[header, '가학생 가상고3 정규']],
        15: [[header, '가학생 가상고3 보충 11/14(토) 확정, 3:00-3:30', '나학생 가상고1 오늘만']],
        16: [[header, '나학생 가상고1 오늘만 11/14(토) 확정, 15:30–17:30']],
        18: [[header, '가학생 가상고3 보충 11/13(금) 확정, 18:00–18:30']],
        19: [[header, '다학생 가상고2 오늘만 19:00–19:30 또는 19:30–20:00', '라학생 가상중3 보충 19:10–19:40']]
      }};
      teacherMobileSimpleView = true;
      renderTeacherMobileView(lastData);
    });
    for (const simple of [true, false]) {
      const item = simple ? '.teacher-simple-student' : '.teacher-student-item';
      const header = simple ? '.teacher-simple-name-row' : '.teacher-student-name';
      const times = name => page.locator(item).filter({has: page.locator(header).filter({hasText: name})}).locator('.teacher-lesson-time');
      assert.deepEqual(await times('가학생').allTextContents(), ['13:00–15:00','13:00–15:00','15:00–15:30','18:00–19:00']);
      assert.deepEqual(await times('나학생').allTextContents(), ['15:30–17:30','15:30–17:30']);
      assert.deepEqual(await times('다학생').allTextContents(), ['시간 메모 확인 필요']);
      assert.deepEqual(await times('라학생').allTextContents(), ['19:10–19:40']);
      const row = page.locator(item).filter({has: page.getByText('15:00–15:30', {exact: true})});
      await row.scrollIntoViewIfNeeded();
      assert(await row.isVisible());
      const range = await row.locator('.teacher-lesson-time').boundingBox();
      assert(range && range.x >= 0 && range.x + range.width <= width + 1);
      if (!simple) {
        assert.equal(await row.locator('.teacher-hour-badge').innerText(), '수업 30분');
        for (const [at, elapsed] of [['14:59',0], ['15:15',15], ['15:30',30], ['16:00',30]]) {
          await page.clock.setSystemTime(new Date('2026-11-14T' + at + ':00+09:00'));
          await page.evaluate(() => updateClock());
          assert.equal(await row.locator('.teacher-progress-text').innerText(), elapsed + '분 / 30분 · ' + (elapsed / 30 * 100) + '%');
          assert.equal(await row.locator('.teacher-progress-fill').evaluate(el => el.style.width), (elapsed / 30 * 100) + '%');
          if (at === '15:15' && width === 390 && process.env.MOBILE_TIME_CAPTURE) {
            await row.screenshot({path: join(process.env.MOBILE_TIME_CAPTURE, '상세뷰-30분-보충.png')});
          }
        }
      } else {
        if (width === 390 && process.env.MOBILE_TIME_CAPTURE) {
          await row.screenshot({path: join(process.env.MOBILE_TIME_CAPTURE, '심플뷰-30분-보충.png')});
        }
        await page.locator('.teacher-mobile-view-toggle').click();
      }
    }
    console.log('PASS', width, 'px · both views · date-scoped times · adjacent lessons · minute progress');
    await page.close();
  }
} finally {
  await browser.close();
}
