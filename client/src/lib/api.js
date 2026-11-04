//-----------------------------------------------------
// Determine API base URL
//-----------------------------------------------------
let API_URL = '';

if (import.meta.env.VITE_API_URL) {
  API_URL = import.meta.env.VITE_API_URL;
  console.log('🔧 Using VITE_API_URL:', API_URL);
} else if (typeof window !== 'undefined') {
  const host = window.location.hostname;
  console.log('🌐 Current hostname:', host);

  if (host === 'blackhole-workflow.vercel.app' || host.endsWith('.vercel.app')) {
    // IMPORTANT: This is a fallback. Set VITE_API_URL in Vercel environment variables
    // or in client/.env.production for proper backend connection
    API_URL = 'https://blackholeworkflow.onrender.com/api';
    console.log('🎯 Using Render backend fallback:', API_URL);
    console.warn('⚠️ WARNING: Using fallback backend. Set VITE_API_URL for proper deployment.');
  } else if (host === 'localhost' || host === '127.0.0.1') {
    API_URL = 'http://localhost:5000/api';
    console.log('🏠 Using localhost API:', API_URL);
  } else {
    API_URL = `${window.location.origin}/api`;
    console.log('🏠 Using same-origin API:', API_URL);
  }
} else {
  console.log('⚠️ Window not available, API_URL will be empty');
}

console.log('✅ Final API_URL:', API_URL);
export { API_URL };


//-----------------------------------------------------
// Helper function for API requests
//-----------------------------------------------------
async function fetchAPI(endpoint, options = {}) {
  const token = localStorage.getItem("WorkflowToken");
  const selectedBranch = localStorage.getItem("selectedBranch");

  const headers = {
    "Content-Type": "application/json",
    ...(token && { "x-auth-token": token }),
    ...(selectedBranch && selectedBranch !== "all" && { "x-branch": selectedBranch }),
    ...options.headers,
  };

  // Handle query parameters
  let finalEndpoint = endpoint;
  if (options.params && Object.keys(options.params).length > 0) {
    const queryParams = new URLSearchParams();
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        queryParams.append(key, value);
      }
    });
    const queryString = queryParams.toString();
    if (queryString) {
      finalEndpoint = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryString}`;
    }
  }

  try {
    console.log('🔍 API Debug:', {
      fullURL: `${API_URL}${finalEndpoint}`,
      API_URL,
      endpoint,
      finalEndpoint,
      params: options.params,
      method: options.method || 'GET'
    });

    const response = await fetch(`${API_URL}${finalEndpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      localStorage.removeItem("WorkflowToken");
      localStorage.removeItem("WorkflowUser");
      throw new Error("Unauthorized: Please log in again");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}


