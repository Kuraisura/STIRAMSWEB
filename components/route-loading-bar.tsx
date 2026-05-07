"use client"

import React, { useEffect, useState, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function RouteLoadingBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isCompleting, setIsCompleting] = useState(false)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const completeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isFirstRender = useRef(true)

  const clearTimers = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current)
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
  }

  const startLoading = () => {
    clearTimers()
    setIsLoading(true)
    setProgress(5)
    setIsCompleting(false)

    let currentProgress = 5

    progressIntervalRef.current = setInterval(() => {
      if (currentProgress < 45) {
        currentProgress += Math.random() * 10
      } else if (currentProgress < 78) {
        currentProgress += Math.random() * 4
      } else {
        currentProgress += Math.random() * 1.4
      }

      if (currentProgress >= 92) {
        currentProgress = 92
      }

      setProgress(currentProgress)
    }, 85)
  }

  const completeLoading = () => {
    clearTimers()
    setIsCompleting(true)
    setProgress(100)

    hideTimeoutRef.current = setTimeout(() => {
      setIsLoading(false)
      setProgress(0)
      setIsCompleting(false)
    }, 320)
  }

  useEffect(() => {
    const onNavStart = (event: Event) => {
      const customEvent = event as CustomEvent<{ to?: string }>
      const destination = customEvent.detail?.to
      const label = destination?.split('/').pop()?.replace(/-/g, ' ') || 'section'
      const humanLabel = label.charAt(0).toUpperCase() + label.slice(1)
      void humanLabel
      startLoading()
    }

    window.addEventListener('rams:navigation-start', onNavStart as EventListener)
    return () => window.removeEventListener('rams:navigation-start', onNavStart as EventListener)
  }, [isLoading])

  useEffect(() => {
    // Skip the very first render (initial page load already has its own loader)
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (!isLoading) {
      startLoading()
    }

    completeTimeoutRef.current = setTimeout(() => {
      completeLoading()
    }, 120)

    return () => {
      clearTimers()
    }
  }, [pathname, searchParams])

  if (!isLoading) return null

  return (
    <>
      {/* Top progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 z-[9999] pointer-events-none overflow-hidden">
        {/* Track glow */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(14,165,233,0.22), transparent)',
          }}
        />
        {/* Bar fill */}
        <div
          className="h-full relative"
          style={{
            background: 'linear-gradient(90deg, #0284c7 0%, #0ea5e9 35%, #22d3ee 70%, #38bdf8 100%)',
            width: `${progress}%`,
            transition: isCompleting
              ? 'width 0.35s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.25s ease-out'
              : 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
            opacity: isCompleting ? 0 : 1,
            boxShadow: '0 0 14px rgba(2,132,199,0.65), 0 0 6px rgba(34,211,238,0.45)',
          }}
        >
          {/* Moving shimmer highlight */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)',
              animation: 'bar-shimmer 1s ease-in-out infinite',
            }}
          />
          {/* Leading glow dot */}
          <div
            className="absolute top-1/2 right-0 -translate-y-1/2 w-5 h-5 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(56,189,248,0.45) 60%, transparent 100%)',
              filter: 'blur(3px)',
              animation: 'glow-pulse 0.8s ease-in-out infinite',
            }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes bar-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(250%);  }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.6; transform: translateY(-50%) scale(1);   }
          50%      { opacity: 1;   transform: translateY(-50%) scale(1.3); }
        }
      `}</style>
    </>
  )
}
