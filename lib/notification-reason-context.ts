type DeriveReasonParams = {
  meta?: Record<string, any>
  notes?: string | null
  attendanceStatus?: string | null
  isLate?: boolean | null
  isEarlyOut?: boolean | null
  logType?: string | null
}

export type NotificationReasonContext = {
  source: string | null
  reason: string | null
}

export function deriveNotificationReasonContext(params: DeriveReasonParams): NotificationReasonContext {
  const {
    meta = {},
    notes,
    attendanceStatus,
    isLate,
    isEarlyOut,
    logType,
  } = params

  const metaSource = String(meta?.reason_source || meta?.absence_source || '').trim()
  const metaReason = String(meta?.reason_detail || meta?.absence_reason || '').trim()
  const metaScheduleContext = String(meta?.schedule_context || '').trim()
  if (metaSource || metaReason) {
    const fallbackReason =
      metaSource === 'approved_substitution'
          ? `All scheduled windows were covered by approved substitution(s)${metaScheduleContext ? ` for ${metaScheduleContext}` : ''}.`
          : null

    return {
      source: metaSource || null,
      reason: metaReason || fallbackReason,
    }
  }

  const status = String(attendanceStatus || '').trim().toLowerCase()
  const noteText = String(notes || '').trim()

  if (/^leave approved:/i.test(noteText)) {
    const reason = noteText.replace(/^leave approved:\s*/i, '').trim()
    return {
      source: 'approved_leave',
      reason: reason || 'Approved leave',
    }
  }

  if (/auto-marked absent:.*substitution/i.test(noteText)) {
    return {
      source: 'approved_substitution',
      reason: 'All class/exam schedules were covered by approved substitution(s).',
    }
  }

  if (status === 'absent') {
    return {
      source: 'attendance_review',
      reason: noteText || 'Employee was marked absent and this record needs review.',
    }
  }

  if (Boolean(isLate) || status === 'late') {
    return {
      source: 'late_arrival',
      reason: 'Employee tapped in after the expected schedule start time.',
    }
  }

  if (Boolean(isEarlyOut) || status === 'undertime') {
    return {
      source: 'undertime',
      reason: 'Employee tapped out before the expected schedule end time.',
    }
  }

  if (status === 'admin_time') {
    return {
      source: 'admin_time',
      reason: 'No teaching load matched for this moment, so attendance was logged as admin time.',
    }
  }

  if (status === 'on_time' || status === 'present') {
    const normalizedType = String(logType || '').toUpperCase()
    if (normalizedType === 'OUT') {
      return {
        source: 'rfid_tap_out',
        reason: 'Regular RFID time-out was recorded.',
      }
    }

    return {
      source: 'rfid_tap_in',
      reason: 'Regular RFID time-in was recorded.',
    }
  }

  if (noteText) {
    return {
      source: 'system_note',
      reason: noteText,
    }
  }

  return {
    source: null,
    reason: null,
  }
}
