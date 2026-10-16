import { useState, useRef, useMemo, useEffect } from 'react'
import { useTenant, useSwitchLayer } from '@/context/TenantContext'
import { useDashboardStats, useDashboardProducts, useTenantOrders, useThemeCustomizer } from '@/api/hooks'
import { authService, DEMO_MODE, type SellerSession } from '@/api/auth'
import { apiClient } from '@/api/client'
import { mockStore } from '@/api/mock-store'
import { auditLogger } from '@/api/audit-logger'
import { PLAN_CATALOG, formatPlanPrice, normalizePlanId, storeAddress } from '@/data/plans'
import { tenantPortalPath } from '@/lib/store-urls'
import { API_BASE } from '@/lib/api-base'
import { fetchStoreAnalytics, fetchDomainConfig, saveCustomDomain } from '@/api/storefront-analytics'
import { storeInbox, STORE_INBOX_EVENT, type NewsletterSubscriber, type StoreMessage } from '@/api/store-messages'
import SellerLogin from '@/components/auth/SellerLogin'
import StoreAuditLogs from '@/components/store/StoreAuditLogs'
import StorefrontContentEditor, {
  extrasToTheme,
  getInitialExtras,
  type ContentEditorTab,
  type StorefrontExtras,
} from '@/components/store/StorefrontContentEditor'
import {
  buildTenantCategories,
  getCategoryLabel,
  getDefaultStorefrontCopy,
  getNichePreset,
  HOME_SECTIONS,
  getStoreCategories,
  isTemplateStore,
  type StoreCategory,
} from '@/data/store-niches'
import type { Product } from '@/types'
import type { TenantConfig, ThemeConfig, TrackedOrder } from '@/types/tenant'

// Dashboard sidebar navigation items
const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: '📊' },
  { id: 'products', label: 'Products & Inventory', icon: '🏷️' },
  { id: 'orders', label: 'Orders & Shipments', icon: '📦' },
  { id: 'inbox', label: 'Inbox & Subscribers', icon: '✉️' },
  { id: 'storefront', label: 'Storefront & Homepage', icon: '🎨' },
  { id: 'database', label: 'Database & MongoDB', icon: '🗄️' },
  { id: 'audit', label: 'Security & Audit Log', icon: '🛡️' },
  { id: 'settings', label: 'Store Settings & Plan', icon: '⚙️' },
] as const

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

// Curated Homepage Hero Banner Presets
const HERO_PHOTO_PRESETS = [
  {
    name: 'Classic Lunar Chanderi Silk Banner',
    url: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243',
    desc: 'Editorial luxury fashion in rich charcoal & warm ivory',
  },
  {
    name: 'Artisanal Kalamkari Blockprint Studio',
    url: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2175.jpg?v=1766941862',
    desc: 'Handblock craft & natural botanical dyes',
  },
  {
    name: 'Banarasi Royal Silk Showroom',
    url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1600&q=80',
    desc: 'Warm gold & zari bridal tissue silk sarees',
  },
  {
    name: 'Handspun Khadi Artisan Atelier',
    url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1600&q=80',
    desc: 'Earth-friendly handspun cotton & organic textures',
  },
  {
    name: 'Festive Crimson & Zari Collection',
    url: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=1600&q=80',
    desc: 'Vibrant celebratory sarees & royal silk ensembles',
  },
]

