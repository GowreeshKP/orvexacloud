// --- Orvexa Tech Tenant Registry ---
// Central registry mapping individual store client folders & configurations

import { lunarTenantConfig } from './lunar'
import { silkhausTenantConfig } from './silkhaus'
import { khadistudioTenantConfig } from './khadistudio'
import { bloomweaveTenantConfig } from './bloomweave'
import type { TenantConfig } from '@/types/tenant'

export * from './lunar'
export * from './silkhaus'
export * from './khadistudio'
export * from './bloomweave'

export const TENANT_CONFIG_REGISTRY: Record<string, TenantConfig> = {
  lunar: lunarTenantConfig,
  silkhaus: silkhausTenantConfig,
  khadistudio: khadistudioTenantConfig,
  bloomweave: bloomweaveTenantConfig,
}

export function getTenantBySlug(slug: string): TenantConfig | undefined {
  return TENANT_CONFIG_REGISTRY[slug.toLowerCase()]
}
