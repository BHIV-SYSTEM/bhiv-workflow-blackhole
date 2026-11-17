/**
 * bucketClient.js
 *
 * Niyantran's client for BHIV Bucket (bhiv-bucket FastAPI service).
 */

"use strict";

const axios = require("axios");
const { randomUUID } = require("crypto");

const BUCKET_BASE_URL = (
  process.env.BUCKET_BASE_URL ||
  process.env.BUCKET_VM_URL ||
  process.env.BUCKET_URL ||
  ""
).replace(/\/+$/, "");
const BUCKET_API_KEY = process.env.BUCKET_API_KEY;
const BUCKET_TIMEOUT_MS = parseInt(process.env.BUCKET_TIMEOUT_MS || "20000", 10);

const NIYANTRAN_INTEGRATION_ID = "niyantran-hr-platform";
const NIYANTRAN_REQUESTER_ID = "niyantran";
const BUCKET_SCHEMA_VERSION = "1.0.0";

const ARTIFACT_TYPES = {
  SCREENSHOT: "agent_outputs",
  EXPORT: "agent_outputs",
  AUDIT_TRAIL: "audit_trails",
  EVENT_RECORD: "event_records",
  EXECUTION_METADATA: "execution_metadata",
};

// Cached last accepted hash for the direct /bucket/artifact chain
let _lastAcceptedHash = null;
let _hashBootstrapped = false;


function buildHttpClient() {
  if (!BUCKET_BASE_URL) {
    throw new Error(
      "[bucketClient] BUCKET_BASE_URL is not set."
    );
  }

  const headers = {
    "Content-Type": "application/json",
    "x-source": "niyantran",
  };
  if (BUCKET_API_KEY) {
    headers["x-api-key"] = BUCKET_API_KEY;
  }

  return axios.create({
    baseURL: BUCKET_BASE_URL,
    timeout: BUCKET_TIMEOUT_MS,
    headers,
  });
}

let _httpClientInstance = null;
function getHttpClient() {
  if (!_httpClientInstance) {
    _httpClientInstance = buildHttpClient();
  }
  return _httpClientInstance;
}

async function _bootstrapHash(client) {
  if (_lastAcceptedHash) return _lastAcceptedHash;
  try {
    const res = await client.get("/bucket/latest-hash");
    if (res.data && (res.data.last_hash || res.data.hash)) {
      _lastAcceptedHash = res.data.last_hash || res.data.hash;
      _hashBootstrapped = true;
      console.log(`[bucketClient] Bootstrapped hash: ${_lastAcceptedHash}`);
    }
  } catch (err) {
    // Not fatal — do not lock _hashBootstrapped = true so future calls can retry
    const errMsg = err.response?.data?.detail?.message || err.response?.data?.detail || err.response?.data?.message || err.message;
    console.warn(`[bucketClient] Hash bootstrap attempt failed: ${errMsg}`);
  }
  return _lastAcceptedHash;
}

async function getArtifactPolicy() {
  const client = getHttpClient();
  const res = await client.get("/governance/artifacts/policy");
  return res.data;
}

async function validateArtifactAdmission(artifactType, payloadSizeBytes) {
  const client = getHttpClient();
  try {
    const res = await client.post("/governance/gate/validate-operation", null, {
      params: {
        operation_type: "CREATE",
        artifact_class: artifactType,
        data_size: payloadSizeBytes,
        integration_id: NIYANTRAN_INTEGRATION_ID,
      },
    });
    return { valid: true, response: res.data };
  } catch (err) {
    if (err.response?.status === 403) {
      return {
        valid: false,
        reason: err.response.data?.detail?.reason || "governance_rejected",
      };
    }
    throw err;
  }
}

function buildArtifactEnvelope({ artifactType, traceId, payload, parentHash }) {
  return {
    artifact_id: randomUUID(),
    trace_id: traceId || randomUUID(),
    timestamp_utc: new Date().toISOString(),
    schema_version: BUCKET_SCHEMA_VERSION,
    source_module_id: NIYANTRAN_REQUESTER_ID,
    artifact_type: artifactType,
    parent_hash: parentHash || null,
    payload,
  };
}

