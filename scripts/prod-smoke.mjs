/**
 * Post-deploy smoke: live URL checks only. No demo logins, no seed data.
 * Usage: API_BASE=https://api.orvexacloud.in WEB_BASE=https://admin.orvexacloud.in node scripts/prod-smoke.mjs
 */
const API = (process.env.API_BASE || 'http://localhost:5000').replace(/\/$/, '')
const WEB = (process.env.WEB_BASE || '').replace(/\/$/, '')
const EXPECTED = process.env.EXPECTED_SHA || process.env.GITHUB_SHA || ''

const results = []

function record(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}

async function hit(url, init) {
  const res = await fetch(url, init)
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status, json, text, cache: res.headers.get('cache-control') || '' }
}

const health = await hit(`${API}/api/health`)
record('GET /api/health is 200', health.status === 200, `HTTP ${health.status}`)
record('health.ok is true', health.json?.ok === true, JSON.stringify(health.json))
record('health Cache-Control is no-store', /no-store/i.test(health.cache), health.cache || '(missing)')
if (EXPECTED) {
  record(`health.commit is ${EXPECTED}`, health.json?.commit === EXPECTED, String(health.json?.commit || ''))
}

const admin = await hit(`${API}/api/admin/overview`)
record('GET /api/admin/overview without auth is 401', admin.status === 401 || admin.status === 403, `HTTP ${admin.status}`)

const tenants = await hit(`${API}/api/admin/tenants`)
record('GET /api/admin/tenants without auth is 401', tenants.status === 401 || tenants.status === 403, `HTTP ${tenants.status}`)

if (WEB) {
  const page = await hit(WEB + '/')
  record(`GET ${WEB}/ is 200`, page.status === 200, `HTTP ${page.status}`)
}

const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
