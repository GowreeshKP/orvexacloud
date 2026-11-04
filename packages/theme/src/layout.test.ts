import { describe, expect, it } from 'vitest';
import {
  applyOps, buildStarterTheme, cleanCss, cleanHtml, cleanLayout, cleanProject, liveBlocksIn, placeholderHtml, scopeCss, splitLayout, validateTheme,
} from './index';

const ATTACKS = [
  '<script>alert(1)</script>',
  '<img src="x" onerror="alert(1)">',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="  javascript:alert(1)">x</a>',
  '<svg><script>alert(1)</script></svg>',
  '<svg onload="alert(1)"></svg>',
  '<iframe src="https://evil.example"></iframe>',
  '<object data="x"></object><embed src="x">',
  '<form action="https://evil.example"><input name="card"><button>Pay</button></form>',
  '<div onclick="alert(1)">x</div>',
  '<details open ontoggle="alert(1)"><summary>x</summary></details>',
  '<style>body{display:none}</style>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<img src="http://insecure.example/a.png">',
  '<meta http-equiv="refresh" content="0;url=https://evil.example">',
];

describe('page cleaning', () => {
  it.each(ATTACKS.map((a) => [a]))('removes anything executable from %s', (attack) => {
    const clean = cleanHtml(`<section>${attack}</section>`);
    expect(clean).not.toMatch(/<script|onerror|onload|onclick|ontoggle|javascript:|<iframe|<object|<embed|<form|<input|<button|<style|<meta|<svg|data:text|http:\/\//i);
  });

  it('keeps ordinary page content', () => {
    const html = '<section class="hero" id="i1"><h1>Welcome</h1><p>Shop <a href="/collections/all">all</a> or <a href="https://instagram.com/x" target="_blank">Instagram</a>.</p><img src="/assets/s/a.webp" alt="Saree"><details><summary>Q</summary><p>A</p></details></section>';
    const clean = cleanHtml(html);
    expect(clean).toContain('<h1>Welcome</h1>');
    expect(clean).toContain('href="/collections/all"');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('src="/assets/s/a.webp"');
    expect(clean).toContain('<details>');
  });

  it('is idempotent, so stored pages validate', () => {
    for (const html of [...ATTACKS, '<p style="color:red;background:url(https://x.example/a.png)">x</p>']) {
      const once = cleanHtml(html);
      expect(cleanHtml(once)).toBe(once);
    }
  });

  it('limits images to allowed hosts when asked', () => {
    const html = '<img src="https://pub-abc.r2.dev/a.webp"><img src="https://tracker.example/p.gif">';
    const clean = cleanHtml(html, { imageHosts: ['pub-abc.r2.dev'] });
    expect(clean).toContain('pub-abc.r2.dev');
    expect(clean).not.toContain('tracker.example');
  });

  it('cleans CSS: imports, outside images, scripts, overlays and style-tag breakouts', () => {
    const css = '@import url(https://evil.example/x.css); #a{background:url(https://tracker.example/p.gif)} #b{width:expression(alert(1))} #c{position:fixed;inset:0} </style><script>alert(1)</script> #d{color:red}';
    const clean = cleanCss(css, { imageHosts: ['pub-abc.r2.dev'] });
    expect(clean).not.toMatch(/@import|tracker\.example|expression\(|position:\s*fixed|<\/?style|<script/i);
    expect(clean).toContain('#d{color:red}');
    expect(cleanCss(clean, { imageHosts: ['pub-abc.r2.dev'] })).toBe(clean);
  });

  it('scopes page CSS to the page area', () => {
    expect(scopeCss('body{margin:0} #i1{color:red}')).toBe('.oxs-layout{body{margin:0} #i1{color:red}}');
    expect(scopeCss('  ')).toBe('');
  });

  it('strips executable parts from GrapesJS project data', () => {
    const project = { pages: [{ frames: [{ component: { type: 'wrapper', components: [
      { tagName: 'script', content: 'alert(1)' },
      { type: 'text', attributes: { onclick: 'alert(1)', id: 'ok' }, components: '<b>hi</b><script>x</script>' },
      { type: 'link', attributes: { href: 'javascript:alert(1)', title: 't' } },
      { type: 'iframe', src: 'https://evil.example' },
    ] } }] }] };
    const clean = JSON.stringify(cleanProject(project));
    expect(clean).not.toMatch(/script|onclick|javascript:|iframe/i);
    expect(clean).toContain('"id":"ok"');
    expect(clean).toContain('<b>hi</b>');
  });
});

describe('templates with edited pages', () => {
  const edited = () => {
    const theme = buildStarterTheme({ brandName: 'Kesari', nicheId: 'pantry' });
    const layout = cleanLayout({ project: { pages: [] }, html: '<section><h1>My own page</h1></section>', css: 'h1{color:red}' });
    const result = applyOps(theme, [{ op: 'set_layout', page: 'home', layout }, { op: 'set_layout', page: 'about', layout }]);
    if (!result.ok) throw new Error(result.errors.join());
    return result.theme;
  };

  it('"style only" changes the look and keeps every edited page', () => {
    const theme = edited();
    const result = applyOps(theme, [{ op: 'apply_template_style', templateId: 'runway-mono' }]);
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.theme.templateId).toBe('runway-mono');
    expect(result.theme.tokens.fonts.display).toBe('syne');
    expect(result.theme.pages.home.layout?.html).toContain('My own page');
    expect(result.theme.pages.about.layout?.html).toContain('My own page');
    expect(result.theme.brand).toEqual(theme.brand);
  });

  it('"replace my homepage" swaps only the homepage and keeps the other pages', () => {
    const theme = edited();
    const result = applyOps(theme, [{ op: 'apply_template', templateId: 'heritage-drape' }]);
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.theme.pages.home.layout).toBeUndefined();
    expect(result.theme.pages.home.sections.length).toBeGreaterThanOrEqual(5);
    expect(result.theme.pages.about.layout?.html).toContain('My own page');
    expect(result.theme.collections).toEqual(theme.collections);
  });
});

