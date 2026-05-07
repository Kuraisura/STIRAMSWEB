const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres.npxcftysxnyzstszwypg:N4aB9x!M8m@P2eV@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres' });
async function check() {
  const r = await pool.query("SELECT employee_id, staff_type, schedule_time_in, schedule_time_out FROM employees WHERE full_name ILIKE '%Brian%'");
  const emps = r.rows;
  console.log('Emps:', emps);
  for (const emp of emps) {
    const ts = await pool.query("SELECT schedule_id, day_of_week, time_start, time_end, status FROM teaching_schedules WHERE employee_id = $1", [emp.employee_id]);
    console.log(`Teaching for ${emp.employee_id}:`, ts.rows);
    const es = await pool.query("SELECT exam_schedule_id, exam_date, day_of_week, time_start, time_end, status FROM exam_schedules WHERE employee_id = $1", [emp.employee_id]);
    console.log(`Exam for ${emp.employee_id}:`, es.rows);
  }
  process.exit(0);
}
check();
