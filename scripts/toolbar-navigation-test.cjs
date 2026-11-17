'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openTimetablePage } = require('./timetable-page-fixture.cjs');

for (const file of ['Index.html', 'docs/index.html']) {
  test(file + ' toolbar clock, date navigation, HOME and logout placement', t => {
    const { window, document, evaluate, html } = openTimetablePage(file, t);
    let now = new Date(2026, 8, 17, 14, 5, 9);
    window.Date = class extends Date {
      constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    };
    const clock = document.getElementById('digitalClock');
    window.updateClock();
    assert.equal(clock.querySelector('.clock-date').textContent, '9/17(목)');
    assert.equal(clock.querySelector('.clock-time').textContent, '14:05:09');
    now = new Date(2027, 0, 1);
    window.updateClock();
    assert.equal(clock.querySelector('.clock-date').textContent, '1/1(금)');

    now = new Date(2026, 8, 17);
    const select = document.getElementById('mainSheetSelector');
    select.add(new window.Option('today', 'today'));
    const loads = [];
    window.getNavigableSheetNames = () => ['tomorrow', 'today', 'yesterday'];
    window.getCalendarSheetMap = () => ({ '9-17': ['today'] });
    window.loadData = (...args) => loads.push(args);
    for (const offset of [1, -1, 0]) window.navigateDay(offset);
    assert.deepEqual(loads, ['yesterday', 'tomorrow', 'today'].map(day => [day, false, true]));

    window.goHome();
    assert.equal(document.getElementById('mainPage').style.display, 'none');
    assert.equal(document.getElementById('loginGate').style.display, 'flex');
    let calendarOpens = 0;
    window.startAppAfterAuth = () => calendarOpens++;
    evaluate('authState.loggedIn = true');
    window.goHome();
    assert.equal(calendarOpens, 1);

    assert.equal(document.querySelectorAll('#teacherLogoutBtn').length, 1);
    assert.equal(document.querySelector('#loginGate #teacherLogoutBtn').getAttribute('onclick'), 'logoutTeacher()');
    assert.match(html, /\.toolbar-first-row #roleBadge\s*\{\s*display:none !important/);
    assert.match(html, /\.toolbar-first-row\s*\{[^}]*flex-wrap:wrap[^}]*overflow:visible/);
    for (const label of ['어제', '오늘', '내일']) {
      const button = document.querySelector('.nav-group [aria-label="' + label + '"]');
      assert.equal(button.firstElementChild.textContent, label);
      assert.equal(button.firstElementChild.nextElementSibling.tagName.toLowerCase(), 'svg');
    }
  });
}
