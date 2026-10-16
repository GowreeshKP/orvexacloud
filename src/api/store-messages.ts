// --- Storefront contact messages & newsletter subscribers (per tenant, localStorage) ---

const MESSAGES_KEY = 'orvexa_store_messages_v1'
const SUBSCRIBERS_KEY = 'orvexa_newsletter_v1'
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

export const storeInbox = {
  getMessages(tenantId: string): StoreMessage[] {
    return read<StoreMessage>(MESSAGES_KEY)[tenantId] || []
  },

  addMessage(tenantId: string, msg: Omit<StoreMessage, 'id' | 'createdAt' | 'read'>): StoreMessage {
    const all = read<StoreMessage>(MESSAGES_KEY)
    const entry: StoreMessage = { ...msg, id: `msg_${Date.now()}`, createdAt: new Date().toISOString(), read: false }
    all[tenantId] = [entry, ...(all[tenantId] || [])]
    write(MESSAGES_KEY, all)
    return entry
  },

  setRead(tenantId: string, id: string, isRead: boolean) {
    const all = read<StoreMessage>(MESSAGES_KEY)
    all[tenantId] = (all[tenantId] || []).map((m) => (m.id === id ? { ...m, read: isRead } : m))
    write(MESSAGES_KEY, all)
  },

  deleteMessage(tenantId: string, id: string) {
    const all = read<StoreMessage>(MESSAGES_KEY)
    all[tenantId] = (all[tenantId] || []).filter((m) => m.id !== id)
    write(MESSAGES_KEY, all)
  },

  getSubscribers(tenantId: string): NewsletterSubscriber[] {
    return read<NewsletterSubscriber>(SUBSCRIBERS_KEY)[tenantId] || []
  },

  /** Returns false when the email was already subscribed. */
  subscribe(tenantId: string, email: string): boolean {
    const all = read<NewsletterSubscriber>(SUBSCRIBERS_KEY)
    const list = all[tenantId] || []
    const normalized = email.trim().toLowerCase()
    if (list.some((s) => s.email === normalized)) return false
    all[tenantId] = [{ email: normalized, subscribedAt: new Date().toISOString() }, ...list]
    write(SUBSCRIBERS_KEY, all)
    return true
  },

  unsubscribe(tenantId: string, email: string) {
    const all = read<NewsletterSubscriber>(SUBSCRIBERS_KEY)
    all[tenantId] = (all[tenantId] || []).filter((s) => s.email !== email)
    write(SUBSCRIBERS_KEY, all)
  },
}
