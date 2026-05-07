"use client"

import { useEffect } from "react"

export function MaintenanceFallbackGuard() {
  useEffect(() => {
    let consecutiveFailures = 0
    let intervalId: number | null = null

    const checkHealth = async () => {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 2500)

      try {
        const response = await fetch(`/api/health?_=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "x-maintenance-check": "1",
          },
        })

        const contentType = response.headers.get("content-type") || ""
        const isHealthy = response.ok && contentType.includes("application/json")

        if (!isHealthy) {
          throw new Error("Health endpoint unavailable")
        }

        consecutiveFailures = 0
      } catch {
        consecutiveFailures += 1
        if (consecutiveFailures >= 2) {
          window.location.replace("/")
        }
      } finally {
        window.clearTimeout(timeoutId)
      }
    }

    checkHealth()
    intervalId = window.setInterval(checkHealth, 5000)

    const onFocus = () => {
      checkHealth()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkHealth()
      }
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId)
      }
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  return null
}
