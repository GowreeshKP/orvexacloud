# Storefront Studio — OrvexaCloud env

Render API service: `orvexa-api-nskw` (repo **`GowreeshKP/orvexacloud`**, branch `main`).
Studio app: `orvexa-storefront-studio` (local folder / Vercel). Seller **Storefront** →
**Edit with Studio** calls `POST /api/stores/:slug/studio-launch` (INTEGRATION.md).

## API (Render)

| Variable | Purpose |
| --- | --- |
| `STUDIO_URL` | Public studio origin, e.g. `https://studio.orvexacloud.in` or a Vercel URL |
| `STUDIO_LAUNCH_TOKEN_SECRET` | Shared with studio `LAUNCH_TOKEN_SECRET` (32+ chars) |
| `STUDIO_WEBHOOK_SECRET` | Shared with studio `PUBLISH_WEBHOOK_SECRET` |

After setting env vars, **Manual Deploy** so `/studio` and `/studio-launch` load.

## Frontend (Workers / Vite)

| Variable | Purpose |
| --- | --- |
| `VITE_STUDIO_URL` | Same as `STUDIO_URL` so live stores fetch published themes |

## Studio (`apps/studio/.env.local`)

- `LAUNCH_TOKEN_SECRET` = same as `STUDIO_LAUNCH_TOKEN_SECRET`
- `PUBLISH_WEBHOOK_URL` = `https://app.orvexacloud.in/api/webhooks/studio`
- `PUBLISH_WEBHOOK_SECRET` = same as `STUDIO_WEBHOOK_SECRET`
- `ORVEXACLOUD_URL` = `https://orvexacloud.in`
- `CATALOG_SOURCE=store` for real tenant catalogues (e.g. `e2econn1713`)
- `DEV_LOGIN=1` only on localhost; production must omit it

## Flow

1. Tenant admin opens **Storefront** in `/dashboard/{slug}`
2. **Edit with Studio** → signed `{STUDIO_URL}/launch?token=…`
3. Publish → webhook → `storefrontStudioEnabled` + theme version on the tenant
4. Live store loads `GET {STUDIO_URL}/api/public/stores/{slug}/theme`
