import { defaultAboutSections, defaultContactSections, Theme, THEME_SCHEMA_VERSION, type Section, type SectionType, type Tokens } from './schema';
import { SECTION_DEFINITIONS } from './sections';

/**
 * Templates are data. Each one combines a hero layout, a homepage rhythm,
 * a palette, a type pairing and global component styles, so templates differ
 * in structure as well as colour.
 *
 * Copy is evocative but makes no product claims: no materials, origins,
 * delivery promises or offers. Trust lines only mention what every Orvexa
 * store has (UPI/card checkout via Razorpay).
 */

type SectionSpec = { type: SectionType; props?: Record<string, unknown> };

export type TemplateDefinition = {
  id: string;
  name: string;
  /** One line a merchant reads when choosing. */
  description: string;
  niches: string[];
  tokens: Tokens;
  headerLayout: 'logo-left' | 'logo-center';
  home: SectionSpec[];
};

const PLATFORM_TRUST = ['Pay by UPI or card', 'Secure checkout'];

function tokens(
  colors: Tokens['colors'],
  fonts: [Tokens['fonts']['display'], Tokens['fonts']['body']],
  style: Omit<Tokens, 'colors' | 'fonts'>,
): Tokens {
  return { colors, fonts: { display: fonts[0], body: fonts[1] }, ...style };
}

const hero = (variant: string, heading: string, subheading: string, ctaLabel = 'Shop the collection', eyebrow = ''): SectionSpec =>
  ({ type: 'hero', props: { variant, heading, subheading, ctaLabel, ctaHref: '/collections/all', eyebrow } });
const grid = (heading: string, source: 'newest' | 'featured', columns = 4, limit = 4, subheading = ''): SectionSpec =>
  ({ type: 'product-grid', props: { heading, subheading, source: { kind: source }, columns, limit, showViewAll: true } });
const collections = (heading: string, layout: 'tiles' | 'chips' = 'tiles'): SectionSpec => ({ type: 'collection-list', props: { heading, layout } });
const story = (heading: string, body: string, imagePosition: 'left' | 'right' = 'left'): SectionSpec =>
  ({ type: 'image-with-text', props: { heading, body, imagePosition } });
const text = (heading: string, body: string, align: 'left' | 'center' = 'center'): SectionSpec => ({ type: 'rich-text', props: { heading, body, align } });
const trust = (): SectionSpec => ({ type: 'trust-bar', props: { items: PLATFORM_TRUST } });
const newsletter = (heading: string, body = ''): SectionSpec => ({ type: 'newsletter', props: { heading, body, buttonLabel: 'Subscribe' } });

