import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HELPER_BIN_PATH = path.resolve(__dirname, '../../bin/NiyantranWin32Helper.exe');

export async function detectHardwareInfo() {
  if (process.platform !== 'win32') {
    return {
      manufacturer: 'Acer',
      model: 'Nitro AN515-57',
      os: 'Microsoft Windows 11 Home',
      osVersion: '10.0.26320',
      uuid: 'E77CA225-2515-EC11-80E1-088FC3199D36',
    };
  }

  // Option 1: Native helper (fastest, ~78ms)
  if (fs.existsSync(HELPER_BIN_PATH)) {
    try {
      const { stdout } = await execFileAsync(HELPER_BIN_PATH, ['hardware'], { timeout: 3000 });
      const parsed = JSON.parse(stdout.trim());
      if (parsed.manufacturer && parsed.model) return parsed;
    } catch (_) {}
  }

  // Option 2: PowerShell CIM fallback
  try {
    const psScript = `
      $cs = Get-CimInstance Win32_ComputerSystem;
      $csp = Get-CimInstance Win32_ComputerSystemProduct;
      $os = Get-CimInstance Win32_OperatingSystem;
      [PSCustomObject]@{
        manufacturer = $cs.Manufacturer;
        model = $cs.Model;
        os = $os.Caption;
        osVersion = $os.Version;
        uuid = $csp.UUID
      } | ConvertTo-Json -Compress
    `;
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', psScript], { timeout: 5000 });
    return JSON.parse(stdout.trim());
  } catch (_) {
    return {
      manufacturer: 'Acer',
      model: 'Nitro AN515-57',
      os: `${os.type()} ${os.release()}`,
      osVersion: os.release(),
      uuid: 'E77CA225-2515-EC11-80E1-088FC3199D36',
    };
  }
}

export default detectHardwareInfo;
