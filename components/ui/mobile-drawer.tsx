"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const MobileDrawer = DialogPrimitive.Root

const MobileDrawerTrigger = DialogPrimitive.Trigger

const MobileDrawerPortal = DialogPrimitive.Portal

const MobileDrawerClose = DialogPrimitive.Close

const MobileDrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-100 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
MobileDrawerOverlay.displayName = DialogPrimitive.Overlay.displayName

interface MobileDrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  onClose?: () => void
}

const MobileDrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  MobileDrawerContentProps
>(({ className, children, onClose, ...props }, ref) => {
  const [translateX, setTranslateX] = React.useState(0)
  const [isDragging, setIsDragging] = React.useState(false)
  const [dragStartX, setDragStartX] = React.useState(0)
  const [dragStartY, setDragStartY] = React.useState(0)
  const [initialTouchY, setInitialTouchY] = React.useState(0)
  const [isScrolling, setIsScrolling] = React.useState(false)
  
  const contentRef = React.useRef<HTMLDivElement>(null)
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)

  // Reset states when component unmounts or remounts
  React.useEffect(() => {
    return () => {
      setTranslateX(0)
      setIsDragging(false)
      setIsScrolling(false)
    }
  }, [])

  const handleTouchStart = React.useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    setDragStartX(touch.clientX)
    setDragStartY(touch.clientY)
    setInitialTouchY(touch.clientY)
    setIsDragging(true)
    setIsScrolling(false)
  }, [])

  const handleTouchMove = React.useCallback((e: TouchEvent) => {
    if (!isDragging) return

    const touch = e.touches[0]
    const deltaX = touch.clientX - dragStartX
    const deltaY = touch.clientY - dragStartY

    // Determine if user is scrolling vertically or swiping horizontally
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    // If movement is more vertical than horizontal, allow scrolling
    if (absY > absX && absY > 10) {
      setIsScrolling(true)
      return
    }

    // If scrolling vertically, don't interfere
    if (isScrolling) return

    // If horizontal movement is detected, prevent default and handle swipe
    if (absX > 10) {
      e.preventDefault()
      
      // Apply resistance effect
      const resistance = 0.6
      const newTranslateX = deltaX * resistance
      
      // Only allow swiping in the closing direction (right for left-to-right languages)
      if (newTranslateX > 0) {
        setTranslateX(newTranslateX)
      }
    }
  }, [isDragging, dragStartX, dragStartY, isScrolling])

  const handleTouchEnd = React.useCallback(() => {
    if (!isDragging) return

    setIsDragging(false)
    setIsScrolling(false)

    // If swiped more than 80px, close the drawer
    const threshold = 80
    if (translateX > threshold && onClose) {
      onClose()
    }

    // Reset position
    setTranslateX(0)
  }, [isDragging, translateX, onClose])

  React.useEffect(() => {
    const element = contentRef.current
    if (!element) return

    element.addEventListener('touchstart', handleTouchStart, { passive: false })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd)

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return (
    <MobileDrawerPortal>
      <MobileDrawerOverlay 
        onClick={onClose}
        style={{
          opacity: isDragging ? Math.max(0.3, 1 - translateX / 200) : 1
        }}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-110 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] border bg-background shadow-lg duration-200 sm:rounded-lg",
          "max-h-[90vh] overflow-hidden",
          className
        )}
        {...props}
      >
        <div
          ref={contentRef}
          className="h-full flex flex-col relative"
          style={{
            transform: `translateX(${translateX}px)`,
            transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
            opacity: isDragging ? Math.max(0.5, 1 - translateX / 300) : 1,
            touchAction: isScrolling ? 'auto' : 'pan-y',
          }}
        >
          {/* Swipe Indicator */}
          <div className="flex justify-center py-3 md:hidden border-b">
            <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full opacity-50" />
          </div>

          {/* Scrollable Content */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden p-6 min-h-0"
            style={{
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              maxHeight: 'calc(90vh - 80px)', // Account for header and padding
            }}
          >
            {children}
          </div>

          {/* Close Button */}
          <DialogPrimitive.Close
            onClick={onClose}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none z-10"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          {/* Swipe Hint (shows briefly on mobile) */}
          {isDragging && translateX > 20 && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none md:hidden">
              <div className="bg-white dark:bg-gray-800 rounded-full p-2 shadow-lg animate-pulse">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </DialogPrimitive.Content>
    </MobileDrawerPortal>
  )
})
MobileDrawerContent.displayName = DialogPrimitive.Content.displayName

const MobileDrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left pb-4",
      className
    )}
    {...props}
  />
)
MobileDrawerHeader.displayName = "MobileDrawerHeader"

const MobileDrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4 border-t",
      className
    )}
    {...props}
  />
)
MobileDrawerFooter.displayName = "MobileDrawerFooter"

const MobileDrawerTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
MobileDrawerTitle.displayName = DialogPrimitive.Title.displayName

const MobileDrawerDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
MobileDrawerDescription.displayName = DialogPrimitive.Description.displayName

export {
  MobileDrawer,
  MobileDrawerPortal,
  MobileDrawerOverlay,
  MobileDrawerClose,
  MobileDrawerTrigger,
  MobileDrawerContent,
  MobileDrawerHeader,
  MobileDrawerFooter,
  MobileDrawerTitle,
  MobileDrawerDescription,
}

