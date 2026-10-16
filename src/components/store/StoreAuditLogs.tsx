// --- Store Owner Activity & Audit Trail Component ---
// Provides store owners with full transparency into all operations performed on their store,
// including logins, password changes, product updates, order fulfillment, and staff operator actions.

import { useState, useEffect, useMemo } from 'react'
import { auditLogger, type AuditLogEntry, type AuditCategory, type AuditSeverity } from '@/api/audit-logger'
import type { TenantConfig } from '@/types/tenant'

interface StoreAuditLogsProps {
  tenant: TenantConfig
  onToast?: (msg: string) => void
}

const CATEGORY_MAP: Record<string, { label: string; icon: string; bg: string; text: string }> = {
  auth: { label: 'Auth & Security', icon: '🔑', bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700' },
  security: { label: 'Security & Access', icon: '🛡️', bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700' },
  products: { label: 'Products & Stock', icon: '🏷️', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  orders: { label: 'Orders & Shipping', icon: '📦', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  branding: { label: 'Theme & Storefront', icon: '🎨', bg: 'bg-pink-50 border-pink-200', text: 'text-pink-700' },
  settings: { label: 'Settings & Config', icon: '⚙️', bg: 'bg-stone-100 border-stone-300', text: 'text-stone-700' },
  database: { label: 'Database & SSL', icon: '🗄️', bg: 'bg-teal-50 border-teal-200', text: 'text-teal-700' },
}

const SEVERITY_CONFIG: Record<AuditSeverity, { label: string; badge: string; dot: string }> = {
  info: { label: 'INFO', badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  warning: { label: 'WARNING', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  security: { label: 'SECURITY', badge: 'bg-purple-50 text-purple-700 border-purple-300 font-semibold', dot: 'bg-purple-500 animate-pulse' },
  critical: { label: 'CRITICAL', badge: 'bg-rose-50 text-rose-700 border-rose-300 font-bold', dot: 'bg-rose-500 animate-pulse' },
}

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateString).toLocaleDateString()
}

export default function StoreAuditLogs({ tenant, onToast }: StoreAuditLogsProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedSeverity, setSelectedSeverity] = useState('all')
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const reloadLogs = () => {
    setIsRefreshing(true)
    const result = auditLogger.getStoreLogs(tenant.slug)
    setLogs(result)
    setTimeout(() => setIsRefreshing(false), 300)
  }

  useEffect(() => {
    reloadLogs()

    const handleNewLog = () => {
      reloadLogs()
    }

    window.addEventListener('orvexa:audit-log-created', handleNewLog)
    return () => window.removeEventListener('orvexa:audit-log-created', handleNewLog)
  }, [tenant.slug])

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedCategory !== 'all' && log.category !== selectedCategory) return false
      if (selectedSeverity !== 'all' && log.severity !== selectedSeverity) return false
      if (search.trim()) {
        const q = search.toLowerCase().trim()
        const matchAction = log.action.toLowerCase().includes(q)
        const matchDetails = log.details.toLowerCase().includes(q)
        const matchActor = log.actorName.toLowerCase().includes(q)
        const matchIp = (log.ipAddress || '').includes(q)
        if (!matchAction && !matchDetails && !matchActor && !matchIp) return false
      }
      return true
    })
  }, [logs, search, selectedCategory, selectedSeverity])

  // Metrics
  const metrics = useMemo(() => {
    const total = logs.length
    const securityCount = logs.filter((l) => l.category === 'auth' || l.category === 'security' || l.severity === 'security').length
    const productCount = logs.filter((l) => l.category === 'products').length
    const orderCount = logs.filter((l) => l.category === 'orders').length
    return { total, securityCount, productCount, orderCount }
  }, [logs])

  const handleExportCsv = () => {
    auditLogger.exportCsv(filteredLogs, `${tenant.slug}-audit-log-${new Date().toISOString().split('T')[0]}.csv`)
    onToast?.(`Exported ${filteredLogs.length} audit records to CSV`)
  }

  const handleExportJson = () => {
    auditLogger.exportJson(filteredLogs, `${tenant.slug}-audit-log-${new Date().toISOString().split('T')[0]}.json`)
    onToast?.(`Exported ${filteredLogs.length} audit records to JSON`)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── HEADER BANNER ── */}
      <div className="bg-white rounded-2xl border border-black/10 p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛡️</span>
            <h2 className="text-lg font-bold text-black tracking-tight">Security & Store Activity Audit Log</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
              Active Monitoring
            </span>
          </div>
          <p className="text-xs text-black/50 mt-1 max-w-2xl">
            Real-time compliance ledger recording every credential change, seller login, inventory modification,
            and staff operator action on <strong className="text-black font-semibold">{tenant.brandName}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={reloadLogs}
            disabled={isRefreshing}
            className="text-xs font-semibold px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-black/70 border border-stone-200 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Refresh logs"
          >
            <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="text-xs font-bold px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-black text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>📥</span>
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportJson}
            className="text-xs font-semibold px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-black border border-stone-200 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>📄</span>
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* ── KPI STATS CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-black/8 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-black/50 uppercase tracking-wider">Total Events</span>
            <span className="text-base">📋</span>
          </div>
          <p className="text-2xl font-bold text-black mt-2">{metrics.total}</p>
          <p className="text-[10px] text-black/40 font-mono mt-0.5">Recorded in store ledger</p>
        </div>

        <div className="bg-white rounded-xl border border-purple-200/80 p-4 shadow-xs bg-gradient-to-b from-purple-50/30 to-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">Security & Auth</span>
            <span className="text-base">🔐</span>
          </div>
          <p className="text-2xl font-bold text-purple-900 mt-2">{metrics.securityCount}</p>
          <p className="text-[10px] text-purple-600/70 font-mono mt-0.5">Logins & credential resets</p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200/80 p-4 shadow-xs bg-gradient-to-b from-blue-50/30 to-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Catalog Updates</span>
            <span className="text-base">🏷️</span>
          </div>
          <p className="text-2xl font-bold text-blue-900 mt-2">{metrics.productCount}</p>
          <p className="text-[10px] text-blue-600/70 font-mono mt-0.5">Price & stock modifications</p>
        </div>

        <div className="bg-white rounded-xl border border-emerald-200/80 p-4 shadow-xs bg-gradient-to-b from-emerald-50/30 to-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Order Operations</span>
            <span className="text-base">📦</span>
          </div>
          <p className="text-2xl font-bold text-emerald-900 mt-2">{metrics.orderCount}</p>
          <p className="text-[10px] text-emerald-600/70 font-mono mt-0.5">Status changes & shipments</p>
        </div>
      </div>

      {/* ── SEARCH & FILTER CONTROLS ── */}
      <div className="bg-white rounded-xl border border-black/10 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          {/* Search Box */}
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40 text-xs">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by action, actor name, detail keywords, IP address..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg text-black outline-none focus:border-stone-400 focus:bg-white transition-all font-sans"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 hover:text-black text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-black/80 font-medium outline-none focus:border-stone-400 cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="auth">🔑 Auth & Login</option>
            <option value="security">🛡️ Security & Credentials</option>
            <option value="products">🏷️ Catalog & Inventory</option>
            <option value="orders">📦 Orders & Fulfillment</option>
            <option value="branding">🎨 Theme & Design</option>
            <option value="settings">⚙️ Settings</option>
          </select>

          {/* Severity Filter */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-black/80 font-medium outline-none focus:border-stone-400 cursor-pointer"
          >
            <option value="all">All Severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="security">Security</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {/* Filter Summary */}
        <div className="flex items-center justify-between text-[11px] text-black/50 pt-1 border-t border-black/5">
          <span>
            Showing <strong className="text-black font-semibold">{filteredLogs.length}</strong> of {logs.length} events
          </span>
          {(search || selectedCategory !== 'all' || selectedSeverity !== 'all') && (
            <button
              onClick={() => {
                setSearch('')
                setSelectedCategory('all')
                setSelectedSeverity('all')
              }}
              className="text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── AUDIT LOG LIST / TABLE ── */}
      <div className="bg-white rounded-xl border border-black/10 shadow-xs overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-3xl block mb-2">🔍</span>
            <p className="text-sm font-bold text-black/70">No audit events match your search criteria</p>
            <p className="text-xs text-black/40 mt-1">Try clearing filters or search terms</p>
          </div>
        ) : (
          <div className="divide-y divide-black/6">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id
              const cat = CATEGORY_MAP[log.category] || {
                label: log.category,
                icon: '📌',
                bg: 'bg-stone-50 border-stone-200',
                text: 'text-stone-700',
              }
              const sev = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.info

              return (
                <div
                  key={log.id}
                  className={`transition-colors ${isExpanded ? 'bg-stone-50/80' : 'hover:bg-stone-50/50'}`}
                >
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer"
                  >
                    {/* Left: Icon, Action, Details */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-base flex-shrink-0 mt-0.5">
                        {cat.icon}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-black tracking-tight">
                            {log.action}
                          </span>

                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${cat.bg} ${cat.text}`}>
                            {cat.label}
                          </span>

                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${sev.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                            {sev.label}
                          </span>
                        </div>

                        <p className="text-xs text-black/70 line-clamp-2 leading-relaxed">
                          {log.details}
                        </p>

                        <div className="flex items-center gap-3 text-[10px] text-black/40 font-mono pt-0.5 flex-wrap">
                          <span>👤 <strong>{log.actorName}</strong> ({log.actorRole})</span>
                          {log.ipAddress && <span>🌐 IP: {log.ipAddress}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Right: Timestamp & Expand Caret */}
                    <div className="flex items-center gap-3 self-end md:self-center flex-shrink-0 text-right">
                      <div className="text-right">
                        <p className="text-xs font-medium text-black/80 font-mono">
                          {timeAgo(log.timestamp)}
                        </p>
                        <p className="text-[10px] text-black/40 font-mono" title={log.timestamp}>
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                      </div>

                      <span className={`text-xs text-black/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </div>
                  </div>

                  {/* Expanded Payload & Technical Details */}
                  {isExpanded && (
                    <div className="px-6 pb-4 pt-2 border-t border-black/5 bg-stone-100/60 text-xs font-mono space-y-3 animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                        <div>
                          <span className="text-black/40 block text-[10px] uppercase">EVENT ID</span>
                          <span className="font-bold text-black">{log.id}</span>
                        </div>
                        <div>
                          <span className="text-black/40 block text-[10px] uppercase">EXACT ISO TIMESTAMP</span>
                          <span className="text-black/80">{log.timestamp}</span>
                        </div>
                        <div>
                          <span className="text-black/40 block text-[10px] uppercase">ACTOR ID</span>
                          <span className="text-black/80">{log.actorId}</span>
                        </div>
                      </div>

                      {log.userAgent && (
                        <div>
                          <span className="text-black/40 block text-[10px] uppercase">CLIENT USER AGENT</span>
                          <span className="text-[10px] text-black/70 break-all">{log.userAgent}</span>
                        </div>
                      )}

                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div>
                          <span className="text-black/40 block text-[10px] uppercase mb-1">EVENT METADATA PAYLOAD</span>
                          <pre className="p-3 bg-stone-900 text-emerald-300 rounded-lg text-[11px] overflow-x-auto border border-black/10">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── DATA PRIVACY & ISOLATION NOTICE ── */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex items-start gap-3 text-xs text-black/60">
        <span className="text-base flex-shrink-0">🔒</span>
        <div className="space-y-0.5">
          <p className="font-bold text-black text-[11px] uppercase tracking-wider">Data Privacy & Tenant Isolation Assurance</p>
          <p className="text-[11px] leading-relaxed">
            All audit trails for <strong>{tenant.brandName}</strong> are cryptographically stamped and restricted to database scope <code className="font-mono text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">orvexa_tenant_{tenant.slug}</code>.
            External merchants cannot access your audit logs under Orvexa Multi-Store Data Isolation.
          </p>
        </div>
      </div>
    </div>
  )
}
