'use strict';
const crypto = require('node:crypto');
const COLLECTION = 'liveTimetableSnapshots';
const MAX_AGE = 24 * 60 * 60 * 1000;
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function normalize(s) { return String(s || '').replace(/\u00a0/g,' ').trim().replace(/\s+/g,'').replace(/선생님$/i,'').replace(/T$/i,'').replace(/[·ㆍ•]/g,'').toLowerCase(); }
function dates(now = Date.now()) {
  return [0,1].map(offset => new Date(now + 9*3600000 + offset*86400000).toISOString().slice(0,10));
}
function dateForSheet(sheet, now = Date.now()) {
  if (typeof sheet !== 'string' || sheet.length > 100) fail('INVALID_SHEET');
  const match = sheet.match(/^(\d{1,2})\/(\d{1,2})(?:\(|\s|$)/);
  if (!match) fail('INVALID_SHEET');
  const year = Number(dates(now)[0].slice(0,4));
  const candidates = [year-1,year,year+1].map(y => `${y}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`)
    .filter(d => Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d);
  if (!candidates.length) fail('INVALID_SHEET');
  return candidates.sort((a,b)=>Math.abs(Date.parse(a)-now)-Math.abs(Date.parse(b)-now))[0];
}
function key(sheet, date) { return crypto.createHash('sha256').update(date+'\n'+sheet).digest('hex'); }
function verifyLookup(token, secret, now = Date.now()) {
  if (!secret || secret.length < 32 || typeof token !== 'string' || token.length > 1000) fail('UNAUTHORIZED');
  const parts = token.split('.');
  if (parts.length !== 2) fail('UNAUTHORIZED');
  const expected = crypto.createHmac('sha256',secret).update(parts[0]).digest('base64url');
  if (parts[1].length !== expected.length || !crypto.timingSafeEqual(Buffer.from(parts[1]),Buffer.from(expected))) fail('UNAUTHORIZED');
  let payload; try { payload=JSON.parse(Buffer.from(parts[0],'base64url').toString()); } catch { fail('UNAUTHORIZED'); }
  if (payload.aud !== 'timetable-snapshot-lookup' || !Number.isFinite(payload.exp) || payload.exp <= now || payload.exp > now+21600000) fail('UNAUTHORIZED');
  return { role:'LOOKUP', full:true, name:'' };
}
function identity(user, profile = {}, access = {}) {
  const role = String(user.role || '').toUpperCase();
  if (user.status !== 'ACTIVE' || !['ADMIN','STAFF','DESK','TEACHER','INSTRUCTOR'].includes(role) || access.apps?.liveTimetable === false) fail('FORBIDDEN');
  const full = role === 'ADMIN' || (role === 'STAFF' && (access.permissions?.canManageAccounts === true || access.permissions?.canManageSchedules === true));
  const name = normalize(user.name || profile.displayName || access.instructorName || '');
  if (!full && !name) fail('FORBIDDEN');
  return {role,full,name};
}
function validate(snapshot, now = Date.now()) {
  if (!snapshot || snapshot.schema !== 1 || snapshot.date !== dateForSheet(snapshot.sheet,now) || !Number.isFinite(snapshot.capturedAt) || snapshot.capturedAt > now+60000 || now-snapshot.capturedAt > MAX_AGE) fail('INVALID_SNAPSHOT');
  const data=snapshot.data;
  if (!data || typeof data.version !== 'string' || !data.version || !Array.isArray(data.headers) || !data.headers.length || data.headers.length > 100 || !data.headers.every(s=>typeof s==='string' && s.length<200) || !data.grid || !snapshot.owners || !snapshot.rooms) fail('INVALID_SNAPSHOT');
  for (let hour=8;hour<=23;hour++) {
    const row=data.grid[hour], owners=snapshot.owners[hour];
    if (!Array.isArray(row) || row.length!==data.headers.length || !Array.isArray(owners) || owners.length!==row.length) fail('INVALID_SNAPSHOT');
    row.forEach((cell,i)=>{if (!Array.isArray(cell) || !cell.every(s=>typeof s==='string' && s.length<10000) || !Array.isArray(owners[i]) || !owners[i].every(s=>typeof s==='string')) fail('INVALID_SNAPSHOT');});
  }
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 850000) fail('SNAPSHOT_TOO_LARGE');
  return snapshot;
}
function project(snapshot, who, teacher = '', roomView = false, now = Date.now()) {
  validate(snapshot,now);
  if (roomView) {
    const rooms={rooms:snapshot.rooms.rooms,rows:snapshot.rooms.rows.map(row=>({hour:row.hour,cells:row.cells.map(cell=>({occupied:!!cell.occupied,lessons:cell.lessons.map(lesson=>({teacher:lesson.teacher,subject:lesson.subject,own:!!who.name && normalize(lesson.teacher)===who.name}))}))}))};
    return {data:rooms,savedAt:snapshot.capturedAt,sheet:snapshot.sheet,date:snapshot.date};
  }
  const selected=who.full ? normalize(teacher) : who.name;
  const data={headers:who.full?snapshot.data.headers:snapshot.rooms.rooms,version:snapshot.data.version,grid:{}};
  for (let h=8;h<=23;h++) data.grid[h]=snapshot.data.grid[h].map((cell,i)=>{
    const owners=snapshot.owners[h][i];
    return !selected || (owners.length===1 && normalize(owners[0])===selected) ? cell : [];
  });
  return {data,savedAt:snapshot.capturedAt,sheet:snapshot.sheet,date:snapshot.date};
}
async function save(db, snapshot, now = Date.now()) {
  validate(snapshot,now);
  const ref=db.collection(COLLECTION).doc(key(snapshot.sheet,snapshot.date));
  return db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    if (old.exists && old.data().capturedAt >= snapshot.capturedAt) return false;
    // Store serialized grids: Firestore does not accept arrays nested directly in arrays.
    tx.set(ref,{sheet:snapshot.sheet,date:snapshot.date,capturedAt:snapshot.capturedAt,json:JSON.stringify(snapshot)});
    return true;
  });
}
async function read(db, sheet, who, teacher, roomView, now = Date.now()) {
  const date=dateForSheet(sheet,now);
  const doc=await db.collection(COLLECTION).doc(key(sheet,date)).get();
  if (!doc.exists) fail('SNAPSHOT_NOT_FOUND');
  let snap; try {snap=JSON.parse(doc.data().json);} catch {fail('INVALID_SNAPSHOT');}
  if (snap.sheet!==sheet || snap.date!==date) fail('INVALID_SNAPSHOT');
  return project(snap,who,teacher,roomView,now);
}
module.exports={COLLECTION,dates,dateForSheet,key,verifyLookup,identity,validate,project,save,read};
