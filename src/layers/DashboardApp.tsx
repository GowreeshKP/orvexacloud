import { useState, useRef, useMemo, useEffect, lazy, Suspense } from 'react'
import {
  LayoutDashboard, Package, Tag, Users, MessageSquare,
  Store, Settings, Shield, LogOut, Bell, Search,
  ExternalLink, Menu, TrendingUp, TrendingDown, Minus,
  CheckCircle2, Circle, ChevronRight, Plus, BarChart2,
  ShoppingBag, AlertCircle, Clock,
} from 'lucide-react'
import { useTenant } from '@/context/TenantContext'
import { useDashboardStats, useDashboardProducts, useTenantOrders } from '@/api/hooks'
import { authService, DEMO_MODE, type SellerSession } from '@/api/auth'
import { mockStore } from '@/api/mock-store'
import { auditLogger } from '@/api/audit-logger'
import { API_BASE, apiFetch } from '@/api/base'
import { PLAN_CATALOG, formatPlanPrice, normalizePlanId, planAllowsStorefrontStudio, storeAddress } from '@/data/plans'
import { sellerPortalUrl, storefrontUrl, tenantPortalPath } from '@/lib/store-urls'
import { fetchStoreAnalytics, fetchDomainConfig, saveCustomDomain } from '@/api/storefront-analytics'
import { fetchTenantBilling, payTenantSubscription, type TenantBillingSummary } from '@/api/tenant-billing'
import { storeInbox, STORE_INBOX_EVENT, type NewsletterSubscriber, type StoreMessage } from '@/api/store-messages'
import SellerLogin, { StoreDashboardGate } from '@/components/auth/SellerLogin'
import PortalView from '@/components/platform/PortalView'
import StoreAuditLogs from '@/components/store/StoreAuditLogs'

/** Lazy so studio.css only loads on the Storefront tab and cannot override portals chrome. */
const StorefrontStudioPanel = lazy(() => import('@/components/store/StorefrontStudioPanel'))
import {
  buildTenantCategories,
  getCategoryLabel,
  getNichePreset,
  getStoreCategories,
  isTemplateStore,
  type StoreCategory,
} from '@/data/store-niches'
import type { Product } from '@/types'
import type { TenantConfig, TrackedOrder } from '@/types/tenant'

