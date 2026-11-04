import type { CSSProperties, ReactNode } from 'react';
import {
  cleanCss, cleanHtml, FONTS, fontStylesheetHref, formatPrice, getNiche, scopeCss, Section as SectionSchema, SECTION_DEFINITIONS, splitLayout, withThemeCollections,
  type Catalog, type CatalogCollection, type CatalogProduct, type Layout, type LayoutPart, type PageId, type Section, type SectionOf, type Theme,
} from '@orvexa/theme';

/**
 * Renders a theme with live catalogue data. No client JavaScript: the FAQ and
 * mobile menu use <details>, forms post to OrvexaCloud's existing cart and
 * newsletter endpoints. Works as a React Server Component, in a Vite SPA and
 * inside the studio preview.
 */
export type StorefrontProps = {
  theme: Theme;
  catalog: Catalog;
  page: PageId;
  /** Store path prefix, e.g. "/e2econn1713" on orvexacloud.in, or "" on a custom domain. */
  basePath?: string;
  productHandle?: string;
  collectionHandle?: string;
  /** Editor mode marks sections for selection, shows empty-state hints and disables forms. */
  mode?: 'live' | 'editor';
  selectedSectionId?: string;
  /** Hide sections in the editor too (true) or show them faded (false). */
  hideHiddenSections?: boolean;
};

type Ctx = Required<Pick<StorefrontProps, 'theme' | 'catalog' | 'basePath' | 'mode'>> & { product?: CatalogProduct; collection?: CatalogCollection | 'all'; sectionId?: string };

const RADIUS = { sharp: '0px', soft: '10px', round: '22px' } as const;
const SPACE = { compact: '0.8', regular: '1', airy: '1.3' } as const;
const SHAPE = { portrait: '4 / 5', square: '1 / 1', landscape: '4 / 3', tall: '2 / 3' } as const;

export function themeStyle(theme: Theme): CSSProperties {
  const { colors, fonts, radius, spacing, imageShape } = theme.tokens;
  return {
    '--oxs-bg': colors.background, '--oxs-surface': colors.surface, '--oxs-text': colors.text, '--oxs-muted': colors.muted,
    '--oxs-primary': colors.primary, '--oxs-on-primary': colors.onPrimary, '--oxs-accent': colors.accent,
    '--oxs-font-display': FONTS[fonts.display].css, '--oxs-font-body': FONTS[fonts.body].css,
    '--oxs-radius': RADIUS[radius], '--oxs-space': SPACE[spacing], '--oxs-shape': SHAPE[imageShape],
  } as CSSProperties;
}

/** Title, description and font stylesheet for the page <head>. */
export function storefrontHead(theme: Theme, catalog: Catalog, page: PageId, handles: { productHandle?: string; collectionHandle?: string } = {}) {
  const fontHref = fontStylesheetHref([theme.tokens.fonts.display, theme.tokens.fonts.body]);
  const hero = theme.pages.home.sections.find((s) => s.type === 'hero');
  const fallback = (hero?.props as { subheading?: string } | undefined)?.subheading || `Shop ${theme.brand.name} online. Pay securely by UPI or card.`;
  if (page === 'product') {
    const product = catalog.products.find((p) => p.handle === handles.productHandle);
    if (product) return { title: `${product.title} | ${theme.brand.name}`, description: product.description.slice(0, 160) || theme.seo.description || fallback, fontHref };
  }
  if (page === 'collection') {
    const collection = catalog.collections.find((c) => c.handle === handles.collectionHandle);
    if (collection) return { title: `${collection.title} | ${theme.brand.name}`, description: collection.description.slice(0, 160) || theme.seo.description || fallback, fontHref };
  }
  if (page === 'about' || page === 'contact') return { title: `${page === 'about' ? 'About' : 'Contact'} | ${theme.brand.name}`, description: theme.seo.description || fallback, fontHref };
  return { title: theme.seo.title || theme.brand.name, description: theme.seo.description || fallback, fontHref };
}

const link = (ctx: Ctx, href: string) => (href.startsWith('/') ? `${ctx.basePath}${href}` : href);
const productHref = (ctx: Ctx, product: CatalogProduct) => link(ctx, `/products/${product.handle}`);
const collectionHref = (ctx: Ctx, collection: CatalogCollection) => link(ctx, `/collections/${collection.handle}`);

