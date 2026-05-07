/**
 * Script to generate bcrypt hash for Evelyn Barron's password
 * Password: admin123
 * 
 * Run: node scripts/hash-evelyn-password.js
 */

const bcrypt = require('bcryptjs')

async function generateHash() {
  console.log('🔐 Generating bcrypt hash for password: admin123')
  
  // Generate hash with 10 salt rounds
  const password = 'admin123'
  const hash = await bcrypt.hash(password, 10)
  
  console.log('✅ Generated hash:', hash)
  console.log('')
  console.log('📝 Use this hash in the migration file or insert manually:')
  console.log('')
  console.log('INSERT INTO admin_users (email, password_hash, full_name, role, is_active)')
  console.log('VALUES (')
  console.log("  'evelyn.barron@santarosa.sti.edu',")
  console.log(`  '${hash}',`)
  console.log("  'Evelyn Barron',")
  console.log("  'non_teaching_admin',")
  console.log("  true")
  console.log(');')
  console.log('')
  console.log('✨ Done!')
}

generateHash()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
