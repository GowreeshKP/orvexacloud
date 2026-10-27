// --- Per-store frontend loader ---
// Discovers src/tenants/<slug>/store.tsx at build time. Each store is its own lazy chunk,
// so a store's custom code and CSS are only downloaded by visitors of that store.

import { createContext, useContext, useEffect, useState, type ComponentType } from 'react'
import type { TenantConfig } from '@/types/tenant'
import type { StorefrontSlotProps } from '@/App'
import type { SlotProps, StoreModule } from './store-module'

const storeModules = import.meta.glob<{ default: StoreModule }>(['./*/store.tsx', '!./_template/store.tsx'])

const loaders = new Map<string, () => Promise<{ default: StoreModule }>>(
  Object.entries(storeModules).map(([path, load]) => [path.split('/')[1].toLowerCase(), load])
)
const loaded = new Map<string, StoreModule>()

export function hasStoreFolder(slug: string | undefined): boolean {
  return !!slug && loaders.has(slug.toLowerCase())
}

/** Loads the store's custom module. `ready` is false only while a store with a folder is loading. */
export function useStoreModule(slug: string | undefined): { module: StoreModule | null; ready: boolean } {
  const key = slug?.toLowerCase() || ''
  const [, setVersion] = useState(0)

  useEffect(() => {
    const load = loaders.get(key)
    if (!load || loaded.has(key)) return
    let cancelled = false
    load()
      .then((m) => loaded.set(key, m.default || {}))
      .catch((err) => {
        console.error(`[stores] Failed to load src/tenants/${key}/store.tsx — using the default storefront.`, err)
        loaded.set(key, {})
      })
      .finally(() => {
        if (!cancelled) setVersion((v) => v + 1)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  if (!loaders.has(key)) return { module: null, ready: true }
  const module = loaded.get(key)
  return { module: module || null, ready: !!module }
}

/** The tenant with the store's code-level theme values applied on top. */
export function applyStoreTheme(tenant: TenantConfig, module: StoreModule | null): TenantConfig {
  if (!module?.theme) return tenant
  return { ...tenant, theme: { ...tenant.theme, ...module.theme } }
}

export const StoreModuleContext = createContext<StoreModule | null>(null)

/** Returns the store's replacement for a built-in component, if it defines one. */
export function useStoreComponent<K extends keyof StorefrontSlotProps>(name: K): ComponentType<SlotProps<K>> | undefined {
  return useContext(StoreModuleContext)?.components?.[name] as ComponentType<SlotProps<K>> | undefined
}
