// --- Multi-Tenant Context Provider ---
// Layer comes from the URL. Tenant config is loaded from the backend (demo fallback locally).

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import type { TenantConfig } from '@/types/tenant'
import {
  resolveTenantSlug,
  resolveApplicationLayer,
  locationForLayer,
  type ApplicationLayer,
} from '@/lib/tenant-resolver'
import { mockStore } from '@/api/mock-store'
import { DEMO_MODE } from '@/api/auth'
import { useAuth } from '@/hooks/useAuth'
import { API_BASE } from '@/lib/api-base'

function deepCloneTenant(config: TenantConfig): TenantConfig {
  return JSON.parse(JSON.stringify(config))
}

interface TenantContextValue {
  tenant: TenantConfig | null
  loading: boolean
  error: string | null
  layer: ApplicationLayer
  refreshTenant: (slug?: string) => void
  switchTenant: (slug: string) => void
  switchLayer: (layer: ApplicationLayer, tenantSlug?: string) => void
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: true,
  error: null,
  layer: 'storefront',
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


/** The older sign-in (used by the seller and admin login forms) keeps its token in localStorage. */
function storedSignInToken(): string | null {
  try {
    return localStorage.getItem('lunar_seller_token') || localStorage.getItem('lunar_admin_token')
  } catch {
    return null
  }
}

type ResolveResult =
  | { status: 'ok'; tenant: TenantConfig }
  | { status: 'missing' }
  | { status: 'transient' }

async function fetchPublicTenant(slug: string, accessToken?: string | null): Promise<ResolveResult> {
  if (!slug) return { status: 'missing' }
  const looksLikeHost = slug.includes('.')
  const qs = looksLikeHost ? `host=${encodeURIComponent(slug)}` : `slug=${encodeURIComponent(slug)}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    const res = await fetch(`${API_BASE}/public/resolve?${qs}`, {
      signal: ctrl.signal,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
    if (res.status === 404 || res.status === 403) return { status: 'missing' }
    if (!res.ok) return { status: 'transient' }
    const body = (await res.json()) as TenantConfig
    return body?.slug ? { status: 'ok', tenant: body } : { status: 'transient' }
  } catch {
    return { status: 'transient' }
  } finally {
    clearTimeout(timer)
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [layer, setLayer] = useState<ApplicationLayer>(() => resolveApplicationLayer())
  // The store lookup is public. Owners and admins also send their token, so the server can include their private details.
  const { accessToken } = useAuth()
  const tokenRef = useRef<string | null>(null)
  tokenRef.current = accessToken ?? null
  const hasTenantRef = useRef(false)

  const loadTenant = useCallback(async (customSlug?: string) => {
    const currentLayer = resolveApplicationLayer()
    setLayer(currentLayer)
    const slug = customSlug || resolveTenantSlug()

    if (currentLayer === 'admin' && !slug) {
      setTenant(null)
      setError(null)
      setLoading(false)
      return
    }

    if (!slug) {
      setTenant(null)
      setError(currentLayer === 'admin' ? null : 'No store in this address.')
      setLoading(false)
      return
    }

    setLoading(true)
    let keepLoading = false
    try {
      const fromApi = await fetchPublicTenant(slug, tokenRef.current || storedSignInToken())
      if (fromApi.status === 'ok') {
        hasTenantRef.current = true
        setTenant(deepCloneTenant(fromApi.tenant))
        setError(null)
        return
      }

      if (DEMO_MODE) {
        mockStore.reloadFromStorage()
        const local = mockStore.getTenantBySlug(slug) || (slug.includes('.') ? mockStore.getTenantByDomain?.(slug) : null)
        if (local) {
          hasTenantRef.current = true
          setTenant(deepCloneTenant(local))
          setError(null)
          return
        }
      }

      if (fromApi.status === 'transient') {
        setTenant((prev) => prev)
        if (!hasTenantRef.current) {
          keepLoading = true
          setError('The store is waking up. This can take up to 30 seconds on the free API.')
          window.setTimeout(() => { void loadTenant(slug) }, 4000)
        }
        return
      }

      hasTenantRef.current = false
      setTenant(null)
      setError(`Store "${slug}" not found.`)
    } catch (e) {
      setTenant((prev) => prev)
      console.error(e)
    } finally {
      if (!keepLoading) setLoading(false)
    }
  }, [])

  const refreshTenant = useCallback((customSlug?: string) => {
    void loadTenant(customSlug)
  }, [loadTenant])

  const switchTenant = (slug: string) => {
    window.history.pushState({}, '', locationForLayer('storefront', slug))
    void loadTenant(slug)
  }

  const switchLayer = (newLayer: ApplicationLayer, tenantSlug?: string) => {
    const targetSlug = tenantSlug || tenant?.slug || resolveTenantSlug()
    window.history.pushState({}, '', locationForLayer(newLayer, targetSlug || undefined))
    setLayer(newLayer)
    if (newLayer !== 'admin') void loadTenant(targetSlug)
  }

  useEffect(() => {
    void loadTenant()

    const handleLocationChange = () => {
      void loadTenant()
    }
    const handleStoreUpdated = () => {
      void loadTenant()
    }

    window.addEventListener('popstate', handleLocationChange)
    window.addEventListener('storage', handleStoreUpdated)
    window.addEventListener('orvexa:store-updated', handleStoreUpdated)

    return () => {
      window.removeEventListener('popstate', handleLocationChange)
      window.removeEventListener('storage', handleStoreUpdated)
      window.removeEventListener('orvexa:store-updated', handleStoreUpdated)
    }
  }, [loadTenant])

  // Reload the store once when someone signs in or out (not on every token refresh), to pick up or drop the private details.
  const signedIn = Boolean(accessToken)
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    void loadTenant()
  }, [signedIn, loadTenant])

  useEffect(() => {
    if (!tenant) return

    const root = document.documentElement
    const t = tenant.theme
    if (t) {
      root.style.setProperty('--brand-primary', t.primaryColor)
      root.style.setProperty('--brand-accent', t.accentColor)
      root.style.setProperty('--brand-bg', t.backgroundColor)
      root.style.setProperty('--brand-font-display', t.fontDisplay)
      root.style.setProperty('--brand-font-sans', t.fontSans)
    }

    if (layer === 'storefront') document.title = `${tenant.brandName} | Official Online Store`
    else if (layer === 'dashboard') document.title = `${tenant.brandName} | Seller Portal`

    return () => {
      root.style.removeProperty('--brand-primary')
      root.style.removeProperty('--brand-accent')
      root.style.removeProperty('--brand-bg')
      root.style.removeProperty('--brand-font-display')
      root.style.removeProperty('--brand-font-sans')
    }
  }, [tenant, layer])

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

export default TenantContext
