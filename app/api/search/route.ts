import { NextRequest, NextResponse } from "next/server"
import { dbQuery } from "@/lib/db"

export const dynamic = 'force-dynamic'

type SearchResult = {
  type: 'page' | 'employee' | 'log'
  title: string
  url: string
  subtitle?: string
  group?: string
  score: number
}

type PageItem = {
  title: string
  url: string
  group: string
  keywords: string[]
}

class SearchService {
  private static instance: SearchService
  private sitePages: PageItem[] = [
    { title: "Dashboard", url: "/dashboard", group: "Pages", keywords: ["home", "overview", "main"] },
    { title: "Employee Management", url: "/dashboard/employees", group: "Management", keywords: ["employee", "staff", "faculty", "personnel", "users"] },
    { title: "Attendance", url: "/dashboard/attendance", group: "Attendance & Records", keywords: ["time in", "time out", "dtr", "tap", "rfid"] },
    { title: "Reports", url: "/dashboard/reports", group: "Attendance & Records", keywords: ["analytics", "summary", "statistics"] },
    { title: "Class Schedule", url: "/dashboard/class-schedule", group: "Schedule Management", keywords: ["teaching", "class", "subject", "room"] },
    { title: "Exam Schedule", url: "/dashboard/exam-schedule", group: "Schedule Management", keywords: ["exam", "midterm", "final", "schedule"] },
    { title: "Holiday Management", url: "/dashboard/holiday", group: "Management", keywords: ["holiday", "suspension", "special day"] },
    { title: "Substitute Assignment", url: "/dashboard/substitution", group: "Management", keywords: ["substitute", "replacement", "cover"] },
    { title: "Verification", url: "/dashboard/verification", group: "Management", keywords: ["approval", "request", "validate"] },
    { title: "Log Trail", url: "/dashboard/log-trail", group: "System", keywords: ["logs", "audit", "history", "activity"] },
    { title: "Academic Terms", url: "/dashboard/academic-term", group: "System", keywords: ["term", "semester", "school year"] },
    { title: "Settings", url: "/dashboard/settings", group: "System", keywords: ["config", "preferences", "options"] },
  ]

  static getInstance(): SearchService {
    if (!SearchService.instance) {
      SearchService.instance = new SearchService()
    }
    return SearchService.instance
  }

  private normalize(input: string) {
    return String(input || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private scoreText(query: string, target: string) {
    const q = this.normalize(query)
    const t = this.normalize(target)
    if (!q || !t) return 0
    if (q === t) return 120
    if (t.startsWith(q)) return 95

    const tokens = q.split(' ').filter(Boolean)
    const tokenHits = tokens.filter((token) => t.includes(token)).length
    const fullTokenMatch = tokens.length > 0 && tokenHits === tokens.length
    const partialTokenScore = tokenHits * 16
    const base = t.includes(q) ? 70 : 0
    const tokenBonus = fullTokenMatch ? 24 : partialTokenScore

    let subsequence = 0
    let qi = 0
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) qi++
    }
    if (qi === q.length && q.length >= 3) subsequence = 14

    return base + tokenBonus + subsequence
  }

  private searchPages(query: string): SearchResult[] {
    return this.sitePages
      .map((p) => {
        const titleScore = this.scoreText(query, p.title)
        const keywordScore = Math.max(...p.keywords.map((k) => this.scoreText(query, k)), 0)
        const score = Math.max(titleScore, Math.floor(keywordScore * 0.75))
        return {
          type: 'page' as const,
          title: p.title,
          url: p.url,
          subtitle: p.group,
          group: p.group,
          score,
        }
      })
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
  }

  private async searchEmployees(query: string): Promise<SearchResult[]> {
    try {
      const rows = await dbQuery<any>(
        `SELECT employee_id, full_name, email, rfid_code, department, school_id
         FROM employees
         WHERE (
           COALESCE(full_name, '') ILIKE $1 OR
           COALESCE(email, '') ILIKE $1 OR
           COALESCE(rfid_code, '') ILIKE $1 OR
           COALESCE(department, '') ILIKE $1 OR
           COALESCE(school_id, '') ILIKE $1
         )
           AND (is_active = true OR is_active IS NULL)
         ORDER BY full_name ASC
         LIMIT 24`,
        [`%${query}%`]
      )

      return (rows || []).map((emp) => {
        const score = Math.max(
          this.scoreText(query, emp.full_name || ''),
          Math.floor(this.scoreText(query, emp.school_id || '') * 0.95),
          Math.floor(this.scoreText(query, emp.rfid_code || '') * 0.9),
          Math.floor(this.scoreText(query, emp.email || '') * 0.8),
          Math.floor(this.scoreText(query, emp.department || '') * 0.7)
        )

        return {
          type: 'employee' as const,
        title: emp.full_name,
          subtitle: `${emp.department || 'Unknown'} • ${emp.school_id || ''}`.trim(),
        url: `/dashboard/employees?q=${encodeURIComponent(emp.full_name)}`,
          group: 'Employees',
          score,
        }
      })
      .filter((emp) => emp.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
    } catch (e) {
      console.error("Global search employees block failed:", e)
      return []
    }
  }

  private async searchLogs(query: string): Promise<SearchResult[]> {
    try {
      const rows = await dbQuery<any>(
        `SELECT id, action_type, description, user_name, created_at
         FROM log_trail
         WHERE
           COALESCE(user_name, '') ILIKE $1 OR
           COALESCE(action_type, '') ILIKE $1 OR
           COALESCE(description, '') ILIKE $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [`%${query}%`]
      )

      return (rows || []).map((log) => {
        const title = `${String(log.action_type || 'Log').replace(/_/g, ' ')}`
        const summary = `${log.user_name || 'System'} • ${log.description || ''}`.trim()
        const score = Math.max(
          this.scoreText(query, title),
          Math.floor(this.scoreText(query, log.user_name || '') * 0.95),
          Math.floor(this.scoreText(query, log.description || '') * 0.85)
        )

        return {
          type: 'log' as const,
          title: title.replace(/\b\w/g, (c: string) => c.toUpperCase()),
          subtitle: summary,
          url: `/dashboard/log-trail?search=${encodeURIComponent(query)}`,
          group: 'Logs',
          score,
        }
      })
      .filter((log) => log.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    } catch (e) {
      console.error('[Search] Logs block failed:', e)
      return []
    }
  }

  async performSearch(query: string) {
    console.log('[Search] Searching for:', query)
    
    if (!query || query.trim() === '') {
      console.log('[Search] Empty query')
      return { query, results: [] }
    }

    const pageMatches = this.searchPages(query)
    const [employeeResults, logResults] = await Promise.all([
      this.searchEmployees(query),
      this.searchLogs(query),
    ])

    const merged = [...employeeResults, ...pageMatches, ...logResults]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        const typePriority: Record<string, number> = { employee: 3, page: 2, log: 1 }
        return (typePriority[b.type] || 0) - (typePriority[a.type] || 0)
      })
      .slice(0, 14)

    const results = merged.map(({ score, ...rest }) => rest)
    
    console.log('[Search] Results found:', results.length)
    return { query, results }
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchService = SearchService.getInstance()
    const { searchParams } = new URL(request.url)
    const q = (searchParams.get("q") || "").trim()
    
    const result = await searchService.performSearch(q)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Search] Global search error:", error)
    return NextResponse.json({ query: "", results: [], error: "Internal error" }, { status: 500 })
  }
}


