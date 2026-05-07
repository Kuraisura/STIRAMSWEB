"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, Users, Clock, BarChart3 } from "lucide-react"
import { useLanguage } from "@/lib/language-context"

export default function HowRamsWorksPage() {
  const { t } = useLanguage()
  const [isVisible, setIsVisible] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const features = [
    {
      icon: <Users className="w-8 h-8" />,
      title: t('how.feature1_title'),
      description: t('how.feature1_desc')
    },
    {
      icon: <Clock className="w-8 h-8" />,
      title: t('how.feature2_title'),
      description: t('how.feature2_desc')
    },
    {
      icon: <BarChart3 className="w-8 h-8" />,
      title: t('how.feature4_title'),
      description: t('how.feature4_desc')
    }
  ]

  const steps = [
    {
      step: t('how.step1_number'),
      title: t('how.step1_title'),
      description: t('how.step1_desc')
    },
    {
      step: t('how.step2_number'), 
      title: t('how.step2_title'),
      description: t('how.step2_desc')
    },
    {
      step: t('how.step3_number'),
      title: t('how.step3_title'),
      description: t('how.step3_desc')
    },
    {
      step: t('how.step4_number'),
      title: t('how.step4_title'),
      description: t('how.step4_desc')
    }
  ]


  return (
    <div 
      className="min-h-screen relative flex flex-col bg-white overflow-hidden"
      style={{ 
        background: 'white',
        minHeight: '100vh'
      }}
    >
      {/* Corporate Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }}></div>
        </div>
        
        {/* Corporate Geometric Elements */}
        <div className="absolute top-20 left-20 w-2 h-32 bg-linear-to-b from-blue-600/10 to-transparent animate-pulse"></div>
        <div className="absolute top-40 right-20 w-32 h-2 bg-linear-to-r from-purple-600/10 to-transparent animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute bottom-40 left-1/4 w-2 h-24 bg-linear-to-b from-indigo-600/10 to-transparent animate-pulse" style={{animationDelay: '4s'}}></div>
        <div className="absolute bottom-20 right-1/3 w-24 h-2 bg-linear-to-r from-cyan-600/10 to-transparent animate-pulse" style={{animationDelay: '1s'}}></div>
        
        {/* Subtle Floating Elements */}
        <div className="absolute top-1/4 right-1/4 w-1 h-1 bg-blue-600/20 rounded-full animate-ping" style={{animationDelay: '3s'}}></div>
        <div className="absolute bottom-1/3 left-1/3 w-1 h-1 bg-purple-600/20 rounded-full animate-ping" style={{animationDelay: '5s'}}></div>
        <div className="absolute top-1/2 right-1/3 w-1 h-1 bg-indigo-600/20 rounded-full animate-ping" style={{animationDelay: '2s'}}></div>
        
        {/* Corporate Lines */}
        <div className="absolute top-1/3 left-0 w-full h-px bg-linear-to-r from-transparent via-gray-300/30 to-transparent animate-pulse"></div>
        <div className="absolute bottom-1/3 left-0 w-full h-px bg-linear-to-r from-transparent via-gray-300/30 to-transparent animate-pulse" style={{animationDelay: '3s'}}></div>
      </div>
      {/* RAMS Logo and Branding - Top Left - Mobile Responsive */}
      <div className="fixed top-2 left-2 sm:top-4 sm:left-4 z-50 bg-transparent backdrop-blur-sm rounded-lg sm:rounded-xl p-2 sm:p-4 shadow-lg border border-white/20">
        <div 
          className={`flex items-center gap-2 sm:gap-3 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <div className="group">
            <Image
              src="/sign%20in%20page/sti-logo.png"
              alt="RAMS Logo"
              width={50}
              height={50}
              className="object-contain drop-shadow-lg transform group-hover:scale-110 transition-all duration-500 filter brightness-110 w-10 h-10 sm:w-16 sm:h-16 lg:w-20 lg:h-20"
              priority
              loading="eager"
              quality={85}
              onError={(e)=>{ try { (e.currentTarget as any).src = '/sti-logo.png' } catch {} }}
            />
          </div>
          <div className="flex flex-col">
            <h1 
              className="text-lg sm:text-2xl lg:text-3xl font-black leading-tight bg-linear-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent"
              style={{
                fontSize: '1.125rem',
                fontWeight: '900',
                color: '#1f2937',
                lineHeight: '1.2',
                background: 'linear-gradient(to right, #2563eb, #9333ea, #1e40af)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              RAMS
            </h1>
            <p 
              className="text-[10px] sm:text-sm lg:text-base text-gray-700 font-semibold tracking-wide"
              style={{
                fontSize: '0.625rem',
                color: '#374151',
                fontWeight: '600',
                letterSpacing: '0.025em'
              }}
            >
              STI College Santa Rosa
            </p>
          </div>
        </div>
      </div>

      {/* Header - Mobile Responsive */}
      <div className="bg-white/90 backdrop-blur-sm shadow-lg relative z-10 mt-12 sm:mt-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="w-16 sm:w-20"></div>
            <Button
              onClick={() => router.back()}
              variant="ghost"
              className="flex items-center gap-1.5 sm:gap-2 text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded-lg sm:rounded-xl transition-all duration-300 h-8 sm:h-10 px-2 sm:px-3 touch-manipulation"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{t('how.back')}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="py-16 relative z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className={`text-center mb-16 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <h1 className="text-5xl font-black mb-6 bg-linear-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">
              {t('how.works_title')}
            </h1>
            <p className="text-xl text-gray-700 max-w-4xl mx-auto leading-relaxed">
              {t('how.works_description')}
            </p>
          </div>

          {/* System Overview Image */}
          <div className={`text-center mb-16 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <div className="relative inline-block">
              <img
                src="/placeholder.jpg"
                alt="RAMS System Overview"
                className="w-full max-w-2xl h-auto rounded-2xl shadow-2xl border-4 border-white/50 hover:scale-105 transition-transform duration-500"
                loading="eager"
                decoding="async"
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement
                  
                  // Immediately disable error handler to prevent infinite loop
                  img.onerror = null
                  
                  try {
                    // Prevent infinite loop - if already tried fallback, hide image
                    if ((img as any).__fallbackAttempted) {
                      img.style.display = 'none'
                      return
                    }
                    // Mark as attempted
                    ;(img as any).__fallbackAttempted = true
                    
                    const currentSrc = img.src || img.getAttribute('src') || ''
                    if (!currentSrc.includes('placeholder.jpg')) {
                      // Try placeholder - but don't re-enable handler to prevent loop
                      img.src = '/placeholder.jpg'
                    } else {
                      // Already tried placeholder, hide image
                      img.style.display = 'none'
                    }
                  } catch {
                    img.style.display = 'none'
                  }
                }}
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent rounded-2xl"></div>
            </div>
          </div>

          {/* How It Works Steps */}
          <div className={`mb-16 transition-all duration-1000 delay-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <h2 className="text-4xl font-bold text-center mb-12 bg-linear-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">{t('how.it_works_title')}</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {steps.map((step, index) => (
                <Card key={index} className="bg-white/90 backdrop-blur-sm border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 group">
                  <CardContent className="p-6 text-center">
                    <div className="w-16 h-16 bg-linear-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                      {step.step}
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                    <p className="text-gray-700 leading-relaxed">{step.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Features Grid */}
          <div className={`mb-16 transition-all duration-1000 delay-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <h2 className="text-4xl font-bold text-center mb-12 bg-linear-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">{t('how.key_features_title')}</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <Card key={index} className="bg-white/90 backdrop-blur-sm border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300 group hover:scale-105">
                  <CardContent className="p-6">
                    <div className="text-blue-600 mb-4 group-hover:scale-110 transition-transform duration-300">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                    <p className="text-gray-700 leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className={`text-center transition-all duration-1000 delay-1200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <h2 className="text-4xl font-bold mb-6 bg-linear-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">{t('how.ready_title')}</h2>
            <p className="text-xl text-gray-700 mb-8 max-w-2xl mx-auto">
              {t('how.ready_description')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={() => router.push('/auth/login')}
                className="bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-4 px-8 rounded-xl text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                {t('how.sign_in')}
              </Button>
              <Button 
                onClick={() => router.push('/landing')}
                variant="outline"
                className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-bold py-4 px-8 rounded-xl text-lg transition-all duration-300 hover:scale-105"
              >
                {t('how.back_home')}
              </Button>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
