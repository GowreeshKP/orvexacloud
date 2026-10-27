// --- Subscription Plan Catalog ---
// India list prices (monthly, before 18% GST) from the marketing site's shared/pricing.js.
// Internal ids stay 'starter' | 'pro' | 'enterprise'; the website's 'growth' id maps to 'pro'.

export type PlanId = 'starter' | 'pro' | 'enterprise'

export const TRIAL_DAYS = 30

// maxProducts: null = unlimited.
export const PLAN_CATALOG: Record<PlanId, { label: string; pricePerMonth: number; maxProducts: number | null }> = {
  starter: { label: 'Starter', pricePerMonth: 1460, maxProducts: 100 },
  pro: { label: 'Growth Pro', pricePerMonth: 3660, maxProducts: null },
  // Enterprise Plus is priced per contract; 0 means "custom" and is set by hand.
  enterprise: { label: 'Enterprise Plus', pricePerMonth: 0, maxProducts: null },
}

export const YEARLY_DISCOUNT = 0.1

/** Monthly-equivalent list price before tax: yearly billing is 12 months at 90%. */
export function planPricePerMonth(plan: PlanId, cycle: 'monthly' | 'yearly' = 'monthly'): number {
  const monthly = PLAN_CATALOG[plan].pricePerMonth
  return cycle === 'yearly' ? Math.round(monthly * (1 - YEARLY_DISCOUNT)) : monthly
}

export function normalizePlanId(id: unknown): PlanId {
  if (id === 'growth' || id === 'pro') return 'pro'
  if (id === 'enterprise' || id === 'enterprise_plus') return 'enterprise'
  return 'starter'
}

export const PLATFORM_ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN || 'orvexacloud.in'
