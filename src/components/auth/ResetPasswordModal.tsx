// --- Password Reset Modal ---
// Reads ?reset_token=<token>&slug=<tenantSlug> from URL query params.
// Can also be used as a controlled modal by passing props directly.

import { useState, useCallback, useEffect } from 'react'
import { authService } from '@/api/auth'
import { storeAddress } from '@/data/plans'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Pre-populate from URL if not passed as a prop */
  resetToken?: string
  tenantSlug?: string
}

export default function ResetPasswordModal({ isOpen, onClose, resetToken: propToken, tenantSlug: propSlug }: Props) {
  // Read token and slug from props or URL
  const [resetToken, setResetToken] = useState(propToken || '')
  const [tenantSlug, setTenantSlug] = useState(propSlug || '')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isGeneratingToken, setIsGeneratingToken] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Synchronize when props change
  useEffect(() => {
    if (propToken) setResetToken(propToken)
  }, [propToken])

  useEffect(() => {
    if (propSlug) setTenantSlug(propSlug)
  }, [propSlug])

  // Synchronize when modal opens
  useEffect(() => {
    if (isOpen) {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
      const urlToken = propToken || params.get('reset_token') || ''
      const urlSlug = propSlug || params.get('slug') || params.get('tenant') || ''

      const targetSlug = urlSlug || tenantSlug || 'lunar'
      setTenantSlug(targetSlug)

      if (urlToken) {
        setResetToken(urlToken)
      } else {
        // Fallback: check stored credentials for active pending reset token
        const cred = authService.getStoreCredential(targetSlug)
        if (cred?.resetToken) {
          setResetToken(cred.resetToken)
        }
      }
    }
  }, [isOpen, propToken, propSlug])

  // Effective slug and token resolution
  const effectiveSlug = (
    tenantSlug ||
    propSlug ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('slug') ||
        new URLSearchParams(window.location.search).get('tenant')
      : null) ||
    'lunar'
  ).trim().toLowerCase()

  const effectiveToken = (
    resetToken ||
    propToken ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('reset_token')
      : null) ||
    (authService.getStoreCredential(effectiveSlug)?.resetToken || '')
  ).trim()

  // Password strength
  const getStrength = (pwd: string): { label: string; color: string; width: string } => {
    if (pwd.length === 0) return { label: '', color: 'transparent', width: '0%' }
    if (pwd.length < 8) return { label: 'Too short', color: '#ef4444', width: '20%' }
    const hasUpper = /[A-Z]/.test(pwd)
    const hasLower = /[a-z]/.test(pwd)
    const hasNum = /\d/.test(pwd)
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd)
    const score = [hasUpper, hasLower, hasNum, hasSpecial].filter(Boolean).length
    if (score <= 2) return { label: 'Weak', color: '#f97316', width: '40%' }
    if (score === 3) return { label: 'Good', color: '#eab308', width: '70%' }
    return { label: 'Strong', color: '#22c55e', width: '100%' }
  }

  const strength = getStrength(newPassword)

  const handleReset = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)

      if (newPassword.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }

      if (newPassword !== confirmPassword) {
        setError("Passwords don't match.")
        return
      }

      if (!effectiveToken) {
        setError('Missing reset token. Please paste the reset token from your email or administrator access pass.')
        return
      }

      if (!effectiveSlug) {
        setError('Missing store slug. Please select or enter your store slug.')
        return
      }

      setLoading(true)
      try {
        const result = await authService.completePasswordReset(effectiveSlug, effectiveToken, newPassword)
        if (!result.success) {
          setError(result.error || result.message || 'Failed to reset password.')
        } else {
          setSuccess(true)
          // Clean up query parameters from URL without full reload
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            url.searchParams.delete('reset_token')
            url.searchParams.delete('slug')
            window.history.replaceState({}, '', url.toString())
          }
        }
      } catch {
        setError('Network error. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    [effectiveToken, effectiveSlug, newPassword, confirmPassword]
  )

  const handleQuickGenerateToken = async () => {
    setIsGeneratingToken(true)
    setError(null)
    try {
      const res = await authService.triggerStorePasswordReset(effectiveSlug)
      if (res?.resetToken) {
        setResetToken(res.resetToken)
      } else {
        setError('Failed to generate reset authorization token.')
      }
    } catch {
      setError('Network error while generating reset authorization pass.')
    } finally {
      setIsGeneratingToken(false)
    }
  }

  const handleClose = () => {
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      id="reset-password-modal-overlay"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        id="reset-password-modal"
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <button
            id="reset-password-close-btn"
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-md"
              style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)' }}
            >
              🔑
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {success ? 'Password Updated!' : 'Set New Password'}
              </h2>
              <p className="text-xs text-white/50">
                {success ? "You're all set — new credentials active" : 'Choose a strong password for your store'}
              </p>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent mb-6" />
        </div>

        <div className="px-8 pb-8">
          {success ? (
            <div className="text-center space-y-4 animate-scale-in">
              <div
                className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl"
                style={{ background: 'rgba(34,197,94,0.2)' }}
              >
                ✅
              </div>
              <div className="space-y-1">
                <p className="text-sm text-white/90 font-medium">
                  Password updated for <span className="font-mono text-cyan-300 font-bold">{effectiveSlug}</span>!
                </p>
                <p className="text-xs text-white/60">
                  Previous credentials have been invalidated. You can now access your merchant dashboard.
                </p>
              </div>
              <button
                id="reset-password-done-btn"
                onClick={handleClose}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all cursor-pointer shadow-lg"
                style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)' }}
              >
                Done
              </button>
            </div>
          ) : (
            <form id="reset-password-form" onSubmit={handleReset} className="space-y-4">
              {error && (
                <div
                  className="rounded-xl p-3 text-xs text-red-300 border border-red-500/30 leading-relaxed"
                  style={{ background: 'rgba(239,68,68,0.1)' }}
                >
                  {error}
                </div>
              )}

              {/* Store & Token Context Indicators */}
              <div className="space-y-2.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider font-mono">
                      STORE IDENTIFIER
                    </label>
                    <span className="text-[10px] font-mono text-cyan-400">Isolated DB</span>
                  </div>
                  {propSlug ? (
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white">
                      <span>🏬</span>
                      <span className="font-semibold text-white">{effectiveSlug}</span>
                      <span className="text-white/40 font-mono text-[11px]">({storeAddress(effectiveSlug)})</span>
                    </div>
                  ) : (
                    <select
                      id="reset-tenant-slug-select"
                      value={tenantSlug || effectiveSlug}
                      onChange={(e) => {
                        const newSlug = e.target.value
                        setTenantSlug(newSlug)
                        const cred = authService.getStoreCredential(newSlug)
                        if (cred?.resetToken && !propToken) {
                          setResetToken(cred.resetToken)
                        }
                      }}
                      className="w-full rounded-xl px-4 py-2.5 text-xs text-white bg-slate-900/90 border border-white/15 outline-none cursor-pointer focus:border-cyan-400 transition-colors font-mono"
                    >
                      <option value="lunar">The Lunar Clothing (lunar)</option>
                      <option value="silkhaus">Silkhaus (silkhaus)</option>
                      <option value="bloomweave">Bloomweave (bloomweave)</option>
                      <option value="khadi">Khadi Craft (khadi)</option>
                    </select>
                  )}
                </div>

                {effectiveToken ? (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3.5 py-2 text-xs text-emerald-300">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] font-semibold">One-Time Reset Authorization:</span>
                      <span className="font-mono text-[10px] text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">Active</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setResetToken('')}
                      className="text-[10px] text-white/40 hover:text-white underline cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider font-mono">
                        RESET TOKEN
                      </label>
                      <button
                        type="button"
                        onClick={handleQuickGenerateToken}
                        disabled={isGeneratingToken}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold underline cursor-pointer disabled:opacity-50"
                      >
                        {isGeneratingToken ? 'Generating...' : `⚡ Generate Pass for ${effectiveSlug}`}
                      </button>
                    </div>
                    <input
                      id="reset-token-input"
                      type="text"
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Paste your reset token or click 'Generate Pass' above"
                      className="w-full rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/25 outline-none transition-all font-mono"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
                      onFocus={(e) => (e.target.style.borderColor = 'rgba(6,182,212,0.6)')}
                      onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1.5 font-mono">
                  NEW PASSWORD
                </label>
                <div className="relative">
                  <input
                    id="reset-new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full rounded-xl px-4 py-2.5 pr-12 text-sm text-white placeholder-white/25 outline-none transition-all"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
                    onFocus={(e) => (e.target.style.borderColor = 'rgba(6,182,212,0.6)')}
                    onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors text-sm cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>

                {/* Password strength bar */}
                {newPassword.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: strength.width, background: strength.color }}
                      />
                    </div>
                    <p className="text-[10px] font-mono" style={{ color: strength.color }}>{strength.label}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1.5 font-mono">
                  CONFIRM PASSWORD
                </label>
                <input
                  id="reset-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: `1px solid ${confirmPassword && confirmPassword !== newPassword ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)'}`,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(6,182,212,0.6)')}
                  onBlur={(e) => (e.target.style.borderColor = confirmPassword && confirmPassword !== newPassword ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)')}
                />
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-xs text-red-400 mt-1">Passwords don't match</p>
                )}
              </div>

              <button
                id="reset-password-submit-btn"
                type="submit"
                disabled={loading || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all mt-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-lg"
                style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Updating Password…
                  </span>
                ) : (
                  'Update Password'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

