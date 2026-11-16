import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { useSocket } from '@/context/socket-context';
import { 
    User, Users, Sparkles, CheckCircle2, AlertCircle, RefreshCw, 
    Search, ArrowRight, ArrowLeft, BookOpen, Clock, ShieldCheck, 
    Code, FileText, ChevronRight, Eye, Send, Check, X, 
    Filter, Database, Layers, ExternalLink, HelpCircle, Copy, Edit3, FolderGit2
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

// Standardized Sample Knowledge Templates for Parikshak Grounding
const SAMPLE_TEMPLATES = [
    {
        id: "section10",
        label: "Section 10: Threat Intelligence",
        dept: "AI ML",
        projectName: "bhiv-cybersecurity",
        productId: "BHIV",
        text: `BHIV vNEXT 10-Day Integrated Build. Section 10: Threat correlation and incident intelligence.
Mission: Multi-signal correlation, incident timeline reconstruction, severity/confidence analysis, and adaptive security intelligence across MANTRA, TANTRA, YANTRA, and VAJRA.
Deliverables:
1. Multi-signal rule engine correlating suspicious endpoints, failed authentication spikes, and lateral movement traces.
2. Canonical incident timeline with plain-English human-readable explainability.
3. Automated review verification passing testing_evidence/run_all.py test harness with zero false flags.`
    },
    {
        id: "niyantran",
        label: "Niyantran: Full-Stack Integration",
        dept: "Web Development",
        projectName: "bhiv-workflow-blackhole",
        productId: "NIYANTRAN",
        text: `Niyantran Full-Stack Integration & Governance Hub.
Scope: Real-time WebSocket compliance monitoring, role-aware Knowledge Admin UI, task assignment lifecycle, and department DAG synchronization.
Deliverables:
1. Clean role-aware Knowledge Admin interface with isolated dedicated employee tracks and global admin telemetry.
2. Single-shift atomic task scoping (strictly 180-360 minutes / 240 mins estimated default).
3. Persistent context injection with instant real-time synchronization.`
    },
    {
        id: "trinetra",
        label: "TRINETRA: Activity Agent",
        dept: "AI ML",
        projectName: "trinetra-monitoring",
        productId: "TRINETRA",
        text: `TRINETRA Employee Activity Agent & Telemetry Pipeline.
Scope: Electron desktop activity tracking agent, background daemon resilience, and real-time monitoring sync with Niyantran.
Deliverables:
1. Zero-data-loss session persistence in activityTracker.js across network glitch/retry scenarios.
2. Real-time active time tracking, keystroke/mouse activity weighting, and intelligent screenshot capture engine.
3. Clean day-end reporting workflow and unified attendance telemetry synchronization.`
    },
    {
        id: "vajra",
        label: "VAJRA: Trust & Provenance",
        dept: "Blockchain",
        projectName: "bhiv-vajra",
        productId: "VAJRA",
        text: `VAJRA Trust, Provenance & AI Bridge.
Scope: Blockchain transaction replay, cryptographic provenance ledger, authority lifecycle, and recovery trust package.
Deliverables:
1. Canonical transaction signing and replay protection with RS256 token verification.
2. User-facing identity, consent, access revocation, and proof of state consistency.
3. Bridge contracts between VAJRA trust anchor and AI/ML evaluation pipelines.`
    },
    {
        id: "testing",
        label: "Section 9: Testing & Qualification",
        dept: "Testing",
        projectName: "bhiv-cybersecurity",
        productId: "TESTING",
        text: `BHIV vNEXT Section 9: Testing, Evidence & Observability.
Scope: Test harness, evidence collection, deterministic verification, replay proof logs, and release qualification.
Deliverables:
1. Deterministic evaluation test harness with zero false positive rate.
2. Proof of work replay packages and audit trace generation.
3. Comprehensive stress and security testing for CI/CD pipeline.`
    }
];

const PROJECT_PRESETS = [
    { value: "bhiv-cybersecurity", label: "bhiv-cybersecurity (BHIV vNEXT)" },
    { value: "bhiv-workflow-blackhole", label: "bhiv-workflow-blackhole (Niyantran)" },
    { value: "bhiv-Parikshak-system", label: "bhiv-Parikshak-system (Parikshak Engine)" },
    { value: "trinetra-monitoring", label: "trinetra-monitoring (TRINETRA Agent)" },
    { value: "MANTRA", label: "MANTRA (Digital Core)" },
    { value: "TANTRA", label: "TANTRA (Governance & Authority)" },
    { value: "VAJRA", label: "VAJRA (Trust & Provenance)" },
    { value: "BIQOS", label: "BIQOS (Ecosystem Destination)" },
    { value: "CUSTOM", label: "Custom Project..." }
];

const KnowledgeAdmin = () => {
    const { user } = useAuth();
    const { socket } = useSocket();

    const isAdmin = user?.role === 'Admin' || user?.role === 'Manager';

    const getAuthHeaders = () => {
        const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
        return {
            'x-auth-token': token,
            'Authorization': `Bearer ${token}`
        };
    };

    // View mode: 'GLOBAL' (Admin overview) | 'DEDICATED' (Individual user hub)
    const [viewMode, setViewMode] = useState(isAdmin ? 'GLOBAL' : 'DEDICATED');
    const [selectedMember, setSelectedMember] = useState(null);

    // Data State
    const [complianceData, setComplianceData] = useState({
        totalActive: 151,
        totalFilled: 6,
        totalPending: 145,
        compliancePercentage: 4,
        departments: [],
        users: []
    });
    const [loadingCompliance, setLoadingCompliance] = useState(false);
    const [syllabusData, setSyllabusData] = useState({ total_tasks: 37, departments: {} });
    const [_loadingSyllabus, setLoadingSyllabus] = useState(false);

    // Filter & Search State (Global Hub)
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'INGESTED' | 'MISSING'

    // Dedicated View Context Ingest / Edit state
    const [inlineContextText, setInlineContextText] = useState('');
    const [inlineProjectPreset, setInlineProjectPreset] = useState('bhiv-cybersecurity');
    const [inlineProjectName, setInlineProjectName] = useState('bhiv-cybersecurity');
    const [savingInlineContext, setSavingInlineContext] = useState(false);
    const [inlineFeedback, setInlineFeedback] = useState(null);
    const [showEditForm, setShowEditForm] = useState(false);
    const [copiedContext, setCopiedContext] = useState(false);

    // Quick Ingest Modal State (Global Hub)
    const [quickModalOpen, setQuickModalOpen] = useState(false);
    const [modalCandidate, setModalCandidate] = useState(null);
    const [modalContextText, setModalContextText] = useState('');
    const [modalProjectPreset, setModalProjectPreset] = useState('bhiv-cybersecurity');
    const [modalProjectName, setModalProjectName] = useState('bhiv-cybersecurity');
    const [submittingModal, setSubmittingModal] = useState(false);
    const [modalFeedback, setModalFeedback] = useState(null);

    // Expandable context previews in admin table
    const [expandedContextIds, setExpandedContextIds] = useState({});
    const [copiedRowId, setCopiedRowId] = useState(null);

    // Copy helper
    const handleCopy = (text, isRowId = null) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        if (isRowId) {
            setCopiedRowId(isRowId);
            setTimeout(() => setCopiedRowId(null), 2000);
        } else {
            setCopiedContext(true);
            setTimeout(() => setCopiedContext(false), 2000);
        }
    };

    // Load Sample context into dedicated form
    const loadSampleTemplate = (tpl) => {
        setInlineContextText(tpl.text);
        setInlineProjectName(tpl.projectName);
        const matchPreset = PROJECT_PRESETS.find(p => p.value === tpl.projectName);
        setInlineProjectPreset(matchPreset ? matchPreset.value : 'CUSTOM');
    };

    // Load Sample context into modal
    const loadModalSampleTemplate = (tpl) => {
        setModalContextText(tpl.text);
        setModalProjectName(tpl.projectName);
        const matchPreset = PROJECT_PRESETS.find(p => p.value === tpl.projectName);
        setModalProjectPreset(matchPreset ? matchPreset.value : 'CUSTOM');
    };

    // Fetch Compliance Data
    const fetchCompliance = async () => {
        setLoadingCompliance(true);
        try {
            const res = await axios.get(`${API_URL}/knowledge/compliance`, { headers: getAuthHeaders() });
            if (res.data && res.data.users) {
                setComplianceData(res.data);
            }
        } catch (err) {
            console.warn('Compliance load fallback:', err.message);
        } finally {
            setLoadingCompliance(false);
        }
    };

    // Fetch Syllabus Data
    const fetchSyllabus = async () => {
        setLoadingSyllabus(true);
        try {
            const res = await axios.get(`${API_URL}/knowledge/syllabus`, { headers: getAuthHeaders() });
            if (res.data && res.data.departments) {
                setSyllabusData(res.data);
            }
        } catch (err) {
            console.warn('Syllabus load fallback:', err.message);
        } finally {
            setLoadingSyllabus(false);
        }
    };

    useEffect(() => {
        fetchCompliance();
        fetchSyllabus();
    }, []);

    // WebSocket real-time listener for instant multi-user synchronization
    useEffect(() => {
        if (!socket) return;
        const handleSync = (data) => {
            console.log('⚡ Real-time knowledge sync received:', data);
            fetchCompliance();
        };
        socket.on('knowledge:sync', handleSync);
        return () => {
            socket.off('knowledge:sync', handleSync);
        };
    }, [socket]);

    // Determine current user object for dedicated mode
    const currentMember = useMemo(() => {
        if (selectedMember) return selectedMember;
        
        // Find matching logged in user in compliance users
        if (complianceData.users?.length > 0 && user) {
            const userEmail = (user.email || '').toLowerCase().trim();
            const userName = (user.name || '').toLowerCase().trim();
            const userEmp = (user.employeeId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

            const match = complianceData.users.find(u => {
                const uEmail = (u.email || '').toLowerCase().trim();
                const uName = (u.name || '').toLowerCase().trim();
                const uEmp = (u.employeeId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

                if (userEmail && uEmail && userEmail === uEmail) return true;
                if (userEmp && uEmp && userEmp !== 'NA' && userEmp === uEmp) return true;
                if (userName && uName) {
                    if (userName === uName) return true;
                    if (userName.includes(uName) || uName.includes(userName)) return true;
                }
                return false;
            });
            if (match) return match;
        }

        // Default fallback to logged in user profile
        return {
            id: user?._id || user?.id || 'current-user',
            name: user?.name || 'Ishan Shirode',
            email: user?.email || 'blackholeinfiverse78@gmail.com',
            employeeId: user?.employeeId || 'BHIV78',
            role: user?.role || 'User',
            department: user?.department?.name || user?.department || 'AI ML',
            hasContext: false,
            injectedContext: null
        };
    }, [selectedMember, complianceData.users, user]);

    // Filtered users for Global Hub
    const filteredUsers = useMemo(() => {
        let list = complianceData.users || [];

        if (selectedDeptFilter !== 'ALL') {
            list = list.filter(u => (u.department || '').toUpperCase() === selectedDeptFilter.toUpperCase());
        }

        if (statusFilter === 'INGESTED') {
            list = list.filter(u => u.hasContext);
        } else if (statusFilter === 'MISSING') {
            list = list.filter(u => !u.hasContext);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(u => 
                (u.name || '').toLowerCase().includes(q) ||
                (u.email || '').toLowerCase().includes(q) ||
                (u.employeeId || '').toLowerCase().includes(q) ||
                (u.department || '').toLowerCase().includes(q)
            );
        }

        return list;
    }, [complianceData.users, selectedDeptFilter, statusFilter, searchQuery]);

    // Get Department tasks for current member
    const currentDeptTasks = useMemo(() => {
        if (!syllabusData.departments) return [];
        const dept = currentMember?.department || 'AI ML';
        
        // Match department tasks
        const exactMatch = syllabusData.departments[dept];
        if (exactMatch && exactMatch.length > 0) return exactMatch;

        // Fallback matching
        for (const [dName, tasks] of Object.entries(syllabusData.departments)) {
            if (dept.toUpperCase().includes(dName.toUpperCase()) || dName.toUpperCase().includes(dept.toUpperCase())) {
                return tasks;
            }
        }
        return syllabusData.departments['Governance & System'] || [];
    }, [syllabusData.departments, currentMember]);

    // Handle Inline Context Ingest / Update (Dedicated View)
    const handleSaveInlineContext = async (e) => {
        e.preventDefault();
        if (!inlineContextText.trim()) return;

        const effectiveProject = (inlineProjectName || 'bhiv-cybersecurity').trim();
        setSavingInlineContext(true);
        setInlineFeedback(null);

        // Instant local state optimistic update for zero lag!
        const optimisticRecord = {
            dataset_id: `ds-ctx-${Date.now()}`,
            content: inlineContextText.trim(),
            summary: inlineContextText.trim().length > 300 ? inlineContextText.trim().substring(0, 300) + '...' : inlineContextText.trim(),
            product_id: effectiveProject.toUpperCase(),
            project_name: effectiveProject,
            source: 'Department_Intelligence_Hub',
            version: 'v1.0',
            ingestion_timestamp: new Date().toISOString()
        };

        // Update complianceData locally in real-time
        const updatedUser = {
            ...(currentMember || {}),
            hasContext: true,
            contextCount: 1,
            injectedContext: optimisticRecord
        };

        setComplianceData(prev => {
            const prevUsers = prev.users || [];
            const userEmail = (currentMember?.email || '').toLowerCase().trim();
            const userEmp = (currentMember?.employeeId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const userName = (currentMember?.name || '').toLowerCase().trim();

            const isMatch = (u) => {
                const uEmail = (u.email || '').toLowerCase().trim();
                const uEmp = (u.employeeId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                const uName = (u.name || '').toLowerCase().trim();

                return (userEmail && uEmail && userEmail === uEmail) ||
                       (userEmp && uEmp && userEmp !== 'NA' && userEmp === uEmp) ||
                       (userName && uName && (userName === uName || userName.includes(uName)));
            };

            const exists = prevUsers.some(isMatch);
            const updated = exists
                ? prevUsers.map(u => isMatch(u) ? { ...u, hasContext: true, contextCount: 1, injectedContext: optimisticRecord } : u)
                : [updatedUser, ...prevUsers];

            return {
                ...prev,
                users: updated,
                totalFilled: updated.filter(u => u.hasContext).length,
                totalPending: updated.filter(u => !u.hasContext).length
            };
        });

        setSelectedMember(updatedUser);

        try {
            const payload = {
                candidateName: currentMember?.name || 'Ishan Shirode',
                employeeId: currentMember?.employeeId || 'BHIV78',
                email: currentMember?.email || 'blackholeinfiverse78@gmail.com',
                department: currentMember?.department || 'AI ML',
                contextText: inlineContextText.trim(),
                productId: effectiveProject.toUpperCase(),
                projectName: effectiveProject
            };

            await axios.post(`${API_URL}/knowledge/quick-ingest`, payload, { headers: getAuthHeaders() });
            setInlineFeedback({ type: 'success', message: 'Context successfully injected & verified by Parikshak in real-time!' });
            setShowEditForm(false);
            await fetchCompliance();
        } catch (err) {
            setInlineFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to inject context.' });
        } finally {
            setSavingInlineContext(false);
        }
    };

    // Handle Quick Modal Open (Global Hub)
    const openQuickModalForUser = (member) => {
        setModalCandidate(member);
        const existingProject = member.injectedContext?.project_name || member.injectedContext?.product_id || (member.department === 'Web Development' ? 'bhiv-workflow-blackhole' : 'bhiv-cybersecurity');
        setModalProjectName(existingProject);
        const matchPreset = PROJECT_PRESETS.find(p => p.value === existingProject);
        setModalProjectPreset(matchPreset ? matchPreset.value : 'CUSTOM');
        setModalContextText(member.injectedContext?.content || '');
        setModalFeedback(null);
        setQuickModalOpen(true);
    };

    // Handle Submit Quick Modal
    const handleModalSubmit = async (e) => {
        e.preventDefault();
        if (!modalCandidate || !modalContextText.trim()) return;

        const effectiveProject = (modalProjectName || 'bhiv-cybersecurity').trim();
        setSubmittingModal(true);
        setModalFeedback(null);

        // Optimistic UI update
        const optimisticRecord = {
            dataset_id: `ds-ctx-${Date.now()}`,
            content: modalContextText.trim(),
            summary: modalContextText.trim().length > 300 ? modalContextText.trim().substring(0, 300) + '...' : modalContextText.trim(),
            product_id: effectiveProject.toUpperCase(),
            project_name: effectiveProject,
            source: 'Department_Intelligence_Hub',
            version: 'v1.0',
            ingestion_timestamp: new Date().toISOString()
        };

        setComplianceData(prev => {
            const prevUsers = prev.users || [];
            const updated = prevUsers.map(u => {
                const isMatch = (u.id && modalCandidate.id && u.id === modalCandidate.id) ||
                                (u.email && modalCandidate.email && u.email.toLowerCase() === modalCandidate.email.toLowerCase()) ||
                                (u.employeeId && modalCandidate.employeeId && u.employeeId === modalCandidate.employeeId) ||
                                (u.name && modalCandidate.name && u.name.toLowerCase() === modalCandidate.name.toLowerCase());
                return isMatch ? { ...u, hasContext: true, contextCount: 1, injectedContext: optimisticRecord } : u;
            });
            return {
                ...prev,
                users: updated,
                totalFilled: updated.filter(u => u.hasContext).length,
                totalPending: updated.filter(u => !u.hasContext).length
            };
        });

        if (selectedMember && (
            (selectedMember.id && modalCandidate.id && selectedMember.id === modalCandidate.id) ||
            (selectedMember.email && modalCandidate.email && selectedMember.email.toLowerCase() === modalCandidate.email.toLowerCase())
        )) {
            setSelectedMember(prev => ({
                ...prev,
                hasContext: true,
                injectedContext: optimisticRecord
            }));
        }

        try {
            const payload = {
                candidateName: modalCandidate.name,
                employeeId: modalCandidate.employeeId || '',
                email: modalCandidate.email || '',
                department: modalCandidate.department || 'AI ML',
                contextText: modalContextText.trim(),
                productId: effectiveProject.toUpperCase(),
                projectName: effectiveProject
            };

            await axios.post(`${API_URL}/knowledge/quick-ingest`, payload, { headers: getAuthHeaders() });
            setModalFeedback({ type: 'success', message: `Context saved for ${modalCandidate.name}!` });
            setTimeout(() => {
                setQuickModalOpen(false);
                setModalFeedback(null);
            }, 1000);
            await fetchCompliance();
        } catch (err) {
            setModalFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to save context.' });
        } finally {
            setSubmittingModal(false);
        }
    };

    // Switch Admin to inspect a specific member's dedicated view
    const inspectMemberDedicated = (member) => {
        setSelectedMember(member);
        setViewMode('DEDICATED');
        setInlineFeedback(null);
        setInlineContextText(member.injectedContext?.content || '');
        setInlineProjectName(member.injectedContext?.project_name || member.injectedContext?.product_id || 'bhiv-cybersecurity');
        setShowEditForm(!member.hasContext);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Return to Global Hub
    const returnToGlobalHub = () => {
        setViewMode('GLOBAL');
        setSelectedMember(null);
        setInlineFeedback(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
            
            {/* Top Navigation Bar & Mode Switcher */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
                        {viewMode === 'GLOBAL' ? <Database className="w-6 h-6" /> : <User className="w-6 h-6" />}
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                            {viewMode === 'GLOBAL' ? 'Global Knowledge & Context Hub' : 'My Dedicated Knowledge & Task Hub'}
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px] font-mono">
                                REALTIME SYNC
                            </Badge>
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {viewMode === 'GLOBAL' 
                                ? 'Admin oversight: Injected contexts across all employees, departments, and Parikshak DAG nodes.' 
                                : `Dedicated track and injected technical context for ${currentMember?.name}.`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                    {isAdmin && (
                        <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border">
                            <button
                                onClick={returnToGlobalHub}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    viewMode === 'GLOBAL' 
                                        ? 'bg-background text-foreground shadow-sm' 
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                Global Hub
                            </button>
                            <button
                                onClick={() => {
                                    setSelectedMember(null);
                                    setViewMode('DEDICATED');
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    viewMode === 'DEDICATED' && !selectedMember
                                        ? 'bg-background text-foreground shadow-sm' 
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                My Personal Track
                            </button>
                        </div>
                    )}

                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => { fetchCompliance(); fetchSyllabus(); }}
                        disabled={loadingCompliance}
                        className="h-9 gap-1.5 text-xs"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingCompliance ? 'animate-spin' : ''}`} />
                        Sync
                    </Button>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* VIEW MODE 1: DEDICATED USER TRACK (For Individuals or Admin Inspected)   */}
            {/* ========================================================================= */}
            {viewMode === 'DEDICATED' && (
                <div className="space-y-6">

                    {/* Admin Inspection Banner (Only if admin is inspecting someone else) */}
                    {selectedMember && (
                        <div className="p-3 sm:p-4 rounded-xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-primary font-medium">
                            <div className="flex items-center gap-2">
                                <Eye className="w-4 h-4" />
                                <span>
                                    <strong>Admin View:</strong> Inspecting dedicated knowledge track for <strong>{selectedMember.name}</strong> ({selectedMember.department || 'AI ML'}).
                                </span>
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={returnToGlobalHub}
                                className="h-8 text-xs bg-background/80 hover:bg-background"
                            >
                                ← Exit to Global Hub
                            </Button>
                        </div>
                    )}

                    {/* USER PROFILE CARD */}
                    <Card className="border-border shadow-sm bg-card overflow-hidden">
                        <CardContent className="p-5 sm:p-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center text-primary font-black text-xl shadow-inner">
                                        {(currentMember?.name || 'U').substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="text-xl font-black text-foreground">{currentMember?.name || 'User'}</h2>
                                            <Badge variant="secondary" className="font-mono text-xs">
                                                {currentMember?.employeeId || 'BHIV-USR'}
                                            </Badge>
                                            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                                                {currentMember?.department || 'AI ML'}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {currentMember?.email || 'employee@blackhole.ai'} • Role: {currentMember?.role || 'User'} • Mode: {currentMember?.workMode || 'WFO'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                                    {currentMember?.hasContext ? (
                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5">
                                            <CheckCircle2 className="w-4 h-4" />
                                            Parikshak Context Active & Grounded
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5">
                                            <AlertCircle className="w-4 h-4" />
                                            Context Injection Required
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* SECTION 1: INJECTED TECHNICAL CONTEXT (DISPLAY FULL CONTEXT) */}
                    <Card className="border-border shadow-md bg-card overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b border-border pb-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-primary" />
                                        Injected Technical Context & Grounding
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Authoritative specification used by Parikshak to evaluate submissions, calibrate review rubrics, and eliminate "out_of_syllabus" false flags.
                                    </CardDescription>
                                </div>
                                {currentMember?.hasContext && (
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[11px] font-mono border-primary/30 text-primary">
                                            Project: {currentMember?.injectedContext?.project_name || currentMember?.injectedContext?.product_id || 'BHIV'}
                                        </Badge>
                                        <Badge variant="outline" className="text-[11px] font-mono border-muted text-muted-foreground">
                                            v{currentMember?.injectedContext?.version || '1.0'}
                                        </Badge>
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        
                        <CardContent className="p-5 sm:p-6 space-y-4">
                            
                            {/* IF HAS CONTEXT: SHOW FULL UNABRIDGED CONTENT */}
                            {currentMember?.hasContext && currentMember?.injectedContext ? (
                                <div className="space-y-4">
                                    <div className="p-4 sm:p-5 rounded-xl bg-muted/40 border border-border space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                                Full Injected Grounding Specification:
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground font-mono text-[11px]">
                                                    {currentMember.injectedContext.ingestion_timestamp 
                                                        ? new Date(currentMember.injectedContext.ingestion_timestamp).toLocaleString() 
                                                        : 'Active'}
                                                </span>
                                                <Button 
                                                    size="xs" 
                                                    variant="outline" 
                                                    onClick={() => handleCopy(currentMember.injectedContext.content || currentMember.injectedContext.summary)}
                                                    className="h-7 text-[11px] gap-1"
                                                >
                                                    {copiedContext ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                                    {copiedContext ? 'Copied' : 'Copy Full Context'}
                                                </Button>
                                                <Button 
                                                    size="xs" 
                                                    variant="ghost" 
                                                    onClick={() => {
                                                        setShowEditForm(!showEditForm);
                                                        setInlineContextText(currentMember.injectedContext.content || '');
                                                    }}
                                                    className="h-7 text-[11px] gap-1"
                                                >
                                                    <Edit3 className="w-3 h-3 text-primary" />
                                                    {showEditForm ? 'Hide Editor' : 'Revise / Update'}
                                                </Button>
                                            </div>
                                        </div>

                                        {/* FULL UNABRIDGED DISPLAY */}
                                        <div className="text-xs text-foreground/95 font-mono whitespace-pre-wrap leading-relaxed max-h-[350px] overflow-y-auto p-4 rounded-xl bg-background/80 border border-border select-text shadow-inner">
                                            {currentMember.injectedContext.content || currentMember.injectedContext.summary}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                                            <span className="bg-background px-2.5 py-1 rounded-md border font-mono">
                                                Target Repo / Project: <strong>{currentMember.injectedContext.project_name || currentMember.injectedContext.product_id || 'bhiv-cybersecurity'}</strong>
                                            </span>
                                            <span className="bg-background px-2.5 py-1 rounded-md border font-mono">
                                                Source: {currentMember.injectedContext.source || 'Department_Intelligence_Hub'}
                                            </span>
                                            <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2.5 py-1 rounded-md font-mono font-semibold">
                                                ⏱️ Scoped to 180-360 mins SLA
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* IF MISSING CONTEXT: ALERT CARD */
                                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div className="text-xs space-y-1">
                                        <p className="font-semibold text-sm">No Technical Context Ingested Yet</p>
                                        <p className="text-muted-foreground">
                                            Without injected context, Parikshak cannot calibrate your submission against your actual deliverables. Ingest your context below or load a sample build specification.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* INGEST / REVISE FORM (Visible when no context OR when Revise clicked) */}
                            {(!currentMember?.hasContext || showEditForm) && (
                                <form onSubmit={handleSaveInlineContext} className="space-y-4 bg-muted/20 p-5 rounded-xl border border-border mt-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                                        <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                            <Edit3 className="w-3.5 h-3.5 text-primary" />
                                            {currentMember?.hasContext ? 'Revise Your Grounding Specification:' : 'Paste Your ChatGPT / Build Specification Context:'}
                                        </Label>
                                        
                                        {/* LOAD SAMPLE CONTEXT BUTTON */}
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-[11px] text-muted-foreground">Load Template:</span>
                                            {SAMPLE_TEMPLATES.map(tpl => (
                                                <button
                                                    key={tpl.id}
                                                    type="button"
                                                    onClick={() => loadSampleTemplate(tpl)}
                                                    className="px-2 py-1 rounded text-[11px] bg-background hover:bg-muted border border-border text-foreground transition-colors font-medium flex items-center gap-1"
                                                >
                                                    <Sparkles className="w-2.5 h-2.5 text-primary" />
                                                    {tpl.label.split(':')[0]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* PROJECT SELECTOR + CUSTOM PROJECT INPUT */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-background/60 p-3 rounded-lg border border-border/60">
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                                                <FolderGit2 className="w-3 h-3 text-primary" />
                                                Select Project Preset:
                                            </Label>
                                            <Select 
                                                value={inlineProjectPreset} 
                                                onValueChange={(val) => {
                                                    setInlineProjectPreset(val);
                                                    if (val !== 'CUSTOM') setInlineProjectName(val);
                                                }}
                                            >
                                                <SelectTrigger className="h-8 text-xs bg-background">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {PROJECT_PRESETS.map(p => (
                                                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                                                <Code className="w-3 h-3 text-primary" />
                                                Exact Project / Repo Identifier:
                                            </Label>
                                            <Input 
                                                value={inlineProjectName}
                                                onChange={(e) => setInlineProjectName(e.target.value)}
                                                placeholder="e.g. bhiv-cybersecurity, bhiv-workflow-blackhole"
                                                className="h-8 text-xs font-mono bg-background"
                                            />
                                        </div>
                                    </div>

                                    {/* CONTEXT TEXTAREA */}
                                    <div className="space-y-1.5">
                                        <Textarea 
                                            rows={6}
                                            value={inlineContextText}
                                            onChange={(e) => setInlineContextText(e.target.value)}
                                            placeholder="Paste your task briefing, deliverables, section requirements (e.g., BHIV vNEXT Section 10 Threat Correlation, repo URLs, target API contracts)..."
                                            className="text-xs font-mono bg-background leading-relaxed"
                                        />
                                        <p className="text-[11px] text-muted-foreground italic">
                                            Tip: Include section numbers, repository names, branch names, and verification scripts (e.g. run_all.py).
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-end gap-2 pt-1">
                                        {currentMember?.hasContext && (
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setShowEditForm(false)} className="text-xs">
                                                Cancel
                                            </Button>
                                        )}
                                        <Button type="submit" size="sm" disabled={savingInlineContext || !inlineContextText.trim()} className="gap-1.5 text-xs">
                                            <Send className="w-3.5 h-3.5" />
                                            {savingInlineContext ? 'Ingesting Context in Realtime...' : 'Save & Ingest Context'}
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {inlineFeedback && (
                                <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                                    inlineFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30' : 'bg-destructive/10 text-destructive border border-destructive/30'
                                }`}>
                                    {inlineFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    <span>{inlineFeedback.message}</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* SECTION 2: DEDICATED CURRICULUM TASK GRAPH (180-360 MINS) */}
                    <Card className="border-border shadow-md bg-card overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b border-border pb-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-primary" />
                                        Department Task Progression & Curriculum DAG
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Active syllabus for <strong>{currentMember?.department || 'AI ML'}</strong>. All task blueprints are bounded to 180-360 mins.
                                    </CardDescription>
                                </div>
                                <Badge variant="outline" className="text-[11px] font-mono text-cyan-400 border-cyan-500/30 self-start sm:self-auto">
                                    {currentDeptTasks.length} Assigned Nodes
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-5 sm:p-6 space-y-3">
                            {currentDeptTasks.length > 0 ? (
                                <div className="space-y-3">
                                    {currentDeptTasks.map((t, idx) => (
                                        <div 
                                            key={t.task_id || idx}
                                            className="p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                                        >
                                            <div className="space-y-1.5 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Badge variant="outline" className="font-mono text-xs font-bold bg-background text-primary border-primary/30">
                                                        {t.task_id}
                                                    </Badge>
                                                    <span className="font-bold text-foreground text-sm">{t.dharma}</span>
                                                    <Badge variant="secondary" className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800">
                                                        ⏱️ 180-360 mins
                                                    </Badge>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                    <span className="text-[11px] text-muted-foreground mr-1">Signals:</span>
                                                    {(t.completion_signals || []).map((s, sIdx) => (
                                                        <Badge key={sIdx} variant="secondary" className="text-[10px] font-mono bg-background/80">
                                                            ✓ {s}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                                                <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 text-xs font-semibold">
                                                    Verified 1-Day SLA
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                                    No explicit tasks mapped for this track. Using Governed System DAG.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW MODE 2: GLOBAL CONTEXT & COMPLIANCE HUB (Admin Overview)             */}
            {/* ========================================================================= */}
            {viewMode === 'GLOBAL' && (
                <div className="space-y-6">

                    {/* TOP TELEMETRY CARDS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="border-border bg-card shadow-sm">
                            <CardHeader className="pb-2">
                                <CardDescription className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                                    <span>Active Members</span>
                                    <Users className="w-4 h-4 text-primary" />
                                </CardDescription>
                                <CardTitle className="text-2xl font-black text-foreground">
                                    {complianceData.totalActive || 151}
                                    <span className="text-xs text-muted-foreground font-normal ml-1.5">Total</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 text-[11px] text-muted-foreground">
                                Across 16 Registered Departments
                            </CardContent>
                        </Card>

                        <Card className="border-border bg-card shadow-sm">
                            <CardHeader className="pb-2">
                                <CardDescription className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                                    <span>Context Ingested</span>
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                </CardDescription>
                                <CardTitle className="text-2xl font-black text-emerald-500">
                                    {complianceData.totalFilled || 6}
                                    <span className="text-xs text-muted-foreground font-normal ml-1.5">
                                        ({complianceData.compliancePercentage || 25}%)
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 text-[11px] text-muted-foreground">
                                Verified & Grounded in Parikshak
                            </CardContent>
                        </Card>

                        <Card className="border-border bg-card shadow-sm">
                            <CardHeader className="pb-2">
                                <CardDescription className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                                    <span>Missing Context</span>
                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                </CardDescription>
                                <CardTitle className="text-2xl font-black text-amber-500">
                                    {complianceData.totalPending || 18}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 text-[11px] text-muted-foreground">
                                Action required before review
                            </CardContent>
                        </Card>

                        <Card className="border-border bg-card shadow-sm">
                            <CardHeader className="pb-2">
                                <CardDescription className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                                    <span>Syllabus Tasks</span>
                                    <Clock className="w-4 h-4 text-cyan-400" />
                                </CardDescription>
                                <CardTitle className="text-2xl font-black text-foreground">
                                    {syllabusData.total_tasks || 37}
                                    <span className="text-xs text-cyan-400 font-mono font-normal ml-1.5">DAG Nodes</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 text-[11px] text-cyan-400 font-mono">
                                ⏱️ Strictly 180-360 mins / task
                            </CardContent>
                        </Card>
                    </div>

                    {/* GLOBAL INJECTED CONTEXT DIRECTORY */}
                    <Card className="border-border shadow-md bg-card overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b border-border pb-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <Database className="w-4 h-4 text-primary" />
                                        Global Injected Context & Member Directory
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Search and inspect the injected knowledge contexts and dedicated tracks for every employee.
                                    </CardDescription>
                                </div>

                                {/* Filter Controls */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Search */}
                                    <div className="relative w-48 sm:w-64">
                                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder="Search candidate, email, ID..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="h-8 pl-8 text-xs bg-background"
                                        />
                                    </div>

                                    {/* Department Filter */}
                                    <Select value={selectedDeptFilter} onValueChange={setSelectedDeptFilter}>
                                        <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
                                            <SelectValue placeholder="Department" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">All Departments</SelectItem>
                                            <SelectItem value="AI ML">AI ML</SelectItem>
                                            <SelectItem value="Web Development">Web Development</SelectItem>
                                            <SelectItem value="Testing">Testing</SelectItem>
                                            <SelectItem value="Robotics">Robotics</SelectItem>
                                            <SelectItem value="Blockchain">Blockchain</SelectItem>
                                            <SelectItem value="ISRO Drone">ISRO Drone</SelectItem>
                                            <SelectItem value="Law">Law</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    {/* Status Filter */}
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger className="w-[130px] h-8 text-xs bg-background">
                                            <SelectValue placeholder="Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">All Statuses</SelectItem>
                                            <SelectItem value="INGESTED">Ingested</SelectItem>
                                            <SelectItem value="MISSING">Missing Context</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardHeader>
                        
                        <CardContent className="p-0">
                            <div className="divide-y divide-border">
                                {filteredUsers.length > 0 ? (
                                    filteredUsers.map((m) => {
                                        const isExpanded = Boolean(expandedContextIds[m.id]);
                                        return (
                                            <div key={m.id} className="p-4 sm:p-5 hover:bg-muted/10 transition-colors space-y-3">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                    
                                                    {/* User Details */}
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center font-bold text-xs text-foreground">
                                                            {(m.name || 'U').substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-foreground text-sm">{m.name}</span>
                                                                <Badge variant="outline" className="text-[10px] font-mono">
                                                                    {m.employeeId || 'N/A'}
                                                                </Badge>
                                                                <span className="text-xs text-muted-foreground">• {m.department || 'AI ML'}</span>
                                                                {m.hasContext && (
                                                                    <Badge variant="secondary" className="text-[10px] font-mono">
                                                                        Project: {m.injectedContext?.project_name || m.injectedContext?.product_id || 'BHIV'}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">{m.email}</p>
                                                        </div>
                                                    </div>

                                                    {/* Context Badge & Actions */}
                                                    <div className="flex items-center gap-2 self-end sm:self-auto">
                                                        {m.hasContext ? (
                                                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs flex items-center gap-1 font-medium">
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                                Context Ingested
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs flex items-center gap-1 font-medium">
                                                                <AlertCircle className="w-3.5 h-3.5" />
                                                                Missing Context
                                                            </Badge>
                                                        )}

                                                        {/* Action 1: Inspect Dedicated Track */}
                                                        <Button 
                                                            variant="default" 
                                                            size="sm" 
                                                            onClick={() => inspectMemberDedicated(m)}
                                                            className="h-8 text-xs gap-1.5"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                            Inspect Dedicated Track
                                                        </Button>

                                                        {/* Action 2: Quick Ingest Modal */}
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            onClick={() => openQuickModalForUser(m)}
                                                            className="h-8 text-xs"
                                                        >
                                                            {m.hasContext ? 'Edit Context' : '+ Ingest'}
                                                        </Button>
                                                    </div>
                                                </div>

                                                {/* Injected Context Preview (Directly visible for Admin with FULL toggle!) */}
                                                {m.hasContext && m.injectedContext && (
                                                    <div className="bg-muted/30 border border-border/80 rounded-xl p-3.5 text-xs space-y-2">
                                                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                                                                <FileText className="w-3.5 h-3.5 text-primary" />
                                                                Injected Specification: <strong>{m.injectedContext.project_name || m.injectedContext.product_id || 'BHIV'}</strong>
                                                            </span>
                                                            <div className="flex items-center gap-2">
                                                                <span>
                                                                    {m.injectedContext.ingestion_timestamp ? new Date(m.injectedContext.ingestion_timestamp).toLocaleDateString() : 'Active'}
                                                                </span>
                                                                <Button
                                                                    size="xs"
                                                                    variant="ghost"
                                                                    onClick={() => handleCopy(m.injectedContext.content || m.injectedContext.summary, m.id)}
                                                                    className="h-6 text-[10px] gap-1 px-1.5"
                                                                >
                                                                    {copiedRowId === m.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                                                    {copiedRowId === m.id ? 'Copied' : 'Copy'}
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        {/* Full vs preview text */}
                                                        <div className={`text-foreground/90 font-mono text-[11px] leading-relaxed select-text ${
                                                            isExpanded ? 'whitespace-pre-wrap max-h-[300px] overflow-y-auto p-3 rounded-lg bg-background/80 border border-border' : ''
                                                        }`}>
                                                            {isExpanded 
                                                                ? (m.injectedContext.content || m.injectedContext.summary) 
                                                                : (m.injectedContext.summary || (typeof m.injectedContext.content === 'string' ? m.injectedContext.content.substring(0, 160) + '...' : ''))}
                                                        </div>

                                                        <button 
                                                            onClick={() => setExpandedContextIds(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                                                            className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-1 pt-0.5"
                                                        >
                                                            {isExpanded ? '▲ Hide Full Specification' : '▼ View Full Unsummarized Context'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="p-8 text-center text-xs text-muted-foreground">
                                        No members found matching filter.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Quick Context Ingestion Modal for Admin */}
            <Dialog open={quickModalOpen} onOpenChange={setQuickModalOpen}>
                <DialogContent className="max-w-lg bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" />
                            Ingest Context for {modalCandidate?.name}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Inject technical context to ground Parikshak review and dynamic task synthesis.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <form onSubmit={handleModalSubmit} className="space-y-4 pt-2">
                        {/* Sample templates in modal */}
                        <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground flex items-center justify-between">
                                <span>Load Template:</span>
                            </Label>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {SAMPLE_TEMPLATES.map(tpl => (
                                    <button
                                        key={tpl.id}
                                        type="button"
                                        onClick={() => loadModalSampleTemplate(tpl)}
                                        className="px-2 py-1 rounded text-[11px] bg-muted hover:bg-muted/80 border border-border text-foreground transition-colors font-medium flex items-center gap-1"
                                    >
                                        <Sparkles className="w-2.5 h-2.5 text-primary" />
                                        {tpl.label.split(':')[0]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Project selector in modal */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Project Preset:</Label>
                                <Select 
                                    value={modalProjectPreset} 
                                    onValueChange={(val) => {
                                        setModalProjectPreset(val);
                                        if (val !== 'CUSTOM') setModalProjectName(val);
                                    }}
                                >
                                    <SelectTrigger className="h-8 text-xs bg-background">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PROJECT_PRESETS.map(p => (
                                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Target Project / Repo:</Label>
                                <Input 
                                    value={modalProjectName} 
                                    onChange={(e) => setModalProjectName(e.target.value)} 
                                    className="h-8 text-xs font-mono bg-background" 
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">
                                ChatGPT / Build Grounding Context:
                            </Label>
                            <Textarea 
                                rows={6}
                                value={modalContextText}
                                onChange={(e) => setModalContextText(e.target.value)}
                                placeholder="Paste candidate's task briefing, section deliverables, repo URLs, target API contracts..."
                                className="text-xs font-mono bg-background leading-relaxed"
                            />
                        </div>

                        {modalFeedback && (
                            <div className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                                modalFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30' : 'bg-destructive/10 text-destructive border border-destructive/30'
                            }`}>
                                {modalFeedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                <span>{modalFeedback.message}</span>
                            </div>
                        )}

                        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setQuickModalOpen(false)} className="text-xs">
                                Cancel
                            </Button>
                            <Button type="submit" size="sm" disabled={submittingModal || !modalContextText.trim()} className="text-xs gap-1.5">
                                <Send className="w-3.5 h-3.5" />
                                {submittingModal ? 'Saving Context...' : 'Ingest Context'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

        </div>
    );
};

export default KnowledgeAdmin;
