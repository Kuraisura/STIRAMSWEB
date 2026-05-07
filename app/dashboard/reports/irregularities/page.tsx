"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import { Calendar as CalendarIcon, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const TZ = 'Asia/Manila'

type Row = {
  employee_id: number
  full_name: string
  department: string | null
  total_present: number
  total_late: number
  total_absent: number
  total_undertime: number
  remarks: string
}

const toISODate = (d: Date) => formatInTimeZone(d, TZ, 'yyyy-MM-dd')

export default function AttendanceIrregularitiesPage() {
  const { toast } = useToast()
  const [start, setStart] = useState<Date>(() => {
    const today = new Date()
    const s = new Date(today)
    s.setDate(26) // default cutoff start
    if (today.getDate() < 26) s.setMonth(s.getMonth() - 1)
    return s
  })
  const [end, setEnd] = useState<Date>(() => {
    const today = new Date()
    const e = new Date(today)
    e.setDate(25) // default cutoff end
    if (today.getDate() <= 25) e.setMonth(e.getMonth())
    return e
  })
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState('All')
  const [selected, setSelected] = useState<Row | null>(null)
  const [detail, setDetail] = useState<{ date: string; timeIn: string | null; timeOut: string | null; status: string }[] | null>(null)
  const [detailCounts, setDetailCounts] = useState<{ onTime: number; late: number; undertime: number; absent: number } | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => {
      if (dept !== 'All' && (r.department || '') !== dept) return false
      if (!q) return true
      return (
        r.full_name.toLowerCase().includes(q) ||
        (r.department || '').toLowerCase().includes(q)
      )
    })
  }, [rows, query, dept])

  const depts = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => { if (r.department) set.add(r.department) })
    return ['All', ...Array.from(set).sort()]
  }, [rows])

  const load = async () => {
    try {
      setLoading(true)
      const s = toISODate(start)
      const e = toISODate(end)
      const res = await fetch(`/api/attendance/irregularities?start=${s}&end=${e}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to fetch irregularities')
      setRows(json.items || [])
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load data', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openDetail = async (r: Row) => {
    try {
      setSelected(r)
      setDetail(null)
      setDetailCounts(null)
      const s = toISODate(start)
      const e = toISODate(end)
      const res = await fetch(`/api/attendance/irregularities/detail?employeeId=${r.employee_id}&start=${s}&end=${e}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to fetch details')
      setDetail(json.days || [])
      setDetailCounts(json.summary || null)
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load details', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6 animate-fadeInUp">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Attendance Irregularities</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">Summary of lates, absences, undertime for cutoff period</p>
        </div>
        <div className="flex items-center gap-2"></div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Cutoff</CardTitle>
          <CardDescription>Select date range to review irregularities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full lg:w-48 justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {toISODate(start)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={start} onSelect={(d)=> d && setStart(d)} initialFocus />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full lg:w-48 justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {toISODate(end)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={end} onSelect={(d)=> d && setEnd(d)} initialFocus />
              </PopoverContent>
            </Popover>

            <Button onClick={load} disabled={loading} className="btn-sti-primary">Apply</Button>

            <div className="relative w-full lg:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input className="pl-10" placeholder="Search employee/department" value={query} onChange={(e)=>setQuery(e.target.value)} />
            </div>

            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-full lg:w-56">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                {depts.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>{rows.length === 0 ? 'No records found' : `${filtered.length} of ${rows.length}`}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Total Present</TableHead>
                  <TableHead className="text-right">Total Late</TableHead>
                  <TableHead className="text-right">Total Absent</TableHead>
                  <TableHead className="text-right">Total Undertime</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 dark:text-gray-400">No records found</TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.employee_id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r)}>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell>{r.department || '-'}</TableCell>
                      <TableCell className="text-right">{r.total_present}</TableCell>
                      <TableCell className="text-right">{r.total_late}</TableCell>
                      <TableCell className="text-right">{r.total_absent}</TableCell>
                      <TableCell className="text-right">{r.total_undertime}</TableCell>
                      <TableCell>{r.remarks}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>{selected.full_name}</CardTitle>
            <CardDescription>
              {toISODate(start)} to {toISODate(end)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {detailCounts && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">On-Time</div><div className="text-xl font-semibold">{detailCounts.onTime}</div></div>
                <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">Late</div><div className="text-xl font-semibold">{detailCounts.late}</div></div>
                <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">Undertime</div><div className="text-xl font-semibold">{detailCounts.undertime}</div></div>
                <div className="p-3 border rounded-lg"><div className="text-xs text-muted-foreground">Absent</div><div className="text-xl font-semibold">{detailCounts.absent}</div></div>
              </div>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time In</TableHead>
                    <TableHead>Time Out</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!detail || detail.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-gray-500 dark:text-gray-400">No details</TableCell>
                    </TableRow>
                  ) : detail.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell>{d.date}</TableCell>
                      <TableCell>{d.timeIn || '-'}</TableCell>
                      <TableCell>{d.timeOut || '-'}</TableCell>
                      <TableCell className="capitalize">{d.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


