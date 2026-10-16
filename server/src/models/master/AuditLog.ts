// --- Master Database: Platform & Tenant Audit Log Model ---
import { Schema, type Connection, type Model, type Document } from 'mongoose'

export interface IAuditLog extends Document {
  id: string
  timestamp: string
  actorId: string
  actorName: string
  actorRole: 'super_admin' | 'seller' | 'staff' | 'system'
  tenantSlug?: string
  tenantName?: string
  action: string
  category: 'auth' | 'security' | 'products' | 'orders' | 'branding' | 'billing' | 'provisioning' | 'database' | 'settings'
  severity: 'info' | 'warning' | 'security' | 'critical'
  details: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
}

export const AuditLogSchema = new Schema<IAuditLog>(
  {
    id: { type: String, required: true, unique: true, index: true },
    timestamp: { type: String, default: () => new Date().toISOString(), index: true },
    actorId: { type: String, required: true, index: true },
    actorName: { type: String, required: true },
    actorRole: { type: String, enum: ['super_admin', 'seller', 'staff', 'system'], required: true },
    tenantSlug: { type: String, default: '', index: true },
    tenantName: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ['auth', 'security', 'products', 'orders', 'branding', 'billing', 'provisioning', 'database', 'settings'],
      required: true,
      index: true,
    },
    severity: { type: String, enum: ['info', 'warning', 'security', 'critical'], default: 'info', index: true },
    details: { type: String, required: true },
    ipAddress: { type: String, default: '127.0.0.1' },
    userAgent: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

export function getAuditLogModel(conn: Connection): Model<IAuditLog> {
  return conn.models.AuditLog || conn.model<IAuditLog>('AuditLog', AuditLogSchema)
}