async function writeArtifact({ artifactType, traceId, payload, parentHash }) {
  const client = getHttpClient();

  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");

  const admission = await validateArtifactAdmission(artifactType, payloadBytes);
  if (!admission.valid) {
    const err = new Error(
      `[bucketClient] Artifact admission rejected by Bucket governance: ${admission.reason}`
    );
    err.code = "BUCKET_ADMISSION_REJECTED";
    err.reason = admission.reason;
    throw err;
  }

  const artifact = buildArtifactEnvelope({ artifactType, traceId, payload, parentHash });

  const body = {
    requester_id: NIYANTRAN_REQUESTER_ID,
    integration_id: NIYANTRAN_INTEGRATION_ID,
    artifact,
  };

  let res;
  try {
    res = await client.post("/bucket/artifacts/write", body);
  } catch (err) {
    const errorDetails = err.response?.data?.detail?.message || err.response?.data?.detail || err.response?.data?.message || err.message;
    const customErr = new Error(`[bucketClient] Bucket write failed: ${errorDetails}`);
    customErr.code = "BUCKET_WRITE_FAILED";
    customErr.statusCode = err.response?.status;
    customErr.bucketResponse = err.response?.data;
    throw customErr;
  }

  if (!res.data.success) {
    const err = new Error(
      `[bucketClient] Bucket write failed: ${res.data.error || "Unknown error"}`
    );
    err.code = "BUCKET_WRITE_FAILED";
    err.bucketResponse = res.data;
    throw err;
  }

  return res.data.data;
}


// Bounded FIFO queue to process Karma artifact writes sequentially without memory accumulation
const _karmaWriteQueue = [];
let _isProcessingKarmaQueue = false;
const MAX_PENDING_KARMA_WRITES = 10;

async function _processKarmaQueue() {
  if (_isProcessingKarmaQueue) return;
  _isProcessingKarmaQueue = true;

  while (_karmaWriteQueue.length > 0) {
    const task = _karmaWriteQueue.shift();
    if (!task) break;

    try {
      const client = getHttpClient();
      await _bootstrapHash(client);

      const { subjectId, signal, severity, ttl, opaqueReasonCode, traceId } = task.params;
      const artifactId = randomUUID();
      const resolvedTraceId = traceId || randomUUID();

      const body = {
        artifact_id: artifactId,
        trace_id: resolvedTraceId,
        timestamp_utc: new Date().toISOString(),
        schema_version: BUCKET_SCHEMA_VERSION,
        source_module_id: NIYANTRAN_REQUESTER_ID,
        artifact_type: ARTIFACT_TYPES.EVENT_RECORD,
        payload: {
          subject_id: subjectId,
          product_context: "workflow",
          signal,
          severity,
          ttl,
          requires_core_ack: true,
          opaque_reason_code: opaqueReasonCode,
          emitted_at: new Date().toISOString(),
          source: "niyantran",
        },
      };

      if (_lastAcceptedHash) {
        body.parent_hash = _lastAcceptedHash;
      }

      let res;
      try {
        res = await client.post("/bucket/artifact", body);
      } catch (postErr) {
        if (postErr.response?.status === 400) {
          const apiMsg = postErr.response?.data?.detail?.message || postErr.response?.data?.detail || postErr.response?.data?.message || postErr.message;
          console.warn(`[bucketClient] 400 error on /bucket/artifact (${apiMsg}), auto-recovering parent hash...`);

          try {
            const hashRes = await client.get("/bucket/latest-hash");
            if (hashRes.data && (hashRes.data.last_hash || hashRes.data.hash)) {
              _lastAcceptedHash = hashRes.data.last_hash || hashRes.data.hash;
              body.parent_hash = _lastAcceptedHash;
              console.log(`[bucketClient] Re-fetched latest hash: ${_lastAcceptedHash}, retrying write once...`);
              res = await client.post("/bucket/artifact", body);
            } else {
              throw postErr;
            }
          } catch (retryErr) {
            const retryMsg = retryErr.response?.data?.detail?.message || retryErr.response?.data?.detail || retryErr.response?.data?.message || retryErr.message;
            const err = new Error(`[bucketClient] Retry failed after parent hash auto-recovery: ${retryMsg}`);
            err.statusCode = retryErr.response?.status || 400;
            throw err;
          }
        } else {
          const errorDetails = postErr.response?.data?.detail?.message || postErr.response?.data?.detail || postErr.response?.data?.message || postErr.message;
          const err = new Error(`[bucketClient] /bucket/artifact write error: ${errorDetails}`);
          err.statusCode = postErr.response?.status;
          throw err;
        }
      }

      if (res.data && (res.data.hash || res.data.success)) {
        const newHash = res.data.hash || res.data.data?.hash;
        if (newHash) {
          _lastAcceptedHash = newHash;
        }
        const out = {
          artifact_id: artifactId,
          hash: newHash,
          parent_hash: body.parent_hash || null,
          timestamp_utc: body.timestamp_utc,
        };
        task.resolve(out);
      } else {
        const err = new Error(`[bucketClient] Unexpected response from /bucket/artifact: ${JSON.stringify(res.data)}`);
        task.reject(err);
      }
    } catch (err) {
      const errorDetails = err.response?.data?.detail?.message || err.response?.data?.detail || err.response?.data?.message || err.message;
      console.error(`[bucketClient] storeKarmaEventRecord failed: ${errorDetails}`);
      _lastAcceptedHash = null;
      task.reject(err);
    }
  }

  _isProcessingKarmaQueue = false;
}

