// Storefront contact messages & newsletter subscribers.
// Writes go to the tenant database when the API is up, with a slug-keyed localStorage
// fallback so demo / offline still collects emails. Reads merge API + local, including
// older buckets keyed by tenant id.

import { API_BASE } from '@/lib/api-base'
import { authService } from '@/api/auth'

const MESSAGES_KEY = 'orvexa_store_messages_v1'
const SUBSCRIBERS_KEY = 'orvexa_newsletter_v1'
export const STORE_INBOX_EVENT = 'orvexa:store-inbox-changed'

export type SubscriberSource = 'newsletter' | 'contact' | 'account' | 'checkout'

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
  source?: SubscriberSource
}

export type TenantInboxKey = { slug?: string; id?: string } | string

function keysOf(tenant: TenantInboxKey): string[] {
  if (typeof tenant === 'string') return tenant ? [tenant] : []
  return [...new Set([tenant.slug, tenant.id].filter((k): k is string => Boolean(k)))]
}

function primaryKey(tenant: TenantInboxKey): string {
  return keysOf(tenant)[0] || ''
}

function read<T>(key: string): Record<string, T[]> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') as Record<string, T[]>
  } catch {
    return {}
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable — nothing to persist to.
  }
  window.dispatchEvent(new Event(STORE_INBOX_EVENT))
}

function mergedLocal<T>(storageKey: string, tenant: TenantInboxKey, idOf: (item: T) => string): T[] {
  const all = read<T>(storageKey)
  const seen = new Set<string>()
  const out: T[] = []
  for (const bucket of keysOf(tenant)) {
    for (const item of all[bucket] || []) {
      const id = idOf(item)
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(item)
    }
  }
  return out
}

async function sellerHeaders(): Promise<Record<string, string>> {
  return authService.sellerAuthHeaders()
}

async function apiJson<T>(method: string, path: string, body?: unknown, auth = false): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: auth ? await sellerHeaders() : { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) return null
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  } catch {
    return null
  }
}

