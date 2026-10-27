// --- Audit Logging Service ---
// Tracks all administrative, security, authentication, catalog, order, and configuration events
// across the multi-tenant SaaS platform and individual merchant storefronts.

import { API_BASE } from '@/api/base'

export type AuditCategory =
  | 'auth'
  | 'security'
  | 'products'
  | 'orders'
  | 'branding'
  | 'billing'
  | 'provisioning'
  | 'database'
  | 'settings'

export type AuditSeverity = 'info' | 'warning' | 'security' | 'critical'

export type AuditActorRole = 'super_admin' | 'seller' | 'staff' | 'system'

export interface AuditLogEntry {
  id: string
  timestamp: string
  actorId: string
  actorName: string
  actorRole: AuditActorRole
  tenantSlug?: string
  tenantName?: string
  action: string
  category: AuditCategory
  severity: AuditSeverity
  details: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
}

export interface AuditFilterOptions {
  tenantSlug?: string
  category?: string
  severity?: string
  actorRole?: string
  search?: string
  limit?: number
  page?: number
}

const STORAGE_KEY = 'orvexa_audit_logs_v1'

// Initial pre-seeded audit history for enterprise realism
const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'log_001',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(), // 12 mins ago
    actorId: 'usr_lunar_session',
    actorName: 'Gowreesh KP',
    actorRole: 'seller',
    tenantSlug: 'lunar',
    tenantName: 'The Lunar Clothing',
    action: 'SELLER_LOGIN_SUCCESS',
    category: 'auth',
    severity: 'info',
    details: 'Store Owner authenticated into merchant dashboard from Chrome on Windows.',
    ipAddress: '106.51.24.118',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    metadata: { sessionType: 'password', subdomain: 'lunar.orvexacloud.in' },
  },
  {
    id: 'log_002',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 mins ago
    actorId: 'admin_master_001',
    actorName: 'Orvexa Tech Super Admin',
    actorRole: 'super_admin',
    tenantSlug: 'lunar',
    tenantName: 'The Lunar Clothing',
    action: 'STORE_CREDENTIALS_UPDATED',
    category: 'security',
    severity: 'security',
    details: 'Super Admin updated store owner login email to gowreesh@thelunarclothing.com and regenerated access pass.',
    ipAddress: '49.37.112.4',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    metadata: { targetTenant: 'lunar', actionBy: 'super_admin' },
  },
  {
    id: 'log_003',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    actorId: 'usr_lunar_session',
    actorName: 'Gowreesh KP',
    actorRole: 'seller',
    tenantSlug: 'lunar',
    tenantName: 'The Lunar Clothing',
    action: 'PRODUCT_PRICE_UPDATED',
    category: 'products',
    severity: 'info',
    details: 'Updated price and inventory for "Midnight Chanderi Silk Maxi" (ID #101).',
    ipAddress: '106.51.24.118',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    metadata: { productId: 101, oldPrice: 1999, newPrice: 1899 },
  },
  {
    id: 'log_004',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), // 4 hours ago
    actorId: 'usr_lunar_session',
    actorName: 'Gowreesh KP',
    actorRole: 'seller',
    tenantSlug: 'lunar',
    tenantName: 'The Lunar Clothing',
    action: 'HOMEPAGE_THEME_CUSTOMIZED',
    category: 'branding',
    severity: 'info',
    details: 'Updated storefront primary brand color (#8C5A4F) and announcement banner message.',
    ipAddress: '106.51.24.118',
    metadata: { primaryColor: '#8C5A4F', logoChanged: true },
  },
  {
    id: 'log_005',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(), // 8 hours ago
    actorId: 'system_router',
    actorName: 'Orvexa Order Engine',
    actorRole: 'system',
    tenantSlug: 'lunar',
    tenantName: 'The Lunar Clothing',
    action: 'ORDER_FULFILLMENT_STATUS',
    category: 'orders',
    severity: 'info',
    details: 'Order #ORD-2026-891 marked as Shipped via BlueDart tracking #BD984210.',
    ipAddress: '127.0.0.1',
    metadata: { orderId: 'ORD-2026-891', carrier: 'BlueDart', status: 'shipped' },
  },
  {
    id: 'log_006',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    actorId: 'admin_master_001',
    actorName: 'Orvexa Tech Super Admin',
    actorRole: 'super_admin',
    tenantSlug: 'silkhaus',
    tenantName: 'Silk Haus',
    action: 'STORE_PROVISIONED',
    category: 'provisioning',
    severity: 'info',
    details: 'Authorized merchant application & provisioned isolated database orvexa_tenant_silkhaus.',
    ipAddress: '49.37.112.4',
    metadata: { plan: 'starter', db: 'orvexa_tenant_silkhaus' },
  },
  {
    id: 'log_007',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(), // 1.2 days ago
    actorId: 'admin_master_001',
    actorName: 'Orvexa Tech Super Admin',
    actorRole: 'super_admin',
    action: 'ADMIN_LOGIN_SUCCESS',
    category: 'auth',
    severity: 'security',
    details: 'Super Admin master console access authenticated from 49.37.112.4.',
    ipAddress: '49.37.112.4',
    metadata: { sessionDuration: '24h', role: 'super_admin' },
  },
  {
    id: 'log_008',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(), // 1.5 days ago
    actorId: 'usr_silkhaus_session',
    actorName: 'Kavya Menon',
    actorRole: 'seller',
    tenantSlug: 'silkhaus',
    tenantName: 'Silk Haus',
    action: 'STAFF_ACCOUNT_CREATED',
    category: 'security',
    severity: 'info',
    details: 'Created sub-account for Fulfillment Manager ananya@silkhaus.in.',
    ipAddress: '122.164.88.19',
    metadata: { staffEmail: 'ananya@silkhaus.in', role: 'manager' },
  },
  {
    id: 'log_009',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    actorId: 'admin_master_001',
    actorName: 'Orvexa Tech Super Admin',
    actorRole: 'super_admin',
    tenantSlug: 'lunar',
    tenantName: 'The Lunar Clothing',
    action: 'CUSTOM_DOMAIN_SSL_ACTIVE',
    category: 'database',
    severity: 'info',
    details: 'Custom domain www.thelunarclothing.com verified and SSL certificate auto-provisioned.',
    ipAddress: '49.37.112.4',
    metadata: { customDomain: 'www.thelunarclothing.com', ssl: 'active' },
  },
]

