# ORVEXA TECH MULTI-STORE PLATFORM
## Comprehensive Project Master Documentation

**Project Name:** Orvexa Tech Enterprise Multi-Tenant E-Commerce Platform  
**Document Type:** Full System Architecture, Feature Inventory & Implementation Report  
**Version:** 2.0 (Production-Ready)  
**Lead Architect & Developer:** Gowreesh Periyasamy  

---

## 1. Executive Summary & Vision

**Orvexa Tech** is a multi-tenant SaaS e-commerce infrastructure that enables brands and merchants to launch, customize, and scale storefronts with database isolation, customizable branding, order fulfillment, and GDPR-compliant architecture.

The platform provides:
1. **Public Marketing & Lead Acquisition Engine**: Enterprise landing page with interactive platform demo, dynamic ROI calculator, client onboarding funnel, and multi-tenant audit logs.
2. **Platform Super Admin Governance Portal**: Master oversight of tenants, store provisioning, subscription billing (MRR/ARR), domain routing, and platform health.
3. **Dedicated Merchant / Seller Dashboards**: Per-store command centers for catalog management, inventory tracking, order processing, shipping/AWB generation, and live branding/theme customizers.
4. **Multi-Brand Consumer Storefronts**: Shopping storefronts with real-time faceted search, product quick-view drawers, animated cart drawers, multi-step checkout, and live order tracking.
5. **Multi-Tenant Database Isolation**: MongoDB architecture separating platform metadata (`orvexa_platform_master`) from tenant databases (`orvexa_tenant_{slug}`).
6. **Strict GDPR & PII Data Protection**: Architectural isolation ensuring Super Admins cannot access consumer personal data, payment tokens, or proprietary product catalogs.

---

## 2. Technology Stack & Infrastructure

### 2.1 Frontend
- **Framework:** React 19 with TypeScript 5.7
- **Bundler & Dev Server:** Vite 8 (`@vitejs/plugin-react`)
- **Styling:** Tailwind CSS v4 with `@tailwindcss/vite` and CSS custom property design tokens
- **Icons:** Lucide React (`lucide-react`)
- **State & Context:** React Context (`TenantContext`, `AuthContext`) + LocalStorage state persistence
- **Animation & Effects:** Custom CSS keyframes, glassmorphic filters, and interactive ambient particle canvases

### 2.2 Backend & API
- **Runtime:** Node.js (TypeScript) + Express.js
- **Database & ODM:** MongoDB Atlas + Mongoose 8 (multi-connection pool manager)
- **Authentication:** JWT (JSON Web Tokens) with dual-token architecture (Access Token + Refresh Token rotation) and bcryptjs password hashing
- **Security:** Helmet, CORS, Express Rate Limit, RBAC middleware, and tenant-resolver middleware
- **Serverless Hosting:** Vercel Serverless Function adapter (`/api/index.ts` routing)

---

## 3. High-Level System Architecture

