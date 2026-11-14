import { useState, useEffect, useRef, Suspense, lazy } from "react";
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
import { DashboardProvider } from "./context/DashboardContext";
import ErrorBoundary from "./components/ErrorBoundary";
import axios from "axios";
import { API_URL } from "./lib/api";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Toaster as HotToaster } from "react-hot-toast";
import { usePushNotifications } from "./hooks/usePushNotifications";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Dependencies = lazy(() => import("./pages/Dependencies"));
const Departments = lazy(() => import("./pages/Departments"));
const Optimization = lazy(() => import("./pages/Optimization"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const TaskDetails = lazy(() => import("./pages/TaskDetails"));
const CompletedTasks = lazy(() => import("./pages/CompletedTasks"));
const Progress = lazy(() => import("./pages/Progress"));
const TodaysAim = lazy(() => import("./pages/TodaysAim"));
const AllAims = lazy(() => import("./pages/AllAims"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const EmployeeMonitoring = lazy(() =>
  import("./pages/EmployeeMonitoring").then((m) => ({ default: m.EmployeeMonitoring }))
);
const AttendanceDashboard = lazy(() => import("./pages/AttendanceDashboard"));
const AdminAimsView = lazy(() => import("./components/admin/AdminAimsView"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const LeaveRequest = lazy(() => import("./pages/LeaveRequest"));
const KnowledgeAdmin = lazy(() => import("./pages/admin/KnowledgeAdmin"));
const EMSDashboard = lazy(() => import("./pages/EMSDashboard"));
const ProcurementDashboard = lazy(() => import("./pages/ProcurementDashboard"));
const EnhancedSalaryDashboard = lazy(() => import("./pages/EnhancedSalaryDashboard"));
const BiometricAttendanceDashboard = lazy(() => import("./pages/BiometricAttendanceDashboard"));
const NewSalaryManagement = lazy(() => import("./pages/NewSalaryManagement"));
const BranchManagement = lazy(() => import("./pages/BranchManagement"));
const ProjectManagement = lazy(() => import("./pages/ProjectManagement"));
const ProjectDetails = lazy(() => import("./pages/ProjectDetails"));
const MyTasks = lazy(() => import("./pages/MyTasks"));
const TesterDashboard = lazy(() => import("./pages/TesterDashboard"));
const TesterTasks = lazy(() => import("./pages/TesterTasks"));
const TesterEvaluation = lazy(() => import("./pages/TesterEvaluation"));
const TesterAlerts = lazy(() => import("./pages/TesterAlerts"));
const TestedTasks = lazy(() => import("./pages/TestedTasks"));

function PageLoader() {
  return (
    <div className="w-full space-y-6 py-4 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-muted/70" />
          <div className="h-4 w-72 rounded-md bg-muted/50" />
        </div>
        <div className="h-9 w-28 rounded-xl bg-muted/60" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-28 rounded-2xl bg-card/70 border border-border/50" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-card/70 border border-border/50" />
    </div>
  );
}

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
            <Suspense fallback={<PageLoader />}>
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
            </Suspense>
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