// --- Seller / Merchant Login Modal ---
// Handles email+password login for store owners (role: seller).
// Includes forgot-password flow that calls /api/auth/seller/forgot-password.

import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { API_ORIGIN as API_BASE } from '@/lib/api-base'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Called after a successful login so parent can switch to the dashboard layer */
  onSuccess?: () => void
}

type View = 'login' | 'forgot' | 'forgot-sent'

export default function SellerLoginModal({ isOpen, onClose, onSuccess }: Props) {
  const { login, isLoading, error, clearError } = useAuth()

  const [view, setView] = useState<View>('login')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotResetToken, setForgotResetToken] = useState<string | null>(null)

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      clearError()
      await login({ type: 'seller', loginId, password })
      // If login succeeded (no error), onSuccess is called by the parent watching isAuthenticated
    },
    [login, loginId, password, clearError]
  )

  const handleForgot = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setForgotError(null)
      setForgotLoading(true)

      try {
        const res = await fetch(`${API_BASE}/api/auth/seller/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: forgotEmail }),
        })
        const data = await res.json()
        if (!res.ok) {
          setForgotError(data.error || 'Failed to send reset email.')
        } else {
          setForgotResetToken(null)
          setView('forgot-sent')
        }
      } catch {
        setForgotError('Network error. Please try again.')
      } finally {
        setForgotLoading(false)
      }
    },
    [forgotEmail, API_BASE]
  )

  const handleClose = () => {
    setView('login')
    setLoginId('')
    setPassword('')
    setForgotEmail('')
    setForgotError(null)
    setForgotResetToken(null)
    clearError()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      id="seller-login-modal-overlay"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        id="seller-login-modal"
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <button
            id="seller-login-close-btn"
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Close"
          >
            ✕
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
            >
              🏪
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {view === 'login' && 'Merchant Login'}
                {view === 'forgot' && 'Reset Password'}
                {view === 'forgot-sent' && 'Check Your Email'}
              </h2>
              <p className="text-xs text-white/50">
                {view === 'login' && 'Sign in to your store dashboard'}
                {view === 'forgot' && "We'll send you a reset link"}
                {view === 'forgot-sent' && 'Password reset instructions sent'}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent mb-6" />
        </div>

        {/* Body */}
        <div className="px-8 pb-8">
          {/* ── Login View ─────────────────────────────── */}
          {view === 'login' && (
            <form id="seller-login-form" onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="rounded-xl p-3 text-sm text-red-300 border border-red-500/30"
                  style={{ background: 'rgba(239,68,68,0.1)' }}>
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                  Email or Store Slug
                </label>
                <input
                  id="seller-login-id"
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="email@yourstore.com"
                  required
                  className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(102,126,234,0.7)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.15)')}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="seller-login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-white/30 outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = 'rgba(102,126,234,0.7)')}
                    onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.15)')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors text-sm"
                    tabIndex={-1}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                <div className="flex justify-end mt-1">
                  <button
                    type="button"
                    id="seller-forgot-password-btn"
                    onClick={() => { clearError(); setView('forgot') }}
                    className="text-xs text-white/40 hover:text-white/70 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <button
                id="seller-login-submit-btn"
                type="submit"
                disabled={isLoading || !loginId || !password}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                }}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  'Sign In to Dashboard'
                )}
              </button>
            </form>
          )}

          {/* ── Forgot Password View ───────────────────── */}
          {view === 'forgot' && (
            <form id="seller-forgot-form" onSubmit={handleForgot} className="space-y-4">
              {forgotError && (
                <div className="rounded-xl p-3 text-sm text-red-300 border border-red-500/30"
                  style={{ background: 'rgba(239,68,68,0.1)' }}>
                  {forgotError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                  Account Email
                </label>
                <input
                  id="seller-forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="email@yourstore.com"
                  required
                  className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(102,126,234,0.7)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.15)')}
                />
              </div>

              <button
                id="seller-forgot-submit-btn"
                type="submit"
                disabled={forgotLoading || !forgotEmail}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
              >
                {forgotLoading ? 'Sending…' : 'Send Reset Link'}
              </button>

              <button
                type="button"
                onClick={() => setView('login')}
                className="w-full text-center text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                ← Back to login
              </button>
            </form>
          )}

          {/* ── Forgot Sent Confirmation ───────────────── */}
          {view === 'forgot-sent' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl"
                style={{ background: 'rgba(102,126,234,0.2)' }}>
                ✉️
              </div>
              <p className="text-sm text-white/70 leading-relaxed">
                If an account with <strong className="text-white">{forgotEmail}</strong> exists, a password reset link
                has been sent to that address.
              </p>

              {/* Dev-only: show the reset token directly */}
              {forgotResetToken && (
                <div className="rounded-xl p-3 text-left"
                  style={{ background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.3)' }}>
                  <p className="text-xs text-yellow-400 font-bold mb-1">⚠️ DEV MODE — Reset Token:</p>
                  <code className="text-xs text-yellow-300 break-all">{forgotResetToken}</code>
                  <p className="text-xs text-yellow-400/60 mt-1">
                    Use POST /api/auth/seller/reset-password with this token.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => { setView('login'); setForgotEmail('') }}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
              >
                Back to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