const STORY_BODY = 'Tell shoppers who you are, who makes your pieces and what you care about. A few honest sentences work better than a long essay.';

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'heritage-drape', name: 'Heritage Drape', niches: ['sarees-ethnic', 'handloom-textiles'],
    description: 'Ivory and maroon with a three-photo hero. Made for occasion wear.',
    tokens: tokens({ background: '#f6efe2', surface: '#ece1cc', text: '#2a1a17', muted: '#6d5a4f', primary: '#6e1f2f', onPrimary: '#fbf4e6', accent: '#a5772f' }, ['cormorant', 'karla'],
      { radius: 'sharp', spacing: 'airy', headingCase: 'as-written', buttonStyle: 'outline', cardStyle: 'plain', imageShape: 'tall' }),
    headerLayout: 'logo-center',
    home: [hero('triptych', 'Drapes for the days you remember', 'Explore pieces chosen for weddings, festivals and every celebration in between.'), collections('Shop by occasion'), grid('New arrivals', 'newest', 4), story('The hands behind every drape', STORY_BODY), trust(), newsletter('First look at new arrivals')],
  },
  {
    id: 'kanjivaram-night', name: 'Temple Gold', niches: ['sarees-ethnic', 'gifting-festive', 'jewellery'],
    description: 'Deep green and gold, dark and rich. For festive and bridal collections.',
    tokens: tokens({ background: '#10261f', surface: '#173329', text: '#f3e9d2', muted: '#b9ad93', primary: '#d2ab55', onPrimary: '#10261f', accent: '#e7c98a' }, ['cormorant', 'mukta'],
      { radius: 'sharp', spacing: 'airy', headingCase: 'uppercase', buttonStyle: 'solid', cardStyle: 'caption-overlay', imageShape: 'tall' }),
    headerLayout: 'logo-center',
    home: [hero('full-bleed', 'Woven for the festive season', 'A collection for weddings, poojas and family gatherings.', 'Explore the collection'), grid('The festive edit', 'featured', 3, 3), collections('Shop by collection', 'chips'), story('A store built on tradition', STORY_BODY, 'right'), trust()],
  },
  {
    id: 'indigo-loom', name: 'Indigo Loom', niches: ['handloom-textiles', 'block-print'],
    description: 'Indigo with a madder-red accent and an editorial headline.',
    tokens: tokens({ background: '#f2f0ea', surface: '#e3e1d8', text: '#1c2340', muted: '#5c6178', primary: '#1f2f5a', onPrimary: '#f2f0ea', accent: '#b04a32' }, ['fraunces', 'manrope'],
      { radius: 'soft', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'solid', cardStyle: 'framed', imageShape: 'portrait' }),
    headerLayout: 'logo-left',
    home: [hero('editorial', 'Cloth with a story in every thread', 'Browse the collection and meet the people who make it.'), story('From the loom', STORY_BODY), grid('Recently woven', 'newest', 3, 6), collections('Explore by weave'), newsletter('Stories from the loom', 'Occasional letters about new pieces and the people behind them.')],
  },
  {
    id: 'khadi-house', name: 'Unbleached', niches: ['handloom-textiles', 'fashion', 'wellness'],
    description: 'Undyed-cloth tones and plain typography. Quiet and honest.',
    tokens: tokens({ background: '#ece6d8', surface: '#e1d9c6', text: '#2b2a26', muted: '#69655b', primary: '#2b2a26', onPrimary: '#ece6d8', accent: '#86683a' }, ['instrument-serif', 'karla'],
      { radius: 'sharp', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'underline', cardStyle: 'plain', imageShape: 'square' }),
    headerLayout: 'logo-left',
    home: [hero('split', 'Simple clothes, made slowly', 'Everyday pieces you will reach for again and again.', 'Shop everything'), grid('In the store now', 'newest', 4, 8), text('Why we make things this way', STORY_BODY, 'left'), trust()],
  },
  {
    id: 'dabu-block', name: 'Printmaker', niches: ['block-print', 'home-decor', 'fashion'],
    description: 'Ink-dark text, rust accent and photo-led product cards.',
    tokens: tokens({ background: '#f4ebdd', surface: '#e9dcc6', text: '#22263a', muted: '#5f5a55', primary: '#22263a', onPrimary: '#f4ebdd', accent: '#a8412a' }, ['fraunces', 'karla'],
      { radius: 'soft', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'solid', cardStyle: 'caption-overlay', imageShape: 'square' }),
    headerLayout: 'logo-left',
    home: [hero('editorial', 'Printed by hand, made to live with', 'Prints for your wardrobe and your home.'), collections('Browse the prints'), grid('Fresh off the table', 'newest', 4), story('How a print is made', STORY_BODY, 'right'), newsletter('New prints, first')],
  },
  {
    id: 'ajrakh-night', name: 'Night Print', niches: ['block-print', 'handloom-textiles'],
    description: 'Dark indigo night with warm rust and ochre. Bold and modern.',
    tokens: tokens({ background: '#1b1d2a', surface: '#25283a', text: '#efe6d6', muted: '#b3ab9c', primary: '#d26a47', onPrimary: '#1b1d2a', accent: '#d9b26f' }, ['instrument-serif', 'hanken'],
      { radius: 'sharp', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'pill', cardStyle: 'plain', imageShape: 'portrait' }),
    headerLayout: 'logo-center',
    home: [hero('full-bleed', 'Patterns with a long memory', 'Discover the new collection.'), grid('New this season', 'newest', 3, 6), collections('Collections', 'chips'), text('Our craft', STORY_BODY), trust()],
  },
  {
    id: 'runway-mono', name: 'Runway', niches: ['fashion', 'jewellery'],
    description: 'Black, white and one red accent. Big photos, capital headlines.',
    tokens: tokens({ background: '#f5f5f3', surface: '#e7e7e3', text: '#141518', muted: '#5d5f63', primary: '#141518', onPrimary: '#f5f5f3', accent: '#d23a26' }, ['syne', 'manrope'],
      { radius: 'sharp', spacing: 'compact', headingCase: 'uppercase', buttonStyle: 'underline', cardStyle: 'plain', imageShape: 'tall' }),
    headerLayout: 'logo-center',
    home: [hero('full-bleed', 'The new season is here', 'Silhouettes for every day of the week.', 'Shop new in'), grid('New in', 'newest', 4, 8), collections('Shop the categories', 'chips'), newsletter('Get the drop first')],
  },
  {
    id: 'street-edit', name: 'Street Edit', niches: ['fashion', 'general'],
    description: 'Loud yellow on off-white, chunky type and rounded buttons.',
    tokens: tokens({ background: '#fffdf6', surface: '#f4efdd', text: '#1d1d1b', muted: '#5a5a55', primary: '#1d1d1b', onPrimary: '#ffd23f', accent: '#ffd23f' }, ['bricolage', 'hanken'],
      { radius: 'round', spacing: 'compact', headingCase: 'uppercase', buttonStyle: 'pill', cardStyle: 'raised', imageShape: 'portrait' }),
    headerLayout: 'logo-left',
    home: [hero('split', 'Fresh fits, every week', 'Pieces made for the city.', 'Shop the drop'), trust(), grid('Trending now', 'featured', 4), grid('Just landed', 'newest', 4), collections('Find your style', 'chips')],
  },
  {
    id: 'soft-tailoring', name: 'Soft Tailoring', niches: ['fashion', 'jewellery', 'wellness'],
    description: 'Warm neutrals and a quiet centred hero. Premium and calm.',
    tokens: tokens({ background: '#efeae4', surface: '#e2dbd2', text: '#2e2a27', muted: '#6c645d', primary: '#4f3c2f', onPrimary: '#f4efe9', accent: '#9a7d5d' }, ['instrument-serif', 'manrope'],
      { radius: 'soft', spacing: 'airy', headingCase: 'as-written', buttonStyle: 'solid', cardStyle: 'plain', imageShape: 'portrait' }),
    headerLayout: 'logo-center',
    home: [hero('centered', 'Considered pieces for everyday', 'A small collection, designed to last.'), grid('The collection', 'featured', 3, 3), story('Designed with care', STORY_BODY), grid('New arrivals', 'newest', 4), newsletter('Hear from us')],
  },
  {
    id: 'atelier-noir', name: 'Atelier Noir', niches: ['jewellery', 'fashion'],
    description: 'A dark gallery with gold detail. Lets each piece shine.',
    tokens: tokens({ background: '#17151a', surface: '#221f26', text: '#ece4d8', muted: '#aaa196', primary: '#d4b06a', onPrimary: '#17151a', accent: '#b89a63' }, ['cormorant', 'manrope'],
      { radius: 'sharp', spacing: 'airy', headingCase: 'uppercase', buttonStyle: 'outline', cardStyle: 'plain', imageShape: 'square' }),
    headerLayout: 'logo-center',
    home: [hero('editorial', 'Objects to keep close', 'An edit of pieces with presence.', 'View the collection'), grid('Signature pieces', 'featured', 3, 3), collections('Collections', 'chips'), story('The atelier', STORY_BODY, 'right'), trust()],
  },
  {
    id: 'pearl-thread', name: 'Pearl & Plum', niches: ['jewellery', 'gifting-festive', 'beauty'],
    description: 'Blush paper with plum and soft framed product cards.',
    tokens: tokens({ background: '#f7f3ef', surface: '#ede4dc', text: '#2f2230', muted: '#6a5c66', primary: '#3d2c3e', onPrimary: '#f7f3ef', accent: '#a9784f' }, ['fraunces', 'nunito'],
      { radius: 'round', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'pill', cardStyle: 'framed', imageShape: 'square' }),
    headerLayout: 'logo-left',
    home: [hero('centered', 'Little things, beautifully made', 'Find a piece for yourself, or someone you love.', 'Start browsing'), collections('Shop by category'), grid('Most loved', 'featured', 4), newsletter('Be first to see new pieces')],
  },
  {
    id: 'botanical-clean', name: 'Botanical', niches: ['beauty', 'wellness', 'pantry'],
    description: 'Leaf green and rose with soft raised cards. Fresh and gentle.',
    tokens: tokens({ background: '#eef1ea', surface: '#dfe5d8', text: '#22301f', muted: '#56624f', primary: '#39543f', onPrimary: '#f2f5ee', accent: '#a8506c' }, ['bricolage', 'nunito'],
      { radius: 'round', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'pill', cardStyle: 'raised', imageShape: 'square' }),
    headerLayout: 'logo-left',
    home: [hero('split', 'A gentler daily routine', 'Find products that fit the way you care for yourself.'), grid('Bestsellers', 'featured', 4), story('What goes into our products', 'Explain how you choose what you make, in your own words. List ingredients only on product pages, exactly as on the label.'), collections('Shop by need', 'chips'), newsletter('Routines and new launches')],
  },
  {
    id: 'clinic-white', name: 'Clear Formula', niches: ['beauty', 'wellness'],
    description: 'Clean white and navy with a crisp blue accent. Clinical and clear.',
    tokens: tokens({ background: '#f8f9fb', surface: '#eceff4', text: '#1c2433', muted: '#556074', primary: '#1c2433', onPrimary: '#f8f9fb', accent: '#3e6fd8' }, ['manrope', 'manrope'],
      { radius: 'soft', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'pill', cardStyle: 'plain', imageShape: 'square' }),
    headerLayout: 'logo-left',
    home: [hero('centered', 'Skincare, made simple', 'Clear products with clear labels.', 'Shop all products'), collections('Shop by concern', 'chips'), grid('Start here', 'featured', 4), text('How we make products', STORY_BODY), trust()],
  },
  {
    id: 'little-sprout', name: 'Little Sprout', niches: ['baby-kids'],
    description: 'Calm teal and apricot with rounded shapes. Soft and friendly.',
    tokens: tokens({ background: '#fbf6ee', surface: '#f1e7d8', text: '#21363d', muted: '#5b6a6e', primary: '#2f5d6b', onPrimary: '#fbf6ee', accent: '#d9822f' }, ['nunito', 'nunito'],
      { radius: 'round', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'pill', cardStyle: 'raised', imageShape: 'square' }),
    headerLayout: 'logo-left',
    home: [hero('split', 'Small things for big days', 'Thoughtful essentials for little ones.', 'Shop essentials'), collections('Shop by age'), grid('Parents’ favourites', 'featured', 4), story('Why we started', STORY_BODY), newsletter('New arrivals for little ones')],
  },
  {
    id: 'playroom', name: 'Playroom', niches: ['baby-kids', 'gifting-festive'],
    description: 'Tomato red and sky blue with framed cards. Bright and playful.',
    tokens: tokens({ background: '#fff8e7', surface: '#fbe9c4', text: '#2a1f1a', muted: '#6b5b4f', primary: '#c8402a', onPrimary: '#fff8e7', accent: '#2e78a8' }, ['bricolage', 'nunito'],
      { radius: 'round', spacing: 'compact', headingCase: 'as-written', buttonStyle: 'solid', cardStyle: 'framed', imageShape: 'square' }),
    headerLayout: 'logo-center',
    home: [hero('editorial', 'Made for play', 'Toys, clothes and gifts for curious kids.', 'Let’s go shopping'), grid('New toys and clothes', 'newest', 4), collections('Shop by category', 'chips'), trust(), newsletter('Fun stuff in your inbox')],
  },
  {
    id: 'utsav', name: 'Utsav', niches: ['gifting-festive', 'sarees-ethnic', 'pantry'],
    description: 'Wine red and marigold with a three-photo hero. Ready for festivals.',
    tokens: tokens({ background: '#fbf3e4', surface: '#f2e2c5', text: '#2c1520', muted: '#6d5560', primary: '#7a1f3d', onPrimary: '#fbf3e4', accent: '#d1931a' }, ['fraunces', 'karla'],
      { radius: 'soft', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'solid', cardStyle: 'caption-overlay', imageShape: 'square' }),
    headerLayout: 'logo-center',
    home: [hero('triptych', 'Gifts worth gathering for', 'Find something for everyone on your list.', 'Shop gifts'), collections('Gift by recipient'), grid('Gift favourites', 'featured', 4), story('Wrapped with care', STORY_BODY, 'right'), newsletter('Festive launches, first')],
  },
  {
    id: 'diwali-lights', name: 'Festival of Lights', niches: ['gifting-festive', 'home-decor'],
    description: 'Midnight purple and lamp-light gold. A campaign-ready dark theme.',
    tokens: tokens({ background: '#1a1033', surface: '#261946', text: '#f6e7c8', muted: '#c2b39a', primary: '#f2b33d', onPrimary: '#1a1033', accent: '#ec7a6a' }, ['instrument-serif', 'hanken'],
      { radius: 'soft', spacing: 'airy', headingCase: 'as-written', buttonStyle: 'pill', cardStyle: 'raised', imageShape: 'square' }),
    headerLayout: 'logo-center',
    home: [hero('full-bleed', 'Light up the season', 'Gifts and decor for the festive season.', 'Shop the festive edit'), grid('The festive edit', 'featured', 3, 6), collections('Shop by collection', 'chips'), newsletter('Festive drops, first')],
  },
  {
    id: 'clay-kiln', name: 'Clay & Kiln', niches: ['home-decor', 'block-print'],
    description: 'Fired-clay browns and sage. Wide photos for objects and rooms.',
    tokens: tokens({ background: '#ece5da', surface: '#ded4c4', text: '#33291f', muted: '#6b5e4f', primary: '#6b4a33', onPrimary: '#f3ede4', accent: '#6f7a4c' }, ['fraunces', 'hanken'],
      { radius: 'soft', spacing: 'airy', headingCase: 'as-written', buttonStyle: 'outline', cardStyle: 'plain', imageShape: 'landscape' }),
    headerLayout: 'logo-left',
    home: [hero('split', 'Objects for slower living', 'Pieces for the table, the shelf and the corners you love.'), collections('Shop by room'), grid('New pieces', 'newest', 3, 6), story('From the studio', STORY_BODY, 'right'), trust()],
  },
  {
    id: 'modern-nest', name: 'Modern Nest', niches: ['home-decor', 'general'],
    description: 'Slate and brass with sharp edges. Contemporary and architectural.',
    tokens: tokens({ background: '#f4f4f1', surface: '#e6e6e0', text: '#20262a', muted: '#5b6266', primary: '#2f3e46', onPrimary: '#f4f4f1', accent: '#a5824a' }, ['syne', 'manrope'],
      { radius: 'sharp', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'solid', cardStyle: 'framed', imageShape: 'landscape' }),
    headerLayout: 'logo-left',
    home: [hero('editorial', 'Design for the way you live', 'Furniture, lighting and objects with clean lines.'), grid('Featured', 'featured', 2, 4), collections('Shop by room', 'chips'), grid('New arrivals', 'newest', 4), newsletter('New designs, first')],
  },
  {
    id: 'spice-route', name: 'Spice Route', niches: ['pantry', 'gifting-festive'],
    description: 'Turmeric and chilli-brown with warm raised cards. Appetising.',
    tokens: tokens({ background: '#fbf2e2', surface: '#f2e1c2', text: '#2e1a0e', muted: '#6e5745', primary: '#8a3b12', onPrimary: '#fbf2e2', accent: '#c88a12' }, ['fraunces', 'karla'],
      { radius: 'soft', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'solid', cardStyle: 'raised', imageShape: 'square' }),
    headerLayout: 'logo-left',
    home: [hero('split', 'Bring more flavour to the table', 'Pantry staples and small-batch finds.', 'Shop the pantry'), grid('Pantry favourites', 'featured', 4), collections('Shop by category', 'chips'), story('Where it comes from', 'Describe how you choose what you sell. State origin and ingredients only on product pages, exactly as on your labels.'), trust()],
  },
  {
    id: 'kitchen-garden', name: 'Kitchen Garden', niches: ['pantry', 'wellness', 'beauty'],
    description: 'Fresh leaf green and orange with framed cards. Natural and lively.',
    tokens: tokens({ background: '#f3f5ec', surface: '#e3e9d4', text: '#1f2a16', muted: '#55604a', primary: '#3f5e2a', onPrimary: '#f3f5ec', accent: '#b9621c' }, ['bricolage', 'manrope'],
      { radius: 'round', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'pill', cardStyle: 'framed', imageShape: 'landscape' }),
    headerLayout: 'logo-left',
    home: [hero('centered', 'Good food starts in the pantry', 'Simple ingredients for everyday cooking.', 'Start shopping'), trust(), collections('Shop the pantry'), grid('This week’s picks', 'featured', 3, 6), story('How we choose what we sell', 'Describe how you pick suppliers and products. Put ingredients and origin on each product page, exactly as on the label.', 'right'), newsletter('Recipes and new arrivals')],
  },
  {
    id: 'slow-ritual', name: 'Slow Ritual', niches: ['wellness', 'beauty', 'home-decor'],
    description: 'Sage, stone and lots of space. Calm and unhurried.',
    tokens: tokens({ background: '#f1efe9', surface: '#e3e0d6', text: '#262c28', muted: '#5f665f', primary: '#4a5a51', onPrimary: '#f1efe9', accent: '#8f7b5a' }, ['instrument-serif', 'nunito'],
      { radius: 'round', spacing: 'airy', headingCase: 'as-written', buttonStyle: 'outline', cardStyle: 'plain', imageShape: 'tall' }),
    headerLayout: 'logo-center',
    home: [hero('centered', 'Make space for your routine', 'A calm collection for everyday rituals.'), text('Our approach', STORY_BODY), grid('Daily essentials', 'featured', 3, 3), newsletter('Notes on slow living')],
  },
  {
    id: 'studio-catalogue', name: 'Catalogue', niches: ['general', 'fashion', 'home-decor', 'pantry'],
    description: 'Plain white, tight grid and products first. For large ranges.',
    tokens: tokens({ background: '#ffffff', surface: '#f1f1f1', text: '#1b1b1b', muted: '#5f5f5f', primary: '#1b1b1b', onPrimary: '#ffffff', accent: '#2d5bd7' }, ['hanken', 'hanken'],
      { radius: 'soft', spacing: 'compact', headingCase: 'as-written', buttonStyle: 'solid', cardStyle: 'plain', imageShape: 'square' }),
    headerLayout: 'logo-left',
    home: [hero('editorial', 'Shop the full range', 'Browse every product in one place.', 'View all products'), collections('Categories', 'chips'), grid('New arrivals', 'newest', 4, 8), grid('Popular', 'featured', 4, 8), trust()],
  },
  {
    id: 'bazaar-bright', name: 'Bazaar', niches: ['general', 'gifting-festive', 'fashion'],
    description: 'Navy and marigold yellow with bold rounded cards. Confident.',
    tokens: tokens({ background: '#fff7ec', surface: '#fbe8c8', text: '#12163a', muted: '#4c5072', primary: '#12163a', onPrimary: '#fff7ec', accent: '#ffc21a' }, ['bricolage', 'hanken'],
      { radius: 'round', spacing: 'regular', headingCase: 'as-written', buttonStyle: 'pill', cardStyle: 'raised', imageShape: 'square' }),
    headerLayout: 'logo-left',
    home: [hero('split', 'Something for everyone', 'Find your next favourite thing.', 'Start shopping'), trust(), collections('Shop by category'), grid('Bestsellers', 'featured', 4), grid('New arrivals', 'newest', 4), newsletter('Deals and new arrivals')],
  },
];

