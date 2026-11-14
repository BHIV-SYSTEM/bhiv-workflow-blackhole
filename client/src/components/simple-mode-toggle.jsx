import { Sun, Moon, Star } from "lucide-react"
import { Button } from "../components/ui/button"
import { useTheme } from "./theme-provider"

// Cycles themes: light -> dark -> universe -> light
export function SimpleModeToggle({ className = "" }) {
  const { theme, setTheme } = useTheme()

  const handleToggle = () => {
    if (theme === "light") setTheme("dark")
    else if (theme === "dark") setTheme("universe")
    else setTheme("light")
  }

  // Determine icon for current theme
  const Icon = theme === "dark" ? Moon : theme === "universe" ? Star : Sun

  const label = theme === 'universe' ? 'Universe theme' : theme === 'dark' ? 'Dark theme' : 'Light theme'
  const nextLabel = theme === 'light' ? 'Dark' : theme === 'dark' ? 'Universe' : 'Light'

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleToggle}
      aria-label={`Toggle theme - ${label}`}
      title={`${label} (Click for ${nextLabel})`}
      className={`border-border/70 bg-card/80 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 ${className}`}
    >
      <Icon className="h-[18px] w-[18px] text-primary transition-transform duration-200" />
    </Button>
  )
}
