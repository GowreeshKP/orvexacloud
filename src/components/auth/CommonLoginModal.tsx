// --- Unified Common Login Modal ---
// Single gateway for Super Admin, Merchant Store Owners, and Store Staff.
// Automatically verifies credentials, issues JWT sessions, and routes to appropriate console/dashboard.

import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { authService, DEFAULT_DEMO_SELLER_CREDENTIALS, DEMO_ADMIN_CREDENTIAL, DEMO_MODE } from '@/api/auth'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (session?: any) => void
}

type View = 'login' | 'forgot' | 'forgot-sent'

export default function CommonLoginModal({ isOpen, onClose, onSuccess }: Props) {
  const { login, isLoading, error, clearError } = useAuth()

  const [view, setView] = useState<View>('login')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [localLoading, setLocalLoading] = useState(false)

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotResetToken, setForgotResetToken] = useState<string | null>(null)

  const API_BASE = import.meta.env.VITE_API_URL || ''

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      clearError()
      setLocalError(null)
      setLocalLoading(true)

      const cleanId = loginId.trim().toLowerCase()
      const cleanPass = password.trim()

      if (!cleanId || !cleanPass) {
        setLocalError('Please enter both your Login ID and password.')
        setLocalLoading(false)
        return
      }

      try {
        // Attempt unified login through authService
        const res = await authService.loginCommon(cleanId, cleanPass)
        if (res.success && res.session) {
          // If super admin
          if (res.session.role === 'super_admin') {
            await login({ type: 'admin', loginId: cleanId, password: cleanPass })
          } else {
            await login({ type: 'seller', loginId: cleanId, password: cleanPass })
          }
          if (onSuccess) onSuccess(res.session)
          onClose()
          return
        }

        // If backend returned error
        setLocalError(res.error || 'Invalid credentials. Please verify your login details.')
      } catch (err: any) {
        setLocalError(err.message || 'Authentication error. Please try again.')
      } finally {
        setLocalLoading(false)
      }
    },
    [login, loginId, password, clearError, onSuccess, onClose]
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
          body: JSON.stringify({ email: forgotEmail.trim() }),
        })
        const data = await res.json()
        if (!res.ok) {
          setForgotError(data.error || 'Failed to generate reset link.')
        } else {
          setForgotResetToken(null)
          setView('forgot-sent')
        }
      } catch {
        setForgotError('Could not reach the server. Please try again in a moment.')
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
    setLocalError(null)
    clearError()
    onClose()
  }

  const handleFillDemo = (id: string, pass: string) => {
    setLoginId(id)
    setPassword(pass)
    setLocalError(null)
    clearError()
  }

  if (!isOpen) return null

  return (
    <div
      id="common-login-modal-overlay"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(10, 15, 29, 0.82)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        id="common-login-modal"
        className="relative w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in"
        style={{
          background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(59, 130, 246, 0.15)',
        }}
      >
        {/* Glowing top accent line */}
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400" />

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer z-20"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header */}
        <div className="px-8 pt-8 pb-4 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-400 p-[1.5px] mb-4 shadow-lg shadow-blue-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-xl text-white font-black">
              O
            </div>
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight font-display">
            Orvexa Account Login
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Access your Merchant Store Dashboard or Super Admin Console
          </p>
        </div>

        {/* Body */}
        <div className="px-8 pb-8">
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              {(error || localError) && (
                <div className="rounded-xl p-3 text-xs text-rose-300 border border-rose-500/30 bg-rose-500/10 flex items-start gap-2">
                  <span className="text-rose-400 font-bold">✕</span>
                  <span>{error || localError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Login Email / Store ID / Admin ID
                </label>
                <input
                  type="text"
                  required
                  value={loginId}
                  onChange={(e) => {
                    setLoginId(e.target.value)
                    setLocalError(null)
                  }}
                  placeholder="e.g. gowreesh@thelunarclothing.com or admin"
                  className="w-full bg-slate-800/80 border border-slate-700/80 focus:border-blue-500 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 outline-none transition-all shadow-inner focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setView('forgot')}
                    className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setLocalError(null)
                    }}
                    placeholder="Enter account password"
                    className="w-full bg-slate-800/80 border border-slate-700/80 focus:border-blue-500 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 outline-none transition-all pr-10 shadow-inner focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || localLoading}
                className="w-full py-3.5 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 transform active:scale-98 mt-2"
              >
                {isLoading || localLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In →</span>
                )}
              </button>

              {DEMO_MODE && (
              <div className="pt-4 border-t border-slate-800/80 space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 text-center font-semibold">
                  Quick Demo 1-Click Sign In:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleFillDemo(DEMO_ADMIN_CREDENTIAL.loginId, DEMO_ADMIN_CREDENTIAL.password)}
                    className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-all cursor-pointer group hover:border-amber-500/40"
                  >
                    <p className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                      <span>👑</span> Super Admin
                    </p>
                    <p className="text-[9px] font-mono text-slate-400 truncate mt-0.5">admin@orvexatech.com</p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleFillDemo(DEFAULT_DEMO_SELLER_CREDENTIALS[0].loginId, DEFAULT_DEMO_SELLER_CREDENTIALS[0].password)
                    }
                    className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-all cursor-pointer group hover:border-blue-500/40"
                  >
                    <p className="text-[11px] font-bold text-blue-300 flex items-center gap-1">
                      <span>👗</span> Lunar Clothing
                    </p>
                    <p className="text-[9px] font-mono text-slate-400 truncate mt-0.5">gowreesh@thelunar...</p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleFillDemo(DEFAULT_DEMO_SELLER_CREDENTIALS[1].loginId, DEFAULT_DEMO_SELLER_CREDENTIALS[1].password)
                    }
                    className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-all cursor-pointer group hover:border-emerald-500/40"
                  >
                    <p className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                      <span>🧵</span> Silk Haus
                    </p>
                    <p className="text-[9px] font-mono text-slate-400 truncate mt-0.5">kavya@silkhaus.in</p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleFillDemo(DEFAULT_DEMO_SELLER_CREDENTIALS[2].loginId, DEFAULT_DEMO_SELLER_CREDENTIALS[2].password)
                    }
                    className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-all cursor-pointer group hover:border-indigo-500/40"
                  >
                    <p className="text-[11px] font-bold text-indigo-300 flex items-center gap-1">
                      <span>🪡</span> Khadi Studio
                    </p>
                    <p className="text-[9px] font-mono text-slate-400 truncate mt-0.5">arjun@khadistudio.co</p>
                  </button>
                </div>
              </div>
              )}
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              {forgotError && (
                <div className="rounded-xl p-3 text-xs text-rose-300 border border-rose-500/30 bg-rose-500/10">
                  {forgotError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Registered Account Email
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Enter your store owner email"
                  className="w-full bg-slate-800/80 border border-slate-700/80 focus:border-blue-500 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 outline-none transition-all shadow-inner"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="flex-1 py-3 rounded-full text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  ← Back to Login
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex-1 py-3 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {forgotLoading ? 'Sending...' : 'Send Reset Token'}
                </button>
              </div>
            </form>
          )}

          {view === 'forgot-sent' && (
            <div className="space-y-4 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-2xl flex items-center justify-center mx-auto">
                ✓
              </div>
              <h3 className="text-base font-bold text-white">Reset Token Generated</h3>
              <p className="text-xs text-slate-300">
                A password reset token was created for <strong className="text-white">{forgotEmail}</strong>.
              </p>
              {forgotResetToken && (
                <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 text-left">
                  <p className="text-[10px] font-mono uppercase text-slate-400 font-semibold mb-1">Temporary Token:</p>
                  <p className="text-xs font-mono text-emerald-400 font-bold break-all">{forgotResetToken}</p>
                </div>
              )}
              <button
                onClick={() => setView('login')}
                className="w-full py-3 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all cursor-pointer"
              >
                Return to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
