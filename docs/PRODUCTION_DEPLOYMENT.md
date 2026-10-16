# Orvexa Cloud — Production Deployment Guide

End-to-end runbook for MongoDB Atlas, Render, Cloudflare, and GitHub Actions.
Finish **staging** completely before provisioning production.

```
                     ┌──────────────────────────────────────────────┐
                     │            Cloudflare Edge Network           │
                     │  - Custom Hostnames (Merchants' Domains)     │
                     │  - Shop Router Worker (Every Page View)      │
                     │  - Zero Trust Access (Admin PIN Protection)  │
                     │  - R2 Media Bucket (Product Photos)          │
                     └──────┬────────────────────────────────┬──────┘
                            │                                │
                 /api/*     │                                │ Static Assets /
                 Traffic    ▼                                ▼ Storefront
           ┌─────────────────────────────┐        ┌────────────────────────┐
           │      Render Web Service     │        │ Cloudflare Workers /   │
           │  Node.js API                │        │ Pages Portals          │
           │  - Auto-deploy disabled     │        │ (admin, seller, shop)  │
           │  - Express server           │        │                        │
           │  - /api/health with git sha │        └────────────────────────┘
           └──────────────┬──────────────┘
                          │ Outbound IP Whitelist
                          ▼
           ┌─────────────────────────────┐
           │     MongoDB Atlas (AWS)     │
           │  - Dedicated M10 Replica Set│
           │  - Master DB + Tenant DBs   │
           │    via connection pooling   │
           └─────────────────────────────┘
```

---

## 1. Sequence (do not skip)

1. **GitHub** — Team plan, `staging` + `main`, CODEOWNERS, environments, branch rules.
2. **MongoDB Atlas** — `orvexa-staging` (M0) then `orvexa-production` (M10, AWS Singapore). Isolated users. Render Singapore egress only. Never `0.0.0.0/0`.
3. **Render** — Apply `render.yaml`. Bind secrets. Create deploy hooks. Auto-deploy stays off.
4. **Cloudflare** — Full (strict) TLS, DNS, R2, shop-router Worker, Access on `admin`.
5. **Pipelines** — GitHub secrets (hooks and URLs only). Staging deploy, failure, and rollback drills.
6. **Production cutover** — Launch runbook with the business owner present.

---

## 2. GitHub

### Branches

Only `staging` and `main`. Direct pushes and force-pushes are blocked.

Settings → Rules → New ruleset (repeat for `staging` and `main`):

- Restrict creations / deletions / force pushes
- Require a pull request; required approving review from `@orvexa/platform`
- Require conversation resolution
- Require status checks: `Check & Audit` / `check`, `Secret Scan` / `scan`
- Block bypass except organization admins during a documented incident

### Environments

Create `staging` and `production`. Production requires a reviewer on the platform team.
Required reviewers on private repos are a GitHub Team-plan feature.

### Secrets (hooks and URLs only)

Application secrets, JWT keys, Razorpay, and Resend live in **Render** or **Cloudflare**. GitHub Actions must not receive them.

| Name | Where |
|---|---|
| `RENDER_STAGING_DEPLOY_HOOK` | Environment `staging` |
| `RENDER_PRODUCTION_DEPLOY_HOOK` | Environment `production` |
| `CLOUDFLARE_API_TOKEN` | Both (Workers + Pages deploy) |
| `CLOUDFLARE_ACCOUNT_ID` | Both |

Optional variables: `STAGING_API_URL`, `STAGING_WEB_URL`, `PRODUCTION_API_URL`, `PRODUCTION_WEB_URL`.

---

## 3. MongoDB Atlas

| Project | Cluster | Region |
|---|---|---|
| `orvexa-staging` | M0 | Shared |
| `orvexa-production` | Dedicated M10 replica set | AWS Singapore |

Create two database users per project (least privilege):

- `orvexa_master` — `orvexatech_master` readWrite
- `orvexa_tenant` — `orvexa_tenant_*` readWrite (or the Atlas wildcard that matches that prefix)

Network access: **only** the Render Singapore outbound IPs shown on the Render service (`render-prod-sg`). Copy them from Render → the web service → Outbound. Do not add `0.0.0.0/0`.

The API uses one Mongoose pool and selects each store with:

`useDb('orvexa_tenant_' + sanitizedSlug, { useCache: true })`

Bring-your-own clusters still open a separate cached connection.

Seed scripts refuse `NODE_ENV=production` and any Atlas URI that is not clearly staging/test/dev/local. Production is never seeded.

---

## 4. Render

`render.yaml` defines `orvexa-api-staging` and `orvexa-api-production` in Singapore.

- `autoDeploy: false` — Render never builds from a git push
- `healthCheckPath: /api/health` — traffic moves only after the new instance answers healthy
- Deploy hook must include `ref=${GITHUB_SHA}` so `/api/health` returns that commit

`GET /api/health` response:

