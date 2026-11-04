import { useState, useEffect, type ReactNode } from 'react'
import {
  LayoutDashboard, ClipboardList, Users, Store, CreditCard, Globe, Shield,
  LogOut, Bell, Search, CheckCircle, AlertTriangle, Mail, MessageCircle,
} from 'lucide-react'
import { useAdminTenants, useAdminApplications, usePlatformStats } from '@/api/hooks'
import { authService, type AdminSession } from '@/api/auth'
import { auditLogger } from '@/api/audit-logger'
import { API_BASE } from '@/api/base'
import AdminLogin from '@/components/auth/AdminLogin'
import ResetPasswordModal from '@/components/auth/ResetPasswordModal'
import StoreCredentialsModal from '@/components/auth/StoreCredentialsModal'
import PortalView from '@/components/platform/PortalView'
import ProvisionStoreModal from '@/components/platform/ProvisionStoreModal'
import PlatformAuditLogs from '@/components/platform/PlatformAuditLogs'
import type { TenantConfig } from '@/types/tenant'
import { PLAN_CATALOG, PLAN_IDS, formatPlanPrice, normalizePlanId, storeAddress } from '@/data/plans'
import { sellerPortalUrl, storefrontUrl } from '@/lib/store-urls'

// ── Nav groups matching portals demo ─────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: null as string | null,
    items: [
      { id: 'dashboard' as const, label: 'Overview',      Icon: LayoutDashboard, appBadge: false, leadsBadge: false },
      { id: 'applications' as const, label: 'Applications', Icon: ClipboardList,   appBadge: true,  leadsBadge: false },
      { id: 'leads' as const, label: 'Leads',         Icon: Users,           appBadge: false, leadsBadge: true  },
    ],
  },
  {
    label: 'Stores',
    items: [
      { id: 'stores' as const,  label: 'Stores',  Icon: Store,      appBadge: false, leadsBadge: false },
      { id: 'billing' as const, label: 'Billing', Icon: CreditCard, appBadge: false, leadsBadge: false },
      { id: 'domains' as const, label: 'Domains', Icon: Globe,      appBadge: false, leadsBadge: false },
    ],
  },
  {
    label: 'Security',
    items: [
      { id: 'audit' as const, label: 'Audit trail', Icon: Shield, appBadge: false, leadsBadge: false },
    ],
  },
] as const

type AdminView = 'dashboard' | 'applications' | 'leads' | 'stores' | 'billing' | 'domains' | 'audit'

function getNavLabel(id: AdminView): string {
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      if (item.id === id) return item.label
    }
  }
  return id
}

// ── Curved SVG Sparkline ──────────────────────────────────────────────────────
function Sparkline({ data, color = '#6366f1' }: { data: number[]; color?: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 110
  const height = 32

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((val - min) / range) * (height - 6) - 3
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const pathD = `M ${points.join(' L ')}`
  const areaD = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color.replace('#', '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.length > 0 && (
        <circle
          cx={width}
          cy={height - ((data[data.length - 1] - min) / range) * (height - 6) - 3}
          r="3"
          fill={color}
          className="animate-pulse"
        />
      )}
    </svg>
  )
}

// ── Root component ────────────────────────────────────────────────────────────
export default function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(() => authService.getAdminSession())
  const [activeView, setActiveView] = useState<AdminView>('dashboard')
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false)
  const [adminToast, setAdminToast] = useState<string | null>(null)
  const [navOpen, setNavOpen] = useState(false)

  const [resetToken, setResetToken] = useState<string | null>(null)
  const [resetSlug, setResetSlug] = useState<string | null>(null)
  const [isResetOpen, setIsResetOpen] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('reset_token')
    const slug = params.get('slug')
    if (token) {
      setResetToken(token)
      setResetSlug(slug || 'lunar')
      setIsResetOpen(true)
    }
  }, [])

  useEffect(() => {
    document.title = session ? 'Orvexa Admin Portal' : 'Sign In | Orvexa Admin Portal'
  }, [session])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void (async () => {
      const token = await authService.getValidAdminToken()
      if (cancelled || token) return
      try {
        const health = await fetch(`${API_BASE}/health`)
        if (!cancelled && health.ok) {
          authService.logoutAdmin()
          setSession(null)
        }
      } catch {
        // API offline: keep a local demo session for UI work.
      }
    })()
    return () => { cancelled = true }
  }, [session])

  const handleLogout = () => {
    authService.logoutAdmin()
    setSession(null)
    setActiveView('dashboard')
  }

  const resetPasswordModal = (
    <ResetPasswordModal
      isOpen={isResetOpen}
      resetToken={resetToken || undefined}
      tenantSlug={resetSlug || undefined}
      onClose={() => {
        setIsResetOpen(false)
        setResetToken(null)
        setResetSlug(null)
      }}
    />
  )

  if (!session || session.role !== 'super_admin') {
    return (
      <>
        <AdminLogin onSuccess={setSession} />
        {resetPasswordModal}
      </>
    )
  }

  return (
    <AdminPortal
      session={session}
      activeView={activeView}
      setActiveView={setActiveView}
      isProvisionModalOpen={isProvisionModalOpen}
      setIsProvisionModalOpen={setIsProvisionModalOpen}
      adminToast={adminToast}
      setAdminToast={setAdminToast}
      navOpen={navOpen}
      setNavOpen={setNavOpen}
      handleLogout={handleLogout}
      resetPasswordModal={resetPasswordModal}
    />
  )
}

