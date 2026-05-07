"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Camera, X, Upload, ZoomIn } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { useToast } from "@/hooks/use-toast"
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'

interface PhotoUploadProps {
  currentPhotoPath?: string
  onPhotoChange: (photoPath: string | null) => void
  employeeName?: string
  className?: string
  suppressToast?: boolean
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', error => reject(error))
    image.src = url
  })

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  console.log('[PhotoUpload getCroppedImg] Starting crop process:', { pixelCrop })
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    console.error('[PhotoUpload getCroppedImg] Failed to get 2d context')
    throw new Error('No 2d context')
  }

  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('[PhotoUpload getCroppedImg] Failed to create blob')
        resolve('')
        return
      }
      console.log('[PhotoUpload getCroppedImg] Blob created, size:', blob.size)
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = () => {
        console.log('[PhotoUpload getCroppedImg] Crop complete')
        resolve(reader.result as string)
      }
    }, 'image/jpeg', 0.9)
  })
}

export default function PhotoUpload({ 
  currentPhotoPath, 
  onPhotoChange, 
  employeeName = "User",
  className = "",
  suppressToast = false
}: PhotoUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPhotoPath || null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const [isCropOpen, setIsCropOpen] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      console.log('[PhotoUpload] No file selected')
      return
    }

    console.log('[PhotoUpload] File selected:', { name: file.name, size: file.size, type: file.type })

    if (!file.type.startsWith('image/')) {
      console.warn('[PhotoUpload] Invalid file type:', file.type)
      toast({
        title: "Invalid file type",
        description: "Please select an image file (JPEG, PNG, etc.)",
        variant: "destructive",
      })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      console.warn('[PhotoUpload] File too large:', file.size)
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive",
      })
      return
    }

    try {
      console.log('[PhotoUpload] Reading file as data URL')
      const reader = new FileReader()
      reader.addEventListener('load', () => {
        console.log('[PhotoUpload] File loaded, opening crop dialog')
        setImageSrc(reader.result as string)
        setIsCropOpen(true)
        setZoom(1)
        setCrop({ x: 0, y: 0 })
      })
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('[PhotoUpload] Error opening image:', error)
      toast({
        title: "Failed to open image",
        description: "Please try again with a different file.",
        variant: "destructive",
      })
    }
  }

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    console.log('[PhotoUpload] Crop complete:', { croppedArea, croppedAreaPixels })
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleCropSave = async () => {
    if (!imageSrc || !croppedAreaPixels) {
      console.warn('[PhotoUpload] Cannot save: missing imageSrc or croppedAreaPixels')
      return
    }
    
    try {
      console.log('[PhotoUpload] Saving cropped image...')
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels)
      console.log('[PhotoUpload] Cropped image created, size:', croppedImage.length)
      setPreviewUrl(croppedImage)
      onPhotoChange(croppedImage)
      setIsCropOpen(false)
      setImageSrc(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      if (!suppressToast) {
        toast({ title: "Photo updated", description: "Your cropped photo has been saved." })
      }
      console.log('[PhotoUpload] Photo saved successfully')
    } catch (e) {
      console.error('[PhotoUpload] Error cropping image:', e)
      toast({
        title: "Failed to crop image",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleRemovePhoto = () => {
    console.log('[PhotoUpload] Removing photo')
    setPreviewUrl(null)
    onPhotoChange(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCameraClick = () => {
    console.log('[PhotoUpload] Opening file picker')
    fileInputRef.current?.click()
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w.charAt(0)).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col items-center space-y-4">
        {/* Avatar Preview */}
        <div className="relative group">
          <Avatar className="h-40 w-40 ring-4 ring-blue-500/20 ring-offset-4 ring-offset-white dark:ring-offset-gray-800 transition-all duration-300 group-hover:ring-blue-500/40">
            {previewUrl ? <AvatarImage src={previewUrl} alt={employeeName} className="object-cover" /> : null}
            <AvatarFallback className="text-3xl font-bold bg-linear-to-br from-blue-500 to-purple-600 text-white">
              {getInitials(employeeName)}
            </AvatarFallback>
          </Avatar>
          {previewUrl && (
            <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Hidden File Input */}
        <Input 
          ref={fileInputRef}
          type="file" 
          accept="image/*" 
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Button 
            type="button" 
            onClick={handleCameraClick}
            className="w-full bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Camera className="h-5 w-5 mr-2" />
            {previewUrl ? 'Change Photo' : 'Upload Photo'}
          </Button>
          {previewUrl && (
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleRemovePhoto}
              className="w-full border-2 border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <X className="h-4 w-4 mr-2" />
              Remove Photo
            </Button>
          )}
        </div>

        {/* Info Text */}
        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
          Supported: JPEG, PNG, GIF • Max 5MB
        </p>
      </div>

      {/* Crop Dialog */}
      <Dialog open={isCropOpen} onOpenChange={setIsCropOpen}>
        <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden">
          <div className="relative border-b p-6 bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600">
            <div className="absolute inset-0 bg-black/10"></div>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-3 relative z-10">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Camera className="h-6 w-6" />
              </div>
              Adjust Your Photo
            </DialogTitle>
            <p className="text-sm text-white/80 mt-1 relative z-10">Drag to reposition • Scroll or slide to zoom</p>
          </div>
          
          <div className="relative bg-linear-to-br from-gray-900 via-gray-800 to-black" style={{ height: '450px' }}>
            {/* Corner Decorations */}
            <div className="absolute top-4 left-4 w-12 h-12 border-l-2 border-t-2 border-white/20 z-10"></div>
            <div className="absolute top-4 right-4 w-12 h-12 border-r-2 border-t-2 border-white/20 z-10"></div>
            <div className="absolute bottom-4 left-4 w-12 h-12 border-l-2 border-b-2 border-white/20 z-10"></div>
            <div className="absolute bottom-4 right-4 w-12 h-12 border-r-2 border-b-2 border-white/20 z-10"></div>

            {/* React Easy Crop Component */}
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                style={{
                  containerStyle: {
                    background: 'transparent',
                  },
                  cropAreaStyle: {
                    border: '4px solid rgba(59, 130, 246, 0.8)',
                    boxShadow: '0 0 50px rgba(59, 130, 246, 0.4)',
                  },
                }}
              />
            )}

            {/* Instructions */}
            <div className="absolute bottom-6 left-6 right-6 text-center z-10">
              <div className="inline-flex items-center gap-3 px-6 py-3 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
                <span className="text-xs text-white/90">🖱️ Drag to move</span>
                <span className="text-white/30">•</span>
                <span className="text-xs text-white/90">🔍 Zoom below</span>
              </div>
            </div>
          </div>
          
          <div className="p-6 space-y-6 bg-white dark:bg-gray-900">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ZoomIn className="h-4 w-4 text-gray-500" />
                  <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Zoom Level</Label>
                </div>
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums px-3 py-1 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
              <Slider value={[zoom]} min={1} max={4} step={0.01} onValueChange={(v) => setZoom(v[0])} className="py-2" />
              <div className="flex justify-between px-1 text-xs text-gray-400">
                <span>100%</span>
                <span>200%</span>
                <span>300%</span>
                <span>400%</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button 
                type="button"
                variant="outline" 
                className="flex-1 h-12 border-2 hover:border-gray-400 dark:hover:border-gray-500" 
                onClick={() => setIsCropOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="button"
                className="flex-1 h-12 bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl" 
                onClick={handleCropSave}
              >
                <Upload className="h-5 w-5 mr-2" />
                Save Photo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
