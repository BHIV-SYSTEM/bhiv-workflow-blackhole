/**
 * Org email policy (all branches):
 * - Domain must be @gmail.com or @outlook.com
 * - Local part (before @) must contain "bhiv" or "blackhole" (case-insensitive)
 * Examples: blackholeinfiverse64@gmail.com, bhivtest2@outlook.com
 */

const ALLOWED_DOMAINS = new Set(["gmail.com", "outlook.com"]);

function isValidOrgEmail(email) {
  if (!email || typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return false;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!ALLOWED_DOMAINS.has(domain)) return false;
  return local.includes("bhiv") || local.includes("blackhole");
}

/**
 * MongoDB fragment for User queries — same rules as isValidOrgEmail.
 * Merge: User.findOne({ _id, stillExist: 1, ...orgEmailMongoFilter() })
 */
function orgEmailMongoFilter() {
  return {
    email: {
      $regex: /^[^@]*(?:bhiv|blackhole)[^@]*@(gmail|outlook)\.com$/i,
    },
  };
}

const ORG_EMAIL_ERROR =
  "Email must be @gmail.com or @outlook.com, and the name must include bhiv or blackhole (e.g. blackholeinfiverse64@gmail.com, bhivtest2@outlook.com, BHIVMSSU0030@outlook.com)";

module.exports = { isValidOrgEmail, orgEmailMongoFilter, ORG_EMAIL_ERROR };
