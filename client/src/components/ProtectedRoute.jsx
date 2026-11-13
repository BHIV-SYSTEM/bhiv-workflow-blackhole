import { useContext } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "../context/auth-context"

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div>Loading...</div> // Replace with a proper loading component if needed
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user.role === "User") {
    // Allow access to /userdashboard, /knowledge-admin, and /tasks/* (including /tasks/:id)
     if (location.pathname !== "/userdashboard" && location.pathname !== "/knowledge-admin" && location.pathname !== "/my-tasks" && !location.pathname.startsWith("/tasks/") && location.pathname !== "/progress" && location.pathname !== "/aims" && location.pathname !== "/todaysaim" && location.pathname !== "/leaderboard"&& location.pathname !== "/leave-request"&&!location.pathname.startsWith("/settings") ) {
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