```
                                  ┌───────────────────────────────────┐
                                  │      CLIENT ENTRY & ROUTING       │
                                  │ (Subdomain, Custom Domain, Query) │
                                  └─────────────────┬─────────────────┘
                                                    │
             ┌──────────────────────────────────────┼──────────────────────────────────────┐
             │                                      │                                      │
             ▼                                      ▼                                      ▼
┌──────────────────────────┐          ┌──────────────────────────┐          ┌──────────────────────────┐
│   SUPER ADMIN LAYER      │          │   MERCHANT DASHBOARD     │          │    PUBLIC STOREFRONTS    │
│  admin.orvexatech.com    │          │    app.orvexatech.com    │          │  {slug}.orvexatech.com   │
│   (?panel=admin)         │          │   (?panel=dashboard)     │          │    (?tenant={slug})      │
├──────────────────────────┤          ├──────────────────────────┤          ├──────────────────────────┤
│ • Marketing & Leads      │          │ • Catalog & SKU Editor   │          │ • Lunar (Modern Shapewear│
│ • Tenant Applications    │          │ • Inventory & Stocks     │          │ • BloomWeave (Floral)    │
│ • Tenant Provisioning    │          │ • Order Fulfillment & AWB│          │ • KhadiStudio (Artisan)  │
│ • Subscription MRR / ARR │          │ • Live Customizer & Logo │          │ • SilkHaus (Luxury Silk) │
│ • Audit Logs & Telemetry │          │ • Isolated DB Status     │          │ • Cart, Checkout, Track  │
└────────────┬─────────────┘          └────────────┬─────────────┘          └────────────┬─────────────┘
             │                                     │                                     │
             ▼                                     ▼                                     ▼
┌──────────────────────────┐          ┌────────────────────────────────────────────────────────┐
│  PLATFORM MASTER API     │          │                  TENANT REST API                       │
│  /api/v1/admin/*         │          │                  /api/v1/tenant/*                      │
└────────────┬─────────────┘          └────────────────────────────┬───────────────────────────┘
             │                                                     │
             ▼                                                     ▼
┌──────────────────────────┐          ┌────────────────────────────────────────────────────────┐
│    MASTER DATABASE       │          │             ISOLATED TENANT DATABASES                  │
│ orvexa_platform_master   │          │ orvexa_tenant_lunar | orvexa_tenant_silkhaus | ...     │
├──────────────────────────┤          ├────────────────────────────────────────────────────────┤
│ • Tenants & Subscriptions│          │ • Products, Variations, SKUs                           │
│ • Tenant Applications    │          │ • Orders, Shipments, Customer Records                  │
│ • Master Admin Auth      │          │ • Customer Reviews & UGC                               │
│ • Platform Audit Logs    │          │ • Storefront Branding & Configuration                  │
└──────────────────────────┘          └────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Feature Breakdown

### 4.1 Layer 1: Super Admin & Marketing Website
1. **Public Marketing Website (`PlatformWebsite.tsx`):**
   - Clean, light-themed SaaS landing page with hero banner and feature showcase.
   - Interactive ROI & Revenue Calculator for prospective brands.
   - Live multi-tenant product visualizer showcasing multi-brand scalability.
   - Tenant onboarding application form with instant validation.
   - Platform Audit Log viewer showing system-level health, uptime, and security events.
2. **Super Admin Management Console (`AdminApp.tsx`):**
   - **Platform Overview:** Total platform MRR, active stores count, pending applications, and aggregated GMV index.
   - **Applications Review:** Onboarding queue to review, approve with one-click database provisioning, or reject applicant brands.
   - **Tenant Directory:** Complete store registry with status controls (Active, Pending, Suspended), subscription tier details, and `.env` template generation.
   - **Billing & Subscriptions:** Tier management (Starter, Pro, Enterprise), recurring billing records, and payout schedules.
   - **Domain Manager:** SSL statuses, DNS CNAME verification, and domain mapping engine.

### 4.2 Layer 2: Merchant / Seller Dashboard (`DashboardApp.tsx`)
1. **Store Overview:** Real-time revenue charts, order count stats, and best-performing SKUs for the specific store.
2. **Product Catalog & Inventory Management:**
   - Full CRUD for products, prices, compare-at pricing, categories, sculpt levels, and tags.
   - Variant management (Sizes: XS to 3XL; Colors with hex codes).
   - Stock level controls with low-stock threshold alerts.
3. **Order Fulfillment & Logistics:**
   - Real-time order stream with status management (Pending, Processing, Shipped, Delivered, Cancelled).
   - Airway Bill (AWB) generation and tracking number assignment.
   - Courier partner integration triggers (BlueDart, Delhivery, DTDC, FedEx).
4. **Live Storefront & Theme Customizer:**
   - Visual color picker for primary, secondary, and accent colors.
   - Font family selector (Modern Sans, Elegant Serif, Minimalist Mono).
   - Custom Logo upload with immediate local preview and cloud storage sync.
   - Hero banner headline, subtext, and call-to-action customizer.
   - Announcement bar message and toggle controls.
   - Instant "Save & Publish" with `localStorage` persistence and cross-layer sync.
5. **Database & System Health:**
   - Real-time telemetry for the tenant's isolated MongoDB database.
   - Collection document counts, ping latency, and connection pool state.

### 4.3 Layer 3: Consumer Storefronts (`StorefrontApp.tsx` & `App.tsx`)
1. **Multi-Brand Tenant Presets:**
   - **Lunar:** Modern activewear & shapewear with dark luxury aesthetics.
   - **BloomWeave:** Floral organic textiles with natural pastel palette.
   - **KhadiStudio:** Handcrafted heritage apparel with earthy artisan tones.
   - **SilkHaus:** High-fashion luxury mulberry silks with gold/black styling.
2. **Shopping Experience & UI/UX:**
   - **Mega Menu Navigation:** Category browsing with hover previews and featured promotions.
   - **Faceted Filters & Instant Search:** Client-side filtering by category, size, color, price range, and customer ratings.
   - **Product Detail Drawer:** High-resolution zoomable image carousel, size guide, fabric details, stock indicator, and customer reviews.
   - **Slide-Over Cart Drawer:** Real-time subtotal, free shipping progress indicator, promo code validation, and quantity steppers.
   - **Accordion Checkout Drawer:** Contact information, shipping address auto-fill, and simulated multi-channel payment gateway (Cards, UPI, Net Banking, COD).
   - **Live Order Tracking Portal:** Visual chronological progress bar, dispatch timestamp, carrier info, and live AWB status lookup.

---

## 5. Security, RBAC & GDPR Compliance

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 GDPR COMPLIANCE BOUNDARY                               │
├────────────────────────────────────────────┬───────────────────────────────────────────┤
│            SUPER ADMIN SCOPE               │           TENANT MERCHANT SCOPE           │
│       (Infrastructure & Governance)        │         (Commercial & Store Data)         │
├────────────────────────────────────────────┼───────────────────────────────────────────┤
│ • Tenant Account Metadata                  │ • Customer Names, Emails, Phone Numbers   │
│ • Subscription Invoicing & MRR             │ • Shipping & Delivery Residential Addrs   │
│ • Domain Mapping & DNS Records             │ • Itemized Orders, Baskets, & Payments    │
│ • Server Uptime & Audit Logs               │ • Product Catalog, Margins, & Stock Costs │
│ ❌ No Customer PII Access                  │ • Customer Reviews & Direct Messages      │
└────────────────────────────────────────────┴───────────────────────────────────────────┘
```

