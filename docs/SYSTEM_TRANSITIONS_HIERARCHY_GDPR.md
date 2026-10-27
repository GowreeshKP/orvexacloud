# ORVEXA TECH MULTI-STORE PLATFORM
## System Architecture, Site Transitions, Role Hierarchy & GDPR Compliance Specification

**Document Reference:** `DOC-ORV-ARCH-GDPR-2026-V1`  
**Target Audience:** Development Team, Engineering Leads, Product Managers, Compliance Officers  
**Lead Architect:** Gowreesh Periyasamy  
**Date:** September 2026  
**Status:** Approved for Implementation  

---

## 1. Executive Summary & Purpose

The Orvexa Tech Multi-Store SaaS Platform provides an enterprise multi-tenant e-commerce ecosystem. To scale securely, comply with international data privacy laws (notably the **EU General Data Protection Regulation / GDPR** and regional data protection frameworks), and ensure seamless user experiences, the platform requires strict demarcation of:
1. **Site Transitions & Navigation Architecture**: How users, merchants, and platform operators move between application layers and views without state leakage or visual jarring.
2. **System Role Hierarchy**: Clear separation of responsibilities, permissions, and session lifecycles.
3. **Strict Super Admin Scope & Data Isolation**: Strict prevention of platform operators from accessing tenant-specific confidential commercial data (products, pricing strategies, inventory) and consumer **Personally Identifiable Information (PII)** and payment instruments.

---

## 2. Role Hierarchy & Access Control Matrix (RBAC)

```
                       ┌─────────────────────────────────────────┐
                       │  LEVEL 1: PLATFORM SUPER ADMINISTRATOR   │
                       │  (Orvexa Infrastructure & Governance)    │
                       └────────────────────┬────────────────────┘
                                            │
                                            ▼
                       ┌─────────────────────────────────────────┐
                       │   LEVEL 2: TENANT / STORE MERCHANT      │
                       │   (Brand Owner / Store Administrator)   │
                       └────────────────────┬────────────────────┘
                                            │
                                            ▼
                       ┌─────────────────────────────────────────┐
                       │   LEVEL 3: STORE OPERATOR / STAFF       │
                       │   (Order Fulfillment & Inventory Clerk) │
                       └────────────────────┬────────────────────┘
                                            │
                                            ▼
                       ┌─────────────────────────────────────────┐
                       │   LEVEL 4: END CONSUMER / SHOPPER       │
                       │   (Public Shoppers & Account Holders)   │
                       └─────────────────────────────────────────┘
```

### Detailed Permission Matrix

| Capability / Resource Domain | Platform Super Admin | Store Merchant (Admin) | Store Operator / Staff | End Consumer (Shopper) |
| :--- | :---: | :---: | :---: | :---: |
| **Tenant Provisioning & Approval** | ✅ Full Access | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **Platform Subscription & Invoicing** | ✅ Full Access | 👁️ View / Pay Own Only | ❌ Forbidden | ❌ Forbidden |
| **Tenant DB & Environment Config** | ✅ Full Access | 👁️ View Own Config | ❌ Forbidden | ❌ Forbidden |
| **Subdomain & Custom Domain DNS** | ✅ Platform Mapping | ⚙️ Submit Own Domain | ❌ Forbidden | ❌ Forbidden |
| **Store Branding, Theme, Layout** | ❌ Strictly Forbidden | ✅ Full Customization | ❌ Forbidden | 👁️ Rendered Publicly |
| **Store Product Catalog & SKUs** | ❌ **GDPR / Commercial Lock** | ✅ Full CRUD | ✏️ Inventory / Edits | 👁️ Public Browse Only |
| **Store Consumer Orders & Shipments** | ❌ **GDPR / PII Restricted** | ✅ Full Management | 📦 Pack & Dispatch | 👁️ Track Own Orders |
| **Consumer PII (Name, Address, Phone)** | ❌ **GDPR Forbidden** | 👁️ Processing Purpose | 👁️ Delivery Label Only | 👁️ Own Profile Only |
| **Consumer Payment Details & Tokens** | ❌ **PCI-DSS / GDPR Void** | ❌ Gateway Only | ❌ Gateway Only | 🔒 Processed via Gateway |
| **Customer Reviews & UGC** | ❌ Forbidden | ✅ Moderate / Approve | 👁️ View Only | ✍️ Write & View Own |