function mergeMessages(remote: StoreMessage[], local: StoreMessage[]): StoreMessage[] {
  const byId = new Map<string, StoreMessage>()
  for (const m of local) byId.set(m.id, m)
  for (const m of remote) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

function mergeSubscribers(remote: NewsletterSubscriber[], local: NewsletterSubscriber[]): NewsletterSubscriber[] {
  const byEmail = new Map<string, NewsletterSubscriber>()
  for (const s of local) byEmail.set(s.email.toLowerCase(), s)
  for (const s of remote) byEmail.set(s.email.toLowerCase(), { ...byEmail.get(s.email.toLowerCase()), ...s })
  return [...byEmail.values()].sort((a, b) => Date.parse(b.subscribedAt) - Date.parse(a.subscribedAt))
}

export const storeInbox = {
  getMessages(tenant: TenantInboxKey): StoreMessage[] {
    return mergedLocal<StoreMessage>(MESSAGES_KEY, tenant, (m) => m.id)
  },

  addMessage(tenant: TenantInboxKey, msg: Omit<StoreMessage, 'id' | 'createdAt' | 'read'>): StoreMessage {
    const key = primaryKey(tenant)
    const all = read<StoreMessage>(MESSAGES_KEY)
    const entry: StoreMessage = { ...msg, id: `msg_${Date.now()}`, createdAt: new Date().toISOString(), read: false }
    if (key) {
      all[key] = [entry, ...(all[key] || [])]
      write(MESSAGES_KEY, all)
    }
    storeInbox.subscribe(tenant, msg.email, 'contact')
    const slug = typeof tenant === 'string' ? tenant : tenant.slug
    if (slug) {
      void apiJson<StoreMessage>('POST', `/stores/${encodeURIComponent(slug)}/contact`, {
        name: msg.name,
        email: msg.email,
        phone: msg.phone,
        subject: msg.subject,
        message: msg.message,
      }).then((saved) => {
        if (!saved?.id || !key) return
        const latest = read<StoreMessage>(MESSAGES_KEY)
        latest[key] = (latest[key] || []).map((m) => (m.id === entry.id ? saved : m))
        write(MESSAGES_KEY, latest)
      })
    }
    return entry
  },

  setRead(tenant: TenantInboxKey, id: string, isRead: boolean) {
    const all = read<StoreMessage>(MESSAGES_KEY)
    for (const key of keysOf(tenant)) {
      all[key] = (all[key] || []).map((m) => (m.id === id ? { ...m, read: isRead } : m))
    }
    write(MESSAGES_KEY, all)
    const slug = typeof tenant === 'string' ? tenant : tenant.slug
    if (slug) {
      void apiJson('PATCH', `/stores/${encodeURIComponent(slug)}/inbox/messages/${encodeURIComponent(id)}`, { read: isRead }, true)
    }
  },

  deleteMessage(tenant: TenantInboxKey, id: string) {
    const all = read<StoreMessage>(MESSAGES_KEY)
    for (const key of keysOf(tenant)) {
      all[key] = (all[key] || []).filter((m) => m.id !== id)
    }
    write(MESSAGES_KEY, all)
    const slug = typeof tenant === 'string' ? tenant : tenant.slug
    if (slug) {
      void apiJson('DELETE', `/stores/${encodeURIComponent(slug)}/inbox/messages/${encodeURIComponent(id)}`, undefined, true)
    }
  },

  getSubscribers(tenant: TenantInboxKey): NewsletterSubscriber[] {
    return mergedLocal<NewsletterSubscriber>(SUBSCRIBERS_KEY, tenant, (s) => s.email.toLowerCase())
  },

  /** Returns false when the email was already subscribed. */
  subscribe(tenant: TenantInboxKey, email: string, source: SubscriberSource = 'newsletter'): boolean {
    const key = primaryKey(tenant)
    const all = read<NewsletterSubscriber>(SUBSCRIBERS_KEY)
    const list = key ? all[key] || [] : []
    const normalized = email.trim().toLowerCase()
    if (!normalized) return false
    const alreadyLocal = keysOf(tenant).some((bucket) => (all[bucket] || []).some((s) => s.email === normalized))
    if (!alreadyLocal && key) {
      all[key] = [{ email: normalized, subscribedAt: new Date().toISOString(), source }, ...list]
      write(SUBSCRIBERS_KEY, all)
    }
    const slug = typeof tenant === 'string' ? tenant : tenant.slug
    if (slug) {
      void apiJson('POST', `/stores/${encodeURIComponent(slug)}/newsletter`, { email: normalized, source })
    }
    return !alreadyLocal
  },

  unsubscribe(tenant: TenantInboxKey, email: string) {
    const normalized = email.trim().toLowerCase()
    const all = read<NewsletterSubscriber>(SUBSCRIBERS_KEY)
    for (const key of keysOf(tenant)) {
      all[key] = (all[key] || []).filter((s) => s.email !== normalized)
    }
    write(SUBSCRIBERS_KEY, all)
    const slug = typeof tenant === 'string' ? tenant : tenant.slug
    if (slug) {
      void apiJson('DELETE', `/stores/${encodeURIComponent(slug)}/inbox/subscribers`, { email: normalized }, true)
    }
  },

  async loadInbox(tenant: TenantInboxKey): Promise<{ messages: StoreMessage[]; subscribers: NewsletterSubscriber[] }> {
    const localMessages = storeInbox.getMessages(tenant)
    const localSubscribers = storeInbox.getSubscribers(tenant)
    const slug = typeof tenant === 'string' ? tenant : tenant.slug
    if (!slug) return { messages: localMessages, subscribers: localSubscribers }
    const remote = await apiJson<{ messages: StoreMessage[]; subscribers: NewsletterSubscriber[] }>(
      'GET',
      `/stores/${encodeURIComponent(slug)}/inbox`,
      undefined,
      true
    )
    return {
      messages: mergeMessages(remote?.messages || [], localMessages),
      subscribers: mergeSubscribers(remote?.subscribers || [], localSubscribers),
    }
  },
}
