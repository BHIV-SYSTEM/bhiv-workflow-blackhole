/**
 * Canonical Employee ID Formatter
 *
 * Enforces standard canonical employee identity format:
 *   EMP-<TENANT_CODE>-<ID> (e.g., EMP-BHIV-080, EMP-SIPS-012)
 *
 * Rules:
 * 1. Never overwrites an already valid canonical ID (EMP-<TENANT_CODE>-<ID>).
 * 2. Scoped to the tenant's authoritative code (e.g. BHIV, SIPS) - does NOT force BHIV onto other tenants.
 * 3. Eliminates flawed fallback regex that blindly prefixed non-BHIV emails with 'BHIV'.
 * 4. Normalizes numeric sequences (e.g., 80 -> 080, 12 -> 012, 147 -> 147).
 * 5. Supports BHIVMSSU format (e.g. BHIVMSSU0030).
 *
 * @param {string} email - Employee email or identifier string
 * @param {string} [existingEmployeeId] - Existing employeeId if set
 * @param {string} [tenantCode='BHIV'] - Authoritative tenant code (e.g. 'BHIV', 'SIPS')
 * @returns {string} Formatted Canonical Employee ID (e.g. 'EMP-BHIV-080')
 */
function formatEmployeeId(email, existingEmployeeId = null, tenantCode = "BHIV") {
  const cleanTenant = String(tenantCode || "BHIV").trim().toUpperCase();

  // 1. If existingEmployeeId is already a valid canonical ID, preserve it immutably
  if (existingEmployeeId && typeof existingEmployeeId === "string") {
    const trimmedExisting = existingEmployeeId.trim();
    if (/^EMP-[A-Z0-9]+-[A-Z0-9]+$/i.test(trimmedExisting)) {
      return trimmedExisting.toUpperCase();
    }
    if (/^BHIVMSSU\d+$/i.test(trimmedExisting)) {
      return trimmedExisting.toUpperCase();
    }
    // If existing is legacy format matching current tenant (e.g. BHIV147)
    const legacyTenantMatch = trimmedExisting.match(new RegExp(`^${cleanTenant}(\\d+)$`, "i"));
    if (legacyTenantMatch) {
      const num = legacyTenantMatch[1];
      const padded = num.length < 3 ? num.padStart(3, "0") : num;
      return `EMP-${cleanTenant}-${padded}`;
    }
  }

  if (!email || typeof email !== "string") {
    if (existingEmployeeId && existingEmployeeId.trim() && existingEmployeeId.trim() !== "N/A") {
      return existingEmployeeId.trim();
    }
    return "N/A";
  }

  const cleanEmail = email.trim();
  const localPart = cleanEmail.split("@")[0].trim().toLowerCase();

  const mssuMatch = localPart.match(/^bhiv[-_.]?mssu[^\d]*(\d+)/i);
  if (mssuMatch && mssuMatch[1]) {
    return `BHIVMSSU${mssuMatch[1]}`;
  }

  // 2. Extract numeric ID using tenant-aware matching
  let numMatch = null;

  if (cleanTenant === "BHIV") {
    // BHIV-specific pattern: blackholeinfiverse80, bhivtest2, bhiv20, blackholeinfivers147
    const bhivPattern = /(?:blackhole(?:infiverse?|infivers)?|bhiv)[^\d]*(\d+)/i;
    numMatch = localPart.match(bhivPattern);
    // Only fall back to trailing digits if localPart contains bhiv or blackhole
    if (!numMatch && (localPart.includes("bhiv") || localPart.includes("blackhole"))) {
      numMatch = localPart.match(/(\d+)$/);
    }
  } else if (cleanTenant === "SIPS") {
    // SIPS-specific pattern: sips012, student12, biotech05
    const sipsPattern = /(?:sips)[^\d]*(\d+)/i;
    numMatch = localPart.match(sipsPattern);
    if (!numMatch) {
      numMatch = localPart.match(/(\d+)$/);
    }
  } else {
    // Generic tenant pattern
    const genericPattern = new RegExp(`(?:${cleanTenant.toLowerCase()})[^\\d]*(\\d+)`, "i");
    numMatch = localPart.match(genericPattern);
    if (!numMatch) {
      numMatch = localPart.match(/(\d+)$/);
    }
  }

  // 3. Format into canonical EMP-<TENANT_CODE>-<ID>
  if (numMatch && numMatch[1]) {
    const rawNum = numMatch[1];
    const padded = rawNum.length < 3 ? rawNum.padStart(3, "0") : rawNum;
    return `EMP-${cleanTenant}-${padded}`;
  }

  // 4. Fallback to existing valid ID if available
  if (existingEmployeeId && typeof existingEmployeeId === "string" && existingEmployeeId.trim() && existingEmployeeId.trim() !== "N/A") {
    return existingEmployeeId.trim();
  }

  return "N/A";
}

const formatCanonicalEmployeeId = formatEmployeeId;

module.exports = {
  formatEmployeeId,
  formatCanonicalEmployeeId,
};
