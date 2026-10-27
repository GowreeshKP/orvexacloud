// --- Store Owner Password Links ---
// Issues single-use, hashed tokens accepted by POST /api/auth/seller/reset-password.

import crypto from 'crypto'
import type { Connection } from 'mongoose'
import { getRefreshTokenModel } from '../models/master/RefreshToken.js'

export async function issueOwnerPasswordLink(
  masterDb: Connection,
  slug: string,
  baseUrl: string,
  ttlMs: number
): Promise<{ rawToken: string; url: string; expiresAt: Date }> {
  const RefreshToken = getRefreshTokenModel(masterDb)
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + ttlMs)

  await RefreshToken.deleteMany({ userId: `reset_${slug}` })
  await new RefreshToken({ tokenHash, userId: `reset_${slug}`, role: 'seller', tenantSlug: slug, expiresAt }).save()

  const url = `${baseUrl.replace(/\/+$/, '')}/?tenant=${slug}&reset_token=${rawToken}&slug=${slug}`
  return { rawToken, url, expiresAt }
}

/** Base URL for links in emails. Production uses PUBLIC_APP_URL only; request headers are attacker-controlled. */
export function publicAppUrl(fallbackOrigin?: string): string {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL
  if (process.env.NODE_ENV === 'production') throw new Error('PUBLIC_APP_URL must be set in production.')
  return fallbackOrigin || 'http://localhost:8443'
}
