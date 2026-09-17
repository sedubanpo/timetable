// Local, synthetic regression suite: never calls production APIs or sends cards.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const checks = [
  'performance-polling-checks.cjs',
  'performance-auth-checks.cjs',
  'performance-card-history-checks.cjs',
  'performance-discovery-checks.cjs',
  'performance-enrollment-checks.cjs',
  'performance-server-checks.cjs',
  'performance-client-checks.cjs',
  'review-checks.js',
  'api-reliability-checks.cjs',
  'card-reliability-checks.cjs',
  'astra-server-checks.js',
  'astra-client-checks.js',
  'login-client-regression.js',
  'login-server-regression.js',
  'hours-access-server.js',
  'header-parser-regression.js',
  'export-hours-regression.js'
];
for (const check of checks) {
  execFileSync(process.execPath, [path.join(root, 'scripts', check)], {
    cwd: root, stdio: 'inherit', env: process.env
  });
}
console.log(`Performance verification: ${checks.length} suites passed (synthetic services; no production timing claims).`);
