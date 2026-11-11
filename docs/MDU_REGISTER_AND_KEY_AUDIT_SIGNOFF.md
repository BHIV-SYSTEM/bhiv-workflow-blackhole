# NIYANTRAN & Ecosystem Register Sign-off & Key Audit Packet

**Document ID:** BHIV-REG-AUDIT-2026-11  
**Author:** Rudra Parmeshwar (Product Owner: NIYANTRAN & Blackhole-Auth; EOS Runtime Convergence Lead)  
**Recipient:** Nupur (MDU Constitutional Owner & Registry Lead)  
**Date:** 2026-11-11  
**Status:** Certified & Signed Off  

---

## 1. Executive Summary

This packet compiles the official register records and security audit determinations requested by the supervisor and Nupur regarding:
1. Product ownership, execution contracts, repositories, and dataset governance for **NIYANTRAN**, **Blackhole-Auth (PRAVESH)**, and **SETU**.
2. Service configuration and interface boundaries for **MDU (Parakosha)**.
3. Security decommissioning status for departed personnel API keys (**Nikhil / Explorer UI** and **Sanskar / GeoQuest**).

---

## 2. Product Register Master Records

### 2.1. NIYANTRAN
* **Product Role:** Workforce Lifecycle Backbone, Employee Monitoring, and Deterministic Task Execution Runtime.
* **Product Owner:** **Rudra** (Confirmed by supervisor, 2 Nov 2026).
* **Approved Register Text:**  
  > *"NIYANTRAN: product owner Rudra (confirmed by the supervisor, 2 Nov 2026). Rhugved, Pratik and Pritesh are not the primary owners."*
* **Technical Roles:**
  * **Pritesh Patra:** Application Custodian & Lead Developer (Task lifecycle and PRANA/KARMA integration).
  * **Pratik:** Group 2 Context & SANSKAR semantic mapping.
  * **Rhugved:** Contributor.
* **Execution Contract & Interface Owner:** **Rudra**.
  * Owns the cross-product execution contract interface (`/api/tantra/execution/*`, `executionContractService`, trace continuity `x-trace-id`, tenant isolation, and SHA-256 lineage hashing) used by external systems and the **BIQOS first workflow**.
* **Primary Core Repository:**  
  * **`bhiv-workflow-blackhole`** (`https://github.com/BHIV-Engineering-Exchange/bhiv-workflow-blackhole.git`)
  * *Correction Note:* The working map entries `bhiv-SHAKTI-Runtime-Integration-and-Operational-Command-Center-Sprint` and `bhiv-Shakti-GC-Infra` belong to the external **SHAKTI Operational Command Center / Dashboard** ecosystem and Infrastructure (Alay Patel), which acts as an external consumer/dependency.
* **Dataset Governance:**
  * **Internal Data Governed:** Task lifecycle, work sessions, employee attendance, and execution lineage (`Task`, `Aim`, `WorkSession`, `ExecutionSession`).
  * **External Contributing Teams (Data Ownership Retained by Contributors):**
    * *AI Review & Scoring:* **PARIKSHAK** (Owner: **Ishan Shirode**)
    * *Monitoring Telemetry & Screenshots:* **MDU** (Owner: **Nupur**)
    * *Reputation Scores:* **KARMA** (Owner: **Pritesh / Rukayya**)
    * *Master Ledger / Audit Records:* **MasterDB** (Owner: **KAVYA**)
    * *Tenant Business Data:* Contributed by tenant systems via canonical MDU pipelines.

---

### 2.2. Blackhole-Auth (PRAVESH)
* **Product Role:** Centralized Identity Provider (IdP) and single sign-on (SSO) gateway for the BHIV enterprise ecosystem.
* **Product Owner:** **Rudra** (Confirmed by supervisor, Nov 2026).
* **Approved Register Text:**  
  > *"Blackhole-Auth (PRAVESH): product owner Rudra (confirmed by the supervisor, Nov 2026). Centralized identity provider and SSO gateway."*
* **Contract & Interface Owner:** **Rudra** (`/api/pravesh/*`, `blackhole_token` cookie validation, shared HS256 JWT exchange, `X-Pravesh-Token` header specs).
* **Primary Repository:** **`bhiv-auth`** (Production domain: `pravesh.blackholeinfiverse.com`). Maintained with **Alay Patel** (DevOps / Infrastructure).
* **Dataset Governance:** Governs central credentials, SSO session tokens, and identity linkages (`pravesh:<user_id>`). Participating applications contribute user email/linkage attributes during registration.

---

### 2.3. SETU (Enterprise Operating System)
* **Product Role:** Cross-product orchestration fabric and capability discovery umbrella.
* **Product Ownership Clarification:** **Rudra does NOT own SETU as Product Owner.**
* **Registered Role for Rudra:** **EOS Runtime Convergence Lead & Systems Architecture Lead** (owner of the 11-stage EOS runtime convergence pipeline, capability orchestration, trace continuity, and execution contract certification).
* **Approved Register Text:**  
  > *"SETU: Product Owner not stated (pending confirmation with Platform Governance / Rishabh Yadav / GC). Rudra is EOS Runtime Convergence Lead."*
* **Primary Repositories:** Umbrella distributed across `INFIVERSE-HR-PLATFORM` (Sampada), `ai-crm`, and `bhiv-workflow-blackhole`.

---

## 3. MDU (Parakosha) Integration Specification

| Parameter | Configuration Detail |
| :--- | :--- |
| **Base Service URL** | `https://parakosha.blackholeinfiverse.com` |
| **Internal Routing** | NGINX reverse-proxy to upstream `http://163.128.209.18:8028` |
| **Designated Contact** | **Nupur** (Constitutional Owner of MDU) |
| **NIYANTRAN Ingestion Paths** | Desktop agent monitoring, screenshot compliance, and EMS signals (`/api/monitoring`, `/api/ems-signals`) |
| **Canonical Data Transformations** | Pipeline transformation of `product_catalog`, `order_record`, `field_visit_evidence` |
| **Key Management** | Injected via isolated environment configuration (`MDU_API_KEY` / `MDU_SECRET_KEY`); no plain text keys transmitted in communication channels |

---

## 4. Key Decommissioning & Security Audit

### 4.1. Audit Determination

| Key Owner / Service | Associated Component | Active Dependency in NIYANTRAN? | Current Status & Mitigation | Final Action |
| :--- | :--- | :--- | :--- | :--- |
| **Nikhil** *(Explorer UI)* | Infiverse / Niyantran Frontend UI | ❌ **None** | Full handover executed. All client-side and server-side calls utilize central server credentials (`MDU_API_KEY`). | **SAFE TO REVOKE IMMEDIATELY** |
| **Sanskar** *(GeoQuest)* | Geospatial Context / Remote Sensing | ❌ **None** | NIYANTRAN connects to SANSKAR engine via direct HTTP (`SANSKAR_SERVICE_URL`). No call to MDU on behalf of GeoQuest. | **AUDIT CHECK (0 traffic) & REVOKE** |

### 4.2. Recommended Escalation & Verification Contacts
Before closing Sanskar's key, Nupur should verify with:
1. **Pritesh Patra** — Ecosystem / Runtime Integration Lead.
2. **Pratik & Sakshi** — Group 2 Scientific Context & SANSKAR signal mapping.
3. **Alay Patel** — Infrastructure / DevOps (to confirm no orphan cron/daemon exists on the VM).

