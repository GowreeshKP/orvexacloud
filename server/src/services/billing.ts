// Subscription lifecycle and Razorpay. List prices exclude 18% GST.
// Trial end or a failed payment puts the store in read-only for GRACE_DAYS, then suspends it.
import crypto from 'crypto'
import type { ITenant } from '../models/master/Tenant.js'
import { getTenantModel } from '../models/master/Tenant.js'
import { connectMasterDatabase, getTenantConnection } from '../config/db.js'
import { getTenantProductModel } from '../models/tenant/Product.js'
import { getTenantOrderModel } from '../models/tenant/Order.js'
import { getTenantReviewModel } from '../models/tenant/Review.js'
import { GST_RATE, GRACE_DAYS, PLAN_CATALOG, normalizePlanId, planPricePerMonth, type PlanId } from '../config/plans.js'
import { sendEmail } from './mailer.js'
import { publicAppUrl } from './ownerPasswordLink.js'

const GRACE_MS = GRACE_DAYS * 24 * 60 * 60 * 1000
const planIds = new Map<string, string>()

export function billingConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

/** Charge in paise, GST included. Enterprise (price 0) is not self-serve. */
export function chargeAmountPaise(plan: PlanId, cycle: 'monthly' | 'yearly'): number {
  const monthly = planPricePerMonth(plan, cycle)
  if (monthly <= 0) return 0
  const exTax = monthly * (cycle === 'yearly' ? 12 : 1)
  return Math.round(exTax * (1 + GST_RATE)) * 100
}

type SubscriptionShape = NonNullable<ITenant['subscription']>

function subscriptionOf(tenant: ITenant): SubscriptionShape {
  if (!tenant.subscription) {
    tenant.subscription = {
      plan: tenant.plan,
      pricePerMonth: PLAN_CATALOG[normalizePlanId(tenant.plan)].pricePerMonth,
      status: 'trial',
      cycle: 'monthly',
      nextBillingDate: '',
      paymentMethod: 'razorpay',
      invoices: [],
    }
  }
  return tenant.subscription
}

/** Moves a store through trial → read-only grace → suspended. Manual suspensions are left alone. */
export async function applyStoreBilling(tenant: ITenant): Promise<void> {
  const sub = tenant.subscription
  if (!sub) return
  if (tenant.status === 'cancelled' || tenant.status === 'pending') return
  if ((tenant.status === 'suspended' || tenant.status === 'read_only') && !sub.billingManaged) return

  const now = Date.now()
  let changed = false
  const trialEnd = sub.trialEndsAt ? Date.parse(sub.trialEndsAt) : NaN

  if ((sub.status === 'trial' || sub.status === 'active') && sub.status === 'trial' && Number.isFinite(trialEnd) && now >= trialEnd) {
    sub.status = 'past_due'
    sub.graceEndsAt = new Date(now + GRACE_MS).toISOString()
    if (tenant.status === 'active') {
      tenant.status = 'read_only'
      sub.billingManaged = true
    }
    changed = true
  }

  if (sub.status === 'past_due') {
    if (!sub.graceEndsAt) {
      sub.graceEndsAt = new Date(now + GRACE_MS).toISOString()
      changed = true
    }
    if (now >= Date.parse(sub.graceEndsAt) && (tenant.status === 'active' || tenant.status === 'read_only')) {
      tenant.status = 'suspended'
      sub.billingManaged = true
      changed = true
    } else if (tenant.status === 'active') {
      tenant.status = 'read_only'
      sub.billingManaged = true
      changed = true
    }
  }

  if (sub.status === 'active' && sub.billingManaged && (tenant.status === 'read_only' || tenant.status === 'suspended')) {
    tenant.status = 'active'
    sub.billingManaged = false
    sub.graceEndsAt = ''
    changed = true
  }

  if (changed) await tenant.save()
}

async function razorpay<T>(path: string, method: string, body?: unknown): Promise<T> {
  const keyId = process.env.RAZORPAY_KEY_ID || ''
  const keySecret = process.env.RAZORPAY_KEY_SECRET || ''
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } }
  if (!res.ok) {
    throw new Error(data.error?.description || `Razorpay refused the request (HTTP ${res.status}).`)
  }
  return data
}

async function ensurePlan(plan: PlanId, cycle: 'monthly' | 'yearly'): Promise<string> {
  const cacheKey = `${plan}:${cycle}`
  const cached = planIds.get(cacheKey)
  if (cached) return cached
  const amount = chargeAmountPaise(plan, cycle)
  const created = await razorpay<{ id: string }>('/plans', 'POST', {
    period: cycle === 'yearly' ? 'yearly' : 'monthly',
    interval: 1,
    item: {
      name: `Orvexa ${PLAN_CATALOG[plan].label} (${cycle})`,
      amount,
      currency: 'INR',
    },
  })
  planIds.set(cacheKey, created.id)
  return created.id
}

export async function createSubscriptionCheckout(tenant: ITenant): Promise<{ subscriptionId: string; url: string }> {
  if (!billingConfigured()) throw new Error('Razorpay is not configured on this server.')
  const plan = normalizePlanId(tenant.plan)
  const sub = subscriptionOf(tenant)
  const cycle = sub.cycle === 'yearly' ? 'yearly' : 'monthly'
  if (chargeAmountPaise(plan, cycle) <= 0) {
    throw new Error('Enterprise Plus is billed by contract. There is nothing to pay in the dashboard.')
  }
  const planId = await ensurePlan(plan, cycle)
  const created = await razorpay<{ id: string; short_url?: string }>('/subscriptions', 'POST', {
    plan_id: planId,
    total_count: cycle === 'yearly' ? 10 : 120,
    customer_notify: 1,
    notes: { tenantSlug: tenant.slug, tenantId: tenant.id },
  })
  sub.razorpaySubscriptionId = created.id
  sub.paymentMethod = 'razorpay'
  await tenant.save()
  if (!created.short_url) throw new Error('Razorpay did not return a payment link.')
  return { subscriptionId: created.id, url: created.short_url }
}

