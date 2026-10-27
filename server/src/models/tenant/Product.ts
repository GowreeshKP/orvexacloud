// --- Tenant Database: Scoped Product Model ---
import { Schema, type Connection, type Model, type Document } from 'mongoose'

export interface IProduct extends Document {
  id: number
  name: string
  category: string
  sculptLevel: string
  fabricTech: string
  fabricDesc: string
  compression: string
  price: number
  mrp?: number
  priceFormatted: string
  rating: number
  reviewsCount: number
  badge?: string
  colors: Array<{ name: string; hex: string }>
  sizes: string[]
  imgMain: string
  images: string[]
  desc: string
  details: string[]
  fitInfo: string
  stockCount?: number
  isFeatured?: boolean
}

export const ProductSchema = new Schema<IProduct>(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    category: { type: String, required: true, index: true },
    sculptLevel: { type: String, default: 'HERITAGE CRAFT' },
    fabricTech: { type: String, default: 'Pure Handloom' },
    fabricDesc: { type: String, default: '' },
    compression: { type: String, default: 'Relaxed Silhouette' },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, min: 0 },
    priceFormatted: { type: String, required: true },
    rating: { type: Number, default: 5.0 },
    reviewsCount: { type: Number, default: 0 },
    badge: { type: String },
    colors: [
      {
        name: { type: String, required: true },
        hex: { type: String, required: true },
      },
    ],
    sizes: { type: [String], default: ['S', 'M', 'L', 'XL'] },
    imgMain: { type: String, default: '' },
    images: { type: [String], default: [] },
    desc: { type: String, default: '' },
    details: { type: [String], default: [] },
    fitInfo: { type: String, default: '' },
    stockCount: { type: Number, default: 0, min: 0 },
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export function getTenantProductModel(conn: Connection): Model<IProduct> {
  return conn.models.Product || conn.model<IProduct>('Product', ProductSchema)
}
