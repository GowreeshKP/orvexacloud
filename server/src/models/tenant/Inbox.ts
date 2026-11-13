import { Schema, type Connection, type Model, type Document } from 'mongoose'

export interface IStoreMessage extends Document {
  id: string
  name: string
  email: string
  phone: string
  subject: string
  message: string
  createdAt: Date
  read: boolean
}

export interface INewsletterSubscriber extends Document {
  email: string
  subscribedAt: Date
}

const StoreMessageSchema = new Schema<IStoreMessage>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 120 },
    email: { type: String, required: true, maxlength: 254 },
    phone: { type: String, default: '', maxlength: 40 },
    subject: { type: String, default: '', maxlength: 200 },
    message: { type: String, required: true, maxlength: 4000 },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

StoreMessageSchema.index({ createdAt: -1 })

const NewsletterSubscriberSchema = new Schema<INewsletterSubscriber>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, maxlength: 254 },
    subscribedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
)

export function getTenantStoreMessageModel(conn: Connection): Model<IStoreMessage> {
  return conn.models.StoreMessage || conn.model<IStoreMessage>('StoreMessage', StoreMessageSchema)
}

export function getTenantNewsletterModel(conn: Connection): Model<INewsletterSubscriber> {
  return (
    conn.models.NewsletterSubscriber ||
    conn.model<INewsletterSubscriber>('NewsletterSubscriber', NewsletterSubscriberSchema)
  )
}
