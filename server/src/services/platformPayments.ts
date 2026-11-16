import crypto from 'crypto'
import { connectMasterDatabase } from '../config/db.js'
import { getPlatformSettingsModel } from '../models/master/PlatformSettings.js'
import { PLAN_CATALOG, normalizePlanId, planPricePerMonth, type PlanId } from '../config/plans.js'

/** Demo / local fallbacks — override via env or Super Admin → Billing. */
const DEMO = {
  razorpayKeyId: 'rzp_test_ThWFJUpLEfWZIZ',
  razorpayKeySecret: 'dSXd4j9UxO1wi2iyitndO8An',
  upiVpa: 'samfriend090@oksbi',
} as const

export type PlatformPaymentConfig = {
  razorpayKeyId: string
  razorpayKeySecret: string
  upiVpa: string
  source: 'env' | 'database' | 'demo'
}

function envConfig(): Partial<PlatformPaymentConfig> {
  return {
    razorpayKeyId: (process.env.PLATFORM_RAZORPAY_KEY_ID || '').trim(),
    razorpayKeySecret: (process.env.PLATFORM_RAZORPAY_KEY_SECRET || '').trim(),
    upiVpa: (process.env.PLATFORM_UPI_VPA || '').trim(),
  }
}

export async function getPlatformPaymentConfig(): Promise<PlatformPaymentConfig> {
  const env = envConfig()
  try {
    const db = await connectMasterDatabase()
    const doc = await getPlatformSettingsModel(db).findOne({ id: 'platform' }).lean()
    const keyId = env.razorpayKeyId || doc?.razorpayKeyId || DEMO.razorpayKeyId
    const keySecret = env.razorpayKeySecret || doc?.razorpayKeySecret || DEMO.razorpayKeySecret
    const upiVpa = env.upiVpa || doc?.upiVpa || DEMO.upiVpa
    const source: PlatformPaymentConfig['source'] =
      env.razorpayKeyId && env.razorpayKeySecret ? 'env' : doc?.razorpayKeyId && doc?.razorpayKeySecret ? 'database' : 'demo'
    return { razorpayKeyId: keyId, razorpayKeySecret: keySecret, upiVpa, source }
  } catch {
    return {
      razorpayKeyId: env.razorpayKeyId || DEMO.razorpayKeyId,
      razorpayKeySecret: env.razorpayKeySecret || DEMO.razorpayKeySecret,
      upiVpa: env.upiVpa || DEMO.upiVpa,
      source: env.razorpayKeyId ? 'env' : 'demo',
    }
  }
}

export async function savePlatformPaymentConfig(
  input: { razorpayKeyId?: string; razorpayKeySecret?: string; upiVpa?: string },
  updatedBy: string,
): Promise<PlatformPaymentConfig> {
  const db = await connectMasterDatabase()
  const Model = getPlatformSettingsModel(db)
  const current = await Model.findOne({ id: 'platform' })
  const next = {
    razorpayKeyId: (input.razorpayKeyId ?? current?.razorpayKeyId ?? '').trim(),
    razorpayKeySecret: (input.razorpayKeySecret ?? current?.razorpayKeySecret ?? '').trim(),
    upiVpa: (input.upiVpa ?? current?.upiVpa ?? '').trim(),
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  await Model.findOneAndUpdate({ id: 'platform' }, { $set: { id: 'platform', ...next } }, { upsert: true })
  return getPlatformPaymentConfig()
}

export function maskSecret(secret: string): string {
  if (!secret) return ''
  if (secret.length <= 8) return '••••••••'
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`
}

/** Amount in paise (INR) for a plan cycle, including 18% GST. Enterprise custom (0) → 0. */
export function subscriptionAmountPaise(planId: unknown, cycle: 'monthly' | 'yearly' = 'monthly'): {
  plan: PlanId
  amountPaise: number
  amountExTax: number
  tax: number
  total: number
  label: string
} {
  const plan = normalizePlanId(planId)
  const amountExTax = planPricePerMonth(plan, cycle) * (cycle === 'yearly' ? 12 : 1)
  const tax = Math.round(amountExTax * 0.18)
  const total = amountExTax + tax
  return {
    plan,
    amountPaise: Math.round(total * 100),
    amountExTax,
    tax,
    total,
    label: PLAN_CATALOG[plan].label,
  }
}

export async function createRazorpayOrder(params: {
  amountPaise: number
  receipt: string
  notes?: Record<string, string>
}): Promise<{ id: string; amount: number; currency: string; receipt: string }> {
  if (params.amountPaise <= 0) throw new Error('Amount must be greater than zero.')
  const cfg = await getPlatformPaymentConfig()
  const auth = Buffer.from(`${cfg.razorpayKeyId}:${cfg.razorpayKeySecret}`).toString('base64')
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: 'INR',
      receipt: params.receipt.slice(0, 40),
      notes: params.notes || {},
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { id?: string; amount?: number; currency?: string; receipt?: string; error?: { description?: string } }
  if (!res.ok || !data.id) {
    throw new Error(data.error?.description || 'Could not create Razorpay order.')
  }
  return {
    id: data.id,
    amount: data.amount || params.amountPaise,
    currency: data.currency || 'INR',
    receipt: data.receipt || params.receipt,
  }
}

export async function verifyRazorpaySignature(payload: {
  orderId: string
  paymentId: string
  signature: string
}): Promise<boolean> {
  const cfg = await getPlatformPaymentConfig()
  const body = `${payload.orderId}|${payload.paymentId}`
  const expected = crypto.createHmac('sha256', cfg.razorpayKeySecret).update(body).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(payload.signature || '')))
  } catch {
    return false
  }
}

export function publicPaymentConfig(cfg: PlatformPaymentConfig) {
  return {
    keyId: cfg.razorpayKeyId,
    upiVpa: cfg.upiVpa,
    mode: cfg.razorpayKeyId.startsWith('rzp_live') ? 'live' : 'test',
    currency: 'INR',
  }
}
