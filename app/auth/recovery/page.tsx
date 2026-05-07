"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function RecoveryGatePage() {
  const router = useRouter()
  const [nextPath, setNextPath] = useState("/dashboard/recovery-console")

  const [passphrase, setPassphrase] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [cooldownSec, setCooldownSec] = useState(0)

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      const n = q.get("next") || ""
      if (typeof n === "string" && n.startsWith("/dashboard/recovery-console")) {
        setNextPath(n.split("?")[0] || "/dashboard/recovery-console")
      }
    } catch {
      /* keep default */
    }
  }, [])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
      document.documentElement.style.overflow = ""
    }
  }, [])

  useEffect(() => {
    if (cooldownSec <= 0) return
    const t = setInterval(() => {
      setCooldownSec((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [cooldownSec])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cooldownSec > 0 || loading) return
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/recovery/unlock", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      })
      const data = await res.json().catch(() => ({}))
      const retryRaw = Number((data as any)?.retryAfterSec)

      if (res.status === 429) {
        const sec =
          Number.isFinite(retryRaw) && retryRaw > 0
            ? Math.ceil(retryRaw)
            : Number(res.headers.get("Retry-After")) || 60
        setCooldownSec(sec)
        setError((data as any)?.error || `Too many attempts. Wait ${sec} seconds.`)
        setLoading(false)
        return
      }

      if (!res.ok || !(data as any)?.success) {
        setError(String((data as any)?.error || "Invalid passphrase"))
        setLoading(false)
        return
      }

      setPassphrase("")
      const dest = typeof nextPath === "string" && nextPath.startsWith("/dashboard/recovery-console")
        ? nextPath
        : "/dashboard/recovery-console"
      try {
        sessionStorage.setItem("rams_recovery_only", "1")
        sessionStorage.setItem("rams_recovery_signin_gate", "1")
      } catch {}

      router.replace(dest)
      window.location.assign(dest)
    } catch {
      setError("Request failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden flex items-center justify-center p-4 bg-slate-950">
      <div className="absolute inset-0 overflow-hidden opacity-40">
        <Image src="/Landing Page_/mobile-background.png" alt="" fill className="object-cover" priority />
      </div>
      <Card className="relative z-10 w-full max-w-md border-blue-950/80 bg-background/95 shadow-xl">
        <CardHeader className="text-center">
          <CardTitle>Emergency recovery</CardTitle>
          <CardDescription>
            Enter the recovery passphrase configured on this server. Repeated wrong attempts temporarily lock retries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-passphrase">Recovery passphrase</Label>
              <Input
                id="recovery-passphrase"
                type="password"
                autoComplete="off"
                spellCheck={false}
                disabled={cooldownSec > 0 || loading}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={cooldownSec > 0 ? `Wait ${cooldownSec}s…` : "Passphrase"}
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading || cooldownSec > 0 || !passphrase.trim()}>
              {loading ? "Unlocking…" : cooldownSec > 0 ? `Locked (${cooldownSec}s)` : "Unlock recovery console"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={() => router.replace("/auth/login")}
            >
              Back to sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
