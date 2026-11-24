const ALLOWED_DOMAINS = new Set(["gmail.com", "outlook.com", "localhost.invalid", "blackhole.ai"]);

/** Matches server: @gmail.com, @outlook.com, @localhost.invalid, or @blackhole.ai. */
export function isValidOrgEmail(email) {
  if (!email || typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return false;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!ALLOWED_DOMAINS.has(domain)) return false;
  if (domain === "localhost.invalid" || domain === "blackhole.ai") return true;
  return local.includes("bhiv") || local.includes("blackhole");
}
