# ORVEXA TECH MULTI-STORE PLATFORM
# Document 1: Tenant & Merchant Data Protection Policy
**Document Reference:** `ORV-SEC-DPP-v1.0`  
**Version:** 1.0  
**Effective Date:** October 2026  
**Classification:** Enterprise Confidential / Policy Baseline  
**Target Audience:** Merchants, Store Owners, Platform Operators, Legal & Security Auditing Teams  

---

## 1. Objective & Scope

This **Tenant & Merchant Data Protection Policy** establishes the mandatory standards, architectural isolations, and legal safeguards enacted by **Orvexa Tech** to safeguard tenant commercial records, catalog intellectual property, pricing formulas, vendor lists, and operational data.

This policy applies to:
- All registered merchants and brands operating on the Orvexa Tech SaaS platform (e.g., *Lunar*, *BloomWeave*, *KhadiStudio*, *SilkHaus*).
- All platform administrators, support personnel, automated serverless functions, and database instances.

---

## 2. Multi-Tenant Architectural Isolation Model

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                ORVEXA TECH DATABASE CLUSTER                            │
├────────────────────────────────────────┬───────────────────────────────────────────────┤
│         MASTER PLATFORM DATABASE       │           ISOLATED TENANT DATABASES           │
│        (`orvexa_platform_master`)      │          (`orvexa_tenant_{tenant_slug}`)      │
├────────────────────────────────────────┼───────────────────────────────────────────────┤
│ • Tenant Business Registration Records │ • Store Catalog & Private SKU Configurations  │
│ • Subscription Plans & Billing Records │ • Product Cost Margins & Inventory Batches    │
│ • Domain Mapping Configurations        │ • Customer Order Ledgers & Invoices           │
│ • Super Admin Credentials & Audit Logs │ • Merchant Theme & Branding Assets            │
└────────────────────────────────────────┴───────────────────────────────────────────────┘
```

### 2.1 Database-Level Segmentation
1. **Independent Mongo Namespaces:** Every store provisioned on Orvexa Tech is allocated a cryptographically segregated MongoDB database: `orvexa_tenant_{slug}`.
2. **No Cross-Tenant Schema Merging:** Unlike shared-table multi-tenancy models (which rely solely on `tenant_id` WHERE clauses), Orvexa Tech utilizes physical database-level namespaces. An operational query on one tenant's database handle cannot traverse into or expose records of another merchant.
3. **Dedicated Connection Pooling:** The backend API server (`server/src/db/`) dynamically maintains an isolated Mongoose connection pool per tenant, ensuring thread and connection boundaries.

---

## 3. Super Admin Non-Access & Anti-Snooping Guarantees

Orvexa Tech enforces strict governance regarding what platform operators and Super Administrators may access:

| Data Category | Super Admin Visibility | Enforcement Mechanism |
| :--- | :---: | :--- |
| **Merchant Subscription Status & Billing Tier** | ✅ Read / Write | Master Platform DB (`orvexa_platform_master`) |
| **Domain & DNS Routing Health** | ✅ Read / Write | Master Platform DB & CNAME Records |
| **Merchant Business Contact Details** | ✅ Read Only | Master Platform DB (for invoicing & legal notices) |
| **Merchant Product Catalog & Pricing** | ❌ **STRICTLY BLOCKED** | No API endpoints or admin UI routes query tenant catalog |
| **Merchant Profit Margins & Supplier Data** | ❌ **STRICTLY BLOCKED** | Tenant-isolated database scope |
| **Store Sales Transactions & Customer Records** | ❌ **STRICTLY BLOCKED** | Hardware/API-level segregation (Zero-PII Access) |

---

## 4. Merchant Intellectual Property & Asset Protection

1. **Brand Assets & Media:** Brand logos, high-resolution product imagery, promotional banners, and lookbooks uploaded via the Storefront Customizer are scoped strictly to the merchant's dedicated cloud storage prefix and local storage cache.
2. **Catalog Confidentiality:** Product launches, unpublished SKUs, and promotional discount strategies remain unindexed and hidden from public scrapers until the merchant toggles the item status to `Published`.
3. **Theme Customizations:** Custom color schemes, typography choices, and layout settings configured via [`DashboardApp.tsx`](file:///c:/Users/Black/Downloads/lunar%20final/src/layers/DashboardApp.tsx) remain the exclusive intellectual property of the respective merchant.

---

## 5. Merchant Data Retention, Export & Offboarding

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TENANT DATA LIFECYCLE                                 │
│                                                                                 │
│   [ Provisioning ] ──► [ Active Operation ] ──► [ Export ] ──► [ Deletion ]    │
│   • One-click DB       • Isolated CRUD          • Full JSON     • 30-Day Soft  │
│   • Tenant key gen     • Automated backup       • CSV dumps     • Hard Purge   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

1. **Self-Service Export:** Merchants retain the absolute right to export their complete product catalog, order history, customer lists, and store settings in JSON/CSV formats at any time.
2. **Account Termination & Soft Deletion:** Upon merchant subscription cancellation, store data enters a 30-day grace period during which the database remains frozen but recoverable.
3. **Cryptographic Hard Purge:** After 30 days of confirmed cancellation, the dedicated database `orvexa_tenant_{slug}` and all associated media storage buckets are permanently dropped and overwritten.

---

## 6. Incident Management & Breach Notification

In the event of an infrastructure anomaly, unauthorized intrusion attempt, or service disruption affecting a merchant's database:
- Orvexa Tech security systems will notify the affected merchant's primary administrative contact within **24 hours**.
- A root-cause analysis (RCA) report and remediation log will be provided within **72 hours**.

---

**Approved by:** Platform Engineering & Security Governance Board  
**Orvexa Tech Platform** • Enterprise Multi-Store SaaS
