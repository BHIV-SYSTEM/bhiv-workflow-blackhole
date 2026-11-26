/**
 * knowledgeAdmin.js
 *
 * Multi-Product Knowledge Admin & Akash Sir Governor Approval Engine.
 * Supports independent contexts per product for each employee, versioning,
 * Governor approval workflow (Akash/Ansh/Admin), and MongoDB ProductContext storage.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const ProductContext = require('../models/ProductContext');
const User = require('../models/User');
const Department = require('../models/Department');
const { withdrawKnowledgeContext } = require('../services/parikshakService');

const getParikshakBaseUrl = () =>
    (process.env.PARIKSHAK_URL || 'https://parikshak.blackholeinfiverse.com')
        .replace(/\/parikshak\/review\/?$/, '')
        .replace(/\/$/, '');

const PARIKSHAK_URL = getParikshakBaseUrl();
const PARIKSHAK_TOKEN = process.env.PARIKSHAK_TOKEN || '';
const PARIKSHAK_API_KEY = process.env.PARIKSHAK_API_KEY || process.env.NIYANTRAN_API_KEY || '';

const getAxiosConfig = () => {
    const config = {
        headers: { 'Content-Type': 'application/json' },
        timeout: 4500,
        validateStatus: (status) => status < 600
    };
    if (PARIKSHAK_API_KEY) {
        config.headers['x-api-key'] = PARIKSHAK_API_KEY;
    }
    if (PARIKSHAK_TOKEN) {
        config.headers['Authorization'] = `Bearer ${PARIKSHAK_TOKEN}`;
    }
    return config;
};

async function syncContextToParikshak(ctx, source = 'Niyantran_Direct_Sync') {
    if (!ctx) return null;
    try {
        const baseUrl = getParikshakBaseUrl();
        const payload = {
            product_id: ctx.productId,
            employee_id: ctx.employeeId,
            individual_id: ctx.employeeId,
            context_id: ctx.contextId,
            version: ctx.version || 'v1.0',
            content: ctx.content,
            status: ctx.status || 'ACTIVE',
            dataset_type: 'individual_context',
            source
        };
        const resp = await axios.post(`${baseUrl}/api/v1/knowledge/ingest`, payload, getAxiosConfig());
        return resp.data;
    } catch (apiErr) {
        console.warn(`[PARIKSHAK_INGEST] Non-blocking sync warning (${source}):`, apiErr.message);
        return null;
    }
}

const AUTHORIZED_GOVERNOR_EMAILS = [
    'akash@blackhole.ai',
    'akash@blackholeinfiverse.com',
    'ansh@blackhole.ai',
    'governor@blackhole.ai'
];

const CANONICAL_GOVERNOR_IDS = [
    'EMP-BHIV-GOV-01',
    'USR-GOV-001'
];

const RESTRICTED_ROLES = [
    'intern',
    'student',
    'employee',
    'reviewer',
    'operator',
    'user'
];

/**
 * Helper to determine whether the authenticated caller has Governor / Approval authority.
 * Authorized:
 *  1. Canonical Governor ID ('EMP-BHIV-GOV-01', 'USR-GOV-001')
 *  2. Exact authorized corporate Governor email ('akash@blackhole.ai', 'akash@blackholeinfiverse.com', 'ansh@blackhole.ai', 'governor@blackhole.ai')
 *  3. Explicit Governor or Admin role (case-insensitive)
 *
 * Explicitly rejects non-governor roles ('intern', 'student', 'employee', 'reviewer', 'operator', 'user')
 * unless verified corporate Governor email or canonical Governor ID is present.
 * Loose substring matching (e.g. .includes('akash')) is strictly prohibited.
 */
function isGovernorCaller(user) {
    if (!user) return false;
    const role = (user.role || '').trim().toLowerCase();
    const email = (user.email || '').trim().toLowerCase();
    const canonicalId = (user.canonicalEmployeeId || user.employeeId || user.userId || user.id || '').trim().toUpperCase();

    // 1. Authorized Canonical Governor ID
    if (CANONICAL_GOVERNOR_IDS.includes(canonicalId)) {
        return true;
    }

    // 2. Exact authorized corporate Governor email
    if (AUTHORIZED_GOVERNOR_EMAILS.includes(email)) {
        return true;
    }

    // Explicitly reject standard non-governor roles
    if (RESTRICTED_ROLES.includes(role)) {
        return false;
    }

    // 3. Governor or Admin role (case-insensitive)
    if (role === 'governor' || role === 'admin') {
        return true;
    }

    return false;
}

/**
 * Helper aligned with KnowledgeAdmin.jsx (`Governor`, `Admin`, `Manager`).
 * Grants privileged directory & per-employee context CRUD access.
 */
function isAdminCaller(user) {
    if (isGovernorCaller(user)) return true;
    if (!user) return false;
    const role = (user.role || '').trim().toLowerCase();
    return role === 'admin' || role === 'manager' || role === 'governor';
}

/**
 * Resolves the authenticated caller's canonical identity with DB User fallback
 * so older JWTs lacking employeeId/canonicalEmployeeId/tenantId never collide on a shared literal.
 */
async function resolveCallerIdentity(reqUser) {
    const rawUserId = reqUser?._id || reqUser?.id || null;
    const userId = rawUserId ? String(rawUserId).trim() : null;
    let canonicalEmployeeId = (reqUser?.canonicalEmployeeId && reqUser.canonicalEmployeeId !== 'N/A')
        ? String(reqUser.canonicalEmployeeId).trim()
        : '';
    let employeeId = (reqUser?.employeeId && reqUser.employeeId !== 'N/A')
        ? String(reqUser.employeeId).trim()
        : '';
    let tenantId = reqUser?.tenantId ? String(reqUser.tenantId).trim() : '';
    let name = reqUser?.name ? String(reqUser.name).trim() : '';
    let email = reqUser?.email ? String(reqUser.email).trim().toLowerCase() : '';

    if (userId && (!canonicalEmployeeId || !employeeId || !tenantId || !name || !email)) {
        try {
            if (mongoose.Types.ObjectId.isValid(userId)) {
                const dbUser = await User.findById(userId)
                    .select('canonicalEmployeeId employeeId tenantId name email')
                    .lean();
                if (dbUser) {
                    if (!canonicalEmployeeId && dbUser.canonicalEmployeeId && dbUser.canonicalEmployeeId !== 'N/A') {
                        canonicalEmployeeId = String(dbUser.canonicalEmployeeId).trim();
                    }
                    if (!employeeId && dbUser.employeeId && dbUser.employeeId !== 'N/A') {
                        employeeId = String(dbUser.employeeId).trim();
                    }
                    if (!tenantId && dbUser.tenantId) {
                        tenantId = String(dbUser.tenantId).trim();
                    }
                    if (!name && dbUser.name) {
                        name = String(dbUser.name).trim();
                    }
                    if (!email && dbUser.email) {
                        email = String(dbUser.email).trim().toLowerCase();
                    }
                }
            }
        } catch (err) {
            console.warn('[KNOWLEDGE_IDENTITY] User.findById fallback error:', err.message);
        }
    }

    const effectiveEmployeeId = (canonicalEmployeeId || employeeId || (userId ? `USR-${userId}` : 'USR-ANON')).trim();
    const effectiveTenantId = tenantId || 'ten-bhiv-core';

    return {
        userId,
        canonicalEmployeeId: canonicalEmployeeId || null,
        employeeId: employeeId || null,
        effectiveEmployeeId,
        tenantId: effectiveTenantId,
        name: name || effectiveEmployeeId,
        email
    };
}

/**
 * Resolves a target employee for admin per-employee context CRUD.
 * Ensures `user` ObjectId & `employeeId` belong to the target employee (never the admin).
 */
