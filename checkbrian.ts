import { dbQuery } from './lib/db.ts';

async function check() {
  const r = await dbQuery("SELECT employee_id, full_name, staff_type, schedule_time_in, schedule_time_out FROM employees WHERE full_name ILIKE '%Brian%'");
  console.log('Emps:', r);
  for (const emp of r) {
    const ts = await dbQuery("SELECT schedule_id, day_of_week, time_start, time_end, status FROM teaching_schedules WHERE employee_id = $1", [emp.employee_id]);
    console.log(`Teaching for ${emp.employee_id}:`, ts);
    const es = await dbQuery("SELECT exam_schedule_id, exam_date, day_of_week, time_start, time_end, status FROM exam_schedules WHERE employee_id = $1", [emp.employee_id]);
    console.log(`Exam for ${emp.employee_id}:`, es);
  }
}
check();
