// Stable, unguessable store-owner login links. The key is not a password and is never
// returned by public storefront payloads. Admins read it from the credentials endpoint.

import crypto from 'crypto'
import type { Model } from 'mongoose'
import type { ITenant } from '../models/master/Tenant.js'

export function newOwnerLoginKey(): string {
  return crypto.randomBytes(24).toString('base64url')
}

export function ownerLoginUrl(key: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/owner/${key}`
}

/** Backfill stores created before login links existed. Never replaces a key that is already set. */
export async function ensureOwnerLoginKey(Tenant: Model<ITenant>, tenant: ITenant): Promise<ITenant> {
  if (tenant.ownerLoginKey) return tenant
  const key = newOwnerLoginKey()
  const updated = await Tenant.findOneAndUpdate(
    { _id: tenant._id, $or: [{ ownerLoginKey: { $exists: false } }, { ownerLoginKey: '' }] },
    { $set: { ownerLoginKey: key, ownerLoginRevoked: false } },
    { new: true }
  )
  return updated || tenant
}
