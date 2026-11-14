import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Separator } from "../ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar"
import { Edit, LinkIcon, FileText, Calendar, Building2, User, AlignLeft, GitFork, ExternalLink, Download } from "lucide-react"
import { formatDate } from "../../lib/dateFormat"

export function TaskDetailsDialog({ task, open, onOpenChange, onEditTask }) {
  if (!task) return null;

  const getStatusColor = (status) => {
    switch (status) {
      case "Completed":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
      case "In Progress":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";
      case "Pending":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
      default:
        return "bg-muted text-muted-foreground border-border/70";
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "High":
        return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
      case "Medium":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
      case "Low":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
      default:
        return "bg-muted text-muted-foreground border-border/70";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-card text-foreground border border-border/70 shadow-2xl rounded-2xl p-6 space-y-6 custom-scrollbar">
        {/* Header Section */}
        <DialogHeader className="space-y-3 pr-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {task.department?.name && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {task.department.name}
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground leading-snug break-words">
                {task.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground font-mono">
                ID: {task._id || task.id}
              </DialogDescription>
            </div>

            {onEditTask && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (onOpenChange) onOpenChange(false);
                  onEditTask();
                }}
                className="rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-all font-semibold flex-shrink-0"
              >
                <Edit className="mr-1.5 h-3.5 w-3.5 text-blue-500" />
                Edit
              </Button>
            )}
          </div>

          {/* Badges Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge className={`${getStatusColor(task.status)} border font-semibold px-3 py-1 text-xs rounded-full`}>
              {task.status}
            </Badge>
            <Badge className={`${getPriorityColor(task.priority)} border font-semibold px-3 py-1 text-xs rounded-full`}>
              {task.priority} Priority
            </Badge>
            <Badge variant="outline" className="bg-muted/60 border-border/70 text-foreground font-medium px-3 py-1 text-xs rounded-full flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              Due: {task.dueDate ? formatDate(task.dueDate) : "No due date"}
            </Badge>
          </div>
        </DialogHeader>

        <Separator className="bg-border/60" />

        {/* Content Body */}
        <div className="space-y-5">
          {/* Description */}
          <div className="bg-muted/40 border border-border/60 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <AlignLeft className="h-3.5 w-3.5 text-emerald-500" />
              Description
            </h3>
            <p className="text-sm text-foreground leading-relaxed font-normal whitespace-pre-wrap">
              {task.description || "No description provided."}
            </p>
          </div>

          {/* Grid Layout for Assignee & Dependencies */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Assignee Card */}
            <div className="bg-muted/40 border border-border/60 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-blue-500" />
                Assignee
              </h3>
              <div className="flex items-center gap-3 pt-1">
                <Avatar className="h-9 w-9 border border-border/70">
                  <AvatarImage
                    src={task.assignee?.avatar || "/placeholder.svg"}
                    alt={task.assignee?.name || "Unassigned"}
                  />
                  <AvatarFallback className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                    {task.assignee?.name
                      ? task.assignee.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .substring(0, 2)
                          .toUpperCase()
                      : "NA"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {task.assignee?.name || "Unassigned"}
                  </p>
                  {task.assignee?.email && (
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {task.assignee.email}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Dependencies Card */}
            <div className="bg-muted/40 border border-border/60 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <GitFork className="h-3.5 w-3.5 text-amber-500" />
                Dependencies
              </h3>
              <div className="pt-1">
                {task.dependencies && task.dependencies.length > 0 ? (
                  <div className="space-y-1.5">
                    {task.dependencies.map((dep, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs font-medium text-foreground bg-card p-2 rounded-lg border border-border/60">
                        <LinkIcon className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                        <span className="truncate">{dep.title || dep}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic pt-1">No dependencies linked</p>
                )}
              </div>
            </div>
          </div>

          {/* Source Document Section */}
          <div className="bg-muted/40 border border-border/60 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-emerald-500" />
              Source Document & Attachments
            </h3>
            <div className="space-y-2">
              {(() => {
                const notesMatch = task.notes?.match(/^Document:\s*(.+?)\s*\((.+)\)$/);
                const notesUrl = notesMatch ? notesMatch[1] : null;
                const notesFilename = notesMatch ? notesMatch[2] : null;

                const linkUrl = !notesUrl && task.links && task.links.length > 0
                  ? task.links[0]
                  : null;

                const docUrl = notesUrl || linkUrl;
                const docFilename = notesFilename || (linkUrl ? linkUrl.split("/").pop().split("?")[0] : null);
                const mimeType = task.fileType || "";

                const fileTypeMap = {
                  "application/pdf": "PDF Document",
                  "application/msword": "Word Document",
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word Document",
                  "text/plain": "Text Document",
                  "text/markdown": "Markdown File",
                };
                const fileLabel = fileTypeMap[mimeType] || (docFilename?.split(".").pop()?.toUpperCase()) || "File";
                const isPDF = mimeType === "application/pdf" || docFilename?.toLowerCase().endsWith(".pdf");
                const displayUrl = docUrl && isPDF ? `${docUrl}?_a=BAE6pY0` : docUrl;

                if (!docUrl) {
                  return <p className="text-xs text-muted-foreground italic">No source document attached</p>;
                }

                return (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-card">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{docFilename || "Task Document"}</p>
                        <p className="text-[11px] text-muted-foreground">{fileLabel} · Ingested source file</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a
                        href={displayUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        title="Open document"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </a>
                      {!isPDF && (
                        <a
                          href={docUrl}
                          download={docFilename || true}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors"
                          title="Download document"
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </a>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* External Links section */}
          {task.links && task.links.length > 0 && (() => {
            const notesMatch = task.notes?.match(/^Document:\s*(.+?)\s*\((.+)\)$/);
            const sourceUrl = notesMatch ? notesMatch[1] : null;
            const extraLinks = task.links.filter((l) => l !== sourceUrl);
            if (extraLinks.length === 0) return null;
            return (
              <div className="bg-muted/40 border border-border/60 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <LinkIcon className="h-3.5 w-3.5 text-blue-500" />
                  Additional Links
                </h3>
                <div className="space-y-1.5 pt-1">
                  {extraLinks.map((link, index) => (
                    <a
                      key={index}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline truncate bg-card p-2 rounded-lg border border-border/60"
                    >
                      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{link}</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
