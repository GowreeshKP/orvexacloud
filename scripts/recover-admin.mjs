/**
 * Reset the existing live super-admin password using ADMIN_BOOTSTRAP_KEY.
 * Use when bootstrap already ran (HTTP 409) and the password was lost.
 *
 *   API_BASE=https://orvexa-api-nskw.onrender.com \
 *   ADMIN_BOOTSTRAP_KEY=... \
 *   ADMIN_PASSWORD='...' \
 *   CONFIRM_PRODUCTION_BOOTSTRAP=yes \
 *   node scripts/recover-admin.mjs
 */
const API = (process.env.API_BASE || '').replace(/\/$/, '')
const key = process.env.ADMIN_BOOTSTRAP_KEY || ''
const password = process.env.ADMIN_PASSWORD || ''
const email = process.env.ADMIN_EMAIL || ''

if (process.env.CONFIRM_PRODUCTION_BOOTSTRAP !== 'yes') {
  console.error('Refusing: set CONFIRM_PRODUCTION_BOOTSTRAP=yes')
  process.exit(2)
}
if (!API || !key || key.length < 16 || password.length < 12) {
  console.error('API_BASE, ADMIN_BOOTSTRAP_KEY (>=16) and ADMIN_PASSWORD (>=12) are required')
  process.exit(2)
}

const res = await fetch(`${API}/api/auth/admin/recover`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ bootstrapKey: key, password, ...(email ? { email } : {}) }),
})
const body = await res.json().catch(() => ({}))
console.log(res.status, body)
if (!res.ok) process.exit(1)

console.log('\nDelete ADMIN_BOOTSTRAP_KEY from the Render environment now. Do not commit it.')