function section(type: SectionType, id: string, props: Record<string, unknown> = {}): Section {
  return { id, type, hidden: false, props: { ...SECTION_DEFINITIONS[type].defaults(), ...props } } as Section;
}

/** Section types that carry a merchant photo. */
export const PHOTO_SECTIONS: SectionType[] = ['hero', 'image-with-text', 'image-banner', 'gallery'];

/**
 * Every template shows at least three photo spots on the homepage, so a
 * merchant sees where their pictures go and how the finished store will look.
 * Missing spots are filled with a photo banner, then a gallery, placed before
 * the closing sign-up or promise strip.
 */
function withPhotoSections(specs: SectionSpec[], index: number): SectionSpec[] {
  const result = [...specs];
  const extras: SectionSpec[] = index % 2 === 0
    ? [{ type: 'gallery', props: { heading: 'In the studio', layout: index % 4 === 0 ? 'mosaic' : 'grid', slots: 3 } }, { type: 'image-banner', props: { heading: 'The new collection', ctaLabel: 'Shop now', ctaHref: '/collections/all' } }]
    : [{ type: 'image-banner', props: { heading: 'The new collection', ctaLabel: 'Shop now', ctaHref: '/collections/all', height: 'tall' } }, { type: 'gallery', props: { heading: 'Worn and loved', layout: 'strip', slots: 4 } }];
  const count = () => result.filter((spec) => PHOTO_SECTIONS.includes(spec.type)).length;
  for (const extra of extras) {
    if (count() >= 3) break;
    const closing = result.findIndex((spec, i) => i > 0 && (spec.type === 'newsletter' || spec.type === 'trust-bar') && i >= result.length - 2);
    result.splice(closing > 0 ? closing : result.length, 0, extra);
  }
  return result;
}

