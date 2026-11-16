// Singleton platform settings (Razorpay keys for applicant / tenant subscription billing).
import { Schema, type Connection, type Model, type Document } from 'mongoose'

export interface IPlatformSettings extends Document {
  id: string
  razorpayKeyId: string
  /** Never returned to browsers; admin GET returns a masked form. */
  razorpayKeySecret: string
  upiVpa: string
  updatedAt?: string
  updatedBy?: string
}

const PlatformSettingsSchema = new Schema<IPlatformSettings>(
  {
    id: { type: String, required: true, unique: true, default: 'platform' },
    razorpayKeyId: { type: String, default: '' },
    razorpayKeySecret: { type: String, default: '' },
    upiVpa: { type: String, default: '' },
    updatedAt: { type: String },
    updatedBy: { type: String },
  },
  { collection: 'platform_settings' },
)

export function getPlatformSettingsModel(conn: Connection): Model<IPlatformSettings> {
  return conn.models.PlatformSettings || conn.model<IPlatformSettings>('PlatformSettings', PlatformSettingsSchema)
}
