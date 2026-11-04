import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyOps, buildTheme, sampleCatalog, TEMPLATES, PAGE_IDS, fromOrvexaProducts } from '@orvexa/theme';
import { Storefront, storefrontHead } from './index';

const catalog = sampleCatalog('store-1', 'sarees-ethnic');

describe('Storefront renderer', () => {
  it.each(TEMPLATES.map((t) => [t.id]))('%s renders every page', (id) => {
    const theme = buildTheme(id, { brandName: 'Aarunya', nicheId: 'sarees-ethnic' });
    for (const page of PAGE_IDS) {
      const html = renderToStaticMarkup(<Storefront theme={theme} catalog={catalog} page={page} basePath="/aarunya" />);
      expect(html).toContain('Aarunya');
      expect(html).not.toContain('undefined');
    }
  });

  it('prefixes store links with the store path and posts to the existing cart', () => {
    const theme = buildTheme('heritage-drape', { brandName: 'Aarunya', nicheId: 'sarees-ethnic' });
    const html = renderToStaticMarkup(<Storefront theme={theme} catalog={catalog} page="product" productHandle={catalog.products[0].handle} basePath="/aarunya" />);
    expect(html).toContain('action="/aarunya/cart/add"');
    expect(html).toContain('href="/aarunya/collections/all"');
    expect(html).toContain('₹4,890');
  });

  it('emits Product structured data, escaped against script injection', () => {
    const evil = fromOrvexaProducts('s', [{ id: 1, name: 'Saree </script><script>alert(1)</script>', price: 100, stockCount: 3 }]);
    const theme = buildTheme('heritage-drape', { brandName: 'A', nicheId: 'sarees-ethnic' });
    const html = renderToStaticMarkup(<Storefront theme={theme} catalog={evil} page="product" productHandle={evil.products[0].handle} />);
    const ld = html.split('application/ld+json">')[1];
    expect(ld).toContain('"@type":"Product"');
    expect(ld).toContain('InStock');
    expect(ld.split('</script>')[0]).not.toContain('<');
  });

  it('hides hidden sections on the live site but shows them faded in the editor', () => {
    const base = buildTheme('heritage-drape', { brandName: 'A', nicheId: 'sarees-ethnic' });
    const hidden = applyOps(base, [{ op: 'set_section_hidden', page: 'home', sectionId: 'newsletter-1', hidden: true }]);
    if (!hidden.ok) throw new Error(hidden.errors.join());
    const live = renderToStaticMarkup(<Storefront theme={hidden.theme} catalog={catalog} page="home" />);
    const editor = renderToStaticMarkup(<Storefront theme={hidden.theme} catalog={catalog} page="home" mode="editor" />);
    expect(live).not.toContain('oxs-section--newsletter');
    expect(editor).toContain('oxs-section--hidden');
    expect(editor).toContain('data-section-id="newsletter-1"');
  });

  it('builds head tags with only the fonts the theme uses', () => {
    const theme = buildTheme('runway-mono', { brandName: 'A', nicheId: 'fashion' });
    const head = storefrontHead(theme, catalog, 'home');
    expect(head.fontHref).toContain('Syne');
    expect(head.fontHref).toContain('Manrope');
    expect(head.fontHref).not.toContain('Fraunces');
  });
});

describe('pages built in the visual editor', () => {
  it('renders cleaned HTML with live products where the placeholder sits', async () => {
    const { buildStarterTheme, applyOps, cleanLayout, placeholderHtml, sampleCatalog } = await import('@orvexa/theme');
    const base = buildStarterTheme({ brandName: 'Kesari', nicheId: 'pantry' });
    const layout = cleanLayout({ project: {}, html: `<section class="intro"><h1>Hand-ground spices</h1></section>${placeholderHtml('product-grid', 'pg', { heading: 'Bestsellers', limit: 2, columns: 2, source: { kind: 'newest' } })}`, css: '.intro{padding:2rem}' });
    const result = applyOps(base, [{ op: 'set_layout', page: 'home', layout }]);
    if (!result.ok) throw new Error(result.errors.join());
    const html = renderToStaticMarkup(<Storefront theme={result.theme} catalog={sampleCatalog('s', 'pantry')} page="home" />);
    expect(html).toContain('<h1>Hand-ground spices</h1>');
    expect(html).toContain('Bestsellers');
    expect(html).toContain('₹');
    expect(html).toContain('.oxs-layout{.intro{padding:2rem}}');
    expect(html).not.toContain('data-oxs-block');
  });

  it('cleans again at render time if stored HTML was tampered with', async () => {
    const { buildStarterTheme, sampleCatalog } = await import('@orvexa/theme');
    const base = buildStarterTheme({ brandName: 'Kesari', nicheId: 'pantry' });
    const tampered = { ...base, pages: { ...base.pages, home: { ...base.pages.home, layout: { project: {}, html: '<p>hi</p><img src=x onerror="alert(1)"><script>alert(2)</script>', css: '</style><script>alert(3)</script>' } } } };
    const html = renderToStaticMarkup(<Storefront theme={tampered as never} catalog={sampleCatalog('s', 'pantry')} page="home" />);
    expect(html).not.toMatch(/onerror|<script(?! type="application\/ld\+json")/);
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
    expect(styles.every((css) => !css.includes('<'))).toBe(true); // nothing can break out of the style tag
    expect(html).toContain('<p>hi</p>');
  });
});
