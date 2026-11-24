const ExecutionSession = require("../models/ExecutionSession");
const { logRejection } = require("../services/executionRejectionLogger");

/**
 * Resolves the authoritative tenant ID for the request actor.
 * Priority:
 * 1. Admin users (role === 'Admin') can specify/override tenant via 'x-tenant-id' or 'x-branch' header.
 * 2. Internal execution authorities can specify/override tenant via header.
 * 3. Standard users strictly derive tenant identity from req.user (tenantId, tenant_id, branch).
 *    Any mismatch between regular user's tenant and requested header tenant is rejected.
 */
function resolveActorTenant(req) {
  const headerTenant = req.headers ? (req.headers["x-tenant-id"] || req.headers["x-branch"]) : null;
  const user = req.user;
  const isAuthority = Boolean(req.executionAuthority);
  const isAdmin = Boolean(user && (user.role === "Admin" || user.isAdmin === true));

  if (user) {
    const userTenant = user.tenantId || user.tenant_id || user.branch || null;
    if (isAdmin) {
      return headerTenant || userTenant;
    }
    // If standard user supplied a conflicting header, flag mismatch
    if (headerTenant && userTenant && headerTenant !== userTenant) {
      return { mismatch: true, userTenant, headerTenant };
    }
    return userTenant || headerTenant;
  }

  // Internal caller without user object (e.g. SETU execution authority)
  if (isAuthority) {
    return headerTenant || null;
  }

  return headerTenant || null;
}

const enforceTenantIsolation = async (req, res, next) => {
  const context = req.executionContext;
  const tenantId = context?.tenantId;

  const resolved = resolveActorTenant(req);
  if (resolved && typeof resolved === "object" && resolved.mismatch) {
    const rejection = await logRejection({
      executionId: context?.executionId,
      traceId: context?.traceId,
      tenantId: context?.tenantId || resolved.headerTenant,
      reason: "tenant_violation",
      details: {
        actor_tenant: resolved.userTenant,
        requested_tenant: resolved.headerTenant,
      },
      statusCode: 403,
    });

    return res.status(403).json({
      status: "rejected",
      reason: "tenant_violation",
      message: "Non-admin user cannot switch or access another tenant",
      execution_id: context?.executionId || null,
      trace_id: context?.traceId || null,
      rejection_id: rejection.rejectionId,
    });
  }

  const actorTenant = typeof resolved === "string" ? resolved : null;

  if (!tenantId || !actorTenant) {
    const rejection = await logRejection({
      executionId: context?.executionId,
      traceId: context?.traceId,
      tenantId,
      reason: "tenant_context_missing",
      details: {
        actor_tenant: actorTenant,
      },
      statusCode: 403,
    });

    return res.status(403).json({
      status: "rejected",
      reason: "tenant_context_missing",
      execution_id: context?.executionId || null,
      trace_id: context?.traceId || null,
      rejection_id: rejection.rejectionId,
    });
  }

  if (actorTenant !== tenantId) {
    const rejection = await logRejection({
      executionId: context?.executionId,
      traceId: context?.traceId,
      tenantId,
      reason: "tenant_violation",
      details: {
        actor_tenant: actorTenant,
      },
      statusCode: 403,
    });

    return res.status(403).json({
      status: "rejected",
      reason: "tenant_violation",
      execution_id: context?.executionId || null,
      trace_id: context?.traceId || null,
      rejection_id: rejection.rejectionId,
    });
  }

  // Persist resolved actor to the session record (Phase E)
  const executionId = context?.executionId;
  if (executionId) {
    let actorId = null;
    let actorType = null;

    if (req.user) {
      actorId = req.user.id || req.user._id || req.user.email || null;
      actorType = "user";
    } else if (req.executionAuthority) {
      actorId = req.executionAuthority;
      actorType = "authority";
    }

    if (actorId && actorType) {
      try {
        await ExecutionSession.updateOne(
          { executionId },
          { $set: { actorId, actorType } }
        );
        if (req.executionContext && req.executionContext.session) {
          req.executionContext.session.actorId = actorId;
          req.executionContext.session.actorType = actorType;
        }
      } catch (err) {
        console.error("[tenantIsolation] Failed to persist actor identity:", err.message);
      }
    }
  }

  if (req.executionContext) {
    req.executionContext.actorTenantId = actorTenant;
  }
  req.tenantId = actorTenant;
  return next();
};

module.exports = {
  enforceTenantIsolation,
  resolveActorTenant,
};
