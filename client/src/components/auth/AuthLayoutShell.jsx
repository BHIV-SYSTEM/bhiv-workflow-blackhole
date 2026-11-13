"use client"

import { motion } from "framer-motion"
import { Sun, Moon, Sparkles, ShieldCheck } from "lucide-react"
import { useTheme } from "../theme-provider"
import UniverseBackground from "../UniverseBackground"

const THEME_OPTIONS = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "universe", label: "Universe", icon: Sparkles },
]

export function AuthLayoutShell({ children, maxWidth = "max-w-md" }) {
  const { theme, setTheme } = useTheme()

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-auto bg-background text-foreground transition-colors duration-300 flex flex-col">
      {/* Fixed Ambient Theme Backdrop */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {theme === "universe" && <UniverseBackground />}

        {/* Theme-tuned atmospheric gradients */}
        <div
          className={
            theme === "universe"
              ? "absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsl(275_95%_60%/0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,hsl(200_95%_62%/0.15),transparent_55%)]"
              : theme === "dark"
                ? "absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.14),transparent_50%),radial-gradient(ellipse_at_bottom_right,hsl(var(--secondary)/0.12),transparent_55%)]"
                : "absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.10),transparent_55%),radial-gradient(ellipse_at_bottom_right,hsl(var(--secondary)/0.08),transparent_55%)]"
          }
        />

        {/* Subtle architectural dot grid */}
        <div
          className="absolute inset-0 opacity-25 dark:opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, hsl(var(--primary) / 0.18) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Soft ambient orbs */}
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-primary/15 blur-3xl animate-float-cyber" />
        <div
          className="absolute -bottom-28 -right-24 w-96 h-96 rounded-full bg-accent/15 blur-3xl animate-float-cyber"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute top-1/2 left-1/4 w-64 h-64 rounded-full bg-secondary/10 blur-3xl animate-float-cyber"
          style={{ animationDelay: "4s" }}
        />
      </div>

      {/* Top Navigation & Theme Switcher Bar */}
      <header className="relative z-20 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-border/70 bg-card/80 backdrop-blur-md shadow-sm">
          <span className="flex h-6 w-6 items-center justify-center rounded-full gradient-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs sm:text-sm font-semibold tracking-tight text-foreground">
            Infiverse Workflow
          </span>
        </div>

        <div
          role="group"
          aria-label="Theme switcher"
          className="inline-flex items-center p-1 rounded-full border border-border/80 bg-card/85 backdrop-blur-md shadow-sm"
        >
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const active =
              theme === opt.id || (theme === "system" && opt.id === "light")
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={`relative inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                  active
                    ? "gradient-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            )
          })}
        </div>
      </header>

      {/* Main Centered Auth Card Region */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-6 sm:py-8">
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={`w-full ${maxWidth}`}
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}

