// --- Multi-Tenant Context Provider ---
// Layer comes from the URL. Tenant config is loaded from the backend (demo fallback locally).

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { TenantConfig } from '@/types/tenant'
import {
  resolveTenantSlug,
  resolveApplicationLayer,
  locationForLayer,
  type ApplicationLayer,
} from '@/lib/tenant-resolver'
import { pathPortalRedirectUrl } from '@/lib/store-urls'
import { mockStore } from '@/api/mock-store'
import { DEMO_MODE } from '@/api/auth'
import { apiFetch } from '@/api/base'

function deepCloneTenant(config: TenantConfig): TenantConfig {
  return JSON.parse(JSON.stringify(config))
}

/** Promote profile fields stored in theme.copy when PUT /profile is not available on the API. */
function hydrateTenantProfile(raw: TenantConfig): TenantConfig {
  const copy = raw.theme?.copy || {}
  const brandName = raw.brandName || copy._profileBrandName || raw.name || ''
  const logo = raw.logo || raw.logoUrl || raw.theme?.logoUrl || ''
  const aboutStory = raw.aboutStory || copy._profileAbout || raw.theme?.aboutStory || ''
  const contact = {
    phone: raw.contact?.phone || copy._profilePhone || '',
    email: raw.contact?.email || copy._profileEmail || raw.ownerEmail || '',
    address: raw.contact?.address || copy._profileAddress || '',
    workingHours: raw.contact?.workingHours || copy._profileHours || '',
    shippingThresholdFormatted: raw.contact?.shippingThresholdFormatted || copy._profileShipping || '',
  }
  return {
    ...raw,
    brandName,
    name: raw.name || brandName,
    logo,
    logoUrl: raw.logoUrl || logo,
    aboutStory,
    contact,
    theme: {
      ...raw.theme,
      logoUrl: raw.theme?.logoUrl || logo,
    },
  }
}

