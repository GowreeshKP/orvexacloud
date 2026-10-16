# Orvexa Cloud E-Commerce Platform

The autonomous commerce platform empowering modern brands with custom storefronts, dedicated databases, and 0% gateway commission.

## Overview

This is the standalone **Orvexa Cloud E-Commerce Platform** application, extracted into an independent project with all features intact and the super admin login button removed.

## Features Included

- **Modern Apple / Stripe Minimalist Design**: Pure-white canvas, crisp typography (Plus Jakarta Sans & Inter), scroll-reveal transitions, and micro-interactions.
- **1-Tap UPI / Razorpay Checkout Simulator**: Live interactive demo showcasing instant UPI QR code, phone number autofill, and frictionless conversion.
- **Interactive Platform Journey**: Dynamic milestone visualizer covering Store Provisioning, Catalog Import, Multi-Tenant Database Isolation, and Scaling.
- **Live Brand Showcase**: Interactive brand previews for *The Lunar Clothing*, *Silk Haus*, *Bloom & Weave*, and *Khadi Studio*.
- **Transparent Pricing Calculator (₹ INR)**: Dynamic ROI slider comparing standard platform costs (transaction cuts + app store subscriptions) against Orvexa Cloud's flat zero-commission pricing.
- **30-Day Free Trial Merchant Application**: Live store application modal with real-time subdomain availability check (`brand.orvexatech.com`), niche selection, and validation.
- **Enterprise Legal & Compliance Modals**: Complete GDPR (EU 2016/679), India DPDP Act 2023, EU AI Act, Privacy Policy, Cookie Preferences, and DPA agreements.
- **Clean Public Header**: Pure customer acquisition layout with platform navigation and primary "Start Free Trial →" CTA without administrative login entries.

## Project Structure

```
orvexa-cloud/
├── index.html              # HTML shell with fonts and metadata
├── package.json            # Scripts and dependencies
├── vite.config.ts          # Vite configuration with Tailwind CSS v4 & React
├── tsconfig.json           # TypeScript configuration with path aliases (@/*)
├── src/
│   ├── main.tsx            # Application entrypoint with TenantProvider
│   ├── App.tsx             # Root component rendering PlatformWebsite
│   ├── index.css           # Global Tailwind CSS v4 and animation system
│   ├── api/
│   │   ├── client.ts       # Backend API client with offline fallback
│   │   ├── hooks.ts        # React hooks for applications, stats & tenants
│   │   └── mock-store.ts   # In-memory isolated multi-tenant data store
│   ├── components/
│   │   ├── compliance/
│   │   │   └── LegalComplianceModal.tsx  # GDPR / DPDP / Legal modal
│   │   └── platform/
│   │       └── PlatformWebsite.tsx       # Complete 1,800+ line platform UI
│   ├── context/
│   │   └── TenantContext.tsx             # Context provider for tenant configs
│   ├── data/
│   │   ├── mock-tenants.ts               # Brand data and applications
│   │   └── products.ts                   # Demo products & seed data
│   └── types/
│       ├── index.ts                      # Core platform interfaces
│       └── tenant.ts                     # Multi-tenant and subscription types
```

## Running Locally

To run the standalone Orvexa Cloud platform:

```bash
# In the orvexa-cloud directory:
npm install  # (or pnpm install)
npm run dev
```

The application will launch on `http://localhost:3000`.

## Building for Production

```bash
npm run build
```

Production output will be generated into the `dist/` directory.
