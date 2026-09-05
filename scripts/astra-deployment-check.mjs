import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const html = fs.readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const api = html.match(/const API_BASE_DEFAULT = "([^"]+)"/)[1];
const sheet = process.env.ASTRA_VERIFY_SHEET || '9/5(토)';
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
async function read(params) {
  const url = new URL(api);
  url.search = new URLSearchParams({ mode: 'api', ...params }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  assert(response.ok, `API HTTP ${response.status}`);
  const value = await response.json();
  assert(value.ok, value.error || 'API failed');
  return value;
}
const response = await fetch('https://sedubanpo.github.io/timetable/?astra-verify=' + Date.now(), { signal: AbortSignal.timeout(30000) });
assert(response.ok, 'public page HTTP status');
const deployed = await response.text();
assert.equal(hash(deployed), hash(html), 'GitHub Pages must serve the exact checked source');
// Read-only calls: omit auditTeacher/auditLoginId so no view-log write is requested.
const ping = await read({ action: 'ping' });
const grid = await read({ action: 'grid', sheet });
const version = await read({ action: 'version', sheet });
const teacher = await read({ action: 'grid', sheet, teacher: '김광수' });
assert.match(version.version, /^content-v1-[a-f0-9]{64}$/);
assert.equal(grid.data.version, version.version, 'full grid revision');
assert.equal(teacher.data.version, version.version, 'teacher revision parity');
assert.equal(grid.viewLogged, false);
assert.equal(teacher.viewLogged, false);
assert(grid.data.headers.length > 0, 'real schedule has classrooms');
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), pageSha256: hash(deployed), apiTime: ping.now,
  sheet, classroomCount: grid.data.headers.length, canonicalRevision: version.version,
  teacherRevisionMatches: true, viewLogsWritten: false, writesPerformed: false }, null, 2));
