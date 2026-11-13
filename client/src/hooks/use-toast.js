"use client"

import React, { useState, useCallback } from "react"
import hotToast from "react-hot-toast"
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react"

const VARIANT_STYLES = {
  destructive: {
    border: "border-destructive/50",
    bg: "bg-popover/95",
    accentBar: "bg-destructive",
    iconColor: "text-destructive",
    Icon: AlertCircle,
  },
  success: {
    border: "border-success/50",
    bg: "bg-popover/95",
    accentBar: "bg-success",
    iconColor: "text-success",
    Icon: CheckCircle2,
  },
  warning: {
    border: "border-warning/50",
    bg: "bg-popover/95",
    accentBar: "bg-warning",
    iconColor: "text-warning",
    Icon: AlertTriangle,
  },
  info: {
    border: "border-primary/50",
    bg: "bg-popover/95",
    accentBar: "bg-primary",
    iconColor: "text-primary",
    Icon: Info,
  },
  default: {
    border: "border-border",
    bg: "bg-popover/95",
    accentBar: "bg-primary",
    iconColor: "text-primary",
    Icon: Info,
  },
}

// Direct toast function that can be imported and used anywhere
export const toast = ({ title, description, variant = "default", duration = 4500 }) => {
  const style = VARIANT_STYLES[variant] || VARIANT_STYLES.default
  const { Icon } = style

  return hotToast.custom(
    (t) =>
      React.createElement(
        "div",
        {
          role: "alert",
          className: `pointer-events-auto relative flex w-full max-w-[380px] items-start gap-3 overflow-hidden rounded-2xl border ${style.border} ${style.bg} backdrop-blur-xl px-4 py-3.5 text-popover-foreground shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35)] transition-all duration-200 ${
            t.visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-2 scale-95"
          }`,
        },
        React.createElement("div", {
          className: `absolute left-0 top-0 bottom-0 w-1 ${style.accentBar}`,
        }),
        React.createElement(Icon, {
          className: `h-5 w-5 shrink-0 mt-0.5 ${style.iconColor}`,
        }),
        React.createElement(
          "div",
          { className: "flex-1 min-w-0 pr-5" },
          title
            ? React.createElement(
                "div",
                { className: "text-sm font-semibold leading-snug text-popover-foreground" },
                title
              )
            : null,
          description
            ? React.createElement(
                "div",
                { className: "mt-0.5 text-xs leading-relaxed text-muted-foreground break-words" },
                description
              )
            : null
        ),
        React.createElement(
          "button",
          {
            type: "button",
            "aria-label": "Close notification",
            onClick: () => hotToast.dismiss(t.id),
            className:
              "absolute right-2.5 top-2.5 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer",
          },
          React.createElement(X, { className: "h-4 w-4" })
        )
      ),
    {
      duration,
      position: "top-right",
    }
  )
}

// Hook version for components that need to manage toast state
export function useToast() {
  const [toasts] = useState([])

  const toastFunction = useCallback(({ title, description, variant = "default", duration = 4500 }) => {
    return toast({ title, description, variant, duration })
  }, [])

  const dismiss = useCallback((id) => {
    hotToast.dismiss(id)
  }, [])

  return {
    toast: toastFunction,
    dismiss,
    toasts,
  }
}
