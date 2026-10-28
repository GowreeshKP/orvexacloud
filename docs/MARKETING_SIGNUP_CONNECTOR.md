# Marketing site → Multi-Store Super Admin connector

The marketing UI is **not** part of this repo. Merchant trial / signup forms live in:

**[marketing-site-orvexacloud](https://github.com/Multi-Tenant-Webapp-orvexacloud/marketing-site-orvexacloud)**

This multi-store repo only **receives** signed applications and shows them under Super Admin → Merchant Applications (`/admin`).

## Repos

| Role | Repo | Local path |
|------|------|------------|
| Multi-tenant Super Admin + API | [orvexatech-multi-store](https://github.com/GowreeshKP/orvexatech-multi-store) (this repo) | `D:\lunar final` |
| Platform marketing site | [marketing-site-orvexacloud-](https://github.com/Multi-Tenant-Webapp-orvexacloud/marketing-site-orvexacloud-) | `D:\lunar final\marketing-site-orvexatechcloud` |

## Flow

1. Merchant submits **Start Free Trial** (or equivalent) on the marketing site
2. Marketing signs the JSON body with HMAC (`VITE_SIGNUP_SIGNING_SECRET` / server secret)
3. `POST {MULTI_STORE_API}/api/public/signups` → Mongo master DB (`channel: website`, `status: pending`)
4. Super Admin sees the row under Merchant Applications (`/admin`) and can approve / reject
5. Approve → provisions tenant + emails owner (when Resend is configured)

## Shared env

**This multi-store repo** — `server/.env` (and Render dashboard for production):

```env
SIGNUP_SIGNING_SECRETS=<same-secret>
CORS_ORIGIN=http://localhost:8443,http://localhost:3000,https://orvexacloud.in,https://app.orvexacloud.in
PUBLIC_APP_URL=https://app.orvexacloud.in
```

**Marketing site** — local `.env` and Cloudflare Worker secrets (connector signs server-side; secret never goes in the browser):

```env
# Local laptop API
SUPER_ADMIN_SIGNUP_URL=http://localhost:5000/api/public/signups
SUPER_ADMIN_SLUG_CHECK_URL=http://localhost:5000/api/public/slug-available

# Production — use the app host API proxy (api.orvexacloud.in DNS is optional)
# SUPER_ADMIN_SIGNUP_URL=https://app.orvexacloud.in/api/public/signups
# SUPER_ADMIN_SLUG_CHECK_URL=https://app.orvexacloud.in/api/public/slug-available
SUPER_ADMIN_SIGNING_SECRET=<same-secret-as-SIGNUP_SIGNING_SECRETS>
CORS_ORIGINS=https://orvexacloud.in,http://localhost:3000
SITE_URL=https://orvexacloud.in
```

### Production checklist (Cloudflare Pages UI + Render API)

| Host | Action |
|------|--------|
| **Render** (`api.orvexacloud.in` → Blueprint `render.yaml`) | Deploy Express API. Set `SIGNUP_SIGNING_SECRETS`, `CORS_ORIGIN` (include `https://orvexacloud.in` + `https://app.orvexacloud.in`), `PUBLIC_APP_URL=https://app.orvexacloud.in`, JWT + Mongo URIs. Atlas Network Access: `0.0.0.0/0`. |
| **Cloudflare Pages** (`app.orvexacloud.in`) | Build with `VITE_API_URL=https://api.orvexacloud.in`. CNAME `app` → `orvexatech-multi-store.pages.dev`. |
| **Cloudflare Worker** (`orvexacloud.in`) | Set secret `SUPER_ADMIN_SIGNING_SECRET`. Vars `SUPER_ADMIN_SIGNUP_URL` / `SUPER_ADMIN_SLUG_CHECK_URL` point at `https://api.orvexacloud.in/...`. Redeploy Worker. Confirm `/api/public/config` returns `mode: "connected"`. |
| **Admin UI** | Open `https://app.orvexacloud.in/admin` → Merchant Applications for pending forms. |

Required headers on signup:

| Header | Value |
|--------|--------|
| `Content-Type` | `application/json` |
| `x-orvexa-timestamp` | unix seconds |
| `x-orvexa-signature` | `sha256=` + HMAC-SHA256(secret, `${timestamp}.${rawBody}`) |
| `Idempotency-Key` | unique per submission (must match `idempotencyKey` in body) |

Slug check uses the same signature over an **empty** body string with:

`GET /api/public/slug-available?slug=<requested>`

## Minimal signup payload

```json
{
  "schemaVersion": 1,
  "idempotencyKey": "unique-per-submit",
  "submittedAt": "2026-10-21T12:00:00.000Z",
  "owner": { "name": "Ada Merchant", "email": "ada@brand.com", "phone": "+919999000111" },
  "brand": { "name": "Brand Co", "requestedSlug": "brandco", "niche": "fashion apparel" },
  "plan": {
    "id": "starter",
    "name": "Starter",
    "cycle": "monthly",
    "region": "IN",
    "currency": "INR",
    "amountExTax": 999,
    "tax": 180,
    "total": 1179,
    "totalMinor": 117900,
    "trialDays": 30
  },
  "launch": { "status": "live", "country": "IN" },
  "migration": null,
  "consents": {
    "marketing": true,
    "termsAcceptedAt": "2026-10-21T12:00:00.000Z",
    "termsVersion": "1.0"
  },
  "source": {
    "site": "marketing-site-orvexacloud",
    "country": "IN",
    "referrer": "https://orvexacloud.in/pricing",
    "utm": {}
  }
}
```

Required fields the API validates: `schemaVersion: 1`, `idempotencyKey`, `owner.email`, `brand.name`, `brand.requestedSlug`.

Responses:

| HTTP | Meaning |
|------|---------|
| `201` | `{ applicationId, status: "pending_review" }` (or `early_access` for waitlist) |
| `409` | Same idempotency key already stored — returns existing `applicationId` |
| `401` | Bad / missing signature |
| `422` | Invalid payload |
| `503` | Intake not configured (`SIGNUP_SIGNING_SECRETS` missing) or DB timeout |

Copy-paste client: [`docs/examples/marketing-signup-client.mjs`](./examples/marketing-signup-client.mjs)

## Local run

```powershell
# Multi-store API + Super Admin
cd "D:\lunar final"
pnpm run server:dev   # :5000
pnpm run dev          # :8443 → /admin

# Marketing (cloned into marketing-site-orvexatechcloud/)
cd "D:\lunar final\marketing-site-orvexatechcloud"
npm install
# .env already points SUPER_ADMIN_* at http://localhost:5000/api/public/...
npm run dev:all       # site :3000 + connector API :8787
```

Form submit → marketing connector (`:8787`) → signed `POST` → multi-store (`:5000/api/public/signups`) → Super Admin `/admin` pending queue.

## Verify intake (no marketing UI required)

```powershell
cd "D:\lunar final"
node --env-file=server/.env scripts/marketing-admin-e2e.mjs
```

This posts a signed signup, confirms it appears for Super Admin, then approves / rejects.
