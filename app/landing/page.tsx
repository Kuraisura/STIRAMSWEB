"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SocialMediaFooter } from "@/components/social-media-footer"
import { useLanguage } from "@/lib/language-context"

export default function LandingPage() {
  const { t } = useLanguage()
  const imageErrorHandled = useRef<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isVideoMuted, setIsVideoMuted] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()

  const reason = (searchParams.get('reason') || '').toLowerCase()
  const showSessionExpired = reason === 'expired' || reason === 'idle' || reason === 'session_expired' || reason === 'session-expired'

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const handleGetStarted = () => {
    setIsLoading(true)
    setTimeout(() => {
      router.push("/auth/login")
    }, 300)
  }


  return (
    <div 
      className="min-h-screen relative flex flex-col bg-white overflow-hidden"
      style={{ 
        background: 'white',
        minHeight: '100vh'
      }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(59, 130, 246, 0.15) 1px, transparent 0), radial-gradient(circle at 2px 2px, rgba(139, 92, 246, 0.1) 1px, transparent 0)',
            backgroundSize: '50px 50px, 80px 80px',
            backgroundPosition: '0 0, 25px 25px'
          }}></div>
        </div>
        
        <div className="absolute top-20 left-20 w-96 h-96 bg-linear-to-r from-blue-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-linear-to-r from-indigo-400/20 to-cyan-600/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '3s'}}></div>
        
        <div className="absolute top-20 left-20 w-2 h-32 bg-linear-to-b from-blue-600/15 to-transparent animate-pulse"></div>
        <div className="absolute top-40 right-20 w-32 h-2 bg-linear-to-r from-purple-600/15 to-transparent animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute bottom-40 left-1/4 w-2 h-24 bg-linear-to-b from-indigo-600/15 to-transparent animate-pulse" style={{animationDelay: '4s'}}></div>
        <div className="absolute bottom-20 right-1/3 w-24 h-2 bg-linear-to-r from-cyan-600/15 to-transparent animate-pulse" style={{animationDelay: '1s'}}></div>
        
        <div className="absolute top-1/4 right-1/4 w-2 h-2 bg-blue-500/40 rounded-full animate-ping shadow-lg shadow-blue-500/50" style={{animationDelay: '3s'}}></div>
        <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-purple-500/40 rounded-full animate-ping shadow-lg shadow-purple-500/50" style={{animationDelay: '5s'}}></div>
        <div className="absolute top-1/2 right-1/3 w-2 h-2 bg-indigo-500/40 rounded-full animate-ping shadow-lg shadow-indigo-500/50" style={{animationDelay: '2s'}}></div>
        
        <div className="absolute top-1/3 left-0 w-full h-px bg-linear-to-r from-transparent via-blue-300/40 to-transparent animate-pulse"></div>
        <div className="absolute bottom-1/3 left-0 w-full h-px bg-linear-to-r from-transparent via-purple-300/40 to-transparent animate-pulse" style={{animationDelay: '3s'}}></div>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-3 relative z-10 pt-12 sm:pt-16">
        <div className="w-full max-w-7xl px-2 sm:px-3">
          {showSessionExpired && (
            <div className="mb-4 sm:mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-red-700 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="font-semibold">Session Expired. Login again.</div>
              <Button
                onClick={handleGetStarted}
                disabled={isLoading}
                variant="destructive"
                className="w-full sm:w-auto"
              >
                Login Again
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 items-start mb-4 sm:mb-6 lg:mb-8">
            
            <div className={`text-center lg:text-left space-y-3 sm:space-y-4 lg:space-y-6 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
              <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                <div className="text-center lg:text-left">
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold bg-linear-to-r from-gray-800 via-gray-700 to-gray-800 bg-clip-text text-transparent mb-2 sm:mb-3 lg:mb-4">{t('landing.learn_more_about')}</h2>
                  
                  {}
                  <div className="mb-4 sm:mb-5 lg:mb-6 bg-white/95 backdrop-blur-md rounded-lg sm:rounded-xl lg:rounded-2xl p-3 sm:p-4 lg:p-5 shadow-xl border-2 border-gray-200/50 hover:border-blue-300/50 transition-all duration-500 hover:shadow-2xl">
                    <div 
                      className={`flex items-center gap-2 sm:gap-3 lg:gap-4 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}
                    >
                      <div className="group relative">
                        <div className="absolute inset-0 bg-linear-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                        <Image
                          src="/sign%20in%20page/sti-logo.png"
                          alt="RAMS Logo"
                          width={60}
                          height={60}
                          className="object-contain drop-shadow-2xl transform group-hover:scale-110 transition-all duration-500 filter brightness-110 relative z-10 w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20"
                          priority
                          loading="eager"
                          quality={85}
                          onError={(e) => {
                            const img = e.currentTarget as HTMLImageElement
                            img.style.display = 'none'
                            img.onerror = null
                          }}
                        />
                      </div>
                      <div className="flex flex-col">
                        <h1 
                          className="text-lg sm:text-xl lg:text-2xl font-black leading-tight bg-linear-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent relative"
                          style={{
                            fontWeight: '900',
                            lineHeight: '1.2',
                            background: 'linear-gradient(to right, #2563eb, #9333ea, #6366f1)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text'
                          }}
                        >
                          RAMS
                        </h1>
                        <p 
                          className="text-xs sm:text-sm lg:text-base text-gray-600 font-semibold tracking-wide"
                          style={{
                            color: '#4b5563',
                            fontWeight: '600',
                            letterSpacing: '0.025em'
                          }}
                        >
                          {t('landing.system_overview')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm sm:text-base lg:text-lg text-gray-600 mb-3 sm:mb-4 lg:mb-6 leading-relaxed font-medium">
                    {t('landing.learn_more_description')}
                  </p>
                  <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3 group/item">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-linear-to-br from-blue-100 to-blue-50 rounded-full flex items-center justify-center shadow-md group-hover/item:shadow-lg transition-all duration-300 shrink-0">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="text-xs sm:text-sm lg:text-base text-gray-700 font-semibold">{t('landing.rfid_scanning')}</span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 group/item">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-linear-to-br from-green-100 to-green-50 rounded-full flex items-center justify-center shadow-md group-hover/item:shadow-lg transition-all duration-300 shrink-0">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <span className="text-xs sm:text-sm lg:text-base text-gray-700 font-semibold">{t('landing.automatic_logging')}</span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 group/item">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-linear-to-br from-purple-100 to-purple-50 rounded-full flex items-center justify-center shadow-md group-hover/item:shadow-lg transition-all duration-300 shrink-0">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <span className="text-xs sm:text-sm lg:text-base text-gray-700 font-semibold">{t('landing.reports_generation')}</span>
                    </div>
                  </div>
                  <div className="mt-4 sm:mt-5 lg:mt-6">
                    <Button 
                      onClick={() => router.push('/auth/login')}
                      className="group relative bg-linear-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 text-white font-bold py-2.5 sm:py-3 px-6 sm:px-8 rounded-lg sm:rounded-xl text-sm sm:text-base lg:text-lg shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105 overflow-hidden w-full sm:w-auto touch-manipulation"
                    >
                      <div className="absolute inset-0 bg-linear-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                      <span className="relative z-10">{t('landing.sign_in')}</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className={`space-y-3 sm:space-y-4 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10'}`}>
              <Card className="group bg-white/95 backdrop-blur-md rounded-lg sm:rounded-xl lg:rounded-2xl shadow-2xl border-2 border-gray-200/50 hover:border-blue-300/50 transition-all duration-500 hover:shadow-3xl relative overflow-hidden">
                <div className="absolute inset-0 bg-linear-to-br from-blue-500/5 via-purple-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <CardContent className="p-3 sm:p-4 relative z-10">
                  <h3 className="text-base sm:text-lg lg:text-xl font-black text-transparent bg-clip-text bg-linear-to-r from-blue-600 via-purple-600 to-indigo-600 mb-3 sm:mb-4 text-center tracking-wide">{t('landing.featured')}</h3>
                  
                  {/* STI College tile removed as requested */}

                  <div className="group relative bg-linear-to-br from-gray-50 to-white rounded-lg sm:rounded-xl p-2 sm:p-3 mb-1.5 sm:mb-2 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-200/50 hover:border-green-300/30 overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-r from-green-500/0 via-green-500/0 to-transparent opacity-0 group-hover:opacity-5 transition-opacity duration-500"></div>
                    <div className="flex items-center space-x-2 sm:space-x-3 relative z-10">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-linear-to-br from-green-500 to-emerald-500 rounded-md sm:rounded-lg group-hover:scale-110 transition-transform duration-300 shadow-lg group-hover:shadow-xl shrink-0">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-gray-800 group-hover:text-green-600 transition-colors duration-300">{t('landing.featured_rams')}</h4>
                        <p className="text-gray-600 text-[10px] sm:text-xs font-medium">{t('landing.featured_rams_desc')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="group relative bg-linear-to-br from-gray-50 to-white rounded-lg sm:rounded-xl p-2 sm:p-3 mb-1.5 sm:mb-2 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-200/50 hover:border-yellow-300/30 overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-r from-yellow-500/0 via-yellow-500/0 to-transparent opacity-0 group-hover:opacity-5 transition-opacity duration-500"></div>
                    <div className="flex items-center space-x-2 sm:space-x-3 relative z-10">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-linear-to-br from-yellow-500 to-orange-500 rounded-md sm:rounded-lg group-hover:scale-110 transition-transform duration-300 shadow-lg group-hover:shadow-xl shrink-0">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-gray-800 group-hover:text-yellow-600 transition-colors duration-300">{t('landing.featured_rfid')}</h4>
                        <p className="text-gray-600 text-[10px] sm:text-xs font-medium">{t('landing.featured_rfid_desc')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="group relative bg-linear-to-br from-gray-50 to-white rounded-lg sm:rounded-xl p-2 sm:p-3 mb-1.5 sm:mb-2 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-200/50 hover:border-purple-300/30 overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-r from-purple-500/0 via-purple-500/0 to-transparent opacity-0 group-hover:opacity-5 transition-opacity duration-500"></div>
                    <div className="flex items-center space-x-2 sm:space-x-3 relative z-10">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-linear-to-br from-purple-500 to-pink-500 rounded-md sm:rounded-lg group-hover:scale-110 transition-transform duration-300 shadow-lg group-hover:shadow-xl shrink-0">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-gray-800 group-hover:text-purple-600 transition-colors duration-300">{t('landing.featured_integration')}</h4>
                        <p className="text-gray-600 text-[10px] sm:text-xs font-medium">{t('landing.featured_integration_desc')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="group relative bg-linear-to-br from-gray-50 to-white rounded-lg sm:rounded-xl p-2 sm:p-3 mb-1.5 sm:mb-2 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-200/50 hover:border-indigo-300/30 overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-r from-indigo-500/0 via-indigo-500/0 to-transparent opacity-0 group-hover:opacity-5 transition-opacity duration-500"></div>
                    <div className="flex items-center space-x-2 sm:space-x-3 relative z-10">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-linear-to-br from-indigo-500 to-blue-500 rounded-md sm:rounded-lg group-hover:scale-110 transition-transform duration-300 shadow-lg group-hover:shadow-xl shrink-0">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-gray-800 group-hover:text-indigo-600 transition-colors duration-300">{t('landing.featured_monitoring')}</h4>
                        <p className="text-gray-600 text-[10px] sm:text-xs font-medium">{t('landing.featured_monitoring_desc')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="group relative bg-linear-to-br from-gray-50 to-white rounded-lg sm:rounded-xl p-2 sm:p-3 mb-1.5 sm:mb-2 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-200/50 hover:border-teal-300/30 overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-r from-teal-500/0 via-teal-500/0 to-transparent opacity-0 group-hover:opacity-5 transition-opacity duration-500"></div>
                    <div className="flex items-center space-x-2 sm:space-x-3 relative z-10">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-linear-to-br from-teal-500 to-cyan-500 rounded-md sm:rounded-lg group-hover:scale-110 transition-transform duration-300 shadow-lg group-hover:shadow-xl shrink-0">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-gray-800 group-hover:text-teal-600 transition-colors duration-300">{t('landing.featured_reports')}</h4>
                        <p className="text-gray-600 text-[10px] sm:text-xs font-medium">{t('landing.featured_reports_desc')}</p>
                      </div>
                    </div>
                  </div>

                </CardContent>
              </Card>

              <div className="space-y-3 sm:space-y-4">
                <Button 
                  onClick={handleGetStarted}
                  disabled={isLoading}
                  className="group relative w-full h-11 sm:h-12 px-6 sm:px-8 text-base sm:text-lg font-black bg-white hover:bg-gray-50 text-gray-900 border-2 border-gray-300 hover:border-blue-400 transition-all duration-500 transform hover:scale-105 sm:hover:scale-110 hover:shadow-2xl rounded-lg sm:rounded-xl lg:rounded-2xl touch-manipulation"
                  style={{
                    background: 'white',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
                    transform: 'translateY(0)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  onMouseEnter={(e) => {
                    if (window.innerWidth >= 640) {
                      e.currentTarget.style.transform = 'translateY(-4px) scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 25px 50px rgba(0, 0, 0, 0.15)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.1)';
                  }}
                >
                  <div className="absolute inset-0 bg-linear-to-r from-white/20 to-white/10 rounded-lg sm:rounded-xl lg:rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <span className="relative z-10 flex items-center gap-2 sm:gap-3 justify-center">
                  {isLoading ? (
                    <>
                      <div className="loading-spinner border-t-gray-900 w-4 h-4 sm:w-5 sm:h-5"></div>
                      <span className="text-sm sm:text-base">{t('common.loading')}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                      </svg>
                      <span className="text-sm sm:text-base lg:text-lg">{t('landing.sign_in')}</span>
                      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                  </span>
                </Button>

                <div className="relative w-full h-48 sm:h-56 lg:h-64 rounded-lg sm:rounded-xl overflow-hidden shadow-2xl border-2 sm:border-4 border-white/50 bg-linear-to-br from-white/20 to-white/5 backdrop-blur-sm group hover:border-blue-300/50 transition-all duration-500">
                  <div className="absolute -inset-0.5 bg-linear-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-lg sm:rounded-xl blur opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
                  <div className="relative w-full h-full rounded-md sm:rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      muted={isVideoMuted}
                      loop
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-contain rounded-md sm:rounded-lg"
                      onLoadedData={(e) => {
                        const playPromise = e.currentTarget.play();
                        if (playPromise && typeof (playPromise as Promise<void>).catch === 'function') {
                          (playPromise as Promise<void>).catch(() => {});
                        }
                      }}
                      onEnded={(e) => {
                        e.currentTarget.currentTime = 0;
                        const playPromise = e.currentTarget.play();
                        if (playPromise && typeof (playPromise as Promise<void>).catch === 'function') {
                          (playPromise as Promise<void>).catch(() => {});
                        }
                      }}
                    >
                      <source src="/Landing%20Page_/SSvid.net--Aral-Pa-More-and-Be-More-in-STI-College_1080.mp4" type="video/mp4" />
                    </video>
                    <div className="absolute bottom-1.5 sm:bottom-2 right-1.5 sm:right-2 z-20 flex gap-1.5 sm:gap-2">
                      {isVideoMuted ? (
                        <button
                          type="button"
                          onClick={() => {
                            const v = videoRef.current
                            if (!v) return
                            try {
                              v.muted = false
                              v.volume = 0.8
                              const p = v.play()
                              if (p && typeof (p as Promise<void>).catch === 'function') {
                                (p as Promise<void>).catch(() => {})
                              }
                              setIsVideoMuted(false)
                            } catch {}
                          }}
                          className="bg-white/90 hover:bg-white text-gray-900 text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-1.5 sm:py-2 rounded-md sm:rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-1 touch-manipulation"
                          title="Unmute video"
                        >
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                          <span className="hidden sm:inline">Unmute</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const v = videoRef.current
                            if (!v) return
                            try {
                              v.muted = true
                              setIsVideoMuted(true)
                            } catch {}
                          }}
                          className="bg-white/90 hover:bg-white text-gray-900 text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-1.5 sm:py-2 rounded-md sm:rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-1 touch-manipulation"
                          title="Mute video"
                        >
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                          </svg>
                          <span className="hidden sm:inline">Mute</span>
                        </button>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent rounded-md sm:rounded-lg"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="relative z-10">
        <SocialMediaFooter />
      </div>

    </div>
  )
}
