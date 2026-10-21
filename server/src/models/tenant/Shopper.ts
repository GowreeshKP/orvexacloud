import { Schema, type Connection, type Model, type Document } from 'mongoose'

export interface IShopper extends Document {
  email: string
  name: string
  phone: string
  passwordHash: string
  emailVerified: boolean
  verifyCodeHash: string
  verifyExpires: Date | null
  verifyAttempts: number
  lastCodeSentAt: Date | null
}

const ShopperSchema = new Schema<IShopper>(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    name: { type: String, required: true, default: '' },
    phone: { type: String, default: '' },
    passwordHash: { type: String, required: true, default: '' },
    emailVerified: { type: Boolean, default: false, index: true },
    verifyCodeHash: { type: String, default: '' },
    verifyExpires: { type: Date, default: null },
    verifyAttempts: { type: Number, default: 0 },
    lastCodeSentAt: { type: Date, default: null },
  },
  { timestamps: true }
)

export function getTenantShopperModel(conn: Connection): Model<IShopper> {
  return conn.models.Shopper || conn.model<IShopper>('Shopper', ShopperSchema)
}
