"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type RiskLevel = "low" | "medium" | "high"

interface ScenarioHealthResponse {
  date: string
  risk_level: RiskLevel
  metrics: {
    pending_verifications: number | null
    pending_under_review: number | null
    pending_missed_logs: number | null
    pending_leaves: number | null
    pending_time_corrections: number | null
    approved_verifications_today: number | null
    rejected_verifications_today: number | null
    reviewed_verifications_today: number | null
    approval_conversion_rate_today: number | null
    approved_under_review_today: number | null
    approved_missed_logs_today: number | null
    approved_time_corrections_today: number | null
    approved_leaves_today: number | null
    active_substitutions_today: number | null
    employees_with_more_than_two_logs_today: number | null
    employees_with_out_without_in_today: number | null
    overlapping_teaching_schedule_pairs: number | null
    overlapping_exam_schedule_pairs: number | null
    verification_requests_over_sla_72h: number | null
  }
  diagnostics?: {
    partial_data?: boolean
    issues?: string[]
  }
}

type OperationsScenarioHealthCardProps = {
  staffTypeFilter?: 'Teaching' | 'Non-Teaching' | null
}

function riskTone(level: RiskLevel) {
  if (level === "high") {
    return {
      label: "High Risk",
      badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      icon: ShieldAlert,
      iconClass: "text-red-600 dark:text-red-400",
    }
  }
  if (level === "medium") {
    return {
      label: "Medium Risk",
      badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
      icon: AlertTriangle,
      iconClass: "text-amber-600 dark:text-amber-400",
    }
  }
  return {
    label: "Low Risk",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    icon: CheckCircle2,
    iconClass: "text-green-600 dark:text-green-400",
  }
}

