import { PLATFORM_ROOT_DOMAIN } from '@/data/plans'
import { tenantPortalPath } from '@/lib/store-urls'

export type ApplicationLayer = 'storefront' | 'dashboard' | 'admin'

export const RESERVED_SUBDOMAINS = [
  'www', 'admin', 'api', 'app', 'mail', 'shop', 'staging', 'seller', 'merchant', 'dashboard', 'store', 'stores',
  'support', 'help', 'billing', 'status', 'docs', 'blog', 'cdn', 'assets', 'cname', 't', 'media',
]

const PREVIEW_PLATFORM_DOMAINS = ['vercel.app', 'netlify.app', 'github.io', 'pages.dev', 'cloudflareapps.com']
const PRIVATE_HOST = /^(localhost|127\.0\.0\.1)$|^192\.168\.|^10\./

export function parseTenantPath(pathname = typeof window !== 'undefined' ? window.location.pathname : ''): {
  slug: string | null
  layer: 'storefront' | 'dashboard' | null
} {
  const parts = pathname.toLowerCase().split('/').filter(Boolean)
  if (parts[0] !== 't' || !parts[1]) return { slug: null, layer: null }
  const slug = parts[1]
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) return { slug: null, layer: null }
  return { slug, layer: parts[2] === 'dashboard' ? 'dashboard' : 'storefront' }
}

function hostname(): string {
  return typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase()
}

function isPreviewHost(host: string): boolean {
  return PREVIEW_PLATFORM_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
}

/**
 * Layer from the URL only. A signed-in seller visiting /t/lunar still sees the storefront;
 * they open /t/lunar/dashboard for the seller portal.
 */
export function resolveApplicationLayer(): ApplicationLayer {
  if (typeof window === 'undefined') return 'admin'

  const params = new URLSearchParams(window.location.search)
  const panel = params.get('panel') || params.get('layer') || params.get('view')
  if (panel === 'admin' || params.get('admin') === 'true') return 'admin'
  if (panel === 'dashboard' || panel === 'seller' || params.get('seller') === 'true') return 'dashboard'
  if (panel === 'storefront' || panel === 'store') return 'storefront'

  const path = window.location.pathname.toLowerCase()
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin'

  const tenantPath = parseTenantPath(path)
  if (tenantPath.layer) return tenantPath.layer

  if (path === '/dashboard' || path.startsWith('/dashboard/') || path === '/seller' || path.startsWith('/seller/')) {
    return 'dashboard'
  }
  if (path.startsWith('/store/') || path.startsWith('/stores/')) return 'storefront'
  if (params.get('tenant') || params.get('store')) return 'storefront'

  const host = hostname()
  if (!isPreviewHost(host) && !PRIVATE_HOST.test(host)) {
    const parts = host.split('.')
    if (parts.length >= 3) {
      const sub = parts[0]
      if (sub === 'admin') return 'admin'
      if (sub === 'app' || sub === 'seller' || sub === 'merchant') return 'dashboard'
      if (!RESERVED_SUBDOMAINS.includes(sub)) return 'storefront'
    }
    if (host !== PLATFORM_ROOT_DOMAIN && host !== `www.${PLATFORM_ROOT_DOMAIN}` && !host.endsWith(`.${PLATFORM_ROOT_DOMAIN}`)) {
      return 'storefront'
    }
  }

  return 'admin'
}

/**
 * Store slug from /t/<slug>, ?tenant=, a store subdomain, or a custom domain hostname.
 * Custom-domain hostnames are returned as-is so the resolver API can look them up.
 */
export function resolveTenantSlug(): string {
  if (typeof window === 'undefined') return ''

  const fromPath = parseTenantPath(window.location.pathname).slug
  if (fromPath) return fromPath

  const params = new URLSearchParams(window.location.search)
  const tenantParam = params.get('tenant') || params.get('store')
  if (tenantParam) return tenantParam.trim().toLowerCase()

  const host = hostname()
  if (PRIVATE_HOST.test(host) || isPreviewHost(host)) return ''

  const parts = host.split('.')
  if (parts.length >= 3 && host.endsWith(`.${PLATFORM_ROOT_DOMAIN}`)) {
    const sub = parts[0]
    if (!RESERVED_SUBDOMAINS.includes(sub)) return sub
    return ''
  }

  if (host === PLATFORM_ROOT_DOMAIN || host === `www.${PLATFORM_ROOT_DOMAIN}`) return ''
  return host
}

export function isReservedSubdomain(slug: string): boolean {
  return RESERVED_SUBDOMAINS.includes(slug)
}

export function locationForLayer(layer: ApplicationLayer, slug?: string): string {
  if (layer === 'admin') return '/admin'
  if (!slug) return '/admin'
  return tenantPortalPath(slug, layer === 'dashboard' ? 'dashboard' : 'storefront')
}
