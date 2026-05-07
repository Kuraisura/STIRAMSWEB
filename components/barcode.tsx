"use client"

import { useEffect, useRef } from 'react'

interface BarcodeProps {
  value: string
  width?: number
  height?: number
  className?: string
}

export default function BarcodeComponent({ 
  value, 
  width = 200, 
  height = 40,
  className = "" 
}: BarcodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      
      if (ctx) {
        // Clear canvas
        ctx.clearRect(0, 0, width, height)
        
        // Set background
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        
        // Generate simple barcode pattern
        const barWidth = 2
        const barHeight = height - 10
        const startX = 10
        const startY = 5
        
        ctx.fillStyle = '#000000'
        
        // Create barcode pattern based on value
        let x = startX
        for (let i = 0; i < value.length; i++) {
          const char = value.charCodeAt(i)
          const barCount = (char % 4) + 1 // 1-4 bars per character
          
          for (let j = 0; j < barCount; j++) {
            ctx.fillRect(x, startY, barWidth, barHeight)
            x += barWidth * 2 // Space between bars
          }
        }
        
        // Add start and end patterns
        ctx.fillRect(startX - 5, startY, 3, barHeight)
        ctx.fillRect(x, startY, 3, barHeight)
      }
    }
  }, [value, width, height])

  return (
    <div className={`barcode-container ${className}`}>
      <canvas 
        ref={canvasRef}
        width={width}
        height={height}
        className="barcode-canvas border border-gray-300 rounded"
        style={{ 
          width: width, 
          height: height
        }}
      />
      <p className="barcode-label text-xs text-gray-600 mt-1 text-center">
        RAMS System Access
      </p>
    </div>
  )
}
