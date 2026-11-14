import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { LayoutDashboard, CheckSquare, Network, Users, Sparkles, Settings, LogOut, CheckCircle, BarChart, Airplay, LayoutDashboardIcon, Target, Monitor, DollarSign, Calendar, Clock, UserCog, UserCheck, ShoppingCart, Mail, ChevronLeft, ChevronRight, Building2, FolderKanban, ClipboardCheck, AlertTriangle, FileText, BookOpen } from "lucide-react";
import { useAuth } from "../../context/auth-context";
import { api } from "../../lib/api";

export function DashboardSidebar({ onNavigate, isMobile = false } = {}) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sidebarCounts, setSidebarCounts] = useState({
    tasks: 0,
    taskEvaluation: 0,
    testTasks: 0,
  });

  useEffect(() => {
    let mounted = true;
    let intervalId;

    const fetchSidebarCounts = async () => {
      if (!user?.id) return;

      try {
        if (user.role === "Tester") {
          const [notifications, testedTaskRows] = await Promise.all([
            api.get(`/user-notifications/${user.id}`),
            api.tester.getTestedTasksFeed(),
          ]);

          const unreadTaskAssigned = (notifications || []).filter(
            (n) => !n.read && n.type === "task_created_for_tester"
          ).length;

          const pendingEvaluation = (testedTaskRows || []).filter((r) => !r.evaluation).length;
          const totalTestTasks = (testedTaskRows || []).length;

          if (!mounted) return;
          setSidebarCounts({
            tasks: unreadTaskAssigned,
            taskEvaluation: pendingEvaluation,
            testTasks: totalTestTasks,
          });
          return;
        }

        if (user.role === "Admin" || user.role === "Manager") {
          const testedTaskRows = await api.tester.getTestedTasksFeed();
          if (!mounted) return;
          setSidebarCounts((prev) => ({
            ...prev,
            testTasks: (testedTaskRows || []).length,
          }));
        }
      } catch (error) {
        // Keep sidebar stable even if count APIs fail.
        console.error("Error loading sidebar counts:", error);
      }
    };

    fetchSidebarCounts();
    intervalId = setInterval(fetchSidebarCounts, 60000);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [user?.id, user?.role]);

  const getRouteCount = (href) => {
    if (href === "/tester-tasks") return sidebarCounts.tasks;
    if (href === "/tester-evaluation") return sidebarCounts.taskEvaluation;
    if (href === "/tested-tasks") return sidebarCounts.testTasks;
    return 0;
  };

  // Unified navigation structure with sections
  const getNavigationSections = () => {
    const role = user?.role;

    if (role === "User") {
      return [
        {
          title: "Main",
          routes: [
            { title: "Dashboard", href: "/userdashboard", icon: LayoutDashboardIcon },
            { title: "My Tasks", href: "/my-tasks", icon: CheckSquare },
            { title: "Set Aims", href: "/aims", icon: Target },
            { title: "Progress", href: "/progress", icon: BarChart },
            { title: "Knowledge Admin", href: "/knowledge-admin", icon: BookOpen },
          ]
        },
        {
          title: "Performance",
          routes: [
            { title: "Leaderboard", href: "/leaderboard", icon: Sparkles },
          ]
        }
      ];
    }

    if (role === "Procurement Agent") {
      return [
        {
          title: "Main",
          routes: [
            { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
            { title: "Procurement", href: "/procurement-dashboard", icon: ShoppingCart },
          ]
        },
        {
          title: "Work",
          routes: [
            { title: "Tasks", href: "/tasks", icon: CheckSquare },
            { title: "All Aims", href: "/all-aims", icon: Target },
            { title: "Completed Tasks", href: "/completedtask", icon: CheckCircle },
            { title: "Test Tasks", href: "/tested-tasks", icon: FileText },
            { title: "Knowledge Admin", href: "/knowledge-admin", icon: BookOpen },
          ]
        },
        {
          title: "Performance",
          routes: [
            { title: "Leaderboard", href: "/leaderboard", icon: Sparkles },
          ]
        }
      ];
    }

    if (role === "Admin") {
      return [
        {
          title: "Main",
          routes: [
            { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
            { title: "AI Optimization", href: "/optimization", icon: Sparkles },
          ]
        },
        {
          title: "Work Management",
          routes: [
            { title: "Tasks", href: "/tasks", icon: CheckSquare },
            { title: "Projects", href: "/projects", icon: FolderKanban },
            { title: "Dependencies", href: "/dependencies", icon: Network },
            { title: "Departments", href: "/departments", icon: Users },
            { title: "All Aims", href: "/all-aims", icon: Target },
            { title: "Completed Tasks", href: "/completedtask", icon: CheckCircle },
            { title: "Test Tasks", href: "/tested-tasks", icon: FileText },
          ]
        },
        {
          title: "Employee Management",
          routes: [
            { title: "User Management", href: "/user-management", icon: UserCog },
            { title: "Employee Monitoring", href: "/monitoring", icon: Monitor },
            { title: "Leaderboard", href: "/leaderboard", icon: Sparkles },
          ]
        },
        {
          title: "Attendance & Time",
          routes: [
            { title: "Live Attendance", href: "/attendance-dashboard", icon: UserCheck },
            { title: "Salary Management", href: "/new-salary-management", icon: DollarSign },
          ]
        },
        {
          title: "Operations",
          routes: [
            { title: "Knowledge Admin", href: "/knowledge-admin", icon: BookOpen },
            { title: "Procurement", href: "/procurement-dashboard", icon: ShoppingCart },
            { title: "EMS Dashboard", href: "/ems-dashboard", icon: Mail },
            { title: "Branch Management", href: "/branch-management", icon: Building2 },
          ]
        }
      ];
    }

    if (role === "Tester") {
      return [
        {
          title: "Main",
          routes: [
            { title: "Dashboard", href: "/tester-dashboard", icon: LayoutDashboard },
          ]
        },
        {
          title: "Testing",
          routes: [
            { title: "Tasks", href: "/tester-tasks", icon: CheckSquare },
            { title: "Task Evaluation", href: "/tester-evaluation", icon: ClipboardCheck },
            { title: "Test Tasks", href: "/tested-tasks", icon: FileText },
          ]
        },
        {
          title: "Operations",
          routes: [
            { title: "Knowledge Admin", href: "/knowledge-admin", icon: BookOpen },
          ]
        },
        {
          title: "Monitoring",
          routes: [
            { title: "Alerts", href: "/tester-alerts", icon: AlertTriangle },
          ]
        }
      ];
    }

    // Default for other roles (Manager, Employee, etc.)
    return [
      {
        title: "Main",
        routes: [
          { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { title: "AI Optimization", href: "/optimization", icon: Sparkles },
        ]
      },
      {
        title: "Work",
        routes: [
          { title: "Tasks", href: "/tasks", icon: CheckSquare },
          { title: "Dependencies", href: "/dependencies", icon: Network },
          { title: "Departments", href: "/departments", icon: Users },
          { title: "All Aims", href: "/all-aims", icon: Target },
          { title: "Completed Tasks", href: "/completedtask", icon: CheckCircle },
          { title: "Test Tasks", href: "/tested-tasks", icon: FileText },
          { title: "Knowledge Admin", href: "/knowledge-admin", icon: BookOpen },
        ]
      },
      {
        title: "Performance",
        routes: [
          { title: "Leaderboard", href: "/leaderboard", icon: Sparkles },
        ]
      }
    ];
  };

  const navigationSections = getNavigationSections();

  const effectiveCollapsed = isMobile ? false : isCollapsed;
  const isSettingsActive = location.pathname === "/settings";

  return (
    <aside className={`h-dvh flex flex-col bg-card/95 backdrop-blur-md border-r border-border/60 shadow-xl transition-all duration-300 ease-in-out ${effectiveCollapsed ? 'w-[72px]' : 'w-64'}`}>
      {/* Top Brand Header aligned with DashboardHeader (h-16) */}
      <div className="h-16 flex-shrink-0 border-b border-border/60 px-3 flex items-center justify-center">
        <button
          type="button"
          onClick={() => !isMobile && setIsCollapsed(!isCollapsed)}
          className={`w-full flex items-center ${effectiveCollapsed ? 'justify-center' : 'justify-start px-2'} gap-3 focus:outline-none rounded-xl py-1.5 transition-all duration-200 group`}
          aria-label={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isMobile ? "Infiverse" : effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <div className="w-9 h-9 gradient-primary rounded-xl flex items-center justify-center shadow-glow-primary flex-shrink-0 transition-transform duration-200 group-hover:scale-105 cursor-pointer">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          {!effectiveCollapsed && (
            <span className="text-lg font-heading font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Infiverse
            </span>
          )}
        </button>
      </div>

      {/* Scrollable Navigation Sections */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent hover:scrollbar-thumb-border">
        {navigationSections.map((section) => (
          <div key={section.title} className="space-y-1">
            {!effectiveCollapsed && section.title && (
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.title}
              </div>
            )}
            <div className="space-y-1">
              {section.routes.map((route) => {
                const isActive = location.pathname === route.href;
                const count = getRouteCount(route.href);
                return (
                  <Link
                    key={route.href}
                    to={route.href}
                    onClick={() => onNavigate?.()}
                    className={`group flex items-center ${effectiveCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-xl text-sm font-medium transition-all duration-200 relative ${
                      isActive
                        ? "gradient-primary text-primary-foreground shadow-glow-primary"
                        : "hover:bg-primary/10 hover:text-primary text-foreground/75"
                    }`}
                    title={effectiveCollapsed ? route.title : undefined}
                  >
                    {isActive && !effectiveCollapsed && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary-foreground rounded-r-full" />
                    )}

                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 flex-shrink-0 ${
                      isActive
                        ? 'bg-primary-foreground/20'
                        : 'bg-primary/10 group-hover:bg-primary/20'
                    }`}>
                      <route.icon className="h-4 w-4" />
                    </div>

                    {!effectiveCollapsed && (
                      <span className="flex-1 truncate">
                        {route.title}
                      </span>
                    )}

                    {count > 0 && (
                      <span className={`${effectiveCollapsed ? 'absolute top-1 right-1 min-w-[16px] h-4 px-1 text-[9px]' : 'ml-auto min-w-[20px] h-5 px-1.5 text-[10px]'} rounded-full font-semibold flex items-center justify-center ${
                        isActive
                          ? "bg-primary-foreground text-primary"
                          : "bg-red-500 text-white"
                      }`}>
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Pinned Footer - Settings & User Profile */}
      <div className="flex-shrink-0 border-t border-border/60 p-3 space-y-2 bg-card/60">
        <Link
          to="/settings"
          onClick={() => onNavigate?.()}
          className={`group flex items-center ${effectiveCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
            isSettingsActive
              ? "gradient-primary text-primary-foreground shadow-glow-primary"
              : "hover:bg-primary/10 hover:text-primary text-foreground/75"
          }`}
          title={effectiveCollapsed ? "Settings" : undefined}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isSettingsActive ? 'bg-primary-foreground/20' : 'bg-primary/10 group-hover:bg-primary/20'
          }`}>
            <Settings className="h-4 w-4" />
          </div>
          {!effectiveCollapsed && <span className="flex-1 truncate">Settings</span>}
        </Link>

        {/* User Profile Card */}
        <div className={`${effectiveCollapsed ? 'p-1.5 flex flex-col items-center gap-2' : 'p-2.5'} rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20`}>
          {effectiveCollapsed ? (
            <>
              <div
                className="w-9 h-9 gradient-primary rounded-full flex items-center justify-center text-primary-foreground font-heading font-semibold shadow-glow-primary text-sm"
                title={`${user?.name || "User"} (${user?.role || "User"})`}
              >
                {user?.name?.charAt(0) || "U"}
              </div>
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center justify-center p-2 rounded-lg text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors duration-200 border border-destructive/20"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="w-9 h-9 gradient-primary rounded-full flex items-center justify-center text-primary-foreground font-heading font-semibold shadow-glow-primary flex-shrink-0 text-sm">
                  {user?.name?.charAt(0) || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{user?.name || "User"}</div>
                  <div className="text-xs text-muted-foreground truncate">{user?.role || "User"}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors duration-200 border border-destructive/25"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}