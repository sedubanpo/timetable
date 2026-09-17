const assert = require('node:assert/strict');
const {planMigration, applyMigration, key} = require('./firebase-card-migration.cjs');
const header = ['일자시트','학생명','발송여부','수정시각','수정자','상태키'];
const input = {sourceSpreadsheetId:'synthetic-spreadsheet',exportedAt:'2026-09-17T00:00:00Z',rows:[header,
  ['9/15(화)','김가나','1','old','desk','wrong-key'],[' 9/15(화) ',' 김가나 ','0','new','desk2',''],
  ['9/16(수)','김가나','1','later','desk',''],['','orphan','1','','',''],['day||1','학생/별명','1','','','']]};
const plan=planMigration(input,'banpo-fixture');
assert.equal(plan.rows.length,6);assert.equal(plan.statuses.length,3);
assert.equal(plan.statuses[0].data.sent,false);assert.equal(plan.statuses[0].data.legacyUpdatedAt,'new');
assert.notEqual(key('가'),key('가'));assert.match(key('a/b'),/^[a-f0-9]{64}$/);
assert.throws(()=>planMigration(input,'../escape'));assert.throws(()=>planMigration({...input,rows:input.rows.slice(1)},'safe'));
assert.throws(()=>planMigration({...input,rows:[header,['day','s','1','','']]},'safe'));
assert.throws(()=>planMigration({...input,rows:[]},'safe'));
const records = new Map();let writes=0;
const db={doc(name){return {get:async()=>({exists:records.has(name),data:()=>records.get(name)}),create:async data=>{assert(!records.has(name));records.set(name,data);writes++;},collection:part=>({doc:id=>db.doc(name+'/'+part+'/'+id)}),name};},runTransaction:async callback=>callback({get:ref=>ref.get(),set:(ref,data)=>{records.set(ref.name,data);writes++;}})};
const Timestamp={fromDate:d=>d.toISOString()};
(async()=>{
  await applyMigration(db,Timestamp,plan,false);const first=writes;
  await applyMigration(db,Timestamp,plan,false);assert.equal(writes,first,'resumable create-only import');
  records.get(plan.statuses[0].path).revision=2;
  await assert.rejects(applyMigration(db,Timestamp,plan,true),/differs/);assert(!records.has('liveTimetableCardConfig/banpo'));
  records.get(plan.statuses[0].path).revision=1;
  await applyMigration(db,Timestamp,plan,true);assert.equal(records.get('liveTimetableCardConfig/banpo').activeDatasetId,'banpo-fixture');
  await assert.rejects(applyMigration(db,Timestamp,plan,false),/already active/);
  assert.deepEqual(records.get('liveTimetableCardMigrationArchives/banpo-fixture/rows/00000005').cells,input.rows[4]);
  console.log('PASS migration: complete raw archive, exact legacy GET parity, Unicode identities, schema rejection, resume, no overwrite, explicit activation and active guard');
})().catch(error=>{console.error(error);process.exitCode=1;});
