/**
 * Derives and formats the Employee ID from an employee's email or identifier suffix.
 * Format Rule:
 * - blackholeinfivers147 => BHIV147
 * - blackholeinfivers20 => BHIV20
 * - blackholeinfiverse64@gmail.com => BHIV64
 * - bhivtest2@outlook.com => BHIV2
 * - Fallback: existing valid employeeId, or 'N/A'
 *
 * @param {string} email - Employee email or identifier string
 * @param {string} [existingEmployeeId] - Existing employeeId if set
 * @returns {string} Formatted Employee ID (e.g. 'BHIV147')
 */
export function formatEmployeeId(email, existingEmployeeId = null) {
  if (existingEmployeeId && /^BHIV\d+$/i.test(existingEmployeeId.trim())) {
    return existingEmployeeId.trim().toUpperCase();
  }

  if (!email || typeof email !== 'string') {
    return existingEmployeeId || 'N/A';
  }

  const localPart = email.split('@')[0].trim().toLowerCase();

  // Match BHIV / Blackhole patterns followed by numbers, or any trailing numbers
  const match = localPart.match(/(?:blackhole(?:infiverse?|infivers)?|bhiv)[^\d]*(\d+)/i)
    || localPart.match(/(\d+)$/);

  if (match && match[1]) {
    return `BHIV${match[1]}`;
  }

  if (existingEmployeeId && existingEmployeeId.trim()) {
    return existingEmployeeId.trim();
  }

  return 'N/A';
}

export default formatEmployeeId;

