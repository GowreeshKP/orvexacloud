// Test harness: starts a throwaway mongod, boots the Express app on a random port,
// and seeds two isolated stores (alpha, bravo), a super admin and a staff member.
//
// Needs either MONGODB_TEST_URI (an empty server you can wipe) or MONGOD_BINARY (path to a
// mongod executable, e.g. the one mongodb-memory-server downloads).

import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

export const PASSWORDS = {
  admin: 'Admin-Test-Pass-1',
  alpha: 'Alpha-Test-Pass-1',
  bravo: 'Bravo-Test-Pass-1',
  staff: 'Staff-Test-Pass-1',
}
export const SIGNING_SECRET = crypto.randomBytes(24).toString('hex')

let mongod: ChildProcess | undefined
let dbPath: string | undefined
let server: Server | undefined
export let baseUrl = ''
export const mailLog: string[] = []

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo
      s.close(() => resolve(port))
    })
    s.on('error', reject)
  })
}

async function waitForPort(port: number, timeoutMs = 20000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.end()
        resolve(true)
      })
      sock.on('error', () => resolve(false))
    })
    if (ok) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`mongod did not start on port ${port}`)
}

async function startMongo(): Promise<string> {
  if (process.env.MONGODB_TEST_URI) return process.env.MONGODB_TEST_URI.replace(/\/+$/, '')
  const binary = process.env.MONGOD_BINARY
  if (!binary || !fs.existsSync(binary)) {
    throw new Error('Set MONGOD_BINARY (path to mongod) or MONGODB_TEST_URI to run the integration tests.')
  }
  const port = await freePort()
  dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'orvexa-test-db-'))
  mongod = spawn(binary, ['--port', String(port), '--dbpath', dbPath, '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore' })
  await waitForPort(port)
  return `mongodb://127.0.0.1:${port}`
}

export async function startTestServer() {
  const mongoBase = await startMongo()
  const ns = process.pid
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_MASTER_URI: `${mongoBase}/orvexa_test_master_${ns}`,
    MONGODB_TENANT_BASE_URI: `${mongoBase}/orvexa_test_tenant_${ns}_`,
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
    DISABLE_RATE_LIMITS: 'true',
    TENANT_SCAFFOLDING: 'off',
    PUBLIC_APP_URL: 'https://app.orvexa.test',
    SIGNUP_SIGNING_SECRETS: SIGNING_SECRET,
    CORS_ORIGIN: 'https://app.orvexa.test',
    DNS_SERVERS: '',
  })
  delete process.env.RESEND_API_KEY
  delete process.env.MAIL_FROM
  delete process.env.ATLAS_API_PUBLIC_KEY
  delete process.env.ATLAS_API_PRIVATE_KEY
  delete process.env.ATLAS_ORG_ID
  delete process.env.ATLAS_ACCESS_LIST

  // The mailer prints unsent bodies outside production; capture them as the "inbox".
  const realLog = console.log
  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(' ')
    if (line.startsWith('[Mail]')) mailLog.push(line)
    else if (process.env.TEST_VERBOSE) realLog(...args)
  }
  if (!process.env.TEST_VERBOSE) {
    console.warn = () => undefined
    console.error = () => undefined
  }

  const { app } = await import('../src/app.js')
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await seed()
}

export async function stopTestServer() {
  const mongoose = (await import('mongoose')).default
  await mongoose.disconnect().catch(() => undefined)
  await new Promise((r) => server?.close(r))
  if (mongod) {
    mongod.kill()
    await new Promise((r) => setTimeout(r, 500))
  }
  if (dbPath) fs.rmSync(dbPath, { recursive: true, force: true })
}