---

## 3. Three-Tier Application Layer Architecture & Navigational Transitions

The platform operates across **three discrete application layers**. Resolution occurs automatically based on the domain (production) or explicit query parameters (development / staging).

```
 ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                      APPLICATION RESOLVER                                        │
 │                        (Domain Hostname / Query Parameter Inspection)                            │
 └───────────────────────┬───────────────────────────┬───────────────────────────┬──────────────────┘
                         │                           │                           │
                         ▼                           ▼                           ▼
        ┌────────────────────────────────┐ ┌────────────────────────────────┐ ┌────────────────────────────────┐
        │       SUPER ADMIN LAYER        │ │       MERCHANT DASHBOARD       │ │       PUBLIC STOREFRONT        │
        │      (Platform Console)        │ │         (Seller App)           │ │       (Consumer Store)         │
        ├────────────────────────────────┤ ├────────────────────────────────┤ ├────────────────────────────────┤
        │ • Host: admin.orvexatech.com   │ │ • Host: app.orvexatech.com     │ │ • Host: {slug}.orvexatech.com  │
        │ • Dev:  ?panel=admin           │ │ • Dev:  ?panel=dashboard       │ │ • Dev:  ?tenant={slug}         │
        │ • Scope: Multi-tenant metadata │ │ • Scope: Single-tenant store   │ │ • Scope: Brand catalog & cart  │
        │ • Auth: Master Super Admin     │ │ • Auth: Merchant credentials   │ │ • Auth: Customer OTP/Account   │
        └────────────────────────────────┘ └────────────────────────────────┘ └────────────────────────────────┘
```

### 3.1 Layer 1: Super Admin Platform Layer (`/admin` or `admin.orvexatech.com`)
- **Primary Function**: Platform orchestration, new tenant vetting, database provisioning, platform-wide billing, domain routing, and platform health telemetry.
- **Internal Transitions (Sidebar Navigation)**:
  1. `Platform Overview`: High-level aggregated KPIs (Platform MRR, active stores count, pending applications count, total aggregated transactions index).
  2. `Applications`: Queue of new store onboarding requests (Reviewing, One-click Folder & Database Provisioning, Rejecting).
  3. `All Stores (Tenant Directory)`: Directory of registered stores, subscription statuses, `.env` file templates, and store suspension controls.
  4. `Billing`: Monthly subscription revenue from tenants to Orvexa Tech, recurring billing schedules, and platform run rates.
  5. `Domains`: CNAME / Custom domain mapping statuses and SSL verification.
- **Outbound Transitions**:
  - `View Storefront ↗`: Opens a new isolated tab to `/?tenant={slug}`.
  - `Sign Out Master`: Destroys admin JWT, resets session state, and transitions to the Super Admin Login screen.

### 3.2 Layer 2: Tenant/Merchant Dashboard Layer (`/dashboard` or `app.orvexatech.com`)
- **Primary Function**: Dedicated operational command center for a single merchant.
- **Internal Transitions (Sidebar Navigation)**:
  1. `Dashboard Overview`: Revenue metrics, recent orders, top products for *this specific store only*.
  2. `Products & Inventory`: Catalog management, pricing, SKU variations, inventory counts, high-res image selectors.
  3. `Orders & Shipments`: Merchant order fulfillment, airway bill (AWB) generation, tracking update triggers.
  4. `Storefront & Homepage Customizer`: Live color themes, typography selections, hero banner imagery, announcement banners.
  5. `Database & MongoDB`: Isolated tenant database status, collection counts, and connection health.
  6. `Store Settings & Plan`: Tenant profile, business contact details, and Orvexa subscription tier management.
