# Risk & Architectural Decision Register (ADR): Monitoring V2

**Document ID:** `V2-DOC-16`  
**Classification:** Governance, Risk Management & Architectural Decisions  
**Target Repository:** `Niyantran`  
**Date:** November 2026  
**Status:** UPDATED FOR PHASE A CORRECTIONS  

---

## 1. Architectural Decision Records (ADRs)

### ADR-01: Independent Parallel Module Architecture vs. In-Place V1 Refactoring
- **Status:** APPROVED.
- **Context:** The legacy V1 monitoring system is tightly coupled, contains unauthenticated endpoints, and relies on invasive keystroke logging. Refactoring in-place carries extreme regression risk for running operations.
- **Decision:** Build V2 as a completely independent parallel module (`client/src/modules/employee-monitoring-v2/` and `server/modules/employee-monitoring-v2/`) with dedicated `/api/monitoring-v2/*` routes and MongoDB collections.
- **Consequences:** Zero risk of breaking existing V1 features; enables clean, isolated pilot testing and instantaneous zero-downtime rollback.

### ADR-02: Staged Desktop Runtime (Hardened Electron V2 -> Tauri v2 + Rust)
- **Status:** APPROVED.
- **Context:** The legacy agent is Electron 28 with high CPU usage from PowerShell loops. Rewriting in pure Rust/Tauri immediately would delay launch by 6 weeks.
- **Decision:** Deploy a hardened Electron 31 LTS agent for V2.0 (purging text/screenshots and replacing PowerShell with native C++ bindings). Design runtime-agnostic API contracts to enable seamless migration to Tauri v2 + Rust in V2.5.
- **Consequences:** Immediate delivery velocity; memory target <120MB and CPU target <0.5%; clean future migration path.

### ADR-03: Permanent Prohibition of Raw Keystroke Logging & Screen Captures
- **Status:** APPROVED.
- **Context:** Remote employees work on personal BYOD laptops. Logging typed characters or screen content violates GDPR Article 9 and India's DPDP Act 2023.
- **Decision:** Permanently prohibit character reconstruction and full-frame screen capture in V2. Collect only aggregated event counts (`keyPressCount`, `mouseActivityDelta`) and whitelisted process categories.
- **Consequences:** Builds employee trust; eliminates catastrophic data breach liabilities. Complete compliance requires qualified legal review.

### ADR-04: Non-Invasive V1 Conflict Handling (Correction 1)
- **Status:** APPROVED.
- **Context:** An earlier draft proposed V2 automatically pausing V1 upon launch. This violates non-interference principles and could destabilize running V1 tracking.
- **Decision:** V2 must **never** automatically terminate, pause, disable, uninstall, or alter V1. Instead, V2 passively queries the process list. If V1 is running, V2 refuses to start its input hooks, displays an amber `V1_AGENT_CONFLICT` state in tray, and requires explicit employee handoff.
- **Consequences:** 100% safety guarantee for V1; zero silent interference.

### ADR-05: Strict Attendance Isolation (Correction 5)
- **Status:** APPROVED.
- **Context:** Monitoring sessions must not distort official HR attendance, clock in/out times, or payroll calculations.
- **Decision:** V2 monitoring sessions are completely decoupled from attendance records. V2 defines an unmounted, read-only attendance adapter that queries whether a workday is open, but will **never** alter attendance documents, clock-in, clock-out, or calculate salary deductions.
- **Consequences:** Zero attendance side effects; HR compliance guaranteed.

---

## 2. Active Risk Register & Mitigation Controls

| Risk ID | Description & Vulnerability | Likelihood | Impact | Severity | Mitigation Strategy & Technical Control | Owner |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: |
| **RSK-01** | **macOS TCC Permission Friction**<br>macOS requires manual user approval for Input Monitoring. | HIGH | MEDIUM | **HIGH** | Agent installer launches a clear, step-by-step visual onboarding guide directing users to `System Settings > Privacy & Security > Input Monitoring`. | Desktop Lead |
| **RSK-02** | **Linux Wayland Global Input Blocking**<br>Modern Wayland restricts background global key sniffing. | MEDIUM | MEDIUM | **MEDIUM** | Implement *"Verified Focus Mode"* fallback using FreeDesktop portal (`org.freedesktop.portal.Desktop`), tracking active application duration without global input taps. | Desktop Lead |
| **RSK-03** | **Antivirus / EDR False Positives**<br>Corporate security tools flag background agents as malware. | MEDIUM | HIGH | **HIGH** | Eliminate all shell execution (`powershell.exe`). Sign all executables with EV Code Signing certificate and notarize via Apple Developer ID. | Security Lead |
| **RSK-04** | **Employee Anxiety & Trust Deficit**<br>Remote employees fearing surveillance on personal laptops. | HIGH | HIGH | **CRITICAL** | Embed the **Privacy Transparency Shield** in Employee Workspace, allowing employees to view the exact JSON telemetry stored in MongoDB. | Frontend Lead |
| **RSK-05** | **Client System Clock Skew & Drift**<br>Unsynchronized laptop clocks corrupting timeline order. | MEDIUM | LOW | **MEDIUM** | Gateway measures delta `\|serverTime - clientTime\|`. Rejects if skew > 120s; normalizes acceptable skew to server UTC timeline. | Backend Lead |
| **RSK-06** | **Unqualified Legal Compliance Claims**<br>Claiming architecture alone certifies statutory compliance. | MEDIUM | HIGH | **HIGH** | Explicitly frame privacy designs as engineering safeguards and mandate review by corporate legal counsel before production sign-off. | Security Lead |
