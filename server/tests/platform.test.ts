// Integration tests: tenant isolation, authentication, RBAC, checkout integrity, injection
// and the merchant onboarding flow, run against a real (throwaway) MongoDB.
//   cd server && MONGOD_BINARY=/path/to/mongod npm test

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { PASSWORDS, api, login, mailLog, order, signedSignup, sleep, startTestServer, stopTestServer } from './harness.js'
import { tenantDatabaseName } from '../src/lib/tenant-db.js'

let admin: { accessToken: string; refreshToken: string }
let alpha: { accessToken: string; refreshToken: string }
let bravo: { accessToken: string; refreshToken: string }
let staff: { accessToken: string; refreshToken: string }

before(async () => {
  await startTestServer()
  admin = await login('admin@orvexa.test', PASSWORDS.admin)
  alpha = await login('alpha@orvexa.test', PASSWORDS.alpha)
  bravo = await login('bravo@orvexa.test', PASSWORDS.bravo)
  staff = await login('staff@alpha.test', PASSWORDS.staff)
})

after(stopTestServer)

describe('multi-tenant isolation (Tenant A vs Tenant B)', () => {
  test('each storefront only lists its own products', async () => {
    const a = await api('GET', '/api/stores/alpha/products')
    const b = await api('GET', '/api/stores/bravo/products')
    assert.equal(a.status, 200)
    assert.deepEqual(a.body.map((p: any) => p.name).sort(), ['Alpha Last Unit Dress', 'Alpha Scarf'])
    assert.deepEqual(b.body.map((p: any) => p.name).sort(), ['Bravo Only Item', 'Bravo Secret Jacket'])
  })

  test('store A owner cannot create, edit or delete store B products', async () => {
    const t = alpha.accessToken
    assert.equal((await api('POST', '/api/stores/bravo/products', { token: t, body: { name: 'x', category: 'x', price: 1 } })).status, 403)
    assert.equal((await api('PUT', '/api/stores/bravo/products/1', { token: t, body: { price: 1 } })).status, 403)
    assert.equal((await api('DELETE', '/api/stores/bravo/products/1', { token: t })).status, 403)
    const p = await api('GET', '/api/stores/bravo/products/1')
    assert.equal(p.body.price, 5000)
    assert.equal(p.body.name, 'Bravo Secret Jacket')
  })

  test('store A owner cannot read store B orders, staff, theme settings or database info', async () => {
    const t = alpha.accessToken
    assert.equal((await api('GET', '/api/stores/bravo/orders', { token: t })).status, 403)
    assert.equal((await api('GET', '/api/stores/bravo/staff', { token: t })).status, 403)
    assert.equal((await api('PUT', '/api/stores/bravo/theme', { token: t, body: { heroHeadline: 'pwned' } })).status, 403)
    assert.equal((await api('GET', '/api/stores/bravo/database-status', { token: t })).status, 403)
    assert.equal((await api('GET', '/api/stores/bravo/inbox', { token: t })).status, 403)
    assert.equal((await api('PUT', '/api/stores/bravo/orders/ANY/status', { token: t, body: { status: 'Cancelled' } })).status, 403)
    assert.equal((await api('POST', '/api/stores/bravo/staff', { token: t, body: { name: 'x', email: 'x@x.test', password: 'xxxxxxxxxx' } })).status, 403)
  })

  test('store A staff cannot reach store B', async () => {
    assert.equal((await api('GET', '/api/stores/bravo/orders', { token: staff.accessToken })).status, 403)
  })

  test('a store B product id cannot be ordered through store A', async () => {
    const r = await api('POST', '/api/stores/alpha/orders', { body: order([{ productId: 3, quantity: 1 }]) })
    assert.equal(r.status, 400)
  })

  test('unknown or malformed store slugs are 404 and never fall back to another store', async () => {
    assert.equal((await api('GET', '/api/stores/nosuchstore/products')).status, 404)
    assert.equal((await api('GET', '/api/stores/a/products')).status, 404)
    assert.equal((await api('GET', '/api/stores/..%2Fbravo/products')).status, 404)
    assert.equal((await api('POST', '/api/stores/nosuchstore/products', { token: alpha.accessToken, body: {} })).status, 404)
  })

  test('tenant identity in the body or headers is ignored', async () => {
    const r = await api('POST', '/api/stores/bravo/products', {
      token: alpha.accessToken,
      headers: { 'x-tenant-slug': 'alpha' },
      body: { tenantSlug: 'alpha', tenantId: 'tenant_bravo', name: 'x', category: 'x', price: 1 },
    })
    assert.equal(r.status, 403)
  })

  test('theme changes stay in their own store', async () => {
    const r = await api('PUT', '/api/stores/alpha/theme', { token: alpha.accessToken, body: { heroHeadline: 'Alpha headline' } })
    assert.equal(r.status, 200)
    const b = await api('GET', '/api/stores/bravo/theme')
    assert.notEqual(b.body.heroHeadline, 'Alpha headline')
  })

  test('owner theme publish is stored and shown on the public storefront', async () => {
    const r = await api('PUT', '/api/stores/alpha/theme', {
      token: alpha.accessToken,
      body: {
        heroHeadline: 'Alpha live headline',
        heroSubhead: 'New subhead from the owner',
        copy: { bestsellersTitle: 'Our Picks' },
        tagline: 'Alpha live headline',
        aboutStory: 'Alpha is handmade in Pune.',
        contact: { phone: '9876543210', email: 'care@alpha.test' },
      },
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.theme.heroHeadline, 'Alpha live headline')
    assert.equal(r.body.theme.copy.bestsellersTitle, 'Our Picks')

    const theme = await api('GET', '/api/stores/alpha/theme')
    assert.equal(theme.status, 200)
    assert.equal(theme.body.heroHeadline, 'Alpha live headline')
    assert.equal(theme.body.copy.bestsellersTitle, 'Our Picks')

    const resolved = await api('GET', '/api/public/resolve?slug=alpha')
    assert.equal(resolved.status, 200)
    assert.equal(resolved.body.theme.heroHeadline, 'Alpha live headline')
    assert.equal(resolved.body.theme.copy.bestsellersTitle, 'Our Picks')
    assert.equal(resolved.body.aboutStory, 'Alpha is handmade in Pune.')
    assert.equal(resolved.body.contact.email, 'care@alpha.test')

    const other = await api('GET', '/api/public/resolve?slug=bravo')
    assert.notEqual(other.body.theme?.heroHeadline, 'Alpha live headline')
    assert.notEqual(other.body.aboutStory, 'Alpha is handmade in Pune.')
  })
})

describe('authentication', () => {
  const protectedUrl = '/api/stores/alpha/orders'

  test('missing, malformed and tampered tokens are rejected', async () => {
    assert.equal((await api('GET', protectedUrl)).status, 401)
    assert.equal((await api('GET', protectedUrl, { headers: { Authorization: 'Token abc' } })).status, 401)
    const [h, p, s] = alpha.accessToken.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), role: 'super_admin' })).toString('base64url')
    assert.equal((await api('GET', protectedUrl, { token: `${h}.${forgedPayload}.${s}` })).status, 401)
  })

  test('tokens signed with another key, alg=none and expired tokens are rejected', async () => {
    const claims = { userId: 'admin_test', email: 'admin@orvexa.test', role: 'super_admin', tokenType: 'access' }
    assert.equal((await api('GET', '/api/admin/tenants', { token: jwt.sign(claims, 'not-the-server-secret-at-all-000000') })).status, 401)
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`
    assert.equal((await api('GET', '/api/admin/tenants', { token: none })).status, 401)
    const expired = jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET!)
    assert.equal((await api('GET', '/api/admin/tenants', { token: expired })).status, 401)
  })

  test('a refresh token cannot be used as an access token', async () => {
    assert.equal((await api('GET', protectedUrl, { token: alpha.refreshToken })).status, 401)
  })

  test('refresh tokens rotate and cannot be replayed', async () => {
    const fresh = await login('alpha@orvexa.test', PASSWORDS.alpha)
    const first = await api('POST', '/api/auth/refresh', { body: { refreshToken: fresh.refreshToken } })
    assert.equal(first.status, 200)
    const replay = await api('POST', '/api/auth/refresh', { body: { refreshToken: fresh.refreshToken } })
    assert.equal(replay.status, 401)
  })

  test('login does not reveal whether an account exists', async () => {
    const unknown = await api('POST', '/api/auth/login', { body: { loginId: 'nobody@orvexa.test', password: 'whatever-123' } })
    const wrong = await api('POST', '/api/auth/login', { body: { loginId: 'alpha@orvexa.test', password: 'whatever-123' } })
    assert.equal(unknown.status, 401)
    assert.equal(wrong.status, 401)
    assert.equal(unknown.body.error, wrong.body.error)
  })

  test('NoSQL operator injection in login is rejected', async () => {
    const r = await api('POST', '/api/auth/login', { body: { loginId: { $ne: null }, password: { $ne: null } } })
    assert.equal(r.status, 400)
    const s = await api('POST', '/api/auth/seller/login', { body: { loginId: { $gt: '' }, password: 'x' } })
    assert.equal(s.status, 400)
  })

  test('forgot-password never returns the reset token', async () => {
    const known = await api('POST', '/api/auth/seller/forgot-password', { body: { email: 'alpha@orvexa.test' } })
    const unknown = await api('POST', '/api/auth/seller/forgot-password', { body: { email: 'nobody@orvexa.test' } })
    assert.equal(known.status, 200)
    assert.deepEqual(known.body, unknown.body)
    assert.equal(JSON.stringify(known.body).includes('resetToken'), false)
    await sleep(300)
    const mail = mailLog.find((m) => m.includes('Reset your Alpha Store store password'))
    assert.ok(mail, 'reset email was sent')
    assert.ok(mail!.includes('https://app.orvexa.test/'), 'link uses PUBLIC_APP_URL, not the request origin')
  })

  test('seller profile requires a merchant token', async () => {
    const body = { slug: 'alpha', ownerName: 'New Name' }
    assert.equal((await api('PUT', '/api/auth/seller/profile', { body })).status, 401)
    assert.equal((await api('PUT', '/api/auth/seller/profile', { token: staff.accessToken, body })).status, 403)
  })

  test('set-password requires a super admin token (no shared key)', async () => {
    const body = { slug: 'bravo', newPassword: 'Attacker-Pass-123', setupKey: 'orvexa_setup_2026' }
    assert.equal((await api('POST', '/api/auth/seller/set-password', { body })).status, 401)
    assert.equal((await api('POST', '/api/auth/seller/set-password', { token: alpha.accessToken, body })).status, 403)
  })

  test('admin bootstrap rejects the published default key', async () => {
    const r = await api('POST', '/api/auth/admin/bootstrap', { body: { bootstrapKey: 'orvexa_bootstrap_2026', email: 'evil@x.test', password: 'Evil-Password-123' } })
    assert.equal(r.status, 403)
  })

  test('admin recover rejects the published default key', async () => {
    const r = await api('POST', '/api/auth/admin/recover', { body: { bootstrapKey: 'orvexa_bootstrap_2026', password: 'Evil-Password-123' } })
    assert.equal(r.status, 403)
  })
})

describe('role-based access control', () => {
  test('sellers and staff cannot use the admin API', async () => {
    assert.equal((await api('GET', '/api/admin/tenants', { token: alpha.accessToken })).status, 403)
    assert.equal((await api('GET', '/api/admin/tenants', { token: staff.accessToken })).status, 403)
    assert.equal((await api('GET', '/api/admin/tenants')).status, 401)
    assert.equal((await api('PUT', '/api/admin/tenants/tenant_bravo/status', { token: alpha.accessToken, body: { status: 'suspended' } })).status, 403)
  })

  test('staff can fulfil orders but cannot edit the catalog, theme or staff', async () => {
    const t = staff.accessToken
    assert.equal((await api('GET', '/api/stores/alpha/orders', { token: t })).status, 200)
    assert.equal((await api('POST', '/api/stores/alpha/products', { token: t, body: { name: 'x', category: 'x', price: 1 } })).status, 403)
    assert.equal((await api('PUT', '/api/stores/alpha/theme', { token: t, body: { heroHeadline: 'x' } })).status, 403)
    assert.equal((await api('GET', '/api/stores/alpha/staff', { token: t })).status, 403)
  })

  test('admin responses never contain password hashes or database URIs', async () => {
    const r = await api('GET', '/api/admin/tenants', { token: admin.accessToken })
    assert.equal(r.status, 200)
    const text = JSON.stringify(r.body)
    assert.equal(text.includes('passwordHash'), false)
    assert.equal(text.includes('$2a$'), false)
    assert.equal(text.includes('customMongoUri'), false)
    const alphaRow = r.body.find((t: { slug: string }) => t.slug === 'alpha')
    assert.equal(alphaRow.isolationMode, 'dedicated_database')
    assert.equal(alphaRow.databaseName, tenantDatabaseName('alpha'))
    assert.equal(alphaRow.hasCustomDatabase, false)
  })

  test('each store reports its own isolated database name', async () => {
    const a = await api('GET', '/api/stores/alpha/database-status', { token: alpha.accessToken })
    const b = await api('GET', '/api/stores/bravo/database-status', { token: bravo.accessToken })
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
    assert.equal(a.body.databaseName, tenantDatabaseName('alpha'))
    assert.equal(b.body.databaseName, tenantDatabaseName('bravo'))
    assert.equal(a.body.isolationMode, 'dedicated_database')
    assert.notEqual(a.body.databaseName, b.body.databaseName)
  })

  test('dedicated Atlas provision is admin-only and stays off without Atlas API keys', async () => {
    assert.equal((await api('POST', '/api/admin/tenants/alpha/provision-atlas')).status, 401)
    assert.equal((await api('POST', '/api/admin/tenants/alpha/provision-atlas', { token: alpha.accessToken })).status, 403)
    const r = await api('POST', '/api/admin/tenants/alpha/provision-atlas', { token: admin.accessToken })
    assert.equal(r.status, 503)
    assert.equal(r.body.databaseName, tenantDatabaseName('alpha'))
  })

  test('creating a store ignores mass-assigned password hashes and staff', async () => {
    const r = await api('POST', '/api/admin/tenants', {
      token: admin.accessToken,
      body: {
        slug: 'charlie',
        brandName: 'Charlie',
        ownerEmail: 'charlie@orvexa.test',
        passwordHash: '$2a$04$attackerattackerattackerattackerattackerattackerat',
        staffMembers: [{ id: 's', name: 'evil', email: 'evil@x.test', passwordHash: 'x', role: 'manager' }],
        status: 'active',
      },
    })
    assert.equal(r.status, 201)
    const creds = await api('GET', '/api/admin/tenants/charlie/staff', { token: admin.accessToken })
    assert.deepEqual(creds.body.staff, [])
    assert.equal((await api('POST', '/api/admin/tenants', { token: admin.accessToken, body: { slug: 'admin', brandName: 'x', ownerEmail: 'x@x.test' } })).status, 400)
  })

  test('tenant status only accepts known values', async () => {
    const r = await api('PUT', '/api/admin/tenants/tenant_bravo/status', { token: admin.accessToken, body: { status: { $ne: 1 } } })
    assert.equal(r.status, 400)
  })

  test('anonymous audit entries cannot impersonate an admin', async () => {
    const r = await api('POST', '/api/admin/audit-logs', {
      body: { actorRole: 'super_admin', actorName: 'Super Admin', action: 'FORGED', details: 'forged entry', severity: 'critical' },
    })
    assert.equal(r.status, 201)
    const logs = await api('GET', '/api/admin/audit-logs?search=FORGED', { token: admin.accessToken })
    assert.equal(logs.body.logs[0].actorRole, 'system')
    assert.equal(logs.body.logs[0].severity, 'info')
  })
})

describe('checkout integrity', () => {
  let orderId = ''

  test('prices, totals and status are computed on the server', async () => {
    const r = await api('POST', '/api/stores/alpha/orders', {
      body: order([{ productId: 1, quantity: 1, price: 1, name: 'cheap' }], { total: 1, subtotal: 1, status: 'Delivered', discount: 999 }),
    })
    assert.equal(r.status, 201)
    assert.equal(r.body.items[0].price, 1000)
    assert.equal(r.body.subtotal, 1000)
    assert.equal(r.body.shipping, 0)
    assert.equal(r.body.discount, 0)
    assert.equal(r.body.total, 1000)
    assert.equal(r.body.status, 'Processing')
    orderId = r.body.id
  })

  test('shipping fee and discount codes follow the store settings', async () => {
    const small = await api('POST', '/api/stores/alpha/orders', { body: order([{ productId: 2, quantity: 1 }]) })
    assert.equal(small.body.shipping, 70)
    assert.equal(small.body.total, 270)
    const coded = await api('POST', '/api/stores/alpha/orders', { body: order([{ productId: 2, quantity: 2 }], { discountCode: 'save10' }) })
    assert.equal(coded.body.discount, 40)
    const bad = await api('POST', '/api/stores/alpha/orders', { body: order([{ productId: 2, quantity: 1 }], { discountCode: 'FREE100' }) })
    assert.equal(bad.body.discount, 0)
  })

  test('invalid quantities and addresses are rejected', async () => {
    assert.equal((await api('POST', '/api/stores/alpha/orders', { body: order([{ productId: 2, quantity: -1 }]) })).status, 400)
    assert.equal((await api('POST', '/api/stores/alpha/orders', { body: order([{ productId: 2, quantity: 1.5 }]) })).status, 400)
    assert.equal((await api('POST', '/api/stores/alpha/orders', { body: order([{ productId: 2, quantity: 1000 }]) })).status, 400)
    assert.equal((await api('POST', '/api/stores/alpha/orders', { body: order([]) })).status, 400)
    assert.equal((await api('POST', '/api/stores/alpha/orders', { body: order([{ productId: 2, quantity: 1, size: 'XXL' }]) })).status, 400)
    const badPhone = order([{ productId: 2, quantity: 1 }])
    badPhone.shippingAddress.phone = '123'
    assert.equal((await api('POST', '/api/stores/alpha/orders', { body: badPhone })).status, 400)
  })

  test('two shoppers racing for the last unit: exactly one succeeds', async () => {
    const product = await api('GET', '/api/stores/alpha/products/1')
    assert.equal(product.body.stockCount, 1)
    const results = await Promise.all(Array.from({ length: 6 }, () => api('POST', '/api/stores/alpha/orders', { body: order([{ productId: 1, quantity: 1 }]) })))
    assert.equal(results.filter((r) => r.status === 201).length, 1)
    assert.equal(results.filter((r) => r.status === 409).length, 5)
    assert.equal((await api('GET', '/api/stores/alpha/products/1')).body.stockCount, 0)
  })

  test('cancelling restocks exactly once and closed orders cannot reopen', async () => {
    const t = staff.accessToken
    const c1 = await api('PUT', `/api/stores/alpha/orders/${orderId}/status`, { token: t, body: { status: 'Cancelled' } })
    assert.equal(c1.status, 200)
    await api('PUT', `/api/stores/alpha/orders/${orderId}/status`, { token: t, body: { status: 'Cancelled' } })
    assert.equal((await api('GET', '/api/stores/alpha/products/1')).body.stockCount, 1)
    const reopen = await api('PUT', `/api/stores/alpha/orders/${orderId}/status`, { token: t, body: { status: 'Processing' } })
    assert.equal(reopen.status, 409)
    assert.equal((await api('PUT', `/api/stores/alpha/orders/${orderId}/status`, { token: t, body: { status: 'Shipped!!' } })).status, 400)
  })

  test('order list is private; tracking needs the matching phone and hides the address', async () => {
    assert.equal((await api('GET', '/api/stores/alpha/orders')).status, 401)
    const ok = await api('GET', `/api/stores/alpha/orders/track?id=${orderId}&phone=9876543210`)
    assert.equal(ok.status, 200)
    assert.equal(ok.body.shippingAddress.address, undefined)
    assert.equal(ok.body.shippingAddress.phone, undefined)
    const wrongPhone = await api('GET', `/api/stores/alpha/orders/track?id=${orderId}&phone=9999999999`)
    const wrongId = await api('GET', `/api/stores/alpha/orders/track?id=ORD-000000-DEADBEEF&phone=9876543210`)
    assert.equal(wrongPhone.status, 404)
    assert.deepEqual(wrongPhone.body, wrongId.body)
    assert.equal((await api('GET', `/api/stores/bravo/orders/track?id=${orderId}&phone=9876543210`)).status, 404)
  })
})

describe('input validation and injection', () => {
  test('regex and operator injection in catalog queries is neutralised', async () => {
    const dot = await api('GET', '/api/stores/alpha/products?search=.*')
    assert.equal(dot.status, 200)
    assert.equal(dot.body.length, 0)
    assert.equal((await api('GET', '/api/stores/alpha/products?search=(')).status, 200)
    const op = await api('GET', '/api/stores/alpha/products?category[$ne]=zzz')
    assert.equal(op.status, 200)
    assert.equal((await api('GET', '/api/stores/alpha/products/abc')).status, 400)
    assert.equal((await api('GET', '/api/stores/alpha/products?limit=100000')).status, 200)
  })

  test('product writes are whitelisted and validated', async () => {
    const t = alpha.accessToken
    assert.equal((await api('POST', '/api/stores/alpha/products', { token: t, body: { name: 'x', category: 'x', price: -5 } })).status, 400)
    assert.equal((await api('POST', '/api/stores/alpha/products', { token: t, body: { name: 'x', category: 'x', price: { $gt: 0 } } })).status, 400)
    assert.equal((await api('POST', '/api/stores/alpha/products', { token: t, body: { name: 'x', category: 'x', price: 'ten' } })).status, 400)
    assert.equal((await api('POST', '/api/stores/alpha/products', { token: t, body: { name: 'x', category: 'x', price: 10, imgMain: 'javascript:alert(1)' } })).status, 400)
    const ok = await api('POST', '/api/stores/alpha/products', { token: t, body: { name: 'New Tee', category: 'tops', price: 499, stockCount: 3, id: 999, rating: 5, reviewsCount: 9999 } })
    assert.equal(ok.status, 201)
    assert.notEqual(ok.body.id, 999)
    assert.equal(ok.body.reviewsCount, 0)
  })

  test('customer reviews can never mark themselves verified', async () => {
    const r = await api('POST', '/api/stores/alpha/reviews', { body: { productId: 2, author: 'Eve', rating: 5, comment: 'great', verified: true } })
    assert.equal(r.status, 201)
    assert.equal(r.body.verified, false)
    assert.equal((await api('POST', '/api/stores/alpha/reviews', { body: { productId: 2, author: 'Eve', rating: 50, comment: 'x' } })).status, 400)
  })

  test('invalid JSON and unknown API routes return JSON errors without internals', async () => {
    const bad = await api('POST', '/api/auth/login', { raw: '{"loginId":' })
    assert.equal(bad.status, 400)
    assert.equal((await api('GET', '/api/does-not-exist')).status, 404)
    assert.equal((await api('GET', '/api/stores/alpha/nope')).status, 404)
  })

  test('disallowed browser origins get 403, not 500', async () => {
    const r = await api('GET', '/api/health', { headers: { Origin: 'https://evil.example' } })
    assert.equal(r.status, 403)
  })

  test('bring-your-own database is disabled unless explicitly enabled', async () => {
    const r = await api('PUT', '/api/stores/alpha/database-config', { token: alpha.accessToken, body: { customMongoUri: 'mongodb://169.254.169.254:27017/x' } })
    assert.equal(r.status, 403)
  })
})

describe('session revocation', () => {
  test('removed staff lose access immediately', async () => {
    const temp = await api('POST', '/api/stores/alpha/staff', { token: alpha.accessToken, body: { name: 'Temp', email: 'temp@alpha.test', password: 'Temp-Pass-123' } })
    assert.equal(temp.status, 201)
    const s = await login('temp@alpha.test', 'Temp-Pass-123')
    assert.equal((await api('GET', '/api/stores/alpha/orders', { token: s.accessToken })).status, 200)
    assert.equal((await api('DELETE', `/api/stores/alpha/staff/${temp.body.staff.id}`, { token: alpha.accessToken })).status, 200)
    assert.equal((await api('GET', '/api/stores/alpha/orders', { token: s.accessToken })).status, 401)
    assert.equal((await api('POST', '/api/auth/refresh', { body: { refreshToken: s.refreshToken } })).status, 401)
  })

  test('duplicate staff emails across stores are refused', async () => {
    const r = await api('POST', '/api/admin/tenants/bravo/staff', { token: admin.accessToken, body: { name: 'Dup', email: 'staff@alpha.test', password: 'Dup-Pass-1234' } })
    assert.equal(r.status, 409)
  })

  test('suspending a store blocks its storefront, owner refresh and owner login', async () => {
    const owner = await login('bravo@orvexa.test', PASSWORDS.bravo)
    assert.equal((await api('PUT', '/api/admin/tenants/tenant_bravo/status', { token: admin.accessToken, body: { status: 'suspended' } })).status, 200)
    assert.equal((await api('GET', '/api/stores/bravo/products')).status, 403)
    assert.equal((await api('POST', '/api/auth/refresh', { body: { refreshToken: owner.refreshToken } })).status, 401)
    assert.equal((await api('POST', '/api/auth/login', { body: { loginId: 'bravo@orvexa.test', password: PASSWORDS.bravo } })).status, 403)
    assert.equal((await api('PUT', '/api/admin/tenants/tenant_bravo/status', { token: admin.accessToken, body: { status: 'active' } })).status, 200)
  })

  test('changing the owner password invalidates older access tokens', async () => {
    const before = await login('alpha@orvexa.test', PASSWORDS.alpha)
    await sleep(1100)
    const r = await api('POST', '/api/auth/seller/change-password', { body: { slug: 'alpha', currentPassword: PASSWORDS.alpha, newPassword: 'Alpha-New-Pass-2' } })
    assert.equal(r.status, 200)
    assert.equal((await api('GET', '/api/stores/alpha/staff', { token: before.accessToken })).status, 401)
    assert.equal((await api('POST', '/api/auth/refresh', { body: { refreshToken: before.refreshToken } })).status, 401)
    const wrong = await api('POST', '/api/auth/seller/change-password', { body: { slug: 'alpha', currentPassword: 'nope-nope', newPassword: 'Whatever-123' } })
    assert.equal(wrong.status, 401)
    alpha = await login('alpha@orvexa.test', 'Alpha-New-Pass-2')
  })
})

describe('end-to-end merchant onboarding and first sale', () => {
  test('signup → approval → emailed password link → login → product → order → fulfilment → tracking', async () => {
    const signup = await signedSignup({
      schemaVersion: 1,
      idempotencyKey: 'e2e-delta-1',
      owner: { email: 'delta@orvexa.test', name: 'Delta Owner' },
      brand: { name: 'Delta Goods', requestedSlug: 'delta', niche: 'Home decor' },
      plan: { id: 'starter' },
    })
    assert.equal(signup.status, 201)

    const unsigned = await api('POST', '/api/public/signups', { body: { schemaVersion: 1 } })
    assert.equal(unsigned.status, 401)

    const approve = await api('PUT', `/api/admin/applications/${signup.body.applicationId}/status`, { token: admin.accessToken, body: { status: 'approved' } })
    assert.equal(approve.status, 200)
    const again = await api('PUT', `/api/admin/applications/${signup.body.applicationId}/status`, { token: admin.accessToken, body: { status: 'approved' } })
    assert.equal(again.status, 409)

    let mail: string | undefined
    for (let i = 0; i < 20 && !mail; i++) {
      await sleep(100)
      mail = mailLog.find((m) => m.includes('Delta Goods is approved'))
    }
    assert.ok(mail, 'approval email sent')
    const token = /reset_token=([a-f0-9]{64})/.exec(mail!)![1]

    assert.equal((await api('POST', '/api/auth/seller/reset-password', { body: { tenantSlug: 'delta', resetToken: token, newPassword: 'short' } })).status, 400)
    const set = await api('POST', '/api/auth/seller/reset-password', { body: { tenantSlug: 'delta', resetToken: token, newPassword: 'Delta-Pass-123' } })
    assert.equal(set.status, 200)
    const reuse = await api('POST', '/api/auth/seller/reset-password', { body: { tenantSlug: 'delta', resetToken: token, newPassword: 'Delta-Pass-456' } })
    assert.equal(reuse.status, 401)

    const owner = await login('delta@orvexa.test', 'Delta-Pass-123')
    const product = await api('POST', '/api/stores/delta/products', { token: owner.accessToken, body: { name: 'Clay Vase', category: 'decor', price: 1500, stockCount: 4, sizes: [] } })
    assert.equal(product.status, 201)

    const placed = await api('POST', '/api/stores/delta/orders', { body: order([{ productId: product.body.id, quantity: 2 }]) })
    assert.equal(placed.status, 201)
    assert.equal(placed.body.total, 3000)
    assert.equal((await api('GET', `/api/stores/delta/products/${product.body.id}`)).body.stockCount, 2)

    const shipped = await api('PUT', `/api/stores/delta/orders/${placed.body.id}/status`, { token: owner.accessToken, body: { status: 'In Transit', courier: 'Test Express', awb: 'AWB123' } })
    assert.equal(shipped.status, 200)

    const tracked = await api('GET', `/api/stores/delta/orders/track?id=${placed.body.id}&phone=9876543210`)
    assert.equal(tracked.status, 200)
    assert.equal(tracked.body.status, 'In Transit')
    assert.equal(tracked.body.awb, 'AWB123')
    assert.equal(tracked.body.timeline.length, 2)

    // Delta's owner still cannot touch the seeded stores.
    assert.equal((await api('GET', '/api/stores/alpha/orders', { token: owner.accessToken })).status, 403)
  })

  test('platform overview totals come from real orders', async () => {
    const r = await api('GET', '/api/admin/overview', { token: admin.accessToken })
    assert.equal(r.status, 200)
    assert.ok(r.body.totalOrders >= 5)
    assert.ok(r.body.totalCustomers >= 1 && r.body.totalCustomers < 14)
  })
})

describe('handoff requirements: lifecycle, plans and application decisions', () => {
  const waitForMail = async (text: string) => {
    for (let i = 0; i < 20; i++) {
      const hit = mailLog.find((m) => m.includes(text))
      if (hit) return hit
      await sleep(100)
    }
    return undefined
  }

  test('read-only store keeps its catalogue and owner access but takes no orders; cancelled closes it', async () => {
    const setStatus = (status: string) =>
      api('PUT', '/api/admin/tenants/tenant_bravo/status', { token: admin.accessToken, body: { status } })

    assert.equal((await setStatus('read_only')).status, 200)
    assert.equal((await api('GET', '/api/stores/bravo/products')).status, 200)
    const blocked = await api('POST', '/api/stores/bravo/orders', { body: order([{ productId: 3, quantity: 1 }]) })
    assert.equal(blocked.status, 403)
    assert.equal(blocked.body.readOnly, true)
    await login('bravo@orvexa.test', PASSWORDS.bravo)

    assert.equal((await setStatus('cancelled')).status, 200)
    assert.equal((await api('GET', '/api/stores/bravo/products')).status, 403)
    const closed = await api('POST', '/api/auth/login', { body: { loginId: 'bravo@orvexa.test', password: PASSWORDS.bravo } })
    assert.equal(closed.status, 403)

    assert.equal((await setStatus('bogus')).status, 400)
    assert.equal((await setStatus('active')).status, 200)
    assert.equal((await api('POST', '/api/stores/bravo/orders', { body: order([{ productId: 3, quantity: 1 }]) })).status, 201)
  })

  test('Starter stores are limited to 100 products', async () => {
    const owner = await login('delta@orvexa.test', 'Delta-Pass-123')
    const body = { name: 'Bulk Item', category: 'decor', price: 100, stockCount: 1, sizes: [] }
    const existing = (await api('GET', '/api/stores/delta/products')).body.length
    for (let i = existing; i < 100; i++) {
      assert.equal((await api('POST', '/api/stores/delta/products', { token: owner.accessToken, body })).status, 201)
    }
    const over = await api('POST', '/api/stores/delta/products', { token: owner.accessToken, body })
    assert.equal(over.status, 403)
    assert.equal(over.body.upgradeRequired, true)
  })

  test('yearly Growth signups are priced from the catalogue, not the payload', async () => {
    const signup = await signedSignup({
      schemaVersion: 1,
      idempotencyKey: 'yearly-echo-1',
      owner: { email: 'echo@orvexa.test' },
      brand: { name: 'Echo Wares', requestedSlug: 'echo-wares' },
      plan: { id: 'growth', cycle: 'yearly', total: 1, amountExTax: 1 },
      launch: { status: 'live', country: 'IN' },
    })
    assert.equal(signup.status, 201)
    const approve = await api('PUT', `/api/admin/applications/${signup.body.applicationId}/status`, { token: admin.accessToken, body: { status: 'approved' } })
    assert.equal(approve.status, 200)
    const tenant = (await api('GET', '/api/admin/tenants', { token: admin.accessToken })).body.find((t: any) => t.slug === 'echo-wares')
    assert.equal(tenant.plan, 'pro')
    assert.equal(tenant.subscription.cycle, 'yearly')
    assert.equal(tenant.subscription.pricePerMonth, 3294)
  })

  test('"needs more information" emails the question and the application can still be approved', async () => {
    const signup = await signedSignup({
      schemaVersion: 1,
      idempotencyKey: 'needs-info-foxtrot-1',
      owner: { email: 'foxtrot@orvexa.test', name: 'Fox Owner' },
      brand: { name: 'Foxtrot Finds', requestedSlug: 'foxtrot' },
      plan: { id: 'starter' },
    })
    const url = `/api/admin/applications/${signup.body.applicationId}/status`
    assert.equal((await api('PUT', url, { token: admin.accessToken, body: { status: 'needs_info' } })).status, 400)
    const asked = await api('PUT', url, { token: admin.accessToken, body: { status: 'needs_info', reviewNotes: 'Please share your GSTIN.' } })
    assert.equal(asked.status, 200)
    assert.equal(asked.body.status, 'needs_info')
    const mail = await waitForMail('A quick question about your Foxtrot Finds application')
    assert.ok(mail?.includes('Please share your GSTIN.'))

    const dup = await signedSignup({
      schemaVersion: 1,
      idempotencyKey: 'needs-info-foxtrot-1',
      owner: { email: 'foxtrot@orvexa.test' },
      brand: { name: 'Foxtrot Finds', requestedSlug: 'foxtrot' },
    })
    assert.equal(dup.status, 409)
    assert.equal(dup.body.status, 'pending_review')

    assert.equal((await api('PUT', url, { token: admin.accessToken, body: { status: 'approved' } })).status, 200)
  })

  test('early-access entries are never provisioned and are told when their country opens', async () => {
    const signup = await signedSignup({
      schemaVersion: 1,
      idempotencyKey: 'waitlist-golf-1',
      owner: { email: 'golf@orvexa.test', name: 'Golf Owner' },
      brand: { name: 'Golf Gifts', requestedSlug: 'golf-gifts' },
      plan: { id: 'growth' },
      launch: { status: 'early_access', country: 'AE' },
    })
    assert.equal(signup.status, 201)
    assert.equal(signup.body.status, 'early_access')

    const url = `/api/admin/applications/${signup.body.applicationId}/status`
    assert.equal((await api('PUT', url, { token: admin.accessToken, body: { status: 'approved' } })).status, 409)
    assert.equal((await api('PUT', url, { token: admin.accessToken, body: { status: 'needs_info', reviewNotes: 'x' } })).status, 409)

    assert.equal((await api('POST', '/api/admin/waitlist/notify', { token: admin.accessToken, body: { country: 'UAE' } })).status, 400)
    assert.equal((await api('POST', '/api/admin/waitlist/notify', { token: alpha.accessToken, body: { country: 'AE' } })).status, 403)
    const notify = await api('POST', '/api/admin/waitlist/notify', { token: admin.accessToken, body: { country: 'AE' } })
    assert.equal(notify.status, 200)
    // No mail provider in tests, so the send is reported as failed and the entry stays un-notified for a retry.
    assert.equal(notify.body.notified + notify.body.failed, 1)
    assert.ok(await waitForMail('Orvexa Cloud is now open in your country'))
  })
})

describe('tenant portals, custom domains and storefront analytics', () => {
  test('unsigned resolve by slug returns portal paths', async () => {
    const r = await api('GET', '/api/public/resolve?slug=alpha')
    assert.equal(r.status, 200)
    assert.equal(r.body.slug, 'alpha')
    assert.equal(r.body.portalPath, '/t/alpha')
    assert.equal(r.body.dashboardPath, undefined)
    assert.equal(r.body.ownerPortalToken, undefined)
    assert.equal(r.body.ownerEmail, undefined)
  })

  test('admin credentials include the permanent owner URL', async () => {
    assert.equal((await api('GET', '/api/admin/tenants/alpha/credentials')).status, 401)
    assert.equal((await api('GET', '/api/admin/tenants/alpha/credentials', { token: alpha.accessToken })).status, 403)
    const creds = await api('GET', '/api/admin/tenants/alpha/credentials', { token: admin.accessToken })
    assert.equal(creds.status, 200)
    assert.equal(creds.body.ownerPortalPath, '/t/alpha/owner')
    assert.match(String(creds.body.ownerPortalUrl), /\/t\/alpha\/owner$/)
    const tenants = await api('GET', '/api/admin/tenants', { token: admin.accessToken })
    assert.equal(JSON.stringify(tenants.body).includes('ownerPortalToken'), false)
  })

  test('unknown slug is 404 and never another store', async () => {
    assert.equal((await api('GET', '/api/public/resolve?slug=nosuchstore')).status, 404)
  })

  test('storefront can record page views and shopper sign-ins; sellers read analytics', async () => {
    assert.equal((await api('POST', '/api/stores/alpha/events', { body: { type: 'page_view', path: '/home', sessionId: 's1' } })).status, 204)
    assert.equal((await api('POST', '/api/stores/alpha/events', { body: { type: 'shopper_signin', sessionId: 's1' } })).status, 204)
    assert.equal((await api('POST', '/api/stores/alpha/events', { body: { type: 'order_placed' } })).status, 400)
    assert.equal((await api('GET', '/api/stores/alpha/analytics')).status, 401)
    const ok = await api('GET', '/api/stores/alpha/analytics', { token: alpha.accessToken })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.pageViews, 1)
    assert.equal(ok.body.signIns, 1)
    assert.equal(ok.body.storefrontPath, '/t/alpha')
    assert.equal((await api('GET', '/api/stores/bravo/analytics', { token: alpha.accessToken })).status, 403)
  })

  test('placing an order records it in analytics', async () => {
    const placed = await api('POST', '/api/stores/alpha/orders', { body: order([{ productId: 2, quantity: 1 }]) })
    assert.equal(placed.status, 201)
    const stats = await api('GET', '/api/stores/alpha/analytics', { token: alpha.accessToken })
    assert.ok(stats.body.orders >= 1)
  })

  test('owner can save a custom domain; other stores cannot steal it', async () => {
    const saved = await api('PUT', '/api/stores/alpha/domain', { token: alpha.accessToken, body: { customDomain: 'shop.alpha.test' } })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.customDomain, 'shop.alpha.test')
    assert.equal(saved.body.verified, false)
    assert.equal((await api('PUT', '/api/stores/alpha/domain', { token: alpha.accessToken, body: { customDomain: 'orvexacloud.in' } })).status, 400)
    assert.equal((await api('PUT', '/api/stores/bravo/domain', { token: bravo.accessToken, body: { customDomain: 'shop.alpha.test' } })).status, 409)
    assert.equal((await api('PUT', '/api/stores/alpha/domain', { token: staff.accessToken, body: { customDomain: 'other.example.com' } })).status, 403)
    const resolved = await api('GET', '/api/public/resolve?host=www.shop.alpha.test')
    assert.equal(resolved.status, 200)
    assert.equal(resolved.body.slug, 'alpha')
    const cfg = await api('GET', '/api/stores/alpha/domain', { token: alpha.accessToken })
    assert.equal(cfg.status, 200)
    assert.equal(cfg.body.customDomain, 'shop.alpha.test')
    assert.match(String(cfg.body.cnameTarget), /cname\.orvexacloud\.in/)
  })
})

describe('storefront inbox and newsletter subscribers', () => {
  test('public newsletter and contact emails land in that store inbox only', async () => {
    const sub = await api('POST', '/api/stores/alpha/newsletter', { body: { email: 'shopper@example.com' } })
    assert.equal(sub.status, 201)
    assert.equal(sub.body.created, true)
    const again = await api('POST', '/api/stores/alpha/newsletter', { body: { email: 'SHOPPER@example.com' } })
    assert.equal(again.status, 200)
    assert.equal(again.body.created, false)

    const contact = await api('POST', '/api/stores/alpha/contact', {
      body: { name: 'Asha', email: 'asha@example.com', phone: '9876543210', subject: 'Sizing', message: 'Do you have M?' },
    })
    assert.equal(contact.status, 201)
    assert.equal(contact.body.email, 'asha@example.com')
    assert.equal(contact.body.read, false)

    const item = await api('POST', '/api/stores/alpha/products', {
      token: alpha.accessToken,
      body: { name: 'Inbox Stock Item', category: 'test', price: 150, stockCount: 5 },
    })
    assert.equal(item.status, 201)
    const checkout = await api('POST', '/api/stores/alpha/orders', {
      body: order([{ productId: item.body.id, quantity: 1 }], { customerEmail: 'buyer@example.com' }),
    })
    assert.equal(checkout.status, 201)

    assert.equal((await api('GET', '/api/stores/alpha/inbox')).status, 401)
    const inbox = await api('GET', '/api/stores/alpha/inbox', { token: alpha.accessToken })
    assert.equal(inbox.status, 200)
    const emails = inbox.body.subscribers.map((s: { email: string }) => s.email).sort()
    assert.deepEqual(emails, ['asha@example.com', 'buyer@example.com', 'shopper@example.com'])
    assert.equal(inbox.body.messages.length, 1)
    assert.equal(inbox.body.messages[0].name, 'Asha')

    const other = await api('GET', '/api/stores/bravo/inbox', { token: bravo.accessToken })
    assert.equal(other.status, 200)
    assert.equal(other.body.subscribers.length, 0)
    assert.equal(other.body.messages.length, 0)
    assert.equal((await api('GET', '/api/stores/bravo/inbox', { token: alpha.accessToken })).status, 403)
  })

  test('staff can mark contact messages read and remove a subscriber', async () => {
    const contact = await api('POST', '/api/stores/alpha/contact', {
      body: { name: 'Ravi', email: 'ravi@example.com', message: 'Where is my order?' },
    })
    assert.equal(contact.status, 201)
    const patched = await api('PATCH', `/api/stores/alpha/inbox/messages/${contact.body.id}`, {
      token: staff.accessToken,
      body: { read: true },
    })
    assert.equal(patched.status, 200)
    assert.equal(patched.body.read, true)

    assert.equal(
      (await api('DELETE', '/api/stores/alpha/inbox/subscribers', { token: staff.accessToken, body: { email: 'ravi@example.com' } })).status,
      200,
    )
    const inbox = await api('GET', '/api/stores/alpha/inbox', { token: staff.accessToken })
    assert.equal(inbox.body.subscribers.some((s: { email: string }) => s.email === 'ravi@example.com'), false)

    assert.equal((await api('POST', '/api/stores/alpha/newsletter', { body: { email: 'not-an-email' } })).status, 400)
    assert.equal((await api('POST', '/api/stores/alpha/contact', { body: { name: 'X', email: 'x@x.test' } })).status, 400)
  })
})
