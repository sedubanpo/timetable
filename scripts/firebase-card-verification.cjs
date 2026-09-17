// Offline client/migration/regression checks only. Rules emulator is a separate gate.
const {execFileSync}=require('node:child_process');
const path=require('node:path');
for(const script of ['performance-checks.cjs','firebase-card-checks.cjs','firebase-card-migration-checks.cjs']) {
  execFileSync(process.execPath,[path.join(__dirname,script)],{stdio:'inherit'});
}
execFileSync(process.execPath,['--check',path.join(__dirname,'export-card-history.cjs')],{stdio:'inherit'});
console.log('Firebase card client, migration, syntax and regression verification PASS');
