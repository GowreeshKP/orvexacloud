import { useState, useEffect } from 'react'
import { useAdminTenants, useAdminApplications, usePlatformStats } from '@/api/hooks'
import { authService, type AdminSession } from '@/api/auth'
import { auditLogger } from '@/api/audit-logger'
import AdminLogin from '@/components/auth/AdminLogin'
import ResetPasswordModal from '@/components/auth/ResetPasswordModal'
import StoreCredentialsModal from '@/components/auth/StoreCredentialsModal'
import ProvisionStoreModal from '@/components/platform/ProvisionStoreModal'
import PlatformAuditLogs from '@/components/platform/PlatformAuditLogs'
import type { TenantConfig } from '@/types/tenant'
import { PLAN_CATALOG, PLAN_IDS, formatPlanPrice, normalizePlanId, storeAddress } from '@/data/plans'

const ADMIN_NAV = [
  { id: 'dashboard', label: 'Platform Overview', icon: 'overview' },
  { id: 'applications', label: 'Merchant Applications', icon: 'applications' },
  { id: 'leads', label: 'Client Acquisition CRM', icon: 'leads' },
  { id: 'stores', label: 'Tenant Stores', icon: 'stores' },
  { id: 'billing', label: 'Subscriptions & Billing', icon: 'billing' },
  { id: 'domains', label: 'Domains & Routing', icon: 'domains' },
  { id: 'audit', label: 'Security & Audit Trail', icon: 'audit' },
] as const

type AdminView = (typeof ADMIN_NAV)[number]['id']

const STORE_STATUSES: { id: TenantConfig['status']; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'read_only', label: 'Read only' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'pending', label: 'Pending' },
  { id: 'cancelled', label: 'Cancelled' },
]

function statusBadgeClass(status: string): string {
  if (status === 'active' || status === 'approved' || status === 'paid') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'read_only' || status === 'needs_info' || status === 'pending' || status === 'trial' || status === 'past_due') return 'bg-amber-50 text-amber-800 border-amber-200'
  if (status === 'waitlist') return 'bg-sky-50 text-sky-700 border-sky-200'
  if (status === 'cancelled') return 'bg-slate-100 text-slate-600 border-slate-200'
  return 'bg-rose-50 text-rose-700 border-rose-200'
}

// --- SVG Icons for Enterprise Aesthetic ---
function NavIcon({ type, className = 'w-4 h-4' }: { type: string; className?: string }) {
  switch (type) {
    case 'overview':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      )
    case 'applications':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      )
    case 'leads':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      )
    case 'stores':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.614A2.993 2.993 0 009 9.35c.801 0 1.543-.315 2.096-.832a2.995 2.995 0 004.808 0A2.993 2.993 0 0018 9.35a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.65c0 .414.336.75.75.75z" />
        </svg>
      )
    case 'billing':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
        </svg>
      )
    case 'domains':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
        </svg>
      )
    case 'audit':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      )
    default:
      return null
  }
}

// --- Real Curved SVG Sparkline Component ---
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

