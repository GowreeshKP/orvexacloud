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
import { normalizePlanId } from '@/data/plans'
import { API_BASE } from '@/api/base'

// =================================================================
// STOREFRONT HOOKS (scoped to current tenant)
// =================================================================

export function useTenantProducts(): { products: Product[]; loading: boolean } {
  const { tenant } = useTenant()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (tenant) {
      setProducts(mockStore.getProducts(tenant.id))
    }
    setLoading(false)
  }, [tenant])

  return { products, loading }
}

export function useTenantReviews(): { reviews: Review[]; addReview: (r: Review) => void } {
  const { tenant } = useTenant()
  const [reviews, setReviews] = useState<Review[]>([])

  useEffect(() => {
    if (tenant) {
      setReviews(mockStore.getReviews(tenant.id))
    }
  }, [tenant])

  const addReview = useCallback((review: Review) => {
    if (tenant) {
      mockStore.submitReview(tenant.id, review)
      setReviews(mockStore.getReviews(tenant.id))
    }
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
    void authService.getStoreAccessToken().then((token) =>
      fetch(`${API_BASE}/stores/${encodeURIComponent(tenant.slug)}/orders`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (Array.isArray(data)) setOrders(data)
          else setOrders([...mockStore.getOrders(tenant.id)])
        })
        .catch(() => setOrders([...mockStore.getOrders(tenant.id)]))
    )
  }, [tenant])

  useEffect(() => {
    refresh()
  }, [refresh])

  const placeOrder = useCallback((order: TrackedOrder) => {
    if (tenant) {
      mockStore.placeOrder(tenant.id, order)
      refresh()
    }
  }, [tenant, refresh])

  const updateOrderStatus = useCallback((orderId: string, status: TrackedOrder['status'], courier?: string, awb?: string) => {
    if (!tenant) return
    mockStore.updateOrderStatus(tenant.id, orderId, status, courier, awb)
    void authService.getStoreAccessToken().then((token) =>
      fetch(`${API_BASE}/stores/${encodeURIComponent(tenant.slug)}/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
    if (tenant) {
      setStats(mockStore.getDashboardStats(tenant.id))
    }
    setLoading(false)
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
    setProducts([...mockStore.getProducts(tenant.id)])
    void apiClient.getProducts(tenant.slug).then((list) => {
      if (!Array.isArray(list)) return
      // Mirror API catalog into the local tenant DB so storefront + dashboard stay aligned.
      const dbProducts = mockStore.getProducts(tenant.id)
      const byId = new Map(dbProducts.map((p) => [p.id, p]))
      for (const p of list) {
        if (byId.has(p.id)) mockStore.updateProduct(tenant.id, p.id, p)
        else mockStore.addProduct(tenant.id, p)
      }
      setProducts([...mockStore.getProducts(tenant.id)])
    })
  }, [tenant])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addProduct = useCallback((product: Product) => {
    if (!tenant) return
    mockStore.addProduct(tenant.id, product)
    setProducts([...mockStore.getProducts(tenant.id)])
    void apiClient.addProduct(tenant.slug, product).then(() => refresh())
  }, [tenant, refresh])

  const updateProduct = useCallback((id: number, data: Partial<Product>) => {
    if (!tenant) return
    mockStore.updateProduct(tenant.id, id, data)
    setProducts([...mockStore.getProducts(tenant.id)])
    void apiClient.updateProduct(tenant.slug, id, data).then(() => refresh())
  }, [tenant, refresh])

  const deleteProduct = useCallback((id: number) => {
    if (!tenant) return
    mockStore.deleteProduct(tenant.id, id)
    setProducts([...mockStore.getProducts(tenant.id)])
    void apiClient.deleteProduct(tenant.slug, id).then(() => refresh())
  }, [tenant, refresh])

  return { products, addProduct, updateProduct, deleteProduct, refresh }
}

export function useThemeCustomizer(): {
  theme: ThemeConfig | null
  tenant: TenantConfig | null
  updateTheme: (updates: Partial<ThemeConfig>) => void
  updateTenant: (updates: Partial<TenantConfig>) => void
} {
  const { tenant, refreshTenant } = useTenant()

  const updateTheme = useCallback((updates: Partial<ThemeConfig>) => {
    if (tenant) {
      mockStore.updateTheme(tenant.id, updates)
      refreshTenant()
    }
  }, [tenant, refreshTenant])

  const updateTenant = useCallback((updates: Partial<TenantConfig>) => {
    if (tenant) {
      mockStore.updateTenant(tenant.id, updates)
      refreshTenant()
    }
  }, [tenant, refreshTenant])

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

function fromBackendTenant(t: Record<string, any>): TenantConfig {
  const theme = t.theme || {}
  return {
    id: t.id,
    slug: t.slug,
    brandName: t.brandName,
    ownerName: t.ownerName || '',
    ownerEmail: t.ownerEmail || '',
    ownerPhone: t.ownerPhone || '',
    logo: t.logo || '',
    status: t.status || 'active',
    plan: normalizePlanId(t.plan),
    customDomain: t.customDomain || '',
    customDomainVerified: Boolean(t.customDomainVerified),
    customMongoUri: t.customMongoUri || undefined,
    storeType: t.storeType || undefined,
    niche: t.niche || '',
    categories: t.categories || [],
    createdAt: (t.createdAt || '').toString().slice(0, 10),
    theme: {
      primaryColor: theme.primaryColor || '#1F2937',
      accentColor: theme.accentColor || '#6B7280',
      backgroundColor: theme.backgroundColor || '#FAFAF8',
      fontDisplay: theme.fontDisplay || "'Instrument Serif', Georgia, serif",
      fontSans: theme.fontSans || "'Work Sans', system-ui, sans-serif",
      heroImage: theme.heroImage || '',
      heroHeadline: theme.heroHeadline || t.brandName || '',
      heroSubhead: theme.heroSubhead || '',
      heroCtaText: theme.heroCtaText || 'SHOP NOW →',
      logoUrl: theme.logoUrl || t.logo || '',
      announcementMessages: theme.announcementMessages || [],
      enableAnimations: theme.enableAnimations !== false,
      enableReviews: theme.enableReviews !== false,
      enableOrderTracking: theme.enableOrderTracking !== false,
    },
    subscription: t.subscription || {
      plan: normalizePlanId(t.plan),
      pricePerMonth: 0,
      status: 'trial',
      nextBillingDate: '',
      paymentMethod: 'razorpay',
      invoices: [],
    },
    databaseConfig: t.databaseConfig,
  }
}

export function useAdminTenants(): {
  tenants: TenantConfig[]
  suspend: (id: string) => void
  reactivate: (id: string) => void
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

  const refresh = useCallback(() => {
    setTenants([...mockStore.getAllTenants()])
  }, [])

  const syncFromBackend = useCallback(async () => {
    try {
      const res = await adminApiFetch('/admin/tenants')
      if (!res.ok) return
      const remote = await res.json()
      if (Array.isArray(remote)) {
        mockStore.replaceTenants(remote.map(fromBackendTenant))
        refresh()
      }
    } catch {
      // Backend offline: keep local tenants.
    }
  }, [refresh])

  useEffect(() => {
    refresh()
    syncFromBackend()
    const onProvisioned = () => {
      refresh()
      void syncFromBackend()
    }
    window.addEventListener('orvexa:tenant-provisioned', onProvisioned)
    window.addEventListener('focus', syncFromBackend)
    const poll = window.setInterval(syncFromBackend, 30_000)
    return () => {
      window.removeEventListener('orvexa:tenant-provisioned', onProvisioned)
      window.removeEventListener('focus', syncFromBackend)
      window.clearInterval(poll)
    }
  }, [refresh, syncFromBackend])

  const suspend = useCallback((id: string) => {
    mockStore.suspendTenant(id)
    refresh()
  }, [refresh])

  const reactivate = useCallback((id: string) => {
    mockStore.reactivateTenant(id)
    refresh()
  }, [refresh])

  const changePlan = useCallback((id: string, plan: 'starter' | 'pro' | 'enterprise') => {
    mockStore.changePlan(id, plan)
    refresh()
  }, [refresh])

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
      const token = typeof window !== 'undefined' ? localStorage.getItem('lunar_admin_token') : null

      try {
        await fetch(`${API_BASE}/admin/tenants`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            id: `tenant_${cleanSlug}`,
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
          }),
        })
      } catch (err) {
        console.warn('Backend tenant create offline, using mock store:', err)
      }

      const created = mockStore.provisionTenant(data)
      await createStoreFolder(created.slug, created.brandName)
      refresh()
      return created
    },
    [refresh]
  )

  return { tenants, suspend, reactivate, changePlan, provisionTenant, refresh }
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
  body: { status: 'approved' | 'rejected'; slug?: string; reviewNotes?: string }
): Promise<string | null> {
  if (!app) return 'Application not found.'
  try {
    const res = await adminApiFetch(`/admin/applications/${app.id}/status`, { method: 'PUT', body: JSON.stringify(body) })
    if (res.ok) return null
    if (DEMO_MODE && app.channel !== 'website' && (res.status === 404 || res.status === 401)) return null
    const data = await res.json().catch(() => ({}))
    return data.error || `The server refused this change (HTTP ${res.status}).`
  } catch {
    return app.channel === 'website' ? 'The platform server is unreachable. Website signups can only be decided while it is online.' : null
  }
}

export function useAdminApplications(): {
  applications: TenantApplication[]
  syncError: string | null
  syncing: boolean
  approve: (id: string, slug?: string) => Promise<{ tenant: TenantConfig | null; error?: string }>
  reject: (id: string, reviewNotes?: string) => Promise<{ error?: string }>
  refresh: () => void
} {
  const [applications, setApplications] = useState<TenantApplication[]>([])
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(() => {
    setApplications([...mockStore.getAllApplications()])
  }, [])

  // Website applications arrive only via marketing-site-orvexacloud → POST /api/public/signups.
  const syncFromBackend = useCallback(async () => {
    setSyncing(true)
    try {
      const token = await authService.getValidAdminToken()
      if (!token) {
        setSyncError('Sign in again with the API online — marketing signups need a Super Admin token to load.')
        return
      }
      const res = await adminApiFetch('/admin/applications')
      if (res.status === 401 || res.status === 403) {
        setSyncError('Admin session expired. Sign out and sign in again to load marketing signups.')
        return
      }
      if (!res.ok) {
        setSyncError(`Could not load applications from the platform API (HTTP ${res.status}).`)
        return
      }
      const remote: BackendApplication[] = await res.json()
      if (Array.isArray(remote)) {
        mockStore.replaceApplications(remote.map(fromBackendApplication))
        setSyncError(null)
        refresh()
      }
    } catch {
      setSyncError('Platform API unreachable. Marketing signups will appear once the server on :5000 is online.')
    } finally {
      setSyncing(false)
    }
  }, [refresh])

  useEffect(() => {
    refresh()
    syncFromBackend()

    const handleChange = () => {
      refresh()
    }
    window.addEventListener('orvexa:applications-changed', handleChange)
    window.addEventListener('focus', syncFromBackend)
    const poll = window.setInterval(syncFromBackend, 15_000)
    return () => {
      window.removeEventListener('orvexa:applications-changed', handleChange)
      window.removeEventListener('focus', syncFromBackend)
      window.clearInterval(poll)
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

  const reload = useCallback(() => {
    refresh()
    void syncFromBackend()
  }, [refresh, syncFromBackend])

  return { applications, syncError, syncing, approve, reject, refresh: reload }
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
