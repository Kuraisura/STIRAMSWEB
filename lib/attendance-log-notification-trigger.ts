import { dbQuery } from '@/lib/db'

let ensuredForProcess = false

export async function ensureAttendanceLogNotificationTrigger() {
  if (ensuredForProcess) return

  await dbQuery(`
    CREATE OR REPLACE FUNCTION public.notify_admins_on_attendance_log_change()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_employee_name text;
      v_time_display text;
      v_log_date date;
      v_day_of_week integer;
      v_title text;
      v_message text;
      v_status_text text := '';
      v_notification_type text := 'attendance';
      v_action text;
      v_absence_source text := NULL;
      v_absence_reason text := NULL;
      v_has_exam_schedule boolean := FALSE;
      v_has_class_schedule boolean := FALSE;
      v_has_shift_schedule boolean := FALSE;
      v_has_approved_substitution boolean := FALSE;
      v_schedule_context text := NULL;
      v_admin record;
    BEGIN
      SELECT full_name
        INTO v_employee_name
        FROM employees
       WHERE employee_id = NEW.employee_id
       LIMIT 1;

      v_employee_name := COALESCE(v_employee_name, 'Employee #' || NEW.employee_id::text);
      v_time_display := to_char((COALESCE(NEW.log_time, NOW()) AT TIME ZONE 'Asia/Manila'), 'HH12:MI AM');
      v_log_date := COALESCE(NEW.date, (COALESCE(NEW.log_time, NOW()) AT TIME ZONE 'Asia/Manila')::date);
      v_day_of_week := EXTRACT(ISODOW FROM v_log_date)::int;

      BEGIN
        SELECT EXISTS (
          SELECT 1
          FROM exam_schedules es
          WHERE es.employee_id = NEW.employee_id
            AND (
              es.exam_date = v_log_date
              OR es.day_of_week = v_day_of_week
            )
        )
        INTO v_has_exam_schedule;
      EXCEPTION
        WHEN undefined_table OR undefined_column THEN
          v_has_exam_schedule := FALSE;
      END;

      BEGIN
        SELECT EXISTS (
          SELECT 1
          FROM teaching_schedules ts
          WHERE ts.employee_id = NEW.employee_id
            AND ts.day_of_week = v_day_of_week
        )
        INTO v_has_class_schedule;
      EXCEPTION
        WHEN undefined_table OR undefined_column THEN
          v_has_class_schedule := FALSE;
      END;

      BEGIN
        SELECT EXISTS (
          SELECT 1
          FROM employees e
          WHERE e.employee_id = NEW.employee_id
            AND COALESCE(e.staff_type, '') ILIKE 'Non-Teaching'
            AND e.schedule_time_in IS NOT NULL
            AND e.schedule_time_out IS NOT NULL
        )
        INTO v_has_shift_schedule;
      EXCEPTION
        WHEN undefined_column THEN
          v_has_shift_schedule := FALSE;
      END;

      BEGIN
        SELECT EXISTS (
          SELECT 1
          FROM class_substitutions_v2 cs
          WHERE cs.original_employee_id = NEW.employee_id
            AND cs.substitution_date = v_log_date
            AND COALESCE(cs.status, 'pending') = 'approved'
        )
        INTO v_has_approved_substitution;
      EXCEPTION
        WHEN undefined_table OR undefined_column THEN
          v_has_approved_substitution := FALSE;
      END;

      IF v_has_exam_schedule THEN
        v_schedule_context := 'Exam Schedule/Proctoring Schedule';
      ELSIF v_has_class_schedule THEN
        v_schedule_context := 'Class Schedule';
      ELSIF v_has_shift_schedule THEN
        v_schedule_context := 'Non-Teaching Work Schedule';
      END IF;

      IF COALESCE(NEW.is_admin_time, FALSE) OR lower(COALESCE(NEW.attendance_status::text, '')) LIKE '%admin%' THEN
        v_status_text := ' (Admin Time)';
      ELSIF lower(COALESCE(NEW.attendance_status::text, '')) = 'absent' THEN
        v_status_text := ' (Absent)';
        v_notification_type := 'verification';
      ELSIF COALESCE(NEW.is_late, FALSE) OR lower(COALESCE(NEW.attendance_status::text, '')) = 'late' THEN
        v_status_text := ' (Late)';
        v_notification_type := 'late_arrival';
      ELSIF COALESCE(NEW.is_early_out, FALSE) OR lower(COALESCE(NEW.attendance_status::text, '')) = 'undertime' THEN
        v_status_text := ' (Undertime)';
      ELSE
        v_status_text := ' (On-Time)';
      END IF;

      IF upper(COALESCE(NEW.log_type::text, 'IN')) = 'IN' THEN
        v_action := 'in';
      ELSE
        v_action := 'out';
      END IF;

      IF lower(COALESCE(NEW.attendance_status::text, '')) = 'absent' THEN
        IF COALESCE(NEW.notes, '') ILIKE 'Leave approved:%' THEN
          v_absence_source := 'approved_leave';
          v_absence_reason := NULLIF(BTRIM(REGEXP_REPLACE(COALESCE(NEW.notes, ''), '^Leave approved:\s*', '', 'i')), '');
          v_title := 'Employee Marked Absent (Leave)';
          v_message := v_employee_name || ' has been marked absent because of an approved leave at ' || v_time_display ||
            CASE WHEN v_absence_reason IS NOT NULL THEN ': ' || v_absence_reason ELSE '.' END ||
            CASE WHEN v_schedule_context IS NOT NULL THEN ' Basis: ' || v_schedule_context || '.' ELSE '' END;
        ELSIF COALESCE(NEW.notes, '') ILIKE 'Auto-marked absent:%substitution%' THEN
          IF v_has_approved_substitution THEN
            v_absence_source := 'approved_substitution';
            v_absence_reason := 'All scheduled windows were covered by approved substitution(s).' ||
              CASE WHEN v_schedule_context IS NOT NULL THEN ' Basis: ' || v_schedule_context || '.' ELSE '' END;
            v_title := 'Employee Marked Absent (Substitution)';
            v_message := v_employee_name || ' has been auto-marked absent because all scheduled windows were substituted at ' || v_time_display || '.' ||
              CASE WHEN v_schedule_context IS NOT NULL THEN ' Basis: ' || v_schedule_context || '.' ELSE '' END;
          ELSE
            v_absence_source := 'attendance_review';
            v_absence_reason := NULLIF(BTRIM(COALESCE(NEW.notes, '')), '');
            v_title := 'Attendance Review Needed';
            v_message := v_employee_name || ' has an attendance record marked absent at ' || v_time_display ||
              CASE WHEN v_absence_reason IS NOT NULL THEN ': ' || v_absence_reason ELSE '.' END ||
              ' Detected substitution note without approved substitution record.' ||
              CASE WHEN v_schedule_context IS NOT NULL THEN ' Basis: ' || v_schedule_context || '.' ELSE '' END;
          END IF;
        ELSE
          v_absence_source := 'attendance_review';
          v_absence_reason := NULLIF(BTRIM(COALESCE(NEW.notes, '')), '');
          v_title := 'Attendance Review Needed';
          v_message := v_employee_name || ' has an attendance record marked absent at ' || v_time_display ||
            CASE WHEN v_absence_reason IS NOT NULL THEN ': ' || v_absence_reason ELSE '.' END ||
            CASE WHEN v_schedule_context IS NOT NULL THEN ' Basis: ' || v_schedule_context || '.' ELSE '' END;
        END IF;
      ELSIF TG_OP = 'INSERT' THEN
        v_title := CASE WHEN v_action = 'in' THEN 'Employee IN' ELSE 'Employee OUT' END;
        v_message := v_employee_name || ' has tapped ' || v_action || ' at ' || v_time_display || v_status_text;
      ELSE
        v_title := 'Attendance Updated';
        v_message := v_employee_name || ' attendance log was updated at ' || v_time_display || v_status_text;
      END IF;

      FOR v_admin IN
        SELECT id
          FROM admin_users
         WHERE is_active = TRUE
      LOOP
        BEGIN
          INSERT INTO notifications (
            recipient_id,
            recipient_type,
            notification_type,
            type,
            title,
            message,
            meta,
            source,
            channel,
            status,
            created_at
          )
          VALUES (
            v_admin.id,
            'admin',
            v_notification_type,
            v_notification_type,
            v_title,
            v_message,
            jsonb_build_object(
              'log_id', NEW.log_id,
              'employee_id', NEW.employee_id,
              'log_type', NEW.log_type,
              'attendance_status', NEW.attendance_status,
              'is_late', NEW.is_late,
              'is_early_out', NEW.is_early_out,
              'notes', NEW.notes,
              'log_date', v_log_date,
              'schedule_context', v_schedule_context,
              'has_exam_schedule', v_has_exam_schedule,
              'has_class_schedule', v_has_class_schedule,
              'has_shift_schedule', v_has_shift_schedule,
              'has_approved_substitution', v_has_approved_substitution,
              'absence_source', v_absence_source,
              'absence_reason', v_absence_reason
            ),
            'rfid',
            'system',
            'pending',
            NOW()
          );
        EXCEPTION
          WHEN undefined_column THEN
            BEGIN
              INSERT INTO notifications (recipient_id, recipient_type, title, message)
              VALUES (v_admin.id, 'admin', v_title, v_message);
            EXCEPTION
              WHEN undefined_column THEN
                INSERT INTO notifications (title, message)
                VALUES (v_title, v_message);
            END;
          WHEN unique_violation THEN
            NULL;
        END;
      END LOOP;

      RETURN NEW;
    END;
    $$;
  `)

  await dbQuery(`
    DROP TRIGGER IF EXISTS trg_notify_admins_on_attendance_logs ON attendance_logs;

    CREATE TRIGGER trg_notify_admins_on_attendance_logs
    AFTER INSERT OR UPDATE OF log_type, log_time, attendance_status, is_late, is_early_out
    ON attendance_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_admins_on_attendance_log_change();
  `)

  ensuredForProcess = true
}
