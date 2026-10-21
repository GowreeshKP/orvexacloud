// --- Platform Audit Trail & Security Logs Component ---
// Enterprise activity logs for Super Admins to monitor all platform actions,
// authentication events, database isolation changes, and store owner security operations.

import { useState, useEffect, useMemo } from 'react'
import { auditLogger, type AuditLogEntry, type AuditCategory, type AuditSeverity } from '@/api/audit-logger'
import { useAdminTenants } from '@/api/hooks'
import { storeAddress } from '@/data/plans'

const CATEGORY_LABELS: Record<string, { label: string; icon: string; badgeColor: string }> = {
  auth: { label: 'Auth & Login', icon: '🔑', badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  security: { label: 'Security & Access', icon: '🛡️', badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  provisioning: { label: 'Store Provisioning', icon: '🏢', badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  billing: { label: 'Billing & Plans', icon: '💳', badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  products: { label: 'Catalog & Products', icon: '🏷️', badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  orders: { label: 'Orders & Fulfillment', icon: '📦', badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  branding: { label: 'Storefront & Theme', icon: '🎨', badgeColor: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
  database: { label: 'Database & Domains', icon: '🗄️', badgeColor: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
  settings: { label: 'Settings & Config', icon: '⚙️', badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
}

const SEVERITY_BADGES: Record<AuditSeverity, { label: string; dotColor: string; bg: string; text: string }> = {
  info: { label: 'INFO', dotColor: 'bg-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400' },
  warning: { label: 'WARN', dotColor: 'bg-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400' },
  security: { label: 'SECURITY', dotColor: 'bg-purple-400 animate-pulse', bg: 'bg-purple-500/10 border-purple-500/20', text: 'text-purple-300' },
  critical: { label: 'CRITICAL', dotColor: 'bg-rose-500 animate-pulse', bg: 'bg-rose-500/10 border-rose-500/20', text: 'text-rose-400 font-bold' },
}

export default function PlatformAuditLogs() {
  const { tenants } = useAdminTenants()
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [search, setSearch] = useState('')
  const [selectedTenant, setSelectedTenant] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedSeverity, setSelectedSeverity] = useState('all')
  const [selectedRole, setSelectedRole] = useState('all')
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const refreshLogs = () => {
    const data = auditLogger.getLogs({
      tenantSlug: selectedTenant,
      category: selectedCategory,
      severity: selectedSeverity,
      actorRole: selectedRole,
      search,
    })
    setLogs(data.logs)
  }

  useEffect(() => {
    refreshLogs()

    const handleNewLog = () => {
      refreshLogs()
    }
    window.addEventListener('orvexa:audit-log-created', handleNewLog)
    return () => {
      window.removeEventListener('orvexa:audit-log-created', handleNewLog)
    }
  }, [selectedTenant, selectedCategory, selectedSeverity, selectedRole, search])

  // KPIs
  const stats = useMemo(() => {
    const all = auditLogger.getLogs().logs
    return {
      total: all.length,
      securityCount: all.filter((l) => l.category === 'security' || l.severity === 'security').length,
      authCount: all.filter((l) => l.category === 'auth').length,
      criticalCount: all.filter((l) => l.severity === 'critical' || l.severity === 'warning').length,
      storeCount: new Set(all.map((l) => l.tenantSlug).filter(Boolean)).size,
    }
  }, [logs])

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts)
      const now = Date.now()
      const diffSec = Math.floor((now - d.getTime()) / 1000)

      let relative = ''
      if (diffSec < 60) relative = 'just now'
      else if (diffSec < 3600) relative = `${Math.floor(diffSec / 60)}m ago`
      else if (diffSec < 86400) relative = `${Math.floor(diffSec / 3600)}h ago`
      else relative = `${Math.floor(diffSec / 86400)}d ago`

      return {
        relative,
        exact: d.toLocaleString('en-IN', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      }
    } catch {
      return { relative: ts, exact: ts }
    }
  }

  const handleExportExcel = () => {
    auditLogger.exportExcel(logs, `orvexa-platform-audit-${Date.now()}.xlsx`)
    showToast('📥 Audit log Excel exported successfully!')
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 border border-emerald-500/40 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs animate-slide-down">
          <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center justify-center text-[11px]">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 p-6 text-white shadow-xl">
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#6366f1 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                IMMUTABLE AUDIT TRAIL
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-[11px] font-mono text-slate-400">AUDIT EVENT STREAM</span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Platform Security & Audit Logs
            </h2>
            <p className="text-xs text-slate-300/80 leading-relaxed">
              Real-time forensic activity stream capturing store provisioning, credential updates, password resets,
              database access, and merchant administrative changes across the entire Orvexa Cloud cluster.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors cursor-pointer flex items-center gap-2"
            >
              <span>📥</span>
              <span>Export Excel</span>
            </button>
            <button
              onClick={refreshLogs}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-950 hover:bg-slate-100 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <span>🔄</span>
              <span>Refresh Stream</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4.5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xl">📜</span>
            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
              ALL TIME
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stats.total}</p>
          <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider mt-0.5">Total Audit Events</p>
        </div>

        <div className="bg-white rounded-xl p-4.5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xl">🛡️</span>
            <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
              SECURITY
            </span>
          </div>
          <p className="text-2xl font-bold text-purple-600 mt-2">{stats.securityCount}</p>
          <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider mt-0.5">Password & Credential Resets</p>
        </div>

        <div className="bg-white rounded-xl p-4.5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xl">🔑</span>
            <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">
              ACCESS
            </span>
          </div>
          <p className="text-2xl font-bold text-indigo-600 mt-2">{stats.authCount}</p>
          <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider mt-0.5">Authenticated Logins</p>
        </div>

        <div className="bg-white rounded-xl p-4.5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xl">🏢</span>
            <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
              ACTIVE
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{stats.storeCount} Stores</p>
          <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider mt-0.5">Stores Monitored</p>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-4.5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Search Box */}
          <div className="lg:col-span-2 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by action, details, actor, or tenant..."
              className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-lg text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white outline-none transition-all shadow-2xs"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Store Filter */}
          <div>
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-slate-800 outline-none focus:border-indigo-500 cursor-pointer font-medium"
            >
              <option value="all">🏬 All Stores (Platform Wide)</option>
              {tenants.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.brandName} ({t.slug})
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-slate-800 outline-none focus:border-indigo-500 cursor-pointer font-medium"
            >
              <option value="all">📂 All Categories</option>
              <option value="auth">🔑 Auth & Login</option>
              <option value="security">🛡️ Security & Access</option>
              <option value="provisioning">🏢 Store Provisioning</option>
              <option value="billing">💳 Billing & Plans</option>
              <option value="products">🏷️ Products & Catalog</option>
              <option value="orders">📦 Orders & Fulfillment</option>
              <option value="branding">🎨 Storefront & Theme</option>
              <option value="database">🗄️ Database & Domains</option>
              <option value="settings">⚙️ Settings</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-slate-800 outline-none focus:border-indigo-500 cursor-pointer font-medium"
            >
              <option value="all">⚡ All Severities</option>
              <option value="info">🔵 Info Events</option>
              <option value="security">🟣 Security Events</option>
              <option value="warning">🟡 Warning Alerts</option>
              <option value="critical">🔴 Critical Alerts</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Pills */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono text-slate-400 uppercase mr-1">Quick Filters:</span>
            <button
              onClick={() => {
                setSelectedCategory('security')
                setSelectedSeverity('all')
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                selectedCategory === 'security' ? 'bg-purple-100 text-purple-800 font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🛡️ Security & Passwords
            </button>
            <button
              onClick={() => {
                setSelectedCategory('auth')
                setSelectedSeverity('all')
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                selectedCategory === 'auth' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🔑 Authentications
            </button>
            <button
              onClick={() => {
                setSelectedCategory('provisioning')
                setSelectedSeverity('all')
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                selectedCategory === 'provisioning' ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🏢 Provisioning
            </button>
            <button
              onClick={() => {
                setSelectedCategory('all')
                setSelectedTenant('all')
                setSelectedSeverity('all')
                setSelectedRole('all')
                setSearch('')
              }}
              className="text-[11px] text-slate-400 hover:text-slate-700 underline ml-2"
            >
              Reset Filters
            </button>
          </div>

          <span className="text-[11px] font-mono text-slate-400">
            Showing <strong>{logs.length}</strong> matching audit entries
          </span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 uppercase tracking-wider font-mono text-[10px]">
                <th className="text-left px-5 py-3">Timestamp & Severity</th>
                <th className="text-left px-4 py-3">Action & Category</th>
                <th className="text-left px-4 py-3">Actor / Identity</th>
                <th className="text-left px-4 py-3">Target Store</th>
                <th className="text-left px-4 py-3">Event Details</th>
                <th className="text-right px-5 py-3">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <p className="text-2xl mb-1">🔍</p>
                    <p className="font-semibold text-slate-700">No audit logs match the selected filters</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Try resetting search or category filters.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedLogId === log.id
                  const time = formatTimestamp(log.timestamp)
                  const sev = SEVERITY_BADGES[log.severity] || SEVERITY_BADGES.info
                  const cat = CATEGORY_LABELS[log.category] || CATEGORY_LABELS.settings

                  return (
                    <tr key={log.id} className={`hover:bg-slate-50/70 transition-colors ${isExpanded ? 'bg-slate-50/90' : ''}`}>
                      {/* Timestamp & Severity */}
                      <td className="px-5 py-3.5 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${sev.dotColor}`} />
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${sev.bg} ${sev.text}`}>
                            {sev.label}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-800 text-[11px] mt-1">{time.relative}</p>
                        <p className="text-[10px] font-mono text-slate-400">{time.exact}</p>
                      </td>

                      {/* Action & Category */}
                      <td className="px-4 py-3.5 align-top">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${cat.badgeColor}`}>
                          <span>{cat.icon}</span>
                          <span>{cat.label}</span>
                        </span>
                        <code className="text-slate-900 font-mono font-bold text-[11px] block mt-1">
                          {log.action}
                        </code>
                      </td>

                      {/* Actor */}
                      <td className="px-4 py-3.5 align-top whitespace-nowrap">
                        <p className="font-bold text-slate-900">{log.actorName}</p>
                        <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded ${
                          log.actorRole === 'super_admin' ? 'bg-purple-100 text-purple-800' :
                          log.actorRole === 'seller' ? 'bg-amber-100 text-amber-800' :
                          log.actorRole === 'staff' ? 'bg-indigo-100 text-indigo-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {log.actorRole.toUpperCase()}
                        </span>
                        {log.ipAddress && (
                          <p className="text-[10px] font-mono text-slate-400 mt-1">IP: {log.ipAddress}</p>
                        )}
                      </td>

                      {/* Target Store */}
                      <td className="px-4 py-3.5 align-top whitespace-nowrap">
                        {log.tenantSlug ? (
                          <div>
                            <p className="font-semibold text-slate-800">{log.tenantName || log.tenantSlug}</p>
                            <code className="text-[10px] font-mono text-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 rounded border border-indigo-100">
                              {storeAddress(log.tenantSlug)}
                            </code>
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-semibold">
                            Platform Wide
                          </span>
                        )}
                      </td>

                      {/* Details */}
                      <td className="px-4 py-3.5 align-top">
                        <p className="text-slate-700 leading-relaxed text-[11px] max-w-md">
                          {log.details}
                        </p>

                        {/* Expandable Metadata view */}
                        {isExpanded && log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="mt-2.5 p-3 rounded-lg bg-slate-900 text-slate-200 font-mono text-[10px] space-y-1 shadow-inner border border-slate-800">
                            <p className="text-indigo-400 font-bold uppercase tracking-wider">Event Metadata Payload:</p>
                            <pre className="overflow-x-auto break-all">{JSON.stringify(log.metadata, null, 2)}</pre>
                            {log.userAgent && (
                              <p className="text-slate-400 text-[9px] pt-1 border-t border-slate-800">
                                UA: {log.userAgent}
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Metadata / Expand Button */}
                      <td className="px-5 py-3.5 align-top text-right whitespace-nowrap">
                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] transition-colors cursor-pointer border border-slate-200"
                        >
                          {isExpanded ? 'Hide ▲' : 'Inspect ▼'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
