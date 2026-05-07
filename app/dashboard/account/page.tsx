"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { Camera, X, Upload, ZoomIn } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'

interface LocalUser {
  id: number
  email: string
  name: string
  role: string
  photo?: string
}

export default function AccountSettingsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [user, setUser] = useState<LocalUser | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [photo, setPhoto] = useState<string | undefined>(undefined)
  const [preview, setPreview] = useState<string | undefined>(undefined)
  const [isCropOpen, setIsCropOpen] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem("rams_user")
      if (stored) {
        const parsed = JSON.parse(stored)
        setUser(parsed)
        setName(parsed.name || "")
        setEmail(parsed.email || "")
        setPhoto(parsed.photo || undefined)
        setPreview(parsed.photo || undefined)
      } else {
        // Use default values if no user in localStorage
        setUser({ id: 1, email: 'admin@example.com', name: 'Admin User', role: 'admin' })
        setName("Admin User")
        setEmail("admin@example.com")
      }
    } catch (error) {
      console.error("Error loading user:", error)
      // Use default values on error
      setUser({ id: 1, email: 'admin@example.com', name: 'Admin User', role: 'admin' })
      setName("Admin User")
      setEmail("admin@example.com")
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Helper function to create image from URL
  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.addEventListener('load', () => resolve(image))
      image.addEventListener('error', error => reject(error))
      image.src = url
    })

  // Crop image function
  async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
    const image = await createImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
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
          resolve('')
          return
        }
        const reader = new FileReader()
        reader.readAsDataURL(blob)
        reader.onloadend = () => {
          resolve(reader.result as string)
        }
      }, 'image/jpeg', 0.9)
    })
  }

  const handleFileClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return

      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file",
          variant: "destructive",
        })
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Image must be smaller than 5MB",
          variant: "destructive",
        })
        return
      }

      const reader = new FileReader()
      reader.addEventListener('load', () => {
        setImageSrc(reader.result as string)
        setIsCropOpen(true)
        setZoom(1)
        setCrop({ x: 0, y: 0 })
      })
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleCropSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return

    try {
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels)
      setPreview(croppedImage)
      setPhoto(croppedImage)
      setIsCropOpen(false)
      setImageSrc(null)
      toast({
        title: "Photo ready",
        description: "Click 'Save Changes' to upload your photo.",
      })
    } catch (e) {
      console.error('Error cropping image:', e)
      toast({
        title: "Failed to crop image",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleRemovePhoto = () => {
    setPreview(undefined)
    setPhoto(undefined)
    toast({
      title: "Photo removed",
      description: "Click 'Save Changes' to confirm.",
    })
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w.charAt(0)).join('').toUpperCase().slice(0, 2)
  }

  // Compress image function (similar to employee upload)
  const compressImage = async (blob: Blob): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const MAX_WIDTH = 800
          const MAX_HEIGHT = 800
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height
              height = MAX_HEIGHT
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height)
            canvas.toBlob((compressedBlob) => {
              resolve(compressedBlob || blob)
            }, 'image/jpeg', 0.85)
          } else {
            resolve(blob)
          }
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(blob)
    })
  }

  // Upload photo data URL via local API (DB-backed for offline support)
  const uploadPhotoDataUrl = async (dataUrl: string): Promise<string> => {
    if (!user) return ''
    try {
      console.log('📤 Uploading admin photo via local API')

      const response = await fetch(dataUrl)
      const originalBlob = await response.blob()
      const compressedBlob = await compressImage(originalBlob)

      const compressedDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Failed to convert compressed image'))
        reader.readAsDataURL(compressedBlob)
      })

      const res = await fetch('/api/upload-admin-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: user.id,
          imageDataUrl: compressedDataUrl,
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error || `Upload failed with status ${res.status}`)
      }

      const body = await res.json().catch(() => ({}))
      console.log('✅ Admin photo uploaded successfully')
      return body?.path || ''
    } catch (error: any) {
      console.error('❌ Upload failed:', error)
      throw new Error(error?.message || 'Failed to upload photo')
    }
  }

  const handleSave = async () => {
    if (!user) return
    setIsSaving(true)
    try {
      console.log('Account Settings: Starting save operation', { userId: user.id, name, email })
      
      // Handle photo upload if it's a data URL (newly selected/cropped photo)
      let photoPathToSave: string | null | undefined = photo
      
      // Check if photo was explicitly removed (undefined means removed, empty string also means removed)
      if (photo === undefined || photo === "" || photo === null) {
        photoPathToSave = null  // Explicitly set to null to remove photo
        console.log('Account Settings: Photo removal detected, setting to null')
      } else if (typeof photo === "string" && photo.startsWith("data:image")) {
        // New photo uploaded - need to upload it
        try {
          photoPathToSave = await uploadPhotoDataUrl(photo)
          console.log('Account Settings: Photo uploaded successfully', { photoPath: photoPathToSave })
        } catch (error: any) {
          console.error('Account Settings: Photo upload failed', { error })
          toast({
            title: "Photo Upload Failed",
            description: error?.message || "Failed to upload photo. Other changes will still be saved.",
            variant: "destructive",
          })
          // Continue with saving other fields even if photo upload fails - keep existing photo
          photoPathToSave = user.photo || undefined
        }
      } else {
        // Photo is an existing URL - keep it as is
        photoPathToSave = photo
      }

      console.log('Account Settings: Saving user data to database', { photoPath: photoPathToSave })
      
      // Build update payload - explicitly pass null if photo should be removed
      const updatePayload: { full_name: string; email: string; photo_path?: string | null } = {
        full_name: name,
        email,
      }
      
      // Explicitly set photo_path to null if removing, otherwise set it (even if undefined, let updateAdminUser handle it)
      if (photoPathToSave === null) {
        updatePayload.photo_path = null  // Explicitly set to null to clear the field
      } else if (photoPathToSave !== undefined) {
        updatePayload.photo_path = photoPathToSave  // Set to the URL or data URL
      }
      // If photoPathToSave is undefined, don't include it in the payload (keep existing)
      
      const saveRes = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      })

      if (!saveRes.ok) {
        const errBody = await saveRes.json().catch(() => ({}))
        throw new Error(errBody?.error || `Failed to save profile (${saveRes.status})`)
      }

      const saveBody = await saveRes.json().catch(() => ({}))
      const saved = saveBody?.user || null
      
      // Handle photo path - if saved photo_path is null or undefined, treat as removed
      const savedPhotoPath = saved?.photo_path
      const finalPhoto = (savedPhotoPath === null || savedPhotoPath === undefined || savedPhotoPath === '') 
        ? undefined 
        : savedPhotoPath
      
      const updated = { 
        ...user, 
        name: saved?.full_name || name, 
        email: saved?.email || email, 
        photo: finalPhoto
      }
      console.log('Account Settings: User data saved successfully', { updated, savedPhotoPath, finalPhoto })
      localStorage.setItem("rams_user", JSON.stringify(updated))
      setUser(updated)
      
      // Update local photo state to match what was saved
      if (finalPhoto === undefined || finalPhoto === null || finalPhoto === '') {
        // Photo was removed
        setPhoto(undefined)
        setPreview(undefined)
      } else {
        // Photo is saved (URL from database)
        setPhoto(finalPhoto)
        setPreview(finalPhoto)
      }
      
      const nameChanged = user.name !== name
      const emailChanged = user.email !== email
      const photoChanged = (user.photo || undefined) !== (updated.photo || undefined)
      let description = "Your profile has been updated."
      if (!nameChanged && !emailChanged && photoChanged) {
        if (photoPathToSave === null) {
          description = "Profile photo has been removed."
        } else {
          description = "Profile photo has been updated."
        }
      }
      toast({ title: "Saved", description })
      router.refresh()
    } catch (error: any) {
      console.error('Account Settings: Save failed', { error })
      toast({
        title: "Save Failed",
        description: error?.message || "Failed to save changes. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }


  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-6 py-4 sm:py-6">
      {/* Header Section - Responsive */}
      <div className="space-y-1 sm:space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold dark:text-gray-100">Account Settings</h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300">Manage your profile information.</p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
          <CardTitle className="text-lg sm:text-xl">Profile</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Update your display name and email.</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          <div className="grid gap-4 sm:gap-6 max-w-3xl">
            {/* Profile Photo Section - Mobile Optimized */}
            <div className="space-y-3 sm:space-y-4">
              <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Profile Photo</Label>
              <Card className="p-4 sm:p-6 bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-600">
                <div className="flex flex-col items-center space-y-3 sm:space-y-4">
                  {/* Responsive Avatar Preview */}
                  <div className="relative group">
                    <Avatar className="h-28 w-28 sm:h-36 sm:w-36 md:h-40 md:w-40 ring-2 sm:ring-4 ring-blue-500/20 ring-offset-2 sm:ring-offset-4 ring-offset-white dark:ring-offset-gray-800 transition-all duration-300 group-hover:ring-blue-500/40">
                      {preview ? <AvatarImage src={preview} alt={name || user?.name || "User"} className="object-cover" /> : null}
                      <AvatarFallback className="text-xl sm:text-2xl md:text-3xl font-bold bg-linear-to-br from-blue-500 to-purple-600 text-white">
                        {getInitials(name || user?.name || "User")}
                      </AvatarFallback>
                    </Avatar>
                    {preview && (
                      <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="p-1.5 sm:p-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-full shadow-lg touch-manipulation"
                          aria-label="Remove photo"
                        >
                          <X className="h-3 w-3 sm:h-4 sm:w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons - Mobile Optimized */}
                  <div className="flex flex-col gap-2 w-full max-w-xs">
                    <Button 
                      type="button" 
                      onClick={handleFileClick}
                      className="w-full h-11 sm:h-12 bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 active:from-blue-800 active:to-purple-800 text-white font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all duration-200 touch-manipulation"
                    >
                      <Camera className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                      {preview ? 'Change Photo' : 'Upload Photo'}
                    </Button>
                    {preview && (
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={handleRemovePhoto}
                        className="w-full h-11 sm:h-12 border-2 border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 active:bg-red-100 dark:active:bg-red-900 text-sm sm:text-base touch-manipulation"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remove Photo
                      </Button>
                    )}
                  </div>

                  {/* Info Text - Responsive */}
                  <p className="text-xs text-center text-gray-500 dark:text-gray-400 px-2">
                    Supported: JPEG, PNG, GIF • Max 5MB
                  </p>
                </div>
              </Card>

              {/* Crop Dialog - Mobile Responsive */}
              <Dialog open={isCropOpen} onOpenChange={setIsCropOpen}>
                <DialogContent className="w-[95vw] sm:w-full sm:max-w-[600px] h-[95vh] sm:h-auto p-0 gap-0 overflow-hidden flex flex-col">
                  {/* Header - Mobile Responsive */}
                  <div className="relative border-b p-4 sm:p-6 bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600 shrink-0">
                    <div className="absolute inset-0 bg-black/10"></div>
                    <DialogTitle className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 sm:gap-3 relative z-10">
                      <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                        <Camera className="h-5 w-5 sm:h-6 sm:w-6" />
                      </div>
                      Adjust Your Photo
                    </DialogTitle>
                    <p className="text-xs sm:text-sm text-white/80 mt-1 relative z-10">
                      <span className="hidden sm:inline">Drag to reposition • Scroll or slide to zoom</span>
                      <span className="sm:hidden">Touch to move • Pinch or slide to zoom</span>
                    </p>
                  </div>
                  
                  {/* Crop Area - Responsive Height */}
                  <div className="relative bg-linear-to-br from-gray-900 via-gray-800 to-black flex-1 min-h-[300px] sm:min-h-[450px]" style={{ height: isMobile ? '60vh' : '450px' }}>
                    {/* Corner Decorations - Responsive */}
                    <div className="absolute top-2 left-2 sm:top-4 sm:left-4 w-8 h-8 sm:w-12 sm:h-12 border-l-2 border-t-2 border-white/20 z-10"></div>
                    <div className="absolute top-2 right-2 sm:top-4 sm:right-4 w-8 h-8 sm:w-12 sm:h-12 border-r-2 border-t-2 border-white/20 z-10"></div>
                    <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 w-8 h-8 sm:w-12 sm:h-12 border-l-2 border-b-2 border-white/20 z-10"></div>
                    <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 w-8 h-8 sm:w-12 sm:h-12 border-r-2 border-b-2 border-white/20 z-10"></div>

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
                            border: '3px solid rgba(59, 130, 246, 0.8)',
                            boxShadow: '0 0 30px rgba(59, 130, 246, 0.4)',
                          },
                        }}
                      />
                    )}

                    {/* Instructions - Mobile Responsive */}
                    <div className="absolute bottom-3 left-3 right-3 sm:bottom-6 sm:left-6 sm:right-6 text-center z-10">
                      <div className="inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2 sm:py-3 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
                        <span className="text-[10px] sm:text-xs text-white/90">
                          <span className="hidden sm:inline">🖱️ Drag to move</span>
                          <span className="sm:hidden">👆 Touch to move</span>
                        </span>
                        <span className="text-white/30">•</span>
                        <span className="text-[10px] sm:text-xs text-white/90">
                          <span className="hidden sm:inline">🔍 Zoom below</span>
                          <span className="sm:hidden">🔍 Zoom</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Controls - Mobile Responsive */}
                  <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-white dark:bg-gray-900 shrink-0 overflow-y-auto max-h-[40vh] sm:max-h-none">
                    <div className="space-y-2 sm:space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500" />
                          <Label className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Zoom Level</Label>
                        </div>
                        <span className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums px-2 sm:px-3 py-0.5 sm:py-1 bg-blue-50 dark:bg-blue-950 rounded-lg">
                          {Math.round(zoom * 100)}%
                        </span>
                      </div>
                      <Slider value={[zoom]} min={1} max={4} step={0.01} onValueChange={(v) => setZoom(v[0])} className="py-2 touch-manipulation" />
                      <div className="flex justify-between px-1 text-[10px] sm:text-xs text-gray-400">
                        <span>100%</span>
                        <span>200%</span>
                        <span>300%</span>
                        <span>400%</span>
                      </div>
                    </div>
                    
                    {/* Action Buttons - Mobile Responsive */}
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <Button 
                        type="button"
                        variant="outline" 
                        className="flex-1 h-11 sm:h-12 border-2 hover:border-gray-400 dark:hover:border-gray-500 active:bg-gray-100 dark:active:bg-gray-800 text-sm sm:text-base touch-manipulation" 
                        onClick={() => setIsCropOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="button"
                        className="flex-1 h-11 sm:h-12 bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 active:from-blue-800 active:via-indigo-800 active:to-purple-800 text-white font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl touch-manipulation" 
                        onClick={handleCropSave}
                      >
                        <Upload className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                        Save Photo
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {/* Form Fields - Mobile Responsive */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="name" className="text-sm sm:text-base font-medium">Full Name</Label>
              <Input 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="Your name"
                className="h-11 sm:h-12 text-sm sm:text-base"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="email" className="text-sm sm:text-base font-medium">Email</Label>
              <Input 
                id="email" 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="name@example.com"
                className="h-11 sm:h-12 text-sm sm:text-base"
              />
            </div>
            {/* Save Button - Mobile Responsive */}
            <div className="pt-2">
              <Button 
                onClick={handleSave} 
                disabled={isSaving} 
                className="w-full sm:w-auto btn-sti-primary h-11 sm:h-12 text-sm sm:text-base font-semibold touch-manipulation"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


