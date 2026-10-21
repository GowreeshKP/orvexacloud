import crypto from 'crypto'
import type { ITenant } from '../models/master/Tenant.js'
import { publicAppUrl } from '../services/ownerPasswordLink.js'
import { sanitizeTenantSlug } from './tenant-db.js'

export const OWNER_PORTAL_TOKEN_PATTERN = /^[a-f0-9]{64}$/i

export function createOwnerPortalToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function ownerPortalPath(slug: string): string {
  return `/t/${sanitizeTenantSlug(slug)}/owner`
}

export function ownerPortalAbsoluteUrl(slug: string, baseUrl?: string): string {
  return `${(baseUrl || publicAppUrl()).replace(/\/+$/, '')}${ownerPortalPath(slug)}`
}

export function tokensMatch(expected: string | undefined, given: string | undefined): boolean {
  const a = Buffer.from(String(expected || ''))
  const b = Buffer.from(String(given || ''))
  if (a.length === 0 || a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export async function ensureOwnerPortalToken(tenant: ITenant): Promise<string> {
  if (OWNER_PORTAL_TOKEN_PATTERN.test(tenant.ownerPortalToken || '')) {
    return tenant.ownerPortalToken as string
  }
  tenant.ownerPortalToken = createOwnerPortalToken()
  await tenant.save()
  return tenant.ownerPortalToken
}
