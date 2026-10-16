// --- Master Database: Merchant Application Model ---
// Applications come from the admin portal or from the marketing site's signup connector
// (see POST /api/public/signups). Website signups also carry plan, launch, migration and
// consent evidence; 'waitlist' marks early-access entries from countries not yet launched.
import { Schema, type Connection, type Model, type Document } from 'mongoose'

// needs_info: still in review, waiting on the applicant (reviewNotes says what is missing).
export type ApplicationStatus = 'pending' | 'needs_info' | 'approved' | 'rejected' | 'waitlist'

export interface IApplication extends Document {
  id: string
  channel: 'admin' | 'website'
  idempotencyKey?: string
  brandName: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  category: string
  storeType?: string
  categories?: string[]
  description: string
  requestedSubdomain: string
  status: ApplicationStatus
  submittedAt: string
  reviewedAt?: string
  reviewNotes?: string
  /** Early-access entries: when the owner was told their country had opened. */
  launchNotifiedAt?: string
  requestedPlan?: {
    id: string
    name?: string
    cycle?: 'monthly' | 'yearly'
    region?: string
    currency?: string
    amountExTax?: number
    tax?: number
    total?: number
    totalMinor?: number
    trialDays?: number
  }
  launch?: { status: 'live' | 'early_access'; country: string }
  migration?: { from?: string | null; currentDomain?: string | null } | null
  consents?: {
    marketing: boolean
    termsAcceptedAt?: string
    termsVersion?: { terms?: string; privacy?: string; refunds?: string } | null
    ip?: string
    userAgent?: string
  }
  attribution?: { site?: string; country?: string; referrer?: string; utm?: Record<string, string> }
  billing?: Record<string, unknown> | null
  slugCheck?: { available: boolean; reason?: 'reserved' | 'taken' | 'requested' | 'invalid' }
}

export const ApplicationSchema = new Schema<IApplication>(
  {
    id: { type: String, required: true, unique: true, index: true },
    channel: { type: String, enum: ['admin', 'website'], default: 'admin' },
    // Unique per website signup; sparse so admin-created applications can omit it.
    idempotencyKey: { type: String, unique: true, sparse: true },
    brandName: { type: String, required: true },
    ownerName: { type: String, default: '' },
    ownerEmail: { type: String, required: true, index: true },
    ownerPhone: { type: String, default: '' },
    category: { type: String, default: '' },
    storeType: { type: String, default: '' },
    categories: { type: [String], default: [] },
    description: { type: String, default: '' },
    requestedSubdomain: { type: String, required: true, index: true },
    status: { type: String, enum: ['pending', 'needs_info', 'approved', 'rejected', 'waitlist'], default: 'pending', index: true },
    submittedAt: { type: String, default: () => new Date().toISOString() },
    reviewedAt: { type: String },
    reviewNotes: { type: String },
    launchNotifiedAt: { type: String },
    requestedPlan: {
      id: String,
      name: String,
      cycle: { type: String, enum: ['monthly', 'yearly'] },
      region: String,
      currency: String,
      amountExTax: Number,
      tax: Number,
      total: Number,
      totalMinor: Number,
      trialDays: Number,
    },
    launch: {
      status: { type: String, enum: ['live', 'early_access'] },
      country: String,
    },
    migration: {
      type: new Schema({ from: String, currentDomain: String }, { _id: false }),
      default: null,
    },
    consents: {
      marketing: { type: Boolean, default: false },
      termsAcceptedAt: String,
      termsVersion: { type: Schema.Types.Mixed, default: null },
      ip: String,
      userAgent: String,
    },
    attribution: {
      site: String,
      country: String,
      referrer: String,
      utm: { type: Schema.Types.Mixed, default: {} },
    },
    billing: { type: Schema.Types.Mixed, default: null },
    slugCheck: {
      available: { type: Boolean, default: true },
      reason: { type: String, enum: ['reserved', 'taken', 'requested', 'invalid'] },
    },
  },
  { timestamps: true }
)

export function getApplicationModel(conn: Connection): Model<IApplication> {
  return conn.models.Application || conn.model<IApplication>('Application', ApplicationSchema)
}