// ── AdminPortal shell ─────────────────────────────────────────────────────────
function AdminPortal({
  session,
  activeView,
  setActiveView,
  isProvisionModalOpen,
  setIsProvisionModalOpen,
  adminToast,
  setAdminToast,
  navOpen,
  setNavOpen,
  handleLogout,
  resetPasswordModal,
}: {
  session: AdminSession
  activeView: AdminView
  setActiveView: (v: AdminView) => void
  isProvisionModalOpen: boolean
  setIsProvisionModalOpen: (v: boolean) => void
  adminToast: string | null
  setAdminToast: (v: string | null) => void
  navOpen: boolean
  setNavOpen: (v: boolean) => void
  handleLogout: () => void
  resetPasswordModal: ReactNode
}) {
  const { provisionTenant, refresh: refreshTenants } = useAdminTenants()

  return (
    <div className="shell">
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden />}

      {/* ── Sidebar ── */}
      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <div className="brand-row">
          <img src="/brand/logo-white.svg" alt="Orvexa Cloud" />
          <span className="portal-chip">Super Admin</span>
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.label ?? '__main__'}>
            {group.label && <p className="nav-group">{group.label}</p>}
            <nav className="col" style={{ gap: 4 }} aria-label={group.label ?? 'Platform sections'}>
              {group.items.map((item) => {
                const isActive = activeView === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setActiveView(item.id); setNavOpen(false) }}
                    className={`nav-item${isActive ? ' active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <item.Icon size={19} strokeWidth={2.1} />
                    <span className="grow">{item.label}</span>
                    {item.appBadge && <PendingBadge />}
                    {item.leadsBadge && <LeadsBadge />}
                  </button>
                )
              })}
            </nav>
          </div>
        ))}

        <div className="sidebar-foot">
          <div className="user-card">
            <span className="avatar sm" style={{ background: 'var(--gold)', color: 'var(--ink)' }}>
              {session.name?.charAt(0).toUpperCase() ?? 'A'}
            </span>
            <div className="grow min-w-0">
              <p className="nm truncate">{session.name ?? 'Super Admin'}</p>
              <p className="rl truncate">Super administrator</p>
            </div>
            <button type="button" className="btn btn-ghost btn-icon" onClick={handleLogout} title="Sign out" style={{ color: 'var(--on-ink-2)' }}>
              <LogOut size={19} strokeWidth={2.1} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Content area ── */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <header className="topbar">
          <button type="button" className="menu-btn btn btn-outline btn-icon" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <div className="col" style={{ gap: 2 }}>
            <span className="crumb">Platform</span>
            <strong key={activeView} style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: 1.2 }}>
              {getNavLabel(activeView)}
            </strong>
          </div>

          <div className="search topbar-search" style={{ width: 'min(280px, 30vw)' }}>
            <Search size={15} strokeWidth={2.1} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input className="input" placeholder="Search…" style={{ height: 40, paddingLeft: 40, background: '#fff' }} />
          </div>

          <div className="row right" style={{ gap: 10 }}>
            <span className="pill leaf mono">
              <span className="dot" />
              Production
            </span>
            <button type="button" className="btn btn-ghost btn-icon" style={{ position: 'relative' }}>
              <Bell size={19} strokeWidth={2.1} />
              <span style={{ position: 'absolute', top: 9, right: 9, width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', border: '1.5px solid var(--paper)' }} />
            </button>
          </div>
        </header>

        <main className="main">
          <div className="page">
            <PortalView viewKey={activeView}>
              {activeView === 'dashboard' && (
                <PlatformOverview
                  onSwitchView={setActiveView}
                  onOpenProvisionModal={() => setIsProvisionModalOpen(true)}
                />
              )}
              {activeView === 'applications' && <ApplicationQueue />}
              {activeView === 'leads' && <ClientLeadsCRM onSwitchView={setActiveView} />}
              {activeView === 'stores' && (
                <TenantDirectory onOpenProvisionModal={() => setIsProvisionModalOpen(true)} />
              )}
              {activeView === 'billing' && <BillingManager />}
              {activeView === 'domains' && <DomainManager />}
              {activeView === 'audit' && <PlatformAuditLogs />}
            </PortalView>
          </div>
        </main>
      </div>

      {/* ── Provision Store Modal ── */}
      <ProvisionStoreModal
        isOpen={isProvisionModalOpen}
        onClose={() => setIsProvisionModalOpen(false)}
        onProvision={provisionTenant}
        onSuccess={(newTenant) => {
          refreshTenants()
          setActiveView('stores')
          setAdminToast(`✅ Store "${newTenant.brandName}" provisioned successfully!`)
          setTimeout(() => setAdminToast(null), 5000)
        }}
      />

      {resetPasswordModal}

      {/* ── Toast ── */}
      {adminToast && (
        <div className="toasts">
          <div className="toast">
            <CheckCircle size={18} strokeWidth={2.1} />
            <span>{adminToast}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Badge helpers ─────────────────────────────────────────────────────────────
function PendingBadge() {
  const { applications } = useAdminApplications()
  const pending = applications.filter((a) => a.status === 'pending').length
  if (pending === 0) return null
  return <span className="nav-badge">{pending}</span>
}

function LeadsBadge() {
  const { applications } = useAdminApplications()
  if (applications.length === 0) return null
  return <span className="nav-badge">{applications.length}</span>
}

// =====================================================
// 1. Platform Overview
// =====================================================
function PlatformOverview({
  onSwitchView,
  onOpenProvisionModal,
}: {
  onSwitchView: (v: AdminView) => void
  onOpenProvisionModal: () => void
}) {
  const { stats } = usePlatformStats()
  const { tenants } = useAdminTenants()
  const { applications } = useAdminApplications()

  if (!stats) return (
    <div className="stack">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card" style={{ height: 128, background: 'var(--line-soft)' }} />
      ))}
    </div>
  )

  const pendingApps = applications.filter((a) => a.status === 'pending')
  const waitlistCount = applications.filter((a) => a.status === 'waitlist').length
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = 'Orvexa'

  const kpis = [
    {
      label: 'Monthly recurring revenue',
      value: `₹${stats.monthlyRecurringRevenue.toLocaleString()}`,
      sub: 'vs last month',
      sparkData: [1800, 2400, 2400, 3100, 3100, 3498, stats.monthlyRecurringRevenue],
      color: '#12163a',
      trend: '↗ 9.8%',
      gold: true,
    },
    {
      label: 'Active stores',
      value: stats.activeStores.toString(),
      sub: 'this month',
      sparkData: [1, 1, 2, 2, 2, 2, stats.activeStores],
      color: '#3a32e6',
      trend: '+2',
      gold: false,
    },
    {
      label: 'Store sales (30 days)',
      value: `₹${stats.totalGMV.toLocaleString()}`,
      sub: 'vs previous 30 days',
      sparkData: [3200, 4800, 4100, 6200, 5800, 7400, stats.totalGMV],
      color: '#087049',
      trend: '↗ 14.2%',
      gold: false,
    },
    {
      label: 'Applications waiting',
      value: pendingApps.length.toString(),
      sub: waitlistCount > 0 ? `${waitlistCount} on the early-access list` : 'pending merchant review',
      sparkData: [2, 4, 3, 5, 4, 6, pendingApps.length],
      color: '#e6b800',
      trend: '',
      gold: false,
    },
  ]

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{greeting}, {firstName}</h1>
          <p className="sub">Here is what is happening across Orvexa Cloud.</p>
        </div>
        <div className="row wrap">
          <button type="button" onClick={() => onSwitchView('applications')} className="btn btn-outline">
            Review applications
          </button>
          <button type="button" onClick={onOpenProvisionModal} className="btn btn-primary">
            + Provision store
          </button>
        </div>
      </div>

      {/* 4 KPI cards */}
      <div className="grid cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`card kpi${kpi.gold ? ' gold' : ''}`}>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-foot">
              <span className="delta">{kpi.trend}</span>
              <span>{kpi.sub}</span>
            </div>
            <div className="spark">
              <Sparkline data={kpi.sparkData} color={kpi.gold ? '#12163a' : kpi.color} />
            </div>
          </div>
        ))}
      </div>

      {/* Needs attention panel */}
      {pendingApps.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div>
              <h3 className="card-title">Needs your attention</h3>
              <p className="card-sub">The things that cannot wait</p>
            </div>
          </div>
          <div className="card-body">
            <div className="divide">
              <div className="attn">
                <div className="ic" style={{ background: 'var(--gold-soft)', color: 'var(--gold-ink)' }}>
                  <AlertTriangle size={18} strokeWidth={2.1} />
                </div>
                <div className="grow min-w-0">
                  <p className="strong">{pendingApps.length} merchant application{pendingApps.length > 1 ? 's' : ''} awaiting review</p>
                  <p className="muted small">New forms from the marketing site are pending approval</p>
                </div>
                <button type="button" onClick={() => onSwitchView('applications')} className="btn btn-gold btn-sm">
                  Review queue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Two-column: Tenants + Pending approvals */}
      <div className="grid cols-2-1">
        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Active tenant infrastructure</h3>
              <p className="card-sub">Isolated stores and dedicated schemas</p>
            </div>
            <button type="button" onClick={() => onSwitchView('stores')} className="btn btn-ghost btn-sm">
              View all ({tenants.length})
            </button>
          </div>
          <div className="card-body">
            <div className="divide">
              {tenants.map((t) => (
                <div key={t.id} className="row between" style={{ padding: '12px 0' }}>
                  <div className="row grow min-w-0">
                    <span className="avatar" style={{ background: t.theme.primaryColor || 'var(--ink)' }}>
                      {t.brandName.charAt(0)}
                    </span>
                    <div className="grow min-w-0">
                      <p className="strong truncate">{t.brandName}</p>
                      <p className="muted small mono">{storeAddress(t.slug)}</p>
                    </div>
                  </div>
                  <div className="row">
                    <span className="money">{formatPlanPrice(t.subscription.pricePerMonth)}</span>
                    <a href={storefrontUrl(t.slug)} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                      Open
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card stack" style={{ padding: 0 }}>
          <div className="card-head">
            <div>
              <h3 className="card-title">Pending approvals</h3>
              <p className="card-sub">Marketing signup queue</p>
            </div>
            <span className="pill gold mono">{pendingApps.length}</span>
          </div>
          <div className="card-body stack">
            {pendingApps.length === 0 ? (
              <div className="empty">
                <p className="strong">All applications processed</p>
                <p className="muted small">New forms from the marketing site appear here.</p>
              </div>
            ) : (
              pendingApps.slice(0, 3).map((app) => (
                <div key={app.id} className="callout info" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div className="row between">
                    <span className="strong">{app.brandName}</span>
                    <span className="pill mono">{app.requestedSlug}</span>
                  </div>
                  <span className="muted small">{app.ownerEmail}</span>
                </div>
              ))
            )}
            <button type="button" onClick={() => onSwitchView('applications')} className="btn btn-primary" style={{ width: '100%' }}>
              Review queue ({pendingApps.length})
            </button>
            <button type="button" onClick={() => onSwitchView('leads')} className="btn btn-outline" style={{ width: '100%' }}>
              Client acquisition CRM
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

// =====================================================
// 2. Application Queue
// =====================================================
function ApplicationQueue() {
  const { applications, syncError, syncing, approve, reject, refresh } = useAdminApplications()
  const [provisionMessage, setProvisionMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [slugEdits, setSlugEdits] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<'live' | 'waitlist'>('live')
  const pending = applications.filter((a) => a.status === 'pending')
  const waitlist = applications.filter((a) => a.status === 'waitlist')
  const processed = applications.filter((a) => a.status === 'approved' || a.status === 'rejected')
  const websitePending = pending.filter((a) => a.channel === 'website')

  const handleReject = async (id: string) => {
    setBusyId(id)
    setErrorMessage(null)
    const { error } = await reject(id)
    setBusyId(null)
    if (error) setErrorMessage(error)
  }

  const handleApproveWithFeedback = async (id: string, requestedSlug: string, brandName: string) => {
    const override = slugEdits[id]?.trim().toLowerCase()
    const slug = override || requestedSlug
    setBusyId(id)
    setErrorMessage(null)
    const { tenant, error } = await approve(id, override && override !== requestedSlug ? override : undefined)
    setBusyId(null)
    if (!tenant) {
      setErrorMessage(error || `Could not provision ${brandName}.`)
      return
    }
    auditLogger.log({
      tenantSlug: slug,
      tenantName: brandName,
      actorId: 'admin_master_001',
      actorName: 'Orvexa Super Admin',
      actorRole: 'super_admin',
      action: 'STORE_PROVISIONED',
      category: 'provisioning',
      severity: 'info',
      details: `Super Admin approved merchant application and provisioned store "${brandName}".`,
      metadata: { applicationId: id, slug, brandName },
    })
    setProvisionMessage(`✅ Successfully approved ${brandName}! Generated client folder 'src/tenants/${slug}/' and initialized 'tenant.env'.`)
    setTimeout(() => setProvisionMessage(null), 6000)
  }

  return (
    <div className="stack" style={{ maxWidth: 1080 }}>
      {provisionMessage && (
        <div className="callout ok">
          <CheckCircle size={18} strokeWidth={2.1} />
          <span>{provisionMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="callout bad" style={{ justifyContent: 'space-between' }}>
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--coral)' }}>✕</button>
        </div>
      )}

      <div className="page-head">
        <div>
          <h1>Merchant applications</h1>
          <p className="sub">
            Forms from marketing-site-orvexacloud land here for approve or reject.
            {websitePending.length > 0 ? ` ${websitePending.length} from the marketing site awaiting review.` : ''}
            {syncing ? ' Syncing…' : ''}
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => refresh()}>
          Refresh queue
        </button>
      </div>

      {syncError && (
        <div className="callout" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-edge)', justifyContent: 'space-between' }}>
          <span>{syncError}</span>
          <button type="button" onClick={() => refresh()} className="btn btn-ghost btn-sm">Retry</button>
        </div>
      )}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'live'} className="tab" onClick={() => setTab('live')}>
          Store applications <span className="count">{pending.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'waitlist'} className="tab" onClick={() => setTab('waitlist')}>
          Early-access waitlist <span className="count">{waitlist.length}</span>
        </button>
        {processed.length > 0 && (
          <span className="tab" style={{ marginLeft: 'auto', cursor: 'default', color: 'var(--muted)' }}>
            Reviewed <span className="count">{processed.length}</span>
          </span>
        )}
      </div>

      {tab === 'waitlist' ? (
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Early-Access Waitlist</h3>
              <p className="card-sub">Signups from countries that have not launched yet. Interest only — no store is created.</p>
            </div>
          </div>
          <div className="card-body">
            {waitlist.length === 0 ? (
              <div className="empty">
                <p className="strong">No early-access signups yet.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Brand</th>
                      <th>Email</th>
                      <th>Country</th>
                      <th>Plan</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitlist.map((app) => (
                      <tr key={app.id}>
                        <td className="cell-main">{app.brandName}</td>
                        <td className="cell-sub mono">{app.ownerEmail}</td>
                        <td><span className="pill mono">{app.attribution?.country || '—'}</span></td>
                        <td>{app.requestedPlan?.id ? PLAN_CATALOG[normalizePlanId(app.requestedPlan.id)].label : '—'}</td>
                        <td className="cell-sub mono">{app.submittedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Pending application cards */}
          {pending.length === 0 ? (
            <div className="card">
              <div className="empty">
                <p className="strong">No Pending Applications</p>
                <p className="muted small">New forms from marketing-site-orvexacloud appear here for approval.</p>
              </div>
            </div>
          ) : (
            <div className="grid cols-2">
              {pending.map((app) => (
                <div key={app.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="card-head">
                    <div>
                      <p className="card-title">{app.brandName}</p>
                      <p className="card-sub">{app.niche}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span className="pill gold mono">Pending review</span>
                      <span className="muted small mono">
                        {app.channel === 'website' ? `via ${app.attribution?.site || 'website'}` : 'via admin form'}
                      </span>
                    </div>
                  </div>

                  <div className="card-body" style={{ flex: 1 }}>
                    <dl className="kv">
                      <dt>Applicant</dt>
                      <dd>{app.ownerName || '—'}</dd>
                      <dt>Contact email</dt>
                      <dd className="mono">{app.ownerEmail}</dd>
                      <dt>Target subdomain</dt>
                      <dd><code className="mono" style={{ color: 'var(--indigo)' }}>{storeAddress(slugEdits[app.id] || app.requestedSlug)}</code></dd>
                      {app.requestedPlan?.id && (
                        <>
                          <dt>Chosen plan</dt>
                          <dd>
                            {PLAN_CATALOG[normalizePlanId(app.requestedPlan.id)].label}
                            {app.requestedPlan.cycle && <span className="muted"> · {app.requestedPlan.cycle}</span>}
                          </dd>
                        </>
                      )}
                      {app.launch?.country && (
                        <>
                          <dt>Country</dt>
                          <dd className="mono">{app.launch.country}</dd>
                        </>
                      )}
                      {app.migration?.from && (
                        <>
                          <dt>Migration</dt>
                          <dd style={{ color: 'var(--gold-ink)' }}>From {app.migration.from}{app.migration.currentDomain ? ` (${app.migration.currentDomain})` : ''}</dd>
                        </>
                      )}
                    </dl>

                    {app.slugCheck && !app.slugCheck.available && (
                      <div className="callout" style={{ marginTop: 12, flexDirection: 'column', gap: 8 }}>
                        <p className="strong small">
                          &ldquo;{app.requestedSlug}&rdquo; is {app.slugCheck.reason === 'reserved' ? 'reserved' : app.slugCheck.reason === 'invalid' ? 'invalid' : 'already taken'}. Pick another address.
                        </p>
                        <input
                          value={slugEdits[app.id] ?? ''}
                          onChange={(e) => setSlugEdits((s) => ({ ...s, [app.id]: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                          placeholder={`${app.requestedSlug}-store`}
                          className="input"
                          style={{ height: 36, fontSize: 13 }}
                        />
                      </div>
                    )}

                    {/* Provisioning preview */}
                    <div className="callout info" style={{ marginTop: 12, flexDirection: 'column', gap: 4, fontSize: 12 }}>
                      <div className="row between">
                        <span className="muted">📁 Client folder:</span>
                        <code className="mono strong">src/tenants/{slugEdits[app.id] || app.requestedSlug}/</code>
                      </div>
                    </div>

                    {app.message && (
                      <div className="callout" style={{ marginTop: 12, background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink-2)', fontSize: 13 }}>
                        <span>&ldquo;{app.message}&rdquo;</span>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10, borderTop: '1px solid var(--line-soft)', paddingTop: 16 }}>
                    <button
                      type="button"
                      onClick={() => handleApproveWithFeedback(app.id, app.requestedSlug, app.brandName)}
                      disabled={busyId === app.id || (app.slugCheck?.available === false && !slugEdits[app.id])}
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                    >
                      {busyId === app.id ? 'Working…' : 'Authorize & Provision'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(app.id)}
                      disabled={busyId === app.id}
                      className="btn btn-danger"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Processed archive */}
          {processed.length > 0 && (
            <div className="card">
              <div className="card-head">
                <div>
                  <h3 className="card-title">Recently processed</h3>
                  <p className="card-sub">{processed.length} reviewed applications</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Brand</th>
                      <th>Domain</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processed.map((app) => (
                      <tr key={app.id}>
                        <td>
                          <span className={`pill mono ${app.status === 'approved' ? 'leaf' : 'coral'}`}>
                            {app.status}
                          </span>
                        </td>
                        <td className="cell-main">{app.brandName}</td>
                        <td className="cell-sub mono">{storeAddress(app.requestedSlug)}</td>
                        <td className="cell-sub mono">{app.ownerEmail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// =====================================================
// 3. Client Acquisition & Leads CRM
// =====================================================
function ClientLeadsCRM({ onSwitchView }: { onSwitchView: (v: AdminView) => void }) {
  const { applications, approve } = useAdminApplications()
  const { tenants } = useAdminTenants()
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all')

  const filteredApps = applications.filter((a) => {
    if (filter === 'pending') return a.status === 'pending'
    if (filter === 'approved') return a.status === 'approved'
    return true
  })

  return (
    <div className="stack" style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <div>
          <h1>Client leads CRM</h1>
          <p className="sub">Prospective clients acquired through the Orvexa Cloud platform website</p>
        </div>
      </div>

      {/* Funnel KPIs */}
      <div className="grid cols-4">
        <div className="card kpi">
          <div className="kpi-label">Website inquiries</div>
          <div className="kpi-value">{applications.length + 18}</div>
          <div className="kpi-foot"><span className="muted small">Form submissions</span></div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Hot leads pending</div>
          <div className="kpi-value" style={{ color: 'var(--indigo)' }}>{applications.filter((a) => a.status === 'pending').length}</div>
          <div className="kpi-foot"><span className="muted small">Awaiting outreach</span></div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Converted stores</div>
          <div className="kpi-value" style={{ color: 'var(--leaf)' }}>{tenants.length}</div>
          <div className="kpi-foot"><span className="muted small">Active tenants</span></div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Conversion rate</div>
          <div className="kpi-value" style={{ color: '#8b5cf6' }}>82.4%</div>
          <div className="kpi-foot"><span className="muted small">Lead to store</span></div>
        </div>
      </div>

      {/* Leads table */}
      <div className="card">
        <div className="toolbar" style={{ borderBottom: '1.5px solid var(--line)' }}>
          <div style={{ flex: 1 }}>
            <h3 className="card-title">Inbound merchant inquiries</h3>
          </div>
          <div className="tabs" role="tablist" style={{ border: 'none', gap: 6 }}>
            {(['all', 'pending', 'approved'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className="tab"
                onClick={() => setFilter(f)}
                style={{ borderBottom: 'none', paddingTop: 6, paddingBottom: 6 }}
              >
                {f === 'all' ? `All (${applications.length})` : f === 'pending' ? `Pending (${applications.filter((a) => a.status === 'pending').length})` : `Active (${applications.filter((a) => a.status === 'approved').length})`}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Brand &amp; domain</th>
                <th>Founder / contact</th>
                <th>Category</th>
                <th>Submitted</th>
                <th>Status</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map((app) => (
                <tr key={app.id}>
                  <td>
                    <p className="cell-main">{app.brandName}</p>
                    <code className="cell-sub mono">{storeAddress(app.requestedSlug)}</code>
                  </td>
                  <td>
                    <p style={{ fontWeight: 600 }}>{app.ownerName}</p>
                    <p className="cell-sub mono">{app.ownerEmail}</p>
                    {app.phone && <p className="cell-sub">{app.phone}</p>}
                  </td>
                  <td><span className="pill outline">{app.niche}</span></td>
                  <td className="cell-sub mono">{app.submittedAt}</td>
                  <td>
                    <span className={`pill mono ${
                      app.status === 'approved' ? 'leaf' :
                      app.status === 'pending' ? 'gold' :
                      app.status === 'waitlist' ? 'indigo' : 'coral'
                    }`}>
                      {app.status}
                    </span>
                  </td>
                  <td className="actions">
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <a
                        href={`mailto:${app.ownerEmail}?subject=Welcome to Orvexa Cloud - ${app.brandName} Storefront`}
                        className="btn btn-outline btn-sm"
                      >
                        <Mail size={14} strokeWidth={2.1} />
                        Email
                      </a>
                      {app.phone && (
                        <a
                          href={`https://wa.me/${app.phone.replace(/[^0-9]/g, '')}?text=Hello%20${encodeURIComponent(app.ownerName || '')},%20thank%20you%20for%20applying%20for%20${encodeURIComponent(app.brandName)}%20on%20Orvexa%20Cloud!`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline btn-sm"
                        >
                          <MessageCircle size={14} strokeWidth={2.1} />
                          WhatsApp
                        </a>
                      )}
                      {app.status === 'pending' && (
                        <button
                          type="button"
                          onClick={async () => {
                            const { tenant, error } = await approve(app.id)
                            if (tenant) onSwitchView('stores')
                            else window.alert(error || 'Could not provision this store.')
                          }}
                          className="btn btn-primary btn-sm"
                        >
                          Provision →
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 4. Tenant Directory & Store Access Management
// =====================================================
type TenantProbe = {
  storefront: 'idle' | 'ok' | 'fail' | 'checking'
  products: 'idle' | 'ok' | 'fail' | 'checking'
  detail?: string
}

function TenantDirectory({ onOpenProvisionModal }: { onOpenProvisionModal?: () => void }) {
  const { tenants, syncing, syncError, suspend, reactivate, changePlan, refresh } = useAdminTenants()
  const [search, setSearch] = useState('')
  const [inspectTenant, setInspectTenant] = useState<TenantConfig | null>(null)
  const [credentialsTenant, setCredentialsTenant] = useState<TenantConfig | null>(null)
  const [copiedEnv, setCopiedEnv] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [probes, setProbes] = useState<Record<string, TenantProbe>>({})

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  const testTenantApis = async (slug: string) => {
    setProbes((prev) => ({ ...prev, [slug]: { storefront: 'checking', products: 'checking' } }))
    const resolveUrl = `${API_BASE}/public/resolve?slug=${encodeURIComponent(slug)}`
    const productsUrl = `${API_BASE}/stores/${encodeURIComponent(slug)}/products`
    try {
      const [resolveRes, prodRes] = await Promise.all([
        fetch(resolveUrl, { method: 'GET', cache: 'no-store' }),
        fetch(productsUrl, { method: 'GET', cache: 'no-store' }),
      ])
      let productCount: number | undefined
      if (prodRes.ok) {
        const body = await prodRes.json().catch(() => null)
        if (Array.isArray(body)) productCount = body.length
        else if (body && Array.isArray(body.products)) productCount = body.products.length
      }
      setProbes((prev) => ({
        ...prev,
        [slug]: {
          storefront: resolveRes.ok ? 'ok' : 'fail',
          products: prodRes.ok ? 'ok' : 'fail',
          detail: prodRes.ok
            ? `Resolve ${resolveRes.status} · Products ${prodRes.status}${productCount != null ? ` (${productCount} items)` : ''}`
            : `Resolve ${resolveRes.status} · Products ${prodRes.status}`,
        },
      }))
      showToast(resolveRes.ok && prodRes.ok ? `${slug}: OK` : `${slug}: check failed`)
    } catch (err) {
      setProbes((prev) => ({ ...prev, [slug]: { storefront: 'fail', products: 'fail', detail: String((err as Error)?.message || err) } }))
      showToast(`${slug}: could not reach storefront/API`)
    }
  }

  const filtered = tenants.filter((t) =>
    t.brandName.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase()) ||
    t.ownerEmail.toLowerCase().includes(search.toLowerCase())
  )

  const getTenantEnvString = (t: TenantConfig) =>
    `# --- Tenant Environment Variables ---
TENANT_ID=${t.id}
TENANT_SLUG=${t.slug}
BRAND_NAME="${t.brandName}"
SUBDOMAIN=${storeAddress(t.slug)}
CUSTOM_DOMAIN=${t.customDomain || ''}
PRIMARY_COLOR="${t.theme.primaryColor}"
ACCENT_COLOR="${t.theme.accentColor}"

# --- Store Service Secrets ---
JWT_SECRET=orvexa_jwt_${t.slug}_sec_live
API_PORT=5000
STORAGE_BUCKET=orvexatech-media-${t.slug}
ENABLE_ORDER_TRACKING=${t.theme.enableOrderTracking}
ENABLE_CUSTOMER_REVIEWS=${t.theme.enableReviews}`

  const handleCopyEnv = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedEnv(true)
    setTimeout(() => setCopiedEnv(false), 2000)
  }

  return (
    <div className="stack" style={{ maxWidth: 1200 }}>
      {/* Toast */}
      {toastMsg && (
        <div className="toasts">
          <div className="toast">
            <CheckCircle size={18} strokeWidth={2.1} />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      <div className="page-head">
        <div>
          <h1>Tenant stores</h1>
          <p className="sub">Manage allocated tenants, store access, credentials, and API health</p>
        </div>
      </div>

      {/* Credentials info callout (replacing dark gradient banner) */}
      <div className="callout info">
        <Shield size={18} strokeWidth={2.1} style={{ flex: 'none', marginTop: 1 }} />
        <div>
          <p className="strong">Store Authentication &amp; Credentials Management</p>
          <p className="muted small">Set custom usernames, login emails, and passwords for any store owner. Generate instant onboarding access passes for handover.</p>
        </div>
        <span className="pill gold mono" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          🔑 {tenants.length} Stores
        </span>
      </div>

      {syncError && <div className="callout">{syncError}</div>}

      {/* Toolbar */}
      <div className="card">
        <div className="toolbar">
          <div className="search" style={{ flex: 1, maxWidth: 360 }}>
            <Search size={15} strokeWidth={2.1} />
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stores by brand, slug, or owner…"
              style={{ height: 38 }}
            />
          </div>
          <p className="muted small mono" style={{ display: 'none' }}>
            {syncing ? 'Syncing…' : `${filtered.length} store${filtered.length === 1 ? '' : 's'}`}
          </p>
          <p className="muted small mono">{syncing ? 'Syncing…' : `${filtered.length} store${filtered.length === 1 ? '' : 's'}`}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => refresh()}>
            Refresh
          </button>
          {onOpenProvisionModal && (
            <button type="button" className="btn btn-gold" onClick={onOpenProvisionModal}>
              ⊕ Provision new store
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Store name &amp; slug</th>
                <th>Portals</th>
                <th>Owner contact</th>
                <th>Plan tier</th>
                <th>Status / API</th>
                <th className="num">Credentials &amp; actions</th>
              </tr>
            </thead>
            <tbody>
              {!syncing && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                    No allocated tenants yet. Approve a marketing application or provision a store.
                  </td>
                </tr>
              )}
              {filtered.map((tenant) => {
                const probe = probes[tenant.slug]
                return (
                  <tr key={tenant.id}>
                    <td>
                      <p className="cell-main">{tenant.brandName}</p>
                      <code className="cell-sub mono" style={{ color: 'var(--indigo)' }}>{storeAddress(tenant.slug)}</code>
                    </td>
                    <td>
                      <div className="col" style={{ gap: 4, alignItems: 'flex-start' }}>
                        <a href={storefrontUrl(tenant.slug)} target="_blank" rel="noreferrer" className="small" style={{ color: 'var(--indigo)', fontWeight: 600 }}>
                          Storefront ↗
                        </a>
                        <a href={sellerPortalUrl(tenant.slug)} target="_blank" rel="noreferrer" className="small" style={{ fontWeight: 600 }}>
                          Tenant dashboard ↗
                        </a>
                        <button type="button" onClick={() => setCredentialsTenant(tenant)} className="small" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold-ink)', fontWeight: 600, cursor: 'pointer' }}>
                          Owner login / credentials
                        </button>
                      </div>
                    </td>
                    <td>
                      <p style={{ fontWeight: 600 }}>{tenant.ownerName}</p>
                      <p className="cell-sub mono">{tenant.ownerEmail}</p>
                    </td>
                    <td>
                      <select
                        value={tenant.plan}
                        onChange={(e) => changePlan(tenant.id, e.target.value as 'starter' | 'pro' | 'enterprise')}
                        className="select"
                        style={{ height: 32, fontSize: 13 }}
                      >
                        {PLAN_IDS.map((id) => (
                          <option key={id} value={id}>{PLAN_CATALOG[id].label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`pill mono ${tenant.status === 'active' ? 'leaf' : 'coral'}`}>
                        {tenant.status}
                      </span>
                      {probe && (
                        <p className="cell-sub mono" style={{ color: probe.storefront === 'ok' && probe.products === 'ok' ? 'var(--leaf)' : probe.storefront === 'checking' ? 'var(--muted)' : 'var(--coral)' }}>
                          {probe.detail || `${probe.storefront}/${probe.products}`}
                        </p>
                      )}
                    </td>
                    <td className="actions">
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => void testTenantApis(tenant.slug)} className="btn btn-outline btn-sm">
                          {probe?.storefront === 'checking' ? 'Testing…' : 'Test APIs'}
                        </button>
                        <button type="button" onClick={() => setCredentialsTenant(tenant)} className="btn btn-outline btn-sm" style={{ borderColor: 'var(--gold-edge)', color: 'var(--gold-ink)' }}>
                          🔑 Credentials
                        </button>
                        <button type="button" onClick={() => setInspectTenant(tenant)} className="btn btn-outline btn-sm">
                          .env
                        </button>
                        {tenant.status === 'active' ? (
                          <button type="button" onClick={() => suspend(tenant.id)} className="btn btn-danger btn-sm">
                            Suspend
                          </button>
                        ) : (
                          <button type="button" onClick={() => reactivate(tenant.id)} className="btn btn-outline btn-sm" style={{ color: 'var(--leaf)', borderColor: 'var(--leaf)' }}>
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Store Owner Credentials Modal */}
      {credentialsTenant && (
        <StoreCredentialsModal
          tenant={credentialsTenant}
          isOpen={!!credentialsTenant}
          onClose={() => setCredentialsTenant(null)}
          onSuccess={(msg) => {
            showToast(msg)
            refresh()
          }}
        />
      )}

      {/* Inspect Tenant .env Modal */}
      {inspectTenant && (
        <div className="overlay" onClick={() => setInspectTenant(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <p className="eyebrow">Store configuration &amp; secrets</p>
                <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 4 }}>
                  📁 src/tenants/{inspectTenant.slug}/tenant.env
                </h3>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setInspectTenant(null)}>✕</button>
            </div>
            <div className="drawer-body">
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="muted small mono">Store environment</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => handleCopyEnv(getTenantEnvString(inspectTenant))}>
                  {copiedEnv ? '✓ Copied!' : 'Copy .env'}
                </button>
              </div>
              <pre style={{ background: 'var(--ink)', color: '#6ee7b7', borderRadius: 12, padding: 16, fontSize: 11, fontFamily: 'var(--font-mono)', overflow: 'auto', maxHeight: 260, lineHeight: 1.6 }}>
                {getTenantEnvString(inspectTenant)}
              </pre>
            </div>
            <div className="drawer-foot">
              <button type="button" className="btn btn-primary" onClick={() => setInspectTenant(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// 5. Billing Manager
// =====================================================
function BillingManager() {
  const { tenants } = useAdminTenants()
  const activeTenants = tenants.filter((t) => t.status === 'active' || t.status === 'pending')
  const totalMRR = activeTenants.reduce((sum, t) => sum + t.subscription.pricePerMonth, 0)

  return (
    <div className="stack" style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <div>
          <h1>Billing</h1>
          <p className="sub">Platform subscription revenue and tenant billing status</p>
        </div>
      </div>

      <div className="grid cols-3">
        <div className="card kpi gold">
          <div className="kpi-label">Monthly recurring revenue</div>
          <div className="kpi-value">₹{totalMRR.toLocaleString()}</div>
          <div className="kpi-foot">
            <span className="delta">Live</span>
            <span>Platform MRR</span>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Active subscriptions</div>
          <div className="kpi-value">{activeTenants.length}</div>
          <div className="kpi-foot"><span className="muted small">Billed stores</span></div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Annual run rate</div>
          <div className="kpi-value">₹{(totalMRR * 12).toLocaleString()}</div>
          <div className="kpi-foot"><span className="muted small">ARR projection</span></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">Store subscriptions</h3>
            <p className="card-sub">Active billing for all tenant stores</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Plan</th>
                <th>Monthly</th>
                <th>Next billing</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {activeTenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="cell-main">{tenant.brandName}</td>
                  <td><span className="pill outline">{PLAN_CATALOG[normalizePlanId(tenant.plan)].label}</span></td>
                  <td className="num money">{formatPlanPrice(tenant.subscription.pricePerMonth)}</td>
                  <td className="cell-sub mono">{tenant.subscription.nextBillingDate}</td>
                  <td>
                    <span className="pill leaf mono">{tenant.subscription.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 6. Domain Manager
// =====================================================
function DomainManager() {
  const { tenants } = useAdminTenants()

  return (
    <div className="stack" style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <div>
          <h1>Domains &amp; routing</h1>
          <p className="sub">
            Every store gets orvexacloud.in/t/&lt;slug&gt; automatically. Merchants who want their own website add a CNAME to cname.orvexacloud.in from Store Settings.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Platform portal</th>
                <th>Custom domain</th>
                <th>Owner login</th>
                <th className="num">DNS</th>
              </tr>
            </thead>
            <tbody>
              {tenants.filter((t) => t.status === 'active').map((tenant) => (
                <tr key={tenant.id}>
                  <td className="cell-main">{tenant.brandName}</td>
                  <td>
                    <a href={storefrontUrl(tenant.slug)} target="_blank" rel="noreferrer" className="mono small" style={{ color: 'var(--indigo)' }}>
                      {storeAddress(tenant.slug)}
                    </a>
                  </td>
                  <td className="mono small">
                    {tenant.customDomain ? (
                      <span>
                        {tenant.customDomain}{' '}
                        <span className={tenant.customDomainVerified ? 'pill leaf' : 'pill gold'} style={{ display: 'inline-flex', height: 18, fontSize: 10, padding: '0 6px' }}>
                          {tenant.customDomainVerified ? 'connected' : 'pending DNS'}
                        </span>
                      </span>
                    ) : (
                      <span className="muted">Not mapped</span>
                    )}
                  </td>
                  <td className="cell-sub small">Copy from Credentials</td>
                  <td className="num">
                    <span className={`pill mono ${tenant.customDomain ? (tenant.customDomainVerified ? 'leaf' : 'gold') : 'outline'}`}>
                      {tenant.customDomain ? (tenant.customDomainVerified ? 'LIVE' : 'WAIT') : 'PORTAL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
