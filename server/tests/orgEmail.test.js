const assert = require('assert');
const { isValidOrgEmail } = require('../utils/orgEmail');

console.log('Running Org Email Validation Tests...');

const validEmails = [
  'blackholeinfiverse90@gmail.com',
  'blackholeinfiverse64@gmail.com',
  'bhivtest2@outlook.com',
  'BHIVMSSU0030@outlook.com',
  'bhivmssu0018@outlook.com',
  'BHIVMSSU0017@outlook.com',
  'BHIVMSSU0023@outlook.com',
  'BHIVMSSU0013@outlook.com',
  'BHIVMSSU0020@outlook.com',
  'BHIVMSSU0031@outlook.com',
  'BHIVMSSU0032@outlook.com',
  'BHIVMSSU0007@outlook.com',
  'BHIVMSSU0010@outlook.com',
  'BHIVMSSU0033@outlook.com',
  'BHIVMSSU0014@outlook.com',
  'BHIVMSSU0016@outlook.com',
  'BHIVMSSU0034@outlook.com',
];

const invalidEmails = [
  '',
  null,
  'student@gmail.com',
  'student@outlook.com',
  'BHIVMSSU0030@yahoo.com',
  'BHIVMSSU0030@gmail.co',
];

let passed = 0;
let failed = 0;

for (const email of validEmails) {
  try {
    assert.strictEqual(isValidOrgEmail(email), true);
    passed++;
  } catch (err) {
    console.error(`Expected valid for "${email}", got false`);
    failed++;
  }
}

for (const email of invalidEmails) {
  try {
    assert.strictEqual(isValidOrgEmail(email), false);
    passed++;
  } catch (err) {
    console.error(`Expected invalid for "${email}", got true`);
    failed++;
  }
}

console.log(`Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);

