import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Slider } from "../ui/slider";
import {
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Calendar,
  Loader2,
  ExternalLink,
  Award,
  AlertTriangle
} from "lucide-react";
import { useToast } from "../../hooks/use-toast";
import { API_URL } from "@/lib/api";
import { formatDate } from "@/lib/dateFormat";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export function TaskProgressDialog({ open, onOpenChange, task, onProgressSaved }) {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [progressValue, setProgressValue] = useState(task?.progress || 0);
  const [notes, setNotes] = useState("");
  const [blockers, setBlockers] = useState("");
  const [achievements, setAchievements] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (task) {
      setProgressValue(task.progress || 0);
      setNotes("");
      setBlockers("");
      setAchievements("");
    }
  }, [task, open]);

  if (!task) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (isSubmitting) return;

    // Daily progress integrity: all three text sections are mandatory.
    if (!notes.trim()) {
      toast({ title: "Notes required", description: "Please describe today's progress.", variant: "destructive" });
      return;
    }
    if (!achievements.trim()) {
      toast({ title: "Achievements required", description: "Please list today's key achievements.", variant: "destructive" });
      return;
    }
    if (!blockers.trim()) {
      toast({ title: "Blockers required", description: "Enter 'None' if there were no blockers.", variant: "destructive" });
      return;
    }

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem("WorkflowToken");
      const storedUser = JSON.parse(localStorage.getItem("WorkflowUser") || "{}");
      const userId = storedUser?.id || storedUser?._id;

      const payload = {
        user: userId,
        task: task._id,
        progressPercentage: Number(progressValue) || 0,
        notes: notes.trim(),
        blockers: blockers.trim(),
        achievements: achievements.trim(),
        date: new Date().toISOString()
      };

      const res = await axios.post(`${API_URL}/progress`, payload, {
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": token
        }
      });

      toast({
        title: "Daily Progress Updated",
        description: `Task '${task.title}' updated to ${progressValue}%. Progress synced in real-time.`,
      });

      if (onProgressSaved) {
        onProgressSaved({
          ...task,
          progress: Number(progressValue),
          status: Number(progressValue) >= 100 ? "Completed" : "In Progress"
        });
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Error saving task progress:", error);
      const msg = error.response?.data?.error 
        || (error.response?.data?.errors && error.response.data.errors[0]?.msg)
        || error.response?.data?.message 
        || "Failed to update daily progress";
      toast({
        title: "Update Failed",
        description: msg,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenFullPage = () => {
    onOpenChange(false);
    navigate(`/progress?taskId=${task._id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[92vh] overflow-y-auto bg-card text-card-foreground border border-border/70 shadow-2xl rounded-2xl p-6">
        <DialogHeader className="space-y-2 border-b border-border/60 pb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/25 text-cyan-600 dark:text-cyan-400">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                  Update Daily Progress
                  {task.task_id && (
                    <Badge variant="outline" className="font-mono text-xs bg-muted/60 text-foreground">
                      {task.task_id}
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {task.title}
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenFullPage}
              className="text-[11px] h-7 gap-1 text-muted-foreground hover:text-primary px-2"
            >
              Full Hub
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-3">
          
          {/* Progress Slider & Due Date */}
          <div className="space-y-2.5 bg-muted/30 p-4 rounded-xl border border-border/60">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <Label className="font-bold text-foreground">Current Progress:</Label>
                <Badge variant="secondary" className="font-mono font-bold text-sm bg-primary/10 text-primary border-primary/20">
                  {progressValue}%
                </Badge>
              </div>
              {task.dueDate && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Due: {formatDate(task.dueDate)}
                </span>
              )}
            </div>

            <Slider
              value={[progressValue]}
              onValueChange={(values) => setProgressValue(values[0])}
              max={100}
              step={1}
              className="py-2 cursor-pointer"
            />

            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>0% (Not Started)</span>
              <span>50% (In Flight)</span>
              <span>100% (Completed)</span>
            </div>
          </div>

          {/* Today's Progress Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="progress-notes" className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              Today&apos;s Progress Notes:
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="progress-notes"
              placeholder="What did you accomplish today on this task? (e.g. implemented authentication flow, fixed webhook handler...)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              required
              aria-required="true"
              className="text-xs bg-background leading-relaxed"
            />
          </div>

          {/* Blockers or Challenges */}
          <div className="space-y-1.5">
            <Label htmlFor="progress-blockers" className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Blockers or Challenges:
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="progress-blockers"
              placeholder="Any issues, dependency blockers, or missing credentials preventing progress? Enter 'None' if there were none."
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              rows={2}
              required
              aria-required="true"
              className="text-xs bg-background leading-relaxed"
            />
          </div>

          {/* Key Achievements */}
          <div className="space-y-1.5">
            <Label htmlFor="progress-achievements" className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Award className="h-3.5 w-3.5 text-cyan-500" />
              Key Achievements:
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="progress-achievements"
              placeholder="Key milestones reached, PRs merged, or test passing proofs..."
              value={achievements}
              onChange={(e) => setAchievements(e.target.value)}
              rows={2}
              required
              aria-required="true"
              className="text-xs bg-background leading-relaxed"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving Daily Progress...
                </>
              ) : (
                <>
                  <TrendingUp className="h-3.5 w-3.5" />
                  Save Daily Progress ({progressValue}%)
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
