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

    if (!res.success && res.locked && res.retryAfterSeconds) {
      const next = { failures: 0, lockedUntil: Date.now() + res.retryAfterSeconds * 1000 }
      writeLock(next)
      setLock(next)
      setNow(Date.now())
      setPassword('')
      setError(res.error || 'Too many failed attempts. Sign-in is locked for 60 seconds.')
      return
    }

    if (!res.success && res.error && !res.error.includes('authentication server')) {
      setPassword('')
      setError(res.error)
      return
    }

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

    const failures = lock.failures + 1
    const next = failures >= MAX_ATTEMPTS ? { failures: 0, lockedUntil: Date.now() + LOCKOUT_MS } : { failures, lockedUntil: 0 }
    writeLock(next)
    setLock(next)
    setNow(Date.now())
    setPassword('')
    auditLogger.log({
      actorId: 'unknown',
      actorName: loginId.trim() || 'unknown',
      actorRole: 'super_admin',
      action: 'ADMIN_LOGIN_FAILED',
      category: 'security',
      severity: 'security',
      details: `Failed admin portal sign-in attempt for "${loginId.trim()}".`,
    })
    setError(
      next.lockedUntil
        ? 'Too many failed attempts. Sign-in is locked for 60 seconds.'
        : `Invalid admin credentials. ${MAX_ATTEMPTS - failures} attempt${MAX_ATTEMPTS - failures === 1 ? '' : 's'} left.`,
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans antialiased">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-slate-900 ring-1 ring-white/10 flex items-center justify-center text-lg font-black shadow-lg">
            <span className="bg-gradient-to-tr from-amber-400 to-indigo-400 bg-clip-text text-transparent">O</span>
          </div>
          <h1 className="mt-4 text-xl font-semibold text-white tracking-tight">Orvexa Admin Portal</h1>
          <p className="mt-1 text-xs text-slate-400">Restricted access — authorized administrator only</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900/80 border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl">
          <div>
            <label htmlFor="admin-login-id" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Admin Email
            </label>
            <input
              id="admin-login-id"
              type="text"
              autoComplete="username"
              required
              autoFocus
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3.5 py-2.5 pr-16 text-sm text-white placeholder-slate-600 outline-none focus:border-indigo-500"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 hover:text-white px-2 py-1 cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {(error || secondsLocked > 0) && (
            <p role="alert" className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {secondsLocked > 0 ? `Too many failed attempts. Try again in ${secondsLocked}s.` : error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || secondsLocked > 0}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg py-2.5 transition-colors cursor-pointer"
          >
            {submitting ? 'Verifying…' : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-slate-600">© {new Date().getFullYear()} Orvexa Tech Private Limited</p>
      </div>
    </div>
  )
}
