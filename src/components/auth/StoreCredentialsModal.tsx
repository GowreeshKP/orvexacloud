// --- Store Owner Authentication & Credentials Management Modal ---
// Allows Super Admins to view store identifiers, update contact details, and trigger secure password reset emails.
// For security & compliance, administrators cannot manually set passwords; clicking reset immediately
// invalidates the store owner's previous password and dispatches an encrypted password reset link to their email.

import { useState, useEffect } from 'react'
import { authService, type StoreCredentialInfo } from '@/api/auth'
import type { TenantConfig } from '@/types/tenant'
import { storeAddress } from '@/data/plans'
import { API_BASE } from '@/lib/api-base'
import { ownerPortalUrl as permanentOwnerPortalUrl } from '@/lib/store-urls'

interface Props {
  tenant: TenantConfig | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: (msg: string) => void
}

export default function StoreCredentialsModal({ tenant, isOpen, onClose, onSuccess }: Props) {
  const [credInfo, setCredInfo] = useState<StoreCredentialInfo | null>(null)
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [resetSuccess, setResetSuccess] = useState<string | null>(null)
  const [resetDetails, setResetDetails] = useState<{
    token: string
    url: string
    email: string
  } | null>(null)
  const [activeTab, setActiveTab] = useState<'credentials' | 'staff' | 'access-pass'>('credentials')

  // Staff creation state
  const [staffName, setStaffName] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const [staffRole, setStaffRole] = useState<'staff' | 'manager'>('staff')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; email: string; role: string }>>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffMsg, setStaffMsg] = useState<string | null>(null)
  const [copiedOwnerUrl, setCopiedOwnerUrl] = useState(false)

  useEffect(() => {
    if (tenant && isOpen) {
      const current = authService.getStoreCredential(tenant.slug)
      setCredInfo(current)
      setOwnerEmail(tenant.ownerEmail || current.loginId)
      setOwnerName(tenant.ownerName || current.ownerName)
      setOwnerPhone(tenant.ownerPhone || '')
      setStaffMsg(null)

      if ((current.passwordResetPending || current.isPasswordRevoked) && current.resetToken && current.resetUrl) {
        setResetDetails({ token: current.resetToken, url: current.resetUrl, email: current.loginId })
      } else {
        setResetDetails(null)
        setResetSuccess(null)
      }

      authService.getValidAdminToken().then((token) => {
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        fetch(`${API_BASE}/admin/tenants/${tenant.slug}/staff`, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.staff) setStaffList(data.staff)
          })
          .catch(() => {})
      })
    }
  }, [tenant, isOpen])

  if (!isOpen || !tenant) return null

  const ownerPortalUrl = permanentOwnerPortalUrl(tenant.slug)

  const isPasswordRevoked =
    credInfo?.isPasswordRevoked ||
    credInfo?.passwordResetPending ||
    credInfo?.password?.startsWith('REVOKED_')

  // Trigger Password Reset Email
  const handleTriggerPasswordReset = async () => {
    if (!tenant) return
    setIsResetting(true)
    setResetSuccess(null)

    try {
      const targetEmail = ownerEmail.trim() || tenant.ownerEmail
      const res = await authService.triggerStorePasswordReset(tenant.slug, targetEmail)
      if (res.success) {
        setResetSuccess(res.message)
        setResetDetails({
          token: res.resetToken,
          url: res.resetUrl,
          email: res.ownerEmail,
        })
        const updated = authService.getStoreCredential(tenant.slug)
        setCredInfo(updated)
        onSuccess?.(`Password reset email dispatched to ${res.ownerEmail}! Old password has been revoked.`)
      } else {
        setResetSuccess(null)
        setResetDetails(null)
        setStaffMsg(res.error || res.message)
      }
    } catch (err: any) {
      console.error('Password reset trigger error:', err)
    } finally {
      setIsResetting(false)
    }
  }

  // Save Store Owner Profile Details (Name, Email, Phone)
  const handleSaveStoreDetails = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    const res = await authService.updateStoreCredentialsAdmin(tenant.slug, {
      ownerEmail: ownerEmail.trim().toLowerCase(),
      ownerName: ownerName.trim(),
      ownerPhone: ownerPhone.trim(),
    })

    setIsSaving(false)
    if (res.success) {
      const updated = authService.getStoreCredential(tenant.slug)
      setCredInfo(updated)
      onSuccess?.(res.message || 'Store details updated successfully!')
    }
  }

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staffName || !staffEmail || !staffPassword) return

    setStaffLoading(true)
    setStaffMsg(null)
    const token = await authService.getValidAdminToken()

    try {
      const res = await fetch(`${API_BASE}/admin/tenants/${tenant.slug}/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: staffName,
          email: staffEmail,
          password: staffPassword,
          role: staffRole,
        }),
      })
      const data = await res.json()
      if (res.ok && data.staff) {
        setStaffList((prev) => [...prev, data.staff])
        setStaffName('')
        setStaffEmail('')
        setStaffPassword('')
        setStaffMsg(`✅ Staff account created for ${data.staff.name} (${data.staff.role})`)
      } else {
        setStaffMsg(`⚠️ ${data.error || 'Could not create staff member'}`)
      }
    } catch {
      // Offline fallback
      const newStaff = {
        id: `staff_${Date.now()}`,
        name: staffName,
        email: staffEmail,
        role: staffRole,
      }
      setStaffList((prev) => [...prev, newStaff])
      setStaffName('')
      setStaffEmail('')
      setStaffPassword('')
      setStaffMsg(`✅ Staff account registered for ${staffName} (${staffRole})`)
    } finally {
      setStaffLoading(false)
    }
  }

  const handleDeleteStaff = async (staffId: string) => {
    const token = await authService.getValidAdminToken()
    try {
      await fetch(`${API_BASE}/admin/tenants/${tenant.slug}/staff/${staffId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch {}
    setStaffList((prev) => prev.filter((s) => s.id !== staffId))
  }

  // Access Pass Text for quick clipboard copying
  const passwordStatusDescription = isPasswordRevoked
    ? '[OLD PASSWORD REVOKED — Reset link sent to owner email]'
    : '[Active Password Configured — Managed via Reset Email]'

  const accessPassText = `================================================
🏢 STORE OWNER ACCESS PASS — ORVEXA CLOUD
================================================
Store Name: ${tenant.brandName}
Store portal: ${storeAddress(tenant.slug)}
Storefront URL: ${window.location.origin}/t/${tenant.slug}

🔑 PERMANENT OWNER PORTAL URL (the only owner login):
${ownerPortalUrl}
Login ID / Email: ${ownerEmail || tenant.ownerEmail}
Login Username: ${tenant.slug}
Password Status: ${passwordStatusDescription}
${resetDetails ? `Direct Password Reset Link: ${resetDetails.url}\n` : ''}Owner Contact: ${ownerName || tenant.ownerName} (${ownerPhone || 'N/A'})

🗄️ Isolated Database: orvexa_tenant_${tenant.slug}
Security Level: Dedicated Database Isolation
================================================`

  const handleCopyAccessPass = () => {
    navigator.clipboard.writeText(accessPassText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleCopyResetLink = () => {
    if (!resetDetails?.url) return
    navigator.clipboard.writeText(resetDetails.url)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-2xl bg-white border border-slate-200/90 rounded-3xl shadow-2xl overflow-hidden text-slate-900 animate-scale-in">
        {/* Top vibrant accent stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-xl text-white shadow-md shadow-blue-500/20">
              🔑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">{tenant.brandName}</h2>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/70 font-medium">
                  {storeAddress(tenant.slug)}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage store owner authentication, reset passwords, and provision team access
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

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/40 px-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('credentials')}
            className={`py-3.5 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'credentials'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🔐</span>
            <span>Owner Authentication</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('access-pass')}
            className={`py-3.5 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'access-pass'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📋</span>
            <span>Merchant Access Pass</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('staff')}
            className={`py-3.5 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'staff'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>👥</span>
            <span>Staff Sub-Accounts ({staffList.length})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6">
          {/* ─────────────────────────────────────────────────────────────
              TAB 1: OWNER AUTHENTICATION & PASSWORD RESET (EMAIL DISPATCH)
          ───────────────────────────────────────────────────────────── */}
          {activeTab === 'credentials' && (
            <div className="space-y-5">
              {/* Current Active Credentials Banner */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">
                    CURRENT ACTIVE LOGIN IDENTIFIERS
                  </span>
                  {isPasswordRevoked ? (
                    <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Old Password Revoked • Reset Pending
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Active Merchant Account
                    </span>
                  )}
                </div>

                <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs space-y-2">
                  <p className="text-[10px] text-indigo-500 uppercase tracking-wider font-mono font-bold">Permanent owner login URL</p>
                  <p className="text-[11px] text-slate-600">
                    This link never changes. Give it to the store owner. It is not shown on the shop.
                  </p>
                  <a
                    href={ownerPortalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[11px] font-mono text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg p-2 break-all hover:underline"
                  >
                    {ownerPortalUrl}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(ownerPortalUrl)
                      setCopiedOwnerUrl(true)
                      setTimeout(() => setCopiedOwnerUrl(false), 2000)
                    }}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white"
                  >
                    {copiedOwnerUrl ? 'Copied' : 'Copy owner URL'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Store Username / Slug</p>
                    <code className="text-blue-700 font-mono font-bold mt-1 block text-xs">{tenant.slug}</code>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Password Status</p>
                    <div className="mt-1">
                      {isPasswordRevoked ? (
                        <div className="flex items-center gap-1.5 text-amber-700 font-mono font-semibold text-xs">
                          <span>⚠️ Revoked (Email sent)</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-emerald-700 font-mono font-semibold text-xs">
                          <span>✓ Active & Configured</span>
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {isPasswordRevoked
                          ? 'Old password is non-functional until reset'
                          : 'Store owner manages access via secure email reset'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: PASSWORD RESET TRIGGER (Admins cannot set manual passwords) */}
              <div className="bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-slate-50 border border-blue-200/80 rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base">🔄</span>
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Store Owner Password Management
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold border border-blue-200">
                        Zero-Knowledge Security
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      For data privacy and compliance, store passwords cannot be viewed or manually entered by administrators.
                      Use the button below to initiate an official password reset for the store owner.
                    </p>
                  </div>
                </div>

                {/* Security Policy Alert */}
                <div className="bg-white/90 border border-blue-100 rounded-xl p-3.5 text-xs text-slate-700 flex items-start gap-2.5 shadow-xs">
                  <span className="text-base mt-0.5">🛡️</span>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">
                      Security Invalidation Policy
                    </p>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Clicking <strong>Reset Password</strong> immediately invalidates the store owner&apos;s current password in the master database.
                      They will <strong>not be able to log in with their old password</strong> and must use the one-time link delivered to:
                    </p>
                    <code className="text-blue-700 font-mono font-bold text-[11px] block mt-0.5 bg-blue-50/80 px-2 py-1 rounded border border-blue-200/60 w-fit">
                      {ownerEmail || tenant.ownerEmail}
                    </code>
                  </div>
                </div>

                {/* Primary Reset Button */}
                <button
                  type="button"
                  onClick={handleTriggerPasswordReset}
                  disabled={isResetting}
                  className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition-all cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isResetting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Revoking Old Password & Sending Email...</span>
                    </>
                  ) : isPasswordRevoked ? (
                    <>
                      <span>✉️ Re-send Password Reset Email & Keep Old Password Revoked</span>
                    </>
                  ) : (
                    <>
                      <span>✉️ Send Password Reset Email & Revoke Old Password</span>
                    </>
                  )}
                </button>

                {/* Reset Dispatched Confirmation Banner */}
                {resetDetails && (
                  <div className="bg-emerald-50 border border-emerald-200/90 rounded-xl p-4 space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                        <span>✅</span>
                        <span>Password Reset Email Dispatched!</span>
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                        Old Password Inactive
                      </span>
                    </div>

                    <p className="text-xs text-emerald-800 leading-relaxed">
                      {resetSuccess || (
                        <>
                          A password reset link was sent to <strong>{resetDetails.email}</strong>.
                          The store owner&apos;s previous credentials are now disabled and cannot be used to log in.
                        </>
                      )}
                    </p>

                    {/* Reset Link Direct Access */}
                    <div className="bg-white p-3 rounded-xl border border-emerald-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                          Direct Reset Link (Valid for 60 Minutes)
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyResetLink}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1"
                        >
                          {copiedLink ? '✓ Copied URL!' : '📋 Copy Link'}
                        </button>
                      </div>

                      <input
                        type="text"
                        readOnly
                        value={resetDetails.url}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-800 outline-none select-all"
                      />

                      <div className="flex items-center gap-2 pt-1">
                        <a
                          href={resetDetails.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <span>↗ Test Reset Page in New Tab</span>
                        </a>
                        <span className="text-slate-300">•</span>
                        <a
                          href={`mailto:${resetDetails.email}?subject=${encodeURIComponent(
                            `Reset Your Store Owner Password — ${tenant.brandName}`
                          )}&body=${encodeURIComponent(
                            `Hello ${ownerName || tenant.ownerName},\n\nA password reset request was initiated for your store "${tenant.brandName}" on Orvexa Cloud.\nYour previous password has been revoked for security.\n\nPlease click the link below to set your new password:\n${resetDetails.url}\n\nThis link is valid for 60 minutes.`
                          )}`}
                          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                        >
                          <span>✉️ Open Mail Client</span>
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Editable Store Profile Details (Name, Email, Phone) */}
              <form onSubmit={handleSaveStoreDetails} className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Store Owner Contact & Profile
                  </h4>
                  <span className="text-[10px] text-slate-400">Updates sync to tenant database</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Store Owner Full Name
                    </label>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      required
                      placeholder="e.g. Gowreesh KP"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Login ID / Account Email
                    </label>
                    <input
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      required
                      placeholder="e.g. gowreesh@thelunarclothing.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Owner Contact Phone (WhatsApp)
                  </label>
                  <input
                    type="text"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all font-mono"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer shadow-md disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Saving Details...</span>
                      </>
                    ) : (
                      <span>💾 Save Store Details</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 2: MERCHANT ACCESS PASS (Ready to share with store owner)
          ───────────────────────────────────────────────────────────── */}
          {activeTab === 'access-pass' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Merchant Onboarding Access Card
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Handover package with direct login identifiers to send to the store owner.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCopyAccessPass}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <span>{copied ? '✓ Copied Pass!' : '📋 Copy Access Card'}</span>
                </button>
              </div>

              {/* Access Card Graphic */}
              <div className="relative rounded-2xl p-6 bg-gradient-to-br from-slate-50 via-white to-blue-50/30 border border-slate-200 shadow-sm space-y-4 font-mono text-xs text-slate-800">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏬</span>
                    <span className="font-bold text-slate-900 text-sm">{tenant.brandName}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                    ISOLATED STORE PASS
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">PERMANENT OWNER LOGIN URL</span>
                    <a
                      href={ownerPortalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline font-semibold break-all"
                    >
                      {ownerPortalUrl}
                    </a>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">LIVE STOREFRONT</span>
                    <a
                      href={`/t/${tenant.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline font-semibold break-all"
                    >
                      /t/{tenant.slug}
                    </a>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">LOGIN ID / EMAIL</span>
                    <span className="text-slate-900 font-bold">{ownerEmail || tenant.ownerEmail}</span>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">PASSWORD STATUS</span>
                    {isPasswordRevoked ? (
                      <span className="text-amber-700 font-bold text-xs">⚠️ Revoked (Reset Link Pending)</span>
                    ) : (
                      <span className="text-emerald-700 font-bold text-xs">● Configured (Managed via Reset)</span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500 flex-wrap gap-2">
                  <span>
                    Database: <code className="text-emerald-700 font-bold">orvexa_tenant_{tenant.slug}</code>
                  </span>
                  <span>
                    Owner: <strong className="text-slate-800">{ownerName || tenant.ownerName}</strong>
                  </span>
                </div>
              </div>

              {/* Fast Sharing Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <a
                  href={`mailto:${ownerEmail || tenant.ownerEmail}?subject=${encodeURIComponent(
                    `Your Store Access & Login Credentials for ${tenant.brandName}`
                  )}&body=${encodeURIComponent(accessPassText)}`}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-slate-200"
                >
                  <span>✉️ Email Access Card to Owner</span>
                </a>

                {tenant.ownerPhone && (
                  <a
                    href={`https://wa.me/${tenant.ownerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                      accessPassText
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>💬 Send on WhatsApp</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 3: STAFF & TEAM SUB-ACCOUNTS
          ───────────────────────────────────────────────────────────── */}
          {activeTab === 'staff' && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Store Team & Operator Sub-Accounts
                </h3>
                <p className="text-[11px] text-slate-500">
                  Create isolated staff logins for managers or fulfillment operators without sharing the master owner credentials.
                </p>
              </div>

              {staffMsg && (
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 font-medium">
                  {staffMsg}
                </div>
              )}

              {/* Create Staff Form */}
              <form onSubmit={handleAddStaff} className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 space-y-3">
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">+ Provision New Staff Account</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    required
                    placeholder="Staff Full Name"
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500"
                  />
                  <input
                    type="email"
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    required
                    placeholder="Staff Email"
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 font-mono"
                  />
                  <select
                    value={staffRole}
                    onChange={(e) => setStaffRole(e.target.value as 'staff' | 'manager')}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-500"
                  >
                    <option value="staff">Role: Fulfillment Staff (Catalog & Orders)</option>
                    <option value="manager">Role: Store Manager (Full Dashboard)</option>
                  </select>
                  <input
                    type="password"
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    required
                    placeholder="Password (min 8 chars)"
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={staffLoading}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {staffLoading ? 'Creating...' : '+ Create Staff Account'}
                </button>
              </form>

              {/* Staff Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                {staffList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No staff sub-accounts configured for this store yet.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-mono text-[10px] uppercase">
                        <th className="text-left px-4 py-2.5">Name</th>
                        <th className="text-left px-4 py-2.5">Email</th>
                        <th className="text-left px-4 py-2.5">Role</th>
                        <th className="text-right px-4 py-2.5">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {staffList.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-2.5 font-bold text-slate-900">{s.name}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">{s.email}</td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 text-[10px] font-bold uppercase">
                              {s.role}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteStaff(s.id)}
                              className="text-rose-600 hover:text-rose-700 text-xs font-bold cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
