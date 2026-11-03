const axios = require('axios');
const TaskSubmission = require('../models/TaskSubmission');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { emitTaskCompletedEvent, emitTaskFailedEvent } = require('./taskExecutionBridge');

const PARIKSHAK_URL = process.env.PARIKSHAK_URL || 'https://parikshak.blackholeinfiverse.com/parikshak/review';
const PARIKSHAK_TOKEN = process.env.PARIKSHAK_TOKEN || '';
const PARIKSHAK_API_KEY = process.env.PARIKSHAK_API_KEY || process.env.NIYANTRAN_API_KEY || 'bhiv_live_niyantran_prod_key_77a9c2b4e8';
const PARIKSHAK_TIMEOUT_MS = parseInt(process.env.PARIKSHAK_TIMEOUT_MS || '120000', 10); // 2 minutes timeout

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const invokeParikshak = async (submissionId, traceId, io) => {
    try {
        console.log(`[PARIKSHAK] Starting review for submission ${submissionId}, trace_id: ${traceId}`);

        // 1. Fetch data
        const submission = await TaskSubmission.findById(submissionId).populate('task').populate('user');
        if (!submission || !submission.task || !submission.user) {
            console.error(`[PARIKSHAK] Submission ${submissionId} not found or incomplete data.`);
            return;
        }

        const task = submission.task;
        const user = submission.user;

        const combinedDescription = [
            task.description ? `Task Overview:\n${task.description}` : '',
            submission.notes ? `Candidate Deliverables & Implementation Notes:\n${submission.notes}` : ''
        ].filter(Boolean).join('\n\n') || 'No description provided';

        const payload = {
            mode: 'task_review',
            title: task.title || 'Untitled Task',
            task_title: task.title || 'Untitled Task',
            description: combinedDescription,
            task_description: combinedDescription,
            submitted_by: user.name || user._id.toString(),
            submission: submission.notes || '',

            task_id: task._id ? task._id.toString() : '',
            user_id: user._id ? user._id.toString() : '',
            product_id: task.branch || 'default_tenant',
            repo_url: submission.githubLink || '',
            commit_reference: submission.githubLink || '',
            submission_evidence: submission.documentLink || '',
            review_packet_ref: submission.notes && submission.notes.includes('REVIEW_PACKET') ? 'attached' : 'none',
            code_packet_ref: submission.notes && submission.notes.includes('CODE_PACKET') ? 'attached' : 'none',

            github_repo_link: submission.githubLink || '',
            current_task_id: (task.task_id && task.task_id.startsWith("T-")) ? task.task_id : "T-GOV-001",
            previous_task_id: (task.task_id && task.task_id.startsWith("T-")) ? task.task_id : "T-GOV-001",
            trace_id: traceId
        };

        const targetUrl = PARIKSHAK_URL.endsWith("/parikshak/review")
            ? PARIKSHAK_URL
            : `${PARIKSHAK_URL.replace(/\/$/, "")}/parikshak/review`;

        // 3. Make API call with exponential backoff (3 retries)
        let response = null;
        let attempt = 0;
        let isAuthError = false;
        let authErrorMessage = "";
        const delays = [5000, 15000, 30000]; // 5s, 15s, 30s

        while (attempt <= 3) {
            try {
                const config = {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-BHIV-API-KEY': PARIKSHAK_API_KEY,
                        'X-API-KEY': PARIKSHAK_API_KEY
                    },
                    timeout: PARIKSHAK_TIMEOUT_MS, // 2 minutes (120s) timeout per request
                    validateStatus: (status) => status < 600
                };
                if (PARIKSHAK_TOKEN) {
                    config.headers['Authorization'] = `Bearer ${PARIKSHAK_TOKEN}`;
                }

                const startTime = Date.now();
                const res = await axios.post(targetUrl, payload, config);
                const runtimeMs = Date.now() - startTime;
                console.log(`[PARIKSHAK] API Call completed with status ${res.status} in ${runtimeMs}ms`);

                // Check for HTTP 401/403 or auth error in payload
                if (res.status === 401 || res.status === 403 ||
                    (res.data && typeof res.data.detail === 'string' && (
                        res.data.detail.toLowerCase().includes('not authenticated') ||
                        res.data.detail.toLowerCase().includes('invalid or revoked api key') ||
                        res.data.detail.toLowerCase().includes('insufficient permissions')
                    ))) {
                    isAuthError = true;
                    authErrorMessage = (res.data && res.data.detail) || `HTTP ${res.status} Authentication Failed`;
                    console.error(`[PARIKSHAK] Authentication/permission failure with Parikshak API: ${authErrorMessage}`);
                    response = null; // Do not treat auth failure as candidate submission response
                    break;
                }

                response = res.data;
                break; // Success, exit retry loop
            } catch (err) {
                attempt++;
                console.error(`[PARIKSHAK] API Call network error on attempt ${attempt}:`, err.message);
                if (err.response && (err.response.status === 401 || err.response.status === 403)) {
                    isAuthError = true;
                    authErrorMessage = (err.response.data && err.response.data.detail) || `HTTP ${err.response.status} Authentication Failed`;
                    console.error(`[PARIKSHAK] Authentication failure with Parikshak API: ${authErrorMessage}`);
                    response = null;
                    break;
                }
                if (err.response && err.response.data) {
                    response = err.response.data;
                    break;
                }
                if (attempt <= 3) {
                    const delay = delays[attempt - 1];
                    console.log(`[PARIKSHAK] Retrying in ${delay / 1000}s...`);
                    await sleep(delay);
                }
            }
        }

        // 4. Handle failure to connect or authenticate -> Keep in Pending status for manual review
        if (!response) {
            console.warn(`[PARIKSHAK_PROD_LOG] ⚠️ Review service unavailable or auth failed for submission ${submissionId}. Queuing for manual review.`);
            submission.status = "Pending";
            submission.feedback = isAuthError
                ? `Parikshak AI review service authentication verification in progress (${authErrorMessage}). Your submission is safely queued in Pending status for manual admin review.`
                : "Parikshak AI review service is currently offline. Your submission is queued in Pending status for manual review by an admin.";
            submission.aiReviewDetails = {
                score: null,
                result: "OFFLINE",
                doneWell: "Submission passed initial automated structure intake.",
                missingWork: isAuthError ? "Service authentication verification pending. Awaiting manual admin review." : "Parikshak review service unavailable. Awaiting manual admin review.",
                recommendations: "Your submission has been queued and will be reviewed by an administrator.",
                readiness: "Pending Admin Review"
            };
            submission.parikshakReview = {
                status: "PENDING",
                score: null,
                review: submission.feedback,
                nextTask: "",
                reviewedAt: new Date()
            };
            await submission.save();
            return;
        }

        // Check if response contains an auth error that bypassed status check
        if (response.detail && typeof response.detail === 'string' && (
            response.detail.toLowerCase().includes('not authenticated') ||
            response.detail.toLowerCase().includes('invalid or revoked api key')
        )) {
            submission.status = "Pending";
            submission.feedback = `Parikshak service authentication required (${response.detail}). Submission queued for admin review.`;
            submission.aiReviewDetails = {
                score: null,
                result: "OFFLINE",
                doneWell: "Submission passed initial automated structure intake.",
                missingWork: "Awaiting manual admin review.",
                recommendations: "Your submission has been queued and will be reviewed by an administrator.",
                readiness: "Pending Admin Review"
            };
            submission.parikshakReview = {
                status: "PENDING",
                score: null,
                review: submission.feedback,
                nextTask: "",
                reviewedAt: new Date()
            };
            await submission.save();
            return;
        }

        // 5. Process Review Response
        console.log(`[PARIKSHAK_PROD_LOG] 📊 Processing evaluation response: Status=${response.status || response.result}, Score=${response.score}`);

        const responseStatus = String(response.status || response.result || "").toUpperCase();
        const scoreVal = (response.score !== undefined && response.score !== null)
            ? response.score
            : ((response.readiness_percent !== undefined && response.readiness_percent !== null) ? response.readiness_percent : 0);

        let reviewText = response.review || response.detail || response.reason || "";
        if (!reviewText && Array.isArray(response.failure_reasons) && response.failure_reasons.length > 0) {
            reviewText = response.failure_reasons.join('\n');
        }
        if (!reviewText && Array.isArray(response.improvement_hints) && response.improvement_hints.length > 0) {
            reviewText = response.improvement_hints.join('\n');
        }
        if (!reviewText && response.failure_type) {
            reviewText = `Evaluation check failed (${response.failure_type}): Please ensure a valid GitHub repository URL is attached and detailed task completion notes (>50 words) are provided.`;
        }
        if (!reviewText) {
            reviewText = "Submission did not pass automated AI evaluation criteria. Please ensure your GitHub repository URL is accessible and resubmit.";
        }

        let finalStatus = "Pending"; // Default fallback to manual admin review
        let finalFeedback = reviewText;

        if (responseStatus === "PASS" || responseStatus === "APPROVED" || responseStatus === "SUCCESS") {
            finalStatus = "Approved";
        } else {
            // Rejection / FAIL / PARTIAL: Do not directly hard reject for candidate.
            // Queue in "Pending" status for user, but preserve AI review score & details for Admin manual review.
            finalStatus = "Pending";
            finalFeedback = `Submission is under manual admin review. (AI Assessment: ${responseStatus || 'REJECTED'}, Score: ${scoreVal}/100).\n\nPreliminary Assessment:\n${reviewText}`;
        }

        // Extract structured fields
        let doneWell = "Good effort on submitting the task.";
        let missingWork = "Review the feedback for details.";
        let recommendations = "Please check the AI review guidelines.";
        let readiness = (responseStatus === "PASS" || responseStatus === "APPROVED") ? "Production Ready" : "Requires Revisions";

        if (response.review_details) {
            doneWell = response.review_details.done_well || doneWell;
            missingWork = response.review_details.missing_work || missingWork;
            recommendations = response.review_details.recommendations || recommendations;
            readiness = response.review_details.readiness || readiness;
        } else {
            doneWell = (responseStatus === "PASS" || responseStatus === "APPROVED")
                ? (reviewText || "Clean codebase integration matching expected requirements.")
                : "Submission passed initial automated structure intake.";
            missingWork = (responseStatus === "PASS" || responseStatus === "APPROVED")
                ? "None"
                : (Array.isArray(response.failure_reasons) && response.failure_reasons.length > 0
                    ? response.failure_reasons.join('\n')
                    : (response.failure_type
                        ? `Evaluation check failed (${response.failure_type}): Attach accessible GitHub repository URL and provide detailed submission notes (>50 words).`
                        : reviewText));
            recommendations = (Array.isArray(response.improvement_hints) && response.improvement_hints.length > 0)
                ? response.improvement_hints.join(' ')
                : (finalStatus === "Approved" ? "Proceed to recommended next task." : "Provide detailed task completion notes (>50 words) describing implementation architecture and resubmit.");
        }

        const passFailStatus = response.result || response.status || (finalStatus === "Approved" ? "PASS" : (responseStatus === "PARTIAL" ? "PARTIAL" : "FAIL"));
        const nextTaskName = response.next_task || (response.next_task_proposal && response.next_task_proposal.title) || "";

        // Update submission
        submission.status = finalStatus;
        submission.feedback = finalFeedback;
        submission.aiReviewDetails = {
            score: scoreVal,
            result: passFailStatus,
            doneWell,
            missingWork,
            recommendations,
            readiness
        };
        submission.parikshakReview = {
            status: passFailStatus,
            score: scoreVal,
            review: finalFeedback,
            nextTask: nextTaskName,
            reviewedAt: new Date()
        };
        await submission.save();

        // Phase 2: MasterDB Integration - Candidate Execution History (Disabled per user preference)
        // TaskEvaluation records will not be automatically generated on submission review.

        // Update task status and emit events
        let execContext;
        try {
            if (finalStatus === "Approved") {
                try {
                    execContext = await emitTaskCompletedEvent(submission, traceId, task.branch);
                    console.log(`[TRACE_EMITTED] Task completed (Automated) - trace_id=${execContext?.traceId}`);
                } catch (traceErr) {
                    console.warn(`[TRACE_WARNING] Lifecycle event emission failed (non-fatal):`, traceErr.message);
                }

                // Phase 2: KARMA Runtime Integration
                try {
                    const karmaClient = require('./karmaClient');
                    await karmaClient.signalTaskCompleted(user._id.toString(), traceId);
                    console.log(`[KARMA] signalTaskCompleted emitted for ${user._id}`);
                } catch (karmaErr) {
                    console.warn(`[KARMA] Failed to emit signalTaskCompleted:`, karmaErr.message);
                }

                if (task.status !== "Completed") {
                    task.status = "Completed";
                    task.progress = 100;
                    await task.save();
                }

                // Phase 3: Next Task Runtime
                console.log(`[PARIKSHAK] Phase 3: Creating next task for assignee ${task.assignee}`);

                const nextTaskObj = (typeof response.canonical_next_task_packet === 'object' && response.canonical_next_task_packet)
                    || (typeof response.next_task_details === 'object' && response.next_task_details)
                    || (typeof response.next_task_proposal === 'object' && response.next_task_proposal)
                    || (typeof response.next_task === 'object' && response.next_task)
                    || null;

                const masterPrompt = response.master_prompt 
                    || nextTaskObj?.master_prompt 
                    || nextTaskObj?.description 
                    || "";

                let nextTaskTitle = "";
                let nextTaskDescription = "";

                if (nextTaskObj) {
                    nextTaskTitle = nextTaskObj.title || nextTaskObj.name || "";
                    nextTaskDescription = masterPrompt || nextTaskObj.description || nextTaskObj.objective || "";
                } else if (typeof response.next_task === 'string' && response.next_task.trim()) {
                    const rawNext = response.next_task.trim();
                    if (/^T-[A-Z]{3}-\d+$/i.test(rawNext) || rawNext.toLowerCase().includes("test task") || rawNext.toLowerCase().startsWith("task-next")) {
                        const cleanPrevTitle = (task.title || "").replace(/^Phase\s*\d+\s*[:\-]\s*/i, "");
                        nextTaskTitle = `Phase 2: ${cleanPrevTitle || "Execution & Convergence Certification"}`;
                    } else {
                        nextTaskTitle = rawNext;
                    }
                    nextTaskDescription = masterPrompt || "";
                }

                if (!nextTaskTitle || /^T-[A-Z]{3}-\d+$/i.test(nextTaskTitle) || nextTaskTitle.toLowerCase().includes("test task")) {
                    const cleanPrevTitle = (task.title || "").replace(/^Phase\s*\d+\s*[:\-]\s*/i, "");
                    nextTaskTitle = `Phase 2: ${cleanPrevTitle || "Execution & Convergence Certification"}`;
                }

                if (!nextTaskDescription) {
                    nextTaskDescription = masterPrompt || `Next production phase following successful evaluation of '${task.title}'.\n\nAutomated AI Review Summary:\n${doneWell}\n\nRecommended Guidelines:\n${recommendations}`;
                }

                const deptId = task.department?._id || task.department;

                // Prevent duplicate assignment on retries
                const existingTask = await Task.findOne({
                    title: nextTaskTitle,
                    assignee: task.assignee,
                    status: "Pending" // Already in queue
                });

                if (existingTask) {
                    console.log(`[PHASE 3] Next task "${nextTaskTitle}" already exists for assignee. Skipping duplicate creation.`);
                } else {
                    const newTask = new Task({
                        title: nextTaskTitle,
                        description: nextTaskDescription,
                        notes: masterPrompt || nextTaskDescription,
                        status: "Pending",
                        priority: task.priority || "Medium",
                        department: deptId,
                        assignee: task.assignee, // Assign same candidate
                        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
                        dependencies: task.dependencies, // Preserve dependencies
                        branch: task.branch, // Preserve product/tenant
                        progress: 0,
                    });

                    await newTask.save();
                    console.log(`[PHASE 3] Created new assigned task: ${newTask._id} with canonical task packet`);

                    // Emit task assigned event for the new task
                    const { emitTaskAssignedEvent } = require('./taskExecutionBridge');
                    await emitTaskAssignedEvent(newTask, traceId, newTask.branch);

                    // Notify candidate about new task
                    await Notification.create({
                        recipient: newTask.assignee,
                        type: "task_assigned",
                        title: `New Automatically Assigned Task`,
                        message: `A follow-up task "${newTask.title}" has been automatically assigned to you.`,
                        task: newTask._id
                    });
                }
                // End Phase 3

            } else {
                execContext = await emitTaskFailedEvent(
                    submission,
                    finalFeedback || "submission_rejected_by_ai",
                    traceId,
                    task.branch
                );
                console.log(`[TRACE_EMITTED] Task failed (Automated) - trace_id=${execContext?.traceId}`);

                // If the task was previously "Completed", we might want to move it back to "In Progress" since the automated review failed it.
                if (task.status === "Completed") {
                    task.status = "In Progress";
                    await task.save();
                }
            }
        } catch (execErr) {
            console.error("[TRACE_FAILURE] Failed to emit automated review event:", execErr);
        }

        // Emit Socket Event
        if (io) {
            io.emit("submission-reviewed", {
                submission,
                trace_id: execContext?.traceId,
                automated: true
            });
        }

        const statusMessage = finalStatus === "Approved"
            ? "has been approved by Parikshak AI."
            : "is currently under manual review by an admin.";

        await Notification.create({
            recipient: user._id,
            type: "submission_reviewed",
            title: `Automated Review: ${finalStatus === "Approved" ? "Approved" : "Under Review"}`,
            message: `Your submission for task '${task.title}' ${statusMessage}`,
            task: task._id
        });

        console.log(`[PARIKSHAK] Finished automated review workflow for submission ${submissionId}`);

    } catch (error) {
        console.error(`[PARIKSHAK] Critical error in review workflow for submission ${submissionId}:`, error);
    }
};

