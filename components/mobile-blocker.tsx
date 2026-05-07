"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Monitor, Smartphone, AlertTriangle } from "lucide-react"

/**
 * Mobile Device Blocker
 * Detects mobile devices and shows a warning message
 * Only allows access from desktop/laptop devices
 */
export function MobileBlocker({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const isMobileRef = useRef(false)

  useEffect(() => {
    const checkDevice = () => {
      // Check multiple signals for mobile devices - STRICT DETECTION
      const userAgent = navigator.userAgent.toLowerCase()
      
      // Check for mobile user agents (more comprehensive)
      const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet|kindle|silk|fennec|maemo|windows phone|windows mobile|windows ce|palm|symbian|symbos|series60|series40|nokia|lg|motorola|samsung|sony|ericsson|huawei|xiaomi|oppo|vivo|oneplus|realme|meizu|zte|alcatel|asus|acer|dell|hp|lenovo|toshiba|fujitsu|panasonic|sharp|sanyo|benq|philips|siemens|siemens|sagem|nec|pantech|kyocera|sendo|bird|amoi|haier|konka|tcl|gionee|coolpad|leeco|letv|zuk|yulong|gfive|karbonn|micromax|spice|celkon|intex|lava|wiko|archos|prestigio|teclast|onda|cube|chuwi|jide|remix/i.test(userAgent)
      
      // Check screen size - block anything smaller than 1024px (more strict)
      const isSmallScreen = window.innerWidth < 1024 || window.innerHeight < 600
      
      // Check touch support (mobile devices have touch)
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      
      // Check for mobile-specific features
      const hasMobileFeatures = 'orientation' in window || 'onorientationchange' in window
      
      // Check device pixel ratio (mobile devices often have high DPR)
      const highDPR = window.devicePixelRatio > 2
      
      // Check for mobile connection type
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
      const isMobileConnection = connection && (connection.type === 'cellular' || connection.type === 'wimax')
      
      // STRICT: Block if ANY of these conditions are true
      // 1. Mobile user agent detected
      // 2. Small screen AND touch device (likely mobile)
      // 3. Small screen AND mobile features
      // 4. Mobile connection type
      const isMobileDevice = isMobileUA || 
                            (isSmallScreen && isTouchDevice) || 
                            (isSmallScreen && hasMobileFeatures) ||
                            isMobileConnection ||
                            (isSmallScreen && highDPR && isTouchDevice)
      
      isMobileRef.current = isMobileDevice
      setIsMobile(isMobileDevice)
      setIsChecking(false)
    }

    checkDevice()
    
    // Continuous monitoring - re-check frequently to prevent bypass attempts
    const interval = setInterval(checkDevice, 1000) // Check every second
    
    // Re-check on window resize and orientation change (in case user resizes browser or rotates device)
    window.addEventListener('resize', checkDevice)
    window.addEventListener('orientationchange', checkDevice)
    
    // Prevent context menu and dev tools (additional security)
    const preventContextMenu = (e: MouseEvent) => {
      if (isMobileRef.current) {
        e.preventDefault()
      }
    }
    const preventDevTools = (e: KeyboardEvent) => {
      if (isMobileRef.current && (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I'))) {
        e.preventDefault()
      }
    }
    
    document.addEventListener('contextmenu', preventContextMenu)
    document.addEventListener('keydown', preventDevTools)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', checkDevice)
      window.removeEventListener('orientationchange', checkDevice)
      document.removeEventListener('contextmenu', preventContextMenu)
      document.removeEventListener('keydown', preventDevTools)
    }
  }, [])

  // Show nothing while checking
  if (isChecking) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-900" />
  }

  // Show mobile blocking message
  if (isMobile) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full shadow-2xl">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <Smartphone className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-2">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
                Mobile Access Restricted
              </CardTitle>
              <CardDescription className="text-base mt-3">
                This system is designed for desktop/laptop use only
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <h3 className="font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-2 mb-2">
                <Monitor className="w-5 h-5" />
                Required Device
              </h3>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Please access this website using a desktop computer, laptop, or MacBook for the best experience and full functionality.
              </p>
            </div>

            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <p>
                <strong className="text-gray-900 dark:text-white">Why desktop only?</strong>
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Complex data entry and management features</li>
                <li>Large tables and detailed reports</li>
                <li>Optimal viewing of schedules and attendance records</li>
                <li>Enhanced security for administrative functions</li>
              </ul>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                If you believe this is an error, please contact your system administrator.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Allow desktop access
  return <>{children}</>
}

