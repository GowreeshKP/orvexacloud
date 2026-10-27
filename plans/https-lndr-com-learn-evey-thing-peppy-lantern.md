# Blueprint: LNDR.com Recreation

## Context

LNDR is a premium women's activewear brand with a minimalist, high-performance aesthetic. The goal is to recreate their homepage as a faithful single-page React implementation inside the existing Figma Make Vite + Tailwind v4 project. The current `App.tsx` is a blank interactive dot-grid canvas — we'll replace it with the full LNDR homepage layout while preserving the Tailwind/CSS setup in `index.css`.

---

## Aesthetic Stance

**Stance:** Luxury performance — black-dominant, editorial, high-contrast. Zero decorative noise.

**Color Palette:**
- Background: `#FFFFFF` (white sections) / `#111111` (dark hero/mission sections)
- Foreground: `#0A0A0A`
- Muted: `#F5F4F1` (off-white for alternating bands)
- Accent: `#B8A898` (warm fog/earth tone for subtle highlights)
- Border: `rgba(0,0,0,0.08)`

**Typography (Google Fonts via `@import` in `src/index.css`):**
- Display/Headings: `Instrument Serif` — editorial, confident, not overly fashion-cliché
- Body/Nav/Labels: `Work Sans` — clean, legible, functional sans
- Import both before `@import 'tailwindcss';`

---

## Section-by-Section Structure

### 1. Announcement Bar
- Full-width black strip, white text: `"15% Off Your First Order — Use Code: FIRST15"`
- Centered, small caps, dismissible

### 2. Navigation
- Sticky header, white background, thin bottom border
- Left: `LNDR` wordmark (bold, letter-spaced)
- Center: `SHOP` `EXPLORE` links (uppercase, small, tracking-widest)
- Right: Region selector `£ GBP`, search icon, account icon, bag icon with item count badge
- SHOP triggers a mega-menu dropdown:
  - Columns: Tops (Sports Bras, Tees, Singlets, Long Sleeve, Cropped, Outerwear), Leggings (4 numbered fabric collections), Bottoms, Accessories
  - Rightmost column: editorial promo image

### 3. Hero Section
- Full-viewport-height, dark background (`#111`)
- Large editorial headline: `"TRAIN. RUN. RECOVER."` in Instrument Serif, white, ~96px, all-caps tracking
- Subline: `"Performance without compromise"` in Work Sans, muted white
- Two CTAs side by side: `SHOP NOW →` (white outlined button) and `OUR MISSION →` (ghost text link)
- Background: full-bleed Unsplash photo of athlete in motion with dark overlay

**Unsplash photo:** `https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1800&h=1000&fit=crop&auto=format` (female runner/athlete)

### 4. Trust Bar
- 4 columns, hairline dividers between
- Icons + text:
  1. 🚚 Free UK Shipping over £120
  2. ⭐ +15k 5-Star Reviews
  3. 🔄 Free UK + EU Returns
  4. 💧 30-Day Sweat Test
- Light gray background (`#F5F4F1`), uppercase Work Sans labels

### 5. Bestsellers Carousel
- Section heading: `"BESTSELLERS"` left-aligned, Instrument Serif
- Horizontal scroll row of product cards (5 visible, overflow-x scroll)
- Each card:
  - Square image (hover: swap to second lifestyle image)
  - Color swatch count badge `"9 Colours"`
  - Label chip: `"Bestseller"` / `"New"` in small black pill
  - Product name (Work Sans medium), one-line descriptor (muted), price `£69`

**Product card images (Unsplash):**
- `photo-1506629082955-511b1aa562c8` (athletic wear)
- `photo-1515886657613-9f3515b0c78f` (fitness model)
- `photo-1518310383802-640c2de311b2` (leggings)
- `photo-1571945153237-4929e783af4a` (sports top)
- `photo-1544367567-0f2fcb009e0b` (yoga/athletic)

### 6. Category Triptych (Train / Run / Recover)
- 3-column full-bleed image grid, equal widths, zero gap
- Each column: full-height editorial image with category label overlaid bottom-left
  - `← TRAIN`, `← RUN`, `← RECOVER` (uppercase Work Sans, white)
- Dark gradient overlay on each image

**Images:**
- Train: `photo-1534438327276-14e5300c3a48`
- Run: `photo-1571008887538-b36bb32f4571`
- Recover: `photo-1544367567-0f2fcb009e0b`

### 7. Shop by Category Scroll
- Heading: `"SHOP BY CATEGORY"` left-aligned
- Horizontal scroll row, large portrait cards:
  Leggings, Sports Bras, Shorts, Tops, Outerwear, Accessories
- Each card: image + label centered, hover lift effect

### 8. Leggings Discovery Grid
- 2×2 grid with numbered panels:
  - `01 — Super Sculpting` / "Our pioneering seamless range"
  - `02 — Firm + Matte` / "Sculpting, matte finish"
  - `03 — Light + Smooth` / "Ultra-light, quick-dry"
  - `04 — Butter Soft` / "Extra-stretch"
- Each panel: background image + dark overlay + numbered heading (Instrument Serif, large)
- CTA below: `"View Leggings Guide →"`

### 9. Mission Block
- Full-width dark section (`#111`), centered
- Large bold copy: `"NO DISTRACTIONS."` (Instrument Serif, white, 80px)
- Sub copy: `"Built for performance. Nothing more."` (Work Sans, muted)
- Dual CTAs: `OUR MISSION →` and `SUSTAINABILITY →`
- Background: Unsplash athlete photo with very dark overlay (opacity 0.8)

### 10. Support Bar
- White background, horizontal flex row of 4 inline text links:
  - `Contact Our Experts` · `Book a Virtual Meeting` · `FAQs` · `WhatsApp Us`
- Thin top/bottom borders, centered

### 11. Footer
- 3-column layout on dark (`#0A0A0A`) background:
  - **Help + Support:** Contact, Returns Portal, Shipping Info, Size Guides, Privacy Policy
  - **Company:** Our Mission, Sustainability, Trainer Programme, Gift Cards
  - **Follow Us:** Instagram, Strava, LinkedIn, YouTube, Pinterest (with icon glyphs)
- Bottom strip: Email newsletter input + `Subscribe →` button, copyright line, LNDR logo

---

## Files to Modify

| File | Change |
|------|--------|
| `src/index.css` | Add Google Fonts `@import` for Instrument Serif and Work Sans before `@import 'tailwindcss'` |
| `src/App.tsx` | Full replacement with the LNDR homepage layout (all sections above as React components) |

---

## Implementation Approach

- All sections as named sub-components within `App.tsx` (single file, no router needed)
- Mega-menu: React `useState` hover/click toggle
- Bestsellers carousel: CSS `overflow-x: auto` with `snap-x` scroll snapping
- Product card hover image swap: `useState` per card or CSS background-image trick
- Mobile responsive: single breakpoint at `md:` (768px) — stack columns, collapse nav to hamburger icon (no real drawer needed, just toggle state)
- No external UI library — pure Tailwind v4 utilities

---

## Verification

1. Preview renders in the Figma Make panel — all sections visible top to bottom
2. Announcement bar dismisses on click
3. SHOP mega-menu opens/closes on hover or click
4. Bestsellers carousel scrolls horizontally with snap behavior
5. Product cards show label and price
6. All Unsplash images load (fallback bg-color set on containers)
7. Footer newsletter input accepts text
8. Page is readable on a ~768px viewport (columns stacked)
