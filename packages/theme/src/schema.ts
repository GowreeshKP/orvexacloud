import { z } from 'zod';
import { FONT_IDS } from './fonts';
import { Layout, liveBlocksIn, REQUIRED_LIVE_BLOCKS } from './layout';

/**
 * The storefront theme document. The editor edits it, AI proposes changes to
 * it, the database versions it and the storefront renders it.
 *
 * Commerce data (prices, stock, variants, checkout) is deliberately absent:
 * it comes from the OrvexaCloud catalogue at render time, so no theme edit can
 * change what a shopper pays or whether an item is in stock.
 */
export const THEME_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------- primitives

export const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a 6-digit hex colour such as #12163a.');
export const SectionId = z.string().regex(/^[a-z0-9-]{1,80}$/, 'Section ids use lowercase letters, numbers and hyphens.');

const text = (max: number) => z.string().trim().max(max);

/** Links a merchant can place: store paths, https pages, email, phone, WhatsApp. */
export function isSafeHref(value: string): boolean {
  if (value === '') return true;
  if (/^\/(?!\/)[\w\-./?=&#%~+]*$/.test(value)) return true;
  if (/^(mailto:|tel:)[^\s<>"']+$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
export const Href = z.string().trim().max(300).refine(isSafeHref, 'Links must start with /, https://, mailto: or tel:.');

/** Images come from the asset store (/assets/...) or another https host. */
export function isSafeImageUrl(value: string): boolean {
  if (/^\/assets\/[a-z0-9][a-z0-9/_.-]{0,200}$/i.test(value) && !value.includes('..')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
export const Image = z.object({
  url: z.string().max(500).refine(isSafeImageUrl, 'Images must be uploaded or use an https address.'),
  alt: text(200),
});
export type Image = z.infer<typeof Image>;

// -------------------------------------------------------------------- tokens

export const Tokens = z.object({
  colors: z.object({
    background: HexColor,
    surface: HexColor,
    text: HexColor,
    muted: HexColor,
    primary: HexColor,
    onPrimary: HexColor,
    accent: HexColor,
  }),
  fonts: z.object({ display: z.enum(FONT_IDS), body: z.enum(FONT_IDS) }),
  radius: z.enum(['sharp', 'soft', 'round']),
  spacing: z.enum(['compact', 'regular', 'airy']),
  headingCase: z.enum(['as-written', 'uppercase']),
  /** How buttons look across the whole store. */
  buttonStyle: z.enum(['solid', 'outline', 'pill', 'underline']),
  /** How product cards look in grids. */
  cardStyle: z.enum(['plain', 'framed', 'raised', 'caption-overlay']),
  /** Product photo shape; fashion suits portrait, pantry suits square. */
  imageShape: z.enum(['portrait', 'square', 'landscape', 'tall']),
});
export type Tokens = z.infer<typeof Tokens>;

// ------------------------------------------------------------------ sections

const base = { id: SectionId, hidden: z.boolean().default(false) };

export const HeroSection = z.object({
  ...base,
  type: z.literal('hero'),
  props: z.object({
    variant: z.enum(['split', 'centered', 'full-bleed', 'triptych', 'editorial']),
    eyebrow: text(60).default(''),
    heading: text(120),
    subheading: text(300).default(''),
    ctaLabel: text(40).default(''),
    ctaHref: Href.default('/collections/all'),
    image: Image.optional(),
  }),
});

export const TrustBarSection = z.object({
  ...base,
  type: z.literal('trust-bar'),
  props: z.object({ items: z.array(text(60).min(1)).max(5).default([]) }),
});

export const CollectionListSection = z.object({
  ...base,
  type: z.literal('collection-list'),
  props: z.object({
    heading: text(80),
    layout: z.enum(['tiles', 'chips']).default('tiles'),
    collectionIds: z.array(z.string().max(128)).max(8).default([]),
  }),
});

export const ProductSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('featured') }),
  z.object({ kind: z.literal('newest') }),
  z.object({ kind: z.literal('collection'), collectionId: z.string().min(1).max(128) }),
]);

export const ProductGridSection = z.object({
  ...base,
  type: z.literal('product-grid'),
  props: z.object({
    heading: text(80),
    subheading: text(200).default(''),
    source: ProductSource.default({ kind: 'featured' }),
    limit: z.number().int().min(2).max(12).default(4),
    columns: z.number().int().min(2).max(4).default(4),
    showViewAll: z.boolean().default(true),
  }),
});

export const ImageWithTextSection = z.object({
  ...base,
  type: z.literal('image-with-text'),
  props: z.object({
    heading: text(100),
    body: text(1200).default(''),
    image: Image.optional(),
    imagePosition: z.enum(['left', 'right']).default('left'),
    ctaLabel: text(40).default(''),
    ctaHref: Href.default(''),
  }),
});

export const RichTextSection = z.object({
  ...base,
  type: z.literal('rich-text'),
  props: z.object({ heading: text(100).default(''), body: text(2000), align: z.enum(['left', 'center']).default('left') }),
});

export const TestimonialsSection = z.object({
  ...base,
  type: z.literal('testimonials'),
  props: z.object({
    heading: text(80),
    items: z.array(z.object({ quote: text(400).min(1), author: text(80).min(1) })).max(6).default([]),
  }),
});

export const FaqSection = z.object({
  ...base,
  type: z.literal('faq'),
  props: z.object({
    heading: text(80),
    items: z.array(z.object({ question: text(200).min(1), answer: text(1000).min(1) })).max(12).default([]),
  }),
});

export const NewsletterSection = z.object({
  ...base,
  type: z.literal('newsletter'),
  props: z.object({ heading: text(80), body: text(240).default(''), buttonLabel: text(30).default('Subscribe') }),
});

export const PromoBannerSection = z.object({
  ...base,
  type: z.literal('promo-banner'),
  props: z.object({ text: text(140).min(1), ctaLabel: text(40).default(''), ctaHref: Href.default(''), tone: z.enum(['primary', 'accent']).default('primary') }),
});

export const ProductMainSection = z.object({
  ...base,
  type: z.literal('product-main'),
  props: z.object({
    gallery: z.enum(['grid', 'stacked', 'single']).default('grid'),
    imageFit: z.enum(['cover', 'contain']).default('cover'),
    zoomOnHover: z.boolean().default(true),
    buttonLabel: text(30).default('Add to bag'),
    deliveryNote: text(200).default(''),
  }),
});

export const ProductInfoSection = z.object({
  ...base,
  type: z.literal('product-info'),
  props: z.object({
    detailsHeading: text(60).default('Details'),
    shippingHeading: text(60).default('Shipping and returns'),
    shippingText: text(800).default(''),
  }),
});

export const RelatedProductsSection = z.object({
  ...base,
  type: z.literal('related-products'),
  props: z.object({ heading: text(80).default('You may also like'), limit: z.number().int().min(2).max(8).default(4) }),
});

export const CollectionHeaderSection = z.object({
  ...base,
  type: z.literal('collection-header'),
  props: z.object({ showDescription: z.boolean().default(true), align: z.enum(['left', 'center']).default('left') }),
});

export const CollectionProductsSection = z.object({
  ...base,
  type: z.literal('collection-products'),
  props: z.object({ columns: z.number().int().min(2).max(4).default(3), emptyMessage: text(160).default('New pieces are on their way.') }),
});

export const ImageBannerSection = z.object({
  ...base,
  type: z.literal('image-banner'),
  props: z.object({
    image: Image.optional(),
    heading: text(100).default(''),
    body: text(300).default(''),
    ctaLabel: text(40).default(''),
    ctaHref: Href.default(''),
    height: z.enum(['short', 'medium', 'tall']).default('medium'),
    textPosition: z.enum(['left', 'center']).default('center'),
  }),
});

export const GalleryImage = Image.extend({ caption: text(80).default(''), href: Href.default('') });
export const GallerySection = z.object({
  ...base,
  type: z.literal('gallery'),
  props: z.object({
    heading: text(80).default(''),
    subheading: text(200).default(''),
    /** Photos in order. Empty spots up to `slots` show an "Add photo" button in the editor. */
    images: z.array(GalleryImage.nullable()).max(8).default([]),
    slots: z.number().int().min(2).max(8).default(3),
    layout: z.enum(['grid', 'mosaic', 'strip']).default('grid'),
  }),
});

export const ContactDetailsSection = z.object({
  ...base,
  type: z.literal('contact-details'),
  props: z.object({
    heading: text(80).default('Get in touch'),
    body: text(600).default(''),
    hours: text(200).default(''),
    showWhatsApp: z.boolean().default(true),
    showPhone: z.boolean().default(true),
    showEmail: z.boolean().default(true),
    showAddress: z.boolean().default(true),
  }),
});

export const Section = z.discriminatedUnion('type', [
  HeroSection, TrustBarSection, CollectionListSection, ProductGridSection, ImageWithTextSection, RichTextSection,
  TestimonialsSection, FaqSection, NewsletterSection, PromoBannerSection, ProductMainSection, ProductInfoSection,
  RelatedProductsSection, CollectionHeaderSection, CollectionProductsSection, ImageBannerSection, GallerySection, ContactDetailsSection,
]);
export type Section = z.infer<typeof Section>;
export type SectionType = Section['type'];
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>;

// --------------------------------------------------------------------- pages

export const PAGE_IDS = ['home', 'collection', 'product', 'about', 'contact'] as const;
export type PageId = (typeof PAGE_IDS)[number];

/** Which sections each page may hold, and which are structural and cannot be removed. */
export const PAGE_RULES: Record<PageId, { allowed: SectionType[]; required: SectionType[] }> = {
  home: {
    allowed: ['hero', 'trust-bar', 'collection-list', 'product-grid', 'image-with-text', 'image-banner', 'gallery', 'rich-text', 'testimonials', 'faq', 'newsletter', 'promo-banner'],
    required: [],
  },
  collection: {
    allowed: ['collection-header', 'collection-products', 'collection-list', 'image-banner', 'promo-banner', 'rich-text', 'faq', 'trust-bar'],
    required: ['collection-header', 'collection-products'],
  },
  product: {
    allowed: ['product-main', 'product-info', 'related-products', 'trust-bar', 'gallery', 'image-banner', 'rich-text', 'faq', 'testimonials', 'promo-banner'],
    required: ['product-main'],
  },
  about: {
    allowed: ['hero', 'image-with-text', 'image-banner', 'gallery', 'rich-text', 'testimonials', 'faq', 'trust-bar', 'newsletter'],
    required: [],
  },
  contact: {
    allowed: ['contact-details', 'rich-text', 'faq', 'image-banner', 'image-with-text'],
    required: ['contact-details'],
  },
};

/** Default About and Contact pages, used for new themes and to upgrade older ones. */
export function defaultAboutSections() {
  return [
    { id: 'hero-1', type: 'hero', hidden: false, props: { variant: 'editorial', heading: 'About us', subheading: 'The people and the craft behind the store.', ctaLabel: '', ctaHref: '/collections/all', eyebrow: '' } },
    { id: 'image-with-text-1', type: 'image-with-text', hidden: false, props: { heading: 'How we started', body: 'Tell shoppers how your brand began, who makes your products and what you care about.', imagePosition: 'left' } },
    { id: 'gallery-1', type: 'gallery', hidden: false, props: { heading: 'Behind the scenes', slots: 3, layout: 'grid' } },
  ];
}
export function defaultContactSections() {
  return [{ id: 'contact-details-1', type: 'contact-details', hidden: false, props: { heading: 'Get in touch', body: 'Questions about an order or a product? We are happy to help.' } }];
}

/**
 * A page holds sections (the starting structure) and, once edited in the visual
 * editor, a cleaned GrapesJS layout that the storefront renders instead.
 */
const Page = z.object({ sections: z.array(Section).max(20), layout: Layout.optional() });

// ------------------------------------------------------------- header/footer

export const Header = z.object({
  announcement: z.object({
    enabled: z.boolean(),
    /** Up to five short lines. "scroll" runs them as a moving ticker. */
    messages: z.array(text(120).min(1)).max(5).default([]),
    href: Href.default(''),
    style: z.enum(['static', 'scroll']).default('static'),
    tone: z.enum(['primary', 'accent', 'dark']).default('primary'),
  }),
  layout: z.enum(['logo-left', 'logo-center']),
  menu: z.array(z.object({ label: text(30).min(1), href: Href })).max(7),
  /** The first menu link that points to /collections/all opens a list of categories. */
  categoryMenu: z.boolean().default(true),
  icons: z.object({ search: z.boolean(), account: z.boolean(), wishlist: z.boolean() }).default({ search: true, account: true, wishlist: false }),
  background: z.enum(['page', 'surface', 'primary']).default('page'),
  sticky: z.boolean(),
});

const SocialUrl = z.string().trim().max(200).refine((v) => v === '' || /^https:\/\//.test(v), 'Use the full https:// link.');
export const Footer = z.object({
  tagline: text(160),
  showPolicyLinks: z.boolean(),
  contact: z.object({ phone: text(20), email: z.string().trim().max(120).refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address.'), address: text(200) }),
  social: z.object({ instagram: SocialUrl, facebook: SocialUrl, youtube: SocialUrl, pinterest: SocialUrl, whatsapp: SocialUrl }),
});

// ---------------------------------------------------------------- categories

/**
 * Categories shown on the storefront. "catalog" entries restyle a category that
 * already exists in OrvexaCloud (title, description, photo); "custom" entries
 * are new groupings the merchant builds by picking products in the studio.
 */
export const ThemeCollection = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/),
  kind: z.enum(['custom', 'catalog']),
  title: text(80).min(1, 'Give the category a name.'),
  description: text(500).default(''),
  image: Image.optional(),
  productIds: z.array(z.string().max(128)).max(500).default([]),
  hidden: z.boolean().default(false),
});
export type ThemeCollection = z.infer<typeof ThemeCollection>;

// --------------------------------------------------------------------- theme

export const Theme = z.object({
  schemaVersion: z.literal(THEME_SCHEMA_VERSION),
  templateId: z.string().max(60),
  nicheId: z.string().max(60),
  brand: z.object({ name: text(80).min(1, 'Add your store name.'), logo: Image.optional() }),
  tokens: Tokens,
  header: Header,
  footer: Footer,
  pages: z.object({ home: Page, collection: Page, product: Page, about: Page, contact: Page }),
  collections: z.array(ThemeCollection).max(50).default([]),
  seo: z.object({ title: text(70), description: text(170), shareImage: Image.optional() }),
}).superRefine((theme, ctx) => {
  const ids = theme.collections.map((c) => c.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['collections'], message: 'Two categories share the same address.' });
  for (const pageId of PAGE_IDS) {
    const sections = theme.pages[pageId].sections;
    const rules = PAGE_RULES[pageId];
    const seen = new Set<string>();
    sections.forEach((section, index) => {
      if (seen.has(section.id)) ctx.addIssue({ code: 'custom', path: ['pages', pageId, 'sections', index, 'id'], message: `Duplicate section id "${section.id}".` });
      seen.add(section.id);
      if (!rules.allowed.includes(section.type)) {
        ctx.addIssue({ code: 'custom', path: ['pages', pageId, 'sections', index, 'type'], message: `A ${section.type} section cannot be placed on the ${pageId} page.` });
      }
    });
    for (const type of rules.required) {
      const count = sections.filter((section) => section.type === type).length;
      if (count !== 1) ctx.addIssue({ code: 'custom', path: ['pages', pageId, 'sections'], message: `The ${pageId} page needs exactly one ${type} section.` });
    }
    const layout = theme.pages[pageId].layout;
    if (layout) {
      const present = liveBlocksIn(layout.html);
      for (const type of REQUIRED_LIVE_BLOCKS[pageId]) {
        if (!present.includes(type)) ctx.addIssue({ code: 'custom', path: ['pages', pageId, 'layout'], message: `The ${pageId} page needs its ${type} block.` });
      }
    }
  }
});
export type Theme = z.infer<typeof Theme>;
export type ThemeInput = z.input<typeof Theme>;

export type ValidationResult = { ok: true; theme: Theme } | { ok: false; errors: string[] };

/**
 * Bring older saved themes up to date before validation, so drafts and
 * published versions made before a schema change keep working.
 */
export function upgradeTheme(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const theme = structuredClone(input) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (theme.pages && typeof theme.pages === 'object') {
    theme.pages.about ??= { sections: defaultAboutSections() };
    theme.pages.contact ??= { sections: defaultContactSections() };
  }
  const announcement = theme.header?.announcement;
  if (announcement && typeof announcement === 'object' && !Array.isArray(announcement.messages)) {
    const legacy = typeof announcement.text === 'string' ? announcement.text.trim() : '';
    announcement.messages = legacy ? [legacy] : [];
    delete announcement.text;
  }
  return theme;
}

export function validateTheme(input: unknown): ValidationResult {
  const result = Theme.safeParse(upgradeTheme(input));
  if (result.success) return { ok: true, theme: result.data };
  return { ok: false, errors: result.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.') || 'theme'}: ${issue.message}`) };
}
