import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { 
    Tablet, Database, CheckCircle2, AlertCircle, FileText, Send, 
    Sparkles, Layers, ShieldCheck, RefreshCw, UserCheck, BookOpen, 
    Search, Bot, ArrowRight, Play, CheckCircle, Code, User
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const KnowledgeAdmin = () => {
    // Access authenticated user context from Niyantran
    const { user } = useAuth();

    // Determine default author name from user object or fallback storage
    const getInitialUserName = () => {
        if (user?.name) return user.name;
        try {
            const storedUser = localStorage.getItem('user') || localStorage.getItem('WorkflowUser');
            if (storedUser) {
                const parsed = JSON.parse(storedUser);
                if (parsed.name) return parsed.name;
            }
        } catch (e) {}
        return localStorage.getItem('userName') || 'Niyantran User';
    };

    const [productId, setProductId] = useState('BHIV');
    const [individualId, setIndividualId] = useState(getInitialUserName());
    const [datasetType, setDatasetType] = useState('product_knowledge');
    const [source, setSource] = useState('');
    const [provenance, setProvenance] = useState('');
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [response, setResponse] = useState(null);
    const [error, setError] = useState(null);
    const [datasets, setDatasets] = useState([]);
    const [loadingDatasets, setLoadingDatasets] = useState(false);

    // Synchronize individualId when logged-in user state resolves
    useEffect(() => {
        if (user?.name) {
            setIndividualId(user.name);
        }
    }, [user]);

    // AI Agent 8-Point Query State
    const [agentRepoUrl, setAgentRepoUrl] = useState('');
    const [agentTaskId, setAgentTaskId] = useState('');
    const [queryingDb, setQueryingDb] = useState(false);
    const [dbQueryResult, setDbQueryResult] = useState(null);
    const [runningIntake, setRunningIntake] = useState(false);
    const [intakeResult, setIntakeResult] = useState(null);

    const getAuthHeaders = () => {
        const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
        return {
            'x-auth-token': token,
            'Authorization': `Bearer ${token}`
        };
    };

    // Fetch existing ingested datasets from Parikshak API via proxy
    const fetchDatasets = async () => {
        setLoadingDatasets(true);
        try {
            const res = await axios.get(`${API_URL}/knowledge/datasets`, {
                headers: getAuthHeaders()
            });
            if (res.data) {
                setDatasets(res.data.datasets || []);
            }
        } catch (err) {
            console.error('Failed to load datasets:', err);
        } finally {
            setLoadingDatasets(false);
        }
    };

    useEffect(() => {
        fetchDatasets();
    }, []);

    // Query DB for Top 4 Knowledge Items
    const handleQueryDb = async () => {
        setQueryingDb(true);
        setError(null);
        try {
            const res = await axios.get(`${API_URL}/knowledge/query-8-points`, {
                headers: getAuthHeaders(),
                params: {
                    product_id: productId,
                    candidate_name: individualId || user?.name
                }
            });
            if (res.data) {
                setDbQueryResult(res.data);
            }
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Error querying database');
        } finally {
            setQueryingDb(false);
        }
    };

    // Run 8-point autonomous AI intake
    const handleRunAutoIntake = async () => {
        setRunningIntake(true);
        setError(null);
        setIntakeResult(null);
        try {
            const payload = {
                repository_url_or_path: agentRepoUrl,
                task_id_or_title: agentTaskId,
                candidate_name: individualId || user?.name || 'Niyantran User',
                product_id: productId
            };
            const res = await axios.post(`${API_URL}/knowledge/auto-intake`, payload, {
                headers: getAuthHeaders()
            });
            setIntakeResult(res.data);
            fetchDatasets();
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Error running autonomous intake');
        } finally {
            setRunningIntake(false);
        }
    };

    const handleIngest = async (e) => {
        if (e) e.preventDefault();
        if (!content.trim()) {
            setError('Please paste ChatGPT transcript, markdown, or structured JSON content.');
            return;
        }

        setSubmitting(true);
        setError(null);
        setResponse(null);

        try {
            let parsedContent = content.trim();
            try {
                if (parsedContent.startsWith('{') || parsedContent.startsWith('[')) {
                    parsedContent = JSON.parse(parsedContent);
                }
            } catch (pErr) {
                // Keep as raw text
            }

            const payload = {
                product_id: productId,
                individual_id: (individualId || user?.name || '').trim() || 'Niyantran User',
                dataset_type: datasetType,
                content: parsedContent,
                source: source.trim() || 'Niyantran-User-Ingest',
                provenance: provenance.trim() || `niyantran-session-${productId.toLowerCase()}`,
                version: 'v1.0'
            };

            const res = await axios.post(`${API_URL}/knowledge/ingest`, payload, {
                headers: getAuthHeaders()
            });

            setResponse(res.data);
            setContent('');
            fetchDatasets();
            handleQueryDb();
        } catch (err) {
            setError(err.response?.data?.detail || err.response?.data?.message || err.message || 'Error ingesting knowledge dataset');
        } finally {
            setSubmitting(false);
        }
    };

    const loadSampleForType = (type) => {
        setDatasetType(type);
        const activeName = individualId || user?.name || 'Niyantran User';
        if (type === 'product_knowledge') {
            setContent(`PRODUCT KNOWLEDGE (PKB-001)
Product: ${productId}
Author: ${activeName}
Title: Core Governed Task Engine Invariants
Domain: Niyantran Task Workflow System
Key Standards:
1. Append-only event journaling for all review decisions.
2. Single-writer concurrency lock on evaluation persistent store.
3. Cryptographic envelope validation for all candidate submissions.`);
        } else if (type === 'architecture_decision') {
            setContent(`PRODUCT ARCHITECTURE DECISION (ADR-009)
Product: ${productId}
Author: ${activeName}
Title: Direct Integration with Parikshak RAG Engine
Context: Niyantran delegates knowledge governance directly to Parikshak without local database mutations.
Decision: All users submit knowledge directly through Express API proxy to Parikshak canonical store.
Status: APPROVED`);
        } else if (type === 'canonical_decision') {
            setContent(`CANONICAL GOVERNANCE DECISION (CGD-004)
Product: ${productId}
Author: ${activeName}
Policy: Mandatory AST & Assertion Verification
Rule: Candidates must provide passing unit test suites and architectural proofs in REVIEW_PACKET.md.
Validation: Automated scoring engine deducts 30 points if tests or AST validation fails.`);
        } else if (type === 'individual_context') {
            setContent(`INDIVIDUAL CONTEXT & TRACK RECORD (IND-001)
Individual / Contributor: ${activeName}
Product: ${productId}
Track Record: Senior Engineer in Niyantran ecosystem focusing on deterministic workflow engines, micro-service orchestration, and automated evaluation engines.
Strengths: Modular code design, clean test coverage, zero runtime memory leaks.
Past Tasks Completed: T-GOV-001 (Deterministic Execution Core).`);
        } else {
            setContent(`# REVIEW PACKET — ${productId}
Candidate: ${activeName}
Task: ${agentTaskId || 'T-GOV-001'}
Architecture verified. Test assertions passing.`);
        }
    };

    const charCount = content.length;
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

    return (
        <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-7xl animate-in fade-in duration-300 pt-2">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
                <div className="flex items-center gap-3.5">
                    <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-2xl text-cyan-500 shadow-sm shrink-0">
                        <Tablet size={28} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl font-black tracking-tight text-foreground">
                                Governed Knowledge Administration
                            </h1>
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-bold rounded-full px-3">
                                Direct Parikshak Sync
                            </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs sm:text-sm mt-1 flex items-center gap-2 flex-wrap">
                            <span>Ingestion portal for ChatGPT transcripts, product specs & architectural context</span>
                            <span className="hidden sm:inline">•</span>
                            <span className="text-cyan-600 dark:text-cyan-400 font-semibold flex items-center gap-1">
                                <User size={13} /> Logged in as: {user?.name || getInitialUserName()}
                            </span>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        onClick={fetchDatasets}
                        variant="outline"
                        size="sm"
                        className="text-xs font-bold flex items-center gap-2 border-border shadow-sm hover:bg-muted"
                    >
                        <RefreshCw size={14} className={loadingDatasets ? "animate-spin" : ""} />
                        Refresh Datasets
                    </Button>
                </div>
            </div>

            {/* AI Autonomous Intake & 8-Point Query Room */}
            <Card className="border-cyan-500/30 shadow-xl overflow-hidden relative bg-card">
                <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

                <CardHeader className="bg-gradient-to-r from-cyan-500/10 via-primary/5 to-transparent border-b border-border/80 pb-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-500 shrink-0">
                                <Bot size={22} />
                            </div>
                            <div>
                                <CardTitle className="text-base font-black flex items-center gap-2 text-foreground">
                                    Autonomous AI Intake & DB Agent Room
                                    <Badge variant="outline" className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 text-[10px] font-mono font-bold">
                                        8-POINT GOVERNANCE
                                    </Badge>
                                </CardTitle>
                                <CardDescription className="text-xs mt-0.5 text-muted-foreground">
                                    Queries Parikshak Governed DB (Top 4) and extracts GitHub repository evidence (Bottom 4).
                                </CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleQueryDb}
                                disabled={queryingDb}
                                className="text-xs font-bold text-cyan-600 dark:text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10 flex items-center gap-2"
                            >
                                <Search size={14} className={queryingDb ? "animate-spin" : ""} />
                                {queryingDb ? 'Querying DB...' : 'Query Governed DB (Top 4)'}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleRunAutoIntake}
                                disabled={runningIntake}
                                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-md"
                            >
                                <Play size={14} className={runningIntake ? "animate-spin" : ""} />
                                {runningIntake ? 'Executing Auto-Intake...' : 'Run 8-Point Auto-Intake'}
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-5 space-y-5">
                    {/* Input Fields for Auto-Intake */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                                Target Product / Build
                            </Label>
                            <Select value={productId} onValueChange={(val) => setProductId(val)}>
                                <SelectTrigger className="font-bold text-xs bg-background border-input">
                                    <SelectValue placeholder="Select product" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BHIV">BHIV</SelectItem>
                                    <SelectItem value="PARIKSHAK">PARIKSHAK</SelectItem>
                                    <SelectItem value="NIYANTRAN">NIYANTRAN</SelectItem>
                                    <SelectItem value="TANTRA">TANTRA</SelectItem>
                                    <SelectItem value="MDU">MDU</SelectItem>
                                    <SelectItem value="SETU">SETU</SelectItem>
                                    <SelectItem value="SAARTHI">SAARTHI</SelectItem>
                                    <SelectItem value="PRAVAH">PRAVAH</SelectItem>
                                    <SelectItem value="VAANI">VAANI</SelectItem>
                                    <SelectItem value="AIAIC">AIAIC</SelectItem>
                                    <SelectItem value="CYBER">CYBER</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block truncate">
                                Logged-in User Name
                            </Label>
                            <div className="relative">
                                <Input
                                    type="text"
                                    value={individualId}
                                    onChange={(e) => setIndividualId(e.target.value)}
                                    placeholder="Logged-in User Name"
                                    className="text-xs font-bold pl-8 bg-background border-cyan-500/40 focus:border-cyan-500"
                                />
                                <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-cyan-500" />
                            </div>
                        </div>

                        <div>
                            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block truncate">
                                GitHub Repo URL / Path
                            </Label>
                            <Input
                                type="text"
                                value={agentRepoUrl}
                                onChange={(e) => setAgentRepoUrl(e.target.value)}
                                placeholder="https://github.com/org/repo"
                                className="text-xs font-mono bg-background border-input"
                            />
                        </div>

                        <div>
                            <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block truncate">
                                Task ID or Title
                            </Label>
                            <Input
                                type="text"
                                value={agentTaskId}
                                onChange={(e) => setAgentTaskId(e.target.value)}
                                placeholder="e.g. T-GOV-001"
                                className="text-xs font-mono bg-background border-input"
                            />
                        </div>
                    </div>

                    {/* 8-Point Status Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Top 4 from DB */}
                        <div className="bg-muted/40 border border-yellow-500/20 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-border/60 pb-2">
                                <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Database size={14} />
                                    1-4. Governed Knowledge (Parikshak DB)
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">Canonical Store</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div className="bg-background p-2.5 rounded-lg border border-border flex items-center justify-between">
                                    <span className="text-foreground text-[11px]">1. Product Knowledge</span>
                                    {dbQueryResult?.top_4_governed_db?.product_knowledge?.found ? (
                                        <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">FOUND</Badge>
                                    ) : (
                                        <Button size="xs" variant="outline" onClick={() => loadSampleForType('product_knowledge')} className="text-[10px] h-6 px-2 text-yellow-600 border-yellow-500/30">
                                            + INGEST
                                        </Button>
                                    )}
                                </div>
                                <div className="bg-background p-2.5 rounded-lg border border-border flex items-center justify-between">
                                    <span className="text-foreground text-[11px]">2. Architecture Decisions</span>
                                    {dbQueryResult?.top_4_governed_db?.architecture_decisions?.found ? (
                                        <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">FOUND</Badge>
                                    ) : (
                                        <Button size="xs" variant="outline" onClick={() => loadSampleForType('architecture_decision')} className="text-[10px] h-6 px-2 text-yellow-600 border-yellow-500/30">
                                            + INGEST
                                        </Button>
                                    )}
                                </div>
                                <div className="bg-background p-2.5 rounded-lg border border-border flex items-center justify-between">
                                    <span className="text-foreground text-[11px]">3. Canonical Decisions</span>
                                    {dbQueryResult?.top_4_governed_db?.canonical_decisions?.found ? (
                                        <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">FOUND</Badge>
                                    ) : (
                                        <Button size="xs" variant="outline" onClick={() => loadSampleForType('canonical_decision')} className="text-[10px] h-6 px-2 text-yellow-600 border-yellow-500/30">
                                            + INGEST
                                        </Button>
                                    )}
                                </div>
                                <div className="bg-background p-2.5 rounded-lg border border-border flex items-center justify-between">
                                    <span className="text-foreground text-[11px]">4. Individual Context</span>
                                    {dbQueryResult?.top_4_governed_db?.individual_context?.found ? (
                                        <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">FOUND</Badge>
                                    ) : (
                                        <Button size="xs" variant="outline" onClick={() => loadSampleForType('individual_context')} className="text-[10px] h-6 px-2 text-yellow-600 border-yellow-500/30">
                                            + INGEST
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Bottom 4 from Task & Repo */}
                        <div className="bg-muted/40 border border-cyan-500/20 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-border/60 pb-2">
                                <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Code size={14} />
                                    5-8. Task & Repo Evidence (GitHub)
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">Automated AI Harvester</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div className="bg-background p-2.5 rounded-lg border border-border flex items-center justify-between">
                                    <span className="text-foreground text-[11px]">5. REVIEW_PACKET</span>
                                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20 text-[10px]">AUTO HARVEST</Badge>
                                </div>
                                <div className="bg-background p-2.5 rounded-lg border border-border flex items-center justify-between">
                                    <span className="text-foreground text-[11px]">6. CODE_PACKET</span>
                                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20 text-[10px]">AUTO HARVEST</Badge>
                                </div>
                                <div className="bg-background p-2.5 rounded-lg border border-border flex items-center justify-between">
                                    <span className="text-foreground text-[11px]">7. Runtime Evidence</span>
                                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20 text-[10px]">ASSERTIONS</Badge>
                                </div>
                                <div className="bg-background p-2.5 rounded-lg border border-border flex items-center justify-between">
                                    <span className="text-foreground text-[11px]">8. Dependencies & Gaps</span>
                                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20 text-[10px]">GAP ANALYZER</Badge>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Auto-Intake Execution Result Banner */}
                    {intakeResult && (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                                    <CheckCircle size={18} />
                                    <span>Autonomous 8-Point Review Complete (Score: {intakeResult.evaluation?.score}/100 — {intakeResult.evaluation?.evaluation_result})</span>
                                </div>
                                <p className="text-muted-foreground text-xs font-mono">
                                    Next Task: <span className="text-foreground font-bold">{intakeResult.next_task_packet?.task_id}: {intakeResult.next_task_packet?.title}</span>
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Ingestion Form & History Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Card */}
                <Card className="lg:col-span-2 shadow-xl border-l-4 border-l-emerald-500 bg-card">
                    <CardHeader className="bg-muted/20 pb-4 border-b border-border">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                    <Database size={18} />
                                </div>
                                <div>
                                    <CardTitle className="text-lg font-bold text-foreground">Ingest Knowledge Dataset to Parikshak</CardTitle>
                                    <CardDescription className="text-xs">Direct Parikshak API ingestion gateway</CardDescription>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => loadSampleForType(datasetType)}
                                className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 border-emerald-500/30 hover:bg-emerald-500/10"
                            >
                                <Sparkles size={13} />
                                Load Sample Text
                            </Button>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-6 space-y-6">
                        <form onSubmit={handleIngest} className="space-y-5">
                            {/* Selectors Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <Label className="text-xs font-bold uppercase tracking-wider mb-2 block text-foreground">
                                        Product / Build ID
                                    </Label>
                                    <Select value={productId} onValueChange={(val) => setProductId(val)}>
                                        <SelectTrigger className="font-bold text-sm bg-background border-input">
                                            <SelectValue placeholder="Select product" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BHIV">BHIV</SelectItem>
                                            <SelectItem value="PARIKSHAK">PARIKSHAK</SelectItem>
                                            <SelectItem value="NIYANTRAN">NIYANTRAN</SelectItem>
                                            <SelectItem value="TANTRA">TANTRA</SelectItem>
                                            <SelectItem value="MDU">MDU</SelectItem>
                                            <SelectItem value="SETU">SETU</SelectItem>
                                            <SelectItem value="SAARTHI">SAARTHI</SelectItem>
                                            <SelectItem value="PRAVAH">PRAVAH</SelectItem>
                                            <SelectItem value="VAANI">VAANI</SelectItem>
                                            <SelectItem value="AIAIC">AIAIC</SelectItem>
                                            <SelectItem value="CYBER">CYBER</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label className="text-xs font-bold uppercase tracking-wider mb-2 block text-foreground truncate">
                                        Logged-in Author
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            type="text"
                                            value={individualId}
                                            onChange={(e) => setIndividualId(e.target.value)}
                                            placeholder="Logged-in User Name"
                                            className="font-bold text-sm pl-8 bg-background border-primary/30"
                                            required
                                        />
                                        <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary" />
                                    </div>
                                </div>

                                <div>
                                    <Label className="text-xs font-bold uppercase tracking-wider mb-2 block text-foreground">
                                        Dataset Type (8 Points)
                                    </Label>
                                    <Select value={datasetType} onValueChange={(val) => setDatasetType(val)}>
                                        <SelectTrigger className="font-bold text-sm bg-background border-input">
                                            <SelectValue placeholder="Select dataset type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="product_knowledge">1. Product Knowledge</SelectItem>
                                            <SelectItem value="architecture_decision">2. Architecture Decision</SelectItem>
                                            <SelectItem value="canonical_decision">3. Canonical Decision</SelectItem>
                                            <SelectItem value="individual_context">4. Individual Context</SelectItem>
                                            <SelectItem value="review_packet">5. Review Packet</SelectItem>
                                            <SelectItem value="code_packet">6. Code Packet</SelectItem>
                                            <SelectItem value="evidence">7. Runtime Evidence</SelectItem>
                                            <SelectItem value="dependencies">8. Dependencies & Gaps</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Provenance & Source */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-xs font-bold uppercase tracking-wider mb-2 block text-foreground">
                                        Source Tag
                                    </Label>
                                    <Input
                                        type="text"
                                        value={source}
                                        onChange={(e) => setSource(e.target.value)}
                                        placeholder="e.g. Niyantran-User-Ingest"
                                        className="font-mono text-xs bg-background border-input"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs font-bold uppercase tracking-wider mb-2 block text-foreground">
                                        Provenance Lineage Ref
                                    </Label>
                                    <Input
                                        type="text"
                                        value={provenance}
                                        onChange={(e) => setProvenance(e.target.value)}
                                        placeholder="e.g. niyantran-user-session-bhiv"
                                        className="font-mono text-xs bg-background border-input"
                                    />
                                </div>
                            </div>

                            {/* Text Area for ChatGPT Copy-Paste */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-foreground">
                                        Paste ChatGPT Transcript or Structured Content
                                    </Label>
                                    <span className="text-xs text-muted-foreground font-mono">
                                        {wordCount} words | {charCount} chars
                                    </span>
                                </div>
                                <Textarea
                                    rows={9}
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="Paste raw markdown, ChatGPT transcript, or architectural specification text here..."
                                    className="font-mono text-sm leading-relaxed p-4 bg-background border-input"
                                />
                            </div>

                            {/* Error Banner */}
                            {error && (
                                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex items-center gap-3">
                                    <AlertCircle size={18} className="shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Submit Action to Parikshak */}
                            <div className="space-y-2">
                                <Button
                                    type="submit"
                                    disabled={submitting || !content.trim()}
                                    className="w-full h-12 text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                                >
                                    {submitting ? (
                                        <>
                                            <RefreshCw size={18} className="animate-spin" />
                                            <span>Submitting to Parikshak Governance Engine...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Send size={18} />
                                            <span>Submit Knowledge to Parikshak API</span>
                                        </>
                                    )}
                                </Button>
                                {!content.trim() && (
                                    <p className="text-[11px] text-center text-muted-foreground italic">
                                        Paste transcript text above or click "Load Sample Text" to enable submission to Parikshak.
                                    </p>
                                )}
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Status & Preview Card */}
                <div className="space-y-6">
                    {/* Live Validation Result */}
                    {response ? (
                        <Card className="border-emerald-500/40 bg-emerald-500/5 shadow-xl">
                            <CardHeader className="pb-3 border-b border-emerald-500/20">
                                <CardTitle className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                                    <CheckCircle2 size={18} />
                                    <span>Ingested to Parikshak</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-2 text-xs font-mono text-muted-foreground">
                                <div><span className="text-foreground font-semibold">Dataset ID:</span> <span className="text-emerald-600 dark:text-emerald-400 font-bold">{response.dataset_id}</span></div>
                                <div><span className="text-foreground font-semibold">Product ID:</span> <span className="text-foreground font-bold">{response.product_id}</span></div>
                                <div><span className="text-foreground font-semibold">Author:</span> <span className="text-cyan-600 dark:text-cyan-400 font-bold">{response.individual_id || 'Niyantran User'}</span></div>
                                <div><span className="text-foreground font-semibold">Type:</span> <span className="text-purple-600 dark:text-purple-300">{response.dataset_type}</span></div>
                                <div><span className="text-foreground font-semibold">Version:</span> {response.version}</div>
                                <div><span className="text-foreground font-semibold">Provenance:</span> {response.provenance}</div>
                                <div><span className="text-foreground font-semibold">Trace ID:</span> {response.trace_id}</div>
                                <div><span className="text-foreground font-semibold">Status:</span> <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold ml-1">{response.validation_status}</Badge></div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="shadow-xl bg-card border-border">
                            <CardHeader className="pb-3 border-b border-border">
                                <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                                    <ShieldCheck size={16} className="text-emerald-500" />
                                    Direct Parikshak Integration
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-2 text-xs text-muted-foreground">
                                <p>Submitting this form proxies payload directly to Parikshak's ingestion engine (`/api/v1/knowledge/ingest`).</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>Zero local database storage in Niyantran.</li>
                                    <li>Parikshak Product Knowledge Base updates dynamically upon submission.</li>
                                    <li>Stores trace ID, version tag, and ingestion provenance.</li>
                                </ul>
                            </CardContent>
                        </Card>
                    )}

                    {/* Summary Info */}
                    <Card className="shadow-xl bg-card border-border">
                        <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                                <BookOpen size={16} className="text-purple-500" />
                                Ingested Datasets in Parikshak ({datasets.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {datasets.length === 0 ? (
                                <p className="text-muted-foreground text-xs italic">No datasets ingested yet.</p>
                            ) : (
                                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                    {datasets.slice(0, 8).map((ds, idx) => (
                                        <div key={idx} className="bg-muted/40 border border-border p-3 rounded-xl text-xs space-y-1">
                                            <div className="flex items-center justify-between font-bold text-foreground">
                                                <span className="text-primary">{ds.product_id}</span>
                                                <span className="text-muted-foreground font-mono text-[10px]">{ds.version}</span>
                                            </div>
                                            <div className="text-purple-600 dark:text-purple-300 text-[11px] capitalize">{ds.dataset_type}</div>
                                            {ds.individual_id && (
                                                <div className="text-muted-foreground text-[11px] flex items-center gap-1 font-medium">
                                                    <UserCheck size={12} className="text-primary shrink-0" />
                                                    <span>{ds.individual_id}</span>
                                                </div>
                                            )}
                                            <div className="text-muted-foreground text-[11px] truncate">{ds.extracted_summary}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default KnowledgeAdmin;
