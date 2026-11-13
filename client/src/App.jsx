import { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./components/theme-provider";
import { SidebarProvider } from "./components/ui/sidebar";
import { Toaster } from "./components/ui/toaster";
import { WorkspaceProvider } from "./context/workspace-context";
import { SocketProvider } from "./context/socket-context";
import { AuthProvider, useAuth } from "./context/auth-context";
import { BranchProvider } from "./context/branch-context";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DashboardLayout } from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Dependencies from "./pages/Dependencies";
import Departments from "./pages/Departments";
import Optimization from "./pages/Optimization";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AuthCallback from "./pages/AuthCallback";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AdminDashboard from "./pages/AdminDashboard";
import UserDashboard from "./pages/UserDashboard";
import TaskDetails from "./pages/TaskDetails";
import CompletedTasks from "./pages/CompletedTasks";
import Progress from "./pages/Progress";
import TodaysAim from "./pages/TodaysAim";
import AllAims from "./pages/AllAims";
import { DashboardProvider } from "./context/DashboardContext";
import Leaderboard from "./pages/Leaderboard";
import { EmployeeMonitoring } from "./pages/EmployeeMonitoring";
import AttendanceDashboard from "./pages/AttendanceDashboard";
import AttendanceDataManagement from "./components/admin/AttendanceDataManagement";
import AdminAimsView from "./components/admin/AdminAimsView";
import UserManagement from "./pages/UserManagement";
import LeaveRequest from "./pages/LeaveRequest";
import KnowledgeAdmin from "./pages/admin/KnowledgeAdmin";
import ErrorBoundary from "./components/ErrorBoundary";
import axios from "axios";
import { API_URL } from "./lib/api";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Toaster as HotToaster } from "react-hot-toast";
import { usePushNotifications } from "./hooks/usePushNotifications";
import EMSDashboard from "./pages/EMSDashboard";
import ProcurementDashboard from "./pages/ProcurementDashboard";
import EnhancedSalaryDashboard from "./pages/EnhancedSalaryDashboard";
import BiometricAttendanceDashboard from "./pages/BiometricAttendanceDashboard";
import NewSalaryManagement from "./pages/NewSalaryManagement";
import BranchManagement from "./pages/BranchManagement";
import ProjectManagement from "./pages/ProjectManagement";
import ProjectDetails from "./pages/ProjectDetails";
import MyTasks from "./pages/MyTasks";
import TesterDashboard from "./pages/TesterDashboard";
import TesterTasks from "./pages/TesterTasks";
import TesterEvaluation from "./pages/TesterEvaluation";
import TesterAlerts from "./pages/TesterAlerts";
import TestedTasks from "./pages/TestedTasks";

