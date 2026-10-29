import { PLATFORM_ROOT_DOMAIN } from '@/data/plans'

const PRIVATE_HOST = /^(localhost|127\.0\.0\.1)$|^192\.168\.|^10\./

export function isLocalHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return PRIVATE_HOST.test(hostname)
}

/** Approved tenant hostname: {slug}.orvexacloud.in */
export function tenantSubdomainHost(slug: string): string {
  return `${slug.trim().toLowerCase()}.${PLATFORM_ROOT_DOMAIN}`
}

export function tenantPortalPath(slug: string, layer: 'storefront' | 'dashboard' = 'storefront'): string {
  const clean = slug.trim().toLowerCase()
  return layer === 'dashboard' ? `/t/${clean}/dashboard` : `/t/${clean}`
}

/** Public storefront URL: custom domain when connected, else tenant subdomain (path portal only on localhost). */
export function storefrontUrl(slug: string, customDomain?: string): string {
  if (customDomain) {
    const host = customDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    return `https://${host}`
  }
  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) {
    return `${window.location.origin}${tenantPortalPath(slug)}`
  }
  return `https://${tenantSubdomainHost(slug)}`
}

/** Tenant admin / seller dashboard on the store subdomain. */
export function sellerPortalUrl(slug: string): string {
  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) {
    return `${window.location.origin}${tenantPortalPath(slug, 'dashboard')}`
  }
  return `https://${tenantSubdomainHost(slug)}/dashboard`
}

/**
 * If the visitor is on a path portal (/t/slug…), send them to the approved subdomain.
 * Returns the absolute URL to navigate to, or null when no redirect is needed.
 */
export function pathPortalRedirectUrl(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '',
  hostname = typeof window !== 'undefined' ? window.location.hostname : '',
): string | null {
  if (!pathname || isLocalHost(hostname)) return null
  const parts = pathname.toLowerCase().split('/').filter(Boolean)
  if (parts[0] !== 't' || !parts[1]) return null
  const slug = parts[1]
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) return null
  // Already on the tenant subdomain — keep path-style only as a local/dev fallback.
  if (hostname === tenantSubdomainHost(slug)) return null
  const rest = parts.slice(2)
  const onDashboard = rest[0] === 'dashboard'
  const dest = onDashboard ? sellerPortalUrl(slug) : storefrontUrl(slug)
  const suffix = onDashboard ? rest.slice(1).join('/') : rest.join('/')
  return suffix ? `${dest.replace(/\/+$/, '')}/${suffix}` : dest
}

export function platformAdminPath(): string {
  return '/admin'
}
