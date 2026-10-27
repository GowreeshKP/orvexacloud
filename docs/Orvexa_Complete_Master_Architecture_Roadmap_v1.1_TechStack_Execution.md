# ORVEXA TECH MULTI-STORE PLATFORM
# Document 2: Complete Master Architecture Roadmap & TechStack Execution
**Document Reference:** `ORV-ENG-ROADMAP-v1.1`  
**Version:** 1.1 (Production Baseline)  
**Classification:** Enterprise Engineering Blueprint  
**Lead Architect:** Gowreesh Periyasamy  

---

## 1. System Vision & Overview

**Orvexa Tech** is an enterprise-grade multi-tenant e-commerce platform designed to run multiple brand storefronts with isolated data stores, unified platform governance, high-conversion shopping experiences, and zero-downtime scalability.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       ORVEXA TECH ECOSYSTEM                                     │
├────────────────────────────────┬────────────────────────────────┬───────────────────────────────┤
│        PUBLIC MARKETING        │       MERCHANT DASHBOARD       │       BRAND STOREFRONTS       │
│        & SUPER ADMIN           │       (app.orvexatech.com)     │     ({slug}.orvexatech.com)   │
│     (admin.orvexatech.com)     │                                │                               │
├────────────────────────────────┼────────────────────────────────┼───────────────────────────────┤
│ • SaaS Marketing Landing Page  │ • Product Catalog & SKUs       │ • Lunar (Modern Activewear)   │
│ • Client Acquisition Funnel    │ • Inventory & Low-Stock Alerts │ • BloomWeave (Floral Organic) │
│ • ROI & Pricing Calculator     │ • Order Pipeline & AWB Ship    │ • KhadiStudio (Artisan Khadi) │
│ • Tenant Review & Provisioning │ • Live Brand Theme Customizer  │ • SilkHaus (Luxury Silk)      │
│ • MRR / Invoicing Platform     │ • Dedicated MongoDB Telemetry  │ • Cart, Checkout, Live Track  │
└────────────────────────────────┴────────────────────────────────┴───────────────────────────────┘
```

---

## 2. Complete Technical Stack

### 2.1 Client Application Tier (Frontend)
| Technology / Library | Version | Role in Architecture |
| :--- | :---: | :--- |
| **React** | 19.x | Component lifecycle, concurrent rendering, and UI dispatching |
| **TypeScript** | 5.7.x | Strict type contracts across tenants, products, and API models |
| **Vite** | 8.x | High-speed ESM build system, HMR, and production bundler |
| **Tailwind CSS** | 4.x | Utility-first styling with `@tailwindcss/vite` integration |
| **Lucide React** | Latest | Lightweight icon system across admin, dashboard, and storefront |
| **Context API** | React Native | `TenantContext` (multi-tenant state) & `AuthContext` (JWT sessions) |

### 2.2 Application Server Tier (Backend & APIs)
| Technology / Library | Version | Role in Architecture |
| :--- | :---: | :--- |
| **Node.js** | 20+ LTS | Asynchronous runtime environment |
| **Express.js** | 4.19+ | REST API routing, rate limiting, and HTTP middleware pipeline |
| **MongoDB Atlas** | 7.x | Cloud document database with isolated tenant namespaces |
| **Mongoose** | 8.x | Dynamic multi-database connection pooling and schema validation |
| **JWT (jsonwebtoken)** | 9.x | Dual-token authentication (Access Token + Refresh Token rotation)|
| **BcryptJS** | 2.4.x | Cryptographic password hashing (12 salt rounds) |
| **Vercel Serverless** | Latest | Microsecond-latency API edge deployment bridge |

---

## 3. Dynamic Multi-Tenant Routing Engine

The routing engine dynamically determines which application layer to render based on hostname inspection in production and query parameter fallback in development:

```
                                  ┌───────────────────────────┐
                                  │   INCOMING HTTP REQUEST   │
                                  └─────────────┬─────────────┘
                                                │
                                  ┌─────────────┴─────────────┐
                                  │ Extract Hostname / Query  │
                                  └─────────────┬─────────────┘
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         │                                      │                                      │
         ▼                                      ▼                                      ▼
[ admin.orvexatech.com ]              [ app.orvexatech.com ]              [ {slug}.orvexatech.com ]
  or ?panel=admin                       or ?panel=dashboard                 or ?tenant={slug}
         │                                      │                                      │
         ▼                                      ▼                                      ▼
┌──────────────────────────┐          ┌──────────────────────────┐          ┌──────────────────────────┐
│     AdminApp.tsx         │          │    DashboardApp.tsx      │          │   StorefrontApp.tsx      │
│ (Platform Marketing &    │          │  (Merchant Seller        │          │ (Customer Shopping       │
│  Super Admin Console)    │          │   Command Center)        │          │  Experience & Cart)      │
└──────────────────────────┘          └──────────────────────────┘          └──────────────────────────┘
```

---

## 4. Frontend Component & Layer Architecture

- **Root Dispatcher ([`src/App.tsx`](file:///c:/Users/Black/Downloads/lunar%20final/src/App.tsx)):** Coordinates global state, drawer overlays, authentication modals, and high-level routing.
- **Platform Layer ([`src/layers/AdminApp.tsx`](file:///c:/Users/Black/Downloads/lunar%20final/src/layers/AdminApp.tsx)):**
  - Public marketing website ([`PlatformWebsite.tsx`](file:///c:/Users/Black/Downloads/lunar%20final/src/components/platform/PlatformWebsite.tsx)) with dynamic pricing calculator, client onboarding funnel, and platform audit logs ([`PlatformAuditLogs.tsx`](file:///c:/Users/Black/Downloads/lunar%20final/src/components/platform/PlatformAuditLogs.tsx)).
  - Admin governance view with tenant application approvals, MRR analytics, and domain manager.
- **Merchant Layer ([`src/layers/DashboardApp.tsx`](file:///c:/Users/Black/Downloads/lunar%20final/src/layers/DashboardApp.tsx)):**
  - Store overview, catalog editor, inventory batches, order dispatcher, and live customizer.
- **Storefront Layer ([`src/layers/StorefrontApp.tsx`](file:///c:/Users/Black/Downloads/lunar%20final/src/layers/StorefrontApp.tsx)):**
  - Hero banners, faceted product search, quick-view drawer, cart drawer, checkout modal, and order tracking.

---

## 5. Development Roadmap & Execution Milestones

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                             ENGINEERING EXECUTION ROADMAP                             │
├───────────────┬─────────────────────────────────────────────────────────┬─────────────┤
│ Phase         │ Deliverables & Technical Scope                          │ Status      │
├───────────────┼─────────────────────────────────────────────────────────┼─────────────┤
│ **Phase 1**   │ Multi-tenant client foundation, Tailwind v4, presets    │ ✅ Completed│
│ **Phase 2**   │ Interactive storefront (Cart, Checkout, Live Tracking)  │ ✅ Completed│
│ **Phase 3**   │ Seller Dashboard (Catalog CRUD, Orders, Live Theme)     │ ✅ Completed│
│ **Phase 4**   │ Super Admin Portal & Light SaaS Marketing Landing Page  │ ✅ Completed│
│ **Phase 5**   │ Multi-tenant MongoDB isolation & Vercel serverless API  │ ✅ Completed│
│ **Phase 6**   │ Logo upload engine, fallback rendering, and polish      │ ✅ Completed│
└───────────────┴─────────────────────────────────────────────────────────┴─────────────┘
```

---

**Architect:** Gowreesh Periyasamy  
**Orvexa Tech Engineering Group**
