// --- Storefront shopper accounts (per tenant, persisted in localStorage) ---
import type { UserAccount } from '@/types'

const ACCOUNTS_KEY = 'orvexa_shoppers_v1'
const SESSION_KEY = 'orvexa_shopper_sessions_v1'

interface StoredShopper {
  name: string
  email: string
  phone: string
  passwordHash: string
  createdAt: string
}

/** Demo shopper that only exists on the original Lunar-style demo stores. */
export const DEMO_SHOPPER = {
  name: 'Priya Sharma',
  email: 'priya.sharma@example.com',
  phone: '+91 98765 43210',
  password: 'lunar123',
}

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
    // Storage full or unavailable — accounts simply won't persist.
  }
}

async function hashPassword(email: string, password: string): Promise<string> {
  const input = `${email.toLowerCase()}::${password}`
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  let h = 5381
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0
  return `djb2_${(h >>> 0).toString(16)}`
}

function getAccounts(tenantId: string): StoredShopper[] {
  return readJson<Record<string, StoredShopper[]>>(ACCOUNTS_KEY, {})[tenantId] || []
}

function toUser(s: { name: string; email: string; phone: string }): UserAccount {
  return { name: s.name, email: s.email, phone: s.phone, verified: true }
}

export const shopperAccounts = {
  emailExists(tenantId: string, email: string, allowDemo: boolean): boolean {
    const e = email.trim().toLowerCase()
    if (allowDemo && e === DEMO_SHOPPER.email) return true
    return getAccounts(tenantId).some((a) => a.email.toLowerCase() === e)
  },

  async register(
    tenantId: string,
    data: { name: string; email: string; phone: string; password: string },
    allowDemo: boolean
  ): Promise<{ user?: UserAccount; error?: string }> {
    const email = data.email.trim().toLowerCase()
    if (this.emailExists(tenantId, email, allowDemo)) {
      return { error: 'An account with this email already exists. Please sign in instead.' }
    }
    const all = readJson<Record<string, StoredShopper[]>>(ACCOUNTS_KEY, {})
    const shopper: StoredShopper = {
      name: data.name.trim(),
      email,
      phone: data.phone.trim(),
      passwordHash: await hashPassword(email, data.password),
      createdAt: new Date().toISOString(),
    }
    all[tenantId] = [...(all[tenantId] || []), shopper]
    writeJson(ACCOUNTS_KEY, all)
    return { user: toUser(shopper) }
  },

  async signIn(tenantId: string, email: string, password: string, allowDemo: boolean): Promise<UserAccount | null> {
    const e = email.trim().toLowerCase()
    if (allowDemo && e === DEMO_SHOPPER.email && password === DEMO_SHOPPER.password) return toUser(DEMO_SHOPPER)
    const account = getAccounts(tenantId).find((a) => a.email.toLowerCase() === e)
    if (!account) return null
    return account.passwordHash === (await hashPassword(e, password)) ? toUser(account) : null
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
