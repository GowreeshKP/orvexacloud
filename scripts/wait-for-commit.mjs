/**
 * Poll GET /api/health until it reports the expected git SHA.
 * Usage: node scripts/wait-for-commit.mjs
 *   API_BASE=https://api.orvexacloud.in EXPECTED_SHA=$GITHUB_SHA
 */
const API = (process.env.API_BASE || 'http://localhost:5000').replace(/\/$/, '')
const EXPECTED = process.env.EXPECTED_SHA || process.env.GITHUB_SHA || ''
const ATTEMPTS = Number(process.env.HEALTH_ATTEMPTS || 60)
const DELAY_MS = Number(process.env.HEALTH_DELAY_MS || 10000)

if (!EXPECTED) {
  console.error('EXPECTED_SHA or GITHUB_SHA is required')
  process.exit(2)
}

async function once() {
  const res = await fetch(`${API}/api/health`, { headers: { 'Cache-Control': 'no-cache' } })
  const cache = res.headers.get('cache-control') || ''
  const body = await res.json().catch(() => ({}))
  return { status: res.status, cache, ok: body.ok, commit: body.commit }
}

for (let i = 1; i <= ATTEMPTS; i++) {
  try {
    const hit = await once()
    console.log(`[${i}/${ATTEMPTS}] HTTP ${hit.status} ok=${hit.ok} commit=${hit.commit} cache=${hit.cache}`)
    if (hit.status === 200 && hit.ok === true && hit.commit === EXPECTED) {
      if (!/no-store/i.test(hit.cache)) {
        console.warn('health is live but Cache-Control is not no-store')
      }
      process.exit(0)
    }
  } catch (err) {
    console.log(`[${i}/${ATTEMPTS}] ${err.message}`)
  }
  await new Promise((r) => setTimeout(r, DELAY_MS))
}

console.error(`Timed out waiting for ${API}/api/health to report commit ${EXPECTED}`)
process.exit(1)
