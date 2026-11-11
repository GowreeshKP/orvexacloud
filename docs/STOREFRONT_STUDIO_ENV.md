# Storefront Studio (embedded)

Tenant admin **Storefront** embeds the editor from `orvexa-storefront-studio`
directly in the dashboard. There is **no** `STUDIO_URL` / `STUDIO_LAUNCH_TOKEN_SECRET`
setup for editing. If the UI still asks for those, the Cloudflare Worker/Pages
build is stale — redeploy `app.orvexacloud.in` from this repo (`wrangler deploy`).

## How it works

1. Seller opens **Storefront** in `/dashboard/{slug}`.
2. The GrapesJS studio UI loads in-place (`src/studio-editor` + `@orvexa/theme` + `@orvexa/storefront-ui`).
3. Drafts autosave to `PUT /api/stores/:slug/theme` (`studioDraft`).
4. **Publish** calls `POST /api/stores/:slug/studio-publish` and sets `storefrontStudioEnabled`.
5. Live storefront reads `theme.studioPublished` (no external studio host required).

## Deploy the UI

```bash
npm run build
npx wrangler deploy
npx wrangler pages deploy dist --project-name=orvexatech-multi-store
```

Git push alone does **not** update `app.orvexacloud.in` — the Pages project has no Git provider linked.