function AppContent() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "Admin";
  const isProcurementAgent = user?.role === "Procurement Agent";
  const isTester = user?.role === "Tester";

  const [recentReviews, setRecentReviews] = useState([]);
  const [hasNewReviews, setHasNewReviews] = useState(false);
  const { subscribe } = usePushNotifications()
  const autoPushSubscribedForUser = useRef(null)

  useEffect(() => {
    // Auto-subscribe once per user session to prevent repeated registration storms
    if (user?.id && autoPushSubscribedForUser.current !== user.id) {
      autoPushSubscribedForUser.current = user.id
      subscribe().catch(console.error)
    }
  }, [user?.id, subscribe])

  const markReviewsAsSeen = () => {
    setRecentReviews([]);
    setHasNewReviews(false);
  };

  useEffect(() => {
    const fetchReviews = async () => {
      if (!user?.id) {
        console.log("No user ID found in localStorage");
        setRecentReviews([]);
        setHasNewReviews(false);
        return;
      }

      const token = localStorage.getItem("WorkflowToken");
      if (!token) {
        console.log("No authentication token found");
        setRecentReviews([]);
        setHasNewReviews(false);
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/users/${user.id}/submissions`, {
          headers: { "x-auth-token": token },
        });
        console.log("Submissions API response:", response.data);
        const submissions = Array.isArray(response.data) ? response.data : [];
        const recentlyReviewed = submissions.filter((submission) => {
          if (submission.status !== "Pending") {
            const reviewDate = new Date(submission.updatedAt);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            return reviewDate > sevenDaysAgo;
          }
          return false;
        });
        setRecentReviews(recentlyReviewed);
        setHasNewReviews(recentlyReviewed.length > 0);
      } catch (error) {
        // Handle different types of errors gracefully
        if (error.response?.status === 404) {
          console.log("User submissions not found - this is normal for new users");
        } else if (error.response?.status === 403) {
          console.log("Not authorized to access submissions");
        } else if (error.response?.status === 401) {
          console.log("Authentication failed - token may be expired");
          // Clear invalid token
          localStorage.removeItem("WorkflowToken");
          localStorage.removeItem("WorkflowUser");
        } else {
          console.log("Error fetching recent reviews:", error.message);
        }
        setRecentReviews([]);
        setHasNewReviews(false);
      }
    };

    // Only fetch reviews if user is logged in
    if (user?.id && localStorage.getItem("WorkflowToken")) {
      fetchReviews();
      const intervalId = setInterval(fetchReviews, 5 * 60 * 1000); // Poll every 5 minutes
      return () => clearInterval(intervalId);
    }
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <WorkspaceProvider>
      <SocketProvider>
        <SidebarProvider>
          <DashboardProvider
            recentReviews={recentReviews}
            hasNewReviews={hasNewReviews}
            markReviewsAsSeen={markReviewsAsSeen}
          >
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />
              <Route path="/auth/callback" element={<AuthCallback />} />

              {/* Protected Routes */}
              <Route
                path="/"
                element={
                  isAdmin ? (
                    <Navigate to="/dashboard" replace />
                  ) : isProcurementAgent ? (
                    <Navigate to="/procurement-dashboard" replace />
                  ) : isTester ? (
                    <Navigate to="/tester-dashboard" replace />
                  ) : (
                    <ProtectedRoute>
                      <Navigate to="/userdashboard" replace />
                    </ProtectedRoute>
                  )
                }
              />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route
                  path="/all-aims"
                  element={
                    <ProtectedRoute>
                      <AllAims />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/aims"
                  element={
                    <ProtectedRoute>
                      <TodaysAim />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/todaysaim"
                  element={
                    <ProtectedRoute>
                      <Navigate to="/aims" replace />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/progress"
                  element={
                    <ProtectedRoute>
                      <Progress />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admindashboard"
                  element={
                    <ProtectedRoute>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/userdashboard"
                  element={
                    <ProtectedRoute>
                      <UserDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/my-tasks"
                  element={
                    <ProtectedRoute>
                      <MyTasks />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/tester-dashboard"
                  element={
                    <ProtectedRoute>
                      <TesterDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tester-tasks"
                  element={
                    <ProtectedRoute>
                      <TesterTasks />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tester-evaluation"
                  element={
                    <ProtectedRoute>
                      <TesterEvaluation />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tester-alerts"
                  element={
                    <ProtectedRoute>
                      <TesterAlerts />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tested-tasks"
                  element={
                    <ProtectedRoute>
                      <TestedTasks />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/tasks"
                  element={
                    <ProtectedRoute>
                      <Tasks />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tasks/:id"
                  element={
                    <ProtectedRoute>
                      <TaskDetails />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dependencies"
                  element={
                    <ProtectedRoute>
                      <Dependencies />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/departments"
                  element={
                    <ProtectedRoute>
                      <Departments />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/optimization"
                  element={
                    <ProtectedRoute>
                      <Optimization />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={<Settings />}
                />
                <Route
                  path="/completedtask"
                  element={
                    <ProtectedRoute>
                      <CompletedTasks />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/leaderboard"
                  element={
                    <ProtectedRoute>
                      <Leaderboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/monitoring"
                  element={
                    <ProtectedRoute>
                      <EmployeeMonitoring />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin-aims"
                  element={
                    <ProtectedRoute>
                      <AdminAimsView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/user-management"
                  element={
                    <ProtectedRoute>
                      <UserManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/knowledge-admin"
                  element={
                    <ProtectedRoute>
                      <KnowledgeAdmin />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/ems-dashboard"
                  element={
                    <ProtectedRoute>
                      <EMSDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/procurement-dashboard"
                  element={
                    <ProtectedRoute>
                      <ProcurementDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/attendance-dashboard"
                  element={
                    <ProtectedRoute>
                      <AttendanceDashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/leave-request"
                  element={
                    <ProtectedRoute>
                      <LeaveRequest />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/biometric-salary-management"
                  element={
                    <ProtectedRoute>
                      <BiometricAttendanceDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/enhanced-salary-dashboard"
                  element={
                    <ProtectedRoute>
                      <EnhancedSalaryDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/biometric-attendance-dashboard"
                  element={
                    <ProtectedRoute>
                      <BiometricAttendanceDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/new-salary-management/:userId?"
                  element={
                    <ProtectedRoute>
                      <NewSalaryManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/branch-management"
                  element={
                    <ProtectedRoute>
                      <BranchManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects"
                  element={
                    <ProtectedRoute>
                      <ProjectManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects/:id"
                  element={
                    <ProtectedRoute>
                      <ProjectDetails />
                    </ProtectedRoute>
                  }
                />
              </Route>
            </Routes>
            <Toaster />
          </DashboardProvider>
        </SidebarProvider>
      </SocketProvider>
    </WorkspaceProvider>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="workflow-theme">
      <Router>
        <AuthProvider>
          <BranchProvider>
            <ErrorBoundary>
              <AppContent />
            </ErrorBoundary>
          </BranchProvider>
        </AuthProvider>
      </Router>
      <ToastContainer
        position="top-right"
        autoClose={4500}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
        style={{ zIndex: 99999 }}
      />
      <HotToaster
        position="top-right"
        containerStyle={{ zIndex: 99999 }}
        toastOptions={{
          duration: 4500,
          style: {
            background: "hsl(var(--popover))",
            color: "hsl(var(--popover-foreground))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "14px",
            boxShadow: "0 18px 40px -12px rgba(0, 0, 0, 0.35)",
          },
        }}
      />
    </ThemeProvider>
  );
}

export default App;