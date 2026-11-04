import { describe, expect, it } from 'vitest';
import {
  rewritePrompt,
  buildStarterTheme,
  PHOTO_SECTIONS, withThemeCollections, sampleCatalog,
  applyOps, applyTemplate, buildTheme, composeGeneratedTheme, contrastRatio, fallbackGenerate, fromLegacyTheme,
  fromOrvexaProducts, GenerateBrief, isSafeHref, isSafeImageUrl, NICHES, parseJsonLoose, publishChecks, TEMPLATES,
  templatesForNiche, validateTheme,
} from './index';

const base = () => buildTheme('heritage-drape', { brandName: 'Aarunya', nicheId: 'sarees-ethnic' });

describe('templates', () => {
  it('has at least 24 templates with unique ids', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(24);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it.each(TEMPLATES.map((t) => [t.id]))('%s builds a valid theme', (id) => {
    expect(validateTheme(buildTheme(id, { brandName: 'Test Store', nicheId: 'general' })).ok).toBe(true);
  });

  it.each(TEMPLATES.map((t) => [t.id, t]))('%s has readable text and buttons (WCAG AA)', (_id, template) => {
    const c = template.tokens.colors;
    expect(contrastRatio(c.text, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.text, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.muted, c.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('templates differ in structure, not only colour', () => {
    const signatures = TEMPLATES.map((t) => JSON.stringify([t.home.map((s) => s.type), (t.home[0].props as { variant: string }).variant, t.tokens.buttonStyle, t.tokens.cardStyle, t.tokens.imageShape]));
    expect(new Set(signatures).size).toBe(TEMPLATES.length);
  });

  it('recommends templates for every niche', () => {
    for (const niche of NICHES) expect(templatesForNiche(niche.id).length).toBe(TEMPLATES.length);
  });

  it('keeps merchant work when switching template', () => {
    const edited = applyOps(base(), [{ op: 'update_seo', title: 'Aarunya handloom sarees' }, { op: 'update_section', page: 'home', sectionId: 'hero-1', props: { heading: 'My own words' } }]);
    if (!edited.ok) throw new Error(edited.errors.join());
    const switched = applyTemplate(edited.theme, 'runway-mono');
    expect(switched.templateId).toBe('runway-mono');
    expect(switched.seo.title).toBe('Aarunya handloom sarees');
    const hero = switched.pages.home.sections.find((s) => s.type === 'hero');
    expect(hero?.props).toMatchObject({ heading: 'My own words', variant: 'full-bleed' });
  });
});

describe('photos, pages and categories', () => {
  it.each(TEMPLATES.map((t) => [t.id]))('%s shows at least three photo sections on the homepage', (id) => {
    const theme = buildTheme(id, { brandName: 'A', nicheId: 'general' });
    expect(theme.pages.home.sections.filter((s) => PHOTO_SECTIONS.includes(s.type)).length).toBeGreaterThanOrEqual(3);
  });

  it('upgrades a theme saved before About, Contact and multi-message announcements existed', () => {
     
    const old = JSON.parse(JSON.stringify(base())) as { pages: Record<string, unknown>; collections?: unknown; header: { announcement: unknown; icons?: unknown } };
    delete old.pages.about;
    delete old.pages.contact;
    delete old.collections;
    old.header.announcement = { enabled: true, text: 'Diwali sale', href: '' };
    delete old.header.icons;
    const result = validateTheme(old);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.theme.header.announcement.messages).toEqual(['Diwali sale']);
      expect(result.theme.pages.contact.sections[0].type).toBe('contact-details');
      expect(result.theme.header.icons.search).toBe(true);
    }
  });

  it('keeps the contact details on the contact page', () => {
    expect(applyOps(base(), [{ op: 'remove_section', page: 'contact', sectionId: 'contact-details-1' }]).ok).toBe(false);
  });

  it('merges custom and renamed categories into the catalogue', () => {
    const catalog = sampleCatalog('s', 'sarees-ethnic');
    const result = applyOps(base(), [
      { op: 'upsert_collection', collection: { id: 'diwali-edit', kind: 'custom', title: 'Diwali edit', description: '', productIds: ['sample-1', 'sample-3'], hidden: false } },
      { op: 'upsert_collection', collection: { id: 'festive', kind: 'catalog', title: 'Festive favourites', description: '', productIds: [], hidden: false } },
      { op: 'upsert_collection', collection: { id: 'everyday', kind: 'catalog', title: 'Everyday', description: '', productIds: [], hidden: true } },
    ]);
    if (!result.ok) throw new Error(result.errors.join());
    const merged = withThemeCollections(catalog, result.theme);
    expect(merged.collections.map((c) => c.title)).toEqual(['Festive favourites', 'Wedding', 'Diwali edit']);
    expect(merged.products.find((p) => p.id === 'sample-1')?.collectionIds).toContain('diwali-edit');
  });

  it('stops AI from changing categories or gallery photos', () => {
    const theme = base();
    expect(applyOps(theme, [{ op: 'remove_collection', id: 'x' }], 'ai').ok).toBe(false);
    expect(applyOps(theme, [{ op: 'add_section', page: 'home', sectionType: 'gallery', props: { images: [{ url: 'https://evil.example/a.jpg', alt: '' }] } }], 'ai').ok).toBe(false);
  });
});

describe('Magic AI prompts', () => {
  it('write mode works on an empty field and asks for [placeholders] instead of invented facts', () => {
    const [system, user] = rewritePrompt({ text: '', style: 'write', fieldLabel: 'Text', maxLength: 300, brandName: 'Kesari', nicheId: 'pantry', context: 'Photo with text' });
    expect(system.content).toMatch(/square brackets/);
    expect(system.content).toMatch(/Never invent product facts/);
    expect(JSON.parse(user.content)).toMatchObject({ task: 'write', block: 'Photo with text', field: 'Text' });
  });
  it('rewrite modes keep to the merchant’s own facts', () => {
    const [system] = rewritePrompt({ text: 'Hand-ground spices.', style: 'shorter', fieldLabel: 'Headline', maxLength: 120, brandName: 'Kesari', nicheId: 'pantry' });
    expect(system.content).toMatch(/Do not add facts that are not in the original/);
  });
});

describe('starter page', () => {
  it('is valid, uses fresh text and offers photo spots', () => {
    const theme = buildStarterTheme({ brandName: 'Kesari Spices', nicheId: 'pantry' });
    expect(validateTheme(theme).ok).toBe(true);
    const hero = theme.pages.home.sections[0];
    expect(hero.props).toMatchObject({ heading: 'Welcome to Kesari Spices' });
    expect(theme.pages.home.sections.filter((s) => PHOTO_SECTIONS.includes(s.type)).length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(theme)).not.toMatch(/Drapes for the days|Product one|Your headline/);
  });
});

describe('operations', () => {
  it('applies a valid batch atomically', () => {
    const result = applyOps(base(), [
      { op: 'add_section', page: 'home', sectionType: 'faq', index: 1 },
      { op: 'set_tokens', changes: { radius: 'round', colors: { accent: '#123456' } } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.theme.pages.home.sections[1].type).toBe('faq');
      expect(result.theme.tokens.colors.accent).toBe('#123456');
      expect(result.theme.tokens.colors.primary).toBe('#6e1f2f');
    }
  });

  it('rejects the whole batch if one change is invalid', () => {
    const result = applyOps(base(), [{ op: 'update_brand', name: 'New name' }, { op: 'set_tokens', changes: { colors: { primary: 'red' } } }]);
    expect(result.ok).toBe(false);
  });

  it('protects structural sections', () => {
    const theme = base();
    const main = theme.pages.product.sections.find((s) => s.type === 'product-main')!;
    expect(applyOps(theme, [{ op: 'remove_section', page: 'product', sectionId: main.id }]).ok).toBe(false);
    expect(applyOps(theme, [{ op: 'set_section_hidden', page: 'product', sectionId: main.id, hidden: true }]).ok).toBe(false);
    expect(applyOps(theme, [{ op: 'add_section', page: 'product', sectionType: 'product-main' }]).ok).toBe(false);
    expect(applyOps(theme, [{ op: 'add_section', page: 'home', sectionType: 'product-main' }]).ok).toBe(false);
  });

  it('stops AI from adding photos, outside links or contact details', () => {
    const theme = base();
    const photo = { op: 'update_section', page: 'home', sectionId: 'hero-1', props: { image: { url: 'https://evil.example/x.jpg', alt: '' } } };
    const link = { op: 'update_section', page: 'home', sectionId: 'hero-1', props: { ctaHref: 'https://evil.example' } };
    const contact = { op: 'update_footer', changes: { contact: { phone: '999', email: '', address: '' } } };
    for (const op of [photo, link, contact]) {
      expect(applyOps(theme, [op], 'ai').ok).toBe(false);
      expect(applyOps(theme, [op], 'merchant').ok).toBe(true);
    }
  });

  it('rejects unknown operations and code-like values', () => {
    expect(applyOps(base(), [{ op: 'run_sql', sql: 'drop table' }]).ok).toBe(false);
    expect(applyOps(base(), [{ op: 'update_section', page: 'home', sectionId: 'hero-1', props: { ctaHref: 'javascript:alert(1)' } }]).ok).toBe(false);
    expect(applyOps(base(), [{ op: 'update_section', page: 'home', sectionId: 'hero-1', props: { heading: 'x'.repeat(500) } }]).ok).toBe(false);
  });
});

describe('safe values', () => {
  it('allows store links and https only', () => {
    expect(['/collections/all', 'https://instagram.com/x', 'mailto:a@b.in', 'tel:+919000000000', ''].every(isSafeHref)).toBe(true);
    expect(['javascript:alert(1)', 'http://x.com', '//evil.com', 'data:text/html,x'].some(isSafeHref)).toBe(false);
  });
  it('allows uploaded and https images only', () => {
    expect(isSafeImageUrl('/assets/store-1/a.webp')).toBe(true);
    expect(isSafeImageUrl('/assets/../etc/passwd')).toBe(false);
    expect(isSafeImageUrl('data:image/png;base64,AAAA')).toBe(false);
  });
});

describe('AI composition', () => {
  const brief = GenerateBrief.parse({ brandName: 'Kesari Spices', nicheId: 'pantry', about: 'Family spice blends from Guntur.' });

  it('falls back to an honest, valid store without a model', () => {
    const { theme } = composeGeneratedTheme(brief, fallbackGenerate(brief));
    expect(theme.templateId).toBe('spice-route');
    expect(theme.seo.title).toContain('Kesari Spices');
  });

  it('ignores an unknown template choice from the model', () => {
    const output = { ...fallbackGenerate(brief), templateId: 'does-not-exist' };
    const { theme, notes } = composeGeneratedTheme(brief, output);
    expect(theme.templateId).toBe('spice-route');
    expect(notes.length).toBe(1);
  });

  it('parses JSON wrapped in prose or code fences', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Sure! {"a":{"b":"}"}} done')).toEqual({ a: { b: '}' } });
  });
});

describe('publish checks', () => {
  it('flags an empty announcement bar as blocking', () => {
    const result = applyOps(base(), [{ op: 'update_header', changes: { announcement: { enabled: true, text: '' } } }]);
    if (!result.ok) throw new Error(result.errors.join());
    expect(publishChecks(result.theme).some((c) => c.id === 'announcement' && c.level === 'error')).toBe(true);
  });
});

describe('OrvexaCloud adapters', () => {
  // Shape copied from GET /api/stores/{slug}/products on orvexacloud.in.
  const record = { _id: 'abc', id: 1, name: 'cotton pats', category: 'pats', price: 200, desc: 'its cotton cloths', badge: 'NEW LAUNCH', sizes: ['S', 'M'], imgMain: 'data:image/jpeg;base64,AAAA', images: ['data:image/jpeg;base64,AAAA'], stockCount: 0, isFeatured: false, createdAt: '2026-10-31T12:41:28.523Z' };

  it('maps products, prices in paise and de-duplicates images', () => {
    const catalog = fromOrvexaProducts('e2econn1713', [record]);
    const product = catalog.products[0];
    expect(product).toMatchObject({ id: '1', handle: 'cotton-pats-1', priceMinor: 20000, availability: 'out-of-stock' });
    expect(product.images).toHaveLength(1);
    expect(product.variants.map((v) => v.title)).toEqual(['S', 'M']);
    expect(catalog.collections).toEqual([{ id: 'pats', handle: 'pats', title: 'pats', description: '' }]);
  });

  it('treats zero stock as sold out or untracked, as configured', () => {
    expect(fromOrvexaProducts('s', [record], { zeroStockMeans: 'untracked' }).products[0].availability).toBe('in-stock');
    expect(fromOrvexaProducts('s', [{ ...record, stockCount: 3 }]).products[0].availability).toBe('low-stock');
  });

  it('migrates a legacy theme without losing settings', () => {
    const { theme, warnings } = fromLegacyTheme({
      slug: 'e2econn1713', brandName: 'E2E Connection Store', storeType: 'other',
      theme: { primaryColor: '#b920bc', accentColor: '#db3b1f', backgroundColor: '#FAFAF8', fontDisplay: "'Instrument Serif', Georgia, serif", fontSans: "'Work Sans', system-ui", heroHeadline: 'E2E Connection Store', heroCtaText: 'SHOP NOW →', announcementMessages: ['WELCOME'], heroImage: 'data:image/jpeg;base64,AAAA' },
    });
    expect(theme.tokens.colors).toMatchObject({ primary: '#b920bc', accent: '#db3b1f', background: '#fafaf8' });
    expect(theme.tokens.fonts).toEqual({ display: 'instrument-serif', body: 'hanken' });
    expect(theme.header.announcement).toMatchObject({ enabled: true, messages: ['WELCOME'], style: 'static' });
    expect(theme.pages.home.sections[0].props).toMatchObject({ ctaLabel: 'SHOP NOW', variant: 'full-bleed' });
    expect(warnings[0]).toMatch(/hero photo/);
  });
});
