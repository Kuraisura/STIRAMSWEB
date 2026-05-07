"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const testDatabaseConnection = async () => {
  const res = await fetch('/api/status/database', { cache: 'no-store' })
  const body = await res.json().catch(() => ({}))
  return {
    success: Boolean((body as any)?.connected),
    error: (body as any)?.connected ? null : ((body as any)?.message || 'Database connection failed'),
  }
}

const testEmployeeTableAccess = async () => {
  const res = await fetch('/api/employees?includeInactive=true&limit=1', { cache: 'no-store' })
  const body = await res.json().catch(() => ({}))
  return {
    success: res.ok,
    error: res.ok ? null : ((body as any)?.error || 'Failed to access employees table'),
  }
}

const authenticateAdminUser = async (email: string, password: string) => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    return null
  }
  return (body as any)?.user || null
}

// Block diagnostic page in production
function ProductionBlock() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="max-w-md">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Not Available</h2>
          <p className="text-gray-600">This page is not available in production mode.</p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function DiagnosticPage() {
  if (process.env.NODE_ENV === 'production') {
    return <ProductionBlock />
  }

  return <DiagnosticContent />
}

function DiagnosticContent() {
  const [testResult, setTestResult] = useState<any>(null)
  const [tableAccessResult, setTableAccessResult] = useState<any>(null)
  const [authTestResult, setAuthTestResult] = useState<any>(null)
  const [manualAuthResult, setManualAuthResult] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTableAccessLoading, setIsTableAccessLoading] = useState(false)
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [isManualAuthLoading, setIsManualAuthLoading] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testPassword, setTestPassword] = useState('')

  const runConnectionTest = async () => {
    setIsLoading(true)
    try {
      const result = await testDatabaseConnection()
      setTestResult(result)
    } catch (error) {
      setTestResult({ success: false, error: error instanceof Error ? error.message : "Unknown error" })
    } finally {
      setIsLoading(false)
    }
  }

  const runTableAccessTest = async () => {
    setIsTableAccessLoading(true)
    try {
      const result = await testEmployeeTableAccess()
      setTableAccessResult(result)
    } catch (error) {
      setTableAccessResult({ success: false, error: error instanceof Error ? error.message : "Unknown error" })
    } finally {
      setIsTableAccessLoading(false)
    }
  }

  const runAuthTest = async () => {
    setIsAuthLoading(true)
    try {
      console.log("Starting authentication test...")
      const result = await authenticateAdminUser(testEmail, testPassword)
      console.log("Authentication test result:", result)
      setAuthTestResult({ success: !!result, user: result })
    } catch (error) {
      console.error("Authentication test error:", error)
      setAuthTestResult({ success: false, error: error instanceof Error ? error.message : "Unknown error" })
    } finally {
      setIsAuthLoading(false)
    }
  }

  const runManualAuthTest = async () => {
    setIsManualAuthLoading(true)
    try {
      console.log("Starting manual authentication test...")
      const result = await authenticateAdminUser(testEmail, testPassword)
      console.log("Manual authentication test result:", result)
      setManualAuthResult({ success: !!result, user: result })
    } catch (error) {
      console.error("Manual authentication test error:", error)
      setManualAuthResult({ success: false, error: error instanceof Error ? error.message : "Unknown error" })
    } finally {
      setIsManualAuthLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Offline Database Diagnostic</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Environment Variables</CardTitle>
          <CardDescription>Check if your local environment variables are properly configured</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>NEXT_PUBLIC_APP_URL:</span>
              <span className={process.env.NEXT_PUBLIC_APP_URL ? "text-green-600" : "text-yellow-600"}>
                {process.env.NEXT_PUBLIC_APP_URL ? "✅ Set" : "⚠ Optional"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>DATABASE_URL:</span>
              <span className={process.env.DATABASE_URL ? "text-green-600" : "text-red-600"}>
                {process.env.DATABASE_URL ? "✅ Set" : "❌ Not set"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Connection Test</CardTitle>
          <CardDescription>Test the connection to your local PostgreSQL database</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runConnectionTest} disabled={isLoading}>
            {isLoading ? "Testing..." : "Run Connection Test"}
          </Button>
          
          {testResult && (
            <Alert className={`mt-4 ${testResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              {testResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={testResult.success ? "text-green-800" : "text-red-800"}>
                {testResult.success 
                  ? "Connection successful! Your local database configuration is working."
                  : `Connection failed: ${testResult.error}`
                }
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Authentication Test</CardTitle>
          <CardDescription>Test if admin users can be authenticated</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runAuthTest} disabled={isAuthLoading}>
            {isAuthLoading ? "Testing..." : "Run Authentication Test"}
          </Button>
          
          {authTestResult && (
            <Alert className={`mt-4 ${authTestResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              {authTestResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={authTestResult.success ? "text-green-800" : "text-red-800"}>
                {authTestResult.success 
                  ? `Authentication successful! Logged in as: ${authTestResult.user?.full_name}`
                  : `Authentication failed: ${authTestResult.error}`
                }
              </AlertDescription>
            </Alert>
          )}
                 </CardContent>
       </Card>

       <Card className="mb-6">
         <CardHeader>
           <CardTitle>Table Access Test</CardTitle>
           <CardDescription>Test if we can access the employees table via local API</CardDescription>
         </CardHeader>
         <CardContent>
           <Button onClick={runTableAccessTest} disabled={isTableAccessLoading}>
             {isTableAccessLoading ? "Testing..." : "Run Table Access Test"}
           </Button>
           
           {tableAccessResult && (
             <Alert className={`mt-4 ${tableAccessResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
               {tableAccessResult.success ? (
                 <CheckCircle className="h-4 w-4 text-green-600" />
               ) : (
                 <XCircle className="h-4 w-4 text-red-600" />
               )}
               <AlertDescription className={tableAccessResult.success ? "text-green-800" : "text-red-800"}>
                 {tableAccessResult.success 
                   ? "Table access successful! You can read from the employees table."
                   : `Table access failed: ${tableAccessResult.error}`
                 }
               </AlertDescription>
             </Alert>
           )}
         </CardContent>
       </Card>

       <Card className="mb-6">
         <CardHeader>
           <CardTitle>Manual Authentication Test</CardTitle>
           <CardDescription>Test authentication with custom credentials</CardDescription>
         </CardHeader>
         <CardContent>
           <div className="space-y-4">
             <div>
               <Label htmlFor="test-email">Email</Label>
               <Input
                 id="test-email"
                 type="email"
                 value={testEmail}
                 onChange={(e) => setTestEmail(e.target.value)}
                 placeholder="Enter email to test"
               />
             </div>
             <div>
               <Label htmlFor="test-password">Password</Label>
               <Input
                 id="test-password"
                 type="password"
                 value={testPassword}
                 onChange={(e) => setTestPassword(e.target.value)}
                 placeholder="Enter password to test"
               />
             </div>
             <Button onClick={runManualAuthTest} disabled={isManualAuthLoading}>
               {isManualAuthLoading ? "Testing..." : "Test Manual Authentication"}
             </Button>
             
             {manualAuthResult && (
               <Alert className={`mt-4 ${manualAuthResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                 {manualAuthResult.success ? (
                   <CheckCircle className="h-4 w-4 text-green-600" />
                 ) : (
                   <XCircle className="h-4 w-4 text-red-600" />
                 )}
                 <AlertDescription className={manualAuthResult.success ? "text-green-800" : "text-red-800"}>
                   {manualAuthResult.success 
                     ? `Authentication successful! Logged in as: ${manualAuthResult.user?.full_name}`
                     : `Authentication failed: ${manualAuthResult.error}`
                   }
                 </AlertDescription>
               </Alert>
             )}
           </div>
         </CardContent>
       </Card>

       <Card>
        <CardHeader>
          <CardTitle>Troubleshooting Steps</CardTitle>
          <CardDescription>If the connection test fails, follow these steps:</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">1. Check Environment Variables</h4>
              <p className="text-sm text-gray-600">
                Make sure you have created a `.env.local` file in your project root with local database credentials.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">2. Verify Local Database</h4>
              <p className="text-sm text-gray-600">
                Ensure your local PostgreSQL instance is running and the connection string is correct.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">3. Database Setup</h4>
              <p className="text-sm text-gray-600">
                Run the SQL scripts in the `scripts/` folder to create the required database tables.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">4. Restart Development Server</h4>
              <p className="text-sm text-gray-600">
                After making changes to environment variables, restart your development server.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 
