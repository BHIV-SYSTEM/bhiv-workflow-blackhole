/**
 * taskIngestionService.js — Automated Engineering Task Ingestion Engine
 * 
 * Replaces manual task upload:
 * Task Document (PDF / DOCX / MD / TXT) -> Ingestion -> AI Cleaning -> 
 * Canonical Packet Generation -> Candidate Detection -> Dependency Validation ->
 * NIYANTRAN Task Creation -> Automatic Assignment -> Admin Approval (Optional) -> 
 * Publish -> Candidate Notification.
 */

const Task = require("../models/Task");
const User = require("../models/User");
const Department = require("../models/Department");
const Notification = require("../models/Notification");
const { executeConstitutionalPipeline } = require("./setuConvergenceService");
const { uploadToCloudinary } = require("../utils/cloudinary");
const crypto = require("crypto");
const zlib = require("zlib");

/**
 * Helper to detect PDF binary gibberish noise and content stream operators
 */
function isGibberish(str) {
  if (!str || str.length < 3) return true;
  if (/(Skia\/PDF|Google Docs Renderer|PDFKit|CreationDate|ModDate|Producer|obj|endobj|%PDF|Catalog|Pages|stream|endstream|\/Type|\/Page|\/Font|\/Encoding|\/MediaBox|\/Resources|\/Parent|\/Contents|\/ProcSet|\/Filter|xref|trailer|startxref|%%EOF)/i.test(str)) return true;
  if (/^\/[A-Z][a-zA-Z0-9]+/i.test(str)) return true;
  if (/^\(?D:\d+/i.test(str)) return true;
  if (/^(xref|trailer|startxref|%%EOF|EOF)$/i.test(str) || /^\s*%/.test(str)) return true;
  if (/^\d{10}\s+\d{5}\s+[fn]/i.test(str)) return true;
  if (/^\d+\s+\d+\s+(?:obj|\(|<)/i.test(str)) return true;
  if (/[^\x20-\x7E\s]/.test(str) && (str.match(/[^\x20-\x7E\s]/g) || []).length > 2) return true;
  if ((str.match(/[0-9a-fA-F]{8,}/g) || []).length > 2) return true;
  // Detect PDF content stream operators used for positioning (Tm, TJ, cm, BT, ET, Tf, Td, TD, Tj, Do, gs, cs, CS, SCN, scn, q, Q, re, W, n, S, s, f, F, B, b)
  if (/^[\d\s.\-]+(Tm|TJ|cm|BT|ET|Tf|Td|TD|Tj|Do|gs|cs|CS|SCN|scn|RG|rg|K|k|re|Tw|Tc|TL|Ts|Tr|T\*)(\s|$)/.test(str)) return true;
  if (/^\[[\d\s.\-]+\]\s*(TJ|Tj)$/.test(str.trim())) return true; // arrays of only numbers before TJ
  return false;
}

/**
 * Checks if a string looks like real prose text (not PDF operators or gibberish).
 * Returns true if the text is plausibly human-readable content.
 */
function isReadableProse(text) {
  if (!text || text.trim().length < 10) return false;
  const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return false;

  // Count lines that look like PDF content stream operators or known gibberish
  const pdfOpPattern = /^([\d.\s\-]+)?(Tm|TJ|cm|BT|ET|Tf|Td|TD|Tj|Do|gs|q|Q|re|Tw|Tc|TL|Ts|T\*|RG|rg|K|k|SCN|scn)(\s|$)/i;
  const numericHeavy = /^[\[\]\d\s.\-]+$/;
  let opLineCount = 0;
  let proseLineCount = 0;

  for (const line of lines) {
    if (isGibberish(line) || pdfOpPattern.test(line) || numericHeavy.test(line)) {
      opLineCount++;
    } else if (/[a-zA-Z]{3,}/.test(line) && !/^[\d\s.\-]+$/.test(line)) {
      proseLineCount++;
    }
  }

  // If more than 40% of lines are PDF operators or known gibberish, reject
  if (lines.length > 3 && opLineCount / lines.length > 0.4) return false;
  // Must have at least some prose lines
  if (proseLineCount === 0 && lines.length > 2) return false;
  return true;
}

/**
 * Native zlib stream decompression fallback for compressed FlateDecode PDF streams
 */
function extractPdfStreamText(fileBuffer) {
  try {
    const streamStartMarker = Buffer.from("stream");
    const streamEndMarker = Buffer.from("endstream");
    const extractedStrings = [];
    let searchPos = 0;

    while (searchPos < fileBuffer.length) {
      const startIdx = fileBuffer.indexOf(streamStartMarker, searchPos);
      if (startIdx === -1) break;

      let contentStart = startIdx + streamStartMarker.length;
      if (fileBuffer[contentStart] === 0x0d && fileBuffer[contentStart + 1] === 0x0a) {
        contentStart += 2;
      } else if (fileBuffer[contentStart] === 0x0a || fileBuffer[contentStart] === 0x0d) {
        contentStart += 1;
      }

      const endIdx = fileBuffer.indexOf(streamEndMarker, contentStart);
      if (endIdx === -1) break;

      let contentEnd = endIdx;
      if (fileBuffer[contentEnd - 1] === 0x0a) contentEnd--;
      if (fileBuffer[contentEnd - 1] === 0x0d) contentEnd--;

      const streamBuffer = fileBuffer.subarray(contentStart, contentEnd);
      let decompressed = null;

      try {
        decompressed = zlib.inflateSync(streamBuffer).toString("utf-8");
      } catch (e1) {
        try {
          decompressed = zlib.unzipSync(streamBuffer).toString("utf-8");
        } catch (e2) {
          try {
            decompressed = zlib.inflateRawSync(streamBuffer).toString("utf-8");
          } catch (e3) {
            decompressed = streamBuffer.toString("utf-8");
          }
        }
      }

      if (decompressed && typeof decompressed === "string") {
        const innerStrRegex = /\(([^()\\]|\\[\s\S])*\)/g;
        let tMatch;

        while ((tMatch = innerStrRegex.exec(decompressed)) !== null) {
          let str = tMatch[0].slice(1, -1);
          str = str
            .replace(/\\([()\\])/g, "$1")
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t");

          // Only accept strings that are real words (>=3 letters), not just PDF operator shortcodes
          if (str.length > 1 && /[a-zA-Z]{3,}/.test(str) && !isGibberish(str)) {
            extractedStrings.push(str.trim());
          }
        }
        // NOTE: rawTokens fallback removed — it picked up PDF content-stream operator lines
        // (e.g. "Tm", "TJ", "cm") which are not human-readable text.
      }

      searchPos = endIdx + streamEndMarker.length;
    }

    if (extractedStrings.length > 0) {
      return extractedStrings.join("\n");
    }
  } catch (err) {
    console.warn("[TASK-INGESTION] PDF stream decompression fallback notice:", err.message);
  }
  return "";
}

/**
 * Safely parses text from PDF buffer using pdf-parse (v1 or v2)
 */
async function parsePdfBuffer(fileBuffer) {
  try {
    const pdfLib = require("pdf-parse");
    const PDFClass = pdfLib.PDFParse || (typeof pdfLib === "function" ? pdfLib : null);
    if (PDFClass && typeof PDFClass === "function" && PDFClass.prototype && typeof PDFClass.prototype.load === "function") {
      const uint8 = new Uint8Array(fileBuffer);
      const parser = new PDFClass({ data: uint8 });
      await parser.load();
      const res = await parser.getText();
      if (typeof res === "string" && res.trim().length > 0) return res;
      if (res && typeof res.text === "string" && res.text.trim().length > 0) return res.text;
    }
    if (typeof pdfLib === "function") {
      const data = await pdfLib(fileBuffer);
      if (data && typeof data.text === "string" && data.text.trim().length > 0) return data.text;
    }
  } catch (err) {
    console.warn("[TASK-INGESTION] pdf-parse parser notice:", err.message);
  }
  return "";
}

/**
 * Extracts raw text from multi-format files (PDF, DOCX, MD, TXT)
 */
async function extractTextFromDocument(fileBuffer, mimeType = "", filename = "", metadata = {}) {
  try {
    const ext = (filename || "").split(".").pop().toLowerCase();
    const fallbackMetaText = (metadata.content || metadata.taskText || metadata.description || "").trim();

    if (fileBuffer instanceof Buffer && fileBuffer.length > 0) {
      // Handle plain text, markdown, or doc files directly
      if (ext === "md" || ext === "txt" || ext === "doc" || mimeType.includes("text") || mimeType.includes("markdown")) {
        const text = fileBuffer.toString("utf-8");
        if (text && text.trim().length > 0 && /[a-zA-Z0-9]/.test(text)) return text;
      }

      // Word .docx XML tag extraction
      if (ext === "docx" || mimeType.includes("word") || mimeType.includes("officedocument")) {
        const rawContent = fileBuffer.toString("utf-8");
        const wtMatches = rawContent.match(/<w:t[^>]*>([^<]+)<\/w:t>/gi);
        if (wtMatches && wtMatches.length > 0) {
          const docxText = wtMatches.map((m) => m.replace(/<[^>]+>/g, "")).join(" ");
          if (docxText && docxText.trim().length > 0 && /[a-zA-Z0-9]/.test(docxText)) return docxText;
        }
        // Fallback ASCII text extraction
        const cleanAscii = rawContent.replace(/<[^>]+>/g, " ").replace(/[\x00-\x1F\x7F-\xFF]/g, " ").replace(/\s+/g, " ").trim();
        if (cleanAscii.length > 20 && /[a-zA-Z0-9]/.test(cleanAscii)) return cleanAscii;
      }

      // PDF Extraction via parsePdfBuffer & zlib stream inflation fallback
      if (ext === "pdf" || mimeType.includes("pdf")) {
        const parsedText = await parsePdfBuffer(fileBuffer);
        if (typeof parsedText === "string" && parsedText.trim().length > 0 && /[a-zA-Z0-9]/.test(parsedText)) {
          return parsedText;
        }

        // Native zlib stream decompression fallback for compressed FlateDecode PDF streams
        const zlibExtracted = extractPdfStreamText(fileBuffer);
        if (zlibExtracted && zlibExtracted.trim().length > 0 && isReadableProse(zlibExtracted)) {
          return zlibExtracted;
        }

        // Safe fallback for simple / uncompressed PDF text streams
        const rawContent = fileBuffer.toString("latin1");
        const textMatches = [];
        const pdfTextRegex = /\(([^()\\]|\\[\s\S])*\)/g;
        let match;
        while ((match = pdfTextRegex.exec(rawContent)) !== null) {
          let str = match[0].slice(1, -1);
          str = str.replace(/\\([()\\])/g, "$1").replace(/\\n/g, "\n").replace(/\\r/g, "\r");
          if (/[a-zA-Z0-9]/.test(str) && !/[\x00-\x08\x0E-\x1F\x7F-\xFF]/.test(str) && !isGibberish(str)) {
            textMatches.push(str.trim());
          }
        }
        const extractedFallback = textMatches.filter((t) => t.length > 1 && !isGibberish(t)).join("\n");
        if (extractedFallback && extractedFallback.trim().length > 0 && /[a-zA-Z0-9]/.test(extractedFallback)) {
          return extractedFallback;
        }
      }

      // Fallback cleaning for raw text streams (non-PDF or last resort)
      let rawContent = fileBuffer.toString("utf-8");
      let textContent = rawContent
        .replace(/%PDF-[0-9\.]+/g, " ")
        .replace(/obj[\s\S]*?endobj/g, " ")
        .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ");

      const pdfOpLinePattern = /^([\d.\s\-]+)?(Tm|TJ|cm|BT|ET|Tf|Td|TD|Tj|Do|gs|q|Q|re|Tw|Tc|TL|Ts|T\*|RG|rg|K|k|w|J|j|M|d|ri)(\s|$)/i;
      const cleanLines = textContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) =>
          line.length > 0 &&
          /[a-zA-Z]{3,}/.test(line) &&
          !isGibberish(line) &&
          !/^\d+\s+\d+\s+(?:obj|\(|<)/i.test(line) &&
          !/^[0-9a-fA-F<>\s\\%\/]+$/.test(line) &&
          !pdfOpLinePattern.test(line) &&
          !/^\[([\d\s.\-]+)\]\s*(TJ|Tj)$/.test(line.trim())
        );

      const cleanBufferText = cleanLines.join("\n");
      if (cleanBufferText && cleanBufferText.trim().length > 0 && isReadableProse(cleanBufferText)) {
        return cleanBufferText;
      }
    }

    if (typeof fileBuffer === "string" && fileBuffer.trim().length > 0 && /[a-zA-Z0-9]/.test(fileBuffer)) {
      return fileBuffer;
    }

    // Fallback to metadata text if document buffer was empty or contained unparseable binary content
    if (fallbackMetaText && fallbackMetaText.length > 0 && /[a-zA-Z0-9]/.test(fallbackMetaText)) {
      return fallbackMetaText;
    }

    if (metadata.title && metadata.title.length > 0 && /[a-zA-Z0-9]/.test(metadata.title)) {
      return `Task Title: ${metadata.title}`;
    }

    return "";
  } catch (err) {
    console.warn("[TASK-INGESTION] Document text extraction error:", err.message);
    return metadata.content || metadata.taskText || metadata.description || "";
  }
}

/**
 * AI Cleaning & Formatting Algorithm — removes noise and normalizes structure
 */
function cleanAndFormatTaskText(rawText) {
  const strInput = typeof rawText === "string" ? rawText : String(rawText || "");
  let cleaned = strInput
    // Strip common intern notes or boilerplate markers
    .replace(/(INTERNAL USE ONLY|DRAFT TASK PACKET|INTERN UPLOAD|MANUAL WORKFLOW)/gi, "")
    // Normalize headers
    .replace(/\r\n/g, "\n")
    // Multiple spaces to single space
    .replace(/ {2,}/g, " ")
    .trim();

  // Explicit title pattern detection (Task Title: ..., Task: ..., Title: ...)
  let title = null;
  const titleMatch = cleaned.match(/(?:Task\s*Title|Task|Title)\s*:\s*([^\n]+)/i);
  if (titleMatch && titleMatch[1]) {
    const candidate = titleMatch[1].trim();
    if (!isGibberish(candidate) && candidate.length > 3) {
      title = candidate;
    }
  }

  // Fallback to first prominent readable line
  if (!title) {
    const lines = cleaned
      .split("\n")
      .map((l) => l.replace(/^(#+|Task\s*Title:|Task:|Title:|\d+\.)/i, "").trim())
      .filter((l) => l.length > 3 && !isGibberish(l) && /[a-zA-Z]/.test(l));

    if (lines.length > 0) {
      title = lines[0];
    }
  }

  if (!title || isGibberish(title) || title.length < 3) {
    title = "Ingested Task Document";
  }

  if (title.length > 120) {
    title = title.substring(0, 117) + "...";
  }

  // Extract priority
  let priority = "Medium";
  if (/priority\s*:\s*(?:high|urgent|critical|blocker)/i.test(cleaned)) {
    priority = "High";
  } else if (/priority\s*:\s*(?:low|minor|backlog)/i.test(cleaned)) {
    priority = "Low";
  }

  // Extract assignee candidate hint
  let assigneeHint = null;
  const assigneeMatch = cleaned.match(/(?:assignee|assign to|candidate|owner)\s*:\s*([^\n,\r|]+)/i);
  if (assigneeMatch && assigneeMatch[1]) {
    let rawAssignee = assigneeMatch[1].trim();
    rawAssignee = rawAssignee.split(/(?:priority|department|dept|project|overview|##|\r|\n)/i)[0].trim();
    if (rawAssignee.length > 0 && !isGibberish(rawAssignee)) {
      assigneeHint = rawAssignee;
    }
  }

  // Extract project hint
  let projectHint = null;
  const projectMatch = cleaned.match(/(?:project|repository|repo)\s*:\s*([^\n,\r|]+)/i);
  if (projectMatch && projectMatch[1]) {
    let rawProj = projectMatch[1].trim();
    rawProj = rawProj.split(/(?:priority|assignee|department|dept|overview|##|\r|\n)/i)[0].trim();
    if (rawProj.length > 0 && !isGibberish(rawProj)) {
      projectHint = rawProj;
    }
  }

  // Extract department hint
  let departmentHint = null;
  const deptMatch = cleaned.match(/(?:department|dept)\s*:\s*([^\n,\r|]+)/i);
  if (deptMatch && deptMatch[1]) {
    let rawDept = deptMatch[1].trim();
    rawDept = rawDept.split(/(?:priority|assignee|owner|project|overview|##|\r|\n)/i)[0].trim();
    if (rawDept.length > 0 && !isGibberish(rawDept)) {
      departmentHint = rawDept;
    }
  }

  // ── Extract only the actual Description/Overview section ────────────────
  // Strategy:
  // ── Extract ONLY the actual Overview/Description paragraph (2-3 lines) ──────────
  let description = "";

  const DESC_SECTION_PATTERN = /(?:^|\n)[ \t]*(?:task\s*)?(?:description|overview|summary|objective|background|scope|context|details?|problem\s*statement|goal)[ \t]*:[ \t]*([\s\S]*?)(?=\n[ \t]*(?:mission|phase|deliverables?|acceptance\s*criteria|section|step|title|task\s*title|priority|assignee|department|\d+\.|##|—|---|===)[ \t]*:?|$)/i;

  const descSectionMatch = cleaned.match(DESC_SECTION_PATTERN);
  if (descSectionMatch && descSectionMatch[1]) {
    const raw = descSectionMatch[1].trim();
    const pdfOpLinePatternDesc = /^([\d.\s\-]+)?(Tm|TJ|cm|BT|ET|Tf|Td|TD|Tj|Do|gs|q|Q|re|Tw|Tc|TL|Ts|T\*|RG|rg|K|k|w|J|j|M|d|ri)(\s|$)/i;
    const sectionLines = raw
      .split("\n")
      .filter((l) => l.trim().length > 0 && !isGibberish(l.trim()) && !pdfOpLinePatternDesc.test(l.trim()));
    if (sectionLines.length > 0) {
      description = sectionLines.join("\n").trim();
    }
  }

  // Fallback: capture ONLY the first 2-3 lines / paragraph of prose (max 350 chars)
  if (!description) {
    const metaKeyPattern = /^(?:task\s*title|title|task|priority|assignee|assign\s*to|department|dept|due\s*date?|deadline|status|project|phase|sprint|repository|repo|owner|duration|candidate|branch|label|tag|type|version|date|time|created|issued|id)\s*:/i;
    const pdfOpLinePatternDesc = /^([\d.\s\-]+)?(Tm|TJ|cm|BT|ET|Tf|Td|TD|Tj|Do|gs|q|Q|re|Tw|Tc|TL|Ts|T\*|RG|rg|K|k|w|J|j|M|d|ri)(\s|$)/i;
    const allLines = cleaned.split("\n").map((l) => l.trim());
    const proseLines = [];

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      if (!line || isGibberish(line) || pdfOpLinePatternDesc.test(line)) continue;
      if (metaKeyPattern.test(line)) continue;
      if (/^(?:mission|phase\s*\d+|deliverables?|acceptance)/i.test(line)) break;
      proseLines.push(line);
      if (proseLines.join(" ").length > 350) break;
    }

    if (proseLines.length > 0) {
      description = proseLines.join("\n").trim();
    }
  }

  // Strip top metadata header lines and cut off before Mission or Phase sections
  if (description) {
    let descLines = description.split("\n");
    while (descLines.length > 0) {
      const line = descLines[0].trim();
      const isMetaHeader = /^(?:Task\s*Title|Title|Department|Dept|Assignee(?:\s*Candidate)?|Assign\s*to|Owner|Candidate|Priority|Target\s*Date|Due\s*Date?|Deadline|Overview\s*&\s*Description)\s*[:\n\-]?$/i.test(line) ||
                           /^(?:Task\s*Title|Title|Department|Dept|Assignee(?:\s*Candidate)?|Assign\s*to|Owner|Candidate|Priority|Target\s*Date|Due\s*Date?|Deadline)\s*:/i.test(line);
      if (isMetaHeader || line.length === 0) {
        descLines.shift();
      } else {
        break;
      }
    }
    description = descLines.join("\n").trim();
    // Stop before Mission or Phase 1
    description = description.split(/\n[ \t]*(?:Mission|Phase\s*\d+|Final Deliverable)/i)[0].trim();
  }

  if (!description) {
    description = "No description provided.";
  }

  return {
    title,
    description,
    priority,
    assigneeHint,
    projectHint,
    departmentHint,
    cleanedLength: cleaned.length,
    rawLength: strInput.length,
  };
}

/**
 * Generates Canonical Task Packet JSON structure
 */
function generateCanonicalTaskPacket(cleanedResult, filename, mimeType, fileBuffer = null, extras = {}) {
  const ingestionId = `ingest_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const normalizedProduct = (extras.product || "BHIV").toString().trim().toUpperCase() || "BHIV";

  let documentHash = "";
  if (fileBuffer) {
    const buf = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(String(fileBuffer), "utf-8");
    documentHash = crypto.createHash("sha256").update(buf).digest("hex");
  }

  return {
    ingestionId,
    canonicalPacketVersion: "1.0",
    taskDetails: {
      task_id: extras.task_id || null,
      product: normalizedProduct,
      title: cleanedResult.title,
      description: cleanedResult.description,
      priority: cleanedResult.priority,
      status: "Pending",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
    },
    candidateDetection: {
      hint: cleanedResult.assigneeHint,
      matchedUser: null,
    },
    projectDetails: {
      hint: cleanedResult.projectHint,
    },
    provenance: {
      filename: filename || "uploaded_task.txt",
      mimeType: mimeType || "text/plain",
      documentHash,
      ingestedAt: new Date().toISOString(),
      rawLength: cleanedResult.rawLength,
      cleanedLength: cleanedResult.cleanedLength,
      automatedPipeline: "SETU_ENGINEERING_TASK_RUNTIME_V1",
    },
  };
}

/**
 * Resolves Assignee User ID and Department ID from hints or defaults
 */
async function resolveTaskAssigneeAndDepartment(candidateHint, departmentHint, metadata = {}) {
  let assigneeUser = null;
  let department = null;

  try {
    // Determine tenant isolation query scope
    const tenantFilter = {};
    const tenantId = metadata.tenantId || metadata.tenant_id;
    const organization = metadata.organization;
    if (tenantId) {
      tenantFilter.tenantId = tenantId;
    } else if (organization) {
      tenantFilter.organization = organization;
    }

    // 1. Explicit Assignee Override from Metadata (strictly validated)
    if (metadata.assignee) {
      if (require("mongoose").Types.ObjectId.isValid(metadata.assignee)) {
        assigneeUser = await User.findOne({ _id: metadata.assignee, ...tenantFilter }).exec();
      } else {
        const cleanAssignee = String(metadata.assignee).trim();
        assigneeUser = await User.findOne({
          ...tenantFilter,
          $or: [
            { canonicalEmployeeId: cleanAssignee },
            { employeeId: cleanAssignee },
            { email: cleanAssignee.toLowerCase() },
            { username: cleanAssignee },
          ],
        }).exec();
      }
    }

    // 2. Candidate Hint Detection (Exact canonical ID, exact email, or exact username only)
    if (!assigneeUser && candidateHint) {
      const cleanHint = String(candidateHint).trim();
      assigneeUser = await User.findOne({
        ...tenantFilter,
        $or: [
          { canonicalEmployeeId: cleanHint },
          { employeeId: cleanHint },
          { email: cleanHint.toLowerCase() },
          { username: cleanHint },
        ],
      }).exec();
    }

    // 3. Fallback to creator if creator matches tenant
    if (!assigneeUser && metadata.creatorId && require("mongoose").Types.ObjectId.isValid(metadata.creatorId)) {
      assigneeUser = await User.findOne({ _id: metadata.creatorId, ...tenantFilter }).exec();
    }

    // REMOVED: Silent fallback to random non-admin employee (lines 527-532).
    // If candidate cannot be found, leave assigneeUser as null for unassigned handling.

    // 4. Department Resolution
    if (metadata.department && require("mongoose").Types.ObjectId.isValid(metadata.department)) {
      department = await Department.findById(metadata.department).exec();
    }

    if (!department && departmentHint) {
      department = await Department.findOne({
        name: new RegExp(`^${departmentHint.trim()}$`, "i"),
      }).exec();

      if (!department) {
        try {
          department = await Department.create({ name: departmentHint.trim(), description: `${departmentHint.trim()} Department` });
        } catch (cErr) {
          department = await Department.findOne({ name: new RegExp(departmentHint.trim(), "i") }).exec();
        }
      }
    }

    if (!department) {
      department = await Department.findOne().exec();
    }
  } catch (dbErr) {
    console.warn("[TASK-INGESTION] DB Lookup Notice (fallback resolution active):", dbErr.message);
  }

  // Pure in-memory fallback for department if DB lookup returned null
  if (!department || typeof department.name === "undefined") {
    const deptId = require("mongoose").Types.ObjectId.isValid(department) ? department : new (require("mongoose").Types.ObjectId)();
    department = {
      _id: deptId,
      name: departmentHint || "Field Sales",
    };
  }

  // REMOVED: Dummy in-memory user creation. If unassigned, assignee remains null.

  return {
    assignee: assigneeUser ? assigneeUser._id : null,
    assigneeUser: assigneeUser || null,
    department,
    departmentObj: department,
    status: assigneeUser ? "Pending" : "Pending Admin Assignment",
  };
}

/**
 * Executes Automated Task Ingestion Pipeline
 */
async function processTaskIngestion(fileBuffer, metadata = {}) {
  const filename = metadata.filename || "task_document.txt";
  const mimeType = metadata.mimeType || "text/plain";
  const requireApproval = metadata.requireApproval === true;
  const creatorId = metadata.creatorId || null;
  const normalizedProduct = (metadata.product || metadata.productId || metadata.product_id || "BHIV").toString().trim().toUpperCase() || "BHIV";
  const resolvedTaskId = (metadata.task_id || metadata.taskId || "").toString().trim()
    || `T-TSK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  // Step 1: Document Ingestion
  let rawText = await extractTextFromDocument(fileBuffer, mimeType, filename, metadata);
  if (typeof rawText !== "string") {
    rawText = String(rawText || "");
  }

  if (!rawText || rawText.trim().length === 0 || !/[a-zA-Z0-9]/.test(rawText)) {
    throw new Error("DOCUMENT_INGESTION_FAILED: Document content is empty or contains no readable text.");
  }

  // Step 2: AI Cleaning & Formatting
  const cleanedResult = cleanAndFormatTaskText(rawText);

  // Step 3: Canonical Task Packet Generation
  const canonicalPacket = generateCanonicalTaskPacket(cleanedResult, filename, mimeType, fileBuffer, {
    task_id: resolvedTaskId,
    product: normalizedProduct,
  });

  // Step 4: Candidate & Department Detection
  const resolution = await resolveTaskAssigneeAndDepartment(cleanedResult.assigneeHint, cleanedResult.departmentHint, metadata);

  if (resolution.assigneeUser) {
    canonicalPacket.candidateDetection.matchedUser = {
      id: resolution.assigneeUser._id,
      name: resolution.assigneeUser.name || resolution.assigneeUser.username,
      email: resolution.assigneeUser.email,
    };
  }

  // Step 5: Dependency Validation
  const dependencies = [];
  if (metadata.dependencyIds && Array.isArray(metadata.dependencyIds)) {
    dependencies.push(...metadata.dependencyIds);
  }

  // Step 5.5: Document Storage (Cloudinary Upload)
  let documentNote = `Ingested via SETU EOS Pipeline [Ingestion ID: ${canonicalPacket.ingestionId}]`;
  // documentLinks stores the Cloudinary URL(s) for the source PDF/document.
  // These are saved into task.links[] so the UI can render them as explicit clickable links.
  const documentLinks = [];
  if (fileBuffer && Buffer.isBuffer(fileBuffer) && fileBuffer.length > 0) {
    try {
      const cloudinaryUrl = await uploadToCloudinary(fileBuffer, filename);
      if (cloudinaryUrl) {
        documentNote = `Document: ${cloudinaryUrl} (${filename})`;
        canonicalPacket.provenance.documentUrl = cloudinaryUrl;
        // Store URL in links array — this is what the UI renders as the source document link
        documentLinks.push(cloudinaryUrl);
      }
    } catch (cErr) {
      console.warn("[TASK-INGESTION] Cloudinary upload notice:", cErr.message);
    }
  }

  // Step 6: Route Task Creation through 11-Stage SETU EOS Pipeline
  const taskStatus = !resolution.assignee ? "Pending Admin Assignment" : (requireApproval ? "Pending Approval" : "Pending");
  let createdTask = null;

  console.log(`[SETU-INGESTION] Routing Canonical Task Packet through 11-Stage SETU EOS Pipeline...`);

  const setuExecution = await executeConstitutionalPipeline(
    {
      intent: "CREATE_ENGINEERING_TASK",
      domain: "workflow",
      targetCapability: "NIYANTRAN",
      action: "ingest_engineering_task",
      priority: canonicalPacket.taskDetails.priority,
      tenantId: metadata.branch || "blackhole_mumbai",
      actor: metadata.creatorId ? { userId: metadata.creatorId, role: "employee" } : { userId: "setu_ingestion_engine", role: "system" },
      parameters: {
        ingestionId: canonicalPacket.ingestionId,
        canonicalPacket,
        payload: {
          task_id: resolvedTaskId,
          product: normalizedProduct,
          tenantId: metadata.tenantId || "ten-bhiv-core",
          title: canonicalPacket.taskDetails.title,
          description: canonicalPacket.taskDetails.description,
          priority: canonicalPacket.taskDetails.priority,
          status: taskStatus,
          department: resolution.department ? (resolution.department._id || resolution.department) : null,
          assignee: resolution.assignee ? (resolution.assignee._id || resolution.assignee) : null,
          dueDate: canonicalPacket.taskDetails.dueDate,
          dependencies,
          branch: metadata.branch || "blackhole_mumbai",
          notes: documentNote,
          fileType: mimeType,
          // Source document URL(s) stored as proper links — shown in the task detail UI
          links: documentLinks,
        },
      },
    },
    {
      tenantId: metadata.branch || "blackhole_mumbai",
      capabilityHandler: async (resolvedIntent) => {
        const taskPayload = resolvedIntent.parameters?.payload || resolvedIntent.parameters || {};
        const newTask = new Task({
          task_id: taskPayload.task_id || resolvedTaskId,
          product: (taskPayload.product || normalizedProduct || "BHIV").toString().trim().toUpperCase() || "BHIV",
          tenantId: taskPayload.tenantId || metadata.tenantId || "ten-bhiv-core",
          title: taskPayload.title || canonicalPacket.taskDetails.title,
          description: taskPayload.description || canonicalPacket.taskDetails.description,
          priority: taskPayload.priority || canonicalPacket.taskDetails.priority,
          status: taskPayload.status || "Pending",
          department: resolution.department ? new (require("mongoose").Types.ObjectId)(resolution.department) : null,
          assignee: resolution.assignee ? new (require("mongoose").Types.ObjectId)(resolution.assignee) : null,
          dueDate: taskPayload.dueDate || canonicalPacket.taskDetails.dueDate,
          dependencies: taskPayload.dependencies || [],
          branch: taskPayload.branch || "blackhole_mumbai",
          notes: taskPayload.notes || documentNote,
          fileType: mimeType,
          links: taskPayload.links && taskPayload.links.length > 0 ? taskPayload.links : documentLinks,
        });

        try {
          await newTask.save();
        } catch (saveErr) {
          console.warn("[TASK-INGESTION] Task persistence notice:", saveErr.message);
        }
        createdTask = newTask;
        return {
          status: "EXECUTED",
          capability: "NIYANTRAN_TASK_CREATE",
          taskId: newTask._id,
          task: newTask,
        };
      },
    }
  );

  const newTask = createdTask || new Task({
    task_id: resolvedTaskId,
    product: normalizedProduct,
    tenantId: metadata.tenantId || "ten-bhiv-core",
    title: canonicalPacket.taskDetails.title,
    description: canonicalPacket.taskDetails.description,
    priority: canonicalPacket.taskDetails.priority,
    status: taskStatus,
    department: resolution.department ? (resolution.department._id || resolution.department) : null,
    assignee: resolution.assignee ? (resolution.assignee._id || resolution.assignee) : null,
    dueDate: canonicalPacket.taskDetails.dueDate,
    dependencies,
    branch: metadata.branch || "blackhole_mumbai",
    notes: documentNote,
    fileType: mimeType,
    links: documentLinks,
  });

  if (!createdTask) {
    try {
      await newTask.save();
    } catch (saveErr) {
      console.warn("[TASK-INGESTION] Task fallback persistence notice:", saveErr.message);
    }
  }

  // Stamp SETU Trace Evidence onto Canonical Packet
  canonicalPacket.provenance.traceId = setuExecution.traceId || (setuExecution.record && setuExecution.record.traceId);
  canonicalPacket.provenance.lineageHash = setuExecution.lineageHash || (setuExecution.record && setuExecution.record.lineageHash) || "";
  canonicalPacket.provenance.setuPipelineConverged = setuExecution.ok;

  // Candidate Notification
  let notificationSent = false;
  if (resolution.assignee) {
    try {
      await Notification.create({
        recipient: resolution.assignee,
        title: "New Automated Task Assigned",
        message: `Task '${newTask.title}' has been automatically created and assigned to you via SETU EOS Ingestion.`,
        type: "task_assigned",
        task: newTask._id,
      });
      notificationSent = true;
    } catch (notifErr) {
      console.warn("[TASK-INGESTION] Notification log error:", notifErr.message);
    }
  }

  // Populate assignee and department on task object for clean UI rendering
  let populatedTask = null;
  if (newTask && newTask._id) {
    try {
      populatedTask = await Task.findById(newTask._id)
        .populate("department", "name color")
        .populate("assignee", "name avatar email stillExist employeeId canonicalEmployeeId")
        .populate("dependencies", "title status");
    } catch (popErr) {
      console.warn("[TASK-INGESTION] Task population notice:", popErr.message);
    }
  }

  return {
    ok: true,
    status: "TASK_INGESTED_SUCCESSFULLY",
    ingestionId: canonicalPacket.ingestionId,
    taskId: newTask._id,
    task: populatedTask ? populatedTask.toObject() : newTask,
    canonicalPacket,
    assigneeResolved: !!resolution.assignee,
    notificationSent,
    provenancePreserved: true,
  };
}

module.exports = {
  extractTextFromDocument,
  cleanAndFormatTaskText,
  generateCanonicalTaskPacket,
  resolveTaskAssigneeAndDepartment,
  processTaskIngestion,
};
