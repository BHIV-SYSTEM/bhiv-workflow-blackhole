const assert = require('assert');
const { formatEmployeeId } = require('../utils/employeeId');

console.log('🧪 Running Employee ID Formatter Tests...');

const testCases = [
  // 1. Exact requirements from user prompt
  { input: 'blackholeinfivers147', expected: 'BHIV147' },
  { input: 'blackholeinfivers20', expected: 'BHIV20' },

  // 2. Full email variations
  { input: 'blackholeinfivers147@gmail.com', expected: 'BHIV147' },
  { input: 'blackholeinfivers20@outlook.com', expected: 'BHIV20' },
  { input: 'blackholeinfiverse64@gmail.com', expected: 'BHIV64' },
  { input: 'blackholeinfiverse90@gmail.com', expected: 'BHIV90' },
  { input: 'bhivtest2@outlook.com', expected: 'BHIV2' },
  { input: 'bhiv20@gmail.com', expected: 'BHIV20' },

  // 3. Already formatted
  { input: 'any@domain.com', existingId: 'BHIV147', expected: 'BHIV147' },
  { input: 'any@domain.com', existingId: 'bhiv20', expected: 'BHIV20' },

  // 4. Custom existing ID fallback
  { input: 'admin@company.com', existingId: 'EMP-999', expected: 'EMP-999' },
  { input: 'admin@company.com', existingId: null, expected: 'N/A' },
  { input: '', existingId: null, expected: 'N/A' },
  { input: null, existingId: null, expected: 'N/A' }
];

let passed = 0;
let failed = 0;

testCases.forEach((tc, idx) => {
  const result = formatEmployeeId(tc.input, tc.existingId);
  try {
    assert.strictEqual(result, tc.expected);
    console.log(`  ✅ Test ${idx + 1} passed: "${tc.input}" (existing: ${tc.existingId}) => "${result}"`);
    passed++;
  } catch (err) {
    console.error(`  ❌ Test ${idx + 1} failed: "${tc.input}" (existing: ${tc.existingId}) => got "${result}", expected "${tc.expected}"`);
    failed++;
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);

