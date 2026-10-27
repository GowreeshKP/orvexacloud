// --- Store Niche Presets ---
// New stores are cloned from the Lunar storefront layout but start blank:
// no products, no photos, and categories + copy that match their own niche.
// Tenants without a `storeType` (Lunar & the seeded demo brands) keep the
// original Lunar fashion copy via LEGACY_COPY.

import type { HomeSectionId, PdpOptionId, TenantConfig } from '@/types/tenant'

export interface StoreNichePreset {
  id: string
  label: string
  icon: string
  primaryColor: string
  accentColor: string
  categories: string[]
  // Option chips offered in the merchant product form (empty = no size picker)
  sizeOptions: string[]
  // Labels for the generic Product fields `sculptLevel` / `fabricTech` / `fabricDesc`
  tagLabel: string
  materialLabel: string
  materialDescLabel: string
  noun: string
}

export const STORE_NICHES: StoreNichePreset[] = [
  {
    id: 'fashion',
    primaryColor: '#1F1F1F',
    accentColor: '#C08A6E',
    label: 'Fashion & Apparel',
    icon: '👗',
    categories: ['New Arrivals', 'Women', 'Men', 'Kids', 'Accessories'],
    sizeOptions: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'],
    tagLabel: 'Style / Fit',
    materialLabel: 'Fabric',
    materialDescLabel: 'Fabric & Feel',
    noun: 'styles',
  },
  {
    id: 'toys',
    primaryColor: '#2563EB',
    accentColor: '#F59E0B',
    label: 'Toys & Games',
    icon: '🧸',
    categories: ['Educational Toys', 'Soft Toys', 'Puzzles & Board Games', 'Outdoor Play', 'Baby & Toddler'],
    sizeOptions: ['0-2 Years', '3-5 Years', '6-8 Years', '9-12 Years', '12+ Years'],
    tagLabel: 'Age Group',
    materialLabel: 'Material',
    materialDescLabel: 'Safety & Materials',
    noun: 'toys',
  },
  {
    id: 'jewelry',
    primaryColor: '#3F2E1E',
    accentColor: '#C9A227',
    label: 'Jewelry & Accessories',
    icon: '💍',
    categories: ['Necklaces', 'Earrings', 'Rings', 'Bracelets & Bangles', 'Watches'],
    sizeOptions: [],
    tagLabel: 'Style',
    materialLabel: 'Metal / Material',
    materialDescLabel: 'Material & Finish',
    noun: 'pieces',
  },
  {
    id: 'beauty',
    primaryColor: '#9D174D',
    accentColor: '#F9A8D4',
    label: 'Cosmetics & Skincare',
    icon: '💄',
    categories: ['Skincare', 'Makeup', 'Haircare', 'Fragrance', 'Bath & Body'],
    sizeOptions: ['Travel Size', 'Regular', 'Value Pack'],
    tagLabel: 'Skin / Hair Type',
    materialLabel: 'Key Ingredients',
    materialDescLabel: 'Ingredients & Benefits',
    noun: 'products',
  },
  {
    id: 'home',
    primaryColor: '#44403C',
    accentColor: '#A8A29E',
    label: 'Home & Decor',
    icon: '🏡',
    categories: ['Living Room', 'Kitchen & Dining', 'Bedding', 'Wall Decor', 'Lighting'],
    sizeOptions: ['Small', 'Medium', 'Large'],
    tagLabel: 'Room / Style',
    materialLabel: 'Material',
    materialDescLabel: 'Material & Care',
    noun: 'pieces',
  },
  {
    id: 'electronics',
    primaryColor: '#0F172A',
    accentColor: '#38BDF8',
    label: 'Electronics & Gadgets',
    icon: '🎧',
    categories: ['Mobile Accessories', 'Audio', 'Smart Home', 'Computer Accessories', 'Wearables'],
    sizeOptions: [],
    tagLabel: 'Highlight',
    materialLabel: 'Key Spec',
    materialDescLabel: 'Specifications',
    noun: 'gadgets',
  },
  {
    id: 'food',
    primaryColor: '#166534',
    accentColor: '#FBBF24',
    label: 'Food & Wellness',
    icon: '🥗',
    categories: ['Snacks', 'Beverages', 'Organic Staples', 'Health & Supplements', 'Gift Hampers'],
    sizeOptions: ['250 g', '500 g', '1 kg'],
    tagLabel: 'Diet Tag',
    materialLabel: 'Key Ingredients',
    materialDescLabel: 'Ingredients & Nutrition',
    noun: 'products',
  },
  {
    id: 'handloom',
    primaryColor: '#7C2D12',
    accentColor: '#D97706',
    label: 'Handloom & Traditional',
    icon: '🧵',
    categories: ['Sarees', 'Kurtas', 'Dupattas & Stoles', 'Fabrics', 'Home Textiles'],
    sizeOptions: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'],
    tagLabel: 'Weave / Craft',
    materialLabel: 'Fabric',
    materialDescLabel: 'Fabric & Craft',
    noun: 'weaves',
  },
  {
    id: 'books',
    primaryColor: '#1E3A8A',
    accentColor: '#F97316',
    label: 'Books & Stationery',
    icon: '📚',
    categories: ['Fiction', 'Non-Fiction', "Children's Books", 'Stationery', 'Art Supplies'],
    sizeOptions: [],
    tagLabel: 'Genre',
    materialLabel: 'Author / Brand',
    materialDescLabel: 'About This Item',
    noun: 'titles',
  },
  {
    id: 'sports',
    primaryColor: '#111827',
    accentColor: '#22C55E',
    label: 'Sports & Fitness',
    icon: '🏋️',
    categories: ['Gym Equipment', 'Activewear', 'Yoga', 'Outdoor & Cycling', 'Nutrition'],
    sizeOptions: ['S', 'M', 'L', 'XL'],
    tagLabel: 'Activity',
    materialLabel: 'Material',
    materialDescLabel: 'Material & Performance',
    noun: 'gear',
  },
  {
    id: 'pets',
    primaryColor: '#7C3AED',
    accentColor: '#FCD34D',
    label: 'Pet Supplies',
    icon: '🐾',
    categories: ['Dogs', 'Cats', 'Food & Treats', 'Toys', 'Grooming'],
    sizeOptions: ['Small', 'Medium', 'Large'],
    tagLabel: 'Pet Type',
    materialLabel: 'Material / Ingredients',
    materialDescLabel: 'Details',
    noun: 'products',
  },
  {
    id: 'other',
    primaryColor: '#1F2937',
    accentColor: '#6B7280',
    label: 'Other (Custom)',
    icon: '🛍️',
    categories: [],
    sizeOptions: [],
    tagLabel: 'Tag',
    materialLabel: 'Key Feature',
    materialDescLabel: 'Details',
    noun: 'products',
  },
]

