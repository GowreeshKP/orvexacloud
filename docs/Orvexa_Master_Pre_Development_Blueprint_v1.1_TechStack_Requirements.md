# ORVEXA TECH MULTI-STORE PLATFORM
# Document 4: Master Pre-Development Blueprint & Technical Requirements
**Document Reference:** `ORV-ENG-BLUEPRINT-v1.1`  
**Version:** 1.1  
**Classification:** Technical Requirements Specification (TRS) & Functional Blueprint  
**Author:** Gowreesh Periyasamy  

---

## 1. System Requirements & Scope

The objective of the **Orvexa Tech Platform** is to build a turnkey multi-brand e-commerce SaaS operating across three distinct user roles and interfaces:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              ORVEXA THREE-TIER ROLE MATRIX                            │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ PLATFORM SUPER ADMIN     │ STORE MERCHANT / OPERATOR   │ END CONSUMER / SHOPPER        │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ • Tenant approvals       │ • Catalog management (CRUD) │ • Faceted product discovery   │
│ • Database provisioning  │ • Inventory tracking & stock│ • Slide-out Quick-View Drawer │
│ • Subscription billing   │ • Order fulfillment & AWB   │ • Slide-over Cart Drawer      │
│ • Domain management      │ • Real-time theme editor    │ • Step-by-step Checkout       │
│ • System audit telemetry │ • Brand logo upload & sync  │ • Real-time Order Tracking    │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

---

## 2. Multi-Tenant Brand Presets

The platform ships with 4 diverse brand presets showcasing deep styling adaptability:

| Tenant Slug | Brand Name | Market Segment | Design Aesthetic & Color Palette |
| :--- | :--- | :--- | :--- |
| **`lunar`** | **Lunar Activewear** | Premium Shapewear & Athleisure | Dark luxury, Obsidian `#0B0D17`, Cyan `#00F5D4` |
| **`bloomweave`** | **BloomWeave** | Organic Florals & Sustainable | Natural Sage `#2D6A4F`, Pastel Floral `#FAF3E0` |
| **`khadistudio`**| **KhadiStudio** | Handcrafted Heritage Apparel | Earthy Ochre `#D4A373`, Terracotta `#8D0801` |
| **`silkhaus`** | **SilkHaus** | Luxury Mulberry Silks | Midnight Black `#141414`, Metallic Gold `#D4AF37` |

---

## 3. Detailed Functional Modules

### 3.1 Storefront Shopping & Conversion Flow
1. **Interactive Navigation:** Sticky translucent glass navbar with mega-menu dropdowns, brand selector, search overlay, and currency switcher.
2. **Faceted Filtering Engine:** Multi-attribute filtering (Category, Size `XS-3XL`, Color Swatch, Price Range Slider, Sculpt Level, Customer Rating).
3. **Product Quick-View Drawer:** High-resolution multi-angle gallery, interactive size selector, lining options, real-time inventory indicator, and customer reviews.
4. **Interactive Cart Drawer:** Free-shipping progress bar, quantity adjustments, promo code verification, and instant line-item calculation.
5. **Multi-Step Checkout Drawer:** Contact information, shipping address auto-fill, and simulated payment gateways (Credit/Debit Card, UPI, Net Banking, Cash on Delivery).
6. **Order Tracking Portal:** Chronological delivery status pipeline (Order Placed ➔ Processing ➔ Shipped with Courier AWB ➔ Out for Delivery ➔ Delivered).

### 3.2 Merchant Dashboard & Control Center
1. **Catalog Management:** Create, Read, Update, Delete (CRUD) for products with high-resolution image uploads, price tags, and SKU variations.
2. **Inventory Control:** Automatic stock deduction upon checkout and low-stock threshold warning badges.
3. **Order Fulfillment:** Dispatch orders with courier partners (BlueDart, Delhivery, FedEx) and generate Airway Bills (AWBs).
4. **Live Store Customizer:** Interactive color swatches, font pickers, hero banner copy, announcement bar toggles, and logo image upload with instant fallback rendering.

---

## 4. API Endpoints & Data Model Schema

### 4.1 Master Database Schema (`orvexa_platform_master`)
- **`Tenant` Model:** Stores `name`, `slug`, `domain`, `subscriptionTier`, `status` (`ACTIVE`, `SUSPENDED`), and `dbConfig`.
- **`Application` Model:** Captures prospective brand applications from the marketing funnel.
- **`AdminUser` Model:** Super Admin credentials with bcrypt-hashed passwords.
- **`AuditLog` Model:** High-priority platform system events and access logs.

### 4.2 Tenant Database Schema (`orvexa_tenant_{slug}`)
- **`Product` Model:** Stores `name`, `sku`, `price`, `comparePrice`, `category`, `sizes`, `colors`, `stock`, `images`, and `sculptLevel`.
- **`Order` Model:** Stores customer contact info, shipping address, line items, payment status, courier partner, and tracking AWB.
- **`Review` Model:** Customer star ratings, feedback text, verified purchase flags, and photo attachments.

---

**Approved for Development & Baseline Delivery:** Gowreesh Periyasamy  
**Orvexa Tech Engineering**
