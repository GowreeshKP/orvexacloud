import { useEffect, useMemo, useState } from 'react'
import { fromOrvexaProducts, fromLegacyTheme, type Theme } from '@orvexa/theme'
import { useTenant } from '@/context/TenantContext'
import { apiClient } from '@/api/client'
import { Studio } from '@/studio-editor/Studio'
import { bindStudioApi } from '@/studio-editor/api'
import '@/studio-editor/studio.css'
import '@orvexa/storefront-ui/storefront.css'

/**
 * In-dashboard Storefront Studio (from orvexa-storefront-studio).
 * No STUDIO_URL / launch JWT — drafts and publish save through Orvexa theme APIs.
 */
export default function EmbeddedStorefrontStudio({ onToast }: { onToast: (msg: string) => void }) {
  const { tenant } = useTenant()
  const slug = tenant?.slug || ''
  const [ready, setReady] = useState(false)
  const [initialTheme, setInitialTheme] = useState<Theme | null>(null)
  const [revision, setRevision] = useState<number | null>(null)
  const [imported, setImported] = useState<{ theme: Theme; warnings: string[] } | null>(null)
  const [catalog, setCatalog] = useState(() =>
    fromOrvexaProducts(slug || 'store', [], { zeroStockMeans: 'sold-out' }),
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    bindStudioApi(slug)
    let cancelled = false
    void (async () => {
      try {
        const [products, themeDoc] = await Promise.all([
          apiClient.getProducts(slug).catch(() => []),
          apiClient.getTheme(slug).catch(() => null),
        ])
        if (cancelled) return
        const list = Array.isArray(products) ? products : []
        setCatalog(fromOrvexaProducts(slug, list, { zeroStockMeans: 'sold-out' }))

        const draftTheme = (themeDoc as { studioDraft?: Theme } | null)?.studioDraft
        const draftRev = (themeDoc as { studioDraftRevision?: number } | null)?.studioDraftRevision
        const localRaw = localStorage.getItem(`oxs:draft:${slug}`)
        let local: { theme: Theme; revision: number } | null = null
        try {
          local = localRaw ? (JSON.parse(localRaw) as { theme: Theme; revision: number }) : null
        } catch {
          local = null
        }

        if (local?.theme) {
          setInitialTheme(local.theme)
          setRevision(local.revision ?? draftRev ?? null)
        } else if (draftTheme) {
          setInitialTheme(draftTheme)
          setRevision(typeof draftRev === 'number' ? draftRev : null)
        } else {
          const legacy = fromLegacyTheme({
            slug,
            brandName: tenant?.brandName || slug,
            niche: tenant?.niche,
            storeType: tenant?.storeType,
            theme: tenant?.theme,
          })
          setImported(legacy)
          setInitialTheme(null)
          setRevision(null)
        }
        setReady(true)
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not open Storefront Studio.')
          onToast(err?.message || 'Could not open Storefront Studio.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, tenant?.brandName, tenant?.niche, tenant?.storeType, tenant?.theme, onToast])

  const session = useMemo(
    () => ({
      storeId: slug,
      storeName: tenant?.brandName || slug,
      role: 'owner' as const,
    }),
    [slug, tenant?.brandName],
  )

  if (!slug) return null
  if (error) {
    return (
      <div className="callout" style={{ margin: 24 }}>
        <span>{error}</span>
      </div>
    )
  }
  if (!ready) {
    return (
      <div className="stack" style={{ padding: 48, alignItems: 'center' }}>
        <p className="muted">Loading Storefront Studio…</p>
      </div>
    )
  }

  return (
    <div className="embedded-studio" style={{ margin: '-8px -12px 0', minHeight: 'calc(100vh - 72px)' }}>
      <Studio
        session={session}
        initialTheme={initialTheme}
        initialRevision={revision}
        catalog={catalog}
        imported={imported}
        publishedVersion={tenant?.storefrontThemeVersion ?? null}
        aiEnabled={false}
        features={{ seo: tenant?.plan === 'enterprise', stock: false }}
      />
    </div>
  )
}