//-----------------------------------------------------
// Auth API (FIXED)
//-----------------------------------------------------
const auth = {
  login: (credentials) =>
    fetchAPI("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),

  register: (userData) =>
    fetchAPI("/auth/register", {
      method: "POST",
      body: JSON.stringify(userData),
    }),

  getCurrentUser: () => fetchAPI("/auth/me"),

  // Verify admin password (for branch switching)
  verifyPassword: (password) =>
    fetchAPI("/auth/verify-password", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
};


//-----------------------------------------------------
// Tasks API
//-----------------------------------------------------
const tasks = {
  getTasks: (filters = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(val => queryParams.append(key, val));
      } else if (value) queryParams.append(key, value);
    });

    const queryString = queryParams.toString();
    return fetchAPI(`/tasks${queryString ? `?${queryString}` : ""}`);
  },

  getTask: (id) => fetchAPI(`/tasks/${id}`),

  createTask: (task) =>
    fetchAPI("/tasks", {
      method: "POST",
      body: JSON.stringify(task),
    }),

  updateTask: (id, task) =>
    fetchAPI(`/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(task),
    }),

  deleteTask: (id) => fetchAPI(`/tasks/${id}`, { method: "DELETE" }),

  registerIntake: (intakeData) =>
    fetchAPI("/tasks/register-intake", {
      method: "POST",
      body: JSON.stringify(intakeData),
    }),

  authorizeTask: (id, authData) =>
    fetchAPI(`/tasks/${id}/authorize`, {
      method: "POST",
      body: JSON.stringify(authData),
    }),
};


//-----------------------------------------------------
// Departments API
//-----------------------------------------------------
const departments = {
  getDepartments: () => fetchAPI("/departments"),
  getDepartment: (id) => fetchAPI(`/departments/${id}`),

  createDepartment: (department) =>
    fetchAPI("/departments", {
      method: "POST",
      body: JSON.stringify(department),
    }),

  updateDepartment: (id, department) =>
    fetchAPI(`/departments/${id}`, {
      method: "PUT",
      body: JSON.stringify(department),
    }),

  deleteDepartment: (id) =>
    fetchAPI(`/departments/${id}`, { method: "DELETE" }),

  getDepartmentTasks: (id, filters = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });

    const queryString = queryParams.toString();
    return fetchAPI(`/departments/${id}/tasks${queryString ? `?${queryString}` : ""}`);
  },
};


//-----------------------------------------------------
// Users API
//-----------------------------------------------------
const users = {
  getUsers: () => fetchAPI("/users"),
  getUser: (id) => fetchAPI(`/users/${id}`),

  createUser: (user) =>
    fetchAPI("/users", {
      method: "POST",
      body: JSON.stringify(user),
    }),

  updateUser: (id, user) =>
    fetchAPI(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(user),
    }),

  deleteUser: (id) =>
    fetchAPI(`/users/${id}`, { method: "DELETE" }),

  getUserTasks: (id, filters = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });

    const queryString = queryParams.toString();
    return fetchAPI(`/users/${id}/tasks${queryString ? `?${queryString}` : ""}`);
  },

  changePassword: (id, passwordData) =>
    fetchAPI(`/users/${id}/password`, {
      method: "PUT",
      body: JSON.stringify(passwordData),
    }),

  updateUserStatus: (id, stillExist) =>
    fetchAPI(`/users/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ stillExist }),
    }),

  getAllUsersIncludingExited: () => fetchAPI("/admin/users/all"),
};


//-----------------------------------------------------
// AI Optimization API
//-----------------------------------------------------
const ai = {
  getInsights: () => fetchAPI("/new/ai/insights"),
  optimizeWorkflow: () => fetchAPI("/new/ai/optimize", { method: "POST" }),
  getDependencyAnalysis: () => fetchAPI("/new/ai/dependencies"),
};