function invoiceFor(sub: SubscriptionShape, paymentId: string) {
  const cycle = sub.cycle === 'yearly' ? 'yearly' : 'monthly'
  const monthly = sub.pricePerMonth || planPricePerMonth(normalizePlanId(sub.plan), cycle)
  const amountExTax = monthly * (cycle === 'yearly' ? 12 : 1)
  const tax = Math.round(amountExTax * GST_RATE)
  return {
    id: paymentId,
    amount: amountExTax + tax,
    amountExTax,
    tax,
    gstRate: Math.round(GST_RATE * 100),
    status: 'paid' as const,
    date: new Date().toISOString().slice(0, 10),
    description: `${PLAN_CATALOG[normalizePlanId(sub.plan)].label} ${cycle} · incl. ${Math.round(GST_RATE * 100)}% GST`,
  }
}

async function tenantBySlug(slug: string): Promise<ITenant | null> {
  const db = await connectMasterDatabase()
  return getTenantModel(db).findOne({ slug })
}

export async function markSubscriptionPaid(slug: string, paymentId: string): Promise<void> {
  const tenant = await tenantBySlug(slug)
  if (!tenant) return
  const sub = subscriptionOf(tenant)
  if (sub.invoices?.some((invoice) => invoice.id === paymentId)) return
  sub.status = 'active'
  sub.graceEndsAt = ''
  sub.billingManaged = false
  const cycle = sub.cycle === 'yearly' ? 'yearly' : 'monthly'
  const next = new Date()
  next.setMonth(next.getMonth() + (cycle === 'yearly' ? 12 : 1))
  sub.nextBillingDate = next.toISOString().slice(0, 10)
  sub.invoices = [...(sub.invoices || []), invoiceFor(sub, paymentId)]
  if (tenant.status === 'read_only' || tenant.status === 'suspended') tenant.status = 'active'
  await tenant.save()
}

export async function markSubscriptionPastDue(slug: string): Promise<void> {
  const tenant = await tenantBySlug(slug)
  if (!tenant || tenant.status === 'cancelled' || tenant.status === 'pending') return
  const sub = subscriptionOf(tenant)
  sub.status = 'past_due'
  sub.graceEndsAt = new Date(Date.now() + GRACE_MS).toISOString()
  sub.billingManaged = true
  if (tenant.status === 'active') tenant.status = 'read_only'
  await tenant.save()
}

export function verifyRazorpaySignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || ''
  if (!secret || !signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function handleRazorpayEvent(event: {
  event?: string
  payload?: {
    subscription?: { entity?: { id?: string; notes?: { tenantSlug?: string } } }
    payment?: { entity?: { id?: string; notes?: { tenantSlug?: string } } }
  }
}): Promise<void> {
  let slug =
    event.payload?.subscription?.entity?.notes?.tenantSlug ||
    event.payload?.payment?.entity?.notes?.tenantSlug ||
    ''
  const subscriptionId = event.payload?.subscription?.entity?.id
  if (!slug && subscriptionId) {
    const db = await connectMasterDatabase()
    const match = await getTenantModel(db).findOne({ 'subscription.razorpaySubscriptionId': subscriptionId })
    slug = match?.slug || ''
  }
  if (!slug) return
  const name = event.event || ''
  if (name === 'subscription.charged' || name === 'payment.captured' || name === 'order.paid') {
    const paymentId = event.payload?.payment?.entity?.id || `pay_${crypto.randomUUID()}`
    await markSubscriptionPaid(slug, paymentId)
    return
  }
  if (name === 'payment.failed' || name === 'subscription.halted') {
    await markSubscriptionPastDue(slug)
  }
}

export async function buildStoreExport(tenant: ITenant) {
  const conn = await getTenantConnection(tenant.slug, tenant.customMongoUri)
  const [products, orders, reviews] = await Promise.all([
    getTenantProductModel(conn).find().lean(),
    getTenantOrderModel(conn).find().lean(),
    getTenantReviewModel(conn).find().lean(),
  ])
  return {
    brandName: tenant.brandName,
    slug: tenant.slug,
    exportedAt: new Date().toISOString(),
    products,
    orders,
    reviews,
  }
}

export async function issueCancellationExport(tenant: ITenant): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex')
  tenant.exportTokenHash = sha256(token)
  tenant.exportTokenExpires = new Date(Date.now() + GRACE_MS)
  await tenant.save()
  const url = `${publicAppUrl()}/api/billing/export?token=${token}`
  await sendEmail({
    to: tenant.ownerEmail,
    subject: `Download your ${tenant.brandName} store data`,
    idempotencyKey: `export-${tenant.id}-${tenant.exportTokenExpires.toISOString().slice(0, 10)}`,
    text: [
      `Hi ${tenant.ownerName || 'there'},`,
      '',
      `${tenant.brandName} is closed. This link downloads your products, orders and reviews. It works for ${GRACE_DAYS} days:`,
      url,
      '',
      'The Orvexa Cloud team',
    ].join('\n'),
  })
}

export async function exportByToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null
  const db = await connectMasterDatabase()
  const tenant = await getTenantModel(db).findOne({
    exportTokenHash: sha256(token),
    exportTokenExpires: { $gt: new Date() },
  })
  if (!tenant) return null
  return buildStoreExport(tenant)
}
