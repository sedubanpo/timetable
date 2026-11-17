'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openTimetablePage } = require('./timetable-page-fixture.cjs');

for (const file of ['Index.html', 'docs/index.html']) {
  test(file + ' dispatch tabs preserve the draft and only read the roster', async t => {
    const { window, document, evaluate } = openTimetablePage(file, t);
    const modal = document.getElementById('studentImageModal');
    const search = document.getElementById('studentImageSearch');
    const reference = document.getElementById('cardMessageReferenceBody');
    const panel = document.getElementById('cardAlimtalkPanel');
    const calls = [];
    window.cardAlimtalkApi = async (action, input) => {
      calls.push([action, input.date, input.audience]);
      return { rows: [{ name: '가상학생' }] };
    };
    window.TimetableAlimtalk = require('../assets/alimtalk-contract');
    window.buildStudentCardViewModel = () => ({ timelineRows: [
      { start: 16, end: 17, title: '수학(가상T)', room: '6강의실', classType: '1:1', status: '정규' },
      { start: 17, end: 18, title: '자기주도', isBreak: true }
    ] });
    window.filterStudentImageList = window.renderCardMessageReference;
    evaluate("currentSheetName = '10/29(목)'; selectedStudentForImage = '가상학생'; previewNoteDrafts.test = '비고 초안';");
    window.attendanceDateKey = () => '2026-10-29';
    modal.style.display = 'flex';
    search.value = '가상';

    let pendingRoster;
    const reload = window.reloadCardRoster;
    window.reloadCardRoster = () => (pendingRoster = reload());
    window.setStudentCardMode('message');
    assert.equal(document.getElementById('cardMessageTab').getAttribute('aria-selected'), 'true');
    assert.match(reference.textContent, /발송 문구를 확인하고 있습니다/);
    await pendingRoster;
    assert.match(reference.textContent, /① 수학 정규 16:00–17:00/);
    assert.doesNotMatch(reference.textContent, /자기주도/);

    panel.hidden = false;
    window.setStudentCardMode('image');
    assert.equal(panel.hidden, true);
    assert.equal(document.getElementById('cardMessageReference').hidden, true);
    assert.equal(search.value, '가상');
    assert.equal(evaluate('previewNoteDrafts.test'), '비고 초안');

    evaluate("selectedStudentForImage = '';");
    window.setStudentCardMode('message');
    await pendingRoster;
    assert.match(reference.textContent, /학생을 선택/);
    assert.deepEqual(calls, Array(2).fill(['batchRoster', '2026-10-29', 'guardian']));
  });
}
