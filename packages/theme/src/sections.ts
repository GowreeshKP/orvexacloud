import type { PageId, Section, SectionType } from './schema';
import { PAGE_RULES } from './schema';

/**
 * Field definitions let the editor build every section's settings form from
 * data, so adding a section type needs no new editor UI code.
 */
export type Field =
  | { key: string; label: string; kind: 'text'; max: number; placeholder?: string; help?: string; noAi?: boolean }
  | { key: string; label: string; kind: 'textarea'; max: number; rows?: number; placeholder?: string; help?: string }
  | { key: string; label: string; kind: 'select'; options: Array<[string, string]>; help?: string }
  | { key: string; label: string; kind: 'toggle'; help?: string }
  | { key: string; label: string; kind: 'number'; min: number; max: number; help?: string }
  | { key: string; label: string; kind: 'image'; help?: string; aspect?: CropAspect }
  | { key: string; label: string; kind: 'gallery'; maxItems: number; help?: string; aspect?: CropAspect }
  | { key: string; label: string; kind: 'href'; help?: string }
  | { key: string; label: string; kind: 'string-list'; maxItems: number; max: number; help?: string }
  | { key: string; label: string; kind: 'faq-list'; maxItems: number; help?: string }
  | { key: string; label: string; kind: 'quote-list'; maxItems: number; help?: string }
  | { key: string; label: string; kind: 'collections'; maxItems: number; help?: string }
  | { key: string; label: string; kind: 'product-source'; help?: string };

/** Preferred crop shape offered first when a merchant adds a photo. */
export type CropAspect = 'free' | 'wide' | 'landscape' | 'square' | 'portrait';
export const CROP_ASPECTS: Record<CropAspect, { label: string; ratio: number | null }> = {
  wide: { label: 'Wide banner (16:9)', ratio: 16 / 9 },
  landscape: { label: 'Landscape (4:3)', ratio: 4 / 3 },
  square: { label: 'Square', ratio: 1 },
  portrait: { label: 'Portrait (4:5)', ratio: 4 / 5 },
  free: { label: 'Original shape', ratio: null },
};

type Definition = {
  label: string;
  description: string;
  fields: Field[];
  defaults: () => Record<string, unknown>;
};