1. **GDPR Data Minimization (Article 5):** The Super Admin portal has zero database models, API routes, or React hooks that fetch customer PII or line-item transaction data.
2. **Database Isolation:** Tenant operations strictly use dedicated MongoDB database handles (`orvexa_tenant_{slug}`). A compromised tenant token cannot access another tenant's records.
3. **Role-Based Access Control (RBAC):**
   - `SUPER_ADMIN`: Access to master platform management only.
   - `MERCHANT_ADMIN`: Full access to the merchant's own store catalog, orders, and branding.
   - `STORE_OPERATOR`: Scoped access for packaging, shipping, and inventory adjustments.
   - `CUSTOMER`: Public shopping, self-service account, and personal order tracking.
4. **JWT Dual-Token Rotation:** Short-lived access tokens (15 minutes) paired with secure refresh tokens stored in HTTP-only cookies / database revocation lists.

---

## 6. Project Directory & File Structure

```
lunar-final/
├── api/                             # Vercel Serverless Function entrypoints
│   └── index.ts                     # Serverless Express bridge
├── docs/                            # Architecture and compliance documentation
│   ├── PROJECT_COMPLETE_DOCUMENTATION.md
│   └── SYSTEM_TRANSITIONS_HIERARCHY_GDPR.md
├── server/                          # Backend Node.js / Express application
│   └── src/
│       ├── config/                  # Environment and database configs
│       ├── db/                      # Multi-tenant connection pool manager
│       ├── middleware/              # Auth, tenant resolver, and security
│       ├── models/
│       │   ├── master/              # AdminUser, Tenant, Application, AuditLog
│       │   └── tenant/              # Product, Order, Review
│       ├── routes/                  # Admin and Tenant API routes
│       └── services/                # Token, email, and logging services
├── src/                             # Frontend React 19 application
│   ├── components/
│   │   ├── auth/                    # Merchant & Customer login/register
│   │   ├── platform/                # Marketing website & Audit log components
│   │   └── store/                   # Product card, Cart, Checkout, Tracking
│   ├── context/
│   │   ├── AuthContext.tsx          # JWT authentication and user session
│   │   └── TenantContext.tsx        # Multi-tenant resolution & theme provider
│   ├── data/                        # Mock data, products, and tenant presets
│   ├── hooks/                       # Custom hooks for state and API calls
│   ├── layers/                      # Top-level application layers
│   │   ├── AdminApp.tsx             # Super Admin Portal
│   │   ├── DashboardApp.tsx         # Merchant Dashboard
│   │   └── StorefrontApp.tsx        # Consumer Storefront
│   ├── tenants/                     # Tenant configurations (Lunar, Bloom, Khadi, Silk)
│   ├── App.tsx                      # Root component & routing dispatcher
│   ├── index.css                    # Tailwind CSS v4 & custom design tokens
│   └── main.tsx                     # React application entrypoint
├── vercel.json                      # Vercel deployment & SPA rewrite routing
└── vite.config.ts                   # Vite configuration with React and Tailwind
```