// ─── Small UI helpers ───────────────────────────────────────────────
/** Deterministic pastel/hue colour from a string (for avatars, etc.) */
function hashColor(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue},55%,42%)`
}

/** Tiny inline SVG sparkline for KPI cards */
function Spark({ data, color = 'currentColor', width = 72, height = 32 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (!data.length) return null
  const max = Math.max(...data) || 1
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  })
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <polyline points={pts.join(' ')} stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** Coloured status pill using portals-demo.css .pill classes */
function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase()
  let cls = 'pill'
  if (s === 'delivered') cls += ' leaf'
  else if (s === 'processing') cls += ' gold'
  else if (s === 'in transit' || s === 'out for delivery') cls += ' indigo'
  else cls += ' outline'
  return <span className={cls}>{status}</span>
}

// Store owner portal nav — matches orvexa-portals-demo layout
const PRIMARY_NAV = [
  { id: 'overview',   label: 'Dashboard', Icon: LayoutDashboard, badge: 0 },
  { id: 'orders',     label: 'Orders',    Icon: Package,         badge: 0 },
  { id: 'products',   label: 'Products',  Icon: Tag,             badge: 0 },
  { id: 'customers',  label: 'Customers', Icon: Users,           badge: 0 },
  { id: 'inbox',      label: 'Messages',  Icon: MessageSquare,   badge: 0 },
] as const

const STORE_NAV = [
  { id: 'storefront', label: 'Storefront', Icon: Store,     badge: 0 },
  { id: 'settings',   label: 'Settings',   Icon: Settings,  badge: 0 },
  { id: 'audit',      label: 'Audit log',  Icon: Shield,    badge: 0 },
] as const

const NAV_ITEMS = [...PRIMARY_NAV, ...STORE_NAV] as const

type DashboardView = (typeof NAV_ITEMS)[number]['id']

// Curated high-resolution image presets for ethnic & fashion products
const PRODUCT_PHOTO_PRESETS = [
  {
    name: 'Midnight Chanderi Silk Maxi',
    category: 'maxis',
    url: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243',
  },
  {
    name: 'Artisanal Kalamkari Botanical',
    category: 'kalamkari',
    url: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2175.jpg?v=1766941862',
  },
  {
    name: 'Banarasi Gold Tissue Saree',
    category: 'dresses',
    url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1000&q=80',
  },
  {
    name: 'Kanjivaram Crimson Silk Saree',
    category: 'dresses',
    url: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=1000&q=80',
  },
  {
    name: 'Handspun Indigo Khadi Kurta',
    category: 'kalamkari',
    url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1000&q=80',
  },
  {
    name: 'Ivory Dabu Handblock Stole',
    category: 'handloom',
    url: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&w=1000&q=80',
  },
  {
    name: 'Mulberry Pink Chanderi Anarkali',
    category: 'dresses',
    url: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1000&q=80',
  },
  {
    name: 'Organic Honey Handloom Romper',
    category: 'handloom',
    url: 'https://images.unsplash.com/photo-1522771930-78848d9293e8?auto=format&fit=crop&w=1000&q=80',
  },
]

export default function DashboardApp() {
  const { tenant, loading } = useTenant()
  const [session, setSession] = useState<SellerSession | null>(() => authService.getSellerSession())
  const [activeView, setActiveView] = useState<DashboardView>('overview')
  const [navOpen, setNavOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Hooks must stay above every early return — otherwise login/loading flips crash with React #300.
  const { orders: allOrders } = useTenantOrders()
  const inboxMessages = useMemo(() => {
    const tenantId = tenant?.id || ''
    return storeInbox.getMessages(tenantId)
  }, [tenant?.id])
  const unreadOrders = allOrders.filter((o) => o.status === 'Processing').length
  const unreadMsgs = inboxMessages.filter((m) => !m.read).length
  const canCustomiseStorefront = planAllowsStorefrontStudio(tenant?.plan)
  const storeNavItems = STORE_NAV.filter((item) => item.id !== 'storefront' || canCustomiseStorefront)

  useEffect(() => {
    if (activeView === 'storefront' && !canCustomiseStorefront) setActiveView('overview')
  }, [activeView, canCustomiseStorefront])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  const handleLogout = () => {
    authService.logoutSeller()
    setSession(null)
  }

  // Store APIs need a JWT. Tokenless demo sessions only work offline / in DEMO_MODE.
  useEffect(() => {
    if (!session) return
    let cancelled = false
    const dropSession = () => {
      if (cancelled) return
      authService.logoutSeller()
      setSession(null)
    }
    const onAuthLost = () => dropSession()
    window.addEventListener('orvexa:seller-auth-lost', onAuthLost)
    void (async () => {
      const token = await authService.getStoreAccessToken()
      if (cancelled || token) return
      // No access token: force re-login in production. Do not probe /health —
      // that endpoint was burning Cloudflare rate limits (429) on every mount.
      if (!DEMO_MODE) {
        dropSession()
        return
      }
      try {
        const health = await apiFetch('/health')
        if (!cancelled && health.ok) dropSession()
      } catch {
        // API offline — keep local demo session.
      }
    })()
    return () => {
      cancelled = true
      window.removeEventListener('orvexa:seller-auth-lost', onAuthLost)
    }
  }, [session])

  useEffect(() => {
    if (!tenant?.brandName) return
    document.title = `${tenant.brandName} | Seller Portal`
    const icon = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (icon) icon.href = '/favicon-orvexa.png'
  }, [tenant?.brandName])

  const navBadge = (id: string) => {
    if (id === 'orders') return unreadOrders
    if (id === 'inbox') return unreadMsgs
    return 0
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-black/20 border-t-black rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-black/40">Loading Seller Portal...</p>
        </div>
      </div>
    )
  }

  if (!tenant?.slug) {
    return (
      <StoreDashboardGate
        brandName="this store"
        dashboardUrl={typeof window !== 'undefined' ? window.location.href : undefined}
      />
    )
  }

  // Signed into a different store — force sign-out before this portal's login form.
  if (session && session.tenantSlug !== tenant.slug) {
    return (
      <StoreDashboardGate
        brandName={tenant.brandName}
        otherStore={session.brandName}
        dashboardUrl={sellerPortalUrl(tenant.slug)}
        onSignOut={handleLogout}
      />
    )
  }

  if (!session) {
    return (
      <SellerLogin
        brandName={tenant.brandName}
        boundSlug={tenant.slug}
        onLoginSuccess={(next) => setSession(next)}
      />
    )
  }

  return (
    <div className="shell">
      {toastMessage && (
        <div className="toasts">
          <div className="toast">
            <CheckCircle2 size={16} />
            {toastMessage}
          </div>
        </div>
      )}

      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden />}
      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        {/* Logo */}
        <div className="brand-row">
          <img src="/brand/logo-white.svg" alt="Orvexa" style={{ height: 28 }} />
          <span className="portal-chip">Store Owner</span>
        </div>

        {/* Store card */}
        <div className="store-card">
          <span className="avatar sm" style={{ background: hashColor(tenant?.brandName || 'S') }}>
            {(tenant?.brandName || 'S').slice(0, 2).toUpperCase()}
          </span>
          <div className="grow min-w-0">
            <p className="nm truncate">{tenant?.brandName || 'My Store'}</p>
            <p className="sub truncate">{storeAddress(tenant?.slug || '')}</p>
          </div>
        </div>

        {/* Primary nav */}
        <nav className="col" style={{ gap: 2 }} aria-label="Store owner sections">
          {PRIMARY_NAV.map((item) => {
            const isActive = activeView === item.id
            const badge = navBadge(item.id)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { setActiveView(item.id as DashboardView); setNavOpen(false) }}
                className={`nav-item${isActive ? ' active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.Icon size={19} strokeWidth={2.1} />
                <span className="grow">{item.label}</span>
                {badge > 0 && <span className="nav-badge">{badge}</span>}
              </button>
            )
          })}

          <p className="nav-group">Your store</p>

          {storeNavItems.map((item) => {
            const isActive = activeView === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { setActiveView(item.id as DashboardView); setNavOpen(false) }}
                className={`nav-item${isActive ? ' active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.Icon size={19} strokeWidth={2.1} />
                <span className="grow">{item.label}</span>
              </button>
            )
          })}
          {!canCustomiseStorefront && (
            <p className="small muted" style={{ padding: '8px 14px 4px', lineHeight: 1.4 }}>
              Storefront customise is on Enterprise Plus.
            </p>
          )}
        </nav>

        {/* User card */}
        <div className="sidebar-foot">
          <div className="user-card">
            <span className="avatar sm" style={{ background: 'var(--gold)', color: 'var(--ink)' }}>
              {(session.name || tenant?.ownerName || 'O').slice(0, 2).toUpperCase()}
            </span>
            <div className="grow min-w-0">
              <p className="nm truncate">{session.name || tenant?.ownerName || 'Store owner'}</p>
              <p className="rl">Store owner</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-ghost btn-icon"
              style={{ color: 'var(--on-ink-2)' }}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={16} strokeWidth={2.1} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column — lock height on Storefront so the studio fills the pane without page scroll/clipping */}
      <div className={`min-w-0 flex flex-col ${activeView === 'storefront' ? 'h-dvh overflow-hidden' : 'min-h-screen'}`}>
        <header className="topbar">
          <button type="button" className="menu-btn btn btn-outline btn-icon" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu size={18} strokeWidth={2} />
          </button>

          {/* Stacked crumb + title */}
          <div className="col" style={{ gap: 1 }}>
            <span className="crumb">STORE</span>
            <strong style={{ fontFamily: 'var(--font-display)', fontSize: 15, letterSpacing: '-.01em' }}>
              {NAV_ITEMS.find((n) => n.id === activeView)?.label || 'Dashboard'}
            </strong>
          </div>

          {/* Search — hide on storefront to free horizontal space for the editor */}
          {activeView !== 'storefront' && (
            <div className="search grow" style={{ maxWidth: 340 }}>
              <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
              <input className="input" placeholder="Search…" style={{ height: 40, background: '#fff', paddingLeft: 40 }} />
            </div>
          )}
          {activeView === 'storefront' && <div className="grow" />}

          <div className="right row" style={{ gap: 8 }}>
            <a
              href={tenantPortalPath(tenant?.slug || '')}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline btn-sm"
            >
              <ExternalLink size={14} strokeWidth={2} />
              View store
            </a>
            {/* Notifications bell */}
            <div style={{ position: 'relative' }}>
              <button type="button" className="btn btn-ghost btn-icon">
                <Bell size={18} strokeWidth={2.1} />
              </button>
              <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', border: '1.5px solid var(--paper)' }} />
            </div>
          </div>
        </header>

        <main className={activeView === 'storefront' ? 'main main--studio' : 'main'}>
          <div className={activeView === 'storefront' ? 'page page--flush' : 'page'}>
            <PortalView viewKey={activeView}>
              {activeView === 'overview'   && <DashboardOverview onNavigate={(view) => setActiveView(view)} />}
              {activeView === 'products'   && <ProductManager onToast={showToast} />}
              {activeView === 'orders'     && <OrderManager onToast={showToast} />}
              {activeView === 'customers'  && <CustomersView onToast={showToast} />}
              {activeView === 'inbox'      && <InboxManager onToast={showToast} />}
              {activeView === 'storefront' && <StorefrontCustomizer onToast={showToast} />}
              {activeView === 'audit'      && tenant && <StoreAuditLogs tenant={tenant} onToast={showToast} />}
              {activeView === 'settings'   && <StoreSettings onToast={showToast} />}
            </PortalView>
          </div>
        </main>
      </div>
    </div>
  )
}

// =====================================================
// 1. Dashboard Overview — portals-demo design system
// =====================================================
function DashboardOverview({ onNavigate }: { onNavigate: (view: DashboardView) => void }) {
  const { stats, loading } = useDashboardStats()
  const { tenant } = useTenant()
  const [chartRange, setChartRange] = useState<'7d' | '30d'>('7d')

  if (loading || !stats) {
    return (
      <div className="stack">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card" style={{ height: 120 }} />
        ))}
      </div>
    )
  }

  const isTemplate = isTemplateStore(tenant)
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (tenant?.ownerName || 'there').split(' ')[0]
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const dailyRevenue = stats.revenueByDay.map((d) => d.amount)
  const dailyOrders = stats.revenueByDay.map((d) => d.orders || 0)
  const dailyAov = stats.revenueByDay.map((d) => (d.orders ? Math.round(d.amount / d.orders) : 0))

  // Bar chart data
  const chartData = stats.revenueByDay.slice(chartRange === '7d' ? -7 : -30)
  const maxBar = Math.max(...chartData.map((d) => d.amount)) || 1
  const ySteps = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxBar * f))

  // Setup checklist (static demo items)
  const canStudio = planAllowsStorefrontStudio(tenant?.plan)
  const checklist = [
    { label: 'Add your first product', done: stats.orderCount > 0 || !isTemplate },
    ...(canStudio
      ? [{ label: 'Customise your storefront', done: !isTemplate || Boolean(tenant?.storefrontStudioEnabled) }]
      : [{ label: 'Upgrade to Enterprise Plus for Storefront Studio', done: false }]),
    { label: 'Set up your custom domain', done: !!tenant?.customDomain },
    { label: 'Receive your first order', done: stats.orderCount > 0 },
  ]
  const doneCount = checklist.filter((c) => c.done).length
  const pct = Math.round((doneCount / checklist.length) * 100)

  // Today's to-do attention items
  const attnItems = [
    stats.orderCount > 0
      ? { icon: <Package size={18} strokeWidth={2} />, color: 'var(--gold-soft)', iconColor: 'var(--gold-ink)', text: `${stats.orderCount} order${stats.orderCount !== 1 ? 's' : ''} received`, sub: 'Review and update fulfilment' }
      : { icon: <ShoppingBag size={18} strokeWidth={2} />, color: 'var(--indigo-soft)', iconColor: 'var(--indigo)', text: 'No orders yet', sub: 'Share your store link to start selling' },
    { icon: <BarChart2 size={18} strokeWidth={2} />, color: 'var(--leaf-soft)', iconColor: 'var(--leaf)', text: `₹${stats.revenue.toLocaleString()} total revenue`, sub: 'Growing steadily this month' },
    { icon: <Users size={18} strokeWidth={2} />, color: 'var(--indigo-soft)', iconColor: 'var(--indigo)', text: `${stats.customerCount || 0} customers`, sub: 'View profiles and order history' },
  ]

  return (
    <div className="stack">
      {/* ── Page head ── */}
      <div className="page-head">
        <div>
          <h1>{greeting}, {firstName}</h1>
          <p className="sub">{dateStr}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => onNavigate('products')}>
            <Plus size={15} strokeWidth={2.5} /> Add product
          </button>
        </div>
      </div>

      {/* ── Setup checklist ── */}
      {pct < 100 && (
        <div className="card card-pad">
          <div className="row between" style={{ marginBottom: 12 }}>
            <div>
              <p className="card-title">Set up your store</p>
              <p className="card-sub">{doneCount} of {checklist.length} complete</p>
            </div>
            <span className="eyebrow">{pct}%</span>
          </div>
          <div className="bar gold" style={{ marginBottom: 16 }}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="col" style={{ gap: 8 }}>
            {checklist.map((item) => (
              <div key={item.label} className="row" style={{ gap: 10 }}>
                {item.done
                  ? <CheckCircle2 size={17} strokeWidth={2} style={{ color: 'var(--leaf)', flexShrink: 0 }} />
                  : <Circle size={17} strokeWidth={2} style={{ color: 'var(--field-edge)', flexShrink: 0 }} />}
                <span style={{ fontSize: 13.5, fontWeight: item.done ? 400 : 600, color: item.done ? 'var(--muted)' : 'var(--ink)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4 KPI cards ── */}
      <div className="grid cols-4">
        {/* Revenue — gold */}
        <div className="card kpi gold">
          <p className="kpi-label"><BarChart2 size={13} /> Revenue</p>
          <p className="kpi-value money">₹{stats.revenue.toLocaleString()}</p>
          <div className="kpi-foot">
            {!isTemplate && <span className="delta"><TrendingUp size={11} />+{stats.revenueChange}%</span>}
            <span>vs last period</span>
          </div>
          <div className="spark"><Spark data={dailyRevenue} color="var(--ink)" /></div>
        </div>

        {/* Orders */}
        <div className="card kpi">
          <p className="kpi-label"><Package size={13} /> Orders</p>
          <p className="kpi-value">{stats.orderCount}</p>
          <div className="kpi-foot">
            {!isTemplate && <span className="delta"><TrendingUp size={11} />+{stats.orderCountChange}%</span>}
            <span>total orders</span>
          </div>
          <div className="spark"><Spark data={dailyOrders} color="var(--indigo)" /></div>
        </div>

        {/* AOV */}
        <div className="card kpi">
          <p className="kpi-label"><TrendingUp size={13} /> Avg order value</p>
          <p className="kpi-value money">₹{Math.round(stats.averageOrderValue).toLocaleString()}</p>
          <div className="kpi-foot">
            <span className="delta"><Minus size={11} />Stable</span>
            <span>per order</span>
          </div>
          <div className="spark"><Spark data={dailyAov} color="var(--leaf)" /></div>
        </div>

        {/* Customers */}
        <div className="card kpi">
          <p className="kpi-label"><Users size={13} /> Customers</p>
          <p className="kpi-value">{stats.customerCount || 0}</p>
          <div className="kpi-foot">
            {!isTemplate && <span className="delta"><TrendingUp size={11} />+4 this week</span>}
            <span>unique buyers</span>
          </div>
          <div className="spark"><Spark data={dailyOrders} color="var(--gold-edge)" /></div>
        </div>
      </div>

      {/* ── Sales chart + Today's to-do ── */}
      <div className="grid cols-2-1">
        {/* Bar chart */}
        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-title">Sales</p>
              <p className="card-sub">Revenue by day</p>
            </div>
            <div className="seg">
              <button type="button" aria-pressed={chartRange === '7d'} onClick={() => setChartRange('7d')}>7d</button>
              <button type="button" aria-pressed={chartRange === '30d'} onClick={() => setChartRange('30d')}>30d</button>
            </div>
          </div>
          <div className="card-body">
            {/* Grid + bars */}
            <div className="chart">
              <div className="chart-grid">
                {ySteps.slice(1).reverse().map((v, i) => (
                  <div key={i} style={{ top: `${(1 - v / maxBar) * 100}%` }}>
                    <span>₹{v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}</span>
                  </div>
                ))}
              </div>
              <div className="chart-bars">
                {chartData.map((day, idx) => {
                  const h = Math.max(2, (day.amount / maxBar) * 100)
                  const isLast = idx === chartData.length - 1
                  return (
                    <div key={day.date} className="bar-col">
                      <div className="tip">₹{day.amount.toLocaleString()}</div>
                      <i className={isLast ? 'hl' : ''} style={{ height: `${h}%` }} />
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="chart-x">
              {chartData.map((day) => (
                <span key={day.date}>{day.date}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Today's to-do */}
        <div className="card">
          <div className="card-head">
            <p className="card-title">Today's focus</p>
          </div>
          <div className="divide">
            {attnItems.map((item, i) => (
              <div key={i} className="attn">
                <div className="ic" style={{ background: item.color, color: item.iconColor }}>
                  {item.icon}
                </div>
                <div className="grow min-w-0">
                  <p style={{ fontWeight: 700, fontSize: 13.5 }}>{item.text}</p>
                  <p className="small muted">{item.sub}</p>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--field-edge)', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent orders table + Best sellers ── */}
      <div className="grid cols-2-1">
        {/* Recent orders */}
        <div className="card">
          <div className="card-head">
            <p className="card-title">Recent orders</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('orders')}>
              View all <ChevronRight size={14} />
            </button>
          </div>
          <div className="table-wrap">
            {stats.recentOrders.length === 0 ? (
              <div className="empty"><Package size={32} /><p>No orders yet</p></div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentOrders.slice(0, 6).map((order) => (
                    <tr key={order.id}>
                      <td><span className="cell-main mono">{order.id}</span><span className="cell-sub">{order.date}</span></td>
                      <td>{order.customer}</td>
                      <td><StatusPill status={order.status} /></td>
                      <td className="num money">₹{order.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Best sellers */}
        <div className="card">
          <div className="card-head">
            <p className="card-title">Best sellers</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('products')}>
              Manage <ChevronRight size={14} />
            </button>
          </div>
          <div className="card-body">
            {stats.topProducts.length === 0 ? (
              <div className="empty"><Tag size={28} /><p>No products yet</p></div>
            ) : (
              <div className="col" style={{ gap: 14 }}>
                {stats.topProducts.slice(0, 5).map((product, i) => {
                  const maxRev = Math.max(...stats.topProducts.map((p) => p.revenue)) || 1
                  const pctBar = Math.round((product.revenue / maxRev) * 100)
                  return (
                    <div key={product.name}>
                      <div className="row between" style={{ marginBottom: 5 }}>
                        <div className="row" style={{ gap: 8, minWidth: 0 }}>
                          <span className="rank">{i + 1}</span>
                          <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</span>
                        </div>
                        <span className="money" style={{ fontSize: 13, flexShrink: 0 }}>₹{product.revenue.toLocaleString()}</span>
                      </div>
                      <div className="bar gold">
                        <i style={{ width: `${pctBar}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 2. Comprehensive Product Manager
// =====================================================
function ProductManager({ onToast }: { onToast: (msg: string) => void }) {
  const { products, addProduct, updateProduct, deleteProduct } = useDashboardProducts()
  const { tenant, patchTenant } = useTenant()
  const isTemplate = isTemplateStore(tenant)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')

  const storeCategories = useMemo(() => getStoreCategories(tenant, products), [tenant, products])
  const categories = useMemo(() => ['all', ...storeCategories.map((c) => c.slug)], [storeCategories])

  const handleAddCategory = (name: string): string | null => {
    if (!tenant) return null
    const existing = tenant.categories || []
    const [created] = buildTenantCategories([name])
    if (!created) return null
    if (existing.some((c) => c.slug === created.slug)) return created.slug
    const next = [...existing, created]
    // Soft-patch only — refreshTenant() sets loading=true and tears down the Add Product modal.
    patchTenant({ categories: next })
    onToast(`Added category "${created.name}".`)
    return created.slug
  }

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return products.filter((p) => {
      const matchesCat = filterCategory === 'all' || p.category === filterCategory
      if (!q) return matchesCat
      const hay = `${p.name} ${p.fabricTech || ''} ${p.category || ''} ${p.badge || ''}`.toLowerCase()
      return matchesCat && hay.includes(q)
    })
  }, [products, filterCategory, searchQuery])

  const handleOpenAdd = () => {
    setEditingProduct(null)
    setShowModal(true)
  }

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product)
    setShowModal(true)
  }

  const handleDuplicate = (product: Product) => {
    const nextId = Math.max(0, ...products.map((p) => p.id)) + 1
    const duplicated: Product = {
      ...product,
      id: nextId,
      name: `${product.name} (Copy)`,
      rating: 5.0,
      reviewsCount: 0,
    }
    addProduct(duplicated)
    onToast(`Duplicated "${product.name}" as a new product!`)
  }

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}" from your store?`)) {
      deleteProduct(id)
      onToast(`Deleted "${name}".`)
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <p className="sub">{products.length} {products.length === 1 ? 'product' : 'products'} published · images, pricing, {isTemplate ? 'categories and options' : 'fabric tech, colours and sizes'}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleOpenAdd}>
          <Plus size={15} strokeWidth={2.5} /> Add product
        </button>
      </div>

      {/* Product Table */}
      <div className="card">
        <div className="toolbar">
          <div className="search" style={{ width: 300 }}>
            <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input
              className="input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isTemplate ? 'Search by name or tag…' : 'Search by name, fabric, or tag…'}
              style={{ paddingLeft: 40 }}
            />
          </div>
          <select className="select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ width: 'auto' }}>
            {categories.map((c) => (
              <option key={c} value={c}>{c === 'all' ? 'All categories' : getCategoryLabel(tenant, c)}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
        {filteredProducts.length === 0 ? (
          <div className="empty">
            <Tag size={32} />
            <p>{searchQuery ? `No matches for "${searchQuery}"` : 'Your store has no products yet.'}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenAdd}>Add first product</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Fabric & Tech</th>
                  <th>Colours & Sizes</th>
                  <th>Rating</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="clickable">
                    {/* Thumbnail & Name */}
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <div style={{ position: 'relative', width: 44, height: 52, borderRadius: 8, overflow: 'hidden', background: 'var(--line-soft)', flexShrink: 0, border: '1px solid var(--line)' }}>
                          <img src={product.imgMain} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          {product.badge && (
                            <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(18,22,58,.8)', color: '#fff', fontSize: 7, fontWeight: 700, textAlign: 'center', padding: '2px 4px', textTransform: 'uppercase' }}>{product.badge}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="cell-main" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{product.name}</p>
                          <p className="cell-sub mono">#{product.id}</p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td><span className="pill outline">{getCategoryLabel(tenant, product.category)}</span></td>

                    {/* Price */}
                    <td>
                      <p className="cell-main money">{product.priceFormatted}</p>
                      {product.originalPrice && <p className="cell-sub" style={{ textDecoration: 'line-through' }}>₹{product.originalPrice}</p>}
                    </td>

                    {/* Stock */}
                    <td>
                      {(product.stockCount ?? 0) > 0 ? (
                        <>
                          <p className="cell-main">{product.stockCount}</p>
                          <p className="cell-sub">{(product.stockCount ?? 0) <= 5 ? 'Low stock' : 'In stock'}</p>
                        </>
                      ) : (
                        <>
                          <p className="cell-main" style={{ color: 'var(--coral)' }}>0</p>
                          <p className="cell-sub">Sold out</p>
                        </>
                      )}
                    </td>

                    {/* Fabric Tech */}
                    <td>
                      <p className="cell-main" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.fabricTech}</p>
                      <p className="cell-sub">{product.sculptLevel}</p>
                    </td>

                    {/* Colors & Sizes */}
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                        {(product.colors || []).slice(0, 4).map((c, i) => (
                          <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: c.hex, border: '1px solid var(--line)', display: 'inline-block' }} title={c.name} />
                        ))}
                        {(product.colors?.length || 0) > 4 && <span className="small muted">+{(product.colors?.length || 0) - 4}</span>}
                      </div>
                      <p className="cell-sub">{product.sizes?.join(', ') || '—'}</p>
                    </td>

                    {/* Rating */}
                    <td>
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>★</span> {product.rating}{' '}
                      <span className="muted">({product.reviewsCount})</span>
                    </td>

                    {/* Actions */}
                    <td className="actions">
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => handleOpenEdit(product)} title="Edit">Edit</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDuplicate(product)} title="Duplicate">Copy</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(product.id, product.name)} title="Delete">Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      {/* Modal for Add / Edit Product */}
      {showModal && (
        <ProductFormModal
          product={editingProduct}
          tenant={tenant}
          categories={storeCategories}
          onAddCategory={handleAddCategory}
          onClose={() => setShowModal(false)}
          onSave={(savedProduct) => {
            if (editingProduct) {
              updateProduct(savedProduct.id, savedProduct)
              onToast(`Updated product "${savedProduct.name}"!`)
            } else {
              addProduct(savedProduct)
              onToast(`Added new product "${savedProduct.name}" to your store!`)
            }
            setShowModal(false)
          }}
          nextId={products.length > 0 ? Math.max(...products.map((p) => p.id)) + 1 : 1}
        />
      )}
    </div>
  )
}

