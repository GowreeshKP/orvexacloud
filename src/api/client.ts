// --- Frontend API Client ---
// Communicates with the Orvexa Tech Express + MongoDB Backend with graceful fallback

import type { Product, Review, TrackedOrder } from '@/types'
import type { TenantConfig, ThemeConfig, PlatformStats, TenantApplication } from '@/types/tenant'
import { mockStore } from './mock-store'
import { authService, DEMO_MODE } from './auth'
import { API_BASE as API_BASE_URL } from '@/lib/api-base'

class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
    try {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(authService.getSellerToken() ? { Authorization: `Bearer ${authService.getSellerToken()}` } : {}),
          ...(options.headers || {}),
        },
      })

      if (!res.ok) {
        throw new Error(`API error ${res.status}: ${res.statusText}`)
      }

      return await res.json()
    } catch (error) {
      // Backend not running or endpoint failed; return null to trigger mockStore fallback
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
    if (!DEMO_MODE) return []
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    return tenant ? mockStore.getProducts(tenant.id) : []
  }

  async addProduct(tenantSlug: string, product: Omit<Product, 'id'> & { id?: number }): Promise<Product> {
    const data = await this.request<Product>(`/stores/${tenantSlug}/products`, {
      method: 'POST',
      body: JSON.stringify(product),
    })

    if (data) return data
    if (!DEMO_MODE) throw new Error('Could not save the product.')
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    const fullProduct: Product = { ...product, id: product.id || Date.now() }
    if (tenant) mockStore.addProduct(tenant.id, fullProduct)
    return fullProduct
  }

  async updateProduct(tenantSlug: string, id: number, updates: Partial<Product>): Promise<Product | null> {
    const data = await this.request<Product>(`/stores/${tenantSlug}/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })

    if (data) return data
    if (!DEMO_MODE) return null
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    if (tenant) {
      mockStore.updateProduct(tenant.id, id, updates)
      return mockStore.getProducts(tenant.id).find((p) => p.id === id) || null
    }
    return null
  }

  async deleteProduct(tenantSlug: string, id: number): Promise<boolean> {
    const data = await this.request<{ success: boolean }>(`/stores/${tenantSlug}/products/${id}`, {
      method: 'DELETE',
    })

    if (!DEMO_MODE) return Boolean(data?.success)
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    if (tenant) mockStore.deleteProduct(tenant.id, id)
    return data?.success ?? true
  }

  // --- THEME & HERO PICTURE CUSTOMIZATION ---
  async getTheme(tenantSlug: string): Promise<ThemeConfig | null> {
    const data = await this.request<ThemeConfig>(`/stores/${tenantSlug}/theme`)
    if (data) return data
    if (!DEMO_MODE) return null
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    return tenant ? tenant.theme : null
  }

  async updateTheme(tenantSlug: string, updates: Partial<ThemeConfig>): Promise<ThemeConfig | null> {
    const data = await this.request<{ success: boolean; theme: ThemeConfig }>(`/stores/${tenantSlug}/theme`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })

    if (DEMO_MODE) {
      const tenant = mockStore.getTenantBySlug(tenantSlug)
      if (tenant) {
        mockStore.updateTheme(tenant.id, updates)
        mockStore.updateTenant(tenant.id, { theme: { ...tenant.theme, ...updates } })
        return data?.theme || tenant.theme
      }
    }
    return data?.theme || null
  }

  // --- ORDERS ---
  async getOrders(tenantSlug: string): Promise<TrackedOrder[]> {
    const data = await this.request<TrackedOrder[]>(`/stores/${tenantSlug}/orders`)
    if (data && Array.isArray(data)) return data
    if (!DEMO_MODE) return []
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    return tenant ? mockStore.getOrders(tenant.id) : []
  }

  async placeOrder(tenantSlug: string, order: TrackedOrder): Promise<TrackedOrder> {
    const data = await this.request<TrackedOrder>(`/stores/${tenantSlug}/orders`, {
      method: 'POST',
      body: JSON.stringify(order),
    })
    if (data) return data
    if (!DEMO_MODE) throw new Error('Could not place the order.')
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    if (tenant) mockStore.placeOrder(tenant.id, order)
    return order
  }

  // --- REVIEWS ---
  async getReviews(tenantSlug: string, productId?: number): Promise<Review[]> {
    const query = productId ? `?productId=${productId}` : ''
    const data = await this.request<Review[]>(`/stores/${tenantSlug}/reviews${query}`)
    if (data && Array.isArray(data)) return data
    if (!DEMO_MODE) return []
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    return tenant ? mockStore.getReviews(tenant.id) : []
  }

  async postReview(tenantSlug: string, review: Omit<Review, 'id'>): Promise<Review | null> {
    const data = await this.request<Review>(`/stores/${tenantSlug}/reviews`, {
      method: 'POST',
      body: JSON.stringify(review),
    })
    if (data) return data
    if (!DEMO_MODE) return null
    const tenant = mockStore.getTenantBySlug(tenantSlug)
    const fullReview: Review = { ...review, id: Date.now() }
    if (tenant) mockStore.submitReview(tenant.id, fullReview)
    return fullReview
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
    if (!DEMO_MODE) return null

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
    return DEMO_MODE ? mockStore.getPlatformStats() : null
  }

  async getAdminTenants(): Promise<TenantConfig[]> {
    const data = await this.request<TenantConfig[]>('/admin/tenants')
    if (data && Array.isArray(data)) return data
    return DEMO_MODE ? mockStore.getAllTenants() : []
  }

  async getAdminApplications(): Promise<TenantApplication[]> {
    const data = await this.request<TenantApplication[]>('/admin/applications')
    if (data && Array.isArray(data)) return data
    return DEMO_MODE ? mockStore.getAllApplications() : []
  }

  async updateApplicationStatus(id: string, status: 'approved' | 'rejected'): Promise<TenantApplication | null> {
    const data = await this.request<TenantApplication>(`/admin/applications/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
    if (DEMO_MODE) {
      if (status === 'approved') mockStore.approveTenant(id)
      else mockStore.rejectApplication(id)
    }
    return data || (DEMO_MODE ? mockStore.getAllApplications().find((a) => a.id === id) || null : null)
  }
}

export const apiClient = new ApiClient()
