// --- Provision Store Modal ---
// Allows Super Admins to instantly provision a new store, dedicated database schema,
// and trigger zero-knowledge merchant onboarding credentials.

import { useState } from 'react'
import { authService } from '@/api/auth'
import { auditLogger } from '@/api/audit-logger'
import { getNichePreset } from '@/data/store-niches'
import StoreTypePicker from '@/components/platform/StoreTypePicker'
import { PLAN_CATALOG, PLAN_IDS, formatPlanPrice } from '@/data/plans'
import type { TenantConfig } from '@/types/tenant'

interface Props {
  isOpen: boolean
  onClose: () => void
  onProvision: (data: {
    brandName: string
    slug: string
    ownerName: string
    ownerEmail: string
    ownerPhone?: string
    plan?: 'starter' | 'pro' | 'enterprise'
    niche?: string
    storeType?: string
    categories?: string[]
    primaryColor?: string
    accentColor?: string
    customDomain?: string
  }) => Promise<TenantConfig>
  onSuccess?: (tenant: TenantConfig, resetUrl: string) => void
}

export default function ProvisionStoreModal({ isOpen, onClose, onProvision, onSuccess }: Props) {
  const [brandName, setBrandName] = useState('')
  const [slug, setSlug] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [plan, setPlan] = useState<'starter' | 'pro' | 'enterprise'>('starter')
  const [storeType, setStoreType] = useState('fashion')
  const [categories, setCategories] = useState<string[]>(() => [...getNichePreset('fashion').categories])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleBrandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setBrandName(val)
    // Auto-generate clean slug if not manually edited
    const autoSlug = val.toLowerCase().replace(/[^a-z0-9]/g, '')
    setSlug(autoSlug)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (!brandName.trim() || !cleanSlug || !ownerName.trim() || !ownerEmail.trim()) {
      setError('Please fill in all required fields.')
      return
    }
    if (categories.length === 0) {
      setError('Add at least one store category.')
      return
    }

    setIsSubmitting(true)
    try {
      // 1. Provision Tenant Store & Dedicated Database
      const newTenant = await onProvision({
        brandName: brandName.trim(),
        slug: cleanSlug,
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        ownerPhone: ownerPhone.trim(),
        plan,
        niche: getNichePreset(storeType).label,
        storeType,
        categories,
      })

      // 2. Automatically dispatch zero-knowledge password reset email to store owner
      const resetResult = await authService.triggerStorePasswordReset(cleanSlug, ownerEmail.trim().toLowerCase())

      // 3. Log audit event
      auditLogger.log({
        actorId: 'admin_master_001',
        actorName: 'Super Admin',
        actorRole: 'super_admin',
        tenantSlug: cleanSlug,
        tenantName: newTenant.brandName,
        action: 'STORE_PROVISIONED',
        category: 'provisioning',
        severity: 'info',
        details: `Super Admin provisioned new store "${newTenant.brandName}" with isolated database orvexa_tenant_${cleanSlug}. Password reset email sent to ${ownerEmail}.`,
        metadata: { slug: cleanSlug, ownerEmail, plan },
      })

      setIsSubmitting(false)
      onSuccess?.(newTenant, resetResult.resetUrl)
      onClose()
    } catch (err: any) {
      setIsSubmitting(false)
      setError(err.message || 'Failed to provision store. Please try again.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-xl bg-white border border-slate-200/90 rounded-3xl shadow-2xl overflow-hidden text-slate-900 animate-scale-in">
        {/* Top vibrant accent stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-xl text-white shadow-md shadow-blue-500/20">
              🏬
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Provision New Store</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Instant isolated database schema, client folder, and owner credentials
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 max-h-[78vh] overflow-y-auto space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
              <span>✕</span>
              <span>{error}</span>
            </div>
          )}

          {/* Store Brand & Subdomain */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Store / Brand Name *
              </label>
              <input
                type="text"
                required
                value={brandName}
                onChange={handleBrandChange}
                placeholder="e.g. Aura Luxe"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Store portal slug *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 pointer-events-none">
                  orvexacloud.in/t/
                </span>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="auraluxe"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-[7.75rem] pr-3.5 py-2.5 text-xs text-blue-700 font-mono font-bold placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Owner Full Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Store Owner Full Name *
              </label>
              <input
                type="text"
                required
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Aanya Sharma"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Owner Account Email *
              </label>
              <input
                type="email"
                required
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="e.g. aanya@auraluxe.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all font-mono"
              />
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Owner WhatsApp / Phone
            </label>
            <input
              type="text"
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all font-mono"
            />
          </div>

          {/* Store Type & Categories */}
          <StoreTypePicker
            storeType={storeType}
            categories={categories}
            onChange={(type, cats) => {
              setStoreType(type)
              setCategories(cats)
            }}
          />

          {/* Subscription Plan Tier */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Subscription Plan
            </label>
            <div className="grid grid-cols-3 gap-3">
              {PLAN_IDS.map((id) => ({
                id,
                name: PLAN_CATALOG[id].label,
                price: formatPlanPrice(PLAN_CATALOG[id].pricePerMonth),
                desc: PLAN_CATALOG[id].highlight,
              })).map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPlan(p.id as any)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    plan === p.id
                      ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-2 ring-blue-500/10'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-900">{p.name}</p>
                  <p className="text-[11px] font-mono font-semibold text-blue-600 mt-0.5">{p.price}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Architecture & Security Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">🗄️ Isolated Database:</span>
              <code className="text-emerald-700 font-bold">
                orvexa_tenant_{slug || 'slug'}
              </code>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">📁 Client Directory:</span>
              <code className="text-slate-900 font-bold">
                src/tenants/{slug || 'slug'}/
              </code>
            </div>
            <div className="pt-2 border-t border-slate-200/80 flex items-start gap-2 text-[11px] text-slate-600">
              <span className="text-sm">🔒</span>
              <p className="leading-tight">
                <strong>Zero-Knowledge Handover:</strong> A secure password reset link will automatically be dispatched to <strong>{ownerEmail || 'the owner email'}</strong> upon provisioning.
              </p>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition-all cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Provisioning Database & Store...</span>
                </>
              ) : (
                <span>🚀 Provision Store & Database</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
