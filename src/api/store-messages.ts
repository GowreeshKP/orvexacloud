// --- Storefront contact messages & newsletter (API-backed with local cache) ---

import { API_BASE } from '@/api/base'
import { authService } from '@/api/auth'

export const STORE_INBOX_EVENT = 'orvexa:store-inbox-changed'

export interface StoreMessage {
  id: string
  name: string
  email: string
  phone: string
  subject: string
  message: string
  createdAt: string
  read: boolean
}

export interface NewsletterSubscriber {
  email: string
  subscribedAt: string
}

const MESSAGES_KEY = 'orvexa_store_messages_v1'
const SUBSCRIBERS_KEY = 'orvexa_newsletter_v1'

function emit() {
  try {
    window.dispatchEvent(new Event(STORE_INBOX_EVENT))
  } catch {
    // SSR / non-browser
  }
}

function readLocal<T>(key: string): Record<string, T[]> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') as Record<string, T[]>
  } catch {
    return {}
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable
  }
  emit()
}

async function staffHeaders(): Promise<HeadersInit> {
  const token = await authService.getStoreAccessToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export const storeInbox = {
  getMessages(tenantId: string): StoreMessage[] {
    return readLocal<StoreMessage>(MESSAGES_KEY)[tenantId] || []
  },

  async fetchMessages(slug: string, tenantId: string): Promise<StoreMessage[]> {
    try {
      const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/messages?limit=200`, {
        headers: await staffHeaders(),
      })
      if (!res.ok) throw new Error('load failed')
      const rows = (await res.json()) as StoreMessage[]
      const all = readLocal<StoreMessage>(MESSAGES_KEY)
      all[tenantId] = Array.isArray(rows) ? rows : []
      writeLocal(MESSAGES_KEY, all)
      return all[tenantId]
    } catch {
      return storeInbox.getMessages(tenantId)
    }
  },

  addMessage(tenantId: string, msg: Omit<StoreMessage, 'id' | 'createdAt' | 'read'>): StoreMessage {
    const all = readLocal<StoreMessage>(MESSAGES_KEY)
    const entry: StoreMessage = { ...msg, id: `msg_${Date.now()}`, createdAt: new Date().toISOString(), read: false }
    all[tenantId] = [entry, ...(all[tenantId] || [])]
    writeLocal(MESSAGES_KEY, all)
    return entry
  },

  /** Public storefront contact form — persists on the server for the seller inbox. */
  async submitMessage(
    slug: string,
    tenantId: string,
    msg: Omit<StoreMessage, 'id' | 'createdAt' | 'read'>,
  ): Promise<StoreMessage> {
    const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error((data && typeof data.error === 'string' && data.error) || 'Could not send your message.')
    }
    const entry = data as StoreMessage
    const all = readLocal<StoreMessage>(MESSAGES_KEY)
    all[tenantId] = [entry, ...(all[tenantId] || []).filter((m) => m.id !== entry.id)]
    writeLocal(MESSAGES_KEY, all)
    return entry
  },

  setRead(tenantId: string, id: string, isRead: boolean) {
    const all = readLocal<StoreMessage>(MESSAGES_KEY)
    all[tenantId] = (all[tenantId] || []).map((m) => (m.id === id ? { ...m, read: isRead } : m))
    writeLocal(MESSAGES_KEY, all)
  },

  async setReadRemote(slug: string, tenantId: string, id: string, isRead: boolean) {
    storeInbox.setRead(tenantId, id, isRead)
    try {
      await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/messages/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: await staffHeaders(),
        body: JSON.stringify({ read: isRead }),
      })
    } catch {
      // Keep local optimistic update
    }
  },

  deleteMessage(tenantId: string, id: string) {
    const all = readLocal<StoreMessage>(MESSAGES_KEY)
    all[tenantId] = (all[tenantId] || []).filter((m) => m.id !== id)
    writeLocal(MESSAGES_KEY, all)
  },

  async deleteMessageRemote(slug: string, tenantId: string, id: string) {
    storeInbox.deleteMessage(tenantId, id)
    try {
      await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/messages/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: await staffHeaders(),
      })
    } catch {
      // Keep local delete
    }
  },

  getSubscribers(tenantId: string): NewsletterSubscriber[] {
    return readLocal<NewsletterSubscriber>(SUBSCRIBERS_KEY)[tenantId] || []
  },

  async fetchSubscribers(slug: string, tenantId: string): Promise<NewsletterSubscriber[]> {
    try {
      const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/newsletter`, {
        headers: await staffHeaders(),
      })
      if (!res.ok) throw new Error('load failed')
      const rows = (await res.json()) as NewsletterSubscriber[]
      const all = readLocal<NewsletterSubscriber>(SUBSCRIBERS_KEY)
      all[tenantId] = Array.isArray(rows) ? rows : []
      writeLocal(SUBSCRIBERS_KEY, all)
      return all[tenantId]
    } catch {
      return storeInbox.getSubscribers(tenantId)
    }
  },

  /** Returns false when the email was already subscribed. */
  subscribe(tenantId: string, email: string): boolean {
    const all = readLocal<NewsletterSubscriber>(SUBSCRIBERS_KEY)
    const list = all[tenantId] || []
    const normalized = email.trim().toLowerCase()
    if (list.some((s) => s.email === normalized)) return false
    all[tenantId] = [{ email: normalized, subscribedAt: new Date().toISOString() }, ...list]
    writeLocal(SUBSCRIBERS_KEY, all)
    return true
  },

  async subscribeRemote(slug: string, tenantId: string, email: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/newsletter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error((data && typeof data.error === 'string' && data.error) || 'Could not subscribe.')
    }
    const already = Boolean(data?.alreadySubscribed)
    if (!already) storeInbox.subscribe(tenantId, email)
    return !already
  },

  unsubscribe(tenantId: string, email: string) {
    const all = readLocal<NewsletterSubscriber>(SUBSCRIBERS_KEY)
    all[tenantId] = (all[tenantId] || []).filter((s) => s.email !== email)
    writeLocal(SUBSCRIBERS_KEY, all)
  },

  async unsubscribeRemote(slug: string, tenantId: string, email: string) {
    storeInbox.unsubscribe(tenantId, email)
    try {
      await fetch(`${API_BASE}/stores/${encodeURIComponent(slug)}/newsletter/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: await staffHeaders(),
      })
    } catch {
      // Keep local remove
    }
  },
}