function newest(products: CatalogProduct[]) {
  return [...products].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function selectProducts(catalog: Catalog, source: SectionOf<'product-grid'>['props']['source']): CatalogProduct[] {
  if (source.kind === 'collection') return catalog.products.filter((p) => p.collectionIds.includes(source.collectionId));
  if (source.kind === 'featured') {
    const featured = catalog.products.filter((p) => p.featured);
    return featured.length ? featured : newest(catalog.products);
  }
  return newest(catalog.products);
}

/** Escape JSON for safe embedding inside a <script> tag. */
function jsonLd(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026') };
}

// --------------------------------------------------------------- primitives

function Button({ ctx, href, children, variant = 'primary' }: { ctx: Ctx; href: string; children: ReactNode; variant?: 'primary' | 'secondary' }) {
  if (!children) return null;
  return <a className={`oxs-button oxs-button--${variant}`} href={href ? link(ctx, href) : link(ctx, '/collections/all')}>{children}</a>;
}

/**
 * A merchant photo. In the editor, photo spots carry data-photo="<section>:<field>"
 * so the studio can open its photo editor when one is clicked.
 */
function Photo({ url, alt, className = '', ctx, target }: { url?: string; alt: string; className?: string; ctx?: Ctx; target?: string }) {
  const editable = ctx?.mode === 'editor' && ctx.sectionId && target;
  const data = editable ? { 'data-photo': `${ctx!.sectionId}:${target}` } : {};
  if (!url) {
    return (
      <div className={`oxs-photo oxs-photo--empty ${className}`} role="presentation" {...data}>
        {editable && <span className="oxs-photo-action oxs-photo-action--add">Add photo</span>}
      </div>
    );
  }
  if (!editable) return <img className={`oxs-photo ${className}`} src={url} alt={alt} loading="lazy" decoding="async" />;
  return (
    <span className={`oxs-photo-wrap ${className}`} {...data}>
      <img className="oxs-photo" src={url} alt={alt} loading="lazy" decoding="async" />
      <span className="oxs-photo-action">Edit photo</span>
    </span>
  );
}

function Hint({ ctx, children }: { ctx: Ctx; children: ReactNode }) {
  return ctx.mode === 'editor' ? <p className="oxs-hint">{children}</p> : null;
}

function availabilityLabel(product: CatalogProduct) {
  return { 'in-stock': '', 'low-stock': 'Only a few left', 'out-of-stock': 'Sold out', preorder: 'Pre-order' }[product.availability];
}

function Price({ ctx, product }: { ctx: Ctx; product: CatalogProduct }) {
  const onSale = product.compareAtMinor !== undefined && product.compareAtMinor > product.priceMinor;
  return (
    <span className="oxs-price">
      <span>{formatPrice(product.priceMinor, ctx.catalog.currency)}</span>
      {onSale && <s aria-label="Original price">{formatPrice(product.compareAtMinor!, ctx.catalog.currency)}</s>}
    </span>
  );
}

function ProductCard({ ctx, product }: { ctx: Ctx; product: CatalogProduct }) {
  const label = availabilityLabel(product);
  return (
    <a className="oxs-card" href={productHref(ctx, product)}>
      <span className="oxs-card__media">
        <Photo url={product.images[0]?.url} alt={product.images[0]?.alt || product.title} />
        {label && <span className="oxs-card__badge">{label}</span>}
      </span>
      <span className="oxs-card__body">
        <span className="oxs-card__title">{product.title}</span>
        <Price ctx={ctx} product={product} />
      </span>
    </a>
  );
}

function ProductRow({ ctx, products, columns }: { ctx: Ctx; products: CatalogProduct[]; columns: number }) {
  return (
    <div className="oxs-grid" style={{ '--oxs-cols': columns } as CSSProperties}>
      {products.map((product) => <ProductCard key={product.id} ctx={ctx} product={product} />)}
    </div>
  );
}

// ----------------------------------------------------------------- sections

function Hero({ ctx, section }: { ctx: Ctx; section: SectionOf<'hero'> }) {
  const p = section.props;
  const copy = (
    <div className="oxs-hero__copy">
      {p.eyebrow && <p className="oxs-hero__eyebrow">{p.eyebrow}</p>}
      <h1 className="oxs-display">{p.heading}</h1>
      {p.subheading && <p className="oxs-hero__sub">{p.subheading}</p>}
      <Button ctx={ctx} href={p.ctaHref}>{p.ctaLabel}</Button>
    </div>
  );
  if (p.variant === 'triptych') {
    const picks = selectProducts(ctx.catalog, { kind: 'featured' }).slice(0, 3);
    const tiles = p.image ? [{ url: p.image.url, alt: p.image.alt }, ...picks.map((x) => x.images[0])] : picks.map((x) => x.images[0]);
    return (
      <div className="oxs-hero oxs-hero--triptych">
        <div className="oxs-hero__tiles">{[0, 1, 2].map((i) => <Photo key={i} url={tiles[i]?.url} alt={tiles[i]?.alt ?? ''} ctx={i === 0 ? ctx : undefined} target={i === 0 ? 'image' : undefined} />)}</div>
        {copy}
      </div>
    );
  }
  return (
    <div className={`oxs-hero oxs-hero--${p.variant}`}>
      {p.variant !== 'editorial' || p.image || ctx.mode === 'editor' ? <Photo url={p.image?.url} alt={p.image?.alt ?? ''} className="oxs-hero__photo" ctx={ctx} target="image" /> : null}
      {copy}
    </div>
  );
}

function TrustBar({ ctx, section }: { ctx: Ctx; section: SectionOf<'trust-bar'> }) {
  if (!section.props.items.length) return <Hint ctx={ctx}>Add short lines about payment or delivery. Only list what your store really offers.</Hint>;
  return <ul className="oxs-trust">{section.props.items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function CollectionList({ ctx, section }: { ctx: Ctx; section: SectionOf<'collection-list'> }) {
  const { heading, layout, collectionIds } = section.props;
  const list = collectionIds.length ? collectionIds.map((id) => ctx.catalog.collections.find((c) => c.id === id)).filter((c): c is CatalogCollection => Boolean(c)) : ctx.catalog.collections;
  if (!list.length) return <Hint ctx={ctx}>Your collections will appear here once you create them in Orvexa Cloud.</Hint>;
  return (
    <div className="oxs-section-inner">
      {heading && <h2 className="oxs-heading">{heading}</h2>}
      {layout === 'chips' ? (
        <div className="oxs-chips">{list.map((c) => <a key={c.id} href={collectionHref(ctx, c)}>{c.title}</a>)}</div>
      ) : (
        <div className="oxs-tiles">
          {list.slice(0, 8).map((c) => {
            const cover = c.image ?? ctx.catalog.products.find((p) => p.collectionIds.includes(c.id))?.images[0];
            return <a key={c.id} className="oxs-tile" href={collectionHref(ctx, c)}><Photo url={cover?.url} alt="" /><span>{c.title}</span></a>;
          })}
        </div>
      )}
    </div>
  );
}

function ProductGrid({ ctx, section }: { ctx: Ctx; section: SectionOf<'product-grid'> }) {
  const p = section.props;
  const products = selectProducts(ctx.catalog, p.source).slice(0, p.limit);
  const collection = p.source.kind === 'collection' ? ctx.catalog.collections.find((c) => c.id === (p.source as { collectionId: string }).collectionId) : undefined;
  return (
    <div className="oxs-section-inner">
      <div className="oxs-row-head">
        <div>
          {p.heading && <h2 className="oxs-heading">{p.heading}</h2>}
          {p.subheading && <p className="oxs-muted">{p.subheading}</p>}
        </div>
        {p.showViewAll && products.length > 0 && <a className="oxs-link" href={collection ? collectionHref(ctx, collection) : link(ctx, '/collections/all')}>View all</a>}
      </div>
      {products.length ? <ProductRow ctx={ctx} products={products} columns={p.columns} /> : <Hint ctx={ctx}>Products from your catalogue will appear here.</Hint>}
    </div>
  );
}

function ImageWithText({ ctx, section }: { ctx: Ctx; section: SectionOf<'image-with-text'> }) {
  const p = section.props;
  return (
    <div className={`oxs-split oxs-split--${p.imagePosition}`}>
      <Photo url={p.image?.url} alt={p.image?.alt ?? ''} className="oxs-split__photo" ctx={ctx} target="image" />
      <div className="oxs-split__copy">
        <h2 className="oxs-heading">{p.heading}</h2>
        {p.body && <p className="oxs-prose">{p.body}</p>}
        {p.ctaLabel && <Button ctx={ctx} href={p.ctaHref} variant="secondary">{p.ctaLabel}</Button>}
      </div>
    </div>
  );
}

function RichText({ section }: { section: SectionOf<'rich-text'> }) {
  const p = section.props;
  return (
    <div className={`oxs-section-inner oxs-text oxs-text--${p.align}`}>
      {p.heading && <h2 className="oxs-heading">{p.heading}</h2>}
      {p.body.split(/\n{2,}/).map((para, i) => <p key={i} className="oxs-prose">{para}</p>)}
    </div>
  );
}

function Testimonials({ ctx, section }: { ctx: Ctx; section: SectionOf<'testimonials'> }) {
  if (!section.props.items.length) return <Hint ctx={ctx}>Add reviews from real customers, word for word.</Hint>;
  return (
    <div className="oxs-section-inner">
      <h2 className="oxs-heading">{section.props.heading}</h2>
      <div className="oxs-quotes">
        {section.props.items.map((item, i) => <figure key={i}><blockquote>{item.quote}</blockquote><figcaption>{item.author}</figcaption></figure>)}
      </div>
    </div>
  );
}

function Faq({ ctx, section }: { ctx: Ctx; section: SectionOf<'faq'> }) {
  if (!section.props.items.length) return <Hint ctx={ctx}>Add the questions shoppers ask you most.</Hint>;
  return (
    <div className="oxs-section-inner oxs-narrow">
      <h2 className="oxs-heading">{section.props.heading}</h2>
      {section.props.items.map((item, i) => <details key={i} className="oxs-disclosure"><summary>{item.question}</summary><p className="oxs-prose">{item.answer}</p></details>)}
    </div>
  );
}

function Newsletter({ ctx, section }: { ctx: Ctx; section: SectionOf<'newsletter'> }) {
  const p = section.props;
  const disabled = ctx.mode === 'editor';
  return (
    <div className="oxs-newsletter">
      <h2 className="oxs-heading">{p.heading}</h2>
      {p.body && <p className="oxs-muted">{p.body}</p>}
      <form method="post" action={link(ctx, '/newsletter')} className="oxs-newsletter__form">
        <label className="oxs-sr-only" htmlFor={`${section.id}-email`}>Email address</label>
        <input id={`${section.id}-email`} name="email" type="email" required autoComplete="email" placeholder="you@example.com" disabled={disabled} />
        <button className="oxs-button oxs-button--primary" type="submit" disabled={disabled}>{p.buttonLabel}</button>
      </form>
    </div>
  );
}

function PromoBanner({ ctx, section }: { ctx: Ctx; section: SectionOf<'promo-banner'> }) {
  const p = section.props;
  return (
    <div className={`oxs-promo oxs-promo--${p.tone}`}>
      <p>{p.text}</p>
      {p.ctaLabel && <a className="oxs-link" href={link(ctx, p.ctaHref || '/collections/all')}>{p.ctaLabel}</a>}
    </div>
  );
}

function ProductMain({ ctx, section }: { ctx: Ctx; section: SectionOf<'product-main'> }) {
  const product = ctx.product;
  if (!product) return <Hint ctx={ctx}>Add a product in Orvexa Cloud to preview this page.</Hint>;
  const p = section.props;
  const images = p.gallery === 'single' ? product.images.slice(0, 1) : product.images;
  const soldOut = product.availability === 'out-of-stock';
  const disabled = ctx.mode === 'editor' || soldOut;
  const label = availabilityLabel(product);
  return (
    <div className="oxs-pdp">
      <div className={`oxs-pdp__gallery oxs-pdp__gallery--${p.gallery} ${p.zoomOnHover ? 'oxs-zoom' : ''}`} style={{ '--oxs-fit': p.imageFit } as CSSProperties}>
        {(images.length ? images : [undefined]).map((image, i) => <Photo key={i} url={image?.url} alt={image?.alt || product.title} />)}
      </div>
      <div className="oxs-pdp__buy">
        <h1 className="oxs-display oxs-pdp__title">{product.title}</h1>
        <Price ctx={ctx} product={product} />
        {label && <p className="oxs-stock">{label}</p>}
        <form method="post" action={link(ctx, '/cart/add')} className="oxs-buy-form">
          <input type="hidden" name="productId" value={product.id} />
          {product.variants.length > 0 && (
            <fieldset className="oxs-variants">
              <legend>Size</legend>
              {product.variants.map((variant, i) => (
                <label key={variant.id} className="oxs-variant">
                  <input type="radio" name="variantId" value={variant.id} defaultChecked={i === 0} disabled={!variant.available || ctx.mode === 'editor'} required />
                  <span>{variant.title}</span>
                </label>
              ))}
            </fieldset>
          )}
          <button type="submit" className="oxs-button oxs-button--primary oxs-button--wide" disabled={disabled}>{soldOut ? 'Sold out' : p.buttonLabel}</button>
        </form>
        {p.deliveryNote && <p className="oxs-muted">{p.deliveryNote}</p>}
      </div>
    </div>
  );
}

function ProductInfo({ ctx, section }: { ctx: Ctx; section: SectionOf<'product-info'> }) {
  const p = section.props;
  return (
    <div className="oxs-section-inner oxs-narrow">
      {ctx.product?.description && <details className="oxs-disclosure" open><summary>{p.detailsHeading}</summary><p className="oxs-prose">{ctx.product.description}</p></details>}
      {p.shippingText ? <details className="oxs-disclosure"><summary>{p.shippingHeading}</summary><p className="oxs-prose">{p.shippingText}</p></details> : <Hint ctx={ctx}>Add your shipping and returns text so shoppers know what to expect.</Hint>}
    </div>
  );
}

function RelatedProducts({ ctx, section }: { ctx: Ctx; section: SectionOf<'related-products'> }) {
  const current = ctx.product;
  const related = ctx.catalog.products.filter((p) => p.id !== current?.id && (!current || p.collectionIds.some((id) => current.collectionIds.includes(id))));
  const list = (related.length ? related : ctx.catalog.products.filter((p) => p.id !== current?.id)).slice(0, section.props.limit);
  if (!list.length) return <Hint ctx={ctx}>Related products appear when you have more than one product.</Hint>;
  return <div className="oxs-section-inner"><h2 className="oxs-heading">{section.props.heading}</h2><ProductRow ctx={ctx} products={list} columns={4} /></div>;
}

function CollectionHeader({ ctx, section }: { ctx: Ctx; section: SectionOf<'collection-header'> }) {
  const collection = ctx.collection;
  const title = collection && collection !== 'all' ? collection.title : 'All products';
  const description = collection && collection !== 'all' ? collection.description : '';
  return (
    <div className={`oxs-section-inner oxs-text oxs-text--${section.props.align}`}>
      <h1 className="oxs-display oxs-display--page">{title}</h1>
      {section.props.showDescription && description && <p className="oxs-prose">{description}</p>}
    </div>
  );
}

function CollectionProducts({ ctx, section }: { ctx: Ctx; section: SectionOf<'collection-products'> }) {
  const collection = ctx.collection;
  const products = !collection || collection === 'all' ? newest(ctx.catalog.products) : ctx.catalog.products.filter((p) => p.collectionIds.includes(collection.id));
  if (!products.length) return <p className="oxs-section-inner oxs-muted">{section.props.emptyMessage}</p>;
  return <div className="oxs-section-inner"><ProductRow ctx={ctx} products={products} columns={section.props.columns} /></div>;
}

function ImageBanner({ ctx, section }: { ctx: Ctx; section: SectionOf<'image-banner'> }) {
  const p = section.props;
  return (
    <div className={`oxs-banner oxs-banner--${p.height} oxs-banner--${p.textPosition}`}>
      <Photo url={p.image?.url} alt={p.image?.alt ?? ''} className="oxs-banner__photo" ctx={ctx} target="image" />
      {(p.heading || p.body || p.ctaLabel) && (
        <div className="oxs-banner__copy">
          {p.heading && <h2 className="oxs-heading">{p.heading}</h2>}
          {p.body && <p>{p.body}</p>}
          {p.ctaLabel && <Button ctx={ctx} href={p.ctaHref}>{p.ctaLabel}</Button>}
        </div>
      )}
    </div>
  );
}

function Gallery({ ctx, section }: { ctx: Ctx; section: SectionOf<'gallery'> }) {
  const p = section.props;
  const editor = ctx.mode === 'editor';
  const count = Math.min(8, Math.max(p.slots, p.images.length));
  const spots = Array.from({ length: count }, (_, i) => p.images[i] ?? null);
  const shown = editor ? spots.map((image, index) => ({ image, index })) : spots.flatMap((image, index) => (image ? [{ image, index }] : []));
  if (!shown.length) return null;
  return (
    <div className="oxs-section-inner">
      {(p.heading || p.subheading) && <div className="oxs-row-head"><div>{p.heading && <h2 className="oxs-heading">{p.heading}</h2>}{p.subheading && <p className="oxs-muted">{p.subheading}</p>}</div></div>}
      <div className={`oxs-gallery oxs-gallery--${p.layout}`}>
        {shown.map(({ image, index }) => {
          const photo = <Photo url={image?.url} alt={image?.alt ?? ''} ctx={ctx} target={`images.${index}`} />;
          return (
            <figure key={index}>
              {image?.href && !editor ? <a href={link(ctx, image.href)}>{photo}</a> : photo}
              {image?.caption && <figcaption>{image.caption}</figcaption>}
            </figure>
          );
        })}
      </div>
    </div>
  );
}

function ContactDetails({ ctx, section }: { ctx: Ctx; section: SectionOf<'contact-details'> }) {
  const p = section.props;
  const { contact, social } = ctx.theme.footer;
  const whatsapp = social.whatsapp || (contact.phone ? `https://wa.me/${contact.phone.replace(/\D/g, '')}` : '');
  const rows = [
    p.showPhone && contact.phone ? <a key="phone" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>{contact.phone}</a> : null,
    p.showEmail && contact.email ? <a key="email" href={`mailto:${contact.email}`}>{contact.email}</a> : null,
    p.showAddress && contact.address ? <address key="address">{contact.address}</address> : null,
    p.hours ? <p key="hours">{p.hours}</p> : null,
  ].filter(Boolean);
  return (
    <div className="oxs-section-inner oxs-contact">
      <div>
        <h1 className="oxs-display oxs-display--page">{p.heading}</h1>
        {p.body && <p className="oxs-prose">{p.body}</p>}
      </div>
      <div className="oxs-contact__card">
        {rows.length ? rows : <Hint ctx={ctx}>Add your phone, email and address in Design, under Footer.</Hint>}
        {p.showWhatsApp && whatsapp && <a className="oxs-button oxs-button--primary" href={whatsapp} rel="noopener noreferrer" target="_blank">Chat on WhatsApp</a>}
      </div>
    </div>
  );
}

function renderSection(parent: Ctx, section: Section): ReactNode {
  const ctx = { ...parent, sectionId: section.id };
  switch (section.type) {
    case 'hero': return <Hero ctx={ctx} section={section} />;
    case 'trust-bar': return <TrustBar ctx={ctx} section={section} />;
    case 'collection-list': return <CollectionList ctx={ctx} section={section} />;
    case 'product-grid': return <ProductGrid ctx={ctx} section={section} />;
    case 'image-with-text': return <ImageWithText ctx={ctx} section={section} />;
    case 'rich-text': return <RichText section={section} />;
    case 'testimonials': return <Testimonials ctx={ctx} section={section} />;
    case 'faq': return <Faq ctx={ctx} section={section} />;
    case 'newsletter': return <Newsletter ctx={ctx} section={section} />;
    case 'promo-banner': return <PromoBanner ctx={ctx} section={section} />;
    case 'product-main': return <ProductMain ctx={ctx} section={section} />;
    case 'product-info': return <ProductInfo ctx={ctx} section={section} />;
    case 'related-products': return <RelatedProducts ctx={ctx} section={section} />;
    case 'collection-header': return <CollectionHeader ctx={ctx} section={section} />;
    case 'collection-products': return <CollectionProducts ctx={ctx} section={section} />;
    case 'image-banner': return <ImageBanner ctx={ctx} section={section} />;
    case 'gallery': return <Gallery ctx={ctx} section={section} />;
    case 'contact-details': return <ContactDetails ctx={ctx} section={section} />;
  }
}

// ------------------------------------------------------------ header/footer

const ICON_PATHS = {
  search: 'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.3-2.2L21 21',
  account: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9c.8-3.9 4-6 8-6s7.2 2.1 8 6',
  wishlist: 'M12 20.5s-8-4.6-8-10.4A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.5c0 5.8-8 10.4-8 10.4Z',
  bag: 'M5 8h14l-1 13H6L5 8Zm3.5 0V6.5a3.5 3.5 0 0 1 7 0V8',
  menu: 'M3.5 6.5h17M3.5 12h17M3.5 17.5h17',
} as const;

function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return <svg className="oxs-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d={ICON_PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Announcement({ ctx }: { ctx: Ctx }) {
  const a = ctx.theme.header.announcement;
  const messages = a.enabled ? a.messages : [];
  if (!messages.length) return null;
  const body = a.style === 'scroll' ? (
    <div className="oxs-ticker">
      <span className="oxs-sr-only">{messages.join('. ')}</span>
      <div className="oxs-ticker__track" aria-hidden="true" style={{ '--oxs-ticker-duration': `${Math.max(14, messages.join(' ').length * 0.32)}s` } as CSSProperties}>
        {[...messages, ...messages, ...messages, ...messages].map((m, i) => <span key={i}>{m}</span>)}
      </div>
    </div>
  ) : <p className="oxs-announcement__static">{messages.map((m, i) => <span key={i}>{m}</span>)}</p>;
  return <div className={`oxs-announcement oxs-announcement--${a.tone}`}>{a.href ? <a href={link(ctx, a.href)}>{body}</a> : body}</div>;
}

function Header({ ctx }: { ctx: Ctx }) {
  const { header, brand } = ctx.theme;
  const collections = ctx.catalog.collections;
  const logo = brand.logo ? <img src={brand.logo.url} alt={brand.name} className="oxs-logo-img" /> : <span>{brand.name}</span>;
  const shopIndex = header.categoryMenu && collections.length ? header.menu.findIndex((item) => item.href === '/collections/all') : -1;
  const categoryLinks = [<a key="all" href={link(ctx, '/collections/all')}>All products</a>, ...collections.map((c) => <a key={c.id} href={collectionHref(ctx, c)}>{c.title}</a>)];
  const desktop = header.menu.map((item, i) => (i === shopIndex ? (
    <details key={`${item.label}${i}`} className="oxs-dropdown">
      <summary>{item.label}</summary>
      <div className="oxs-dropdown__panel">{categoryLinks}</div>
    </details>
  ) : <a key={`${item.label}${i}`} href={link(ctx, item.href)}>{item.label}</a>));
  const mobile = header.menu.flatMap((item, i) => (i === shopIndex
    ? [<span key="shop-label" className="oxs-menu__label">{item.label}</span>, ...categoryLinks]
    : [<a key={`${item.label}${i}`} href={link(ctx, item.href)}>{item.label}</a>]));
  const icons = header.icons;
  return (
    <header className={`oxs-header oxs-header--${header.layout} oxs-header--bg-${header.background}${header.sticky ? ' oxs-header--sticky' : ''}`}>
      <Announcement ctx={ctx} />
      <div className="oxs-header__bar">
        <details className="oxs-menu">
          <summary aria-label="Menu"><Icon name="menu" /></summary>
          <nav aria-label="Mobile">{mobile}</nav>
        </details>
        <a className="oxs-logo" href={link(ctx, '/')}>{logo}</a>
        <nav className="oxs-nav" aria-label="Main">{desktop}</nav>
        <div className="oxs-icons">
          {icons.search && <a href={link(ctx, '/search')} aria-label="Search"><Icon name="search" /></a>}
          {icons.account && <a className="oxs-icons__extra" href={link(ctx, '/account')} aria-label="Account"><Icon name="account" /></a>}
          {icons.wishlist && <a className="oxs-icons__extra" href={link(ctx, '/wishlist')} aria-label="Wishlist"><Icon name="wishlist" /></a>}
          <a href={link(ctx, '/cart')} aria-label="Bag"><Icon name="bag" /></a>
        </div>
      </div>
    </header>
  );
}

function Footer({ ctx }: { ctx: Ctx }) {
  const { footer, brand } = ctx.theme;
  const socials = Object.entries(footer.social).filter(([, url]) => url);
  const contact = [footer.contact.phone, footer.contact.email, footer.contact.address].filter(Boolean);
  return (
    <footer className="oxs-footer">
      <div>
        <p className="oxs-footer__brand">{brand.name}</p>
        {footer.tagline && <p className="oxs-muted">{footer.tagline}</p>}
        {contact.length > 0 && <address className="oxs-muted">{contact.map((line) => <span key={line}>{line}</span>)}</address>}
      </div>
      <nav aria-label="Footer">
        {footer.showPolicyLinks && ['shipping', 'returns', 'privacy', 'terms'].map((p) => <a key={p} href={link(ctx, `/policies/${p}`)}>{p[0].toUpperCase() + p.slice(1)}</a>)}
        {socials.map(([name, url]) => <a key={name} href={url} rel="noopener noreferrer" target="_blank">{name === 'whatsapp' ? 'WhatsApp' : name[0].toUpperCase() + name.slice(1)}</a>)}
      </nav>
      <p className="oxs-footer__legal">© {new Date().getFullYear()} {brand.name}. Powered by Orvexa Cloud.</p>
    </footer>
  );
}

// -------------------------------------------------------------------- page

function buildContext(props: StorefrontProps): Ctx {
  const { theme, page, basePath = '', mode = 'live' } = props;
  const catalog = withThemeCollections(props.catalog, theme);
  const product = page === 'product' ? catalog.products.find((p) => p.handle === props.productHandle) ?? (mode === 'editor' ? catalog.products[0] : undefined) : undefined;
  const collection = page === 'collection'
    ? (props.collectionHandle && props.collectionHandle !== 'all' ? catalog.collections.find((c) => c.handle === props.collectionHandle) : 'all')
    : undefined;
  return { theme, catalog, basePath, mode, product, collection: collection ?? 'all' };
}

function frameClasses(theme: Theme, mode: StorefrontProps['mode'], extra?: string) {
  const t = theme.tokens;
  return ['oxs', `oxs-btn-${t.buttonStyle}`, `oxs-card-${t.cardStyle}`, t.headingCase === 'uppercase' ? 'oxs-caps' : '', mode === 'editor' ? 'oxs-editor' : '', extra ?? ''].filter(Boolean).join(' ');
}

/**
 * Theme colours, header and footer around any content. Used by visual editors
 * that render the page's content themselves.
 */
export function StorefrontFrame(props: StorefrontProps & { children: ReactNode; className?: string }) {
  const ctx = buildContext(props);
  return (
    <div className={frameClasses(props.theme, ctx.mode, props.className)} style={themeStyle(props.theme)} data-niche={getNiche(props.theme.nicheId).id}>
      <Header ctx={ctx} />
      <main id="main">{props.children}</main>
      <Footer ctx={ctx} />
    </div>
  );
}

/** A live block's settings, checked against the schema; falls back to defaults if invalid. */
function liveSection(part: Extract<LayoutPart, { kind: 'block' }>): Section {
  const defaults = SECTION_DEFINITIONS[part.type].defaults();
  const attempt = SectionSchema.safeParse({ id: part.id, type: part.type, hidden: false, props: { ...defaults, ...part.props } });
  if (attempt.success) return attempt.data;
  return SectionSchema.parse({ id: part.id.replace(/[^a-z0-9-]/g, '').slice(0, 80) || `${part.type}-1`, type: part.type, hidden: false, props: defaults });
}

/**
 * A page built in the visual editor: cleaned HTML, with live blocks (products,
 * buy box, categories, contact, sign-up) rendered from live data where their
 * placeholders sit. HTML and CSS are cleaned again here as a second safety net.
 */
function LayoutBody({ ctx, layout }: { ctx: Ctx; layout: Layout }) {
  const css = scopeCss(cleanCss(layout.css));
  return (
    <div className="oxs-layout">
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {splitLayout(layout.html).map((part, i) => {
        if (part.kind === 'html') return <div key={i} className="oxs-layout__html" dangerouslySetInnerHTML={{ __html: cleanHtml(part.html) }} />;
        const section = liveSection(part);
        return (
          <section key={i} className={`oxs-section oxs-section--${section.type}`} data-oxs-live={section.type}>
            {renderSection(ctx, section)}
          </section>
        );
      })}
    </div>
  );
}

/** Render one live block on its own (used by the visual editor's preview of live blocks). */
export function LiveBlockView(props: StorefrontProps & { block: { type: Section['type']; id: string; props: Record<string, unknown> } }) {
  const ctx = buildContext(props);
  const section = liveSection({ kind: 'block', ...props.block });
  return <section className={`oxs-section oxs-section--${section.type}`}>{renderSection(ctx, section)}</section>;
}

/** One section, rendered with live catalogue data. */
export function SectionView(props: StorefrontProps & { section: Section }) {
  const ctx = buildContext(props);
  const { section } = props;
  return (
    <section
      className={`oxs-section oxs-section--${section.type}${section.hidden ? ' oxs-section--hidden' : ''}`}
      data-section-id={ctx.mode === 'editor' ? section.id : undefined}
      aria-label={ctx.mode === 'editor' ? SECTION_DEFINITIONS[section.type].label : undefined}
    >
      {renderSection(ctx, section)}
    </section>
  );
}

export function Storefront(props: StorefrontProps) {
  const { theme, page, mode = 'live', selectedSectionId, hideHiddenSections = mode === 'live' } = props;
  const ctx = buildContext(props);
  const { catalog, product } = ctx;
  const classes = frameClasses(theme, mode);
  const sections = theme.pages[page].sections.filter((s) => !(s.hidden && hideHiddenSections));
  const structured = product && mode === 'live' ? {
    '@context': 'https://schema.org', '@type': 'Product', name: product.title, description: product.description || undefined,
    image: product.images.filter((i) => i.url.startsWith('https://')).map((i) => i.url),
    offers: { '@type': 'Offer', priceCurrency: catalog.currency, price: (product.priceMinor / 100).toFixed(2),
      availability: `https://schema.org/${product.availability === 'out-of-stock' ? 'OutOfStock' : product.availability === 'preorder' ? 'PreOrder' : 'InStock'}` },
    brand: { '@type': 'Brand', name: theme.brand.name },
  } : page === 'home' && mode === 'live' ? { '@context': 'https://schema.org', '@type': 'Organization', name: theme.brand.name } : null;

  return (
    <div className={classes} style={themeStyle(theme)} data-niche={getNiche(theme.nicheId).id}>
      <Header ctx={ctx} />
      <main id="main">
        {theme.pages[page].layout ? <LayoutBody ctx={ctx} layout={theme.pages[page].layout!} /> : sections.map((section) => (
          <section
            key={section.id}
            className={`oxs-section oxs-section--${section.type}${section.hidden ? ' oxs-section--hidden' : ''}${selectedSectionId === section.id ? ' oxs-section--selected' : ''}`}
            data-section-id={mode === 'editor' ? section.id : undefined}
            aria-label={mode === 'editor' ? SECTION_DEFINITIONS[section.type].label : undefined}
          >
            {renderSection(ctx, section)}
          </section>
        ))}
      </main>
      <Footer ctx={ctx} />
      {structured && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} />}
    </div>
  );
}
