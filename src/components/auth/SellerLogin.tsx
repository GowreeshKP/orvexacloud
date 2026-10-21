import { useState } from 'react'
import { authService, type SellerSession } from '@/api/auth'
import type { TenantConfig } from '@/types/tenant'

interface SellerLoginProps {
  tenant?: TenantConfig | null
  onLoginSuccess: (session: SellerSession) => void
}

export default function SellerLogin({ tenant, onLoginSuccess }: SellerLoginProps) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!loginId.trim()) {
      setError('Please enter your Merchant Login ID or Email.')
      return
    }
    if (!password.trim()) {
      setError('Please enter your password.')
      return
    }

    setLoading(true)
    const res = await authService.loginSeller(loginId, password)
    setLoading(false)
    if (res.success && res.session) {
      onLoginSuccess(res.session)
    } else {
      setError(res.error || 'Invalid credentials. Please verify your Login ID and password.')
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-stone-900/90 border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl relative z-10 animate-fade-in text-white">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-stone-800 to-stone-700 border border-white/20 mb-3 shadow-inner">
            <span className="text-2xl">🛍️</span>
          </div>
          <p className="text-[10px] font-mono tracking-[0.25em] text-amber-400 uppercase font-bold">
            ORVEXATECH MERCHANT PARTNER PORTAL
          </p>
          <h1 className="text-2xl font-serif text-white mt-1">Seller Dashboard Login</h1>
          <p className="text-xs text-white/50 mt-1">
            Access catalog management, homepage picture customizer, and order fulfillment.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3.5 bg-red-950/80 border border-red-500/40 rounded-xl text-red-200 text-xs flex items-center gap-2 animate-shake">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-white/70 mb-1.5">
              Merchant Login ID / Email or Subdomain
            </label>
            <div className="relative">
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="e.g. gowreesh@thelunarclothing.com or lunar"
                className="w-full bg-black/50 border border-white/15 focus:border-amber-400/80 rounded-xl px-4 py-3 text-xs text-white placeholder-white/25 outline-none transition-all"
                required
              />
              <span className="absolute right-3.5 top-3.5 text-white/40 text-xs">✉️</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[10px] text-amber-400/80 hover:text-amber-300 transition-colors uppercase tracking-wider font-semibold cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your seller password"
                className="w-full bg-black/50 border border-white/15 focus:border-amber-400/80 rounded-xl px-4 py-3 text-xs text-white placeholder-white/25 outline-none transition-all font-mono"
                required
              />
              <span className="absolute right-3.5 top-3.5 text-white/40 text-xs">🔒</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 text-white/60 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded accent-amber-400"
              />
              <span>Remember session</span>
            </label>
            <span className="text-[11px] text-white/40">Secure 256-Bit SSL</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-[0.99] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <span>Sign In to Seller Portal →</span>
            )}
          </button>
        </form>

        {/* Back Link */}
        <div className="mt-6 text-center">
          <a
            href={tenant?.slug ? `/t/${tenant.slug}` : '/admin'}
            className="text-xs text-white/40 hover:text-white transition-colors inline-flex items-center gap-1.5"
          >
            <span>← Return to Customer Storefront</span>
          </a>
        </div>
      </div>
    </div>
  )
}
