import { useEffect, useState } from 'react'
import { authService, type AdminSession } from '@/api/auth'
import { auditLogger } from '@/api/audit-logger'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 60_000
const LOCKOUT_KEY = 'orvexa_admin_login_lock'

function readLock(): { failures: number; lockedUntil: number } {
  try {
    return JSON.parse(sessionStorage.getItem(LOCKOUT_KEY) || '') as { failures: number; lockedUntil: number }
  } catch {
    return { failures: 0, lockedUntil: 0 }
  }
}

function writeLock(lock: { failures: number; lockedUntil: number }) {
  try {
    sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify(lock))
  } catch {
    // Storage unavailable — lockout only lasts for this render.
  }
}

export default function AdminLogin({ onSuccess }: { onSuccess: (session: AdminSession) => void }) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lock, setLock] = useState(readLock)
  const [now, setNow] = useState(Date.now())

  const secondsLocked = Math.max(0, Math.ceil((lock.lockedUntil - now) / 1000))
  const isLocked = secondsLocked > 0

  useEffect(() => {
    if (!isLocked) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(timer)
      setError(null)
    }
  }, [isLocked])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (secondsLocked > 0 || submitting) return
    setError(null)
    setSubmitting(true)

    const res = await authService.loginAdmin(loginId, password)
    setSubmitting(false)

    if (res.success && res.session?.role === 'super_admin') {
      const cleared = { failures: 0, lockedUntil: 0 }
      writeLock(cleared)
      setLock(cleared)
      auditLogger.log({
        actorId: res.session.userId,
        actorName: res.session.name,
        actorRole: 'super_admin',
        action: 'ADMIN_LOGIN_SUCCESS',
        category: 'auth',
        severity: 'info',
        details: `Super Admin signed in to the admin portal.`,
      })
      onSuccess(res.session)
      return
    }

    const message = res.error || 'Invalid admin credentials.'
    const credentialFailure = /invalid/i.test(message)
    auditLogger.log({
      actorId: 'unknown',
      actorName: loginId.trim() || 'unknown',
      actorRole: 'super_admin',
      action: 'ADMIN_LOGIN_FAILED',
      category: 'security',
      severity: 'security',
      details: `Failed admin portal sign-in attempt for "${loginId.trim()}".`,
    })
    if (!credentialFailure) {
      setError(message)
      return
    }

    const failures = lock.failures + 1
    const next = failures >= MAX_ATTEMPTS ? { failures: 0, lockedUntil: Date.now() + LOCKOUT_MS } : { failures, lockedUntil: 0 }
    writeLock(next)
    setLock(next)
    setNow(Date.now())
    setPassword('')
    setError(
      next.lockedUntil
        ? 'Too many failed attempts. Sign-in is locked for 60 seconds.'
        : `${message} ${MAX_ATTEMPTS - failures} attempt${MAX_ATTEMPTS - failures === 1 ? '' : 's'} left.`,
    )
  }

  return (
    <div className="auth">
      <aside className="auth-side">
        <img className="logo" src="/brand/logo-white.svg" alt="Orvexa Cloud" />
        <div>
          <h2>
            Run every store from one <em>command centre</em>.
          </h2>
          <p>Review marketing signups, provision isolated tenant databases, and keep billing and domains under control.</p>
        </div>
        <div className="auth-points">
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>
            Marketing form intake → pending approvals
          </div>
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>
            Database-per-store isolation
          </div>
          <div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>
            Super Admin only — restricted access
          </div>
        </div>
        <img className="mark-bg" src="/brand/logo-white.svg" alt="" aria-hidden />
      </aside>

      <div className="auth-main">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow">Super Admin</p>
            <h1>Sign in</h1>
            <p className="muted" style={{ marginTop: 6 }}>Authorized administrators only.</p>
          </div>

          <label className="field">
            <span className="label">Admin email</span>
            <input
              id="admin-login-id"
              className="input"
              type="text"
              autoComplete="username"
              required
              autoFocus
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="you@company.com"
            />
          </label>

          <label className="field">
            <span className="label">Password</span>
            <div className="row" style={{ gap: 8 }}>
              <input
                id="admin-password"
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

          {(error || secondsLocked > 0) && (
            <p role="alert" className="error">
              {secondsLocked > 0 ? `Too many failed attempts. Try again in ${secondsLocked}s.` : error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-lg" disabled={submitting || secondsLocked > 0} style={{ width: '100%' }}>
            {submitting ? 'Verifying…' : 'Sign in'}
          </button>

          <p className="center muted small">© {new Date().getFullYear()} Orvexa Tech Private Limited</p>
        </form>
      </div>
    </div>
  )
}
