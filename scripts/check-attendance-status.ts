import { dbQuery } from '../lib/db'

async function checkAttendanceStatus() {
  console.log('🔍 Checking distinct attendance_status values...\n')
  
  // Get distinct status values
  const statusData = await dbQuery<{ attendance_status: string }>(
    `SELECT attendance_status
     FROM attendance_logs
     WHERE attendance_status IS NOT NULL
     LIMIT 1000`
  )
  
  const uniqueStatuses = [...new Set(statusData.map(d => d.attendance_status))]
  console.log('✅ Distinct attendance_status values found:')
  uniqueStatuses.forEach(status => console.log(`   - "${status}"`))
  
  console.log('\n📊 Status counts:')
  const counts: Record<string, number> = {}
  statusData.forEach(d => {
    counts[d.attendance_status] = (counts[d.attendance_status] || 0) + 1
  })
  Object.entries(counts).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`)
  })
  
  // Try to query the constraint definition
  console.log('\n🔧 Attempting to query constraint definition...')
  try {
    const constraintData = await dbQuery<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = $1
       LIMIT 1`,
      ['attendance_logs_status_valid']
    )

    if (!constraintData[0]) {
      console.log('❌ Could not query constraint (constraint not found)')
    } else {
      console.log('✅ Constraint definition:', constraintData[0].definition)
    }
  } catch (constraintError: any) {
    console.log('❌ Could not query constraint (might need direct SQL access)')
    console.log('Error:', constraintError.message)
  }
}

checkAttendanceStatus().catch(console.error)
