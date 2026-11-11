import { useEffect, useMemo, useState } from 'react'
import { Storefront, storefrontHead } from '@orvexa/storefront-ui'
import { fromOrvexaProducts, type Theme } from '@orvexa/theme'
import '@orvexa/storefront-ui/storefront.css'
import { apiClient } from '@/api/client'
import type { TenantConfig } from '@/types/tenant'

type PageId = 'home' | 'product' | 'collection' | 'about' | 'contact'

function parsePage(pathname: string, slug: string): { page: PageId; productHandle?: string; collectionHandle?: string; basePath: string } {
  const parts = pathname.split('/').filter(Boolean)
  const slugIdx = parts[0] === slug ? 0 : parts[0] === 't' && parts[1] === slug ? 1 : -1
  const basePath = slugIdx === 1 ? `/t/${slug}` : slugIdx === 0 ? `/${slug}` : ''
  const rest = slugIdx >= 0 ? parts.slice(slugIdx + 1) : parts

  if (rest[0] === 'products' && rest[1]) return { page: 'product', productHandle: rest[1], basePath }
  if (rest[0] === 'collections' && rest[1]) {
    return { page: 'collection', collectionHandle: rest[1] === 'all' ? undefined : rest[1], basePath }
  }
  if (rest[0] === 'pages' && rest[1] === 'about') return { page: 'about', basePath }
  if (rest[0] === 'pages' && rest[1] === 'contact') return { page: 'contact', basePath }
  if (rest[0] === 'about') return { page: 'about', basePath }
  if (rest[0] === 'contact') return { page: 'contact', basePath }
  return { page: 'home', basePath }
}

/**
 * Renders a published Storefront Studio theme from the tenant theme document
 * (embedded editor publish) — no external STUDIO_URL required.
 */
export default function StudioLiveStorefront({
  tenant,
  onUnavailable,
}: {
  tenant: TenantConfig
  onUnavailable?: () => void
}) {
  const [theme, setTheme] = useState<Theme | null>(null)
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const route = useMemo(
    () => parsePage(typeof window !== 'undefined' ? window.location.pathname : '/', tenant.slug),
    [tenant.slug],
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        // Always fetch ThemeConfig so Publish is visible without waiting for resolve cache.
        const [catalog, themeDoc] = await Promise.all([
          apiClient.getProducts(tenant.slug).catch(() => []),
          apiClient.getTheme(tenant.slug).catch(() => null),
        ])
        if (cancelled) return
        const fromTenant =
          (tenant.theme as { studioPublished?: Theme } | undefined)?.studioPublished || null
        const fromDoc = (themeDoc as { studioPublished?: Theme } | null)?.studioPublished || null
        const published = fromDoc || fromTenant
        if (!published) {
          if (tenant.storefrontStudioEnabled || tenant.storefrontThemeVersion) {
            // Flag flipped but document missing — fall back to legacy storefront.
            onUnavailable?.()
          } else {
            onUnavailable?.()
          }
          setLoading(false)
          return
        }
        setTheme(published)
        setProducts(Array.isArray(catalog) ? catalog : [])
      } catch {
        if (!cancelled) onUnavailable?.()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    // Soft refresh on focus (no loading spinner) so Publish shows up without spamming the API.
    let last = Date.now()
    const onFocus = () => {
      if (Date.now() - last < 30_000) return
      last = Date.now()
      void load()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [tenant.slug, tenant.storefrontStudioEnabled, tenant.storefrontThemeVersion, tenant.theme, onUnavailable])

  useEffect(() => {
    if (!theme) return
    const head = storefrontHead(theme, fromOrvexaProducts(tenant.slug, products, { zeroStockMeans: 'sold-out' }), route.page, {
      productHandle: route.productHandle,
      collectionHandle: route.collectionHandle,
    })
    document.title = head.title
    let link = document.querySelector<HTMLLinkElement>('link[data-oxs-fonts="1"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.dataset.oxsFonts = '1'
      document.head.appendChild(link)
    }
    link.href = head.fontHref
  }, [theme, products, tenant.slug, route.page, route.productHandle, route.collectionHandle])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-2 border-black/20 border-t-black rounded-full animate-spin" />
      </div>
    )
  }

  if (!theme) return null

  const catalog = fromOrvexaProducts(tenant.slug, products, { zeroStockMeans: 'sold-out' })

  return (
    <Storefront
      theme={theme}
      catalog={catalog}
      page={route.page}
      basePath={route.basePath}
      productHandle={route.productHandle}
      collectionHandle={route.collectionHandle}
      mode="live"
    />
  )
}

export function shouldUseStudioStorefront(tenant: TenantConfig | null | undefined): boolean {
  if (!tenant) return false
  const published = (tenant.theme as { studioPublished?: unknown } | undefined)?.studioPublished
  return Boolean(tenant.storefrontStudioEnabled || tenant.storefrontThemeVersion || published)
}
