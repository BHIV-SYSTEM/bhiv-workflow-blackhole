const mongoose = require("mongoose");

const TenantSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    allowedDomains: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Default seed tenants specification
const DEFAULT_TENANTS = [
  {
    tenantId: "ten-bhiv-core",
    name: "Blackhole Infiverse Core",
    code: "BHIV",
    allowedDomains: ["gmail.com", "outlook.com", "blackhole.ai", "localhost.invalid"],
    isActive: true,
  },
  {
    tenantId: "ten-sips",
    name: "SIPS Educational Foundation",
    code: "SIPS",
    allowedDomains: ["sips.edu", "sips.org", "gmail.com", "outlook.com"],
    isActive: true,
  },
];

/**
 * Ensures default core tenants exist in the database.
 * Upserts ten-bhiv-core and ten-sips without overwriting custom administrator customizations.
 */
TenantSchema.statics.seedDefaultTenants = async function () {
  const results = [];
  for (const tenantData of DEFAULT_TENANTS) {
    const existing = await this.findOne({ tenantId: tenantData.tenantId });
    if (!existing) {
      const created = await this.create(tenantData);
      results.push(created);
    } else {
      results.push(existing);
    }
  }
  return results;
};

/**
 * Resolves a tenant by code (case-insensitive) or tenantId.
 */
TenantSchema.statics.resolveTenant = async function (codeOrId) {
  if (!codeOrId || typeof codeOrId !== "string") return null;
  const normalized = codeOrId.trim();
  return await this.findOne({
    $or: [
      { tenantId: normalized },
      { code: normalized.toUpperCase() },
    ],
  });
};

const Tenant = mongoose.model("Tenant", TenantSchema);

module.exports = Tenant;
module.exports.DEFAULT_TENANTS = DEFAULT_TENANTS;
