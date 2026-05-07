/**
 * Printable Substitution Form Generator
 * Generates a printer-friendly HTML document for substitution forms
 */

import type { SubstitutionHistory, Employee } from './types/database.types'

interface PrintSubstitutionOptions {
  substitution: SubstitutionHistory
  originalEmployee: Employee
  substituteEmployee: Employee
  scheduleName?: string
  section?: string
  room?: string
}

export function generatePrintableSubstitutionForm(options: PrintSubstitutionOptions): void {
  const { substitution, originalEmployee, substituteEmployee, scheduleName, section, room } = options

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return 'Full Day'
    try {
      const [hours, minutes] = timeStr.split(':')
      const hour = parseInt(hours)
      const ampm = hour >= 12 ? 'PM' : 'AM'
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
      return `${displayHour}:${minutes} ${ampm}`
    } catch {
      return timeStr
    }
  }

  const timeRange = substitution.time_start && substitution.time_end
    ? `${formatTime(substitution.time_start)} - ${formatTime(substitution.time_end)}`
    : 'Full Day'

  const formMarkup = `
    <div class="form-card">
      <div class="header">
        <img class="logo" src="/sti-logo.png" alt="STI College Logo" />
        <div class="title-block">
          <h1>STI College Santa Rosa</h1>
          <p>RFID Attendance Monitoring System (RAMS)</p>
        </div>
      </div>

      <div class="sub-header">
        <div class="form-name">Faculty Substitution Form</div>
        <span class="badge ${substitution.time_start ? 'badge-partial' : 'badge-full'}">
          ${substitution.time_start ? 'Partial Substitution' : 'Full Day Substitution'}
        </span>
      </div>

      <div class="section">
        <div class="section-title">Substitution Details</div>
        <div class="rows">
          <div class="label">Date</div><div class="value">${formatDate(substitution.date)}</div>
          <div class="label">Time</div><div class="value">${timeRange}</div>
          <div class="label">Subject</div><div class="value">${scheduleName || 'N/A'}</div>
          <div class="label">Section</div><div class="value">${section || 'N/A'}</div>
          <div class="label">Room</div><div class="value">${room || 'N/A'}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Original Faculty (Absent/Unavailable)</div>
        <div class="rows">
          <div class="label">Name</div><div class="value">${originalEmployee.full_name}</div>
          <div class="label">School ID</div><div class="value">${originalEmployee.school_id}</div>
          <div class="label">Department</div><div class="value">${originalEmployee.department}</div>
          <div class="label">Reason</div><div class="value">${substitution.unavailable_reason || substitution.reason || 'N/A'}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Substitute Faculty</div>
        <div class="rows">
          <div class="label">Name</div><div class="value">${substituteEmployee.full_name}</div>
          <div class="label">School ID</div><div class="value">${substituteEmployee.school_id}</div>
          <div class="label">Department</div><div class="value">${substituteEmployee.department}</div>
        </div>
      </div>

      ${substitution.notes ? `
      <div class="section">
        <div class="section-title">Additional Notes</div>
        <div class="notes">${substitution.notes}</div>
      </div>
      ` : ''}

      <div class="signatures">
        <div class="sig-item">
          <div class="sig-line">Original Faculty Signature</div>
          <div>${originalEmployee.full_name}</div>
        </div>
        <div class="sig-item">
          <div class="sig-line">Substitute Faculty Signature</div>
          <div>${substituteEmployee.full_name}</div>
        </div>
        <div class="sig-item">
          <div class="sig-line">Department Head</div>
        </div>
        <div class="sig-item">
          <div class="sig-line">Academic Coordinator</div>
        </div>
      </div>

      <div class="footer">
        <span>Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <span>Half-page legal landscape print layout</span>
      </div>
    </div>
  `

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Substitution Form - ${formatDate(substitution.date)}</title>
        <style>
          :root {
            --sti-blue: #0057b8;
            --sti-yellow: #ffc400;
            --ink: #1f2937;
            --line: #d1d5db;
            --panel: #f8fafc;
          }

          @page {
            size: legal landscape;
            margin: 10mm;
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
            color: var(--ink);
            background: #e5e7eb;
            padding: 12px;
          }

          .sheet {
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: flex-start;
          }

          .form-card {
            width: 158mm;
            background: white;
            border: 1px solid #111827;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
            padding: 8mm;
            display: flex;
            flex-direction: column;
            gap: 3.5mm;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .header {
            display: grid;
            grid-template-columns: 44px 1fr;
            gap: 12px;
            align-items: center;
            border-bottom: 2px solid #111827;
            padding-bottom: 4mm;
          }

          .logo {
            width: 44px;
            height: 44px;
            object-fit: contain;
          }

          .title-block h1 {
            font-size: 20px;
            line-height: 1.15;
            text-transform: uppercase;
            letter-spacing: 0.4px;
          }

          .title-block p {
            font-size: 11px;
            margin-top: 2px;
            color: #4b5563;
          }

          .sub-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
          }

          .form-name {
            font-size: 16px;
            font-weight: 700;
            color: #111827;
          }

          .badge {
            font-size: 10px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 999px;
            border: 1px solid #111827;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            white-space: nowrap;
          }

          .badge-full {
            background: var(--sti-yellow);
            color: #111827;
          }

          .badge-partial {
            background: #dbeafe;
            color: #0f172a;
          }

          .section {
            border: 1px solid var(--line);
          }

          .section-title {
            background: var(--panel);
            border-left: 4px solid var(--sti-blue);
            font-size: 12px;
            font-weight: 700;
            padding: 6px 8px;
            text-transform: uppercase;
            letter-spacing: 0.35px;
          }

          .rows {
            padding: 8px;
            display: grid;
            grid-template-columns: 84px 1fr;
            row-gap: 4px;
            column-gap: 8px;
            font-size: 11px;
          }

          .label {
            font-weight: 700;
            color: #374151;
          }

          .value {
            border-bottom: 1px solid #e5e7eb;
            min-height: 18px;
            padding-bottom: 2px;
          }

          .notes {
            padding: 8px;
            font-size: 12px;
            background: #fffef3;
            border-top: 1px solid var(--line);
          }

          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4mm;
            margin-top: 1mm;
          }

          .sig-item {
            font-size: 11px;
            text-align: center;
          }

          .sig-line {
            border-top: 1.5px solid #111827;
            margin-top: 9mm;
            padding-top: 4px;
            font-weight: 700;
          }

          .footer {
            margin-top: 2mm;
            border-top: 1px dashed #9ca3af;
            padding-top: 4px;
            font-size: 10px;
            color: #4b5563;
            display: flex;
            justify-content: space-between;
            gap: 12px;
          }

          .print-button {
            position: fixed;
            top: 16px;
            right: 16px;
            padding: 10px 16px;
            background: var(--sti-blue);
            color: white;
            border: 0;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 700;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            z-index: 2147483647;
          }

          .print-button:hover {
            background: #00448e;
          }

          @media print {
            body {
              background: white;
              padding: 0;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

            .sheet {
              justify-content: flex-start;
            }

            .form-card {
              box-shadow: none;
              width: 158mm;
              padding: 6mm;
              gap: 2.5mm;
              min-height: auto;
              max-height: 175mm;
              overflow: hidden;
            }

            .section-title {
              padding: 4px 7px;
              font-size: 11px;
            }

            .rows {
              padding: 6px;
              row-gap: 3px;
              font-size: 10px;
            }

            .value {
              min-height: 14px;
            }

            .signatures {
              gap: 3mm;
            }

            .sig-item {
              font-size: 9px;
            }

            .sig-line {
              margin-top: 6mm;
              padding-top: 3px;
            }

            .footer {
              margin-top: 1mm;
              padding-top: 3px;
              font-size: 8px;
            }

            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <button class="print-button no-print" onclick="window.print()">Print Form</button>

        <div class="sheet">
          ${formMarkup}
        </div>
      </body>
    </html>
  `

  // Open in new window and print
  const printWindow = window.open('', '_blank', 'width=1400,height=900')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
  }
}
