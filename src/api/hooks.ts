// --- Custom React Hooks for Mock API ---
// Wraps the mock store with React-friendly hooks.

import { useState, useEffect, useCallback } from 'react'
import { useTenant } from '@/context/TenantContext'
import { mockStore } from '@/api/mock-store'
import { authService, DEMO_MODE } from '@/api/auth'
import { apiClient } from '@/api/client'
import { createStoreFolder } from '@/tenants/scaffold'
import type { Product, Review, TrackedOrder } from '@/types'
import type { TenantConfig, TenantApplication, PlatformStats, DashboardStats, ThemeConfig } from '@/types/tenant'
import { API_BASE } from '@/lib/api-base'
import { PLAN_CATALOG, normalizePlanId } from '@/data/plans'

// =================================================================
// STOREFRONT HOOKS (scoped to current tenant)
// =================================================================

export function useTenantProducts(): { products: Product[]; loading: boolean } {
  const { tenant } = useTenant()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenant) {
      setLoading(false)
      return
    }
    if (DEMO_MODE) {
      setProducts(mockStore.getProducts(tenant.id))
      setLoading(false)
      return
    }
    apiClient.getProducts(tenant.slug).then((list) => {
      setProducts(list)
      setLoading(false)
    })
  }, [tenant])

  return { products, loading }
}

export function useTenantReviews(): { reviews: Review[]; addReview: (r: Review) => void } {
  const { tenant } = useTenant()
  const [reviews, setReviews] = useState<Review[]>([])

  useEffect(() => {
    if (!tenant) return
    if (DEMO_MODE) {
      setReviews(mockStore.getReviews(tenant.id))
      return
    }
    apiClient.getReviews(tenant.slug).then(setReviews)
  }, [tenant])

  const addReview = useCallback((review: Review) => {
    if (!tenant) return
    if (DEMO_MODE) {
      mockStore.submitReview(tenant.id, review)
      setReviews(mockStore.getReviews(tenant.id))
      return
    }
    apiClient.postReview(tenant.slug, review).then((saved) => {
      if (saved) setReviews((prev) => [saved, ...prev])
    })
  }, [tenant])

  return { reviews, addReview }
}

