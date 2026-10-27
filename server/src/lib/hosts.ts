import { PLATFORM_ROOT_DOMAIN } from '../config/plans.js'

const PRIVATE_HOST = /^(localhost|127\.0\.0\.1)$|^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./

/** Hostname without scheme, port, path or a leading www. */
export function normalizeHostname(raw: string): string {
  let host = String(raw || '').trim().toLowerCase()
  host = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
  if (host.startsWith('www.')) host = host.slice(4)
  return host
}

export function isValidPublicHostname(host: string): boolean {
  const h = normalizeHostname(host)
  if (!h || h.length > 253 || PRIVATE_HOST.test(h)) return false
  if (h === PLATFORM_ROOT_DOMAIN || h.endsWith(`.${PLATFORM_ROOT_DOMAIN}`)) return false
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)
}

export function hostLookupKeys(raw: string): string[] {
  const h = normalizeHostname(raw)
  if (!h) return []
  return Array.from(new Set([h, `www.${h}`]))
}

export function isPlatformHost(hostname: string, root = PLATFORM_ROOT_DOMAIN): boolean {
  const h = String(hostname || '').toLowerCase().replace(/:\d+$/, '')
  if (PRIVATE_HOST.test(h)) return true
  return h === root || h === `www.${root}` || h.endsWith(`.${root}`)
}

export function platformCnameTarget(): string {
  return (process.env.PLATFORM_CNAME_TARGET || `cname.${PLATFORM_ROOT_DOMAIN}`).toLowerCase().replace(/\.$/, '')
}

function cnameHitsPlatform(names: string[], target: string): boolean {
  return names.some((c) => {
    const name = c.replace(/\.$/, '').toLowerCase()
    return name === target || name === PLATFORM_ROOT_DOMAIN || name === `www.${PLATFORM_ROOT_DOMAIN}`
  })
}

/** True when the hostname (apex or www) CNAMEs to the platform target. */
export async function domainPointsAtPlatform(hostname: string): Promise<boolean> {
  const host = normalizeHostname(hostname)
  if (!host) return false
  const target = platformCnameTarget()
  const dns = await import('node:dns/promises')
  for (const candidate of [host, `www.${host}`]) {
    try {
      if (cnameHitsPlatform(await dns.resolveCname(candidate), target)) return true
    } catch {
      // Apex often has A/ALIAS instead of CNAME; try the next candidate.
    }
  }
  return false
}
