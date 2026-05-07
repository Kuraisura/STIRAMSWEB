"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Clock, Copy, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: string
  disabled?: boolean
  className?: string
  onCopyTime?: () => void
  lastUsedTime?: string
}

export function TimePicker({
  value,
  onChange,
  placeholder = "Select time",
  error,
  disabled,
  className,
  onCopyTime,
  lastUsedTime,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [hour, setHour] = React.useState<string>("")
  const [minute, setMinute] = React.useState<string>("")
  const [period, setPeriod] = React.useState<"AM" | "PM">("AM")

  // Parse existing value when it changes
  React.useEffect(() => {
    if (value) {
      const parsed = parseTime12h(value)
      if (parsed) {
        setHour(parsed.hour.toString().padStart(2, "0"))
        setMinute(parsed.minute.toString().padStart(2, "0"))
        setPeriod(parsed.period)
      }
    } else {
      setHour("")
      setMinute("")
      setPeriod("AM")
    }
  }, [value])

  const parseTime12h = (timeStr: string): { hour: number; minute: number; period: "AM" | "PM" } | null => {
    if (!timeStr) return null
    
    // Try to parse formats like "08:00 AM", "8:00 AM", "8:00AM", etc.
    const cleaned = timeStr.trim().toUpperCase()
    const match = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/)
    
    if (!match) return null
    
    let hour = parseInt(match[1], 10)
    const minute = parseInt(match[2], 10)
    let period = match[3] as "AM" | "PM" | undefined
    
    // If no period specified, try to infer from hour
    if (!period) {
      period = hour >= 12 ? "PM" : "AM"
      if (hour > 12) hour -= 12
      if (hour === 0) hour = 12
    } else {
      // Convert 24h to 12h
      if (period === "PM" && hour !== 12) hour -= 12
      if (period === "AM" && hour === 12) hour = 0
    }
    
    return { hour, minute, period }
  }

  const formatTime = (h: string, m: string, p: "AM" | "PM"): string => {
    if (!h || !m) return ""
    const hourNum = parseInt(h, 10)
    const minuteNum = parseInt(m, 10)
    
    if (isNaN(hourNum) || isNaN(minuteNum) || hourNum < 1 || hourNum > 12 || minuteNum < 0 || minuteNum > 59) {
      return ""
    }
    
    return `${hourNum.toString().padStart(2, "0")}:${minuteNum.toString().padStart(2, "0")} ${p}`
  }

  const handleTimeChange = (newHour: string, newMinute: string, newPeriod: "AM" | "PM", shouldClose: boolean = false) => {
    setHour(newHour)
    setMinute(newMinute)
    setPeriod(newPeriod)
    
    const formatted = formatTime(newHour, newMinute, newPeriod)
    if (formatted) {
      onChange(formatted)
      // Only close popover if explicitly requested (not for AM/PM clicks)
      if (shouldClose) {
        setTimeout(() => setOpen(false), 300)
      }
    }
  }

  const handlePeriodChange = (newPeriod: "AM" | "PM") => {
    // Period change should not close the popover
    handleTimeChange(hour || "12", minute || "00", newPeriod, false)
  }

  const handleCopyLastUsed = () => {
    if (lastUsedTime && onCopyTime) {
      onChange(lastUsedTime)
      onCopyTime()
    }
  }

  const hours = Array.from({ length: 12 }, (_, i) => i + 1)
  const minutes = Array.from({ length: 60 }, (_, i) => i)

  return (
    <TooltipProvider delayDuration={200}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "w-full h-11 justify-start text-left font-normal border-2",
                  !value && "text-muted-foreground",
                  error && "border-red-500 focus:ring-red-500",
                  className
                )}
                disabled={disabled}
              >
                <Clock className="mr-2 h-4 w-4" />
                {value || placeholder}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Pick the {placeholder.includes("Start") ? "start" : "end"} time</p>
          </TooltipContent>
        </Tooltip>
        <PopoverContent className="w-auto p-4" align="start">
          <div className="space-y-4">
            {/* Copy last used time button */}
            {lastUsedTime && onCopyTime && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopyLastUsed}
                className="w-full text-xs"
              >
                <Copy className="h-3 w-3 mr-2" />
                Copy last used: {lastUsedTime}
              </Button>
            )}

            {/* Time selector */}
            <div className="flex items-center gap-2">
              {/* Hour */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Hour</label>
                <div className="grid grid-cols-3 gap-1 max-h-[120px] overflow-y-auto border rounded-md p-1">
                  {hours.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleTimeChange(h.toString().padStart(2, "0"), minute || "00", period, false)}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors",
                        hour === h.toString().padStart(2, "0") && "bg-blue-500 text-white hover:bg-blue-600"
                      )}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minute */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Minute</label>
                <div className="grid grid-cols-4 gap-1 max-h-[120px] overflow-y-auto border rounded-md p-1">
                  {[0, 15, 30, 45].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleTimeChange(hour || "12", m.toString().padStart(2, "0"), period, false)}
                      className={cn(
                        "px-2 py-1.5 text-xs rounded hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors",
                        minute === m.toString().padStart(2, "0") && "bg-blue-500 text-white hover:bg-blue-600"
                      )}
                    >
                      {m.toString().padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Period */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Period</label>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => handlePeriodChange("AM")}
                    className={cn(
                      "px-4 py-2 text-sm rounded font-semibold transition-colors",
                      period === "AM"
                        ? "bg-blue-500 text-white hover:bg-blue-600"
                        : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                    )}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePeriodChange("PM")}
                    className={cn(
                      "px-4 py-2 text-sm rounded font-semibold transition-colors",
                      period === "PM"
                        ? "bg-blue-500 text-white hover:bg-blue-600"
                        : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                    )}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>

            {/* Current selection */}
            {value && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">{value}</span>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
}

