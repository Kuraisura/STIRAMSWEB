import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Time format preference (12h/24h) - lightweight client-safe helpers
export type TimeFormat = '12h' | '24h'
export const getPreferredTimeFormat = (): TimeFormat => {
  try {
    const v = localStorage.getItem('rams_time_format')
    if (v === '24h' || v === '12h') return v
  } catch {}
  return '12h'
}
export const setPreferredTimeFormat = (fmt: TimeFormat) => {
  try { localStorage.setItem('rams_time_format', fmt) } catch {}
}
export const formatTimeByPreference = (dateOrIso: string | Date, fmt?: TimeFormat) => {
  const format: TimeFormat = fmt || getPreferredTimeFormat()
  try {
    const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso
    if (isNaN(d.getTime())) return ''
    if (format === '24h') {
      const hh = String(d.getHours()).padStart(2,'0')
      const mm = String(d.getMinutes()).padStart(2,'0')
      return `${hh}:${mm}`
    }
    let h = d.getHours()
    const ap = h >= 12 ? 'PM' : 'AM'
    h = (h % 12) || 12
    const hh = String(h)
    const mm = String(d.getMinutes()).padStart(2,'0')
    return `${hh}:${mm}${ap}`
  } catch {
    return ''
  }
}

// Report generation: Faculty Timesheet to Excel (simplified layout)
// Note: Use dynamic import so client bundles that import `cn` don't pull in exceljs

