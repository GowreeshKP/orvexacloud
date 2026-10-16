// --- Custom React Hooks for Mock API ---
// Wraps the mock store with React-friendly hooks.

import { useState, useEffect, useCallback } from 'react'
import { useTenant } from '@/context/TenantContext'
import { mockStore } from '@/api/mock-store'
import type { Product, Review, TrackedOrder } from '@/types'
import type { TenantConfig, TenantApplication, PlatformStats, DashboardStats, ThemeConfig } from '@/types/tenant'

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
    if (tenant) {
      setOrders([...mockStore.getOrders(tenant.id)])
    }
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
    if (tenant) {
      mockStore.updateOrderStatus(tenant.id, orderId, status, courier, awb)
      refresh()
    }
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
    if (tenant) {
      setProducts([...mockStore.getProducts(tenant.id)])
    }
  }, [tenant])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addProduct = useCallback((product: Product) => {
    if (tenant) {
      mockStore.addProduct(tenant.id, product)
      refresh()
    }
  }, [tenant, refresh])

  const updateProduct = useCallback((id: number, data: Partial<Product>) => {
    if (tenant) {
      mockStore.updateProduct(tenant.id, id, data)
      refresh()
    }
  }, [tenant, refresh])

  const deleteProduct = useCallback((id: number) => {
    if (tenant) {
      mockStore.deleteProduct(tenant.id, id)
      refresh()
    }
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

  useEffect(() => {
    refresh()
  }, [refresh])

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
      primaryColor?: string
      accentColor?: string
      customDomain?: string
    }): Promise<TenantConfig> => {
      const cleanSlug = data.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
      const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
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
          }),
        })
      } catch (err) {
        console.warn('Backend tenant create offline, using mock store:', err)
      }

      const created = mockStore.provisionTenant(data)
      refresh()
      return created
    },
    [refresh]
  )

  return { tenants, suspend, reactivate, changePlan, provisionTenant, refresh }
}

export function useAdminApplications(): {
  applications: TenantApplication[]
  approve: (id: string) => TenantConfig | null
  reject: (id: string) => void
  submitApplication: (appData: {
    brandName: string
    ownerName: string
    ownerEmail: string
    phone: string
    niche: string
    requestedSlug: string
    message?: string
  }) => TenantApplication
  refresh: () => void
} {
  const [applications, setApplications] = useState<TenantApplication[]>([])

  const refresh = useCallback(() => {
    setApplications([...mockStore.getAllApplications()])
  }, [])

  useEffect(() => {
    refresh()

    const handleNewApp = () => {
      refresh()
    }
    window.addEventListener('orvexa:application-submitted', handleNewApp)
    return () => {
      window.removeEventListener('orvexa:application-submitted', handleNewApp)
    }
  }, [refresh])

  const approve = useCallback((id: string): TenantConfig | null => {
    const tenant = mockStore.approveTenant(id)
    refresh()
    return tenant
  }, [refresh])

  const reject = useCallback((id: string) => {
    mockStore.rejectApplication(id)
    refresh()
  }, [refresh])

  const submitApplication = useCallback(
    (appData: {
      brandName: string
      ownerName: string
      ownerEmail: string
      phone: string
      niche: string
      requestedSlug: string
      message?: string
    }) => {
      const newApp = mockStore.submitApplication(appData)
      refresh()
      return newApp
    },
    [refresh]
  )

  return { applications, approve, reject, submitApplication, refresh }
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
