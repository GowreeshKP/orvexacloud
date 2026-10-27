import type { TenantConfig } from '@/types/tenant'

export const bloomweaveTenantConfig: TenantConfig = {
  id: 'tenant_bloomweave_004',
  slug: 'bloomweave',
  brandName: 'Bloom & Weave',
  ownerName: 'Pooja Sharma',
  ownerEmail: 'pooja@bloomweave.com',
  ownerPhone: '+91 99887 76655',
  logo: '',
  status: 'active',
  plan: 'starter',
  createdAt: '2026-09-01',
  theme: {
    primaryColor: '#8B4513',
    accentColor: '#DAA520',
    backgroundColor: '#FFFDF9',
    fontDisplay: "'Cinzel', Georgia, serif",
    fontSans: "'Outfit', system-ui, sans-serif",
    heroImage: 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=1600&q=80',
    heroHeadline: 'Botanical Linens & Contemporary Weaves',
    heroSubhead: 'Timeless apparel inspired by nature, woven from 100% natural breathable European linen.',
    heroCtaText: 'EXPLORE WEAVES →',
    logoUrl: '',
    announcementMessages: [
      'NEW AUTUMN BOTANICAL COLLECTION • FLAT 15% OFF',
      'WORLDWIDE EXPRESS COURIER DISPATCH',
    ],
    enableAnimations: true,
    enableReviews: true,
    enableOrderTracking: true,
  },
  subscription: {
    plan: 'starter',
    pricePerMonth: 1460,
    status: 'active',
    nextBillingDate: '2026-10-01',
    paymentMethod: 'razorpay',
    invoices: [
      { id: 'INV-301', amount: 1460, status: 'paid', date: '2026-09-01', description: 'Starter Plan - September 2026' },
    ],
  },
  databaseConfig: {
    dbName: 'orvexa_tenant_bloomweave',
    mongoUri: 'mongodb://localhost:27017/orvexa_tenant_bloomweave',
    isolationMode: 'dedicated_database',
    folderPath: 'src/tenants/bloomweave',
  },
}
