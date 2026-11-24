const cp = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('NIYANTRAN V2 PRE-COMMIT VERIFICATION SUITE');
console.log('====================================================\n');

let failed = false;

function run(cmd, cwd, desc) {
  console.log(`\n--- [CHECK] ${desc} ---`);
  try {
    const out = cp.execSync(cmd, { cwd: cwd || path.resolve(__dirname, '..'), stdio: 'pipe' }).toString();
    console.log(`[PASS] ${desc}`);
    return out;
  } catch (err) {
    console.error(`[FAIL] ${desc}`);
    if (err.stdout) console.log(err.stdout.toString().slice(0, 2000));
    if (err.stderr) console.error(err.stderr.toString().slice(0, 2000));
    failed = true;
    return null;
  }
}

// 1. Secret Scanning on Git Diff
console.log('\n--- [CHECK] Secret Scan on Git Diff HEAD ---');
try {
  const rootDir = path.resolve(__dirname, '..');
  const diff = cp.execSync('git diff HEAD', { cwd: rootDir, maxBuffer: 20 * 1024 * 1024 }).toString();
  const secretPatterns = [
    { name: 'GitHub Token', regex: /ghp_[A-Za-z0-9_]{30,}/g },
    { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
    { name: 'Private Key', regex: /BEGIN (?:RSA )?PRIVATE KEY/g },
    { name: 'MongoDB Connection String with Password', regex: /mongodb\+srv:\/\/[^:]+:[^@]+@/g }
  ];

  let secretsFound = 0;
  for (const pat of secretPatterns) {
    const matches = diff.match(pat.regex);
    if (matches) {
      console.error(`[ALERT] Found ${matches.length} possible ${pat.name} match(es)!`);
      secretsFound++;
    }
  }

  if (secretsFound === 0) {
    console.log('[PASS] No leaked credentials or secrets found in git diff HEAD.');
  } else {
    failed = true;
  }
} catch (e) {
  console.error('[FAIL] Secret scan failed to execute:', e.message);
  failed = true;
}

// 2. Validate Installer Packages
console.log('\n--- [CHECK] Installer Packages in employee-agent-v2/dist ---');
const distDir = path.resolve(__dirname, '../employee-agent-v2/dist');
const exePath = path.join(distDir, 'NiyantranMonitoringAgentV2-Setup.exe');
const zipPath = path.join(distDir, 'Niyantran-Agent-V2-Setup.zip');

if (fs.existsSync(exePath) && fs.existsSync(zipPath)) {
  const exeStats = fs.statSync(exePath);
  const zipStats = fs.statSync(zipPath);
  console.log(`[PASS] Installer packages present: EXE (${exeStats.size} bytes), ZIP (${zipStats.size} bytes)`);
} else {
  console.error('[FAIL] Missing required installer package in dist folder');
  failed = true;
}

// 3. Backend Tests
run('node --test modules/employee-monitoring-v2/tests/*.test.js', path.resolve(__dirname, '../server'), 'Backend Monitoring V2 Tests');

// 4. Agent Tests
run('node --test tests/*.test.js', path.resolve(__dirname, '../employee-agent-v2'), 'Windows Agent Tests');

// 5. Frontend Build Verification
run('npm run build', path.resolve(__dirname, '../client'), 'Client Vite Production Build');

if (failed) {
  console.error('\n====================================================');
  console.error('PRE-COMMIT VERIFICATION FAILED! SEE ERRORS ABOVE.');
  console.error('====================================================');
  process.exit(1);
} else {
  console.log('\n====================================================');
  console.log('ALL PRE-COMMIT VERIFICATION CHECKS PASSED!');
  console.log('====================================================');
  process.exit(0);
}
