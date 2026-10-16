/**
 * One-time production super-admin bootstrap. Refuses unless NODE_ENV-style confirm is set.
 * After success, delete ADMIN_BOOTSTRAP_KEY from Render immediately.
 *
 *   API_BASE=https://api.orvexacloud.in \
 *   ADMIN_BOOTSTRAP_KEY=... \
 *   ADMIN_EMAIL=you@orvexatech.com \
 *   ADMIN_PASSWORD='...' \
 *   CONFIRM_PRODUCTION_BOOTSTRAP=yes \
 *   node scripts/bootstrap-admin.mjs
 */
const API = (process.env.API_BASE || '').replace(/\/$/, '')
const key = process.env.ADMIN_BOOTSTRAP_KEY || ''
const email = process.env.ADMIN_EMAIL || ''
const password = process.env.ADMIN_PASSWORD || ''
const name = process.env.ADMIN_NAME || 'Super Admin'

if (process.env.CONFIRM_PRODUCTION_BOOTSTRAP !== 'yes') {
  console.error('Refusing: set CONFIRM_PRODUCTION_BOOTSTRAP=yes')
  process.exit(2)
}
if (!API || !key || key.length < 16 || !email || password.length < 12) {
  console.error('API_BASE, ADMIN_BOOTSTRAP_KEY (≥16), ADMIN_EMAIL and ADMIN_PASSWORD (≥12) are required')
  process.exit(2)
}

const res = await fetch(`${API}/api/auth/admin/bootstrap`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, email, password, bootstrapKey: key }),
})
const body = await res.json().catch(() => ({}))
console.log(res.status, body)
if (res.status !== 201) process.exit(1)

console.log('\nDelete ADMIN_BOOTSTRAP_KEY from the Render environment now. Do not commit it. Do not leave it set.')
