export const RESERVED_SUBDOMAINS = [
  'www', 'admin', 'api', 'app', 'mail', 'shop', 'staging', 'seller', 'merchant',
  'dashboard', 'store', 'stores', 'support', 'help', 'billing', 'status',
  'docs', 'blog', 'cdn', 'assets', 'cname', 't', 'media',
] as const

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/

export function isReservedHost(host: string, rootDomain: string): boolean {
  const h = host.toLowerCase()
  const root = rootDomain.toLowerCase()
  if (h === root || h === `www.${root}`) return true
  if (!h.endsWith(`.${root}`)) return false
  const sub = h.slice(0, -(root.length + 1))
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(sub)
}

export function slugFromHostname(host: string, rootDomain: string): string | null {
  const h = host.toLowerCase()
  const root = rootDomain.toLowerCase()
  if (h === root || h === `www.${root}`) return null
  if (!h.endsWith(`.${root}`)) return null
  const sub = h.slice(0, -(root.length + 1))
  if (sub.includes('.')) return null
  if ((RESERVED_SUBDOMAINS as readonly string[]).includes(sub)) return null
  return SLUG_PATTERN.test(sub) ? sub : null
}

export function slugFromPath(pathname: string): string | null {
  const match = pathname.toLowerCase().match(/^\/t\/([a-z0-9][a-z0-9-]{1,28}[a-z0-9])(?:\/|$)/)
  return match?.[1] ?? null
}

export function looksLikeAsset(pathname: string): boolean {
  return /\.[a-zA-Z0-9]{1,8}$/.test(pathname) && !pathname.endsWith('.html')
}
