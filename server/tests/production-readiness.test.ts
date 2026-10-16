// Production-readiness regression tests.
// Each test below pins one finding from the production review, so it cannot quietly come back.
// Needs the same MONGOD_BINARY / MONGODB_TEST_URI as the other tests (the harness starts a throwaway MongoDB).

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import crypto from 'node:crypto'
import { startTestServer, stopTestServer, api, login, sleep, PASSWORDS } from './harness.js'
import { assertSafeToSeed } from '../src/scripts/seedGuard.js'

const SERVER_DIR = path.resolve(import.meta.dirname, '..')
const TSX = path.join(SERVER_DIR, 'node_modules', '.bin', 'tsx')
const hex = () => crypto.randomBytes(32).toString('hex')

/** Runs a snippet or script in a FRESH process with exactly the given environment (so production mode can be tested). */
function run(args: string[], env: Record<string, string>, timeout = 45000) {
  const r = spawnSync(TSX, args, { cwd: SERVER_DIR, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env }, encoding: 'utf8', timeout })
  // A process that never started (missing tool, timeout) must FAIL the test, not look like "it refused".
  if (r.error) throw new Error(`could not run ${args[0]}: ${r.error.message}. Run "npm ci" in server/ so tsx is installed.`)
  if (r.status === null) throw new Error(`process was killed (${r.signal}); output so far: ${(r.stderr || '').slice(0, 300)}`)
  return r
}
const IMPORT_FAILS_LOUDLY = (file: string) => `import('${file}').catch((e) => { console.error(e.message); process.exit(1) })`
const loadAuth = (env: Record<string, string>) => run(['-e', IMPORT_FAILS_LOUDLY('./src/middleware/authMiddleware.ts')], { NODE_ENV: 'production', ...env })

