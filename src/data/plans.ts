// --- Subscription Plan Catalog ---
// India list prices (monthly, before 18% GST) from the marketing site's shared/pricing.js.
// Internal ids stay 'starter' | 'pro' | 'enterprise'; the website's 'growth' id maps to 'pro'.
// Mirrors server/src/config/plans.ts.

export type PlanId = 'starter' | 'pro' | 'enterprise'

export const TRIAL_DAYS = 30

export const PLATFORM_ROOT_DOMAIN = 'orvexacloud.in'

export const PLAN_CATALOG: Record<PlanId, { label: string; pricePerMonth: number; highlight: string }> = {
  starter: { label: 'Starter', pricePerMonth: 1460, highlight: 'Up to 100 products' },
  pro: { label: 'Growth Pro', pricePerMonth: 3660, highlight: 'Custom domain + SSL' },
  // Enterprise Plus is priced per contract; 0 means "custom" until the admin sets a price.
  enterprise: { label: 'Enterprise Plus', pricePerMonth: 0, highlight: 'Dedicated clusters' },
}

export const PLAN_IDS = Object.keys(PLAN_CATALOG) as PlanId[]

export function normalizePlanId(id: unknown): PlanId {
  if (id === 'growth' || id === 'pro') return 'pro'
  if (id === 'enterprise' || id === 'enterprise_plus') return 'enterprise'
  return 'starter'
}

export function formatPlanPrice(pricePerMonth: number): string {
  return pricePerMonth > 0 ? `₹${pricePerMonth.toLocaleString('en-IN')}/mo` : 'Custom'
}

/** Public store address on the platform (approved tenant subdomain). */
export function storeAddress(slug: string): string {
  return `${slug.trim().toLowerCase()}.${PLATFORM_ROOT_DOMAIN}`
}
