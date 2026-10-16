// --- Tenant Context for Orvexa Cloud Platform ---
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { TenantConfig } from '@/types/tenant'
import { mockStore } from '@/api/mock-store'

export type ApplicationLayer = 'storefront' | 'dashboard' | 'admin'

interface TenantContextValue {
  tenant: TenantConfig | null
  loading: boolean
  error: string | null
  layer: ApplicationLayer
  refreshTenant: () => void
  switchTenant: (slug: string) => void
  switchLayer: (layer: ApplicationLayer, tenantSlug?: string) => void
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: false,
  error: null,
  layer: 'admin',
  refreshTenant: () => {},
  switchTenant: () => {},
  switchLayer: () => {},
})

export function useTenant() {
  return useContext(TenantContext)
}

export function useApplicationLayer(): ApplicationLayer {
  return useContext(TenantContext).layer
}

export function useSwitchLayer() {
  return useContext(TenantContext).switchLayer
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig | null>(() => mockStore.getTenantBySlug('lunar') || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [layer, setLayer] = useState<ApplicationLayer>('admin')

  const refreshTenant = () => {
    mockStore.reloadFromStorage()
    setTenant(mockStore.getTenantBySlug(tenant?.slug || 'lunar') || null)
  }

  const switchTenant = (slug: string) => {
    const found = mockStore.getTenantBySlug(slug)
    if (found) {
      setTenant(found)
      setError(null)
    } else {
      setError(`Store "${slug}" not found`)
    }
  }

  const switchLayer = (newLayer: ApplicationLayer) => {
    setLayer(newLayer)
  }

  return (
    <TenantContext.Provider
      value={{
        tenant,
        loading,
        error,
        layer,
        refreshTenant,
        switchTenant,
        switchLayer,
      }}
    >
      {children}
    </TenantContext.Provider>
  )
}