/**
 * storeKarmaEventRecord — writes directly to /bucket/artifact (bypasses governance gate).
 * Serialized via bounded FIFO queue to prevent concurrent parent_hash conflicts and memory accumulation.
 */
async function storeKarmaEventRecord({
  subjectId,
  signal,
  severity,
  ttl,
  opaqueReasonCode,
  traceId,
}) {
  const validSignals = ["allow", "nudge", "restrict", "escalate"];
  if (!validSignals.includes(signal)) {
    throw new Error(`[bucketClient] Invalid signal value "${signal}".`);
  }
  if (typeof severity !== "number" || severity < 0.0 || severity > 1.0) {
    throw new Error(`[bucketClient] Invalid severity "${severity}".`);
  }
  if (!Number.isInteger(ttl) || ttl < 1) {
    throw new Error(`[bucketClient] Invalid ttl "${ttl}".`);
  }

  // Backpressure protection: Drop redundant signals if Bucket VM is lagging to prevent heap exhaustion
  if (_karmaWriteQueue.length >= MAX_PENDING_KARMA_WRITES) {
    return {
      artifact_id: randomUUID(),
      hash: null,
      parent_hash: _lastAcceptedHash,
      timestamp_utc: new Date().toISOString(),
      skipped: true
    };
  }

  return new Promise((resolve, reject) => {
    _karmaWriteQueue.push({
      params: { subjectId, signal, severity, ttl, opaqueReasonCode, traceId },
      resolve,
      reject
    });
    _processKarmaQueue();
  });
}

async function storeScreenshot({ userId, sessionId, imageBase64, metadata = {}, traceId }) {
  return writeArtifact({
    artifactType: ARTIFACT_TYPES.SCREENSHOT,
    traceId: traceId || randomUUID(),
    payload: {
      user_id: userId,
      session_id: sessionId,
      image_base64: imageBase64,
      captured_at: new Date().toISOString(),
      metadata,
    },
  });
}

async function storeExport({ exportType, generatedBy, data, traceId }) {
  return writeArtifact({
    artifactType: ARTIFACT_TYPES.EXPORT,
    traceId: traceId || randomUUID(),
    payload: {
      export_type: exportType,
      generated_by: generatedBy,
      generated_at: new Date().toISOString(),
      data,
    },
  });
}

async function checkHealth() {
  try {
    const client = buildHttpClient();
    const res = await client.get("/health");
    return {
      healthy: res.data.status === "healthy" || res.data.status === "degraded",
      status: res.data.status,
      details: res.data,
    };
  } catch (err) {
    return {
      healthy: false,
      status: "unreachable",
      error: err.message,
    };
  }
}

module.exports = {
  writeArtifact,
  storeScreenshot,
  storeExport,
  storeKarmaEventRecord,
  getArtifactPolicy,
  validateArtifactAdmission,
  checkHealth,
  ARTIFACT_TYPES,
  buildArtifactEnvelope,
  NIYANTRAN_INTEGRATION_ID,
  NIYANTRAN_REQUESTER_ID,
};
