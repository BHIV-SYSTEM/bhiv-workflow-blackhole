# Admin Monitoring Console: Information Architecture & UI Blueprint

**Document ID:** `V2-DOC-07`  
**Classification:** Frontend Design System & Information Architecture  
**Target Module:** `client/src/modules/employee-monitoring-v2/admin/`  
**Date:** November 2026  
**Status:** DRAFT / PENDING APPROVAL  

---

## 1. The Redesign Mandate: Eliminating Tab Clutter

The legacy monitoring interface (`EmployeeMonitoring.jsx`) suffered from severe usability issues:
- **12+ Horizontal Tabs:** (Live Team Overview, Daily View, Monthly View, Single Dashboard, Screenshots, Alerts, AI Insights, Production, TRINETRA AI, Reports, Whitelist, Bulk) crowded into a single overflowing tab strip.
- **Visual Inconsistency:** Mismatched color schemes, inconsistent badge styles, and fragmented data tables across tabs.
- **Surveillance-Heavy Artifacts:** Prominent tabs dedicated to displaying raw typed text (`KeystrokeTextPanel`) and desktop screenshots (`ScreenshotGallery`).

**The V2 Design Philosophy:** A clean, professional, executive-grade SaaS management experience adhering to Niyantran's dark design tokens (`bg-slate-950`, `border-slate-800`, `text-slate-100`, `accent-indigo-500`). Unnecessary gradients, flashing widgets, and raw surveillance elements are completely eliminated.

---

## 2. Legacy Feature Mapping Matrix (V1 & TRINETRA to V2)

```
┌────────────────────────────────┬───────────────────┬────────────────────────────────────────────────────────┐
│ Legacy V1 / TRINETRA Feature   │ V2 Action         │ Architectural Treatment in V2                          │
├────────────────────────────────┼───────────────────┼────────────────────────────────────────────────────────┤
│ **Live Team Overview Grid**    │ **REDESIGN**      │ Modernized as "Live Fleet Presence" with live badges.  │
│ **Daily Monitoring View**      │ **MERGE**         │ Merged into unified "Analytics Hub" with date picker.  │
│ **Monthly Monitoring View**    │ **MERGE**         │ Merged into unified "Analytics Hub" with trend charts. │
│ **Keystroke Text Capture**     │ **EXCLUDE**       │ **PERMANENTLY PURGED** for BYOD privacy compliance.    │
│ **Full Desktop Screenshots**   │ **EXCLUDE**       │ **PERMANENTLY PURGED** for BYOD privacy compliance.    │
│ **Server-Side Screen Capture** │ **EXCLUDE**       │ **PERMANENTLY PURGED** (Faulty architectural concept). │
│ **TRINETRA Verification Matrix**│ **MERGE**        │ Integrated into "Live Fleet Presence" as focus score.  │
│ **Monitoring Alerts**          │ **REDESIGN**      │ Streamlined into "Operations > Alerts" panel.          │
│ **Website Whitelist Manager**  │ **REDESIGN**      │ Modernized as "Administration > Work-App Policies".    │
│ **Production Dashboard**       │ **MERGE**         │ Integrated into "Analytics > Productivity Trends".     │
│ **Reports Generator (PDF/CSV)**│ **RETAIN**        │ Retained under "Analytics > Reports" (No raw text).    │
│ **Device Inventory & Health**  │ **NEW IN V2**     │ Dedicated view showing registered devices & agents.    │
│ **Compliance Audit Logs**      │ **NEW IN V2**     │ Immutable log viewer for device handoffs & pauses.     │
└────────────────────────────────┴───────────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Streamlined Admin Navigation Structure

The overcrowded horizontal tabs are replaced with a structured four-section sidebar or top-level navigation model:

```
EMPLOYEE MONITORING V2 (ADMIN)
├── 1. OVERVIEW
│   ├── Executive Dashboard    # Top-level KPIs, attendance vs focus, fleet health
│   └── Live Fleet Presence    # Real-time team presence, active modes, current tasks
├── 2. ANALYTICS
│   ├── Work-Session Trends    # Daily & Monthly focus rollups, department comparisons
│   ├── Task Time Attribution  # Hours focused per assigned project / task ID
│   └── Compliance Reports     # Audit-ready CSV/PDF export engine
├── 3. OPERATIONS
│   ├── Device Inventory       # Registered laptops/PCs, OS versions, agent health
│   └── Fleet Alerts           # Stale heartbeats, clock skew warnings, collisions
└── 4. ADMINISTRATION
    ├── Work-App Allowlist     # Permitted application categories and personal blocks
    ├── Role Scopes & Access   # Manager scope restrictions (department vs tenant)
    └── Security Audit Ledger  # Immutable log of device handoffs and pause events
```

---

## 4. Admin Dashboard Screen Wireframe & Specifications

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  NIYANTRAN V2  │  Employee Monitoring V2  >  Executive Dashboard             [Auto-refresh: 10s ● LIVE] │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  🔍 Search employee...  │ Branch: [ Mumbai Core ▾ ] │ Dept: [ Engineering ▾ ] │ Date: [ Today, Nov 17 ▾]│
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐                │
│  │  ACTIVE EMPLOYEES│  │  ON LAPTOP / PC  │  │  ON MOBILE PHONE │  │  CONNECTED AGENTS│                │
│  │  42 / 48 (87%)   │  │  34 Active       │  │  8 Active        │  │  34 / 34 Healthy │                │
│  │  ↑ 4% vs yesterday│  │  Avg Focus: 88%  │  │  Field/Review   │  │  0 Stale Pings   │                │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘                │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─ REAL-TIME FLEET PRESENCE ────────────────────────────────────────────────────────────────────────┐ │
│  │ Employee Name    Dept         Mode       Active App / Category   Focus Score  Session Time  Status  │ │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────┤ │
│  │ Rohan Sharma     Frontend     🖥️ Laptop  VS Code (Development)   94%          04h 15m       ● ACTIVE│ │
│  │ Priya Patel      Backend      🖥️ Laptop  Postman (Development)   88%          03h 50m       ● FOCUSED│ │
│  │ Vikram Malhotra  QA Lead      📱 Phone   Mobile Aims / Review    N/A          02h 10m       ● MOBILE │ │
│  │ Ananya Sen       Design       🖥️ PC      Figma (Documentation)   91%          05h 02m       ● ACTIVE│ │
│  │ Aarav Mehta      Fullstack    ⏸️ Laptop  Paused for Lunch Break  --           03h 30m       ░ PAUSED│ │
│  │ Kavita Rao       DevOps       ⚠️ Laptop  Heartbeat Lost (> 90s)  --           01h 45m       ○ STALE │ │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─ TODAY'S FLEET ACTIVITY BREAKDOWN ────────────────────────────────────────────────────────────────┐ │
│  │  ■ Development: 64%   ■ Documentation: 18%   ■ Communication: 12%   ░ Paused: 6%                  │ │
│  │  [████████████████████████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]   │ │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Critical Presentation Rules:
1. **Separation of Employment Status:** Exited employees (`stillExist === 0`) are strictly segregated from active operational views into an archived filter.
2. **No Raw Keystrokes or Screen Thumbnails:** Admins see aggregated activity scores and category distributions (e.g., *Development (VS Code) - 4h 15m*), preserving BYOD employee privacy.
3. **Drill-Down Detail Modal:** Clicking an employee opens a detail sheet showing their 1-minute bucket timeline, assigned task breakdown, and device health status—accessible only to authorized managers.
