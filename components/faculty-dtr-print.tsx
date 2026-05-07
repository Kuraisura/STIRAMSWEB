/**
 * Faculty Daily Time Record (DTR) Print Component
 * VERSION 2.0 - SINGLE DTR MODE
 * Displays ONE complete DTR per portrait page (8.5" x 11")
 * Updated: November 2025
 */

'use client'

import React from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import {
  generateDTRRecords,
  formatMinutesToHoursMinutes,
  type DTRData,
  type DayRecord,
  type DTRSummary
} from '@/lib/faculty-dtr-generator'

interface FacultyDTRPrintProps {
  dtrData: DTRData
  generatedBy: string
  onClose?: () => void
}

interface DTRDocumentProps {
  facultyName: string
  department: string
  schoolYear: string
  semester: string
  cutoffPeriod: string
  records: DayRecord[]
  summary: DTRSummary
  generatedBy: string
  isFirstHalf?: boolean
}

const DTRDocument: React.FC<DTRDocumentProps> = ({
  facultyName,
  department,
  schoolYear,
  semester,
  cutoffPeriod,
  records,
  summary,
  generatedBy,
  isFirstHalf = true
}) => {
  return (
    <div className="dtr-document">
      {/* Header */}
      <div className="dtr-header">
        <div className="dtr-logo">
          <Image
            src="/sti-logo.png"
            alt="STI Logo"
            width={60}
            height={60}
            className="logo-print"
          />
        </div>
        <div className="dtr-title-block">
          <h1 className="school-name">STI COLLEGE SANTA ROSA</h1>
          <p className="school-address">
            Ruby Street, Santa Rosa Commercial Complex, Barangay Balibago, City of Santa Rosa
          </p>
          <h2 className="document-title">FACULTY DAILY TIME RECORD</h2>
        </div>
      </div>

      {/* Employee Information */}
      <div className="dtr-info-grid">
        <div className="info-row-three">
          <div className="info-item">
            <span className="info-label">FACULTY NAME:</span>
            <span className="info-value">{facultyName}</span>
          </div>
          <div className="info-item info-right">
            <span className="info-label">SCHOOL YEAR:</span>
            <span className="info-value">{schoolYear}</span>
          </div>
        </div>
        <div className="info-row-three">
          <div className="info-item">
            <span className="info-label">DEPARTMENT:</span>
            <span className="info-value">{department}</span>
          </div>
          <div className="info-item info-right">
            <span className="info-label">SEMESTER:</span>
            <span className="info-value">{semester}</span>
          </div>
        </div>
        <div className="info-row-full">
          <div className="info-item">
            <span className="info-label">CUT-OFF PERIOD:</span>
            <span className="info-value">{cutoffPeriod}</span>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <table className="dtr-table">
        <thead>
          <tr>
            <th className="col-day">DAY</th>
            <th className="col-date">DATE</th>
            <th className="col-time">TIME IN</th>
            <th className="col-time">TIME OUT</th>
            <th className="col-signature">SIGNATURE</th>
            <th className="col-remarks">REMARKS</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={index}>
              <td className="col-day">{record.day}</td>
              <td className="col-date">{record.date}</td>
              <td className="col-time">{record.timeIn}</td>
              <td className="col-time">{record.timeOut}</td>
              <td className="signature-cell"></td>
              <td className="col-remarks">{record.remarks}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div className="dtr-summary">
        <div className="summary-item">
          <span className="summary-label">Number of Lates:</span>
          <span className="summary-value">
            {summary.lateCount} day{summary.lateCount !== 1 ? 's' : ''} - {formatMinutesToHoursMinutes(summary.lateTotalMinutes)}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Number of Undertimes:</span>
          <span className="summary-value">
            {summary.undertimeCount} day{summary.undertimeCount !== 1 ? 's' : ''} - {formatMinutesToHoursMinutes(summary.undertimeTotalMinutes)}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Number of Absences:</span>
          <span className="summary-value">
            {summary.absenceCount} day{summary.absenceCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Remarks Section */}
      <div className="dtr-remarks-section">
        <div className="remarks-label">Remarks:</div>
        <div className="remarks-box">
          {/* Empty box for manual remarks */}
        </div>
      </div>

      {/* Footer Signatures */}
      <div className="dtr-footer">
        <div className="signature-block">
          <div className="signature-line"></div>
          <div className="signature-title">Checked by:</div>
          <div className="signature-role">Program Coordinator</div>
        </div>
        <div className="signature-block">
          <div className="signature-line"></div>
          <div className="signature-title">Approved by:</div>
          <div className="signature-role">Academic Head</div>
        </div>
      </div>
      
      {/* Generated By */}
      <div className="dtr-generated">
        <span className="generated-label">Generated by:</span>
        <span className="generated-value">{generatedBy}</span>
      </div>

      <style jsx>{`
        .dtr-document {
          width: 100%;
          min-height: 100%;
          padding: 0.4in 0.5in;
          background: white;
          font-family: 'Arial', sans-serif;
          font-size: 9pt;
          page-break-after: avoid;
          box-sizing: border-box;
        }

        .dtr-header {
          display: flex;
          align-items: flex-start;
          margin-bottom: 12px;
          border-bottom: 2px solid #000;
          padding-bottom: 8px;
        }

        .dtr-logo {
          margin-right: 12px;
          flex-shrink: 0;
        }

        .dtr-title-block {
          flex: 1;
          text-align: center;
        }

        .school-name {
          font-size: 14pt;
          font-weight: bold;
          margin: 0;
          color: #003366;
        }

        .school-address {
          font-size: 8pt;
          margin: 2px 0 6px 0;
          color: #333;
        }

        .document-title {
          font-size: 11pt;
          font-weight: bold;
          margin: 0;
          text-transform: uppercase;
          color: #000;
        }

        .dtr-info-grid {
          margin-bottom: 10px;
        }

        .info-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 5px;
        }

        .info-row-full {
          margin-bottom: 5px;
        }

        .info-item {
          display: flex;
          font-size: 8pt;
          align-items: baseline;
        }

        .info-label {
          font-weight: bold;
          min-width: 120px;
          text-transform: uppercase;
          font-size: 7.5pt;
        }

        .info-value {
          flex: 1;
          border-bottom: 1px solid #333;
          padding-left: 6px;
          padding-bottom: 2px;
        }

        .dtr-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 10px;
          font-size: 8pt;
        }

        .dtr-table th,
        .dtr-table td {
          border: 1px solid #000;
          padding: 3px 4px;
          text-align: center;
        }

        .dtr-table th {
          background-color: #f0f0f0;
          font-weight: bold;
          font-size: 7.5pt;
          text-transform: uppercase;
        }

        .dtr-table td {
          height: 20px;
          font-size: 7.5pt;
        }

        .col-day {
          width: 8%;
        }

        .col-date {
          width: 18%;
        }

        .col-time {
          width: 16%;
        }

        .signature-cell {
          width: 18%;
        }

        .col-remarks {
          width: 28%;
        }

        .dtr-summary {
          margin-bottom: 10px;
          padding: 6px;
          background-color: #f9f9f9;
          border: 1px solid #ddd;
          font-size: 8pt;
        }

        .summary-item {
          display: flex;
          margin-bottom: 3px;
        }

        .summary-item:last-child {
          margin-bottom: 0;
        }

        .summary-label {
          font-weight: bold;
          min-width: 140px;
        }

        .summary-value {
          color: #d32f2f;
          font-weight: bold;
        }

        .dtr-remarks-section {
          margin-bottom: 12px;
        }

        .remarks-label {
          font-weight: bold;
          margin-bottom: 3px;
          font-size: 8pt;
        }

        .remarks-box {
          border: 1px solid #000;
          min-height: 35px;
          padding: 4px;
        }

        .dtr-footer {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 25px;
          margin-top: 15px;
          margin-bottom: 8px;
        }

        .signature-block {
          text-align: center;
        }

        .signature-line {
          border-top: 1px solid #000;
          margin-bottom: 3px;
          margin-top: 25px;
        }

        .signature-title {
          font-size: 8pt;
          font-weight: bold;
        }

        .signature-role {
          font-size: 7pt;
          font-style: italic;
          color: #666;
        }

        .dtr-generated {
          text-align: left;
          font-size: 7pt;
          padding-top: 4px;
          border-top: 1px solid #ddd;
        }

        .generated-label {
          font-weight: bold;
        }

        .generated-value {
          margin-left: 5px;
          color: #333;
        }

        .info-row-three {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 5px;
        }

        .info-right {
          text-align: left;
        }

        @media print {
          .dtr-document {
            page-break-inside: avoid;
            margin: 0;
            padding: 0.3in 0.4in;
          }

          .logo-print {
            width: 45px !important;
            height: 45px !important;
          }
        }
      `}</style>
    </div>
  )
}