describe('live blocks', () => {
  it('round-trips placeholders through cleaning and splitting', () => {
    const html = cleanHtml(`<section><h1>Hi</h1></section>${placeholderHtml('product-grid', 'pg-1', { heading: 'New "in"', limit: 4 })}<p>after</p>`);
    const parts = splitLayout(html);
    expect(parts.map((p) => p.kind)).toEqual(['html', 'block', 'html']);
    const block = parts[1];
    expect(block).toMatchObject({ kind: 'block', type: 'product-grid', id: 'pg-1', props: { heading: 'New "in"', limit: 4 } });
  });

  it('ignores placeholders that are nested or unknown, and keeps static HTML intact', () => {
    const nested = cleanHtml(`<div>${placeholderHtml('product-grid', 'x', {})}</div><section data-oxs-block="evil" data-props="{}"></section>`);
    expect(liveBlocksIn(nested)).toEqual([]);
    expect(splitLayout(nested).every((p) => p.kind === 'html')).toBe(true);
  });

  it('requires the buy box on a product page layout', () => {
    const theme = buildStarterTheme({ brandName: 'Kesari', nicheId: 'pantry' });
    const without = cleanLayout({ project: {}, html: '<section><h1>Product</h1></section>', css: '' });
    expect(applyOps(theme, [{ op: 'set_layout', page: 'product', layout: without }]).ok).toBe(false);
    const withBuyBox = cleanLayout({ project: {}, html: placeholderHtml('product-main', 'pm', {}), css: '' });
    const result = applyOps(theme, [{ op: 'set_layout', page: 'product', layout: withBuyBox }]);
    expect(result.ok).toBe(true);
  });

  it('refuses an unclean layout and AI layout changes', () => {
    const theme = buildStarterTheme({ brandName: 'Kesari', nicheId: 'pantry' });
    const dirty = { project: {}, html: '<p onclick="x">hi</p>', css: '' };
    expect(applyOps(theme, [{ op: 'set_layout', page: 'home', layout: dirty }]).ok).toBe(false);
    const clean = cleanLayout(dirty);
    expect(applyOps(theme, [{ op: 'set_layout', page: 'home', layout: clean }]).ok).toBe(true);
    expect(applyOps(theme, [{ op: 'set_layout', page: 'home', layout: clean }], 'ai').ok).toBe(false);
    expect(validateTheme({ ...theme, pages: { ...theme.pages, home: { ...theme.pages.home, layout: dirty } } }).ok).toBe(false);
  });
});
