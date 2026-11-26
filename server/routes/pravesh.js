/**
 * Pravesh SSO bridge endpoints (read-only) — Niyantran.
 *
 * GET  /api/pravesh/status   — bridge configuration (no secrets), for evidence
 * GET  /api/pravesh/session  — verified Pravesh identity + mapping (read-only)
 * POST /api/pravesh/exchange — SSO auto-login: valid Pravesh cookie in, local
 *                              access token out, so the client can skip its
 *                              own sign-in page. Read-only: the token carries
 *                              a namespaced `pravesh:<id>` identity; no local
 *                              account is created, merged or adopted.
 *
 * Mirrors the Sampada/HackaVerse exchanges so the three products behave
 * identically for one Blackhole sign-in.
 */

"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { isValidOrgEmail } = require("../utils/orgEmail");

const {
  praveshEnabled,
  bridgeStatus,
  identityFromRequest,
  identityFromPayload,
  verifyPraveshToken,
  extractToken,
  appAllowed,
  localIdentity,
  cookieName,
} = require("../praveshBridge");

const router = express.Router();

router.get("/status", (req, res) => {
  res.json({ success: true, bridge: bridgeStatus() });
});

// Expire the Pravesh cookie so SSO auto-login cannot restore the session.
// Read-only: clears the browser cookie only (host-only and eTLD+1
// domain-scoped variants), never touches Pravesh server state.
router.post("/logout", (req, res) => {
  const name = cookieName();
  res.clearCookie(name, { path: "/" });
  const labels = String(req.headers.host || "").split(":")[0].split(".");
  if (labels.length >= 2 && !/\d$/.test(labels[labels.length - 1])) {
    res.clearCookie(name, {
      path: "/",
      domain: "." + labels.slice(-2).join("."),
    });
  }
  return res.json({ success: true, message: "Pravesh session cookie cleared" });
});

// Exchange a valid Pravesh cookie/header for a Niyantran access token.
router.post("/exchange", async (req, res) => {
  if (!praveshEnabled()) {
    return res.status(503).json({
      success: false,
      error: "Pravesh bridge not configured (set PRAVESH_JWT_SECRET)",
    });
  }

  let identity = identityFromRequest(req);

  // Non-browser clients may pass the token in the JSON body instead.
  if (!identity && req.body && typeof req.body === "object") {
    const bodyToken =
      req.body.token || req.body.pravesh_token || req.body.blackhole_token;
    if (bodyToken) {
      identity = identityFromPayload(verifyPraveshToken(bodyToken));
    }
  }

  if (!identity) {
    return res
      .status(401)
      .json({ success: false, error: "Not authenticated with Pravesh" });
  }

  if (!appAllowed(identity)) {
    return res.status(403).json({
      success: false,
      code: "ACCOUNT_NOT_ALLOWED",
      email: identity.email || null,
      error: "This account is not allowed to access Niyantran.",
    });
  }

  if (identity.is_guest || !identity.email) {
    return res.status(403).json({
      success: false,
      code: "ACCOUNT_NOT_SUPPORTED",
      email: identity.email || null,
      error: "This account is not supported on Niyantran.",
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(503).json({
      success: false,
      error: "Niyantran JWT_SECRET is not configured",
    });
  }

  const normalizedEmail = String(identity.email).toLowerCase().trim();

  // Check if this user already exists in Niyantran's MongoDB collection by email
  let existingUser = null;
  try {
    existingUser = await User.findOne({ email: normalizedEmail });
  } catch (err) {
    console.warn("[PRAVESH] User lookup error:", err.message);
  }

  // Prevent exited users from logging in via SSO
  if (existingUser && existingUser.stillExist === 0) {
    return res.status(403).json({
      success: false,
      error: "Your account has been marked as exited. Access to Niyantran is deactivated.",
      code: "ACCOUNT_DEACTIVATED",
      email: existingUser.email,
    });
  }

  if (!existingUser) {
    const emailSupported = isValidOrgEmail(normalizedEmail);
    return res.status(403).json({
      success: false,
      code: emailSupported ? "ACCOUNT_NOT_SUPPORTED" : "ACCOUNT_NOT_ALLOWED",
      email: normalizedEmail,
      error: emailSupported
        ? "This account is not allowed or not supported on Niyantran yet. Please ask your administrator to create your Niyantran account first."
        : "This account is not allowed or not supported on Niyantran. Only supported BHIV / Blackhole organization accounts can access Niyantran.",
    });
  }

  const fallbackFormatted = (existingUser.formattedEmployeeId && existingUser.formattedEmployeeId !== "N/A") ? existingUser.formattedEmployeeId : null;
  const resolvedCanonical = (existingUser.canonicalEmployeeId && existingUser.canonicalEmployeeId !== "N/A" ? existingUser.canonicalEmployeeId : null) || fallbackFormatted;
  const resolvedEmpId = (existingUser.employeeId && existingUser.employeeId !== "N/A" ? existingUser.employeeId : null) || resolvedCanonical;
  const resolvedTenant = existingUser.tenantId || "ten-bhiv-core";
  const resolvedOrg = existingUser.organization || "BHIV";

  // User already has an account on Niyantran: Open their EXACT existing account, role & tasks!
  const payload = {
    id: String(existingUser._id),
    user_id: String(existingUser._id),
    name: existingUser.name,
    email: existingUser.email,
    role: existingUser.role, // Exact role from existing account (User, Manager, Admin, etc.)
    department: existingUser.department,
    branch: existingUser.branch || "blackhole_mumbai",
    employeeId: resolvedEmpId,
    canonicalEmployeeId: resolvedCanonical,
    tenantId: resolvedTenant,
    organization: resolvedOrg,
    sso: true,
    is_guest: false,
    blackhole_user_id: identity.user_id,
  };

  const token = jwt.sign(
    {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      department: payload.department,
      branch: payload.branch,
      employeeId: payload.employeeId,
      canonicalEmployeeId: payload.canonicalEmployeeId,
      tenantId: payload.tenantId,
      organization: payload.organization,
      sso: true,
      is_guest: payload.is_guest,
    },
    process.env.JWT_SECRET,
    { expiresIn: "180d" }
  );

  return res.json({
    success: true,
    access_token: token,
    refresh_token: null,
    token_type: "bearer",
    user: payload,
    guest: payload.is_guest,
  });
});

// Read-only session introspection — never creates or merges accounts.
router.get("/session", (req, res) => {
  if (!praveshEnabled()) {
    return res.status(503).json({
      success: false,
      error: "Pravesh bridge not configured (set PRAVESH_JWT_SECRET)",
    });
  }

  const identity = identityFromRequest(req);
  if (!identity) {
    return res
      .status(401)
      .json({ success: false, error: "Not authenticated with Pravesh" });
  }
  if (!appAllowed(identity)) {
    return res.status(403).json({
      success: false,
      error: `Access denied: app '${process.env.PRAVESH_APP_SLUG || "niyantran"}' not in token allowedApps`,
    });
  }

  const local = localIdentity(identity);
  return res.json({
    success: true,
    authenticated: true,
    app: process.env.PRAVESH_APP_SLUG || "niyantran",
    mode: "read-only",
    user: {
      user_id: identity.user_id,
      email: identity.email,
      tenant_id: identity.tenant_id,
      roles: identity.roles,
      permissions: identity.permissions,
      allowedApps: identity.allowedApps,
      is_guest: identity.is_guest,
    },
    identity_mapping: {
      local_identity: local.local_id,
      link_status: identity.email ? "unmapped" : "no_email",
      linked_local_user_id: null,
      merge_policy: "email_is_linking_attribute_only",
    },
  });
});

module.exports = router;
