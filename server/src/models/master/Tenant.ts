// --- Master Database: Tenant Store Registry Model ---
import { Schema, type Connection, type Model, type Document } from 'mongoose'
import { publicTenantIsolation } from '../../lib/tenant-db.js'

// read_only: storefront still shows products but takes no new orders (e.g. after failed payment);
// the owner and staff can still sign in to fix billing and fulfil existing orders.
// cancelled: closed by the owner; the storefront and sign-in are off.
export const TENANT_STATUSES = ['active', 'read_only', 'suspended', 'pending', 'cancelled'] as const
export type TenantStatus = (typeof TENANT_STATUSES)[number]

export function tenantAllowsSignIn(status: TenantStatus): boolean {
  return status === 'active' || status === 'read_only'
}

export interface IStaffMember {
  id: string
  name: string
  email: string
  passwordHash: string
  role: 'staff' | 'manager'
  createdAt: string
}

export interface ITenant extends Document {
  id: string
  slug: string
  brandName: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  passwordHash?: string
  passwordResetPending?: boolean
  passwordResetRequestedAt?: string
  /** Owner access tokens issued before this instant are rejected. */
  passwordChangedAt?: Date
  logo?: string
  tagline?: string
  aboutStory?: string
  contact?: {
    phone?: string
    email?: string
    address?: string
    workingHours?: string
    shippingThresholdFormatted?: string
  }
  customDomain?: string
  customDomainVerified?: boolean
  customDomainVerifiedAt?: string
  customMongoUri?: string // Dedicated Atlas cluster URI, or merchant BYODB
  customDbName?: string // Isolated MongoDB database name
  atlasProjectId?: string
  atlasProvisionStatus?: 'creating' | 'ready' | 'failed' | ''
  /** Unguessable owner-portal token. Shown only on the admin credentials endpoint. */
  ownerPortalToken?: string
  /** SHA-256 of a one-time data-export link issued when the store is cancelled. */
  exportTokenHash?: string
  exportTokenExpires?: Date
  staffMembers: IStaffMember[]
  status: TenantStatus
  plan: 'starter' | 'growth' | 'pro' | 'enterprise'
  createdAt: string
  storeType?: string
  niche?: string
  categories?: Array<{ id: string; name: string; slug: string; desc?: string; image?: string }>
  theme: {
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
    logoUrl?: string
    announcementMessages: string[]
    enableAnimations: boolean
    enableReviews: boolean
    enableOrderTracking: boolean
    discountCode?: string
    discountPercent?: number
    freeShippingThreshold?: number
    shippingFee?: number
    copy?: Record<string, string>
    trustItems?: Array<{ icon: string; text: string }>
    homeSections?: Array<{ id: string; visible: boolean }>
    pdpOptions?: Record<string, boolean>
    footerOptions?: { trustStrip?: boolean; newsletter?: boolean }
    socialLinks?: { instagram?: string; whatsapp?: string; pinterest?: string; facebook?: string }
  }
  subscription?: {
    plan: string
    pricePerMonth: number
    status: string
    cycle?: 'monthly' | 'yearly'
    trialEndsAt?: string
    graceEndsAt?: string
    nextBillingDate: string
    paymentMethod: string
    razorpaySubscriptionId?: string
    /** True when read-only or suspended was set by billing, so a later payment can reopen the store. */
    billingManaged?: boolean
    invoices: Array<{ id: string; amount: number; amountExTax?: number; tax?: number; gstRate?: number; status: string; date: string; description: string }>
  }
}

