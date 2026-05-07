"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
// authenticateUser/getAdminUserById no longer called client-side;
// authentication now goes through the server-side /api/auth/login route.
import { useLanguage } from "@/lib/language-context"

export default function LoginPage() {
  const { t } = useLanguage()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const loginTargetRef = useRef<"dashboard" | "recovery">("dashboard")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [showIntroAnimation, setShowIntroAnimation] = useState(false)
  const [audioContextInitialized, setAudioContextInitialized] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const router = useRouter()
  const { toast } = useToast()


  const setCookie = (name: string, value: string, days: number) => {
    try {
      const encoded = encodeURIComponent(value)
      const maxAge = days * 24 * 60 * 60
      document.cookie = `${name}=${encoded}; path=/; max-age=${maxAge}; samesite=lax` 
    } catch {}
  }

  const getCookie = (name: string): string | null => {
    try {
      const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, "\\$1") + "=([^;]*)"))
      return match ? decodeURIComponent(match[1]) : null
    } catch {
      return null
    }
  }

  const deleteCookie = (name: string) => {
    try {
      document.cookie = `${name}=; path=/; max-age=0`
    } catch {}
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    
    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCombo = event.ctrlKey && event.altKey && event.shiftKey && String(event.key || '').toLowerCase() === 'p'
      if (!isCombo) return

      event.preventDefault()
      router.push('/auth/recovery?next=/dashboard/recovery-console')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router])

  useEffect(() => {
    // Only restore email — NEVER store or restore passwords in cookies
    const savedEmail = getCookie("rams_email")
    if (savedEmail) {
      setEmail(savedEmail)
      setRememberMe(true)
    }
    // Clean up any legacy password cookies that may exist
    deleteCookie("rams_password")

    // Check for displacement reason from single-active-session enforcement
    const params = new URLSearchParams(window.location.search)
    const reason = params.get('reason')
    if (reason === 'displaced') {
      setError('You have been logged out because a new login was detected on another device.')
    } else if (reason === 'expired') {
      setError('Your session has expired. Please sign in again.')
    }
  }, [])



  const initializeAudioContext = () => {
    if (!audioContextInitialized) {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        if (audioContext.state === 'suspended') {
          void audioContext.resume()
        }
        setAudioContextInitialized(true)
        console.log("Audio context initialized")
      } catch (error) {
        console.log("Could not initialize audio context:", error)
      }
    }
  }

  const playSignInSound = () => {
    try {
      console.log("Playing sign-in chime...")

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const now = audioContext.currentTime

      const master = audioContext.createGain()
      master.gain.setValueAtTime(0.0001, now)
      master.gain.exponentialRampToValueAtTime(0.36, now + 0.03)
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.48)
      master.connect(audioContext.destination)

      const filter = audioContext.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(2800, now)
      filter.Q.setValueAtTime(0.8, now)
      filter.connect(master)

      // A short major arpeggio for a cleaner login confirmation sound.
      const notes = [523.25, 659.25, 783.99]
      notes.forEach((frequency, index) => {
        const osc = audioContext.createOscillator()
        const noteGain = audioContext.createGain()

        osc.type = 'triangle'
        osc.frequency.setValueAtTime(frequency, now)

        const start = now + index * 0.075
        const end = start + 0.22

        noteGain.gain.setValueAtTime(0.0001, start)
        noteGain.gain.exponentialRampToValueAtTime(0.2, start + 0.02)
        noteGain.gain.exponentialRampToValueAtTime(0.0001, end)

        osc.connect(noteGain)
        noteGain.connect(filter)
        osc.start(start)
        osc.stop(end)
      })
    } catch (error) {
      console.log("Sound effect not available:", error)
    }
  }

  const playLoginErrorSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const now = audioContext.currentTime

      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.type = 'sawtooth'
      oscillator.frequency.setValueAtTime(220, now)
      oscillator.frequency.exponentialRampToValueAtTime(180, now + 0.18)

      gainNode.gain.setValueAtTime(0.0001, now)
      gainNode.gain.exponentialRampToValueAtTime(0.16, now + 0.02)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.start(now)
      oscillator.stop(now + 0.2)
    } catch (error) {
      console.log("Error sound effect not available:", error)
    }
  }


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")
    const target = loginTargetRef.current

    // Initialize and play sign-in sound for all users on every login attempt.
    initializeAudioContext()
    playSignInSound()

    try {
      const emailInput = email.trim().toLowerCase()
      const passwordInput = password.trim()

      // ── SECURE: Authenticate via server-side API route ──
      // Credentials are sent over HTTPS to the server; the server sets
      // an HttpOnly session cookie — the password NEVER touches cookies
      // or localStorage.
      const authResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput,
          password: passwordInput,
          rememberMe,
        }),
      })

      const contentType = authResponse.headers.get('content-type') || ''
      let authData: any = null

      if (contentType.includes('application/json')) {
        authData = await authResponse.json()
      } else {
        const responseText = await authResponse.text()
        const looksLikeHtml = /<!doctype|<html/i.test(responseText)

        if (looksLikeHtml) {
          throw new Error('Login service is temporarily unavailable (maintenance or server restart in progress). Please try again in a moment.')
        }

        throw new Error(responseText?.trim() || 'Unexpected login response from server.')
      }

      if (!authResponse.ok || !authData.success) {
        // Handle rate limiting
        if (authResponse.status === 429) {
          setError(authData.error || 'Too many login attempts. Please try again later.')
        } else {
          setError(authData.error || t('login.invalid_credentials'))
        }
        playLoginErrorSound()
        setIsLoading(false)
        return
      }

      const user = authData.user

      // Store non-sensitive user info in localStorage for UI rendering.
      // Authentication is NOT based on this — it's based on the HttpOnly
      // session cookie set by the server.
      localStorage.setItem("rams_user", JSON.stringify(user))

      // Store the CSRF token in memory for subsequent requests
      if (authData.csrfToken) {
        sessionStorage.setItem("rams_csrf", authData.csrfToken)
      }

      // Remember email only — NEVER store the password
      if (rememberMe) {
        setCookie("rams_email", email, 30)
      } else {
        deleteCookie("rams_email")
      }
      // Always clean up any legacy insecure cookies
      deleteCookie("rams_password")
      deleteCookie("rams_auth")
      deleteCookie("rams_user_id")
      deleteCookie("rams_user_email")

      toast({
        title: t('login.login_successful'),
        description: t('login.welcome_back').replace('{name}', user.name),
      })

      // Play intro animation after successful sign-in, then go to dashboard
      console.log("Showing intro animation")
      setShowIntroAnimation(true)
      try {
        if (target === "recovery") {
          sessionStorage.setItem("rams_recovery_only", "1")
        } else {
          sessionStorage.removeItem("rams_recovery_only")
        }
      } catch {}
      
      setTimeout(() => {
        console.log("Redirecting to dashboard")
        setIsLoading(false)
        
        // Check if there's a redirect parameter (from middleware)
        const params = new URLSearchParams(window.location.search)
        const redirect = params.get('redirect')
        const fallback = target === 'recovery' ? '/dashboard/recovery-console' : '/dashboard'
        
        // Force hard refresh after login to clear any cached data
        // Redirect to intended page or default to dashboard
        if (target === 'recovery') {
          window.location.href = '/dashboard/recovery-console'
          return
        }
        window.location.href = (redirect && redirect.startsWith('/dashboard')) ? redirect : fallback
      }, 1300)
    } catch (error: any) {
      console.error("Login error:", error)
      playLoginErrorSound()

      if (error.message?.includes("timeout")) {
        setError("Authentication timeout. Please check your connection and try again.")
      } else if (error.message?.includes("password column")) {
        setError(t('login.invalid_credentials'))
      } else if (error.message?.includes("table not found")) {
        setError(t('login.invalid_credentials'))
      } else {
        setError(error.message || t('login.invalid_credentials'))
      }
      
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden flex items-center justify-center p-2 sm:p-4" style={{ height: '100vh', minHeight: '100dvh' }}>
      {/* Background Image - Different image for mobile vs desktop */}
      <div className="absolute inset-0 z-0 overflow-hidden" style={{ height: '100%', minHeight: '100dvh' }}>
        {/* Mobile Background - Full screen coverage with mirrored bottom */}
        <div className="absolute inset-0 sm:hidden overflow-hidden" style={{ width: '100%', height: '100%', minHeight: '100dvh' }}>
          {/* Original Image - Top portion */}
          <div className="absolute top-0 left-0 w-full" style={{ height: '50%', overflow: 'hidden' }}>
            <div className="relative w-full h-full">
              <Image
                src="/Landing Page_/mobile-background.png"
                alt="Mobile Background"
                fill
                className="object-cover bg-kenburns-mobile"
                priority
                sizes="100vw"
                style={{ objectFit: 'cover', objectPosition: 'center top' }}
                onError={(e)=>{ try { (e.currentTarget as any).src = '/placeholder.jpg' } catch {} }}
              />
            </div>
          </div>
          {/* Mirrored Image - Bottom portion (flipped vertically to create seamless mirror effect) */}
          <div className="absolute bottom-0 left-0 w-full" style={{ height: '50%', overflow: 'hidden', transform: 'scaleY(-1)' }}>
            <div className="relative w-full h-full">
              <Image
                src="/Landing Page_/mobile-background.png"
                alt="Mobile Background Mirrored"
                fill
                className="object-cover bg-kenburns-mobile"
                priority={false}
                sizes="100vw"
                style={{ objectFit: 'cover', objectPosition: 'center top' }}
                onError={(e)=>{ try { (e.currentTarget as any).src = '/placeholder.jpg' } catch {} }}
              />
            </div>
          </div>
        </div>
        {/* Desktop Background with mirrored side fills for edge dead spaces */}
        <div className="hidden sm:block absolute inset-0 overflow-hidden bg-sky-300">
          <div className="absolute inset-0">
            <Image
              src="/sign%20in%20page/eq0pluX.jpeg"
              alt="Desktop Background Base"
              fill
              className="object-cover object-center"
              priority={false}
              style={{ objectPosition: 'center 18%' }}
              onError={(e)=>{ try { (e.currentTarget as any).src = '/placeholder.jpg' } catch {} }}
            />
          </div>

          <div className="absolute inset-0">
            <Image
              src="/sign%20in%20page/eq0pluX.jpeg"
              alt="Desktop Background"
              fill
              className="object-cover object-center bg-kenburns-desktop"
              priority
              style={{ objectPosition: 'center 18%' }}
              onError={(e)=>{ try { (e.currentTarget as any).src = '/placeholder.jpg' } catch {} }}
            />
          </div>

          <div className="pointer-events-none absolute inset-y-0 left-0 w-[18%] overflow-hidden opacity-45">
            <div className="relative h-full w-full" style={{ transform: 'scaleX(-1) scale(1.08)', transformOrigin: 'left center' }}>
              <Image
                src="/sign%20in%20page/eq0pluX.jpeg"
                alt="Desktop Background Left Mirror"
                fill
                className="object-cover object-center bg-kenburns-desktop"
                priority={false}
                style={{ objectPosition: 'left 18%' }}
                onError={(e)=>{ try { (e.currentTarget as any).src = '/placeholder.jpg' } catch {} }}
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-sky-300/78 via-sky-300/34 to-transparent" />
          </div>

          <div className="pointer-events-none absolute inset-y-0 right-0 w-[18%] overflow-hidden opacity-45">
            <div className="relative h-full w-full" style={{ transform: 'scaleX(-1) scale(1.08)', transformOrigin: 'right center' }}>
              <Image
                src="/sign%20in%20page/eq0pluX.jpeg"
                alt="Desktop Background Right Mirror"
                fill
                className="object-cover object-center bg-kenburns-desktop"
                priority={false}
                style={{ objectPosition: 'right 18%' }}
                onError={(e)=>{ try { (e.currentTarget as any).src = '/placeholder.jpg' } catch {} }}
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-l from-sky-300/78 via-sky-300/34 to-transparent" />
          </div>
        </div>
      </div>
      {/* Black overlay removed - background now fully visible */}
      <div className="w-full max-w-6xl relative z-20 px-2 sm:px-4">
        <div className="rounded-lg sm:rounded-3xl p-0">
          {/* Content column - centered and slightly wider */}
          <div className="w-full flex justify-center">
            <div className="w-full max-w-[95vw] sm:max-w-xl">
              <Card className="shadow-xl border border-white/30 bg-white/10 dark:bg-white/10 backdrop-blur-md rounded-lg sm:rounded-xl">
                {/* White area now includes logo + RAMS text - Mobile Responsive */}
                <CardHeader className="text-center space-y-1 sm:space-y-2 pb-0.5 sm:pb-1 pt-2 sm:pt-2 px-3 sm:px-4 bg-transparent dark:bg-transparent">
                  <Image
                    src="/sign%20in%20page/sti-logo.png"
                    alt="RAMS"
                    width={80}
                    height={80}
                    className={`mx-auto object-contain drop-shadow-2xl branding-logo w-16 h-16 sm:w-24 sm:h-24 lg:w-[120px] lg:h-[120px] ${showIntroAnimation ? 'branding-hide' : ''}`}
                    style={{ opacity: showIntroAnimation ? 0 : 1, transition: "opacity .25s ease" }}
                    onError={(e)=>{ try { (e.currentTarget as any).src = '/sti-logo.png' } catch {} }}
                  />
                </CardHeader>
                <CardContent className="pt-0 px-4 sm:px-6 pb-4 sm:pb-5 -mt-3 sm:-mt-4 bg-transparent dark:bg-transparent">
                <form onSubmit={handleLogin} className="space-y-2 sm:space-y-2.5">
                  {/* RAMS Text that appears above email field - Mobile Responsive */}
                  <div className={`rams-email-text ${showIntroAnimation ? 'rams-email-show' : ''}`}>
                    <div className="rams-email-title">
                      <span className="letter-e r-e">R</span>
                      <span className="letter-e a-e">A</span>
                      <span className="letter-e m-e">M</span>
                      <span className="letter-e s-e">S</span>
                    </div>
                    <div className="rams-email-subtitle">
                      RFID Attendance Monitoring System
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 sm:space-y-2 mt-1.5 sm:mt-2">
                    <Label htmlFor="email" className="text-xs sm:text-sm font-medium text-white dark:text-white drop-shadow-md">{t('login.email_address')}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('login.email_placeholder')}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        initializeAudioContext()
                      }}
                      onFocus={initializeAudioContext}
                      required
                      className="h-9 sm:h-10 text-sm sm:text-base touch-manipulation bg-white/60 dark:bg-white/60 backdrop-blur-sm border-white/50 dark:border-white/50 text-gray-900 dark:text-gray-900 placeholder:text-gray-600 dark:placeholder:text-gray-600 focus:border-blue-400 focus:ring-blue-400 focus:bg-white/80 dark:focus:bg-white/80"
                    />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="password" className="text-xs sm:text-sm font-medium text-white dark:text-white drop-shadow-md">{t('login.password')}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={t('login.password_placeholder')}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          initializeAudioContext()
                        }}
                        onFocus={initializeAudioContext}
                        required
                        className="h-9 sm:h-10 pr-9 sm:pr-10 text-sm sm:text-base touch-manipulation bg-white/60 dark:bg-white/60 backdrop-blur-sm border-white/50 dark:border-white/50 text-gray-900 dark:text-gray-900 placeholder:text-gray-600 dark:placeholder:text-gray-600 focus:border-blue-400 focus:ring-blue-400 focus:bg-white/80 dark:focus:bg-white/80"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-2 sm:px-3 py-2 hover:bg-transparent touch-manipulation"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5 sm:pt-1">
                    <label className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-white dark:text-white drop-shadow-md select-none touch-manipulation cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-3 w-3 sm:h-3.5 sm:w-3.5 accent-blue-600 cursor-pointer"
                      />
                      {t('login.remember_me')}
                    </label>
                  </div>

                  {error && (
                    <Alert variant="destructive" className="dark:bg-red-50 dark:text-red-900 dark:border-red-200">
                      <AlertDescription className="dark:text-red-900">{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex">
                    <Button type="submit" className="w-full sm:w-1/2 mx-auto h-9 sm:h-8 px-3 bg-white/90 dark:bg-white/90 text-gray-900 dark:text-gray-900 border border-white/50 dark:border-white/50 hover:bg-white dark:hover:bg-white text-xs sm:text-sm touch-manipulation backdrop-blur-sm" disabled={isLoading}>
                      {isLoading ? (
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <div className="loading-spinner border-t-gray-900 w-3.5 h-3.5 sm:w-4 sm:h-4"></div>
                          <span className="text-[10px] sm:text-sm">{t('login.authenticating')}</span>
                        </div>
                      ) : (
                        <span className="text-xs sm:text-sm">{t('login.sign_in')}</span>
                      )}
                    </Button>
                  </div>
                </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
      
      {showIntroAnimation && (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="intro-center">
            <div className="logo-wrap">
              <div className="ripple-wrap" aria-hidden="true">
                <span className="ring r1" />
                <span className="ring r2" />
                <span className="ring r3" />
              </div>
              <Image
                src="/sign%20in%20page/sti-logo.png"
                alt="Intro"
                width={160}
                height={160}
                quality={100}
                className="intro-logo"
                priority
                onError={(e)=>{ try { (e.currentTarget as any).src = '/sti-logo.png' } catch {} }}
              />
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .branding-logo { transition: opacity .25s ease; }
        .branding-hide { opacity: 0; }

        .rams-email-text {
          text-align: center;
          opacity: 0;
          transition: opacity 0.3s ease;
          margin-bottom: 16px;
          margin-top: -50px;
        }

        @media (min-width: 640px) {
          .rams-email-text {
            margin-bottom: 24px;
            margin-top: -70px;
          }
        }

        .rams-email-show {
          opacity: 1;
        }

        .rams-email-title {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 3px;
          margin-bottom: 3px;
        }

        @media (min-width: 640px) {
          .rams-email-title {
            gap: 4px;
            margin-bottom: 4px;
          }
        }

        .rams-email-subtitle {
          font-size: 0.6rem;
          font-weight: 600;
          color: #6b7280;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          animation: fadeInUp 0.6s ease-out 0.6s both;
        }

        @media (min-width: 640px) {
          .rams-email-subtitle {
            font-size: 0.7rem;
          }
        }

        .letter-e {
          font-size: 1.1rem;
          font-weight: 900;
          color: #0032a0;
          text-shadow: 0 0 6px rgba(0, 50, 160, 0.3);
          animation: letterSlideInEmail 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) both;
          display: inline-block;
        }

        @media (min-width: 640px) {
          .letter-e {
            font-size: 1.5rem;
            text-shadow: 0 0 8px rgba(0, 50, 160, 0.3);
          }
        }

        .letter-e.r-e { animation-delay: 0.1s; }
        .letter-e.a-e { animation-delay: 0.2s; }
        .letter-e.m-e { animation-delay: 0.3s; }
        .letter-e.s-e { animation-delay: 0.4s; }

        @keyframes letterSlideInEmail {
          0% { 
            transform: translateY(-15px) scale(0.8);
            opacity: 0;
          }
          50% { 
            transform: translateY(3px) scale(1.1);
            opacity: 1;
          }
          100% { 
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }

        @keyframes fadeInUp {
          0% { 
            transform: translateY(10px);
            opacity: 0;
          }
          100% { 
            transform: translateY(0);
            opacity: 1;
          }
        }

        .intro-center {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .logo-wrap {
          position: relative;
          width: 160px;
          height: 160px;
        }
        .intro-logo {
          width: 160px;
          height: 160px;
          will-change: transform, filter;
          transform-origin: center;
          animation: popScale 1.2s cubic-bezier(0.22, 1, 0.36, 1) both;
          filter:
            drop-shadow(0 0 6px rgba(255, 255, 255, 0.6))
            drop-shadow(0 0 12px rgba(0, 50, 160, 0.35));
        }
        .ripple-wrap {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 0;
        }
        .ring {
          position: absolute;
          width: 160px;
          height: 160px;
          border-radius: 9999px;
          border: 2px solid rgba(0, 50, 160, 0.35);
          transform: scale(0.75);
          opacity: 0.55;
          animation: ripple 1.2s ease-out both;
          filter: blur(0.2px);
        }
        .ring.r2 { animation-delay: 0.08s; opacity: 0.45; border-color: rgba(0, 50, 160, 0.28); }
        .ring.r3 { animation-delay: 0.16s; opacity: 0.35; border-color: rgba(0, 50, 160, 0.22); }
        @keyframes popScale {
          0% { transform: scale(0.85); }
          55% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        @keyframes ripple {
          0% { transform: scale(0.75); opacity: 0.55; }
          70% { opacity: 0.18; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        
        .bg-kenburns-desktop {
          animation: kenBurnsDesktop 34s ease-in-out infinite alternate;
          will-change: transform;
          transform-origin: center top;
        }

        .bg-kenburns-mobile {
          animation: kenBurnsMobile 28s ease-in-out infinite alternate;
          will-change: transform;
          transform-origin: center center;
        }

        @keyframes kenBurnsDesktop {
          0% { transform: scale(1.18) translate3d(0, -18%, 0); }
          100% { transform: scale(1.27) translate3d(-1.2%, -20%, 0); }
        }

        @keyframes kenBurnsMobile {
          0% { transform: scale(1.16) translate3d(0, 0, 0); }
          100% { transform: scale(1.26) translate3d(-1.1%, -0.8%, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .bg-kenburns-desktop,
          .bg-kenburns-mobile {
            animation: none;
            transform: scale(1.08);
          }
        }
        
      `}</style>
    </div>
  )
}
