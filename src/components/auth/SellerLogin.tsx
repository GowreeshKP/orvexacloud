import { useState } from 'react'
import { authService, type SellerSession } from '@/api/auth'
import { API_BASE } from '@/api/base'
import { sellerPortalUrl } from '@/lib/store-urls'

interface SellerLoginProps {
  brandName: string
  boundSlug: string
  /** Private /owner/{key} flow only. Dashboard re-login uses boundSlug instead. */
  ownerLoginKey?: string
  onLoginSuccess: (session: SellerSession) => void
}

type View = 'login' | 'forgot' | 'sent'

export default function SellerLogin({ brandName, boundSlug, ownerLoginKey, onLoginSuccess }: SellerLoginProps) {
  const [view, setView] = useState<View>('login')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotLoading, setForgotLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    const res = await authService.loginSeller(loginId, password, ownerLoginKey, boundSlug)
    setSubmitting(false)
    if (!res.success || !res.session) {
      setPassword('')
      setError(res.error || 'Invalid login credentials. Please check your email or password.')
      return
    }
    if (res.session.tenantSlug !== boundSlug) {
      authService.logoutSeller()
      setPassword('')
      setError('These credentials are not authorized for this store.')
      return
    }
    onLoginSuccess(res.session)
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError(null)
    setForgotLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/seller/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setForgotError(data.error || 'Could not send a reset link.')
      } else {
        setView('sent')
      }
    } catch {
      setForgotError('Could not reach the server. Please try again in a moment.')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="auth">
      <aside className="auth-side">
        <img className="logo" src="/brand/logo-white.svg" alt="Orvexa Cloud" />
        <div>
          <p className="portal-chip" style={{ marginBottom: 18 }}>Store Owner</p>
          <h2>
            Your store, orders and customers <em>in one place.</em>
          </h2>
          <p>
            Manage products, ship orders, reply to customers and shape your storefront.
          </p>
        </div>
        <div className="auth-points">
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>
            Products, orders and customers
          </div>
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" /></svg>
            Change your storefront in minutes
          </div>
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            Your data stays in your own database
          </div>
        </div>
        <img className="mark-bg" src="/brand/logo-white.svg" alt="" aria-hidden />
      </aside>

      <div className="auth-main">
        {view === 'login' && (
          <form className="auth-card" onSubmit={handleSubmit}>
            <div>
              <p className="eyebrow">Store owner portal</p>
              <h1>Sign in</h1>
              <p className="muted" style={{ marginTop: 6 }}>
                {brandName ? `Welcome back to ${brandName}.` : 'Welcome back. Enter your details to continue.'}
              </p>
            </div>

            <label className="field">
              <span className="label">Email or store address</span>
              <input
                id="owner-login-id"
                className="input"
                type="text"
                autoComplete="username"
                required
                autoFocus
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder={boundSlug || 'you@store.com'}
              />
            </label>

            <label className="field">
              <span className="label">Password</span>
              <div className="row" style={{ gap: 8 }}>
                <input
                  id="owner-password"
                  className="input grow"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <div className="row between">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setForgotError(null)
                  setForgotEmail(loginId.includes('@') ? loginId : '')
                  setView('forgot')
                }}
              >
                Forgot password?
              </button>
            </div>

            {error && (
              <p role="alert" className="error">{error}</p>
            )}

            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Verifying…' : 'Sign in'}
            </button>

            <p className="center muted small">© {new Date().getFullYear()} Orvexa Tech Private Limited</p>
          </form>
        )}

        {view === 'forgot' && (
          <form className="auth-card" onSubmit={handleForgot}>
            <div>
              <p className="eyebrow">Store owner</p>
              <h1>Reset password</h1>
              <p className="muted" style={{ marginTop: 6 }}>We will email a reset link if this address belongs to {brandName}.</p>
            </div>
            <label className="field">
              <span className="label">Email</span>
              <input
                className="input"
                type="email"
                required
                autoFocus
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@store.com"
              />
            </label>
            {forgotError && <p role="alert" className="error">{forgotError}</p>}
            <button type="submit" className="btn btn-primary btn-lg" disabled={forgotLoading} style={{ width: '100%' }}>
              {forgotLoading ? 'Sending…' : 'Send reset link'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setView('login')}>
              Back to sign in
            </button>
          </form>
        )}

        {view === 'sent' && (
          <div className="auth-card">
            <div>
              <p className="eyebrow">Store owner</p>
              <h1>Check your email</h1>
              <p className="muted" style={{ marginTop: 6 }}>
                If an account for {brandName} uses {forgotEmail}, a reset link is on its way.
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => setView('login')}>
              Return to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Wrong-store session only — normal logout uses the email/password form above. */
export function StoreDashboardGate({
  brandName,
  otherStore,
  onSignOut,
  dashboardUrl,
}: {
  brandName?: string
  otherStore?: string
  onSignOut?: () => void
  dashboardUrl?: string
}) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <img className="logo" src="/brand/logo-white.svg" alt="Orvexa Cloud" />
        <div>
          <h2>
            This address belongs to <em>another store</em>.
          </h2>
          <p>Management for {brandName || 'this store'} needs that store&apos;s owner credentials.</p>
        </div>
        <img className="mark-bg" src="/brand/logo-white.svg" alt="" aria-hidden />
      </aside>
      <div className="auth-main">
        <div className="auth-card">
          <div>
            <p className="eyebrow">Store owner</p>
            <h1>Wrong store session</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              {otherStore
                ? `You are signed in to ${otherStore}. Sign out, then sign in with the owner email and password for ${brandName || 'this store'}.`
                : 'Sign in with the store owner email and password.'}
            </p>
            {dashboardUrl && (
              <p className="muted small" style={{ marginTop: 10 }}>
                Portal: <span className="mono">{dashboardUrl}</span>
              </p>
            )}
          </div>
          {onSignOut && (
            <button type="button" className="btn btn-primary" onClick={onSignOut}>
              Sign out and continue
            </button>
          )}
          <p className="center muted small">© {new Date().getFullYear()} Orvexa Tech Private Limited</p>
        </div>
      </div>
    </div>
  )
}

export function storeOwnerDashboardHint(slug: string): string {
  return sellerPortalUrl(slug)
}
