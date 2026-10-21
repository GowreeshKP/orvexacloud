import { Schema, type Connection, type Model, type Document } from 'mongoose'

export const SUBSCRIBER_SOURCES = ['newsletter', 'contact', 'account', 'checkout'] as const
export type SubscriberSource = (typeof SUBSCRIBER_SOURCES)[number]

export interface IStoreMessage extends Document {
  id: string
  name: string
  email: string
  phone: string
  subject: string
  message: string
  read: boolean
  createdAt: Date
}

const StoreMessageSchema = new Schema<IStoreMessage>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, index: true, maxlength: 254 },
    phone: { type: String, default: '', maxlength: 30 },
    subject: { type: String, default: '', maxlength: 200 },
    message: { type: String, required: true, maxlength: 4000 },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, id: false }
)

export function getStoreMessageModel(conn: Connection): Model<IStoreMessage> {
  return conn.models.StoreMessage || conn.model<IStoreMessage>('StoreMessage', StoreMessageSchema)
}

export interface ISubscriber extends Document {
  email: string
  source: SubscriberSource
  subscribedAt: Date
}

const SubscriberSchema = new Schema<ISubscriber>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true, maxlength: 254 },
    source: { type: String, enum: SUBSCRIBER_SOURCES, default: 'newsletter' },
    subscribedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

export function getSubscriberModel(conn: Connection): Model<ISubscriber> {
  return conn.models.Subscriber || conn.model<ISubscriber>('Subscriber', SubscriberSchema)
}
