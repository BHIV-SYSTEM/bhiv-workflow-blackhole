import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "../context/auth-context"

export const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === "User" ? "/userdashboard" : "/dashboard"} replace />
  }

  if (user.role === "User") {
    const allowedPaths = [
      "/userdashboard",
      "/knowledge-admin",
      "/my-tasks",
      "/progress",
      "/aims",
      "/todaysaim",
      "/leaderboard",
      "/leave-request",
      "/work-session",
    ]

    const isAllowed =
      allowedPaths.includes(location.pathname) ||
      location.pathname.startsWith("/tasks/") ||
      location.pathname.startsWith("/settings")

    if (!isAllowed) {
      return <Navigate to="/userdashboard" replace />
    }
  }

  if (user.role === "Tester") {
    const testerAllowed = ["/tester-dashboard", "/tester-tasks", "/tester-evaluation", "/tester-alerts", "/tested-tasks", "/knowledge-admin", "/settings"]
    const isAllowed = testerAllowed.some(
      (p) => location.pathname === p || location.pathname.startsWith(p + "/")
    ) || location.pathname.startsWith("/tasks/")
    if (!isAllowed) {
      return <Navigate to="/tester-dashboard" replace />
    }
  }

  return children
}
