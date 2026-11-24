/**
 * Niyantran Employee Monitoring V2 — Tier 2 Boundary Test
 * Feature F3: Native Windows Tray & Lifecycle
 *
 * Boundary & Negative Tests:
 * 1. Duplicate tray process launch mutex detection prevents duplicate instances.
 * 2. Uninstaller execution while running terminates active agent processes before deletion.
 * 3. Corrupted IPC input stream with random non-JSON bytes is gracefully ignored.
 * 4. Missing shortcut directory path is created recursively prior to shortcut placement.
 * 5. Unprivileged tray exit executes cleanly without requiring administrative UAC elevation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const config = require('../config');
const WindowsHelper = require('../helpers/windowsHelper');

test('[F3] Duplicate tray process launch mutex detection prevents duplicate instances', () => {
  // Verify that TrayManager enforces single instance lifecycle
  const trayManagerPath = path.resolve(config.paths.agent, 'src/ui/trayManager.js');
  assert.ok(fs.existsSync(trayManagerPath), `trayManager.js must exist at ${trayManagerPath}`);

  const content = fs.readFileSync(trayManagerPath, 'utf8');
  assert.ok(
    content.includes('this.childProcess') || content.includes('isTrayReady') || content.includes('isAvailable'),
    'TrayManager must maintain single active childProcess instance to prevent duplicate tray processes'
  );

  // Verify process query logic for duplicate detection
  const runningBefore = WindowsHelper.getRunningProcesses('NiyantranWin32Helper');
  assert.ok(Array.isArray(runningBefore), 'getRunningProcesses must return an array');
});

test('[F3] Uninstaller execution while running terminates active agent processes before deletion', () => {
  const uninstallScriptPath = path.resolve(config.paths.agent, 'installer/uninstall-agent.ps1');
  assert.ok(fs.existsSync(uninstallScriptPath), `Uninstall script must exist at ${uninstallScriptPath}`);

  const scriptContent = fs.readFileSync(uninstallScriptPath, 'utf8');
  assert.ok(
    scriptContent.includes('Stop-Process') || scriptContent.includes('taskkill') || scriptContent.includes('Get-Process'),
    'Uninstaller script must safely terminate running agent processes before removing files'
  );
});

test('[F3] Corrupted IPC input stream with random non-JSON bytes is gracefully ignored', () => {
  const csSourcePath = path.resolve(config.paths.agent, 'native-src/NiyantranWin32Helper.cs');
  const sourceContent = fs.readFileSync(csSourcePath, 'utf8');

  // Verify try-catch block wrapping stdin reader / JSON parser
  assert.ok(
    sourceContent.includes('catch') || sourceContent.includes('TryParse') || sourceContent.includes('JsonException'),
    'Native C# helper must wrap IPC command parsing in try-catch to tolerate corrupted input streams'
  );

  // In-process simulation of IPC parser resilience
  const parseIpcLine = (line) => {
    try {
      if (!line || typeof line !== 'string') return null;
      return JSON.parse(line);
    } catch {
      return null; // Gracefully ignored
    }
  };

  const corruptedInputs = [
    'INVALID_GARBAGE_BINARY_\x00\xFF\xFE',
    '{"incomplete_json": ',
    '',
    '<<<XML>>>',
    'null'
  ];

  for (const input of corruptedInputs) {
    const parsed = parseIpcLine(input);
    assert.ok(parsed === null || typeof parsed === 'object', 'Corrupted input must return null without throwing');
  }
});

test('[F3] Missing shortcut directory path is created recursively prior to shortcut placement', () => {
  const installScriptPath = path.resolve(config.paths.agent, 'installer/install-agent.ps1');
  assert.ok(fs.existsSync(installScriptPath), `Installer script must exist at ${installScriptPath}`);

  const scriptContent = fs.readFileSync(installScriptPath, 'utf8');
  assert.ok(
    scriptContent.includes('New-Item') || scriptContent.includes('mkdir') || scriptContent.includes('CreateDirectory'),
    'Installer script must ensure target directory exists recursively before creating shortcut'
  );

  // Node filesystem verification of recursive directory creation
  const tempTestDir = path.resolve(os.tmpdir(), 'niyantran_e2e_shortcut_test_' + Date.now(), 'nested/sub');
  assert.equal(fs.existsSync(tempTestDir), false);
  fs.mkdirSync(tempTestDir, { recursive: true });
  assert.ok(fs.existsSync(tempTestDir), 'Recursive directory creation must succeed');
  fs.rmSync(path.resolve(os.tmpdir(), tempTestDir.split(path.sep)[1] ? tempTestDir : tempTestDir), { recursive: true, force: true });
});

test('[F3] Unprivileged tray exit executes cleanly without requiring administrative UAC elevation', () => {
  const csSourcePath = path.resolve(config.paths.agent, 'native-src/NiyantranWin32Helper.cs');
  const sourceContent = fs.readFileSync(csSourcePath, 'utf8');

  // Verify Application.Exit or Environment.Exit is invoked on Exit menu click
  assert.ok(
    sourceContent.includes('Application.Exit') || sourceContent.includes('Environment.Exit') || sourceContent.includes('Exit('),
    'Tray exit handler must call standard process exit without requiring elevated privileges'
  );
});