async function seed() {
  const bcrypt = (await import('bcryptjs')).default
  const { connectMasterDatabase, getTenantConnection } = await import('../src/config/db.js')
  const { getTenantModel } = await import('../src/models/master/Tenant.js')
  const { getAdminUserModel } = await import('../src/models/master/AdminUser.js')
  const { getTenantProductModel } = await import('../src/models/tenant/Product.js')
  const { getTenantThemeModel } = await import('../src/models/tenant/Review.js')

  const master = await connectMasterDatabase()
  await master.dropDatabase()
  await getAdminUserModel(master).create({
    id: 'admin_test',
    name: 'Test Admin',
    email: 'admin@orvexa.test',
    passwordHash: await bcrypt.hash(PASSWORDS.admin, 4),
    role: 'super_admin',
  })
  const Tenant = getTenantModel(master)
  for (const slug of ['alpha', 'bravo'] as const) {
    await Tenant.create({
      id: `tenant_${slug}`,
      slug,
      brandName: `${slug[0].toUpperCase()}${slug.slice(1)} Store`,
      ownerName: `${slug} owner`,
      ownerEmail: `${slug}@orvexa.test`,
      passwordHash: await bcrypt.hash(PASSWORDS[slug], 4),
      status: 'active',
      plan: 'pro',
      staffMembers:
        slug === 'alpha'
          ? [{ id: 'staff_alpha_1', name: 'Alpha Staff', email: 'staff@alpha.test', passwordHash: await bcrypt.hash(PASSWORDS.staff, 4), role: 'staff', createdAt: new Date().toISOString() }]
          : [],
    })
    const conn = await getTenantConnection(slug)
    await conn.dropDatabase()
  }

  const alpha = await getTenantConnection('alpha')
  const bravo = await getTenantConnection('bravo')
  const product = (id: number, name: string, price: number, stockCount: number) => ({
    id,
    name,
    category: 'test',
    price,
    priceFormatted: `₹${price}`,
    imgMain: 'https://img.test/p.jpg',
    stockCount,
    sizes: ['S', 'M'],
  })
  await getTenantProductModel(alpha).create([product(1, 'Alpha Last Unit Dress', 1000, 2), product(2, 'Alpha Scarf', 200, 5)])
  await getTenantProductModel(bravo).create([product(1, 'Bravo Secret Jacket', 5000, 3), product(3, 'Bravo Only Item', 300, 3)])
  await getTenantThemeModel(alpha).create({ discountCode: 'SAVE10', discountPercent: 10, freeShippingThreshold: 999, shippingFee: 70 })
}

// ─── HTTP helpers ──────────────────────────────────────────

export interface Res {
  status: number
  body: any
  headers: Headers
}

export async function api(method: string, url: string, opts: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...opts.headers }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  let body: string | undefined
  if (opts.raw !== undefined) body = opts.raw
  else if (opts.body !== undefined) body = JSON.stringify(opts.body)
  if (body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${baseUrl}${url}`, { method, headers, body })
  const text = await res.text()
  let parsed: any = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // keep text
  }
  return { status: res.status, body: parsed, headers: res.headers }
}

export async function login(loginId: string, password: string) {
  const r = await api('POST', '/api/auth/login', { body: { loginId, password } })
  if (r.status !== 200) throw new Error(`login ${loginId} failed: ${r.status} ${JSON.stringify(r.body)}`)
  return r.body as { accessToken: string; refreshToken: string }
}

export function signedSignup(payload: unknown) {
  const raw = JSON.stringify(payload)
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = 'sha256=' + crypto.createHmac('sha256', SIGNING_SECRET).update(`${ts}.${raw}`).digest('hex')
  return api('POST', '/api/public/signups', {
    raw,
    headers: { 'Content-Type': 'application/json', 'x-orvexa-timestamp': ts, 'x-orvexa-signature': sig },
  })
}

export const order = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  items,
  shippingAddress: { name: 'Test Shopper', phone: '+91 98765 43210', address: '1 Test Street', city: 'Pune', state: 'MH', pincode: '411001' },
  paymentMethod: 'COD',
  ...extra,
})

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
