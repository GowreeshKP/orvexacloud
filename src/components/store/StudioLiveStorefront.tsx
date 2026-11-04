import { useEffect, useMemo, useState } from 'react'
import { Storefront, storefrontHead } from '@orvexa/storefront-ui'
import { fromOrvexaProducts, type Theme } from '@orvexa/theme'
import '@orvexa/storefront-ui/storefront.css'
import { apiClient } from '@/api/client'
import type { TenantConfig } from '@/types/tenant'

const STUDIO_URL = (import.meta.env.VITE_STUDIO_URL as string | undefined)?.replace(/\/+$/, '') || ''

type PageId = 'home' | 'product' | 'collection' | 'about' | 'contact'

function parsePage(pathname: string, slug: string): { page: PageId; productHandle?: string; collectionHandle?: string; basePath: string } {
  const parts = pathname.split('/').filter(Boolean)
  // app.orvexacloud.in/dashboard is seller; live storefronts are on orvexacloud.in/{slug}/...
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
 * Renders a Storefront Studio published theme when available.
 * Returns null when the store has not published with Studio yet (caller keeps legacy UI).
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
    [tenant.slug]
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!STUDIO_URL && !tenant.storefrontThemeUrl) {
        onUnavailable?.()
        setLoading(false)
        return
      }
      try {
        const themeUrl =
          tenant.storefrontThemeUrl ||
          `${STUDIO_URL}/api/public/stores/${encodeURIComponent(tenant.slug)}/theme`
        const [themeRes, catalog] = await Promise.all([
          fetch(themeUrl),
          apiClient.getProducts(tenant.slug).catch(() => []),
        ])
        if (cancelled) return
        if (themeRes.status === 404) {
          onUnavailable?.()
          setLoading(false)
          return
        }
        if (!themeRes.ok) throw new Error('theme fetch failed')
        const body = await themeRes.json()
        setTheme(body.theme as Theme)
        setProducts(Array.isArray(catalog) ? catalog : [])
      } catch {
        if (!cancelled) onUnavailable?.()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tenant.slug, tenant.storefrontThemeUrl, onUnavailable])

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

/** True when this store should try the Studio renderer first. */
export function shouldUseStudioStorefront(tenant: TenantConfig | null | undefined): boolean {
  if (!tenant) return false
  return Boolean(tenant.storefrontStudioEnabled || tenant.storefrontThemeVersion || tenant.storefrontThemeUrl)
}