export async function generateFacultyTimesheetExcel(options: {
  facultyName: string
  schoolYear: string
  semester: string
  periodStart: string // YYYY-MM-DD
  periodEnd: string // YYYY-MM-DD
  rows: Array<{
    subjectCode: string
    section: string
    day: string
    time: string
    room: string
    totalHours?: number
  }>
}) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Timesheet')

  ws.columns = [
    { header: 'SUBJECT CODE', key: 'subjectCode', width: 16 },
    { header: 'SECTION', key: 'section', width: 14 },
    { header: 'DAY', key: 'day', width: 8 },
    { header: 'TIME', key: 'time', width: 16 },
    { header: 'ROOM', key: 'room', width: 12 },
    { header: 'HOURS', key: 'totalHours', width: 10 },
  ]

  ws.mergeCells('A1:F1')
  ws.getCell('A1').value = 'FACULTY TIMESHEET'
  ws.getCell('A1').font = { size: 14, bold: true }
  ws.getCell('A1').alignment = { horizontal: 'center' }

  ws.mergeCells('A2:F2')
  ws.getCell('A2').value = `${options.facultyName} • SY ${options.schoolYear} • ${options.semester}`
  ws.getCell('A2').alignment = { horizontal: 'center' }

  ws.mergeCells('A3:F3')
  ws.getCell('A3').value = `Period Covered: ${options.periodStart} to ${options.periodEnd}`
  ws.getCell('A3').alignment = { horizontal: 'center' }

  ws.addRow([])

  options.rows.forEach((r) => ws.addRow(r))

  // Totals row
  const total = options.rows.reduce((sum, r) => sum + (r.totalHours || 0), 0)
  const tr = ws.addRow({ subjectCode: 'Total Teaching Hours', totalHours: total })
  tr.font = { bold: true }

  // Style table header
  const headerRow = ws.getRow(5)
  headerRow.font = { bold: true }
  headerRow.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
  })
  for (let i = 6; i <= ws.rowCount; i++) {
    const r = ws.getRow(i)
    r.eachCell((c) => (c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }))
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// Daily Time Record (DTR) Excel - styled similar to the sample image
export async function generateDailyTimeRecordExcel(options: {
  employeeName: string
  department?: string
  schoolId?: string
  periodStart: string // YYYY-MM-DD
  periodEnd: string   // YYYY-MM-DD
  workHoursLabel?: string // e.g., "07:00 AM - 05:00 PM"
  rows: Array<{
    date: string // YYYY-MM-DD
    day: string
    timeIn: string | null // HH:MM:SS
    timeOut: string | null // HH:MM:SS
    status: string // on-time | late | undertime | late/on-time | late/undertime | on-time/undertime | absent
  }>
  timeFormat?: TimeFormat
}) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Daily Time Record')

  // Base styling helpers
  const setAllBorders = (cell: any) => {
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
  }
  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEFF6FF' } }
  const accentFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFDE68A' } }

  // Page title
  ws.mergeCells('A1:F1')
  ws.getCell('A1').value = 'DAILY TIME RECORD'
  ws.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF111827' } }
  ws.getCell('A1').alignment = { horizontal: 'center' }

  // Meta block
  ws.mergeCells('A2:F2')
  ws.getCell('A2').value = `${options.employeeName} • ${options.department || ''} • ID ${options.schoolId || ''}`
  ws.getCell('A2').font = { name: 'Arial', size: 11, color: { argb: 'FF111827' } }
  ws.getCell('A2').alignment = { horizontal: 'center' }

  ws.mergeCells('A3:F3')
  ws.getCell('A3').value = `Period Covered: ${options.periodStart} — ${options.periodEnd}`
  ws.getCell('A3').font = { name: 'Arial', size: 11, color: { argb: 'FF111827' } }
  ws.getCell('A3').alignment = { horizontal: 'center' }

  ws.addRow([])

  // Columns
  ws.columns = [
    { header: 'DATE', key: 'date', width: 12 },
    { header: 'DAY', key: 'day', width: 12 },
    { header: 'TIME IN', key: 'timeIn', width: 14 },
    { header: 'TIME OUT', key: 'timeOut', width: 14 },
    { header: 'STATUS', key: 'status', width: 22 },
    { header: 'REMARKS', key: 'remarks', width: 24 },
  ]

  // Header styling
  const hdr = ws.getRow(5)
  hdr.font = { name: 'Arial', bold: true, color: { argb: 'FF111827' } }
  hdr.alignment = { horizontal: 'center' }
  hdr.eachCell((c) => { c.fill = headerFill; setAllBorders(c) })

  // Data rows
  const fmt = options.timeFormat || '12h'
  const toFmt = (t?: string | null) => {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    if (fmt === '24h') return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
    const ap = h >= 12 ? 'PM' : 'AM'
    const hh = (h % 12) || 12
    return `${String(hh)}:${String(m).padStart(2,'0')} ${ap}`
  }

  const colorForStatus = (s: string) => {
    const x = s.toLowerCase()
    if (x.includes('late')) return 'FFF59E0B' // amber-600
    if (x.includes('undertime')) return 'FF7C3AED' // violet-600
    if (x.includes('absent')) return 'FFDC2626' // red-600
    return 'FF059669' // green-600 on-time
  }

  options.rows.forEach((r) => {
    const row = ws.addRow({
      date: r.date,
      day: r.day,
      timeIn: toFmt(r.timeIn),
      timeOut: toFmt(r.timeOut),
      status: r.status
        .replace(/\bon-time\b/gi, 'On-Time')
        .replace(/\blate\b/gi, 'Late')
        .replace(/\bundertime\b/gi, 'Undertime')
        .replace(/\//g, '/'), // Ensure proper formatting of compound statuses like 'late/undertime', 'late/on-time', 'on-time/undertime'
      remarks: '',
    })
    row.eachCell((c, col) => {
      setAllBorders(c)
      if (col === 5) {
        c.font = { name: 'Arial', bold: true, color: { argb: colorForStatus(String(c.value||'')) } }
      } else {
        c.font = { name: 'Arial', color: { argb: 'FF111827' } }
      }
    })
  })

  // Footer summary
  ws.addRow([])
  const footer = ws.addRow({ status: 'Notes:', remarks: `Work Hours ${options.workHoursLabel || ''}` })
  footer.getCell(5).fill = accentFill
  footer.getCell(6).fill = accentFill
  footer.eachCell((c) => setAllBorders(c))

  // Improve readability
  ws.views = [{ state: 'frozen', ySplit: 5 }]

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