function sectionsWithIds(specs: SectionSpec[]): Section[] {
  const counts = new Map<string, number>();
  return specs.map((spec) => {
    const n = (counts.get(spec.type) ?? 0) + 1;
    counts.set(spec.type, n);
    return section(spec.type, `${spec.type}-${n}`, spec.props);
  });
}

export function getTemplate(id: string): TemplateDefinition {
  const template = TEMPLATES.find((item) => item.id === id);
  if (!template) throw new Error(`Unknown template: ${id}`);
  return template;
}

/** Templates for a niche, best matches first; every template stays available. */
export function templatesForNiche(nicheId: string): TemplateDefinition[] {
  const primary = TEMPLATES.filter((template) => template.niches[0] === nicheId);
  const secondary = TEMPLATES.filter((template) => template.niches.includes(nicheId) && template.niches[0] !== nicheId);
  const rest = TEMPLATES.filter((template) => !template.niches.includes(nicheId));
  return [...primary, ...secondary, ...rest];
}

export type BuildOptions = { brandName: string; nicheId: string };

/** Build a complete, validated theme from a template. */
export function buildTheme(templateId: string, options: BuildOptions): Theme {
  const template = getTemplate(templateId);
  const brandName = options.brandName.trim().slice(0, 80) || 'My store';
  return Theme.parse({
    schemaVersion: THEME_SCHEMA_VERSION,
    templateId: template.id,
    nicheId: options.nicheId,
    brand: { name: brandName },
    tokens: template.tokens,
    header: {
      announcement: { enabled: false, messages: [], href: '', style: 'static', tone: 'primary' },
      layout: template.headerLayout,
      menu: [{ label: 'Shop', href: '/collections/all' }, { label: 'About', href: '/pages/about' }, { label: 'Contact', href: '/pages/contact' }],
      categoryMenu: true,
      icons: { search: true, account: true, wishlist: false },
      background: 'page',
      sticky: true,
    },
    footer: {
      tagline: `${brandName}. Thank you for shopping with us.`,
      showPolicyLinks: true,
      contact: { phone: '', email: '', address: '' },
      social: { instagram: '', facebook: '', youtube: '', pinterest: '', whatsapp: '' },
    },
    pages: {
      home: { sections: sectionsWithIds(withPhotoSections(template.home, TEMPLATES.indexOf(template))) },
      collection: { sections: [section('collection-header', 'collection-header-1'), section('collection-list', 'collection-list-1', { heading: 'More categories', layout: 'chips' }), section('collection-products', 'collection-products-1')] },
      product: { sections: [section('product-main', 'product-main-1'), section('product-info', 'product-info-1'), section('related-products', 'related-products-1')] },
      about: { sections: defaultAboutSections() },
      contact: { sections: defaultContactSections() },
    },
    collections: [],
    seo: { title: brandName.slice(0, 70), description: '' },
  });
}

