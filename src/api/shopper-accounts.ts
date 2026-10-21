// Storefront shopper accounts: email verification and login go through the tenant API.
import type { UserAccount } from '@/types'
import { API_BASE } from '@/lib/api-base'

const SESSION_KEY = 'orvexa_shopper_sessions_v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable — sessions simply won't persist.
  }
}

function toUser(s: { name: string; email: string; phone?: string }): UserAccount {
  return { name: s.name, email: s.email, phone: s.phone || '', verified: true }
}

async function shopperFetch(
  slug: string,
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, data }
}

export const shopperAccounts = {
  async startRegister(
    slug: string,
    data: { name: string; email: string; phone: string; password: string }
  ): Promise<{ error?: string; retryAfterSeconds?: number }> {
    try {
      const { ok, data: body } = await shopperFetch(slug, '/shoppers/register', data)
      if (ok) return {}
      return {
        error: String(body.error || 'Could not send the verification email.'),
        retryAfterSeconds: typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined,
      }
    } catch {
      return { error: 'Could not reach the store. Check your connection and try again.' }
    }
  },

  async resendCode(slug: string, email: string): Promise<{ error?: string; retryAfterSeconds?: number }> {
    try {
      const { ok, data: body } = await shopperFetch(slug, '/shoppers/resend', { email })
      if (ok) return {}
      return {
        error: String(body.error || 'Could not resend the code.'),
        retryAfterSeconds: typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined,
      }
    } catch {
      return { error: 'Could not reach the store. Check your connection and try again.' }
    }
  },

  async verify(
    slug: string,
    email: string,
    code: string
  ): Promise<{ user?: UserAccount; error?: string }> {
    try {
      const { ok, data: body } = await shopperFetch(slug, '/shoppers/verify', { email, code })
      const user = body.user && typeof body.user === 'object' ? (body.user as UserAccount) : undefined
      if (ok && user?.email) return { user: toUser(user) }
      return { error: String(body.error || 'Invalid verification code. Please check and try again.') }
    } catch {
      return { error: 'Could not reach the store. Check your connection and try again.' }
    }
  },

  async signIn(slug: string, email: string, password: string): Promise<{ user?: UserAccount; error?: string }> {
    try {
      const { ok, status, data: body } = await shopperFetch(slug, '/shoppers/login', { email, password })
      const user = body.user && typeof body.user === 'object' ? (body.user as UserAccount) : undefined
      if (ok && user?.email) return { user: toUser(user) }
      return {
        error: String(
          body.error ||
            (status === 401 ? 'No account found with this email. Create an account to continue.' : 'Could not sign in.')
        ),
      }
    } catch {
      return { error: 'Could not reach the store. Check your connection and try again.' }
    }
  },

  getSession(tenantId: string): UserAccount | null {
    return readJson<Record<string, UserAccount>>(SESSION_KEY, {})[tenantId] || null
  },

  setSession(tenantId: string, user: UserAccount | null) {
    const all = readJson<Record<string, UserAccount>>(SESSION_KEY, {})
    if (user) all[tenantId] = user
    else delete all[tenantId]
    writeJson(SESSION_KEY, all)
  },
}
