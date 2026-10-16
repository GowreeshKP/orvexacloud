// --- Master Database: Admin User & Platform Stats Models ---
import { Schema, type Connection, type Model, type Document } from 'mongoose'

export interface IAdminUser extends Document {
  id: string
  name: string
  email: string
  passwordHash: string
  role: 'super_admin' | 'admin' | 'support'
  lastLogin?: string
}

export const AdminUserSchema = new Schema<IAdminUser>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['super_admin', 'admin', 'support'], default: 'super_admin' },
    lastLogin: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, any>) => {
        delete ret.passwordHash
        delete ret.__v
        return ret
      },
    },
  }
)

export function getAdminUserModel(conn: Connection): Model<IAdminUser> {
  return conn.models.AdminUser || conn.model<IAdminUser>('AdminUser', AdminUserSchema)
}

export interface IPlatformStats extends Document {
  totalGmv: number
  totalRevenue: number
  activeStores: number
  pendingApplications: number
  mrr: number
  totalOrders: number
  recordedAt: string
}

export const PlatformStatsSchema = new Schema<IPlatformStats>(
  {
    totalGmv: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    activeStores: { type: Number, default: 0 },
    pendingApplications: { type: Number, default: 0 },
    mrr: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    recordedAt: { type: String, default: () => new Date().toISOString() },
  },
  { timestamps: true }
)

export function getPlatformStatsModel(conn: Connection): Model<IPlatformStats> {
  return conn.models.PlatformStats || conn.model<IPlatformStats>('PlatformStats', PlatformStatsSchema)
}
