# ORVEXA TECH MULTI-STORE PLATFORM
# Document 5: Consumer Privacy & GDPR Data Rights Policy
**Document Reference:** `ORV-LEGAL-GDPR-v1.0`  
**Version:** 1.0 (Compliance Release)  
**Classification:** Public Legal & Data Privacy Policy  
**Jurisdiction:** GDPR (EU Regulation 2016/679), CCPA, and Regional Data Protection Frameworks  

---

## 1. Purpose & Scope

This **Consumer Privacy & Data Rights Policy** sets forth how **Orvexa Tech** and its hosted merchant brands collect, process, isolate, and protect the **Personally Identifiable Information (PII)** of end-consumers shopping across our multi-store network.

---

## 2. Legal Roles: Data Controller vs Data Processor

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           GDPR STATUTORY ROLES                                  │
├────────────────────────────────────────┬────────────────────────────────────────┤
│           DATA CONTROLLER              │             DATA PROCESSOR             │
│       (The Merchant / Brand)           │          (Orvexa Tech Platform)        │
├────────────────────────────────────────┼────────────────────────────────────────┤
│ • Decides product offerings & pricing  │ • Provides isolated cloud infrastructure│
│ • Directs order fulfillment & delivery │ • Enforces technical database isolation│
│ • Owns consumer customer relationship  │ • Strictly prohibited from viewing PII │
│ • Fulfills GDPR deletion requests      │ • Executes automated purge protocols   │
└────────────────────────────────────────┴────────────────────────────────────────┘
```

1. **The Merchant as Data Controller:** The specific store brand (e.g. *Lunar*, *SilkHaus*) is the Data Controller responsible for obtaining lawful consent and determining order processing purposes.
2. **Orvexa Tech as Data Processor:** Orvexa Tech provides the software and isolated cloud databases. Orvexa Tech processes consumer data solely under the instruction of the merchant for order dispatch and platform operation.

---

## 3. Strict PII Data Minimization & Segregation

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              DATA VISIBILITY BOUNDARY                                  │
├────────────────────────────────────────────┬───────────────────────────────────────────┤
│            ALLOWED DATA ACCESS             │           STRICTLY FORBIDDEN ACCESS       │
│        (Merchant Fulfillment Team)         │            (Super Admin / Operators)      │
├────────────────────────────────────────────┼───────────────────────────────────────────┤
│ • Customer Delivery Name & Address         │ ❌ Consumer Names & Residential Addrs     │
│ • Customer Phone Number (for courier SMS)  │ ❌ Consumer Phone Numbers & Emails        │
│ • Customer Email (for invoice & tracking)  │ ❌ Consumer Cart Contents & Line Items    │
│ • Itemized Ordered SKUs & Shipping Method  │ ❌ Payment Tokens & Card Details          │
└────────────────────────────────────────────┴───────────────────────────────────────────┘
```

1. **Zero-PII Admin Console:** The Platform Super Admin console has no data models, API endpoints, or user interfaces capable of retrieving or viewing consumer personal data.
2. **Isolated Persistence:** Consumer addresses, order histories, and phone numbers are stored strictly within the tenant's isolated database (`orvexa_tenant_{slug}`).

---

## 4. Consumer Statutory Rights under GDPR

### 4.1 Right to Access & Data Portability (Article 15 & 20)
Shoppers have the right to request a complete machine-readable copy (JSON format) of all personal data, purchase records, and shipping addresses held by the merchant.

### 4.2 Right to Erasure / "Right to be Forgotten" (Article 17)
Upon verified customer request:
- The merchant initiates the GDPR erasure workflow.
- All customer PII (name, delivery address, phone, email) is permanently scrubbed or anonymized in the tenant database.
- Historical financial transaction values are retained in aggregated, non-identifiable ledgers for statutory tax compliance only.

### 4.3 Right to Rectification (Article 16)
Customers can edit and update saved delivery addresses, billing details, and contact numbers directly through the customer profile portal or during checkout.

---

## 5. Payment Security & PCI-DSS Compliance

- **No Card Storage:** Orvexa Tech and its tenant storefronts **never store or process raw credit/debit card numbers or CVV codes** on application servers.
- **Direct Gateway Tokenization:** Payment transactions are handled via client-side tokenization directly with PCI-DSS Level 1 certified gateways (Stripe, Razorpay, UPI).

---

## 6. Cookie & Tracking Policy

1. **Essential Cookies:** Used exclusively for session management, authentication tokens, and shopping cart persistence.
2. **No Cross-Store Tracking:** Cookies and local storage tokens set by one store tenant cannot be read by or shared with other brand stores.

---

**Approved by:** Data Protection Officer (DPO) & Legal Counsel  
**Orvexa Tech Platform**
