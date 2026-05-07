"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Calendar, CalendarDayButton } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, CalendarDays, GraduationCap, Filter } from "lucide-react"
import { cn } from "@/lib/utils"
import { getDefaultClassNames } from "react-day-picker"
import { useLanguage } from "@/lib/language-context"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import type { AcademicTerm } from '@/lib/types/database.types'

type AgendaItem = { id: string; text: string; createdAt: number }
type Holiday = { date: string; holiday_name: string; holiday_type: string }

function CustomDayButton({
  className,
  day,
  modifiers,
  agendaItems = [],
  holidays = [],
  t,
  ...props
}: React.ComponentProps<typeof CalendarDayButton> & {
  agendaItems?: AgendaItem[]
  holidays?: Holiday[]
  t: (key: string) => string
}) {
  const defaultClassNames = getDefaultClassNames()
  const ref = React.useRef<HTMLButtonElement>(null)
  
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const hasHoliday = holidays.length > 0
  const isRegularHoliday = holidays.some(h => h.holiday_type === 'holiday')

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 dark:hover:text-accent-foreground flex w-full min-w-(--cell-size) h-[--cell-size] flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md [&>span]:text-xs [&>span]:opacity-70",
        isRegularHoliday && "bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30",
        defaultClassNames.day,
        className
      )}
      {...props}
    >
      <span className={isRegularHoliday ? "font-bold text-red-600 dark:text-red-400" : ""}>
        {day.date.getDate()}
      </span>
      {holidays.length > 0 && (
        <div className="flex flex-col gap-0.5 w-full px-1">
          {holidays.slice(0, 1).map((holiday, index) => (
            <div
              key={index}
              className={cn(
                "text-[8px] leading-tight truncate rounded px-1 py-0.5",
                holiday.holiday_type === 'holiday' 
                  ? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 font-semibold"
                  : "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200"
              )}
              title={holiday.holiday_name}
            >
              🎉 {holiday.holiday_name}
            </div>
          ))}
        </div>
      )}
      {agendaItems.length > 0 && (
        <div className="flex flex-col gap-0.5 w-full px-1">
          {agendaItems.slice(0, holidays.length > 0 ? 1 : 2).map((item, index) => (
            <div
              key={item.id}
              className="text-[8px] leading-tight truncate bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded px-1 py-0.5"
              title={item.text}
            >
              {item.text}
            </div>
          ))}
          {agendaItems.length > (holidays.length > 0 ? 1 : 2) && (
            <div className="text-[8px] text-gray-500 dark:text-gray-400">
              +{agendaItems.length - (holidays.length > 0 ? 1 : 2)} {t('calendar.more')}
            </div>
          )}
        </div>
      )}
    </Button>
  )
}

const formatDateKey = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const parseDateFromQuery = (value: string | null) => {
  if (!value) return new Date()
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) return new Date()
  const dt = new Date(y, m - 1, d)
  if (isNaN(dt.getTime())) return new Date()
  return dt
}

