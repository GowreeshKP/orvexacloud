import { authService } from '@/api/auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

function sessionId(): string {
  try {
    const key = 'orvexa_sf_session'
    let id = sessionStorage.getItem(key)
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`
      sessionStorage.setItem(key, id)
    }
    return id
  } catch {
    return ''
  }
}

export function trackStorefrontEvent(
  slug: string,
  type: 'page_view' | 'shopper_signin' | 'shopper_register',
  path = typeof window !== 'undefined' ? window.location.pathname : '/'
) {
  if (!slug) return
  const payload = JSON.stringify({ type, path, sessionId: sessionId() })
  const url = `${API_BASE}/stores/${encodeURIComponent(slug)}/events`
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => undefined)
}

export async function submitStorefrontOrder(
  slug: string,
  body: {
    items: Array<{ productId: number; quantity: number; size?: string; lining?: string; zip?: string; length?: string }>
    shippingAddress: { name: string; phone: string; address: string; city: string; state: string; pincode: string }
    customerEmail?: string
    paymentMethod: string
    discountCode?: string
  }
) {
  const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, sessionId: sessionId() }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) return { error: data?.error || 'This store could not take the order.' }
  return data
}

export async function fetchStoreAnalytics(slug: string, days = 7) {
  const token = authService.getSellerToken()
  const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/analytics?days=${days}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return null
  return res.json() as Promise<{
    days: number
    pageViews: number
    visitors: number
    signIns: number
    orders: number
    revenue: number
    byDay: { date: string; pageViews: number; visitors: number; signIns: number; orders: number; revenue: number }[]
    storefrontPath: string
    dashboardPath: string
    customDomain: string
    customDomainVerified: boolean
  }>
}

export async function saveCustomDomain(slug: string, customDomain: string) {
  const token = authService.getSellerToken()
  const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/domain`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ customDomain }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Could not save the domain.')
  return data as { customDomain: string; verified: boolean; cnameTarget: string; message: string }
}

export async function fetchDomainConfig(slug: string) {
  const token = authService.getSellerToken()
  const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/domain`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return null
  return res.json() as Promise<{
    portalUrl: string
    dashboardUrl: string
    customDomain: string
    verified: boolean
    cnameTarget: string
    records: { type: string; name: string; value: string; note: string }[]
  }>
}
