/**
 * Niyantran Employee Monitoring V2 — E2E Windows Environment Helper
 * Queries WMI/CIM hardware detection (Acer laptop profile), process state (tasklist/Get-Process),
 * Windows Registry entries, and cryptographic binary file verification.
 */

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

class WindowsHelper {
  /**
   * Execute a PowerShell script safely and return stdout.
   * @param {string} script
   * @returns {string}
   */
  static runPowerShell(script) {
    try {
      return execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { encoding: 'utf8', timeout: config.timeouts.defaultTimeout }
      ).trim();
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : err.message;
      throw new Error(`PowerShell execution error: ${stderr}`);
    }
  }

  /**
   * Query Win32_ComputerSystem for Manufacturer, Model, Memory, Processors.
   * @returns {{ Manufacturer: string, Model: string, TotalPhysicalMemory?: number, NumberOfProcessors?: number }}
   */
  static getComputerSystem() {
    const script = `Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, TotalPhysicalMemory, NumberOfProcessors | ConvertTo-Json -Compress`;
    const output = this.runPowerShell(script);
    if (!output) return {};
    try {
      return JSON.parse(output);
    } catch {
      return {};
    }
  }

  /**
   * Query Win32_ComputerSystemProduct for UUID, IdentifyingNumber (Serial), Name, Vendor.
   * @returns {{ UUID: string, IdentifyingNumber: string, Name: string, Vendor: string }}
   */
  static getComputerSystemProduct() {
    const script = `Get-CimInstance Win32_ComputerSystemProduct | Select-Object UUID, IdentifyingNumber, Name, Vendor | ConvertTo-Json -Compress`;
    const output = this.runPowerShell(script);
    if (!output) return {};
    try {
      return JSON.parse(output);
    } catch {
      return {};
    }
  }

  /**
   * Check if current host hardware matches expected Acer laptop specs.
   * @returns {{ isAcer: boolean, manufacturer: string, model: string, uuid: string, identifyingNumber: string }}
   */
  static isAcerHardware() {
    const cs = this.getComputerSystem();
    const csp = this.getComputerSystemProduct();

    const manufacturer = cs.Manufacturer || csp.Vendor || '';
    const model = cs.Model || csp.Name || '';
    const uuid = csp.UUID || '';
    const identifyingNumber = csp.IdentifyingNumber || '';

    const isAcer = manufacturer.toLowerCase().includes('acer') &&
      model.toLowerCase().includes('nitro an515-57');

    return {
      isAcer,
      manufacturer,
      model,
      uuid,
      identifyingNumber
    };
  }

  /**
   * Check if one or more processes matching name are currently running.
   * @param {string} processName e.g. 'node', 'NiyantranWin32Helper', 'chrome'
   * @returns {Array<{ Id: number, ProcessName: string }>}
   */
  static getRunningProcesses(processName) {
    const cleanName = processName.replace(/\.exe$/i, '');
    const script = `Get-Process -Name "${cleanName}" -ErrorAction SilentlyContinue | Select-Object Id, ProcessName | ConvertTo-Json -Compress`;
    try {
      const output = this.runPowerShell(script);
      if (!output) return [];
      const parsed = JSON.parse(output);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }

  /**
   * Boolean check if a specific process is active.
   * @param {string} processName
   * @returns {boolean}
   */
  static isProcessRunning(processName) {
    const processes = this.getRunningProcesses(processName);
    return processes.length > 0;
  }

  /**
   * Check Windows Registry key property value.
   * @param {string} keyPath e.g. "HKCU:\\Software\\Classes\\niyantran"
   * @param {string} [propertyName] Property name to inspect
   * @returns {any} Value or null if not found
   */
  static checkRegistry(keyPath, propertyName = null) {
    const script = propertyName
      ? `(Get-ItemProperty -Path "${keyPath}" -ErrorAction SilentlyContinue)."${propertyName}" | ConvertTo-Json -Compress`
      : `Get-ItemProperty -Path "${keyPath}" -ErrorAction SilentlyContinue | ConvertTo-Json -Compress`;
    try {
      const output = this.runPowerShell(script);
      if (!output) return null;
      return JSON.parse(output);
    } catch {
      return null;
    }
  }

  /**
   * Compute cryptographic hash of a file on disk.
   * @param {string} filePath
   * @param {string} [algorithm='SHA256']
   * @returns {string} Upper-case hex hash
   */
  static getFileHash(filePath, algorithm = 'SHA256') {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found for hash calculation: ${resolvedPath}`);
    }
    const buffer = fs.readFileSync(resolvedPath);
    return crypto.createHash(algorithm.toLowerCase()).update(buffer).digest('hex').toUpperCase();
  }

  /**
   * Verify installer executable against expected size, SHA-256 hash, and Windows PE header.
   * @param {string} [installerPath]
   * @returns {{ valid: boolean, exists: boolean, sizeBytes: number, sha256: string, hasPeHeader: boolean }}
   */
  static verifyInstallerBinary(installerPath = config.installer.localPath) {
    const resolved = path.resolve(installerPath);
    if (!fs.existsSync(resolved)) {
      return {
        valid: false,
        exists: false,
        sizeBytes: 0,
        sha256: '',
        hasPeHeader: false
      };
    }

    const stats = fs.statSync(resolved);
    const sizeBytes = stats.size;
    const sha256 = this.getFileHash(resolved, 'SHA256');

    // Check PE 'MZ' magic header bytes
    const fd = fs.openSync(resolved, 'r');
    const headerBuf = Buffer.alloc(2);
    fs.readSync(fd, headerBuf, 0, 2, 0);
    fs.closeSync(fd);
    const hasPeHeader = headerBuf[0] === 0x4D && headerBuf[1] === 0x5A; // 'MZ'

    const valid = hasPeHeader &&
      sizeBytes === config.installer.sizeBytes &&
      sha256 === config.installer.sha256;

    return {
      valid,
      exists: true,
      sizeBytes,
      sha256,
      hasPeHeader
    };
  }
}

module.exports = WindowsHelper;