export function OperationsScenarioHealthCard({ staffTypeFilter = null }: OperationsScenarioHealthCardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<ScenarioHealthResponse | null>(null)

  const loadHealth = async () => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      setError(null)
      const params = new URLSearchParams()
      if (staffTypeFilter) params.set('staffType', staffTypeFilter)
      const url = params.toString() ? `/api/operations/scenario-health?${params.toString()}` : '/api/operations/scenario-health'
      const res = await fetch(url, { cache: "no-store", signal: controller.signal })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || "Failed to fetch scenario health")
      }
      const payload = (await res.json()) as ScenarioHealthResponse
      setHealth(payload)
    } catch (e: any) {
      const message = e?.name === 'AbortError' ? 'Scenario health request timed out. Retry to refresh.' : (e?.message || 'Failed to load scenario health')
      setError(message)
    } finally {
      window.clearTimeout(timeout)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setIsLoading(true)
    loadHealth()

    const interval = window.setInterval(loadHealth, 60 * 1000)
    return () => window.clearInterval(interval)
  }, [staffTypeFilter])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operations Scenario Health</CardTitle>
          <CardDescription>Loading live operations indicators...</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Checking scenario health signals...</CardContent>
      </Card>
    )
  }

  if (error || !health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operations Scenario Health</CardTitle>
          <CardDescription>Unable to load scenario health right now.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error || "No data"}</p>
          <Button variant="outline" size="sm" onClick={loadHealth}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const tone = riskTone(health.risk_level)
  const RiskIcon = tone.icon
  const pendingTotal = health.metrics.pending_verifications
  const pendingBreakdownValues = [
    health.metrics.pending_missed_logs,
    health.metrics.pending_leaves,
    health.metrics.pending_time_corrections,
  ]
  const pendingBreakdownKnown = pendingBreakdownValues.every((v) => v != null)
  const pendingBreakdownSum = pendingBreakdownKnown
    ? pendingBreakdownValues.reduce((sum, v) => sum + Number(v || 0), 0)
    : null
  const pendingConsistencyMatch =
    pendingTotal != null && pendingBreakdownSum != null
      ? pendingTotal === pendingBreakdownSum
      : null
  const approvedTotal = health.metrics.approved_verifications_today
  const approvedBreakdownValues = [
    health.metrics.approved_missed_logs_today,
    health.metrics.approved_time_corrections_today,
    health.metrics.approved_leaves_today,
  ]
  const approvedBreakdownKnown = approvedBreakdownValues.every((v) => v != null)
  const approvedBreakdownSum = approvedBreakdownKnown
    ? approvedBreakdownValues.reduce((sum, v) => sum + Number(v || 0), 0)
    : null
  const approvedConsistencyMatch =
    approvedTotal != null && approvedBreakdownSum != null
      ? approvedTotal === approvedBreakdownSum
      : null

  return (
    <Card className="border-blue-200/70 dark:border-blue-900/40">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RiskIcon className={`h-5 w-5 ${tone.iconClass}`} />
            <CardTitle className="text-base">Operations Scenario Health</CardTitle>
          </div>
          <Badge className={tone.badgeClass}>{tone.label}</Badge>
        </div>
        <CardDescription>
          Daily production signals for attendance, verification, schedules, and substitutions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Pending Verifications</div>
            <div className="font-semibold">{health.metrics.pending_verifications ?? "N/A"}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Approved Today</div>
            <div className="font-semibold">{health.metrics.approved_verifications_today ?? "N/A"}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Rejected Today</div>
            <div className="font-semibold">{health.metrics.rejected_verifications_today ?? "N/A"}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Reviewed Today</div>
            <div className="font-semibold">{health.metrics.reviewed_verifications_today ?? "N/A"}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Approval Conversion</div>
            <div className="font-semibold">
              {health.metrics.approval_conversion_rate_today != null
                ? `${health.metrics.approval_conversion_rate_today}%`
                : "N/A"}
            </div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">SLA &gt;72h</div>
            <div className="font-semibold">{health.metrics.verification_requests_over_sla_72h ?? "N/A"}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Log Anomalies</div>
            <div className="font-semibold">
              {(health.metrics.employees_with_more_than_two_logs_today ?? 0) + (health.metrics.employees_with_out_without_in_today ?? 0)}
            </div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Schedule Overlaps</div>
            <div className="font-semibold">
              {(health.metrics.overlapping_teaching_schedule_pairs ?? 0) + (health.metrics.overlapping_exam_schedule_pairs ?? 0)}
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Pending Verification Breakdown</p>
          <div
            className={`mb-2 rounded-md border px-2 py-1 text-xs ${
              pendingConsistencyMatch === true
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-950/20 dark:text-green-300'
                : pendingConsistencyMatch === false
                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
                : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
            }`}
          >
            Pending Consistency Check: Total {pendingTotal ?? 'N/A'} vs Breakdown Sum {pendingBreakdownSum ?? 'N/A'}
            {pendingConsistencyMatch === true ? ' (match)' : pendingConsistencyMatch === false ? ' (mismatch)' : ' (insufficient data)'}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-3">
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">Missed Log</div>
              <div className="font-semibold">{health.metrics.pending_missed_logs ?? "N/A"}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">Leave</div>
              <div className="font-semibold">{health.metrics.pending_leaves ?? "N/A"}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">Time Correction</div>
              <div className="font-semibold">{health.metrics.pending_time_corrections ?? "N/A"}</div>
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Approved Verification Breakdown (Today)</p>
          <div
            className={`mb-2 rounded-md border px-2 py-1 text-xs ${
              approvedConsistencyMatch === true
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-950/20 dark:text-green-300'
                : approvedConsistencyMatch === false
                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
                : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
            }`}
          >
            Approved Consistency Check: Total {approvedTotal ?? 'N/A'} vs Breakdown Sum {approvedBreakdownSum ?? 'N/A'}
            {approvedConsistencyMatch === true ? ' (match)' : approvedConsistencyMatch === false ? ' (mismatch)' : ' (insufficient data)'}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">Missed Log</div>
              <div className="font-semibold">{health.metrics.approved_missed_logs_today ?? "N/A"}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">Time Correction</div>
              <div className="font-semibold">{health.metrics.approved_time_corrections_today ?? "N/A"}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">Leave</div>
              <div className="font-semibold">{health.metrics.approved_leaves_today ?? "N/A"}</div>
            </div>
          </div>
        </div>

        {health.diagnostics?.partial_data ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Partial data only: some metrics could not be computed.
          </p>
        ) : null}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">As of {health.date}</p>
          <Button variant="outline" size="sm" onClick={loadHealth}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild variant="secondary" size="sm">
            <a href="/api/operations/uat-docs?format=csv" target="_blank" rel="noreferrer">
              Open UAT CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/operations/uat-docs?format=md" target="_blank" rel="noreferrer">
              Open UAT Markdown
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/operations/uat-docs?format=runbook" target="_blank" rel="noreferrer">
              Open Runbook
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
