import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { useSocket } from '@/context/socket-context';
import { 
    User, Users, Sparkles, CheckCircle2, AlertCircle, RefreshCw, 
    Search, BookOpen, Clock, ShieldCheck, 
    FileText, Eye, Check, X, Filter, Database, Layers, 
    Copy, Edit3, Plus, History, AlertTriangle, CheckSquare, XCircle, ArrowUpDown, Trash2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

// Helper to construct product-specific AI prompt for Agentic IDE
const buildContextGenerationPrompt = (productId, productName) => {
    const effectiveId = (productId || '').trim();
    const effectiveName = (productName || '').trim();
    
    let productHeader = '';
    if (effectiveId || effectiveName) {
        productHeader = `\n\nTarget Product Details:\n- Product Name: ${effectiveName || effectiveId}\n- Product ID: ${effectiveId || 'N/A'}\n`;
    }

    return `Analyze my complete project workspace and generate a comprehensive product-specific knowledge context for Parikshak's Knowledge Admin.${productHeader}
Review all relevant source code, documentation, task descriptions, PDFs, previous assignments, completed tasks, ongoing tasks, and pending requirements.

Include:

- Product name, purpose, and objectives.${effectiveName ? ` (Target: ${effectiveName})` : ''}
- Complete product architecture and technology stack.
- All assigned tasks and their acceptance criteria.
- Completed, ongoing, and pending work.
- Implemented features and functionalities.
- APIs, database schemas, and integration details.
- Testing results and implementation evidence.
- Known issues, dependencies, limitations, and remaining work.

Generate a single consolidated, structured, plain-text context compatible with the Knowledge Admin sample format.

Cover the entire product, not just the current task. If multiple products exist, generate a separate context for each product. Do not fabricate information or include credentials, API keys, tokens, or secrets.

The generated context must be ready for management review and subsequent submission to Parikshak's Knowledge Admin.`;
};

// Standardized Sample Knowledge Templates for Multi-Product Grounding
const SAMPLE_TEMPLATES = [
    {
        id: "bhiv-sec10",
        label: "BHIV: Threat Intelligence (Section 10)",
        productId: "BHIV",
        productName: "BHIV Enterprise Operating System",
        text: `BHIV vNEXT 10-Day Integrated Build. Section 10: Threat correlation and incident intelligence.
Mission: Multi-signal correlation, incident timeline reconstruction, severity/confidence analysis, and adaptive security intelligence across MANTRA, TANTRA, YANTRA, and VAJRA.
Deliverables:
1. Multi-signal rule engine correlating suspicious endpoints, failed authentication spikes, and lateral movement traces.
2. Canonical incident timeline with plain-English human-readable explainability.
3. Automated review verification passing testing_evidence/run_all.py test harness with zero false flags.`
    },
    {
        id: "niyantran-core",
        label: "NIYANTRAN: Workflow Engine",
        productId: "NIYANTRAN",
        productName: "Niyantran Task Workflow Engine",
        text: `Niyantran Full-Stack Integration & Governance Hub.
Scope: Real-time WebSocket compliance monitoring, role-aware Knowledge Admin UI, task assignment lifecycle, and department DAG synchronization.
Deliverables:
1. Clean role-aware Knowledge Admin interface with isolated dedicated employee tracks and global admin telemetry.
2. Single-shift atomic task scoping (strictly 180-360 minutes / 240 mins estimated default).
3. Persistent multi-product context injection with instant real-time synchronization.`
    },
    {
        id: "parikshak-rag",
        label: "PARIKSHAK: Review Runtime",
        productId: "PARIKSHAK",
        productName: "Parikshak Engineering Review Runtime",
        text: `Parikshak Autonomous Review Engine & Knowledge RAG Grounding.
Scope: Deterministic submission scoring, automated code inspection, dynamic next-task synthesis, and RS256 token verification.
Deliverables:
1. Product knowledge grounding against canonical syllabus DAGs without false out-of-syllabus penalties.
2. Zero-drift evaluation contracts and Governor approval webhook synchronization.
3. Strict multi-tenant isolation and immutable audit trail generation.`
    },
    {
        id: "trinetra-agent",
        label: "TRINETRA: Activity Agent",
        productId: "TRINETRA",
        productName: "TRINETRA Monitoring & Activity Engine",
        text: `TRINETRA Employee Activity Agent & Telemetry Pipeline.
Scope: Electron desktop activity tracking agent, background daemon resilience, and real-time monitoring sync with Niyantran.
Deliverables:
1. Zero-data-loss session persistence in activityTracker.js across network retry scenarios.
2. Real-time active time tracking, keystroke/mouse activity weighting, and intelligent screenshot capture engine.
3. Clean day-end reporting workflow and unified attendance telemetry synchronization.`
    },
    {
        id: "tantra-bridge",
        label: "TANTRA: Orchestration Bridge",
        productId: "TANTRA",
        productName: "Tantra Orchestration Bridge",
        text: `TANTRA Orchestration Bridge & Execution Coordination.
Scope: Cross-system workflow dispatch, deterministic consensus validation, and peer-to-peer event routing across distributed nodes.
Deliverables:
1. Fail-closed tenant isolation enforcing boundaries across all execution commands.
2. High-throughput event pipeline with guaranteed idempotency and state reconciliation.`
    },
    {
        id: "vajra-trust",
        label: "VAJRA: Trust & Provenance",
        productId: "VAJRA",
        productName: "Vajra Trust & Provenance Core",
        text: `VAJRA Trust, Provenance & AI Bridge.
Scope: Blockchain transaction replay, cryptographic provenance ledger, authority lifecycle, and recovery trust package.
Deliverables:
1. Canonical transaction signing and replay protection with RS256 token verification.
2. User-facing identity, consent, access revocation, and proof of state consistency.
3. Bridge contracts between VAJRA trust anchor and AI/ML evaluation pipelines.`
    }
];

const STANDARD_PRODUCTS = [
    { id: "BHIV", name: "BHIV Enterprise Operating System" },
    { id: "NIYANTRAN", name: "Niyantran Task Workflow Engine" },
    { id: "PARIKSHAK", name: "Parikshak Engineering Review Runtime" },
    { id: "TRINETRA", name: "TRINETRA Monitoring & Activity Engine" },
    { id: "TANTRA", name: "Tantra Orchestration Bridge" },
    { id: "VAJRA", name: "Vajra Trust & Provenance Core" },
    { id: "SAMVAD", name: "Samvad Real-Time Collaboration" },
    { id: "UNIGURU", name: "UniGuru Autonomous Learning Core" },
    { id: "DRISHTI", name: "Drishti Computer Vision Runtime" },
    { id: "PRAVESH", name: "Pravesh Access & Identity Gate" }
];

const KnowledgeAdmin = () => {
    const { user } = useAuth();
    const { socket } = useSocket();

    // Governor / Admin Role Determination
    const isGovernor = useMemo(() => {
        if (!user) return false;
        const role = (user.role || '').trim().toLowerCase();
        const email = (user.email || '').trim().toLowerCase();
        const cid = (user.canonicalEmployeeId || user.employeeId || user.userId || user.id || '').trim().toUpperCase();

        const CANONICAL_GOVERNOR_IDS = ['EMP-BHIV-GOV-01', 'USR-GOV-001'];
        const AUTHORIZED_GOVERNOR_EMAILS = [
            'akash@blackhole.ai',
            'akash@blackholeinfiverse.com',
            'ansh@blackhole.ai',
            'governor@blackhole.ai'
        ];
        const RESTRICTED_ROLES = ['intern', 'student', 'employee', 'reviewer', 'operator', 'user'];

        if (CANONICAL_GOVERNOR_IDS.includes(cid)) return true;
        if (AUTHORIZED_GOVERNOR_EMAILS.includes(email)) return true;
        if (RESTRICTED_ROLES.includes(role)) return false;
        if (role === 'governor' || role === 'admin') return true;

        return false;
    }, [user]);

    const isAdmin = isGovernor || user?.role === 'Admin' || user?.role === 'Manager';

    const getAuthHeaders = () => {
        const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
        return {
            'Content-Type': 'application/json',
            'x-auth-token': token,
            'Authorization': `Bearer ${token}`
        };
    };

    // Navigation Tabs: 'MY_PRODUCTS' | 'GOVERNOR_QUEUE' | 'DIRECTORY'
    const [activeTab, setActiveTab] = useState(isGovernor ? 'GOVERNOR_QUEUE' : 'MY_PRODUCTS');
    const [selectedDirectoryMember, setSelectedDirectoryMember] = useState(null);

    // Contexts Data State
    const [myContexts, setMyContexts] = useState([]);
    const [allContexts, setAllContexts] = useState([]);
    const [complianceData, setComplianceData] = useState({ users: [], departments: [] });
    const [stats, setStats] = useState({ totalContexts: 0, approved: 0, pendingApproval: 0, rejected: 0, outdated: 0, products: [] });
    const [loading, setLoading] = useState(false);

    // Filters for Multi-Product Cards
    const [productFilter, setProductFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 6;

    // Add / Edit Context Modal State
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingContext, setEditingContext] = useState(null);
    const [formProductId, setFormProductId] = useState('BHIV');
    const [formCustomProductId, setFormCustomProductId] = useState('');
    const [formProductName, setFormProductName] = useState('');
    const [formContent, setFormContent] = useState('');
    const [formSummary, setFormSummary] = useState('');
    const [savingContext, setSavingContext] = useState(false);
    const [formError, setFormError] = useState(null);

    // Version History Modal State
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [historyContext, setHistoryContext] = useState(null);

    // Rejection Dialog State (Governor)
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectTargetId, setRejectTargetId] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [submittingReject, setSubmittingReject] = useState(false);

    // Context Deletion / Withdrawal Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [contextToDelete, setContextToDelete] = useState(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // Copied feedback helper
    const [copiedId, setCopiedId] = useState(null);
    const [copiedPrompt, setCopiedPrompt] = useState(false);

    const handleCopy = (text, id) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Load sample template matching current product or fallback
    const handleLoadSampleText = () => {
        const effectiveId = (formProductId === 'CUSTOM' ? formCustomProductId : formProductId).trim().toUpperCase();
        const matched = SAMPLE_TEMPLATES.find(tpl => tpl.productId === effectiveId) || SAMPLE_TEMPLATES[0];
        handleLoadTemplate(matched);
    };

    // Copy AI Prompt for Agentic IDE
    const handleCopyAIPrompt = async (overrideId, overrideName) => {
        const targetId = overrideId || (formProductId === 'CUSTOM' ? formCustomProductId : formProductId);
        const targetName = overrideName || formProductName;
        const promptText = buildContextGenerationPrompt(targetId, targetName);

        let copied = false;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(promptText);
                copied = true;
            }
        } catch (err) {
            // fallback below
        }

        if (!copied) {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = promptText;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                textArea.style.top = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                copied = document.execCommand('copy');
                textArea.remove();
            } catch (err) {
                console.error("Clipboard copy failed:", err);
            }
        }

        setCopiedPrompt(true);
        setTimeout(() => setCopiedPrompt(false), 2000);

        toast({
            title: "Prompt copied! Paste it into your Agentic IDE.",
            variant: "success",
            duration: 4500
        });
    };

    // Fetch My Contexts & All Contexts
    const fetchContextData = useCallback(async () => {
        setLoading(true);
        try {
            const headers = getAuthHeaders();
            const [myRes, allRes, compRes, statsRes] = await Promise.allSettled([
                axios.get(`${API_URL}/knowledge/my-contexts`, { headers }),
                axios.get(`${API_URL}/knowledge/contexts?limit=100`, { headers }),
                axios.get(`${API_URL}/knowledge/compliance`, { headers }),
                axios.get(`${API_URL}/knowledge/stats`, { headers })
            ]);

            if (myRes.status === 'fulfilled' && myRes.value.data?.contexts) {
                setMyContexts(myRes.value.data.contexts);
            }
            if (allRes.status === 'fulfilled' && allRes.value.data?.items) {
                setAllContexts(allRes.value.data.items);
            }
            if (compRes.status === 'fulfilled' && compRes.value.data?.users) {
                setComplianceData(compRes.value.data);
            }
            if (statsRes.status === 'fulfilled' && statsRes.value.data?.stats) {
                setStats(statsRes.value.data.stats);
            }
        } catch (err) {
            console.warn("Failed loading context data:", err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchContextData();
    }, [fetchContextData]);

    // WebSocket real-time subscription for instant synchronisation across multiple clients
    useEffect(() => {
        if (!socket) return;
        const onSync = () => {
            fetchContextData();
        };
        socket.on('knowledge:sync', onSync);
        socket.on('knowledge:context:created', onSync);
        socket.on('knowledge:context:updated', onSync);
        socket.on('knowledge:context:approved', onSync);
        socket.on('knowledge:context:rejected', onSync);
        socket.on('knowledge:context:deleted', onSync);

        return () => {
            socket.off('knowledge:sync', onSync);
            socket.off('knowledge:context:created', onSync);
            socket.off('knowledge:context:updated', onSync);
            socket.off('knowledge:context:approved', onSync);
            socket.off('knowledge:context:rejected', onSync);
            socket.off('knowledge:context:deleted', onSync);
        };
    }, [socket, fetchContextData]);

    // Active displayed contexts for the current view
    const targetContexts = useMemo(() => {
        if (selectedDirectoryMember) {
            const empId = (selectedDirectoryMember.canonicalEmployeeId || selectedDirectoryMember.employeeId || '').toUpperCase();
            return allContexts.filter(c => (c.employeeId || '').toUpperCase() === empId);
        }
        if (activeTab === 'GOVERNOR_QUEUE') {
            return allContexts.filter(c => c.status === 'PENDING_APPROVAL');
        }
        return myContexts;
    }, [activeTab, myContexts, allContexts, selectedDirectoryMember]);

    // Filter & Search
    const filteredContexts = useMemo(() => {
        let list = targetContexts;

        if (productFilter !== 'ALL') {
            list = list.filter(c => (c.productId || '').toUpperCase() === productFilter.toUpperCase());
        }

        if (statusFilter !== 'ALL') {
            list = list.filter(c => (c.status || '').toUpperCase() === statusFilter.toUpperCase());
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(c =>
                (c.productId || '').toLowerCase().includes(q) ||
                (c.productName || '').toLowerCase().includes(q) ||
                (c.content || '').toLowerCase().includes(q) ||
                (c.summary || '').toLowerCase().includes(q) ||
                (c.employeeId || '').toLowerCase().includes(q)
            );
        }

        return list;
    }, [targetContexts, productFilter, statusFilter, searchQuery]);

    // Pagination
    const totalPages = Math.ceil(filteredContexts.length / itemsPerPage) || 1;
    const paginatedContexts = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredContexts.slice(start, start + itemsPerPage);
    }, [filteredContexts, currentPage, itemsPerPage]);

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [productFilter, statusFilter, searchQuery]);

    // Open Add / Update Context Modal
    const handleOpenAddContext = (preselectedProductId = 'BHIV') => {
        setEditingContext(null);
        setFormProductId(preselectedProductId);
        setFormCustomProductId('');
        const matched = STANDARD_PRODUCTS.find(p => p.id === preselectedProductId);
        setFormProductName(matched ? matched.name : preselectedProductId);
        setFormContent('');
        setFormSummary('');
        setFormError(null);
        setEditModalOpen(true);
    };

    const handleOpenUpdateContext = (ctx) => {
        setEditingContext(ctx);
        const isStandard = STANDARD_PRODUCTS.some(p => p.id === ctx.productId);
        if (isStandard) {
            setFormProductId(ctx.productId);
            setFormCustomProductId('');
        } else {
            setFormProductId('CUSTOM');
            setFormCustomProductId(ctx.productId);
        }
        setFormProductName(ctx.productName || ctx.productId);
        setFormContent(ctx.content || '');
        setFormSummary(ctx.summary || '');
        setFormError(null);
        setEditModalOpen(true);
    };

    // Load sample template into modal
    const handleLoadTemplate = (tpl) => {
        const isStandard = STANDARD_PRODUCTS.some(p => p.id === tpl.productId);
        if (isStandard) {
            setFormProductId(tpl.productId);
            setFormCustomProductId('');
        } else {
            setFormProductId('CUSTOM');
            setFormCustomProductId(tpl.productId);
        }
        setFormProductName(tpl.productName);
        setFormContent(tpl.text);
        setFormSummary(tpl.text.substring(0, 250) + '...');
    };

    // Save / Submit Context to Backend
    const handleSaveContext = async (e) => {
        e.preventDefault();
        setFormError(null);

        const effectiveId = (formProductId === 'CUSTOM' ? formCustomProductId : formProductId).trim().toUpperCase();
        if (!effectiveId) {
            setFormError("Product ID is required.");
            return;
        }
        if (!formContent.trim()) {
            setFormError("Technical context content cannot be empty.");
            return;
        }

        setSavingContext(true);
        try {
            const payload = {
                productId: effectiveId,
                productName: formProductName.trim() || effectiveId,
                content: formContent.trim(),
                summary: formSummary.trim() || formContent.trim().substring(0, 300)
            };

            // If updating an existing context via ID or posting new
            let res;
            if (editingContext) {
                res = await axios.put(`${API_URL}/knowledge/contexts/${editingContext.contextId}`, payload, { headers: getAuthHeaders() });
            } else {
                res = await axios.post(`${API_URL}/knowledge/contexts`, payload, { headers: getAuthHeaders() });
            }

            if (res.data) {
                setEditModalOpen(false);
                await fetchContextData();
            }
        } catch (err) {
            setFormError(err.response?.data?.detail || err.response?.data?.error || "Failed to save product context.");
        } finally {
            setSavingContext(false);
        }
    };

    // Governor Approval Action
    const handleApprove = async (ctx) => {
        try {
            await axios.post(`${API_URL}/knowledge/contexts/${ctx.contextId}/approve`, {}, { headers: getAuthHeaders() });
            await fetchContextData();
        } catch (err) {
            alert(`Approval failed: ${err.response?.data?.detail || err.message}`);
        }
    };

    // Governor Rejection Action Trigger
    const openRejectModal = (ctx) => {
        setRejectTargetId(ctx.contextId);
        setRejectionReason('');
        setRejectModalOpen(true);
    };

    const handleConfirmReject = async () => {
        if (!rejectionReason.trim()) {
            alert("Please provide a rejection reason.");
            return;
        }
        setSubmittingReject(true);
        try {
            await axios.post(
                `${API_URL}/knowledge/contexts/${rejectTargetId}/reject`,
                { rejectionReason: rejectionReason.trim() },
                { headers: getAuthHeaders() }
            );
            setRejectModalOpen(false);
            await fetchContextData();
        } catch (err) {
            alert(`Rejection failed: ${err.response?.data?.detail || err.message}`);
        } finally {
            setSubmittingReject(false);
        }
    };

    // Context Deletion & Withdrawal Action
    const handleOpenDeleteModal = (ctx) => {
        if (!ctx) return;
        setContextToDelete(ctx);
        setDeleteReason('');
        setDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!contextToDelete) return;
        setIsDeleting(true);
        try {
            const contextId = contextToDelete.contextId || contextToDelete._id;
            await axios.delete(
                `${API_URL}/knowledge/contexts/${contextId}`,
                {
                    headers: getAuthHeaders(),
                    data: { reason: deleteReason || "Withdrawn from Knowledge Admin" }
                }
            );

            toast({
                title: "Context Withdrawn",
                description: `Product context for ${contextToDelete.productId} (${contextToDelete.version}) has been withdrawn and soft-deleted.`,
                variant: "default"
            });

            setDeleteModalOpen(false);
            setContextToDelete(null);
            setDeleteReason('');
            await fetchContextData();
        } catch (err) {
            const errMsg = err.response?.data?.error || err.response?.data?.detail || err.message || "Failed to delete context";
            toast({
                title: "Deletion Failed",
                description: errMsg,
                variant: "destructive"
            });
        } finally {
            setIsDeleting(false);
        }
    };

    // Status Badge Component
    const renderStatusBadge = (status) => {
        switch (status) {
            case 'APPROVED':
                return (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 gap-1 font-semibold text-xs py-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        APPROVED
                    </Badge>
                );
            case 'PENDING_APPROVAL':
                return (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 gap-1 font-semibold text-xs py-0.5">
                        <Clock className="w-3.5 h-3.5" />
                        PENDING APPROVAL
                    </Badge>
                );
            case 'REJECTED':
                return (
                    <Badge variant="outline" className="bg-rose-500/10 text-rose-500 border-rose-500/30 gap-1 font-semibold text-xs py-0.5">
                        <XCircle className="w-3.5 h-3.5" />
                        REJECTED
                    </Badge>
                );
            case 'OUTDATED':
                return (
                    <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/30 gap-1 font-semibold text-xs py-0.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        OUTDATED
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/30 gap-1 font-semibold text-xs py-0.5">
                        DRAFT
                    </Badge>
                );
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
            
            {/* Top Navigation Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
                        <Database className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                            Knowledge Admin & Multi-Product Grounding
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px] font-mono">
                                LIVE DB
                            </Badge>
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Multi-product technical specifications, version lineage, and Governor Akash Sir approval workflows.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Role-based Tab Switching */}
                    <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border">
                        <button
                            onClick={() => { setSelectedDirectoryMember(null); setActiveTab('MY_PRODUCTS'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                activeTab === 'MY_PRODUCTS' && !selectedDirectoryMember
                                    ? 'bg-background text-foreground shadow-sm' 
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            My Product Contexts
                        </button>

                        {isGovernor && (
                            <button
                                onClick={() => { setSelectedDirectoryMember(null); setActiveTab('GOVERNOR_QUEUE'); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                                    activeTab === 'GOVERNOR_QUEUE'
                                        ? 'bg-background text-foreground shadow-sm' 
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                                Governor Approval Queue
                                {stats.pendingApproval > 0 && (
                                    <span className="bg-amber-500 text-black px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                                        {stats.pendingApproval}
                                    </span>
                                )}
                            </button>
                        )}

                        {isAdmin && (
                            <button
                                onClick={() => { setSelectedDirectoryMember(null); setActiveTab('DIRECTORY'); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    activeTab === 'DIRECTORY'
                                        ? 'bg-background text-foreground shadow-sm' 
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                All Members Directory
                            </button>
                        )}
                    </div>

                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={fetchContextData}
                        disabled={loading}
                        className="h-9 gap-1.5 text-xs"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Sync
                    </Button>
                </div>
            </div>

            {/* Global Telemetry Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card className="border-border bg-card p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground">Total Contexts</span>
                    <span className="text-xl font-black text-foreground">{stats.totalContexts}</span>
                </Card>
                <Card className="border-border bg-card p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                    <span className="text-xl font-black text-emerald-500">{stats.approved}</span>
                </Card>
                <Card className="border-border bg-card p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-amber-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Pending Review
                    </span>
                    <span className="text-xl font-black text-amber-500">{stats.pendingApproval}</span>
                </Card>
                <Card className="border-border bg-card p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-rose-500 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Rejected
                    </span>
                    <span className="text-xl font-black text-rose-500">{stats.rejected}</span>
                </Card>
                <Card className="border-border bg-card p-3.5 flex flex-col justify-between col-span-2 sm:col-span-1">
                    <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" /> Products Covered
                    </span>
                    <span className="text-xl font-black text-foreground">{stats.products?.length || 0}</span>
                </Card>
            </div>

            {/* Back Button if Inspecting a Directory Member */}
            {selectedDirectoryMember && (
                <div className="p-3 sm:p-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-3 text-xs text-primary font-medium">
                    <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        <span>
                            Inspecting multi-product contexts for <strong>{selectedDirectoryMember.name}</strong> ({selectedDirectoryMember.canonicalEmployeeId || selectedDirectoryMember.employeeId}).
                        </span>
                    </div>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setSelectedDirectoryMember(null)}
                        className="h-8 text-xs bg-background/80 hover:bg-background"
                    >
                        ← Return to Directory
                    </Button>
                </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 1: MULTI-PRODUCT CARDS (MY PRODUCTS or INSPECTED MEMBER)            */}
            {/* ========================================================================= */}
            {(activeTab === 'MY_PRODUCTS' || selectedDirectoryMember) && (
                <div className="space-y-6">

                    {/* Filter, Search & Add Context Bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 flex-wrap">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search product name, ID, or specification..."
                                    className="pl-9 h-9 text-xs"
                                />
                            </div>

                            <Select value={productFilter} onValueChange={setProductFilter}>
                                <SelectTrigger className="w-[150px] h-9 text-xs">
                                    <SelectValue placeholder="All Products" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Products</SelectItem>
                                    {STANDARD_PRODUCTS.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.id}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[160px] h-9 text-xs">
                                    <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Statuses</SelectItem>
                                    <SelectItem value="APPROVED">Approved</SelectItem>
                                    <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                                    <SelectItem value="REJECTED">Rejected</SelectItem>
                                    <SelectItem value="OUTDATED">Outdated</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {!selectedDirectoryMember && (
                            <div className="flex items-center gap-2">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleCopyAIPrompt(productFilter !== 'ALL' ? productFilter : undefined)}
                                                className="h-9 gap-1.5 text-xs font-medium border-border hover:bg-muted/50"
                                                title="Copy prompt for Agentic IDE"
                                            >
                                                {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                Copy AI Prompt
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs max-w-xs">
                                            Copy prompt to analyze workspace and generate product context in your Agentic IDE
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                <Button
                                    onClick={() => handleOpenAddContext()}
                                    className="h-9 gap-1.5 text-xs font-semibold bg-primary text-primary-foreground shadow-sm hover:opacity-95"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Context
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Product Cards Grid (Supporting 2, 5, 10+ authorized products) */}
                    {paginatedContexts.length === 0 ? (
                        <Card className="border-dashed border-2 border-border p-12 text-center bg-card/50">
                            <div className="w-12 h-12 rounded-full bg-muted mx-auto flex items-center justify-center text-muted-foreground mb-3">
                                <BookOpen className="w-6 h-6" />
                            </div>
                            <h3 className="text-base font-bold text-foreground">No Product Contexts Found</h3>
                            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
                                {searchQuery || productFilter !== 'ALL' || statusFilter !== 'ALL'
                                    ? "No contexts matched your search filters. Try clearing filters to see all assigned products."
                                    : "You have not registered contexts for any product yet. Register your technical context to ground Parikshak task evaluations."}
                            </p>
                            {!selectedDirectoryMember && (
                                <Button size="sm" onClick={() => handleOpenAddContext()} className="gap-1.5 text-xs">
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Your First Product Context
                                </Button>
                            )}
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {paginatedContexts.map((ctx) => (
                                <Card key={ctx.contextId || ctx._id} className="border-border bg-card flex flex-col justify-between shadow-sm hover:border-primary/40 transition-colors">
                                    <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-black text-sm text-foreground">{ctx.productId}</span>
                                                    <Badge variant="secondary" className="text-[10px] font-mono py-0 px-1.5">
                                                        {ctx.version || 'v1.0'}
                                                    </Badge>
                                                </div>
                                                <h4 className="text-xs text-muted-foreground font-medium mt-0.5 line-clamp-1">
                                                    {ctx.productName || ctx.productId}
                                                </h4>
                                            </div>
                                            {renderStatusBadge(ctx.status)}
                                        </div>
                                    </CardHeader>

                                    <CardContent className="pt-3 pb-3 space-y-3 flex-1 text-xs">
                                        {/* Status Detail Banner */}
                                        {ctx.status === 'APPROVED' && (
                                            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-between text-[11px]">
                                                <span>✓ Approved by <strong>{ctx.approvedBy || 'Akash'}</strong></span>
                                                <span className="text-muted-foreground font-mono">
                                                    {ctx.approvedAt ? new Date(ctx.approvedAt).toLocaleDateString() : 'Active'}
                                                </span>
                                            </div>
                                        )}

                                        {ctx.status === 'REJECTED' && (
                                            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 space-y-1 text-[11px]">
                                                <div className="font-semibold flex items-center gap-1">
                                                    <XCircle className="w-3.5 h-3.5" /> Rejection Notice
                                                </div>
                                                <p className="text-foreground/80">{ctx.rejectionReason || 'Requires revision per Governor review.'}</p>
                                            </div>
                                        )}

                                        {ctx.status === 'PENDING_APPROVAL' && (
                                            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center gap-1.5 text-[11px]">
                                                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                                <span>Submitted for Akash Sir's Governor review.</span>
                                            </div>
                                        )}

                                        {/* Content Preview */}
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                                                <span>Grounding Specification</span>
                                                <Button
                                                    size="xs"
                                                    variant="ghost"
                                                    onClick={() => handleCopy(ctx.content, ctx.contextId)}
                                                    className="h-6 text-[10px] gap-1 px-1.5"
                                                >
                                                    {copiedId === ctx.contextId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                                    {copiedId === ctx.contextId ? 'Copied' : 'Copy'}
                                                </Button>
                                            </div>
                                            <div className="p-2.5 rounded-lg bg-muted/40 border border-border/80 text-[11px] font-mono leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap">
                                                {ctx.content}
                                            </div>
                                        </div>

                                        <div className="text-[10px] text-muted-foreground flex items-center justify-between pt-1">
                                            <span>Submitted: {ctx.submittedAt ? new Date(ctx.submittedAt).toLocaleDateString() : 'Recent'}</span>
                                            <span>Versions: {ctx.versionHistory?.length || 1}</span>
                                        </div>
                                    </CardContent>

                                    <CardFooter className="pt-2 pb-3 border-t border-border/50 bg-muted/10 flex items-center justify-between gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => { setHistoryContext(ctx); setHistoryModalOpen(true); }}
                                            className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                        >
                                            <History className="w-3.5 h-3.5" />
                                            History ({ctx.versionHistory?.length || 1})
                                        </Button>

                                        <div className="flex items-center gap-1.5">
                                            {/* Governor Quick Actions */}
                                            {isGovernor && ctx.status === 'PENDING_APPROVAL' && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleApprove(ctx)}
                                                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => openRejectModal(ctx)}
                                                        className="h-8 text-xs font-medium"
                                                    >
                                                        Reject
                                                    </Button>
                                                </>
                                            )}

                                            {(!selectedDirectoryMember || isGovernor) && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleOpenUpdateContext(ctx)}
                                                        className="h-8 text-xs gap-1"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                        Update
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => handleOpenDeleteModal(ctx)}
                                                        className="h-8 text-xs gap-1 bg-red-600 hover:bg-red-700 text-white font-medium"
                                                        title={ctx.status === 'APPROVED' && !isGovernor ? "Approved contexts require Governor approval for deletion" : "Delete / Withdraw Context"}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        Delete
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border">
                            <span>Showing {paginatedContexts.length} of {filteredContexts.length} product contexts</span>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 text-xs"
                                >
                                    Previous
                                </Button>
                                <span className="px-2 font-mono">
                                    Page {currentPage} of {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 text-xs"
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 2: GOVERNOR APPROVAL QUEUE (AKASH SIR DEDICATED TRIAGE)             */}
            {/* ========================================================================= */}
            {activeTab === 'GOVERNOR_QUEUE' && !selectedDirectoryMember && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-amber-500" />
                                Governor Context Approval Queue
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                Pending technical context submissions awaiting Akash Sir's Governor authorization before active RAG injection.
                            </p>
                        </div>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs font-mono">
                            {filteredContexts.length} PENDING
                        </Badge>
                    </div>

                    {filteredContexts.length === 0 ? (
                        <Card className="border-dashed border-2 border-border p-12 text-center bg-card/50">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                            <h3 className="text-base font-bold text-foreground">All Clear! No Pending Approvals</h3>
                            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                                All employee technical contexts have been reviewed and approved.
                            </p>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {filteredContexts.map((ctx) => (
                                <Card key={ctx.contextId} className="border-border bg-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-amber-500/40 transition-colors">
                                    <div className="space-y-2 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-black">
                                                {ctx.productId}
                                            </Badge>
                                            <span className="font-bold text-sm text-foreground">{ctx.productName}</span>
                                            <Badge variant="secondary" className="font-mono text-xs">
                                                {ctx.version || 'v1.0'}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">• Employee: <strong>{ctx.employeeId}</strong></span>
                                        </div>

                                        <p className="text-xs text-foreground/90 font-mono bg-muted/40 p-2.5 rounded-lg border border-border whitespace-pre-wrap max-h-32 overflow-y-auto">
                                            {ctx.content}
                                        </p>

                                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                            <span>Submitted: {ctx.submittedAt ? new Date(ctx.submittedAt).toLocaleString() : 'Recent'}</span>
                                            <span>History versions: {ctx.versionHistory?.length || 1}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => { setHistoryContext(ctx); setHistoryModalOpen(true); }}
                                            className="h-9 text-xs gap-1"
                                        >
                                            <History className="w-3.5 h-3.5" />
                                            History
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => handleApprove(ctx)}
                                            className="h-9 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            Approve Context
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => openRejectModal(ctx)}
                                            className="h-9 text-xs font-semibold gap-1"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                            Reject
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 3: GLOBAL ALL-MEMBERS DIRECTORY (ADMIN OVERVIEW)                    */}
            {/* ========================================================================= */}
            {activeTab === 'DIRECTORY' && !selectedDirectoryMember && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                                <Users className="w-5 h-5 text-primary" />
                                Employee Context Grounding Directory
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                Real-time context compliance audit across all departments and members.
                            </p>
                        </div>
                    </div>

                    <Card className="border-border bg-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-muted/40 text-muted-foreground border-b border-border font-medium">
                                    <tr>
                                        <th className="p-3">Canonical ID</th>
                                        <th className="p-3">Employee Name</th>
                                        <th className="p-3">Department</th>
                                        <th className="p-3">Products Covered</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {complianceData.users?.map((u) => {
                                        const count = u.contextCount || 0;
                                        const prods = u.contextsByProduct ? Object.keys(u.contextsByProduct) : [];
                                        return (
                                            <tr key={u.id || u.employeeId} className="hover:bg-muted/20 transition-colors">
                                                <td className="p-3 font-mono font-bold text-foreground">
                                                    {u.canonicalEmployeeId || u.employeeId}
                                                </td>
                                                <td className="p-3 font-medium text-foreground">
                                                    {u.name}
                                                </td>
                                                <td className="p-3 text-muted-foreground">
                                                    {u.department}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-1 flex-wrap">
                                                        {prods.length > 0 ? (
                                                            prods.map(p => (
                                                                <Badge key={p} variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                                                                    {p}
                                                                </Badge>
                                                            ))
                                                        ) : (
                                                            <span className="text-muted-foreground italic text-[11px]">None</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    {count > 0 ? (
                                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                                                            {count} Product{count > 1 ? 's' : ''} Grounded
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px]">
                                                            Context Missing
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <Button
                                                        size="xs"
                                                        variant="outline"
                                                        onClick={() => setSelectedDirectoryMember(u)}
                                                        className="h-7 text-[11px] gap-1"
                                                    >
                                                        <Eye className="w-3 h-3" />
                                                        Manage Products
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 1: ADD / UPDATE CONTEXT DIALOG                                      */}
            {/* ========================================================================= */}
            <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold">
                            <FileText className="w-4 h-4 text-primary" />
                            {editingContext ? `Update Context for ${editingContext.productId}` : "Register New Product Context"}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            {editingContext 
                                ? "Updating this specification will increment the version and reset status to PENDING_APPROVAL for Governor review."
                                : "Add authoritative technical grounding for an authorized product."}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveContext} className="space-y-4 py-2 text-xs">
                        {formError && (
                            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>{formError}</span>
                            </div>
                        )}

                        {/* Template Quick Loader & AI Generation Prompt Actions */}
                        <div className="space-y-2 p-2.5 rounded-lg bg-muted/30 border border-border/60">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                                    <span>Grounding Specification Tools</span>
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        onClick={handleLoadSampleText}
                                        className="h-7 text-[11px] gap-1.5 px-2.5 font-medium border-border hover:bg-muted/60"
                                        title="Load sample template text into the specification field"
                                    >
                                        <FileText className="w-3.5 h-3.5" />
                                        Load Sample Text
                                    </Button>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="xs"
                                                    onClick={() => handleCopyAIPrompt()}
                                                    className="h-7 text-[11px] gap-1.5 px-2.5 font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all shadow-xs"
                                                    title="Copy context generation prompt for your Agentic IDE"
                                                >
                                                    {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                    Copy AI Prompt
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs max-w-xs">
                                                Copy predefined prompt with selected product details for your Agentic IDE
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                <span className="text-[10px] text-muted-foreground mr-1">Quick Templates:</span>
                                {SAMPLE_TEMPLATES.map(tpl => (
                                    <button
                                        key={tpl.id}
                                        type="button"
                                        onClick={() => handleLoadTemplate(tpl)}
                                        className="text-[10px] px-2 py-0.5 rounded bg-background/80 hover:bg-primary/20 hover:text-primary transition-colors border border-border"
                                    >
                                        + {tpl.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Product Selection */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">Product ID</Label>
                                <Select 
                                    value={formProductId} 
                                    onValueChange={(val) => {
                                        setFormProductId(val);
                                        const match = STANDARD_PRODUCTS.find(p => p.id === val);
                                        if (match) setFormProductName(match.name);
                                    }}
                                    disabled={Boolean(editingContext)}
                                >
                                    <SelectTrigger className="h-9 text-xs">
                                        <SelectValue placeholder="Select product" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STANDARD_PRODUCTS.map(p => (
                                            <SelectItem key={p.id} value={p.id}>{p.id} — {p.name}</SelectItem>
                                        ))}
                                        <SelectItem value="CUSTOM">Custom Product ID...</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {formProductId === 'CUSTOM' && (
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Custom Product Code</Label>
                                    <Input
                                        value={formCustomProductId}
                                        onChange={(e) => setFormCustomProductId(e.target.value)}
                                        placeholder="e.g. SANSKAR, PRAVESH"
                                        className="h-9 text-xs uppercase"
                                        required
                                        disabled={Boolean(editingContext)}
                                    />
                                </div>
                            )}

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">Product Display Name</Label>
                                <Input
                                    value={formProductName}
                                    onChange={(e) => setFormProductName(e.target.value)}
                                    placeholder="e.g. BHIV Enterprise OS"
                                    className="h-9 text-xs"
                                    required
                                />
                            </div>
                        </div>

                        {/* Context Content */}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <Label className="text-xs font-semibold">Technical Grounding Specification (Full Context)</Label>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="xs"
                                        onClick={handleLoadSampleText}
                                        className="h-6 text-[10px] gap-1 px-1.5 text-muted-foreground hover:text-foreground"
                                        title="Load sample template text into the specification field"
                                    >
                                        <FileText className="w-3 h-3" />
                                        Load Sample Text
                                    </Button>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="xs"
                                                    onClick={() => handleCopyAIPrompt()}
                                                    className="h-6 text-[10px] gap-1 px-1.5 text-primary hover:text-primary font-medium"
                                                    title="Copy context generation prompt for your Agentic IDE"
                                                >
                                                    {copiedPrompt ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                                    Copy AI Prompt
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs max-w-xs">
                                                Copy predefined prompt with selected product details for your Agentic IDE
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                    <span className="text-[10px] text-muted-foreground font-mono">{formContent.length} chars</span>
                                </div>
                            </div>
                            <Textarea
                                value={formContent}
                                onChange={(e) => setFormContent(e.target.value)}
                                placeholder="Enter detailed technical architecture, deliverables, contracts, APIs, and grading rubrics..."
                                className="min-h-[160px] text-xs font-mono leading-relaxed"
                                required
                            />
                        </div>

                        {/* Summary */}
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Concise Executive Summary</Label>
                            <Input
                                value={formSummary}
                                onChange={(e) => setFormSummary(e.target.value)}
                                placeholder="Brief 1-2 sentence overview for telemetry..."
                                className="h-9 text-xs"
                            />
                        </div>

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditModalOpen(false)}
                                className="h-9 text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={savingContext}
                                className="h-9 text-xs font-semibold bg-primary text-primary-foreground"
                            >
                                {savingContext ? "Saving..." : (editingContext ? "Save & Advance Version" : "Register Context")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 2: VERSION HISTORY DIALOG                                           */}
            {/* ========================================================================= */}
            <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold">
                            <History className="w-4 h-4 text-primary" />
                            Version History — {historyContext?.productId}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Audit trail of all registered and approved versions for this product specification.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2 text-xs">
                        {(!historyContext?.versionHistory || historyContext.versionHistory.length === 0) ? (
                            <p className="text-muted-foreground italic text-center py-4">No historical revisions recorded.</p>
                        ) : (
                            historyContext.versionHistory.slice().reverse().map((hist, idx) => (
                                <div key={idx} className="p-3 rounded-xl bg-muted/40 border border-border space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="font-mono text-xs font-bold text-primary">
                                                {hist.version || `v${idx + 1}.0`}
                                            </Badge>
                                            {hist.approvedBy && (
                                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                                                    ✓ Approved by {hist.approvedBy}
                                                </Badge>
                                            )}
                                        </div>
                                        <span className="text-[11px] text-muted-foreground font-mono">
                                            {hist.timestamp ? new Date(hist.timestamp).toLocaleString() : 'Logged'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] font-mono text-foreground/90 bg-background/80 p-2.5 rounded-lg border border-border/60 whitespace-pre-wrap max-h-36 overflow-y-auto">
                                        {hist.content}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 3: GOVERNOR REJECTION REASON PROMPT                                 */}
            {/* ========================================================================= */}
            <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-rose-500">
                            <XCircle className="w-5 h-5" />
                            Reject Context Submission
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Provide explicit feedback explaining why this specification does not meet Governor standards.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2 text-xs">
                        <Label className="text-xs font-semibold">Rejection Reason</Label>
                        <Textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="e.g. Scope lacks specific API endpoints and error boundary definitions..."
                            className="min-h-[100px] text-xs"
                            required
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRejectModalOpen(false)}
                            className="h-8 text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleConfirmReject}
                            disabled={submittingReject}
                            className="h-8 text-xs font-semibold"
                        >
                            {submittingReject ? "Rejecting..." : "Confirm Rejection"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 4: CONTEXT DELETION & WITHDRAWAL CONFIRMATION DIALOG                */}
            {/* ========================================================================= */}
            <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-red-600">
                            <Trash2 className="w-5 h-5 text-red-600" />
                            Withdraw Product Context
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Confirm withdrawal or soft-deletion of this product knowledge specification.
                        </DialogDescription>
                    </DialogHeader>

                    {contextToDelete && (
                        <div className="space-y-3 py-2 text-xs">
                            <div className="p-3 rounded-lg border border-border bg-muted/40 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-foreground">
                                        {contextToDelete.productName || contextToDelete.productId}
                                    </span>
                                    <Badge variant="outline" className="font-mono text-[10px]">
                                        {contextToDelete.version || 'v1.0'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span>Product ID: <strong className="text-foreground">{contextToDelete.productId}</strong></span>
                                    <Badge className={
                                        contextToDelete.status === 'APPROVED' ? 'bg-emerald-600 text-white' :
                                        contextToDelete.status === 'PENDING_APPROVAL' ? 'bg-amber-500 text-white' :
                                        contextToDelete.status === 'REJECTED' ? 'bg-rose-500 text-white' : 'bg-slate-500 text-white'
                                    }>
                                        {contextToDelete.status}
                                    </Badge>
                                </div>
                            </div>

                            {/* Consequence callout */}
                            <div className={`p-3 rounded-md text-xs border ${
                                contextToDelete.status === 'APPROVED'
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                                    : contextToDelete.status === 'PENDING_APPROVAL'
                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400'
                                    : 'bg-muted/60 border-border text-muted-foreground'
                            }`}>
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="font-semibold">Consequences of Deletion:</p>
                                        {contextToDelete.status === 'APPROVED' ? (
                                            <p>
                                                This context is currently <strong>APPROVED</strong>. Removing it requires authorized Governor sign-off.
                                                Future task submissions for this product will be blocked until a replacement context is submitted and approved.
                                            </p>
                                        ) : contextToDelete.status === 'PENDING_APPROVAL' ? (
                                            <p>
                                                This context will be withdrawn and immediately removed from the active Governor review queue.
                                            </p>
                                        ) : (
                                            <p>
                                                This draft/rejected context will be archived. You may register a new context for this product at any time.
                                            </p>
                                        )}
                                        <p className="text-[11px] opacity-80 pt-1">
                                            Historical context versions, review evidence, and audit logs are permanently preserved (soft deletion).
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Reason for Withdrawal (Optional)</Label>
                                <Input
                                    value={deleteReason}
                                    onChange={(e) => setDeleteReason(e.target.value)}
                                    placeholder="e.g. Obsolete architecture or superseded by updated build"
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDeleteModalOpen(false)}
                            className="h-8 text-xs"
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="h-8 text-xs font-semibold gap-1 bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isDeleting ? (
                                <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    Withdrawing...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Confirm Deletion
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
};

export default KnowledgeAdmin;