interface TenantContextValue {
  tenant: TenantConfig | null
  loading: boolean
  error: string | null
  layer: ApplicationLayer
  refreshTenant: (slug?: string) => void
  /** Merge fields into the current tenant without flipping loading (keeps open modals mounted). */
  patchTenant: (updates: Partial<TenantConfig>) => void
  switchTenant: (slug: string) => void
  switchLayer: (layer: ApplicationLayer, tenantSlug?: string) => void
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: true,
  error: null,
  layer: 'storefront',
  refreshTenant: () => {},
  patchTenant: () => {},
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

type ResolveResult =
  | { ok: true; tenant: TenantConfig }
  | { ok: false; kind: 'missing' | 'transient'; status?: number }

async function fetchPublicTenant(slug: string): Promise<ResolveResult> {
  if (!slug) return { ok: false, kind: 'missing' }
  const looksLikeHost = slug.includes('.')
  const qs = looksLikeHost ? `host=${encodeURIComponent(slug)}` : `slug=${encodeURIComponent(slug)}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await apiFetch(`/public/resolve?${qs}`, { signal: ctrl.signal })
    if (res.status === 404) return { ok: false, kind: 'missing', status: 404 }
    if (res.status === 429 || res.status >= 500) {
      return { ok: false, kind: 'transient', status: res.status }
    }
    if (!res.ok) return { ok: false, kind: 'transient', status: res.status }
    const tenant = (await res.json()) as TenantConfig
    if (!tenant?.slug) return { ok: false, kind: 'missing', status: res.status }
    return { ok: true, tenant }
  } catch {
    return { ok: false, kind: 'transient' }
  } finally {
    clearTimeout(timer)
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [layer, setLayer] = useState<ApplicationLayer>(() => resolveApplicationLayer())

  const loadTenant = useCallback(async (customSlug?: string) => {
    const currentLayer = resolveApplicationLayer()
    setLayer(currentLayer)
    const slug = customSlug || resolveTenantSlug()

    if (currentLayer === 'owner-login' || (currentLayer === 'admin' && !slug)) {
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
    try {
      let resolved = await fetchPublicTenant(slug)
      // One short retry for cold starts / edge rate limits before treating as missing.
      if (!resolved.ok && resolved.kind === 'transient') {
        await new Promise((r) => setTimeout(r, 600))
        resolved = await fetchPublicTenant(slug)
      }

      if (resolved.ok) {
        setTenant(hydrateTenantProfile(deepCloneTenant(resolved.tenant)))
        setError(null)
        return
      }

      if (DEMO_MODE) {
        mockStore.reloadFromStorage()
        const local = mockStore.getTenantBySlug(slug) || (slug.includes('.') ? mockStore.getTenantByDomain?.(slug) : null)
        if (local) {
          setTenant(hydrateTenantProfile(deepCloneTenant(local)))
          setError(null)
          return
        }
      }

      setTenant(null)
      if (resolved.kind === 'transient') {
        setError(`Store "${slug}" temporarily unavailable.`)
      } else {
        setError(`Store "${slug}" not found.`)
      }
    } catch (e) {
      setTenant(null)
      setError('Failed to load store configuration.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshTenant = useCallback((customSlug?: string) => {
    void loadTenant(customSlug)
  }, [loadTenant])

  const patchTenant = useCallback((updates: Partial<TenantConfig>) => {
    setTenant((prev) => {
      if (!prev) return prev
      const next = deepCloneTenant({ ...prev, ...updates })
      if (updates.theme) next.theme = { ...prev.theme, ...updates.theme }
      if (updates.contact) next.contact = { ...prev.contact, ...updates.contact }
      mockStore.updateTenant(prev.id, updates)
      return next
    })
  }, [])

  /** pushState only works same-origin; storefront lives on orvexacloud.in while the dashboard is on app. */
  const navigateLayerUrl = (url: string): 'external' | 'internal' => {
    try {
      const next = new URL(url, window.location.href)
      if (next.origin !== window.location.origin) {
        window.location.assign(next.href)
        return 'external'
      }
      window.history.pushState({}, '', `${next.pathname}${next.search}${next.hash}`)
      return 'internal'
    } catch {
      window.history.pushState({}, '', url)
      return 'internal'
    }
  }

  const switchTenant = (slug: string) => {
    if (navigateLayerUrl(locationForLayer('storefront', slug)) === 'external') return
    void loadTenant(slug)
  }

  const switchLayer = (newLayer: ApplicationLayer, tenantSlug?: string) => {
    const targetSlug = tenantSlug || tenant?.slug || resolveTenantSlug()
    if (navigateLayerUrl(locationForLayer(newLayer, targetSlug || undefined)) === 'external') return
    setLayer(newLayer)
    if (newLayer !== 'admin') void loadTenant(targetSlug)
  }

  useEffect(() => {
    // Path portals (/t/slug) redirect to the approved subdomain ({slug}.orvexacloud.in).
    const redirectTo = pathPortalRedirectUrl()
    if (redirectTo && redirectTo !== window.location.href) {
      window.location.replace(redirectTo)
      return
    }

    void loadTenant()

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleReload = () => {
      // Super Admin has no store slug — ignore mockStore persist storms from tenant sync.
      if (resolveApplicationLayer() === 'admin' && !resolveTenantSlug()) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        void loadTenant()
      }, 2500)
    }

    const handleLocationChange = () => {
      const next = pathPortalRedirectUrl()
      if (next && next !== window.location.href) {
        window.location.replace(next)
        return
      }
      void loadTenant()
    }

    window.addEventListener('popstate', handleLocationChange)
    // Cross-tab localStorage writes only — same-tab persist already updates React state via patchTenant.
    window.addEventListener('storage', scheduleReload)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      window.removeEventListener('popstate', handleLocationChange)
      window.removeEventListener('storage', scheduleReload)
    }
  }, [loadTenant])

  useEffect(() => {
    if (!tenant) return

    const root = document.documentElement
    const t = tenant.theme
    if (t) {
      root.style.setProperty('--brand-primary', t.primaryColor || '')
      root.style.setProperty('--brand-accent', t.accentColor || '')
      root.style.setProperty('--brand-bg', t.backgroundColor || '')
      root.style.setProperty('--brand-font-display', t.fontDisplay || '')
      root.style.setProperty('--brand-font-sans', t.fontSans || '')
      // Storefront only: merchant fonts for headlines/buttons. Seller portal keeps Orvexa UI fonts.
      if (layer === 'storefront') {
        if (t.fontDisplay) {
          root.style.setProperty('--font-display', t.fontDisplay)
          root.style.setProperty('--font-serif', t.fontDisplay)
        }
        if (t.fontSans) {
          root.style.setProperty('--font-sans', t.fontSans)
          root.style.setProperty('--font-body', t.fontSans)
          root.style.setProperty('--font-ui', t.fontSans)
        }
      }
    }

    if (layer === 'storefront') document.title = `${tenant.brandName} | Official Online Store`
    else if (layer === 'dashboard') document.title = `${tenant.brandName} | Seller Portal`

    return () => {
      root.style.removeProperty('--brand-primary')
      root.style.removeProperty('--brand-accent')
      root.style.removeProperty('--brand-bg')
      root.style.removeProperty('--brand-font-display')
      root.style.removeProperty('--brand-font-sans')
      root.style.removeProperty('--font-display')
      root.style.removeProperty('--font-serif')
      root.style.removeProperty('--font-sans')
      root.style.removeProperty('--font-body')
      root.style.removeProperty('--font-ui')
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
        patchTenant,
        switchTenant,
        switchLayer,
      }}
    >
      {children}
    </TenantContext.Provider>
  )
}

export default TenantContext
