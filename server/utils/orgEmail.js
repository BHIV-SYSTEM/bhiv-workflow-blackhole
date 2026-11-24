/**
 * Multi-Tenant Org Email Policy
 *
 * Validates email addresses based on authoritative tenant domains rather than
 * forcing hardcoded 'bhiv' or 'blackhole' strings for non-BHIV tenants.
 */

const DEFAULT_ALLOWED_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "localhost.invalid",
  "blackhole.ai",
]);

/**
 * Validates if an email is acceptable for an organization / tenant.
 *
 * @param {string} email - Email address to validate
 * @param {string[]|Set<string>} [tenantAllowedDomains] - Domains permitted by the tenant
 * @returns {boolean}
 */
function isValidOrgEmail(email, tenantAllowedDomains = null) {
  if (!email || typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return false;

  const local = e.slice(0, at);
  const domain = e.slice(at + 1);

  // If explicit tenant domains are provided, validate strictly against them
  if (tenantAllowedDomains) {
    const allowed = Array.isArray(tenantAllowedDomains)
      ? new Set(tenantAllowedDomains.map((d) => d.toLowerCase().trim()))
      : tenantAllowedDomains;

    return allowed.has(domain);
  }

  // Default fallback when no specific tenant configuration is passed
  if (!DEFAULT_ALLOWED_DOMAINS.has(domain)) return false;
  if (domain === "localhost.invalid" || domain === "blackhole.ai") return true;

  // For default BHIV domain fallbacks on general public mail providers
  return local.includes("bhiv") || local.includes("blackhole");
}

/**
 * Generates a MongoDB query fragment for email matching based on allowed domains.
 *
 * @param {string[]} [tenantAllowedDomains]
 */
function orgEmailMongoFilter(tenantAllowedDomains = null) {
  if (Array.isArray(tenantAllowedDomains) && tenantAllowedDomains.length > 0) {
    const domainRegexPart = tenantAllowedDomains
      .map((d) => d.replace(/\./g, "\\."))
      .join("|");
    return {
      email: {
        $regex: new RegExp(`@(${domainRegexPart})$`, "i"),
      },
    };
  }

  return {
    email: {
      $regex: /^[^@]*(?:bhiv|blackhole)[^@]*@(gmail|outlook)\.com$|@(localhost\.invalid|blackhole\.ai)$/i,
    },
  };
}

const ORG_EMAIL_ERROR =
  "Email domain is not authorized for the specified tenant or organization (e.g. blackholeinfiverse64@gmail.com, bhivtest2@outlook.com, BHIVMSSU0030@outlook.com).";

module.exports = {
  isValidOrgEmail,
  orgEmailMongoFilter,
  ORG_EMAIL_ERROR,
  DEFAULT_ALLOWED_DOMAINS,
};
