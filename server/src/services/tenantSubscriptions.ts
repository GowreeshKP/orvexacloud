import { connectMasterDatabase } from '../config/db.js'
import { getTenantModel, type ITenant } from '../models/master/Tenant.js'
import { PLAN_CATALOG, PLATFORM_ROOT_DOMAIN, normalizePlanId, planPricePerMonth, TRIAL_DAYS, type PlanId } from '../config/plans.js'
import { sendEmail } from './mailer.js'
import { subscriptionAmountPaise } from './platformPayments.js'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function daysFrom(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function daysUntil(isoDate: string | undefined): number | null {
  if (!isoDate) return null
  const target = Date.parse(`${isoDate.slice(0, 10)}T12:00:00.000Z`)
  if (!Number.isFinite(target)) return null
  const now = Date.parse(`${todayISO()}T12:00:00.000Z`)
  return Math.round((target - now) / (24 * 60 * 60 * 1000))
}

export type BillingPaymentState = 'paid' | 'trial' | 'due' | 'past_due' | 'cancelled' | 'custom'

export function paymentStateForTenant(tenant: {
  plan?: string
  subscription?: {
    plan?: string
    pricePerMonth?: number
    status?: string
    trialEndsAt?: string
    nextBillingDate?: string
  } | null
}): BillingPaymentState {
  const plan = normalizePlanId(tenant.plan || tenant.subscription?.plan)
  if (plan === 'enterprise' && (tenant.subscription?.pricePerMonth ?? PLAN_CATALOG.enterprise.pricePerMonth) <= 0) {
    return 'custom'
  }
  const status = String(tenant.subscription?.status || 'trial')
  if (status === 'cancelled') return 'cancelled'
  if (status === 'active') return 'paid'
  if (status === 'past_due') return 'past_due'
  if (status === 'trial') {
    const left = daysUntil(tenant.subscription?.trialEndsAt || tenant.subscription?.nextBillingDate)
    if (left != null && left < 0) return 'past_due'
    return 'trial'
  }
  const due = daysUntil(tenant.subscription?.nextBillingDate)
  if (due != null && due < 0) return 'past_due'
  if (due != null && due <= 7) return 'due'
  return status === 'active' ? 'paid' : 'due'
}

export function subscriptionNeedsPayment(tenant: {
  plan?: string
  subscription?: { status?: string; trialEndsAt?: string; nextBillingDate?: string; pricePerMonth?: number } | null
}): boolean {
  const state = paymentStateForTenant(tenant)
  return state === 'trial' || state === 'due' || state === 'past_due'
}

/** Mark expired trials / overdue renewals as past_due. Returns number updated. */
export async function syncSubscriptionStatuses(): Promise<number> {
  const db = await connectMasterDatabase()
  const Tenant = getTenantModel(db)
  const today = todayISO()
  const rows = await Tenant.find({
    'subscription.status': { $in: ['trial', 'active'] },
  }).select('id subscription plan')

  let updated = 0
  for (const row of rows) {
    const sub = row.subscription
    if (!sub) continue
    const checkpoint = (sub.status === 'trial' ? sub.trialEndsAt || sub.nextBillingDate : sub.nextBillingDate) || ''
    if (!checkpoint || checkpoint.slice(0, 10) >= today) continue
    if (sub.status === 'past_due') continue
    sub.status = 'past_due'
    await row.save()
    updated += 1
  }
  return updated
}

export async function applyTenantSubscriptionPayment(input: {
  slug: string
  orderId: string
  paymentId: string
  plan?: string
  cycle?: 'monthly' | 'yearly'
  totalInr: number
}): Promise<ITenant | null> {
  const db = await connectMasterDatabase()
  const Tenant = getTenantModel(db)
  const tenant = await Tenant.findOne({ slug: input.slug })
  if (!tenant) return null

  const plan = normalizePlanId(input.plan || tenant.plan || tenant.subscription?.plan)
  const cycle = input.cycle || (tenant.subscription?.cycle === 'yearly' ? 'yearly' : 'monthly')
  const next = daysFrom(todayISO(), cycle === 'yearly' ? 365 : 30)
  const invoice = {
    id: input.paymentId || input.orderId,
    amount: input.totalInr,
    status: 'paid',
    date: todayISO(),
    description: `${PLAN_CATALOG[plan].label} · ${cycle} · Razorpay`,
  }

  tenant.plan = plan
  tenant.subscription = {
    plan,
    cycle,
    pricePerMonth: planPricePerMonth(plan, cycle),
    status: 'active',
    trialEndsAt: tenant.subscription?.trialEndsAt || '',
    nextBillingDate: next,
    paymentMethod: 'razorpay',
    invoices: [invoice, ...(tenant.subscription?.invoices || [])].slice(0, 24),
  }
  await tenant.save()
  return tenant
}

export function pricedSubscriptionForTenant(tenant: {
  plan?: string
  subscription?: { plan?: string; cycle?: string; pricePerMonth?: number } | null
}) {
  const plan = normalizePlanId(tenant.plan || tenant.subscription?.plan)
  const cycle = tenant.subscription?.cycle === 'yearly' ? 'yearly' : 'monthly'
  return subscriptionAmountPaise(plan, cycle)
}

/** Send upcoming / expired reminders. Safe to call often — uses idempotency keys per day. */
export async function sendSubscriptionReminders(limit = 40): Promise<{ sent: number }> {
  const db = await connectMasterDatabase()
  const Tenant = getTenantModel(db)
  const tenants = await Tenant.find({
    status: { $in: ['active', 'read_only', 'pending'] },
    'subscription.status': { $in: ['trial', 'past_due', 'active'] },
  })
    .select('slug brandName ownerName ownerEmail plan subscription')
    .limit(200)

  let sent = 0
  for (const tenant of tenants) {
    if (sent >= limit) break
    const plan = normalizePlanId(tenant.plan || tenant.subscription?.plan)
    if (plan === 'enterprise' && (tenant.subscription?.pricePerMonth || 0) <= 0) continue

    const state = paymentStateForTenant(tenant)
    const dueDate = (tenant.subscription?.status === 'trial'
      ? tenant.subscription?.trialEndsAt || tenant.subscription?.nextBillingDate
      : tenant.subscription?.nextBillingDate) || ''
    const left = daysUntil(dueDate)
    if (left == null) continue

    // 7-day trial: remind at 3 days and 1 day before due, then on expiry.
    let kind: 'upcoming3' | 'upcoming1' | 'expired' | null = null
    if (state === 'past_due' || (left < 0 && state !== 'paid')) kind = 'expired'
    else if (left === 1) kind = 'upcoming1'
    else if (left === 3) kind = 'upcoming3'
    if (!kind) continue

    const priced = pricedSubscriptionForTenant(tenant)
    const dash = `https://app.${PLATFORM_ROOT_DOMAIN}/dashboard/${tenant.slug}`
    const subject =
      kind === 'expired'
        ? `Action needed: ${tenant.brandName} subscription payment`
        : `Reminder: ${tenant.brandName} plan renews in ${left} day${left === 1 ? '' : 's'}`

    const text = [
      `Hi ${tenant.ownerName || 'there'},`,
      '',
      kind === 'expired'
        ? `Your ${PLAN_CATALOG[plan].label} plan for ${tenant.brandName} needs payment. Pay from your tenant dashboard to keep the store fully active.`
        : `Your ${PLAN_CATALOG[plan].label} plan for ${tenant.brandName} is due on ${dueDate.slice(0, 10)}. There is no auto-pay — please pay from your dashboard when ready.`,
      '',
      `Amount (incl. 18% GST): ₹${priced.total.toLocaleString('en-IN')}`,
      `Pay here: ${dash} → Settings → Subscription`,
      '',
      'The Orvexa Cloud team',
    ].join('\n')

    const ok = await sendEmail({
      to: tenant.ownerEmail,
      subject,
      text,
      idempotencyKey: `sub-reminder-${tenant.slug}-${kind}-${todayISO()}`,
    })
    if (ok) sent += 1

    // Notify platform ops (optional MAIL_REPLY_TO / SUPPORT)
    const ops = (process.env.MAIL_REPLY_TO || process.env.SUPPORT_EMAIL || '').trim()
    if (ops && (kind === 'expired' || kind === 'upcoming1')) {
      await sendEmail({
        to: ops,
        subject: `[Billing] ${tenant.slug} · ${kind} · ${PLAN_CATALOG[plan].label}`,
        text: [
          `Tenant: ${tenant.brandName} (${tenant.slug})`,
          `Owner: ${tenant.ownerEmail}`,
          `State: ${state}`,
          `Due: ${dueDate}`,
          `Amount: ₹${priced.total.toLocaleString('en-IN')}`,
          `Dashboard: ${dash}`,
        ].join('\n'),
        idempotencyKey: `sub-ops-${tenant.slug}-${kind}-${todayISO()}`,
      })
    }
  }
  return { sent }
}

export function billingSummary(tenant: ITenant | { plan?: string; subscription?: ITenant['subscription']; slug?: string; brandName?: string }) {
  const plan = normalizePlanId(tenant.plan || tenant.subscription?.plan) as PlanId
  const cycle = tenant.subscription?.cycle === 'yearly' ? 'yearly' : 'monthly'
  const priced = subscriptionAmountPaise(plan, cycle)
  const state = paymentStateForTenant(tenant)
  const needsPayment = subscriptionNeedsPayment(tenant)
  return {
    plan,
    label: PLAN_CATALOG[plan].label,
    cycle,
    status: tenant.subscription?.status || 'trial',
    paymentState: state,
    needsPayment,
    trialDays: TRIAL_DAYS,
    trialEndsAt: tenant.subscription?.trialEndsAt || null,
    nextBillingDate: tenant.subscription?.nextBillingDate || null,
    amountExTax: priced.amountExTax,
    tax: priced.tax,
    total: priced.total,
    invoices: tenant.subscription?.invoices || [],
  }
}
