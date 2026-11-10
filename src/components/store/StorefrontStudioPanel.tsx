import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Paintbrush, Eye, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useTenant, useSwitchLayer } from '@/context/TenantContext'
import { authService } from '@/api/auth'
import { API_BASE } from '@/api/base'
import { tenantPortalPath } from '@/lib/store-urls'

type StudioStatus = {
  configured: boolean
  studioUrl: string | null
  themeVersion: number | null
  publishedAt: string | null
  studioEnabled: boolean
}

/**
 * Seller dashboard → Storefront.
 * Matches orvexa-storefront-studio docs/INTEGRATION.md:
 * "Edit with Studio" → POST /api/stores/:slug/studio-launch → redirect to {STUDIO_URL}/launch?token=…
 */
export default function StorefrontStudioPanel({ onToast }: { onToast: (msg: string) => void }) {
  const { tenant } = useTenant()
  const switchLayer = useSwitchLayer()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<StudioStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const slug = tenant?.slug || ''
  const brand = tenant?.brandName || slug

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    void (async () => {
      try {
        const token = await authService.getStoreAccessToken()
        const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/studio`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.status === 404) {
          setStatus({
            configured: false,
            studioUrl: null,
            themeVersion: null,
            publishedAt: null,
            studioEnabled: false,
          })
          setError(
            'Storefront Studio API is not deployed yet (GET /studio returned 404). Redeploy the Orvexa API with studio-launch routes.'
          )
          return
        }
        if (!res.ok) {
          setStatus(null)
          return
        }
        setError(null)
        setStatus({
          configured: Boolean(data.configured),
          studioUrl: typeof data.studioUrl === 'string' ? data.studioUrl : null,
          themeVersion: typeof data.themeVersion === 'number' ? data.themeVersion : null,
          publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : null,
          studioEnabled: Boolean(data.studioEnabled),
        })
      } catch {
        if (!cancelled) setStatus(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  const openStudio = async () => {
    if (!slug || busy) return
    setBusy(true)
    setError(null)
    try {
      const token = await authService.getStoreAccessToken()
      const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/studio-launch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 404) {
        throw new Error(
          'Studio launch route missing on the API (404). Deploy studio-launch to Render, then set STUDIO_URL + STUDIO_LAUNCH_TOKEN_SECRET.'
        )
      }
      if (!res.ok || typeof data.url !== 'string') {
        throw new Error(data.error || 'Could not open Storefront Studio.')
      }
      onToast('Opening Storefront Studio…')
      // INTEGRATION.md: dashboard does window.location.href = url (or new tab).
      window.location.href = data.url
    } catch (err: any) {
      setError(err?.message || 'Could not open Storefront Studio.')
      onToast(err?.message || 'Could not open Storefront Studio.')
      setBusy(false)
    }
  }

  const livePath = tenantPortalPath(slug)

  return (
    <div className="stack" style={{ maxWidth: 920 }}>
      <div className="page-head">
        <div>
          <h1>Storefront</h1>
          <p className="sub">
            Design <strong>{brand}</strong> in Storefront Studio — templates, canvas editor, Magic AI and
            publish. Products, prices, bag and checkout stay on Orvexa Cloud.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: 'var(--ink)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              flex: 'none',
            }}
          >
            <Paintbrush size={22} strokeWidth={2} />
          </div>
          <div className="grow" style={{ minWidth: 220 }}>
            <h3 className="card-title" style={{ marginBottom: 6 }}>
              Edit storefront
            </h3>
            <p className="muted small" style={{ maxWidth: 520, lineHeight: 1.5 }}>
              Opens a signed one-time link into Storefront Studio for store{' '}
              <code className="mono">{slug}</code>. The studio never sees your Orvexa password — you stay
              signed in here; Studio gets an 8-hour session cookie after launch.
            </p>
            {status?.themeVersion != null && status.themeVersion > 0 && (
              <p className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <span className="pill leaf mono">
                  <span className="dot" />
                  Published v{status.themeVersion}
                </span>
                {status.publishedAt && (
                  <span className="muted small mono">
                    {new Date(status.publishedAt).toLocaleString('en-IN')}
                  </span>
                )}
                {status.studioEnabled ? (
                  <span className="pill gold mono">Live theme on</span>
                ) : (
                  <span className="pill outline mono">Awaiting first publish</span>
                )}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="callout" style={{ marginTop: 18 }}>
            <AlertTriangle size={16} strokeWidth={2.1} />
            <span>{error}</span>
          </div>
        )}

        {status && !status.configured && !error && (
          <div className="callout" style={{ marginTop: 18 }}>
            <AlertTriangle size={16} strokeWidth={2.1} />
            <span>
              Studio launch is not configured on the API yet. Set <code>STUDIO_URL</code> and{' '}
              <code>STUDIO_LAUNCH_TOKEN_SECRET</code> (same value as studio <code>LAUNCH_TOKEN_SECRET</code>),
              then refresh.
            </span>
          </div>
        )}

        <div className="row" style={{ gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void openStudio()}
            disabled={busy || (status != null && !status.configured)}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Paintbrush size={16} strokeWidth={2.1} />}
            {busy ? 'Opening Studio…' : 'Edit with Studio'}
          </button>
          <a
            href={livePath}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            onClick={(e) => {
              e.preventDefault()
              switchLayer('storefront', slug)
            }}
          >
            <Eye size={16} strokeWidth={2.1} />
            View live storefront
          </a>
          {status?.studioUrl && (
            <a href={status.studioUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
              <ExternalLink size={14} strokeWidth={2.1} />
              Studio home
            </a>
          )}
        </div>
      </div>

      <div className="grid cols-3">
        {[
          {
            title: '1. Signed launch',
            body: 'Dashboard posts /studio-launch, API signs a 2-minute single-use JWT (iss orvexacloud → aud orvexa-studio), then redirects to /launch?token=…',
          },
          {
            title: '2. Design & publish',
            body: 'Templates, GrapesJS canvas, Magic AI and photos stay in Studio. Publish posts a signed webhook back to Orvexa Cloud.',
          },
          {
            title: '3. Live theme',
            body: 'Shoppers load GET {STUDIO_URL}/api/public/stores/{slug}/theme. Commerce (cart, checkout, orders) stays on Orvexa routes.',
          },
        ].map((item) => (
          <div key={item.title} className="card" style={{ padding: 18 }}>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <CheckCircle2 size={16} strokeWidth={2.1} style={{ color: 'var(--leaf)' }} />
              <h3 className="card-title" style={{ fontSize: 14 }}>{item.title}</h3>
            </div>
            <p className="muted small" style={{ lineHeight: 1.5 }}>{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
