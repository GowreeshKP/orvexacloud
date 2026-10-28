import { useState } from 'react'
import { authService, type SellerSession } from '@/api/auth'
import { API_BASE } from '@/api/base'

interface SellerLoginProps {
  brandName: string
  boundSlug: string
  ownerLoginKey: string
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
    const res = await authService.loginSeller(loginId, password, ownerLoginKey)
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
          <h2>
            Run your store from one <em>command centre</em>.
          </h2>
          <p>Sign in to manage {brandName}. This page is only for the store owner link issued by Orvexa Cloud.</p>
        </div>
        <div className="auth-points">
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>
            Catalog, orders, and store settings
          </div>
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>
            Isolated to this store only
          </div>
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>
            Separate from customer sign-in
          </div>
        </div>
        <img className="mark-bg" src="/brand/logo-white.svg" alt="" aria-hidden />
      </aside>

      <div className="auth-main">
        {view === 'login' && (
          <form className="auth-card" onSubmit={handleSubmit}>
            <div>
              <p className="eyebrow">Store owner</p>
              <h1>Sign in</h1>
              <p className="muted" style={{ marginTop: 6 }}>{brandName}</p>
            </div>

            <label className="field">
              <span className="label">Email</span>
              <input
                id="owner-login-id"
                className="input"
                type="text"
                autoComplete="username"
                required
                autoFocus
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="you@store.com"
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

export function StoreDashboardGate({
  brandName,
  otherStore,
  onSignOut,
}: {
  brandName?: string
  otherStore?: string
  onSignOut?: () => void
}) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <img className="logo" src="/brand/logo-white.svg" alt="Orvexa Cloud" />
        <div>
          <h2>
            Store owner access is <em>by invitation</em>.
          </h2>
          <p>Management for {brandName || 'this store'} opens from the private login link issued by Orvexa Cloud.</p>
        </div>
        <img className="mark-bg" src="/brand/logo-white.svg" alt="" aria-hidden />
      </aside>
      <div className="auth-main">
        <div className="auth-card">
          <div>
            <p className="eyebrow">Store owner</p>
            <h1>Private sign-in</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              {otherStore
                ? `You are signed in to ${otherStore}. This address belongs to a different store.`
                : 'Use the store owner login URL from your Orvexa administrator. Customer sign-in does not open this dashboard.'}
            </p>
          </div>
          {onSignOut && (
            <button type="button" className="btn btn-outline" onClick={onSignOut}>
              Sign out
            </button>
          )}
          <p className="center muted small">© {new Date().getFullYear()} Orvexa Tech Private Limited</p>
        </div>
      </div>
    </div>
  )
}
