// --- Platform Audit Trail & Security Logs Component ---
// Enterprise activity logs for Super Admins to monitor all platform actions,
// authentication events, database isolation changes, and store owner security operations.

import { useState, useEffect, useMemo } from 'react'
import { Shield, Download, RefreshCw, CheckCircle } from 'lucide-react'
import { auditLogger, type AuditLogEntry, type AuditSeverity } from '@/api/audit-logger'
import { useAdminTenants } from '@/api/hooks'
import { storeAddress } from '@/data/plans'

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  auth:         { label: 'Auth & Login',       color: 'var(--indigo)' },
  security:     { label: 'Security & Access',  color: '#8b5cf6' },
  provisioning: { label: 'Store Provisioning', color: 'var(--leaf)' },
  billing:      { label: 'Billing & Plans',    color: 'var(--gold-ink)' },
  products:     { label: 'Catalog & Products', color: '#0ea5e9' },
  orders:       { label: 'Orders',             color: '#06b6d4' },
  branding:     { label: 'Storefront & Theme', color: '#ec4899' },
  database:     { label: 'Database & Domains', color: '#14b8a6' },
  settings:     { label: 'Settings & Config',  color: 'var(--muted)' },
}

const SEVERITY_CONFIG: Record<AuditSeverity, { label: string; pillClass: string }> = {
  info:     { label: 'Info',     pillClass: 'indigo' },
  warning:  { label: 'Warn',     pillClass: 'gold' },
  security: { label: 'Security', pillClass: '' },
  critical: { label: 'Critical', pillClass: 'coral' },
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
    const handleNewLog = () => { refreshLogs() }
    window.addEventListener('orvexa:audit-log-created', handleNewLog)
    return () => { window.removeEventListener('orvexa:audit-log-created', handleNewLog) }
  }, [selectedTenant, selectedCategory, selectedSeverity, selectedRole, search])

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
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
      let relative = ''
      if (diffSec < 60) relative = 'just now'
      else if (diffSec < 3600) relative = `${Math.floor(diffSec / 60)}m ago`
      else if (diffSec < 86400) relative = `${Math.floor(diffSec / 3600)}h ago`
      else relative = `${Math.floor(diffSec / 86400)}d ago`
      return {
        relative,
        exact: d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }
    } catch {
      return { relative: ts, exact: ts }
    }
  }

  const handleExportCsv = () => {
    auditLogger.exportCsv(logs, `orvexa-platform-audit-${Date.now()}.csv`)
    showToast('Audit log CSV exported successfully!')
  }

  const handleExportJson = () => {
    auditLogger.exportJson(logs, `orvexa-platform-audit-${Date.now()}.json`)
    showToast('Audit log JSON exported successfully!')
  }

  const SEVERITY_TABS: Array<{ key: string; label: string }> = [
    { key: 'all', label: 'All events' },
    { key: 'info', label: 'Info' },
    { key: 'security', label: 'Security' },
    { key: 'warning', label: 'Warning' },
    { key: 'critical', label: 'Critical' },
  ]

  return (
    <div className="stack" style={{ maxWidth: 1280 }}>
      {/* Toast */}
      {toastMessage && (
        <div className="toasts">
          <div className="toast">
            <CheckCircle size={18} strokeWidth={2.1} />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Page head */}
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 10, marginBottom: 6 }}>
            <Shield size={22} strokeWidth={2.1} style={{ color: 'var(--indigo)' }} />
            <span className="pill leaf mono"><span className="dot" /> Immutable audit trail</span>
          </div>
          <h1>Platform security &amp; audit logs</h1>
          <p className="sub">
            Real-time forensic activity stream capturing store provisioning, credential updates, password resets,
            database access, and merchant administrative changes.
          </p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" onClick={handleExportCsv} className="btn btn-outline btn-sm">
            <Download size={15} strokeWidth={2.1} /> Export CSV
          </button>
          <button type="button" onClick={handleExportJson} className="btn btn-outline btn-sm">
            <Download size={15} strokeWidth={2.1} /> Export JSON
          </button>
          <button type="button" onClick={refreshLogs} className="btn btn-primary btn-sm">
            <RefreshCw size={15} strokeWidth={2.1} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid cols-4">
        <div className="card kpi">
          <div className="kpi-label">Total audit events</div>
          <div className="kpi-value">{stats.total}</div>
          <div className="kpi-foot"><span className="pill outline mono">All time</span></div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Security &amp; credentials</div>
          <div className="kpi-value" style={{ color: '#8b5cf6' }}>{stats.securityCount}</div>
          <div className="kpi-foot"><span className="muted small">Password &amp; access resets</span></div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Authenticated logins</div>
          <div className="kpi-value" style={{ color: 'var(--indigo)' }}>{stats.authCount}</div>
          <div className="kpi-foot"><span className="muted small">Auth events</span></div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Stores monitored</div>
          <div className="kpi-value" style={{ color: 'var(--leaf)' }}>{stats.storeCount}</div>
          <div className="kpi-foot"><span className="muted small">Across platform</span></div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="card">
        <div className="toolbar">
          <div className="search" style={{ flex: 1, maxWidth: 360 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by action, actor, or tenant…"
              className="input"
              style={{ height: 38, paddingLeft: 40 }}
            />
          </div>

          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="select"
            style={{ height: 38, width: 200 }}
          >
            <option value="all">All stores (platform-wide)</option>
            {tenants.map((t) => (
              <option key={t.slug} value={t.slug}>{t.brandName} ({t.slug})</option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="select"
            style={{ height: 38, width: 180 }}
          >
            <option value="all">All categories</option>
            <option value="auth">Auth &amp; Login</option>
            <option value="security">Security &amp; Access</option>
            <option value="provisioning">Store Provisioning</option>
            <option value="billing">Billing &amp; Plans</option>
            <option value="products">Products &amp; Catalog</option>
            <option value="orders">Orders &amp; Fulfillment</option>
            <option value="branding">Storefront &amp; Theme</option>
            <option value="database">Database &amp; Domains</option>
            <option value="settings">Settings</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setSearch('')
              setSelectedTenant('all')
              setSelectedCategory('all')
              setSelectedSeverity('all')
              setSelectedRole('all')
            }}
            className="btn btn-ghost btn-sm"
          >
            Reset
          </button>
        </div>

        {/* Severity tabs */}
        <div className="tabs" role="tablist" style={{ padding: '0 16px' }}>
          {SEVERITY_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={selectedSeverity === t.key}
              className="tab"
              onClick={() => setSelectedSeverity(t.key)}
            >
              {t.label}
              {t.key !== 'all' && (
                <span className="count">
                  {auditLogger.getLogs({ severity: t.key }).logs.length}
                </span>
              )}
            </button>
          ))}
          <span className="muted small mono" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            {logs.length} entries
          </span>
        </div>

        {/* Audit log table */}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp &amp; severity</th>
                <th>Action &amp; category</th>
                <th>Actor</th>
                <th>Target store</th>
                <th>Event details</th>
                <th className="num">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <p className="strong">No audit logs match the selected filters</p>
                      <p className="muted small">Try resetting search or category filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedLogId === log.id
                  const time = formatTimestamp(log.timestamp)
                  const sev = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.info
                  const cat = CATEGORY_LABELS[log.category] || CATEGORY_LABELS.settings

                  return (
                    <tr key={log.id} className={isExpanded ? 'clickable' : ''}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span
                          className={`pill mono ${sev.pillClass}`}
                          style={!sev.pillClass ? { background: '#ede9fe', color: '#5b21b6' } : undefined}
                        >
                          {sev.label}
                        </span>
                        <p className="strong small" style={{ marginTop: 4 }}>{time.relative}</p>
                        <p className="cell-sub mono">{time.exact}</p>
                      </td>

                      <td>
                        <span className="pill outline mono small" style={{ color: cat.color, borderColor: cat.color + '40' }}>
                          {cat.label}
                        </span>
                        <code className="strong small mono" style={{ display: 'block', marginTop: 4 }}>{log.action}</code>
                      </td>

                      <td style={{ whiteSpace: 'nowrap' }}>
                        <p style={{ fontWeight: 700 }}>{log.actorName}</p>
                        <span
                          className="pill mono small"
                          style={{
                            background: log.actorRole === 'super_admin' ? '#ede9fe' : log.actorRole === 'seller' ? 'var(--gold-soft)' : 'var(--line-soft)',
                            color: log.actorRole === 'super_admin' ? '#5b21b6' : log.actorRole === 'seller' ? 'var(--gold-ink)' : 'var(--ink-2)',
                            height: 18, fontSize: 10,
                          }}
                        >
                          {log.actorRole.toUpperCase()}
                        </span>
                        {log.ipAddress && <p className="cell-sub mono">IP: {log.ipAddress}</p>}
                      </td>

                      <td style={{ whiteSpace: 'nowrap' }}>
                        {log.tenantSlug ? (
                          <div>
                            <p style={{ fontWeight: 600 }}>{log.tenantName || log.tenantSlug}</p>
                            <code className="cell-sub mono" style={{ color: 'var(--indigo)' }}>{storeAddress(log.tenantSlug)}</code>
                          </div>
                        ) : (
                          <span className="pill outline mono">Platform Wide</span>
                        )}
                      </td>

                      <td>
                        <p className="small" style={{ maxWidth: 400, lineHeight: 1.5 }}>{log.details}</p>
                        {isExpanded && log.metadata && Object.keys(log.metadata).length > 0 && (
                          <pre style={{ marginTop: 10, background: 'var(--ink)', color: '#6ee7b7', borderRadius: 10, padding: 12, fontSize: 10, fontFamily: 'var(--font-mono)', overflow: 'auto', maxHeight: 200 }}>
                            {JSON.stringify(log.metadata, null, 2)}
                            {log.userAgent && `\n\nUA: ${log.userAgent}`}
                          </pre>
                        )}
                      </td>

                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="btn btn-outline btn-sm"
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