//-----------------------------------------------------
// Admin API
//-----------------------------------------------------
const admin = {
  getUsers: (includeExited = false) =>
    fetchAPI(`/admin/users${includeExited ? "?includeExited=true" : ""}`),

  getAllUsers: () => fetchAPI("/admin/users/all"),
  getUser: (id) => fetchAPI(`/admin/users/${id}`),

  createUser: (userData) =>
    fetchAPI("/admin/users", {
      method: "POST",
      body: JSON.stringify(userData),
    }),

  updateUser: (id, userData) =>
    fetchAPI(`/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(userData),
    }),

  updateUserStatus: (id, stillExist) =>
    fetchAPI(`/admin/users/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ stillExist }),
    }),

  deleteUser: (id) =>
    fetchAPI(`/admin/users/${id}`, { method: "DELETE" }),

  getDepartments: () => fetchAPI("/admin/departments"),
  getDepartment: (id) => fetchAPI(`/admin/departments/${id}`),

  createDepartment: (data) =>
    fetchAPI("/admin/departments", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateDepartment: (id, data) =>
    fetchAPI(`/admin/departments/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteDepartment: (id) =>
    fetchAPI(`/admin/departments/${id}`, { method: "DELETE" }),

  getDepartmentTasks: (id, filters = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });

    const queryString = queryParams.toString();
    return fetchAPI(`/admin/departments/${id}/tasks${queryString ? `?${queryString}` : ""}`);
  },
};


//-----------------------------------------------------
// Progress API
//-----------------------------------------------------
const progress = {
  getTaskProgress: (taskId) => fetchAPI(`/progress/task/${taskId}`),
  getUserProgress: (userId) => fetchAPI(`/progress/user/${userId}`),

  createProgress: (data) =>
    fetchAPI("/progress", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateProgress: (id, data) =>
    fetchAPI(`/progress/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteProgress: (id) =>
    fetchAPI(`/progress/${id}`, { method: "DELETE" }),
};


//-----------------------------------------------------
// Notifications API
//-----------------------------------------------------
const notifications = {
  broadcastReminders: () =>
    fetchAPI("/notifications/broadcast-reminders", {
      method: "POST",
    }),

  broadcastAimReminders: () =>
    fetchAPI("/notifications/broadcast-aim-reminders", {
      method: "POST",
    }),

  generateReports: () =>
    fetchAPI("/notifications/generate-reports", {
      method: "POST",
    }),

  toggleAutomation: (settings) =>
    fetchAPI("/notifications/toggle-automation", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
};


//-----------------------------------------------------
// Dashboard API
//-----------------------------------------------------
const dashboard = {
  getStats: () => fetchAPI("/dashboard/stats"),
  getRecentActivity: () => fetchAPI("/dashboard/activity"),
  getDepartmentStats: () => fetchAPI("/dashboard/departments"),
  getTasksOverview: () => fetchAPI("/dashboard/tasks-overview"),
  getUserStats: (userId) => fetchAPI(`/dashboard/user-stats/${userId}`),
  getLeaderboard: () => fetchAPI("/dashboard/leaderboard"),
  getAdminReport: (date, filter) => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (filter) params.append('filter', filter);
    const queryString = params.toString();
    return fetchAPI(`/dashboard/admin-report${queryString ? `?${queryString}` : ''}`);
  },
  getAIInsights: () => fetchAPI("/new/ai/insights"),
};


//-----------------------------------------------------
// Aims API
//-----------------------------------------------------
const aims = {
  getAims: (filters = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });

    const queryString = queryParams.toString();
    return fetchAPI(`/aims${queryString ? `?${queryString}` : ""}`);
  },

  getTodayAim: (userId) => fetchAPI(`/aims/today/${userId}`),

  getUserAims: (userId, filters = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });

    const queryString = queryParams.toString();
    return fetchAPI(`/aims/user/${userId}${queryString ? `?${queryString}` : ""}`);
  },

  createAim: (aim, userId) =>
    fetchAPI(`/aims/postaim/${userId}`, {
      method: "POST",
      body: JSON.stringify(aim),
    }),

  updateAim: (id, aim) =>
    fetchAPI(`/aims/${id}`, {
      method: "PUT",
      body: JSON.stringify(aim),
    }),

  deleteAim: (id) =>
    fetchAPI(`/aims/${id}`, { method: "DELETE" }),

  getAimsWithProgress: (filters = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });

    const queryString = queryParams.toString();
    return fetchAPI(`/aims/with-progress${queryString ? `?${queryString}` : ""}`);
  },
};


