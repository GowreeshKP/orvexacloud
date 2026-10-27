// --- Master Database: Refresh Token Store ---
// Enables server-side token rotation and explicit logout (revocation).
// Only the SHA-256 hash of the refresh token is stored — never the raw value.

import { Schema, type Connection, type Model, type Document } from 'mongoose'

export interface IRefreshToken extends Document {
  tokenHash: string       // SHA-256 hex hash of the raw refresh token
  userId: string
  role: 'super_admin' | 'seller' | 'staff'
  tenantId?: string
  tenantSlug?: string
  expiresAt: Date
  createdAt: Date
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ['super_admin', 'seller', 'staff'], required: true },
    tenantId: { type: String },
    tenantSlug: { type: String },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index — Mongo auto-deletes expired docs
  },
  { timestamps: true }
)

export function getRefreshTokenModel(conn: Connection): Model<IRefreshToken> {
  return conn.models.RefreshToken || conn.model<IRefreshToken>('RefreshToken', RefreshTokenSchema)
}
