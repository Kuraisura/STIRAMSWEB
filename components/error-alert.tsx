"use client"

import React from 'react'
import { AlertTriangle, CheckCircle, Info, XCircle, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export type AlertType = 'success' | 'error' | 'warning' | 'info'

interface ErrorAlertProps {
  type?: AlertType
  title: string
  message: string
  onClose?: () => void
  autoClose?: boolean
  autoCloseDelay?: number
}

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
}

const colorMap = {
  success: 'border-green-500 text-green-900 dark:text-green-300 bg-green-50 dark:bg-green-900/20',
  error: 'border-red-500 text-red-900 dark:text-red-300 bg-red-50 dark:bg-red-900/20',
  warning: 'border-yellow-500 text-yellow-900 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20',
  info: 'border-blue-500 text-blue-900 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20'
}

const iconColorMap = {
  success: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-600 dark:text-blue-400'
}

export function ErrorAlert({ 
  type = 'error', 
  title, 
  message, 
  onClose,
  autoClose = false,
  autoCloseDelay = 5000
}: ErrorAlertProps) {
  const [visible, setVisible] = React.useState(true)
  const Icon = iconMap[type]

  React.useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(() => {
        setVisible(false)
        onClose?.()
      }, autoCloseDelay)
      return () => clearTimeout(timer)
    }
  }, [autoClose, autoCloseDelay, onClose])

  if (!visible) return null

  return (
    <Alert 
      className={`${colorMap[type]} border-l-4 shadow-lg animate-slideInRight transition-all duration-300 hover:shadow-xl`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconColorMap[type]} animate-pulse`} />
        <div className="flex-1 space-y-1">
          <AlertTitle className="font-semibold text-base">{title}</AlertTitle>
          <AlertDescription className="text-sm opacity-90">
            {message}
          </AlertDescription>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setVisible(false)
              onClose()
            }}
            className="h-6 w-6 p-0 hover:bg-black/10 dark:hover:bg-white/10 transition-colors duration-200"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Alert>
  )
}

// Global error handler hook
export function useErrorHandler() {
  const [error, setError] = React.useState<{ type: AlertType; title: string; message: string } | null>(null)

  const showError = React.useCallback((message: string, title: string = 'Error') => {
    setError({ type: 'error', title, message })
  }, [])

  const showWarning = React.useCallback((message: string, title: string = 'Warning') => {
    setError({ type: 'warning', title, message })
  }, [])

  const showSuccess = React.useCallback((message: string, title: string = 'Success') => {
    setError({ type: 'success', title, message })
  }, [])

  const showInfo = React.useCallback((message: string, title: string = 'Information') => {
    setError({ type: 'info', title, message })
  }, [])

  const clearError = React.useCallback(() => {
    setError(null)
  }, [])

  return {
    error,
    showError,
    showWarning,
    showSuccess,
    showInfo,
    clearError
  }
}