export function useTenantOrders(): {
  orders: TrackedOrder[]
  placeOrder: (o: TrackedOrder) => void
  updateOrderStatus: (orderId: string, status: TrackedOrder['status'], courier?: string, awb?: string) => void
  refresh: () => void
} {
  const { tenant } = useTenant()
  const [orders, setOrders] = useState<TrackedOrder[]>([])

  const refresh = useCallback(() => {
    if (!tenant) return
    void (async () => {
      const headers = await authService.sellerAuthHeaders()
      fetch(`${API_BASE}/stores/${encodeURIComponent(tenant.slug)}/orders`, { headers })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (Array.isArray(data)) setOrders(data)
          else if (DEMO_MODE) setOrders([...mockStore.getOrders(tenant.id)])
          else setOrders([])
        })
        .catch(() => setOrders(DEMO_MODE ? [...mockStore.getOrders(tenant.id)] : []))
    })()
  }, [tenant])

  useEffect(() => {
    refresh()
  }, [refresh])

  const placeOrder = useCallback((order: TrackedOrder) => {
    if (!tenant) return
    if (DEMO_MODE) {
      mockStore.placeOrder(tenant.id, order)
      refresh()
      return
    }
    apiClient.placeOrder(tenant.slug, order).then(() => refresh()).catch(() => undefined)
  }, [tenant, refresh])

  const updateOrderStatus = useCallback((orderId: string, status: TrackedOrder['status'], courier?: string, awb?: string) => {
    if (!tenant) return
    mockStore.updateOrderStatus(tenant.id, orderId, status, courier, awb)
    void authService.sellerAuthHeaders().then((headers) =>
      fetch(`${API_BASE}/stores/${encodeURIComponent(tenant.slug)}/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status, courier, awb }),
      }).catch(() => undefined)
    )
    refresh()
  }, [tenant, refresh])

  return { orders, placeOrder, updateOrderStatus, refresh }
}

// =================================================================
// DASHBOARD HOOKS (tenant owner managing their store)
// =================================================================

export function useDashboardStats(): { stats: DashboardStats | null; loading: boolean } {
  const { tenant } = useTenant()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenant) {
      setLoading(false)
      return
    }
    if (DEMO_MODE) {
      setStats(mockStore.getDashboardStats(tenant.id))
      setLoading(false)
      return
    }
    apiClient.getOrders(tenant.slug).then((orders) => {
      const revenue = orders.reduce((sum, order) => sum + (order.total || 0), 0)
      setStats({
        revenue,
        revenueChange: 0,
        orderCount: orders.length,
        orderCountChange: 0,
        averageOrderValue: orders.length ? Math.round(revenue / orders.length) : 0,
        customerCount: new Set(orders.map((order) => order.customerEmail || order.shippingAddress?.name || order.id)).size,
        topProducts: [],
        recentOrders: orders.slice(0, 5).map((order) => ({
          id: order.id,
          customer: order.shippingAddress?.name || 'Customer',
          total: order.total,
          status: order.status,
          date: order.date,
        })),
        revenueByDay: [],
      })
      setLoading(false)
    })
  }, [tenant])

  return { stats, loading }
}

export function useDashboardProducts(): {
  products: Product[]
  addProduct: (p: Product) => void
  updateProduct: (id: number, data: Partial<Product>) => void
  deleteProduct: (id: number) => void
  refresh: () => void
} {
  const { tenant } = useTenant()
  const [products, setProducts] = useState<Product[]>([])

  const refresh = useCallback(() => {
    if (!tenant) return
    if (DEMO_MODE) {
      setProducts([...mockStore.getProducts(tenant.id)])
      return
    }
    apiClient.getProducts(tenant.slug).then(setProducts)
  }, [tenant])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addProduct = useCallback((product: Product) => {
    if (!tenant) return
    if (DEMO_MODE) {
      mockStore.addProduct(tenant.id, product)
      refresh()
      return
    }
    apiClient.addProduct(tenant.slug, product).then(() => refresh()).catch(() => undefined)
  }, [tenant, refresh])

  const updateProduct = useCallback((id: number, data: Partial<Product>) => {
    if (!tenant) return
    if (DEMO_MODE) {
      mockStore.updateProduct(tenant.id, id, data)
      refresh()
      return
    }
    apiClient.updateProduct(tenant.slug, id, data).then(() => refresh())
  }, [tenant, refresh])

  const deleteProduct = useCallback((id: number) => {
    if (!tenant) return
    if (DEMO_MODE) {
      mockStore.deleteProduct(tenant.id, id)
      refresh()
      return
    }
    apiClient.deleteProduct(tenant.slug, id).then(() => refresh())
  }, [tenant, refresh])

  return { products, addProduct, updateProduct, deleteProduct, refresh }
}

export function useThemeCustomizer(): {
  theme: ThemeConfig | null
  tenant: TenantConfig | null
  updateTheme: (updates: Partial<ThemeConfig> & {
    brandName?: string
    tagline?: string
    aboutStory?: string
    logo?: string
    contact?: TenantConfig['contact']
  }) => Promise<ThemeConfig | null>
  updateTenant: (updates: Partial<TenantConfig>) => Promise<void>
} {
  const { tenant, refreshTenant } = useTenant()

  const updateTheme = useCallback(async (updates: Partial<ThemeConfig> & {
    brandName?: string
    tagline?: string
    aboutStory?: string
    logo?: string
    contact?: TenantConfig['contact']
  }) => {
    if (!tenant) return null
    const saved = await apiClient.updateTheme(tenant.slug, updates)
    if (DEMO_MODE) {
      mockStore.updateTheme(tenant.id, updates)
      mockStore.updateTenant(tenant.id, {
        brandName: updates.brandName || tenant.brandName,
        name: updates.brandName || tenant.name,
        tagline: updates.tagline ?? tenant.tagline,
        aboutStory: updates.aboutStory ?? tenant.aboutStory,
        logo: updates.logo ?? tenant.logo,
        contact: updates.contact ? { ...tenant.contact, ...updates.contact } : tenant.contact,
        theme: { ...tenant.theme, ...updates },
      })
    }
    refreshTenant()
    return saved
  }, [tenant, refreshTenant])

  const updateTenant = useCallback(async (updates: Partial<TenantConfig>) => {
    if (!tenant) return
    await updateTheme({
      brandName: updates.brandName,
      tagline: updates.tagline,
      aboutStory: updates.aboutStory,
      logo: updates.logo || updates.logoUrl,
      contact: updates.contact,
    })
  }, [tenant, updateTheme])

  return {
    theme: tenant?.theme || null,
    tenant,
    updateTheme,
    updateTenant,
  }
}

// =================================================================
// ADMIN HOOKS (Super Admin — platform owner)
// =================================================================

function defaultTheme(partial?: Partial<ThemeConfig> | null): ThemeConfig {
  return {
    primaryColor: '#111111',
    accentColor: '#C9A84C',
    backgroundColor: '#FAFAF8',
    fontDisplay: 'Georgia, serif',
    fontSans: 'system-ui, sans-serif',
    heroImage: '',
    logoUrl: '',
    announcementMessages: [],
    enableAnimations: true,
    enableReviews: true,
    enableOrderTracking: true,
    ...(partial || {}),
  }
}

function fromBackendTenant(t: Record<string, unknown>): TenantConfig {
  const theme = t.theme && typeof t.theme === 'object' ? (t.theme as Partial<ThemeConfig>) : {}
  const sub = t.subscription && typeof t.subscription === 'object' ? (t.subscription as Record<string, unknown>) : {}
  const plan = normalizePlanId(t.plan)
  const subStatus = sub.status === 'active' || sub.status === 'past_due' || sub.status === 'cancelled' || sub.status === 'trial'
    ? sub.status
    : 'trial'
  const paymentMethod = sub.paymentMethod === 'razorpay' || sub.paymentMethod === 'stripe' || sub.paymentMethod === 'manual'
    ? sub.paymentMethod
    : 'razorpay'
  return {
    id: String(t.id || ''),
    slug: String(t.slug || ''),
    brandName: String(t.brandName || t.name || ''),
    name: t.name ? String(t.name) : undefined,
    ownerName: String(t.ownerName || ''),
    ownerEmail: String(t.ownerEmail || ''),
    ownerPhone: String(t.ownerPhone || ''),
    logo: String(t.logo || ''),
    tagline: t.tagline ? String(t.tagline) : undefined,
    aboutStory: t.aboutStory ? String(t.aboutStory) : undefined,
    contact: t.contact && typeof t.contact === 'object' ? (t.contact as TenantConfig['contact']) : undefined,
    customDomain: t.customDomain ? String(t.customDomain) : undefined,
    customDomainVerified: Boolean(t.customDomainVerified),
    customMongoUri: t.customMongoUri ? String(t.customMongoUri) : undefined,
    status: (t.status as TenantConfig['status']) || 'pending',
    plan,
    createdAt: String(t.createdAt || ''),
    storeType: t.storeType ? String(t.storeType) : undefined,
    niche: t.niche ? String(t.niche) : undefined,
    categories: Array.isArray(t.categories) ? (t.categories as TenantConfig['categories']) : undefined,
    theme: defaultTheme({ ...theme, logoUrl: theme.logoUrl || String(t.logo || '') }),
    subscription: {
      plan,
      pricePerMonth: Number(sub.pricePerMonth ?? PLAN_CATALOG[plan].pricePerMonth),
      status: subStatus,
      trialEndsAt: sub.trialEndsAt ? String(sub.trialEndsAt) : undefined,
      nextBillingDate: String(sub.nextBillingDate || ''),
      cycle: sub.cycle === 'yearly' ? 'yearly' : 'monthly',
      paymentMethod,
      invoices: Array.isArray(sub.invoices) ? (sub.invoices as TenantConfig['subscription']['invoices']) : [],
    },
  }
}

export function useAdminTenants(): {
  tenants: TenantConfig[]
  suspend: (id: string) => void
  reactivate: (id: string) => void
  setStatus: (id: string, status: TenantConfig['status']) => Promise<{ error?: string; endedSessions?: boolean }>
  changePlan: (id: string, plan: 'starter' | 'pro' | 'enterprise') => void
  provisionTenant: (data: {
    brandName: string
    slug: string
    ownerName: string
    ownerEmail: string
    ownerPhone?: string
    plan?: 'starter' | 'pro' | 'enterprise'
    niche?: string
    storeType?: string
    categories?: string[]
    primaryColor?: string
    accentColor?: string
    customDomain?: string
  }) => Promise<TenantConfig>
  refresh: () => void
} {
  const [tenants, setTenants] = useState<TenantConfig[]>([])

  const applyLocal = useCallback(() => {
    if (DEMO_MODE) setTenants([...mockStore.getAllTenants()])
  }, [])

  const syncFromBackend = useCallback(async () => {
    try {
      const res = await adminApiFetch('/admin/tenants')
      if (!res.ok) {
        if (DEMO_MODE) applyLocal()
        return
      }
      const remote = await res.json()
      if (!Array.isArray(remote)) return
      const mapped = remote.map((row: Record<string, unknown>) => fromBackendTenant(row)).filter((t: TenantConfig) => t.id && t.slug)
      if (DEMO_MODE) {
        mockStore.mergeTenants(mapped)
        applyLocal()
      } else {
        setTenants(mapped)
      }
    } catch {
      if (DEMO_MODE) applyLocal()
    }
  }, [applyLocal])

  const refresh = useCallback(() => {
    applyLocal()
    void syncFromBackend()
  }, [applyLocal, syncFromBackend])

  useEffect(() => {
    if (DEMO_MODE) applyLocal()
    void syncFromBackend()
    const onChange = () => { void syncFromBackend() }
    window.addEventListener('orvexa:tenant-provisioned', onChange)
    window.addEventListener('focus', onChange)
    return () => {
      window.removeEventListener('orvexa:tenant-provisioned', onChange)
      window.removeEventListener('focus', onChange)
    }
  }, [applyLocal, syncFromBackend])

  const setStatus = useCallback(async (id: string, status: TenantConfig['status']) => {
    try {
      const res = await adminApiFetch(`/admin/tenants/${encodeURIComponent(id)}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        if (DEMO_MODE && (res.status === 404 || res.status === 401)) {
          mockStore.setTenantStatus(id, status)
          applyLocal()
          return {}
        }
        const data = await res.json().catch(() => ({}))
        return { error: data.error || `The server refused this change (HTTP ${res.status}).` }
      }
      if (DEMO_MODE) mockStore.setTenantStatus(id, status)
      await syncFromBackend()
      return { endedSessions: status !== 'active' && status !== 'read_only' }
    } catch {
      if (DEMO_MODE) {
        mockStore.setTenantStatus(id, status)
        applyLocal()
        return {}
      }
      return { error: 'The platform server is unreachable. Status was not changed.' }
    }
  }, [applyLocal, syncFromBackend])

  const suspend = useCallback((id: string) => {
    void setStatus(id, 'suspended')
  }, [setStatus])

  const reactivate = useCallback((id: string) => {
    void setStatus(id, 'active')
  }, [setStatus])

  const changePlan = useCallback((id: string, plan: 'starter' | 'pro' | 'enterprise') => {
    if (DEMO_MODE) {
      mockStore.changePlan(id, plan)
      applyLocal()
    }
  }, [applyLocal])

  const provisionTenant = useCallback(
    async (data: {
      brandName: string
      slug: string
      ownerName: string
      ownerEmail: string
      ownerPhone?: string
      plan?: 'starter' | 'pro' | 'enterprise'
      niche?: string
      storeType?: string
      categories?: string[]
      primaryColor?: string
      accentColor?: string
      customDomain?: string
    }): Promise<TenantConfig> => {
      const cleanSlug = data.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
      const payload = {
        slug: cleanSlug,
        brandName: data.brandName,
        ownerName: data.ownerName,
        ownerEmail: data.ownerEmail,
        ownerPhone: data.ownerPhone || '',
        plan: data.plan || 'starter',
        customDomain: data.customDomain || '',
        niche: data.niche || '',
        storeType: data.storeType || '',
        categories: data.categories || [],
        theme: {
          primaryColor: data.primaryColor,
          accentColor: data.accentColor,
        },
      }

      try {
        const res = await adminApiFetch('/admin/tenants', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const saved = fromBackendTenant(await res.json())
          if (DEMO_MODE) mockStore.provisionTenant(data)
          await createStoreFolder(saved.slug, saved.brandName)
          window.dispatchEvent(new Event('orvexa:tenant-provisioned'))
          await syncFromBackend()
          return saved
        }
        if (!DEMO_MODE) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Could not create the store (HTTP ${res.status}).`)
        }
      } catch (err) {
        if (!DEMO_MODE) throw err
        console.warn('Backend tenant create offline, using mock store:', err)
      }

      const created = mockStore.provisionTenant(data)
      await createStoreFolder(created.slug, created.brandName)
      applyLocal()
      return created
    },
    [applyLocal, syncFromBackend]
  )

  return { tenants, suspend, reactivate, setStatus, changePlan, provisionTenant, refresh }
}

const ADMIN_API_BASE = API_BASE

// Shape of an Application document returned by GET /api/admin/applications.
interface BackendApplication {
  id: string
  channel?: 'admin' | 'website'
  brandName: string
  ownerName?: string
  ownerEmail: string
  ownerPhone?: string
  category?: string
  storeType?: string
  categories?: string[]
  description?: string
  requestedSubdomain: string
  status: TenantApplication['status']
  submittedAt?: string
  createdAt?: string
  requestedPlan?: TenantApplication['requestedPlan']
  launch?: TenantApplication['launch']
  migration?: TenantApplication['migration']
  consents?: TenantApplication['consents']
  attribution?: TenantApplication['attribution']
  slugCheck?: TenantApplication['slugCheck']
  reviewNotes?: string
  launchNotifiedAt?: string
}

function fromBackendApplication(a: BackendApplication): TenantApplication {
  return {
    id: a.id,
    brandName: a.brandName,
    ownerName: a.ownerName || '',
    ownerEmail: a.ownerEmail,
    phone: a.ownerPhone || '',
    niche: a.category || '',
    storeType: a.storeType || undefined,
    categories: a.categories,
    requestedSlug: a.requestedSubdomain,
    message: a.description || '',
    submittedAt: (a.submittedAt || a.createdAt || '').slice(0, 10),
    status: a.status,
    channel: a.channel,
    requestedPlan: a.requestedPlan,
    launch: a.launch,
    migration: a.migration,
    consents: a.consents && {
      marketing: a.consents.marketing,
      termsAcceptedAt: a.consents.termsAcceptedAt,
      termsVersion: a.consents.termsVersion,
    },
    attribution: a.attribution,
    slugCheck: a.slugCheck,
    reviewNotes: a.reviewNotes,
    launchNotifiedAt: a.launchNotifiedAt,
  }
}

async function adminApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await authService.getValidAdminToken()
  return fetch(`${ADMIN_API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  })
}

// Sends an approve/reject decision to the backend. Returns an error message when the
// backend refused it; null when it succeeded or the application only exists locally.
async function sendApplicationDecision(
  app: TenantApplication | undefined,
  body: { status: 'approved' | 'rejected' | 'needs_info'; slug?: string; reviewNotes?: string }
): Promise<string | null> {
  if (!app) return 'Application not found.'
  try {
    const res = await adminApiFetch(`/admin/applications/${app.id}/status`, { method: 'PUT', body: JSON.stringify(body) })
    if (res.ok || (app.channel !== 'website' && (res.status === 404 || res.status === 401))) return null
    const data = await res.json().catch(() => ({}))
    return data.error || `The server refused this change (HTTP ${res.status}).`
  } catch {
    return app.channel === 'website' ? 'The platform server is unreachable. Website signups can only be decided while it is online.' : null
  }
}

export function useAdminApplications(): {
  applications: TenantApplication[]
  approve: (id: string, slug?: string) => Promise<{ tenant: TenantConfig | null; error?: string }>
  reject: (id: string, reviewNotes?: string) => Promise<{ error?: string }>
  requestInfo: (id: string, reviewNotes: string) => Promise<{ error?: string }>
  notifyWaitlist: (country: string) => Promise<{ notified?: number; failed?: number; hasMore?: boolean; error?: string }>
  submitApplication: (appData: {
    brandName: string
    ownerName: string
    ownerEmail: string
    phone: string
    niche: string
    storeType?: string
    categories?: string[]
    requestedSlug: string
    message?: string
  }) => TenantApplication
  refresh: () => void
} {
  const [applications, setApplications] = useState<TenantApplication[]>([])

  const refresh = useCallback(() => {
    setApplications([...mockStore.getAllApplications()])
  }, [])

  const syncFromBackend = useCallback(async () => {
    try {
      const res = await adminApiFetch('/admin/applications')
      if (!res.ok) return
      const remote: BackendApplication[] = await res.json()
      if (Array.isArray(remote)) {
        mockStore.mergeApplications(remote.map(fromBackendApplication))
        refresh()
      }
    } catch {
      // Backend offline: keep showing the locally stored applications.
    }
  }, [refresh])

  useEffect(() => {
    refresh()
    syncFromBackend()

    const handleNewApp = () => {
      refresh()
    }
    window.addEventListener('orvexa:application-submitted', handleNewApp)
    window.addEventListener('orvexa:applications-changed', handleNewApp)
    window.addEventListener('focus', syncFromBackend)
    return () => {
      window.removeEventListener('orvexa:application-submitted', handleNewApp)
      window.removeEventListener('orvexa:applications-changed', handleNewApp)
      window.removeEventListener('focus', syncFromBackend)
    }
  }, [refresh, syncFromBackend])

  const approve = useCallback(async (id: string, slug?: string) => {
    const app = mockStore.getAllApplications().find((a) => a.id === id)
    if (app?.status === 'waitlist') return { tenant: null, error: 'Early-access entries cannot be provisioned until their country launches.' }
    const error = await sendApplicationDecision(app, { status: 'approved', ...(slug ? { slug } : {}) })
    if (error) return { tenant: null, error }
    const tenant = mockStore.approveTenant(id, slug)
    if (tenant) await createStoreFolder(tenant.slug, tenant.brandName)
    window.dispatchEvent(new Event('orvexa:applications-changed'))
    window.dispatchEvent(new Event('orvexa:tenant-provisioned'))
    return tenant ? { tenant } : { tenant: null, error: `The store address "${slug || app?.requestedSlug}" is already in use.` }
  }, [])

  const reject = useCallback(async (id: string, reviewNotes?: string) => {
    const app = mockStore.getAllApplications().find((a) => a.id === id)
    const error = await sendApplicationDecision(app, { status: 'rejected', ...(reviewNotes ? { reviewNotes } : {}) })
    if (error) return { error }
    mockStore.rejectApplication(id)
    window.dispatchEvent(new Event('orvexa:applications-changed'))
    return {}
  }, [])

  const requestInfo = useCallback(async (id: string, reviewNotes: string) => {
    const notes = reviewNotes.trim()
    if (!notes) return { error: 'Write the question you want emailed to the applicant.' }
    const app = mockStore.getAllApplications().find((a) => a.id === id)
    if (app?.status === 'waitlist') return { error: 'Early-access entries are not applications. Notify their country when it launches.' }
    const error = await sendApplicationDecision(app, { status: 'needs_info', reviewNotes: notes })
    if (error) return { error }
    mockStore.markNeedsInfo(id, notes)
    window.dispatchEvent(new Event('orvexa:applications-changed'))
    return {}
  }, [])

  const notifyWaitlist = useCallback(async (country: string) => {
    const code = country.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) return { error: 'Use a two-letter country code, for example AE.' }
    let notified = 0
    let failed = 0
    let hasMore = true
    let rounds = 0
    try {
      while (hasMore && rounds < 20) {
        rounds += 1
        const res = await adminApiFetch('/admin/waitlist/notify', {
          method: 'POST',
          body: JSON.stringify({ country: code }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return { error: data.error || `The server refused this change (HTTP ${res.status}).`, notified, failed }
        notified += Number(data.notified) || 0
        failed += Number(data.failed) || 0
        hasMore = Boolean(data.hasMore)
      }
    } catch {
      return { error: 'The platform server is unreachable. Country notifications are sent from the server.' }
    }
    await syncFromBackend()
    return { notified, failed, hasMore }
  }, [syncFromBackend])

  const submitApplication = useCallback(
    (appData: {
      brandName: string
      ownerName: string
      ownerEmail: string
      phone: string
      niche: string
      storeType?: string
      categories?: string[]
      requestedSlug: string
      message?: string
    }) => {
      const newApp = mockStore.submitApplication(appData)
      refresh()
      return newApp
    },
    [refresh]
  )

  return { applications, approve, reject, requestInfo, notifyWaitlist, submitApplication, refresh }
}

export function usePlatformStats(): { stats: PlatformStats | null; loading: boolean } {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setStats(mockStore.getPlatformStats())
    setLoading(false)
  }, [])

  return { stats, loading }
}
