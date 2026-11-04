# Storefront Studio — OrvexaCloud env

Set these on the **API** (Render) and optional Vite build:

| Variable | Where | Purpose |
| --- | --- | --- |
| `STUDIO_URL` | API | Public studio origin, e.g. `https://studio.orvexacloud.in` |
| `STUDIO_LAUNCH_TOKEN_SECRET` | API | Shared with studio `LAUNCH_TOKEN_SECRET` (32+ chars) |
| `STUDIO_WEBHOOK_SECRET` | API | Shared with studio `PUBLISH_WEBHOOK_SECRET` |
| `VITE_STUDIO_URL` | Frontend build | Same as `STUDIO_URL` so live stores can fetch published themes |

Studio side (from the Storefront Studio repo):

- `LAUNCH_TOKEN_SECRET` = same as `STUDIO_LAUNCH_TOKEN_SECRET`
- `PUBLISH_WEBHOOK_URL` = `https://app.orvexacloud.in/api/webhooks/studio`
- `PUBLISH_WEBHOOK_SECRET` = same as `STUDIO_WEBHOOK_SECRET`
- `ORVEXACLOUD_URL` = `https://orvexacloud.in`

Seller dashboard **Storefront** → **Edit with Studio** calls `POST /api/stores/:slug/studio-launch`.