- **Outbound Transitions**:
  - `Open Live Store ↗`: Opens storefront in new tab.
  - `Sign Out Seller`: Clears merchant session and returns to Seller Login.

### 3.3 Layer 3: Tenant Public Storefront Layer (`/` or `{slug}.orvexatech.com`)
- **Primary Function**: High-conversion e-commerce shopping experience for end-consumers.
- **Internal Transitions & Micro-Interactions**:
  1. `Header & Mega-Menu`: Smooth category dropdown with animated transition.
  2. `Product Catalog & Filters`: Instant client-side faceted filtering (category, sculpt level, price) with zero page reload.
  3. `Product Detail Quick-View / Drawer`: Slide-in drawer displaying high-res gallery, size selector, lining options, and stock indicator.
  4. `Interactive Cart Drawer`: Slide-over drawer with item counts, promo code validation, and delivery threshold progress bar.
  5. `Checkout & Payment Drawer`: Seamless step-by-step accordion (Contact Info ➔ Shipping Address ➔ Payment Gateway Integration).
  6. `Order Tracking Portal`: Customer-facing live tracking with chronological delivery timeline, AWB verification, and courier details.

---

## 4. Super Admin Scope & Strict GDPR / Privacy Compliance

### 4.1 Legal Grounding under GDPR (Regulation (EU) 2016/679)

| GDPR Article / Principle | Legal Mandate | Platform Implementation Rule |
| :--- | :--- | :--- |
| **Article 5(1)(c): Data Minimisation** | Personal data must be adequate, relevant, and limited to what is necessary in relation to the purposes for which they are processed. | **Super Admin MUST NOT ingest, store, or view consumer PII.** Super Admin only handles tenant corporate contract metadata. |
| **Article 5(1)(b): Purpose Limitation** | Personal data collected for store order fulfillment cannot be reused for platform administration. | Customer delivery details exist solely within the merchant's isolated boundary for order delivery. |
| **Article 5(1)(f): Integrity & Confidentiality** | Processing must ensure security against unauthorized or unlawful processing and accidental loss. | Segregated database connections prevent platform operators or compromised platform tokens from leaking consumer records. |
| **Article 28: Controller vs Processor** | The Merchant is the **Data Controller**; Orvexa Tech is the **Data Processor**. | Orvexa Tech as the processor does not have a legal basis to browse private consumer transactions or commercial product secrets. |

---

### 4.2 Data Segregation Matrix: Super Admin vs Merchant

