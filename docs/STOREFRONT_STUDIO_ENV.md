# Storefront Studio (embedded)

Tenant admin **Storefront** embeds the editor from `orvexa-storefront-studio`
directly in the dashboard. There is **no** separate `STUDIO_URL` / launch JWT for
editing.

## How it works

1. Seller opens **Storefront** in `/dashboard/{slug}`.
2. The GrapesJS studio UI loads in-place (`src/studio-editor` + `@orvexa/theme` + `@orvexa/storefront-ui`).
3. Drafts autosave to `PUT /api/stores/:slug/theme` (`studioDraft`).
4. **Publish** calls `POST /api/stores/:slug/studio-publish` and sets `storefrontStudioEnabled`.
5. Live storefront reads `theme.studioPublished` (no external studio host required).

## Optional (legacy external studio)

If you still host a separate Studio service, these remain documented for that path only:

| Variable | Where | Purpose |
| --- | --- | --- |
| `STUDIO_URL` | API / Vite | Public studio origin |
| `STUDIO_LAUNCH_TOKEN_SECRET` | API | Shared with studio `LAUNCH_TOKEN_SECRET` |
| `STUDIO_WEBHOOK_SECRET` | API | Shared with studio `PUBLISH_WEBHOOK_SECRET` |

The embedded dashboard editor does **not** need those keys.
