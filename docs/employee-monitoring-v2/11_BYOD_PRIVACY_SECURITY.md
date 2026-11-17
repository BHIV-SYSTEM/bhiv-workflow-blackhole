# Privacy-First BYOD Architecture & Compliance Objectives

**Document ID:** `V2-DOC-11`  
**Classification:** Privacy Architecture, Threat Modeling & Regulatory Analysis  
**Target Repository:** `Niyantran`  
**Date:** November 2026  
**Status:** UPDATED FOR PHASE A CORRECTIONS  

---

## 1. Executive Summary: The BYOD Threat Model

In modern remote engineering environments, employees routinely work from personally owned laptops (BYOD). When surveillance monitoring is deployed on personal machines, severe threat vectors emerge:

1. **Credential Harvesting:** Keyloggers capture master passwords, banking credentials, two-factor recovery codes, and crypto private keys.
2. **Special Category Data Exposure:** Continuous screen capture inevitably photographs personal medical lab reports, private WhatsApp conversations, legal documents, and family photos.
3. **Power Imbalance in Employment:** Under privacy jurisprudence (e.g., GDPR Recital 43, India DPDP Act Section 6), consent obtained as a condition of employment is subject to intense legal scrutiny due to the inherent employer-employee power disparity.

**The Niyantran V2 Anti-Surveillance Guarantee:** V2 enforces strict **Privacy-by-Design**. The desktop agent is architecturally incapable of recording characters, capturing screens, or inspecting private URLs.

> **LEGAL NOTICE (Correction 3):**  
> Technical architecture alone does not constitute formal statutory certification or legal approval. The analysis below defines **Privacy-by-Design Objectives** intended to align with international privacy frameworks. Complete organizational compliance requires qualified review by authorized corporate legal counsel in each operational jurisdiction.

---

## 2. The Strict Technical Exclusion Matrix

```
┌────────────────────────────────┬───────────────────────────┬────────────────────────────────────────────────────────┐
│ Data Category                  │ Technical Policy in V2    │ Technical Enforcement Mechanism                        │
├────────────────────────────────┼───────────────────────────┼────────────────────────────────────────────────────────┤
│ **Typed Characters & Words**   │ **PERMANENTLY PROHIBITED**│ Keycodes stripped at hook layer; counter increment only│
│ **Screenshots & Recordings**   │ **PERMANENTLY PROHIBITED**│ Binary lacks screen capture libraries entirely         │
│ **Webcam / Microphone Data**   │ **PERMANENTLY PROHIBITED**│ OS manifests explicitly disclaim media device access   │
│ **Clipboard Contents**         │ **PERMANENTLY PROHIBITED**│ Clipboard APIs are never imported or invoked           │
│ **Personal Messages & Chat**   │ **PERMANENTLY PROHIBITED**│ WhatsApp/Telegram automatically classified as EXCLUDED │
│ **Personal Browser History**   │ **PERMANENTLY PROHIBITED**│ Agent inspects root process name only; zero URL access │
│ **Local Disk File Contents**   │ **PERMANENTLY PROHIBITED**│ Agent lacks file scanner or indexing engine            │
│ **Active Work Categories**     │ **PERMITTED (DISCLOSED)** │ Mapped locally to generic categories (Development)     │
│ **Aggregated Input Counts**    │ **PERMITTED (DISCLOSED)** │ Keypress count and throttled mouse delta per 10s       │
│ **Hardware Idle Seconds**      │ **PERMITTED (DISCLOSED)** │ Native OS powerMonitor idle timer                      │
└────────────────────────────────┴───────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Work-App Allowlist & Personal Privacy Filter

```
[Local Window Event] ───> Active Process: "whatsapp.exe"
                               │
                               ▼
                     [Local Allowlist Filter]
                               │
                Is in Work Allowlist? NO
                Is in Personal Filter? YES (Personal Chat)
                               │
                               ▼
                 [Sanitized Outgoing Payload]
                 primaryCategory: "EXCLUDED_PERSONAL"
                 activeAppTitle: "[Private Content]"
                 keyPressCount: 0 (SUPPRESSED)
                 mouseActivityDelta: 0
```

### Approved Work Categories:
- **DEVELOPMENT:** Visual Studio Code, Visual Studio, IntelliJ IDEA, PyCharm, WebStorm, Android Studio, Xcode, Terminal, PowerShell, Git Bash, Docker Desktop, Postman, Antigravity IDE.
- **DOCUMENTATION:** Notion, Jira, Confluence, Google Docs, Figma, Miro, Draw.io, LibreOffice.
- **COMMUNICATION:** Slack, Microsoft Teams, Zoom, Google Meet, Discord (Work server).
- **NEUTRAL / SYSTEM:** File Explorer, Finder, Windows Settings, macOS System Settings.

### Automatic Privacy Exclusions (`EXCLUDED_PERSONAL`):
- Any process matching: `whatsapp`, `telegram`, `signal`, `spotify`, `steam`, `netflix`, `discord` (personal), `keepass`, `1password`, `bitwarden`, `banking`, `vlc`.
- When an excluded application is in the foreground:
  - Process name is transmitted as `'EXCLUDED_PERSONAL'`.
  - Input counting is temporarily paused so that personal conversations or typed passwords are not recorded in telemetry.

---

## 4. Regulatory Alignment Objectives & Unresolved Legal Questions

### A. Digital Personal Data Protection Act, 2023 (DPDP Act - India)
- **Design Objective:** Align with Section 6 (consent limits) and Section 8 (data minimization and storage limitation).
- **Unresolved Legal Questions (Requires Legal Counsel Review):**
  1. *Statutory Notice Requirement:* Does the in-app privacy transparency shield satisfy Section 5 formal pre-collection notice obligations across all Indian branches?
  2. *Data Fiduciary Obligations:* Does processing telemetry on cloud infrastructure require explicit employee notification of cloud hosting providers?

### B. General Data Protection Regulation (GDPR - EU / Multinational)
- **Design Objective:** Align with Article 5(1)(c) (Data Minimization), Article 25 (Privacy by Design), and eliminate Article 9 special category exposure by permanently purging keystroke text and screenshots.
- **Unresolved Legal Questions (Requires Legal Counsel Review):**
  1. *Legal Basis for Processing:* Does the employer rely on Article 6(1)(f) (Legitimate Interests) with a documented Legitimate Interests Assessment (LIA), or local employment laws (e.g., Section 26 BDSG in Germany)?
  2. *Works Council Agreements:* In EU jurisdictions, does deploying even aggregated activity counting require formal prior approval from local employee representative bodies / Works Councils?
