// --- Tenant Database: Scoped Review, ThemeConfig, and Customer Models ---
import { Schema, type Connection, type Model, type Document } from 'mongoose'

// --- REVIEW ---
export interface IReview extends Document {
  id: number
  productId: number
  author: string
  rating: number
  date: string
  title: string
  comment: string
  verified: boolean
}

export const ReviewSchema = new Schema<IReview>(
  {
    id: { type: Number, required: true, unique: true, index: true },
    productId: { type: Number, required: true, index: true },
    author: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    date: { type: String, default: 'Recent' },
    title: { type: String, default: '' },
    comment: { type: String, required: true },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export function getTenantReviewModel(conn: Connection): Model<IReview> {
  return conn.models.Review || conn.model<IReview>('Review', ReviewSchema)
}

// --- THEME & HOMEPAGE CONFIG ---
export interface IThemeConfigDoc extends Document {
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
  discountCode?: string
  discountPercent?: number
  freeShippingThreshold?: number
  shippingFee?: number
  enableAnimations: boolean
  enableReviews: boolean
  enableOrderTracking: boolean
  updatedAt: string
}

export const ThemeConfigSchema = new Schema<IThemeConfigDoc>(
  {
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
    discountCode: { type: String, default: '' },
    discountPercent: { type: Number, default: 0, min: 0, max: 90 },
    freeShippingThreshold: { type: Number, default: 999, min: 0 },
    shippingFee: { type: Number, default: 70, min: 0 },
    enableAnimations: { type: Boolean, default: true },
    enableReviews: { type: Boolean, default: true },
    enableOrderTracking: { type: Boolean, default: true },
  },
  { timestamps: true }
)

export function getTenantThemeModel(conn: Connection): Model<IThemeConfigDoc> {
  return conn.models.ThemeConfig || conn.model<IThemeConfigDoc>('ThemeConfig', ThemeConfigSchema)
}

// --- CUSTOMER ---
export interface ICustomerDoc extends Document {
  name: string
  email: string
  phone: string
  orderCount: number
  totalSpent: number
}

export const CustomerSchema = new Schema<ICustomerDoc>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String, default: '' },
    orderCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
  },
  { timestamps: true }
)

export function getTenantCustomerModel(conn: Connection): Model<ICustomerDoc> {
  return conn.models.Customer || conn.model<ICustomerDoc>('Customer', CustomerSchema)
}
