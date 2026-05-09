// Run this to generate a password hash for your dashboard login
// Usage: node generate-password-hash.js yourpassword
// Then copy the hash into your schema.sql or run the UPDATE query below

const crypto = require('crypto')
const password = process.argv[2]

if (!password) {
  console.log('Usage: node generate-password-hash.js yourpassword')
  process.exit(1)
}

const hash = crypto.createHash('sha256').update(password).digest('hex')

console.log('\n✅ Password hash generated\n')
console.log('Password:', password)
console.log('Hash:    ', hash)
console.log('\nRun this SQL in Supabase to update your user password:')
console.log(`\nUPDATE users SET password_hash = '${hash}' WHERE tenant_id = '61bb686c-5381-43f6-b65b-07bbd2a1448f';\n`)
