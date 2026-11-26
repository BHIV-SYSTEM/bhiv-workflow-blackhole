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

const auth = require('../middleware/auth');
const ProductContext = require('../models/ProductContext');
const User = require('../models/User');
const Department = require('../models/Department');

const PARIKSHAK_URL = (process.env.PARIKSHAK_URL || 'https://parikshak.blackholeinfiverse.com').replace(/\/$/, '');
const PARIKSHAK_TOKEN = process.env.PARIKSHAK_TOKEN || '';

const getAxiosConfig = () => {
    const config = {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
        validateStatus: (status) => status < 600
    };
    if (PARIKSHAK_TOKEN) {
        config.headers['Authorization'] = `Bearer ${PARIKSHAK_TOKEN}`;
    }
    return config;
};

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
            limit = 10
        } = req.query;

        const filter = {};
        if (req.query.includeDeleted !== 'true') {
            filter.isDeleted = { $ne: true };
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
            filter.status = status.trim().toUpperCase();
        }

        // Multi-tenant boundary check
        const isGov = isGovernorCaller(req.user);
        const callerTenant = req.user?.tenantId || 'ten-bhiv-core';

        if (tenantId || tenant_id) {
            const requestedTenant = (tenantId || tenant_id).trim();
            if (!isGov && requestedTenant !== callerTenant) {
                return res.status(403).json({
                    error: "Cross-tenant context query forbidden",
                    detail: "Cross-tenant context query forbidden"
                });
            }
            filter.tenantId = requestedTenant;
        } else if (!isGov) {
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

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 10);
        const skip = (pageNum - 1) * limitNum;

        const [items, total] = await Promise.all([
            ProductContext.find(filter)
                .sort({ updatedAt: -1, submittedAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate('user', 'name email role department employeeId canonicalEmployeeId')
                .lean(),
            ProductContext.countDocuments(filter)
        ]);

        return res.json({
            items,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1
        });
    } catch (err) {
        console.error("Error in GET /contexts:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * GET /contexts/pending-approval
 * Returns contexts awaiting Governor approval. Excludes deleted contexts.
 */
router.get('/contexts/pending-approval', auth, async (req, res) => {
    try {
        const callerTenant = req.user?.tenantId || 'ten-bhiv-core';
        const isGov = isGovernorCaller(req.user);
        const filter = {
            status: 'PENDING_APPROVAL',
            isDeleted: { $ne: true }
        };
        if (!isGov) {
            filter.tenantId = callerTenant;
        }

        const items = await ProductContext.find(filter)
            .sort({ updatedAt: -1, submittedAt: -1 })
            .populate('user', 'name email role department employeeId canonicalEmployeeId')
            .lean();

        return res.json({
            status: "SUCCESS",
            count: items.length,
            items
        });
    } catch (err) {
        console.error("Error in GET /contexts/pending-approval:", err);
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
        const isGov = isGovernorCaller(req.user);
        if (!isGov && ctx.tenantId !== (req.user?.tenantId || 'ten-bhiv-core')) {
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
 * Creates a new product context or updates an existing one (resets to PENDING_APPROVAL).
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
            tenantId
        } = req.body;

        const effectiveProductId = (productId || product_id || '').trim().toUpperCase();
        if (!effectiveProductId || !content || !content.trim()) {
            return res.status(400).json({
                error: "productId and content required",
                detail: "productId and content required"
            });
        }

        const callerCanonicalEmp = req.user?.canonicalEmployeeId || req.user?.employeeId || 'EMP-BHIV-USR';
        const isGov = isGovernorCaller(req.user);
        const targetEmployeeId = (isGov && employeeId) ? employeeId.trim() : callerCanonicalEmp;
        const targetTenantId = (isGov && tenantId) ? tenantId.trim() : (req.user?.tenantId || 'ten-bhiv-core');
        const effectiveProductName = (productName || effectiveProductId).trim();
        const effectiveSummary = (summary || (content.length > 300 ? content.substring(0, 300) + '...' : content)).trim();

        // 1. Prevent duplicate identical submission if already approved
        const existingApproved = await ProductContext.findOne({
            employeeId: targetEmployeeId,
            productId: effectiveProductId,
            tenantId: targetTenantId,
            status: 'APPROVED',
            isDeleted: { $ne: true },
            content: content.trim()
        });

        if (existingApproved) {
            return res.status(409).json({
                error: "Identical approved context already exists for this product",
                detail: "Identical approved context already exists for this product"
            });
        }

        // 2. Check if a context record already exists for this (employeeId, productId, tenantId)
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
            existingDoc.status = 'PENDING_APPROVAL'; // Reset to pending approval per requirement
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

            if (req.io) {
                req.io.emit('knowledge:context:updated', {
                    contextId: existingDoc.contextId,
                    employeeId: targetEmployeeId,
                    productId: effectiveProductId,
                    version: newVersion,
                    status: 'PENDING_APPROVAL'
                });
            }

            return res.status(200).json(existingDoc);
        } else {
            // Create brand new product context
            const newDoc = new ProductContext({
                contextId: `CTX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                tenantId: targetTenantId,
                employeeId: targetEmployeeId,
                user: req.user?._id || req.user?.id,
                productId: effectiveProductId,
                productName: effectiveProductName,
                version: 'v1.0',
                status: 'PENDING_APPROVAL',
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

            if (req.io) {
                req.io.emit('knowledge:context:created', {
                    contextId: newDoc.contextId,
                    employeeId: targetEmployeeId,
                    productId: effectiveProductId,
                    version: 'v1.0',
                    status: 'PENDING_APPROVAL'
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
 * Updates an existing context by contextId or _id, advancing version and resetting status to PENDING_APPROVAL.
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

        const isGov = isGovernorCaller(req.user);
        if (!isGov && ctx.tenantId !== (req.user?.tenantId || 'ten-bhiv-core')) {
            return res.status(403).json({ error: "Cross-tenant modification forbidden", detail: "Cross-tenant modification forbidden" });
        }
        const callerCanonicalEmp = (req.user?.canonicalEmployeeId || req.user?.employeeId || '').toUpperCase().trim();
        const callerPlainEmp = (req.user?.employeeId || '').toUpperCase().trim();
        const ctxEmp = (ctx.employeeId || '').toUpperCase().trim();
        const isOwner = (ctxEmp === callerCanonicalEmp) || (callerPlainEmp && ctxEmp === callerPlainEmp);
        if (!isGov && !isOwner) {
            return res.status(403).json({ error: "Unauthorized to modify this context", detail: "Unauthorized to modify this context" });
        }

        const newContent = content !== undefined ? content.trim() : ctx.content;
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
        ctx.status = 'PENDING_APPROVAL';
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

        if (req.io) {
            req.io.emit('knowledge:context:updated', {
                contextId: ctx.contextId,
                productId: ctx.productId,
                version: newVersion,
                status: 'PENDING_APPROVAL'
            });
        }

        return res.json(ctx);
    } catch (err) {
        console.error("Error in PUT /contexts/:id:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
});

/**
 * Context Approval Handler
 * Restricted to Governor or Admin.
 */
async function handleContextApproval(req, res) {
    try {
        const contextIdentifier = req.params.id || req.params.contextId;
        if (!isGovernorCaller(req.user)) {
            return res.status(403).json({
                error: "Governor role required for context approval",
                detail: "Governor role required for context approval"
            });
        }

        let ctx = await ProductContext.findOne({ contextId: contextIdentifier });
        if (!ctx && contextIdentifier.match(/^[0-9a-fA-F]{24}$/)) {
            ctx = await ProductContext.findById(contextIdentifier);
        }

        if (!ctx) {
            return res.status(404).json({ error: "Context not found", detail: "Context not found" });
        }

        if (ctx.isDeleted || ctx.status === 'DELETED') {
            return res.status(409).json({
                error: "Cannot approve a deleted or withdrawn context",
                detail: "Cannot approve a deleted or withdrawn context"
            });
        }

        const approverName = req.user?.name || 'Akash';
        const now = new Date();

        ctx.status = 'APPROVED';
        ctx.approvedBy = approverName;
        ctx.approvedAt = now;
        ctx.rejectionReason = null;
        ctx.outdatedReason = null;
        ctx.updatedAt = now;

        // Ensure current version in versionHistory reflects approval
        const currentHistIdx = ctx.versionHistory.findIndex(h => h.version === ctx.version);
        if (currentHistIdx >= 0) {
            ctx.versionHistory[currentHistIdx].approvedAt = now;
            ctx.versionHistory[currentHistIdx].approvedBy = approverName;
        } else {
            ctx.versionHistory.push({
                version: ctx.version,
                content: ctx.content,
                summary: ctx.summary,
                approvedAt: now,
                approvedBy: approverName,
                timestamp: now
            });
        }

        await ctx.save();

        // Forward to Parikshak / RAG Registry if available
        try {
            const parikshakPayload = {
                product_id: ctx.productId,
                employee_id: ctx.employeeId,
                version: ctx.version,
                content: ctx.content,
                status: 'APPROVED',
                approved_by: approverName,
                dataset_type: 'individual_context',
                source: 'Niyantran_Governor_Approval'
            };
            await axios.post(`${PARIKSHAK_URL}/api/v1/knowledge/ingest`, parikshakPayload, getAxiosConfig());
        } catch (apiErr) {
            console.warn("[GOVERNOR_APPROVAL] Parikshak notification notice:", apiErr.message);
        }

        if (req.io) {
            req.io.emit('knowledge:context:approved', {
                contextId: ctx.contextId,
                productId: ctx.productId,
                employeeId: ctx.employeeId,
                approvedBy: approverName,
                approvedAt: now
            });
            req.io.emit('knowledge:sync', {
                candidateName: ctx.employeeId,
                employeeId: ctx.employeeId,
                product_id: ctx.productId,
                status: 'APPROVED',
                timestamp: now.toISOString()
            });
        }

        return res.json({
            status: "SUCCESS",
            message: `Product context for ${ctx.productId} approved by Governor ${approverName}.`,
            context: ctx
        });
    } catch (err) {
        console.error("Error in approve context:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
}

/**
 * Context Rejection Handler
 * Restricted to Governor or Admin.
 */
async function handleContextRejection(req, res) {
    try {
        const contextIdentifier = req.params.id || req.params.contextId;
        if (!isGovernorCaller(req.user)) {
            return res.status(403).json({
                error: "Governor role required for context rejection",
                detail: "Governor role required for context rejection"
            });
        }

        let ctx = await ProductContext.findOne({ contextId: contextIdentifier });
        if (!ctx && contextIdentifier.match(/^[0-9a-fA-F]{24}$/)) {
            ctx = await ProductContext.findById(contextIdentifier);
        }

        if (!ctx) {
            return res.status(404).json({ error: "Context not found", detail: "Context not found" });
        }

        if (ctx.isDeleted || ctx.status === 'DELETED') {
            return res.status(409).json({
                error: "Cannot reject a deleted or withdrawn context",
                detail: "Cannot reject a deleted or withdrawn context"
            });
        }

        const rejectionReason = (req.body.rejectionReason || req.body.reason || 'Rejected by Governor review').trim();
        const now = new Date();

        ctx.status = 'REJECTED';
        ctx.rejectionReason = rejectionReason;
        ctx.approvedBy = null;
        ctx.approvedAt = null;
        ctx.updatedAt = now;

        await ctx.save();

        if (req.io) {
            req.io.emit('knowledge:context:rejected', {
                contextId: ctx.contextId,
                productId: ctx.productId,
                employeeId: ctx.employeeId,
                rejectionReason
            });
        }

        return res.json({
            status: "REJECTED",
            message: `Context for ${ctx.productId} rejected.`,
            context: ctx
        });
    } catch (err) {
        console.error("Error in reject context:", err);
        return res.status(500).json({ error: err.message, detail: err.message });
    }
}

// Approval endpoints (supporting both canonical and alias paths)
router.post('/contexts/:id/approve', auth, handleContextApproval);
router.post('/approvals/:contextId/approve', auth, handleContextApproval);

// Rejection endpoints (supporting both canonical and alias paths)
router.post('/contexts/:id/reject', auth, handleContextRejection);
router.post('/approvals/:contextId/reject', auth, handleContextRejection);

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

        const isGov = isGovernorCaller(req.user);
        const callerTenant = req.user?.tenantId || 'ten-bhiv-core';

        if (!isGov && ctx.tenantId !== callerTenant) {
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

        // Ownership resolution
        const callerCanonicalEmp = (req.user?.canonicalEmployeeId || req.user?.employeeId || '').toUpperCase().trim();
        const callerPlainEmp = (req.user?.employeeId || '').toUpperCase().trim();
        const callerUserId = (req.user?._id || req.user?.id || '').toString();
        const ctxEmp = (ctx.employeeId || '').toUpperCase().trim();
        const ctxUserId = (ctx.user?._id || ctx.user || '').toString();

        const isOwner = (callerCanonicalEmp && ctxEmp === callerCanonicalEmp) ||
                        (callerPlainEmp && ctxEmp === callerPlainEmp) ||
                        (callerUserId && ctxUserId === callerUserId);

        // Role authorization check:
        // Approved contexts strictly require Governor approval
        if (ctx.status === 'APPROVED' && !isGov) {
            return res.status(403).json({
                error: "Approved contexts require authorized Governor approval before removal",
                detail: "Approved contexts require authorized Governor approval before removal"
            });
        }

        // Non-approved contexts (Draft, Pending, Rejected, Outdated) require Owner or Governor
        if (!isGov && !isOwner) {
            return res.status(403).json({
                error: "Unauthorized: You can only delete or withdraw your own product context",
                detail: "Unauthorized: You can only delete or withdraw your own product context"
            });
        }

        const previousStatus = ctx.status;
        const now = new Date();
        const deletedByName = req.user?.name || req.user?.canonicalEmployeeId || req.user?.employeeId || 'User';
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

        // Parikshak / RAG registry synchronization
        try {
            const parikshakPayload = {
                product_id: ctx.productId,
                individual_id: ctx.employeeId,
                context_id: ctx.contextId,
                deleted_by: deletedByName,
                deletion_reason: deletionReason
            };
            await axios.post(`${PARIKSHAK_URL}/api/v1/knowledge/withdraw`, parikshakPayload, getAxiosConfig());
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

        const isGov = isGovernorCaller(req.user);
        const callerTenant = req.user?.tenantId || 'ten-bhiv-core';
        if (!isGov && ctx.tenantId !== callerTenant) {
            return res.status(403).json({ error: "Cross-tenant context access forbidden", detail: "Cross-tenant context access forbidden" });
        }
        const callerCanonicalEmp = (req.user?.canonicalEmployeeId || req.user?.employeeId || '').toUpperCase().trim();
        const callerPlainEmp = (req.user?.employeeId || '').toUpperCase().trim();
        const ctxEmp = (ctx.employeeId || '').toUpperCase().trim();
        const isOwner = (ctxEmp === callerCanonicalEmp) || (callerPlainEmp && ctxEmp === callerPlainEmp);
        if (!isGov && !isOwner) {
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
 * Eliminates first-name fuzzy match bug entirely; matches strictly on canonical IDs/emails.
 * Returns multi-product context maps (`contextsByProduct`) and correct counts.
 */
router.get('/compliance', auth, async (req, res) => {
    try {
        let users = [];
        try {
            users = await User.find({ stillExist: 1 }).populate('department').sort({ name: 1 }).lean();
        } catch (popErr) {
            users = await User.find({ stillExist: 1 }).sort({ name: 1 }).lean();
        }
        const allContexts = await ProductContext.find({}).sort({ submittedAt: -1 }).lean();

        // Index contexts by tenantId:canonicalEmployeeId and tenantId:userId for strict multi-tenant isolation
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
            const canonicalId = (u.canonicalEmployeeId || '').toUpperCase().trim();
            const plainEmpId = (u.employeeId || '').toUpperCase().trim();
            const email = (u.email || '').toLowerCase().trim();
            const userIdStr = (u._id || '').toString();
            const uTenant = u.tenantId || 'ten-bhiv-core';

            // Match ONLY by exact canonical ID, employeeId, or user ID within user's tenant (NO cross-tenant mixing, NO first-name fuzzy matching)
            let matchedContexts = [];
            const canLookupKey = canonicalId ? `${uTenant}:${canonicalId}` : null;
            const empLookupKey = plainEmpId ? `${uTenant}:${plainEmpId}` : null;
            const userLookupKey = userIdStr ? `${uTenant}:${userIdStr}` : null;

            if (canLookupKey && contextsByEmpId.has(canLookupKey)) {
                matchedContexts = contextsByEmpId.get(canLookupKey);
            } else if (empLookupKey && contextsByEmpId.has(empLookupKey)) {
                matchedContexts = contextsByEmpId.get(empLookupKey);
            } else if (userLookupKey && contextsByUserId.has(userLookupKey)) {
                matchedContexts = contextsByUserId.get(userLookupKey);
            }

            // Partition by product
            const contextsByProduct = {};
            matchedContexts.forEach(c => {
                const pid = (c.productId || 'BHIV').toUpperCase();
                // Store latest per product
                if (!contextsByProduct[pid] || new Date(c.submittedAt) > new Date(contextsByProduct[pid].submittedAt)) {
                    contextsByProduct[pid] = c;
                }
            });

            // Find primary active context (prefer APPROVED, else latest)
            const approvedContext = matchedContexts.find(c => c.status === 'APPROVED');
            const primaryContext = approvedContext || matchedContexts[0] || null;

            return {
                id: u._id,
                employeeId: u.canonicalEmployeeId || u.employeeId || 'N/A',
                canonicalEmployeeId: u.canonicalEmployeeId || u.employeeId || 'N/A',
                name: u.name,
                email: u.email,
                role: u.role,
                department: u.department ? (typeof u.department === 'object' && u.department.name ? u.department.name : String(u.department)) : 'No Department',
                workMode: u.workMode || 'WFO',
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
                    ingestion_timestamp: primaryContext.submittedAt,
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
        const canonicalEmp = req.user?.canonicalEmployeeId || req.user?.employeeId;
        const plainEmp = req.user?.employeeId;
        const userId = req.user?._id || req.user?.id;

        const callerTenant = req.user?.tenantId || 'ten-bhiv-core';
        const isGov = isGovernorCaller(req.user);
        const matchCriteria = [{ user: userId }];
        if (canonicalEmp) matchCriteria.push({ employeeId: canonicalEmp });
        if (plainEmp && plainEmp !== canonicalEmp) matchCriteria.push({ employeeId: plainEmp });

        const query = isGov
            ? { $or: matchCriteria }
            : { tenantId: callerTenant, $or: matchCriteria };

        if (req.query.includeDeleted !== 'true') {
            query.isDeleted = { $ne: true };
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
 * Returns high-level telemetry and status breakdown.
 */
router.get('/stats', auth, async (req, res) => {
    try {
        const callerTenant = req.user?.tenantId || 'ten-bhiv-core';
        const isGov = isGovernorCaller(req.user);
        const baseFilter = isGov ? {} : { tenantId: callerTenant };
        const activeFilter = { ...baseFilter, isDeleted: { $ne: true } };

        const [total, approved, pending, rejected, outdated, deletedCount, products] = await Promise.all([
            ProductContext.countDocuments(activeFilter),
            ProductContext.countDocuments({ ...activeFilter, status: 'APPROVED' }),
            ProductContext.countDocuments({ ...activeFilter, status: 'PENDING_APPROVAL' }),
            ProductContext.countDocuments({ ...activeFilter, status: 'REJECTED' }),
            ProductContext.countDocuments({ ...activeFilter, status: 'OUTDATED' }),
            ProductContext.countDocuments({ ...baseFilter, isDeleted: true }),
            ProductContext.distinct('productId', activeFilter)
        ]);

        return res.json({
            status: "SUCCESS",
            stats: {
                totalContexts: total,
                approved,
                pendingApproval: pending,
                rejected,
                outdated,
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
        const { candidateName, employeeId, email, department, contextText, productId, projectName } = req.body;
        if (!contextText || !contextText.trim()) {
            return res.status(400).json({ error: "contextText is required.", detail: "contextText is required." });
        }

        const isGov = isGovernorCaller(req.user);
        const callerCanonicalEmp = (req.user?.canonicalEmployeeId || req.user?.employeeId || 'EMP-BHIV-USR').toUpperCase().trim();
        const resolvedEmpId = (isGov && employeeId) ? employeeId.toUpperCase().trim() : callerCanonicalEmp;
        const resolvedName = (isGov && candidateName) ? candidateName.trim() : (req.user?.name || candidateName || 'Current Employee').trim();
        const resolvedEmail = (isGov && email) ? email.toLowerCase().trim() : (req.user?.email || email || '').toLowerCase().trim();
        const resolvedProject = (productId || projectName || 'BHIV').trim().toUpperCase();
        const resolvedTenant = (isGov && req.body.tenantId) ? req.body.tenantId.trim() : (req.user?.tenantId || 'ten-bhiv-core');
        const now = new Date();

        const initialStatus = isGov ? 'APPROVED' : 'PENDING_APPROVAL';
        const approver = isGov ? (req.user?.name || 'Akash') : null;
        const approvalDate = isGov ? now : null;

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
            doc.content = contextText.trim();
            doc.summary = contextText.trim().length > 300 ? contextText.trim().substring(0, 300) + '...' : contextText.trim();
            doc.status = initialStatus;
            doc.approvedBy = approver;
            doc.approvedAt = approvalDate;
            doc.submittedAt = now;
            doc.updatedAt = now;
            await doc.save();
        } else {
            doc = new ProductContext({
                contextId: `CTX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                tenantId: resolvedTenant,
                employeeId: resolvedEmpId,
                user: req.user?._id || req.user?.id,
                productId: resolvedProject,
                productName: projectName || resolvedProject,
                version: 'v1.0',
                status: initialStatus,
                content: contextText.trim(),
                summary: contextText.trim().length > 300 ? contextText.trim().substring(0, 300) + '...' : contextText.trim(),
                submittedAt: now,
                approvedBy: approver,
                approvedAt: approvalDate,
                versionHistory: [
                    {
                        version: 'v1.0',
                        content: contextText.trim(),
                        approvedAt: approvalDate,
                        approvedBy: approver,
                        timestamp: now
                    }
                ]
            });
            await doc.save();
        }

        const responsePayload = {
            status: "SUCCESS",
            message: `Context for '${resolvedProject}' saved with status ${initialStatus}.`,
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
 * Legacy ingest proxying to Parikshak or creating ProductContext doc.
 */
router.post('/ingest', auth, async (req, res) => {
    try {
        const {
            chatgptContent, content, productId, product_id,
            individualId, individual_id, source, provenance, version
        } = req.body;

        const rawContent = content || chatgptContent;
        const targetProduct = (product_id || productId || 'BHIV').toUpperCase();

        const isGov = isGovernorCaller(req.user);
        const callerCanonicalEmp = (req.user?.canonicalEmployeeId || req.user?.employeeId || 'EMP-BHIV-USR').trim();
        const requestedEmpId = (individual_id || individualId || '').trim();
        const targetEmpId = (isGov && requestedEmpId) ? requestedEmpId : callerCanonicalEmp;
        const targetTenant = (isGov && req.body.tenantId) ? req.body.tenantId.trim() : (req.user?.tenantId || 'ten-bhiv-core');

        if (!rawContent || !rawContent.toString().trim()) {
            return res.status(400).json({ error: "content or chatgptContent is required.", detail: "content or chatgptContent is required." });
        }

        // Forward to Parikshak if possible
        try {
            const resp = await axios.post(`${PARIKSHAK_URL}/api/v1/knowledge/ingest`, {
                product_id: targetProduct,
                individual_id: targetEmpId,
                content: rawContent,
                source: source || 'Niyantran-Ingest',
                version: version || 'v1.0'
            }, getAxiosConfig());
            if (resp.status < 400) {
                return res.status(resp.status).json(resp.data);
            }
        } catch (apiErr) {
            // Parikshak offline; save locally
        }

        const status = isGov ? 'APPROVED' : 'PENDING_APPROVAL';

        const record = await ProductContext.findOneAndUpdate(
            {
                employeeId: targetEmpId,
                productId: targetProduct,
                tenantId: targetTenant
            },
            {
                $set: {
                    content: rawContent.toString().trim(),
                    summary: rawContent.toString().substring(0, 300),
                    status,
                    version: version || 'v1.0',
                    approvedBy: isGov ? (req.user?.name || 'Akash') : null,
                    approvedAt: isGov ? new Date() : null,
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    contextId: `CTX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                    user: req.user?._id || req.user?.id,
                    productName: targetProduct,
                    tenantId: targetTenant
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

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
            const resp = await axios.get(`${PARIKSHAK_URL}/api/v1/knowledge/datasets`, {
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
        }
        if (product_id) filter.productId = product_id.toUpperCase().trim();
        if (individual_id) filter.employeeId = individual_id.trim();

        const isGov = isGovernorCaller(req.user);
        const callerTenant = req.user?.tenantId || 'ten-bhiv-core';
        if (!isGov) {
            filter.tenantId = callerTenant;
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
// FEATURE 15: PRE-SUBMISSION CONTEXT VALIDATION FLOW (Cases A, B, C, D)
// =========================================================================

/**
 * Core validation logic for product context pre-submission check.
 */
async function validateContextInternal({ productId, employeeId, tenantId, user, userId }) {
    if (!productId || !productId.toString().trim()) {
        return {
            error: "productId query parameter is required",
            status: 400
        };
    }

    const targetProductId = productId.toString().trim().toUpperCase();

    // Submitter canonical employee ID resolution
    let resolvedEmpId = (
        employeeId ||
        user?.canonicalEmployeeId ||
        user?.employeeId ||
        ''
    ).toString().trim().toUpperCase();

    // Multi-tenant resolution
    let resolvedTenant = (
        tenantId ||
        user?.tenantId ||
        'ten-bhiv-core'
    ).toString().trim();

    // Fallback: If canonical ID or tenant is missing from JWT, resolve from User document
    const effectiveUserId = userId || user?._id || user?.id;
    if ((!resolvedEmpId || !user?.tenantId) && effectiveUserId) {
        try {
            const userDoc = await User.findById(effectiveUserId).select('canonicalEmployeeId employeeId tenantId').lean();
            if (userDoc) {
                if (!resolvedEmpId) {
                    resolvedEmpId = (userDoc.canonicalEmployeeId || userDoc.employeeId || '').toString().trim().toUpperCase();
                }
                if (!user?.tenantId && userDoc.tenantId) {
                    resolvedTenant = userDoc.tenantId.toString().trim();
                }
            }
        } catch (uErr) {
            console.warn("[VALIDATE-CONTEXT] Failed querying userDoc:", uErr.message);
        }
    }

    // Query ProductContext for the exact (employeeId, productId, tenantId)
    let ctx = null;
    if (resolvedEmpId) {
        ctx = await ProductContext.findOne({
            employeeId: resolvedEmpId,
            productId: targetProductId,
            tenantId: resolvedTenant
        });
    }

    // Secondary fallback by user ObjectId within tenant if not found by employeeId string
    if (!ctx && effectiveUserId) {
        ctx = await ProductContext.findOne({
            user: effectiveUserId,
            productId: targetProductId,
            tenantId: resolvedTenant
        });
    }

    // CASE A: No context exists or context is soft-deleted/withdrawn
    if (!ctx || ctx.isDeleted === true || ctx.status === 'DELETED') {
        return {
            status: 200,
            data: {
                status: "MISSING",
                canSubmit: false,
                allowed: false,
                case: "CASE_A",
                action: "ADD_CONTEXT",
                message: "Product context is missing. Please add and obtain approval for the project context before submitting.",
                context: null
            }
        };
    }

    const ctxStatus = (ctx.status || '').toUpperCase();

    // CASE B: Context exists but is awaiting approval or in draft
    if (ctxStatus === "PENDING_APPROVAL" || ctxStatus === "DRAFT") {
        return {
            status: 200,
            data: {
                status: "PENDING_APPROVAL",
                canSubmit: false,
                allowed: false,
                case: "CASE_B",
                action: "AWAIT_APPROVAL",
                message: "Product context is pending approval.",
                context: ctx
            }
        };
    }

    // CASE D: Context is outdated or rejected
    if (ctxStatus === "OUTDATED" || ctxStatus === "REJECTED") {
        const reason = ctxStatus === "REJECTED"
            ? (ctx.rejectionReason || ctx.outdatedReason || "Context rejected by Governor review")
            : (ctx.outdatedReason || ctx.rejectionReason || "Context expired or deprecated");
        return {
            status: 200,
            data: {
                status: ctxStatus,
                canSubmit: false,
                allowed: false,
                case: "CASE_D",
                action: "UPDATE_CONTEXT",
                reason: reason,
                message: `Product context is outdated/rejected: ${reason}`,
                context: ctx
            }
        };
    }

    // CASE C: Approved context exists
    if (ctxStatus === "APPROVED") {
        return {
            status: 200,
            data: {
                status: "APPROVED",
                canSubmit: true,
                allowed: true,
                case: "CASE_C",
                action: "SUBMIT",
                message: "Product context is approved. Approved context validated.",
                version: ctx.version || 'v1.0',
                context: ctx
            }
        };
    }

    // Fallback for any unexpected state
    return {
        status: 200,
        data: {
            status: ctxStatus,
            canSubmit: false,
            allowed: false,
            case: "CASE_UNKNOWN",
            action: "UPDATE_CONTEXT",
            message: `Product context status '${ctxStatus}' does not permit task submission.`,
            context: ctx
        }
    };
}

/**
 * GET & POST /api/knowledge/validate-context
 * Validates pre-submission product context status.
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
            user: req.user
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
module.exports.incrementVersion = incrementVersion;
module.exports.validateContextInternal = validateContextInternal;
module.exports.handleValidateContext = handleValidateContext;