---

## 7. Execution & Deployment Guide

### 7.1 Local Development
```bash
# 1. Install dependencies
pnpm install

# 2. Start frontend dev server
pnpm dev

# 3. Start backend API server (optional for full MongoDB persistence)
cd server && pnpm install && pnpm dev
```

### 7.2 Layer Navigation (URL Parameters)
- **Marketing & Admin Portal:** `http://localhost:5173/?panel=admin`
- **Merchant Seller Dashboard:** `http://localhost:5173/?panel=dashboard`
- **Storefront (Lunar):** `http://localhost:5173/?tenant=lunar`
- **Storefront (BloomWeave):** `http://localhost:5173/?tenant=bloomweave`
- **Storefront (KhadiStudio):** `http://localhost:5173/?tenant=khadistudio`
- **Storefront (SilkHaus):** `http://localhost:5173/?tenant=silkhaus`

### 7.3 Production Deployment (Vercel)
- Configured via `vercel.json` with SPA fallback rewrites.
- Static assets (`/assets/*`, `.svg`, `.png`, `.jpg`) are exempted from rewrites to prevent asset loading issues.

---

## 8. Summary of Completed Deliverables

| Area | Status | Key Deliverable |
| :--- | :---: | :--- |
| **Marketing Website** | ✅ Completed | Light-theme landing page with live interactive ROI calculator & CRM onboarding funnel |
| **Super Admin Portal** | ✅ Completed | Tenant lifecycle management, one-click DB provisioning, MRR/ARR billing overview |
| **Merchant Dashboard** | ✅ Completed | Product catalog CRUD, inventory tracking, order fulfillment, AWB generator & live customizer |
| **Logo & Brand Customizer**| ✅ Completed | Live logo upload, real-time preview, theme color pickers, and persistent sync to storefront |
| **Public Storefronts** | ✅ Completed | 4 fully styled brand tenants, faceted search, animated cart, checkout & live order tracking |
| **Database Architecture** | ✅ Completed | Multi-tenant isolated MongoDB connection manager with Master / Tenant DB segregation |
| **GDPR Compliance** | ✅ Completed | Strict isolation ensuring zero consumer PII or raw transaction leakage to Super Admins |
| **Vercel & Build Config** | ✅ Completed | Static asset routing, pnpm lockfile synchronization, and serverless Express endpoints |
