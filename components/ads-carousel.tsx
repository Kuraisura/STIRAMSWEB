"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useEmblaCarousel from "embla-carousel-react"
import type { EmblaOptionsType, EmblaCarouselType } from "embla-carousel"
import { ChevronLeft, ChevronRight } from "lucide-react"

type AdItem = {
  src: string
  alt?: string
}

interface AdsCarouselProps {
  items?: AdItem[]
  options?: EmblaOptionsType
  autoPlayMs?: number
}

export function AdsCarousel({
  items = [
    { src: "/placeholder.jpg", alt: "STI RAMS - RFID Attendance Monitoring System" },
    { src: "/placeholder.jpg", alt: "STI RAMS - Employee Management" },
    { src: "/placeholder.jpg", alt: "STI RAMS - Real-time Monitoring" },
  ],
  options = { loop: true, align: "start", dragFree: false },
  autoPlayMs = 12000, // Changed to 12 seconds
}: AdsCarouselProps) {
  // Local fallback images
  const fallbackImages = [
    "/sti-logo.png",
    "/placeholder-logo.png", 
    "/placeholder.jpg"
  ]
  const [emblaRef, emblaApi] = useEmblaCarousel(options)
  const autoPlayTimer = useRef<NodeJS.Timeout | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const playNext = useCallback((api: EmblaCarouselType | null) => {
    if (!api) return
    if (api.canScrollNext()) api.scrollNext()
    else api.scrollTo(0)
  }, [])

  const onSelect = useCallback((emblaApi: EmblaCarouselType) => {
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [])

  useEffect(() => {
    if (!emblaApi) return

    onSelect(emblaApi)
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)

    return () => {
      emblaApi.off('select', onSelect)
      emblaApi.off('reInit', onSelect)
    }
  }, [emblaApi, onSelect])

  const startAutoPlay = useCallback(() => {
    if (!emblaApi || autoPlayMs <= 0) return
    stopAutoPlay()
    autoPlayTimer.current = setInterval(() => playNext(emblaApi), autoPlayMs)
  }, [emblaApi, autoPlayMs, playNext])

  const stopAutoPlay = useCallback(() => {
    if (autoPlayTimer.current) {
      clearInterval(autoPlayTimer.current)
      autoPlayTimer.current = null
    }
  }, [])

  useEffect(() => {
    startAutoPlay()
    return stopAutoPlay
  }, [startAutoPlay, stopAutoPlay])

  return (
    <div
      className="relative w-full h-48 sm:h-64 md:h-80 lg:h-96 xl:h-[28rem] overflow-hidden border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/60 backdrop-blur shadow-lg rounded-lg p-0"
      onMouseEnter={stopAutoPlay}
      onMouseLeave={startAutoPlay}
    >
      <div className="overflow-hidden h-full" ref={emblaRef}>
        <div className="flex h-full">
          {items.map((item, index) => (
            <div className="min-w-0 flex-[0_0_100%] relative flex items-center justify-center h-full p-0" key={`${item.src}-${index}`}>
              <img
                src={item.src}
                alt={item.alt ?? `Ad ${index + 1}`}
                className="w-full h-full object-contain pointer-events-none select-none bg-white dark:bg-gray-800"
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement
                  
                  // Immediately disable error handler to prevent infinite loop
                  const originalOnError = img.onerror
                  img.onerror = null
                  
                  try {
                    // Prevent infinite loop - if we've already tried all fallbacks, hide image
                    if ((img as any).__fallbackAttempts >= fallbackImages.length) {
                      img.style.display = 'none'
                      const fallback = img.parentElement?.querySelector('.fallback-text')
                      if (fallback && fallback instanceof HTMLElement) fallback.style.display = 'flex'
                      return
                    }
                    
                    // Increment attempt counter
                    ;(img as any).__fallbackAttempts = ((img as any).__fallbackAttempts || 0) + 1
                    
                    // Try next fallback image
                    const fallbackIndex = ((img as any).__fallbackAttempts - 1) % fallbackImages.length
                    const fallbackSrc = fallbackImages[fallbackIndex]
                    const currentSrc = img.src || img.getAttribute('src') || ''
                    
                    if (!currentSrc.includes(fallbackSrc.split('/').pop() || '')) {
                      // Re-enable error handler only for the fallback attempt
                      img.onerror = originalOnError
                      img.src = fallbackSrc
                    } else {
                      // If we've tried all fallbacks, hide image permanently
                      img.style.display = 'none'
                      const fallback = img.parentElement?.querySelector('.fallback-text')
                      if (fallback && fallback instanceof HTMLElement) fallback.style.display = 'flex'
                    }
                  } catch {
                    img.style.display = 'none'
                  }
                }}
                onLoad={(e) => {
                  // Ensure image is properly displayed
                  e.currentTarget.style.opacity = '1';
                }}
                style={{ opacity: 0, transition: 'opacity 0.3s ease-in-out' }}
              />
              
              {/* Fallback text - Mobile Responsive */}
              <div className="fallback-text hidden absolute inset-0 items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-900 text-gray-600 dark:text-gray-300 font-medium text-center p-4 sm:p-6 md:p-8">
                <div className="space-y-2 sm:space-y-4">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto bg-blue-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <span className="text-xl sm:text-2xl">📊</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold">STI RAMS</h3>
                  <p className="text-xs sm:text-sm">{item.alt ?? `Advertisement ${index + 1}`}</p>
                </div>
              </div>

              {/* Subtle gradient for text contrast */}
              <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-black/10 via-transparent to-black/10" />
            </div>
          ))}
        </div>
      </div>

      {/* Three-dot indicators */}
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-2 z-10">
        {items.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => emblaApi?.scrollTo(index)}
            className={`transition-all duration-300 rounded-full ${
              index === selectedIndex
                ? 'w-8 h-2 bg-blue-600 dark:bg-blue-400'
                : 'w-2 h-2 bg-gray-400 dark:bg-gray-600 hover:bg-gray-500 dark:hover:bg-gray-500'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}


