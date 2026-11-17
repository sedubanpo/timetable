'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require(process.env.ALIMTALK_JSDOM_PATH || '/tmp/timetable-alimtalk-test-tools/node_modules/jsdom');

function openTimetablePage(file, t) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const evaluate = code => vm.runInContext(code, dom.getInternalVMContext(), { filename: file });
  // Load the entire inline application script so multiline functions and lexical session state work together.
  const app = [...window.document.scripts].find(script => script.textContent.includes('function syncStaffToolbar('));
  evaluate(app.textContent);
  window.onload = null;
  window.fetch = () => { throw Error('Unexpected external request'); };
  return { window, document: window.document, evaluate, html };
}

module.exports = { openTimetablePage };
