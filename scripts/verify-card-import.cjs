// Read-only full comparison of an imported dataset against its private snapshot.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {planMigration,summary}=require('./firebase-card-migration.cjs');
async function main(){
  const args=process.argv.slice(2), arg=n=>args[args.indexOf(n)+1];
  const input=JSON.parse(fs.readFileSync(arg('--input'),'utf8'));
  const plan=planMigration(input,arg('--dataset'));
  const admin=require(process.env.FIREBASE_ADMIN_MODULE);
  admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:'fir-lms-prod'});
  const db=admin.firestore();
  try {
    const archive=await db.collection('liveTimetableCardMigrationArchives/'+plan.datasetId+'/rows').get();
    assert.equal(archive.size,plan.rows.length);
    archive.forEach(doc=>{const row=doc.data();assert.deepEqual(row.cells,plan.rows[row.row-1]);assert.equal(doc.id,String(row.row).padStart(8,'0'));});
    for(let i=0;i<plan.statuses.length;i+=200){
      const expected=plan.statuses.slice(i,i+200);
      const docs=await db.getAll(...expected.map(row=>db.doc(row.path)));
      docs.forEach((doc,j)=>{assert.ok(doc.exists);const data=doc.data();assert.equal(data.updatedAt.toMillis(),Date.parse(plan.exportedAt));delete data.updatedAt;assert.deepEqual(data,expected[j].data);});
    }
    const config=await db.doc('liveTimetableCardConfig/banpo').get();
    if(args.includes('--active')) assert.deepEqual(config.data(),{activeDatasetId:plan.datasetId,migrationComplete:true});
    console.log(JSON.stringify({...summary(plan),allArchivedRowsMatch:true,allStatusesMatch:true,active:config.exists&&config.data().activeDatasetId===plan.datasetId,verifiedAt:new Date().toISOString()}));
  } finally{await admin.app().delete();}
}
main().catch(e=>{console.error('Import verification failed: '+e.message.split('\n')[0]);process.exitCode=1;});