/**
 * Switch template while keeping the merchant's work: brand, menus, footer,
 * SEO, uploaded photos and their own text on matching sections.
 */
export function applyTemplate(current: Theme, templateId: string): Theme {
  const next = buildTheme(templateId, { brandName: current.brand.name, nicheId: current.nicheId });
  const heroBefore = current.pages.home.sections.find((item) => item.type === 'hero');
  const home = next.pages.home.sections.map((item) => {
    if (item.type === 'hero' && heroBefore?.type === 'hero') {
      const { variant } = item.props;
      return { ...item, props: { ...heroBefore.props, variant } };
    }
    return item;
  });
  return Theme.parse({
    ...next,
    brand: current.brand,
    header: { ...current.header, layout: next.header.layout },
    footer: current.footer,
    seo: current.seo,
    collections: current.collections,
    pages: { ...current.pages, home: { sections: home } },
  });
}

/**
 * Take only a template's look: colours, fonts, buttons, cards, photo shape,
 * spacing and logo position. Every page, including pages edited in the visual
 * editor, stays exactly as it is.
 */
export function applyTemplateStyle(current: Theme, templateId: string): Theme {
  const template = getTemplate(templateId);
  return Theme.parse({
    ...current,
    templateId: template.id,
    tokens: template.tokens,
    header: { ...current.header, layout: template.headerLayout },
  });
}

