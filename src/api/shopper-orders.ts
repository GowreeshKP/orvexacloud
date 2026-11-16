// Persist shopper order history per tenant + email (local backup + API merge).
import type { TrackedOrder } from '@/types'
import { resolveApiBase } from '@/api/base'

const STORAGE_KEY = 'orvexa_shopper_orders_v1'

type Store = Record<string, Record<string, TrackedOrder[]>>

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* storage full */
  }
}

function keyEmail(email: string) {
  return email.trim().toLowerCase()
}

function mergeOrders(a: TrackedOrder[], b: TrackedOrder[]): TrackedOrder[] {
  const map = new Map<string, TrackedOrder>()
  for (const o of [...b, ...a]) {
    if (!o?.id) continue
    map.set(o.id, o)
  }
  return [...map.values()].sort((x, y) => String(y.date).localeCompare(String(x.date)))
}

export const shopperOrders = {
  list(tenantId: string, email: string): TrackedOrder[] {
    const all = readStore()
    return all[tenantId]?.[keyEmail(email)] || []
  },

  save(tenantId: string, email: string, order: TrackedOrder) {
    const e = keyEmail(email)
    if (!e || !order?.id) return
    const all = readStore()
    const current = all[tenantId]?.[e] || []
    all[tenantId] = {
      ...(all[tenantId] || {}),
      [e]: mergeOrders([{ ...order, customerEmail: e }], current),
    }
    writeStore(all)
  },

  replace(tenantId: string, email: string, orders: TrackedOrder[]) {
    const e = keyEmail(email)
    if (!e) return
    const all = readStore()
    all[tenantId] = { ...(all[tenantId] || {}), [e]: mergeOrders(orders, []) }
    writeStore(all)
  },

  async fetchMine(slug: string, email: string, phone: string): Promise<TrackedOrder[]> {
    const params = new URLSearchParams({
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
    })
    const res = await fetch(`${resolveApiBase()}/stores/${encodeURIComponent(slug)}/orders/mine?${params}`)
    if (!res.ok) return []
    const data = await res.json().catch(() => [])
    return Array.isArray(data) ? (data as TrackedOrder[]) : []
  },
}
