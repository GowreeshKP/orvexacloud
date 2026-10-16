import { PLATFORM_ROOT_DOMAIN } from '@/data/plans'

const PRIVATE_HOST = /^(localhost|127\.0\.0\.1)$|^192\.168\.|^10\./

export function isLocalHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return PRIVATE_HOST.test(hostname)
}

export function tenantPortalPath(slug: string, layer: 'storefront' | 'dashboard' = 'storefront'): string {
  const clean = slug.trim().toLowerCase()
  return layer === 'dashboard' ? `/t/${clean}/dashboard` : `/t/${clean}`
}

/** Public storefront URL: custom domain when connected, otherwise the platform portal. */
export function storefrontUrl(slug: string, customDomain?: string): string {
  if (customDomain) {
    const host = customDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    return `https://${host}`
  }
  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) {
    return `${window.location.origin}${tenantPortalPath(slug)}`
  }
  return `https://${PLATFORM_ROOT_DOMAIN}${tenantPortalPath(slug)}`
}

export function sellerPortalUrl(slug: string): string {
  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) {
    return `${window.location.origin}${tenantPortalPath(slug, 'dashboard')}`
  }
  return `https://${PLATFORM_ROOT_DOMAIN}${tenantPortalPath(slug, 'dashboard')}`
}

export function platformAdminPath(): string {
  return '/admin'
}