/**
 * A simple starting page for merchants who would rather build by hand than
 * have AI design the store. Style comes from the best preset for the niche;
 * the text is placeholder copy that tells the merchant what to write.
 */
export function buildStarterTheme(options: BuildOptions): Theme {
  const base = buildTheme(templatesForNiche(options.nicheId)[0].id, options);
  const brand = base.brand.name;
  const home: SectionSpec[] = [
    { type: 'hero', props: { variant: 'split', eyebrow: '', heading: `Welcome to ${brand}`, subheading: 'Say in one line what you make and who it is for.', ctaLabel: 'Shop now', ctaHref: '/collections/all' } },
    { type: 'product-grid', props: { heading: 'Shop the latest', subheading: '', source: { kind: 'newest' }, columns: 4, limit: 4, showViewAll: true } },
    { type: 'image-with-text', props: { heading: `The story behind ${brand}`.slice(0, 100), body: 'Share how you started, who makes your products and what makes them different. Shoppers buy from brands they feel they know.', imagePosition: 'left' } },
    { type: 'gallery', props: { heading: 'A closer look', slots: 3, layout: 'grid' } },
    { type: 'image-banner', props: { heading: 'Discover the collection', ctaLabel: 'Browse all', ctaHref: '/collections/all' } },
    { type: 'newsletter', props: { heading: 'Be the first to know', body: 'New arrivals and offers, straight to your inbox.', buttonLabel: 'Subscribe' } },
  ];
  return Theme.parse({ ...base, templateId: 'starter', pages: { ...base.pages, home: { sections: sectionsWithIds(home) } } });
}