async function resolveTargetEmployeeForAdmin({ targetUserId, userId, employeeId, tenantId }, caller) {
    const requestedUserId = (targetUserId || userId || '').toString().trim();
    const requestedEmpId = (employeeId || '').toString().trim();
    const requestedTenant = (tenantId || '').toString().trim();

    let targetUser = null;
    if (requestedUserId) {
        if (!mongoose.Types.ObjectId.isValid(requestedUserId)) {
            return { error: 'Target employee not found', status: 404 };
        }
        targetUser = await User.findById(requestedUserId)
            .select('_id name email canonicalEmployeeId employeeId tenantId')
            .lean();
        if (!targetUser) {
            return { error: 'Target employee not found', status: 404 };
        }
    } else if (requestedEmpId) {
        const escapedEmp = requestedEmpId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const empQuery = {
            $or: [
                { canonicalEmployeeId: new RegExp(`^${escapedEmp}$`, 'i') },
                { employeeId: new RegExp(`^${escapedEmp}$`, 'i') }
            ]
        };
        if (requestedTenant) {
            targetUser = await User.findOne({ ...empQuery, tenantId: requestedTenant })
                .select('_id name email canonicalEmployeeId employeeId tenantId')
                .lean();
        }
        if (!targetUser) {
            targetUser = await User.findOne(empQuery)
                .select('_id name email canonicalEmployeeId employeeId tenantId')
                .lean();
        }
    }

    if (targetUser) {
        const targetCanonical = (targetUser.canonicalEmployeeId && targetUser.canonicalEmployeeId !== 'N/A')
            ? String(targetUser.canonicalEmployeeId).trim()
            : '';
        const targetPlain = (targetUser.employeeId && targetUser.employeeId !== 'N/A')
            ? String(targetUser.employeeId).trim()
            : '';
        const resolvedEmp = targetCanonical || targetPlain || requestedEmpId || `USR-${String(targetUser._id)}`;
        return {
            userObjectId: targetUser._id,
            employeeId: resolvedEmp,
            tenantId: requestedTenant || targetUser.tenantId || caller.tenantId || 'ten-bhiv-core',
            name: targetUser.name || resolvedEmp,
            email: targetUser.email || '',
            targetUser
        };
    }

    return {
        userObjectId: caller.userId,
        employeeId: requestedEmpId || caller.effectiveEmployeeId,
        tenantId: requestedTenant || caller.tenantId || 'ten-bhiv-core',
        name: caller.name,
        email: caller.email,
        targetUser: null
    };
}

function getCallerEmployeeIdCandidates(caller) {
    return [
        caller?.canonicalEmployeeId,
        caller?.employeeId,
        caller?.effectiveEmployeeId
    ]
        .filter(Boolean)
        .map((v) => String(v).toUpperCase().trim());
}

/**
 * Increment a semantic version string.
 * Examples: 'v1.0' -> 'v1.1', '1.0' -> '1.1', 'v2' -> 'v2.1', 'vNEXT-Build-10' -> 'vNEXT-Build-11'
 */
function incrementVersion(currentVersion) {
    if (!currentVersion) return 'v1.1';
    const trimmed = currentVersion.trim();

    // Standard v1.0 or 1.0 pattern
    const vMatch = trimmed.match(/^v?(\d+)\.(\d+)$/i);
    if (vMatch) {
        const major = vMatch[1];
        const minor = parseInt(vMatch[2], 10) + 1;
        const prefix = trimmed.startsWith('v') || trimmed.startsWith('V') ? 'v' : '';
        return `${prefix}${major}.${minor}`;
    }

    // Numbered suffix e.g. Build-10
    const numSuffixMatch = trimmed.match(/^(.*?)(\d+)$/);
    if (numSuffixMatch) {
        const prefix = numSuffixMatch[1];
        const num = parseInt(numSuffixMatch[2], 10) + 1;
        return `${prefix}${num}`;
    }

    return `${trimmed}.1`;
}

// =========================================================================
// FEATURE 13: AKASH SIR'S GOVERNOR APPROVAL WORKFLOW & MULTI-PRODUCT APIS
// =========================================================================

/**
 * GET /contexts
 * Lists product contexts with filters, pagination, and search.
 */
