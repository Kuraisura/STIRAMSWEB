"use client"

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

interface QRCodeProps {
  url: string
  size?: number
  className?: string
}

export default function QRCodeComponent({ 
  url, 
  size = 80, 
  className = "" 
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hadError, setHadError] = useState(false)

  useEffect(() => {
    if (canvasRef.current) {
      setHadError(false)
      QRCode.toCanvas(
        canvasRef.current,
        url,
        {
          width: size,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#111111',
            light: '#FFFFFF',
          },
        },
        (error) => {
          if (error) {
            console.error('QR Code generation error:', error)
            setHadError(true)
          }
        }
      )
    }
  }, [url, size])

  return (
    <div className={`qr-code-container ${className}`}>
      {!hadError ? (
        <canvas 
          ref={canvasRef}
          className="qr-code-canvas"
          style={{ 
            width: size, 
            height: size,
            imageRendering: 'pixelated' as any,
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
          }}
        />
      ) : (
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`}
          width={size}
          height={size}
          alt="QR code"
          style={{ borderRadius: 8 }}
        />
      )}
    </div>
  )
}