export const SECTION_DEFINITIONS: Record<SectionType, Definition> = {
  hero: {
    label: 'Hero banner',
    description: 'The first thing shoppers see: a headline, a photo and one button.',
    fields: [
      { key: 'variant', label: 'Layout', kind: 'select', options: [['split', 'Photo beside text'], ['centered', 'Centred text'], ['full-bleed', 'Full-width photo'], ['triptych', 'Three products'], ['editorial', 'Large headline']] },
      { key: 'eyebrow', label: 'Small line above the headline', kind: 'text', max: 60, placeholder: 'Optional' },
      { key: 'heading', label: 'Headline', kind: 'text', max: 120 },
      { key: 'subheading', label: 'Supporting text', kind: 'textarea', max: 300, rows: 3 },
      { key: 'ctaLabel', label: 'Button text', kind: 'text', max: 40 },
      { key: 'ctaHref', label: 'Button link', kind: 'href' },
      { key: 'image', label: 'Photo', kind: 'image', aspect: 'wide', help: 'Landscape photos at least 1600px wide look sharpest.' },
    ],
    defaults: () => ({ variant: 'split', eyebrow: '', heading: 'Say what makes your store special', subheading: 'One short line about what you sell and who it is for.', ctaLabel: 'Shop now', ctaHref: '/collections/all' }),
  },
  'trust-bar': {
    label: 'Promise strip',
    description: 'Short lines such as delivery or payment options. Only add promises your store keeps.',
    fields: [{ key: 'items', label: 'Lines', kind: 'string-list', maxItems: 5, max: 60, help: 'Example: Cash on delivery available. Only list what is true for your store.' }],
    defaults: () => ({ items: [] }),
  },
  'collection-list': {
    label: 'Collections',
    description: 'Links to your collections so shoppers can browse by category.',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 80 },
      { key: 'layout', label: 'Style', kind: 'select', options: [['tiles', 'Photo tiles'], ['chips', 'Compact buttons']] },
      { key: 'collectionIds', label: 'Collections to show', kind: 'collections', maxItems: 8, help: 'Leave empty to show all collections.' },
    ],
    defaults: () => ({ heading: 'Shop by collection', layout: 'tiles', collectionIds: [] }),
  },
  'product-grid': {
    label: 'Product grid',
    description: 'A row of products from your catalogue with live prices.',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 80 },
      { key: 'subheading', label: 'Supporting text', kind: 'text', max: 200 },
      { key: 'source', label: 'Which products', kind: 'product-source' },
      { key: 'limit', label: 'Number of products', kind: 'number', min: 2, max: 12 },
      { key: 'columns', label: 'Products per row on desktop', kind: 'number', min: 2, max: 4 },
      { key: 'showViewAll', label: 'Show a “View all” link', kind: 'toggle' },
    ],
    defaults: () => ({ heading: 'New in', subheading: '', source: { kind: 'newest' }, limit: 4, columns: 4, showViewAll: true }),
  },
  'image-with-text': {
    label: 'Photo with text',
    description: 'A photo next to a short story about your craft, makers or materials.',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 100 },
      { key: 'body', label: 'Text', kind: 'textarea', max: 1200, rows: 5 },
      { key: 'image', label: 'Photo', kind: 'image', aspect: 'portrait' },
      { key: 'imagePosition', label: 'Photo position', kind: 'select', options: [['left', 'Left'], ['right', 'Right']] },
      { key: 'ctaLabel', label: 'Button text', kind: 'text', max: 40, placeholder: 'Optional' },
      { key: 'ctaHref', label: 'Button link', kind: 'href' },
    ],
    defaults: () => ({ heading: 'Made by people, not machines', body: 'Introduce the hands behind your products, the materials you choose and why you started.', imagePosition: 'left', ctaLabel: '', ctaHref: '' }),
  },
  'rich-text': {
    label: 'Text block',
    description: 'A heading and paragraph. Good for a brand story or a care guide.',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 100 },
      { key: 'body', label: 'Text', kind: 'textarea', max: 2000, rows: 6 },
      { key: 'align', label: 'Alignment', kind: 'select', options: [['left', 'Left'], ['center', 'Centred']] },
    ],
    defaults: () => ({ heading: 'What we believe', body: 'A few honest sentences about your brand and the promise you make to every customer.', align: 'left' }),
  },
  testimonials: {
    label: 'Customer reviews',
    description: 'Real words from real customers. Never add reviews you did not receive.',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 80 },
      { key: 'items', label: 'Reviews', kind: 'quote-list', maxItems: 6, help: 'Copy reviews exactly as customers wrote them, with their permission.' },
    ],
    defaults: () => ({ heading: 'What customers say', items: [] }),
  },
  faq: {
    label: 'Questions and answers',
    description: 'Answers to what shoppers ask before buying.',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 80 },
      { key: 'items', label: 'Questions', kind: 'faq-list', maxItems: 12 },
    ],
    defaults: () => ({ heading: 'Questions', items: [] }),
  },
  newsletter: {
    label: 'Email sign-up',
    description: 'Invite shoppers to join your list. Sign-ups are collected by Orvexa Cloud.',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 80 },
      { key: 'body', label: 'Text', kind: 'textarea', max: 240, rows: 2 },
      { key: 'buttonLabel', label: 'Button text', kind: 'text', max: 30 },
    ],
    defaults: () => ({ heading: 'Hear about new arrivals first', body: '', buttonLabel: 'Subscribe' }),
  },
  'promo-banner': {
    label: 'Offer banner',
    description: 'A single line for a campaign. Mention only offers you have set up in Orvexa Cloud.',
    fields: [
      { key: 'text', label: 'Banner text', kind: 'text', max: 140 },
      { key: 'ctaLabel', label: 'Button text', kind: 'text', max: 40, placeholder: 'Optional' },
      { key: 'ctaHref', label: 'Button link', kind: 'href' },
      { key: 'tone', label: 'Colour', kind: 'select', options: [['primary', 'Main colour'], ['accent', 'Highlight colour']] },
    ],
    defaults: () => ({ text: 'Write your offer here, for example: the festive edit is live', ctaLabel: 'Shop the offer', ctaHref: '/collections/all', tone: 'primary' }),
  },
  'product-main': {
    label: 'Product photos and buy box',
    description: 'Photos, title, price, sizes and the add-to-bag button. Prices and stock come from your catalogue.',
    fields: [
      { key: 'gallery', label: 'Photo layout', kind: 'select', options: [['grid', 'Grid'], ['stacked', 'Stacked'], ['single', 'One large photo']] },
      { key: 'imageFit', label: 'Photo fit', kind: 'select', options: [['cover', 'Fill the frame'], ['contain', 'Show the whole photo']] },
      { key: 'zoomOnHover', label: 'Zoom photos on hover', kind: 'toggle' },
      { key: 'buttonLabel', label: 'Button text', kind: 'text', max: 30 },
      { key: 'deliveryNote', label: 'Delivery note under the button', kind: 'text', max: 200, help: 'Only state delivery times you can meet.' },
    ],
    defaults: () => ({ gallery: 'grid', imageFit: 'cover', zoomOnHover: true, buttonLabel: 'Add to bag', deliveryNote: '' }),
  },
  'product-info': {
    label: 'Product details',
    description: 'The product description from your catalogue, plus your shipping and returns text.',
    fields: [
      { key: 'detailsHeading', label: 'Details heading', kind: 'text', max: 60 },
      { key: 'shippingHeading', label: 'Shipping heading', kind: 'text', max: 60 },
      { key: 'shippingText', label: 'Shipping and returns text', kind: 'textarea', max: 800, rows: 4, help: 'Match your published shipping and returns policy.' },
    ],
    defaults: () => ({ detailsHeading: 'Details', shippingHeading: 'Shipping and returns', shippingText: '' }),
  },
  'related-products': {
    label: 'Related products',
    description: 'More products from the same collection.',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 80 },
      { key: 'limit', label: 'Number of products', kind: 'number', min: 2, max: 8 },
    ],
    defaults: () => ({ heading: 'You may also like', limit: 4 }),
  },
  'collection-header': {
    label: 'Collection title',
    description: 'The collection name and its description from your catalogue.',
    fields: [
      { key: 'showDescription', label: 'Show the collection description', kind: 'toggle' },
      { key: 'align', label: 'Alignment', kind: 'select', options: [['left', 'Left'], ['center', 'Centred']] },
    ],
    defaults: () => ({ showDescription: true, align: 'left' }),
  },
  'image-banner': {
    label: 'Photo banner',
    description: 'A full-width photo with a short line of text on top. Good for campaigns and new collections.',
    fields: [
      { key: 'image', label: 'Photo', kind: 'image', aspect: 'wide', help: 'Use a wide photo at least 1600px across.' },
      { key: 'heading', label: 'Heading', kind: 'text', max: 100 },
      { key: 'body', label: 'Text', kind: 'textarea', max: 300, rows: 2 },
      { key: 'ctaLabel', label: 'Button text', kind: 'text', max: 40, placeholder: 'Optional' },
      { key: 'ctaHref', label: 'Button link', kind: 'href' },
      { key: 'height', label: 'Height', kind: 'select', options: [['short', 'Short'], ['medium', 'Medium'], ['tall', 'Tall']] },
      { key: 'textPosition', label: 'Text position', kind: 'select', options: [['left', 'Left'], ['center', 'Centre']] },
    ],
    defaults: () => ({ heading: 'The new collection', body: '', ctaLabel: 'Shop now', ctaHref: '/collections/all', height: 'medium', textPosition: 'center' }),
  },
  gallery: {
    label: 'Photo gallery',
    description: 'Several photos side by side: a lookbook, your workshop, or customers wearing your pieces.',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 80 },
      { key: 'subheading', label: 'Supporting text', kind: 'text', max: 200 },
      { key: 'images', label: 'Photos', kind: 'gallery', maxItems: 8, aspect: 'portrait', help: 'Add a caption or link to any photo.' },
      { key: 'slots', label: 'Number of photo spots', kind: 'number', min: 2, max: 8 },
      { key: 'layout', label: 'Layout', kind: 'select', options: [['grid', 'Even grid'], ['mosaic', 'One large photo'], ['strip', 'Single row']] },
    ],
    defaults: () => ({ heading: 'In the studio', subheading: '', images: [], slots: 3, layout: 'grid' }),
  },
  'contact-details': {
    label: 'Contact details',
    description: 'Your phone, WhatsApp, email and address, taken from the footer settings.',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 80 },
      { key: 'body', label: 'Text', kind: 'textarea', max: 600, rows: 3 },
      { key: 'hours', label: 'Opening hours', kind: 'text', max: 200, placeholder: 'e.g. Mon to Sat, 10am to 7pm' },
      { key: 'showWhatsApp', label: 'Show a WhatsApp button', kind: 'toggle' },
      { key: 'showPhone', label: 'Show phone', kind: 'toggle' },
      { key: 'showEmail', label: 'Show email', kind: 'toggle' },
      { key: 'showAddress', label: 'Show address', kind: 'toggle' },
    ],
    defaults: () => ({ heading: 'Get in touch', body: '', hours: '', showWhatsApp: true, showPhone: true, showEmail: true, showAddress: true }),
  },
  'collection-products': {
    label: 'Collection products',
    description: 'Every product in the collection, with live prices.',
    fields: [
      { key: 'columns', label: 'Products per row on desktop', kind: 'number', min: 2, max: 4 },
      { key: 'emptyMessage', label: 'Message when the collection is empty', kind: 'text', max: 160 },
    ],
    defaults: () => ({ columns: 3, emptyMessage: 'New pieces are on their way.' }),
  },
};

export function isRequiredSection(pageId: PageId, type: SectionType): boolean {
  return PAGE_RULES[pageId].required.includes(type);
}

/** Section types a merchant can still add to a page (structural ones appear once). */
export function addableSections(pageId: PageId, existing: Section[]): SectionType[] {
  const rules = PAGE_RULES[pageId];
  return rules.allowed.filter((type) => !rules.required.includes(type) || !existing.some((section) => section.type === type));
}

export function newSectionId(type: SectionType, existing: Array<{ id: string }>): string {
  const taken = new Set(existing.map((section) => section.id));
  for (let n = 1; n < 1000; n += 1) {
    const id = `${type}-${n}`;
    if (!taken.has(id)) return id;
  }
  throw new Error('Too many sections on this page.');
}

export function createSection(type: SectionType, existing: Array<{ id: string }>): Section {
  return { id: newSectionId(type, existing), type, hidden: false, props: SECTION_DEFINITIONS[type].defaults() } as Section;
}
