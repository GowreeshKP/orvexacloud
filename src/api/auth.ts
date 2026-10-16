// --- Authentication Service ---
// Handles login, session management, credential verification, and store owner password management.
// Backed by the Orvexa Tech backend API with automatic synchronization across local storage.

import type { TenantConfig } from '@/types/tenant'
import { MOCK_TENANTS } from '@/data/mock-tenants'
import { mockStore } from '@/api/mock-store'
import { auditLogger } from '@/api/audit-logger'

export interface SellerSession {
  userId: string
  name: string
  email: string
  role: 'seller'
  tenantId: string
  tenantSlug: string
  brandName: string
  loginTime: string
}

export interface AdminSession {
  userId: string
  name: string
  email: string
  role: 'super_admin'
  loginTime: string
}

export interface StoreCredentialInfo {
  loginId: string
  password: string
  tenantSlug: string
  tenantName: string
  ownerName: string
  roleLabel: string
  updatedAt?: string
  isPasswordRevoked?: boolean
  passwordResetPending?: boolean
  resetToken?: string
  resetUrl?: string
  resetRequestedAt?: string
}

// Initial demo credentials
export const DEFAULT_DEMO_SELLER_CREDENTIALS: StoreCredentialInfo[] = [
  {
    loginId: 'gowreesh@thelunarclothing.com',
    password: 'lunar@password',
    tenantSlug: 'lunar',
    tenantName: 'The Lunar Clothing',
    ownerName: 'Gowreesh KP',
    roleLabel: 'Store Owner',
  },
  {
    loginId: 'kavya@silkhaus.in',
    password: 'silk@password',
    tenantSlug: 'silkhaus',
    tenantName: 'Silk Haus',
    ownerName: 'Kavya Menon',
    roleLabel: 'Store Owner',
  },
  {
    loginId: 'arjun@khadistudio.co',
    password: 'khadi@password',
    tenantSlug: 'khadistudio',
    tenantName: 'Khadi Studio',
    ownerName: 'Arjun Patel',
    roleLabel: 'Store Owner',
  },
  {
    loginId: 'kavita@bloomweave.in',
    password: 'bloom@password',
    tenantSlug: 'bloomweave',
    tenantName: 'Bloom & Weave',
    ownerName: 'Kavita Reddy',
    roleLabel: 'Store Owner',
  },
]

export const DEMO_ADMIN_CREDENTIAL = {
  loginId: 'admin@orvexatech.com',
  password: 'admin@password',
  name: 'Orvexa Tech Super Admin',
  role: 'super_admin',
}

const SELLER_SESSION_KEY = 'lunar_seller_session'
const ADMIN_SESSION_KEY = 'lunar_admin_session'
const SELLER_TOKEN_KEY = 'lunar_seller_token'
const ADMIN_TOKEN_KEY = 'lunar_admin_token'

/** Stores a sign-in token and tells the store provider that someone signed in, so it can re-load the store with the token
 *  (owners and admins then receive their private details). Not used for silent token refreshes. */
function saveSignInToken(key: string, token: string): void {
  localStorage.setItem(key, token)
  window.dispatchEvent(new Event('orvexa:store-updated'))
}
function clearSignInToken(key: string): void {
  localStorage.removeItem(key)
  window.dispatchEvent(new Event('orvexa:store-updated'))
}
const STORE_CREDENTIALS_KEY = 'orvexa_store_credentials_v1'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

/**
 * Offline demo mode: local credential fallbacks and the browser-only credentials registry.
 * On in `vite dev`; production builds only enable it with VITE_DEMO_MODE=true. Outside demo
 * mode the backend is the only authority and no passwords are kept in the browser.
 */
export const DEMO_MODE = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true'

function getStoredCredentialsMap(): Record<string, StoreCredentialInfo> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {}
    const raw = localStorage.getItem(STORE_CREDENTIALS_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.warn('Failed to read stored credentials map', e)
  }
  return {}
}

