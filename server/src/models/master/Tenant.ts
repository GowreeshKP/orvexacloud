// --- Master Database: Tenant Store Registry Model ---
import crypto from 'crypto'
import { Schema, type Connection, type Model, type Document } from 'mongoose'

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
  /** Unguessable path segment for /owner/:key. Stable until an admin rotates or revokes it. */
  ownerLoginKey?: string
  ownerLoginRevoked?: boolean
  logo?: string
  customDomain?: string
  customDomainVerified?: boolean
  customDomainVerifiedAt?: string
  customMongoUri?: string // Bring-Your-Own-Database URI
  customDbName?: string // Custom MongoDB Database Name
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
  }
  subscription?: {
    plan: string
    pricePerMonth: number
    status: string
    cycle?: 'monthly' | 'yearly'
    trialEndsAt?: string
    nextBillingDate: string
    paymentMethod: string
    invoices: Array<{ id: string; amount: number; status: string; date: string; description: string }>
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
    ownerLoginKey: {
      type: String,
      unique: true,
      sparse: true,
      default: () => crypto.randomBytes(24).toString('base64url'),
    },
    ownerLoginRevoked: { type: Boolean, default: false },
    logo: { type: String, default: '' },
    customDomain: { type: String, default: '', index: true },
    customDomainVerified: { type: Boolean, default: false },
    customDomainVerifiedAt: { type: String, default: '' },
    customMongoUri: { type: String, default: '' },
    customDbName: { type: String, default: '' },
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
    },
    subscription: {
      plan: { type: String, default: 'starter' },
      pricePerMonth: { type: Number, default: 1460 },
      status: { type: String, default: 'active' },
      cycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
      trialEndsAt: { type: String, default: '' },
      nextBillingDate: { type: String, default: '' },
      paymentMethod: { type: String, default: 'razorpay' },
      invoices: {
        type: [
          {
            id: String,
            amount: Number,
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
        delete ret.ownerLoginKey
        ret.hasCustomDatabase = Boolean(ret.customMongoUri)
        delete ret.customMongoUri
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