export function getNichePreset(id?: string | null): StoreNichePreset {
  return STORE_NICHES.find((n) => n.id === id) || STORE_NICHES[STORE_NICHES.length - 1]
}

// Map free-text niche labels (e.g. older applications) onto a preset id
export function inferStoreType(label?: string | null): string {
  const text = (label || '').toLowerCase()
  const exact = STORE_NICHES.find((n) => n.label.toLowerCase() === text)
  if (exact) return exact.id
  const rules: [string, string[]][] = [
    ['toys', ['toy', 'game', 'play']],
    ['jewelry', ['jewel', 'accessor', 'watch']],
    ['beauty', ['cosmetic', 'skin', 'beauty', 'makeup']],
    ['home', ['home', 'decor', 'furniture']],
    ['electronics', ['electronic', 'gadget', 'tech']],
    ['food', ['food', 'wellness', 'grocery', 'snack']],
    ['handloom', ['handloom', 'traditional', 'khadi', 'saree']],
    ['books', ['book', 'stationery']],
    ['sports', ['sport', 'fitness', 'gym']],
    ['pets', ['pet']],
    ['fashion', ['fashion', 'apparel', 'cloth', 'baby', 'kids']],
  ]
  return rules.find(([, words]) => words.some((w) => text.includes(w)))?.[0] || 'other'
}

export function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildTenantCategories(names: string[]): NonNullable<TenantConfig['categories']> {
  const seen = new Set<string>()
  return names
    .map((n) => n.trim())
    .filter(Boolean)
    .filter((n) => {
      const slug = slugifyCategory(n)
      if (!slug || seen.has(slug)) return false
      seen.add(slug)
      return true
    })
    .map((name) => ({ id: `cat_${slugifyCategory(name)}`, name, slug: slugifyCategory(name), desc: '', image: '' }))
}