describe('JWT secrets in production', () => {
  test('the placeholder from .env.example is refused, even though it is long', () => {
    const r = loadAuth({ JWT_SECRET: 'replace_with_a_long_random_secret_at_least_32_chars', JWT_REFRESH_SECRET: 'replace_with_another_long_random_secret_for_refresh_tokens' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /placeholder or a guessable phrase/)
  })
  test('a long guessable phrase is refused', () => {
    const r = loadAuth({ JWT_SECRET: 'my-company-jwt-signing-key-for-the-live-site', JWT_REFRESH_SECRET: hex() })
    assert.notEqual(r.status, 0)
  })
  test('a short secret is refused', () => {
    assert.notEqual(loadAuth({ JWT_SECRET: 'abc123', JWT_REFRESH_SECRET: hex() }).status, 0)
  })
  test('two identical secrets are refused', () => {
    const same = hex()
    assert.notEqual(loadAuth({ JWT_SECRET: same, JWT_REFRESH_SECRET: same }).status, 0)
  })
  test('two proper random secrets are accepted', () => {
    assert.equal(loadAuth({ JWT_SECRET: hex(), JWT_REFRESH_SECRET: hex() }).status, 0)
  })
})

describe('start-up in production', () => {
  test('without a reachable database the server refuses to start (it does not listen and report healthy)', () => {
    const r = run(['src/index.ts'], {
      NODE_ENV: 'production', PORT: String(20000 + Math.floor(Math.random() * 20000)), JWT_SECRET: hex(), JWT_REFRESH_SECRET: hex(),
      MONGODB_MASTER_URI: 'mongodb://127.0.0.1:1/orvexatech_master', MONGODB_TENANT_BASE_URI: 'mongodb://127.0.0.1:1/orvexa_tenant_',
      PUBLIC_APP_URL: 'https://app.example.test', CORS_ORIGIN: 'https://app.example.test',
    }, 60000)
    assert.equal(r.status, 1)
    assert.match(r.stderr + r.stdout, /Refusing to start/)
    assert.doesNotMatch(r.stdout, /running on http/)
  })
  test('a missing database setting is an error in production, not a silent localhost fallback', () => {
    const r = run(['-e', IMPORT_FAILS_LOUDLY('./src/config/db.ts')], { NODE_ENV: 'production' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /must be set in production/)
  })
})

describe('the demo seeder cannot wipe a real database', () => {
  const ok = { ALLOW_SEED: 'yes', MONGODB_MASTER_URI: 'mongodb://127.0.0.1:27017/orvexa_test_master' }
  test('refuses in production', () => assert.throws(() => assertSafeToSeed({ ...ok, NODE_ENV: 'production' }), /production/))
  test('refuses without an explicit confirmation', () => assert.throws(() => assertSafeToSeed({ MONGODB_MASTER_URI: ok.MONGODB_MASTER_URI }), /ALLOW_SEED/))
  test('refuses an Atlas address that does not look like staging or test, whatever the credentials say', () =>
    assert.throws(() => assertSafeToSeed({ ALLOW_SEED: 'yes', MONGODB_MASTER_URI: 'mongodb+srv://test:test@cluster0.abcde.mongodb.net/orvexatech_master' }), /does not look like/))
  test('allows the default local database, with and without credentials, whatever it is called', () => {
    for (const uri of ['mongodb://localhost:27017/orvexatech_master', 'mongodb://127.0.0.1:27555/orvexa_e2e_master', 'mongodb://user:pass@localhost:27017/anything'])
      assert.doesNotThrow(() => assertSafeToSeed({ ALLOW_SEED: 'yes', MONGODB_MASTER_URI: uri }), uri)
  })
  test('allows a local database and a staging cluster', () => {
    assert.doesNotThrow(() => assertSafeToSeed(ok))
    assert.doesNotThrow(() => assertSafeToSeed({ ALLOW_SEED: 'yes', MONGODB_MASTER_URI: 'mongodb+srv://u:p@orvexa-staging.abcde.mongodb.net/orvexatech_master' }))
  })
  test('the real script refuses in production before touching any data', () => {
    const r = run(['src/scripts/seed.ts'], { NODE_ENV: 'production', ALLOW_SEED: 'yes', MONGODB_MASTER_URI: 'mongodb+srv://u:p@cluster0.abcde.mongodb.net/orvexatech_master', MONGODB_TENANT_BASE_URI: 'mongodb+srv://u:p@cluster0.abcde.mongodb.net/orvexa_tenant_', JWT_SECRET: hex(), JWT_REFRESH_SECRET: hex() }, 60000)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr + r.stdout, /Refusing to seed/)
  })
})

describe('public store lookup and health (against a real database)', () => {
  before(startTestServer)
  after(stopTestServer)
  const OWNER_ONLY = ['ownerEmail', 'ownerPhone', 'ownerName', 'subscription', 'createdAt']

  test('anyone can resolve a store, but receives storefront fields only', async () => {
    const r = await api('GET', '/api/public/resolve?slug=alpha')
    assert.equal(r.status, 200)
    assert.equal(r.body.slug, 'alpha')
    assert.ok(r.body.brandName)
    for (const k of OWNER_ONLY) assert.equal(r.body[k], undefined, `${k} must not be public`)
  })
  test('guessing another store gives the same minimal answer, and an unknown store is 404', async () => {
    const r = await api('GET', '/api/public/resolve?slug=bravo')
    assert.equal(r.status, 200)
    for (const k of OWNER_ONLY) assert.equal(r.body[k], undefined)
    assert.equal((await api('GET', '/api/public/resolve?slug=nosuchstore')).status, 404)
  })
  test('resolving by custom domain is just as minimal', async () => {
    const alpha = await login('alpha@orvexa.test', PASSWORDS.alpha)
    await api('PUT', '/api/stores/alpha/domain', { token: alpha.accessToken, body: { customDomain: 'shop.privacy-check.test' } })
    const r = await api('GET', '/api/public/resolve?host=shop.privacy-check.test')
    assert.equal(r.status, 200)
    for (const k of OWNER_ONLY) assert.equal(r.body[k], undefined)
  })
  test("the store's own owner receives the full record", async () => {
    const alpha = await login('alpha@orvexa.test', PASSWORDS.alpha)
    const r = await api('GET', '/api/public/resolve?slug=alpha', { token: alpha.accessToken })
    assert.equal(r.status, 200)
    assert.match(String(r.body.ownerEmail), /@/)
    assert.ok(r.body.subscription)
  })
  test("another store's owner does NOT receive it", async () => {
    const bravo = await login('bravo@orvexa.test', PASSWORDS.bravo)
    const r = await api('GET', '/api/public/resolve?slug=alpha', { token: bravo.accessToken })
    assert.equal(r.status, 200)
    for (const k of OWNER_ONLY) assert.equal(r.body[k], undefined)
  })
  test('a super admin receives the full record', async () => {
    const admin = await login('admin@orvexa.test', PASSWORDS.admin)
    const r = await api('GET', '/api/public/resolve?slug=alpha', { token: admin.accessToken })
    assert.match(String(r.body.ownerEmail), /@/)
  })
  test('a garbage token is ignored: it neither errors nor unlocks anything', async () => {
    const r = await api('GET', '/api/public/resolve?slug=alpha', { token: 'not.a.token' })
    assert.equal(r.status, 200)
    for (const k of OWNER_ONLY) assert.equal(r.body[k], undefined)
  })

  test('health reports ok, the commit, and no configuration', async () => {
    const r = await api('GET', '/api/health')
    assert.equal(r.status, 200)
    assert.equal(r.body.ok, true)
    assert.equal(typeof r.body.commit, 'string')
    assert.equal(r.headers.get('cache-control'), 'no-store')
    for (const k of ['platform', 'signupIntake', 'decisionEmail']) assert.equal(r.body[k], undefined, `${k} must not be public`)
  })
  // Keep this last: it stops the database server for the rest of the file.
  test('health answers 503 when the database server stops (it does not claim to be healthy)', async (t) => {
    if (process.env.MONGODB_TEST_URI) return t.skip('needs the throwaway mongod that the harness starts itself')
    const port = new URL(process.env.MONGODB_MASTER_URI!).port
    // a real outage: the database SERVER process is gone, not just one client connection
    const killed = spawnSync('pkill', ['-f', '--', `--port ${port} --dbpath`])
    assert.equal(killed.status, 0, 'the test could not stop the throwaway mongod, so it cannot simulate an outage')
    await sleep(1500)
    const r = await api('GET', '/api/health')
    assert.equal(r.status, 503)
    assert.equal(r.body.ok, false)
  })
})