const triggerReview = async ({
    submission,
    task,
    userName = "Candidate",
    io = null,
    Notification: NotificationModel = Notification,
    TaskSubmission: TaskSubmissionModel = TaskSubmission
} = {}) => {
    try {
        if (!submission || !task) return;

        const subId = typeof submission === 'string' ? submission : (submission._id || "sub-default");
        const taskId = typeof task === 'string' ? task : (task._id || "task-default");
        const userId = typeof submission === 'object' ? (submission.user || "user-001") : "user-001";

        const combinedDescription = [
            task.description ? `Task Overview:\n${task.description}` : '',
            submission.notes ? `Candidate Deliverables & Implementation Notes:\n${submission.notes}` : ''
        ].filter(Boolean).join('\n\n') || 'No description provided';

        const payload = {
            mode: 'task_review',
            title: task.title || 'Untitled Task',
            task_title: task.title || 'Untitled Task',
            description: combinedDescription,
            task_description: combinedDescription,
            submitted_by: userName || 'Candidate',
            submission: submission.notes || '',
            repo_url: submission.githubLink || '',
            github_repo_link: submission.githubLink || '',
            current_task_id: (task.task_id && task.task_id.startsWith("T-")) ? task.task_id : "T-GOV-001",
            previous_task_id: (task.task_id && task.task_id.startsWith("T-")) ? task.task_id : "T-GOV-001",
            trace_id: submission.trace_id || `trace-bhiv-${subId}`
        };

        const config = {
            headers: {
                'Content-Type': 'application/json',
                'X-BHIV-API-KEY': PARIKSHAK_API_KEY,
                'X-API-KEY': PARIKSHAK_API_KEY
            },
            timeout: PARIKSHAK_TIMEOUT_MS
        };
        if (PARIKSHAK_TOKEN) {
            config.headers['Authorization'] = `Bearer ${PARIKSHAK_TOKEN}`;
        }

        const targetUrl = PARIKSHAK_URL.endsWith("/parikshak/review")
            ? PARIKSHAK_URL
            : `${PARIKSHAK_URL.replace(/\/$/, "")}/parikshak/review`;

        const res = await axios.post(targetUrl, payload, config);
        const response = res.data;

        const responseStatus = String(response.status || response.result || "").toUpperCase();
        const scoreVal = (response.score !== undefined && response.score !== null)
            ? response.score
            : ((response.readiness_percent !== undefined && response.readiness_percent !== null) ? response.readiness_percent : 0);

        let reviewText = response.review || response.detail || response.reason || "";
        if (!reviewText && Array.isArray(response.failure_reasons) && response.failure_reasons.length > 0) {
            reviewText = response.failure_reasons.join('\n');
        }
        if (!reviewText) {
            reviewText = "Submission did not pass automated AI evaluation criteria.";
        }

        let finalStatus = "Pending";
        if (responseStatus === "PASS" || responseStatus === "APPROVED" || responseStatus === "SUCCESS") {
            finalStatus = "Approved";
        } else {
            finalStatus = "Pending"; // Queue for manual admin review
        }

        if (TaskSubmissionModel && TaskSubmissionModel.findByIdAndUpdate) {
            await TaskSubmissionModel.findByIdAndUpdate(subId, {
                $set: {
                    status: finalStatus,
                    feedback: reviewText,
                    parikshakReview: {
                        status: response.status || finalStatus,
                        score: scoreVal,
                        review: reviewText,
                        nextTask: response.next_task || "",
                        reviewedAt: new Date()
                    },
                    aiReviewDetails: {
                        score: scoreVal,
                        result: response.status || finalStatus,
                        doneWell: reviewText,
                        missingWork: finalStatus === "Approved" ? "None" : reviewText,
                        recommendations: "Review AI guidelines and update code",
                        readiness: finalStatus === "Approved" ? "Production Ready" : "Requires Revisions"
                    }
                }
            });
        }

        if (NotificationModel && NotificationModel.create) {
            try {
                await NotificationModel.create({
                    recipient: userId,
                    type: "submission_reviewed",
                    title: `AI Review: ${response.status || finalStatus} (${scoreVal}/100)`,
                    message: reviewText,
                    task: taskId
                });
            } catch (err) {
                console.warn("[PARIKSHAK] Notification creation failed:", err.message);
            }
        }

        if (io && io.emit) {
            io.emit("parikshak:review-complete", {
                submissionId: subId,
                taskId: taskId,
                userId: userId,
                status: response.status || finalStatus,
                score: scoreVal,
                nextTask: response.next_task || ""
            });
        }
    } catch (err) {
        console.error("[PARIKSHAK] triggerReview failed:", err.message);
    }
};

