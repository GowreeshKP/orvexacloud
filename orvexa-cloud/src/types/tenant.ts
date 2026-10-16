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
  status: 'pending' | 'active' | 'suspended' | 'cancelled'
  plan: 'starter' | 'pro' | 'enterprise'
  customDomain?: string
  createdAt: string
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
}

export interface SubscriptionInfo {
  plan: 'starter' | 'pro' | 'enterprise'
  pricePerMonth: number
  status: 'active' | 'past_due' | 'cancelled' | 'trial'
  trialEndsAt?: string
  nextBillingDate: string
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
  requestedSlug: string
  message: string
  submittedAt: string
  status: 'pending' | 'approved' | 'rejected'
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
  revenueByDay: { date: string; amount: number }[]
}