export const FacultyDTRPrint: React.FC<FacultyDTRPrintProps> = ({ dtrData, generatedBy, onClose }) => {
  const { records, summary } = generateDTRRecords(dtrData)
  
  // DEBUG: Log to confirm only ONE component is rendering
  console.log('[FacultyDTRPrint] Rendering DTR with records count:', records.length)
  console.log('[FacultyDTRPrint] This should only log ONCE per render')
  
  // Format cutoff period dates
  const formatCutoffDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return format(date, 'MMMM dd, yyyy')
  }
  
  const cutoffPeriod = `${formatCutoffDate(dtrData.cutoffStart)} - ${formatCutoffDate(dtrData.cutoffEnd)}`
  
  const handlePrint = () => {
    window.print()
  }
  
  return (
    <>
      {/* DEBUG INFO - Will be hidden in print */}
      <div className="debug-info no-print" style={{
        position: 'fixed',
        top: '60px',
        right: '20px',
        background: '#fff3cd',
        border: '2px solid #856404',
        padding: '10px',
        borderRadius: '5px',
        zIndex: 9999,
        fontSize: '12px',
        maxWidth: '300px'
      }}>
        <strong>DEBUG INFO:</strong><br/>
        ✅ Rendering ONE DTR only<br/>
        📊 Total Records: {records.length}<br/>
        👤 Faculty: {dtrData.facultyName}<br/>
        📅 Period: {cutoffPeriod}
      </div>
      
      {/* Print Controls */}
      <div className="print-controls no-print">
        <button onClick={handlePrint} className="btn-print">
          Print DTR
        </button>
        {onClose && (
          <button onClick={onClose} className="btn-close">
            Close
          </button>
        )}
      </div>
      
      {/* Print Content - ONE complete DTR per page */}
      <div className="print-container">
        <div className="dtr-page single-dtr">
          <DTRDocument
            facultyName={dtrData.facultyName}
            department={dtrData.department}
            schoolYear={dtrData.schoolYear}
            semester={dtrData.semester}
            cutoffPeriod={cutoffPeriod}
            records={records}
            summary={summary}
            generatedBy={generatedBy}
            isFirstHalf={true}
          />
        </div>
      </div>

      <style jsx>{`
        .print-controls {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          display: flex;
          gap: 10px;
        }

        .btn-print,
        .btn-close {
          padding: 10px 20px;
          font-size: 14px;
          font-weight: bold;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-print {
          background-color: #1976d2;
          color: white;
        }

        .btn-print:hover {
          background-color: #1565c0;
        }

        .btn-close {
          background-color: #757575;
          color: white;
        }

        .btn-close:hover {
          background-color: #616161;
        }

        .print-container {
          width: 100%;
          max-width: 8.5in;
          background-color: #f5f5f5;
          padding: 20px;
          display: block !important;
          margin: 0 auto;
          min-height: 100vh;
        }

        .dtr-page {
          width: 100%;
          max-width: 8.5in;
          min-height: 11in;
          margin: 0 auto;
          background: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          page-break-after: always;
          position: relative;
        }
        
        .dtr-page.single-dtr::before {
          content: "SINGLE DTR MODE";
          position: absolute;
          top: 5px;
          right: 5px;
          background: #28a745;
          color: white;
          padding: 2px 8px;
          font-size: 10px;
          border-radius: 3px;
          z-index: 1000;
        }

        @media print {
          .no-print {
            display: none !important;
          }

          .print-container {
            padding: 0;
            background: none;
            display: block;
          }

          .dtr-page {
            width: 100%;
            height: 100%;
            margin: 0;
            box-shadow: none;
            page-break-after: always;
          }

          .dtr-page:last-child {
            page-break-after: avoid;
          }

          @page {
            size: letter portrait;
            margin: 0.5in;
          }
        }
      `}</style>
    </>
  )
}

export default FacultyDTRPrint
