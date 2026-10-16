import { RESERVED_TENANT_SLUGS, SLUG_PATTERN } from './validate.js'

/** Atlas / local URI prefix used when a store does not bring its own cluster. */
export function tenantDbPrefix(tenantBaseUri = process.env.MONGODB_TENANT_BASE_URI || 'mongodb://localhost:27017/orvexa_tenant_'): string {
  try {
    const normalized = tenantBaseUri.replace(/^mongodb\+srv:\/\//i, 'https://').replace(/^mongodb:\/\//i, 'http://')
    const url = new URL(normalized)
    const prefix = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (prefix) return prefix
  } catch {
    // Fall through to the platform default.
  }
  return 'orvexa_tenant_'
}

export function sanitizeTenantSlug(tenantSlug: string): string {
  const slug = String(tenantSlug || '').trim().toLowerCase()
  if (!SLUG_PATTERN.test(slug) || RESERVED_TENANT_SLUGS.has(slug)) {
    throw new Error('Invalid tenant slug')
  }
  return slug
}

/** Database name for a platform-provisioned store: orvexa_tenant_<slug> (or the configured prefix). */
export function tenantDatabaseName(
  tenantSlug: string,
  tenantBaseUri = process.env.MONGODB_TENANT_BASE_URI || 'mongodb://localhost:27017/orvexa_tenant_',
): string {
  return `${tenantDbPrefix(tenantBaseUri)}${sanitizeTenantSlug(tenantSlug)}`
}

export function mongoClusterHost(uri: string): string {
  const normalized = uri.replace(/^mongodb\+srv:\/\//i, 'https://').replace(/^mongodb:\/\//i, 'http://')
  return new URL(normalized).host.toLowerCase()
}

export function tenantSharesMasterCluster(
  masterUri = process.env.MONGODB_MASTER_URI || 'mongodb://localhost:27017/orvexatech_master',
  tenantBaseUri = process.env.MONGODB_TENANT_BASE_URI || 'mongodb://localhost:27017/orvexa_tenant_',
): boolean {
  try {
    return mongoClusterHost(masterUri) === mongoClusterHost(tenantBaseUri)
  } catch {
    return true
  }
}

export function runningCommit(env: NodeJS.ProcessEnv = process.env): string {
  return env.GIT_SHA || env.RENDER_GIT_COMMIT || env.VERCEL_GIT_COMMIT_SHA || 'unknown'
}