export default function CalendarPage() {
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [selected, setSelected] = useState<Date>(() => parseDateFromQuery(searchParams.get("date")))
  const [noteDraft, setNoteDraft] = useState("")
  const [itemsByDate, setItemsByDate] = useState<Record<string, AgendaItem[]>>({})
  const [holidaysByDate, setHolidaysByDate] = useState<Record<string, Holiday[]>>({})
  const [teachingSchedules, setTeachingSchedules] = useState<null>(null)
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Academic term filtering
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([])
  const [selectedTerm, setSelectedTerm] = useState<string>('all')
  const [allHolidays, setAllHolidays] = useState<Holiday[]>([])

  const selectedKey = useMemo(() => formatDateKey(selected), [selected])
  const items = itemsByDate[selectedKey] ?? []
  const holidays = holidaysByDate[selectedKey] ?? []

  useEffect(() => {
    console.log('Calendar: Syncing URL with selected date', { selectedKey })
    const params = new URLSearchParams(searchParams.toString())
    params.set("date", selectedKey)
    router.replace(`/dashboard/calendar?${params.toString()}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey])

  useEffect(() => {
    console.log('Calendar: Loading data')
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Load agenda from localStorage
      const raw = localStorage.getItem("rams_calendar_agenda")
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object") {
          console.log('Calendar: Loaded agenda items', { itemCount: Object.keys(parsed).length })
          setItemsByDate(parsed)
        }
      }
      
      const rawUser = localStorage.getItem("rams_user")
      if (rawUser) {
        const u = JSON.parse(rawUser)
        if (u?.id) setCurrentUserId(Number(u.id))
      }

      // Fetch academic terms
      const termsRes = await fetch('/api/academic-terms', { cache: 'no-store' })
      const termsBody = termsRes.ok ? await termsRes.json().catch(() => ({ data: [] })) : { data: [] }
      const termsData = Array.isArray(termsBody?.data) ? termsBody.data : []

      if (termsData.length > 0) {
        console.log('Calendar: Loaded academic terms', { count: termsData.length })
        setAcademicTerms(termsData)
        
        // Set active term as default
        const activeTerm = termsData.find((t: AcademicTerm) => t.is_active)
        if (activeTerm) {
          setSelectedTerm(activeTerm.id.toString())
        }
      }

      // Fetch holidays from database
      const holidaysRes = await fetch('/api/holidays', { cache: 'no-store' })
      const holidaysData = holidaysRes.ok ? await holidaysRes.json().catch(() => []) : []

      if (!holidaysRes.ok) {
        console.error('Error fetching holidays: request failed')
      } else if (Array.isArray(holidaysData)) {
        console.log('Calendar: Loaded holidays', { count: holidaysData.length })
        setAllHolidays(holidaysData)
        // Initial filtering will happen in useEffect
      }
    } catch (error) {
      console.error('Error loading calendar data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter holidays based on selected term
  useEffect(() => {
    if (selectedTerm === 'all') {
      // Show all holidays
      const holidaysMap: Record<string, Holiday[]> = {}
      allHolidays.forEach((holiday: Holiday) => {
        if (!holidaysMap[holiday.date]) {
          holidaysMap[holiday.date] = []
        }
        holidaysMap[holiday.date].push(holiday)
      })
      setHolidaysByDate(holidaysMap)
    } else {
      // Filter holidays by term date range
      const term = academicTerms.find(t => t.id.toString() === selectedTerm)
      if (term) {
        const filteredHolidays = allHolidays.filter((holiday: Holiday) => {
          return holiday.date >= term.start_date && holiday.date <= term.end_date
        })
        const holidaysMap: Record<string, Holiday[]> = {}
        filteredHolidays.forEach((holiday: Holiday) => {
          if (!holidaysMap[holiday.date]) {
            holidaysMap[holiday.date] = []
          }
          holidaysMap[holiday.date].push(holiday)
        })
        setHolidaysByDate(holidaysMap)
      }
    }
  }, [selectedTerm, allHolidays, academicTerms])

  useEffect(() => {
    console.log('Calendar: Persisting agenda to localStorage', { itemCount: Object.keys(itemsByDate).length })
    try {
      localStorage.setItem("rams_calendar_agenda", JSON.stringify(itemsByDate))
    } catch {}
  }, [itemsByDate])

  const addNote = () => {
    const text = noteDraft.trim()
    console.log('Calendar: Adding new note', { text, selectedKey })
    if (!text) return
    const item: AgendaItem = { id: crypto.randomUUID(), text, createdAt: Date.now() }
    setItemsByDate((prev) => ({
      ...prev,
      [selectedKey]: [item, ...(prev[selectedKey] ?? [])],
    }))
    setNoteDraft("")
  }

  const deleteNote = (id: string) => {
    console.log('Calendar: Deleting note', { id })
    setItemsByDate((prev) => ({
      ...prev,
      [selectedKey]: (prev[selectedKey] ?? []).filter((it) => it.id !== id),
    }))
  }

  return (
    <div className="space-y-6 animate-fadeInUp">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {selected.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </h1>
          <p className="text-gray-600 dark:text-gray-300">{t('calendar.select_date')}</p>
        </div>
        
        {/* Academic Term Filter */}
        <div className="flex items-center gap-2 min-w-[250px]">
          <Filter className="h-4 w-4 text-gray-500" />
          <Select value={selectedTerm} onValueChange={setSelectedTerm}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Select Term" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Terms</SelectItem>
              {academicTerms.map(term => (
                <SelectItem key={term.id} value={term.id.toString()}>
                  {term.academic_year} - {term.term_name}
                  {term.is_active && ' (Active)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('calendar.pick_date')}</CardTitle>
            <CardDescription>{t('calendar.today_highlighted')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(date) => date && setSelected(date)}
              showOutsideDays
              numberOfMonths={1}
              captionLayout="dropdown"
              className="[--cell-size:3rem]"
              components={{
                DayButton: ({ day, modifiers, ...props }) => {
                  const dayKey = formatDateKey(day.date)
                  const dayAgendaItems = itemsByDate[dayKey] || []
                  const dayHolidays = holidaysByDate[dayKey] || []
                  return (
                    <CustomDayButton
                      day={day}
                      modifiers={modifiers}
                      agendaItems={dayAgendaItems}
                      holidays={dayHolidays}
                      t={t}
                      {...props}
                    />
                  )
                }
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('calendar.agenda_for')} {selectedKey}</span>
              <Button size="sm" variant="outline" onClick={addNote} className="bg-transparent">
                <Plus className="h-4 w-4 mr-1" /> {t('calendar.add')}
              </Button>
            </CardTitle>
            <CardDescription>{t('calendar.add_notes')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Display holidays for selected date */}
              {holidays.length > 0 && (
                <div className="space-y-2 pb-4 border-b">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">🎉 Holidays/Events</h3>
                  {holidays.map((holiday, index) => (
                    <div key={index} className={cn(
                      "p-3 rounded-md border",
                      holiday.holiday_type === 'holiday' 
                        ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                        : "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800"
                    )}>
                      <p className={cn(
                        "text-sm font-semibold",
                        holiday.holiday_type === 'holiday'
                          ? "text-red-900 dark:text-red-100"
                          : "text-yellow-900 dark:text-yellow-100"
                      )}>
                        {holiday.holiday_name}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          holiday.holiday_type === 'holiday'
                            ? "border-red-300 text-red-700 dark:text-red-300"
                            : "border-yellow-300 text-yellow-700 dark:text-yellow-300"
                        )}>
                          {holiday.holiday_type === 'holiday' ? 'Regular Holiday' : 
                           holiday.holiday_type === 'suspended_async' ? 'Suspended (Async)' :
                           holiday.holiday_type === 'suspended_sync' ? 'Suspended (Sync)' :
                           holiday.holiday_type === 'online_class' ? 'Online Classes' : holiday.holiday_type}
                        </Badge>
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder={t('calendar.placeholder')}
                rows={4}
              />
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="text-sm text-gray-500">{t('calendar.no_notes')}</p>
                ) : (
                  items.map((it) => (
                    <div key={it.id} className="flex items-start gap-3 p-3 rounded-md border bg-white dark:bg-gray-900">
                      <div className="flex-1">
                        <p className="text-sm whitespace-pre-wrap">{it.text}</p>
                        <p className="text-xs text-gray-500 mt-1">{new Date(it.createdAt).toLocaleString()}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteNote(it.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