To remove any ambiguity, the following table dictates the absolute visibility boundaries for the Super Admin:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SUPER ADMIN DATA BOUNDARY                                     │
├───────────────────────────────────────────────┬─────────────────────────────────────────────────┤
│               ALLOWED TO SEE                  │             STRICTLY FORBIDDEN (GDPR)           │
│        (Platform Operations Metadata)         │        (Tenant Commercial & Consumer PII)       │
├───────────────────────────────────────────────┼─────────────────────────────────────────────────┤
│ • Tenant Store Name & Slug                    │ ❌ Consumer Names, Emails, Phone Numbers        │
│ • Tenant Business Owner Contact (for billing) │ ❌ Consumer Delivery & Residential Addresses    │
│ • Subscription Tier (Starter/Pro/Enterprise)  │ ❌ Consumer Payment Credentials & UPI Handles   │
│ • Platform Subscription Fee (MRR)             │ ❌ Tenant Product Catalog, SKUs, & Margins      │
│ • Tenant Database Name & Connection Health    │ ❌ Store Line-Item Orders & Customer Baskets    │
│ • Subdomain & Custom Domain DNS Status        │ ❌ Customer Reviews, Feedback, & Support Logs   │
│ • Aggregated Anonymized Store GMV Index       │ ❌ Merchant Private Notes & Vendor Details      │
└───────────────────────────────────────────────┴─────────────────────────────────────────────────┘
```

---

### 4.3 Technical Architectural Enforcements

```
                                  ┌───────────────────────────┐
                                  │   PLATFORM CLIENT ENTRY   │
                                  └─────────────┬─────────────┘
                                                │
                                 ┌──────────────┴──────────────┐
                                 │                             │
                                 ▼                             ▼
                    ┌─────────────────────────┐   ┌─────────────────────────┐
                    │  SUPER ADMIN API GATEWAY│   │  TENANT REST API GATEWAY│
                    │   (Role: Super Admin)   │   │  (Role: Merchant/User)  │
                    └────────────┬────────────┘   └────────────┬────────────┘
                                 │                             │
                                 ▼                             ▼
                    ┌─────────────────────────┐   ┌─────────────────────────┐
                    │  PLATFORM MASTER DB     │   │ ISOLATED TENANT DB      │
                    │ (orvexa_platform_master)│   │ (orvexa_tenant_{slug})  │
                    ├─────────────────────────┤   ├─────────────────────────┤
                    │ • Tenant Accounts       │   │ • Product Catalog & SKUs│
                    │ • Subscription Invoices │   │ • Customer Orders & PII │
                    │ • Domain Routing Config │   │ • Payment Gateway Tokens│
                    │ • Platform System Logs  │   │ • Customer Reviews & UGC│
                    └─────────────────────────┘   └─────────────────────────┘
```

1. **Database-Level Isolation**:
   - Platform metadata is stored in `orvexa_platform_master`.
   - Each tenant has an independent database `orvexa_tenant_{slug}` with dedicated credentials.
   - Super Admin database connection pools **do not bind** to tenant customer collections.

2. **Zero-PII Metric Aggregation**:
   - The Super Admin `Platform Overview` displays high-level financial index numbers (`totalGMV`, `monthlyRecurringRevenue`) via cryptographic aggregated rollups or webhook web-counters without transferring raw consumer names or itemized order logs.

3. **Client UI Shielding**:
   - Super Admin React components (`AdminApp.tsx`) import only platform hooks (`useAdminTenants`, `useAdminApplications`, `usePlatformStats`).
   - Hooks that query consumer details (`useTenantOrders`, `useDashboardProducts`, `useReviews`) are prohibited from being rendered or fetched within the Super Admin bundle.

---

## 5. Development Resumption Checklist & Action Items

| Task ID | Component / Area | Required Action | Priority |
| :--- | :--- | :--- | :---: |
| **TSK-01** | `AdminApp.tsx` | Audit all view panels to ensure zero consumer PII or raw customer order tables are imported. | **P0 (Critical)** |
| **TSK-02** | `api/routes/admin.ts` | Ensure backend Super Admin endpoints only return tenant metadata and never query `orders` or `customers` collections. | **P0 (Critical)** |
| **TSK-03** | `TenantContext.tsx` | Standardize layer transition guards so transitions between `admin`, `dashboard`, and `storefront` cleanly reset URL parameters and unmount extraneous state. | **P1 (High)** |
| **TSK-04** | `DashboardApp.tsx` | Verify tenant isolation so a logged-in merchant can only view and mutate their own store's catalog and orders. | **P1 (High)** |
| **TSK-05** | `App.tsx` (Storefront) | Polish storefront slide-in drawers, cart micro-animations, and tracking transitions for a 60fps consumer UX. | **P2 (Standard)** |

---

## 6. Sign-off & Next Steps

This specification serves as the formal baseline. Developers may immediately proceed with sprint execution following the security, transition, and privacy boundaries established above.

**Approved by:** Gowreesh Periyasamy  
**Architecture Lead:** Orvexa Tech Platform Engineering
