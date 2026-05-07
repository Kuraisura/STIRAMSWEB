"use client"

import { useEffect } from "react"

const RELOAD_GUARD_KEY = "rams_chunk_reload_once"

const isChunkLoadFailure = (message?: string | null) => {
  const text = String(message || "")
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk [0-9]+ failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /Loading CSS chunk [0-9]+ failed/i.test(text)
  )
}

const reloadOnce = () => {
  try {
    if (typeof window === "undefined") return
    const alreadyReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY)
    if (alreadyReloaded) return
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
    window.location.reload()
  } catch {
    window.location.reload()
  }
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const target = event.target as HTMLScriptElement | null
      const src = target?.src || ""

      if (isChunkLoadFailure(event.message)) {
        reloadOnce()
        return
      }

      // Script load failures for Next chunks often surface as generic "Script error."
      if (src.includes("/_next/static/chunks/")) {
        reloadOnce()
      }
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = (event as any)?.reason
      const message =
        typeof reason === "string"
          ? reason
          : reason?.message || reason?.toString?.() || ""

      if (isChunkLoadFailure(message)) {
        reloadOnce()
      }
    }

    window.addEventListener("error", onError, true)
    window.addEventListener("unhandledrejection", onUnhandledRejection)

    return () => {
      window.removeEventListener("error", onError, true)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
    }
  }, [])

  return null
}
