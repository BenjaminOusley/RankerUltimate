import { spawnSync } from 'node:child_process';

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  console.error('Unable to locate the npm executable.');
  process.exit(1);
}

const checks = [
  {
    name: 'Tests',
    args: ['test'],
  },
  {
    name: 'Lint',
    args: ['run', 'lint'],
  },
  {
    name: 'Build',
    args: ['run', 'build'],
  },
  {
    name: 'IGDB live source check',
    args: ['run', 'test:igdb'],
  },
];

const results = [];

for (const check of checks) {
  console.log(`\n=== ${check.name} ===\n`);

  const result = spawnSync(process.execPath, [npmExecPath, ...check.args], {
    stdio: 'inherit',
    env: process.env,
  });

  const passed = !result.error && result.status === 0;

  if (result.error) {
    console.error(`Could not run ${check.name}: ${result.error.message}`);
  }

  results.push({
    name: check.name,
    passed,
  });
}

const passedCount = results.filter((result) => result.passed).length;
const failedCount = results.length - passedCount;

console.log('\n────────────────────────────────');
console.log('RankerUltimate verification');
console.log('────────────────────────────────');

for (const result of results) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.name}`);
}

console.log('────────────────────────────────');
console.log(`${passedCount} passed, ${failedCount} failed`);

if (failedCount > 0) {
  process.exitCode = 1;
}