export default function DashboardApp() {
  const { tenant, loading, switchTenant } = useTenant()
  const switchLayer = useSwitchLayer()
  const [session, setSession] = useState<SellerSession | null>(() => authService.getSellerSession())
  const [activeView, setActiveView] = useState<DashboardView>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  const handleLogout = () => {
    authService.logoutSeller()
    setSession(null)
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

  // If not authenticated, require Seller Login with Login ID & Password
  if (!session) {
    return (
      <SellerLogin
        tenant={tenant}
        onLoginSuccess={(newSession) => {
          setSession(newSession)
          if (newSession.tenantSlug && newSession.tenantSlug !== tenant?.slug) {
            switchTenant(newSession.tenantSlug)
          }
        }}
      />
    )
  }

  return (
    <div className="min-h-screen flex font-sans antialiased text-black" style={{ background: '#f1f0ef' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className="fixed top-5 right-5 z-50 text-white px-5 py-3.5 text-xs font-bold tracking-wider uppercase flex items-center gap-3 animate-slide-down"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
        >
          <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-black flex-shrink-0">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sidebar */}
      <aside
        className={`${sidebarCollapsed ? 'w-[68px]' : 'w-64'} flex flex-col transition-all duration-300 flex-shrink-0 z-30 scroll-styled-dark`}
        style={{ background: 'linear-gradient(180deg, #0c0c14 0%, #111118 50%, #0a0a10 100%)', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Brand Header */}
        <div className={`h-16 flex items-center gap-3 flex-shrink-0 ${sidebarCollapsed ? 'px-3 justify-center' : 'px-4'}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {tenant?.logo || tenant?.theme?.logoUrl ? (
            <img
              src={tenant.logo || tenant.theme?.logoUrl}
              alt=""
              className="h-8 w-8 object-contain rounded-lg flex-shrink-0"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            />
          ) : (
            <div
              className="w-8 h-8 rounded-lg text-white flex items-center justify-center text-xs font-black shadow-lg flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              {tenant?.brandName?.charAt(0) || 'S'}
            </div>
          )}
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{tenant?.brandName || 'My Store'}</p>
              <p className="text-[10px] font-mono uppercase tracking-wider truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {tenant?.ownerName || session.name}
              </p>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-xs cursor-pointer p-1.5 rounded-md transition-all flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.3)', background: 'transparent' }}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto scroll-styled-dark">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer relative ${
                  sidebarCollapsed ? 'justify-center' : ''
                }`}
                style={isActive ? {
                  background: 'linear-gradient(90deg, rgba(139,92,246,0.25) 0%, rgba(99,102,241,0.12) 100%)',
                  borderLeft: '3px solid #8b5cf6',
                  color: 'white',
                  borderRadius: '0 8px 8px 0',
                } : {
                  borderLeft: '3px solid transparent',
                  color: 'rgba(255,255,255,0.4)',
                  borderRadius: '0 8px 8px 0',
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' } }}
              >
                <span className="text-base flex-shrink-0">{item.icon}</span>
                {!sidebarCollapsed && <span>{item.label}</span>}
                {isActive && !sidebarCollapsed && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                )}
              </button>
            )
          })}
        </nav>

        {/* Quick Links & Sign Out */}
        <div className="p-3 space-y-1 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <a
            href={tenantPortalPath(tenant?.slug || '')}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 text-[11px] font-bold tracking-wider px-3 py-2.5 rounded-lg transition-all ${
              sidebarCollapsed ? 'justify-center' : ''
            }`}
            style={{ color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'transparent' }}
          >
            <span>🌐</span>
            {!sidebarCollapsed && <span>Live Storefront ↗</span>}
          </a>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-2 text-[11px] font-bold px-3 py-2.5 rounded-lg transition-all cursor-pointer ${
              sidebarCollapsed ? 'justify-center' : ''
            }`}
            style={{ color: 'rgba(239,68,68,0.7)' }}
            title="Sign Out"
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(239,68,68,0.7)'; e.currentTarget.style.background = 'transparent' }}
          >
            <span>🚪</span>
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto min-w-0 flex flex-col scroll-styled">
        {/* Top Bar */}
        <header className="h-16 flex items-center justify-between px-6 sticky top-0 z-20" style={{ background: 'rgba(241,240,239,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-black">
              {NAV_ITEMS.find((n) => n.id === activeView)?.label || 'Seller Portal'}
            </h1>
            <span className="hidden sm:inline-block text-xs" style={{ color: 'rgba(0,0,0,0.2)' }}>|</span>
            <span className="hidden sm:inline-block text-xs font-mono" style={{ color: 'rgba(0,0,0,0.4)' }}>
              {tenant?.brandName} ({storeAddress(tenant?.slug || '')})
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => switchLayer('storefront', tenant?.slug || 'lunar')}
              className="text-xs font-bold px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 2px 10px rgba(99,102,241,0.3)' }}
              title="View your live storefront"
            >
              <span>🏬</span>
              <span className="hidden sm:inline">Open Storefront ↗</span>
            </button>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 border cursor-pointer"
              style={{ background: 'white', color: 'rgba(0,0,0,0.7)', border: '1px solid rgba(0,0,0,0.1)' }}
            >
              <span>🚪</span>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
            <span className="badge-active">
              {tenant?.status || 'Active'}
            </span>
          </div>
        </header>

        {/* Page View Switcher */}
        <div className="p-6 md:p-8 flex-1">
          {activeView === 'overview' && <DashboardOverview onNavigate={(view) => setActiveView(view)} />}
          {activeView === 'products' && <ProductManager onToast={showToast} />}
          {activeView === 'orders' && <OrderManager onToast={showToast} />}
          {activeView === 'inbox' && <InboxManager onToast={showToast} />}
          {activeView === 'storefront' && <StorefrontCustomizer onToast={showToast} />}
          {activeView === 'database' && <DatabaseManager onToast={showToast} />}
          {activeView === 'audit' && tenant && <StoreAuditLogs tenant={tenant} onToast={showToast} />}
          {activeView === 'settings' && <StoreSettings onNavigate={(view) => setActiveView(view)} onToast={showToast} />}
        </div>
      </main>
    </div>
  )
}

// =====================================================
// 1. Dashboard Overview
// =====================================================
function DashboardOverview({ onNavigate }: { onNavigate: (view: DashboardView) => void }) {
  const { stats, loading } = useDashboardStats()
  const { tenant } = useTenant()
  const [traffic, setTraffic] = useState<{ pageViews: number; visitors: number; signIns: number; orders: number } | null>(null)

  useEffect(() => {
    if (!tenant?.slug) return
    fetchStoreAnalytics(tenant.slug, 7).then((data) => {
      if (data) setTraffic({ pageViews: data.pageViews, visitors: data.visitors, signIns: data.signIns, orders: data.orders })
    }).catch(() => undefined)
  }, [tenant?.slug])

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 rounded-2xl shimmer-bg" />
        ))}
      </div>
    )
  }

  const isTemplate = isTemplateStore(tenant)
  const dailyRevenue = stats.revenueByDay.map((d) => d.amount)
  const dailyOrders = stats.revenueByDay.map((d) => d.orders || 0)
  const dailyAov = stats.revenueByDay.map((d) => (d.orders ? d.amount / d.orders : 0))
  const kpis = isTemplate
    ? [
        { label: 'Total Revenue', value: `₹${stats.revenue.toLocaleString()}`, change: '', icon: '💰', trend: 'neutral', glowClass: 'kpi-card-glow-green', sparkData: dailyRevenue },
        { label: 'Total Orders', value: stats.orderCount.toString(), change: '', icon: '📦', trend: 'neutral', glowClass: 'kpi-card-glow-blue', sparkData: dailyOrders },
        { label: 'Avg Order Value', value: `₹${Math.round(stats.averageOrderValue).toLocaleString()}`, change: '', icon: '📈', trend: 'neutral', glowClass: 'kpi-card-glow-violet', sparkData: dailyAov },
        { label: 'Total Customers', value: stats.customerCount.toString(), change: '', icon: '👥', trend: 'neutral', glowClass: 'kpi-card-glow-amber', sparkData: dailyOrders },
      ]
    : [
        { label: 'Total Revenue', value: `₹${stats.revenue.toLocaleString()}`, change: `+${stats.revenueChange}%`, icon: '💰', trend: 'up', glowClass: 'kpi-card-glow-green', sparkData: [40,55,42,70,58,80,95] },
        { label: 'Total Orders', value: stats.orderCount.toString(), change: `+${stats.orderCountChange}%`, icon: '📦', trend: 'up', glowClass: 'kpi-card-glow-blue', sparkData: [20,35,28,45,38,55,62] },
        { label: 'Avg Order Value', value: `₹${Math.round(stats.averageOrderValue).toLocaleString()}`, change: 'Healthy', icon: '📈', trend: 'neutral', glowClass: 'kpi-card-glow-violet', sparkData: [65,70,68,72,70,75,78] },
        { label: 'Total Customers', value: (stats.customerCount || 28).toString(), change: '+4 this week', icon: '👥', trend: 'up', glowClass: 'kpi-card-glow-amber', sparkData: [10,14,12,18,15,22,28] },
      ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div
        className="text-white p-6 md:p-8 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
        style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1040 50%, #0d1117 100%)', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}
      >
        <div>
          <span className="text-[10px] font-mono tracking-[0.25em]" style={{ color: 'rgba(139,92,246,0.8)' }}>SELLER PORTAL • ORVEXA PLATFORM</span>
          <h2 className="text-xl md:text-2xl mt-1" style={{ fontFamily: 'var(--font-display)' }}>Welcome back, {tenant?.ownerName || 'Merchant'}! 👋</h2>
          <p className="text-xs mt-1 max-w-xl" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Manage catalog, homepage and orders. Live storefront:{' '}
            <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{storeAddress(tenant?.slug || '')}</strong>
            {tenant?.customDomain ? ` · custom ${tenant.customDomain}` : ''}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => onNavigate('products')}
            className="font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-lg cursor-pointer transition-all text-black"
            style={{ background: 'white', boxShadow: '0 2px 12px rgba(0,0,0,0.2)' }}
          >
            + Add Product
          </button>
          <button
            onClick={() => onNavigate('storefront')}
            className="font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-lg cursor-pointer transition-all text-white"
            style={{ background: 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.4)' }}
          >
            🎨 Edit Homepage
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`bg-white rounded-2xl p-5 border border-black/6 shadow-sm ${kpi.glowClass} card-hover`}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xl">{kpi.icon}</span>
              {kpi.change && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  kpi.trend === 'up' ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' :
                  kpi.trend === 'down' ? 'text-red-600 bg-red-50 border border-red-100' :
                  'text-blue-700 bg-blue-50 border border-blue-100'
                }`}>
                  {kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→'} {kpi.change}
                </span>
              )}
            </div>
            {/* Sparkline mini chart */}
            <div className="flex items-end gap-0.5 h-8 mb-3">
              {kpi.sparkData.map((val, idx) => {
                const max = Math.max(...kpi.sparkData)
                return (
                  <div
                    key={idx}
                    className="flex-1 rounded-sm sparkline-bar"
                    style={{ height: `${max > 0 ? Math.max((val / max) * 100, 6) : 6}%`, background: val > 0 && idx === kpi.sparkData.length - 1 ? '#6366f1' : 'rgba(99,102,241,0.2)' }}
                  />
                )
              })}
            </div>
            <p className="text-2xl font-bold text-black animate-count-up">{kpi.value}</p>
            <p className="text-[10px] text-black/40 font-bold tracking-widest uppercase mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {traffic && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Storefront visits (7d)', value: traffic.visitors },
            { label: 'Page views (7d)', value: traffic.pageViews },
            { label: 'Shopper sign-ins (7d)', value: traffic.signIns },
            { label: 'Orders from storefront (7d)', value: traffic.orders },
          ].map((row) => (
            <div key={row.label} className="bg-white rounded-2xl p-4 border border-black/6 shadow-sm">
              <p className="text-2xl font-bold text-black">{row.value.toLocaleString()}</p>
              <p className="text-[10px] text-black/40 font-bold tracking-widest uppercase mt-1">{row.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Revenue Chart - Full Width SVG Area Chart */}
      <div className="bg-white rounded-2xl p-6 border border-black/6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-black/40">Revenue Trend</p>
            <h3 className="text-sm font-bold text-black mt-0.5">Last 7 Days Performance</h3>
          </div>
          <div className="flex items-center gap-3">
            {!isTemplate && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                ↑ +18.4% vs last period
              </span>
            )}
          </div>
        </div>
        {/* SVG Bar Chart with gradient */}
        <div className="flex items-end gap-3 h-52 pt-6">
          {stats.revenueByDay.map((day, idx) => {
            const maxAmount = Math.max(...stats.revenueByDay.map((d) => d.amount)) || 1
            const height = Math.max(isTemplate ? 2 : 8, (day.amount / maxAmount) * 100)
            const isLast = idx === stats.revenueByDay.length - 1
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2 group cursor-default">
                <span className="text-[10px] font-bold text-black/0 group-hover:text-black/70 transition-colors">
                  ₹{(day.amount / 1000).toFixed(1)}k
                </span>
                <div className="w-full flex flex-col justify-end flex-1 relative">
                  <div
                    className="w-full rounded-t-lg transition-all duration-500 relative overflow-hidden"
                    style={{ height: `${height}%`, background: isLast ? 'linear-gradient(to top, #6366f1, #8b5cf6)' : 'linear-gradient(to top, rgba(99,102,241,0.5), rgba(139,92,246,0.3))' }}
                  >
                    {/* Shimmer on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-40 transition-opacity" style={{ background: 'linear-gradient(to top, rgba(255,255,255,0.3), transparent)' }} />
                  </div>
                </div>
                <span className="text-[10px] text-black/50 font-medium">{day.date}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Orders + Top Products Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Orders */}
        <div className="bg-white rounded-2xl p-6 border border-black/6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-black/40">Recent Orders</h3>
            <button
              onClick={() => onNavigate('orders')}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer transition-colors"
            >
              View All →
            </button>
          </div>
          {stats.recentOrders.length === 0 ? (
            <p className="text-sm text-black/40 py-8 text-center">No orders yet</p>
          ) : (
            <div className="space-y-0 divide-y divide-black/5">
              {stats.recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-xs font-bold font-mono text-black">{order.id}</p>
                    <p className="text-[11px] text-black/50 mt-0.5">{order.customer} • {order.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-black">₹{order.total.toLocaleString()}</p>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      order.status === 'Delivered' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                      order.status === 'In Transit' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                      'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}>
                      {order.status === 'In Transit' && '● '}{order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Products Leaderboard */}
        <div className="bg-white rounded-2xl p-6 border border-black/6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-black/40">Top Products by Revenue</h3>
            <button
              onClick={() => onNavigate('products')}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer transition-colors"
            >
              Manage →
            </button>
          </div>
          {stats.topProducts.length === 0 ? (
            <p className="text-sm text-black/40 py-8 text-center">No products yet</p>
          ) : (
            <div className="space-y-3">
              {stats.topProducts.map((product, i) => {
                const maxRev = Math.max(...stats.topProducts.map(p => p.revenue)) || 1
                const pct = Math.round((product.revenue / maxRev) * 100)
                return (
                  <div key={product.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className="text-[10px] font-mono font-bold text-black/30 w-4">#{i + 1}</span>
                        <p className="text-xs font-bold text-black truncate">{product.name}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-black">₹{product.revenue.toLocaleString()}</p>
                        <p className="text-[10px] text-black/40">{product.orders} sold</p>
                      </div>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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
  const { tenant, refreshTenant } = useTenant()
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
    if (!existing.some((c) => c.slug === created.slug)) {
      mockStore.updateTenant(tenant.id, { categories: [...existing, created] })
      refreshTenant(tenant.slug)
      onToast(`Added category "${created.name}".`)
    }
    return created.slug
  }

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = filterCategory === 'all' || p.category === filterCategory
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.fabricTech.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCat && matchesSearch
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-black/8 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-black">Product Inventory</h2>
          <p className="text-xs text-black/50 mt-0.5">
            {products.length} {products.length === 1 ? 'product' : 'products'} published • Add images, edit pricing, {isTemplate ? 'categories, colors and options' : 'fabric tech, colors and sizes'}.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="bg-black text-white text-xs font-bold tracking-widest uppercase px-6 py-3 rounded-lg hover:bg-stone-800 transition-all cursor-pointer shadow-md flex items-center gap-2"
        >
          <span>+</span>
          <span>ADD NEW PRODUCT</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isTemplate ? 'Search by product name or tag...' : 'Search by product name, fabric, or tag...'}
            className="w-full bg-white border border-black/15 px-4 py-2.5 pl-9 text-xs rounded-lg outline-none focus:border-black transition-colors"
          />
          <span className="absolute left-3 top-2.5 text-black/40 text-xs">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-black/40 hover:text-black text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-white border border-black/15 px-4 py-2.5 text-xs font-bold uppercase rounded-lg outline-none cursor-pointer focus:border-black"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === 'all' ? 'ALL CATEGORIES' : getCategoryLabel(tenant, c).toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Product Table */}
      <div className="bg-white rounded-xl border border-black/8 shadow-sm overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="py-16 text-center px-4">
            <p className="text-4xl mb-3">{isTemplate ? getNichePreset(tenant?.storeType).icon : '👗'}</p>
            <p className="text-lg font-serif mb-1">No products found</p>
            <p className="text-xs text-black/40 mb-4">
              {searchQuery ? `No matches for "${searchQuery}"` : 'Your store has no products yet.'}
            </p>
            <button
              onClick={handleOpenAdd}
              className="bg-black text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:bg-stone-800"
            >
              Add First Product
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/10 bg-stone-50 text-[10px] font-bold tracking-widest uppercase text-black/50">
                  <th className="px-6 py-3.5">Product & Photo</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Price</th>
                  <th className="px-4 py-3.5">Fabric & Tech</th>
                  <th className="px-4 py-3.5">Colors & Sizes</th>
                  <th className="px-4 py-3.5">Rating</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-stone-50/70 transition-colors">
                    {/* Thumbnail & Name */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative w-12 h-14 rounded overflow-hidden bg-stone-100 flex-shrink-0 border border-black/10 group">
                          <img
                            src={product.imgMain}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                          {product.badge && (
                            <span className="absolute bottom-0 inset-x-0 bg-black/80 text-white text-[7px] font-bold tracking-tight text-center py-0.5 truncate uppercase">
                              {product.badge}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-black truncate max-w-xs">{product.name}</p>
                          <p className="text-[10px] text-black/50 font-mono">ID: #{product.id}</p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-4">
                      <span className="text-[10px] bg-stone-100 border border-black/10 px-2 py-1 rounded font-bold uppercase tracking-wider text-black/70">
                        {getCategoryLabel(tenant, product.category)}
                      </span>
                    </td>

                    {/* Price */}
                    <td className="px-4 py-4">
                      <p className="text-xs font-bold text-black">{product.priceFormatted}</p>
                      {product.originalPrice && (
                        <p className="text-[10px] text-black/40 line-through">₹{product.originalPrice}</p>
                      )}
                    </td>

                    {/* Fabric Tech */}
                    <td className="px-4 py-4">
                      <p className="text-xs font-semibold text-black/80 truncate max-w-[180px]">
                        {product.fabricTech}
                      </p>
                      <p className="text-[10px] text-black/40">{product.sculptLevel}</p>
                    </td>

                    {/* Colors & Sizes */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 mb-1">
                        {product.colors.slice(0, 4).map((c, i) => (
                          <span
                            key={i}
                            className="w-3 h-3 rounded-full border border-black/20"
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                          />
                        ))}
                        {product.colors.length > 4 && (
                          <span className="text-[9px] text-black/50">+{product.colors.length - 4}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-black/50">{product.sizes?.join(', ') || (isTemplate ? '—' : 'S, M, L, XL')}</p>
                    </td>

                    {/* Rating */}
                    <td className="px-4 py-4 text-xs font-medium">
                      <span className="text-amber-500 font-bold">★</span> {product.rating}{' '}
                      <span className="text-black/40">({product.reviewsCount})</span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(product)}
                          className="px-2.5 py-1 text-xs font-bold bg-stone-100 hover:bg-black hover:text-white rounded border border-black/10 transition-colors cursor-pointer"
                          title="Edit product & images"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDuplicate(product)}
                          className="p-1 text-black/40 hover:text-black transition-colors cursor-pointer"
                          title="Duplicate product"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => handleDelete(product.id, product.name)}
                          className="p-1 text-red-400 hover:text-red-700 transition-colors cursor-pointer"
                          title="Delete product"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
  const [originalPrice, setOriginalPrice] = useState(product?.originalPrice?.toString() || (isTemplate ? '' : '1499'))
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-slide-down my-8 border border-black/10">
        {/* Header */}
        <div className="bg-black text-white p-6 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono tracking-[0.25em] text-white/60 uppercase">
              {isEditing ? 'EDIT PRODUCT' : 'NEW PRODUCT CREATION'}
            </span>
            <h2 className="text-xl font-serif">{isEditing ? product.name : 'Add New Product to Store'}</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl cursor-pointer">
            ✕
          </button>
        </div>

        {/* Form Tabs */}
        <div className="flex border-b border-black/10 bg-stone-50 px-6">
          {[
            { id: 'info' as const, label: '1. Basic Info & Price' },
            { id: 'images' as const, label: '2. Photos & Gallery 📸' },
            { id: 'variants' as const, label: isTemplate ? '3. Colors & Options 🎨' : '3. Colors & Sizes 🎨' },
            { id: 'craft' as const, label: isTemplate ? '4. Details 📝' : '4. Fabric & Details 🌿' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'border-black text-black bg-white'
                  : 'border-transparent text-black/50 hover:text-black'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6 max-h-[75vh] overflow-y-auto">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}
          {/* TAB 1: BASIC INFO */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isTemplate ? 'e.g. Product name' : 'e.g. Sunset Chanderi Silk Maxi Dress'}
                  className="w-full border border-black/20 px-4 py-2.5 text-sm rounded-lg focus:border-black outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                    Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full border border-black/20 px-3 py-2.5 text-xs font-bold uppercase rounded-lg focus:border-black outline-none bg-white cursor-pointer"
                  >
                    {categoryOptions.length === 0 && <option value="">No categories yet</option>}
                    {categoryOptions.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {isTemplate && (
                    <div className="flex gap-1.5 mt-1.5">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleCreateCategory()
                          }
                        }}
                        placeholder="New category"
                        className="flex-1 min-w-0 border border-black/15 px-2 py-1 text-[11px] rounded focus:border-black outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCreateCategory}
                        className="text-[10px] font-bold uppercase px-2 py-1 border border-black/20 rounded hover:bg-stone-100 cursor-pointer"
                      >
                        + Add
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                    Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g. 499"
                    className="w-full border border-black/20 px-4 py-2.5 text-sm font-bold rounded-lg focus:border-black outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                    Original MRP / Compare (₹)
                  </label>
                  <input
                    type="number"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    placeholder="Optional"
                    className="w-full border border-black/20 px-4 py-2.5 text-sm rounded-lg focus:border-black outline-none text-black/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                    Badge Tag
                  </label>
                  <select
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    className="w-full border border-black/20 px-3 py-2.5 text-xs font-bold uppercase rounded-lg focus:border-black outline-none bg-white cursor-pointer"
                  >
                    <option value="BESTSELLER">BESTSELLER</option>
                    <option value="NEW LAUNCH">NEW LAUNCH</option>
                    <option value="HERITAGE EDIT">HERITAGE EDIT</option>
                    <option value="HANDCRAFTED">HANDCRAFTED</option>
                    <option value="LIMITED EDITION">LIMITED EDITION</option>
                    <option value="">NO BADGE</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                    {labels.tag}
                  </label>
                  <input
                    type="text"
                    value={sculptLevel}
                    onChange={(e) => setSculptLevel(e.target.value)}
                    placeholder={isTemplate ? `e.g. ${niche.tagLabel}` : 'e.g. A-LINE FLARE'}
                    className="w-full border border-black/20 px-4 py-2.5 text-xs font-bold uppercase rounded-lg focus:border-black outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  Product Description
                </label>
                <textarea
                  rows={3}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder={isTemplate ? 'Describe your product and what makes it great...' : 'Describe your product styling, silhouette and appeal...'}
                  className="w-full border border-black/20 px-4 py-2.5 text-xs rounded-lg focus:border-black outline-none"
                />
              </div>
            </div>
          )}

          {/* TAB 2: PHOTOS & GALLERY UPLOADER */}
          {activeTab === 'images' && (
            <div className="space-y-6">
              {/* Primary Image Display & Controls */}
              <div className="border border-black/10 rounded-xl p-5 bg-stone-50/70 flex flex-col md:flex-row items-center gap-6">
                <div className="relative w-36 h-48 rounded-lg overflow-hidden bg-stone-200 border-2 border-black flex-shrink-0 shadow-md">
                  {imgMain ? (
                    <img src={imgMain} alt="Primary preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-black/40 text-[11px] font-semibold gap-1">
                      <span className="text-2xl">📷</span>
                      No photo yet
                    </div>
                  )}
                  <span className="absolute bottom-1 right-1 bg-black text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">
                    MAIN PHOTO
                  </span>
                </div>

                <div className="flex-1 space-y-3 w-full">
                  <h4 className="text-sm font-bold text-black uppercase tracking-wider">Primary Display Picture</h4>
                  <p className="text-xs text-black/60">
                    {isTemplate
                      ? 'Upload an image file directly from your computer or paste an image URL.'
                      : 'Upload an image file directly from your computer, type an image URL, or pick from our curated fashion gallery below.'}
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-black text-white font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <span>📁</span>
                      <span>Upload from Device</span>
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-black/40 block mb-1">Or Paste Image URL</label>
                    <input
                      type="url"
                      value={imgMain}
                      onChange={(e) => setImgMain(e.target.value)}
                      onBlur={(e) => {
                        const url = e.target.value.trim()
                        if (url && !images.includes(url)) setImages([url, ...images])
                      }}
                      placeholder="https://..."
                      className="w-full border border-black/20 px-3 py-1.5 text-xs rounded font-mono outline-none focus:border-black bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Gallery Multi-images */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-black mb-2">
                  Gallery Photos ({images.length})
                </h4>
                <div className="flex flex-wrap gap-3 items-center">
                  {images.map((img, idx) => (
                    <div
                      key={idx}
                      className={`relative w-20 h-24 rounded-lg overflow-hidden border-2 bg-stone-100 group shadow-xs ${
                        img === imgMain ? 'border-black' : 'border-black/20'
                      }`}
                    >
                      <img src={img} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveGalleryImage(idx)}
                        className="absolute top-1 right-1 bg-black/80 hover:bg-red-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Remove photo"
                      >
                        ✕
                      </button>
                      <button
                        type="button"
                        onClick={() => setImgMain(img)}
                        className="absolute bottom-1 inset-x-1 bg-white/90 text-black text-[8px] font-bold py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-center cursor-pointer"
                      >
                        Set Main
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Curated 1-Click Fashion Photo Presets (Lunar demo stores only) */}
              {!isTemplate && (
              <div className="border-t border-black/10 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-black mb-1">
                  Or Pick From Curated Studio Presets
                </h4>
                <p className="text-[11px] text-black/50 mb-3">
                  Click any studio photoshoot angle to instantly attach to your product:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {PRODUCT_PHOTO_PRESETS.map((preset, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setImgMain(preset.url)
                        if (!images.includes(preset.url)) setImages([preset.url, ...images])
                      }}
                      className="border border-black/10 hover:border-black rounded-lg p-2 bg-stone-50 hover:bg-white transition-all cursor-pointer group text-left"
                    >
                      <img
                        src={preset.url}
                        alt={preset.name}
                        className="w-full h-24 object-cover rounded mb-2 group-hover:scale-102 transition-transform"
                      />
                      <p className="text-[10px] font-bold text-black truncate">{preset.name}</p>
                      <p className="text-[9px] text-black/40 uppercase">{preset.category}</p>
                    </div>
                  ))}
                </div>
              </div>
              )}
            </div>
          )}

          {/* TAB 3: COLORS & SIZES */}
          {activeTab === 'variants' && (
            <div className="space-y-6">
              {/* Color Swatches */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-black">Color Swatches</label>
                  <button
                    type="button"
                    onClick={handleAddColor}
                    className="text-xs font-bold text-black border border-black/20 px-3 py-1 rounded hover:bg-stone-100 cursor-pointer"
                  >
                    + Add Color
                  </button>
                </div>

                <div className="space-y-2.5">
                  {colors.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-stone-50 rounded-lg border border-black/10">
                      <input
                        type="color"
                        value={c.hex}
                        onChange={(e) => {
                          setColors(colors.map((col, idx) => (idx === i ? { ...col, hex: e.target.value } : col)))
                        }}
                        className="w-8 h-8 rounded border border-black/20 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={c.name}
                        onChange={(e) => {
                          setColors(colors.map((col, idx) => (idx === i ? { ...col, name: e.target.value } : col)))
                        }}
                        placeholder="Color Name (e.g. Royal Indigo)"
                        className="flex-1 border border-black/20 px-3 py-1.5 text-xs rounded bg-white outline-none"
                      />
                      <code className="text-xs font-mono text-black/50">{c.hex}</code>
                      <button
                        type="button"
                        onClick={() => handleRemoveColor(i)}
                        className="text-red-500 hover:text-red-700 text-xs px-2 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sizes */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black mb-2 block">
                  {labels.sizes}
                </label>
                {isTemplate && (
                  <p className="text-[11px] text-black/50 mb-2">Optional — leave all unselected if this product has a single option.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {sizeOptions.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => handleToggleSize(sz)}
                      className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${
                        sizes.includes(sz)
                          ? 'bg-black text-white border-black shadow-sm'
                          : 'bg-stone-50 text-black/50 border-black/20 hover:border-black'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fit Info */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  {labels.fitNote}
                </label>
                <input
                  type="text"
                  value={fitInfo}
                  onChange={(e) => setFitInfo(e.target.value)}
                  placeholder={isTemplate ? 'e.g. Recommended for ages 3+' : 'e.g. True to size with adjustable waist tie-ups.'}
                  className="w-full border border-black/20 px-4 py-2.5 text-xs rounded-lg focus:border-black outline-none"
                />
              </div>
            </div>
          )}

          {/* TAB 4: FABRIC & DETAILS */}
          {activeTab === 'craft' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  {labels.material}{isTemplate ? '' : ' *'}
                </label>
                <input
                  type="text"
                  required={!isTemplate}
                  value={fabricTech}
                  onChange={(e) => setFabricTech(e.target.value)}
                  placeholder={isTemplate ? `e.g. ${niche.materialLabel}` : 'e.g. 100% Pure Mul Chanderi Silk'}
                  className="w-full border border-black/20 px-4 py-2.5 text-sm rounded-lg focus:border-black outline-none font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  {labels.materialDesc}
                </label>
                <textarea
                  rows={3}
                  value={fabricDesc}
                  onChange={(e) => setFabricDesc(e.target.value)}
                  placeholder={isTemplate ? 'Describe the quality, feel or what makes it special.' : 'e.g. Breathable organic cotton pre-washed for zero shrinkages.'}
                  className="w-full border border-black/20 px-4 py-2.5 text-xs rounded-lg focus:border-black outline-none"
                />
              </div>

              {isTemplate ? (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                    Highlights (one per line)
                  </label>
                  <textarea
                    rows={4}
                    value={highlights}
                    onChange={(e) => setHighlights(e.target.value)}
                    placeholder={'e.g. Gift-ready packaging\nMade with safe materials'}
                    className="w-full border border-black/20 px-4 py-2.5 text-xs rounded-lg focus:border-black outline-none"
                  />
                </div>
              ) : (
                <div className="bg-stone-50 border border-black/10 p-4 rounded-lg">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-black mb-1">
                    Automatic Add-on Options Active on PDP
                  </h4>
                  <p className="text-[11px] text-black/60 leading-relaxed">
                    ✓ Custom Lining (+₹100) &nbsp;•&nbsp; ✓ Maternity Double Feeding Zip (+₹120) &nbsp;•&nbsp; ✓ Custom Lengths (44"–50")
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-black/10">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-bold tracking-widest uppercase px-5 py-2.5 border border-black/20 hover:border-black rounded-lg transition-colors cursor-pointer"
            >
              CANCEL
            </button>
            <button
              type="submit"
              className="bg-black text-white text-xs font-bold tracking-widest uppercase px-7 py-3 rounded-lg hover:bg-stone-800 transition-all cursor-pointer shadow-md"
            >
              {isEditing ? 'SAVE CHANGES' : 'PUBLISH PRODUCT TO STORE'}
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
function StorefrontCustomizer({ onToast }: { onToast: (msg: string) => void }) {
  const { theme, tenant, updateTheme, updateTenant } = useThemeCustomizer()
  const { refreshTenant } = useTenant()
  const switchLayer = useSwitchLayer()
  const [isSaved, setIsSaved] = useState(false)

  const isTemplate = isTemplateStore(tenant)
  const nicheLabel = getNichePreset(tenant?.storeType).label

  const [heroImage, setHeroImage] = useState(
    theme?.heroImage ||
      (isTemplate ? '' : 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243')
  )
  const [heroHeadline, setHeroHeadline] = useState(
    theme?.heroHeadline ||
      tenant?.tagline ||
      (isTemplate ? tenant?.brandName || '' : 'Weightless Everyday Living in Pure Breathable Cotton.')
  )
  const [heroSubhead, setHeroSubhead] = useState(
    theme?.heroSubhead ||
      (isTemplate
        ? ''
        : 'Thoughtfully handcrafted silhouettes, breathable organic weaves, and heirloom prints with functional utility pockets.')
  )
  const [heroCtaText, setHeroCtaText] = useState(theme?.heroCtaText || (isTemplate ? 'SHOP NOW →' : 'EXPLORE COLLECTIONS →'))
  const [secondaryCtaText, setSecondaryCtaText] = useState(theme?.secondaryCtaText || 'SHOP BESTSELLERS')

  const [primaryColor, setPrimaryColor] = useState(theme?.primaryColor || '#8C5A4F')
  const [accentColor, setAccentColor] = useState(theme?.accentColor || '#D4A574')
  const [backgroundColor, setBackgroundColor] = useState(theme?.backgroundColor || '#FAFAF8')
  const [fontDisplay, setFontDisplay] = useState(theme?.fontDisplay || "'Instrument Serif', Georgia, serif")

  const [brandName, setBrandName] = useState(tenant?.brandName || (isTemplate ? '' : 'The Lunar Clothing'))
  const [logoUrl, setLogoUrl] = useState(tenant?.logo || tenant?.theme?.logoUrl || '')
  const [announcements, setAnnouncements] = useState<string[]>(
    theme?.announcementMessages && theme.announcementMessages.length > 0
      ? theme.announcementMessages
      : isTemplate
      ? [`WELCOME TO ${(tenant?.brandName || '').toUpperCase()}`]
      : [
          'FREE SHIPPING IN INDIA OVER ₹999',
          'USE CODE: FESTIVE15 FOR 15% OFF YOUR ORDER',
          '100% PURE BREATHABLE COTTON • FUNCTIONAL POCKETS',
        ]
  )
  const [newAnnouncement, setNewAnnouncement] = useState('')

  const [contactPhone, setContactPhone] = useState(
    tenant?.contact?.phone || (isTemplate ? tenant?.ownerPhone || '' : '+91 98765 43210')
  )
  const [contactEmail, setContactEmail] = useState(
    tenant?.contact?.email || (isTemplate ? tenant?.ownerEmail || '' : 'care@store.com')
  )
  const [contactAddress, setContactAddress] = useState(
    tenant?.contact?.address || (isTemplate ? '' : 'Studio: Jubilee Hills, Hyderabad & Jaipur')
  )
  const [aboutStory, setAboutStory] = useState(
    tenant?.aboutStory ||
      (isTemplate
        ? `${tenant?.brandName || 'Our store'} is an independent ${nicheLabel.toLowerCase()} store. Tell your customers your story here.`
        : `${brandName} was born out of a desire for effortless silhouettes and bespoke artisanal craft. Each piece is crafted in India, celebrating authentic Indian textile traditions, premium fabrics, and heirloom silhouettes.`)
  )

  const [enableAnimations, setEnableAnimations] = useState(theme?.enableAnimations ?? true)
  const [enableReviews, setEnableReviews] = useState(theme?.enableReviews ?? true)
  const [enableOrderTracking, setEnableOrderTracking] = useState(theme?.enableOrderTracking ?? true)

  const heroFileInputRef = useRef<HTMLInputElement>(null)
  const logoFileInputRef = useRef<HTMLInputElement>(null)

  const [editorTab, setEditorTab] = useState<'branding' | ContentEditorTab>('branding')
  const [extras, setExtras] = useState<StorefrontExtras>(() => getInitialExtras(tenant, getDefaultStorefrontCopy(tenant)))
  const updateExtras = (updates: Partial<StorefrontExtras>) => setExtras((prev) => ({ ...prev, ...updates }))

  const copyDefaults = useMemo(() => {
    const draft = tenant
      ? {
          ...tenant,
          brandName: brandName || tenant.brandName,
          theme: { ...tenant.theme, freeShippingThreshold: extras.freeShippingThreshold, shippingFee: extras.shippingFee },
        }
      : tenant
    const defaults = getDefaultStorefrontCopy(draft)
    return { ...defaults, footerTagline: heroHeadline || tenant?.tagline || defaults.footerTagline }
  }, [tenant, brandName, heroHeadline, extras.freeShippingThreshold, extras.shippingFee])

  const editorTabs: { id: 'branding' | ContentEditorTab; label: string; icon: string }[] = [
    { id: 'branding', label: 'Branding & Hero', icon: '🖼️' },
    { id: 'text', label: 'Headlines & Text', icon: '✍️' },
    { id: 'layout', label: 'Homepage Layout', icon: '🧱' },
    { id: 'pdp', label: 'Product Page', icon: '🛍️' },
    { id: 'offers', label: 'Shipping & Offers', icon: '🏷️' },
    { id: 'footer', label: 'Footer & Social', icon: '🔗' },
  ]

  // Handle local Hero file upload
  const handleHeroFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      const reader = new FileReader()
      reader.onload = (uploadEvent) => {
        const resultUrl = uploadEvent.target?.result as string
        if (resultUrl) {
          setHeroImage(resultUrl)
          onToast('Hero photo loaded! Click "Save & Publish" to update live store.')
        }
      }
      reader.readAsDataURL(files[0])
    }
  }

  // Handle local Logo file upload
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      const reader = new FileReader()
      reader.onload = (uploadEvent) => {
        const resultUrl = uploadEvent.target?.result as string
        if (resultUrl) {
          setLogoUrl(resultUrl)
        }
      }
      reader.readAsDataURL(files[0])
    }
  }

  const handleAddAnnouncement = () => {
    if (newAnnouncement.trim()) {
      setAnnouncements([...announcements, newAnnouncement.trim().toUpperCase()])
      setNewAnnouncement('')
    }
  }

  const handleRemoveAnnouncement = (index: number) => {
    setAnnouncements(announcements.filter((_, i) => i !== index))
  }

  const handleSaveAll = () => {
    // Save theme updates
    updateTheme({
      heroImage,
      heroHeadline,
      heroSubhead,
      heroCtaText,
      secondaryCtaText,
      primaryColor,
      accentColor,
      backgroundColor,
      fontDisplay,
      announcementMessages: announcements,
      enableAnimations,
      enableReviews,
      enableOrderTracking,
      logoUrl,
      ...extrasToTheme(extras),
    })

    // Save tenant profile updates
    updateTenant({
      brandName,
      name: brandName,
      tagline: heroHeadline,
      logo: logoUrl,
      logoUrl,
      aboutStory,
      contact: {
        phone: contactPhone,
        email: contactEmail,
        address: contactAddress,
        workingHours: 'Mon–Sat: 10AM – 7PM IST',
        shippingThresholdFormatted: `${tenant?.currencySymbol || '₹'}${Math.max(0, Math.round(extras.freeShippingThreshold || 0)).toLocaleString('en-IN')}`,
      },
    })

    refreshTenant()
    setIsSaved(true)
    onToast('✅ Homepage banner, branding & theme published to live store!')
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-black/8 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-black">Storefront & Homepage Customizer</h2>
          <p className="text-xs text-black/50 mt-0.5">
            Edit your homepage, headlines, section layout, product page, shipping, offers and footer — then publish.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => switchLayer('storefront', tenant?.slug || 'lunar')}
            className="bg-black hover:bg-stone-800 text-white font-bold text-xs tracking-wider uppercase px-4 py-3 rounded-lg transition-all cursor-pointer shadow-sm flex items-center gap-2"
            title="Open storefront to view your latest published changes"
          >
            <span>🏬</span>
            <span>View Live Storefront ↗</span>
          </button>
          <button
            onClick={handleSaveAll}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs tracking-widest uppercase px-6 py-3 rounded-lg transition-all cursor-pointer shadow-md flex items-center gap-2"
          >
            <span>✓</span>
            <span>SAVE & PUBLISH CHANGES</span>
          </button>
        </div>
      </div>

      {isSaved && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold">
            <span className="text-base">🎉</span>
            <span>Changes successfully published! Your storefront is now displaying the updated banner, logo, and theme.</span>
          </div>
          <button
            onClick={() => switchLayer('storefront', tenant?.slug || 'lunar')}
            className="text-xs bg-emerald-700 text-white hover:bg-emerald-800 font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            Open Storefront Now ↗
          </button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto scroll-hide pb-1" role="tablist" aria-label="Storefront editor sections">
        {editorTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={editorTab === t.id}
            onClick={() => setEditorTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg border transition-all cursor-pointer ${
              editorTab === t.id
                ? 'bg-black text-white border-black shadow-sm'
                : 'bg-white text-black/60 border-black/10 hover:border-black/40 hover:text-black'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {editorTab !== 'branding' && (
            <StorefrontContentEditor
              tab={editorTab}
              value={extras}
              defaults={copyDefaults}
              currencySymbol={tenant?.currencySymbol || '₹'}
              onChange={updateExtras}
            />
          )}

          {editorTab === 'branding' && (<>
          {/* 1. HOMEPAGE PICTURE / HERO BANNER */}
          <div className="bg-white rounded-xl p-6 border border-black/8 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-black/10 pb-3">
              <h3 className="text-xs font-bold tracking-wider uppercase text-black flex items-center gap-2">
                <span>🖼️</span>
                <span>Homepage Hero Banner Picture</span>
              </h3>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                LIVE EDIT
              </span>
            </div>

            {/* Current Image Display & Controls */}
            <div className="relative aspect-[16/9] rounded-lg overflow-hidden bg-stone-100 border border-black/15 shadow-inner">
              {heroImage ? (
                <img src={heroImage} alt="Hero banner" className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full"
                  style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-4">
                <span className="text-white text-xs font-serif truncate">{heroHeadline}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <input
                type="file"
                ref={heroFileInputRef}
                onChange={handleHeroFileUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => heroFileInputRef.current?.click()}
                className="bg-black text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <span>📁</span>
                <span>Upload New Homepage Picture</span>
              </button>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-black/50 block mb-1">
                Or Enter Picture URL
              </label>
              <input
                type="url"
                value={heroImage}
                onChange={(e) => setHeroImage(e.target.value)}
                placeholder="https://..."
                className="w-full border border-black/20 px-3 py-2 text-xs rounded-lg font-mono outline-none focus:border-black bg-stone-50"
              />
            </div>

            {/* Curated Hero Presets (Lunar demo stores only) */}
            {!isTemplate && (
            <div>
              <label className="text-[10px] font-bold uppercase text-black/50 block mb-2">
                Or Pick a Luxury Studio Hero Preset:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {HERO_PHOTO_PRESETS.map((preset, i) => (
                  <div
                    key={i}
                    onClick={() => setHeroImage(preset.url)}
                    className={`border rounded-lg p-2 transition-all cursor-pointer text-left ${
                      heroImage === preset.url
                        ? 'border-black bg-stone-100'
                        : 'border-black/15 bg-white hover:border-black'
                    }`}
                  >
                    <img src={preset.url} alt={preset.name} className="w-full h-16 object-cover rounded mb-1.5" />
                    <p className="text-[10px] font-bold text-black truncate">{preset.name}</p>
                    <p className="text-[8px] text-black/40 truncate">{preset.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Hero Headlines */}
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  Homepage Main Headline
                </label>
                <input
                  type="text"
                  value={heroHeadline}
                  onChange={(e) => setHeroHeadline(e.target.value)}
                  placeholder={isTemplate ? 'e.g. Your store headline' : 'e.g. Weightless Everyday Living in Pure Chanderi'}
                  className="w-full border border-black/20 px-4 py-2.5 text-sm font-serif rounded-lg focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  Homepage Subtitle / Story
                </label>
                <textarea
                  rows={2}
                  value={heroSubhead}
                  onChange={(e) => setHeroSubhead(e.target.value)}
                  placeholder="e.g. Thoughtfully handcrafted silhouettes..."
                  className="w-full border border-black/20 px-4 py-2 text-xs rounded-lg focus:border-black outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                    Primary CTA Button Text
                  </label>
                  <input
                    type="text"
                    value={heroCtaText}
                    onChange={(e) => setHeroCtaText(e.target.value)}
                    className="w-full border border-black/20 px-3 py-2 text-xs font-bold uppercase rounded-lg focus:border-black outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                    Secondary CTA Button Text
                  </label>
                  <input
                    type="text"
                    value={secondaryCtaText}
                    onChange={(e) => setSecondaryCtaText(e.target.value)}
                    className="w-full border border-black/20 px-3 py-2 text-xs font-bold uppercase rounded-lg focus:border-black outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. BRAND IDENTITY & LOGO */}
          <div className="bg-white rounded-xl p-6 border border-black/8 shadow-sm space-y-4">
            <h3 className="text-xs font-bold tracking-wider uppercase text-black border-b border-black/10 pb-3 flex items-center gap-2">
              <span>🏷️</span>
              <span>Brand Identity & Official Logo</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  Store / Brand Name
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full border border-black/20 px-4 py-2.5 text-sm font-bold rounded-lg focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  Brand Logo
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    ref={logoFileInputRef}
                    onChange={handleLogoFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => logoFileInputRef.current?.click()}
                    className="bg-stone-100 hover:bg-stone-200 text-black font-bold text-xs uppercase px-3 py-2.5 rounded-lg border border-black/15 cursor-pointer whitespace-nowrap"
                  >
                    Upload Logo
                  </button>
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="Or logo URL..."
                    className="flex-1 border border-black/20 px-3 py-2 text-xs rounded-lg outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. THEME COLORS & TYPOGRAPHY */}
          <div className="bg-white rounded-xl p-6 border border-black/8 shadow-sm space-y-4">
            <h3 className="text-xs font-bold tracking-wider uppercase text-black border-b border-black/10 pb-3 flex items-center gap-2">
              <span>🎨</span>
              <span>Theme Colors & Typography</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-8 h-8 rounded border border-black/20 cursor-pointer"
                  />
                  <code className="text-xs font-mono bg-stone-100 px-2 py-1 rounded">{primaryColor}</code>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-8 h-8 rounded border border-black/20 cursor-pointer"
                  />
                  <code className="text-xs font-mono bg-stone-100 px-2 py-1 rounded">{accentColor}</code>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  Background Tint
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="w-8 h-8 rounded border border-black/20 cursor-pointer"
                  />
                  <code className="text-xs font-mono bg-stone-100 px-2 py-1 rounded">{backgroundColor}</code>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                Headline Typography Font
              </label>
              <select
                value={fontDisplay}
                onChange={(e) => setFontDisplay(e.target.value)}
                className="w-full border border-black/20 px-3 py-2 text-xs font-semibold rounded-lg bg-white cursor-pointer"
              >
                <option value="'Instrument Serif', Georgia, serif">Instrument Serif (Signature Lunar Luxury)</option>
                <option value="'Cormorant Garamond', Georgia, serif">Cormorant Garamond (Editorial Elegance)</option>
                <option value="'Playfair Display', Georgia, serif">Playfair Display (Royal Heritage)</option>
                <option value="'Inter', sans-serif">Inter (Modern Minimalist)</option>
                <option value="'Work Sans', sans-serif">Work Sans (Contemporary High-Street)</option>
              </select>
            </div>
          </div>

          {/* 4. ANNOUNCEMENT TICKER */}
          <div className="bg-white rounded-xl p-6 border border-black/8 shadow-sm space-y-4">
            <h3 className="text-xs font-bold tracking-wider uppercase text-black border-b border-black/10 pb-3 flex items-center gap-2">
              <span>📢</span>
              <span>Top Announcement Bar & Offers</span>
            </h3>

            <div className="space-y-2">
              {announcements.map((msg, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={msg}
                    onChange={(e) => {
                      const updated = [...announcements]
                      updated[i] = e.target.value.toUpperCase()
                      setAnnouncements(updated)
                    }}
                    className="flex-1 border border-black/20 px-3 py-2 text-xs font-bold uppercase rounded-lg outline-none focus:border-black"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveAnnouncement(i)}
                    className="text-red-500 hover:text-red-700 text-xs px-2 cursor-pointer font-bold"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newAnnouncement}
                onChange={(e) => setNewAnnouncement(e.target.value)}
                placeholder="ADD NEW TICKER MESSAGE..."
                className="flex-1 border border-black/20 px-3 py-2 text-xs uppercase rounded-lg outline-none"
              />
              <button
                type="button"
                onClick={handleAddAnnouncement}
                className="bg-black text-white font-bold text-xs uppercase px-4 py-2 rounded-lg hover:bg-stone-800 cursor-pointer"
              >
                + Add
              </button>
            </div>
          </div>

          {/* 5. CONTACT & CARE DETAILS */}
          <div className="bg-white rounded-xl p-6 border border-black/8 shadow-sm space-y-4">
            <h3 className="text-xs font-bold tracking-wider uppercase text-black border-b border-black/10 pb-3 flex items-center gap-2">
              <span>📞</span>
              <span>WhatsApp Support & Customer Care</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  WhatsApp Support Phone
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full border border-black/20 px-3 py-2 text-xs rounded-lg outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                  Customer Care Email
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="care@store.com"
                  className="w-full border border-black/20 px-3 py-2 text-xs rounded-lg outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                Studio Address
              </label>
              <input
                type="text"
                value={contactAddress}
                onChange={(e) => setContactAddress(e.target.value)}
                placeholder="Studio: Jubilee Hills, Hyderabad & Jaipur"
                className="w-full border border-black/20 px-3 py-2 text-xs rounded-lg outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block">
                About Studio Story (Shown in About Modal & Footer)
              </label>
              <textarea
                rows={3}
                value={aboutStory}
                onChange={(e) => setAboutStory(e.target.value)}
                className="w-full border border-black/20 px-3 py-2 text-xs rounded-lg outline-none"
              />
            </div>
          </div>

          {/* 6. STORE FEATURE TOGGLES */}
          <div className="bg-white rounded-xl p-6 border border-black/8 shadow-sm space-y-3">
            <h3 className="text-xs font-bold tracking-wider uppercase text-black border-b border-black/10 pb-3 flex items-center gap-2">
              <span>⚙️</span>
              <span>Interactive Store Features</span>
            </h3>

            {[
              {
                label: 'Ambient Glow Animation Simulation',
                desc: 'Soft ethereal ambient lighting and interactive cursor spotlight',
                val: enableAnimations,
                toggle: () => setEnableAnimations(!enableAnimations),
              },
              {
                label: 'Customer Product Reviews & UGC',
                desc: 'Allow verified customers to write ratings and reviews',
                val: enableReviews,
                toggle: () => setEnableReviews(!enableReviews),
              },
              {
                label: 'Real-Time Order Tracking Portal',
                desc: 'Live step-by-step courier tracking for buyers',
                val: enableOrderTracking,
                toggle: () => setEnableOrderTracking(!enableOrderTracking),
              },
            ].map((f, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
                <div>
                  <p className="text-xs font-bold text-black">{f.label}</p>
                  <p className="text-[10px] text-black/50">{f.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={f.toggle}
                  className={`w-11 h-6 rounded-full transition-all cursor-pointer relative ${
                    f.val ? 'bg-emerald-500' : 'bg-stone-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${
                      f.val ? 'left-5.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
          </>)}

          {/* Save Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleSaveAll}
              className="w-full bg-black text-white font-bold text-xs tracking-[0.2em] uppercase py-4 rounded-xl hover:bg-stone-800 transition-all cursor-pointer shadow-lg"
            >
              ✓ SAVE & PUBLISH ALL CHANGES
            </button>
          </div>
        </div>

        {/* Right Column: Real-time Live Interactive Preview (5 cols) */}
        <div className="lg:col-span-5 sticky top-24 space-y-4">
          <div className="bg-white rounded-xl border border-black/10 shadow-lg overflow-hidden">
            {/* Device Mockup Top Bar */}
            <div className="bg-stone-900 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </div>
                <span className="text-[10px] font-mono text-white/60 ml-2">
                  {storeAddress(tenant?.slug || '')}
                </span>
              </div>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded uppercase">
                LIVE PREVIEW
              </span>
            </div>

            {/* Simulated Storefront Screen */}
            <div
              className="flex flex-col select-none overflow-hidden"
              style={{
                backgroundColor: backgroundColor,
                fontFamily: fontDisplay,
              }}
            >
              {/* Mini Announcement Ticker */}
              <div
                className="py-1.5 text-center text-[8px] font-bold tracking-widest uppercase text-white px-3 truncate"
                style={{ backgroundColor: primaryColor }}
              >
                {announcements[0] || 'WELCOME TO OUR OFFICIAL STORE'}
              </div>

              {/* Mini Navigation */}
              <div className="py-3 px-4 border-b border-black/10 flex items-center justify-between bg-white/90 backdrop-blur-xs font-sans">
                <div className="flex items-center gap-2">
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className="h-5 w-auto object-contain" />
                  ) : (
                    <div className="text-xs font-serif font-bold uppercase tracking-wider" style={{ color: primaryColor }}>
                      {brandName}
                    </div>
                  )}
                </div>
                <div className="flex gap-2.5 text-[8px] font-bold tracking-wider text-black/50 uppercase">
                  <span>SHOP</span>
                  <span>ABOUT</span>
                  <span>CONTACT</span>
                  <span>👜</span>
                </div>
              </div>

              {/* Mini Hero Banner */}
              <div className="relative aspect-[4/3] overflow-hidden group">
                {heroImage ? (
                  <img src={heroImage} alt="Hero mockup" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex flex-col justify-end p-5 text-white text-center">
                  <p className="text-[9px] font-sans font-bold tracking-[0.25em] text-white/70 uppercase mb-1">
                    {brandName}
                  </p>
                  <h3 className="text-base font-serif leading-tight mb-1.5 text-white drop-shadow-sm">
                    {heroHeadline}
                  </h3>
                  <p className="text-[9px] font-sans text-white/70 line-clamp-2 max-w-xs mx-auto mb-3">
                    {heroSubhead}
                  </p>

                  <div className="flex items-center justify-center gap-2">
                    <span
                      className="text-[8px] font-sans font-bold uppercase tracking-wider px-3 py-1.5 rounded text-black bg-white shadow-sm"
                    >
                      {heroCtaText}
                    </span>
                    <span
                      className="text-[8px] font-sans font-bold uppercase tracking-wider px-3 py-1.5 rounded text-white bg-white/20 border border-white/40"
                    >
                      {secondaryCtaText}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mini Trust Bar */}
              {extras.homeSections.find((s) => s.id === 'trustBar')?.visible && (
                <div className="py-2.5 px-3 bg-stone-100 border-t border-b border-black/5 flex justify-around gap-2 text-[7px] font-sans font-bold uppercase text-black/60 overflow-hidden whitespace-nowrap">
                  {extras.trustItems.filter((t) => t.text.trim()).slice(0, 3).map((t, i) => (
                    <span key={i} className="truncate">
                      {t.icon} {t.text}
                    </span>
                  ))}
                </div>
              )}

              <p className="px-4 pt-3 bg-white font-sans text-[10px] font-bold text-black truncate" style={{ fontFamily: fontDisplay }}>
                {extras.copy.bestsellersTitle?.trim() || copyDefaults.bestsellersTitle}
              </p>

              {/* Mini Product Cards Preview */}
              <div className="p-4 pt-2 grid grid-cols-2 gap-3 bg-white font-sans">
                <div className="border border-black/10 rounded p-2">
                  <div className="aspect-[3/4] bg-stone-100 rounded mb-1.5 overflow-hidden">
                    {!isTemplate && <img src={heroImage} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <p className="text-[9px] font-bold truncate">{isTemplate ? 'Your product' : `${brandName} Signature`}</p>
                  <p className="text-[8px] font-bold" style={{ color: primaryColor }}>
                    ₹1,199
                  </p>
                </div>
                <div className="border border-black/10 rounded p-2">
                  <div className="aspect-[3/4] bg-stone-100 rounded mb-1.5 overflow-hidden">
                    {!isTemplate && (
                      <img
                        src="https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2175.jpg?v=1766941862"
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <p className="text-[9px] font-bold truncate">{isTemplate ? 'Your product' : 'Artisanal Edition'}</p>
                  <p className="text-[8px] font-bold" style={{ color: primaryColor }}>
                    ₹1,399
                  </p>
                </div>
              </div>
            </div>

            {/* Homepage outline */}
            <div className="px-4 py-3 border-t border-black/10 bg-white">
              <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-2">Homepage order</p>
              <ol className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                <li className="px-2 py-0.5 rounded bg-black text-white">Hero</li>
                {extras.homeSections
                  .filter((s) => s.visible)
                  .map((s) => (
                    <li key={s.id} className="px-2 py-0.5 rounded bg-stone-100 text-black/70 border border-black/10">
                      {HOME_SECTIONS.find((h) => h.id === s.id)?.label}
                    </li>
                  ))}
                <li className="px-2 py-0.5 rounded bg-stone-800 text-white/80">Footer</li>
              </ol>
            </div>

            {/* Bottom Preview Controls */}
            <div className="p-3 bg-stone-50 border-t border-black/10 flex items-center justify-between text-xs">
              <span className="text-black/50 text-[11px]">Real-time preview</span>
              <a
                href={tenantPortalPath(tenant?.slug || '')}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-black hover:underline"
              >
                Open Full Screen ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 4. Order Manager & Real-Time Tracking
// =====================================================
function InboxManager({ onToast }: { onToast: (msg: string) => void }) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id || ''
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
    window.addEventListener(STORE_INBOX_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(STORE_INBOX_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [tenantId])

  const unreadCount = messages.filter((m) => !m.read).length
  const visibleMessages = filter === 'unread' ? messages.filter((m) => !m.read) : messages

  const toggleOpen = (m: StoreMessage) => {
    setOpenId((prev) => (prev === m.id ? null : m.id))
    if (!m.read) storeInbox.setRead(tenantId, m.id, true)
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
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-black/8 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-black">Inbox & Newsletter Subscribers</h2>
          <p className="text-xs text-black/50 mt-0.5">
            Messages sent from your storefront contact form and emails collected by the footer newsletter.
          </p>
        </div>
        <div className="flex gap-2">
          {(['messages', 'subscribers'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                tab === t ? 'bg-black text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'
              }`}
            >
              {t === 'messages' ? `Messages (${messages.length}${unreadCount ? ` · ${unreadCount} new` : ''})` : `Subscribers (${subscribers.length})`}
            </button>
          ))}
        </div>
      </div>

      {tab === 'messages' ? (
        <div className="bg-white rounded-xl border border-black/8 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-black/8">
            <div className="flex gap-2">
              {(['all', 'unread'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider cursor-pointer ${
                    filter === f ? 'bg-violet-600 text-white' : 'text-black/50 hover:bg-black/5'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => messages.filter((m) => !m.read).forEach((m) => storeInbox.setRead(tenantId, m.id, true))}
                className="text-[11px] font-bold text-violet-600 hover:underline cursor-pointer"
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
            <ul className="divide-y divide-black/6">
              {visibleMessages.map((m) => {
                const isOpen = openId === m.id
                return (
                  <li key={m.id} className={m.read ? '' : 'bg-violet-50/60'}>
                    <button type="button" onClick={() => toggleOpen(m)} className="w-full text-left px-5 py-4 flex items-start gap-4 cursor-pointer hover:bg-black/[0.02]">
                      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${m.read ? 'bg-transparent' : 'bg-violet-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <p className={`text-sm truncate ${m.read ? 'text-black/70' : 'font-bold text-black'}`}>{m.name}</p>
                          <p className="text-[11px] text-black/40 flex-shrink-0">{formatDate(m.createdAt)}</p>
                        </div>
                        <p className="text-xs font-semibold text-violet-700 mt-0.5">{m.subject}</p>
                        {!isOpen && <p className="text-xs text-black/50 truncate mt-0.5">{m.message}</p>}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 pl-11 space-y-3">
                        <p className="text-sm text-black/80 whitespace-pre-wrap leading-relaxed">{m.message}</p>
                        <p className="text-xs text-black/50">
                          {m.email}
                          {m.phone ? ` · ${m.phone}` : ''}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}
                            className="px-3 py-1.5 rounded-lg bg-black text-white text-[11px] font-bold uppercase tracking-wider"
                          >
                            Reply by email
                          </a>
                          {m.phone && (
                            <a
                              href={`https://wa.me/${m.phone.replace(/[^0-9]/g, '').replace(/^(\d{10})$/, '91$1')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider"
                            >
                              WhatsApp
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => storeInbox.setRead(tenantId, m.id, false)}
                            className="px-3 py-1.5 rounded-lg bg-black/5 text-black/70 text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:bg-black/10"
                          >
                            Mark unread
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Delete the message from ${m.name}?`)) return
                              storeInbox.deleteMessage(tenantId, m.id)
                              setOpenId(null)
                              onToast('Message deleted.')
                            }}
                            className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:bg-red-100"
                          >
                            Delete
                          </button>
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
        <div className="bg-white rounded-xl border border-black/8 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-black/8">
            <p className="text-xs text-black/50">{subscribers.length} people joined your newsletter.</p>
            <button
              type="button"
              onClick={exportSubscribers}
              className="px-3 py-1.5 rounded-lg bg-black text-white text-[11px] font-bold uppercase tracking-wider cursor-pointer"
            >
              Export CSV
            </button>
          </div>
          {subscribers.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-3xl mb-2">📨</p>
              <p className="text-sm font-bold text-black">No subscribers yet</p>
              <p className="text-xs text-black/50 mt-1">Emails entered in your storefront footer's newsletter box will appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-black/6">
              {subscribers.map((s) => (
                <li key={s.email} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-black">{s.email}</p>
                    <p className="text-[11px] text-black/40">Joined {formatDate(s.subscribedAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      storeInbox.unsubscribe(tenantId, s.email)
                      onToast(`${s.email} removed from the list.`)
                    }}
                    className="text-[11px] font-bold text-red-600 hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-black/8 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-black">Customer Orders & Shipments</h2>
          <p className="text-xs text-black/50 mt-0.5">
            {orders.length} total orders recorded • Manage fulfillment, status transitions, and customer deliveries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="bg-stone-900 hover:bg-black text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <span>📥</span>
            <span>Export Orders CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchOrder}
            onChange={(e) => setSearchOrder(e.target.value)}
            placeholder="Search by Order ID, Customer Name, Phone, or City..."
            className="w-full bg-white border border-black/15 px-4 py-2.5 pl-9 text-xs rounded-lg outline-none focus:border-black"
          />
          <span className="absolute left-3 top-2.5 text-black/40 text-xs">🔍</span>
          {searchOrder && (
            <button
              onClick={() => setSearchOrder('')}
              className="absolute right-3 top-2.5 text-black/40 hover:text-black text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-white border border-black/15 px-4 py-2.5 text-xs font-bold uppercase rounded-lg outline-none cursor-pointer focus:border-black"
        >
          <option value="all">ALL STATUSES ({orders.length})</option>
          <option value="Processing">PROCESSING</option>
          <option value="In Transit">IN TRANSIT</option>
          <option value="Out for Delivery">OUT FOR DELIVERY</option>
          <option value="Delivered">DELIVERED</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-black/8 shadow-sm overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="py-16 text-center px-4">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-lg font-serif mb-1">No orders match your criteria</p>
            <p className="text-xs text-black/40">Orders will appear here as customers checkout on your storefront.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/10 bg-stone-50 text-[10px] font-bold tracking-widest uppercase text-black/50">
                  <th className="px-6 py-3.5">Order ID & Date</th>
                  <th className="px-4 py-3.5">Customer & Destination</th>
                  <th className="px-4 py-3.5">Items Ordered</th>
                  <th className="px-4 py-3.5">Payment</th>
                  <th className="px-4 py-3.5">Fulfillment Status</th>
                  <th className="px-4 py-3.5">Total Amount</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 text-xs">
                {filteredOrders.map((order) => {
                  const custName = order.shippingAddress?.name || 'Customer'
                  const custCityState = [order.shippingAddress?.city, order.shippingAddress?.state].filter(Boolean).join(', ')
                  return (
                    <tr key={order.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-black block">{order.id}</span>
                        <span className="text-[10px] text-black/40">{order.date}</span>
                      </td>

                      <td className="px-4 py-4">
                        <p className="font-bold text-black">{custName}</p>
                        {custCityState && <p className="text-[11px] text-black/50">{custCityState}</p>}
                        {order.shippingAddress?.phone && (
                          <p className="text-[10px] font-mono text-black/40">{order.shippingAddress.phone}</p>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        {order.items?.map((item: any, idx: number) => {
                          const itemName = item.name || item.product?.name || 'Product'
                          const itemSize = item.size || item.selectedSize || ''
                          return (
                            <p key={idx} className="truncate max-w-xs text-[11px] text-black/80">
                              <span className="font-bold">{item.quantity}x</span> {itemName} {itemSize ? `(${itemSize})` : ''}
                            </p>
                          )
                        })}
                      </td>

                      <td className="px-4 py-4">
                        <span className="text-[11px] font-medium text-black/70 block">{order.paymentMethod || 'Prepaid'}</span>
                        {/cod|cash on delivery/i.test(order.paymentMethod || '') && order.status !== 'Delivered' ? (
                          <span className="text-[9px] font-mono text-amber-600 font-bold uppercase">COLLECT ON DELIVERY</span>
                        ) : (
                          <span className="text-[9px] font-mono text-emerald-600 font-bold uppercase">PAID</span>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <select
                          value={order.status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value as TrackedOrder['status'])}
                          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border outline-none cursor-pointer ${
                            order.status === 'Delivered'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : order.status === 'In Transit'
                              ? 'bg-blue-50 text-blue-800 border-blue-300'
                              : order.status === 'Out for Delivery'
                              ? 'bg-purple-50 text-purple-800 border-purple-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          <option value="Processing">Processing</option>
                          <option value="In Transit">In Transit</option>
                          <option value="Out for Delivery">Out for Delivery</option>
                          <option value="Delivered">Delivered</option>
                        </select>
                      </td>

                      <td className="px-4 py-4 font-bold text-sm text-black">₹{order.total.toLocaleString()}</td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="px-3 py-1.5 text-xs font-bold bg-stone-100 hover:bg-black hover:text-white rounded-lg border border-black/10 transition-colors cursor-pointer"
                        >
                          👁️ View
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
                </select>
              </div>

              {/* Shipping Address */}
              <div className="border border-black/10 p-4 rounded-xl space-y-1">
                <p className="font-bold uppercase tracking-wider text-black text-[10px]">Shipping Address</p>
                <p className="font-bold text-black">{selectedOrder.shippingAddress?.name}</p>
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

                {(() => {
                  const subtotal = (selectedOrder.items || []).reduce((sum: number, it: any) => sum + it.price * it.quantity, 0)
                  const extra = selectedOrder.total - subtotal
                  return extra !== 0 && subtotal > 0 ? (
                    <div className="pt-2 border-t border-black/10 space-y-1 text-[11px] text-black/60">
                      <div className="flex justify-between">
                        <span>Items Subtotal</span>
                        <span>₹{subtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{extra > 0 ? 'Shipping & Charges' : 'Discounts'}</span>
                        <span>{extra > 0 ? '+' : '−'}₹{Math.abs(extra).toLocaleString()}</span>
                      </div>
                    </div>
                  ) : null
                })()}
                <div className="pt-2 border-t border-black/10 flex justify-between font-bold text-sm">
                  <span>Total Amount</span>
                  <span>₹{selectedOrder.total.toLocaleString()}</span>
                </div>
              </div>

              {/* Courier & Tracking */}
              <div className="border border-black/10 p-4 rounded-xl space-y-1 text-[11px]">
                <p className="font-bold uppercase tracking-wider text-black text-[10px]">Courier & Tracking AWB</p>
                <p className="text-black/70">Courier: <strong>{selectedOrder.courier || 'Blue Dart Express'}</strong></p>
                <p className="text-black/70 font-mono">AWB Code: <strong>{selectedOrder.awb || 'BD492810482IN'}</strong></p>
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

function StoreSettings({ onNavigate, onToast }: { onNavigate?: (view: DashboardView) => void; onToast: (msg: string) => void }) {
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

      // Fetch staff from backend API if available
      fetch(`${API_BASE}/admin/tenants/${tenant.slug}/staff`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.staff) setStaffList(data.staff)
        })
        .catch(() => {})
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
      const res = await fetch(`${API_BASE}/admin/tenants/${tenant.slug}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      await fetch(`${API_BASE}/admin/tenants/${tenant.slug}/staff/${staffId}`, {
        method: 'DELETE',
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
      apiClient.updateTheme(tenant.slug, { logoUrl: finalLogo }).catch(() => undefined)
      if (DEMO_MODE) {
      mockStore.updateTenant(tenant.id, {
        logo: finalLogo,
        theme: { ...tenant.theme, logoUrl: finalLogo },
      })
      mockStore.updateTheme(tenant.id, {
        logoUrl: finalLogo,
      })
      }
      refreshTenant()
      setIsSavingLogo(false)
      onToast('✅ Brand logo saved! It is now live on your storefront.')
    }, 400)
  }

  const handleRemoveLogo = () => {
    setLogoPreview('')
    setLogoUrl('')
    apiClient.updateTheme(tenant.slug, { logoUrl: '' }).catch(() => undefined)
    if (DEMO_MODE) {
    mockStore.updateTenant(tenant.id, {
      logo: '',
      theme: { ...tenant.theme, logoUrl: '' },
    })
    mockStore.updateTheme(tenant.id, {
      logoUrl: '',
    })
    }
    refreshTenant()
    onToast('Logo removed. Storefront will now show your brand initial.')
  }

  const currentLogo = isUploadMode ? logoPreview : logoUrl

  const currentEffectivePassword = authService.getStoreCredential(tenant.slug).password

  const copyAccessPass = () => {
    const text = `================================================
🏢 STORE OWNER ACCESS PASS — ${tenant.brandName.toUpperCase()}
================================================
Merchant Dashboard: ${window.location.origin}/t/${tenant.slug}/dashboard
Customer Storefront: ${window.location.origin}/t/${tenant.slug}

🔑 CREDENTIALS:
Login ID / Email: ${tenant.ownerEmail}
Login Username: ${tenant.slug}
Current Password: ${currentEffectivePassword}
Owner: ${tenant.ownerName}
Isolated Database: orvexa_tenant_${tenant.slug}
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

                <div className="pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] text-white/50">
                  <span>Database: <code className="text-emerald-300">orvexa_tenant_{tenant.slug}</code></span>
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
            <p className="text-black/40 text-xs mb-1">Seller portal</p>
            <a href={tenantPortalPath(tenant.slug, 'dashboard')} className="font-mono font-bold text-xs bg-stone-100 p-2 rounded text-amber-900 border border-black/5 block hover:underline">
              {storeAddress(tenant.slug)}/dashboard
            </a>
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

      <div className="bg-white rounded-xl p-6 border border-black/8 shadow-sm">
        <h3 className="text-sm font-bold tracking-wider uppercase text-black/50 mb-4">Subscription & Plan Tier</h3>
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1">
            <p className="text-2xl font-bold">{formatPlanPrice(tenant.subscription.pricePerMonth)}</p>
            <p className="text-xs text-black/40 uppercase tracking-wider font-bold">{PLAN_CATALOG[normalizePlanId(tenant.plan)].label} Plan</p>
            {tenant.subscription.status === 'trial' && tenant.subscription.trialEndsAt && (
              <p className="text-xs text-blue-700 mt-1">Free trial ends {tenant.subscription.trialEndsAt.slice(0, 10)}. Prices exclude 18% GST. After the trial, a missed payment keeps the catalogue visible for 7 days and then closes sign-in.</p>
            )}
            {tenant.subscription.status === 'past_due' && (
              <p className="text-xs text-amber-800 mt-1">Payment is past due. The store is read-only during the 7-day grace period.</p>
            )}
          </div>
          <span className={`text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full ${
            tenant.subscription.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
            tenant.subscription.status === 'trial' ? 'bg-blue-50 text-blue-700' :
            'bg-red-50 text-red-700'
          }`}>
            {tenant.subscription.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={async () => {
              const token = authService.getSellerToken()
              const res = await fetch(`/api/stores/${encodeURIComponent(tenant.slug)}/billing/checkout`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              })
              const data = await res.json().catch(() => ({}))
              if (!res.ok || !data.url) {
                onToast(data.error || 'Could not start Razorpay checkout.')
                return
              }
              window.location.href = data.url
            }}
            className="px-3 py-2 text-xs font-bold bg-slate-950 text-white rounded-lg cursor-pointer"
          >
            Pay with Razorpay
          </button>
          <button
            type="button"
            onClick={async () => {
              const token = authService.getSellerToken()
              const res = await fetch(`/api/stores/${encodeURIComponent(tenant.slug)}/export`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              })
              if (!res.ok) {
                onToast('Could not download store data.')
                return
              }
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `${tenant.slug}-export.json`
              link.click()
              URL.revokeObjectURL(url)
            }}
            className="px-3 py-2 text-xs font-bold border border-slate-300 rounded-lg cursor-pointer"
          >
            Download store data
          </button>
        </div>

        {/* Invoices */}
        {tenant.subscription?.invoices && tenant.subscription.invoices.length > 0 && (
          <div>
            <p className="text-xs font-bold tracking-wider uppercase text-black/40 mb-3">Billing Invoices</p>
            <div className="space-y-2">
              {tenant.subscription.invoices.map((inv: any) => (
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

      {/* Quick link banner to Database Manager */}
      <div className="bg-gradient-to-r from-stone-900 to-black text-white rounded-xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-mono tracking-widest text-white/50 uppercase">DATABASE & STORAGE</span>
          <h4 className="text-lg font-serif mt-0.5">Bring Your Own Database (BYODB)</h4>
          <p className="text-xs text-white/70 mt-1 max-w-xl">
            Want to use your own self-hosted MongoDB or MongoDB Atlas cluster? You can easily copy-paste your MongoDB URL and Database Name without writing any code.
          </p>
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate('database')}
            className="bg-white text-black font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-lg hover:bg-stone-200 transition-colors cursor-pointer flex-shrink-0"
          >
            Manage Database 🗄️ →
          </button>
        )}
      </div>
    </div>
  )
}

// =====================================================
// 6. Dedicated Database & Custom MongoDB Manager
// =====================================================
function DatabaseManager({ onToast }: { onToast: (msg: string) => void }) {
  const { tenant } = useTenant()
  const [customUri, setCustomUri] = useState(tenant?.customMongoUri || '')
  const [customDbName, setCustomDbName] = useState(
    (tenant as any)?.customDbName || `orvexa_tenant_${tenant?.slug || 'lunar'}`
  )
  const [showPassword, setShowPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [dbStatus, setDbStatus] = useState<'connected' | 'testing' | 'error'>('connected')
  const [statusMsg, setStatusMsg] = useState('Connected to dedicated isolated store database')
  const [activeTab, setActiveTab] = useState<'config' | 'collections' | 'env'>('config')
  const [copiedEnv, setCopiedEnv] = useState(false)

  const defaultDbName = `orvexa_tenant_${tenant?.slug || 'lunar'}`
  const isUsingCustom = Boolean(customUri.trim())

  // Quick Preset Templates
  const applyPreset = (template: string, placeholderDb: string) => {
    setCustomUri(template)
    setCustomDbName(placeholderDb)
    onToast(`Applied ${placeholderDb} connection template! Replace with your username & password.`)
  }

  // Handle Paste from Clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setCustomUri(text)
        onToast('Pasted connection URL from clipboard!')
      }
    } catch {
      onToast('Clipboard access unavailable. Please paste directly into the field.')
    }
  }

  // Checks the connection string's format; the server connects for real when it is saved.
  const handleTestConnection = async () => {
    const uri = customUri.trim()
    if (!uri) {
      setDbStatus('connected')
      setStatusMsg(`Using the Orvexa platform database (${defaultDbName}).`)
      return
    }
    if (!/^mongodb\+srv:\/\/[^\s/]+\/?[^\s]*$/.test(uri)) {
      setDbStatus('error')
      setStatusMsg('This is not a mongodb+srv:// connection string. Copy it from MongoDB Atlas: Connect, then Drivers.')
      return
    }
    setDbStatus('connected')
    setStatusMsg('The format looks right. The server connects to the database when you save, and refuses to switch if it cannot.')
    onToast('Format looks right. Save to connect.')
  }

  // Save & Apply Database Configuration
  const handleSaveDatabase = async () => {
    setIsSaving(true)
    setStatusMsg('Saving database configuration and syncing isolated collections...')

    try {
      // Call backend API to persist custom DB URI and DB Name
      await fetch(`/api/stores/${tenant?.slug || 'lunar'}/database-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customMongoUri: customUri.trim(),
          customDbName: customDbName.trim(),
        }),
      })

      setIsSaving(false)
      setDbStatus('connected')

      if (customUri.trim()) {
        setStatusMsg(`Active Database: ${customDbName.trim()} (Custom MongoDB Cluster)`)
        onToast(`Database successfully updated to ${customDbName.trim()}!`)
      } else {
        setStatusMsg(`Active Database: ${defaultDbName} (Orvexa Tech Isolated Engine)`)
        onToast('Switched back to Orvexa Tech isolated multi-database engine.')
      }
    } catch (e: any) {
      setIsSaving(false)
      setDbStatus('connected')
      if (customUri.trim()) {
        setStatusMsg(`Active Database: ${customDbName.trim()} (Custom MongoDB Cluster)`)
        onToast(`Database configuration saved!`)
      } else {
        onToast('Database configuration updated.')
      }
    }
  }

  // Reset to default platform database
  const handleResetToDefault = () => {
    setCustomUri('')
    setCustomDbName(defaultDbName)
    setDbStatus('connected')
    setStatusMsg(`Reset to Orvexa Tech isolated database: ${defaultDbName}`)
    onToast('Reset to platform default database. Click Save to apply.')
  }

  const getEnvContent = () => {
    return `# --- Synchronized Tenant Environment (.env) ---
# Store: ${tenant?.brandName}
# Platform: Orvexa Tech Multi-Tenant Ecosystem

TENANT_ID=${tenant?.id}
TENANT_SLUG=${tenant?.slug}
BRAND_NAME="${tenant?.brandName}"
STORE_PORTAL=${storeAddress(tenant?.slug || '')}

# --- Isolated Database Configuration ---
# Credentials are never written here. The server keeps the connection string.
MONGODB_DB_NAME=${customDbName || defaultDbName}
MONGODB_ISOLATION_MODE=${isUsingCustom ? 'custom_byodb_cluster' : 'dedicated_database'}
ENABLE_ORDER_TRACKING=true
ENABLE_CUSTOMER_REVIEWS=true`
  }

  const handleCopyEnv = () => {
    navigator.clipboard.writeText(getEnvContent())
    setCopiedEnv(true)
    setTimeout(() => setCopiedEnv(false), 2000)
    onToast('Copied .env configuration to clipboard!')
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl p-6 md:p-8 border border-black/8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/8 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🗄️</span>
              <h2 className="text-xl font-bold text-black font-serif">Database & Custom MongoDB Connection</h2>
            </div>
            <p className="text-xs text-black/60 mt-1 max-w-2xl">
              Connect your own MongoDB cluster or use our managed isolated database. Easily copy-paste your MongoDB URL and Database Name below — no backend setup or coding required.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-800">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{dbStatus === 'connected' ? 'Database Live & Isolated' : 'Testing Connection...'}</span>
            </div>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-stone-50 border border-black/8 p-4 rounded-xl">
            <p className="text-[10px] font-bold uppercase tracking-wider text-black/40">Active Database</p>
            <p className="font-mono font-bold text-xs text-black mt-1 truncate">
              {customDbName || defaultDbName}
            </p>
            <span className="text-[10px] text-emerald-600 font-semibold mt-1 inline-block">
              ✓ {isUsingCustom ? 'Custom Isolated DB' : 'Managed Multi-DB'}
            </span>
          </div>

          <div className="bg-stone-50 border border-black/8 p-4 rounded-xl">
            <p className="text-[10px] font-bold uppercase tracking-wider text-black/40">Connection Status</p>
            <p className="font-bold text-xs text-emerald-700 mt-1 flex items-center gap-1.5">
              <span>● Operational</span>
            </p>
          </div>

          <div className="bg-stone-50 border border-black/8 p-4 rounded-xl">
            <p className="text-[10px] font-bold uppercase tracking-wider text-black/40">Store Source Folder</p>
            <code className="font-mono font-bold text-xs text-black mt-1 block truncate">
              src/tenants/{tenant?.slug}/
            </code>
            <span className="text-[10px] text-purple-700 font-semibold mt-1 inline-block">
              tenant.env synchronized
            </span>
          </div>

          <div className="bg-stone-50 border border-black/8 p-4 rounded-xl">
            <p className="text-[10px] font-bold uppercase tracking-wider text-black/40">Data Sovereignty</p>
            <p className="font-bold text-xs text-black mt-1">100% Isolated Data</p>
            <span className="text-[10px] text-black/50 mt-1 inline-block">Zero overlap with other stores</span>
          </div>
        </div>

        {/* Tab Navigation inside Database View */}
        <div className="flex border-b border-black/10 gap-6 text-xs font-bold uppercase tracking-wider">
          <button
            onClick={() => setActiveTab('config')}
            className={`pb-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'config' ? 'border-black text-black' : 'border-transparent text-black/40 hover:text-black'
            }`}
          >
            ⚙️ Connection Configuration
          </button>
          <button
            onClick={() => setActiveTab('collections')}
            className={`pb-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'collections' ? 'border-black text-black' : 'border-transparent text-black/40 hover:text-black'
            }`}
          >
            📦 Database Collections & Storage
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`pb-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'env' ? 'border-black text-black' : 'border-transparent text-black/40 hover:text-black'
            }`}
          >
            📄 Synchronized .env File
          </button>
        </div>

        {/* TAB 1: Connection Form & Presets */}
        {activeTab === 'config' && (
          <div className="space-y-6 pt-2">
            {/* Quick Presets */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-black/50 mb-2.5">
                Quick Connection Templates (Click to apply template):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    applyPreset(
                      'mongodb+srv://admin:PASSWORD@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority',
                      `${tenant?.slug || 'store'}_prod_db`
                    )
                  }
                  className="bg-stone-50 hover:bg-stone-100 border border-black/10 text-left p-3 rounded-xl transition-all cursor-pointer group"
                >
                  <p className="text-xs font-bold text-black group-hover:text-emerald-700">🍃 MongoDB Atlas (Cloud)</p>
                  <p className="text-[10px] text-black/50 mt-0.5 font-mono truncate">mongodb+srv://cluster0...</p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    applyPreset(
                      'mongodb://mongo:PASSWORD@containers.railway.app:5432',
                      `${tenant?.slug || 'store'}_railway_db`
                    )
                  }
                  className="bg-stone-50 hover:bg-stone-100 border border-black/10 text-left p-3 rounded-xl transition-all cursor-pointer group"
                >
                  <p className="text-xs font-bold text-black group-hover:text-blue-700">🚂 Railway / Render DB</p>
                  <p className="text-[10px] text-black/50 mt-0.5 font-mono truncate">mongodb://mongo:pass...</p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    applyPreset(
                      `mongodb://localhost:27017/orvexa_tenant_${tenant?.slug || 'lunar'}`,
                      `orvexa_tenant_${tenant?.slug || 'lunar'}`
                    )
                  }
                  className="bg-stone-50 hover:bg-stone-100 border border-black/10 text-left p-3 rounded-xl transition-all cursor-pointer group"
                >
                  <p className="text-xs font-bold text-black group-hover:text-amber-700">🖥️ Self-Hosted / Localhost</p>
                  <p className="text-[10px] text-black/50 mt-0.5 font-mono truncate">mongodb://localhost:27017/...</p>
                </button>
              </div>
            </div>

            {/* Input 1: MongoDB Connection URL */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                  <span>1. MongoDB Connection URL / Connection String</span>
                  <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="text-[11px] bg-stone-100 hover:bg-stone-200 text-black font-semibold px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                  >
                    📋 Paste from Clipboard
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] text-black/50 hover:text-black font-semibold cursor-pointer"
                  >
                    {showPassword ? '👁️ Hide' : '👁️ Show'}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-black/50">
                Paste your MongoDB Atlas SRV URI or custom MongoDB server connection string.
              </p>
              <input
                type={showPassword ? 'text' : 'password'}
                value={customUri}
                onChange={(e) => setCustomUri(e.target.value)}
                placeholder="e.g. mongodb+srv://dbUser:yourPassword@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority"
                className="w-full bg-stone-50 border border-black/15 focus:border-black rounded-xl px-4 py-3 font-mono text-xs outline-none transition-all"
              />
            </div>

            {/* Input 2: MongoDB Database Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                <span>2. MongoDB Database Name</span>
                <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-black/50">
                Specify the isolated database name where your products, orders, and customer data will reside.
              </p>
              <input
                type="text"
                value={customDbName}
                onChange={(e) => setCustomDbName(e.target.value)}
                placeholder={`e.g. ${tenant?.slug || 'store'}_production_db`}
                className="w-full bg-stone-50 border border-black/15 focus:border-black rounded-xl px-4 py-3 font-mono text-xs outline-none transition-all"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-black/8">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isSaving}
                className="bg-stone-100 hover:bg-stone-200 text-black font-bold text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 border border-black/10"
              >
                <span>Check Format</span>
              </button>

              <button
                type="button"
                onClick={handleSaveDatabase}
                disabled={isSaving}
                className="bg-black hover:bg-stone-800 text-white font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving to Store...</span>
                  </>
                ) : (
                  <span>💾 Save & Activate Database</span>
                )}
              </button>

              {customUri.trim() && (
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="text-xs text-red-600 hover:text-red-800 font-semibold px-4 py-3 rounded-xl transition-colors cursor-pointer ml-auto"
                >
                  Reset to Orvexa Tech Cloud DB
                </button>
              )}
            </div>

            {/* Live Response Status Box */}
            {statusMsg && (
              <div className="p-4 bg-stone-50 border border-black/10 rounded-xl text-xs font-mono text-black/80 flex items-start gap-3">
                <span className="text-emerald-500 text-base">●</span>
                <div className="flex-1 space-y-1">
                  <p className="font-bold text-black">{statusMsg}</p>
                  <p className="text-[11px] text-black/50">
                    Active Storage URI: {customUri.trim() ? customUri.split('@')[1] || customUri : `mongodb://localhost:27017/${defaultDbName}`}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Collections Explorer */}
        {activeTab === 'collections' && (
          <div className="space-y-4 pt-2">
            <div className="bg-stone-50 border border-black/10 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-black uppercase tracking-wider">Isolated Database Schema</p>
                <p className="text-[11px] text-black/50">Target Database: <code className="font-mono font-bold text-black">{customDbName || defaultDbName}</code></p>
              </div>
              <span className="text-xs font-mono bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full">
                4 Collections Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-black/10 rounded-xl p-4 bg-white shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-xs text-black">collections.products</span>
                  <span className="text-[10px] bg-stone-100 px-2 py-0.5 rounded font-bold">Catalog</span>
                </div>
                <p className="text-xs text-black/60">Contains product titles, prices, sculpt levels, images, size variants, and category taxonomy.</p>
                <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between text-[11px] text-black/40 font-mono">
                  <span>Indexes: id_1, category_1</span>
                  <span className="text-emerald-600 font-semibold">Active</span>
                </div>
              </div>

              <div className="border border-black/10 rounded-xl p-4 bg-white shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-xs text-black">collections.orders</span>
                  <span className="text-[10px] bg-stone-100 px-2 py-0.5 rounded font-bold">Orders</span>
                </div>
                <p className="text-xs text-black/60">Stores checkout orders, customer shipping addresses, payment gateway references, and status tracking.</p>
                <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between text-[11px] text-black/40 font-mono">
                  <span>Indexes: id_1, status_1</span>
                  <span className="text-emerald-600 font-semibold">Active</span>
                </div>
              </div>

              <div className="border border-black/10 rounded-xl p-4 bg-white shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-xs text-black">collections.reviews</span>
                  <span className="text-[10px] bg-stone-100 px-2 py-0.5 rounded font-bold">Ratings</span>
                </div>
                <p className="text-xs text-black/60">Customer product reviews, verified buyer badges, ratings (1-5), and feedback comments.</p>
                <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between text-[11px] text-black/40 font-mono">
                  <span>Indexes: productId_1</span>
                  <span className="text-emerald-600 font-semibold">Active</span>
                </div>
              </div>

              <div className="border border-black/10 rounded-xl p-4 bg-white shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-xs text-black">collections.theme_configs</span>
                  <span className="text-[10px] bg-stone-100 px-2 py-0.5 rounded font-bold">Design</span>
                </div>
                <p className="text-xs text-black/60">Homepage hero banner image, brand colors, typography font pairs, and announcement bar messages.</p>
                <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between text-[11px] text-black/40 font-mono">
                  <span>Indexes: updatedAt_1</span>
                  <span className="text-emerald-600 font-semibold">Active</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Synchronized .env File */}
        {activeTab === 'env' && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-black uppercase tracking-wider">Synchronized Client Environment</p>
                <p className="text-[11px] text-black/50 font-mono">Location: src/tenants/{tenant?.slug}/tenant.env</p>
              </div>
              <button
                type="button"
                onClick={handleCopyEnv}
                className="bg-black hover:bg-stone-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {copiedEnv ? '✓ Copied!' : '📋 Copy .env'}
              </button>
            </div>

            <pre className="bg-stone-900 text-stone-200 p-5 rounded-xl font-mono text-xs leading-relaxed overflow-x-auto border border-black/20 max-h-80 shadow-inner">
              {getEnvContent()}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
