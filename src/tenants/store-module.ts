// --- Per-store frontend customisation contract ---
// Every folder src/tenants/<slug>/ with a store.tsx is picked up automatically by
// src/tenants/loader.ts and applied only when that store's storefront is open.

import type { ComponentType } from 'react'
import type { HomeSectionId, TenantConfig, ThemeConfig } from '@/types/tenant'
import type { Product, StorefrontSlotProps } from '@/App'

export type { Product }

/** Props every replaceable component receives, plus `Default` — the platform's own version. */
export type SlotProps<K extends keyof StorefrontSlotProps> = StorefrontSlotProps[K] & {
  Default: ComponentType<StorefrontSlotProps[K]>
}

export type StoreComponents = {
  [K in keyof StorefrontSlotProps]?: ComponentType<SlotProps<K>>
}

export interface StoreSectionProps {
  tenant: TenantConfig
  products: Product[]
  onSelectProduct: (id: number) => void
  onNavigate: (view: 'home' | 'catalog', category?: string) => void
}

export interface StoreSection {
  /** Unique id within this store. */
  id: string
  /** Homepage position: after the hero, after one of the built-in sections, or at the end. */
  after?: 'hero' | HomeSectionId | 'end'
  Component: ComponentType<StoreSectionProps>
}

export interface StoreModule {
  /**
   * Theme values fixed in code. Anything set here wins over the merchant's dashboard
   * editor for that field, so only set what the requirements say must not change.
   */
  theme?: Partial<ThemeConfig>
  /** Replacements for built-in storefront components. */
  components?: StoreComponents
  /** Extra homepage sections built just for this store. */
  sections?: StoreSection[]
}

/** Identity helper that gives type-checking and autocomplete in store.tsx. */
export function defineStore(module: StoreModule): StoreModule {
  return module
}
