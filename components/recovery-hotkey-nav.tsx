"use client"

import { useRouter, usePathname } from "next/navigation"
import { useEffect } from "react"

/**
 * Global emergency shortcut: Ctrl + Alt + Shift + P → recovery passphrase gate (no dashboard login required).
 */
export function RecoveryHotkeyNav() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = String(event.key || "").toLowerCase()
      if (!(event.ctrlKey || event.metaKey)) return
      if (!event.altKey || !event.shiftKey || key !== "p") return
      event.preventDefault()
      /** Avoid disrupting user typing in passphrase field on recovery page */
      const t = document.activeElement
      if (pathname?.startsWith("/auth/recovery") && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement))
        return
      router.push("/auth/recovery?next=/dashboard/recovery-console")
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [router, pathname])

  return null
}
