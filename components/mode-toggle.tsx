"use client"

import { useCallback, MouseEvent } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"

interface ModeToggleProps {
  size?: "icon" | "sm" | "default" | "lg"
}

export function ModeToggle({ size = "icon" }: ModeToggleProps) {
  const { theme, setTheme } = useTheme()

  const isDark = theme === "dark"

  const handleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    // Prevent any parent clickable wrappers from triggering navigation
    event.preventDefault()
    event.stopPropagation()
    setTheme(isDark ? "light" : "dark")
  }, [isDark, setTheme])

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleClick}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className="h-8 w-8"
    >
      <Sun className={`h-4 w-4 ${isDark ? "hidden" : ""}`} />
      <Moon className={`h-4 w-4 ${isDark ? "" : "hidden"}`} />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}


