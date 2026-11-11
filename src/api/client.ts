// --- Frontend API Client ---
// Communicates with the Orvexa Tech Express + MongoDB Backend with graceful fallback

import type { Product, Review, TrackedOrder } from '@/types'
import type { TenantConfig, ThemeConfig, PlatformStats, TenantApplication } from '@/types/tenant'
import { mockStore } from './mock-store'
import { authService } from './auth'
import { resolveApiBase } from './base'

/** Keep only absolute http(s)/data image URLs (or '' to clear). Drop relative paths that 400 the API. */
function sanitizeImageUrl(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (s === '') return ''
  if (s.startsWith('data:image/')) return s
  try {
    const u = new URL(s)
    if (u.protocol === 'http:' || u.protocol === 'https:') return s
  } catch {
    /* relative / invalid */
  }
  return undefined
}

function compactPayload<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
    try {
      const res = await authService.storeAuthFetch(`${resolveApiBase()}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      })

      if (!res.ok) {
        let detail = res.statusText
        try {
          const body = await res.json()
          if (body?.error) detail = String(body.error)
        } catch {
          /* ignore */
        }
        throw new Error(`API error ${res.status}: ${detail}`)
      }

      return await res.json()
    } catch (error) {
      // Backend not running or endpoint failed; return null to trigger mockStore fallback
      console.warn('[api]', endpoint, error)
      return null
    }
  }

  // --- STORE PRODUCTS ---
  async getProducts(tenantSlug: string, category?: string, search?: string): Promise<Product[]> {
    const params = new URLSearchParams()
    if (category && category !== 'all') params.set('category', category)
    if (search) params.set('search', search)

    const query = params.toString() ? `?${params.toString()}` : ''
    const data = await this.request<Product[]>(`/stores/${tenantSlug}/products${query}`)

    if (data && Array.isArray(data)) {
      return data
    }
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    return tenant ? mockStore.getProducts(tenant.id) : []
  }

  async addProduct(tenantSlug: string, product: Omit<Product, 'id'> & { id?: number }): Promise<Product> {
    const data = await this.request<Product>(`/stores/${tenantSlug}/products`, {
      method: 'POST',
      body: JSON.stringify(product),
    })

    const tenant = mockStore.getTenantBySlug(tenantSlug)
    const fullProduct: Product = data || {
      ...product,
      id: product.id || Date.now(),
    }
    if (tenant) {
      // Prefer the server document; replace any optimistic local copy with the same client id.
      const local = mockStore.getProducts(tenant.id)
      if (product.id && local.some((p) => p.id === product.id) && fullProduct.id !== product.id) {
        mockStore.deleteProduct(tenant.id, product.id)
      }
      if (!mockStore.getProducts(tenant.id).some((p) => p.id === fullProduct.id)) {
        mockStore.addProduct(tenant.id, fullProduct)
      } else {
        mockStore.updateProduct(tenant.id, fullProduct.id, fullProduct)
      }
    }
    return fullProduct
  }

  async updateProduct(tenantSlug: string, id: number, updates: Partial<Product>): Promise<Product | null> {
    const data = await this.request<Product>(`/stores/${tenantSlug}/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })

    const tenant = mockStore.getTenantBySlug(tenantSlug)
    if (tenant) {
      mockStore.updateProduct(tenant.id, id, updates)
      return data || (mockStore.getProducts(tenant.id).find((p) => p.id === id) || null)
    }
    return data
  }

  async deleteProduct(tenantSlug: string, id: number): Promise<boolean> {
    const data = await this.request<{ success: boolean }>(`/stores/${tenantSlug}/products/${id}`, {
      method: 'DELETE',
    })

    const tenant = mockStore.getTenantBySlug(tenantSlug)
    if (tenant) {
      mockStore.deleteProduct(tenant.id, id)
    }
    return data?.success ?? true
  }

  // --- THEME & HERO PICTURE CUSTOMIZATION ---
  async getTheme(tenantSlug: string): Promise<ThemeConfig | null> {
    const data = await this.request<ThemeConfig>(`/stores/${tenantSlug}/theme`)
    if (data) return data
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    return tenant ? tenant.theme : null
  }

  async updateTheme(tenantSlug: string, updates: Partial<ThemeConfig>): Promise<ThemeConfig | null> {
    const payload = compactPayload({
      ...updates,
      heroImage: sanitizeImageUrl(updates.heroImage),
      logoUrl: sanitizeImageUrl(updates.logoUrl),
    } as Record<string, unknown>)
    const data = await this.request<{ success: boolean; theme: ThemeConfig }>(`/stores/${tenantSlug}/theme`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })

    const tenant = mockStore.getTenantBySlug(tenantSlug)
    if (tenant) {
      mockStore.updateTheme(tenant.id, updates)
      mockStore.updateTenant(tenant.id, { theme: { ...tenant.theme, ...updates } })
    }
    return data?.theme || (tenant ? tenant.theme : null)
  }

  async updateStoreProfile(tenantSlug: string, updates: Partial<TenantConfig>): Promise<TenantConfig | null> {
    const logo = sanitizeImageUrl(updates.logo || updates.logoUrl)
    const brandName = updates.brandName || updates.name
    const payload = compactPayload({
      brandName,
      name: updates.name || updates.brandName,
      tagline: updates.tagline,
      aboutStory: updates.aboutStory,
      logo,
      logoUrl: logo,
      contact: updates.contact,
    } as Record<string, unknown>)

    // Prefer /profile when the API has it. Older Render deploys 404 — fall back to theme.copy.
    try {
      const res = await authService.storeAuthFetch(`${resolveApiBase()}/stores/${tenantSlug}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = (await res.json()) as { success?: boolean; tenant?: TenantConfig }
        const tenant = mockStore.getTenantBySlug(tenantSlug)
        if (tenant) mockStore.updateTenant(tenant.id, updates)
        return data?.tenant || (tenant ? { ...tenant, ...updates } : null)
      }
      if (res.status !== 404) {
        const errBody = await res.json().catch(() => ({}))
        console.warn('[api] profile update failed', res.status, errBody)
      }
    } catch (e) {
      console.warn('[api] profile update error', e)
    }

    // Persist brand / contact / logo through the working theme endpoint until /profile is live.
    const contact = updates.contact || {}
    await this.updateTheme(tenantSlug, {
      logoUrl: logo === undefined ? undefined : logo,
      tagline: updates.tagline,
      aboutStory: updates.aboutStory,
      copy: compactPayload({
        _profileBrandName: brandName,
        _profileAbout: updates.aboutStory,
        _profilePhone: contact.phone,
        _profileEmail: contact.email,
        _profileAddress: contact.address,
        _profileHours: contact.workingHours,
        _profileShipping: contact.shippingThresholdFormatted,
      }) as Record<string, string>,
    })

    const tenant = mockStore.getTenantBySlug(tenantSlug)
    if (tenant) mockStore.updateTenant(tenant.id, updates)
    return tenant ? { ...tenant, ...updates } : null
  }

  // --- ORDERS ---
  async getOrders(tenantSlug: string): Promise<TrackedOrder[]> {
    const data = await this.request<TrackedOrder[]>(`/stores/${tenantSlug}/orders`)
    if (data && Array.isArray(data)) return data
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    return tenant ? mockStore.getOrders(tenant.id) : []
  }

  async placeOrder(tenantSlug: string, order: TrackedOrder): Promise<TrackedOrder> {
    const data = await this.request<TrackedOrder>(`/stores/${tenantSlug}/orders`, {
      method: 'POST',
      body: JSON.stringify(order),
    })
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    if (tenant) {
      mockStore.placeOrder(tenant.id, order)
    }
    return data || order
  }

  // --- REVIEWS ---
  async getReviews(tenantSlug: string, productId?: number): Promise<Review[]> {
    const query = productId ? `?productId=${productId}` : ''
    const data = await this.request<Review[]>(`/stores/${tenantSlug}/reviews${query}`)
    if (data && Array.isArray(data)) return data
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    return tenant ? mockStore.getReviews(tenant.id) : []
  }

  async postReview(tenantSlug: string, review: Omit<Review, 'id'>): Promise<Review> {
    const data = await this.request<Review>(`/stores/${tenantSlug}/reviews`, {
      method: 'POST',
      body: JSON.stringify(review),
    })
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    if (tenant) {
      const fullReview: Review = { ...review, id: Date.now() }
      mockStore.submitReview(tenant.id, fullReview)
      return data || fullReview
    }
    return data as Review
  }

  // --- DATABASE CONNECTION & SETTINGS ---
  async getDatabaseStatus(tenantSlug: string) {
    const data = await this.request<{
      tenantSlug: string
      brandName: string
      isCustomDatabase: boolean
      databaseName: string
      host: string
      connected: boolean
      stats: { products: number; orders: number; reviews: number }
    }>(`/stores/${tenantSlug}/database-status`)

    if (data) return data

    // Fallback info if running in mock mode
    return {
      tenantSlug,
      brandName: tenantSlug,
      isCustomDatabase: false,
      databaseName: `orvexa_tenant_${tenantSlug}`,
      host: 'localhost:27017',
      connected: true,
      stats: { products: 6, orders: 1, reviews: 3 },
    }
  }

  async updateDatabaseConfig(tenantSlug: string, customMongoUri: string) {
    return await this.request<{ success: boolean; message: string }>(`/stores/${tenantSlug}/database-config`, {
      method: 'PUT',
      body: JSON.stringify({ customMongoUri }),
    })
  }

  // --- SUPER ADMIN MASTER APIS ---
  async getAdminOverview(): Promise<PlatformStats | null> {
    const data = await this.request<PlatformStats>('/admin/overview')
    if (data) return data
    return mockStore.getPlatformStats()
  }

  async getAdminTenants(): Promise<TenantConfig[]> {
    const data = await this.request<TenantConfig[]>('/admin/tenants')
    if (data && Array.isArray(data)) return data
    return mockStore.getAllTenants()
  }

  async getAdminApplications(): Promise<TenantApplication[]> {
    const data = await this.request<TenantApplication[]>('/admin/applications')
    if (data && Array.isArray(data)) return data
    return mockStore.getAllApplications()
  }

  async updateApplicationStatus(id: string, status: 'approved' | 'rejected'): Promise<TenantApplication | null> {
    const data = await this.request<TenantApplication>(`/admin/applications/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
    if (status === 'approved') {
      mockStore.approveTenant(id)
    } else {
      mockStore.rejectApplication(id)
    }
    return data || mockStore.getAllApplications().find((a) => a.id === id) || null
  }
}

export const apiClient = new ApiClient()