export const TenantSchema = new Schema<ITenant>(
  {
    id: { type: String, required: true, unique: true, index: true },
    slug: { type: String, required: true, unique: true, index: true },
    brandName: { type: String, required: true },
    ownerName: { type: String, required: true },
    ownerEmail: { type: String, required: true, index: true },
    ownerPhone: { type: String, default: '' },
    passwordHash: { type: String, default: '' },
    passwordResetPending: { type: Boolean, default: false },
    passwordResetRequestedAt: { type: String, default: '' },
    passwordChangedAt: { type: Date },
    logo: { type: String, default: '' },
    tagline: { type: String, default: '' },
    aboutStory: { type: String, default: '' },
    contact: {
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      address: { type: String, default: '' },
      workingHours: { type: String, default: '' },
      shippingThresholdFormatted: { type: String, default: '' },
    },
    customDomain: { type: String, default: '', index: true },
    customDomainVerified: { type: Boolean, default: false },
    customDomainVerifiedAt: { type: String, default: '' },
    customMongoUri: { type: String, default: '' },
    customDbName: { type: String, default: '' },
    atlasProjectId: { type: String, default: '' },
    atlasProvisionStatus: { type: String, default: '' },
    ownerPortalToken: { type: String, default: '' },
    exportTokenHash: { type: String, default: '' },
    exportTokenExpires: { type: Date },
    staffMembers: {
      type: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          email: { type: String, required: true },
          passwordHash: { type: String, required: true },
          role: { type: String, enum: ['staff', 'manager'], default: 'staff' },
          createdAt: { type: String, default: () => new Date().toISOString() },
        },
      ],
      default: [],
    },
    status: { type: String, enum: TENANT_STATUSES, default: 'active' },
    plan: { type: String, enum: ['starter', 'growth', 'pro', 'enterprise'], default: 'starter' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    storeType: { type: String, default: '' },
    niche: { type: String, default: '' },
    categories: {
      type: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          slug: { type: String, required: true },
          desc: { type: String, default: '' },
          image: { type: String, default: '' },
        },
      ],
      default: [],
    },
    theme: {
      primaryColor: { type: String, default: '#8C5A4F' },
      accentColor: { type: String, default: '#D4A574' },
      backgroundColor: { type: String, default: '#FAFAF8' },
      fontDisplay: { type: String, default: "'Instrument Serif', Georgia, serif" },
      fontSans: { type: String, default: "'Work Sans', system-ui, sans-serif" },
      heroImage: { type: String, default: '' },
      heroHeadline: { type: String, default: '' },
      heroSubhead: { type: String, default: '' },
      heroCtaText: { type: String, default: 'EXPLORE COLLECTIONS →' },
      secondaryCtaText: { type: String, default: 'ABOUT US' },
      logoUrl: { type: String, default: '' },
      announcementMessages: { type: [String], default: [] },
      enableAnimations: { type: Boolean, default: true },
      enableReviews: { type: Boolean, default: true },
      enableOrderTracking: { type: Boolean, default: true },
      discountCode: { type: String, default: '' },
      discountPercent: { type: Number, default: 0, min: 0, max: 90 },
      freeShippingThreshold: { type: Number, default: 999, min: 0 },
      shippingFee: { type: Number, default: 70, min: 0 },
      copy: { type: Schema.Types.Mixed, default: {} },
      trustItems: { type: [{ icon: { type: String, default: '' }, text: { type: String, default: '' } }], default: undefined },
      homeSections: { type: [{ id: { type: String, required: true }, visible: { type: Boolean, default: true } }], default: undefined },
      pdpOptions: { type: Schema.Types.Mixed, default: undefined },
      footerOptions: {
        trustStrip: { type: Boolean, default: true },
        newsletter: { type: Boolean, default: true },
      },
      socialLinks: {
        instagram: { type: String, default: '' },
        whatsapp: { type: String, default: '' },
        pinterest: { type: String, default: '' },
        facebook: { type: String, default: '' },
      },
    },
    subscription: {
      plan: { type: String, default: 'starter' },
      pricePerMonth: { type: Number, default: 1460 },
      status: { type: String, default: 'active' },
      cycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
      trialEndsAt: { type: String, default: '' },
      graceEndsAt: { type: String, default: '' },
      nextBillingDate: { type: String, default: '' },
      paymentMethod: { type: String, default: 'razorpay' },
      razorpaySubscriptionId: { type: String, default: '' },
      billingManaged: { type: Boolean, default: false },
      invoices: {
        type: [
          {
            id: String,
            amount: Number,
            amountExTax: Number,
            tax: Number,
            gstRate: Number,
            status: String,
            date: String,
            description: String,
          },
        ],
        default: [],
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      // Credentials and connection strings never leave the server, even in admin responses.
      transform: (_doc, ret: Record<string, any>) => {
        ret.hasPassword = Boolean(ret.passwordHash) && !String(ret.passwordHash).startsWith('$2a$12$REVOKED_')
        delete ret.passwordHash
        try {
          const isolation = publicTenantIsolation(String(ret.slug || ''), ret.customMongoUri, ret.customDbName)
          ret.hasCustomDatabase = isolation.hasDedicatedCluster
          ret.databaseName = isolation.databaseName
          ret.isolationMode = isolation.isolationMode
        } catch {
          ret.hasCustomDatabase = Boolean(ret.customMongoUri)
        }
        delete ret.customMongoUri
        delete ret.ownerPortalToken
        delete ret.exportTokenHash
        delete ret.exportTokenExpires
        if (Array.isArray(ret.staffMembers)) {
          ret.staffMembers = ret.staffMembers.map(({ passwordHash: _p, ...s }: Record<string, unknown>) => s)
        }
        delete ret.__v
        return ret
      },
    },
  }
)

export function getTenantModel(conn: Connection): Model<ITenant> {
  return conn.models.Tenant || conn.model<ITenant>('Tenant', TenantSchema)
}
