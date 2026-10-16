// --- Mock Platform Store ---
// Simulates isolated-database-per-tenant architecture in memory.
// Each tenant's data lives in a completely separate data structure.
// When moving to production, replace this with real Supabase calls.

import type { TenantConfig, TenantApplication, PlatformStats, DashboardStats, ThemeConfig } from '@/types/tenant'
import type { Product, Review, TrackedOrder } from '@/types'
import { MOCK_TENANTS, MOCK_APPLICATIONS, MOCK_TENANT_DATABASES, type TenantDatabase } from '@/data/mock-tenants'
import { buildTenantCategories, getNichePreset, inferStoreType } from '@/data/store-niches'
import { PLAN_CATALOG, TRIAL_DAYS, normalizePlanId } from '@/data/plans'

const STORAGE_KEY_TENANTS = 'orvexa_tenants_v1'
const STORAGE_KEY_DATABASES = 'orvexa_databases_v1'
const STORAGE_KEY_APPLICATIONS = 'orvexa_applications_v1'

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

class MockPlatformStore {
  // --- MASTER DATABASE ---
  private tenants: Map<string, TenantConfig>
  private applications: Map<string, TenantApplication>

  // --- ISOLATED TENANT DATABASES ---
  private tenantDatabases: Map<string, TenantDatabase>

  constructor() {
    // Initialize master database
    this.tenants = new Map(MOCK_TENANTS.map((t) => [t.id, { ...t }]))
    this.applications = new Map(MOCK_APPLICATIONS.map((a) => [a.id, { ...a }]))

    // Initialize isolated tenant databases (deep copy)
    this.tenantDatabases = new Map()
    MOCK_TENANT_DATABASES.forEach((db, tenantId) => {
      this.tenantDatabases.set(tenantId, {
        products: [...db.products],
        reviews: [...db.reviews],
        orders: [...db.orders],
        customers: [...db.customers],
      })
    })

    // Hydrate from localStorage if running in browser
    this.reloadFromStorage()

    if (isBrowser()) {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY_TENANTS || e.key === STORAGE_KEY_DATABASES) {
          this.reloadFromStorage()
        }
      })
    }
  }

  // Persist all state to localStorage so changes survive page reload & cross-tab navigation
  public persist(): void {
    if (!isBrowser()) return
    try {
      const tenantsList = Array.from(this.tenants.values())
      localStorage.setItem(STORAGE_KEY_TENANTS, JSON.stringify(tenantsList))

      const dbEntries = Array.from(this.tenantDatabases.entries())
      localStorage.setItem(STORAGE_KEY_DATABASES, JSON.stringify(dbEntries))

      const appsList = Array.from(this.applications.values())
      localStorage.setItem(STORAGE_KEY_APPLICATIONS, JSON.stringify(appsList))

      window.dispatchEvent(new CustomEvent('orvexa:store-updated', { detail: { timestamp: Date.now() } }))
    } catch (e) {
      console.warn('Failed to persist mockStore to localStorage', e)
    }
  }

  public reloadFromStorage(): void {
    if (!isBrowser()) return
    try {
      const storedTenants = localStorage.getItem(STORAGE_KEY_TENANTS)
      if (storedTenants) {
        const parsed: TenantConfig[] = JSON.parse(storedTenants)
        parsed.forEach((t) => {
          this.tenants.set(t.id, t)
        })
      }
      const storedDbs = localStorage.getItem(STORAGE_KEY_DATABASES)
      if (storedDbs) {
        const parsed: [string, TenantDatabase][] = JSON.parse(storedDbs)
        parsed.forEach(([id, db]) => {
          this.tenantDatabases.set(id, db)
        })
      }
      const storedApps = localStorage.getItem(STORAGE_KEY_APPLICATIONS)
      if (storedApps) {
        const parsed: TenantApplication[] = JSON.parse(storedApps)
        parsed.forEach((a) => {
          this.applications.set(a.id, a)
        })
      }
    } catch (e) {
      console.warn('Failed to reload mockStore from localStorage', e)
    }
  }

  // =================================================================
  // MASTER DATABASE OPERATIONS (Super Admin)
  // =================================================================

  getAllTenants(): TenantConfig[] {
    return Array.from(this.tenants.values())
  }

  getTenantById(id: string): TenantConfig | null {
    return this.tenants.get(id) || null
  }

  getTenantBySlug(slug: string): TenantConfig | null {
    return Array.from(this.tenants.values()).find((t) => t.slug === slug) || null
  }

  getTenantByDomain(domain: string): TenantConfig | null {
    const host = String(domain || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, '')
    if (!host) return null
    return (
      Array.from(this.tenants.values()).find((t) => {
        const mapped = String(t.customDomain || '')
          .toLowerCase()
          .replace(/^www\./, '')
        return Boolean(mapped) && mapped === host
      }) || null
    )
  }

  getAllApplications(): TenantApplication[] {
    return Array.from(this.applications.values())
  }

  getPendingApplications(): TenantApplication[] {
    return Array.from(this.applications.values()).filter((a) => a.status === 'pending' || a.status === 'needs_info')
  }

  // Applications loaded from the backend (website signups included) replace local copies by id.
  mergeApplications(remote: TenantApplication[]): void {
    remote.forEach((a) => this.applications.set(a.id, { ...this.applications.get(a.id), ...a }))
    this.persist()
  }

  approveTenant(applicationId: string, slugOverride?: string): TenantConfig | null {
    const app = this.applications.get(applicationId)
    if (!app || app.status === 'waitlist') return null

    const slug = slugOverride || app.requestedSlug
    const existingTenant = Array.from(this.tenants.values()).find((t) => t.slug === slug)
    // Only a placeholder store created for this application may be reused; a live store keeps its address.
    if (existingTenant && existingTenant.status !== 'pending') return null

    app.requestedSlug = slug
    app.status = 'approved'
    app.slugCheck = { available: true }

    if (existingTenant) {
      existingTenant.status = 'active'
      this.persist()
      return existingTenant
    }

    return this.createBlankStore({
      brandName: app.brandName,
      slug: app.requestedSlug,
      ownerName: app.ownerName || app.ownerEmail.split('@')[0],
      ownerEmail: app.ownerEmail,
      ownerPhone: app.phone,
      plan: normalizePlanId(app.requestedPlan?.id),
      subscriptionStatus: 'trial',
      storeType: app.storeType || inferStoreType(app.niche),
      niche: app.niche,
      categories: app.categories,
    })
  }

  provisionTenant(input: {
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
  }): TenantConfig {
    return this.createBlankStore({
      ...input,
      storeType: input.storeType || inferStoreType(input.niche),
      subscriptionStatus: 'active',
    })
  }

  // Every new store reuses the Lunar storefront layout but starts empty:
  // no products, photos, reviews or customers — only its own niche categories.
  private createBlankStore(input: {
    brandName: string
    slug: string
    ownerName: string
    ownerEmail: string
    ownerPhone?: string
    plan?: 'starter' | 'pro' | 'enterprise'
    subscriptionStatus: 'active' | 'trial'
    storeType: string
    niche?: string
    categories?: string[]
    primaryColor?: string
    accentColor?: string
    customDomain?: string
  }): TenantConfig {
    const cleanSlug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'store'
    const tenantId = `tenant_${cleanSlug}`
    const preset = getNichePreset(input.storeType)
    const nicheLabel = input.niche || preset.label
    const categoryNames = input.categories && input.categories.length > 0 ? input.categories : preset.categories
    const brandName = input.brandName.trim()
    const plan = input.plan || 'starter'
    const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const newTenant: TenantConfig = {
      id: tenantId,
      slug: cleanSlug,
      brandName,
      ownerName: input.ownerName.trim(),
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
      ownerPhone: input.ownerPhone || '',
      logo: '',
      customDomain: input.customDomain || '',
      status: 'active',
      plan,
      createdAt: new Date().toISOString().split('T')[0],
      storeType: preset.id,
      niche: nicheLabel,
      categories: buildTenantCategories(categoryNames),
      contact: {
        phone: input.ownerPhone || '',
        email: input.ownerEmail.trim().toLowerCase(),
      },
      theme: {
        primaryColor: input.primaryColor || preset.primaryColor,
        accentColor: input.accentColor || preset.accentColor,
        backgroundColor: '#FAFAF8',
        fontDisplay: "'Instrument Serif', Georgia, serif",
        fontSans: "'Work Sans', system-ui, sans-serif",
        heroImage: '',
        heroHeadline: brandName,
        heroCtaText: 'SHOP NOW →',
        logoUrl: '',
        announcementMessages: [
          `WELCOME TO ${brandName.toUpperCase()}`,
          `${nicheLabel.toUpperCase()} • OFFICIAL STORE`,
        ],
        enableAnimations: true,
        enableReviews: true,
        enableOrderTracking: true,
      },
      subscription: {
        plan,
        pricePerMonth: PLAN_CATALOG[plan].pricePerMonth,
        status: input.subscriptionStatus,
        trialEndsAt: trialEnds,
        nextBillingDate: trialEnds,
        paymentMethod: 'manual',
        invoices: [],
      },
    }

    this.tenants.set(tenantId, newTenant)
    this.tenantDatabases.set(tenantId, { products: [], reviews: [], orders: [], customers: [] })
    this.persist()

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('orvexa:tenant-provisioned', { detail: newTenant }))
    }

    return newTenant
  }

  submitApplication(appData: {
    brandName: string
    ownerName: string
    ownerEmail: string
    phone: string
    niche: string
    storeType?: string
    categories?: string[]
    requestedSlug: string
    message?: string
  }): TenantApplication {
    const slug = appData.requestedSlug.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'store'
    const id = `app_${slug}_${Date.now()}`
    const newApp: TenantApplication = {
      id,
      brandName: appData.brandName,
      ownerName: appData.ownerName,
      ownerEmail: appData.ownerEmail,
      phone: appData.phone,
      niche: appData.niche || 'Fashion & Apparel',
      storeType: appData.storeType || inferStoreType(appData.niche),
      categories: appData.categories,
      requestedSlug: slug,
      message: appData.message || 'Client application submitted via Orvexa Cloud platform portal',
      submittedAt: new Date().toISOString().split('T')[0],
      status: 'pending',
    }
    this.applications.set(id, newApp)
    this.persist()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('orvexa:application-submitted', { detail: newApp }))
    }
    return newApp
  }

  isSlugAvailable(slug: string): boolean {
    const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (!clean) return false
    const existingTenant = Array.from(this.tenants.values()).some((t) => t.slug === clean)
    const existingPending = Array.from(this.applications.values()).some(
      (a) => a.requestedSlug === clean && (a.status === 'pending' || a.status === 'needs_info')
    )
    return !existingTenant && !existingPending
  }

  rejectApplication(applicationId: string): void {
    const app = this.applications.get(applicationId)
    if (app) {
      app.status = 'rejected'
      this.persist()
    }
  }

  markNeedsInfo(applicationId: string, reviewNotes: string): void {
    const app = this.applications.get(applicationId)
    if (!app || app.status === 'approved' || app.status === 'waitlist') return
    app.status = 'needs_info'
    app.reviewNotes = reviewNotes
    this.persist()
  }

  setTenantStatus(tenantId: string, status: TenantConfig['status']): void {
    const tenant = this.tenants.get(tenantId)
    if (tenant) {
      tenant.status = status
      this.persist()
    }
  }

  suspendTenant(tenantId: string): void {
    this.setTenantStatus(tenantId, 'suspended')
  }

  reactivateTenant(tenantId: string): void {
    const tenant = this.tenants.get(tenantId)
    if (tenant) {
      tenant.status = 'active'
      this.persist()
    }
  }

  changePlan(tenantId: string, plan: 'starter' | 'pro' | 'enterprise'): void {
    const tenant = this.tenants.get(tenantId)
    if (tenant) {
      tenant.plan = plan
      tenant.subscription.plan = plan
      tenant.subscription.pricePerMonth = PLAN_CATALOG[plan].pricePerMonth
      this.persist()
    }
  }

  markInvoicePaid(tenantId: string, invoiceId: string): void {
    const tenant = this.tenants.get(tenantId)
    if (tenant) {
      const invoice = tenant.subscription.invoices.find((i) => i.id === invoiceId)
      if (invoice) {
        invoice.status = 'paid'
        this.persist()
      }
    }
  }

  getPlatformStats(): PlatformStats {
    const tenants = Array.from(this.tenants.values())
    const active = tenants.filter((t) => t.status === 'active')
    const totalGMV = active.reduce((sum, t) => {
      const db = this.tenantDatabases.get(t.id)
      return sum + (db?.orders.reduce((s, o) => s + o.total, 0) || 0)
    }, 0)

    return {
      totalGMV,
      activeStores: active.length,
      pendingApplications: this.getPendingApplications().length,
      monthlyRecurringRevenue: active.reduce((sum, t) => sum + t.subscription.pricePerMonth, 0),
      totalCustomers: active.reduce((sum, t) => {
        const db = this.tenantDatabases.get(t.id)
        return sum + (db?.customers.length || 0)
      }, 0),
      newApplicationsThisWeek: this.getPendingApplications().length,
    }
  }

  // =================================================================
  // TENANT DATABASE OPERATIONS (scoped to tenant_id)
  // =================================================================

  private getDB(tenantId: string): TenantDatabase {
    let db = this.tenantDatabases.get(tenantId)
    if (!db) {
      // Check if tenantId was passed as slug
      const tenant = Array.from(this.tenants.values()).find((t) => t.slug === tenantId || t.id === tenantId)
      if (tenant) {
        db = this.tenantDatabases.get(tenant.id)
      }
    }
    if (!db) throw new Error(`No database found for tenant ${tenantId}`)
    return db
  }

  // Products
  getProducts(tenantId: string): Product[] {
    return this.getDB(tenantId).products
  }

  addProduct(tenantId: string, product: Product): void {
    this.getDB(tenantId).products.push(product)
    this.persist()
  }

  updateProduct(tenantId: string, productId: number, data: Partial<Product>): void {
    const db = this.getDB(tenantId)
    const idx = db.products.findIndex((p) => p.id === productId)
    if (idx !== -1) {
      db.products[idx] = { ...db.products[idx], ...data }
      this.persist()
    }
  }

  deleteProduct(tenantId: string, productId: number): void {
    const db = this.getDB(tenantId)
    db.products = db.products.filter((p) => p.id !== productId)
    this.persist()
  }

  // Orders
  getOrders(tenantId: string): TrackedOrder[] {
    return this.getDB(tenantId).orders
  }

  placeOrder(tenantId: string, order: TrackedOrder, customerEmail?: string): void {
    const db = this.getDB(tenantId)
    db.orders.unshift(order)

    const phone = order.shippingAddress?.phone || ''
    const email = customerEmail || ''
    const existing = db.customers.find((c) => (email && c.email === email) || (phone && c.phone === phone))
    if (existing) {
      existing.orderCount = (existing.orderCount ?? existing.ordersCount ?? 0) + 1
      existing.totalSpent += order.total
    } else {
      db.customers.push({
        id: `cust_${Date.now()}`,
        name: order.shippingAddress?.name || 'Customer',
        email,
        phone,
        orderCount: 1,
        totalSpent: order.total,
        joinedDate: order.date,
      })
    }
    this.persist()
  }

  updateOrderStatus(tenantId: string, orderId: string, status: TrackedOrder['status'], courier?: string, awb?: string): void {
    const db = this.getDB(tenantId)
    const order = db.orders.find((o) => o.id === orderId)
    if (order) {
      order.status = status
      if (courier) order.courier = courier
      if (awb) order.awb = awb
      
      // Update timeline
      const statusTitle = 
        status === 'In Transit' ? 'Dispatched with Blue Dart Express' :
        status === 'Out for Delivery' ? 'Out for Delivery with Courier Agent' :
        status === 'Delivered' ? 'Delivered to Customer Doorstep' :
        'Order Confirmed & Processing'

      order.timeline.push({
        title: statusTitle,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        desc: `Status updated to ${status} by fulfillment team.`,
        completed: true,
        current: true,
      })
      this.persist()
    }
  }

  // Reviews
  getReviews(tenantId: string): Review[] {
    return this.getDB(tenantId).reviews
  }

  submitReview(tenantId: string, review: Review): void {
    this.getDB(tenantId).reviews.unshift(review)
    this.persist()
  }

  // Theme & Tenant Profile
  updateTheme(tenantIdOrSlug: string, theme: Partial<ThemeConfig>): void {
    let tenant = this.tenants.get(tenantIdOrSlug)
    if (!tenant) {
      tenant = Array.from(this.tenants.values()).find((t) => t.slug === tenantIdOrSlug || t.id === tenantIdOrSlug)
    }
    if (tenant) {
      tenant.theme = { ...tenant.theme, ...theme }
      if (theme.tagline) tenant.tagline = theme.tagline
      if (theme.aboutStory) tenant.aboutStory = theme.aboutStory
      if (theme.heroHeadline) {
        tenant.theme.heroHeadline = theme.heroHeadline
        tenant.tagline = theme.heroHeadline
      }
      if (theme.heroImage) {
        tenant.theme.heroImage = theme.heroImage
      }
      if (theme.logoUrl) {
        tenant.logo = theme.logoUrl
        tenant.theme.logoUrl = theme.logoUrl
      }
      this.tenants.set(tenant.id, { ...tenant })
      this.persist()
    }
  }

  updateTenant(tenantIdOrSlug: string, updates: Partial<TenantConfig>): void {
    let tenant = this.tenants.get(tenantIdOrSlug)
    if (!tenant) {
      tenant = Array.from(this.tenants.values()).find((t) => t.slug === tenantIdOrSlug || t.id === tenantIdOrSlug)
    }
    if (tenant) {
      Object.assign(tenant, updates)
      if (updates.name && !updates.brandName) tenant.brandName = updates.name
      if (updates.brandName && !updates.name) tenant.name = updates.brandName
      if (updates.logo) {
        if (!tenant.theme) tenant.theme = {} as any
        tenant.theme.logoUrl = updates.logo
        tenant.logo = updates.logo
      }
      if (updates.theme) {
        tenant.theme = { ...tenant.theme, ...updates.theme }
      }
      this.tenants.set(tenant.id, { ...tenant })
      this.persist()
    }
  }

  // Dashboard Stats
  getDashboardStats(tenantId: string): DashboardStats {
    const db = this.getDB(tenantId)
    const totalRevenue = db.orders.reduce((sum, o) => sum + o.total, 0)
    const isTemplate = !!this.tenants.get(tenantId)?.storeType

    if (isTemplate) {
      const sales = new Map<string, { revenue: number; orders: number }>()
      for (const order of db.orders) {
        for (const item of order.items || []) {
          const s = sales.get(item.name) || { revenue: 0, orders: 0 }
          s.revenue += item.price * item.quantity
          s.orders += item.quantity
          sales.set(item.name, s)
        }
      }
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        return d
      })
      return {
        revenue: totalRevenue,
        revenueChange: 0,
        orderCount: db.orders.length,
        orderCountChange: 0,
        averageOrderValue: db.orders.length ? totalRevenue / db.orders.length : 0,
        customerCount: db.customers.length,
        topProducts: db.products
          .map((p) => ({ name: p.name, ...(sales.get(p.name) || { revenue: 0, orders: 0 }) }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5),
        recentOrders: db.orders.slice(0, 5).map((o) => ({
          id: o.id,
          customer: o.shippingAddress.name,
          total: o.total,
          status: o.status,
          date: o.date,
        })),
        revenueByDay: days.map((d) => {
          const dayOrders = db.orders.filter((o) => new Date(o.date).toDateString() === d.toDateString())
          return {
            date: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
            amount: dayOrders.reduce((sum, o) => sum + o.total, 0),
            orders: dayOrders.length,
          }
        }),
      }
    }

    return {
      revenue: totalRevenue,
      revenueChange: 12.5,
      orderCount: db.orders.length,
      orderCountChange: 8.3,
      averageOrderValue: db.orders.length ? totalRevenue / db.orders.length : 0,
      customerCount: db.customers.length,
      topProducts: db.products.slice(0, 5).map((p) => ({
        name: p.name,
        revenue: p.price * (p.reviewsCount || 10),
        orders: p.reviewsCount || 10,
      })),
      recentOrders: db.orders.slice(0, 5).map((o) => ({
        id: o.id,
        customer: o.shippingAddress.name,
        total: o.total,
        status: o.status,
        date: o.date,
      })),
      revenueByDay: Array.from({ length: 7 }, (_, i) => ({
        date: `Sep ${6 + i}`,
        amount: Math.floor(Math.random() * 5000) + 1000,
      })),
    }
  }

  // Storefront config (returns tenant + products in one call)
  getStorefrontConfig(slug: string): (TenantConfig & { products: Product[]; reviews: Review[] }) | null {
    const tenant = this.getTenantBySlug(slug)
    if (!tenant || tenant.status !== 'active') return null

    const db = this.tenantDatabases.get(tenant.id)
    if (!db) return null

    return {
      ...tenant,
      products: db.products,
      reviews: db.reviews,
    }
  }
}

// Singleton instance — simulates the platform's backend
export const mockStore = new MockPlatformStore()
