// Offline JSON planning by default. No credentials or production access unless --apply.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = value => digest([value]);
function planMigration(input, datasetId) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(datasetId || '')) throw Error('Invalid dataset ID');
  if (!input || !/^[A-Za-z0-9_-]{10,200}$/.test(input.sourceSpreadsheetId || '') ||
      !Array.isArray(input.rows) || !input.rows.length || typeof input.exportedAt !== 'string' ||
      !Number.isFinite(Date.parse(input.exportedAt))) throw Error('Invalid snapshot metadata');
  // Preserve every physical row, including obsolete duplicate keys, in an admin-only archive.
  const latest = new Map();
  input.rows.forEach((row, index) => {
    if (!Array.isArray(row) || row.length !== 6 || row.some(v => typeof v !== 'string' || v.length > 1000)) throw Error('Invalid source row ' + (index + 1));
    if (index === 0) {
      if (row[0] !== '일자시트' || row[1] !== '학생명' || row[2] !== '발송여부') throw Error('Expected full log including header');
      return;
    }
    const sheetName = row[0].trim(), studentName = row[1].trim();
    if (!sheetName || !studentName) return;
    if (sheetName.length > 200 || studentName.length > 200 || row[3].length > 200 || row[4].length > 200) throw Error('Source exceeds status schema at row ' + (index + 1));
    // Exactly matches the old GET endpoint: last physical row for (sheet,student), not column F.
    latest.set(JSON.stringify([sheetName, studentName]), {
      sheetName, studentName, sent: row[2] === '1', legacyUpdatedAt: row[3], legacyUpdatedBy: row[4]
    });
  });
  const fingerprint = digest(input);
  return { datasetId, fingerprint, sourceSpreadsheetId: input.sourceSpreadsheetId, exportedAt: new Date(input.exportedAt).toISOString(),
    rows: input.rows, statuses: [...latest.values()].map(row => ({
      path: `liveTimetableCardStores/${datasetId}/sheets/${key(row.sheetName)}/statuses/${key(row.studentName)}`,
      data: {...row, revision: 1, updatedBy: 'migration', operationId: 'migration-' + fingerprint}
    })) };
}
function summary(plan) {
  return {datasetId: plan.datasetId, fingerprint: plan.fingerprint, archivedRows: plan.rows.length,
    statusCount: plan.statuses.length, sheetCount: new Set(plan.statuses.map(s => s.data.sheetName)).size};
}
function sameValue(a, b) {
  if (a && typeof a.toMillis === 'function') a = a.toMillis();
  if (b && typeof b.toMillis === 'function') b = b.toMillis();
  return JSON.stringify(a) === JSON.stringify(b);
}
async function createOnly(db, ref, data) {
  const existing = await ref.get();
  if (existing.exists) {
    const old = existing.data();
    if (Object.keys(old).length !== Object.keys(data).length || Object.keys(data).some(k => !sameValue(old[k], data[k]))) {
      throw Error('Existing destination differs; no overwrite performed');
    }
    return;
  }
  // create() has an exists=false precondition, protecting a concurrent new record.
  await ref.create(data);
}
async function applyMigration(db, Timestamp, plan, activate) {
  const config = db.doc('liveTimetableCardConfig/banpo');
  const active = await config.get();
  if (active.exists && active.data().activeDatasetId === plan.datasetId && active.data().migrationComplete === true) {
    throw Error('Dataset is already active; refuse importing into live records');
  }
  const archive = db.doc('liveTimetableCardMigrationArchives/' + plan.datasetId);
  const metadata = {...summary(plan), sourceSpreadsheetId: plan.sourceSpreadsheetId, exportedAt: plan.exportedAt};
  await createOnly(db, archive, metadata);
  // Bounded batches keep large historical imports practical without weakening
  // per-document create preconditions or activating after a partial failure.
  for (let start = 0; start < plan.rows.length; start += 20) {
    await Promise.all(plan.rows.slice(start, start + 20).map((cells, offset) => {
      const i = start + offset;
      return createOnly(db, archive.collection('rows').doc(String(i + 1).padStart(8, '0')), {row: i + 1, cells});
    }));
  }
  const timestamp = Timestamp.fromDate(new Date(plan.exportedAt));
  for (let start = 0; start < plan.statuses.length; start += 20) {
    await Promise.all(plan.statuses.slice(start, start + 20).map(record =>
      createOnly(db, db.doc(record.path), {...record.data, updatedAt: timestamp})));
  }
  // Activation is a separate explicit operator decision after quiescing the old writer.
  if (activate) await db.runTransaction(async tx => {
    const current = await tx.get(config);
    const original = active.exists ? active.data() : null;
    const now = current.exists ? current.data() : null;
    if (JSON.stringify(now) !== JSON.stringify(original)) throw Error('Active configuration changed during import');
    tx.set(config, {activeDatasetId: plan.datasetId, migrationComplete: true});
  });
  return {...summary(plan), applied: true, activated: !!activate};
}
async function main(args) {
  function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
  const file = arg('--input'), dataset = arg('--dataset');
  if (!file) throw Error('Use --input snapshot.json --dataset UNIQUE_WORKBOOK_ID; default is dry run');
  const plan = planMigration(JSON.parse(fs.readFileSync(file, 'utf8')), dataset);
  if (!args.includes('--apply')) {
    if (args.includes('--activate')) throw Error('--activate requires --apply');
    console.log(JSON.stringify({...summary(plan), dryRun: true})); return;
  }
  const projectId = arg('--project');
  if (!projectId || arg('--confirm-project') !== projectId) throw Error('Explicit --project and matching --confirm-project required');
  const modulePath = process.env.FIREBASE_ADMIN_MODULE;
  if (!modulePath || !path.isAbsolute(modulePath)) throw Error('Set FIREBASE_ADMIN_MODULE to an installed firebase-admin absolute module path');
  const admin = require(modulePath);
  admin.initializeApp({credential: admin.credential.applicationDefault(), projectId});
  try { console.log(JSON.stringify(await applyMigration(admin.firestore(), admin.firestore.Timestamp, plan, args.includes('--activate')))); }
  finally { await admin.app().delete(); }
}
module.exports = {planMigration, summary, key, applyMigration};
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
