# Desktop Agent Technology Stack: Architectural Decision Record (ADR)

**Document ID:** `V2-DOC-04`  
**Classification:** Architectural Decision Record (ADR)  
**Status:** UPDATED FOR PHASE A CORRECTIONS  
**Context:** Technology Selection for `employee-agent-v2`  
**Date:** November 2026  

---

## 1. Context & Problem Statement

Employee Monitoring V1 utilized an unhardened Electron 28 runtime with high resource overhead caused by a persistent background PowerShell loop, plaintext credential storage, and privacy-violating text reconstruction. 

For Employee Monitoring V2, we require an agent that:
1. Operates reliably in the background independently of the Niyantran web tab.
2. Accurately counts keyboard and mouse inputs without intercepting actual characters.
3. Operates within reasonable resource budgets on modern laptops.
4. Operates across Windows, macOS, and Linux without invasive workarounds.
5. Protects credentials using OS-level secure storage.
6. Does not interfere with or automatically terminate the legacy V1 agent.

---

## 2. Technology Comparison: Target Budgets vs. Legacy Baseline

> **CRITICAL METHODOLOGY NOTE (Correction 2):**  
> All figures for proposed architectures below represent **Design Performance Budgets and Targets**, NOT empirical measurements. Performance compliance will only be claimed after executing standardized benchmarks on physical test machines in Phase F.

| Evaluation Dimension | 1. Legacy Baseline (`employee-agent`) [Observed] | 2. Hardened Electron Agent (V2.0) [Target Budget] | 3. Tauri v2 + Rust (V2.5 Roadmap) [Target Budget] |
| :--- | :--- | :--- | :--- |
| **Runtime Core** | Electron 28.1.3 (Node.js) | Electron 31+ LTS (Node.js) | Rust 1.78+ & OS Webview |
| **RAM Footprint (Idle)** | ~160 MB – 220 MB RAM | **Target: < 120 MB RAM** | **Target: < 40 MB RAM** |
| **Active CPU Load** | 3.5% – 8.0% (due to PowerShell polling) | **Target: < 0.5% CPU** (Native Win32/Cocoa) | **Target: < 0.2% CPU** |
| **Binary Package Size** | ~180 MB unpacked | **Target: ~115 MB** (ASAR packaged) | **Target: ~20 MB** |
| **Input Hook Tech** | `uiohook-napi` (maps scan codes) | `uiohook-napi` (counts only; text purged) | Native `rdev` / OS Event Tap |
| **Active App Tracking** | Persistent `powershell.exe` loop | Native C++ Addon (`active-win` / Win32) | Native Win32 / Cocoa / X11 FFI |
| **Credential Storage** | Plaintext in `electron-store` | **Electron `safeStorage` (DPAPI/Keychain)** | `keyring-rs` (OS Keychain) |
| **V1 Conflict Handling** | N/A (Single Agent) | **Passive Detection (`V1_AGENT_CONFLICT`)** | **Passive Detection (`V1_AGENT_CONFLICT`)** |
| **Engineering Velocity** | Baseline | **Immediate (Shared JS ecosystem)** | Medium (Requires Rust development) |

---

## 3. Empirical Benchmark Methodology (To be Executed in Phase F)

To substantiate all performance claims before general availability, the QA team will execute the following benchmark suite on actual physical hardware:

### A. Test Hardware Matrix:
1. **Windows 11:** Intel Core i7-12700H, 16GB RAM, SSD, Windows 11 Build 22631.
2. **macOS Sonoma:** Apple Silicon M2, 16GB Unified Memory, macOS 14.5.
3. **Linux Ubuntu:** AMD Ryzen 5 5600X, 16GB RAM, Ubuntu 22.04 LTS (X11 & Wayland).

### B. Standardized Test Scenarios:
- **Scenario 1 (Idle Baseline):** Agent active in system tray; zero user input for 30 minutes.
- **Scenario 2 (Active High-Throughput Work):** Continuous active coding in VS Code and terminal for 60 minutes (simulating 120 keystrokes/min and 60 mouse moves/min).
- **Scenario 3 (Offline Encrypted Buffering):** Network interface disconnected; 30 minutes of continuous input queued to local AES-256-GCM buffer.
- **Scenario 4 (Burst Reconnection Sync):** Network restored; flushing 180 buffered samples to server.

### C. Profiling Tools & Recorded Metrics:
- **Windows:** Windows Performance Monitor (`perfmon`) & Process Explorer (Private Bytes, Working Set, % Processor Time).
- **macOS:** Xcode Instruments (Time Profiler, Allocations, Energy Impact).
- **Linux:** `htop`, `valgrind`, `powertop`.
- **Recorded Results:** Peak/Average RAM, Peak/Average CPU %, Battery discharge rate (mW / % drop per hour), Network bytes sent/received.

---

## 4. Architectural Decision & Staged Migration Path

### Decision:
We select a **Staged Two-Phase Desktop Agent Strategy**:

1. **Phase D (Immediate V2.0 Foundation): Hardened Electron 31 LTS Agent**
   - Retains proven `uiohook-napi` input hook for raw event counting.
   - Purges all keystroke text reconstruction and screenshot capture engines.
   - Replaces the persistent PowerShell loop with native C++ Win32/Cocoa bindings.
   - Secures credentials using Electron `safeStorage`.
   - Passive conflict detection: refuses to activate if V1 is running (`V1_AGENT_CONFLICT`).
2. **Phase H / Future Scale (V2.5 Roadmap): Tauri v2 + Rust Core**
   - Runtime-agnostic API and telemetry contracts ensure that transitioning to Tauri in V2.5 requires **zero backend or database changes**.
