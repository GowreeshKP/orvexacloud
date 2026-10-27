import { Schema, type Connection, type Model, type Document } from 'mongoose'

export const STORE_EVENT_TYPES = ['page_view', 'shopper_signin', 'shopper_register', 'order_placed'] as const
export type StoreEventType = (typeof STORE_EVENT_TYPES)[number]

export interface IStoreEvent extends Document {
  type: StoreEventType
  path: string
  sessionId: string
  createdAt: Date
}

const StoreEventSchema = new Schema<IStoreEvent>(
  {
    type: { type: String, enum: STORE_EVENT_TYPES, required: true, index: true },
    path: { type: String, default: '', maxlength: 300 },
    sessionId: { type: String, default: '', maxlength: 80, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

StoreEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })
StoreEventSchema.index({ type: 1, createdAt: 1 })

export function getTenantStoreEventModel(conn: Connection): Model<IStoreEvent> {
  return conn.models.StoreEvent || conn.model<IStoreEvent>('StoreEvent', StoreEventSchema)
}
