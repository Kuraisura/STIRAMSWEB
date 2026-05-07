/**
 * Script to generate bcrypt hash for Evelyn Barron's password
 * Password: admin123
 * 
 * Run: npx tsx scripts/hash-evelyn-password.ts
 */

import bcrypt from 'bcryptjs'
import { dbQuery } from '../lib/db'

async function hashAndInsertEvelynBarron() {
  console.log('🔐 Generating bcrypt hash for password: admin123')
  
  // Generate hash with 10 salt rounds
  const password = 'admin123'
  const hash = await bcrypt.hash(password, 10)
  
  console.log('✅ Generated hash:', hash)
  console.log('')
  
  // Insert or update the user in local PostgreSQL
  console.log('📝 Inserting/Updating Evelyn Barron in admin_users table...')

  const data = await dbQuery<any>(
    `INSERT INTO admin_users (
       email,
       password_hash,
       full_name,
       role,
       is_active,
       created_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7
     )
     ON CONFLICT (email)
     DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name,
       role = EXCLUDED.role,
       is_active = EXCLUDED.is_active,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      'evelyn.barron@santarosa.sti.edu',
      hash,
      'Evelyn Barron',
      'non_teaching_admin',
      true,
      new Date().toISOString(),
      new Date().toISOString(),
    ]
  )
  
  console.log('✅ Successfully created/updated Evelyn Barron')
  console.log('📧 Email: evelyn.barron@santarosa.sti.edu')
  console.log('🔑 Password: admin123')
  console.log('👤 Role: non_teaching_admin (Finance - Non-Teaching Staff)')
  console.log('')
  console.log('User data:', data)
  
  // Log to log_trail
  if (data && data[0]) {
    try {
      await dbQuery(
        `INSERT INTO log_trail (
           user_id,
           user_email,
           user_name,
           action_type,
           table_name,
           record_id,
           new_values,
           metadata,
           created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9
         )`,
        [
          0,
          'system@rams',
          'System Script',
          'CREATE',
          'admin_users',
          data[0].id,
          JSON.stringify({
            email: 'evelyn.barron@santarosa.sti.edu',
            full_name: 'Evelyn Barron',
            role: 'non_teaching_admin',
          }),
          JSON.stringify({
            script: 'hash-evelyn-password.ts',
            description: 'Added Non-Teaching Admin for Finance department',
            access_level: 'Non-Teaching staff only',
          }),
          new Date().toISOString(),
        ]
      )
      console.log('✅ Action logged to log_trail')
    } catch (logError: any) {
      console.warn('⚠️  Warning: Could not log to log_trail:', logError.message)
    }
  }
}

hashAndInsertEvelynBarron()
  .then(() => {
    console.log('✨ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