function saveStoredCredentialsMap(map: Record<string, StoreCredentialInfo>): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const safe = DEMO_MODE
        ? map
        : Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { ...v, password: '', resetToken: undefined, resetUrl: undefined }]))
      localStorage.setItem(STORE_CREDENTIALS_KEY, JSON.stringify(safe))
      window.dispatchEvent(new CustomEvent('orvexa:credentials-updated', { detail: map }))
    }
  } catch (e) {
    console.warn('Failed to save stored credentials map', e)
  }
}

function isTokenExpired(token: string | null): boolean {
  if (!token) return true
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(decodeURIComponent(atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')))
    if (!payload.exp) return false
    return Date.now() >= (payload.exp * 1000 - 30000)
  } catch {
    return true
  }
}

export const authService = {
  // ─────────────────────────────────────────────────────────
  // STORE CREDENTIALS REGISTRY
  // ─────────────────────────────────────────────────────────
  getStoreCredentialsList(): StoreCredentialInfo[] {
    const customMap = getStoredCredentialsMap()
    const allTenants = mockStore.getAllTenants()

    // Build unified credentials list
    const result: StoreCredentialInfo[] = []
    const seenSlugs = new Set<string>()

    // 1. Process all known tenants
    for (const tenant of allTenants) {
      seenSlugs.add(tenant.slug)
      const custom = customMap[tenant.slug]
      if (custom) {
        result.push(custom)
      } else {
        const demo = DEFAULT_DEMO_SELLER_CREDENTIALS.find((d) => d.tenantSlug === tenant.slug)
        result.push({
          loginId: tenant.ownerEmail || (demo?.loginId ?? `${tenant.slug}@store.com`),
          password: DEMO_MODE ? demo?.password || `${tenant.slug}@password` : '',
          tenantSlug: tenant.slug,
          tenantName: tenant.brandName || tenant.name || 'Store',
          ownerName: tenant.ownerName || 'Store Owner',
          roleLabel: 'Store Owner',
        })
      }
    }

    // 2. Add any custom items not yet in tenants
    for (const [slug, cred] of Object.entries(customMap)) {
      if (!seenSlugs.has(slug)) {
        result.push(cred)
      }
    }

    return result
  },

  getStoreCredential(slug: string): StoreCredentialInfo {
    const list = this.getStoreCredentialsList()
    const found = list.find((c) => c.tenantSlug.toLowerCase() === slug.toLowerCase())
    if (found) return found

    const tenant = mockStore.getTenantBySlug(slug)
    return {
      loginId: tenant?.ownerEmail || `${slug}@store.com`,
      password: DEMO_MODE ? `${slug}@password` : '',
      tenantSlug: slug,
      tenantName: tenant?.brandName || slug,
      ownerName: tenant?.ownerName || 'Store Owner',
      roleLabel: 'Store Owner',
    }
  },

  // ─────────────────────────────────────────────────────────
  // SUPER ADMIN: TRIGGER PASSWORD RESET EMAIL & REVOKE OLD PASSWORD
  // ─────────────────────────────────────────────────────────
  async triggerStorePasswordReset(
    tenantSlug: string,
    email?: string
  ): Promise<{
    success: boolean
    message: string
    resetToken: string
    resetUrl: string
    ownerEmail: string
    error?: string
  }> {
    const slug = tenantSlug.trim().toLowerCase()
    let token = await this.getValidAdminToken()
    let backendData: any = null

    try {
      let res = await fetch(`${API_BASE}/admin/tenants/${slug}/trigger-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email }),
      })

      if (res.status === 401) {
        token = await this.refreshAdminToken()
        if (token) {
          res = await fetch(`${API_BASE}/admin/tenants/${slug}/trigger-password-reset`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ email }),
          })
        }
      }

      if (res.ok) {
        backendData = await res.json()
      } else if (!DEMO_MODE) {
        const err = await res.json().catch(() => ({}))
        const message = err.error || 'The password reset could not be started.'
        return { success: false, message, error: message, resetToken: '', resetUrl: '', ownerEmail: '' }
      }
    } catch (err) {
      if (!DEMO_MODE) {
        const message = 'Could not reach the server. The password was not reset.'
        return { success: false, message, error: message, resetToken: '', resetUrl: '', ownerEmail: '' }
      }
      console.warn('Backend trigger-password-reset offline, running demo fallback:', err)
    }

    const customMap = getStoredCredentialsMap()
    const prev = customMap[slug] || this.getStoreCredential(slug)
    const targetEmail = backendData?.ownerEmail || (email ? email.trim().toLowerCase() : prev.loginId)

    // Only demo mode invents a local token; real links come from the backend (single-use, hashed server-side).
    const resetToken = backendData?.resetToken || `demo_${crypto.randomUUID()}`
    const resetUrl =
      backendData?.resetUrl || `${window.location.origin}/?reset_token=${resetToken}&slug=${slug}`

    // Immediately revoke current password in local credentials store
    customMap[slug] = {
      ...prev,
      loginId: targetEmail,
      password: `REVOKED_RESET_REQUIRED_${Date.now()}`,
      isPasswordRevoked: true,
      passwordResetPending: true,
      resetToken,
      resetUrl,
      resetRequestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    saveStoredCredentialsMap(customMap)

    auditLogger.log({
      actorId: 'admin_master_001',
      actorName: 'Super Admin',
      actorRole: 'super_admin',
      tenantSlug: slug,
      tenantName: prev.tenantName,
      action: 'STORE_PASSWORD_RESET_DISPATCHED',
      category: 'security',
      severity: 'security',
      details: `Password reset dispatched to ${targetEmail} for store "${prev.tenantName}". Old password was immediately revoked.`,
      metadata: { slug, email: targetEmail },
    })

    return {
      success: true,
      message: backendData?.message || `Password reset email dispatched to ${targetEmail}. Previous password has been revoked immediately.`,
      resetToken,
      resetUrl,
      ownerEmail: targetEmail,
    }
  },

  // ─────────────────────────────────────────────────────────
  // COMPLETE PASSWORD RESET VIA EMAIL LINK / TOKEN
  // ─────────────────────────────────────────────────────────
  async completePasswordReset(
    tenantSlug: string,
    resetToken: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const slug = tenantSlug.trim().toLowerCase()

    try {
      const res = await fetch(`${API_BASE}/auth/seller/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug: slug, resetToken, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { success: false, message: data.error || 'Failed to reset password.', error: data.error || 'Failed to reset password.' }
      }
    } catch {
      if (!DEMO_MODE) {
        const message = 'Could not reach the server. Please try again.'
        return { success: false, message, error: message }
      }
    }

    const customMap = getStoredCredentialsMap()
    const prev = customMap[slug] || this.getStoreCredential(slug)
    customMap[slug] = {
      ...prev,
      password: newPassword,
      isPasswordRevoked: false,
      passwordResetPending: false,
      resetToken: undefined,
      resetUrl: undefined,
      resetRequestedAt: undefined,
      updatedAt: new Date().toISOString(),
    }
    saveStoredCredentialsMap(customMap)

    auditLogger.log({
      actorId: `usr_${slug}`,
      actorName: prev.ownerName,
      actorRole: 'seller',
      tenantSlug: slug,
      tenantName: prev.tenantName,
      action: 'STORE_PASSWORD_RESET_COMPLETED',
      category: 'security',
      severity: 'security',
      details: `Store owner successfully reset their password via email reset token for ${prev.tenantName}.`,
      metadata: { slug, email: prev.loginId },
    })

    return {
      success: true,
      message: 'Password successfully updated! You can now log in with your new password.',
    }
  },

  // ─────────────────────────────────────────────────────────
  // SUPER ADMIN: UPDATE STORE PROFILE INFO (NAME, EMAIL, PHONE, SLUG)
  // ─────────────────────────────────────────────────────────
  async updateStoreCredentialsAdmin(
    tenantSlug: string,
    updates: {
      ownerEmail?: string
      ownerName?: string
      ownerPhone?: string
      newPassword?: string
      newSlug?: string
    }
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const slug = tenantSlug.trim().toLowerCase()
    let token = await this.getValidAdminToken()

    // 1. Update remote backend API if reachable
    try {
      let response = await fetch(`${API_BASE}/admin/tenants/${slug}/credentials`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(updates),
      })

      if (response.status === 401) {
        token = await this.refreshAdminToken()
        if (token) {
          response = await fetch(`${API_BASE}/admin/tenants/${slug}/credentials`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(updates),
          })
        }
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        if (!DEMO_MODE) {
          const message = errData.error || 'Failed to update credentials.'
          return { success: false, message, error: message }
        }
        console.warn('Backend credentials update returned error:', errData.error)
      }
    } catch {
      if (!DEMO_MODE) {
        const message = 'Could not reach the server. Nothing was changed.'
        return { success: false, message, error: message }
      }
    }

    // 2. Update local mockStore
    const targetSlug = updates.newSlug ? updates.newSlug.trim().toLowerCase() : slug
    const tenant = mockStore.getTenantBySlug(slug)
    if (tenant) {
      mockStore.updateTenant(tenant.id, {
        ...(updates.ownerEmail ? { ownerEmail: updates.ownerEmail.trim().toLowerCase() } : {}),
        ...(updates.ownerName ? { ownerName: updates.ownerName.trim() } : {}),
        ...(updates.ownerPhone !== undefined ? { ownerPhone: updates.ownerPhone } : {}),
        ...(updates.newSlug ? { slug: targetSlug } : {}),
      })
    }

    // 3. Save to local credentials registry
    const customMap = getStoredCredentialsMap()
    const prev = customMap[slug] || this.getStoreCredential(slug)
    const updatedCred: StoreCredentialInfo = {
      ...prev,
      loginId: updates.ownerEmail ? updates.ownerEmail.trim().toLowerCase() : prev.loginId,
      ownerName: updates.ownerName ? updates.ownerName.trim() : prev.ownerName,
      password: updates.newPassword ? updates.newPassword.trim() : prev.password,
      tenantSlug: targetSlug,
      tenantName: tenant?.brandName || prev.tenantName,
      updatedAt: new Date().toISOString(),
    }

    if (updates.newSlug && updates.newSlug !== slug) {
      delete customMap[slug]
    }
    customMap[targetSlug] = updatedCred
    saveStoredCredentialsMap(customMap)

    // Log security audit event
    auditLogger.log({
      actorId: 'admin_master_001',
      actorName: 'Super Admin',
      actorRole: 'super_admin',
      tenantSlug: targetSlug,
      tenantName: updatedCred.tenantName,
      action: 'STORE_CREDENTIALS_RESET_BY_ADMIN',
      category: 'security',
      severity: 'security',
      details: `Super Admin updated login credentials for ${updatedCred.tenantName} (${targetSlug}) — Login Email: ${updatedCred.loginId}.`,
      metadata: { targetSlug, ownerEmail: updatedCred.loginId, passwordChanged: !!updates.newPassword },
    })

    return {
      success: true,
      message: `Credentials updated successfully for ${updatedCred.tenantName}!`,
    }
  },

  // ─────────────────────────────────────────────────────────
  // STORE OWNER: SELF-SERVICE CHANGE PASSWORD & EMAIL
  // ─────────────────────────────────────────────────────────
  async changeSellerPassword(
    tenantSlug: string,
    params: {
      currentPassword?: string
      newPassword: string
      newEmail?: string
      ownerName?: string
    }
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const slug = tenantSlug.trim().toLowerCase()

    if (!params.newPassword || params.newPassword.length < 8) {
      return { success: false, message: 'Password must be at least 8 characters.', error: 'Password too short' }
    }

    if (DEMO_MODE && params.currentPassword !== undefined) {
      const stored = getStoredCredentialsMap()[slug] || this.getStoreCredential(slug)
      if (stored.password !== params.currentPassword.trim()) {
        return {
          success: false,
          message: 'Current password is incorrect. Please try again.',
          error: 'Current password is incorrect',
        }
      }
    }

    // 1. Attempt backend update
    try {
      const response = await fetch(`${API_BASE}/auth/seller/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          currentPassword: params.currentPassword,
          newPassword: params.newPassword,
        }),
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        if (!DEMO_MODE || errData.error?.includes('Current password')) {
          const message = errData.error || 'Failed to update password.'
          return { success: false, message, error: message }
        }
      }
    } catch {
      if (!DEMO_MODE) {
        const message = 'Could not reach the server. Your password was not changed.'
        return { success: false, message, error: message }
      }
    }

    // 2. Update local mockStore
    const tenant = mockStore.getTenantBySlug(slug)
    if (tenant) {
      mockStore.updateTenant(tenant.id, {
        ...(params.newEmail ? { ownerEmail: params.newEmail.trim().toLowerCase() } : {}),
        ...(params.ownerName ? { ownerName: params.ownerName.trim() } : {}),
      })
    }

    // 3. Update local credentials store
    const customMap = getStoredCredentialsMap()
    const prev = customMap[slug] || this.getStoreCredential(slug)
    customMap[slug] = {
      ...prev,
      password: params.newPassword.trim(),
      loginId: params.newEmail ? params.newEmail.trim().toLowerCase() : prev.loginId,
      ownerName: params.ownerName ? params.ownerName.trim() : prev.ownerName,
      updatedAt: new Date().toISOString(),
    }
    saveStoredCredentialsMap(customMap)

    // Log security audit event
    auditLogger.log({
      actorId: `usr_${slug}`,
      actorName: params.ownerName || prev.ownerName,
      actorRole: 'seller',
      tenantSlug: slug,
      tenantName: prev.tenantName,
      action: 'STORE_PASSWORD_CHANGED',
      category: 'security',
      severity: 'security',
      details: `Store Owner changed dashboard access password and updated profile email to ${params.newEmail || prev.loginId}.`,
      metadata: { slug, email: params.newEmail || prev.loginId },
    })

    return {
      success: true,
      message: 'Password successfully updated! Your new credentials are now active.',
    }
  },

  // ─────────────────────────────────────────────────────────
  // SELLER LOGIN
  // ─────────────────────────────────────────────────────────
  async loginSeller(
    loginId: string,
    password: string
  ): Promise<{ success: boolean; session?: SellerSession; error?: string }> {
    const cleanId = loginId.trim().toLowerCase()
    const cleanPass = password.trim()

    try {
      const response = await fetch(`${API_BASE}/auth/seller/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: cleanId, password: cleanPass }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Backend unavailable')
      }

      const session: SellerSession = data.session
      try {
        localStorage.setItem(SELLER_SESSION_KEY, JSON.stringify(session))
        const token = data.accessToken || data.token
        if (token) saveSignInToken(SELLER_TOKEN_KEY, token)
        if (data.refreshToken) localStorage.setItem('orvexa_refresh_token', data.refreshToken)
      } catch {
        // storage disabled
      }

      auditLogger.log({
        actorId: session.userId,
        actorName: session.name,
        actorRole: 'seller',
        tenantSlug: session.tenantSlug,
        tenantName: session.brandName,
        action: 'SELLER_LOGIN_SUCCESS',
        category: 'auth',
        severity: 'info',
        details: `Merchant ${session.name} logged into dashboard for ${session.brandName}.`,
      })

      return { success: true, session }
    } catch (err: any) {
      if (!DEMO_MODE) {
        return { success: false, error: err.message || 'Invalid login ID or password.' }
      }
      // ── Demo mode: offline credential verification ──────────
      const allCreds = this.getStoreCredentialsList()

      const matchingAccount = allCreds.find(
        (c) => c.loginId.toLowerCase() === cleanId || c.tenantSlug.toLowerCase() === cleanId
      )

      if (
        matchingAccount &&
        (matchingAccount.isPasswordRevoked ||
          matchingAccount.passwordResetPending ||
          matchingAccount.password.startsWith('REVOKED_'))
      ) {
        return {
          success: false,
          error: `Your password was reset by an administrator. Please check your email (${matchingAccount.loginId}) and use the reset link to create a new password.`,
        }
      }

      const foundCred = allCreds.find(
        (c) =>
          (c.loginId.toLowerCase() === cleanId || c.tenantSlug.toLowerCase() === cleanId) &&
          c.password === cleanPass
      )

      if (foundCred) {
        const tenant: TenantConfig | null = mockStore.getTenantBySlug(foundCred.tenantSlug) ||
          MOCK_TENANTS.find((t) => t.slug === foundCred.tenantSlug) || null

        const session: SellerSession = {
          userId: `usr_${foundCred.tenantSlug}_session`,
          name: foundCred.ownerName,
          email: foundCred.loginId,
          role: 'seller',
          tenantId: tenant?.id || `tenant_${foundCred.tenantSlug}`,
          tenantSlug: foundCred.tenantSlug,
          brandName: foundCred.tenantName,
          loginTime: new Date().toISOString(),
        }
        try {
          localStorage.setItem(SELLER_SESSION_KEY, JSON.stringify(session))
        } catch {
          // ignored
        }

        auditLogger.log({
          actorId: session.userId,
          actorName: session.name,
          actorRole: 'seller',
          tenantSlug: session.tenantSlug,
          tenantName: session.brandName,
          action: 'SELLER_LOGIN_SUCCESS',
          category: 'auth',
          severity: 'info',
          details: `Merchant ${session.name} logged into dashboard for ${session.brandName}.`,
        })

        return { success: true, session }
      }

      return {
        success: false,
        error: err.message?.includes('Backend unavailable')
          ? 'Invalid login ID or password. Please check the credentials.'
          : (err.message || 'Invalid Login ID or password.'),
      }
    }
  },

  getSellerSession(): SellerSession | null {
    try {
      const stored = localStorage.getItem(SELLER_SESSION_KEY)
      if (stored) {
        return JSON.parse(stored) as SellerSession
      }
    } catch {
      return null
    }
    return null
  },

  getSellerToken(): string | null {
    try {
      return localStorage.getItem(SELLER_TOKEN_KEY)
    } catch {
      return null
    }
  },

  logoutSeller() {
    try {
      localStorage.removeItem(SELLER_SESSION_KEY)
      clearSignInToken(SELLER_TOKEN_KEY)
    } catch {
      // ignored
    }
  },

  // ─────────────────────────────────────────────────────────
  // UNIFIED COMMON LOGIN (Super Admin / Merchant / Staff)
  // ─────────────────────────────────────────────────────────
  async loginCommon(
    loginId: string,
    password: string
  ): Promise<{ success: boolean; session?: any; error?: string }> {
    const cleanId = loginId.trim().toLowerCase()
    const cleanPass = password.trim()

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: cleanId, password: cleanPass }),
      })

      const data = await response.json()
      if (response.ok && data.success && data.session) {
        if (data.session.role === 'super_admin') {
          try {
            localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(data.session))
            const token = data.accessToken || data.token
            if (token) saveSignInToken(ADMIN_TOKEN_KEY, token)
            if (data.refreshToken) localStorage.setItem('orvexa_refresh_token', data.refreshToken)
          } catch {}
        } else {
          try {
            localStorage.setItem(SELLER_SESSION_KEY, JSON.stringify(data.session))
            const token = data.accessToken || data.token
            if (token) saveSignInToken(SELLER_TOKEN_KEY, token)
            if (data.refreshToken) localStorage.setItem('orvexa_refresh_token', data.refreshToken)
          } catch {}
        }
        return { success: true, session: data.session }
      }
      if (!DEMO_MODE) {
        return { success: false, error: data.error || 'Invalid login credentials. Please check your email or password.' }
      }
    } catch {
      if (!DEMO_MODE) {
        return { success: false, error: 'Could not reach the authentication server. Please check your connection.' }
      }
    }

    // Try Admin Credentials Fallback
    const adminRes = await this.loginAdmin(cleanId, cleanPass)
    if (adminRes.success && adminRes.session) return adminRes

    // Try Seller Credentials Fallback
    const sellerRes = await this.loginSeller(cleanId, cleanPass)
    if (sellerRes.success && sellerRes.session) return sellerRes

    return {
      success: false,
      error: 'Invalid login credentials. Please check your email or password.',
    }
  },

  // ─────────────────────────────────────────────────────────
  // ADMIN AUTH
  // ─────────────────────────────────────────────────────────
  async loginAdmin(
    loginId: string,
    password: string
  ): Promise<{ success: boolean; session?: AdminSession; error?: string; retryAfterSeconds?: number; locked?: boolean }> {
    const cleanId = loginId.trim().toLowerCase()
    const cleanPass = password.trim()

    try {
      const response = await fetch(`${API_BASE}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: cleanId, password: cleanPass }),
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Invalid Super Admin credentials.',
          retryAfterSeconds: data.retryAfterSeconds,
          locked: Boolean(data.locked),
        }
      }

      const session: AdminSession = data.session
      try {
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session))
        const token = data.accessToken || data.token
        if (token) {
          saveSignInToken(ADMIN_TOKEN_KEY, token)
        }
        if (data.refreshToken) {
          localStorage.setItem('orvexa_refresh_token', data.refreshToken)
        }
      } catch {
        // storage disabled
      }

      return { success: true, session }
    } catch (err: any) {
      // ── Demo mode only: offline admin login ──────────────
      const isDemo =
        DEMO_MODE &&
        (cleanId === 'admin@orvexatech.com' || cleanId === 'admin@platform.com' || cleanId === 'admin') &&
        cleanPass === DEMO_ADMIN_CREDENTIAL.password

      if (isDemo) {
        const session: AdminSession = {
          userId: 'admin_master_001',
          name: DEMO_ADMIN_CREDENTIAL.name,
          email: cleanId.includes('@') ? cleanId : 'admin@orvexatech.com',
          role: 'super_admin',
          loginTime: new Date().toISOString(),
        }
        try {
          localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session))
        } catch {
          // ignored
        }
        return { success: true, session }
      }

      return {
        success: false,
        error: err.message?.includes('Backend unavailable')
          ? 'Could not reach the authentication server. Please check your connection.'
          : (err.message || 'Invalid Super Admin credentials.'),
      }
    }
  },

  getAdminSession(): AdminSession | null {
    try {
      const stored = localStorage.getItem(ADMIN_SESSION_KEY)
      if (stored) {
        return JSON.parse(stored) as AdminSession
      }
    } catch {
      return null
    }
    return null
  },

  getAdminToken(): string | null {
    try {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY)
      if (token && isTokenExpired(token)) {
        // Asynchronously renew expired token in the background
        this.refreshAdminToken()
      }
      return token
    } catch {
      return null
    }
  },

  async refreshAdminToken(): Promise<string | null> {
    try {
      const storedRefresh = typeof window !== 'undefined' ? localStorage.getItem('orvexa_refresh_token') : null
      if (storedRefresh) {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: storedRefresh }),
        })
        if (res.ok) {
          const data = await res.json()
          const newToken = data.accessToken || data.token
          if (newToken) {
            localStorage.setItem(ADMIN_TOKEN_KEY, newToken)
            if (data.refreshToken) localStorage.setItem('orvexa_refresh_token', data.refreshToken)
            return newToken
          }
        }
      }
    } catch {
      // refresh failed
    }

    // Never fall back to logging in with stored or demo credentials: a session that cannot be
    // refreshed must sign in again.
    return null
  },

  async getValidAdminToken(): Promise<string | null> {
    let token = this.getAdminToken()
    if (!token || isTokenExpired(token)) {
      token = await this.refreshAdminToken()
    }
    return token
  },

  logoutAdmin() {
    try {
      localStorage.removeItem(ADMIN_SESSION_KEY)
      clearSignInToken(ADMIN_TOKEN_KEY)
    } catch {
      // ignored
    }
  },
}

// Backward compatibility alias
export const DEMO_SELLER_CREDENTIALS = DEFAULT_DEMO_SELLER_CREDENTIALS

