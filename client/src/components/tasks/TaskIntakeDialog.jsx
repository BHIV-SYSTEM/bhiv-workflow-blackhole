import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Badge } from "../ui/badge";
import { useToast } from "../../hooks/use-toast";
import api from "@/lib/api";
import {
  MessageSquare,
  ShieldAlert,
  Send,
  Sparkles,
  User,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  FileText,
} from "lucide-react";

export function TaskIntakeDialog({ open, onOpenChange, onTaskRegistered }) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    sourceType: "WHATSAPP",
    originatingPerson: "",
    sourceReference: "",
    originalInstruction: "",
    title: "",
    description: "",
    scope: "",
    expectedOutcome: "",
    acceptanceCriteria: "",
    priority: "Medium",
    dueDate: "",
    attachmentUrl: "",
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Smart helper to auto-populate title & scope from pasted raw WhatsApp instruction
  const handleAutoExtract = () => {
    const raw = formData.originalInstruction.trim();
    if (!raw) {
      toast({
        title: "No message entered",
        description: "Please paste the WhatsApp message or lead instruction first.",
        variant: "destructive",
      });
      return;
    }

    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    let extractedTitle = formData.title;
    let extractedScope = formData.scope;
    let extractedCriteria = formData.acceptanceCriteria;
    let extractedPerson = formData.originatingPerson;

    // Check for "TASK:" or "Hi Ishan" or title patterns
    const taskMatch = raw.match(/TASK:\s*([^\n\r]+)/i);
    const bhivMatch = raw.match(/BHIV TASK ASSIGNMENT:\s*([^\n\r]+)/i);
    const objMatch = raw.match(/OBJECTIVE[\s\S]*?(?=\d+\.|\n\n[A-Z]|$)/i);
    const criteriaMatch = raw.match(/ACCEPTANCE CRITERIA[\s\S]*?(?=\n\n[A-Z]|$)/i);
    const senderMatch = raw.match(/(?:from|by|lead|regards|thanks,)\s*([A-Za-z]+)/i);

    if (taskMatch) {
      extractedTitle = taskMatch[1].trim();
    } else if (lines.length > 0) {
      extractedTitle = lines[0].replace(/^[*#\s-]+/, "").slice(0, 80);
    }

    if (objMatch) {
      extractedScope = objMatch[0].replace(/OBJECTIVE\s*/i, "").trim();
    } else {
      extractedScope = lines.slice(1, 4).join(" ");
    }

    if (criteriaMatch) {
      extractedCriteria = criteriaMatch[0].replace(/ACCEPTANCE CRITERIA\s*/i, "").trim();
    }

    if (!extractedPerson && senderMatch) {
      extractedPerson = senderMatch[1].trim();
    }

    setFormData((prev) => ({
      ...prev,
      title: extractedTitle || prev.title,
      scope: extractedScope || prev.scope,
      acceptanceCriteria: extractedCriteria || prev.acceptanceCriteria,
      originatingPerson: extractedPerson || prev.originatingPerson,
      description: prev.description || raw.slice(0, 500),
    }));

    toast({
      title: "Extracted fields",
      description: "Auto-populated title, scope, and acceptance criteria from instruction.",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.originalInstruction.trim()) {
      toast({
        title: "Instruction Required",
        description: "Please paste the original WhatsApp message or instruction to preserve provenance.",
        variant: "destructive",
      });
      return;
    }
    if (!formData.title.trim()) {
      toast({
        title: "Title Required",
        description: "Please provide a task title.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        sourceType: formData.sourceType,
        originatingPerson: formData.originatingPerson.trim() || "Lead / Supervisor",
        sourceReference: formData.sourceReference.trim() || "WhatsApp Group",
        originalInstruction: formData.originalInstruction,
        title: formData.title.trim(),
        description: formData.description.trim() || formData.originalInstruction,
        scope: formData.scope.trim(),
        expectedOutcome: formData.expectedOutcome.trim(),
        acceptanceCriteria: formData.acceptanceCriteria.trim(),
        priority: formData.priority,
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
        intakeAttachments: formData.attachmentUrl ? [formData.attachmentUrl] : [],
      };

      const result = await api.tasks.registerIntake(payload);

      toast({
        title: "Task Registered in Niyantran",
        description: `Task ${result.task?.task_id || ""} registered under 'Pending Validation'. Lead authorization required before execution.`,
      });

      if (onTaskRegistered) {
        onTaskRegistered(result.task);
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Error registering intake task:", error);
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to register task intake in Niyantran.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto bg-card text-card-foreground border border-border/70 shadow-2xl rounded-2xl p-6">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/15 border border-primary/25 text-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-heading font-bold flex flex-wrap items-center gap-2 text-foreground">
                Task Intake & Registration Gate
                <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/35 bg-amber-500/10 text-xs">
                  Pending Validation Gate
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs mt-0.5">
                Register WhatsApp messages, meeting instructions, or lead directives with verifiable provenance before beginning execution.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Gate Warning Banner */}
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-900 dark:text-amber-300">BHIV Execution Gate Rule: </span>
            Registering a task does not authorise immediate execution. The task will be marked{" "}
            <span className="font-mono bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-900 dark:text-amber-200">Pending Validation</span>.
            Work cannot transition to <span className="font-mono bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-800 dark:text-blue-200">In Progress</span> until approved by an authorised Project Lead.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Section 1: Provenance & Source */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border/60 space-y-3">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              1. Origin & Provenance Metadata
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-foreground">Task Source *</Label>
                <Select
                  value={formData.sourceType}
                  onValueChange={(val) => handleChange("sourceType", val)}
                >
                  <SelectTrigger className="mt-1 bg-background border-border/70 text-xs rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border/70 text-popover-foreground text-xs rounded-xl">
                    <SelectItem value="WHATSAPP">WhatsApp Message</SelectItem>
                    <SelectItem value="DIRECT_LEAD">Direct Lead Instruction</SelectItem>
                    <SelectItem value="MEETING">Meeting / Discussion</SelectItem>
                    <SelectItem value="SLACK_EMAIL">Slack / Email / Telegram</SelectItem>
                    <SelectItem value="OTHER">Other Authorised Channel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-foreground">Originating Person *</Label>
                <Input
                  className="mt-1 bg-background border-border/70 text-xs placeholder:text-muted-foreground rounded-xl"
                  placeholder="e.g. Project Lead / Supervisor / Admin"
                  value={formData.originatingPerson}
                  onChange={(e) => handleChange("originatingPerson", e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs text-foreground">Source Reference / Chat ID</Label>
                <Input
                  className="mt-1 bg-background border-border/70 text-xs placeholder:text-muted-foreground rounded-xl"
                  placeholder="e.g. WA Group / Msg Link / 04 Nov"
                  value={formData.sourceReference}
                  onChange={(e) => handleChange("sourceReference", e.target.value)}
                />
              </div>
            </div>

            {/* Verbatim message textarea */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-xs text-foreground flex items-center gap-1.5">
                  Raw Original Task Instruction (Verbatim) *
                  <span className="text-muted-foreground font-normal text-[11px]">(Preserved immutably in DB)</span>
                </Label>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={handleAutoExtract}
                  className="h-6 text-[11px] text-primary hover:bg-primary/10 gap-1 px-2 rounded-lg"
                >
                  <Sparkles className="h-3 w-3" />
                  Auto-parse fields
                </Button>
              </div>
              <Textarea
                rows={4}
                required
                className="bg-background font-mono text-xs border-border/70 text-foreground focus:border-primary placeholder:text-muted-foreground rounded-xl"
                placeholder="Paste the verbatim WhatsApp message or directive here...
Example:
BHIV TASK ASSIGNMENT: ISHAN
TASK: Build the Task Intake, Registration and Execution Gate
OBJECTIVE: Implement a workflow where every team member must register their assigned task..."
                value={formData.originalInstruction}
                onChange={(e) => handleChange("originalInstruction", e.target.value)}
              />
            </div>
          </div>

          {/* Section 2: Task Definition & Specifications */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border/60 space-y-3">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              2. Task Registration Details
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs text-foreground">Task Title *</Label>
                <Input
                  required
                  className="mt-1 bg-background border-border/70 text-xs placeholder:text-muted-foreground rounded-xl"
                  placeholder="e.g. Build the Task Intake, Registration and Execution Gate"
                  value={formData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs text-foreground">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(val) => handleChange("priority", val)}
                >
                  <SelectTrigger className="mt-1 bg-background border-border/70 text-xs rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border/70 text-popover-foreground text-xs rounded-xl">
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Urgent">Critical / Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-foreground">Target Due Date</Label>
                <Input
                  type="date"
                  className="mt-1 bg-background border-border/70 text-xs rounded-xl"
                  value={formData.dueDate}
                  onChange={(e) => handleChange("dueDate", e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs text-foreground">Scope of Work</Label>
                <Textarea
                  rows={2}
                  className="mt-1 bg-background border-border/70 text-xs placeholder:text-muted-foreground rounded-xl"
                  placeholder="Summary of deliverables and scope..."
                  value={formData.scope}
                  onChange={(e) => handleChange("scope", e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs text-foreground">Expected Outcome & Acceptance Criteria</Label>
                <Textarea
                  rows={2}
                  className="mt-1 bg-background border-border/70 text-xs placeholder:text-muted-foreground rounded-xl"
                  placeholder="Acceptance criteria (e.g. 1. WhatsApp task registered, 2. Lead approval gate, 3. Parikshak review closure)..."
                  value={formData.acceptanceCriteria}
                  onChange={(e) => handleChange("acceptanceCriteria", e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs text-foreground">Screenshot / Evidence Reference Link</Label>
                <Input
                  className="mt-1 bg-background border-border/70 text-xs placeholder:text-muted-foreground rounded-xl"
                  placeholder="https://... (screenshot or chat backup link if applicable)"
                  value={formData.attachmentUrl}
                  onChange={(e) => handleChange("attachmentUrl", e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex sm:justify-between items-center gap-3 pt-2">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              Auto-assigns unique <span className="font-mono text-primary">T-WHT-XXXX</span> ID.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="gradient-primary text-primary-foreground font-medium gap-2 rounded-xl shadow-glow-primary"
              >
                {isSubmitting ? (
                  <>Registering...</>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Register & Submit for Validation
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export default TaskIntakeDialog;