function getStoredLogs(): AuditLogEntry[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return INITIAL_AUDIT_LOGS
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as AuditLogEntry[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) {
    console.warn('Failed to read audit logs from storage', e)
  }
  return INITIAL_AUDIT_LOGS
}

function saveStoredLogs(logs: AuditLogEntry[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
      window.dispatchEvent(new CustomEvent('orvexa:audit-log-created', { detail: logs[0] }))
    }
  } catch (e) {
    console.warn('Failed to save audit logs to storage', e)
  }
}

export const auditLogger = {
  // ─────────────────────────────────────────────────────────
  // LOG A NEW AUDIT EVENT
  // ─────────────────────────────────────────────────────────
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): Promise<AuditLogEntry> {
    const newEntry: AuditLogEntry = {
      id: entry.id || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: entry.timestamp || new Date().toISOString(),
      actorId: entry.actorId || 'system',
      actorName: entry.actorName || 'System',
      actorRole: entry.actorRole || 'system',
      tenantSlug: entry.tenantSlug || '',
      tenantName: entry.tenantName || '',
      action: entry.action,
      category: entry.category || 'settings',
      severity: entry.severity || 'info',
      details: entry.details,
      ipAddress: entry.ipAddress || (typeof window !== 'undefined' ? '127.0.0.1' : '127.0.0.1'),
      userAgent: entry.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      metadata: entry.metadata || {},
    }

    // 1. Update local storage
    const current = getStoredLogs()
    const updated = [newEntry, ...current].slice(0, 500) // Keep latest 500
    saveStoredLogs(updated)

    // 2. Post to backend if reachable
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('lunar_admin_token') || localStorage.getItem('lunar_seller_token')
          : null
      fetch(`${API_BASE}/admin/audit-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(newEntry),
      }).catch(() => {})
    } catch {}

    return newEntry
  },

  // ─────────────────────────────────────────────────────────
  // QUERY AUDIT LOGS
  // ─────────────────────────────────────────────────────────
  getLogs(options?: AuditFilterOptions): { logs: AuditLogEntry[]; total: number } {
    let logs = getStoredLogs()

    if (options) {
      if (options.tenantSlug && options.tenantSlug !== 'all') {
        logs = logs.filter(
          (l) => l.tenantSlug && l.tenantSlug.toLowerCase() === options.tenantSlug?.toLowerCase()
        )
      }
      if (options.category && options.category !== 'all') {
        logs = logs.filter((l) => l.category === options.category)
      }
      if (options.severity && options.severity !== 'all') {
        logs = logs.filter((l) => l.severity === options.severity)
      }
      if (options.actorRole && options.actorRole !== 'all') {
        logs = logs.filter((l) => l.actorRole === options.actorRole)
      }
      if (options.search && options.search.trim()) {
        const q = options.search.toLowerCase().trim()
        logs = logs.filter(
          (l) =>
            l.action.toLowerCase().includes(q) ||
            l.details.toLowerCase().includes(q) ||
            l.actorName.toLowerCase().includes(q) ||
            (l.tenantSlug && l.tenantSlug.toLowerCase().includes(q)) ||
            (l.tenantName && l.tenantName.toLowerCase().includes(q))
        )
      }
    }

    const total = logs.length
    const limit = options?.limit || 100
    return { logs: logs.slice(0, limit), total }
  },

  getStoreLogs(tenantSlug: string, options?: Omit<AuditFilterOptions, 'tenantSlug'>): AuditLogEntry[] {
    return this.getLogs({ ...options, tenantSlug }).logs
  },

  getPlatformLogs(options?: AuditFilterOptions): AuditLogEntry[] {
    return this.getLogs(options).logs
  },

  // ─────────────────────────────────────────────────────────
  // EXPORT UTILITIES (CSV / JSON)
  // ─────────────────────────────────────────────────────────
  exportCsv(logs: AuditLogEntry[], filename = 'audit-trail-export.csv'): void {
    const headers = ['Timestamp', 'ID', 'Actor Name', 'Actor Role', 'Store Slug', 'Action', 'Category', 'Severity', 'Details', 'IP Address']
    const rows = logs.map((l) => [
      `"${l.timestamp}"`,
      `"${l.id}"`,
      `"${l.actorName}"`,
      `"${l.actorRole}"`,
      `"${l.tenantSlug || 'Platform'}"`,
      `"${l.action}"`,
      `"${l.category}"`,
      `"${l.severity}"`,
      `"${l.details.replace(/"/g, '""')}"`,
      `"${l.ipAddress || ''}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  },

  exportJson(logs: AuditLogEntry[], filename = 'audit-trail-export.json'): void {
    const jsonStr = JSON.stringify(logs, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  },
}
