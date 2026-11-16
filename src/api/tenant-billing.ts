import { authService } from '@/api/auth'
import { resolveApiBase } from '@/api/base'

export type TenantBillingSummary = {
  plan: string
  label: string
  cycle: 'monthly' | 'yearly'
  status: string
  paymentState: 'paid' | 'trial' | 'due' | 'past_due' | 'cancelled' | 'custom'
  needsPayment: boolean
  trialEndsAt: string | null
  nextBillingDate: string | null
  amountExTax: number
  tax: number
  total: number
  razorpayKeyId?: string
  upiVpa?: string
  mode?: string
  invoices?: Array<{ id: string; amount: number; status: string; date: string; description: string }>
}

type OrderResult = {
  free?: boolean
  message?: string
  keyId?: string
  orderId?: string
  amount?: number
  currency?: string
  plan?: string
  label?: string
  cycle?: string
  amountExTax?: number
  tax?: number
  total?: number
}

type RazorpayOrderResponse = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

let scriptPromise: Promise<void> | null = null

function loadRazorpay(): Promise<void> {
  if ((window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://checkout.razorpay.com/v1/checkout.js'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => {
        scriptPromise = null
        reject(new Error('Could not load Razorpay checkout.'))
      }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

async function storeBillingFetch(slug: string, path: string, init: RequestInit = {}) {
  return authService.storeAuthFetch(`${resolveApiBase()}/stores/${encodeURIComponent(slug)}${path}`, init)
}

export async function fetchTenantBilling(slug: string): Promise<TenantBillingSummary> {
  const res = await storeBillingFetch(slug, '/billing')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Could not load billing.')
  return data as TenantBillingSummary
}

export async function payTenantSubscription(opts: {
  slug: string
  cycle?: 'monthly' | 'yearly'
  prefill: { name: string; email: string; contact?: string }
}): Promise<TenantBillingSummary> {
  const orderRes = await storeBillingFetch(opts.slug, '/billing/subscribe-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cycle: opts.cycle || 'monthly' }),
  })
  const order = (await orderRes.json().catch(() => ({}))) as OrderResult
  if (!orderRes.ok) throw new Error((order as { error?: string }).error || 'Could not start payment.')
  if (order.free) throw new Error(order.message || 'This plan is billed by contract.')

  if (!order.keyId || !order.orderId || !order.amount) {
    throw new Error('Payment order was incomplete. Check platform Razorpay keys.')
  }

  await loadRazorpay()
  const payment = await new Promise<RazorpayOrderResponse>((resolve, reject) => {
    const rzp = new (window as unknown as {
      Razorpay: new (opts: Record<string, unknown>) => {
        open: () => void
        on: (event: string, cb: (e: { error?: { description?: string } }) => void) => void
      }
    }).Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency || 'INR',
      order_id: order.orderId,
      name: 'Orvexa Cloud',
      description: `${order.label || 'Plan'} subscription`,
      prefill: opts.prefill,
      notes: { slug: opts.slug, plan: order.plan || '', cycle: order.cycle || 'monthly' },
      theme: { color: '#12163a' },
      handler: (r: RazorpayOrderResponse) => resolve(r),
      modal: { ondismiss: () => reject(new Error('Payment cancelled.')) },
    })
    rzp.on('payment.failed', (e) => reject(new Error(e?.error?.description || 'Payment failed.')))
    rzp.open()
  })

  const verifyRes = await storeBillingFetch(opts.slug, '/billing/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payment),
  })
  const verified = await verifyRes.json().catch(() => ({}))
  if (!verifyRes.ok) throw new Error(verified.error || 'Could not verify payment.')
  return (verified.billing || (await fetchTenantBilling(opts.slug))) as TenantBillingSummary
}
