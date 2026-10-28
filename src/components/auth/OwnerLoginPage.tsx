import { useEffect, useState } from 'react'
import SellerLogin from '@/components/auth/SellerLogin'
import { useSwitchLayer } from '@/context/TenantContext'
import { lookupDemoOwnerLogin } from '@/lib/owner-login'
import { parseOwnerLoginKey } from '@/lib/tenant-resolver'
import { API_BASE } from '@/api/base'
import { DEMO_MODE } from '@/api/auth'
import { MOCK_TENANTS } from '@/data/mock-tenants'

type Resolved = { brandName: string; slug: string } | 'missing' | 'loading'

export default function OwnerLoginPage() {
  const switchLayer = useSwitchLayer()
  const key = parseOwnerLoginKey()
  const [resolved, setResolved] = useState<Resolved>('loading')

  useEffect(() => {
    if (!key) {
      setResolved('missing')
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/public/owner-login/${encodeURIComponent(key)}`, {
          signal: AbortSignal.timeout(4000),
        })
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (data?.slug && data?.brandName) {
            setResolved({ slug: String(data.slug), brandName: String(data.brandName) })
            document.title = `${data.brandName} | Store owner sign-in`
            return
          }
        }
        if (res.status === 404 || !DEMO_MODE) {
          setResolved('missing')
          document.title = 'Store owner sign-in | Orvexa Cloud'
          return
        }
      } catch {
        if (cancelled || !DEMO_MODE) {
          if (!cancelled) setResolved('missing')
          return
        }
      }
      if (cancelled) return
      const local = lookupDemoOwnerLogin(key)
      if (!local || local.revoked) {
        setResolved('missing')
        document.title = 'Store owner sign-in | Orvexa Cloud'
        return
      }
      const known = MOCK_TENANTS.find((tenant) => tenant.slug === local.slug)
      const brand = known?.brandName || local.slug.charAt(0).toUpperCase() + local.slug.slice(1)
      setResolved({ slug: local.slug, brandName: brand })
      document.title = `${brand} | Store owner sign-in`
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [key])

  if (resolved === 'loading') {
    return (
      <div className="auth">
        <div className="auth-main">
          <p className="muted">Loading sign-in…</p>
        </div>
      </div>
    )
  }

  if (resolved === 'missing' || !key) {
    return (
      <div className="auth">
        <aside className="auth-side">
          <img className="logo" src="/brand/logo-white.svg" alt="Orvexa Cloud" />
          <div>
            <h2>
              This sign-in link is <em>not available</em>.
            </h2>
            <p>Ask your Orvexa administrator for the current store owner login URL.</p>
          </div>
          <img className="mark-bg" src="/brand/logo-white.svg" alt="" aria-hidden />
        </aside>
        <div className="auth-main">
          <div className="auth-card">
            <div>
              <p className="eyebrow">Store owner</p>
              <h1>Link unavailable</h1>
              <p className="muted" style={{ marginTop: 6 }}>
                This store owner login URL is missing, revoked, or no longer assigned to a store.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <SellerLogin
      brandName={resolved.brandName}
      boundSlug={resolved.slug}
      ownerLoginKey={key}
      onLoginSuccess={(session) => {
        if (session.tenantSlug !== resolved.slug) return
        switchLayer('dashboard', session.tenantSlug)
      }}
    />
  )
}