```json
{"ok": true, "commit": "<git-sha>"}
```

`Cache-Control: no-store`. `503` if the master database ping fails.

Bind every `sync: false` value in the Render dashboard. After the first production admin is created, **delete `ADMIN_BOOTSTRAP_KEY`**.

---

## 5. Cloudflare

SSL/TLS: **Full (strict)**, minimum TLS 1.2.

### DNS

| Name | Type | Target | Proxy | Worker |
|---|---|---|---|---|
| `api` | CNAME | Render service hostname | Proxied | **None** |
| `admin` | CNAME | Pages `orvexa-admin` | Proxied | **None** |
| `app` | CNAME | Pages `orvexa-app` | Proxied | **None** |
| `media` | CNAME | R2 `orvexa-media` | Proxied | **None** |
| `*` | AAAA | `100::` | Proxied | `orvexa-shop-router` |
| Custom merchant hostnames | CNAME / custom hostname | `100::` / fallback origin | Proxied | `orvexa-shop-router` |

System subdomains (`api`, `admin`, `app`, `media`, `www`, `mail`, `staging`) must have an explicit **Worker: None** route.

### Shop router

Paid Worker in `infra/cloudflare`. It runs on every storefront page view: `{slug}.orvexacloud.in`, `/t/{slug}`, and custom domains (resolved via `GET /api/public/resolve?host=`).

### Zero Trust Access (`admin.orvexacloud.in`)

- Application: `admin.orvexacloud.in`
- Policy: email one-time PIN to staff addresses
- Session: **8 hours**
- Include `/` so no HTML, JS, or API admin UI loads before Access

### R2 (`orvexa-media`)

Public read on `media.orvexacloud.in`. Apply `infra/cloudflare/r2-cors.json`: **PUT only from `https://app.orvexacloud.in`**.

### WAF

- Managed WAF rules: on
- Bot Fight Mode: on
- Rate limit `https://api.orvexacloud.in/api/auth/*`: **10 requests / minute / IP**, block **1 hour** on breach

---

## 6. Pipeline

On every PR and on deploy:

1. **Check & Audit** — install, typecheck, build, tests, `npm audit --audit-level=high`
2. **Secret Scan** — gitleaks 8.24.3, SHA-256 pinned, full git history
3. **Deploy** — Wrangler Pages + shop-router; Render hook with `ref=${GITHUB_SHA}`
4. **Wait / Verify** — poll `/api/health` until `commit` equals that SHA
5. **Smoke** — `200` on health, `401` on unauthenticated `/api/admin/*`

### Rollbacks (three options)

1. Render dashboard → Manual Rollback (instant previous instance)
2. Cloudflare → Workers / Pages deployments → Rollback
3. Actions → **Rollback** (`rollback.yml`) with a known-good SHA

---

## 7. Production admin (no demo data)

Production is created empty. Do not run `npm run seed`.

```bash
API_BASE=https://api.orvexacloud.in \
ADMIN_BOOTSTRAP_KEY='…' \
ADMIN_EMAIL='you@orvexatech.com' \
ADMIN_PASSWORD='…' \
CONFIRM_PRODUCTION_BOOTSTRAP=yes \
npm run admin:bootstrap
```

Then delete `ADMIN_BOOTSTRAP_KEY` from Render. The bootstrap route is inert once an admin exists.

`VITE_DEMO_MODE` stays `false` on every production frontend build.

---

## 8. Launch runbook (owner present)

1. Confirm Atlas production project has **no** `0.0.0.0/0` and only Render Singapore IPs.
2. Confirm Render production auto-deploy is **off** and secrets are bound.
3. Confirm Cloudflare Full (strict), Access on admin, WAF + `/api/auth/` rate limit, R2 CORS.
4. Merge the release PR into `main`. Approve the `production` environment.
5. Watch Check → Secret Scan → Deploy → health SHA → smoke.
6. Bootstrap the super admin. Delete the bootstrap key.
7. Sign in at `https://admin.orvexacloud.in` through the email PIN, then with the new password.
8. Create the first real merchant from an application — do not restore demo stores.
9. If anything fails: Render rollback, or `rollback.yml` with the last green SHA.

---

## 9. Baseline cost (approximate)

| Item | Monthly |
|---|---|
| Atlas M10 dedicated (AWS Singapore) | ~$58 |
| Render Starter | $7 |
| Cloudflare Workers Paid | ~$5 |
| **Foundation total** | **~$70–80** |

Excludes GitHub Team and Render workspace seat fees. Staging M0 is free.

---

## 10. Failure drills (required on staging first)

1. Push a commit that fails tests — deploy must not start.
2. Point the staging hook at a bad SHA — wait-for-commit must time out; previous instance stays live.
3. Run `rollback.yml` for staging to a previous green SHA — health must report that SHA.
4. Confirm gitleaks blocks a dummy secret in a throwaway branch.
