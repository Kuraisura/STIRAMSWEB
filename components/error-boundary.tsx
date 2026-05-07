"use client"

import React, { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

const isChunkLoadFailure = (message?: string | null) => {
  const text = String(message || '')
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk [0-9]+ failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /Loading CSS chunk [0-9]+ failed/i.test(text)
  )
}

const hardReloadWithCacheBuster = async () => {
  try {
    if (typeof window === 'undefined') return

    try {
      if ('caches' in window) {
        const keys = await window.caches.keys()
        await Promise.all(keys.map((key) => window.caches.delete(key)))
      }
    } catch {
      // Best effort only.
    }

    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.set('__chunkRetry', String(Date.now()))
    window.location.replace(nextUrl.toString())
  } catch {
    window.location.reload()
  }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error,
      errorInfo
    })
  }

  handleReset = () => {
    const isChunkError = isChunkLoadFailure(this.state.error?.message)
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })

    if (isChunkError) {
      void hardReloadWithCacheBuster()
      return
    }

    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900 animate-fadeInUp">
          <Card className="max-w-2xl w-full shadow-xl border-red-200 dark:border-red-900">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full animate-pulse">
                  <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <CardTitle className="text-2xl text-red-600 dark:text-red-400">
                  Oops! Something went wrong
                </CardTitle>
              </div>
              <CardDescription className="text-base">
                We encountered an unexpected error. Don't worry, your data is safe.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {this.state.error && (
                <div className="space-y-3">
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-300 mb-2">
                      Error Details:
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-400 font-mono break-all">
                      {this.state.error.message}
                    </p>
                  </div>

                  {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                    <details className="p-4 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <summary className="text-sm font-semibold text-gray-900 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        Stack Trace (Development Only)
                      </summary>
                      <pre className="mt-3 text-xs text-gray-700 dark:text-gray-400 overflow-auto max-h-64 p-2 bg-gray-50 dark:bg-gray-900 rounded">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={this.handleReset}
                  className="flex-1 bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all duration-300 transform hover:scale-105"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reload Page
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.history.back()}
                  className="flex-1 transition-all duration-300 transform hover:scale-105"
                >
                  Go Back
                </Button>
              </div>

              <div className="text-center pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  If this problem persists, please contact your system administrator.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