// =================================================================
// STOREFRONT CATEGORY HELPERS
// =================================================================

const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  maxis: 'Kurtas & Maxis',
  dresses: 'Sarees & Dresses',
  kalamkari: 'Artisanal Prints & Stoles',
  handloom: 'Handloom Weaves',
}

export interface StoreCategory {
  slug: string
  name: string
  image: string
}

export function getStoreCategories(
  tenant: TenantConfig | null | undefined,
  products: { category: string; imgMain: string }[]
): StoreCategory[] {
  if (tenant?.categories && tenant.categories.length > 0) {
    return tenant.categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      image: c.image || products.find((p) => p.category === c.slug)?.imgMain || '',
    }))
  }
  const map = new Map<string, StoreCategory>()
  products.forEach((p) => {
    if (!map.has(p.category)) {
      map.set(p.category, { slug: p.category, name: getCategoryLabel(tenant, p.category), image: p.imgMain })
    }
  })
  return Array.from(map.values())
}

export function getCategoryLabel(tenant: TenantConfig | null | undefined, slug: string): string {
  const fromTenant = tenant?.categories?.find((c) => c.slug === slug)
  if (fromTenant) return fromTenant.name
  if (LEGACY_CATEGORY_LABELS[slug]) return LEGACY_CATEGORY_LABELS[slug]
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// =================================================================
// STOREFRONT COPY
// =================================================================

export function isTemplateStore(tenant: TenantConfig | null | undefined): boolean {
  return !!tenant?.storeType
}

export interface StorefrontCopy {
  heroSubhead: string
  heroBadge: string
  collectionEyebrow: string
  featuredEyebrow: string
  featuredTitle: string
  featuredCta: string
  missionHeadline: string
  missionBody: string
  trustItems: { icon: string; text: string; accent?: boolean }[]
  footerTrust: { icon: string; title: string; sub: string }[]
  footerTagline: string
  footerCareLinks: string[]
  footerExploreTitle: string
  footerExploreLinks: string[]
  newsletterTitle: string
  newsletterSub: string
  aboutTitle: string
  aboutBadge: string
  aboutTagline: string
  aboutBio: string
  aboutPillars: { icon: string; title: string; desc: string }[]
  mobileAboutLabel: string
  catalogTagline: string
  catalogIntro: string
  emptyBagHint: string
  searchHint: string
  pdpGuaranteeTitle: string
  pdpGuaranteeBody: string
  pdpDetailsTitle: string
  pdpFitTitle: string
  pdpMagnifyHint: string
  reviewPrompt: string
  contactSubjects: { value: string; label: string }[]
  orderStepTitle: string
  orderStepDesc: string
  comingSoonTitle: string
  comingSoonBody: string
  bestsellersTitle: string
  viewAllText: string
  categoriesTitle: string
  triptychEyebrow: string
  missionEyebrow: string
  missionCta: string
  pdpAddToBagText: string
  pdpRelatedTitle: string
  pdpShippingTitle: string
  pdpShippingPoints: string[]
}

type CopyDefaults = Omit<StorefrontCopy, 'pdpShippingPoints' | 'missionEyebrow' | 'viewAllText' | 'categoriesTitle' | 'triptychEyebrow' | 'missionCta' | 'pdpAddToBagText' | 'pdpShippingTitle'>

function legacyCopy(brandName: string, brandShort: string): CopyDefaults {
  return {
    bestsellersTitle: `${brandShort} Bestsellers`,
    pdpRelatedTitle: 'Complete The Look',
    heroSubhead: 'Handcrafted collections with pure breathable fabrics, master heritage craftsmanship, and functional luxury details.',
    heroBadge: 'HANDCRAFTED ARTISANAL ETHNIC COLLECTION',
    collectionEyebrow: 'HANDCRAFTED ARTISANAL COLLECTION',
    featuredEyebrow: 'CRAFT & FABRIC MATRIX',
    featuredTitle: 'Signature Fabric Weaves',
    featuredCta: 'EXPLORE WEAVE →',
    missionHeadline: 'LESS BUT BETTER.',
    missionBody: `${brandName} was founded with a genuine desire for less but better. Pure artisanal fabrics, conscious craftsmanship, and timeless quality created to last.`,
    trustItems: [
      { icon: '✈️', text: 'FREE SHIPPING IN INDIA > ₹999' },
      { icon: '🌿', text: '100% AUTHENTIC ARTISANAL CRAFT' },
      { icon: '🛡️', text: 'QUALITY CERTIFIED & TESTED' },
      { icon: '⭐', text: `10,000+ HAPPY ${brandShort.toUpperCase()} CLIENTS`, accent: true },
      { icon: '🧵', text: 'HANDLOOM & HERITAGE WEAVES' },
      { icon: '✨', text: '100% SATISFACTION GUARANTEE' },
      { icon: '📦', text: '2–5 DAY EXPRESS DELIVERY' },
      { icon: '🔄', text: '30-DAY EASY RETURNS' },
    ],
    footerTrust: [
      { icon: '✈️', title: 'Free Shipping', sub: 'On orders above ₹999' },
      { icon: '🔄', title: '30-Day Returns', sub: 'Hassle-free exchanges' },
      { icon: '🛡️', title: 'Quality Assured', sub: '100% authentic fabrics' },
      { icon: '💬', title: 'WhatsApp Support', sub: 'Mon–Sat, 10AM–7PM IST' },
    ],
    footerTagline: 'Handcrafted 100% soft cotton maxis, artisanal block prints, and festive dresses with functional side pockets.',
    footerCareLinks: ['Shipping & Delivery', 'Fabric Care Guide', 'Size Guide & Custom Lengths', 'Returns & Exchanges', 'Contact & Support'],
    footerExploreTitle: 'OUR CRAFT',
    footerExploreLinks: ['About Our Studio', 'Artisan Heritage', 'Kalamkari Prints', 'Handloom Weaves', 'New Arrivals'],
    newsletterTitle: 'Join The Atelier',
    newsletterSub: 'Exclusive trunk show access, early drops & artisan stories.',
    aboutTitle: 'About Our Studio & Craft',
    aboutBadge: 'HERITAGE & COMFORT',
    aboutTagline: 'Thoughtfully Handcrafted For Weightless Everyday Living.',
    aboutBio: `${brandName} was born out of a desire for effortless silhouettes and bespoke artisanal craft. Each piece is crafted with utmost care, celebrating authentic Indian textile traditions, premium fabrics, and heirloom silhouettes that elevate everyday occasions and festive celebrations.`,
    aboutPillars: [
      { icon: '🌿', title: 'Pure Artisanal Fabrics', desc: 'Airy, skin-friendly handloom & organic weaves pre-treated for pure comfort.' },
      { icon: '👗', title: 'Tailored Silhouettes', desc: 'Bespoke sizing, custom lengths, and functional utility side pockets.' },
      { icon: '🎨', title: 'Ethical Heritage', desc: 'Direct weaver partnerships sustaining generational Indian artisan clusters.' },
    ],
    mobileAboutLabel: 'ABOUT OUR STUDIO',
    catalogTagline: 'Handcrafted Cotton Maxis & Ethnic Dresses',
    catalogIntro: 'Discover handcrafted silhouettes, breathable pure fabrics, and timeless artisanal craft.',
    emptyBagHint: 'Explore our handcrafted Cotton Maxis and Mul Chanderi dresses.',
    searchHint: 'products, fabrics, collections',
    pdpGuaranteeTitle: '30-Day Sweat & Fit Guarantee',
    pdpGuaranteeBody: "100% soft breathable cotton fabric. If you aren't completely thrilled, return within 30 days for a full refund.",
    pdpDetailsTitle: 'FABRICATION & TECHNICAL DETAILS',
    pdpFitTitle: 'FIT & SCULPT LEVEL',
    pdpMagnifyHint: '🔍 HOVER TO MAGNIFY FABRIC',
    reviewPrompt: `Share your honest experience with ${brandName} cotton fabric, sizing & fit.`,
    contactSubjects: [
      { value: 'Order Tracking Inquiry', label: 'Order Tracking & Courier Delivery' },
      { value: 'Custom Tailoring / Sizing', label: 'Custom Length, Sizing or Fabric Details' },
      { value: 'Exchange or Return', label: 'Exchange & Returns Support' },
      { value: 'Wholesale or Collaboration', label: 'Artisan Collaboration / Bulk Orders' },
      { value: 'General Inquiry', label: 'General Inquiry' },
    ],
    orderStepTitle: 'Garment Tailoring & Quality Inspection',
    orderStepDesc: 'Pieces prepared according to chosen length, lining, and zipper specifications.',
    comingSoonTitle: 'New collection arriving soon',
    comingSoonBody: 'We are preparing our first drop. Check back shortly.',
  }
}

function nicheCopy(preset: StoreNichePreset, brandName: string): CopyDefaults {
  const niche = preset.id === 'other' ? 'Store' : preset.label
  return {
    bestsellersTitle: `${brandName} Bestsellers`,
    pdpRelatedTitle: 'You May Also Like',
    heroSubhead: `Discover ${brandName} — thoughtfully curated ${preset.noun}, quality you can trust, and delivery right to your door.`,
    heroBadge: `${niche.toUpperCase()} • OFFICIAL STORE`,
    collectionEyebrow: `${niche.toUpperCase()} COLLECTION`,
    featuredEyebrow: 'EDITOR’S PICKS',
    featuredTitle: 'Featured Highlights',
    featuredCta: 'VIEW PRODUCT →',
    missionHeadline: 'MADE FOR YOU.',
    missionBody: `${brandName} brings you carefully selected ${preset.noun} with honest pricing, reliable quality, and friendly support at every step.`,
    trustItems: [
      { icon: '✈️', text: 'FAST DELIVERY ACROSS INDIA' },
      { icon: '🛡️', text: 'SECURE PAYMENTS' },
      { icon: '⭐', text: `LOVED BY ${brandName.toUpperCase()} CUSTOMERS`, accent: true },
      { icon: '✨', text: 'QUALITY CHECKED' },
      { icon: '🔄', text: 'EASY RETURNS' },
      { icon: '💬', text: 'FRIENDLY SUPPORT' },
    ],
    footerTrust: [
      { icon: '✈️', title: 'Fast Shipping', sub: 'Delivery across India' },
      { icon: '🔄', title: 'Easy Returns', sub: 'Hassle-free exchanges' },
      { icon: '🛡️', title: 'Secure Checkout', sub: 'UPI, cards & COD' },
      { icon: '💬', title: 'Customer Support', sub: 'We reply quickly' },
    ],
    footerTagline: `${brandName} — your destination for ${niche === 'Store' ? 'quality products' : niche.toLowerCase()}.`,
    footerCareLinks: ['Shipping & Delivery', 'Returns & Exchanges', 'FAQs', 'Contact & Support'],
    footerExploreTitle: 'EXPLORE',
    footerExploreLinks: ['About Us', 'New Arrivals', 'Bestsellers', 'Gift Cards'],
    newsletterTitle: `Join the ${brandName} Community`,
    newsletterSub: 'Be the first to hear about new arrivals, offers & updates.',
    aboutTitle: 'About Us',
    aboutBadge: 'OUR STORY',
    aboutTagline: `Welcome to ${brandName}.`,
    aboutBio: `${brandName} is an independent ${niche === 'Store' ? 'online store' : niche.toLowerCase() + ' store'} built around quality, value, and great service.`,
    aboutPillars: [
      { icon: '✨', title: 'Curated Quality', desc: `Every one of our ${preset.noun} is chosen and checked with care.` },
      { icon: '💸', title: 'Honest Pricing', desc: 'Fair prices with no hidden charges at checkout.' },
      { icon: '🤝', title: 'Real Support', desc: 'A real team ready to help before and after you buy.' },
    ],
    mobileAboutLabel: 'ABOUT US',
    catalogTagline: `Shop All ${preset.id === 'other' ? 'Products' : niche}`,
    catalogIntro: `Browse the full ${brandName} range.`,
    emptyBagHint: `Explore the ${brandName} collection and add your favourites.`,
    searchHint: 'products & categories',
    pdpGuaranteeTitle: 'Shop With Confidence',
    pdpGuaranteeBody: 'Secure checkout, quality-checked products, and easy returns if something isn’t right.',
    pdpDetailsTitle: `${preset.materialDescLabel.toUpperCase()}`,
    pdpFitTitle: 'GOOD TO KNOW',
    pdpMagnifyHint: '🔍 HOVER TO ZOOM',
    reviewPrompt: `Share your honest experience with ${brandName}.`,
    contactSubjects: [
      { value: 'Order Tracking Inquiry', label: 'Order Tracking & Delivery' },
      { value: 'Product Question', label: 'Product Question' },
      { value: 'Exchange or Return', label: 'Exchange & Returns Support' },
      { value: 'Bulk Order', label: 'Bulk / Wholesale Order' },
      { value: 'General Inquiry', label: 'General Inquiry' },
    ],
    orderStepTitle: 'Packing & Quality Check',
    orderStepDesc: 'Your items are being checked and packed for dispatch.',
    comingSoonTitle: 'Our store is getting ready',
    comingSoonBody: `${brandName} is adding its first products. Check back soon!`,
  }
}

export function getShippingConfig(tenant: TenantConfig | null | undefined) {
  const threshold = tenant?.theme?.freeShippingThreshold ?? 999
  const fee = tenant?.theme?.shippingFee ?? 70
  const symbol = tenant?.currencySymbol || '₹'
  return {
    threshold,
    fee,
    costFor: (subtotal: number) => (fee <= 0 || subtotal >= threshold ? 0 : fee),
    summary: fee <= 0 ? 'Free delivery on every order' : `Free delivery on orders over ${symbol}${threshold.toLocaleString('en-IN')}`,
  }
}

/** Storefront copy before any owner overrides are applied. */
export function getDefaultStorefrontCopy(tenant: TenantConfig | null | undefined): StorefrontCopy {
  const brandName = tenant?.brandName || tenant?.name || 'Our Store'
  const brandShort = brandName.split(' ')[0] || brandName
  const isTemplate = isTemplateStore(tenant)
  const base = isTemplate ? nicheCopy(getNichePreset(tenant?.storeType), brandName) : legacyCopy(brandName, brandShort)
  return {
    ...base,
    viewAllText: 'VIEW ALL PRODUCTS →',
    categoriesTitle: 'SHOP BY CATEGORY',
    triptychEyebrow: '← EXPLORE RANGE',
    missionEyebrow: `${/^the\s/i.test(brandName) ? '' : 'THE '}${brandName.toUpperCase()} ${isTemplate ? 'PROMISE' : 'PHILOSOPHY'}`,
    missionCta: 'OUR STORY →',
    pdpAddToBagText: 'ADD TO BAG',
    pdpShippingTitle: 'SHIPPING & RETURNS',
    pdpShippingPoints: [
      getShippingConfig(tenant).summary,
      'Cash on Delivery & Instant UPI available at checkout',
      isTemplate ? 'Easy returns & exchange policy' : 'Easy 30-Day returns & exchange policy',
    ],
  }
}

export function getStorefrontCopy(tenant: TenantConfig | null | undefined): StorefrontCopy {
  const copy = getDefaultStorefrontCopy(tenant)
  const overrides = tenant?.theme?.copy
  if (overrides) {
    for (const field of EDITABLE_COPY_FIELDS) {
      const value = overrides[field.key]?.trim()
      if (!value) continue
      if (field.key === 'pdpShippingPoints') {
        copy.pdpShippingPoints = value.split('\n').map((l) => l.trim()).filter(Boolean)
      } else {
        ;(copy as unknown as Record<string, string>)[field.key] = value
      }
    }
  }
  const trust = tenant?.theme?.trustItems?.filter((t) => t.text.trim())
  if (trust && trust.length > 0) copy.trustItems = trust
  return copy
}

export type CopyFieldGroup = 'home' | 'catalog' | 'pdp' | 'footer'

export interface EditableCopyField {
  key: keyof StorefrontCopy
  label: string
  group: CopyFieldGroup
  multiline?: boolean
}

export const EDITABLE_COPY_FIELDS: EditableCopyField[] = [
  { key: 'heroBadge', label: 'Hero badge (small pill above the headline)', group: 'home' },
  { key: 'collectionEyebrow', label: 'Bestsellers — small label', group: 'home' },
  { key: 'bestsellersTitle', label: 'Bestsellers — heading', group: 'home' },
  { key: 'viewAllText', label: 'Bestsellers — "view all" link', group: 'home' },
  { key: 'comingSoonTitle', label: 'Empty store — heading', group: 'home' },
  { key: 'comingSoonBody', label: 'Empty store — message', group: 'home', multiline: true },
  { key: 'categoriesTitle', label: 'Categories — heading', group: 'home' },
  { key: 'featuredEyebrow', label: 'Featured — small label', group: 'home' },
  { key: 'featuredTitle', label: 'Featured — heading', group: 'home' },
  { key: 'featuredCta', label: 'Featured — card link text', group: 'home' },
  { key: 'triptychEyebrow', label: 'Spotlight banners — small label', group: 'home' },
  { key: 'missionEyebrow', label: 'Brand story — small label', group: 'home' },
  { key: 'missionHeadline', label: 'Brand story — big headline', group: 'home' },
  { key: 'missionBody', label: 'Brand story — paragraph', group: 'home', multiline: true },
  { key: 'missionCta', label: 'Brand story — button text', group: 'home' },
  { key: 'catalogTagline', label: 'Catalog page — heading', group: 'catalog' },
  { key: 'catalogIntro', label: 'Catalog page — intro line', group: 'catalog' },
  { key: 'emptyBagHint', label: 'Empty cart — message', group: 'catalog' },
  { key: 'pdpAddToBagText', label: 'Add to bag button', group: 'pdp' },
  { key: 'pdpMagnifyHint', label: 'Image zoom hint', group: 'pdp' },
  { key: 'pdpGuaranteeTitle', label: 'Guarantee box — heading', group: 'pdp' },
  { key: 'pdpGuaranteeBody', label: 'Guarantee box — message', group: 'pdp', multiline: true },
  { key: 'pdpDetailsTitle', label: 'Details section — heading', group: 'pdp' },
  { key: 'pdpFitTitle', label: '"Good to know" section — heading', group: 'pdp' },
  { key: 'pdpShippingTitle', label: 'Shipping section — heading', group: 'pdp' },
  { key: 'pdpShippingPoints', label: 'Shipping section — points (one per line)', group: 'pdp', multiline: true },
  { key: 'pdpRelatedTitle', label: 'Related products — heading', group: 'pdp' },
  { key: 'reviewPrompt', label: 'Write-a-review prompt', group: 'pdp', multiline: true },
  { key: 'footerTagline', label: 'Footer — brand tagline', group: 'footer', multiline: true },
  { key: 'newsletterTitle', label: 'Newsletter — heading', group: 'footer' },
  { key: 'newsletterSub', label: 'Newsletter — message', group: 'footer' },
]

export const HOME_SECTIONS: { id: HomeSectionId; label: string; desc: string }[] = [
  { id: 'trustBar', label: 'Trust ticker', desc: 'Scrolling strip of promises under the hero' },
  { id: 'bestsellers', label: 'Bestsellers', desc: 'Horizontal row of your products' },
  { id: 'categories', label: 'Shop by category', desc: 'Large category cards' },
  { id: 'featured', label: 'Featured highlights', desc: 'Four numbered product spotlights' },
  { id: 'triptych', label: 'Spotlight banners', desc: 'Three full-width product banners' },
  { id: 'mission', label: 'Brand story', desc: 'Big headline with your story' },
]

export function getHomeSections(tenant: TenantConfig | null | undefined): { id: HomeSectionId; visible: boolean }[] {
  const saved = (tenant?.theme?.homeSections || []).filter((s) => HOME_SECTIONS.some((h) => h.id === s.id))
  const missing = HOME_SECTIONS.filter((h) => !saved.some((s) => s.id === h.id)).map((h) => ({ id: h.id, visible: true }))
  return [...saved, ...missing]
}

export const PDP_OPTIONS: { id: PdpOptionId; label: string; desc: string }[] = [
  { id: 'zoom', label: 'Hover-to-zoom images', desc: 'Magnify the main photo on hover' },
  { id: 'guarantee', label: 'Guarantee box', desc: 'Trust message under the add-to-bag button' },
  { id: 'details', label: 'Details & "good to know" sections', desc: 'Expandable product information' },
  { id: 'shipping', label: 'Shipping & returns section', desc: 'Expandable delivery information' },
  { id: 'related', label: 'Related products', desc: 'Carousel of other products at the bottom' },
]

export function isPdpOptionEnabled(tenant: TenantConfig | null | undefined, id: PdpOptionId): boolean {
  return tenant?.theme?.pdpOptions?.[id] ?? true
}