//-----------------------------------------------------
// EMS (Email Management System) API
//-----------------------------------------------------
const ems = {
  // Get EMS statistics
  getStats: () => fetchAPI("/ems/stats"),

  // Send task assignment email
  sendTaskAssignment: (data) =>
    fetchAPI("/ems/send-task-assignment", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Send task reminders
  sendTaskReminders: (data) =>
    fetchAPI("/ems/send-task-reminders", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Send overdue alerts
  sendOverdueAlerts: () =>
    fetchAPI("/ems/send-overdue-alerts", {
      method: "POST",
    }),

  // Get email templates
  getTemplates: () => fetchAPI("/ems/templates"),

  // Create email template
  createTemplate: (data) =>
    fetchAPI("/ems/templates", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Update email template
  updateTemplate: (id, data) =>
    fetchAPI(`/ems/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Delete email template
  deleteTemplate: (id) =>
    fetchAPI(`/ems/templates/${id}`, {
      method: "DELETE",
    }),

  // Get scheduled emails
  getScheduledEmails: (filters = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });
    const queryString = queryParams.toString();
    return fetchAPI(`/ems/scheduled-emails${queryString ? `?${queryString}` : ""}`);
  },

  // Cancel scheduled email
  cancelScheduledEmail: (id) =>
    fetchAPI(`/ems/scheduled-emails/${id}`, {
      method: "DELETE",
    }),

  // Process scheduled emails manually
  processScheduledEmails: () =>
    fetchAPI("/ems/process-scheduled", {
      method: "POST",
    }),
};


//-----------------------------------------------------
// Procurement API
//-----------------------------------------------------
const procurement = {
  // Run procurement analysis
  runAnalysis: () =>
    fetchAPI("/procurement/run-analysis", {
      method: "POST",
    }),

  // Get procurement report
  getReport: () => fetchAPI("/procurement/report"),

  // Get available employees
  getAvailableEmployees: () => fetchAPI("/procurement/available-employees"),

  // Get workload distribution
  getWorkloadDistribution: () => fetchAPI("/procurement/workload-distribution"),

  // Assign task to employee
  assignTask: (data) =>
    fetchAPI("/procurement/assign-task", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};


//-----------------------------------------------------
// Attendance API
//-----------------------------------------------------
const attendance = {
  // Start day
  startDay: (userId, attendanceData) =>
    fetchAPI(`/attendance/start-day/${userId}`, {
      method: "POST",
      body: JSON.stringify(attendanceData),
    }),

  // End day
  endDay: (userId, attendanceData) =>
    fetchAPI(`/attendance/end-day/${userId}`, {
      method: "POST",
      body: JSON.stringify(attendanceData),
    }),

  // Get today's attendance
  getTodayAttendance: (userId) => 
    fetchAPI(`/attendance/today/${userId}`),

  // Get user attendance records
  getUserAttendance: (userId, filters = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });
    const queryString = queryParams.toString();
    return fetchAPI(`/attendance/user/${userId}${queryString ? `?${queryString}` : ""}`);
  },

  // Get all attendance records (admin)
  getAllAttendance: (filters = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });
    const queryString = queryParams.toString();
    return fetchAPI(`/attendance${queryString ? `?${queryString}` : ""}`);
  },

  // Update attendance record
  updateAttendance: (id, data) =>
    fetchAPI(`/attendance/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Delete attendance record
  deleteAttendance: (id) =>
    fetchAPI(`/attendance/${id}`, { method: "DELETE" }),
};


//-----------------------------------------------------
// Branches API
//-----------------------------------------------------
const branches = {
  // Get all active branches (public - for registration)
  getAll: () => fetchAPI("/branches"),
  // Get all branches including inactive (admin only)
  getAllAdmin: () => fetchAPI("/branches/all"),
  // Get single branch
  get: (id) => fetchAPI(`/branches/${id}`),
  // Create branch (admin only)
  create: (branch) =>
    fetchAPI("/branches", {
      method: "POST",
      body: JSON.stringify(branch),
    }),
  // Update branch (admin only)
  update: (id, branch) =>
    fetchAPI(`/branches/${id}`, {
      method: "PUT",
      body: JSON.stringify(branch),
    }),
  // Delete branch (admin only)
  delete: (id) =>
    fetchAPI(`/branches/${id}`, { method: "DELETE" }),

  // Set branch password directly (admin only)
  setPassword: (id, password) =>
    fetchAPI(`/branches/${id}/set-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  // Verify branch switch password
  verifySwitchPassword: (branchCode, password) =>
    fetchAPI("/branches/verify-switch-password", {
      method: "POST",
      body: JSON.stringify({ branchCode, password }),
    }),

  // Check if branch has password set
  hasPassword: (id) =>
    fetchAPI(`/branches/${id}/has-password`),
};


//-----------------------------------------------------
// Projects API
//-----------------------------------------------------
const projects = {
  // Get all projects
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchAPI(`/projects${query ? `?${query}` : ""}`);
  },

  // Get single project with full details
  get: (id) => fetchAPI(`/projects/${id}`),

  // Create project (admin only)
  create: (project) =>
    fetchAPI("/projects", {
      method: "POST",
      body: JSON.stringify(project),
    }),

  // Update project (admin only)
  update: (id, project) =>
    fetchAPI(`/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(project),
    }),

  // Delete project (admin only)
  delete: (id) =>
    fetchAPI(`/projects/${id}`, { method: "DELETE" }),

  // Get projects by department
  getByDepartment: (departmentId) =>
    fetchAPI(`/projects/department/${departmentId}`),

  // Add task to project
  addTask: (projectId, taskId) =>
    fetchAPI(`/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ taskId }),
    }),

  // Remove task from project
  removeTask: (projectId, taskId) =>
    fetchAPI(`/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" }),

  // Add team member
  addTeamMember: (projectId, userId) =>
    fetchAPI(`/projects/${projectId}/team`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),

  // Remove team member
  removeTeamMember: (projectId, userId) =>
    fetchAPI(`/projects/${projectId}/team/${userId}`, { method: "DELETE" }),

  // Get project statistics
  getStats: (id) => fetchAPI(`/projects/${id}/stats`),

  // Recalculate progress
  recalculateProgress: (id) =>
    fetchAPI(`/projects/${id}/recalculate`, { method: "POST" }),
};


//-----------------------------------------------------
// Generic HTTP Methods
//-----------------------------------------------------
const httpMethods = {
  get: (endpoint, options = {}) => fetchAPI(endpoint, { method: "GET", ...options }),
  post: (endpoint, data, options = {}) =>
    fetchAPI(endpoint, { method: "POST", body: JSON.stringify(data), ...options }),
  put: (endpoint, data, options = {}) =>
    fetchAPI(endpoint, { method: "PUT", body: JSON.stringify(data), ...options }),
  delete: (endpoint, options = {}) =>
    fetchAPI(endpoint, { method: "DELETE", ...options }),
  patch: (endpoint, data, options = {}) =>
    fetchAPI(endpoint, { method: "PATCH", body: JSON.stringify(data), ...options }),
};


//-----------------------------------------------------
// Tester API Module
//-----------------------------------------------------
const tester = {
  getDashboardStats: () => fetchAPI("/tester/dashboard-stats"),
  getTasks: (params = {}) => fetchAPI("/tester/tasks", { params }),
  getDepartments: () => fetchAPI("/tester/departments"),
  getUsers: () => fetchAPI("/tester/users"),
  getTestedTasksFeed: () => fetchAPI("/tester/tested-tasks-feed"),
  getEvaluations: () => fetchAPI("/tester/evaluations"),
  getEvaluation: (id) => fetchAPI(`/tester/evaluations/${id}`),
  createEvaluation: (data) => fetchAPI("/tester/evaluations", { method: "POST", body: JSON.stringify(data) }),
  updateEvaluation: (id, data) => fetchAPI(`/tester/evaluations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  getAlerts: () => fetchAPI("/tester/alerts"),
};

//-----------------------------------------------------
// Combine All API Modules
//-----------------------------------------------------
export const api = {
  ...httpMethods,
  auth,
  tasks,
  departments,
  users,
  ai,
  progress,
  notifications,
  admin,
  dashboard,
  aims,
  attendance,
  ems,
  procurement,
  branches,
  projects,
  tester,
};

export default api;
