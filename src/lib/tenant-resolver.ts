import { PLATFORM_ROOT_DOMAIN } from '@/data/plans'
import { tenantPortalPath } from '@/lib/store-urls'

export type ApplicationLayer = 'storefront' | 'dashboard' | 'admin' | 'owner-login'

const OWNER_LOGIN_KEY = /^[A-Za-z0-9_-]{16,80}$/
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/

export function parseOwnerLoginKey(pathname = typeof window !== 'undefined' ? window.location.pathname : ''): string | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'owner' || parts.length !== 2) return null
  let key = parts[1]
  try {
    key = decodeURIComponent(key)
  } catch {
    return null
  }
  return OWNER_LOGIN_KEY.test(key) ? key : null
}

export const RESERVED_SUBDOMAINS = [
  'www', 'admin', 'api', 'app', 'mail', 'shop', 'staging', 'seller', 'merchant', 'dashboard', 'store', 'stores',
  'support', 'help', 'billing', 'status', 'docs', 'blog', 'cdn', 'assets', 'cname', 't', 'pricing', 'apply',
  'legal', 'terms', 'privacy', 'refunds', 'compare', 'brand',
]

const PREVIEW_PLATFORM_DOMAINS = ['vercel.app', 'netlify.app', 'github.io', 'pages.dev', 'cloudflareapps.com']
const PRIVATE_HOST = /^(localhost|127\.0\.0\.1)$|^192\.168\.|^10\./

/** Legacy /t/{slug}[/dashboard] plus production /{slug} and /dashboard/{slug}. */
export function parseTenantPath(pathname = typeof window !== 'undefined' ? window.location.pathname : ''): {
  slug: string | null
  layer: 'storefront' | 'dashboard' | null
} {
  const parts = pathname.toLowerCase().split('/').filter(Boolean)
  if (!parts.length) return { slug: null, layer: null }

  // Legacy: /t/{slug}[/dashboard]
  if (parts[0] === 't' && parts[1] && SLUG_RE.test(parts[1])) {
    return { slug: parts[1], layer: parts[2] === 'dashboard' ? 'dashboard' : 'storefront' }
  }

  // Production tenant admin: /dashboard/{slug}
  if (parts[0] === 'dashboard' && parts[1] && SLUG_RE.test(parts[1])) {
    return { slug: parts[1], layer: 'dashboard' }
  }

  // Production storefront on marketing host: /{slug}
  if (parts.length >= 1 && SLUG_RE.test(parts[0]) && !RESERVED_SUBDOMAINS.includes(parts[0])) {
    return { slug: parts[0], layer: 'storefront' }
  }

  return { slug: null, layer: null }
}

function hostname(): string {
  return typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase()
}

function isPreviewHost(host: string): boolean {
  return PREVIEW_PLATFORM_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
}

/**
 * Layer from the URL only.
 * - app.orvexacloud.in → Super Admin (unless /dashboard/{slug} or /owner/…)
 * - orvexacloud.in/{slug} → storefront
 * - app.orvexacloud.in/dashboard/{slug} → tenant admin
 */
export function resolveApplicationLayer(): ApplicationLayer {
  if (typeof window === 'undefined') return 'admin'

  if (parseOwnerLoginKey(window.location.pathname)) return 'owner-login'

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
  // Platform control plane
  if (host === `app.${PLATFORM_ROOT_DOMAIN}` || host === `admin.${PLATFORM_ROOT_DOMAIN}`) return 'admin'
  // Marketing apex without a store slug → not a storefront shell (marketing site handles it)
  if (host === PLATFORM_ROOT_DOMAIN || host === `www.${PLATFORM_ROOT_DOMAIN}`) return 'admin'

  if (!isPreviewHost(host) && !PRIVATE_HOST.test(host)) {
    const parts = host.split('.')
    if (parts.length >= 3) {
      const sub = parts[0]
      if (sub === 'seller' || sub === 'merchant') return 'dashboard'
      if (!RESERVED_SUBDOMAINS.includes(sub)) return 'storefront'
    }
    if (host !== PLATFORM_ROOT_DOMAIN && host !== `www.${PLATFORM_ROOT_DOMAIN}` && !host.endsWith(`.${PLATFORM_ROOT_DOMAIN}`)) {
      return 'storefront'
    }
  }

  return 'admin'
}

export function resolveTenantSlug(): string {
  if (typeof window === 'undefined') return ''
  if (parseOwnerLoginKey(window.location.pathname)) return ''

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
  if (layer === 'admin') return typeof window !== 'undefined' && !PRIVATE_HOST.test(hostname())
    ? `https://app.${PLATFORM_ROOT_DOMAIN}/`
    : '/'
  if (!slug) return locationForLayer('admin')
  if (layer === 'dashboard' || layer === 'owner-login') {
    if (typeof window !== 'undefined' && !PRIVATE_HOST.test(hostname())) {
      return `https://app.${PLATFORM_ROOT_DOMAIN}/dashboard/${slug.trim().toLowerCase()}`
    }
    return tenantPortalPath(slug, 'dashboard')
  }
  if (typeof window !== 'undefined' && !PRIVATE_HOST.test(hostname())) {
    return `https://${PLATFORM_ROOT_DOMAIN}/${slug.trim().toLowerCase()}`
  }
  return tenantPortalPath(slug, 'storefront')
}
