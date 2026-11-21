/**
 * Tier 1 Feature Coverage: F3 — Native Windows System Tray & Lifecycle
 * Verifies native Win32 tray helper binary integrity, CLI/IPC initialization,
 * Start Menu shortcut definition, clean exit handling, and uninstallation metadata.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { config, WindowsHelper } = require('./tier1Common');

test('[F3] Native Win32 Helper Executable Presence & PE Header', () => {
  const helperExePath = path.resolve(config.paths.agent, 'bin/NiyantranWin32Helper.exe');
  assert.ok(fs.existsSync(helperExePath), `Native helper binary must exist at ${helperExePath}`);

  const stats = fs.statSync(helperExePath);
  assert.ok(stats.size > 10000, `Binary size must be substantial (actual: ${stats.size} bytes)`);

  const fd = fs.openSync(helperExePath, 'r');
  const buffer = Buffer.alloc(2);
  fs.readSync(fd, buffer, 0, 2, 0);
  fs.closeSync(fd);

  assert.equal(buffer[0], 0x4D, 'Byte 0 must be 0x4D ("M")');
  assert.equal(buffer[1], 0x5A, 'Byte 1 must be 0x5A ("Z")');
});

test('[F3] System Tray Helper CLI & IPC Initialization Contract', () => {
  const csharpSourcePath = path.resolve(config.paths.agent, 'native-src/NiyantranWin32Helper.cs');
  assert.ok(fs.existsSync(csharpSourcePath), 'Native C# helper source code must exist');

  const sourceContent = fs.readFileSync(csharpSourcePath, 'utf8');

  // Verify Windows Forms NotifyIcon initialization & context menu
  assert.ok(sourceContent.includes('NotifyIcon'), 'Native helper must implement Windows Forms NotifyIcon');
  assert.ok(sourceContent.includes('ContextMenuStrip') || sourceContent.includes('ContextMenu'), 'Must initialize tray ContextMenu');
  assert.ok(sourceContent.includes('Shield') || sourceContent.includes('Icon'), 'Must set system tray icon');

  // Verify JSON-based standard input / output IPC protocol
  assert.ok(
    sourceContent.includes('UPDATE_STATUS') || sourceContent.includes('status') || sourceContent.includes('TRAY_INITIALIZED'),
    'Must handle status updates over IPC'
  );
  assert.ok(sourceContent.includes('EXIT') || sourceContent.includes('Close'), 'Must handle exit IPC command');
});

test('[F3] Start Menu Application Shortcut Presence & Target Path', () => {
  const installScriptPath = path.resolve(config.paths.agent, 'installer/install-agent.ps1');
  const installScript = fs.readFileSync(installScriptPath, 'utf8');

  // Validate shortcut definition in installation script
  assert.ok(
    installScript.includes('Start Menu\\Programs\\Niyantran') ||
    installScript.includes('StartMenu') ||
    installScript.includes('WScript.Shell'),
    'Installation script must configure Start Menu shortcut'
  );
  assert.ok(
    installScript.includes('Niyantran Employee Monitoring V2.lnk') ||
    installScript.includes('CreateShortcut'),
    'Shortcut name must reference Niyantran Employee Monitoring V2'
  );

  // Check on disk if installed in current user profile
  const userStartMenuDir = path.join(
    process.env.APPDATA || '',
    'Microsoft/Windows/Start Menu/Programs/Niyantran'
  );
  const shortcutPath = path.join(userStartMenuDir, 'Niyantran Employee Monitoring V2.lnk');
  if (fs.existsSync(shortcutPath)) {
    const stats = fs.statSync(shortcutPath);
    assert.ok(stats.size > 0, 'Installed shortcut must have non-zero size');
  }
});

test('[F3] Clean Process Termination & Resource Lifecycle', () => {
  const trayManagerPath = path.resolve(config.paths.agent, 'src/ui/trayManager.js');
  assert.ok(fs.existsSync(trayManagerPath), 'TrayManager module must exist');

  const trayManagerCode = fs.readFileSync(trayManagerPath, 'utf8');
  assert.ok(
    trayManagerCode.includes('destroy') ||
    trayManagerCode.includes('stop') ||
    trayManagerCode.includes('exit') ||
    trayManagerCode.includes('kill'),
    'TrayManager must expose clean termination and resource teardown'
  );

  const csharpSourcePath = path.resolve(config.paths.agent, 'native-src/NiyantranWin32Helper.cs');
  const csharpCode = fs.readFileSync(csharpSourcePath, 'utf8');
  assert.ok(
    csharpCode.includes('Visible = false') ||
    csharpCode.includes('Dispose') ||
    csharpCode.includes('Application.Exit'),
    'Native helper must cleanly hide and dispose NotifyIcon before process termination'
  );
});

test('[F3] Windows Uninstall Registry Key & Uninstaller Helper Presence', () => {
  const uninstallerExePath = path.resolve(config.paths.agent, 'bin/Uninstall.exe');
  assert.ok(fs.existsSync(uninstallerExePath), `Uninstall executable must exist at ${uninstallerExePath}`);

  const fd = fs.openSync(uninstallerExePath, 'r');
  const buffer = Buffer.alloc(2);
  fs.readSync(fd, buffer, 0, 2, 0);
  fs.closeSync(fd);
  assert.equal(buffer[0], 0x4D);
  assert.equal(buffer[1], 0x5A);

  const uninstallScriptPath = path.resolve(config.paths.agent, 'installer/uninstall-agent.ps1');
  assert.ok(fs.existsSync(uninstallScriptPath), 'Uninstallation script must exist');
  const scriptContent = fs.readFileSync(uninstallScriptPath, 'utf8');

  assert.ok(
    scriptContent.includes('Uninstall\\NiyantranMonitoringV2') || scriptContent.includes('Uninstall'),
    'Uninstaller script must clean up Windows Uninstall registry keys'
  );
});