// =====================================================
// 2b. Add / Edit Product Modal with Image Uploader
// =====================================================
function ProductFormModal({
  product,
  tenant,
  categories,
  onAddCategory,
  onClose,
  onSave,
  nextId,
}: {
  product: Product | null
  tenant: TenantConfig | null
  categories: StoreCategory[]
  onAddCategory: (name: string) => string | null
  onClose: () => void
  onSave: (p: Product) => void
  nextId: number
}) {
  const isEditing = !!product
  const isTemplate = isTemplateStore(tenant)
  const niche = getNichePreset(tenant?.storeType)
  const sizeOptions = isTemplate ? niche.sizeOptions : ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size']
  const labels = isTemplate
    ? { tag: niche.tagLabel, material: niche.materialLabel, materialDesc: niche.materialDescLabel, sizes: 'Available Options', fitNote: 'Good To Know' }
    : { tag: 'Sculpt / Silhouette Tag', material: 'Fabric Technology / Weave', materialDesc: 'Fabric Description & Feel', sizes: 'Available Sizes', fitNote: 'Size & Fit Note' }
  const legacyCategoryOptions: StoreCategory[] = [
    { slug: 'maxis', name: 'Cotton Maxis', image: '' },
    { slug: 'dresses', name: 'Silk & Chanderi Dresses', image: '' },
    { slug: 'kalamkari', name: 'Kalamkari & Prints', image: '' },
    { slug: 'handloom', name: 'Handloom Series', image: '' },
  ]
  const categoryOptions = isTemplate || tenant?.categories?.length ? categories : legacyCategoryOptions

  const [name, setName] = useState(product?.name || '')
  const [category, setCategory] = useState<Product['category']>(
    product?.category || categoryOptions[0]?.slug || (isTemplate ? '' : 'maxis')
  )
  const [newCategoryName, setNewCategoryName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [price, setPrice] = useState(product?.price?.toString() || (isTemplate ? '' : '1199'))
  const [originalPrice, setOriginalPrice] = useState(
    (product?.originalPrice ?? (product as Product & { mrp?: number })?.mrp)?.toString() || (isTemplate ? '' : '1499')
  )
  const [stockCount, setStockCount] = useState(
    product?.stockCount != null ? String(product.stockCount) : isEditing ? '0' : '25'
  )
  const [badge, setBadge] = useState(product?.badge ?? (isTemplate ? '' : 'BESTSELLER'))
  const [sculptLevel, setSculptLevel] = useState(product?.sculptLevel || (isTemplate ? '' : 'A-LINE FLARE'))
  const [fabricTech, setFabricTech] = useState(product?.fabricTech || (isTemplate ? '' : '100% Pure Breathable Cotton'))
  const [fabricDesc, setFabricDesc] = useState(
    product?.fabricDesc || (isTemplate ? '' : 'Ultra-soft, skin-friendly woven texture that breathes all day long.')
  )
  const [desc, setDesc] = useState(
    product?.desc || (isTemplate ? '' : 'Handcrafted pure cotton silhouette designed for effortless elegance and all-day comfort.')
  )
  const [fitInfo, setFitInfo] = useState(
    product?.fitInfo || (isTemplate ? '' : 'True to size with adjustable attached side tie-up ropes.')
  )
  const [highlights, setHighlights] = useState((product?.details || []).join('\n'))

  const defaultImage = isTemplate ? '' : 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243'

  // Primary image
  const [imgMain, setImgMain] = useState(product?.imgMain || defaultImage)

  // Additional gallery images
  const [images, setImages] = useState<string[]>(
    product?.images && product.images.length > 0
      ? product.images
      : [product?.imgMain || defaultImage].filter(Boolean)
  )

  // Color options
  const [colors, setColors] = useState<{ name: string; hex: string }[]>(
    product?.colors && product.colors.length > 0
      ? product.colors
      : isTemplate
      ? []
      : [
          { name: 'Indigo Black', hex: '#222222' },
          { name: 'Rose Clay', hex: '#8C5A4F' },
        ]
  )

  // Available Sizes
  const [sizes, setSizes] = useState<string[]>(
    product?.sizes && product.sizes.length > 0 ? product.sizes : isTemplate ? [] : ['XS', 'S', 'M', 'L', 'XL', 'XXL']
  )

  const [activeTab, setActiveTab] = useState<'info' | 'images' | 'variants' | 'craft'>('info')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCreateCategory = () => {
    const name = newCategoryName.trim()
    if (!name) return
    const slug = onAddCategory(name)
    if (slug) setCategory(slug)
    setNewCategoryName('')
  }

  // Handle local image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      const reader = new FileReader()
      reader.onload = (uploadEvent) => {
        const resultUrl = uploadEvent.target?.result as string
        if (resultUrl) {
          setImgMain(resultUrl)
          if (!images.includes(resultUrl)) {
            setImages([resultUrl, ...images])
          }
        }
      }
      reader.readAsDataURL(files[0])
    }
  }

  const handleAddGalleryImage = (url: string) => {
    if (url && !images.includes(url)) {
      setImages([...images, url])
    }
  }

  const handleRemoveGalleryImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index)
    setImages(updated)
    if (images[index] === imgMain && updated.length > 0) {
      setImgMain(updated[0])
    }
  }

  const handleAddColor = () => {
    setColors([...colors, { name: 'New Color', hex: '#8C5A4F' }])
  }

  const handleRemoveColor = (index: number) => {
    setColors(colors.filter((_, i) => i !== index))
  }

  const handleToggleSize = (size: string) => {
    if (sizes.includes(size)) {
      if (isTemplate || sizes.length > 1) setSizes(sizes.filter((s) => s !== size))
    } else {
      setSizes([...sizes, size])
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !price) {
      setFormError('Product name and price are required.')
      setActiveTab('info')
      return
    }
    if (!category) {
      setFormError('Choose or create a category for this product.')
      setActiveTab('info')
      return
    }
    const stockNum = Math.max(0, Math.floor(Number(stockCount)))
    if (!Number.isFinite(stockNum)) {
      setFormError('Enter a valid stock quantity (0 or more).')
      setActiveTab('info')
      return
    }
    if (!imgMain && images.length === 0) {
      setFormError('Add at least one product photo.')
      setActiveTab('images')
      return
    }
    setFormError(null)

    const priceNum = parseInt(price) || 999
    const origPriceNum = originalPrice ? parseInt(originalPrice) : undefined

    const finalProduct: Product = {
      id: product?.id || nextId,
      name,
      category,
      price: priceNum,
      priceFormatted: `₹${priceNum.toLocaleString()}`,
      originalPrice: origPriceNum,
      mrp: origPriceNum,
      stockCount: stockNum,
      sculptLevel,
      badge: badge || undefined,
      fabricTech,
      fabricDesc,
      compression: sculptLevel,
      desc,
      details: isTemplate
        ? highlights.split('\n').map((d) => d.trim()).filter(Boolean)
        : [
            'Functional utility side pocket',
            'Attached adjustable side waist tie-up ropes',
            'Custom feeding zips available upon request',
            'Pre-washed and pre-shrunk cotton fabric',
          ],
      fitInfo,
      rating: product?.rating || (isTemplate ? 0 : 4.9),
      reviewsCount: product?.reviewsCount || (isTemplate ? 0 : 12),
      imgMain: imgMain || images[0],
      images: images.length > 0 ? images : [imgMain],
      colors: colors.length > 0 ? colors : isTemplate ? [] : [{ name: 'Standard', hex: '#333333' }],
      sizes: sizes.length > 0 ? sizes : isTemplate ? [] : ['S', 'M', 'L', 'XL'],
    }

    onSave(finalProduct)
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="product-form-shell" role="presentation">
      <button type="button" className="product-form-backdrop" onClick={onClose} aria-label="Close dialog" />
      <div
        className="product-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
      >
        <div className="drawer-head">
          <div className="min-w-0">
            <p className="eyebrow">{isEditing ? 'Edit product' : 'New product'}</p>
            <h2 id="product-form-title" className="card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isEditing ? product!.name : 'Add product'}
            </h2>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="product-form-tabs">
          <div className="tabs" role="tablist">
            {[
              { id: 'info' as const, label: 'Basics' },
              { id: 'images' as const, label: 'Photos' },
              { id: 'variants' as const, label: isTemplate ? 'Options' : 'Colors & sizes' },
              { id: 'craft' as const, label: 'Details' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <form id="product-form" onSubmit={handleSubmit}>
          <div className="drawer-body">
          {formError && (
            <div className="callout bad">
              <span>{formError}</span>
            </div>
          )}
          {/* TAB 1: BASIC INFO */}
          {activeTab === 'info' && (
            <div className="stack" style={{ gap: 14 }}>
              <section className="product-form-section">
                <p className="section-title">Product</p>
                <div className="field">
                  <label className="label" htmlFor="product-name">Product name *</label>
                  <input
                    id="product-name"
                    className="input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isTemplate ? 'e.g. Product name' : 'e.g. Sunset Chanderi Silk Maxi Dress'}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="product-desc">Description</label>
                  <textarea
                    id="product-desc"
                    className="textarea"
                    rows={3}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder={isTemplate ? 'Describe your product and what makes it great...' : 'Describe your product styling, silhouette and appeal...'}
                  />
                </div>
              </section>

              <section className="product-form-section">
                <p className="section-title">Pricing & category</p>
                <div className="product-form-grid-3">
                  <div className="field">
                    <label className="label" htmlFor="product-category">Category *</label>
                    <select
                      id="product-category"
                      className="select"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {categoryOptions.length === 0 && <option value="">No categories yet</option>}
                      {categoryOptions.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {isTemplate && (
                      <div className="row" style={{ gap: 8, marginTop: 8 }}>
                        <input
                          type="text"
                          className="input"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleCreateCategory()
                            }
                          }}
                          placeholder="New category"
                          style={{ height: 36, flex: 1, minWidth: 0 }}
                        />
                        <button type="button" className="btn btn-outline btn-sm" onClick={handleCreateCategory}>
                          + Add
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="product-price">Selling price (₹) *</label>
                    <input
                      id="product-price"
                      className="input"
                      type="number"
                      required
                      min={0}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="e.g. 499"
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="product-mrp">Compare at / MRP (₹)</label>
                    <input
                      id="product-mrp"
                      className="input"
                      type="number"
                      min={0}
                      value={originalPrice}
                      onChange={(e) => setOriginalPrice(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </section>

              <section className="product-form-section">
                <p className="section-title">Inventory</p>
                <div className="product-form-grid-2">
                  <div className="field">
                    <label className="label" htmlFor="product-stock">Quantity in stock *</label>
                    <input
                      id="product-stock"
                      className="input"
                      type="number"
                      required
                      min={0}
                      step={1}
                      value={stockCount}
                      onChange={(e) => setStockCount(e.target.value)}
                      placeholder="e.g. 25"
                    />
                  </div>
                  <div className={`callout product-form-hint ${Number(stockCount) > 0 ? 'ok' : 'bad'}`}>
                    <span>
                      {Number(stockCount) > 0
                        ? `${Number(stockCount)} available — customers can buy this product.`
                        : '0 stock shows as Sold out on your storefront.'}
                    </span>
                  </div>
                </div>
              </section>

              <section className="product-form-section">
                <p className="section-title">Merchandising</p>
                <div className="product-form-grid-2">
                  <div className="field">
                    <label className="label" htmlFor="product-badge">Badge</label>
                    <select id="product-badge" className="select" value={badge} onChange={(e) => setBadge(e.target.value)}>
                      <option value="BESTSELLER">BESTSELLER</option>
                      <option value="NEW LAUNCH">NEW LAUNCH</option>
                      <option value="HERITAGE EDIT">HERITAGE EDIT</option>
                      <option value="HANDCRAFTED">HANDCRAFTED</option>
                      <option value="LIMITED EDITION">LIMITED EDITION</option>
                      <option value="">NO BADGE</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="product-tag">{labels.tag}</label>
                    <input
                      id="product-tag"
                      className="input"
                      type="text"
                      value={sculptLevel}
                      onChange={(e) => setSculptLevel(e.target.value)}
                      placeholder={isTemplate ? `e.g. ${niche.tagLabel}` : 'e.g. A-LINE FLARE'}
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: PHOTOS & GALLERY UPLOADER */}
          {activeTab === 'images' && (
            <div className="stack" style={{ gap: 14 }}>
              <section className="product-form-section">
                <p className="section-title">Main photo</p>
                <div className="row wrap" style={{ alignItems: 'flex-start', gap: 20 }}>
                  <div style={{ position: 'relative', width: 120, height: 160, borderRadius: 12, overflow: 'hidden', background: 'var(--line-soft)', border: '1.5px solid var(--line)', flexShrink: 0 }}>
                    {imgMain ? (
                      <img src={imgMain} alt="Primary preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="empty" style={{ padding: 12, height: '100%' }}>
                        <p className="small muted">No photo</p>
                      </div>
                    )}
                  </div>
                  <div className="stack grow" style={{ gap: 12 }}>
                    <p className="card-sub">
                      {isTemplate
                        ? 'Upload a file or paste an image URL.'
                        : 'Upload a file, paste a URL, or pick a studio preset below.'}
                    </p>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="sr-only" />
                    <div className="row wrap">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()}>
                        Upload from device
                      </button>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="product-img-url">Image URL</label>
                      <input
                        id="product-img-url"
                        className="input mono"
                        type="url"
                        value={imgMain}
                        onChange={(e) => setImgMain(e.target.value)}
                        onBlur={(e) => {
                          const url = e.target.value.trim()
                          if (url && !images.includes(url)) setImages([url, ...images])
                        }}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="product-form-section">
                <p className="section-title">Gallery ({images.length})</p>
                <div className="row wrap" style={{ gap: 10 }}>
                  {images.map((img, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        width: 72,
                        height: 88,
                        borderRadius: 10,
                        overflow: 'hidden',
                        border: `1.5px solid ${img === imgMain ? 'var(--ink)' : 'var(--line)'}`,
                        background: 'var(--line-soft)',
                      }}
                    >
                      <img src={img} alt={`Gallery ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={() => handleRemoveGalleryImage(idx)}
                        aria-label="Remove photo"
                        style={{ position: 'absolute', top: 2, right: 2, width: 22, height: 22, minHeight: 22, padding: 0, background: 'rgba(18,22,58,.75)', color: '#fff' }}
                      >
                        ✕
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setImgMain(img)}
                        style={{ position: 'absolute', bottom: 2, left: 2, right: 2, minHeight: 22, padding: '0 4px', fontSize: 10 }}
                      >
                        Main
                      </button>
                    </div>
                  ))}
                  {images.length === 0 && <p className="muted small">No gallery photos yet.</p>}
                </div>
              </section>

              {!isTemplate && (
                <section className="product-form-section">
                  <p className="section-title">Studio presets</p>
                  <p className="card-sub">Click a photo to attach it to this product.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                    {PRODUCT_PHOTO_PRESETS.map((preset, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setImgMain(preset.url)
                          if (!images.includes(preset.url)) setImages([preset.url, ...images])
                        }}
                        style={{ textAlign: 'left', cursor: 'pointer', padding: 8, background: '#fff', border: '1.5px solid var(--line)', borderRadius: 12 }}
                      >
                        <img src={preset.url} alt={preset.name} style={{ width: '100%', height: 88, objectFit: 'cover', borderRadius: 8, marginBottom: 6 }} />
                        <p className="cell-main" style={{ fontSize: 11 }}>{preset.name}</p>
                        <p className="cell-sub">{preset.category}</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* TAB 3: COLORS & SIZES */}
          {activeTab === 'variants' && (
            <div className="stack" style={{ gap: 14 }}>
              <section className="product-form-section">
                <div className="row between" style={{ paddingBottom: 10, borderBottom: '1px solid var(--line-soft)' }}>
                  <p className="section-title" style={{ margin: 0, paddingBottom: 0, borderBottom: 0 }}>Colour swatches</p>
                  <button type="button" className="btn btn-outline btn-sm" onClick={handleAddColor}>+ Add colour</button>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {colors.map((c, i) => (
                    <div key={i} className="product-form-swatch">
                      <input
                        type="color"
                        value={c.hex}
                        onChange={(e) => setColors(colors.map((col, idx) => (idx === i ? { ...col, hex: e.target.value } : col)))}
                        aria-label={`Colour ${i + 1}`}
                        style={{ width: 36, height: 36, border: '1.5px solid var(--line)', borderRadius: 8, padding: 0, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <input
                        className="input"
                        type="text"
                        value={c.name}
                        onChange={(e) => setColors(colors.map((col, idx) => (idx === i ? { ...col, name: e.target.value } : col)))}
                        placeholder="Colour name"
                      />
                      <code className="mono muted small" style={{ flexShrink: 0 }}>{c.hex}</code>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleRemoveColor(i)} aria-label="Remove colour">✕</button>
                    </div>
                  ))}
                  {colors.length === 0 && <p className="muted small">No colours yet — optional for single-option products.</p>}
                </div>
              </section>

              <section className="product-form-section">
                <p className="section-title">{labels.sizes}</p>
                {isTemplate && <p className="card-sub">Optional — leave empty for a single option.</p>}
                <div className="row wrap" style={{ gap: 8 }}>
                  {sizeOptions.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      className={`btn btn-sm ${sizes.includes(sz) ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => handleToggleSize(sz)}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </section>

              <section className="product-form-section">
                <div className="field">
                  <label className="label" htmlFor="product-fit">{labels.fitNote}</label>
                  <input
                    id="product-fit"
                    className="input"
                    type="text"
                    value={fitInfo}
                    onChange={(e) => setFitInfo(e.target.value)}
                    placeholder={isTemplate ? 'e.g. Recommended for ages 3+' : 'e.g. True to size with adjustable waist tie-ups.'}
                  />
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: FABRIC & DETAILS */}
          {activeTab === 'craft' && (
            <div className="stack" style={{ gap: 14 }}>
              <section className="product-form-section">
                <p className="section-title">Material</p>
                <div className="field">
                  <label className="label" htmlFor="product-material">
                    {labels.material}{isTemplate ? '' : ' *'}
                  </label>
                  <input
                    id="product-material"
                    className="input"
                    type="text"
                    required={!isTemplate}
                    value={fabricTech}
                    onChange={(e) => setFabricTech(e.target.value)}
                    placeholder={isTemplate ? `e.g. ${niche.materialLabel}` : 'e.g. 100% Pure Mul Chanderi Silk'}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="product-material-desc">{labels.materialDesc}</label>
                  <textarea
                    id="product-material-desc"
                    className="textarea"
                    rows={3}
                    value={fabricDesc}
                    onChange={(e) => setFabricDesc(e.target.value)}
                    placeholder={isTemplate ? 'Describe the quality, feel or what makes it special.' : 'e.g. Breathable organic cotton pre-washed for zero shrinkages.'}
                  />
                </div>
              </section>

              {isTemplate ? (
                <section className="product-form-section">
                  <p className="section-title">Highlights</p>
                  <div className="field">
                    <label className="label" htmlFor="product-highlights">Highlights (one per line)</label>
                    <textarea
                      id="product-highlights"
                      className="textarea"
                      rows={4}
                      value={highlights}
                      onChange={(e) => setHighlights(e.target.value)}
                      placeholder={'e.g. Gift-ready packaging\nMade with safe materials'}
                    />
                  </div>
                </section>
              ) : (
                <section className="product-form-section">
                  <p className="section-title">Add-ons on product page</p>
                  <p className="card-sub">Custom lining (+₹100) · Maternity feeding zip (+₹120) · Custom lengths (44"–50")</p>
                </section>
              )}
            </div>
          )}
          </div>

          <div className="drawer-foot">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {isEditing ? 'Save changes' : 'Publish product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// =====================================================
// 3. Storefront & Homepage Picture Customizer
// =====================================================
// =====================================================
// 3. Customers View
// =====================================================
function CustomersView({ onToast: _onToast }: { onToast: (msg: string) => void }) {
  const { orders } = useTenantOrders()
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState<'all' | 'vip' | 'returning' | 'new'>('all')

  // Derive customers from orders
  const customers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; city: string; orders: number; spent: number; last: string }>()
    for (const o of orders) {
      const key = o.shippingAddress?.phone || o.shippingAddress?.name || 'unknown'
      const name = o.shippingAddress?.name || 'Customer'
      const city = o.shippingAddress?.city || ''
      const phone = o.shippingAddress?.phone || ''
      const existing = map.get(key)
      if (existing) {
        existing.orders += 1
        existing.spent += o.total
        if (o.date > existing.last) existing.last = o.date
      } else {
        map.set(key, { name, phone, city, orders: 1, spent: o.total, last: o.date })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.spent - a.spent)
  }, [orders])

  const totalRevenue = customers.reduce((s, c) => s + c.spent, 0)
  const avgSpend = customers.length ? Math.round(totalRevenue / customers.length) : 0
  const vipCount = customers.filter((c) => c.orders >= 3).length

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const matchSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        c.city.toLowerCase().includes(search.toLowerCase())
      const matchSeg =
        segment === 'all' ||
        (segment === 'vip' && c.orders >= 3) ||
        (segment === 'returning' && c.orders === 2) ||
        (segment === 'new' && c.orders === 1)
      return matchSearch && matchSeg
    })
  }, [customers, search, segment])

  const segLabel = (c: typeof customers[0]) => {
    if (c.orders >= 3) return <span className="pill gold">VIP</span>
    if (c.orders === 2) return <span className="pill indigo">Returning</span>
    return <span className="pill outline">New</span>
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p className="sub">{customers.length} unique buyers derived from order history</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid cols-4" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <div className="card kpi gold">
          <p className="kpi-label"><Users size={13} /> Total customers</p>
          <p className="kpi-value">{customers.length}</p>
          <div className="kpi-foot"><span>unique buyers</span></div>
        </div>
        <div className="card kpi">
          <p className="kpi-label"><TrendingUp size={13} /> Avg lifetime spend</p>
          <p className="kpi-value money">₹{avgSpend.toLocaleString()}</p>
          <div className="kpi-foot"><span>per customer</span></div>
        </div>
        <div className="card kpi">
          <p className="kpi-label"><ShoppingBag size={13} /> VIP customers</p>
          <p className="kpi-value">{vipCount}</p>
          <div className="kpi-foot"><span>3+ orders</span></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card">
        <div className="toolbar">
          <div className="search" style={{ width: 280 }}>
            <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input
              className="input"
              placeholder="Search by name, phone, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 40 }}
            />
          </div>
          <div className="seg" style={{ marginLeft: 'auto' }}>
            {(['all', 'vip', 'returning', 'new'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={segment === s} onClick={() => setSegment(s)}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty"><Users size={32} /><p>No customers found</p></div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>City</th>
                  <th>Segment</th>
                  <th className="num">Orders</th>
                  <th className="num">Total spent</th>
                  <th>Last order</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <span className="avatar sm" style={{ background: hashColor(c.name) }}>{c.name.slice(0, 2).toUpperCase()}</span>
                        <div>
                          <p className="cell-main">{c.name}</p>
                          {c.phone && <p className="cell-sub mono">{c.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td>{c.city || '—'}</td>
                    <td>{segLabel(c)}</td>
                    <td className="num">{c.orders}</td>
                    <td className="num money">₹{c.spent.toLocaleString()}</td>
                    <td className="muted small">{c.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function StorefrontCustomizer({ onToast }: { onToast: (msg: string) => void }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-black/40">Loading Storefront…</p>
        </div>
      }
    >
      <StorefrontStudioPanel onToast={onToast} />
    </Suspense>
  )
}


// =====================================================
// 4. Order Manager & Real-Time Tracking
// =====================================================
function InboxManager({ onToast }: { onToast: (msg: string) => void }) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id || ''
  const slug = tenant?.slug || ''
  const [tab, setTab] = useState<'messages' | 'subscribers'>('messages')
  const [messages, setMessages] = useState<StoreMessage[]>(() => storeInbox.getMessages(tenantId))
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>(() => storeInbox.getSubscribers(tenantId))
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const refresh = () => {
      setMessages(storeInbox.getMessages(tenantId))
      setSubscribers(storeInbox.getSubscribers(tenantId))
    }
    refresh()
    if (slug && tenantId) {
      void storeInbox.fetchMessages(slug, tenantId).then(setMessages)
      void storeInbox.fetchSubscribers(slug, tenantId).then(setSubscribers)
    }
    window.addEventListener(STORE_INBOX_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(STORE_INBOX_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [tenantId, slug])

  const unreadCount = messages.filter((m) => !m.read).length
  const visibleMessages = filter === 'unread' ? messages.filter((m) => !m.read) : messages

  const toggleOpen = (m: StoreMessage) => {
    setOpenId((prev) => (prev === m.id ? null : m.id))
    if (!m.read && slug) void storeInbox.setReadRemote(slug, tenantId, m.id, true)
    else if (!m.read) storeInbox.setRead(tenantId, m.id, true)
  }

  const exportSubscribers = () => {
    if (subscribers.length === 0) {
      onToast('No subscribers to export.')
      return
    }
    const csv = ['Email,Subscribed At', ...subscribers.map((s) => `"${s.email}","${s.subscribedAt}"`)].join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    link.setAttribute('download', `${tenant?.slug || 'store'}-subscribers.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    onToast(`Exported ${subscribers.length} subscribers to CSV!`)
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p className="sub">Contact form messages and newsletter subscribers from your storefront</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="tabs">
          {(['messages', 'subscribers'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className="tab"
              onClick={() => setTab(t)}
            >
              {t === 'messages' ? 'Messages' : 'Subscribers'}
              <span className="count">{t === 'messages' ? messages.length : subscribers.length}</span>
              {t === 'messages' && unreadCount > 0 && <span className="pill coral" style={{ marginLeft: 4 }}>{unreadCount} new</span>}
            </button>
          ))}
        </div>

      {tab === 'messages' ? (
        <div>
          <div className="toolbar">
            <div className="row" style={{ gap: 6 }}>
              {(['all', 'unread'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : 'Unread'}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => messages.filter((m) => !m.read).forEach((m) => { if (slug) void storeInbox.setReadRemote(slug, tenantId, m.id, true); else storeInbox.setRead(tenantId, m.id, true) })}
              >
                Mark all as read
              </button>
            )}
          </div>
          {visibleMessages.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm font-bold text-black">{filter === 'unread' ? 'No unread messages' : 'No messages yet'}</p>
              <p className="text-xs text-black/50 mt-1">Customer questions from your storefront's Contact form will appear here.</p>
            </div>
          ) : (
            <ul className="divide" style={{ borderTop: '1px solid var(--line-soft)' }}>
              {visibleMessages.map((m) => {
                const isOpen = openId === m.id
                return (
                  <li key={m.id} style={{ borderBottom: '1px solid var(--line-soft)', background: m.read ? undefined : 'var(--indigo-soft)' }}>
                    <button type="button" onClick={() => toggleOpen(m)} style={{ width: '100%', textAlign: 'left', padding: '14px 20px', display: 'flex', alignItems: 'flex-start', gap: 14, background: 'none', border: 0 }}>
                      <span style={{ marginTop: 6, width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: m.read ? 'transparent' : 'var(--indigo)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row between" style={{ gap: 8 }}>
                          <p style={{ fontWeight: m.read ? 400 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</p>
                          <p className="small muted" style={{ flexShrink: 0 }}>{formatDate(m.createdAt)}</p>
                        </div>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--indigo)', marginTop: 2 }}>{m.subject}</p>
                        {!isOpen && <p className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{m.message}</p>}
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 20px 16px 42px' }} className="col">
                        <p style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}>{m.message}</p>
                        <p className="small muted">{m.email}{m.phone ? ` · ${m.phone}` : ''}</p>
                        <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                          <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`} className="btn btn-primary btn-sm">Reply by email</a>
                          {m.phone && (
                            <a href={`https://wa.me/${m.phone.replace(/[^0-9]/g, '').replace(/^(\d{10})$/, '91$1')}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#25d366', color: '#fff', border: 0 }}>WhatsApp</a>
                          )}
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (slug) void storeInbox.setReadRemote(slug, tenantId, m.id, false); else storeInbox.setRead(tenantId, m.id, false) }}>Mark unread</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => { if (!window.confirm(`Delete the message from ${m.name}?`)) return; if (slug) void storeInbox.deleteMessageRemote(slug, tenantId, m.id); else storeInbox.deleteMessage(tenantId, m.id); setOpenId(null); onToast('Message deleted.') }}>Delete</button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : (
        <div>
          <div className="toolbar">
            <p className="muted small">{subscribers.length} people joined your newsletter.</p>
            <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={exportSubscribers}>Export CSV</button>
          </div>
          {subscribers.length === 0 ? (
            <div className="empty"><MessageSquare size={32} /><p>No subscribers yet</p><p className="small">Emails from your storefront footer newsletter box appear here.</p></div>
          ) : (
            <ul>
              {subscribers.map((s) => (
                <li key={s.email} style={{ padding: '12px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{s.email}</p>
                    <p className="small muted">Joined {formatDate(s.subscribedAt)}</p>
                  </div>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => { if (slug) void storeInbox.unsubscribeRemote(slug, tenantId, s.email); else storeInbox.unsubscribe(tenantId, s.email); onToast(`${s.email} removed from the list.`) }}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

function OrderManager({ onToast }: { onToast: (msg: string) => void }) {
  const { tenant } = useTenant()
  const { orders, updateOrderStatus } = useTenantOrders()
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchOrder, setSearchOrder] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<TrackedOrder | null>(null)

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesStatus = filterStatus === 'all' || o.status.toLowerCase() === filterStatus.toLowerCase()
      const custName = o.shippingAddress?.name || ''
      const custCity = o.shippingAddress?.city || ''
      const custPhone = o.shippingAddress?.phone || ''
      const matchesSearch =
        o.id.toLowerCase().includes(searchOrder.toLowerCase()) ||
        custName.toLowerCase().includes(searchOrder.toLowerCase()) ||
        custCity.toLowerCase().includes(searchOrder.toLowerCase()) ||
        custPhone.includes(searchOrder)
      return matchesStatus && matchesSearch
    })
  }, [orders, filterStatus, searchOrder])

  const handleStatusChange = (orderId: string, newStatus: TrackedOrder['status']) => {
    updateOrderStatus(orderId, newStatus)
    if (tenant) {
      auditLogger.log({
        tenantSlug: tenant.slug,
        tenantName: tenant.brandName,
        actorId: 'seller_session',
        actorName: tenant.ownerName || 'Store Owner',
        actorRole: 'seller',
        action: 'ORDER_STATUS_UPDATED',
        category: 'orders',
        severity: 'info',
        details: `Order #${orderId} status updated to "${newStatus}".`,
        metadata: { orderId, newStatus },
      })
    }
    onToast(`Order #${orderId} status updated to "${newStatus}"!`)
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder((prev: TrackedOrder | null) => (prev ? { ...prev, status: newStatus } : null))
    }
  }

  const handleExportCsv = () => {
    if (filteredOrders.length === 0) {
      onToast('No orders to export.')
      return
    }
    const headers = ['Order ID', 'Date', 'Customer Name', 'Phone', 'City', 'State', 'Pincode', 'Items Count', 'Total', 'Payment Method', 'Status', 'Courier AWB']
    const rows = filteredOrders.map((o) => [
      `"${o.id}"`,
      `"${o.date}"`,
      `"${o.shippingAddress?.name || ''}"`,
      `"${o.shippingAddress?.phone || ''}"`,
      `"${o.shippingAddress?.city || ''}"`,
      `"${o.shippingAddress?.state || ''}"`,
      `"${o.shippingAddress?.pincode || ''}"`,
      o.items?.length || 0,
      o.total,
      `"${o.paymentMethod || 'Prepaid'}"`,
      `"${o.status}"`,
      `"${o.awb || ''}"`,
    ])
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `${tenant?.slug || 'store'}-orders-${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    onToast(`Exported ${filteredOrders.length} orders to CSV!`)
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <p className="sub">{orders.length} total orders · manage fulfilment and shipments</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={handleExportCsv}>
          <Package size={14} strokeWidth={2} /> Export CSV
        </button>
      </div>

      <div className="card">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="search" style={{ width: 320 }}>
            <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input
              className="input"
              value={searchOrder}
              onChange={(e) => setSearchOrder(e.target.value)}
              placeholder="Search by Order ID, customer name, phone…"
              style={{ paddingLeft: 40 }}
            />
          </div>
          <select
            className="select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="all">All statuses ({orders.length})</option>
            <option value="Processing">Processing</option>
            <option value="In Transit">In Transit</option>
            <option value="Out for Delivery">Out for Delivery</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        {/* Orders Table */}
        <div className="table-wrap">
        {filteredOrders.length === 0 ? (
          <div className="empty"><Package size={32} /><p>No orders match your criteria</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Order ID & Date</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th className="num">Total</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const custName = order.shippingAddress?.name || 'Customer'
                  const custCityState = [order.shippingAddress?.city, order.shippingAddress?.state].filter(Boolean).join(', ')
                  return (
                    <tr key={order.id} className="clickable">
                      <td>
                        <span className="cell-main mono">{order.id}</span>
                        <span className="cell-sub">{order.date}</span>
                      </td>

                      <td>
                        <p className="cell-main">{custName}</p>
                        {custCityState && <p className="cell-sub">{custCityState}</p>}
                        {order.shippingAddress?.phone && (
                          <p className="cell-sub mono">{order.shippingAddress.phone}</p>
                        )}
                      </td>

                      <td>
                        {order.items?.map((item: any, idx: number) => {
                          const itemName = item.name || item.product?.name || 'Product'
                          const itemSize = item.size || item.selectedSize || ''
                          return (
                            <p key={idx} style={{ fontSize: 12.5 }}>
                              <strong>{item.quantity}×</strong> {itemName} {itemSize ? `(${itemSize})` : ''}
                            </p>
                          )
                        })}
                      </td>

                      <td>
                        <span style={{ fontSize: 13 }}>{order.paymentMethod || 'Prepaid'}</span>
                        <span className={`cell-sub ${/cod|cash on delivery/i.test(order.paymentMethod || '') && order.status !== 'Delivered' ? '' : 'leaf'}`} style={{ fontWeight: 700 }}>
                          {/cod|cash on delivery/i.test(order.paymentMethod || '') && order.status !== 'Delivered' ? 'Collect on delivery' : 'Paid'}
                        </span>
                      </td>

                      <td>
                        <select
                          className="select"
                          value={order.status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value as TrackedOrder['status'])}
                          style={{ height: 32, fontSize: 12.5, padding: '0 32px 0 10px' }}
                        >
                          <option value="Processing">Processing</option>
                          <option value="In Transit">In Transit</option>
                          <option value="Out for Delivery">Out for Delivery</option>
                          <option value="Delivered">Delivered</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </td>

                      <td className="num money">₹{(order.total || 0).toLocaleString()}</td>

                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setSelectedOrder(order)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white max-w-xl w-full rounded-2xl border border-black/10 shadow-2xl overflow-hidden animate-slide-down">
            <div className="bg-stone-900 text-white p-6 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-widest block">ORDER DETAILS</span>
                <h3 className="text-base font-bold font-mono">{selectedOrder.id}</h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-white/60 hover:text-white text-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs max-h-[80vh] overflow-y-auto">
              {/* Status Update Strip */}
              <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-black/10">
                <div>
                  <span className="text-[10px] text-black/50 font-bold uppercase block">Current Fulfillment Status</span>
                  <span className="text-xs font-bold text-black">{selectedOrder.status}</span>
                </div>
                <select
                  value={selectedOrder.status}
                  onChange={(e) => handleStatusChange(selectedOrder.id, e.target.value as TrackedOrder['status'])}
                  className="bg-white border border-black/20 text-xs font-bold uppercase rounded-lg px-3 py-1.5 cursor-pointer outline-none"
                >
                  <option value="Processing">Processing</option>
                  <option value="In Transit">In Transit</option>
                  <option value="Out for Delivery">Out for Delivery</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {/* Shipping Address */}
              <div className="border border-black/10 p-4 rounded-xl space-y-1">
                <p className="font-bold uppercase tracking-wider text-black text-[10px]">Customer & Shipping</p>
                <p className="font-bold text-black">{selectedOrder.shippingAddress?.name}</p>
                {selectedOrder.customerEmail && (
                  <p className="text-black/70">Email: <span className="font-mono">{selectedOrder.customerEmail}</span></p>
                )}
                <p className="text-black/70">{selectedOrder.shippingAddress?.address}</p>
                <p className="text-black/70">{selectedOrder.shippingAddress?.city}, {selectedOrder.shippingAddress?.state} - {selectedOrder.shippingAddress?.pincode}</p>
                <p className="text-black/70 font-mono">Phone: {selectedOrder.shippingAddress?.phone}</p>
              </div>

              {/* Items List */}
              <div className="border border-black/10 p-4 rounded-xl space-y-2">
                <p className="font-bold uppercase tracking-wider text-black text-[10px]">Ordered Items ({selectedOrder.items?.length || 0})</p>
                <div className="divide-y divide-black/5">
                  {selectedOrder.items?.map((item: any, i: number) => (
                    <div key={i} className="py-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {item.image && (
                          <img src={item.image} alt="" className="w-10 h-12 object-cover rounded bg-stone-100" />
                        )}
                        <div>
                          <p className="font-bold text-black">{item.name}</p>
                          <p className="text-[10px] text-black/50">
                            {item.size && `Size: ${item.size} • `}Qty: {item.quantity}
                            {item.lining && ` • ${item.lining}`}
                            {item.zip && ` • ${item.zip}`}
                          </p>
                        </div>
                      </div>
                      <p className="font-bold text-black">₹{(item.price * item.quantity).toLocaleString()}</p>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-black/10 space-y-1 text-[11px] text-black/60">
                  <div className="flex justify-between">
                    <span>Items Subtotal</span>
                    <span>₹{(selectedOrder.subtotal || 0).toLocaleString()}</span>
                  </div>
                  {(selectedOrder.discount || 0) > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount{selectedOrder.discountCode ? ` (${selectedOrder.discountCode})` : ''}</span>
                      <span>−₹{(selectedOrder.discount || 0).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span>{(selectedOrder.shipping || 0) === 0 ? 'Free' : `₹${(selectedOrder.shipping || 0).toLocaleString()}`}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-black/10 flex justify-between font-bold text-sm">
                  <span>Total Amount</span>
                  <span>₹{(selectedOrder.total || 0).toLocaleString()}</span>
                </div>
              </div>

              {/* Courier & Tracking */}
              <div className="border border-black/10 p-4 rounded-xl space-y-1 text-[11px]">
                <p className="font-bold uppercase tracking-wider text-black text-[10px]">Courier & Tracking AWB</p>
                <p className="text-black/70">Courier: <strong>{selectedOrder.courier || 'Not assigned yet'}</strong></p>
                <p className="text-black/70 font-mono">AWB Code: <strong>{selectedOrder.awb || 'Pending dispatch'}</strong></p>
                <p className="text-black/70">ETA: <strong>{selectedOrder.estimatedDelivery || '—'}</strong></p>
                <p className="text-black/70">Payment: <strong>{selectedOrder.paymentMethod}</strong></p>
              </div>
            </div>

            <div className="p-4 bg-stone-50 border-t border-black/10 flex justify-end">
              <button
                onClick={() => setSelectedOrder(null)}
                className="bg-black text-white text-xs font-bold uppercase px-5 py-2.5 rounded-lg cursor-pointer hover:bg-stone-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// 5. Store Settings & Subscription Plan
// =====================================================
function TenantSubscriptionBilling({
  tenant,
  onToast,
  onPaid,
}: {
  tenant: TenantConfig
  onToast: (msg: string) => void
  onPaid: () => void
}) {
  const [billing, setBilling] = useState<TenantBillingSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchTenantBilling(tenant.slug)
      .then((data) => {
        if (!cancelled) setBilling(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load billing.')
      })
    return () => {
      cancelled = true
    }
  }, [tenant.slug])

  const status = billing?.status || tenant.subscription?.status || 'trial'
  const paymentState = billing?.paymentState || (status === 'active' ? 'paid' : status === 'past_due' ? 'past_due' : 'trial')
  const needsPayment = billing?.needsPayment ?? (status === 'trial' || status === 'past_due')
  const total = billing?.total
  const tax = billing?.tax
  const amountExTax = billing?.amountExTax

  const handlePay = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await payTenantSubscription({
        slug: tenant.slug,
        cycle: billing?.cycle || tenant.subscription?.cycle || 'monthly',
        prefill: {
          name: tenant.ownerName || '',
          email: tenant.ownerEmail || '',
          contact: tenant.ownerPhone || '',
        },
      })
      setBilling(next)
      onToast('Subscription payment received. Your plan is active.')
      onPaid()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment failed.'
      if (msg !== 'Payment cancelled.') setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 border border-black/8 shadow-sm">
      <h3 className="text-sm font-bold tracking-wider uppercase text-black/50 mb-4">Subscription & Plan Tier</h3>
      <div className="flex items-start gap-4 mb-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <p className="text-2xl font-bold">
            {formatPlanPrice(tenant.subscription?.pricePerMonth ?? PLAN_CATALOG[normalizePlanId(tenant.plan)].pricePerMonth)}
          </p>
          <p className="text-xs text-black/40 uppercase tracking-wider font-bold">
            {PLAN_CATALOG[normalizePlanId(tenant.plan)].label} Plan
            {billing?.cycle ? ` · ${billing.cycle}` : ''}
          </p>
          {status === 'trial' && (billing?.trialEndsAt || tenant.subscription?.trialEndsAt) && (
            <p className="text-xs text-blue-700 mt-1">
              Free trial ends {(billing?.trialEndsAt || tenant.subscription?.trialEndsAt || '').slice(0, 10)}. No auto-pay — pay from this page when ready.
            </p>
          )}
          {paymentState === 'past_due' && (
            <p className="text-xs text-red-700 mt-1">
              Plan payment is overdue. Pay now to keep your store subscription current.
            </p>
          )}
          {paymentState === 'paid' && billing?.nextBillingDate && (
            <p className="text-xs text-emerald-700 mt-1">
              Paid through {billing.nextBillingDate.slice(0, 10)}. Next renewal is manual from this dashboard.
            </p>
          )}
          {paymentState === 'custom' && (
            <p className="text-xs text-indigo-700 mt-1">
              Enterprise Plus is custom-priced. Storefront Studio customise is included. Contact Orvexa for your quote and renewal.
            </p>
          )}
          {typeof total === 'number' && total > 0 && needsPayment && (
            <p className="text-xs text-black/55 mt-2">
              Due now: ₹{total.toLocaleString('en-IN')} (₹{(amountExTax || 0).toLocaleString('en-IN')} + ₹{(tax || 0).toLocaleString('en-IN')} GST)
            </p>
          )}
        </div>
        <span
          className={`text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full ${
            paymentState === 'paid'
              ? 'bg-emerald-50 text-emerald-700'
              : paymentState === 'custom'
                ? 'bg-indigo-50 text-indigo-700'
              : paymentState === 'trial'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-red-50 text-red-700'
          }`}
        >
          {paymentState === 'paid' ? 'paid' : paymentState === 'custom' ? 'enterprise' : paymentState}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {needsPayment && paymentState !== 'custom' && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void handlePay()}
          >
            {busy ? 'Opening Razorpay…' : `Pay subscription${typeof total === 'number' && total > 0 ? ` · ₹${total.toLocaleString('en-IN')}` : ''}`}
          </button>
          <p className="text-xs text-black/45">
            Razorpay checkout for approved tenants. Super Admin sees paid / unpaid status in Billing.
          </p>
        </div>
      )}

      {((billing?.invoices && billing.invoices.length > 0) || (tenant.subscription?.invoices && tenant.subscription.invoices.length > 0)) && (
        <div>
          <p className="text-xs font-bold tracking-wider uppercase text-black/40 mb-3">Billing Invoices</p>
          <div className="space-y-2">
            {(billing?.invoices || tenant.subscription?.invoices || []).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2 border-b border-black/5 text-xs">
                <div>
                  <p className="font-mono font-bold">{inv.id}</p>
                  <p className="text-black/50 text-[11px]">{inv.description}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">₹{inv.amount.toLocaleString()}</p>
                  <span className="text-[10px] text-emerald-600 font-bold uppercase">{inv.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CustomDomainPanel({
  slug,
  current,
  verified,
  onSaved,
  onToast,
}: {
  slug: string
  current: string
  verified: boolean
  onSaved: () => void
  onToast: (msg: string) => void
}) {
  const [domain, setDomain] = useState(current)
  const [cname, setCname] = useState('cname.orvexacloud.in')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    setDomain(current)
    fetchDomainConfig(slug).then((cfg) => {
      if (cfg?.cnameTarget) setCname(cfg.cnameTarget)
    }).catch(() => undefined)
  }, [slug, current])

  const save = async (value: string) => {
    setBusy(true)
    setHint(null)
    try {
      const res = await saveCustomDomain(slug, value)
      if (res.cnameTarget) setCname(res.cnameTarget)
      setHint(res.message)
      onToast(res.message)
      onSaved()
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'Could not save the domain.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 pt-5 border-t border-black/8 space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-black/50">Your own website (DNS)</h4>
      <p className="text-[11px] text-black/55 leading-relaxed">
        Shoppers can keep using {storeAddress(slug)}. To serve the same storefront on your own domain, create a CNAME in your DNS (GoDaddy, Cloudflare, Namecheap) pointing at <code className="font-mono">{cname}</code>, then save the hostname here. Do not change nameservers unless you are moving the whole domain to Orvexa.
      </p>
      <form
        className="flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save(domain.trim())
        }}
      >
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="www.yourbrand.in"
          className="flex-1 border border-black/15 rounded-lg px-3 py-2 text-xs font-mono"
        />
        <button type="submit" disabled={busy} className="bg-black text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg disabled:opacity-50 cursor-pointer">
          {busy ? 'Checking…' : 'Save & check DNS'}
        </button>
        {current && (
          <button type="button" disabled={busy} onClick={() => void save('')} className="text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg border border-black/15 cursor-pointer">
            Remove
          </button>
        )}
      </form>
      {current && (
        <p className={`text-[11px] font-semibold ${verified ? 'text-emerald-700' : 'text-amber-700'}`}>
          {verified ? `${current} is connected.` : `${current} is saved. DNS is not pointing at ${cname} yet.`}
        </p>
      )}
      {hint && <p className="text-[11px] text-black/60">{hint}</p>}
      <p className="text-[10px] font-mono text-black/40">
        CNAME www{domain ? `.${domain.replace(/^www\./, '')}` : ''} → {cname}
      </p>
    </div>
  )
}

function StoreSettings({ onToast }: { onToast: (msg: string) => void }) {
  const { tenant, refreshTenant } = useTenant()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Brand logo state
  const [logoPreview, setLogoPreview] = useState<string>(tenant?.logo || tenant?.theme?.logoUrl || '')
  const [logoUrl, setLogoUrl] = useState<string>(tenant?.logo || tenant?.theme?.logoUrl || '')
  const [isUploadMode, setIsUploadMode] = useState(true)
  const [isSavingLogo, setIsSavingLogo] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Profile & Authentication State
  const [ownerName, setOwnerName] = useState(tenant?.ownerName || '')
  const [ownerEmail, setOwnerEmail] = useState(tenant?.ownerEmail || '')
  const [ownerPhone, setOwnerPhone] = useState(tenant?.ownerPhone || '')
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passError, setPassError] = useState<string | null>(null)
  const [passSuccess, setPassSuccess] = useState<string | null>(null)

  // Staff Management State
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; email: string; role: string }>>([])
  const [staffName, setStaffName] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const [staffRole, setStaffRole] = useState<'staff' | 'manager'>('staff')
  const [staffPassword, setStaffPassword] = useState('')
  const [isAddingStaff, setIsAddingStaff] = useState(false)
  const [staffMsg, setStaffMsg] = useState<string | null>(null)

  // Active sub-tab inside credentials
  const [authSubTab, setAuthSubTab] = useState<'password' | 'profile' | 'staff' | 'pass' | 'audit'>('password')

  useEffect(() => {
    if (tenant) {
      setOwnerName(tenant.ownerName || '')
      setOwnerEmail(tenant.ownerEmail || '')
      setOwnerPhone(tenant.ownerPhone || '')

      // Fetch staff from backend API if available (seller or super-admin JWT)
      void authService.getStoreAccessToken().then((token) => {
        if (!token) return
        return fetch(`${API_BASE}/admin/tenants/${tenant.slug}/staff`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.staff) setStaffList(data.staff)
          })
          .catch(() => {})
      })
    }
  }, [tenant])

  if (!tenant) return null

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: 'None', color: 'bg-stone-200' }
    let score = 0
    if (pass.length >= 6) score += 1
    if (pass.length >= 8) score += 1
    if (/[A-Z]/.test(pass)) score += 1
    if (/[0-9]/.test(pass)) score += 1
    if (/[^A-Za-z0-9]/.test(pass)) score += 1

    if (score <= 2) return { score, label: 'Weak', color: 'bg-rose-500', text: 'text-rose-600' }
    if (score <= 3) return { score, label: 'Medium', color: 'bg-amber-500', text: 'text-amber-600' }
    return { score, label: 'Strong', color: 'bg-emerald-500', text: 'text-emerald-600' }
  }

  const passStrength = getPasswordStrength(newPassword)

  // Handle saving profile changes (Name, Email, Phone)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingProfile(true)

    mockStore.updateTenant(tenant.id, {
      ownerName: ownerName.trim(),
      ownerEmail: ownerEmail.trim().toLowerCase(),
      ownerPhone: ownerPhone.trim(),
    })

    // Also notify authService credentials map
    await authService.changeSellerPassword(tenant.slug, {
      newPassword: authService.getStoreCredential(tenant.slug).password,
      newEmail: ownerEmail.trim().toLowerCase(),
      ownerName: ownerName.trim(),
    })

    refreshTenant()
    setIsSavingProfile(false)
    onToast('✅ Account credentials and profile details updated!')
  }

  // Handle changing password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassError(null)
    setPassSuccess(null)

    if (!currentPassword.trim()) {
      setPassError('Enter your current password to confirm this change.')
      return
    }

    if (newPassword.length < 6) {
      setPassError('New password must be at least 6 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPassError('New passwords do not match.')
      return
    }

    setIsChangingPassword(true)

    const res = await authService.changeSellerPassword(tenant.slug, {
      currentPassword: currentPassword.trim(),
      newPassword: newPassword.trim(),
      newEmail: ownerEmail.trim().toLowerCase(),
      ownerName: ownerName.trim(),
    })

    setIsChangingPassword(false)

    if (res.success) {
      setPassSuccess(res.message)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onToast('🔑 Password changed successfully! Use your new password on next sign in.')
    } else {
      setPassError(res.message || 'Failed to update password. Please check your current password.')
    }
  }

  // Handle staff creation
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!staffName || !staffEmail || !staffPassword) return

    setIsAddingStaff(true)
    setStaffMsg(null)

    try {
      const token = await authService.getStoreAccessToken()
      const res = await fetch(`${API_BASE}/admin/tenants/${tenant.slug}/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: staffName,
          email: staffEmail,
          password: staffPassword,
          role: staffRole,
        }),
      })
      const data = await res.json()
      if (res.ok && data.staff) {
        setStaffList((prev) => [...prev, data.staff])
        setStaffName('')
        setStaffEmail('')
        setStaffPassword('')
        setStaffMsg(`✅ Staff member ${data.staff.name} added.`)
        onToast(`Staff account created for ${data.staff.name}!`)
      } else {
        setStaffMsg(data.error || 'Could not add staff member.')
      }
    } catch {
      const newStaff = {
        id: `staff_${Date.now()}`,
        name: staffName,
        email: staffEmail,
        role: staffRole,
      }
      setStaffList((prev) => [...prev, newStaff])
      setStaffName('')
      setStaffEmail('')
      setStaffPassword('')
      setStaffMsg(`✅ Staff account registered for ${staffName}.`)
      onToast(`Staff account created for ${staffName}!`)
    } finally {
      setIsAddingStaff(false)
    }
  }

  const handleDeleteStaff = async (staffId: string) => {
    try {
      const token = await authService.getStoreAccessToken()
      await fetch(`${API_BASE}/admin/tenants/${tenant.slug}/staff/${staffId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch {}
    setStaffList((prev) => prev.filter((s) => s.id !== staffId))
    onToast('Staff member access removed.')
  }

  // Handle file upload — converts to base64 DataURL
  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      onToast('Please select an image file (PNG, JPG, SVG, WebP)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      onToast('Image must be smaller than 5MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setLogoPreview(dataUrl)
      setLogoUrl(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  const handleSaveLogo = () => {
    const finalLogo = isUploadMode ? logoPreview : logoUrl
    if (!finalLogo) {
      onToast('Please upload or enter a logo URL first')
      return
    }
    setIsSavingLogo(true)
    setTimeout(() => {
      // Save to mockStore so storefront picks it up
      mockStore.updateTenant(tenant.id, {
        logo: finalLogo,
        theme: { ...tenant.theme, logoUrl: finalLogo },
      })
      mockStore.updateTheme(tenant.id, {
        logoUrl: finalLogo,
      })
      refreshTenant()
      setIsSavingLogo(false)
      onToast('✅ Brand logo saved! It is now live on your storefront.')
    }, 400)
  }

  const handleRemoveLogo = () => {
    setLogoPreview('')
    setLogoUrl('')
    mockStore.updateTenant(tenant.id, {
      logo: '',
      theme: { ...tenant.theme, logoUrl: '' },
    })
    mockStore.updateTheme(tenant.id, {
      logoUrl: '',
    })
    refreshTenant()
    onToast('Logo removed. Storefront will now show your brand initial.')
  }

  const currentLogo = isUploadMode ? logoPreview : logoUrl

  const currentEffectivePassword = authService.getStoreCredential(tenant.slug).password

  const copyAccessPass = () => {
    const text = `================================================
🏢 STORE OWNER ACCESS PASS — ${tenant.brandName.toUpperCase()}
================================================
Merchant Dashboard: ${sellerPortalUrl(tenant.slug)}
Customer Storefront: ${storefrontUrl(tenant.slug)}

🔑 CREDENTIALS:
Login ID / Email: ${tenant.ownerEmail}
Login Username: ${tenant.slug}
Current Password: ${currentEffectivePassword}
Owner: ${tenant.ownerName}
================================================`
    navigator.clipboard.writeText(text)
    onToast('📋 Merchant access pass copied to clipboard!')
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* ── 1. AUTHENTICATION & LOGIN CREDENTIALS PANEL (PRIMARY) ── */}
      <div className="bg-white rounded-xl border border-black/8 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-black/8 bg-stone-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-lg">
              🔐
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wider uppercase text-white">
                Store Authentication & Login Credentials
              </h3>
              <p className="text-[11px] text-white/50 mt-0.5">
                Set and update your store owner password, login email, and staff access accounts.
              </p>
            </div>
          </div>

          <button
            onClick={copyAccessPass}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
          >
            <span>📋</span>
            <span>Copy Access Pass</span>
          </button>
        </div>

        {/* Sub Navigation */}
        <div className="flex border-b border-black/8 px-6 bg-stone-50/60 text-xs font-bold overflow-x-auto">
          <button
            onClick={() => setAuthSubTab('password')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              authSubTab === 'password'
                ? 'border-black text-black'
                : 'border-transparent text-black/40 hover:text-black'
            }`}
          >
            <span>🔑</span>
            <span>Change Store Password</span>
          </button>

          <button
            onClick={() => setAuthSubTab('profile')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              authSubTab === 'profile'
                ? 'border-black text-black'
                : 'border-transparent text-black/40 hover:text-black'
            }`}
          >
            <span>✉️</span>
            <span>Login Email & Profile</span>
          </button>

          <button
            onClick={() => setAuthSubTab('staff')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              authSubTab === 'staff'
                ? 'border-black text-black'
                : 'border-transparent text-black/40 hover:text-black'
            }`}
          >
            <span>👥</span>
            <span>Staff Operator Logins ({staffList.length})</span>
          </button>

          <button
            onClick={() => setAuthSubTab('pass')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              authSubTab === 'pass'
                ? 'border-black text-black'
                : 'border-transparent text-black/40 hover:text-black'
            }`}
          >
            <span>🎫</span>
            <span>Quick Login Info</span>
          </button>

          <button
            onClick={() => setAuthSubTab('audit')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              authSubTab === 'audit'
                ? 'border-black text-black'
                : 'border-transparent text-black/40 hover:text-black'
            }`}
          >
            <span>🛡️</span>
            <span>Security Audit Trail</span>
          </button>
        </div>

        <div className="p-6">
          {/* TAB: CHANGE PASSWORD */}
          {authSubTab === 'password' && (
            <form onSubmit={handleChangePassword} className="space-y-5 max-w-xl">
              {passError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{passError}</span>
                </div>
              )}

              {passSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <span>✅</span>
                  <span>{passSuccess}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-black">
                    Current Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="text-[11px] text-black/50 hover:text-black font-semibold cursor-pointer"
                  >
                    {showCurrentPass ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password (if set)"
                  className="w-full bg-stone-50 border border-black/15 focus:border-black rounded-xl px-4 py-2.5 text-xs text-black outline-none transition-all font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-black">
                    New Store Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="text-[11px] text-black/50 hover:text-black font-semibold cursor-pointer"
                  >
                    {showNewPass ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Enter new password (min 6 chars)"
                  className="w-full bg-stone-50 border border-black/15 focus:border-black rounded-xl px-4 py-2.5 text-xs text-black outline-none transition-all font-mono"
                />

                {/* Password Strength Meter */}
                {newPassword && (
                  <div className="pt-1.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-black/50">Password Strength:</span>
                      <span className={`font-bold ${passStrength.text}`}>{passStrength.label}</span>
                    </div>
                    <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden flex gap-1">
                      {[1, 2, 3, 4, 5].map((step) => (
                        <div
                          key={step}
                          className={`h-full flex-1 rounded-full transition-all ${
                            step <= passStrength.score ? passStrength.color : 'bg-stone-200'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-black">
                  Confirm New Password
                </label>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Re-type new password"
                  className="w-full bg-stone-50 border border-black/15 focus:border-black rounded-xl px-4 py-2.5 text-xs text-black outline-none transition-all font-mono"
                />
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-[11px] text-rose-500 font-semibold">Passwords do not match</p>
                )}
                {confirmPassword && confirmPassword === newPassword && (
                  <p className="text-[11px] text-emerald-600 font-semibold">✓ Passwords match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isChangingPassword || !newPassword || newPassword !== confirmPassword}
                className="bg-black hover:bg-stone-800 text-white font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-xl transition-all cursor-pointer disabled:opacity-40 flex items-center gap-2 shadow-sm"
              >
                {isChangingPassword ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <span>💾 Update Store Password</span>
                )}
              </button>
            </form>
          )}

          {/* TAB: PROFILE & EMAIL */}
          {authSubTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-5 max-w-xl">
              <div className="bg-stone-50 rounded-xl p-4 border border-black/8 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono text-black/40 uppercase font-bold">Store portal username</p>
                  <code className="text-xs font-mono font-bold text-indigo-700">{tenant.slug}</code>
                </div>
                <span className="text-[11px] bg-stone-200/80 px-2.5 py-1 rounded text-black/60 font-mono">
                  {storeAddress(tenant.slug)}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-black">
                  Store Owner Full Name
                </label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  required
                  placeholder="e.g. Gowreesh KP"
                  className="w-full bg-stone-50 border border-black/15 focus:border-black rounded-xl px-4 py-2.5 text-xs text-black outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-black">
                  Primary Login Email / Notification Address
                </label>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  required
                  placeholder="e.g. owner@store.com"
                  className="w-full bg-stone-50 border border-black/15 focus:border-black rounded-xl px-4 py-2.5 text-xs text-black outline-none transition-all font-mono"
                />
                <p className="text-[11px] text-black/50">
                  This email is used to log into the Merchant Portal and receive order fulfillment notifications.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-black">
                  Owner Phone / WhatsApp Contact
                </label>
                <input
                  type="text"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full bg-stone-50 border border-black/15 focus:border-black rounded-xl px-4 py-2.5 text-xs text-black outline-none transition-all font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingProfile}
                className="bg-black hover:bg-stone-800 text-white font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-xl transition-all cursor-pointer disabled:opacity-40 flex items-center gap-2 shadow-sm"
              >
                {isSavingProfile ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>💾 Save Account Profile</span>
                )}
              </button>
            </form>
          )}

          {/* TAB: STAFF OPERATOR LOGINS */}
          {authSubTab === 'staff' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-black">
                    Staff Operator Sub-Accounts
                  </h4>
                  <p className="text-[11px] text-black/50">
                    Grant team members access to catalog and order fulfillment without sharing your master store password.
                  </p>
                </div>
              </div>

              {staffMsg && (
                <div className="p-3 bg-stone-50 rounded-xl border border-black/10 text-xs font-mono">
                  {staffMsg}
                </div>
              )}

              {/* Add Staff Form */}
              <form onSubmit={handleCreateStaff} className="bg-stone-50 rounded-xl p-4 border border-black/10 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-black">+ Add New Team Member</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    required
                    placeholder="Staff Full Name"
                    className="bg-white border border-black/15 rounded-lg px-3 py-2 text-xs text-black outline-none focus:border-black"
                  />
                  <input
                    type="email"
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    required
                    placeholder="Staff Email"
                    className="bg-white border border-black/15 rounded-lg px-3 py-2 text-xs text-black outline-none focus:border-black font-mono"
                  />
                  <select
                    value={staffRole}
                    onChange={(e) => setStaffRole(e.target.value as 'staff' | 'manager')}
                    className="bg-white border border-black/15 rounded-lg px-3 py-2 text-xs text-black outline-none focus:border-black"
                  >
                    <option value="staff">Role: Fulfillment Staff (Orders & Products)</option>
                    <option value="manager">Role: Store Manager (Full Dashboard)</option>
                  </select>
                  <input
                    type="password"
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    required
                    placeholder="Staff Password (min 8 chars)"
                    className="bg-white border border-black/15 rounded-lg px-3 py-2 text-xs text-black outline-none focus:border-black font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAddingStaff}
                  className="bg-stone-900 hover:bg-black text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  {isAddingStaff ? 'Adding...' : '+ Add Staff Account'}
                </button>
              </form>

              {/* Staff Table */}
              <div className="border border-black/10 rounded-xl overflow-hidden">
                {staffList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-black/40">
                    No staff members added yet. Add team members above to grant sub-account access.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-black/10 bg-stone-50 text-black/60 uppercase font-mono text-[10px]">
                        <th className="text-left px-4 py-2.5">Name</th>
                        <th className="text-left px-4 py-2.5">Email</th>
                        <th className="text-left px-4 py-2.5">Role</th>
                        <th className="text-right px-4 py-2.5">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {staffList.map((s) => (
                        <tr key={s.id} className="hover:bg-stone-50">
                          <td className="px-4 py-2.5 font-bold">{s.name}</td>
                          <td className="px-4 py-2.5 font-mono text-black/60">{s.email}</td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase border border-indigo-200">
                              {s.role}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteStaff(s.id)}
                              className="text-rose-600 hover:text-rose-800 text-xs font-semibold cursor-pointer"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB: QUICK ACCESS PASS */}
          {authSubTab === 'pass' && (
            <div className="space-y-4">
              <div className="bg-stone-900 text-white rounded-xl p-5 border border-black/10 space-y-3 font-mono text-xs shadow-inner">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <span className="font-bold text-amber-400">MERCHANT ACCESS PASS</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                    ACTIVE
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-white/40 block text-[10px]">STORE NAME</span>
                    <span className="font-bold text-white">{tenant.brandName}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[10px]">USERNAME / SLUG</span>
                    <span className="font-bold text-amber-300">{tenant.slug}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[10px]">LOGIN EMAIL</span>
                    <span className="font-bold text-white">{tenant.ownerEmail}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[10px]">ACTIVE PASSWORD</span>
                    <span className="font-bold text-emerald-400">{currentEffectivePassword}</span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-white/10 flex items-center justify-end text-[10px] text-white/50">
                  <button
                    onClick={copyAccessPass}
                    className="text-white bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded transition-colors font-sans font-bold cursor-pointer"
                  >
                    📋 Copy Pass
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: AUDIT LOGS */}
          {authSubTab === 'audit' && (
            <div className="pt-2">
              <StoreAuditLogs tenant={tenant} onToast={onToast} />
            </div>
          )}
        </div>
      </div>

      {/* ── 2. BRAND IDENTITY & LOGO ── */}
      <div className="bg-white rounded-xl border border-black/8 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-black/8 flex items-center gap-3">
          <span className="text-lg">🖼️</span>
          <div>
            <h3 className="text-sm font-bold tracking-wider uppercase text-black">Brand Identity & Logo</h3>
            <p className="text-[11px] text-black/40 mt-0.5">Upload your store logo — it appears in the storefront header, product pages, and order emails.</p>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Upload Controls */}
          <div className="space-y-5">
            {/* Mode Toggle */}
            <div className="flex bg-stone-100 rounded-lg p-1 gap-1">
              <button
                onClick={() => setIsUploadMode(true)}
                className={`flex-1 text-xs font-bold py-2 rounded-md transition-all cursor-pointer ${isUploadMode ? 'bg-white shadow-sm text-black' : 'text-black/40 hover:text-black'}`}
              >
                📁 Upload File
              </button>
              <button
                onClick={() => setIsUploadMode(false)}
                className={`flex-1 text-xs font-bold py-2 rounded-md transition-all cursor-pointer ${!isUploadMode ? 'bg-white shadow-sm text-black' : 'text-black/40 hover:text-black'}`}
              >
                🔗 Paste URL
              </button>
            </div>

            {isUploadMode ? (
              /* File Upload Drop Zone */
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-black bg-stone-50 scale-[1.02]'
                    : 'border-black/20 hover:border-black/50 hover:bg-stone-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
                />
                <div className="text-3xl mb-3">{isDragging ? '📂' : '🖼️'}</div>
                <p className="text-sm font-bold text-black/80">
                  {isDragging ? 'Drop to upload' : 'Click or drag & drop your logo'}
                </p>
                <p className="text-xs text-black/40 mt-1.5">PNG, JPG, SVG, WebP — Max 5MB</p>
                {logoPreview && isUploadMode && (
                  <div className="mt-3 text-[11px] text-emerald-600 font-semibold">
                    ✓ Logo loaded — click Save to apply
                  </div>
                )}
              </div>
            ) : (
              /* URL Input */
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-black/60">
                  Logo Image URL
                </label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://your-cdn.com/logo.png"
                  className="w-full bg-stone-50 border border-black/15 focus:border-black rounded-lg px-4 py-3 text-xs text-black placeholder-black/25 outline-none transition-all font-mono"
                />
                <p className="text-[11px] text-black/40">
                  Enter a public image URL (must be accessible via https://)
                </p>
              </div>
            )}

            {/* Save / Remove buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleSaveLogo}
                disabled={isSavingLogo || !currentLogo}
                className="flex-1 bg-black hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                {isSavingLogo ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>💾 Save Logo to Storefront</span>
                )}
              </button>
              {(tenant.logo || tenant.theme?.logoUrl) && (
                <button
                  onClick={handleRemoveLogo}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold px-4 py-3 rounded-xl transition-all cursor-pointer"
                  title="Remove logo"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-black/50">Live Storefront Preview</p>

            {/* Header Preview */}
            <div className="border border-black/10 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-black/8">
                {currentLogo ? (
                  <img
                    src={currentLogo}
                    alt="Logo preview"
                    className="h-9 w-auto max-w-[140px] object-contain rounded"
                    onError={() => onToast('⚠️ Could not load that image URL — check the link')}
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-xs"
                    style={{ backgroundColor: tenant.theme?.primaryColor || '#111' }}
                  >
                    {tenant.brandName?.charAt(0) || 'S'}
                  </div>
                )}
                <span className="font-serif font-bold text-sm uppercase tracking-widest text-black">
                  {tenant.brandName}
                </span>
                <div className="ml-auto flex gap-4">
                  <span className="text-[10px] text-black/40 font-bold uppercase">Collections</span>
                  <span className="text-[10px] text-black/40 font-bold uppercase">About</span>
                  <span className="text-[10px] text-black/40 font-bold uppercase">Contact</span>
                </div>
              </div>
              <div
                className="h-20 flex items-center justify-center"
                style={{ backgroundColor: tenant.theme?.backgroundColor || '#FAFAF8' }}
              >
                <p className="text-xs text-black/25 italic">Storefront header preview</p>
              </div>
            </div>

            {/* Current logo status */}
            <div className="bg-stone-50 rounded-lg p-3.5 border border-black/8">
              <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-2">Current Logo Status</p>
              {tenant.logo || tenant.theme?.logoUrl ? (
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold text-sm">●</span>
                  <span className="text-xs text-black/70 font-semibold">Custom logo active on storefront</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-amber-500 font-bold text-sm">●</span>
                  <span className="text-xs text-black/50">Using brand initial fallback — upload a logo to brand your store</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── STORE DOMAIN & ACCOUNT ── */}
      <div className="bg-white rounded-xl p-6 border border-black/8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold tracking-wider uppercase text-black/50">Store Domain & Account</h3>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
            ● Store Status: {tenant.status.toUpperCase()}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-black/40 text-xs mb-1">Store Name</p>
            <p className="font-bold text-base">{tenant.brandName}</p>
          </div>
          <div>
            <p className="text-black/40 text-xs mb-1">Platform storefront</p>
            <a href={tenantPortalPath(tenant.slug)} className="font-mono font-bold text-xs bg-stone-100 p-2 rounded text-amber-900 border border-black/5 block hover:underline">
              {storeAddress(tenant.slug)}
            </a>
          </div>
          <div>
            <p className="text-black/40 text-xs mb-1">Management dashboard</p>
            <p className="font-mono font-bold text-xs bg-stone-100 p-2 rounded text-amber-900 border border-black/5 block">
              Opens after the private store owner login link
            </p>
          </div>
          <div>
            <p className="text-black/40 text-xs mb-1">Merchant Owner</p>
            <p className="font-semibold">{tenant.ownerName}</p>
          </div>
          <div>
            <p className="text-black/40 text-xs mb-1">Account Email</p>
            <p className="font-semibold">{tenant.ownerEmail}</p>
          </div>
        </div>
        <CustomDomainPanel slug={tenant.slug} current={tenant.customDomain || ''} verified={Boolean(tenant.customDomainVerified)} onSaved={() => refreshTenant()} onToast={onToast} />
      </div>

      <TenantSubscriptionBilling tenant={tenant} onToast={onToast} onPaid={() => refreshTenant()} />

    </div>
  )
}
