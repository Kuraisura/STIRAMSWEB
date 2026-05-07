"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RefreshCw, CheckCircle, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function SyncTestPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const { toast } = useToast()

  const handleSync = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/verification-requests/sync-absences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Sync Complete",
          description: `Created: ${data.stats.created}, Updated: ${data.stats.updated}, Skipped: ${data.stats.skipped}`,
        })
        setResult(data)
      } else {
        toast({
          title: "Sync Failed",
          description: data.error || "Failed to sync absences",
          variant: "destructive"
        })
        setResult(data)
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to sync absences",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sync Approved Leaves to Attendance Logs</CardTitle>
          <CardDescription>
            This tool will create absence records for all approved leave requests that don't have attendance logs yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleSync} 
            disabled={loading}
            className="w-full h-12"
          >
            <RefreshCw className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Syncing...' : 'Sync Absences'}
          </Button>

          {result && (
            <div className="mt-6 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-lg mb-3">Sync Results:</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Leaves</div>
                    <div className="text-2xl font-bold">{result.stats.totalLeaves}</div>
                  </div>
                  
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      Created
                    </div>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-300">{result.stats.created}</div>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="text-sm text-blue-600 dark:text-blue-400">Updated</div>
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{result.stats.updated}</div>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Skipped</div>
                    <div className="text-2xl font-bold">{result.stats.skipped}</div>
                  </div>
                </div>

                {result.stats.errors > 0 && (
                  <div className="mt-4 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1 mb-2">
                      <XCircle className="h-4 w-4" />
                      Errors ({result.stats.errors})
                    </div>
                    {result.errors && (
                      <div className="text-xs text-red-700 dark:text-red-300 space-y-1 max-h-40 overflow-y-auto">
                        {result.errors.map((err: string, idx: number) => (
                          <div key={idx} className="font-mono">{err}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  ✓ Check the Attendance Logs page to verify the absences were created successfully.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
