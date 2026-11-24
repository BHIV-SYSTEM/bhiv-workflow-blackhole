# Pilot Rollout, Production Migration & Complete Rollback Strategy

**Document ID:** `V2-DOC-15`  
**Classification:** Operational Deployment & Risk Management Plan  
**Target Repository:** `Niyantran`  
**Date:** November 2026  
**Status:** UPDATED FOR PHASE A CORRECTIONS  

---

## 1. Controlled Pilot Deployment Strategy (Phase G)

To ensure operational stability and zero employee panic, Employee Monitoring V2 will undergo a **14-day controlled pilot test** with an internal engineering cohort before any organization-wide rollout.

### A. Pilot Cohort Profile (15 Engineers):
- **Operating System Diversity:**
  - 6 Engineers on Windows 11 (Standard Enterprise & BYOD laptops).
  - 5 Engineers on macOS (3 on Apple Silicon M-series, 2 on Intel).
  - 4 Engineers on Linux (Ubuntu 22.04 LTS / 24.04 LTS).
- **Role Diversity:**
  - 8 Core Software Engineers (Heavy VS Code, Docker, Terminal, Antigravity usage).
  - 3 QA Specialists (Test automation, manual web inspection).
  - 2 UI/UX Designers (Figma, Miro, Adobe Creative Cloud).
  - 2 Engineering Managers (Code review, Jira, GitHub PRs, Slack).

### B. Prevention of Desktop Collector Collisions (Correction 1):
During the pilot, pilot users might have both agents installed.
- **Strict Rule:** V2 **never** kills, pauses, or alters V1 automatically.
- `employee-agent-v2` executes a passive, non-invasive process check for `employee-activity-agent`.
- If V1 is running, V2 **refuses to activate its input hooks** and enters `V1_AGENT_CONFLICT` state.
- V2 displays an advisory notice: *"Legacy Monitoring Agent V1 is currently active. To prevent duplicate telemetry and input lag, V2 monitoring is standing by. Please close or pause the V1 Agent manually if you wish to run V2."*
- Pilot enrollment is coordinated administratively so pilot users deliberately close V1 before testing V2.

---

## 2. Complete 4-Tier Emergency Rollback Protocol (Correction 4)

A backend feature flag alone is not a complete rollback mechanism. A disconnected desktop agent could continue collecting and buffering telemetry locally.

V2 implements a verified **4-Tier Rollback Architecture**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        MULTI-TIER EMERGENCY ROLLBACK PROTOCOL                          │
├──────────────────────┬─────────────────────────────────────────────────────────────────┤
│ **Tier 1: Frontend** │ Set `ENABLE_MONITORING_V2=false` in environment variables.      │
│                      │ Sidebar immediately hides the V2 navigation entry.              │
│                      │ All `/monitoring-v2/*` routes return 404 Not Found.             │
│                      │ Legacy `/monitoring` view remains untouched and functional.     │
├──────────────────────┼─────────────────────────────────────────────────────────────────┤
│ **Tier 2: Gateway**  │ Gateway middleware rejects all new session starts (`403`).      │
│                      │ All active session leases in MongoDB updated to `REVOKED`.      │
├──────────────────────┼─────────────────────────────────────────────────────────────────┤
│ **Tier 3: Online**   │ Running agents receive `403 SESSION_REVOKED` on next heartbeat. │
│ **Agent Shutdown**   │ Agent immediately unbinds OS input hooks and enters dormant.    │
├──────────────────────┼─────────────────────────────────────────────────────────────────┤
│ **Tier 4: Offline**  │ Disconnected agents have an autonomous local lease countdown    │
│ **Agent Expiry**     │ (90s maximum). When 90s elapse without server lease renewal,   │
│                      │ agent autonomously halts OS input hooks.                        │
│                      │ Offline queue safeguard: Server drops stale offline telemetry   │
│                      │ upon reconnect (`410 LEASE_REVOKED`); agent purges disk buffer. │
└──────────────────────┴─────────────────────────────────────────────────────────────────┘
```

**Rollback Execution Time:** Less than **60 seconds** via environment variable update, requiring zero database rollbacks or code reverts. Throughout rollback, legacy V1 monitoring and attendance continue operating with 0% downtime.

---

## 3. Production Cutover Criteria & Acceptance Gates

Transitioning from Phase G (Pilot) to Phase H (General Availability) requires fulfilling **all four acceptance gates**:

1. **Zero Downtime & Stability:** 14 consecutive days of pilot operation with zero agent crashes, zero memory leaks (>150MB), and zero server connection failures.
2. **Accuracy Proof:** Verified evidence that productive coding in VS Code / Terminal is classified as ACTIVE/FOCUSED with 0% false idle flags.
3. **Privacy Sign-Off:** Automated database assertions confirm 100% zero raw keystrokes, screenshots, or private URLs stored in MongoDB.
4. **Executive Authorization:** Written sign-off from Lead Architect, Security, and Engineering.

---

## 4. V1 Data Preservation (Strict Rule)
- **DO NOT DELETE V1 COLLECTIONS.**
- Legacy collections (`employee_activities`, `keystroke_logs`, `screen_captures`) are marked as read-only historical archives.
- They remain accessible for historical audit queries and salary recalculations.
