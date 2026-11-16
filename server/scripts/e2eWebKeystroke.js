/**
 * End-to-end check of the WEB keystroke path against the running server:
 *   login (web client flow) → POST /agent/keystroke/ingest → admin read
 * Run: node scripts/e2eWebKeystroke.js   (server must be up on :5000)
 */
const BASE = 'http://127.0.0.1:5000/api';

async function main() {
  // 1. Login as admin (same flow the web client uses)
  const login = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@niyantran.test', password: 'Admin@12345' })
  });
  const lj = await login.json();
  console.log('login status:', login.status, '| has token:', !!lj.token, '| role:', lj.user && lj.user.role);
  if (!lj.token) {
    console.log(JSON.stringify(lj).slice(0, 300));
    return;
  }
  const H = { 'Content-Type': 'application/json', 'x-auth-token': lj.token };

  // 2. Simulate the web client's keystroke flush (fake attendanceId → expect gate rejection)
  const ingest = await fetch(BASE + '/agent/keystroke/ingest', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      attendanceId: 'ffffffffffffffffffffffff',
      activeApp: 'Infiverse - AI Workflow Management',
      activeAppTitle: 'http://localhost:5173/',
      segments: [{
        text: 'Hello world from the workflow tab',
        keyCount: 30, backspaceCount: 1, pasteCount: 0,
        intervals: [120, 95, 110], durationMs: 3600,
        start: Date.now() - 4000, lastAt: Date.now() - 400
      }]
    })
  });
  console.log('ingest status:', ingest.status, '|', JSON.stringify(await ingest.json()).slice(0, 300));

  // 3. Admin read endpoint (should be reachable, likely empty)
  const list = await fetch(BASE + '/monitoring/employees/6afacdb9c978c7ef0fe3c66b/keystrokes', { headers: H });
  console.log('admin read status:', list.status, '|', JSON.stringify(await list.json()).slice(0, 400));
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });

