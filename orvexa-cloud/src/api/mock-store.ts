// --- Mock Platform Store ---
// Simulates isolated-database-per-tenant architecture in memory.
// Each tenant's data lives in a completely separate data structure.
// When moving to production, replace this with real Supabase calls.

import type { TenantConfig, TenantApplication, PlatformStats, DashboardStats, ThemeConfig } from '@/types/tenant'
import type { Product, Review, TrackedOrder } from '@/types'
import { MOCK_TENANTS, MOCK_APPLICATIONS, MOCK_TENANT_DATABASES, type TenantDatabase } from '@/data/mock-tenants'

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
    return Array.from(this.tenants.values()).find((t) => t.customDomain === domain) || null
  }

  getAllApplications(): TenantApplication[] {
    return Array.from(this.applications.values())
  }

  getPendingApplications(): TenantApplication[] {
    return Array.from(this.applications.values()).filter((a) => a.status === 'pending')
  }

  approveTenant(applicationId: string): TenantConfig | null {
    const app = this.applications.get(applicationId)
    if (!app) return null

    app.status = 'approved'

    // Check if tenant already exists in pending state
    const existingTenant = Array.from(this.tenants.values()).find((t) => t.slug === app.requestedSlug)
    if (existingTenant) {
      existingTenant.status = 'active'
      return existingTenant
    }

    // Provision a new tenant in master DB
    const tenantId = `tenant_${app.requestedSlug}_${Date.now()}`
    
    // Choose curated themes based on niche/brand
    let primaryColor = '#8C5A4F'
    let accentColor = '#D4A574'
    let heroImage = 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243'
    let fontDisplay = "'Instrument Serif', Georgia, serif"
    let fontSans = "'Work Sans', system-ui, sans-serif"

    if (app.requestedSlug.includes('bloom') || app.niche.toLowerCase().includes('baby')) {
      primaryColor = '#3D5A80'
      accentColor = '#98C1D9'
      heroImage = 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2175.jpg?v=1766941862'
      fontDisplay = "'Playfair Display', Georgia, serif"
      fontSans = "'Inter', system-ui, sans-serif"
    } else if (app.requestedSlug.includes('khadi')) {
      primaryColor = '#5C6B4E'
      accentColor = '#C2B280'
      heroImage = 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2175.jpg?v=1766941862'
      fontDisplay = "'Cormorant Garamond', Georgia, serif"
      fontSans = "'Source Sans 3', system-ui, sans-serif"
    }

    const newTenant: TenantConfig = {
      id: tenantId,
      slug: app.requestedSlug,
      brandName: app.brandName,
      ownerName: app.ownerName,
      ownerEmail: app.ownerEmail,
      ownerPhone: app.phone,
      logo: '',
      status: 'active',
      plan: 'starter',
      createdAt: new Date().toISOString().split('T')[0],
      theme: {
        primaryColor,
        accentColor,
        backgroundColor: '#FAFAF8',
        fontDisplay,
        fontSans,
        heroImage,
        logoUrl: '',
        announcementMessages: [
          `${app.brandName.toUpperCase()} • ${app.niche.toUpperCase()}`,
          'FREE SHIPPING IN INDIA OVER ₹999',
          `USE CODE: ${app.requestedSlug.toUpperCase()}10 FOR 10% OFF`,
        ],
        enableAnimations: true,
        enableReviews: true,
        enableOrderTracking: true,
      },
      subscription: {
        plan: 'starter',
        pricePerMonth: 999,
        status: 'trial',
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        paymentMethod: 'manual',
        invoices: [],
      },
    }

    this.tenants.set(tenantId, newTenant)

    // Check if pre-seeded database exists in MOCK_TENANT_DATABASES
    let existingDB = Array.from(this.tenantDatabases.entries()).find(([k]) => k.includes(app.requestedSlug))?.[1]
    
    if (existingDB && existingDB.products.length > 0) {
      this.tenantDatabases.set(tenantId, existingDB)
    } else {
      // Seed rich tailored products for this newly approved store
      this.tenantDatabases.set(tenantId, {
        products: [
          {
            id: 401,
            name: `${app.brandName} Signature Artisanal Piece`,
            category: 'maxis',
            sculptLevel: 'HERITAGE CRAFT',
            fabricTech: 'Handcrafted Organic Weave',
            fabricDesc: `Exquisite handcrafted piece created by artisans of ${app.brandName}, blending traditional craftsmanship with contemporary elegance.`,
            compression: 'Tailored Fit',
            price: 1899,
            priceFormatted: '₹1,899',
            rating: 4.9,
            reviewsCount: 32,
            badge: 'Bestseller',
            colors: [
              { name: 'Warm Terracotta', hex: '#E07A5F' },
              { name: 'Natural Sand', hex: '#F4F1DE' },
            ],
            sizes: ['S', 'M', 'L', 'XL'],
            imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243',
            images: [
              'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243',
              'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5205.jpg?v=1778607246',
            ],
            desc: `Designed exclusively by ${app.brandName}. Soft, breathable, handcrafted with functional utility.`,
            details: [
              `Authentic ${app.niche}`,
              '100% Premium Pure Yarn',
              'Artisan direct quality guaranteed',
            ],
            fitInfo: 'True to size with flowing silhouette.',
          },
          {
            id: 402,
            name: `${app.brandName} Classic Festive Ensemble`,
            category: 'dresses',
            sculptLevel: 'FESTIVE WEAVE',
            fabricTech: 'Handloom Cotton Blend',
            fabricDesc: `Lightweight and elegant silhouette tailored for celebrations and special occasions.`,
            compression: 'Festive Drape',
            price: 2499,
            priceFormatted: '₹2,499',
            rating: 5.0,
            reviewsCount: 19,
            badge: 'New Season',
            colors: [
              { name: 'Royal Indigo', hex: '#3D5A80' },
              { name: 'Golden Honey', hex: '#EE6C4D' },
            ],
            sizes: ['S', 'M', 'L', 'XL'],
            imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5234.jpg?v=1778607246',
            images: [
              'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5234.jpg?v=1778607246',
            ],
            desc: `Refined festive design celebrating Indian heritage weaving traditions.`,
            details: [
              'Includes matching lining',
              'Functional side pockets',
              'Hand-finished hemline',
            ],
            fitInfo: 'Flared festive fit.',
          },
          {
            id: 403,
            name: `${app.brandName} Handblock Motif Stole`,
            category: 'kalamkari',
            sculptLevel: 'HANDBLOCK PRINT',
            fabricTech: 'Natural Dye Block Print',
            fabricDesc: `Handblock printed using traditional natural botanical dyes.`,
            compression: 'Airy Drape',
            price: 999,
            priceFormatted: '₹999',
            rating: 4.8,
            reviewsCount: 24,
            badge: 'Artisan Pick',
            colors: [
              { name: 'Earth Ochre', hex: '#DDA15E' },
              { name: 'Forest Green', hex: '#283618' },
            ],
            sizes: ['Free Size (2m)'],
            imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2171_1.jpg?v=1766941862',
            images: [
              'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2171_1.jpg?v=1766941862',
            ],
            desc: `Handcrafted natural dye stole featuring bespoke artisanal motifs.`,
            details: [
              'Length: 2.2 meters',
              'Handwoven breathable yarn',
            ],
            fitInfo: 'Free size drape.',
          },
        ],
        reviews: [
          {
            id: 401,
            productId: 401,
            author: 'Ananya S.',
            rating: 5,
            date: 'Just now',
            title: `Exceptional quality from ${app.brandName}`,
            comment: `The material is incredible and the stitching is perfection. Highly recommended!`,
            verified: true,
          },
        ],
        orders: [],
        customers: [],
      })
    }

    this.persist()
    return newTenant
  }

  provisionTenant(input: {
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
  }): TenantConfig {
    const cleanSlug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'store'
    const tenantId = `tenant_${cleanSlug}`

    const primaryColor = input.primaryColor || '#1e3a8a'
    const accentColor = input.accentColor || '#3b82f6'

    const newTenant: TenantConfig = {
      id: tenantId,
      slug: cleanSlug,
      brandName: input.brandName.trim(),
      ownerName: input.ownerName.trim(),
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
      ownerPhone: input.ownerPhone || '',
      logo: '',
      customDomain: input.customDomain || '',
      status: 'active',
      plan: input.plan || 'starter',
      createdAt: new Date().toISOString().split('T')[0],
      theme: {
        primaryColor,
        accentColor,
        backgroundColor: '#FAFAF8',
        fontDisplay: "'Instrument Serif', Georgia, serif",
        fontSans: "'Work Sans', system-ui, sans-serif",
        heroImage: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243',
        logoUrl: '',
        announcementMessages: [
          `${input.brandName.toUpperCase()} • OFFICIAL STOREFRONT`,
          'FREE DOMESTIC SHIPPING ACROSS INDIA',
          `USE CODE ${cleanSlug.toUpperCase()}10 AT CHECKOUT`,
        ],
        enableAnimations: true,
        enableReviews: true,
        enableOrderTracking: true,
      },
      subscription: {
        plan: input.plan || 'starter',
        pricePerMonth: input.plan === 'enterprise' ? 4999 : input.plan === 'pro' ? 2499 : 999,
        status: 'active',
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        paymentMethod: 'manual',
        invoices: [],
      },
    }

    this.tenants.set(tenantId, newTenant)

    // Seed tailored catalog products for this store's isolated database
    this.tenantDatabases.set(tenantId, {
      products: [
        {
          id: 501,
          name: `${input.brandName} Signature Collection Maxi`,
          category: 'maxis',
          sculptLevel: 'HERITAGE WEAVE',
          fabricTech: '100% Breathable Pure Cotton',
          fabricDesc: `Artisanal masterpiece created with precision tailoring, flowing silhouette, and side utility pockets for ${input.brandName}.`,
          compression: 'Flowing Silhouette',
          price: 1899,
          priceFormatted: '₹1,899',
          rating: 4.9,
          reviewsCount: 22,
          badge: 'Bestseller',
          colors: [
            { name: 'Warm Terracotta', hex: '#E07A5F' },
            { name: 'Ivory Cream', hex: '#FFF8DC' },
          ],
          sizes: ['S', 'M', 'L', 'XL', 'XXL'],
          imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243',
          images: [
            'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243',
            'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5205.jpg?v=1778607246',
          ],
          desc: `Exclusively created for ${input.brandName}. Soft, breathable, handcrafted with deep functional utility pockets.`,
          details: [
            `Authentic ${input.niche || 'Fashion'} collection`,
            '100% Premium Pure Yarn',
            'Side waist tie-up ropes with functional pockets',
          ],
          fitInfo: 'True to size with flowing maxi drape.',
        },
        {
          id: 502,
          name: `${input.brandName} Handcrafted Artisan Ensemble`,
          category: 'dresses',
          sculptLevel: 'FESTIVE WEAVE',
          fabricTech: 'Natural Botanical Handloom',
          fabricDesc: 'Lightweight festive drape woven by skilled master weavers.',
          compression: 'Festive Fit',
          price: 2499,
          priceFormatted: '₹2,499',
          rating: 5.0,
          reviewsCount: 15,
          badge: 'Trending',
          colors: [
            { name: 'Indigo Blue', hex: '#3D5A80' },
            { name: 'Sage Green', hex: '#2E8B57' },
          ],
          sizes: ['S', 'M', 'L', 'XL'],
          imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5234.jpg?v=1778607246',
          images: [
            'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5234.jpg?v=1778607246',
          ],
          desc: `Handloom celebration piece from ${input.brandName}.`,
          details: ['Matching inner lining included', 'Hand-finished hemline'],
          fitInfo: 'Flared regular fit.',
        },
      ],
      reviews: [
        {
          id: 501,
          productId: 501,
          author: 'Pooja R.',
          rating: 5,
          date: 'Just now',
          title: `Exceptional craftsmanship from ${input.brandName}`,
          comment: 'The fabric feels so luxurious and the fit is stunning. Fast shipping too!',
          verified: true,
        },
      ],
      orders: [],
      customers: [
        {
          id: 'cust_01',
          name: input.ownerName,
          email: input.ownerEmail,
          phone: input.ownerPhone || '',
          ordersCount: 1,
          totalSpent: 1899,
          joinedDate: new Date().toISOString().split('T')[0],
        },
      ],
    })

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
      (a) => a.requestedSlug === clean && a.status === 'pending'
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

  suspendTenant(tenantId: string): void {
    const tenant = this.tenants.get(tenantId)
    if (tenant) {
      tenant.status = 'suspended'
      this.persist()
    }
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
      const pricing = { starter: 999, pro: 2499, enterprise: 4999 }
      tenant.plan = plan
      tenant.subscription.plan = plan
      tenant.subscription.pricePerMonth = pricing[plan]
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

  placeOrder(tenantId: string, order: TrackedOrder): void {
    this.getDB(tenantId).orders.unshift(order)
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
