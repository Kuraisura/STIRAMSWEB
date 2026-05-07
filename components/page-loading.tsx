"use client"

import React from 'react'
import Image from 'next/image'

interface PageLoadingProps {
  message?: string
  showProgress?: boolean
}

export function PageLoading({ message = "Loading...", showProgress = true }: PageLoadingProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="flex flex-col items-center gap-8 px-4">
        {/* Animated background circles */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          <div 
            className="absolute w-96 h-96 rounded-full opacity-20 dark:opacity-10"
            style={{
              background: 'radial-gradient(circle, rgba(59,130,246,0.4) 0%, transparent 70%)',
              animation: 'pulse-slow 3s ease-in-out infinite',
            }}
          />
          <div 
            className="absolute w-72 h-72 rounded-full opacity-30 dark:opacity-15"
            style={{
              background: 'radial-gradient(circle, rgba(139,92,246,0.5) 0%, transparent 70%)',
              animation: 'pulse-slow 2.5s ease-in-out infinite 0.5s',
            }}
          />
        </div>

        {/* STI Logo with animations */}
        <div className="relative z-10">
          <div 
            className="relative w-24 h-24 sm:w-32 sm:h-32"
            style={{
              animation: 'float 3s ease-in-out infinite',
            }}
          >
            {/* Logo glow effect */}
            <div 
              className="absolute inset-0 rounded-full opacity-40 dark:opacity-30"
              style={{
                background: 'radial-gradient(circle, rgba(59,130,246,0.6) 0%, transparent 70%)',
                filter: 'blur(20px)',
                animation: 'pulse-glow 2s ease-in-out infinite',
              }}
            />
            
            {/* Logo image */}
            <Image
              src="/TqEOF7H.png"
              alt="STI Logo"
              fill
              className="object-contain relative z-10 drop-shadow-2xl"
              priority
              style={{
                filter: 'drop-shadow(0 10px 30px rgba(59, 130, 246, 0.3))',
              }}
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement
                if (img.src.includes('TqEOF7H')) {
                  img.src = '/sti-logo.png'
                } else if (img.src.includes('sti-logo.png')) {
                  img.src = '/sign%20in%20page/sti-logo.png'
                }
              }}
            />
          </div>
        </div>
        
        {/* Loading indicator */}
        <div className="flex flex-col items-center gap-4 relative z-10">
          {/* Animated dots */}
          <div className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                animation: 'bounce-dot 1.4s ease-in-out infinite',
                animationDelay: '0s',
              }}
            />
            <div 
              className="w-3 h-3 rounded-full shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                animation: 'bounce-dot 1.4s ease-in-out infinite',
                animationDelay: '0.2s',
              }}
            />
            <div 
              className="w-3 h-3 rounded-full shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #ec4899, #db2777)',
                animation: 'bounce-dot 1.4s ease-in-out infinite',
                animationDelay: '0.4s',
              }}
            />
          </div>
          
          {/* Loading text */}
          <div className="text-center space-y-2">
            <p 
              className="text-lg sm:text-xl font-bold tracking-wide"
              style={{
                background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'gradient-shift 3s ease infinite',
                backgroundSize: '200% 100%',
              }}
            >
              {message}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              Please wait a moment
            </p>
          </div>

          {/* Spinner */}
          {showProgress && (
            <div className="relative w-16 h-16">
              <div 
                className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-gray-700"
              />
              <div 
                className="absolute inset-0 rounded-full border-4 border-transparent"
                style={{
                  borderTopColor: '#3b82f6',
                  borderRightColor: '#8b5cf6',
                  animation: 'spin 1s linear infinite',
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Custom Animations */}
      <style jsx>{`
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.1); opacity: 0.5; }
        }

        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }

        @keyframes bounce-dot {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.7; }
          40% { transform: scale(1.2); opacity: 1; }
        }

        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
