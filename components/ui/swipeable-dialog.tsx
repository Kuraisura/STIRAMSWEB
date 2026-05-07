"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const SwipeableDialog = DialogPrimitive.Root

const SwipeableDialogTrigger = DialogPrimitive.Trigger

const SwipeableDialogPortal = DialogPrimitive.Portal

const SwipeableDialogClose = DialogPrimitive.Close

const SwipeableDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
SwipeableDialogOverlay.displayName = DialogPrimitive.Overlay.displayName

interface SwipeableDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  showCloseButton?: boolean
}

const SwipeableDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SwipeableDialogContentProps
>(({ className, children, showCloseButton = true, ...props }, ref) => {
  const [isDragging, setIsDragging] = React.useState(false)
  const [dragOffset, setDragOffset] = React.useState(0)
  const [startX, setStartX] = React.useState(0)
  const [startY, setStartY] = React.useState(0)
  const [isVerticalScroll, setIsVerticalScroll] = React.useState(false)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const dialogRef = React.useRef<HTMLDivElement>(null)

  const handleStart = (clientX: number, clientY: number) => {
    setStartX(clientX)
    setStartY(clientY)
    setIsDragging(true)
    setIsVerticalScroll(false)
  }

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return

    const deltaX = clientX - startX
    const deltaY = clientY - startY

    // Detect if user is scrolling vertically (prioritize vertical scrolling)
    if (!isVerticalScroll && Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      setIsVerticalScroll(true)
      return
    }

    // Only allow horizontal swipe if not vertical scrolling
    if (!isVerticalScroll && Math.abs(deltaX) > 10) {
      // Prevent scrolling while swiping horizontally
      if (contentRef.current) {
        contentRef.current.style.overflow = 'hidden'
      }
      
      // Add resistance when swiping (rubber band effect)
      const resistance = 0.5
      setDragOffset(deltaX * resistance)
    }
  }

  const handleEnd = () => {
    if (!isDragging) return
    
    setIsDragging(false)

    // Reset overflow
    if (contentRef.current) {
      contentRef.current.style.overflow = ''
    }

    // If dragged more than 100px, close the dialog
    const threshold = 100
    if (Math.abs(dragOffset) > threshold) {
      // Trigger close
      const closeButton = dialogRef.current?.querySelector('[data-dialog-close]') as HTMLButtonElement
      if (closeButton) {
        closeButton.click()
      }
    }

    // Reset drag offset with animation
    setDragOffset(0)
    setIsVerticalScroll(false)
  }

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX, e.touches[0].clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX, e.touches[0].clientY)
  }

  const handleTouchEnd = () => {
    handleEnd()
  }

  // Mouse events (for testing on desktop)
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow mouse drag on mobile-sized screens
    if (window.innerWidth > 768) return
    handleStart(e.clientX, e.clientY)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || window.innerWidth > 768) return
    handleMove(e.clientX, e.clientY)
  }

  const handleMouseUp = () => {
    if (window.innerWidth > 768) return
    handleEnd()
  }

  return (
    <SwipeableDialogPortal>
      <SwipeableDialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          "max-h-[90vh] overflow-hidden",
          className
        )}
        {...props}
      >
        <div
          ref={dialogRef}
          className="h-full flex flex-col"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            transform: `translateX(${dragOffset}px)`,
            transition: isDragging ? 'none' : 'transform 0.3s ease-out',
            opacity: 1 - Math.abs(dragOffset) / 300, // Fade out as dragging
          }}
        >
          {/* Swipe indicator for mobile */}
          <div className="flex justify-center md:hidden mb-2 -mt-2">
            <div className="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
          </div>

          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto overscroll-contain"
            style={{
              WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
            }}
          >
            {children}
          </div>

          {showCloseButton && (
            <DialogPrimitive.Close
              data-dialog-close
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </div>
      </DialogPrimitive.Content>
    </SwipeableDialogPortal>
  )
})
SwipeableDialogContent.displayName = DialogPrimitive.Content.displayName

const SwipeableDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SwipeableDialogHeader.displayName = "SwipeableDialogHeader"

const SwipeableDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SwipeableDialogFooter.displayName = "SwipeableDialogFooter"

const SwipeableDialogTitle = React.forwardRef<
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
SwipeableDialogTitle.displayName = DialogPrimitive.Title.displayName

const SwipeableDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SwipeableDialogDescription.displayName =
  DialogPrimitive.Description.displayName

export {
  SwipeableDialog,
  SwipeableDialogPortal,
  SwipeableDialogOverlay,
  SwipeableDialogClose,
  SwipeableDialogTrigger,
  SwipeableDialogContent,
  SwipeableDialogHeader,
  SwipeableDialogFooter,
  SwipeableDialogTitle,
  SwipeableDialogDescription,
}

