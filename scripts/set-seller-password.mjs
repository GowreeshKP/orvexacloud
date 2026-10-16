/**
 * Super-admin sets a store owner's password on a live API.
 * Does not seed. Does not print the new password.
 *
 *   API_BASE=https://orvexa-api-nskw.onrender.com \
 *   ADMIN_EMAIL=you@orvexatech.com \
 *   ADMIN_PASSWORD='...' \
 *   STORE_SLUG=lunar \
 *   SELLER_PASSWORD='...' \
 *   node scripts/set-seller-password.mjs
 */
const API = (process.env.API_BASE || '').replace(/\/$/, '')
const email = process.env.ADMIN_EMAIL || ''
const adminPassword = process.env.ADMIN_PASSWORD || ''
const slug = (process.env.STORE_SLUG || '').trim().toLowerCase()
const sellerPassword = process.env.SELLER_PASSWORD || ''

if (!API || !email || adminPassword.length < 12 || !slug || sellerPassword.length < 8) {
  console.error('API_BASE, ADMIN_EMAIL, ADMIN_PASSWORD (>=12), STORE_SLUG and SELLER_PASSWORD (>=8) are required')
  process.exit(2)
}

const login = await fetch(`${API}/api/auth/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ loginId: email, password: adminPassword }),
})
const session = await login.json().catch(() => ({}))
if (!login.ok || !session.accessToken) {
  console.error(login.status, session.error || 'admin login failed')
  process.exit(1)
}

const set = await fetch(`${API}/api/auth/seller/set-password`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.accessToken}`,
  },
  body: JSON.stringify({ slug, newPassword: sellerPassword }),
})
const body = await set.json().catch(() => ({}))
console.log(set.status, body)
if (!set.ok) process.exit(1)
