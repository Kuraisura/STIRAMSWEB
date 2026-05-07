/**
 * Active Academic Term Check Hook
 * Prevents navigation when no active academic term is set
 */

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function useActiveTermCheck() {
  const router = useRouter()
  const pathname = usePathname()
  const [showWarning, setShowWarning] = useState(false)
  const [hasActiveTerm, setHasActiveTerm] = useState<boolean | null>(null)

  useEffect(() => {
    checkActiveTerm()
  }, [pathname])

  const checkActiveTerm = async () => {
    try {
      // Allow access to academic-term page always
      if (pathname?.includes('/academic-term')) {
        setHasActiveTerm(true)
        setShowWarning(false)
        return
      }

      const res = await fetch('/api/academic-terms', { cache: 'no-store' })
      if (!res.ok) {
        console.error('[ActiveTermCheck] Error checking active term: HTTP', res.status)
        return
      }

      const json = await res.json().catch(() => ({}))
      const rows = Array.isArray(json?.data) ? json.data : []
      const data = rows.find((term: any) => term?.is_active)

      const hasActive = !!data
      setHasActiveTerm(hasActive)

      if (!hasActive && pathname !== '/dashboard/academic-term') {
        setShowWarning(true)
      } else {
        setShowWarning(false)
      }
    } catch (error) {
      console.error('[ActiveTermCheck] Error:', error)
    }
  }

  const redirectToAcademicTerm = () => {
    setShowWarning(false)
    router.push('/dashboard/academic-term')
  }

  return {
    showWarning,
    hasActiveTerm,
    redirectToAcademicTerm,
    closeWarning: () => setShowWarning(false)
  }
}
