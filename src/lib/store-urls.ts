import { PLATFORM_ROOT_DOMAIN } from '@/data/plans'

const PRIVATE_HOST = /^(localhost|127\.0\.0\.1)$|^192\.168\.|^10\./
const APP_HOST = `app.${PLATFORM_ROOT_DOMAIN}`
const MARKETING_HOST = PLATFORM_ROOT_DOMAIN

export function isLocalHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return PRIVATE_HOST.test(hostname)
}

function isPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return ['pages.dev', 'vercel.app', 'netlify.app', 'github.io'].some(
    (d) => host === d || host.endsWith(`.${d}`),
  )
}

function isDevStyleHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return isLocalHost(hostname) || isPreviewHost(hostname)
}

export function tenantPortalPath(slug: string, layer: 'storefront' | 'dashboard' = 'storefront'): string {
  const clean = slug.trim().toLowerCase()
  // Local / Pages preview: keep /t/{slug} so one host can run storefront + dashboard.
  if (typeof window !== 'undefined' && isDevStyleHost(window.location.hostname)) {
    return layer === 'dashboard' ? `/t/${clean}/dashboard` : `/t/${clean}`
  }
  return layer === 'dashboard' ? `/dashboard/${clean}` : `/${clean}`
}

/** Public storefront: https://orvexacloud.in/{slug} */
export function storefrontUrl(slug: string, customDomain?: string): string {
  if (customDomain) {
    const host = customDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    return `https://${host}`
  }
  if (typeof window !== 'undefined' && isDevStyleHost(window.location.hostname)) {
    return `${window.location.origin}/t/${slug.trim().toLowerCase()}`
  }
  return `https://${MARKETING_HOST}/${slug.trim().toLowerCase()}`
}

/** Tenant-isolated admin dashboard: https://app.orvexacloud.in/dashboard/{slug} */
export function sellerPortalUrl(slug: string): string {
  if (typeof window !== 'undefined' && isDevStyleHost(window.location.hostname)) {
    return `${window.location.origin}/t/${slug.trim().toLowerCase()}/dashboard`
  }
  return `https://${APP_HOST}/dashboard/${slug.trim().toLowerCase()}`
}

export function platformAdminUrl(): string {
  if (typeof window !== 'undefined' && isDevStyleHost(window.location.hostname)) {
    return `${window.location.origin}/`
  }
  return `https://${APP_HOST}/`
}

/**
 * Normalize legacy portals (/t/slug, {slug}.orvexacloud.in) onto the production scheme.
 * Returns an absolute URL to navigate to, or null when already correct.
 */
export function pathPortalRedirectUrl(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '',
  hostname = typeof window !== 'undefined' ? window.location.hostname : '',
): string | null {
  // Keep /t/{slug} working on local + Pages previews (single-host demos).
  if (!pathname || isLocalHost(hostname) || isPreviewHost(hostname)) return null
  const host = hostname.toLowerCase()
  const parts = pathname.toLowerCase().split('/').filter(Boolean)

  // Legacy subdomain store → orvexacloud.in/{slug}
  if (host.endsWith(`.${PLATFORM_ROOT_DOMAIN}`) && host !== APP_HOST && host !== `www.${PLATFORM_ROOT_DOMAIN}`) {
    const sub = host.slice(0, -(PLATFORM_ROOT_DOMAIN.length + 1))
    if (sub && !['app', 'www', 'api', 'mail', 'cname', 'admin'].includes(sub)) {
      const onDash = parts[0] === 'dashboard'
      return onDash ? sellerPortalUrl(sub) : storefrontUrl(sub)
    }
  }

  // Legacy /t/{slug} …
  // On the app host this almost always means “open seller dashboard” (admin deep links).
  // Customer storefronts live on orvexacloud.in/{slug}.
  if (parts[0] === 't' && parts[1]) {
    const slug = parts[1]
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) return null
    const onDash = parts[2] === 'dashboard'
    if (host === APP_HOST) return sellerPortalUrl(slug)
    return onDash ? sellerPortalUrl(slug) : storefrontUrl(slug)
  }

  // Bare /{slug} on app host → seller dashboard (not a public storefront shell)
  if (host === APP_HOST && parts.length >= 1) {
    const reserved = new Set(['dashboard', 'admin', 'owner', 'api', 'assets', 'brand', 't'])
    if (!reserved.has(parts[0]) && /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(parts[0])) {
      return sellerPortalUrl(parts[0])
    }
  }

  return null
}

export function platformAdminPath(): string {
  return '/admin'
}
