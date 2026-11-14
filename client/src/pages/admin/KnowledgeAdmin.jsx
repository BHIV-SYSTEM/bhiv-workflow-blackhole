import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { useSocket } from '@/context/socket-context';
import { 
    User, Users, Sparkles, CheckCircle2, AlertCircle, RefreshCw, 
    Search, ArrowRight, ArrowLeft, BookOpen, Clock, ShieldCheck, 
    Code, FileText, ChevronRight, Eye, Send, Check, X, 
    Filter, Database, Layers, ExternalLink, HelpCircle
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
    DialogTitle
} from '@/components/ui/dialog';

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
    const [inlineProductId, setInlineProductId] = useState('BHIV');
    const [savingInlineContext, setSavingInlineContext] = useState(false);
    const [inlineFeedback, setInlineFeedback] = useState(null);

    // Quick Ingest Modal State (Global Hub)
    const [quickModalOpen, setQuickModalOpen] = useState(false);
    const [modalCandidate, setModalCandidate] = useState(null);
    const [modalContextText, setModalContextText] = useState('');
    const [modalProductId, setModalProductId] = useState('BHIV');
    const [submittingModal, setSubmittingModal] = useState(false);
    const [modalFeedback, setModalFeedback] = useState(null);

    // Expandable context previews in table
    const [expandedContextIds, setExpandedContextIds] = useState({});

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

    // WebSocket real-time listener
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
            const match = complianceData.users.find(u => 
                (u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase()) ||
                (u.name && user.name && u.name.toLowerCase() === user.name.toLowerCase()) ||
                (u.employeeId && user.employeeId && u.employeeId.toUpperCase() === user.employeeId.toUpperCase())
            );
            if (match) return match;
        }

        // Default fallback to logged in user profile
        return {
            id: user?._id || user?.id || 'current-user',
            name: user?.name || 'Current Employee',
            email: user?.email || '',
            employeeId: user?.employeeId || 'BHIV-USR',
            role: user?.role || 'User',
            department: user?.department || 'AI ML',
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

        setSavingInlineContext(true);
        setInlineFeedback(null);
        try {
            const payload = {
                candidateName: currentMember.name,
                employeeId: currentMember.employeeId || '',
                department: currentMember.department || 'AI ML',
                contextText: inlineContextText,
                productId: inlineProductId || currentMember.department || 'BHIV'
            };

            await axios.post(`${API_URL}/knowledge/quick-ingest`, payload, { headers: getAuthHeaders() });
            setInlineFeedback({ type: 'success', message: 'Context successfully injected & verified by Parikshak!' });
            setInlineContextText('');
            await fetchCompliance();
            
            // If in admin preview, update selected member context
            if (selectedMember) {
                setSelectedMember(prev => ({
                    ...prev,
                    hasContext: true,
                    injectedContext: {
                        summary: inlineContextText.substring(0, 300),
                        content: inlineContextText,
                        product_id: inlineProductId,
                        ingestion_timestamp: new Date().toISOString(),
                        version: 'v1.0'
                    }
                }));
            }
        } catch (err) {
            setInlineFeedback({ type: 'error', message: err.response?.data?.detail || 'Failed to inject context.' });
        } finally {
            setSavingInlineContext(false);
        }
    };

    // Handle Quick Modal Open (Global Hub)
    const openQuickModalForUser = (member) => {
        setModalCandidate(member);
        setModalProductId(member.department === 'Web Development' ? 'Niyantran' : 'BHIV');
        setModalContextText(member.injectedContext?.content || '');
        setModalFeedback(null);
        setQuickModalOpen(true);
    };

    // Handle Submit Quick Modal
    const handleModalSubmit = async (e) => {
        e.preventDefault();
        if (!modalCandidate || !modalContextText.trim()) return;

        setSubmittingModal(true);
        setModalFeedback(null);
        try {
            const payload = {
                candidateName: modalCandidate.name,
                employeeId: modalCandidate.employeeId || '',
                department: modalCandidate.department || 'AI ML',
                contextText: modalContextText,
                productId: modalProductId || 'BHIV'
            };

            await axios.post(`${API_URL}/knowledge/quick-ingest`, payload, { headers: getAuthHeaders() });
            setModalFeedback({ type: 'success', message: `Context saved for ${modalCandidate.name}!` });
            setTimeout(() => {
                setQuickModalOpen(false);
                setModalFeedback(null);
            }, 1200);
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
        setInlineContextText('');
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
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            {viewMode === 'GLOBAL'
                                ? 'Admin oversight: Injected contexts across all employees, departments, and Parikshak DAG nodes.'
                                : `Personalized context grounding and canonical syllabus for ${currentMember?.name || 'Employee'}.`}
                        </p>
                    </div>
                </div>

                {/* Admin Mode Switcher Actions */}
                {isAdmin && (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        {viewMode === 'DEDICATED' ? (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={returnToGlobalHub}
                                className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back to Global Overview
                            </Button>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground hidden md:inline">Inspect Member:</span>
                                <Select 
                                    onValueChange={(empId) => {
                                        const m = complianceData.users?.find(u => u.employeeId === empId || u.id === empId);
                                        if (m) inspectMemberDedicated(m);
                                    }}
                                >
                                    <SelectTrigger className="w-[180px] h-9 text-xs bg-card">
                                        <SelectValue placeholder="Jump to User..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(complianceData.users || []).slice(0, 15).map(u => (
                                            <SelectItem key={u.id || u.employeeId} value={u.employeeId || u.id}>
                                                {u.name} ({u.department || 'N/A'})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => { fetchCompliance(); fetchSyllabus(); }}
                            title="Refresh Data"
                            className="h-9 w-9 text-muted-foreground hover:text-foreground"
                        >
                            <RefreshCw className={`w-4 h-4 ${loadingCompliance ? 'animate-spin text-primary' : ''}`} />
                        </Button>
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* VIEW MODE 1: DEDICATED INDIVIDUAL USER VIEW                                */}
            {/* ========================================================================= */}
            {viewMode === 'DEDICATED' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    
                    {/* Admin Inspection Banner (If Admin is viewing someone else) */}
                    {isAdmin && selectedMember && (
                        <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-3 text-xs sm:text-sm">
                            <div className="flex items-center gap-2 text-primary font-medium">
                                <Eye className="w-4 h-4 shrink-0" />
                                <span>
                                    Admin Inspection Mode: Viewing dedicated track for <strong>{selectedMember.name}</strong> ({selectedMember.department || 'AI ML'})
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

                    {/* Member Profile Card */}
                    <Card className="border-border bg-card shadow-sm">
                        <CardContent className="p-5 sm:p-6">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center text-primary font-black text-xl shadow-inner">
                                        {(currentMember.name || 'U').substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="text-xl font-black text-foreground">{currentMember.name}</h2>
                                            <Badge variant="secondary" className="font-mono text-xs">
                                                {currentMember.employeeId || 'BHIV-USR'}
                                            </Badge>
                                            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                                                {currentMember.department || 'AI ML'}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {currentMember.email || 'employee@blackhole.ai'} • Role: {currentMember.role || 'User'} • Mode: {currentMember.workMode || 'WFO'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                                    {currentMember.hasContext ? (
                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5">
                                            <CheckCircle2 className="w-4 h-4" />
                                            Parikshak Context Active
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

                    {/* SECTION 1: INJECTED TECHNICAL CONTEXT */}
                    <Card className="border-border shadow-md bg-card overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b border-border pb-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-primary" />
                                        Injected Technical Context & Briefing
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Grounding data used by Parikshak to evaluate submissions and eliminate "out_of_syllabus" false flags.
                                    </CardDescription>
                                </div>
                                {currentMember.hasContext && (
                                    <Badge variant="outline" className="text-[11px] font-mono border-primary/30 text-primary self-start sm:self-auto">
                                        Version: {currentMember.injectedContext?.version || 'v1.0'}
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-5 sm:p-6 space-y-4">
                            {currentMember.hasContext && currentMember.injectedContext ? (
                                <div className="space-y-4">
                                    <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                                Ingested Knowledge Summary:
                                            </span>
                                            <span className="text-muted-foreground font-mono text-[11px]">
                                                {currentMember.injectedContext.ingestion_timestamp ? new Date(currentMember.injectedContext.ingestion_timestamp).toLocaleString() : 'Active'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-foreground/90 leading-relaxed font-sans bg-background/60 p-3 rounded-lg border border-border/60">
                                            {currentMember.injectedContext.summary || currentMember.injectedContext.content}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                                            <span className="bg-muted px-2 py-0.5 rounded font-mono">Product: {currentMember.injectedContext.product_id || 'BHIV'}</span>
                                            <span className="bg-muted px-2 py-0.5 rounded font-mono">Source: {currentMember.injectedContext.source || 'Knowledge Admin'}</span>
                                        </div>
                                    </div>

                                    {/* Collapsible / Quick Update Section */}
                                    <details className="group border border-border/80 rounded-xl p-4 bg-muted/20">
                                        <summary className="text-xs font-semibold text-primary cursor-pointer hover:underline flex items-center justify-between">
                                            <span>Update or Re-sync Technical Context for {currentMember.name}</span>
                                            <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                                        </summary>
                                        <form onSubmit={handleSaveInlineContext} className="mt-4 space-y-3 pt-3 border-t border-border">
                                            <Textarea 
                                                rows={4}
                                                value={inlineContextText}
                                                onChange={(e) => setInlineContextText(e.target.value)}
                                                placeholder="Paste updated task documentation, ChatGPT prompt context, repository specifics..."
                                                className="text-xs font-mono bg-background"
                                            />
                                            <div className="flex items-center justify-between gap-2">
                                                <Select value={inlineProductId} onValueChange={setInlineProductId}>
                                                    <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="BHIV">Product: BHIV</SelectItem>
                                                        <SelectItem value="Niyantran">Product: Niyantran</SelectItem>
                                                        <SelectItem value="AI ML">Product: AI ML</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Button type="submit" size="sm" disabled={savingInlineContext || !inlineContextText.trim()} className="gap-1.5 h-8 text-xs">
                                                    <Send className="w-3.5 h-3.5" />
                                                    {savingInlineContext ? 'Saving...' : 'Update Context'}
                                                </Button>
                                            </div>
                                        </form>
                                    </details>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                        <div className="text-xs space-y-1">
                                            <p className="font-semibold text-sm">No Technical Context Ingested Yet</p>
                                            <p className="text-muted-foreground">
                                                Without injected context, Parikshak cannot calibrate your submission against your actual department deliverables. Ingest your context below to enable accurate code review and atomic task scoping.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Direct Ingest Form */}
                                    <form onSubmit={handleSaveInlineContext} className="space-y-3 bg-muted/20 p-4 rounded-xl border border-border">
                                        <Label className="text-xs font-bold text-foreground">
                                            Paste Your ChatGPT / Build Specification Context:
                                        </Label>
                                        <Textarea 
                                            rows={5}
                                            value={inlineContextText}
                                            onChange={(e) => setInlineContextText(e.target.value)}
                                            placeholder="Paste your task briefing, deliverables, section requirements (e.g., BHIV vNEXT Section 10 Threat Correlation, repo URLs, target API contracts)..."
                                            className="text-xs font-mono bg-background"
                                        />
                                        <div className="flex items-center justify-between gap-3 pt-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">Target Product:</span>
                                                <Select value={inlineProductId} onValueChange={setInlineProductId}>
                                                    <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="BHIV">BHIV Core</SelectItem>
                                                        <SelectItem value="Niyantran">Niyantran</SelectItem>
                                                        <SelectItem value="AI ML">AI ML</SelectItem>
                                                        <SelectItem value="Blockchain">Blockchain</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Button type="submit" size="sm" disabled={savingInlineContext || !inlineContextText.trim()} className="gap-1.5 text-xs">
                                                <Send className="w-3.5 h-3.5" />
                                                {savingInlineContext ? 'Ingesting Context...' : 'Save & Ingest Context'}
                                            </Button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {inlineFeedback && (
                                <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                                    inlineFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30' : 'bg-destructive/10 text-destructive border border-destructive/30'
                                }`}>
                                    {inlineFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                                    <span>{inlineFeedback.message}</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* SECTION 2: DEDICATED DEPARTMENT CURRICULUM & ACTIVE TASK TRACK */}
                    <Card className="border-border shadow-md bg-card overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b border-border pb-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-primary" />
                                        {currentMember.department || 'AI ML'} Department Curriculum Track
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Strictly calibrated to atomic work units of <strong>180–360 minutes (3 to 6 hours)</strong> with zero multi-day epics.
                                    </CardDescription>
                                </div>
                                <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs font-mono self-start sm:self-auto flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    180-360 mins / task
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-5 sm:p-6 space-y-6">
                            
                            {/* Featured Active / Next Task Card */}
                            {currentDeptTasks.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                                        Current Actionable Task Node:
                                    </div>

                                    {/* Task Card 0 (Active Task) */}
                                    <div className="p-5 rounded-xl border-2 border-primary/30 bg-primary/5 shadow-sm space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono text-xs font-black bg-primary text-primary-foreground px-2.5 py-1 rounded-md">
                                                    {currentDeptTasks[0].task_id}
                                                </span>
                                                <h3 className="font-bold text-foreground text-sm sm:text-base">
                                                    {currentDeptTasks[0].task_id === 'T-AIML-001' ? 'Multi-Signal Threat Correlation Engine' :
                                                     currentDeptTasks[0].task_id === 'T-WEB-001' ? 'Niyantran Real-time UI & WebSocket Sync' :
                                                     currentDeptTasks[0].task_id === 'T-BLC-001' ? 'VAJRA Ledger Proof & Provenance Bridge' :
                                                     'Canonical Task Implementation'}
                                                </h3>
                                            </div>
                                            <Badge variant="outline" className="bg-background text-cyan-400 border-cyan-500/40 text-xs font-mono font-bold flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" />
                                                [180-360 mins]
                                            </Badge>
                                        </div>

                                        <p className="text-xs sm:text-sm text-foreground/90 italic bg-background/50 p-3 rounded-lg border border-border/50">
                                            "{currentDeptTasks[0].dharma || 'Execute assigned engineering deliverables deterministically.'}"
                                        </p>

                                        {/* Completion Signals Parikshak Checks */}
                                        <div className="space-y-2">
                                            <span className="text-[11px] font-bold uppercase text-muted-foreground">
                                                Parikshak Verification Signals:
                                            </span>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                                                {(currentDeptTasks[0].completion_signals || [
                                                    'unit_test_coverage_pass',
                                                    'runtime_proof_evidence_logged',
                                                    'schema_validation_200'
                                                ]).map((sig, idx) => (
                                                    <div key={idx} className="flex items-center gap-2 p-2 rounded-md bg-background/80 border border-border/70 text-foreground/90">
                                                        <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                                                        <span className="truncate">{sig}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Pass / Fail DAG Transition paths */}
                                        <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t border-border/60">
                                            <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                On Pass: {currentDeptTasks[0].next_tasks?.join(', ') || 'Next DAG Node'}
                                            </span>
                                            <span className="flex items-center gap-1.5 text-amber-500 font-medium">
                                                <AlertCircle className="w-3.5 h-3.5" />
                                                On Remediation: {currentDeptTasks[0].failure_tasks?.incorrect_logic?.[0] || 'Remediation Shift'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Department Curriculum Roadmap */}
                                    <div className="pt-4 space-y-3">
                                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                            <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                                            Remaining {currentMember.department || 'AI ML'} Curriculum Nodes:
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {currentDeptTasks.slice(1).map((t, idx) => (
                                                <div key={idx} className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2 hover:border-primary/40 transition-colors">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-mono text-xs font-bold text-primary">{t.task_id}</span>
                                                        <Badge variant="outline" className="text-[10px] font-mono text-cyan-400 border-cyan-500/30">
                                                            180-360 mins
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                                        {t.dharma || 'Core curriculum requirement for department qualification.'}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-xs text-muted-foreground">
                                    Loading department syllabus tasks...
                                </div>
                            )}
                        </CardContent>
                    </Card>

                </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW MODE 2: ADMIN GLOBAL INGESTED CONTEXT HUB                            */}
            {/* ========================================================================= */}
            {viewMode === 'GLOBAL' && isAdmin && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    
                    {/* Top Telemetry Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                                    <div className="relative w-full sm:w-56">
                                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <Input 
                                            placeholder="Search name, ID, dept..."
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
                                            <SelectItem value="INGESTED">Ingested (6)</SelectItem>
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

                                                {/* Injected Context Preview (Directly visible for Admin!) */}
                                                {m.hasContext && m.injectedContext && (
                                                    <div className="bg-muted/30 border border-border/80 rounded-lg p-3 text-xs space-y-1.5">
                                                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                                            <span className="font-semibold text-foreground flex items-center gap-1">
                                                                <FileText className="w-3 h-3 text-primary" />
                                                                Injected Context: {m.injectedContext.product_id || 'BHIV'}
                                                            </span>
                                                            <span>
                                                                {m.injectedContext.ingestion_timestamp ? new Date(m.injectedContext.ingestion_timestamp).toLocaleDateString() : 'Active'}
                                                            </span>
                                                        </div>
                                                        <p className="text-foreground/90 font-mono text-[11px] leading-relaxed">
                                                            {isExpanded 
                                                                ? (m.injectedContext.content || m.injectedContext.summary) 
                                                                : (m.injectedContext.summary || m.injectedContext.content?.substring(0, 160) + '...')}
                                                        </p>
                                                        <button 
                                                            onClick={() => setExpandedContextIds(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                                                            className="text-[11px] text-primary hover:underline font-semibold"
                                                        >
                                                            {isExpanded ? 'Show less' : 'Show full context snippet'}
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

            {/* Quick Context Ingestion Modal */}
            <Dialog open={quickModalOpen} onOpenChange={setQuickModalOpen}>
                <DialogContent className="max-w-md bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" />
                            Ingest Context for {modalCandidate?.name}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Inject technical context to ground Parikshak for this employee.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <form onSubmit={handleModalSubmit} className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <Label className="text-[11px] text-muted-foreground">Department:</Label>
                                <Input disabled value={modalCandidate?.department || 'AI ML'} className="h-8 text-xs bg-muted/40" />
                            </div>
                            <div>
                                <Label className="text-[11px] text-muted-foreground">Target Product:</Label>
                                <Select value={modalProductId} onValueChange={setModalProductId}>
                                    <SelectTrigger className="h-8 text-xs bg-background">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="BHIV">BHIV Core</SelectItem>
                                        <SelectItem value="Niyantran">Niyantran</SelectItem>
                                        <SelectItem value="AI ML">AI ML</SelectItem>
                                        <SelectItem value="Blockchain">Blockchain</SelectItem>
                                        <SelectItem value="Testing">Testing</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label className="text-xs font-semibold">Technical Context / ChatGPT Deliverables:</Label>
                            <Textarea 
                                rows={5}
                                value={modalContextText}
                                onChange={(e) => setModalContextText(e.target.value)}
                                placeholder="Paste candidate's section specifications, threat correlation details, repository scope..."
                                className="text-xs font-mono bg-background mt-1"
                            />
                        </div>

                        {modalFeedback && (
                            <div className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                                modalFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30' : 'bg-destructive/10 text-destructive border border-destructive/30'
                            }`}>
                                {modalFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                                <span>{modalFeedback.message}</span>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                            <Button type="button" variant="outline" size="sm" onClick={() => setQuickModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" size="sm" disabled={submittingModal || !modalContextText.trim()} className="gap-1.5">
                                <Send className="w-3.5 h-3.5" />
                                {submittingModal ? 'Saving...' : 'Save & Activate Context'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

        </div>
    );
};

export default KnowledgeAdmin;
