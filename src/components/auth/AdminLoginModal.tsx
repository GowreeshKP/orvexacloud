// --- Super Admin Login Modal ---
// Platform console login for super_admin role only.

import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AdminLoginModal({ isOpen, onClose, onSuccess }: Props) {
  const { login, isLoading, error, clearError } = useAuth()

  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      clearError()
      await login({ type: 'admin', loginId, password })
    },
    [login, loginId, password, clearError]
  )

  const handleClose = () => {
    setLoginId('')
    setPassword('')
    clearError()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      id="admin-login-modal-overlay"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        id="admin-login-modal"
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0d1117 100%)',
          border: '1px solid rgba(255,100,50,0.2)',
          boxShadow: '0 0 60px rgba(255,100,50,0.05)',
        }}
      >
        {/* Red alert top bar */}
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #ff4444, #ff6b35, #ff4444)' }} />

        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <button
            id="admin-login-close-btn"
            onClick={handleClose}
            className="absolute top-6 right-4 w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Close"
          >
            ✕
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: 'linear-gradient(135deg, #ff4444, #ff6b35)' }}
            >
              🛡️
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Platform Console</h2>
              <p className="text-xs text-white/40">Super Admin · Restricted Access</p>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-red-500/20 to-transparent mb-6" />
        </div>

        {/* Body */}
        <div className="px-8 pb-8">
          <form id="admin-login-form" onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div
                className="rounded-xl p-3 text-sm text-red-300 border border-red-500/30"
                style={{ background: 'rgba(239,68,68,0.1)' }}
              >
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                Admin Email or ID
              </label>
              <input
                id="admin-login-id"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="admin@orvexatech.com"
                required
                autoComplete="username"
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,100,50,0.2)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(255,100,50,0.6)')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(255,100,50,0.2)')}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                Master Password
              </label>
              <div className="relative">
                <input
                  id="admin-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-white/25 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,100,50,0.2)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(255,100,50,0.6)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255,100,50,0.2)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors text-sm"
                  tabIndex={-1}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              id="admin-login-submit-btn"
              type="submit"
              disabled={isLoading || !loginId || !password}
              className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #ff4444 0%, #ff6b35 100%)',
              }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating…
                </span>
              ) : (
                'Access Platform Console'
              )}
            </button>

            <p className="text-center text-xs text-white/25 mt-2">
              🔒 All access attempts are logged and monitored.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
