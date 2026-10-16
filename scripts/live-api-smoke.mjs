/**
 * Live smoke test against running local servers.
 * Usage: node scripts/live-api-smoke.mjs
 */
const API = process.env.API_BASE || 'http://localhost:5000'
const WEB = process.env.WEB_BASE || 'http://localhost:8443'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@orvexatech.com'
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin@password'
const SELLER_LOGIN = process.env.SELLER_LOGIN || 'lunar'
const SELLER_PASS = process.env.SELLER_PASS || 'lunar@password'

const results = []

async function req(method, path, { token, body, headers } = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`
  const init = {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  }
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
  const started = Date.now()
  try {
    const res = await fetch(url, init)
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: res.status, ok: res.ok, json, text, ms: Date.now() - started }
  } catch (err) {
    return { status: 0, ok: false, error: err.message, ms: Date.now() - started }
  }
}

function record(group, name, pass, detail) {
  results.push({ group, name, pass, detail })
  const mark = pass ? 'PASS' : 'FAIL'
  console.log(`[${mark}] ${group} · ${name}${detail ? ` — ${detail}` : ''}`)
}

function expectStatus(group, name, res, allowed) {
  const ok = allowed.includes(res.status)
  record(
    group,
    name,
    ok,
    res.error
      ? `error: ${res.error}`
      : `HTTP ${res.status} (${res.ms}ms)${!ok && res.json?.error ? ` · ${res.json.error}` : ''}`
  )
  return ok
}

async function main() {
  console.log(`\n=== Orvexa live smoke · API ${API} · WEB ${WEB} ===\n`)

  // ── Frontend ──────────────────────────────────────────────────────────────
  {
    const home = await req('GET', WEB + '/')
    expectStatus('frontend', 'GET /', home, [200])
    const admin = await req('GET', WEB + '/admin')
    expectStatus('frontend', 'GET /admin', admin, [200])
    const htmlOk = typeof home.text === 'string' && home.text.includes('root')
    record('frontend', 'HTML shell has #root', htmlOk, htmlOk ? 'ok' : 'missing root')
  }

  // ── Health / public ───────────────────────────────────────────────────────
  const health = await req('GET', '/api/health')
  expectStatus('public', 'GET /api/health', health, [200])
  if (health.json) {
    record('public', 'health.ok', health.json.ok === true, JSON.stringify(health.json))
    record('public', 'health.commit', typeof health.json.commit === 'string' && health.json.commit.length > 0, String(health.json.commit || ''))
  }

  const resolve = await req('GET', '/api/public/resolve?slug=lunar')
  expectStatus('public', 'GET /api/public/resolve?slug=lunar', resolve, [200, 404])

  const slugUnsigned = await req('GET', '/api/public/slug-available?slug=lunar')
  expectStatus('public', 'GET /api/public/slug-available (unsigned → reject)', slugUnsigned, [401, 403, 503])

  const signupUnsigned = await req('POST', '/api/public/signups', {
    body: { brandName: 'x' },
  })
  expectStatus('public', 'POST /api/public/signups (unsigned → reject)', signupUnsigned, [401, 403, 400, 503])

  // Signed slug check when SIGNUP_SIGNING_SECRETS is set
  const signupSecret = (process.env.SIGNUP_SIGNING_SECRETS || '').split(',')[0]?.trim()
  if (signupSecret && signupSecret !== 'replace_with_shared_signing_secret') {
    const { createHmac } = await import('crypto')
    const pathAndQuery = '/api/public/slug-available?slug=lunar'
    const ts = Math.floor(Date.now() / 1000).toString()
    // Match whatever the server expects; try common HMAC header patterns used by this codebase.
    const body = ''
    const payload = `${ts}.${body}`
    const sig = 'sha256=' + createHmac('sha256', signupSecret).update(payload).digest('hex')
    const signed = await req('GET', pathAndQuery, {
      headers: {
        'x-orvexa-timestamp': ts,
        'x-orvexa-signature': sig,
      },
    })
    // Accept 200 (ok) or 401 if header names differ — still report truthfully
    record(
      'public',
      'GET /api/public/slug-available (signed)',
      signed.status === 200,
      `HTTP ${signed.status}${signed.json ? ' · ' + JSON.stringify(signed.json) : ''}`
    )
  } else {
    record('public', 'signed slug-available skipped', true, 'SIGNUP_SIGNING_SECRETS still placeholder')
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const adminLogin = await req('POST', '/api/auth/admin/login', {
    body: { loginId: ADMIN_EMAIL, password: ADMIN_PASS },
  })
  expectStatus('auth', 'POST /api/auth/admin/login', adminLogin, [200])
  const adminToken = adminLogin.json?.accessToken || adminLogin.json?.session?.accessToken || adminLogin.json?.token
  record('auth', 'admin access token present', Boolean(adminToken), adminToken ? 'received' : JSON.stringify(adminLogin.json)?.slice(0, 180))

  const badAdmin = await req('POST', '/api/auth/admin/login', {
    body: { loginId: ADMIN_EMAIL, password: 'wrong-password-xxx' },
  })
  expectStatus('auth', 'POST /api/auth/admin/login (bad password)', badAdmin, [401, 403])

  const sellerLogin = await req('POST', '/api/auth/seller/login', {
    body: { loginId: SELLER_LOGIN, password: SELLER_PASS },
  })
  expectStatus('auth', 'POST /api/auth/seller/login (lunar)', sellerLogin, [200])
  const sellerToken =
    sellerLogin.json?.accessToken || sellerLogin.json?.session?.accessToken || sellerLogin.json?.token
  record('auth', 'seller access token present', Boolean(sellerToken), sellerToken ? 'received' : JSON.stringify(sellerLogin.json)?.slice(0, 180))

  const commonLogin = await req('POST', '/api/auth/login', {
    body: { loginId: ADMIN_EMAIL, password: ADMIN_PASS },
  })
  expectStatus('auth', 'POST /api/auth/login (unified)', commonLogin, [200, 401])

  const bootstrapBlocked = await req('POST', '/api/auth/admin/bootstrap', {
    body: {
      name: 'X',
      email: 'x@test.com',
      password: 'StrongPass123!',
      bootstrapKey: 'orvexa_bootstrap_2026',
    },
  })
  expectStatus('auth', 'POST /api/auth/admin/bootstrap (already seeded)', bootstrapBlocked, [403, 409])

  // ── Admin (master) ────────────────────────────────────────────────────────
  if (adminToken) {
    const overview = await req('GET', '/api/admin/overview', { token: adminToken })
    expectStatus('admin', 'GET /api/admin/overview', overview, [200])

    const tenants = await req('GET', '/api/admin/tenants', { token: adminToken })
    expectStatus('admin', 'GET /api/admin/tenants', tenants, [200])
    const tenantCount = Array.isArray(tenants.json) ? tenants.json.length : tenants.json?.tenants?.length
    record('admin', 'tenants seeded', Number(tenantCount) >= 1, `count=${tenantCount}`)

    const apps = await req('GET', '/api/admin/applications', { token: adminToken })
    expectStatus('admin', 'GET /api/admin/applications', apps, [200])

    const audit = await req('GET', '/api/admin/audit-logs', { token: adminToken })
    expectStatus('admin', 'GET /api/admin/audit-logs', audit, [200])

    const env = await req('GET', '/api/admin/tenants/lunar/env', { token: adminToken })
    expectStatus('admin', 'GET /api/admin/tenants/lunar/env', env, [200])

    const creds = await req('GET', '/api/admin/tenants/lunar/credentials', { token: adminToken })
    expectStatus('admin', 'GET /api/admin/tenants/lunar/credentials', creds, [200])

    const staff = await req('GET', '/api/admin/tenants/lunar/staff', { token: adminToken })
    expectStatus('admin', 'GET /api/admin/tenants/lunar/staff', staff, [200])
  } else {
    record('admin', 'skipped (no admin token)', false, 'admin login failed')
  }

  const adminNoAuth = await req('GET', '/api/admin/overview')
  expectStatus('admin', 'GET /api/admin/overview (no auth)', adminNoAuth, [401, 403])

  // ── Store (public + seller) ───────────────────────────────────────────────
  const products = await req('GET', '/api/stores/lunar/products')
  expectStatus('store', 'GET /api/stores/lunar/products', products, [200])

  const theme = await req('GET', '/api/stores/lunar/theme')
  expectStatus('store', 'GET /api/stores/lunar/theme', theme, [200])

  const reviews = await req('GET', '/api/stores/lunar/reviews')
  expectStatus('store', 'GET /api/stores/lunar/reviews', reviews, [200])

  const missingStore = await req('GET', '/api/stores/does-not-exist-xyz/products')
  expectStatus('store', 'GET /api/stores/missing/products', missingStore, [404])

  if (sellerToken) {
    const orders = await req('GET', '/api/stores/lunar/orders', { token: sellerToken })
    expectStatus('store', 'GET /api/stores/lunar/orders', orders, [200])

    const dbStatus = await req('GET', '/api/stores/lunar/database-status', { token: sellerToken })
    expectStatus('store', 'GET /api/stores/lunar/database-status', dbStatus, [200])

    const analytics = await req('GET', '/api/stores/lunar/analytics', { token: sellerToken })
    expectStatus('store', 'GET /api/stores/lunar/analytics', analytics, [200])

    const domain = await req('GET', '/api/stores/lunar/domain', { token: sellerToken })
    expectStatus('store', 'GET /api/stores/lunar/domain', domain, [200])

    const storeStaff = await req('GET', '/api/stores/lunar/staff', { token: sellerToken })
    expectStatus('store', 'GET /api/stores/lunar/staff', storeStaff, [200])

    // Isolation: lunar seller must not read silkhaus private data
    const cross = await req('GET', '/api/stores/silkhaus/orders', { token: sellerToken })
    expectStatus('store', 'GET /api/stores/silkhaus/orders (cross-tenant deny)', cross, [403, 401])
  } else {
    record('store', 'seller-protected routes skipped', false, 'seller login failed')
  }

  // Create a product then clean up if possible
  if (sellerToken) {
    const create = await req('POST', '/api/stores/lunar/products', {
      token: sellerToken,
      body: {
        name: 'Smoke Test Tee',
        category: 'Test',
        price: 999,
        description: 'temporary smoke product',
      },
    })
    expectStatus('store', 'POST /api/stores/lunar/products', create, [200, 201])
    const productId = create.json?.id || create.json?._id || create.json?.product?.id
    if (productId) {
      const one = await req('GET', `/api/stores/lunar/products/${productId}`)
      expectStatus('store', `GET /api/stores/lunar/products/${productId}`, one, [200])
      const del = await req('DELETE', `/api/stores/lunar/products/${productId}`, { token: sellerToken })
      expectStatus('store', `DELETE /api/stores/lunar/products/${productId}`, del, [200, 204])
    } else {
      record('store', 'product CRUD cleanup', false, `no id in create response: ${JSON.stringify(create.json)?.slice(0, 200)}`)
    }
  }

  // Track / checkout paths (validation only)
  const track = await req('GET', '/api/stores/lunar/orders/track?orderId=does-not-exist')
  expectStatus('store', 'GET /api/stores/lunar/orders/track', track, [200, 404, 400])

  const emptyOrder = await req('POST', '/api/stores/lunar/orders', { body: { items: [] } })
  expectStatus('store', 'POST /api/stores/lunar/orders (empty → reject)', emptyOrder, [400, 422])

  // ── Supabase (Orvexa Cloud master) ────────────────────────────────────────
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://xkiutrwppsnvvogmxtby.supabase.co'
  const sbKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  const configured = Boolean(sbKey) && sbKey !== 'your_supabase_anon_key_here' && sbKey.length > 20
  record('supabase', 'anon key configured in env', configured, configured ? 'yes' : 'PLACEHOLDER — not configured')

  if (configured) {
    const sb = await req('GET', `${sbUrl}/rest/v1/tenants?select=count`, {
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        Prefer: 'count=exact',
      },
    })
    expectStatus('supabase', 'REST GET /tenants', sb, [200, 206])
  } else {
    // Probe host reachability without auth
    const probe = await req('GET', sbUrl + '/rest/v1/')
    record(
      'supabase',
      'project host reachable',
      probe.status > 0,
      probe.error || `HTTP ${probe.status} (keys still required for real queries)`
    )
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed, ${results.length} total ===\n`)
  if (failed) {
    console.log('Failures:')
    for (const r of results.filter((x) => !x.pass)) {
      console.log(` - [${r.group}] ${r.name}: ${r.detail}`)
    }
  }
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
