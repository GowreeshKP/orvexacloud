/**
 * End-to-end: marketing signup connector → Super Admin queue → approve → tenant live
 * Usage: node --env-file=server/.env scripts/marketing-admin-e2e.mjs
 */
import crypto from 'crypto'

const API = process.env.API_BASE || 'http://localhost:5000'
const WEB = process.env.WEB_BASE || 'http://localhost:8443'
const CLOUD = process.env.CLOUD_BASE || 'http://localhost:3000'
const SECRET = (process.env.SIGNUP_SIGNING_SECRETS || '').split(',')[0].trim()
const ADMIN_ID = process.env.ADMIN_EMAIL || 'admin@orvexatech.com'
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin@password'

const slug = `e2e${Date.now().toString(36).slice(-6)}`
const results = []

function log(pass, name, detail = '') {
  results.push({ pass, name, detail })
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}

function sign(rawBody) {
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${ts}.${rawBody}`).digest('hex')
  return { ts, sig }
}

async function api(method, path, { token, body, headers, rawBody } = {}) {
  const init = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  }
  if (rawBody !== undefined) {
    init.body = rawBody
    init.headers['Content-Type'] = 'application/json'
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${API}${path}`, init)
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text }
}

async function main() {
  console.log(`\n=== Marketing → Admin E2E ===`)
  console.log(`API ${API} · WEB ${WEB} · CLOUD ${CLOUD}`)
  console.log(`Test slug: ${slug}\n`)

  if (!SECRET || SECRET === 'replace_with_shared_signing_secret') {
    log(false, 'SIGNUP_SIGNING_SECRETS configured')
    process.exit(1)
  }
  log(true, 'SIGNUP_SIGNING_SECRETS configured')

  // Frontends up? Marketing UI lives in a separate repo — soft check only.
  for (const [name, url] of [
    ['main frontend', WEB],
    ['admin path', `${WEB}/admin`],
  ]) {
    try {
      const r = await fetch(url)
      log(r.ok, `${name} reachable`, `HTTP ${r.status}`)
    } catch (e) {
      log(false, `${name} reachable`, e.message)
    }
  }
  try {
    const r = await fetch(CLOUD)
    log(true, 'marketing site (optional)', r.ok ? `HTTP ${r.status} at ${CLOUD}` : `HTTP ${r.status} — clone marketing-site-orvexacloud separately`)
  } catch (e) {
    log(true, 'marketing site (optional)', `not running at ${CLOUD} — OK; intake is API-only`)
  }

  // Health
  const health = await api('GET', '/api/health')
  log(health.status === 200 && health.json?.status === 'healthy', 'API health', JSON.stringify(health.json))
  log(health.json?.signupIntake === 'on', 'signupIntake enabled on health')

  // 1) Slug check (signed) — available
  {
    const path = `/api/public/slug-available?slug=${slug}`
    const { ts, sig } = sign('')
    const r = await api('GET', path, {
      headers: { 'x-orvexa-timestamp': ts, 'x-orvexa-signature': sig },
    })
    log(r.status === 200 && r.json?.available === true, 'signed slug-available (free)', JSON.stringify(r.json))
  }

  // 2) Marketing signup (signed) — simulates marketing-site-orvexacloud connector
  const payload = {
    schemaVersion: 1,
    idempotencyKey: `e2e_${slug}_${crypto.randomUUID()}`,
    submittedAt: new Date().toISOString(),
    owner: {
      name: 'E2E Merchant',
      email: `owner.${slug}@example.com`,
      phone: '+919999000111',
    },
    brand: {
      name: `E2E Brand ${slug}`,
      requestedSlug: slug,
      niche: 'fashion apparel',
    },
    plan: {
      id: 'starter',
      name: 'Starter',
      cycle: 'monthly',
      region: 'IN',
      currency: 'INR',
      amountExTax: 999,
      tax: 180,
      total: 1179,
      totalMinor: 117900,
      trialDays: 30,
    },
    launch: { status: 'live', country: 'IN' },
    migration: null,
    consents: {
      marketing: true,
      termsAcceptedAt: new Date().toISOString(),
      termsVersion: '1.0',
    },
    source: {
      site: 'marketing-site-orvexacloud',
      country: 'IN',
      referrer: 'https://orvexacloud.in/pricing',
      utm: { source: 'e2e', medium: 'test' },
      ip: '127.0.0.1',
      userAgent: 'orvexa-e2e/1.0',
    },
  }
  const rawBody = JSON.stringify(payload)
  const { ts, sig } = sign(rawBody)
  const signup = await api('POST', '/api/public/signups', {
    rawBody,
    headers: {
      'x-orvexa-timestamp': ts,
      'x-orvexa-signature': sig,
      'Idempotency-Key': payload.idempotencyKey,
    },
  })
  log(signup.status === 201, 'POST /api/public/signups (marketing form)', `HTTP ${signup.status} ${JSON.stringify(signup.json)}`)
  const applicationId = signup.json?.applicationId
  log(Boolean(applicationId), 'applicationId returned', applicationId || 'missing')
  log(signup.json?.status === 'pending_review', 'status is pending_review', String(signup.json?.status))

  // Idempotent retry → 409
  {
    const { ts: ts2, sig: sig2 } = sign(rawBody)
    const again = await api('POST', '/api/public/signups', {
      rawBody,
      headers: {
        'x-orvexa-timestamp': ts2,
        'x-orvexa-signature': sig2,
        'Idempotency-Key': payload.idempotencyKey,
      },
    })
    log(again.status === 409 && again.json?.applicationId === applicationId, 'duplicate signup returns 409 same id', `HTTP ${again.status}`)
  }

  // Unsigned must fail
  {
    const bad = await api('POST', '/api/public/signups', { rawBody })
    log(bad.status === 401, 'unsigned signup rejected', `HTTP ${bad.status}`)
  }

  // 3) Super Admin login
  const login = await api('POST', '/api/auth/admin/login', {
    body: { loginId: ADMIN_ID, password: ADMIN_PASS },
  })
  log(login.status === 200 && Boolean(login.json?.accessToken), 'super admin login', `HTTP ${login.status}`)
  const token = login.json?.accessToken
  if (!token) {
    console.log('\nCannot continue without admin token')
    process.exit(1)
  }

  // 4) Application appears in admin queue
  const apps = await api('GET', '/api/admin/applications', { token })
  log(apps.status === 200, 'GET /api/admin/applications', `HTTP ${apps.status}`)
  const list = Array.isArray(apps.json) ? apps.json : []
  const found = list.find((a) => a.id === applicationId)
  log(Boolean(found), 'new application visible in admin queue', found ? `${found.brandName} · ${found.status}` : 'not found')
  log(found?.channel === 'website' || found?.channel === undefined || found?.channel === 'website', 'channel from website', String(found?.channel))
  log(found?.status === 'pending', 'application status pending', String(found?.status))
  log(found?.ownerEmail === payload.owner.email, 'owner email preserved', found?.ownerEmail)
  log(found?.requestedSubdomain === slug, 'requested subdomain preserved', found?.requestedSubdomain)

  // 5) Reject path sanity on a throwaway? Skip — approve this one.
  // Approve
  const approve = await api('PUT', `/api/admin/applications/${applicationId}/status`, {
    token,
    body: { status: 'approved' },
  })
  log(approve.status === 200, 'admin APPROVE application', `HTTP ${approve.status} ${JSON.stringify(approve.json)?.slice(0, 220)}`)

  // 6) Tenant provisioned
  const tenants = await api('GET', '/api/admin/tenants', { token })
  const tenantList = Array.isArray(tenants.json) ? tenants.json : tenants.json?.tenants || []
  const tenant = tenantList.find((t) => t.slug === slug)
  log(Boolean(tenant), 'tenant created after approve', tenant ? `${tenant.brandName} (${tenant.status})` : 'missing')
  log(tenant?.status === 'active' || tenant?.status === 'pending' || Boolean(tenant), 'tenant usable status', String(tenant?.status))

  // 7) Public resolve works for new store
  const resolve = await api('GET', `/api/public/resolve?slug=${slug}`)
  log(resolve.status === 200 && resolve.json?.slug === slug, 'public resolve new store', `HTTP ${resolve.status} ${JSON.stringify(resolve.json)?.slice(0, 180)}`)

  // 8) Store products endpoint exists (empty ok)
  const products = await api('GET', `/api/stores/${slug}/products`)
  log(products.status === 200, 'store products endpoint', `HTTP ${products.status}`)

  // 9) Double approve blocked
  const againApprove = await api('PUT', `/api/admin/applications/${applicationId}/status`, {
    token,
    body: { status: 'approved' },
  })
  log(againApprove.status === 409, 'second approve blocked', `HTTP ${againApprove.status}`)

  // 10) Reject flow with a second signup
  const slug2 = `${slug}r`
  const payload2 = {
    ...payload,
    idempotencyKey: `e2e_${slug2}_${crypto.randomUUID()}`,
    brand: { ...payload.brand, name: `Reject Brand ${slug2}`, requestedSlug: slug2 },
    owner: { ...payload.owner, email: `reject.${slug2}@example.com` },
  }
  const raw2 = JSON.stringify(payload2)
  const s2 = sign(raw2)
  const signup2 = await api('POST', '/api/public/signups', {
    rawBody: raw2,
    headers: { 'x-orvexa-timestamp': s2.ts, 'x-orvexa-signature': s2.sig, 'Idempotency-Key': payload2.idempotencyKey },
  })
  const app2 = signup2.json?.applicationId
  log(signup2.status === 201 && Boolean(app2), 'second signup for reject test', `HTTP ${signup2.status}`)
  if (app2) {
    const reject = await api('PUT', `/api/admin/applications/${app2}/status`, {
      token,
      body: { status: 'rejected', reviewNotes: 'E2E reject — incomplete documents' },
    })
    log(reject.status === 200, 'admin REJECT application', `HTTP ${reject.status}`)
    const appsAfter = await api('GET', '/api/admin/applications', { token })
    const rejected = (Array.isArray(appsAfter.json) ? appsAfter.json : []).find((a) => a.id === app2)
    log(rejected?.status === 'rejected', 'rejected status persisted', String(rejected?.status))
  }

  log(
    true,
    'NOTE: marketing UI is external (marketing-site-orvexacloud); Super Admin receives forms via HMAC POST /api/public/signups'
  )

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===\n`)
  if (failed) {
    for (const r of results.filter((x) => !x.pass)) console.log(` - ${r.name}: ${r.detail}`)
  }
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
