// --- Orvexa Cloud - Clean Light Minimalist (Apple / Stripe Style) Commerce Platform ---
// Features a crisp pure-white canvas, slate/zinc surfaces, royal cobalt & emerald accents,
// ultra-sharp Plus Jakarta Sans / Inter typography, interactive milestone journeys,
// 1-Tap Indian UPI/Razorpay checkout, AI Magic copy assistant, live brand showcase, and transparent pricing.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAdminApplications, usePlatformStats, useAdminTenants } from '@/api/hooks'
import { mockStore } from '@/api/mock-store'
import { LegalComplianceModal, ComplianceFooterLinks, type ComplianceDocType } from '../compliance/LegalComplianceModal'

interface PlatformWebsiteProps {
  onOpenAdminLogin?: () => void
  onOpenAdminConsole?: () => void
  isSuperAdminLoggedIn?: boolean
}

export default function PlatformWebsite({
  onOpenAdminLogin,
  onOpenAdminConsole,
  isSuperAdminLoggedIn = false,
}: PlatformWebsiteProps) {
  const { stats } = usePlatformStats()
  const { tenants } = useAdminTenants()
  const { submitApplication } = useAdminApplications()

  // ── Scroll-reveal IntersectionObserver ──
  useEffect(() => {
    const els = document.querySelectorAll('.orv-reveal, .orv-reveal-scale')
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { (e.target as HTMLElement).classList.add('orv-visible'); io.unobserve(e.target) } }),
      { threshold: 0.12 }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // ── Scroll progress bar + navbar shadow ──
  useEffect(() => {
    const bar = document.getElementById('orv-scroll-progress')
    const header = document.getElementById('orv-main-header')
    const onScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
      if (bar) bar.style.width = `${pct}%`
      if (header) {
        if (scrollTop > 20) header.classList.add('orv-navbar-scrolled')
        else header.classList.remove('orv-navbar-scrolled')
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // ── Social Proof Toast ──
  const [toast, setToast] = useState<{ msg: string; sub: string } | null>(null)
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const toasts = [
      { msg: 'Priya M. just signed up', sub: 'Fashion & Apparel • Mumbai' },
      { msg: 'New store: Bloom & Sprout', sub: 'Baby & Kids • Bengaluru' },
      { msg: 'Devika P. saved ₹1.8L/yr', sub: 'Migrated from Shopify' },
      { msg: 'Arjun R. just launched', sub: 'Artisanal & Heritage • Delhi' },
      { msg: 'Khadi Studio: 76% growth', sub: 'Powered by Orvexa Cloud' },
    ]
    let idx = 0
    const show = () => {
      setToast(toasts[idx % toasts.length])
      idx++
      toastRef.current = setTimeout(() => {
        setToast(null)
        toastRef.current = setTimeout(show, 6000)
      }, 4000)
    }
    const initial = setTimeout(show, 5000)
    return () => {
      clearTimeout(initial)
      if (toastRef.current) clearTimeout(toastRef.current)
    }
  }, [])

  // ── Ripple factory ──
  const addRipple = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const wave = document.createElement('span')
    wave.className = 'orv-ripple-wave'
    wave.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`
    btn.appendChild(wave)
    wave.addEventListener('animationend', () => wave.remove())
  }, [])

  // State Management
  const [heroEmail, setHeroEmail] = useState('')
  const [selectedPillar, setSelectedPillar] = useState<'start' | 'sell' | 'market' | 'manage'>('start')
  const [activeCheckoutTab, setActiveCheckoutTab] = useState<'upi' | 'cards' | 'cod'>('upi')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly')
  const [activeFaq, setActiveFaq] = useState<number | null>(0)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [selectedBrandNiche, setSelectedBrandNiche] = useState<string>('all')
  const [complianceModalOpen, setComplianceModalOpen] = useState(false)
  const [complianceDoc, setComplianceDoc] = useState<ComplianceDocType>('gdpr')

  const handleOpenCompliance = (doc: ComplianceDocType) => {
    setComplianceDoc(doc)
    setComplianceModalOpen(true)
  }


  // Interactive Merchant Application Form
  const [appName, setAppName] = useState('')
  const [appOwner, setAppOwner] = useState('')
  const [appEmail, setAppEmail] = useState('')
  const [appPhone, setAppPhone] = useState('')
  const [appNiche, setAppNiche] = useState('Fashion & Apparel')
  const [appSlug, setAppSlug] = useState('')
  const [appVolume, setAppVolume] = useState('₹1L - ₹5L / month')
  const [appNotes, setAppNotes] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

  // ROI / Commission Savings Calculator
  const [monthlySalesVolume, setMonthlySalesVolume] = useState(1500)
  const [averageOrderValue, setAverageOrderValue] = useState(1950)

  const monthlyGMV = monthlySalesVolume * averageOrderValue
  const legacyCommissionCut = Math.round(monthlyGMV * 0.02)
  const legacyBasePlan = 8200 // e.g. Shopify Advanced / Grow Tier
  const legacyAppStack = 5800 // GST Invoicing, COD OTP Verification, WhatsApp Automation, Cart Recovery
  const legacyPlatformFee = legacyCommissionCut + legacyBasePlan + legacyAppStack
  const orvexaFlatFee = 2499
  const monthlySavings = Math.max(0, legacyPlatformFee - orvexaFlatFee)
  const annualSavings = monthlySavings * 12
  const threeYearSavings = annualSavings * 3

  // Slug availability check
  const handleSlugChange = (val: string) => {
    const sanitized = val.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setAppSlug(sanitized)
    if (sanitized.length < 3) {
      setSlugStatus('idle')
      return
    }
    const isAvail = mockStore.isSlugAvailable(sanitized)
    setSlugStatus(isAvail ? 'available' : 'taken')
  }

  const handleBrandNameChange = (val: string) => {
    setAppName(val)
    if (!appSlug || slugStatus === 'idle') {
      const autoSlug = val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      if (autoSlug.length >= 3) {
        setAppSlug(autoSlug)
        const isAvail = mockStore.isSlugAvailable(autoSlug)
        setSlugStatus(isAvail ? 'available' : 'taken')
      }
    }
  }

  const handleHeroGetStarted = (e: React.FormEvent) => {
    e.preventDefault()
    if (heroEmail.trim()) {
      setAppEmail(heroEmail.trim())
    }
    setShowApplyModal(true)
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!appName || !appEmail || !appSlug) return

    setFormSubmitting(true)
    setTimeout(() => {
      submitApplication({
        brandName: appName,
        ownerName: appOwner || appName + ' Founder',
        ownerEmail: appEmail,
        phone: appPhone || '+91 98765 43210',
        niche: appNiche,
        requestedSlug: appSlug,
        message: `Estimated Volume: ${appVolume}. Notes: ${appNotes || 'None'}. Source: Clean Light Apple/Stripe UI.`,
      })
      setFormSubmitting(false)
      setFormSuccess(appSlug)
    }, 900)
  }


  // Live Brands Showcase
  const showcaseBrands = [
    {
      id: 'lunar',
      name: 'The Lunar Clothing',
      category: 'Fashion & Apparel',
      tagline: 'Sculpted Minimalist Luxury',
      slug: 'lunar',
      image: '/images/lunar-fashion.jpg',
      revenue: '₹14.2L / mo',
      growth: '+42% YoY',
      quote: 'Migrating to Orvexa gave us a sub-200ms storefront and an isolated database with zero transaction commissions.',
      founder: 'Ananya Sharma, Founder',
      link: '/?tenant=lunar',
    },
    {
      id: 'bloom',
      name: 'Bloom & Sprout',
      category: 'Baby & Kids',
      tagline: 'Organic Essentials for Gentle Skin',
      slug: 'bloom',
      image: '/images/bloom-kids.jpg',
      revenue: '₹8.8L / mo',
      growth: '+58% YoY',
      quote: 'The 1-click UPI checkout and built-in review system increased our mobile conversion rate by 34%.',
      founder: 'Devika Patel, Co-Founder',
      link: '/?tenant=bloom',
    },
    {
      id: 'khadi',
      name: 'Khadi Elegance',
      category: 'Artisanal & Heritage',
      tagline: 'Handloom Cotton & Festive Weaves',
      slug: 'khadi',
      image: '/images/khadi-heritage.jpg',
      revenue: '₹21.5L / mo',
      growth: '+76% YoY',
      quote: 'Orvexa’s isolated database architecture ensures our customer records and orders remain private and secure.',
      founder: 'Vikramaditya Rao, Director',
      link: '/?tenant=khadi',
    },
  ]

  const filteredShowcase = showcaseBrands.filter(
    (b) => selectedBrandNiche === 'all' || b.category.toLowerCase().includes(selectedBrandNiche.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#ffffff] text-slate-900 font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Background Radial Gradient Mesh + Floating Particles */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Ambient glows */}
        <div className="orv-glow-pulse absolute top-[-5%] left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-blue-100/70 via-indigo-50/40 to-transparent blur-[120px] rounded-full" />
        <div className="orv-glow-pulse absolute top-[35%] -right-[100px] w-[500px] h-[500px] bg-emerald-100/40 blur-[130px] rounded-full" style={{ animationDelay: '2s' }} />
        <div className="orv-glow-pulse absolute bottom-[10%] left-[-80px] w-[400px] h-[400px] bg-indigo-100/30 blur-[110px] rounded-full" style={{ animationDelay: '4s' }} />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: `radial-gradient(#0f172a 1px, transparent 1px)`, backgroundSize: '28px 28px' }}
        />
        {/* Floating particles */}
        {[
          { size: 6,  top: '12%', left: '8%',   color: 'bg-blue-400/40',   dur: '8s',  delay: '0s'   },
          { size: 4,  top: '28%', left: '92%',  color: 'bg-indigo-400/30', dur: '11s', delay: '1.5s' },
          { size: 8,  top: '55%', left: '5%',   color: 'bg-emerald-400/25',dur: '9s',  delay: '3s'   },
          { size: 5,  top: '72%', left: '88%',  color: 'bg-blue-300/35',   dur: '13s', delay: '0.8s' },
          { size: 10, top: '18%', left: '48%',  color: 'bg-indigo-300/20', dur: '7s',  delay: '2.2s' },
          { size: 4,  top: '85%', left: '30%',  color: 'bg-blue-400/30',   dur: '10s', delay: '1s'   },
          { size: 6,  top: '40%', left: '75%',  color: 'bg-emerald-300/25',dur: '12s', delay: '4s'   },
        ].map((p, i) => (
          <div
            key={i}
            className={`orv-particle ${p.color}`}
            style={{ width: p.size * 4, height: p.size * 4, top: p.top, left: p.left, ['--dur' as string]: p.dur, ['--delay' as string]: p.delay }}
          />
        ))}
      </div>

      {/* Top Banner Ribbon */}
      <div className="relative z-50 bg-slate-900 py-2 px-4 text-center text-xs text-slate-200 font-medium shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 mx-auto sm:mx-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ORVEXA OS 2.4
            </span>
            <span>Launch your e-commerce store with dedicated database power • 0% transaction fees</span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-[11px] font-mono ml-auto">
            <span className="text-slate-400">⚡ Instant 1-Tap UPI Ready</span>
            <button onClick={() => setShowApplyModal(true)} className="text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer">
              Start Free Trial →
            </button>
          </div>
        </div>
      </div>

      {/* Scroll Progress Bar */}
      <div id="orv-scroll-progress" />

      {/* Social Proof Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-6 z-50 orv-toast-enter flex items-center gap-3 bg-white border border-slate-200 rounded-2xl shadow-xl px-4 py-3 max-w-xs"
          style={{ boxShadow: '0 12px 40px rgba(15,23,42,0.12)' }}
        >
          <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">✓</div>
          <div>
            <p className="text-xs font-bold text-slate-900">{toast.msg}</p>
            <p className="text-[10px] text-slate-500 font-mono">{toast.sub}</p>
          </div>
        </div>
      )}

      {/* Main Sticky Navbar */}
      <header id="orv-main-header" className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center gap-8">
            <a href="#" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-400 p-[1.5px] shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <span className="text-base font-black text-white">O</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold tracking-tight text-slate-950 font-display">Orvexa</span>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-600 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200">
                  Cloud
                </span>
              </div>
            </a>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-5 text-[13px] font-semibold text-slate-600">
              <a
                href="#savings-calculator"
                className="group relative px-3 py-1.5 rounded-full bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200/80 text-blue-700 transition-all flex items-center gap-1.5 whitespace-nowrap shadow-xs hover:scale-105 active:scale-95"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span>Savings Calculator</span>
                <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded ml-0.5">
                  0% Cut
                </span>
              </a>
              <a href="#what-we-provide" className="orv-link-underline hover:text-blue-600 transition-colors whitespace-nowrap">What We Provide</a>
              <a href="#journey" className="orv-link-underline hover:text-blue-600 transition-colors whitespace-nowrap">Platform Journey</a>
              <a href="#checkout" className="orv-link-underline hover:text-blue-600 transition-colors whitespace-nowrap">1-Tap Checkout</a>
              <a href="#showcase" className="orv-link-underline hover:text-blue-600 transition-colors whitespace-nowrap">Live Brands</a>
              <a href="#pricing" className="orv-link-underline hover:text-blue-600 transition-colors whitespace-nowrap">Pricing (₹ INR)</a>
            </nav>
          </div>

          {/* Right Action Header Buttons */}
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setShowApplyModal(true)}
              className="px-5 py-2.5 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-md shadow-blue-500/25 cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Start Free Trial →
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="relative z-10">
        {/* ======================================================== */}
        {/* 1. HERO SECTION (Clean Light Stripe/Apple Style) */}
        {/* ======================================================== */}
        <section className="pt-20 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center relative">
          {/* Category Pill */}
          <div className="orv-fade-in orv-d0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 mb-8 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span>The Modern Autonomous Multi-Tenant E-Commerce OS</span>
          </div>

          {/* High-Impact Hero Headline */}
          <h1 className="orv-fade-up orv-d1 text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-950 max-w-5xl mx-auto leading-[1.08] mb-6 font-display">
            The commerce engine behind <br className="hidden sm:inline" />
            <span className="orv-shimmer-text">
              India&apos;s fastest growing brands
            </span>
          </h1>

          <p className="orv-fade-up orv-d2 text-base sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed mb-10 font-normal">
            Launch your custom online store with dedicated isolated databases, sub-200ms load speeds, 1-tap UPI checkout, and complete merchant control.
            <strong className="text-slate-900 font-semibold"> 0% transaction commissions. Everything you need to scale.</strong>
          </p>

          {/* Email Lead Capture Bar */}
          <form onSubmit={handleHeroGetStarted} className="orv-fade-up orv-d3 max-w-xl mx-auto mb-6">
            <div className="flex flex-col sm:flex-row items-center gap-2 bg-white p-1.5 rounded-2xl sm:rounded-full border border-slate-300 shadow-xl focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
              <input
                type="email"
                required
                value={heroEmail}
                onChange={(e) => setHeroEmail(e.target.value)}
                placeholder="Enter your business email address"
                className="w-full sm:flex-1 bg-transparent px-5 py-3 text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none font-sans"
              />
              <button
                type="submit"
                onMouseDown={addRipple}
                className="orv-ripple-host orv-cta-glow w-full sm:w-auto px-7 py-3 rounded-full text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/25 transition-all cursor-pointer whitespace-nowrap"
              >
                Start Free Trial →
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2.5 font-sans">
              Try Orvexa free for 30 days. No credit card required. Instant database and folder provisioning.
            </p>
          </form>

          {/* Live Telemetry Grid (Clean Light Surface) */}
          <div className="orv-scale-in orv-d4 grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xl max-w-4xl mx-auto text-left mt-14">
            <div className="orv-stat-anim orv-stat-anim-1 p-3 border-r border-slate-100 last:border-0">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Live GMV Processed</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1 font-display">₹4.8 Cr+</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">Across active stores</p>
            </div>
            <div className="orv-stat-anim orv-stat-anim-2 p-3 border-r border-slate-100 last:border-0">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Transaction Fee</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 font-display">0% Always</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">Keep 100% of revenue</p>
            </div>
            <div className="orv-stat-anim orv-stat-anim-3 p-3 border-r border-slate-100 last:border-0">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Store Provisioning</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1 font-display">&lt; 10 Seconds</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">Automated .env &amp; code</p>
            </div>
            <div className="orv-stat-anim orv-stat-anim-4 p-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Data Architecture</p>
              <p className="text-xl sm:text-2xl font-bold text-indigo-600 mt-1 font-display">100% Isolated DB</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">Zero shared table leaks</p>
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* 1.5 ANNUAL COMMISSION SAVINGS CALCULATOR (MOVED TO TOP) */}
        {/* ======================================================== */}
        <section id="savings-calculator" className="py-14 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-100">
          <div className="orv-reveal text-center max-w-3xl mx-auto mb-10">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-bold uppercase tracking-wider mb-3 shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              0% Transaction Commission • No App Add-on Tax
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-950 tracking-tight font-display">
              Annual Commission Savings Calculator
            </h2>
            <p className="text-slate-600 text-sm sm:text-base mt-3 max-w-2xl mx-auto">
              Legacy platforms charge a 2.0% cut on Indian payment gateways plus ₹14,000+/mo for essential apps. See how much pure profit you retain with Orvexa Cloud.
            </p>
          </div>

          {/* Quick Realistic Preset Scenarios */}
          <div className="orv-reveal flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-8">
            <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
              <span>⚡</span> Preset Scenarios:
            </span>
            {[
              { label: 'Starter Boutique', orders: 400, aov: 1450, tag: '₹5.8L GMV' },
              { label: 'Growing D2C Brand', orders: 1500, aov: 1950, tag: '₹29.25L GMV' },
              { label: 'High Growth Scale', orders: 4500, aov: 2750, tag: '₹1.24 Cr GMV' },
              { label: 'Enterprise D2C', orders: 10000, aov: 3400, tag: '₹3.40 Cr GMV' },
            ].map((preset) => {
              const isSelected = monthlySalesVolume === preset.orders && averageOrderValue === preset.aov
              return (
                <button
                  key={preset.label}
                  onClick={() => {
                    setMonthlySalesVolume(preset.orders)
                    setAverageOrderValue(preset.aov)
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-300 cursor-pointer flex items-center gap-1.5 transform active:scale-95 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-105 font-bold ring-2 ring-blue-400/40'
                      : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 hover:scale-102'
                  }`}
                >
                  <span>{preset.label}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${isSelected ? 'bg-blue-700/70 text-blue-100' : 'bg-slate-100 text-slate-500'}`}>
                    {preset.tag}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Interactive Calculator Surface */}
          <div className="orv-reveal rounded-3xl bg-gradient-to-b from-slate-50/80 to-white border border-slate-200/90 p-6 sm:p-10 lg:p-12 shadow-2xl shadow-slate-200/60 relative overflow-hidden">
            {/* Ambient background decoration */}
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-100/40 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-100/30 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-950 font-display">
                      Calculate your exact savings
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1">
                      Adjust order volume and average order value (AOV) to view real-world Indian D2C figures.
                    </p>
                  </div>
                  {annualSavings >= 500000 && (
                    <span className="orv-sparkle-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold shadow-xs">
                      <span>✨</span> High ROI Tier
                    </span>
                  )}
                </div>

                <div className="space-y-6 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-sm">
                  {/* Monthly Orders Slider */}
                  <div>
                    <div className="flex justify-between items-baseline text-xs sm:text-sm font-semibold text-slate-800 mb-2">
                      <span className="flex items-center gap-1.5">
                        <span>📦</span> Monthly Orders:
                      </span>
                      <div className="flex items-center gap-2">
                        <span key={`orders-${monthlySalesVolume}`} className="orv-number-animate font-mono text-lg font-bold text-blue-600">
                          {monthlySalesVolume.toLocaleString('en-IN')}
                        </span>
                        <span className="text-xs font-normal text-slate-500">orders/mo</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={15000}
                      step={50}
                      value={monthlySalesVolume}
                      onChange={(e) => setMonthlySalesVolume(Number(e.target.value))}
                      style={{
                        background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((monthlySalesVolume - 50) / (15000 - 50)) * 100}%, #e2e8f0 ${((monthlySalesVolume - 50) / (15000 - 50)) * 100}%, #e2e8f0 100%)`,
                      }}
                      className="orv-range-slider cursor-pointer"
                    />
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mt-2">
                      <span>50 orders</span>
                      {/* Micro Quick adjustments */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setMonthlySalesVolume((v) => Math.max(50, v - 500))}
                          className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                          title="Subtract 500 orders"
                        >
                          -500
                        </button>
                        <button
                          onClick={() => setMonthlySalesVolume((v) => Math.min(15000, v + 500))}
                          className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                          title="Add 500 orders"
                        >
                          +500
                        </button>
                        <button
                          onClick={() => setMonthlySalesVolume((v) => Math.min(15000, v + 2000))}
                          className="px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors cursor-pointer font-bold"
                          title="Add 2,000 orders"
                        >
                          +2k
                        </button>
                      </div>
                      <span>15,000 orders</span>
                    </div>
                  </div>

                  {/* AOV Slider */}
                  <div>
                    <div className="flex justify-between items-baseline text-xs sm:text-sm font-semibold text-slate-800 mb-2">
                      <span className="flex items-center gap-1.5">
                        <span>🏷️</span> Average Order Value (AOV):
                      </span>
                      <div className="flex items-center gap-2">
                        <span key={`aov-${averageOrderValue}`} className="orv-number-animate font-mono text-lg font-bold text-blue-600">
                          ₹{averageOrderValue.toLocaleString('en-IN')}
                        </span>
                        <span className="text-xs font-normal text-slate-500">per order</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={300}
                      max={15000}
                      step={50}
                      value={averageOrderValue}
                      onChange={(e) => setAverageOrderValue(Number(e.target.value))}
                      style={{
                        background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((averageOrderValue - 300) / (15000 - 300)) * 100}%, #e2e8f0 ${((averageOrderValue - 300) / (15000 - 300)) * 100}%, #e2e8f0 100%)`,
                      }}
                      className="orv-range-slider cursor-pointer"
                    />
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mt-2">
                      <span>₹300</span>
                      {/* Micro Quick adjustments */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setAverageOrderValue((v) => Math.max(300, v - 500))}
                          className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                        >
                          -₹500
                        </button>
                        <button
                          onClick={() => setAverageOrderValue((v) => Math.min(15000, v + 500))}
                          className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                        >
                          +₹500
                        </button>
                        <button
                          onClick={() => setAverageOrderValue((v) => Math.min(15000, v + 1500))}
                          className="px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors cursor-pointer font-bold"
                        >
                          +₹1.5k
                        </button>
                      </div>
                      <span>₹15,000</span>
                    </div>
                  </div>
                </div>

                {/* Live Comparison Progress Bar */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-600 flex items-center gap-1.5">
                      <span>📊</span> Monthly Platform Fee Burden:
                    </span>
                    <span className="font-mono text-emerald-600 font-bold">
                      {Math.round((monthlySavings / legacyPlatformFee) * 100)}% Cost Eliminated
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex relative">
                    <div
                      className="orv-bar-fill h-full bg-emerald-500 rounded-l-full flex items-center justify-end pr-1 text-[8px] font-bold text-white"
                      style={{ width: `${Math.max(6, (orvexaFlatFee / legacyPlatformFee) * 100)}%` }}
                      title="Orvexa Flat Fee"
                    />
                    <div
                      className="orv-bar-fill h-full bg-rose-500/80 rounded-r-full"
                      style={{ width: `${Math.min(94, 100 - (orvexaFlatFee / legacyPlatformFee) * 100)}%` }}
                      title="Legacy Platform Fees (Commission + Apps)"
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      Orvexa: ₹{orvexaFlatFee.toLocaleString('en-IN')}/mo
                    </span>
                    <span className="text-rose-600 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                      Legacy Bleed: ₹{legacyPlatformFee.toLocaleString('en-IN')}/mo
                    </span>
                  </div>
                </div>

                {/* Transparent Realistic Itemized Cost Breakdown */}
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/90 border border-slate-200 text-xs font-mono space-y-2.5">
                  <div className="flex justify-between items-center text-slate-700 pb-2 border-b border-slate-200">
                    <span className="font-sans font-medium text-slate-600">Estimated Monthly GMV:</span>
                    <span className="text-slate-950 font-bold text-sm">₹{monthlyGMV.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 hover:text-slate-900 transition-colors">
                    <span className="font-sans flex items-center gap-1.5">
                      <span className="text-rose-500">✕</span> Legacy 2% Gateway Commission Cut:
                    </span>
                    <span className="text-rose-600 font-semibold">₹{legacyCommissionCut.toLocaleString('en-IN')}/mo</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 hover:text-slate-900 transition-colors">
                    <span className="font-sans flex items-center gap-1.5">
                      <span className="text-rose-500">✕</span> Legacy Base Plan + Essential App Stack:
                    </span>
                    <span className="text-rose-600 font-semibold">₹{(legacyBasePlan + legacyAppStack).toLocaleString('en-IN')}/mo</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200/60">
                    <span className="font-sans font-bold text-slate-800">Total Monthly Legacy Bleed:</span>
                    <span className="text-rose-600 font-bold text-sm">₹{legacyPlatformFee.toLocaleString('en-IN')}/mo</span>
                  </div>
                  <div className="flex justify-between items-center bg-emerald-50/90 -mx-2 px-3 py-2 rounded-xl text-emerald-900 font-bold shadow-xs border border-emerald-200/50">
                    <span className="font-sans flex items-center gap-1.5">
                      <span className="text-emerald-600">✓</span> Orvexa Flat Cost (0% Cut, Apps Included):
                    </span>
                    <span className="text-emerald-700 text-sm">₹{orvexaFlatFee.toLocaleString('en-IN')}/mo</span>
                  </div>
                </div>
              </div>

              {/* High-Impact Savings Result Card */}
              <div className="lg:col-span-5 bg-gradient-to-b from-white via-blue-50/30 to-emerald-50/30 border-2 border-blue-200 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl relative overflow-hidden group hover:border-blue-300 transition-all">
                <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-400/15 rounded-full blur-2xl pointer-events-none" />
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[10px] font-mono font-bold uppercase tracking-widest shadow-xs">
                  YOUR ESTIMATED ANNUAL SAVINGS
                </div>
                <div>
                  <p
                    key={`annual-${annualSavings}`}
                    className="orv-number-animate orv-savings-glow text-4xl sm:text-5xl lg:text-6xl font-extrabold text-emerald-600 tracking-tight font-display"
                  >
                    ₹{annualSavings.toLocaleString('en-IN')}
                  </p>
                  <p
                    key={`threeyr-${threeYearSavings}`}
                    className="orv-number-animate text-xs font-mono text-emerald-700 font-semibold mt-1.5"
                  >
                    + ₹{threeYearSavings.toLocaleString('en-IN')} saved across 3 years
                  </p>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-sm mx-auto">
                  Save <strong className="text-slate-900 font-bold">₹{monthlySavings.toLocaleString('en-IN')} every month</strong> by keeping 100% of customer payments directly in your merchant account.
                </p>
                <div className="pt-2 space-y-3">
                  <button
                    onClick={() => setShowApplyModal(true)}
                    onMouseDown={addRipple}
                    className="orv-ripple-host orv-cta-glow w-full py-3.5 rounded-full text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 transition-all cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Start Saving with Orvexa →
                  </button>
                  <div className="flex items-center justify-center gap-3 text-[10px] text-slate-500 font-mono">
                    <span>✓ Zero Onboarding Fee</span>
                    <span>•</span>
                    <span>✓ 30-Day Free Trial</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* 2. WHAT WE PROVIDE (CLEAN LIGHT PILLARS) */}
        {/* ======================================================== */}
        <section id="what-we-provide" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-100">
          <div className="orv-reveal text-center max-w-3xl mx-auto mb-16">
            <span className="text-[11px] font-mono uppercase tracking-widest text-blue-600 font-bold">
              WHAT WE PROVIDE
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-950 mt-2 tracking-tight font-display">
              A Turnkey Enterprise Commerce Suite
            </h2>
            <p className="text-slate-600 text-sm sm:text-base mt-3">
              Everything required to launch, manage, and scale a direct-to-consumer online business without hiring a dedicated engineering team.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="orv-reveal orv-reveal-scale orv-card-pop p-8 rounded-3xl bg-white border border-slate-200/90 shadow-sm group flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform text-blue-600">
                  🗄️
                </div>
                <h3 className="text-lg font-bold text-slate-950 mb-2">Dedicated Database per Store</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your store gets a dedicated MongoDB schema (<code>orvexa_tenant_{'{slug}'}</code>). No shared tables, no data leakage, and full GDPR compliance.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-[11px] font-mono text-blue-600 font-semibold">
                <span>✓ 0% Cross-Tenant Risk</span>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="orv-reveal orv-reveal-scale orv-card-pop p-8 rounded-3xl bg-white border border-slate-200/90 shadow-sm group flex flex-col justify-between" style={{ transitionDelay: '80ms' }}>
              <div>
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform text-indigo-600">
                  ⚡
                </div>
                <h3 className="text-lg font-bold text-slate-950 mb-2">Sub-200ms Custom Storefronts</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Bespoke, luxury-crafted storefronts with fluid sliding mini-cart drawers, size selectors, product galleries, and real-time inventory sync.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-[11px] font-mono text-indigo-600 font-semibold">
                <span>✓ Instant Page Loading</span>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="orv-reveal orv-reveal-scale orv-card-pop p-8 rounded-3xl bg-white border border-slate-200/90 shadow-sm group flex flex-col justify-between" style={{ transitionDelay: '160ms' }}>
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform text-emerald-600">
                  💳
                </div>
                <h3 className="text-lg font-bold text-slate-950 mb-2">Omnichannel Indian Payments</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Native integrations for Razorpay, UPI QR, Google Pay, PhonePe, NetBanking, and OTP-verified Cash on Delivery with automated invoicing.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-[11px] font-mono text-emerald-600 font-semibold">
                <span>✓ 1-Tap UPI App Routing</span>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="orv-reveal orv-reveal-scale orv-card-pop p-8 rounded-3xl bg-white border border-slate-200/90 shadow-sm group flex flex-col justify-between" style={{ transitionDelay: '240ms' }}>
              <div>
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform text-amber-600">
                  📊
                </div>
                <h3 className="text-lg font-bold text-slate-950 mb-2">Seller Management Command</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Dedicated control panel for catalog management, stock status alerts, customer CRM, coupon campaigns, and live revenue analytics.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-[11px] font-mono text-amber-600 font-semibold">
                <span>✓ Live Revenue Telemetry</span>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="orv-reveal orv-reveal-scale orv-card-pop p-8 rounded-3xl bg-white border border-slate-200/90 shadow-sm group flex flex-col justify-between" style={{ transitionDelay: '320ms' }}>
              <div>
                <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform text-sky-600">
                  🌐
                </div>
                <h3 className="text-lg font-bold text-slate-950 mb-2">Custom Domains & SSL</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Get your free <code>brand.orvexatech.com</code> subdomain instantly, or map any custom domain (<code>yourbrand.in</code>) with automated Let&apos;s Encrypt SSL.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-[11px] font-mono text-sky-600 font-semibold">
                <span>✓ Free Automated SSL</span>
              </div>
            </div>

            {/* Feature 6 */}
            <div className="orv-reveal orv-reveal-scale orv-card-pop p-8 rounded-3xl bg-white border border-slate-200/90 shadow-sm group flex flex-col justify-between" style={{ transitionDelay: '400ms' }}>
              <div>
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform text-rose-600">
                  ✨
                </div>
                <h3 className="text-lg font-bold text-slate-950 mb-2">Orvexa Magic AI & SEO</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Automated Google Shopping structured schema, dynamic meta tags, and AI-assisted product description generators to boost organic discovery.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-[11px] font-mono text-rose-600 font-semibold">
                <span>✓ Pre-Configured Schema</span>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* 3. THE 4 MILESTONE JOURNEYS (START, SELL, MARKET, MANAGE) */}
        {/* ======================================================== */}
        <section id="journey" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-100">
          <div className="orv-reveal text-center max-w-3xl mx-auto mb-12">
            <span className="text-[11px] font-mono uppercase tracking-widest text-blue-600 font-bold">
              THE COMMERCE JOURNEY
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-950 mt-2 tracking-tight font-display">
              Everything to scale your online brand
            </h2>
          </div>

          {/* Interactive Switcher */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex p-1.5 rounded-full bg-slate-100 border border-slate-200 gap-1 overflow-x-auto max-w-full">
              {[
                { id: 'start', label: '1. Start & Build', icon: '🎨' },
                { id: 'sell', label: '2. Sell Everywhere', icon: '🛍️' },
                { id: 'market', label: '3. Market & Grow', icon: '🚀' },
                { id: 'manage', label: '4. Manage & Fulfill', icon: '📦' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedPillar(tab.id as any)}
                  className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                    selectedPillar === tab.id
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/60'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pillar Card Container (Clean Light Mode) */}
          <div className="rounded-3xl bg-slate-50 border border-slate-200/90 p-8 sm:p-12 shadow-xl relative overflow-hidden">
            {selectedPillar === 'start' && (
              <div className="orv-panel-enter grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                <div className="lg:col-span-6 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-mono font-bold">
                    STOREFRONT ARCHITECTURE
                  </div>
                  <h3 className="text-3xl font-bold text-slate-950 tracking-tight leading-tight font-display">
                    Launch a luxury storefront in under 10 seconds
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Select from modern, high-converting templates built with React and Vite. Instant subdomain provisioning, lightning-fast rendering, and customizable color tokens.
                  </p>
                  <ul className="space-y-3 text-xs sm:text-sm text-slate-700 font-sans">
                    <li className="flex items-center gap-2.5">
                      <span className="text-blue-600 font-bold">✓</span>
                      <span>Sub-200ms page load times with CDN image delivery</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="text-blue-600 font-bold">✓</span>
                      <span>Fluid sliding mini-cart with free shipping threshold</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="text-blue-600 font-bold">✓</span>
                      <span>Automated SSL certificate provisioning</span>
                    </li>
                  </ul>
                  <div className="pt-2">
                    <a
                      href="/?tenant=lunar"
                      target="_blank"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-md"
                    >
                      <span>Preview Live Storefront Demo ↗</span>
                    </a>
                  </div>
                </div>

                {/* Mockup */}
                <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-rose-400" />
                      <span className="w-3 h-3 rounded-full bg-amber-400" />
                      <span className="w-3 h-3 rounded-full bg-emerald-400" />
                      <span className="text-xs font-mono text-slate-500 ml-2">https://lunar.orvexatech.com</span>
                    </div>
                    <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      14ms Latency
                    </span>
                  </div>
                  <div className="relative rounded-xl overflow-hidden aspect-video bg-gradient-to-tr from-slate-900 to-slate-800 p-6 flex flex-col justify-end text-white">
                    <span className="text-[11px] font-mono text-amber-300 font-bold uppercase tracking-widest">
                      THE LUNAR CLOTHING • NEW ARRIVALS
                    </span>
                    <h4 className="text-2xl font-bold mt-1">Sculpted Minimalist Silhouette</h4>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="px-4 py-1.5 rounded-full bg-white text-slate-950 font-bold text-xs shadow">
                        Shop Collection →
                      </span>
                      <span className="text-xs font-mono text-slate-300">₹1,899 • Free Delivery</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedPillar === 'sell' && (
              <div className="orv-panel-enter grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                <div className="lg:col-span-6 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-mono font-bold">
                    OMNICHANNEL COMMERCE
                  </div>
                  <h3 className="text-3xl font-bold text-slate-950 tracking-tight leading-tight font-display">
                    Sell everywhere your customers are
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Reach buyers across your online storefront, WhatsApp Commerce chats, and retail counters with unified real-time stock sync.
                  </p>
                  <ul className="space-y-3 text-xs sm:text-sm text-slate-700 font-sans">
                    <li className="flex items-center gap-2.5">
                      <span className="text-blue-600 font-bold">✓</span>
                      <span>Native Razorpay, UPI QR, Paytm & Cards</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="text-blue-600 font-bold">✓</span>
                      <span>Cash on Delivery (COD) with automated OTP protection</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="text-blue-600 font-bold">✓</span>
                      <span>Unified multi-channel stock synchronization</span>
                    </li>
                  </ul>
                  <div className="pt-2">
                    <button
                      onClick={() => setShowApplyModal(true)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-md"
                    >
                      <span>Enable Omnichannel Sales →</span>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6 grid grid-cols-2 gap-3.5">
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
                    <span className="text-2xl">📱</span>
                    <h5 className="font-bold text-slate-950 text-sm">Online Storefront</h5>
                    <p className="text-xs text-slate-500">Mobile-optimized high converting custom store.</p>
                    <p className="text-[11px] font-mono text-emerald-600 font-bold">Active • 1,420 orders</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
                    <span className="text-2xl">💬</span>
                    <h5 className="font-bold text-slate-950 text-sm">WhatsApp Commerce</h5>
                    <p className="text-xs text-slate-500">1-click direct checkout links sent over chat.</p>
                    <p className="text-[11px] font-mono text-emerald-600 font-bold">High Conversion</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
                    <span className="text-2xl">🏪</span>
                    <h5 className="font-bold text-slate-950 text-sm">In-Person POS</h5>
                    <p className="text-xs text-slate-500">Sell at pop-ups and retail stores with barcode scans.</p>
                    <p className="text-[11px] font-mono text-blue-600 font-bold">Live Inventory Sync</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
                    <span className="text-2xl">🌐</span>
                    <h5 className="font-bold text-slate-950 text-sm">Social Channels</h5>
                    <p className="text-xs text-slate-500">Sync product feeds with Google Shopping.</p>
                    <p className="text-[11px] font-mono text-indigo-600 font-bold">SEO Schema Ready</p>
                  </div>
                </div>
              </div>
            )}

            {selectedPillar === 'market' && (
              <div className="orv-panel-enter grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                <div className="lg:col-span-6 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-mono font-bold">
                    MARKETING CRM
                  </div>
                  <h3 className="text-3xl font-bold text-slate-950 tracking-tight leading-tight font-display">
                    Convert visitors into repeat loyal buyers
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Boost order value with automated coupon campaigns, customer loyalty tracking, abandoned cart follow-ups, and verified reviews.
                  </p>
                  <ul className="space-y-3 text-xs sm:text-sm text-slate-700 font-sans">
                    <li className="flex items-center gap-2.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Flexible discount promo codes (Percentage, Flat ₹ Off)</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Automated WhatsApp & Email order tracking alerts</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>Structured Rich Schema for automatic Google rankings</span>
                    </li>
                  </ul>
                  <div className="pt-2">
                    <button
                      onClick={() => setShowApplyModal(true)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-md"
                    >
                      <span>Grow Customer Base →</span>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="font-bold text-sm text-slate-950">Active Promo Campaigns</span>
                    <span className="text-xs font-mono text-emerald-600 font-bold">Live Telemetry</span>
                  </div>
                  <div className="space-y-2.5 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-950">FESTIVE20 (20% Off)</p>
                        <p className="text-[11px] text-slate-500">Diwali Special Promo</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-emerald-600">₹3,42,800 Generated</p>
                        <p className="text-[10px] text-slate-400">184 redemptions</p>
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-950">Abandoned Cart Recovery</p>
                        <p className="text-[11px] text-slate-500">Automated WhatsApp Follow-up</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-emerald-600">28.4% Recovered</p>
                        <p className="text-[10px] text-slate-400">42 saved orders</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedPillar === 'manage' && (
              <div className="orv-panel-enter grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                <div className="lg:col-span-6 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-200 text-slate-800 text-xs font-mono font-bold">
                    MERCHANT BACKOFFICE
                  </div>
                  <h3 className="text-3xl font-bold text-slate-950 tracking-tight leading-tight font-display">
                    Full control over orders, stock & GST invoices
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Track shipments, download GST-compliant PDF invoices, update variant stock, and inspect customer lifetime value in one unified portal.
                  </p>
                  <ul className="space-y-3 text-xs sm:text-sm text-slate-700 font-sans">
                    <li className="flex items-center gap-2.5">
                      <span className="text-blue-600 font-bold">✓</span>
                      <span>Real-time low stock alerts & variant inventory management</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="text-blue-600 font-bold">✓</span>
                      <span>Automated GST invoice generation with HSN codes</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="text-blue-600 font-bold">✓</span>
                      <span>1-click order status transitions (Pending → Shipped → Delivered)</span>
                    </li>
                  </ul>
                  <div className="pt-2">
                    <a
                      href="/?panel=dashboard&tenant=lunar"
                      target="_blank"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-md"
                    >
                      <span>Explore Merchant Dashboard Demo ↗</span>
                    </a>
                  </div>
                </div>

                <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs font-mono">
                    <span className="text-slate-950 font-bold">LIVE ORDER FULFILLMENT QUEUE</span>
                    <span className="text-emerald-600 font-bold">4 Orders Ready to Ship</span>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex justify-between items-center">
                      <div>
                        <p className="text-slate-950 font-bold">#ORD-9421 • Priya M.</p>
                        <p className="text-[10px] text-slate-500">Silk Saree Ensemble • Bangalore</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        PAID ₹3,499
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex justify-between items-center">
                      <div>
                        <p className="text-slate-950 font-bold">#ORD-9422 • Rajesh K.</p>
                        <p className="text-[10px] text-slate-500">Handloom Kurta • Mumbai</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                        COD ₹1,899
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ======================================================== */}
        {/* 4. 1-TAP INDIAN CHECKOUT (LIGHT APPLE/STRIPE STYLE) */}
        {/* ======================================================== */}
        <section id="checkout" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-100">
          <div className="rounded-3xl bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/80 border border-blue-200/80 p-8 sm:p-14 shadow-xl relative overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-6 space-y-6">
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-blue-600">
                  HIGH-CONVERTING CHECKOUT
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight leading-tight font-display">
                  The fastest 1-Tap checkout engineered for Indian shoppers
                </h2>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Reduce abandoned checkouts by up to 36%. Enjoy instant UPI app routing (Google Pay, PhonePe, Paytm, CRED), saved card autofill, and OTP-verified Cash on Delivery.
                </p>

                <div className="grid grid-cols-2 gap-4 pt-2 text-xs font-mono">
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <p className="text-emerald-600 font-bold text-base">36% Higher</p>
                    <p className="text-slate-500 mt-0.5">Checkout conversion rate</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <p className="text-blue-600 font-bold text-base">&lt; 4 Seconds</p>
                    <p className="text-slate-500 mt-0.5">Average checkout speed</p>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setShowApplyModal(true)}
                    className="px-6 py-3 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/25 transition-all cursor-pointer"
                  >
                    Enable 1-Tap Checkout on Your Store →
                  </button>
                </div>
              </div>

              {/* Checkout Simulator */}
              <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 space-y-5 shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-xs font-bold text-slate-950">Express 1-Tap Pay</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">256-Bit SSL Encrypted</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setActiveCheckoutTab('upi')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeCheckoutTab === 'upi'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    UPI / QR
                  </button>
                  <button
                    onClick={() => setActiveCheckoutTab('cards')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeCheckoutTab === 'cards'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Cards / EMI
                  </button>
                  <button
                    onClick={() => setActiveCheckoutTab('cod')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeCheckoutTab === 'cod'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Cash on Delivery
                  </button>
                </div>

                {activeCheckoutTab === 'upi' && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Supported UPI Apps:</span>
                      <span className="font-mono text-blue-600 font-bold">GPay • PhonePe • Paytm • CRED</span>
                    </div>
                    <div className="p-3 rounded-lg bg-white border border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-700">rohit@okhdfcbank</span>
                      <span className="text-emerald-600 font-bold">✓ Verified UPI ID</span>
                    </div>
                    <button className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md">
                      Pay ₹1,899 via UPI in 1-Click
                    </button>
                  </div>
                )}

                {activeCheckoutTab === 'cards' && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Visa, Mastercard, RuPay, Amex</span>
                      <span className="text-emerald-600 font-bold">No-Cost EMI</span>
                    </div>
                    <input
                      readOnly
                      value="4111 •••• •••• 9421 (HDFC Regalia)"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 font-mono text-slate-800 outline-none text-xs"
                    />
                    <button className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md">
                      Authorize Card Payment (₹1,899)
                    </button>
                  </div>
                )}

                {activeCheckoutTab === 'cod' && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Cash on Delivery</span>
                      <span className="text-amber-600 font-bold">OTP Verification Active</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      An instant SMS OTP will be sent to the buyer before dispatch to eliminate RTO fraud.
                    </p>
                    <button className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md">
                      Confirm Cash on Delivery Order
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>


        {/* ======================================================== */}
        {/* 6. LIVE BRANDS SHOWCASE */}
        {/* ======================================================== */}
        <section id="showcase" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-100">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-blue-600 font-bold">
                BUILT WITH ORVEXA
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-950 mt-2 font-display">
                Powering India&apos;s leading brands
              </h2>
            </div>

            <div className="flex gap-2">
              {['all', 'Fashion', 'Baby', 'Artisanal'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedBrandNiche(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    selectedBrandNiche === cat
                      ? 'bg-slate-900 text-white font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {filteredShowcase.map((brand, i) => (
              <div
                key={brand.id}
                className="orv-reveal orv-card-pop rounded-3xl bg-white border border-slate-200/90 overflow-hidden flex flex-col justify-between group"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div>
                  <div className="relative aspect-video overflow-hidden bg-slate-100">
                    <img
                      src={brand.image}
                      alt={brand.name}
                      className="orv-brand-img w-full h-full object-cover"
                    />
                    <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/90 backdrop-blur-md text-[10px] font-mono font-bold text-emerald-700 border border-slate-200 shadow-xs">
                      {brand.revenue}
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">{brand.category}</span>
                      <h4 className="text-xl font-bold text-slate-950 mt-0.5 font-display">{brand.name}</h4>
                      <p className="text-xs text-slate-500 font-medium">{brand.tagline}</p>
                    </div>

                    <p className="text-xs text-slate-600 italic leading-relaxed">
                      &quot;{brand.quote}&quot;
                    </p>
                    <p className="text-[11px] font-mono text-slate-400">— {brand.founder}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ======================================================== */}
        {/* 7. PRICING PLANS & ANNUAL SAVINGS (INR ₹) */}
        {/* ======================================================== */}
        <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-100">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-[11px] font-mono uppercase tracking-widest text-blue-600 font-bold">
              TRANSPARENT PRICING
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-950 mt-2 font-display">
              Plans that scale with your brand
            </h2>
            <p className="text-slate-600 text-sm sm:text-base mt-3">
              0% transaction commissions on every plan. Keep 100% of your earnings.
            </p>

            <div className="inline-flex items-center gap-3 p-1.5 rounded-full bg-slate-100 border border-slate-200 mt-8">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  billingCycle === 'monthly' ? 'bg-white text-slate-950 shadow-sm font-bold' : 'text-slate-600'
                }`}
              >
                Monthly billing
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  billingCycle === 'yearly' ? 'bg-blue-600 text-white shadow-sm font-bold' : 'text-slate-600'
                }`}
              >
                <span>Yearly billing</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full">
                  Save 25%
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {/* Starter */}
            <div className="p-8 rounded-3xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">STARTER</span>
                <h3 className="text-2xl font-bold text-slate-950 mt-1 font-display">Starter</h3>
                <p className="text-xs text-slate-500 mt-2">For creators and new brands launching their first store.</p>
                <div className="my-6">
                  <span className="text-4xl font-extrabold text-slate-950 font-display">
                    {billingCycle === 'yearly' ? '₹749' : '₹999'}
                  </span>
                  <span className="text-xs text-slate-500 font-mono"> / month</span>
                </div>
                <ul className="space-y-3 text-xs text-slate-700">
                  <li className="flex items-center gap-2">✓ <span>Dedicated Isolated Database Schema</span></li>
                  <li className="flex items-center gap-2">✓ <span>Free <code>brand.orvexatech.com</code> Subdomain</span></li>
                  <li className="flex items-center gap-2">✓ <span>Razorpay & UPI Integration</span></li>
                  <li className="flex items-center gap-2">✓ <span>Up to 100 Products</span></li>
                  <li className="flex items-center gap-2 font-bold text-emerald-600">✓ <span>0% Platform Transaction Fees</span></li>
                </ul>
              </div>
              <button
                onClick={() => setShowApplyModal(true)}
                className="w-full mt-8 py-3 rounded-full text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-900 transition-colors cursor-pointer"
              >
                Start Free 30-Day Trial
              </button>
            </div>

            {/* Growth Pro */}
            <div className="orv-price-pulse orv-card-pop p-8 rounded-3xl bg-white border-2 border-blue-600 shadow-2xl relative flex flex-col justify-between transform -translate-y-2">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-blue-600 text-white text-[10px] font-mono font-bold uppercase tracking-widest shadow-md">
                MOST POPULAR
              </div>
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-600">GROWTH</span>
                <h3 className="text-2xl font-bold text-slate-950 mt-1 font-display">Growth Pro</h3>
                <p className="text-xs text-slate-600 mt-2">For scaling direct-to-consumer brands scaling monthly sales.</p>
                <div className="my-6">
                  <span className="text-4xl font-extrabold text-slate-950 font-display">
                    {billingCycle === 'yearly' ? '₹1,899' : '₹2,499'}
                  </span>
                  <span className="text-xs text-slate-500 font-mono"> / month</span>
                </div>
                <ul className="space-y-3 text-xs text-slate-800 font-medium">
                  <li className="flex items-center gap-2 font-bold text-slate-950">✓ <span>Unlimited Products & Media</span></li>
                  <li className="flex items-center gap-2">✓ <span>Custom Domain Mapping (<code>yourbrand.in</code>) + SSL</span></li>
                  <li className="flex items-center gap-2">✓ <span>Seller Analytics & Coupon Campaigns</span></li>
                  <li className="flex items-center gap-2">✓ <span>Orvexa Magic AI Copy Assistant</span></li>
                  <li className="flex items-center gap-2">✓ <span>Automated GST Invoicing & WhatsApp Updates</span></li>
                  <li className="flex items-center gap-2 font-bold text-emerald-600">✓ <span>0% Platform Transaction Fees</span></li>
                </ul>
              </div>
              <button
                onClick={() => setShowApplyModal(true)}
                onMouseDown={addRipple}
                className="orv-ripple-host orv-cta-glow w-full mt-8 py-3 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
              >
                Start Free 30-Day Trial
              </button>
            </div>

            {/* Enterprise Plus */}
            <div className="p-8 rounded-3xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">SCALE</span>
                <h3 className="text-2xl font-bold text-slate-950 mt-1 font-display">Enterprise Plus</h3>
                <p className="text-xs text-slate-500 mt-2">For high-volume multi-brand enterprises requiring dedicated infrastructure.</p>
                <div className="my-6">
                  <span className="text-4xl font-extrabold text-slate-950 font-display">Custom</span>
                  <span className="text-xs text-slate-500 font-mono"> / SLA</span>
                </div>
                <ul className="space-y-3 text-xs text-slate-700">
                  <li className="flex items-center gap-2">✓ <span>Multiple Isolated Database Clusters</span></li>
                  <li className="flex items-center gap-2">✓ <span>Dedicated Super Admin Console</span></li>
                  <li className="flex items-center gap-2">✓ <span>Custom ERP / Warehouse Webhooks</span></li>
                  <li className="flex items-center gap-2">✓ <span>24/7 Dedicated Account Engineer</span></li>
                  <li className="flex items-center gap-2 font-bold text-emerald-600">✓ <span>0% Platform Transaction Fees</span></li>
                </ul>
              </div>
              <button
                onClick={() => setShowApplyModal(true)}
                className="w-full mt-8 py-3 rounded-full text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-900 transition-colors cursor-pointer"
              >
                Contact Enterprise Team
              </button>
            </div>
          </div>

          {/* Commission Guarantee Banner */}
          <div className="rounded-3xl bg-slate-900 text-white p-8 sm:p-10 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6 border border-slate-800">
            <div className="space-y-2 text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                ✓ 100% PROFIT RETENTION
              </div>
              <h3 className="text-xl sm:text-2xl font-bold font-display">Never pay transaction commissions again</h3>
              <p className="text-xs text-slate-400 max-w-xl">
                Unlike platforms taking up to 2% from every sale you make, Orvexa charges only a transparent flat subscription fee.
              </p>
            </div>
            <a
              href="#savings-calculator"
              className="px-6 py-3 rounded-full text-xs font-bold bg-white text-slate-950 hover:bg-slate-100 transition-all shadow-md shrink-0 cursor-pointer"
            >
              Recalculate Savings ↑
            </a>
          </div>
        </section>

        {/* ======================================================== */}
        {/* 8. FAQ ACCORDION */}
        {/* ======================================================== */}
        <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-slate-100">
          <div className="orv-reveal text-center mb-12">
            <span className="text-[11px] font-mono uppercase tracking-widest text-blue-600 font-bold">
              FREQUENTLY ASKED QUESTIONS
            </span>
            <h2 className="text-3xl font-extrabold text-slate-950 mt-2 font-display">Everything you need to know</h2>
          </div>

          <div className="space-y-3">
            {[
              {
                q: 'What makes Orvexa different from standard e-commerce platforms?',
                a: 'Unlike legacy platforms where all stores share a single database, Orvexa provisions a 100% isolated MongoDB database schema for each store. You get zero shared table risks, full GDPR compliance, 0% transaction commissions, and lightning-fast sub-200ms page load speeds.',
              },
              {
                q: 'Can I connect my own custom domain (e.g., yourbrand.in / yourbrand.com)?',
                a: "Yes. Every store automatically gets a free subdomain (yourbrand.orvexatech.com), and you can connect any custom domain with automated Let's Encrypt SSL certificates from your dashboard.",
              },
              {
                q: 'How does Indian payment processing and COD work?',
                a: 'Orvexa has native integration with Razorpay, UPI QR (GPay, PhonePe, Paytm), NetBanking, and Cash on Delivery with SMS OTP verification to prevent fake orders.',
              },
              {
                q: 'How long does it take to get my store up and running?',
                a: 'Once your application is submitted, our automated engine provisions your database, tenant folder, initial catalog, and theme in under 10 seconds.',
              },
              {
                q: 'Is there a free trial? What happens when it ends?',
                a: 'Yes — every new store gets a full 30-day free trial with no credit card required. At the end of the trial, you can choose a plan or your store enters a read-only grace period for 7 days.',
              },
            ].map((faq, idx) => (
              <div
                key={idx}
                className={`orv-reveal rounded-2xl bg-white border overflow-hidden shadow-xs transition-all duration-300 ${
                  activeFaq === idx ? 'orv-faq-open-state border-blue-200 shadow-md shadow-blue-500/5' : 'border-slate-200'
                }`}
                style={{ transitionDelay: `${idx * 60}ms` }}
              >
                <button
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between text-sm font-semibold text-slate-900 cursor-pointer hover:bg-slate-50/80 transition-colors group"
                >
                  <span className={activeFaq === idx ? 'text-blue-700' : ''}>{faq.q}</span>
                  <span className={`orv-faq-icon w-7 h-7 rounded-full flex items-center justify-center text-base font-bold shrink-0 ml-4 transition-all ${
                    activeFaq === idx ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600'
                  }`}>
                    +
                  </span>
                </button>
                <div className={`orv-faq-answer ${activeFaq === idx ? 'orv-faq-open' : ''}`}>
                  <div className="px-6 pb-5 text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                    {faq.a}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ======================================================== */}
      {/* 9. ONBOARDING MODAL (CLEAN LIGHT THEME) */}
      {/* ======================================================== */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 orv-fade-in">
          <div className="orv-scale-in bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 sm:p-8 text-slate-900 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowApplyModal(false)
                setFormSuccess(null)
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-2"
            >
              ✕
            </button>

            {formSuccess ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-3xl mx-auto">
                  🎉
                </div>
                <h3 className="text-2xl font-bold text-slate-950 font-display">Application Received!</h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  Your store application for <strong className="text-slate-950">{appName}</strong> has been submitted to the Super Admin review queue with requested subdomain:
                </p>
                <div className="p-3 rounded-xl bg-slate-50 border border-blue-200 text-xs font-mono text-blue-600 font-bold">
                  https://{formSuccess}.orvexatech.com
                </div>
                <p className="text-[11px] text-slate-500">
                  We will provision your isolated database schema and client directory. Confirmation email sent to <span className="text-slate-900 font-mono">{appEmail}</span>.
                </p>
                <div className="pt-4">
                  <button
                    onClick={() => {
                      setShowApplyModal(false)
                      setFormSuccess(null)
                    }}
                    className="px-6 py-2.5 rounded-full bg-blue-600 text-white font-bold text-xs shadow-md"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-blue-600 font-bold">
                    30-DAY FREE TRIAL ONBOARDING
                  </span>
                  <h3 className="text-2xl font-bold text-slate-950 mt-1 font-display">Start your online store</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    No credit card required. Fill out the details below to initialize your isolated store cluster.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Brand / Store Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={appName}
                      onChange={(e) => handleBrandNameChange(e.target.value)}
                      placeholder="e.g. Aurelia Lifestyle"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Desired Subdomain *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={appSlug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                        placeholder="aurelia"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-mono text-blue-600 placeholder-slate-400 outline-none pr-28 focus:border-blue-600 focus:bg-white"
                      />
                      <span className="absolute right-3 top-2.5 text-[10px] font-mono text-slate-400 pointer-events-none">
                        .orvexatech.com
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Founder / Owner Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={appOwner}
                      onChange={(e) => setAppOwner(e.target.value)}
                      placeholder="e.g. Rohit Sharma"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Business Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={appEmail}
                      onChange={(e) => setAppEmail(e.target.value)}
                      placeholder="founder@yourbrand.com"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      WhatsApp / Phone
                    </label>
                    <input
                      type="tel"
                      value={appPhone}
                      onChange={(e) => setAppPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Product Category
                    </label>
                    <select
                      value={appNiche}
                      onChange={(e) => setAppNiche(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-900 outline-none cursor-pointer focus:border-blue-600 focus:bg-white"
                    >
                      <option value="Fashion & Apparel">Fashion & Apparel</option>
                      <option value="Jewelry & Accessories">Jewelry & Accessories</option>
                      <option value="Cosmetics & Skincare">Cosmetics & Skincare</option>
                      <option value="Home & Artisan Decor">Home & Artisan Decor</option>
                      <option value="Organic Food & Wellness">Organic Food & Wellness</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={formSubmitting || slugStatus === 'taken'}
                  onMouseDown={addRipple}
                  className="orv-ripple-host orv-cta-glow w-full mt-3 py-3.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 transition-all cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting ? 'Creating your store...' : 'Complete & Launch 30-Day Free Trial →'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 10. CLEAN LIGHT MEGA FOOTER */}
      {/* ======================================================== */}
      <footer className="border-t border-slate-200 bg-slate-50 py-16 px-4 sm:px-6 lg:px-8 relative z-10 text-xs text-slate-600">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-sm">
                O
              </div>
              <span className="text-base font-bold text-slate-950">Orvexa Cloud</span>
            </div>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
              The autonomous commerce platform empowering Indian merchants with custom storefronts, dedicated databases, and 0% commission fees.
            </p>
            <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-700 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>India Cluster (ap-south-1) • 100% Operational</span>
            </div>
          </div>

          <div>
            <p className="font-bold text-slate-950 mb-3 text-xs uppercase tracking-wider">Solutions</p>
            <ul className="space-y-2 text-xs">
              <li><a href="#what-we-provide" className="hover:text-blue-600 transition-colors">Storefront Engine</a></li>
              <li><a href="#checkout" className="hover:text-blue-600 transition-colors">1-Tap UPI Checkout</a></li>
              <li><a href="#showcase" className="hover:text-blue-600 transition-colors">Live Brand Demos</a></li>
            </ul>
          </div>

          <div>
            <p className="font-bold text-slate-950 mb-3 text-xs uppercase tracking-wider">Platform</p>
            <ul className="space-y-2 text-xs">
              <li><a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing & Plans</a></li>
              <li><a href="#what-we-provide" className="hover:text-blue-600 transition-colors">Enterprise Architecture</a></li>
              <li><a href="#faq" className="hover:text-blue-600 transition-colors">FAQ & Support</a></li>
            </ul>
          </div>

          <div>
            <p className="font-bold text-slate-950 mb-3 text-xs uppercase tracking-wider">Region</p>
            <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1 text-[11px] font-mono shadow-xs">
              <p className="text-slate-950 font-bold">🇮🇳 India (INR ₹)</p>
              <p className="text-slate-500">GST Invoice Ready</p>
              <p className="text-blue-600 font-semibold">Razorpay & UPI Native</p>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-8 border-t border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-[11px] text-slate-500">
          <div className="space-y-3">
            <ComplianceFooterLinks onOpenComplianceDoc={handleOpenCompliance} theme="light" />
            <p>© {new Date().getFullYear()} Orvexa Tech Private Limited. All rights reserved.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <a href="#what-we-provide" className="hover:text-slate-800 transition-colors">Platform Architecture</a>
            <a href="#pricing" className="hover:text-slate-800 transition-colors">Enterprise SLA</a>
            <button onClick={() => handleOpenCompliance('gdpr')} className="hover:text-blue-600 text-left cursor-pointer">
              DPA Agreement
            </button>
          </div>
        </div>
      </footer>

      {/* Orvexa Tech Trust, GDPR, DPDP & Legal Compliance Modal */}
      <LegalComplianceModal
        isOpen={complianceModalOpen}
        initialTab={complianceDoc}
        onClose={() => setComplianceModalOpen(false)}
      />
    </div>
  )
}
