# E2E Brand e2eijdce3 storefront (`e2eijdce3`)

This folder holds all frontend customisations for this one store. Changes here never affect
other stores, and you don't need to edit anything outside this folder.

The storefront loads `store.tsx` automatically whenever this store is open, at
`/?tenant=e2eijdce3` locally or on the store's subdomain or custom domain.

| File | What it's for |
|---|---|
| `store.tsx` | Entry point. Turns the theme, components and sections below on or off. |
| `theme.ts` | Colours, fonts, hero text and announcement messages fixed in code. |
| `styles.css` | CSS for this store only. Keep every rule under `[data-store='e2eijdce3']`. |
| `components/` | Replacements for built-in parts of the storefront (see below). |
| `sections/` | New homepage sections that only this store shows. |
| `assets/` | Images and logos. Import them in code: `import logo from './assets/logo.png'`. |

## Theme (`theme.ts`)

Uncomment a field to fix that value for this store. Fields you leave out are still
controlled by the merchant in the dashboard editor. Fields you set always win over the
dashboard value.

## Replacing a built-in component (`components/`)

You can replace these components: `AnnouncementBar`, `Navigation`, `Hero`, `ProductCard`
and `Footer`.

1. Create `components/<Name>.tsx` and export a default component that takes `SlotProps<'<Name>'>`.
2. Register it in `store.tsx` under `components`.

Each component receives the same props as the built-in version, plus `Default`, which is the
built-in version itself. Render `<Default {...props} />` to wrap or extend it, or return your
own markup to replace it. `components/Hero.tsx` is a working example.

## Adding a homepage section (`sections/`)

1. Create `sections/<Name>.tsx` taking `StoreSectionProps`, which gives you `tenant`,
   `products`, `onSelectProduct` and `onNavigate`.
2. Register it in `store.tsx`:
   `{ id: 'my-section', after: 'hero', Component: MySection }`.

`after` can be `'hero'`, a built-in section (`'trustBar'`, `'bestsellers'`, `'categories'`,
`'featured'`, `'triptych'`, `'mission'`) or `'end'`. `sections/PromoBanner.tsx` is a working
example.

## Shipping changes

Edits hot-reload while `npm run dev` is running. Production needs a normal build and deploy.
Each store's code is a separate download chunk, so other stores never load it.

`tenant.env` and `config.ts` (if present) are provisioning records. The storefront doesn't
read them.