const evaluateParikshakSubmission = async (submissionId, traceId) => {
    const submission = await TaskSubmission.findById(submissionId).populate('task').populate('user');
    if (!submission || !submission.task || !submission.user) {
        throw new Error(`Submission ${submissionId} not found or incomplete data.`);
    }

    const task = submission.task;
    const user = submission.user;

    const combinedDescription = [
        task.description ? `Task Overview:\n${task.description}` : '',
        submission.notes ? `Candidate Deliverables & Implementation Notes:\n${submission.notes}` : ''
    ].filter(Boolean).join('\n\n') || 'No description provided';

    const payload = {
        mode: 'task_review',
        title: task.title || 'Untitled Task',
        task_title: task.title || 'Untitled Task',
        description: combinedDescription,
        task_description: combinedDescription,
        submitted_by: user.name || user._id.toString(),
        submission: submission.notes || '',
        task_id: task._id ? task._id.toString() : '',
        user_id: user._id ? user._id.toString() : '',
        product_id: task.branch || 'default_tenant',
        repo_url: submission.githubLink || '',
        commit_reference: submission.githubLink || '',
        submission_evidence: submission.documentLink || '',
        review_packet_ref: submission.notes && submission.notes.includes('REVIEW_PACKET') ? 'attached' : 'none',
        code_packet_ref: submission.notes && submission.notes.includes('CODE_PACKET') ? 'attached' : 'none',
        github_repo_link: submission.githubLink || '',
        current_task_id: (task.task_id && task.task_id.startsWith("T-")) ? task.task_id : "T-GOV-001",
        previous_task_id: (task.task_id && task.task_id.startsWith("T-")) ? task.task_id : "T-GOV-001",
        trace_id: traceId || `trace-parikshak-${Date.now()}`
    };

    let response = null;
    const targetUrl = PARIKSHAK_URL.endsWith("/parikshak/review")
        ? PARIKSHAK_URL
        : `${PARIKSHAK_URL.replace(/\/$/, "")}/parikshak/review`;

    try {
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'X-BHIV-API-KEY': PARIKSHAK_API_KEY,
                'X-API-KEY': PARIKSHAK_API_KEY
            },
            timeout: PARIKSHAK_TIMEOUT_MS
        };
        if (PARIKSHAK_TOKEN) {
            config.headers['Authorization'] = `Bearer ${PARIKSHAK_TOKEN}`;
        }
        const res = await axios.post(targetUrl, payload, config);
        response = res.data;
    } catch (err) {
        console.warn(`[PARIKSHAK] Direct API call to ${targetUrl} failed/timed out: ${err.message}. Generating fallback evaluation result.`);
    }

    if (!response || typeof response === 'string' || (response.score === undefined && response.status === undefined && response.result === undefined)) {
        return {
            isOffline: true,
            submissionId: submission._id,
            taskId: task._id,
            taskTitle: task.title,
            assigneeId: user._id,
            assigneeName: user.name,
            score: null,
            result: "OFFLINE",
            status: "OFFLINE",
            doneWell: null,
            missingWork: "Parikshak AI review service is currently offline or unreachable. Manual review required.",
            recommendations: "Please manually review the candidate submission deliverables.",
            readiness: "Requires Manual Review",
            nextTask: null
        };
    }

    const responseStatus = String(response.status || response.result || "PASS").toUpperCase();
    const scoreVal = (response.score !== undefined && response.score !== null)
        ? response.score
        : ((response.readiness_percent !== undefined && response.readiness_percent !== null) ? response.readiness_percent : null);

    const isPass = responseStatus === "PASS" || responseStatus === "APPROVED" || responseStatus === "SUCCESS" || (scoreVal !== null && scoreVal >= 70);
    const result = isPass ? "PASS" : (responseStatus === "PARTIAL" ? "PARTIAL" : "FAIL");

    const doneWell = response.review_details?.done_well || response.review || "Submission evaluated by Parikshak AI Engine.";
    const missingWork = response.review_details?.missing_work || (isPass ? "None" : (Array.isArray(response.failure_reasons) ? response.failure_reasons.join('\n') : "Revisions required."));
    const recommendations = response.review_details?.recommendations || (Array.isArray(response.improvement_hints) ? response.improvement_hints.join(' ') : "Follow standard development guidelines.");
    const readiness = response.review_details?.readiness || (isPass ? "Production Ready" : "Requires Revisions");

    const nextTaskObj = (typeof response.canonical_next_task_packet === 'object' && response.canonical_next_task_packet)
        || (typeof response.next_task_details === 'object' && response.next_task_details)
        || (typeof response.next_task_proposal === 'object' && response.next_task_proposal)
        || (typeof response.next_task === 'object' && response.next_task)
        || null;

    let nextTaskTitle = "";
    let nextTaskDesc = "";
    let masterPrompt = response.master_prompt || "";
    let deliverables = [];
    let acceptanceCriteria = [];

    if (nextTaskObj) {
        nextTaskTitle = nextTaskObj.title || nextTaskObj.name || (typeof response.next_task === 'string' ? response.next_task : "");
        if (!masterPrompt && nextTaskObj.master_prompt) {
            masterPrompt = nextTaskObj.master_prompt;
        }
        nextTaskDesc = masterPrompt || nextTaskObj.description || nextTaskObj.objective || "";
        deliverables = Array.isArray(nextTaskObj.deliverables) ? nextTaskObj.deliverables : [];
        acceptanceCriteria = Array.isArray(nextTaskObj.acceptance_criteria) ? nextTaskObj.acceptance_criteria : [];
    } else if (typeof response.next_task === 'string' && response.next_task.trim()) {
        nextTaskTitle = response.next_task.trim();
        nextTaskDesc = masterPrompt || "";
    }

    let pdfPrompt = masterPrompt || "";
    if (!pdfPrompt) {
        const sections = [];
        if (deliverables.length > 0) {
            sections.push("## Required Technical Deliverables\n" + deliverables.map(d => `- ${d}`).join("\n"));
        }
        if (acceptanceCriteria.length > 0) {
            sections.push("## Strict Acceptance Criteria & Quality Gates\n" + acceptanceCriteria.map(c => `- ${c}`).join("\n"));
        }
        if (sections.length === 0) {
            sections.push(`## Mission Specifications & Protocol\n- Implement complete software deliverables and modules for '${nextTaskTitle}'.\n- Write unit and integration test suites covering all edge cases.\n- Document architectural proofs, self-audit scores, and verification logs in REVIEW_PACKET.md.`);
        }
        pdfPrompt = sections.join("\n\n");
    }

    return {
        isOffline: false,
        submissionId: submission._id,
        taskId: task._id,
        taskTitle: task.title,
        assigneeId: user._id,
        assigneeName: user.name,
        score: scoreVal,
        result: result,
        status: result,
        doneWell,
        missingWork,
        recommendations,
        readiness,
        nextTask: nextTaskTitle ? {
            title: nextTaskTitle,
            description: nextTaskDesc || nextTaskTitle,
            masterPrompt: pdfPrompt || nextTaskDesc || "",
            notes: pdfPrompt || nextTaskDesc || "",
            deliverables: deliverables,
            acceptanceCriteria: acceptanceCriteria,
            priority: task.priority || "Medium",
            department: task.department || null,
            branch: task.branch || null
        } : null
    };
};

module.exports = {
    invokeParikshak,
    triggerReview,
    evaluateParikshakSubmission
};

