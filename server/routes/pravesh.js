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
      error: `Access denied: app '${process.env.PRAVESH_APP_SLUG || "niyantran"}' not in token allowedApps`,
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(503).json({
      success: false,
      error: "Niyantran JWT_SECRET is not configured",
    });
  }

  // Check if this user already exists in Niyantran's MongoDB collection by email
  let existingUser = null;
  if (identity.email) {
    try {
      existingUser = await User.findOne({ email: identity.email.toLowerCase().trim() });
    } catch (err) {
      console.warn("[PRAVESH] User lookup error:", err.message);
    }
  }

  // Prevent exited users from logging in via SSO
  if (existingUser && existingUser.stillExist === 0) {
    return res.status(403).json({
      error: "Your account has been marked as exited. Access to Niyantran is deactivated.",
      code: "ACCOUNT_DEACTIVATED"
    });
  }

  let payload;
  if (existingUser) {
    // User already has an account on Niyantran: Open their EXACT existing account, role & tasks!
    payload = {
      id: String(existingUser._id),
      user_id: String(existingUser._id),
      name: existingUser.name,
      email: existingUser.email,
      role: existingUser.role, // Exact role from existing account (User, Manager, Admin, etc.)
      department: existingUser.department,
      branch: existingUser.branch || "blackhole_mumbai",
      sso: true,
      is_guest: false,
      blackhole_user_id: identity.user_id,
    };
  } else {
    // New user without prior Niyantran account: Map role from Pravesh claims
    const local = localIdentity(identity);
    payload = {
      id: local.local_id,
      user_id: local.local_id,
      name: (identity.email || "").split("@")[0] || identity.user_id,
      email: local.email,
      role: local.role,
      sso: true,
      is_guest: local.is_guest,
      blackhole_user_id: identity.user_id,
    };
  }

  const token = jwt.sign(
    {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      department: payload.department,
      branch: payload.branch,
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