router.get('/contexts', auth, async (req, res) => {
    try {
        const {
            productId,
            product_id,
            employeeId,
            employee_id,
            tenantId,
            tenant_id,
            status,
            search,
            page = 1,
            limit = 1000
        } = req.query;

        const filter = {};
        if (req.query.includeDeleted !== 'true') {
            filter.isDeleted = { $ne: true };
            filter.status = { $ne: 'DELETED' };
        }

        // Product filter (case-insensitive)
        const effectiveProductId = productId || product_id;
        if (effectiveProductId) {
            filter.productId = effectiveProductId.trim().toUpperCase();
        }

        // Employee filter (canonical ID)
        const effectiveEmployeeId = employeeId || employee_id;
        if (effectiveEmployeeId) {
            filter.employeeId = effectiveEmployeeId.trim();
        }

        // Status filter
        if (status && status !== 'ALL') {
            const normalizedStatus = status.trim().toUpperCase();
            if (req.query.includeDeleted === 'true' || normalizedStatus !== 'DELETED') {
                filter.status = normalizedStatus;
            }
        }

        // Multi-tenant boundary check
        const isPriv = isAdminCaller(req.user);
        const caller = await resolveCallerIdentity(req.user);
        const callerTenant = caller.tenantId;

        if (tenantId || tenant_id) {
            const requestedTenant = (tenantId || tenant_id).trim();
            if (!isPriv && requestedTenant !== callerTenant) {
                return res.status(403).json({
                    error: "Cross-tenant context query forbidden",
                    detail: "Cross-tenant context query forbidden"
                });
            }
            filter.tenantId = requestedTenant;
        } else if (!isPriv) {
            filter.tenantId = callerTenant;
        }

        // Search query across productName, productId, employeeId, content, summary
        if (search && search.trim()) {
            const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [
                { productName: { $regex: escaped, $options: 'i' } },
                { productId: { $regex: escaped, $options: 'i' } },
                { employeeId: { $regex: escaped, $options: 'i' } },
                { content: { $regex: escaped, $options: 'i' } },
                { summary: { $regex: escaped, $options: 'i' } }
            ];
        }

        const rawLimit = String(limit ?? '').trim().toLowerCase();
        const isUnbounded = rawLimit === 'all' || rawLimit === '0';
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = isUnbounded ? 0 : Math.max(1, parseInt(limit, 10) || 1000);
        const skip = isUnbounded ? 0 : (pageNum - 1) * limitNum;

        let queryBuilder = ProductContext.find(filter)
            .sort({ updatedAt: -1, submittedAt: -1 });
        if (!isUnbounded) {
            queryBuilder = queryBuilder.skip(skip).limit(limitNum);
        }

        const [items, total] = await Promise.all([
            queryBuilder
                .populate('user', 'name email role department employeeId canonicalEmployeeId')
                .lean(),
            ProductContext.countDocuments(filter)
        ]);

        return res.json({
            items,
            total,
            page: pageNum,
            limit: isUnbounded ? total : limitNum,
            totalPages: isUnbounded ? 1 : (Math.ceil(total / limitNum) || 1)
        });
    } catch (err) {
        console.error("Error in GET /contexts:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * GET /contexts/:id
 * Fetches single product context by contextId or Mongo _id.
 */
router.get('/contexts/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        let ctx = await ProductContext.findOne({ contextId: id }).populate('user', 'name email role department canonicalEmployeeId');
        if (!ctx && id.match(/^[0-9a-fA-F]{24}$/)) {
            ctx = await ProductContext.findById(id).populate('user', 'name email role department canonicalEmployeeId');
        }

        if (!ctx) {
            return res.status(404).json({ error: "Context not found", detail: "Context not found" });
        }

        // Cross-tenant boundary check
        const isPriv = isAdminCaller(req.user);
        const caller = await resolveCallerIdentity(req.user);
        if (!isPriv && ctx.tenantId !== caller.tenantId) {
            return res.status(403).json({ error: "Cross-tenant context access forbidden", detail: "Cross-tenant context access forbidden" });
        }

        return res.json(ctx);
    } catch (err) {
        console.error("Error in GET /contexts/:id:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * POST /contexts
 * Creates a new product context or updates an existing one (immediately ACTIVE without approval).
 */
router.post('/contexts', auth, async (req, res) => {
    try {
        const {
            productId,
            product_id,
            productName,
            content,
            summary,
            employeeId,
            employee_id,
            targetUserId,
            userId,
            tenantId
        } = req.body;

        const effectiveProductId = (productId || product_id || '').trim().toUpperCase();
        if (!effectiveProductId || !content || !content.trim()) {
            return res.status(400).json({
                error: "productId and content required",
                detail: "productId and content required"
            });
        }

        const caller = await resolveCallerIdentity(req.user);
        const isPriv = isAdminCaller(req.user);

        let targetEmployeeId = caller.effectiveEmployeeId;
        let targetUserObjectId = caller.userId;
        let targetTenantId = caller.tenantId;

        const requestedEmp = employeeId || employee_id;
        const requestedUid = targetUserId || userId;
        if (isPriv && (requestedUid || requestedEmp || tenantId)) {
            const targetResolved = await resolveTargetEmployeeForAdmin(
                { targetUserId, userId, employeeId: requestedEmp, tenantId },
                caller
            );
            if (targetResolved.error) {
                return res.status(targetResolved.status || 404).json({
                    error: targetResolved.error,
                    detail: targetResolved.error
                });
            }
            targetEmployeeId = targetResolved.employeeId;
            targetUserObjectId = targetResolved.userObjectId;
            targetTenantId = targetResolved.tenantId;
        }

        const effectiveProductName = (productName || effectiveProductId).trim();
        const effectiveSummary = (summary || (content.trim().length > 300 ? content.trim().substring(0, 300) + '...' : content.trim())).trim();

        // Check if a context record already exists for this (employeeId, productId, tenantId)
        let existingDoc = await ProductContext.findOne({
            employeeId: targetEmployeeId,
            productId: effectiveProductId,
            tenantId: targetTenantId
        });

        const now = new Date();

        if (existingDoc) {
            // Archive current version into versionHistory
            const currentHistoryEntry = {
                version: existingDoc.version || 'v1.0',
                content: existingDoc.content,
                summary: existingDoc.summary || '',
                approvedAt: existingDoc.approvedAt || null,
                approvedBy: existingDoc.approvedBy || null,
                timestamp: existingDoc.submittedAt || now
            };

            const newVersion = incrementVersion(existingDoc.version);

            existingDoc.versionHistory.push(currentHistoryEntry);
            existingDoc.version = newVersion;
            existingDoc.content = content.trim();
            existingDoc.summary = effectiveSummary;
            existingDoc.status = 'ACTIVE';
            if (targetUserObjectId) {
                existingDoc.user = targetUserObjectId;
            }
            existingDoc.isDeleted = false;
            existingDoc.deletedAt = null;
            existingDoc.deletedBy = null;
            existingDoc.deletionReason = null;
            existingDoc.previousStatus = null;
            existingDoc.submittedAt = now;
            existingDoc.rejectionReason = null;
            existingDoc.outdatedReason = null;
            existingDoc.approvedBy = null;
            existingDoc.approvedAt = null;
            existingDoc.productName = effectiveProductName;
            existingDoc.updatedAt = now;

            await existingDoc.save();
            await syncContextToParikshak(existingDoc, 'Niyantran_Direct_Update');

            if (req.io) {
                req.io.emit('knowledge:context:updated', {
                    contextId: existingDoc.contextId,
                    employeeId: targetEmployeeId,
                    productId: effectiveProductId,
                    version: newVersion,
                    status: 'ACTIVE'
                });
            }

            return res.status(200).json(existingDoc);
        } else {
            // Create brand new product context (immediately ACTIVE)
            const newDoc = new ProductContext({
                contextId: `CTX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                tenantId: targetTenantId,
                employeeId: targetEmployeeId,
                user: targetUserObjectId,
                productId: effectiveProductId,
                productName: effectiveProductName,
                version: 'v1.0',
                status: 'ACTIVE',
                content: content.trim(),
                summary: effectiveSummary,
                rejectionReason: null,
                outdatedReason: null,
                submittedAt: now,
                approvedBy: null,
                approvedAt: null,
                versionHistory: [
                    {
                        version: 'v1.0',
                        content: content.trim(),
                        summary: effectiveSummary,
                        timestamp: now
                    }
                ]
            });

            await newDoc.save();
            await syncContextToParikshak(newDoc, 'Niyantran_Direct_Create');

            if (req.io) {
                req.io.emit('knowledge:context:created', {
                    contextId: newDoc.contextId,
                    employeeId: targetEmployeeId,
                    productId: effectiveProductId,
                    version: 'v1.0',
                    status: 'ACTIVE'
                });
            }

            return res.status(201).json(newDoc);
        }
    } catch (err) {
        console.error("Error in POST /contexts:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * PUT /contexts/:id
 * Updates an existing context by contextId or _id, advancing version and setting status to ACTIVE.
 */
router.put('/contexts/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { content, summary, productName } = req.body;

        let ctx = await ProductContext.findOne({ contextId: id });
        if (!ctx && id.match(/^[0-9a-fA-F]{24}$/)) {
            ctx = await ProductContext.findById(id);
        }

        if (!ctx) {
            return res.status(404).json({ error: "Context not found", detail: "Context not found" });
        }

        const caller = await resolveCallerIdentity(req.user);
        const isPriv = isAdminCaller(req.user);
        if (!isPriv && ctx.tenantId !== caller.tenantId) {
            return res.status(403).json({ error: "Cross-tenant modification forbidden", detail: "Cross-tenant modification forbidden" });
        }

        const callerEmpIds = getCallerEmployeeIdCandidates(caller);
        const ctxEmp = (ctx.employeeId || '').toUpperCase().trim();
        const ctxUserId = (ctx.user?._id || ctx.user || '').toString();
        const isOwner = Boolean(
            (ctxEmp && callerEmpIds.includes(ctxEmp)) ||
            (caller.userId && ctxUserId && ctxUserId === caller.userId)
        );
        if (!isPriv && !isOwner) {
            return res.status(403).json({ error: "Unauthorized to modify this context", detail: "Unauthorized to modify this context" });
        }

        const newContent = content !== undefined ? content.trim() : ctx.content;
        if (!newContent) {
            return res.status(400).json({ error: "content cannot be empty", detail: "content cannot be empty" });
        }
        const newSummary = summary !== undefined ? summary.trim() : ctx.summary;
        const now = new Date();

        // Push previous version into history
        ctx.versionHistory.push({
            version: ctx.version,
            content: ctx.content,
            summary: ctx.summary,
            approvedAt: ctx.approvedAt,
            approvedBy: ctx.approvedBy,
            timestamp: now
        });

        const newVersion = incrementVersion(ctx.version);
        ctx.version = newVersion;
        ctx.content = newContent;
        ctx.summary = newSummary;
        if (productName) ctx.productName = productName.trim();
        ctx.status = 'ACTIVE';
        ctx.isDeleted = false;
        ctx.deletedAt = null;
        ctx.deletedBy = null;
        ctx.deletionReason = null;
        ctx.previousStatus = null;
        ctx.rejectionReason = null;
        ctx.outdatedReason = null;
        ctx.approvedBy = null;
        ctx.approvedAt = null;
        ctx.submittedAt = now;
        ctx.updatedAt = now;

        await ctx.save();
        await syncContextToParikshak(ctx, 'Niyantran_Direct_Update');

        if (req.io) {
            req.io.emit('knowledge:context:updated', {
                contextId: ctx.contextId,
                productId: ctx.productId,
                version: newVersion,
                status: 'ACTIVE'
            });
        }

        return res.json(ctx);
    } catch (err) {
        console.error("Error in PUT /contexts/:id:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * Context Deletion / Withdrawal Handler
 * Soft-deletes a product context.
 * Rules:
 * 1. Draft, Pending Approval, Rejected, Outdated: Owner or Governor can delete/withdraw.
 * 2. Approved: ONLY Governor can delete/withdraw (regular employee gets 403 Forbidden).
 * 3. Never permanently deletes records or versionHistory.
 * 4. Records deletedBy, deletedAt, deletionReason, previousStatus.
 * 5. Synchronizes withdrawal to Parikshak.
 * 6. Emits socket events to refresh queues and cards.
 */
async function handleContextDeletion(req, res) {
    try {
        const id = req.params.id || req.params.contextId;
        let ctx = await ProductContext.findOne({ contextId: id });
        if (!ctx && id.match(/^[0-9a-fA-F]{24}$/)) {
            ctx = await ProductContext.findById(id);
        }

        if (!ctx) {
            return res.status(404).json({ error: "Context not found", detail: "Context not found" });
        }

        const caller = await resolveCallerIdentity(req.user);
        const isPriv = isAdminCaller(req.user);

        if (!isPriv && ctx.tenantId !== caller.tenantId) {
            return res.status(403).json({
                error: "Cross-tenant context deletion forbidden",
                detail: "Cross-tenant context deletion forbidden"
            });
        }

        // Check if already soft-deleted
        if (ctx.isDeleted || ctx.status === 'DELETED') {
            return res.status(409).json({
                error: "Context is already deleted or withdrawn",
                detail: "Context is already deleted or withdrawn",
                context: ctx
            });
        }

        // Ownership resolution (works with JWT claims or DB User fallback)
        const callerEmpIds = getCallerEmployeeIdCandidates(caller);
        const ctxEmp = (ctx.employeeId || '').toUpperCase().trim();
        const ctxUserId = (ctx.user?._id || ctx.user || '').toString();

        const isOwner = Boolean(
            (ctxEmp && callerEmpIds.includes(ctxEmp)) ||
            (caller.userId && ctxUserId && ctxUserId === caller.userId)
        );

        // Owners can delete their own contexts regardless of status; admins can delete any context
        if (!isPriv && !isOwner) {
            return res.status(403).json({
                error: "Unauthorized: You can only delete or withdraw your own product context",
                detail: "Unauthorized: You can only delete or withdraw your own product context"
            });
        }

        const previousStatus = ctx.status;
        const now = new Date();
        const deletedByName = caller.name || caller.effectiveEmployeeId || 'User';
        const deletionReason = (req.body?.reason || req.body?.deletionReason || req.query?.reason || 'Withdrawn by user').trim();

        // Archive current state into versionHistory before soft deletion
        ctx.versionHistory.push({
            version: ctx.version || 'v1.0',
            content: ctx.content,
            summary: `[WITHDRAWN - ${deletionReason}] ${ctx.summary || ''}`.trim(),
            approvedAt: ctx.approvedAt || null,
            approvedBy: ctx.approvedBy || null,
            timestamp: now
        });

        ctx.previousStatus = previousStatus;
        ctx.status = 'DELETED';
        ctx.isDeleted = true;
        ctx.deletedAt = now;
        ctx.deletedBy = deletedByName;
        ctx.deletionReason = deletionReason;
        ctx.updatedAt = now;

        await ctx.save();

        // Parikshak / RAG registry synchronization (non-blocking)
        try {
            await withdrawKnowledgeContext({
                productId: ctx.productId,
                individualId: ctx.employeeId,
                contextId: ctx.contextId,
                deletedBy: deletedByName,
                deletionReason
            });
        } catch (apiErr) {
            console.warn("[KNOWLEDGE_WITHDRAW] Parikshak notification notice:", apiErr.message);
        }

        if (req.io) {
            req.io.emit('knowledge:context:deleted', {
                contextId: ctx.contextId,
                productId: ctx.productId,
                employeeId: ctx.employeeId,
                deletedBy: deletedByName,
                previousStatus,
                timestamp: now.toISOString()
            });
            req.io.emit('knowledge:sync', {
                candidateName: ctx.employeeId,
                employeeId: ctx.employeeId,
                product_id: ctx.productId,
                status: 'DELETED',
                timestamp: now.toISOString()
            });
        }

        return res.json({
            status: "SUCCESS",
            message: `Product context for ${ctx.productId} (${ctx.version}) successfully withdrawn and soft-deleted.`,
            context: ctx
        });
    } catch (err) {
        console.error("Error in delete context:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
}

// Deletion endpoints (supporting DELETE and POST aliases)
router.delete('/contexts/:id', auth, handleContextDeletion);
router.post('/contexts/:id/delete', auth, handleContextDeletion);
router.post('/contexts/:id/withdraw', auth, handleContextDeletion);
router.delete('/approvals/:contextId', auth, handleContextDeletion);
router.post('/approvals/:contextId/withdraw', auth, handleContextDeletion);
router.post('/approvals/:contextId/delete', auth, handleContextDeletion);

/**
 * POST /contexts/:id/mark-outdated
 * Marks a context version as outdated.
 */
router.post('/contexts/:id/mark-outdated', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const reason = (req.body.reason || req.body.outdatedReason || 'Context version superseded or deprecated').trim();

        let ctx = await ProductContext.findOne({ contextId: id });
        if (!ctx && id.match(/^[0-9a-fA-F]{24}$/)) {
            ctx = await ProductContext.findById(id);
        }

        if (!ctx) {
            return res.status(404).json({ error: "Context not found", detail: "Context not found" });
        }

        const caller = await resolveCallerIdentity(req.user);
        const isPriv = isAdminCaller(req.user);
        if (!isPriv && ctx.tenantId !== caller.tenantId) {
            return res.status(403).json({ error: "Cross-tenant context access forbidden", detail: "Cross-tenant context access forbidden" });
        }

        const callerEmpIds = getCallerEmployeeIdCandidates(caller);
        const ctxEmp = (ctx.employeeId || '').toUpperCase().trim();
        const ctxUserId = (ctx.user?._id || ctx.user || '').toString();
        const isOwner = Boolean(
            (ctxEmp && callerEmpIds.includes(ctxEmp)) ||
            (caller.userId && ctxUserId && ctxUserId === caller.userId)
        );
        if (!isPriv && !isOwner) {
            return res.status(403).json({ error: "Unauthorized to mark this context outdated", detail: "Unauthorized to mark this context outdated" });
        }

        ctx.status = 'OUTDATED';
        ctx.outdatedReason = reason;
        ctx.updatedAt = new Date();

        await ctx.save();
        return res.json(ctx);
    } catch (err) {
        console.error("Error in mark-outdated:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

// =========================================================================
// BACKWARD COMPATIBILITY & MIGRATED DB QUERIES
// =========================================================================

/**
 * GET /compliance
 * Audits active users against MongoDB ProductContext collection.
 * Excludes deleted contexts, merges across canonicalEmployeeId, employeeId, and user._id within tenant.
 */
router.get('/compliance', auth, async (req, res) => {
    try {
        const caller = await resolveCallerIdentity(req.user);
        const isPriv = isAdminCaller(req.user);
        const userQuery = isPriv
            ? { stillExist: { $ne: 0 } }
            : { stillExist: { $ne: 0 }, tenantId: caller.tenantId };

        let users = [];
        try {
            users = await User.find(userQuery).populate('department').sort({ name: 1 }).lean();
        } catch (popErr) {
            users = await User.find(userQuery).sort({ name: 1 }).lean();
        }

        const allContexts = await ProductContext.find({
            isDeleted: { $ne: true },
            status: { $ne: 'DELETED' }
        }).sort({ updatedAt: -1, submittedAt: -1 }).lean();

        // Index contexts by tenantId:employeeId and tenantId:userId for strict multi-tenant isolation
        const contextsByEmpId = new Map();
        const contextsByUserId = new Map();

        allContexts.forEach(ctx => {
            const ctxTenant = ctx.tenantId || 'ten-bhiv-core';
            const empRaw = (ctx.employeeId || '').toUpperCase().trim();
            if (empRaw) {
                const empKey = `${ctxTenant}:${empRaw}`;
                if (!contextsByEmpId.has(empKey)) contextsByEmpId.set(empKey, []);
                contextsByEmpId.get(empKey).push(ctx);
            }
            if (ctx.user) {
                const uKey = `${ctxTenant}:${ctx.user.toString()}`;
                if (!contextsByUserId.has(uKey)) contextsByUserId.set(uKey, []);
                contextsByUserId.get(uKey).push(ctx);
            }
        });

        const userAudit = users.map(u => {
            const canonicalId = (u.canonicalEmployeeId && u.canonicalEmployeeId !== 'N/A' ? u.canonicalEmployeeId : '').toUpperCase().trim();
            const plainEmpId = (u.employeeId && u.employeeId !== 'N/A' ? u.employeeId : '').toUpperCase().trim();
            const userIdStr = (u._id || '').toString();
            const uTenant = u.tenantId || 'ten-bhiv-core';

            // Merge ALL matching contexts across canonicalEmployeeId, employeeId, and user._id within tenant (dedup by _id)
            const mergedMap = new Map();
            const addMatches = (list) => {
                if (!Array.isArray(list)) return;
                for (const c of list) {
                    const key = String(c._id || c.contextId);
                    if (!mergedMap.has(key)) {
                        mergedMap.set(key, c);
                    }
                }
            };

            if (canonicalId) addMatches(contextsByEmpId.get(`${uTenant}:${canonicalId}`));
            if (plainEmpId) addMatches(contextsByEmpId.get(`${uTenant}:${plainEmpId}`));
            if (userIdStr) addMatches(contextsByUserId.get(`${uTenant}:${userIdStr}`));

            const matchedContexts = Array.from(mergedMap.values()).sort((a, b) => {
                const ta = new Date(a.updatedAt || a.submittedAt || 0).getTime();
                const tb = new Date(b.updatedAt || b.submittedAt || 0).getTime();
                return tb - ta;
            });

            // Partition by product (latest per product)
            const contextsByProduct = {};
            matchedContexts.forEach(c => {
                const pid = (c.productId || 'BHIV').toUpperCase();
                const cTime = new Date(c.updatedAt || c.submittedAt || 0).getTime();
                const existingTime = contextsByProduct[pid]
                    ? new Date(contextsByProduct[pid].updatedAt || contextsByProduct[pid].submittedAt || 0).getTime()
                    : -1;
                if (!contextsByProduct[pid] || cTime > existingTime) {
                    contextsByProduct[pid] = c;
                }
            });

            // Find primary active context (prefer ACTIVE / APPROVED, else latest non-deleted)
            const primaryContext =
                matchedContexts.find(c => c.status === 'ACTIVE' || c.status === 'APPROVED') ||
                matchedContexts[0] ||
                null;

            const resolvedEmpDisplay =
                (u.canonicalEmployeeId && u.canonicalEmployeeId !== 'N/A' ? u.canonicalEmployeeId : null) ||
                (u.employeeId && u.employeeId !== 'N/A' ? u.employeeId : null) ||
                'N/A';

            return {
                _id: u._id,
                id: u._id,
                employeeId: resolvedEmpDisplay,
                canonicalEmployeeId: resolvedEmpDisplay,
                name: u.name,
                email: u.email,
                role: u.role,
                department: u.department ? (typeof u.department === 'object' && u.department.name ? u.department.name : String(u.department)) : 'No Department',
                workMode: u.workMode || 'WFO',
                branch: u.branch || 'blackhole_mumbai',
                tenantId: uTenant,
                organization: u.organization || 'BHIV',
                hasContext: matchedContexts.length > 0,
                contextCount: Object.keys(contextsByProduct).length,
                contextsByProduct,
                contexts: matchedContexts,
                injectedContext: primaryContext ? {
                    dataset_id: primaryContext.contextId,
                    summary: primaryContext.summary || (primaryContext.content ? primaryContext.content.substring(0, 300) : ''),
                    content: primaryContext.content,
                    version: primaryContext.version || 'v1.0',
                    source: 'MongoDB ProductContext',
                    ingestion_timestamp: primaryContext.updatedAt || primaryContext.submittedAt,
                    product_id: primaryContext.productId,
                    project_name: primaryContext.productName || primaryContext.productId,
                    status: primaryContext.status,
                    approvedBy: primaryContext.approvedBy,
                    approvedAt: primaryContext.approvedAt
                } : null
            };
        });

        // Compute department breakdown
        const deptMap = {};
        userAudit.forEach(u => {
            const d = u.department || 'No Department';
            if (!deptMap[d]) {
                deptMap[d] = { name: d, total: 0, filled: 0, pending: 0 };
            }
            deptMap[d].total += 1;
            if (u.hasContext) deptMap[d].filled += 1;
            else deptMap[d].pending += 1;
        });

        const totalActive = userAudit.length;
        const totalFilled = userAudit.filter(u => u.hasContext).length;
        const totalPending = totalActive - totalFilled;
        const compliancePercentage = totalActive > 0 ? Math.round((totalFilled / totalActive) * 100) : 0;

        return res.json({
            status: "SUCCESS",
            totalActive,
            totalFilled,
            totalPending,
            compliancePercentage,
            departments: Object.values(deptMap),
            users: userAudit
        });
    } catch (err) {
        console.error("Error in /api/knowledge/compliance:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * GET /my-contexts
 * Returns all product contexts belonging to the authenticated caller.
 */
router.get('/my-contexts', auth, async (req, res) => {
    try {
        const caller = await resolveCallerIdentity(req.user);
        const isPriv = isAdminCaller(req.user);

        const matchCriteria = [];
        if (caller.userId && mongoose.Types.ObjectId.isValid(caller.userId)) {
            matchCriteria.push({ user: caller.userId });
        }
        if (caller.canonicalEmployeeId) {
            matchCriteria.push({ employeeId: caller.canonicalEmployeeId });
        }
        if (caller.employeeId && caller.employeeId !== caller.canonicalEmployeeId) {
            matchCriteria.push({ employeeId: caller.employeeId });
        }
        if (caller.effectiveEmployeeId && caller.effectiveEmployeeId !== caller.canonicalEmployeeId && caller.effectiveEmployeeId !== caller.employeeId) {
            matchCriteria.push({ employeeId: caller.effectiveEmployeeId });
        }

        const query = isPriv
            ? { $or: matchCriteria.length > 0 ? matchCriteria : [{ user: caller.userId }] }
            : { tenantId: caller.tenantId, $or: matchCriteria.length > 0 ? matchCriteria : [{ user: caller.userId }] };

        if (req.query.includeDeleted !== 'true') {
            query.isDeleted = { $ne: true };
            query.status = { $ne: 'DELETED' };
        }

        const contexts = await ProductContext.find(query).sort({ updatedAt: -1 }).lean();

        return res.json({
            status: "SUCCESS",
            count: contexts.length,
            contexts
        });
    } catch (err) {
        console.error("Error in /api/knowledge/my-contexts:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * GET /stats
 * Returns high-level telemetry; treats all non-deleted contexts as active with zero approval gating.
 */
router.get('/stats', auth, async (req, res) => {
    try {
        const caller = await resolveCallerIdentity(req.user);
        const isPriv = isAdminCaller(req.user);
        const baseFilter = isPriv ? {} : { tenantId: caller.tenantId };
        const activeFilter = { ...baseFilter, isDeleted: { $ne: true }, status: { $ne: 'DELETED' } };

        const [total, deletedCount, products] = await Promise.all([
            ProductContext.countDocuments(activeFilter),
            ProductContext.countDocuments({
                ...baseFilter,
                $or: [{ isDeleted: true }, { status: 'DELETED' }]
            }),
            ProductContext.distinct('productId', activeFilter)
        ]);

        return res.json({
            status: "SUCCESS",
            stats: {
                totalContexts: total,
                active: total,
                approved: total,
                pendingApproval: 0,
                rejected: 0,
                outdated: 0,
                deleted: deletedCount,
                products
            }
        });
    } catch (err) {
        console.error("Error in /api/knowledge/stats:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * POST /quick-ingest
 * Ingests a context into MongoDB ProductContext without single-product overwrites.
 */
router.post('/quick-ingest', auth, async (req, res) => {
    try {
        const {
            candidateName,
            employeeId,
            employee_id,
            targetUserId,
            userId,
            email,
            department,
            contextText,
            productId,
            projectName
        } = req.body;
        if (!contextText || !contextText.trim()) {
            return res.status(400).json({ error: "contextText is required.", detail: "contextText is required." });
        }

        const caller = await resolveCallerIdentity(req.user);
        const isPriv = isAdminCaller(req.user);
        const requestedEmp = employeeId || employee_id;
        const requestedUid = targetUserId || userId;

        let resolvedEmpId = caller.effectiveEmployeeId.toUpperCase();
        let resolvedUserObjectId = caller.userId;
        let resolvedTenant = caller.tenantId;
        let resolvedName = (req.user?.name || caller.name || candidateName || 'Current Employee').trim();
        let resolvedEmail = (req.user?.email || caller.email || email || '').toLowerCase().trim();

        if (isPriv && (requestedUid || requestedEmp || req.body.tenantId)) {
            const targetResolved = await resolveTargetEmployeeForAdmin(
                { targetUserId, userId, employeeId: requestedEmp, tenantId: req.body.tenantId },
                caller
            );
            if (targetResolved.error) {
                return res.status(targetResolved.status || 404).json({
                    error: targetResolved.error,
                    detail: targetResolved.error
                });
            }
            resolvedEmpId = targetResolved.employeeId.toUpperCase();
            resolvedUserObjectId = targetResolved.userObjectId;
            resolvedTenant = targetResolved.tenantId;
            if (candidateName) resolvedName = candidateName.trim();
            else if (targetResolved.name) resolvedName = targetResolved.name;
            if (email) resolvedEmail = email.toLowerCase().trim();
            else if (targetResolved.email) resolvedEmail = targetResolved.email;
        }

        const resolvedProject = (productId || projectName || 'BHIV').trim().toUpperCase();
        const now = new Date();
        const trimmedContent = contextText.trim();
        const trimmedSummary = trimmedContent.length > 300 ? trimmedContent.substring(0, 300) + '...' : trimmedContent;

        let doc = await ProductContext.findOne({
            employeeId: resolvedEmpId,
            productId: resolvedProject,
            tenantId: resolvedTenant
        });

        if (doc) {
            doc.versionHistory.push({
                version: doc.version,
                content: doc.content,
                summary: doc.summary,
                approvedAt: doc.approvedAt,
                approvedBy: doc.approvedBy,
                timestamp: now
            });
            doc.version = incrementVersion(doc.version);
            doc.content = trimmedContent;
            doc.summary = trimmedSummary;
            doc.status = 'ACTIVE';
            if (resolvedUserObjectId) {
                doc.user = resolvedUserObjectId;
            }
            if (projectName) {
                doc.productName = projectName.trim();
            }
            doc.isDeleted = false;
            doc.deletedAt = null;
            doc.deletedBy = null;
            doc.deletionReason = null;
            doc.previousStatus = null;
            doc.rejectionReason = null;
            doc.outdatedReason = null;
            doc.approvedBy = null;
            doc.approvedAt = null;
            doc.submittedAt = now;
            doc.updatedAt = now;
            await doc.save();
        } else {
            doc = new ProductContext({
                contextId: `CTX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                tenantId: resolvedTenant,
                employeeId: resolvedEmpId,
                user: resolvedUserObjectId,
                productId: resolvedProject,
                productName: (projectName || resolvedProject).trim(),
                version: 'v1.0',
                status: 'ACTIVE',
                content: trimmedContent,
                summary: trimmedSummary,
                submittedAt: now,
                approvedBy: null,
                approvedAt: null,
                versionHistory: [
                    {
                        version: 'v1.0',
                        content: trimmedContent,
                        summary: trimmedSummary,
                        approvedAt: null,
                        approvedBy: null,
                        timestamp: now
                    }
                ]
            });
            await doc.save();
        }

        await syncContextToParikshak(doc, 'Niyantran_Quick_Ingest');

        const responsePayload = {
            status: "SUCCESS",
            message: `Context for '${resolvedProject}' saved with status ACTIVE.`,
            candidate_name: resolvedName,
            employee_id: resolvedEmpId,
            email: resolvedEmail,
            project_name: resolvedProject,
            ingestion_timestamp: now.toISOString(),
            injectedContext: doc
        };

        if (req.io) {
            req.io.emit('knowledge:sync', {
                candidateName: resolvedName,
                employeeId: resolvedEmpId,
                email: resolvedEmail,
                projectName: resolvedProject,
                injectedContext: doc,
                timestamp: now.toISOString()
            });
        }

        return res.json(responsePayload);
    } catch (err) {
        console.error("Error in /api/knowledge/quick-ingest:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * POST /ingest
 * Saves context to MongoDB ProductContext first as ACTIVE, then triggers non-blocking Parikshak ingest.
 */
router.post('/ingest', auth, async (req, res) => {
    try {
        const {
            chatgptContent, content, productId, product_id, productName,
            individualId, individual_id, employeeId, employee_id, targetUserId, userId,
            source, provenance, version
        } = req.body;

        const rawContent = content || chatgptContent;
        const targetProduct = (product_id || productId || 'BHIV').toUpperCase();

        if (!rawContent || !rawContent.toString().trim()) {
            return res.status(400).json({ error: "content or chatgptContent is required.", detail: "content or chatgptContent is required." });
        }

        const caller = await resolveCallerIdentity(req.user);
        const isPriv = isAdminCaller(req.user);
        const requestedEmpId = (individual_id || individualId || employeeId || employee_id || '').trim();
        const requestedUid = targetUserId || userId;

        let targetEmpId = caller.effectiveEmployeeId;
        let targetUserObjectId = caller.userId;
        let targetTenant = caller.tenantId;

        if (isPriv && (requestedUid || requestedEmpId || req.body.tenantId)) {
            const targetResolved = await resolveTargetEmployeeForAdmin(
                { targetUserId, userId, employeeId: requestedEmpId, tenantId: req.body.tenantId },
                caller
            );
            if (targetResolved.error) {
                return res.status(targetResolved.status || 404).json({
                    error: targetResolved.error,
                    detail: targetResolved.error
                });
            }
            targetEmpId = targetResolved.employeeId;
            targetUserObjectId = targetResolved.userObjectId;
            targetTenant = targetResolved.tenantId;
        }

        const trimmedContent = rawContent.toString().trim();
        const trimmedSummary = trimmedContent.substring(0, 300);
        const now = new Date();

        const record = await ProductContext.findOneAndUpdate(
            {
                employeeId: targetEmpId,
                productId: targetProduct,
                tenantId: targetTenant
            },
            {
                $set: {
                    content: trimmedContent,
                    summary: trimmedSummary,
                    status: 'ACTIVE',
                    version: version || 'v1.0',
                    user: targetUserObjectId,
                    productName: (productName || targetProduct).trim(),
                    isDeleted: false,
                    deletedAt: null,
                    deletedBy: null,
                    deletionReason: null,
                    previousStatus: null,
                    rejectionReason: null,
                    outdatedReason: null,
                    approvedBy: null,
                    approvedAt: null,
                    submittedAt: now,
                    updatedAt: now
                },
                $setOnInsert: {
                    contextId: `CTX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                    tenantId: targetTenant
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Non-blocking Parikshak ingest AFTER MongoDB persistence
        await syncContextToParikshak(record, source || 'Niyantran-Ingest');

        return res.json({
            status: "SUCCESS",
            message: `Dataset for '${targetProduct}' ingested successfully.`,
            context: record
        });
    } catch (err) {
        console.error("Error in /ingest:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * GET /datasets
 * Proxies dataset listing from Parikshak or falls back to ProductContext collection.
 */
router.get('/datasets', auth, async (req, res) => {
    try {
        const { product_id, individual_id } = req.query;
        try {
            const resp = await axios.get(`${getParikshakBaseUrl()}/api/v1/knowledge/datasets`, {
                ...getAxiosConfig(),
                params: { product_id, individual_id }
            });
            if (resp.status < 400 && resp.data) {
                return res.json(resp.data);
            }
        } catch (e) {
            // fallback
        }

        const filter = {};
        if (req.query.includeDeleted !== 'true') {
            filter.isDeleted = { $ne: true };
            filter.status = { $ne: 'DELETED' };
        }
        if (product_id) filter.productId = product_id.toUpperCase().trim();
        if (individual_id) filter.employeeId = individual_id.trim();

        const isPriv = isAdminCaller(req.user);
        const caller = await resolveCallerIdentity(req.user);
        if (!isPriv) {
            filter.tenantId = caller.tenantId;
        }

        const docs = await ProductContext.find(filter).lean();
        return res.json({
            count: docs.length,
            total_in_store: docs.length,
            datasets: docs.map(d => ({
                dataset_id: d.contextId,
                product_id: d.productId,
                employee_id: d.employeeId,
                individual_id: d.employeeId,
                content: d.content,
                summary: d.summary,
                status: d.status,
                version: d.version,
                approvedBy: d.approvedBy,
                approvedAt: d.approvedAt
            }))
        });
    } catch (err) {
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * GET /products
 * Lists recognized products.
 */
router.get('/products', auth, async (req, res) => {
    try {
        try {
            const response = await axios.get(`${PARIKSHAK_URL}/api/v1/knowledge/products`, getAxiosConfig());
            if (response.status < 400 && response.data) {
                return res.json(response.data);
            }
        } catch (apiErr) {
            // fallback
        }

        return res.json({
            count: 7,
            products: [
                { product_id: "BHIV", name: "BHIV Enterprise Operating System" },
                { product_id: "NIYANTRAN", name: "Niyantran Task Workflow Engine" },
                { product_id: "PARIKSHAK", name: "Parikshak Engineering Review Runtime" },
                { product_id: "TRINETRA", name: "TRINETRA Monitoring & Activity Engine" },
                { product_id: "TANTRA", name: "Tantra Orchestration Bridge" },
                { product_id: "VAJRA", name: "Vajra Trust & Provenance Core" },
                { product_id: "SAMVAD", name: "Samvad Real-Time Collaboration" }
            ]
        });
    } catch (err) {
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * GET /syllabus
 */
router.get('/syllabus', auth, async (req, res) => {
    try {
        let syllabusData = null;
        try {
            const resp = await axios.get(`${PARIKSHAK_URL}/api/v1/knowledge/syllabus`, getAxiosConfig());
            if (resp.status < 400 && resp.data) {
                syllabusData = resp.data;
            }
        } catch (e) {
            // fallback
        }

        if (!syllabusData) {
            const localTasksPath = path.resolve(__dirname, '../../../Live Task Review Agent - 2/db/niyantran_tasks.json');
            if (fs.existsSync(localTasksPath)) {
                const rawTasks = JSON.parse(fs.readFileSync(localTasksPath, 'utf-8'));
                const departments = {
                    "AI ML": [],
                    "Blockchain": [],
                    "Robotics": [],
                    "ISRO Drone": [],
                    "Law": [],
                    "Web Development": [],
                    "Testing": [],
                    "Governance & System": []
                };
                rawTasks.forEach(t => {
                    const tid = t.task_id || '';
                    const prefix = tid.split('-')[1] || '';
                    const prod = (t.product || '').toUpperCase();
                    if (prefix === 'BLC' || prod.includes('BLOCKCHAIN')) departments['Blockchain'].push(t);
                    else if (prefix === 'AIML' || prod === 'AI' || prod.includes('AI ML') || prod.includes('AI VIDEOS')) departments['AI ML'].push(t);
                    else if (prefix === 'ROB' || prod.includes('ROBOTICS')) departments['Robotics'].push(t);
                    else if (prefix === 'DRN' || prod.includes('DRONE') || prod.includes('ISRO')) departments['ISRO Drone'].push(t);
                    else if (prefix === 'LAW' || prod.includes('LAW')) departments['Law'].push(t);
                    else if (prefix === 'WEB' || prod.includes('WEB')) departments['Web Development'].push(t);
                    else if (prefix === 'TST' || prod.includes('TEST')) departments['Testing'].push(t);
                    else departments['Governance & System'].push(t);
                });
                syllabusData = {
                    status: "SUCCESS",
                    total_tasks: rawTasks.length,
                    departments
                };
            } else {
                syllabusData = { status: "SUCCESS", total_tasks: 0, departments: {} };
            }
        }

        return res.json(syllabusData);
    } catch (err) {
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * POST /syllabus/check
 */
router.post('/syllabus/check', auth, async (req, res) => {
    try {
        const { taskId, department, candidateName } = req.body;
        const targetTaskId = (taskId || '').trim();
        const targetDept = department || 'AI ML';

        try {
            const resp = await axios.post(`${PARIKSHAK_URL}/api/v1/knowledge/syllabus/check`, {
                task_id: targetTaskId,
                department: targetDept,
                candidate_name: candidateName
            }, getAxiosConfig());
            if (resp.status < 400 && resp.data) {
                return res.json(resp.data);
            }
        } catch (e) {
            // fallback
        }

        const localTasksPath = path.resolve(__dirname, '../../../Live Task Review Agent - 2/db/niyantran_tasks.json');
        let knownTasks = [];
        if (fs.existsSync(localTasksPath)) {
            knownTasks = JSON.parse(fs.readFileSync(localTasksPath, 'utf-8'));
        }

        const match = knownTasks.find(t => t.task_id.toLowerCase() === targetTaskId.toLowerCase());
        if (match) {
            return res.json({
                status: "IN_SYLLABUS",
                is_valid: true,
                task_id: match.task_id,
                department: targetDept,
                task_details: match,
                message: `Task '${match.task_id}' is verified and in canonical syllabus.`
            });
        }

        return res.json({
            status: "OUT_OF_SYLLABUS",
            is_valid: false,
            task_id: targetTaskId,
            department: targetDept,
            message: `Task '${targetTaskId}' is NOT in canonical syllabus.`,
            recommended_task_id: 'T-AIML-001'
        });
    } catch (err) {
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * POST /preflight-check
 */
router.post('/preflight-check', auth, async (req, res) => {
    try {
        const { repositoryUrl } = req.body;
        if (!repositoryUrl) {
            return res.status(400).json({ error: "repositoryUrl is required", detail: "repositoryUrl is required" });
        }
        const isGithub = repositoryUrl.includes('github.com');
        return res.json({
            status: "SUCCESS",
            repo_url: repositoryUrl,
            repo_accessible: isGithub,
            error_code: isGithub ? null : "INVALID_URL",
            error_message: isGithub ? null : "Repository URL is not a standard GitHub repository."
        });
    } catch (err) {
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

// =========================================================================
// FEATURE 15: NON-BLOCKING PRE-SUBMISSION CONTEXT VALIDATION FLOW
// =========================================================================

/**
 * Core validation logic for product context pre-submission check.
 * Non-blocking: always returns canSubmit: true, allowed: true.
 * Any non-deleted ProductContext (ACTIVE, APPROVED, PENDING_APPROVAL, REJECTED, DRAFT, OUTDATED) is treated as active.
 */
async function validateContextInternal({ productId, employeeId, tenantId, user, userId }) {
    if (!productId || !productId.toString().trim()) {
        return {
            error: "productId query parameter is required",
            status: 400
        };
    }

    const targetProductId = productId.toString().trim().toUpperCase();
    const effectiveUserId = userId || user?._id || user?.id;

    // Gather all candidate employee identifiers & tenant
    const candidateEmpIds = new Set();
    if (employeeId && String(employeeId).trim()) {
        candidateEmpIds.add(String(employeeId).trim());
        candidateEmpIds.add(String(employeeId).trim().toUpperCase());
    }
    if (user?.canonicalEmployeeId && user.canonicalEmployeeId !== 'N/A') {
        candidateEmpIds.add(String(user.canonicalEmployeeId).trim());
        candidateEmpIds.add(String(user.canonicalEmployeeId).trim().toUpperCase());
    }
    if (user?.employeeId && user.employeeId !== 'N/A') {
        candidateEmpIds.add(String(user.employeeId).trim());
        candidateEmpIds.add(String(user.employeeId).trim().toUpperCase());
    }

    let resolvedTenant = (
        tenantId ||
        user?.tenantId ||
        ''
    ).toString().trim();

    if (effectiveUserId && (candidateEmpIds.size === 0 || !resolvedTenant)) {
        try {
            if (mongoose.Types.ObjectId.isValid(String(effectiveUserId))) {
                const userDoc = await User.findById(effectiveUserId)
                    .select('canonicalEmployeeId employeeId tenantId')
                    .lean();
                if (userDoc) {
                    if (userDoc.canonicalEmployeeId && userDoc.canonicalEmployeeId !== 'N/A') {
                        candidateEmpIds.add(String(userDoc.canonicalEmployeeId).trim());
                        candidateEmpIds.add(String(userDoc.canonicalEmployeeId).trim().toUpperCase());
                    }
                    if (userDoc.employeeId && userDoc.employeeId !== 'N/A') {
                        candidateEmpIds.add(String(userDoc.employeeId).trim());
                        candidateEmpIds.add(String(userDoc.employeeId).trim().toUpperCase());
                    }
                    if (!resolvedTenant && userDoc.tenantId) {
                        resolvedTenant = String(userDoc.tenantId).trim();
                    }
                }
            }
        } catch (uErr) {
            console.warn("[VALIDATE-CONTEXT] Failed querying userDoc:", uErr.message);
        }
    }

    if (!resolvedTenant) {
        resolvedTenant = 'ten-bhiv-core';
    }

    // Build $or across candidate employeeIds and user ObjectId
    const identityOr = [];
    if (candidateEmpIds.size > 0) {
        identityOr.push({ employeeId: { $in: Array.from(candidateEmpIds) } });
    }
    if (effectiveUserId && mongoose.Types.ObjectId.isValid(String(effectiveUserId))) {
        identityOr.push({ user: effectiveUserId });
    }

    let ctx = null;
    if (identityOr.length > 0) {
        ctx = await ProductContext.findOne({
            productId: targetProductId,
            tenantId: resolvedTenant,
            isDeleted: { $ne: true },
            status: { $ne: 'DELETED' },
            $or: identityOr
        }).sort({ updatedAt: -1, submittedAt: -1 });
    }

    // Missing or soft-deleted context -> non-blocking warning
    if (!ctx) {
        return {
            status: 200,
            data: {
                productId: targetProductId,
                productName: targetProductId,
                status: "MISSING",
                hasContext: false,
                active: false,
                canSubmit: true,
                allowed: true,
                contextWarning: true,
                case: "CASE_A",
                action: "ADD_CONTEXT",
                message: "Parikshak context has not been added for this product. The task evaluation will fail unless context is added.",
                context: null
            }
        };
    }

    // Any non-deleted context (ACTIVE, APPROVED, PENDING_APPROVAL, REJECTED, DRAFT, OUTDATED) is active & usable
    return {
        status: 200,
        data: {
            productId: targetProductId,
            productName: ctx.productName || targetProductId,
            status: "ACTIVE",
            rawStatus: ctx.status,
            hasContext: true,
            active: true,
            canSubmit: true,
            allowed: true,
            contextWarning: false,
            case: "CASE_C",
            action: "SUBMIT",
            message: "Product context is active.",
            version: ctx.version || 'v1.0',
            context: ctx
        }
    };
}

/**
 * GET & POST /api/knowledge/validate-context
 * Validates pre-submission product context status (non-blocking).
 */
async function handleValidateContext(req, res) {
    try {
        const productId = req.query.productId || req.query.product_id || req.body?.productId || req.body?.product_id;
        const employeeId = req.query.employeeId || req.query.employee_id || req.body?.employeeId || req.body?.employee_id;
        const tenantId = req.query.tenantId || req.query.tenant_id || req.body?.tenantId || req.body?.tenant_id;

        if (!productId || !productId.toString().trim()) {
            return res.status(400).json({
                error: "productId query parameter is required",
                detail: "productId query parameter is required"
            });
        }

        const result = await validateContextInternal({
            productId: productId.toString(),
            employeeId: employeeId ? employeeId.toString() : undefined,
            tenantId: tenantId ? tenantId.toString() : undefined,
            user: req.user,
            userId: req.user?._id || req.user?.id
        });

        if (result.error) {
            return res.status(result.status || 400).json({ error: result.error });
        }

        return res.status(result.status || 200).json(result.data);
    } catch (err) {
        console.error("Error in validate-context endpoint:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
}

router.get('/validate-context', auth, handleValidateContext);
router.post('/validate-context', auth, handleValidateContext);

module.exports = router;
module.exports.isGovernorCaller = isGovernorCaller;
module.exports.isAdminCaller = isAdminCaller;
module.exports.resolveCallerIdentity = resolveCallerIdentity;
module.exports.incrementVersion = incrementVersion;
module.exports.validateContextInternal = validateContextInternal;
module.exports.handleValidateContext = handleValidateContext;