export default function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(() => authService.getAdminSession())
  const [activeView, setActiveView] = useState<AdminView>('dashboard')
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false)
  const [adminToast, setAdminToast] = useState<string | null>(null)
  const { provisionTenant, refresh: refreshTenants } = useAdminTenants()

  // URL Reset Token Detection for Store Owners
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
    <div className="min-h-screen text-slate-900 flex bg-[#f8fafc] font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Sleek Enterprise Sidebar */}
      <aside className="w-64 flex flex-col flex-shrink-0 bg-white border-r border-slate-200/80 shadow-[1px_0_8px_rgba(0,0,0,0.02)] z-30">
        {/* Platform Brand */}
        <div className="h-16 flex items-center px-5 gap-3 border-b border-slate-100/90">
          <div className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center text-white text-xs font-black shadow-sm ring-1 ring-white/20">
            <span className="bg-gradient-to-tr from-amber-400 to-indigo-400 bg-clip-text text-transparent">O</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-950 tracking-tight">Orvexa Cloud</span>
              <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">v2.4</span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">SUPER ADMIN CONSOLE</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="p-3">
          <div className="flex items-center justify-between px-3 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Platform Management</p>
          </div>
          <nav className="space-y-1">
            {ADMIN_NAV.map((item) => {
              const isActive = activeView === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-slate-950 text-white shadow-sm shadow-slate-950/15'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/80'
                  }`}
                >
                  <NavIcon type={item.icon} className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === 'applications' && <PendingBadge />}
                  {item.id === 'leads' && <LeadsBadge />}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Live Cluster Info Card */}
        <div className="mt-auto p-3">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 mb-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Cluster Status</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Operational
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Region:</span>
                <span className="font-semibold text-slate-800">Set by hosting</span>
              </div>
              <div className="flex justify-between">
                <span>Master DB:</span>
                <span className="font-semibold text-slate-800">MongoDB Atlas</span>
              </div>
            </div>
          </div>

          {/* Super Admin User Footer */}
          <div className="p-2.5 rounded-xl border border-slate-200/80 bg-white flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold ring-2 ring-slate-100 flex-shrink-0">
                {session.name?.charAt(0).toUpperCase() || 'A'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate leading-tight">{session.name || 'Super Admin'}</p>
                <p className="text-[9px] font-mono text-slate-400 truncate">master@orvexatech.com</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out Super Admin"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace View */}
      <main className="flex-1 overflow-y-auto min-h-screen">
        {/* Top App Bar */}
        <header className="h-16 sticky top-0 z-20 flex items-center justify-between px-8 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold text-slate-900 tracking-tight">
              {ADMIN_NAV.find((n) => n.id === activeView)?.label}
            </h1>
            <span className="text-slate-300">/</span>
            <span className="text-xs text-slate-400 font-mono">Platform Admin</span>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="/t/lunar"
              target="_blank"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer"
            >
              <span>🏪</span>
              <span>Storefront Demo ↗</span>
            </a>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
              Super Admin Session Active
            </span>
          </div>
        </header>

        {/* Content Container */}
        <div className="p-8 max-w-7xl mx-auto">
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
        </div>
      </main>

      {/* Provision Store Modal */}
      <ProvisionStoreModal
        isOpen={isProvisionModalOpen}
        onClose={() => setIsProvisionModalOpen(false)}
        onProvision={provisionTenant}
        onSuccess={(newTenant) => {
          refreshTenants()
          setActiveView('stores')
          setAdminToast(`✅ Store "${newTenant.brandName}" provisioned with isolated database orvexa_tenant_${newTenant.slug}!`)
          setTimeout(() => setAdminToast(null), 5000)
        }}
      />

      {/* Password Reset Modal in Console */}
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

      {/* Global Admin Toast */}
      {adminToast && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 border border-emerald-500/40 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs animate-slide-down">
          <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center justify-center text-[11px]">✓</span>
          <span>{adminToast}</span>
        </div>
      )}
    </div>
  )
}

function PendingBadge() {
  const { applications } = useAdminApplications()
  const pending = applications.filter((a) => a.status === 'pending' || a.status === 'needs_info').length
  if (pending === 0) return null
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-mono shadow-xs">
      {pending}
    </span>
  )
}

function LeadsBadge() {
  const { applications } = useAdminApplications()
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-500 text-white font-mono shadow-xs">
      {applications.length}
    </span>
  )
}

// =====================================================
// 1. Platform Overview (Enterprise Redesign)
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
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-slate-200 animate-pulse" />)}
    </div>
  )

  const pendingApps = applications.filter((a) => a.status === 'pending')

  const kpis = [
    {
      label: 'Gross Merchandise Value',
      value: `₹${stats.totalGMV.toLocaleString()}`,
      sub: 'Cumulative merchant store GMV',
      sparkData: [3200, 4800, 4100, 6200, 5800, 7400, stats.totalGMV],
      color: '#10b981',
      trend: '+24.8%',
      trendPositive: true,
    },
    {
      label: 'Active Merchant Stores',
      value: stats.activeStores.toString(),
      sub: 'Multi-tenant isolated clusters',
      sparkData: [1, 1, 2, 2, 2, 2, stats.activeStores],
      color: '#6366f1',
      trend: '+2 this month',
      trendPositive: true,
    },
    {
      label: 'Monthly Recurring Revenue',
      value: `₹${stats.monthlyRecurringRevenue.toLocaleString()}`,
      sub: 'Store SaaS subscriptions',
      sparkData: [1800, 2400, 2400, 3100, 3100, 3498, stats.monthlyRecurringRevenue],
      color: '#8b5cf6',
      trend: '+18.4%',
      trendPositive: true,
    },
    {
      label: 'Client Inbound Leads',
      value: applications.length.toString(),
      sub: 'Website application funnel',
      sparkData: [2, 4, 3, 5, 4, 6, applications.length],
      color: '#06b6d4',
      trend: `${pendingApps.length} pending review`,
      trendPositive: true,
    },
    {
      label: 'Consumer Reach',
      value: `${stats.totalCustomers} Accounts`,
      sub: 'Verified buyers across stores',
      sparkData: [2, 3, 3, 4, 4, 5, stats.totalCustomers],
      color: '#f59e0b',
      trend: '+12.6%',
      trendPositive: true,
    },
  ]

  return (
    <div className="space-y-7">
      {/* Sleek Obsidian Enterprise Hero Banner */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-xl text-white p-7">
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#6366f1 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute right-0 top-0 w-[500px] h-[300px] bg-gradient-to-bl from-indigo-500/10 via-purple-500/5 to-transparent blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE MULTI-TENANT CLUSTER
              </span>
              <span className="text-slate-600 text-xs">•</span>
              <span className="text-[11px] font-mono text-slate-400">ISOLATION: DATABASE-PER-STORE</span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Platform Command Center
            </h2>
            <p className="text-xs text-slate-300/80 leading-relaxed">
              Super Admin master controls for provisioning tenant databases, reviewing inbound client leads from the
              marketing website, monitoring cluster-wide GMV, and managing custom domain DNS routing.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={onOpenProvisionModal}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-white text-slate-950 hover:bg-slate-100 transition-all cursor-pointer shadow-md shadow-white/10 flex items-center gap-2"
            >
              <span>⊕</span>
              <span>Provision Store</span>
            </button>
            <button
              onClick={() => onSwitchView('applications')}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-all cursor-pointer flex items-center gap-2"
            >
              <span>📋</span>
              <span>Review Apps ({stats.pendingApplications})</span>
            </button>
            <button
              onClick={() => onSwitchView('leads')}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer flex items-center gap-2"
            >
              <span>👥</span>
              <span>Client CRM</span>
            </button>
          </div>
        </div>

        {/* Live Cluster Micro-Telemetry Bar */}
        <div className="relative z-10 mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Master DB Status</p>
            <p className="font-semibold text-emerald-400 mt-0.5">● Connected (orvexatech_master)</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Average API Latency</p>
            <p className="font-semibold text-slate-200 mt-0.5">18ms (Cluster Health: 100%)</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Isolated Databases</p>
            <p className="font-semibold text-indigo-400 mt-0.5">{stats.activeStores} Dedicated Schemas</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Client Onboarding</p>
            <p className="font-semibold text-slate-200 mt-0.5">Website Funnel Active</p>
          </div>
        </div>
      </div>

      {/* KPI Cards with Smooth Sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl p-5 bg-white border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  kpi.trendPositive
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {kpi.trend}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="text-2xl font-bold tracking-tight text-slate-900">{kpi.value}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-end justify-between">
              <span className="text-[10px] text-slate-400 font-medium">{kpi.sub}</span>
              <Sparkline data={kpi.sparkData} color={kpi.color} />
            </div>
          </div>
        ))}
      </div>

      {/* Two Column Layout: Active Tenants & Pending Applications */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Store Clusters Overview */}
        <div className="lg:col-span-2 rounded-xl bg-white border border-slate-200/80 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Active Tenant Infrastructure</h3>
              <p className="text-xs text-slate-400">Real-time status of isolated tenant stores & dedicated schemas</p>
            </div>
            <button
              onClick={() => onSwitchView('stores')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer"
            >
              View All ({tenants.length}) →
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {tenants.map((t) => (
              <div key={t.id} className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-xs flex-shrink-0" style={{ backgroundColor: t.theme.primaryColor || '#000' }}>
                    {t.brandName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{t.brandName}</p>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                      <span>{storeAddress(t.slug)}</span>
                      <span>•</span>
                      <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        db: orvexa_tenant_{t.slug}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-semibold text-slate-700">{formatPlanPrice(t.subscription.pricePerMonth)}</span>
                  <a
                    href={`/t/${t.slug}`}
                    target="_blank"
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-200 transition-colors"
                  >
                    Open Store ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Review / Actions Panel */}
        <div className="rounded-xl bg-white border border-slate-200/80 shadow-sm p-6 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-bold text-slate-900">Pending Approvals</h3>
              <span className="text-xs font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {pendingApps.length} Queue
              </span>
            </div>

            {pendingApps.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-2xl mb-2">✨</p>
                <p className="text-xs font-semibold text-slate-700">All applications processed</p>
                <p className="text-[11px] text-slate-400 mt-0.5">No pending merchant requests.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingApps.slice(0, 2).map((app) => (
                  <div key={app.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-900">{app.brandName}</p>
                      <span className="text-[10px] font-mono text-slate-500">{app.requestedSlug}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{app.ownerEmail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2">
            <button
              onClick={() => onSwitchView('applications')}
              className="w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-slate-950 text-white hover:bg-slate-800 transition-all cursor-pointer shadow-sm"
            >
              Review Application Queue ({pendingApps.length}) →
            </button>
            <button
              onClick={() => onSwitchView('leads')}
              className="w-full py-2 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-all cursor-pointer border border-indigo-200"
            >
              Open Client Acquisition CRM
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 2. Application Queue
// =====================================================
function ApplicationQueue() {
  const { applications, approve, reject, requestInfo, notifyWaitlist } = useAdminApplications()
  const [provisionMessage, setProvisionMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [slugEdits, setSlugEdits] = useState<Record<string, string>>({})
  const [askingId, setAskingId] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null)
  const [notifying, setNotifying] = useState(false)
  const [tab, setTab] = useState<'live' | 'waitlist'>('live')
  const inReview = applications.filter((a) => a.status === 'pending' || a.status === 'needs_info')
  const waitlist = applications.filter((a) => a.status === 'waitlist')
  const processed = applications.filter((a) => a.status === 'approved' || a.status === 'rejected')

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
      details: `Super Admin approved merchant application and provisioned store "${brandName}" with isolated database orvexa_tenant_${slug}.`,
      metadata: { applicationId: id, slug, brandName },
    })
    setProvisionMessage(`✅ Successfully approved ${brandName}! Generated client folder 'src/tenants/${slug}/', initialized 'tenant.env', and provisioned isolated database 'orvexa_tenant_${slug}'.`)
    setTimeout(() => setProvisionMessage(null), 6000)
  }

  const handleRequestInfo = async (id: string) => {
    setBusyId(id)
    setErrorMessage(null)
    const { error } = await requestInfo(id, question)
    setBusyId(null)
    if (error) {
      setErrorMessage(error)
      return
    }
    setAskingId(null)
    setQuestion('')
    setProvisionMessage('Question sent. The application stays in review and can be approved once they reply.')
    setTimeout(() => setProvisionMessage(null), 6000)
  }

  const handleNotifyCountry = async (code: string) => {
    setNotifying(true)
    setErrorMessage(null)
    setNotifyMessage(null)
    const result = await notifyWaitlist(code)
    setNotifying(false)
    if (result.error) {
      setErrorMessage(result.error)
      return
    }
    const label = code.trim().toUpperCase()
    const people = result.notified === 1 ? 'person' : 'people'
    setNotifyMessage(
      `Emailed ${result.notified ?? 0} ${people} in ${label}.` +
      (result.failed ? ` ${result.failed} could not be sent.` : '') +
      (result.hasMore ? ' More are still waiting — run it again.' : '')
    )
  }

  return (
    <div className="space-y-7 max-w-6xl">
      {provisionMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-3.5 rounded-xl text-xs font-semibold flex items-center gap-3 shadow-xs animate-slide-down">
          <span className="text-lg">📁</span>
          <span>{provisionMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-5 py-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 shadow-xs">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer">✕</button>
        </div>
      )}

      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setTab('live')}
          className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${tab === 'live' ? 'bg-slate-900 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Store Applications ({inReview.length})
        </button>
        <button
          onClick={() => setTab('waitlist')}
          className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${tab === 'waitlist' ? 'bg-slate-900 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Early-Access Waitlist ({waitlist.length})
        </button>
      </div>

      {tab === 'waitlist' ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Early-Access Waitlist</h3>
            <p className="text-xs text-slate-400">Signups from countries that have not launched yet. These are interest only: no store is created and nobody is charged. When a country is added to the website launch list, email that country once.</p>
          </div>
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500">
              Country code
              <input
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                placeholder="AE"
                maxLength={2}
                className="mt-1 block w-24 px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono text-xs uppercase focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </label>
            <button
              onClick={() => handleNotifyCountry(countryCode)}
              disabled={notifying || countryCode.length !== 2}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {notifying ? 'Sending…' : 'Email this country'}
            </button>
            {notifyMessage && <p className="text-xs text-emerald-700 font-medium">{notifyMessage}</p>}
          </div>
          {waitlist.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-400">No early-access signups yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {waitlist.map((app) => (
                <div key={app.id} className="p-4 flex items-center justify-between gap-4 text-xs flex-wrap">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{app.brandName}</p>
                    <p className="font-mono text-slate-400">{app.ownerEmail}</p>
                  </div>
                  <div className="flex items-center gap-3 text-slate-500">
                    <span className="font-mono font-bold text-slate-700">{app.launch?.country || app.attribution?.country || '—'}</span>
                    {app.requestedPlan?.id && <span>{PLAN_CATALOG[normalizePlanId(app.requestedPlan.id)].label}</span>}
                    <span className={app.consents?.marketing ? 'text-emerald-600' : 'text-slate-400'}>
                      {app.consents?.marketing ? 'Marketing opt-in' : 'No marketing consent'}
                    </span>
                    {app.launchNotifiedAt ? (
                      <span className="text-emerald-700">Notified {app.launchNotifiedAt.slice(0, 10)}</span>
                    ) : app.launch?.country ? (
                      <button
                        onClick={() => handleNotifyCountry(app.launch?.country || '')}
                        disabled={notifying}
                        className="px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
                      >
                        Email {app.launch.country}
                      </button>
                    ) : null}
                    <span className="font-mono">{app.submittedAt}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Pending Applications Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">Pending Onboarding Requests</h3>
            <p className="text-xs text-slate-400">Review brand details and authorize automated tenant folder & database provisioning</p>
          </div>
          <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            {inReview.length} Awaiting Authorization
          </span>
        </div>

        {inReview.length === 0 ? (
          <div className="bg-white rounded-xl p-12 border border-slate-200/80 text-center shadow-xs">
            <p className="text-3xl mb-2">🎉</p>
            <p className="text-sm font-bold text-slate-800">No Pending Applications</p>
            <p className="text-xs text-slate-400 mt-1">All incoming merchant applications from the website have been reviewed.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {inReview.map((app) => (
              <div key={app.id} className="bg-white rounded-xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-base font-bold text-slate-900">{app.brandName}</h4>
                      <p className="text-xs text-slate-400 font-medium">{app.niche}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${statusBadgeClass(app.status)}`}>
                        {app.status === 'needs_info' ? 'Needs information' : 'Pending Review'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {app.channel === 'website' ? `via ${app.attribution?.site || 'website'}` : 'via admin form'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-400">Applicant / Owner:</span>
                      <span className="font-semibold text-slate-800">{app.ownerName || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-400">Contact Email:</span>
                      <span className="font-mono text-slate-700">{app.ownerEmail}</span>
                    </div>
                    {app.phone && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-400">WhatsApp / Phone:</span>
                        <span className="font-mono text-slate-700">{app.phone}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-400">Target Subdomain:</span>
                      <code className="text-indigo-600 font-mono font-semibold">{storeAddress(slugEdits[app.id] || app.requestedSlug)}</code>
                    </div>
                    {app.requestedPlan?.id && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-400">Chosen Plan:</span>
                        <span className="font-semibold text-slate-800">
                          {PLAN_CATALOG[normalizePlanId(app.requestedPlan.id)].label}
                          {app.requestedPlan.cycle && <span className="text-slate-400 font-normal"> · {app.requestedPlan.cycle}</span>}
                          {app.requestedPlan.total != null && (
                            <span className="text-slate-400 font-normal"> · quoted {app.requestedPlan.currency || 'INR'} {app.requestedPlan.total.toLocaleString('en-IN')}</span>
                          )}
                        </span>
                      </div>
                    )}
                    {app.launch?.country && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-400">Country:</span>
                        <span className="font-mono font-semibold text-slate-700">{app.launch.country}</span>
                      </div>
                    )}
                    {app.migration?.from && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-400">Migration:</span>
                        <span className="font-semibold text-amber-700">
                          From {app.migration.from}{app.migration.currentDomain ? ` (${app.migration.currentDomain})` : ''}
                        </span>
                      </div>
                    )}
                    {app.slugCheck && !app.slugCheck.available && (
                      <div className="py-2 px-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5">
                        <p className="text-amber-800 font-semibold">
                          "{app.requestedSlug}" is {app.slugCheck.reason === 'reserved' ? 'a reserved name' : app.slugCheck.reason === 'invalid' ? 'not a valid address' : 'already taken'}. Pick another address before approving.
                        </p>
                        <input
                          value={slugEdits[app.id] ?? ''}
                          onChange={(e) => setSlugEdits((s) => ({ ...s, [app.id]: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                          placeholder={`${app.requestedSlug}-store`}
                          className="w-full px-2.5 py-1.5 rounded border border-amber-300 bg-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-300"
                        />
                      </div>
                    )}
                    {app.consents?.termsAcceptedAt && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-400">Consent:</span>
                        <span className="text-slate-600 text-right">
                          Terms {app.consents.termsVersion?.terms ? `v${app.consents.termsVersion.terms} ` : ''}accepted {app.consents.termsAcceptedAt.slice(0, 10)}
                          {' · '}{app.consents.marketing ? 'marketing opt-in' : 'no marketing'}
                        </span>
                      </div>
                    )}
                    {app.attribution?.utm && Object.keys(app.attribution.utm).length > 0 && (
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-400">Campaign:</span>
                        <span className="font-mono text-[11px] text-slate-500 truncate max-w-[60%]">
                          {Object.entries(app.attribution.utm).map(([k, v]) => `${k}=${v}`).join(' ')}
                        </span>
                      </div>
                    )}
                    {app.categories && app.categories.length > 0 && (
                      <div className="py-1 border-b border-slate-100">
                        <span className="text-slate-400 block mb-1">Store Categories:</span>
                        <div className="flex flex-wrap gap-1">
                          {app.categories.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold text-[10px]">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Provisioning preview box */}
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80 space-y-1.5 text-[11px] font-mono">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>📁 Client Folder:</span>
                      <code className="text-slate-900 font-bold">src/tenants/{slugEdits[app.id] || app.requestedSlug}/</code>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>🗄️ Isolated DB:</span>
                      <code className="text-emerald-700 font-bold">orvexa_tenant_{slugEdits[app.id] || app.requestedSlug}</code>
                    </div>
                  </div>

                  {app.reviewNotes && app.status === 'needs_info' && (
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs text-amber-900">
                      <p className="font-bold mb-1">Question sent</p>
                      <p>{app.reviewNotes}</p>
                    </div>
                  )}

                  {app.message && (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-600 italic">
                      &quot;{app.message}&quot;
                    </div>
                  )}
                </div>

                <div className="pt-5 mt-4 border-t border-slate-100 space-y-3">
                  {askingId === app.id && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-700">
                        What should we ask {app.ownerName || 'the applicant'}?
                        <textarea
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          rows={3}
                          maxLength={2000}
                          placeholder="Please share your GSTIN."
                          className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-normal focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                      </label>
                      <button
                        onClick={() => handleRequestInfo(app.id)}
                        disabled={busyId === app.id || !question.trim()}
                        className="px-3 py-2 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-300 cursor-pointer disabled:opacity-40"
                      >
                        {busyId === app.id ? 'Sending…' : 'Send question'}
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2.5 flex-wrap">
                  <button
                    onClick={() => handleApproveWithFeedback(app.id, app.requestedSlug, app.brandName)}
                    disabled={busyId === app.id || (app.slugCheck?.available === false && !slugEdits[app.id])}
                    className="flex-1 bg-slate-950 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-lg transition-colors cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busyId === app.id ? 'Working…' : 'Authorize & Provision'}
                  </button>
                  <button
                    onClick={() => {
                      setAskingId(askingId === app.id ? null : app.id)
                      setQuestion(app.reviewNotes || '')
                    }}
                    disabled={busyId === app.id}
                    className="px-3 py-2.5 text-xs font-bold text-amber-800 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer border border-amber-200 disabled:opacity-40"
                  >
                    Needs more information
                  </button>
                  <button
                    onClick={() => handleReject(app.id)}
                    disabled={busyId === app.id}
                    className="px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-rose-200 disabled:opacity-40"
                  >
                    Reject
                  </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Processed Archive */}
      {processed.length > 0 && (
        <div className="pt-4 border-t border-slate-200">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Recently Processed ({processed.length})</h4>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs divide-y divide-slate-100">
            {processed.map((app) => (
              <div key={app.id} className="p-4 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    app.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {app.status}
                  </span>
                  <span className="font-bold text-slate-900">{app.brandName}</span>
                  <span className="font-mono text-slate-400 hidden sm:inline">{storeAddress(app.requestedSlug)}</span>
                </div>
                <span className="font-mono text-slate-500">{app.ownerEmail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}

// =====================================================
// 3. Client Acquisition & Leads CRM (NEW)
// =====================================================
function ClientLeadsCRM({ onSwitchView }: { onSwitchView: (v: AdminView) => void }) {
  const { applications, approve } = useAdminApplications()
  const { tenants } = useAdminTenants()
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all')

  const inReview = applications.filter((a) => a.status === 'pending' || a.status === 'needs_info')
  const approvedCount = applications.filter((a) => a.status === 'approved').length
  const conversion = applications.length === 0 ? 0 : Math.round((approvedCount / applications.length) * 1000) / 10

  const filteredApps = applications.filter((a) => {
    if (filter === 'pending') return a.status === 'pending' || a.status === 'needs_info'
    if (filter === 'approved') return a.status === 'approved'
    return true
  })

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Funnel Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <p className="text-2xl font-bold text-slate-900">{applications.length}</p>
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-mono mt-1">Website Form Inquiries</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <p className="text-2xl font-bold text-indigo-600">{inReview.length}</p>
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-mono mt-1">Hot Leads Pending</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <p className="text-2xl font-bold text-emerald-600">{tenants.length}</p>
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-mono mt-1">Converted Active Stores</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <p className="text-2xl font-bold text-purple-600">{conversion}%</p>
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-mono mt-1">Lead Conversion Rate</p>
        </div>
      </div>

      {/* Leads Management Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Inbound Merchant Inquiries & Leads</h3>
            <p className="text-xs text-slate-400">Prospective clients acquired through the Orvexa Cloud platform website</p>
          </div>

          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                filter === 'all' ? 'bg-slate-900 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Leads ({applications.length})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                filter === 'pending' ? 'bg-slate-900 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Pending Review ({inReview.length})
            </button>
            <button
              onClick={() => setFilter('approved')}
              className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                filter === 'approved' ? 'bg-slate-900 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Converted / Active ({applications.filter(a => a.status === 'approved').length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 uppercase tracking-wider font-mono text-[10px]">
                <th className="text-left px-5 py-3">Brand & Desired Domain</th>
                <th className="text-left px-4 py-3">Founder / Contact</th>
                <th className="text-left px-4 py-3">Niche Category</th>
                <th className="text-left px-4 py-3">Submitted Date</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-5 py-3">Outreach Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredApps.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-slate-900">{app.brandName}</p>
                    <code className="text-[11px] font-mono text-indigo-600">{storeAddress(app.requestedSlug)}</code>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-slate-800">{app.ownerName}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{app.ownerEmail}</p>
                    <p className="text-[10px] text-slate-400">{app.phone}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium">
                      {app.niche}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-slate-500">
                    {app.submittedAt}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusBadgeClass(app.status)}`}>
                      {app.status === 'needs_info' ? 'needs info' : app.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`mailto:${app.ownerEmail}?subject=Welcome to Orvexa Cloud - ${app.brandName} Storefront`}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-200 transition-colors"
                      >
                        ✉️ Email
                      </a>
                      {app.phone && (
                        <a
                          href={`https://wa.me/${app.phone.replace(/[^0-9]/g, '')}?text=Hello%20${encodeURIComponent(app.ownerName)},%20thank%20you%20for%20applying%20for%20${encodeURIComponent(app.brandName)}%20on%20Orvexa%20Cloud!`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded border border-emerald-200 transition-colors"
                        >
                          💬 WhatsApp
                        </a>
                      )}
                      {(app.status === 'pending' || app.status === 'needs_info') && (
                        <button
                          onClick={async () => {
                            const { tenant, error } = await approve(app.id)
                            if (tenant) onSwitchView('stores')
                            else window.alert(error || 'Could not provision this store. Open Merchant Applications to review it.')
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold bg-slate-950 hover:bg-slate-800 text-white rounded shadow-xs cursor-pointer"
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
function TenantDirectory({ onOpenProvisionModal }: { onOpenProvisionModal?: () => void }) {
  const { tenants, setStatus, changePlan, refresh } = useAdminTenants()
  const [search, setSearch] = useState('')
  const [inspectTenant, setInspectTenant] = useState<TenantConfig | null>(null)
  const [credentialsTenant, setCredentialsTenant] = useState<TenantConfig | null>(null)
  const [copiedEnv, setCopiedEnv] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  const filtered = tenants.filter((t) =>
    t.brandName.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase()) ||
    t.ownerEmail.toLowerCase().includes(search.toLowerCase())
  )

  const getTenantEnvString = (t: TenantConfig) => {
    return `# --- Tenant Environment Variables ---
TENANT_ID=${t.id}
TENANT_SLUG=${t.slug}
BRAND_NAME="${t.brandName}"
SUBDOMAIN=${storeAddress(t.slug)}
CUSTOM_DOMAIN=${t.customDomain || ''}
PRIMARY_COLOR="${t.theme.primaryColor}"
ACCENT_COLOR="${t.theme.accentColor}"

# --- Isolated Database Configuration ---
# Credentials are never written here; the server builds the URI from MONGODB_TENANT_BASE_URI.
MONGODB_DB_NAME=orvexa_tenant_${t.slug}
MONGODB_ISOLATION_MODE=dedicated_database
ENABLE_ORDER_TRACKING=${t.theme.enableOrderTracking}
ENABLE_CUSTOMER_REVIEWS=${t.theme.enableReviews}`
  }

  const handleCopyEnv = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedEnv(true)
    setTimeout(() => setCopiedEnv(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 border border-emerald-500/40 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs animate-slide-down">
          <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center justify-center text-[11px]">✓</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Credentials Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-800 rounded-2xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔐</span>
            <h3 className="text-sm font-bold text-white tracking-tight">Store Authentication & Credentials Management</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Super Admin Master Control
            </span>
          </div>
          <p className="text-xs text-slate-300/80">
            Set custom usernames, login emails, and passwords for any store owner. Generate instant onboarding access passes for handover.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-amber-300 font-semibold bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
            🔑 {tenants.length} Stores Protected
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stores by brand, slug, or owner..."
            className="w-full bg-white border border-slate-200 px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none rounded-lg shadow-xs transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs font-mono text-slate-500 hidden sm:block">{filtered.length} Active Stores Provisioned</p>
          {onOpenProvisionModal && (
            <button
              onClick={onOpenProvisionModal}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>⊕</span>
              <span>Provision New Store</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 uppercase tracking-wider font-mono text-[10px]">
                <th className="text-left px-5 py-3">Store Name & Slug</th>
                <th className="text-left px-4 py-3">Dedicated Database</th>
                <th className="text-left px-4 py-3">Owner Contact</th>
                <th className="text-left px-4 py-3">Plan Tier</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-5 py-3">Credentials & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-slate-900">{tenant.brandName}</p>
                    <code className="text-[11px] font-mono text-indigo-600">{storeAddress(tenant.slug)}</code>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                      orvexa_tenant_{tenant.slug}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-slate-800">{tenant.ownerName}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{tenant.ownerEmail}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <select
                      value={tenant.plan}
                      onChange={(e) => changePlan(tenant.id, e.target.value as 'starter' | 'pro' | 'enterprise')}
                      className="bg-slate-50 text-slate-800 text-xs font-semibold px-2 py-1 rounded border border-slate-200 cursor-pointer"
                    >
                      {PLAN_IDS.map((id) => (
                        <option key={id} value={id}>{PLAN_CATALOG[id].label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusBadgeClass(tenant.status)}`}>
                      {tenant.status === 'read_only' ? 'read only' : tenant.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Prominent Credentials Button */}
                      <button
                        onClick={() => setCredentialsTenant(tenant)}
                        className="px-2.5 py-1 text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 rounded border border-amber-300 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                        title="Set or reset store owner password and login credentials"
                      >
                        <span>🔑</span>
                        <span>Credentials</span>
                      </button>

                      <button
                        onClick={() => setInspectTenant(tenant)}
                        className="px-2 py-1 text-[11px] font-mono font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-200 transition-colors cursor-pointer"
                        title="View .env file"
                      >
                        .env
                      </button>
                      <a
                        href={`/t/${tenant.slug}`}
                        target="_blank"
                        className="px-2 py-1 text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded border border-indigo-200 transition-colors"
                      >
                        Visit ↗
                      </a>
                      <select
                        value={tenant.status}
                        onChange={async (e) => {
                          const next = e.target.value as TenantConfig['status']
                          const { error, endedSessions } = await setStatus(tenant.id, next)
                          if (error) showToast(error)
                          else if (endedSessions) showToast(`${tenant.brandName} is ${next}. Existing sign-ins were ended.`)
                        }}
                        className="bg-slate-50 text-slate-800 text-[11px] font-semibold px-2 py-1 rounded border border-slate-200 cursor-pointer"
                        title="Store status. Read only keeps the catalogue open but refuses new orders. Suspended, pending and cancelled close the store and end sign-in."
                      >
                        {STORE_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
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

      {/* Inspect Tenant Modal */}
      {inspectTenant && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 text-slate-900 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase font-bold">STORE CONFIGURATION & SECRETS</span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  📁 src/tenants/{inspectTenant.slug}/tenant.env
                </h3>
              </div>
              <button
                onClick={() => setInspectTenant(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-mono">Isolated Database Config</span>
                <button
                  onClick={() => handleCopyEnv(getTenantEnvString(inspectTenant))}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-2.5 py-1 rounded border border-slate-200 transition-colors cursor-pointer"
                >
                  {copiedEnv ? '✓ Copied!' : 'Copy .env'}
                </button>
              </div>
              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-60 leading-relaxed shadow-inner">
                {getTenantEnvString(inspectTenant)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectTenant(null)}
                className="bg-slate-950 text-white font-semibold text-xs px-5 py-2 rounded-lg cursor-pointer"
              >
                Done
              </button>
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
  const activeTenants = tenants.filter((t) => t.status === 'active' || t.status === 'pending' || t.status === 'read_only')
  const totalMRR = activeTenants.reduce((sum, t) => sum + t.subscription.pricePerMonth, 0)

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <p className="text-2xl font-bold text-slate-900">₹{totalMRR.toLocaleString()}</p>
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-mono mt-1">Monthly Recurring Revenue</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <p className="text-2xl font-bold text-slate-900">{activeTenants.length}</p>
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-mono mt-1">Active Subscriptions</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <p className="text-2xl font-bold text-slate-900">₹{(totalMRR * 12).toLocaleString()}</p>
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-mono mt-1">Annual Run Rate (ARR)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Store Subscriptions</h3>
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          {activeTenants.map((tenant) => (
            <div key={tenant.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{tenant.brandName}</p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {PLAN_CATALOG[normalizePlanId(tenant.plan)].label}
                    {tenant.subscription.cycle === 'yearly' ? ' · yearly (10% off)' : ' · monthly'}
                    {' · '}{formatPlanPrice(tenant.subscription.pricePerMonth)}
                    {' · '}{tenant.subscription.paymentMethod}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-slate-500">Next: {tenant.subscription.nextBillingDate}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${statusBadgeClass(tenant.subscription.status)}`}>
                    {tenant.subscription.status}
                  </span>
                </div>
              </div>
              {tenant.subscription.invoices.length > 0 && (
                <ul className="text-[11px] text-slate-500 font-mono space-y-0.5">
                  {tenant.subscription.invoices.map((invoice) => (
                    <li key={invoice.id} className="flex justify-between gap-3">
                      <span>{invoice.date} · {invoice.description}</span>
                      <span className={invoice.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}>
                        ₹{invoice.amount.toLocaleString('en-IN')} · {invoice.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
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
    <div className="space-y-6 max-w-6xl">
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Store portals & custom domains</h3>
          <p className="text-[11px] text-slate-500 mt-1">
            Every store gets orvexacloud.in/t/&lt;slug&gt; automatically. Merchants who want their own website add a CNAME to cname.orvexacloud.in from Store Settings.
          </p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 uppercase tracking-wider font-mono text-[10px]">
              <th className="text-left px-5 py-3">Store</th>
              <th className="text-left px-4 py-3">Platform portal</th>
              <th className="text-left px-4 py-3">Custom Domain</th>
              <th className="text-left px-4 py-3">Seller portal</th>
              <th className="text-right px-5 py-3">DNS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.filter((t) => t.status === 'active').map((tenant) => (
              <tr key={tenant.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-3.5 font-bold text-slate-900">{tenant.brandName}</td>
                <td className="px-4 py-3.5">
                  <a href={`/t/${tenant.slug}`} target="_blank" rel="noreferrer" className="text-indigo-600 font-mono hover:underline">
                    {storeAddress(tenant.slug)}
                  </a>
                </td>
                <td className="px-4 py-3.5 font-mono text-slate-600">
                  {tenant.customDomain ? (
                    <span>
                      {tenant.customDomain}{' '}
                      <span className={tenant.customDomainVerified ? 'text-emerald-700' : 'text-amber-700'}>
                        {tenant.customDomainVerified ? 'connected' : 'pending DNS'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-300">Not mapped</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <a href={`/t/${tenant.slug}/owner`} className="text-[11px] font-semibold text-indigo-700 hover:underline">
                    /t/{tenant.slug}/owner
                  </a>
                </td>
                <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-700">
                  {tenant.customDomain ? (tenant.customDomainVerified ? 'LIVE' : 'WAIT') : 'PORTAL'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
