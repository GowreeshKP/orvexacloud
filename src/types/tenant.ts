// --- Multi-Tenant SaaS Platform Types ---
export type { TrackedOrder } from './index'

export interface TenantConfig {
  id: string
  slug: string
  customMongoUri?: string
  name?: string
  brandName: string
  tagline?: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  logo: string
  logoUrl?: string
  theme: ThemeConfig
  status: 'pending' | 'active' | 'read_only' | 'suspended' | 'cancelled'
  plan: 'starter' | 'pro' | 'enterprise'
  customDomain?: string
  customDomainVerified?: boolean
  createdAt: string
  // Niche preset id from src/data/store-niches.ts. Set only on stores cloned
  // from the blank template; legacy demo stores leave it undefined.
  storeType?: string
  niche?: string
  currency?: string
  currencySymbol?: string
  aboutStory?: string
  contact?: {
    phone?: string
    email?: string
    address?: string
    workingHours?: string
    shippingThresholdFormatted?: string
  }
  categories?: {
    id: string
    name: string
    slug: string
    desc: string
    image: string
  }[]
  subscription: SubscriptionInfo
  databaseConfig?: {
    dbName: string
    mongoUri: string
    isolationMode: string
    folderPath: string
  }
}

export interface ThemeConfig {
  primaryColor: string
  accentColor: string
  backgroundColor: string
  fontDisplay: string
  fontSans: string
  heroImage: string
  heroHeadline?: string
  heroSubhead?: string
  heroCtaText?: string
  secondaryCtaText?: string
  tagline?: string
  aboutStory?: string
  logoUrl: string
  announcementMessages: string[]
  enableAnimations: boolean
  enableReviews: boolean
  enableOrderTracking: boolean
  discountCode?: string
  discountPercent?: number
  // Owner text overrides keyed by StorefrontCopy field; blank values fall back to the niche default.
  copy?: Record<string, string>
  trustItems?: { icon: string; text: string }[]
  homeSections?: { id: HomeSectionId; visible: boolean }[]
  pdpOptions?: Partial<Record<PdpOptionId, boolean>>
  footerOptions?: { trustStrip?: boolean; newsletter?: boolean }
  socialLinks?: { instagram?: string; whatsapp?: string; pinterest?: string; facebook?: string }
  freeShippingThreshold?: number
  shippingFee?: number
}

export type HomeSectionId = 'trustBar' | 'bestsellers' | 'categories' | 'featured' | 'triptych' | 'mission'
export type PdpOptionId = 'zoom' | 'guarantee' | 'details' | 'shipping' | 'related'

export interface SubscriptionInfo {
  plan: 'starter' | 'pro' | 'enterprise'
  pricePerMonth: number
  status: 'active' | 'past_due' | 'cancelled' | 'trial'
  trialEndsAt?: string
  nextBillingDate: string
  cycle?: 'monthly' | 'yearly'
  paymentMethod: 'razorpay' | 'stripe' | 'manual'
  invoices: Invoice[]
}

export interface Invoice {
  id: string
  amount: number
  status: 'paid' | 'pending' | 'failed'
  date: string
  description: string
}

export interface TenantApplication {
  id: string
  brandName: string
  ownerName: string
  ownerEmail: string
  phone: string
  niche: string
  storeType?: string
  categories?: string[]
  requestedSlug: string
  message: string
  submittedAt: string
  // 'needs_info' stays in review until the applicant answers. 'waitlist' is early access and is never provisioned.
  status: 'pending' | 'needs_info' | 'approved' | 'rejected' | 'waitlist'
  reviewNotes?: string
  launchNotifiedAt?: string
  // Fields below arrive with marketing-site signups (POST /api/public/signups).
  channel?: 'admin' | 'website'
  requestedPlan?: { id: string; name?: string; cycle?: 'monthly' | 'yearly'; currency?: string; total?: number; trialDays?: number }
  launch?: { status: 'live' | 'early_access'; country: string }
  migration?: { from?: string | null; currentDomain?: string | null } | null
  consents?: { marketing: boolean; termsAcceptedAt?: string; termsVersion?: { terms?: string; privacy?: string; refunds?: string } | null }
  attribution?: { site?: string; country?: string; referrer?: string; utm?: Record<string, string> }
  slugCheck?: { available: boolean; reason?: 'reserved' | 'taken' | 'requested' | 'invalid' }
}

export interface PlatformStats {
  totalGMV: number
  activeStores: number
  pendingApplications: number
  monthlyRecurringRevenue: number
  totalCustomers: number
  newApplicationsThisWeek: number
}

export interface DashboardStats {
  revenue: number
  revenueChange: number
  orderCount: number
  orderCountChange: number
  averageOrderValue: number
  customerCount: number
  topProducts: { name: string; revenue: number; orders: number }[]
  recentOrders: { id: string; customer: string; total: number; status: string; date: string }[]
  revenueByDay: { date: string; amount: number; orders?: number }[]
}
