# Role-Based Access Control (RBAC) & Scope Matrix: Monitoring V2

**Document ID:** `V2-DOC-09`  
**Classification:** Security Architecture & Authorization Specification  
**Target Subsystem:** `server/modules/employee-monitoring-v2/middleware/authV2.js`  
**Date:** November 2026  
**Status:** DRAFT / PENDING APPROVAL  

---

## 1. Authorization Philosophy: Deny-by-Default

Employee Monitoring V2 enforces a strict **deny-by-default, least-privilege security model**. Administrative monitoring data is never accessible based on frontend visibility alone; every API endpoint, WebSocket channel, and database query must independently verify user role and organizational scope.

### The Employee Isolation Axiom:
> *An employee must have **zero technical capability** to query, view, or stream another employee's monitoring telemetry, active device, session state, or productivity scores. Any attempt to query cross-user data is rejected with `403 Forbidden` and logged as a security violation.*

---

## 2. Comprehensive RBAC Permissions Matrix

| Operational Capability / Endpoint | Super Admin | Branch Admin | HR Manager | Dept Lead / Manager | Employee / User | External Auditor |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Start / Pause / End Own Work Session** | YES | YES | YES | YES | **YES** | NO |
| **View Own Live Session & Timeline** | YES | YES | YES | YES | **YES** | NO |
| **Switch Own Device (Handoff)** | YES | YES | YES | YES | **YES** | NO |
| **View Own Privacy Transparency Data** | YES | YES | YES | YES | **YES** | NO |
| **View Live Fleet Presence (All)** | **YES** | Scoped Branch | NO | NO | **DENIED** | NO |
| **View Live Fleet Presence (Branch)** | YES | **YES** | NO | NO | **DENIED** | NO |
| **View Team Presence (Dept Only)** | YES | Scoped Branch | Scoped Dept | **YES** | **DENIED** | NO |
| **Drill-Down to Employee Timeline** | **YES** | Scoped Branch | NO | Scoped Dept | **DENIED** | NO |
| **Export Aggregated PDF/CSV Reports** | **YES** | Scoped Branch | **YES** | Scoped Dept | **DENIED** | **YES (Read-Only)** |
| **Configure Work-App Allowlist** | **YES** | NO | NO | NO | **DENIED** | NO |
| **Revoke / Approve Registered Devices**| **YES** | Scoped Branch | NO | NO | **DENIED** | NO |
| **View Security & Compliance Audit Logs**| **YES** | Scoped Branch | NO | NO | **DENIED** | **YES (Read-Only)** |
| **Decommission / Roll Back V2 Module**| **YES** | NO | NO | NO | **DENIED** | NO |

---

## 3. Scope Enforcement Architecture

### A. Backend Scoping Middleware (`scopeGuard.js`)
When a manager queries telemetry (e.g., `GET /api/monitoring-v2/timeline/:employeeId`):

```javascript
// server/modules/employee-monitoring-v2/middleware/scopeGuard.js
async function verifyMonitoringScope(req, res, next) {
  const targetEmployeeId = req.params.employeeId || req.query.employeeId;
  const requestingUser = req.user;

  // 1. Self-Access: An employee can always access their own data
  if (String(requestingUser.id) === String(targetEmployeeId)) {
    return next();
  }

  // 2. Super Admin: Organization-wide access granted
  if (requestingUser.role === 'Admin' || requestingUser.role === 'SuperAdmin') {
    return next();
  }

  // 3. Department Lead / Manager Scope Check
  if (requestingUser.role === 'Manager') {
    const targetUser = await User.findById(targetEmployeeId).select('department branch').lean();
    if (!targetUser) return res.status(404).json({ error: 'Employee not found' });

    // Verify requesting manager leads target user's department
    const isDeptLead = String(requestingUser.department) === String(targetUser.department);
    if (isDeptLead) {
      return next();
    }
  }

  // 4. Any other access attempt is strictly forbidden
  return res.status(403).json({
    error: 'Access denied: You do not have permission to view monitoring data for this employee',
    code: 'INSUFFICIENT_SCOPE'
  });
}
```

---

## 4. WebSocket & Real-Time Channel Security

To prevent unauthorized live eavesdropping via WebSockets:
1. **Authenticated Socket Handshake:** Socket.IO connections must provide a valid JWT bearer token during the connection handshake. Unauthenticated sockets are severed immediately.
2. **Channel-Level Authorization (`socket.join`):**
   - **Employee Personal Channel (`room:employee:${userId}`):** Only the user matching `${userId}` can join. Receives personal session lease renewals and pause reminders.
   - **Admin Fleet Channel (`room:fleet:${branchId}`):** Only users with role `Admin` or `Manager` assigned to `${branchId}` can join. Streams live presence rollups.
   - If a client socket attempts to join an unauthorized room via `socket.emit('join', 'room:fleet:all')`, the server rejects the request and logs an audit violation.
