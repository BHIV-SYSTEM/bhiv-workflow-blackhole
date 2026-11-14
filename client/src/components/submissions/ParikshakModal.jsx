import React, { useState, useEffect } from 'react';
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { 
  Sparkles, 
  Cpu, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  ThumbsUp, 
  Lightbulb, 
  Rocket, 
  X, 
  ShieldCheck,
  RefreshCw,
  Edit3,
  Loader2
} from "lucide-react";

const ParikshakModal = ({ 
  isOpen, 
  onClose, 
  loading, 
  evaluationData, 
  onApproveAndAssign, 
  onReject 
}) => {
  const [nextTitle, setNextTitle] = useState("");
  const [nextDesc, setNextDesc] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (evaluationData?.nextTask) {
      setNextTitle(evaluationData.nextTask.title || "");
      setNextDesc(evaluationData.nextTask.description || "");
      setPriority(evaluationData.nextTask.priority || "Medium");
    }
  }, [evaluationData]);

  if (!isOpen) return null;

  const isOffline = evaluationData?.isOffline || evaluationData?.result === "OFFLINE";
  const isPass = !isOffline && (evaluationData?.result === "PASS" || evaluationData?.status === "PASS");
  const score = evaluationData?.score !== undefined && evaluationData?.score !== null ? evaluationData.score : null;

  const handleConfirmApproval = async () => {
    setSubmitting(true);
    try {
      await onApproveAndAssign({
        evaluationData,
        customNextTask: {
          title: nextTitle,
          description: nextDesc,
          masterPrompt: evaluationData?.nextTask?.masterPrompt || evaluationData?.nextTask?.notes || "",
          notes: evaluationData?.nextTask?.notes || evaluationData?.nextTask?.masterPrompt || "",
          deliverables: evaluationData?.nextTask?.deliverables || [],
          acceptanceCriteria: evaluationData?.nextTask?.acceptanceCriteria || [],
          priority: priority
        }
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-card text-foreground w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-border/70 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/60 flex justify-between items-center bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl shadow-md">
              <Cpu size={22} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-foreground">Parikshak Evaluation & Next Task</h2>
                <Badge className={`text-[10px] uppercase font-bold ${isOffline ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40' : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/40'}`}>
                  {isOffline ? 'Service Offline' : 'AI Review'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {isOffline ? 'Parikshak AI service is offline. Please review candidate submission manually.' : 'Evaluation results & proposed follow-up task assignment for candidate'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={loading || submitting}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">

          {/* Loading State */}
          {loading ? (
            <div className="py-14 text-center space-y-4">
              <div className="inline-flex items-center justify-center relative p-3 bg-indigo-500/15 rounded-full border border-indigo-500/30 shadow-inner">
                <Loader2 className="h-12 w-12 text-indigo-500 animate-spin" />
                <Sparkles className="absolute inset-0 m-auto text-purple-400 animate-pulse" size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-foreground">Running Parikshak Evaluation Engine...</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Parsing deliverables, running deterministic checks, and generating recommended Next Task for candidate...
                </p>
              </div>
            </div>
          ) : isOffline ? (
            /* Clean Offline State - ONLY Show Alert Warning */
            <div className="py-8 px-6 bg-muted/40 rounded-2xl border border-amber-500/30 text-center space-y-4 shadow-sm">
              <div className="inline-flex items-center justify-center p-3 bg-amber-500/15 rounded-2xl border border-amber-500/30 text-amber-500">
                <AlertTriangle size={32} />
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h3 className="text-lg font-bold text-foreground">Parikshak AI Review Engine is Offline</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The automated evaluation service is currently unreachable. AI scoring, failure reasons, recommendations, and next-task proposals are unavailable.
                </p>
                <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 text-amber-700 dark:text-amber-200 text-xs font-medium">
                  Candidate: <strong className="text-foreground">{evaluationData?.assigneeName || "Employee"}</strong> • Manual admin review is required.
                </div>
              </div>
            </div>
          ) : evaluationData ? (
            /* Online State - Show All AI Evaluation Details */
            <>
              {/* Evaluation Header Stats */}
              <div className="flex items-center justify-between p-4 bg-muted/40 rounded-xl border border-border/60">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${
                    isPass ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' :
                    'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  }`}>
                    {isPass ? <CheckCircle size={22} /> : <AlertTriangle size={22} />}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Evaluation Verdict</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-black text-sm uppercase ${isPass ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {evaluationData.result || "PASS"}
                      </span>
                      <span className="text-xs text-muted-foreground">• Candidate: <strong className="text-foreground">{evaluationData.assigneeName || "Employee"}</strong></span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Deterministic Score</span>
                  <span className={`text-xl font-black tabular-nums ${isPass ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {score !== null ? `${score}/100` : "N/A"}
                  </span>
                </div>
              </div>

              {/* What was done well */}
              {evaluationData.doneWell && (
                <div className="bg-emerald-500/10 rounded-xl p-3.5 border border-emerald-500/25">
                  <div className="flex items-center gap-2 mb-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                    <ThumbsUp className="h-4 w-4" />
                    <span>What was done well</span>
                  </div>
                  <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {evaluationData.doneWell}
                  </p>
                </div>
              )}

              {/* Missing work / Recommendations */}
              {evaluationData.missingWork && evaluationData.missingWork !== "None" && (
                <div className="bg-amber-500/10 rounded-xl p-3.5 border border-amber-500/25">
                  <div className="flex items-center gap-2 mb-1.5 text-amber-600 dark:text-amber-400 font-semibold text-xs">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Missing Work / Feedback</span>
                  </div>
                  <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {evaluationData.missingWork}
                  </p>
                </div>
              )}

              {evaluationData.recommendations && (
                <div className="bg-indigo-500/10 rounded-xl p-3.5 border border-indigo-500/25">
                  <div className="flex items-center gap-2 mb-1.5 text-indigo-600 dark:text-indigo-400 font-semibold text-xs">
                    <Lightbulb className="h-4 w-4" />
                    <span>Recommendations & Readiness</span>
                  </div>
                  <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {evaluationData.recommendations}
                  </p>
                </div>
              )}

              <hr className="border-border/60 my-2" />

              {/* Proposed Next Task Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-purple-500" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">Proposed Next Task</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsEditingTask(!isEditingTask)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium transition-colors"
                  >
                    <Edit3 size={13} />
                    {isEditingTask ? "Done Editing" : "Edit Next Task"}
                  </button>
                </div>

                <div className="p-4 bg-muted/40 rounded-xl border border-purple-500/30 space-y-3">
                  {isEditingTask ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Task Title</label>
                        <input 
                          type="text" 
                          value={nextTitle}
                          onChange={(e) => setNextTitle(e.target.value)}
                          className="w-full bg-background/70 border border-border/70 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Description & Requirements</label>
                        <textarea 
                          rows={4}
                          value={nextDesc}
                          onChange={(e) => setNextDesc(e.target.value)}
                          className="w-full bg-background/70 border border-border/70 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Priority</label>
                        <select
                          value={priority}
                          onChange={(e) => setPriority(e.target.value)}
                          className="bg-background/70 border border-border/70 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Urgent">Urgent</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30 text-[10px] uppercase font-bold mb-1">
                            Assignee: {evaluationData.assigneeName || "Employee"}
                          </Badge>
                          <h3 className="text-sm font-black text-foreground">{nextTitle || "Phase 2 Next Task"}</h3>
                        </div>
                        <Badge variant="outline" className="text-[10px] border-border/70 text-muted-foreground">
                          Priority: {priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap bg-card p-3 rounded-lg border border-border/60">
                        {nextDesc}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border/60 bg-muted/40 flex flex-wrap items-center justify-between gap-3">
          {isOffline ? (
            <div className="w-full flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="border-border/70 text-foreground hover:bg-muted text-xs font-semibold px-5 rounded-xl"
              >
                Close
              </Button>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onReject}
                disabled={loading || submitting || !evaluationData}
                className="border-border/70 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 text-xs font-bold rounded-xl"
              >
                Reject Submission
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={loading || submitting}
                  className="border-border/70 text-muted-foreground hover:text-foreground text-xs font-medium rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmApproval}
                  disabled={loading || submitting || !evaluationData}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 px-5"
                >
                  {submitting ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  Approve & Confirm Next Task
                </Button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default ParikshakModal;
