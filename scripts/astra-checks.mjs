import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const scripts = ['review-checks.js', 'astra-server-checks.js', 'astra-client-checks.js'];
if (!process.argv.includes('--unit')) scripts.push('astra-attendance-browser.mjs', 'astra-client-browser.mjs');
for (const script of scripts) {
  execFileSync(process.execPath, [`scripts/${script}`], { cwd: root, stdio: 'inherit', env: process.env });
}
console.log(`Astra verification complete: ${scripts.length} suites passed.`);
