import { toast } from "react-toastify";

"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { API_URL } from "@/lib/api"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import { Badge } from "../ui/badge"
import { Github, Link2, FileText, RefreshCw, Sparkles, AlertTriangle, CheckCircle, Clock, Plus, ExternalLink } from "lucide-react"
import { SimpleModeToggle } from "../simple-mode-toggle"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"

export function TaskSubmissionDialog({ open, onOpenChange, onSubmit, existingSubmission, task, productId: propProductId }) {
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    githubLink: existingSubmission?.githubLink || "",
    notes: existingSubmission?.notes || "",
  })

  const [documentFile, setDocumentFile] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState({})

  // Context validation states (non-blocking warning)
  const [validatingContext, setValidatingContext] = useState(false)
  const [contextValidation, setContextValidation] = useState(null)
  const [contextWarningOpen, setContextWarningOpen] = useState(false)

  // Target product ID grounding
  const targetProductId = useMemo(() => {
    return (
      propProductId ||
      task?.product ||
      task?.productId ||
      existingSubmission?.task?.product ||
      existingSubmission?.task?.productId ||
      "BHIV"
    ).toString().trim().toUpperCase()
  }, [propProductId, task, existingSubmission])

  // Context validation fetcher
  const validateContext = useCallback(async () => {
    if (!open) return
    setValidatingContext(true)
    try {
      const token = localStorage.getItem("WorkflowToken") || localStorage.getItem("token")
      const headers = {}
      if (token) {
        headers["x-auth-token"] = token
        headers["Authorization"] = `Bearer ${token}`
      }
      const res = await axios.get(`${API_URL}/knowledge/validate-context`, {
        params: { productId: targetProductId },
        headers
      })
      setContextValidation(res.data)
    } catch (err) {
      console.warn("[CONTEXT_VALIDATION] Error querying status:", err?.response?.data || err.message)
      if (err.response?.data?.status) {
        setContextValidation(err.response.data)
      } else {
        // Fallback non-blocking warning if backend cannot verify
        setContextValidation({
          status: "MISSING",
          hasContext: false,
          canSubmit: true,
          allowed: true,
          contextWarning: true,
          case: "CASE_A",
          action: "ADD_CONTEXT",
          message: "Parikshak context has not been added for this product. The task evaluation will fail unless context is added."
        })
      }
    } finally {
      setValidatingContext(false)
    }
  }, [open, targetProductId])

  // Reset form data and query validation when dialog opens
  useEffect(() => {
    if (open) {
      setFormData({
        githubLink: existingSubmission?.githubLink || "",
        notes: existingSubmission?.notes || "",
      })
      setDocumentFile(null)
      setErrors({})
      validateContext()
    } else {
      setContextValidation(null)
    }
  }, [existingSubmission, open, validateContext])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }))
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      const validTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png",
        "image/jpeg",
      ]
      if (!validTypes.includes(file.type)) {
        toast.error("Only PDF, DOC, DOCX, PNG, and JPEG files are allowed.")
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB.")
        return
      }
      setDocumentFile(file)
    }
  }

  const wordCount = formData.notes.trim() ? formData.notes.trim().split(/\s+/).filter(Boolean).length : 0

  const validateForm = () => {
    const newErrors = {}
    if (formData.githubLink && !isValidGithubUrl(formData.githubLink)) {
      newErrors.githubLink = "Please enter a valid GitHub repository URL (e.g. https://github.com/org/repo)"
    }
    if (!formData.githubLink && !documentFile && wordCount < 50) {
      newErrors.notes = `Please enter a valid GitHub repository URL or write at least 50 words of implementation notes (current: ${wordCount} / 50 words).`
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isValidGithubUrl = (string) => {
    try {
      const url = new URL(string)
      return url.hostname === "github.com" && url.pathname.split("/").filter(Boolean).length >= 2
    } catch {
      return false
    }
  }

  // Navigation redirect to Knowledge Admin with product pre-selected
  const handleRedirectToKnowledge = (action = "add") => {
    if (onOpenChange) onOpenChange(false)
    const targetUrl = `/knowledge-admin?product=${encodeURIComponent(targetProductId)}&action=${action}`
    try {
      navigate(targetUrl)
    } catch {
      window.location.href = targetUrl
    }
  }

  // Pre-submission context validation (non-blocking: warns if context missing, never blocks)
  const hasContextWarning = Boolean(
    contextValidation &&
    (contextValidation.contextWarning ||
      contextValidation.hasContext === false ||
      contextValidation.status === "MISSING")
  )
  const isSubmitDisabled = isSubmitting

  const executeSubmit = async () => {
    try {
      const storedUser = localStorage.getItem("WorkflowUser")
      const userId = storedUser ? JSON.parse(storedUser).id : undefined
      setIsSubmitting(true)
      const submissionData = new FormData()
      submissionData.append("githubLink", formData.githubLink)
      submissionData.append("notes", formData.notes)
      if (userId) {
        submissionData.append("userId", userId)
      }
      if (targetProductId) {
        submissionData.append("productId", targetProductId)
      }
      if (documentFile) {
        submissionData.append("document", documentFile)
      }

      await onSubmit(submissionData)
      toast.success(existingSubmission ? "Task updated and resubmitted to admin for review" : "Task submitted successfully")
    } catch (error) {
      console.error("Error submitting task:", error)
      const errorMsg = error?.response?.data?.error || error?.response?.data?.message || "Failed to submit task"
      toast.error(errorMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!validateForm()) {
      return
    }

    if (hasContextWarning) {
      setContextWarningOpen(true)
      return
    }

    await executeSubmit()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-hidden bg-white dark:bg-gray-950 border-2 border-gray-200 dark:border-gray-800 shadow-2xl rounded-3xl p-0">
        {/* Hidden title for accessibility */}
        <DialogTitle className="sr-only">Submit Task</DialogTitle>

        <div className="px-6 pt-6 pb-5 overflow-y-auto max-h-[calc(90vh-120px)] bg-white dark:bg-gray-950 scrollbar-thin scrollbar-thumb-primary/20 dark:scrollbar-thumb-primary/10 scrollbar-track-transparent hover:scrollbar-thumb-primary/30 dark:hover:scrollbar-thumb-primary/20">
          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-md bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <Github className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {existingSubmission ? "Edit Submission" : "Submit Task"}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                      {existingSubmission ? "Update your submission details below." : "Provide your submission details below."}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded font-medium">
                        Task ID: {task?.task_id || task?._id || "N/A"}
                      </span>
                      <span className="font-semibold text-xs text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 px-2 py-0.5 rounded">
                        📦 Product: {targetProductId}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <SimpleModeToggle />
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* FEATURE 15: PRE-SUBMISSION CONTEXT VALIDATION BANNERS (Cases A, B, C, D)  */}
            {/* ========================================================================= */}

            {/* Validation Loading State */}
            {validatingContext && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-2xl flex items-center gap-2.5">
                <RefreshCw className="h-4 w-4 text-gray-500 animate-spin flex-shrink-0" />
                <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                  Validating product context for {targetProductId}...
                </span>
              </div>
            )}

            {/* Case A: Missing Context (Non-Blocking Warning) */}
            {!validatingContext && hasContextWarning && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700/60 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      Parikshak Context Missing ({targetProductId})
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                      Parikshak context has not been added for this product. The task evaluation will fail unless context is added. You can still submit this task.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleRedirectToKnowledge("add")}
                  className="self-end sm:self-auto flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 font-semibold text-xs px-3.5 py-2 rounded-xl shadow-sm hover:scale-105 transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Context
                </Button>
              </div>
            )}

            {/* Case C: Active Context */}
            {!validatingContext && contextValidation && !hasContextWarning && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700/60 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                      Product context is active.
                    </span>
                    <span className="text-xs text-emerald-700 dark:text-emerald-300 ml-1.5 font-mono">
                      ({targetProductId} • {contextValidation.version || contextValidation.context?.version || "v1.0"})
                    </span>
                  </div>
                </div>
                <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 text-[10px] font-semibold">
                  Active
                </Badge>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="githubLink" className="flex items-center gap-1 text-gray-900 dark:text-white">
                <Github className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                Repository Link
              </Label>
              <Input
                id="githubLink"
                name="githubLink"
                placeholder="https://github.com/username/repository or other repository URL"
                value={formData.githubLink}
                onChange={handleChange}
                className={`h-12 px-4 bg-gray-50 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700 hover:border-primary/40 focus:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 rounded-xl transition-all duration-300 text-base font-medium placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100 ${errors.githubLink ? "border-destructive" : ""}`}
              />
              {errors.githubLink && <p className="text-xs text-red-500">{errors.githubLink}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="document" className="flex items-center gap-1 text-gray-900 dark:text-white">
                <FileText className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                Document or Photo
              </Label>
              <div className="space-y-2">
                {/* Show existing document when updating */}
                {existingSubmission?.documentLink && !documentFile && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2.5 font-medium">
                      <FileText className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate">Current file attached</span>
                      <span className="text-xs bg-blue-200 dark:bg-blue-800 px-2 py-0.5 rounded-full ml-auto">Existing</span>
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Upload a new file below to replace it</p>
                  </div>
                )}
                <Input
                  id="document"
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  className="h-12 px-4 bg-gray-50 dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-accent/40 focus:border-accent focus-visible:ring-4 focus-visible:ring-accent/10 rounded-xl transition-all duration-300 cursor-pointer text-gray-900 dark:text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-accent file:to-accent/80 file:text-accent-foreground hover:file:from-accent/90 hover:file:to-accent/70 file:transition-all file:duration-300"
                />
                {documentFile && (
                  <div className="mt-1 p-3 bg-accent/10 dark:bg-accent/5 border border-accent/20 rounded-lg">
                    <p className="text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2.5 font-medium">
                      <FileText className="h-5 w-5 text-accent flex-shrink-0" />
                      <span className="truncate">{documentFile.name}</span>
                      <span className="text-xs text-accent bg-accent/20 px-2 py-0.5 rounded-full ml-auto">New File</span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="notes" className="text-gray-900 dark:text-white">Notes</Label>
                <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded transition-colors ${
                  wordCount >= 50 
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800" 
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                }`}>
                  {wordCount} / 50 words
                </span>
              </div>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Describe your technical implementation, architecture, and completed features..."
                value={formData.notes}
                onChange={handleChange}
                rows={4}
                className={`min-h-[110px] px-4 py-3 bg-gray-50 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700 hover:border-secondary/40 focus:border-secondary focus-visible:ring-4 focus-visible:ring-secondary/10 rounded-xl resize-none transition-all duration-300 text-base placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100 ${errors.notes ? "border-destructive" : ""}`}
              />
              {errors.notes && <p className="text-xs text-red-500 mt-1 font-medium">{errors.notes}</p>}
            </div>

          </form>
        </div>

        <DialogFooter className="px-6 py-4 border-t-2 border-gray-200 dark:border-gray-800 bg-gradient-to-t from-gray-50/50 dark:from-gray-900/50 to-transparent backdrop-blur-sm">
          <div className="flex items-center justify-between w-full">
            {!validatingContext && hasContextWarning && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5 mr-auto">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                Warning: Parikshak context missing for {targetProductId}
              </span>
            )}

            <div className="flex items-center gap-3 ml-auto">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-12 px-6 rounded-xl border-2 border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-300 font-semibold text-gray-900 dark:text-gray-100"
              >
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </Button>
              <Button
                type="submit"
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
                className="h-12 px-8 rounded-xl gradient-primary text-primary-foreground hover:shadow-xl hover:shadow-primary/30 dark:hover:shadow-primary/20 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none font-bold"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2.5">
                    <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                    {existingSubmission ? "Resubmitting..." : "Submitting..."}
                  </span>
                ) : (
                  <span className="flex items-center gap-2.5">
                    {existingSubmission ? (
                      <RefreshCw className="h-5 w-5" />
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                    {existingSubmission ? "Update & Resubmit" : "Submit Task"}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Non-blocking Parikshak Context Warning Pop-up */}
      <Dialog open={contextWarningOpen} onOpenChange={setContextWarningOpen}>
        <DialogContent className="sm:max-w-[480px] bg-white dark:bg-gray-950 border-2 border-amber-300 dark:border-amber-700 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Parikshak Context Missing ({targetProductId})
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-700 dark:text-gray-300 pt-2">
              Parikshak context has not been added for <strong>{targetProductId}</strong>. The task evaluation will fail unless context is added. Do you want to proceed with submission anyway?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setContextWarningOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setContextWarningOpen(false)
                handleRedirectToKnowledge("add")
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Context
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setContextWarningOpen(false)
                await executeSubmit()
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Proceed & Submit Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
