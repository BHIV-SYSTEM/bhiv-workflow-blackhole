"use client"

import { useState, useEffect } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { DashboardSidebar } from "../components/dashboard/sidebar"
import UniverseBackground from "../components/UniverseBackground"
import { useTheme } from "../components/theme-provider"
import { DashboardHeader } from "../components/dashboard/header"
import EnhancedStartDayDialog from "../components/attendance/EnhancedStartDayDialog"
import { useAuth } from "../context/auth-context"
import api from "../lib/api"

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { theme } = useTheme()
  const { user } = useAuth()
  const [showStartDayDialog, setShowStartDayDialog] = useState(false)
  const [checkedPrompt, setCheckedPrompt] = useState(false)

  useEffect(() => {
    // Only check once after login
    if (!user || checkedPrompt) return

    const dateKey = new Date().toISOString().slice(0, 10)
    const storageKey = `startDayPromptShown:${user.id}:${dateKey}`

    // If user already started day previously or we've shown the prompt manually today, skip
    if (localStorage.getItem(storageKey)) {
      setCheckedPrompt(true)
      return
    }

    // Use verify endpoint to determine if the user can start day
    api
      .get(`/attendance/verify/${user.id}`)
      .then((res) => {
        const data = res?.data || res // handle both {success,data} and direct data
        if (data && data.canStartDay) {
          setShowStartDayDialog(true)
        }
      })
      .catch(() => {
        // On failure, do nothing; user can still start from Start Day page
      })
      .finally(() => {
        setCheckedPrompt(true)
      })
  }, [user, checkedPrompt])

  const handleStartDaySuccess = () => {
    if (!user) return
    const dateKey = new Date().toISOString().slice(0, 10)
    const storageKey = `startDayPromptShown:${user.id}:${dateKey}`
    localStorage.setItem(storageKey, "1")
    setShowStartDayDialog(false)
  }

  const location = useLocation()

  const closeSidebar = () => {
    setSidebarOpen(false)
    document.body.classList.remove('sidebar-open')
  }

  useEffect(() => {
    closeSidebar()
  }, [location.pathname])

  useEffect(() => {
    return () => {
      document.body.classList.remove('sidebar-open')
    }
  }, [])

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev
      if (next) {
        document.body.classList.add('sidebar-open')
      } else {
        document.body.classList.remove('sidebar-open')
      }
      return next
    })
  }

  return (
    <div className="h-dvh w-full bg-gradient-to-br from-background via-background to-muted/20 flex overflow-hidden">
      {/* Premium Background Elements */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_120%,hsl(var(--primary)/0.05),transparent)] pointer-events-none"></div>

      {/* Universe particle canvas (render only when universe theme is active) */}
      {theme === 'universe' && <UniverseBackground />}

      {/* Enhanced Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-md transition-all duration-300 animate-fade-in"
          onClick={closeSidebar}
        />
      )}

      {/* Fixed Sidebar for Desktop */}
      <aside className="hidden md:flex md:flex-shrink-0 relative z-30">
        <DashboardSidebar />
      </aside>

      {/* Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-out md:hidden ${
          sidebarOpen ? 'translate-x-0 shadow-glow-primary' : '-translate-x-full'
        }`}
      >
        <DashboardSidebar onNavigate={closeSidebar} isMobile />
      </aside>

      {/* Main Content Container */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Fixed Header */}
        <header className="flex-shrink-0 z-20 sticky top-0">
          <DashboardHeader sidebarOpen={sidebarOpen} onSidebarToggle={toggleSidebar} />
        </header>

        {/* Main Content Area - Full Page */}
        <main className="flex-1 overflow-auto relative">
          <div className="min-h-full p-3 sm:p-5 md:p-6 lg:p-8">
            <div className="w-full animate-fade-in">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Start Day Dialog */}
      <EnhancedStartDayDialog
        isOpen={showStartDayDialog}
        onClose={() => setShowStartDayDialog(false)}
        onSuccess={handleStartDaySuccess}
      />
    </div>
  )
}