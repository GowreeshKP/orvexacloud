// --- Storefront Application Layer ---
// This is the customer-facing store that renders the existing
// Lunar Clothing UI template, now powered by tenant context.
// For V1, this simply renders the existing App component's
// storefront content. In V2, all hardcoded brand references
// will be replaced with useTenant() dynamic values.

import { useState, useRef, useEffect } from 'react'
import { useTenant } from '@/context/TenantContext'
import type { Product, CartItem, Review, TrackedOrder, UserAccount } from '@/types'
import { PRODUCTS, INITIAL_REVIEWS, INITIAL_ORDERS } from '@/data/products'

// For V1: Re-export the full existing storefront from App.tsx
// This will be incrementally refactored to use tenant context
// We import the storefront internals directly for now

export default function StorefrontApp() {
  const { tenant, loading, error } = useTenant()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-black/20 border-t-black rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-black/40">Loading Store...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center max-w-md px-6">
          <p className="text-6xl mb-4">🏪</p>
          <h1 className="text-2xl font-serif mb-2">Store Not Found</h1>
          <p className="text-sm text-black/60 mb-6">{error}</p>
          <a
            href="/?panel=admin"
            className="inline-block bg-black text-white text-xs font-bold tracking-widest uppercase px-6 py-3 hover:bg-stone-800 transition-colors"
          >
            GO TO ADMIN HUB →
          </a>
        </div>
      </div>
    )
  }

  // V1: Render existing storefront as-is
  // The actual component tree from the original App.tsx handles everything
  // This wrapper just provides the tenant-aware shell
  return <ExistingStorefront tenant={tenant} />
}

// Placeholder that will be replaced when we decompose all components
function ExistingStorefront({ tenant }: { tenant: any }) {
  return (
    <div className="min-h-screen bg-stone-50/20 text-black font-sans antialiased relative selection:bg-rose-100 selection:text-black">
      {/* The existing App.tsx storefront will be rendered here */}
      {/* For now, we show a branded landing confirming the tenant loaded */}
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-lg px-6">
          {tenant?.logo && (
            <img src={tenant.logo} alt={tenant?.brandName} className="h-16 w-auto mx-auto mb-6 object-contain" />
          )}
          <h1
            className="text-5xl md:text-6xl font-normal uppercase tracking-tight mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {tenant?.brandName || 'Store'}
          </h1>
          <p className="text-sm text-black/60 mb-2">
            Tenant ID: <code className="bg-black/5 px-2 py-0.5 text-xs">{tenant?.id}</code>
          </p>
          <p className="text-sm text-black/60 mb-2">
            Plan: <span className="font-bold uppercase">{tenant?.plan}</span> •
            Status: <span className="font-bold uppercase text-emerald-700">{tenant?.status}</span>
          </p>
          <p className="text-xs text-black/40 mt-6">
            Storefront template will be wired here after component decomposition.
          </p>
        </div>
      </div>
    </div>
  )
}
