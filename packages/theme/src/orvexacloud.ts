import { Catalog, type CatalogCollection, type CatalogProduct } from './catalog';
import type { FontId } from './fonts';
import { applyOps, type EditOp } from './ops';
import type { Theme } from './schema';
import { buildTheme } from './templates';

/**
 * Adapters for OrvexaCloud's current data, read from
 *   GET /api/stores/{slug}/products       (array of product records)
 *   GET /api/public/resolve?slug={slug}   (store record with a flat `theme`)
 */

export type OrvexaProduct = {
  _id?: string;
  id: number | string;
  name: string;
  category?: string;
  price: number; // whole rupees
  desc?: string;
  badge?: string;
  sizes?: string[];
  imgMain?: string;
  images?: string[];
  stockCount?: number;
  isFeatured?: boolean;
  createdAt?: string;
};

export type OrvexaLegacyTheme = {
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  fontDisplay?: string;
  fontSans?: string;
  heroImage?: string;
  heroHeadline?: string;
  heroSubhead?: string;
  heroCtaText?: string;
  secondaryCtaText?: string;
  announcementMessages?: string[];
  logoUrl?: string;
};

export type OrvexaStore = { slug: string; brandName: string; niche?: string; storeType?: string; theme?: OrvexaLegacyTheme };

export function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

/**
 * What stockCount 0 means in OrvexaCloud is configurable (ZERO_STOCK_MEANS):
 * "sold-out" treats it as tracked inventory; "untracked" treats 0 as
 * "stock not tracked", so the product shows as available.
 */
export type ZeroStockMeans = 'sold-out' | 'untracked';

function availability(stockCount: number | undefined, zero: ZeroStockMeans): CatalogProduct['availability'] {
  if (typeof stockCount !== 'number') return 'in-stock';
  if (stockCount <= 0) return zero === 'untracked' ? 'in-stock' : 'out-of-stock';
  return stockCount <= 5 ? 'low-stock' : 'in-stock';
}

export function fromOrvexaProducts(storeId: string, products: OrvexaProduct[], options: { zeroStockMeans?: ZeroStockMeans } = {}): Catalog {
  const zero = options.zeroStockMeans ?? 'sold-out';
  const collections = new Map<string, CatalogCollection>();
  const mapped = products.map((product): CatalogProduct => {
    const id = String(product.id);
    const category = product.category?.trim();
    const collectionId = category ? slugify(category) : '';
    if (category && !collections.has(collectionId)) collections.set(collectionId, { id: collectionId, handle: collectionId, title: category, description: '' });
    const images = [...new Set([product.imgMain, ...(product.images ?? [])].filter((url): url is string => Boolean(url)))];
    return {
      id,
      handle: `${slugify(product.name)}-${slugify(id)}`.slice(0, 150),
      title: product.name.slice(0, 240),
      description: (product.desc ?? '').slice(0, 5000),
      priceMinor: Math.round(product.price * 100),
      availability: availability(product.stockCount, zero),
      images: images.slice(0, 20).map((url) => ({ url, alt: product.name })),
      collectionIds: collectionId ? [collectionId] : [],
      variants: (product.sizes ?? []).slice(0, 100).map((size) => ({ id: `${id}-${slugify(size)}`, title: size, available: true })),
      featured: Boolean(product.isFeatured),
      createdAt: product.createdAt ?? new Date(0).toISOString(),
    };
  });
  return Catalog.parse({ storeId, currency: 'INR', products: mapped, collections: [...collections.values()], sample: false });
}

const FONT_MAP: Array<[RegExp, FontId]> = [
  [/instrument serif/i, 'instrument-serif'], [/cormorant/i, 'cormorant'], [/playfair|cinzel/i, 'fraunces'],
  [/work sans/i, 'hanken'], [/inter/i, 'manrope'], [/bricolage/i, 'bricolage'], [/hanken/i, 'hanken'],
];
function mapFont(css: string | undefined, fallback: FontId): FontId {
  return FONT_MAP.find(([pattern]) => css && pattern.test(css))?.[1] ?? fallback;
}

const NICHE_MAP: Record<string, string> = { fashion: 'fashion', saree: 'sarees-ethnic', sarees: 'sarees-ethnic', handloom: 'handloom-textiles', jewellery: 'jewellery', beauty: 'beauty', kids: 'baby-kids', baby: 'baby-kids', gifting: 'gifting-festive', home: 'home-decor', food: 'pantry', pantry: 'pantry', wellness: 'wellness' };

/**
 * Convert a store's current customiser settings into a theme so no merchant
 * loses their setup. Base64 images cannot live in a theme (they bloat every
 * page load), so they are reported for upload to asset storage instead.
 */
export function fromLegacyTheme(store: OrvexaStore): { theme: Theme; warnings: string[] } {
  const warnings: string[] = [];
  const legacy = store.theme ?? {};
  const nicheKey = Object.keys(NICHE_MAP).find((key) => `${store.niche ?? ''} ${store.storeType ?? ''}`.toLowerCase().includes(key));
  const nicheId = nicheKey ? NICHE_MAP[nicheKey] : 'general';
  const base = buildTheme('soft-tailoring', { brandName: store.brandName, nicheId });
  const hero = base.pages.home.sections.find((s) => s.type === 'hero');
  const isHex = (v?: string) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const colors: Record<string, string> = {};
  if (isHex(legacy.primaryColor)) colors.primary = legacy.primaryColor!.toLowerCase();
  if (isHex(legacy.accentColor)) colors.accent = legacy.accentColor!.toLowerCase();
  if (isHex(legacy.backgroundColor)) colors.background = legacy.backgroundColor!.toLowerCase();

  const ops: EditOp[] = [
    { op: 'set_tokens', changes: { colors, fonts: { display: mapFont(legacy.fontDisplay, 'instrument-serif'), body: mapFont(legacy.fontSans, 'manrope') } } },
  ];
  const messages = (legacy.announcementMessages ?? []).map((m) => m.trim().slice(0, 120)).filter(Boolean).slice(0, 5);
  if (messages.length) ops.push({ op: 'update_header', changes: { announcement: { enabled: true, messages, style: messages.length > 1 ? 'scroll' : 'static' } } });
  if (hero) {
    ops.push({ op: 'update_section', page: 'home', sectionId: hero.id, props: {
      variant: legacy.heroImage ? 'full-bleed' : 'centered',
      heading: (legacy.heroHeadline || store.brandName).slice(0, 120),
      subheading: (legacy.heroSubhead ?? '').slice(0, 300),
      ctaLabel: (legacy.heroCtaText ?? 'Shop now').replace(/\s*[→>]+\s*$/, '').slice(0, 40),
    } });
  }
  const result = applyOps(base, ops);
  if (!result.ok) {
    warnings.push(...result.errors);
    return { theme: base, warnings };
  }
  if (legacy.heroImage?.startsWith('data:')) warnings.push('The hero photo is stored inside the store record. Upload it again so it loads fast.');
  if (legacy.logoUrl?.startsWith('data:')) warnings.push('The logo is stored inside the store record. Upload it again so it loads fast.');
  return { theme: result.theme, warnings };
}
