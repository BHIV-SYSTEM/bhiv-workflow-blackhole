import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Anti-Surveillance Audit: NiyantranWin32Helper.cs source contains ZERO occurrences of GetWindowText', () => {
  const csPath = path.resolve(__dirname, '../native-src/NiyantranWin32Helper.cs');
  assert.ok(fs.existsSync(csPath), `Source file must exist at ${csPath}`);

  const sourceContent = fs.readFileSync(csPath, 'utf8');

  // Verify zero calls to GetWindowText
  const getWindowTextMatches = sourceContent.match(/GetWindowText/g) || [];
  assert.equal(
    getWindowTextMatches.length,
    0,
    `Integrity Violation: Found ${getWindowTextMatches.length} occurrences of GetWindowText in NiyantranWin32Helper.cs. Must be 0.`
  );

  // Verify zero calls to GetWindowTextLength
  const getWindowTextLengthMatches = sourceContent.match(/GetWindowTextLength/g) || [];
  assert.equal(
    getWindowTextLengthMatches.length,
    0,
    `Integrity Violation: Found ${getWindowTextLengthMatches.length} occurrences of GetWindowTextLength in NiyantranWin32Helper.cs. Must be 0.`
  );

  // Verify zero calls to EnumWindows
  const enumWindowsMatches = sourceContent.match(/EnumWindows/g) || [];
  assert.equal(
    enumWindowsMatches.length,
    0,
    `Integrity Violation: Found ${enumWindowsMatches.length} occurrences of EnumWindows in NiyantranWin32Helper.cs. Must be 0.`
  );
});

test('Anti-Surveillance Audit: NiyantranWin32Helper.exe binary contains ZERO references to GetWindowText', () => {
  const exePath = path.resolve(__dirname, '../bin/NiyantranWin32Helper.exe');
  if (!fs.existsSync(exePath)) return;

  const binaryBuffer = fs.readFileSync(exePath);
  const binaryString = binaryBuffer.toString('latin1');

  assert.equal(
    binaryString.includes('GetWindowText'),
    false,
    'Integrity Violation: Compiled NiyantranWin32Helper.exe contains reference to GetWindowText'
  );
  assert.equal(
    binaryString.includes('GetWindowTextLength'),
    false,
    'Integrity Violation: Compiled NiyantranWin32Helper.exe contains reference to GetWindowTextLength'
  );
  assert.equal(
    binaryString.includes('EnumWindows'),
    false,
    'Integrity Violation: Compiled NiyantranWin32Helper.exe contains reference to EnumWindows'
  );
});
