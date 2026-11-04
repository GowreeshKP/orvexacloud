import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import type { PageId, SectionType } from './schema';

/**
 * Pages built in the GrapesJS editor are stored as a "layout":
 *   project  GrapesJS project data, used only to reopen the editor
 *   html     cleaned page HTML, rendered on the live store
 *   css      cleaned page CSS, scoped to the page area
 *
 * Stores live on the same domain as the seller dashboard, so layouts are
 * cleaned on every save and publish and checked again on every read: no
 * scripts, event handlers, frames, forms or javascript: links can survive.
 *
 * Commerce stays live: product grids, the product buy box, category pages,
 * contact details and the email sign-up are "live blocks", saved as empty
 * placeholders that the storefront fills with real data on every page load.
 */

/** Blocks that always render live data and cannot be edited as HTML. */
export const LIVE_BLOCKS: SectionType[] = [
  'product-grid', 'collection-list', 'product-main', 'product-info', 'related-products',
  'collection-header', 'collection-products', 'contact-details', 'newsletter',
];
export const isLiveBlock = (type: string): type is SectionType => (LIVE_BLOCKS as string[]).includes(type);

/** Live blocks each page must keep. */
export const REQUIRED_LIVE_BLOCKS: Record<PageId, SectionType[]> = {
  home: [], about: [], product: ['product-main'], collection: ['collection-header', 'collection-products'], contact: ['contact-details'],
};

/** Inline "Add photo" placeholder used by the editor for empty photo spots. */
export const PHOTO_PLACEHOLDER_MARK = 'oxs-photo-placeholder';

const ALLOWED_TAGS = [
  'section', 'div', 'header', 'footer', 'main', 'article', 'aside', 'nav', 'figure', 'figcaption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup',
  'br', 'hr', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'details', 'summary',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];
const GLOBAL_ATTRS = ['id', 'class', 'style', 'title', 'role', 'aria-label', 'aria-hidden', 'data-oxs-block', 'data-oxs-id', 'data-props', 'data-oxs-placeholder'];

export type CleanOptions = {
  /** Extra https hosts allowed for images, e.g. the store's R2 public host. When omitted any https image is allowed. */
  imageHosts?: string[];
};

function imageAllowed(src: string, options: CleanOptions): boolean {
  if (/^\/assets\/[a-z0-9][a-z0-9/_.-]*$/i.test(src) && !src.includes('..')) return true;
  if (/^data:image\/(svg\+xml|png|jpeg|webp|gif)[;,]/i.test(src)) return true;
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:') return false;
    return !options.imageHosts || options.imageHosts.includes(url.host);
  } catch {
    return false;
  }
}

/** Clean one CSS declaration list or stylesheet. Idempotent. */
export function cleanCss(css: string, options: CleanOptions = {}): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/</g, '')
    .replace(/@(import|charset|namespace)[^;{]*;?/gi, '')
    .replace(/expression\s*\(|javascript\s*:|-moz-binding|behavior\s*:/gi, '')
    .replace(/position\s*:\s*fixed/gi, 'position: relative')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_m, _q, src: string) => (imageAllowed(src.trim(), options) ? `url("${src.trim().replace(/"/g, '%22')}")` : 'none'));
}

/** Clean page HTML for storage and rendering. Idempotent. */
export function cleanHtml(html: string, options: CleanOptions = {}): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*': GLOBAL_ATTRS,
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
      details: ['open'],
    },
    allowedSchemes: ['https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https', 'data'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'template'],
    transformTags: {
      a: (tagName, attribs) => {
        const next = { ...attribs };
        if (next.target === '_blank') next.rel = 'noopener noreferrer';
        else delete next.target;
        return { tagName, attribs: next };
      },
      img: (tagName, attribs) => {
        const next = { ...attribs };
        if (!next.src || !imageAllowed(next.src, options)) delete next.src;
        return { tagName, attribs: next };
      },
      '*': (tagName, attribs) => {
        if (!attribs.style) return { tagName, attribs };
        const style = cleanCss(attribs.style, options).replace(/[{}]/g, '');
        return { tagName, attribs: style.trim() ? { ...attribs, style } : Object.fromEntries(Object.entries(attribs).filter(([k]) => k !== 'style')) };
      },
    },
  });
}

/** Scope page CSS to the page area so it cannot restyle the header, footer or anything else. */
export function scopeCss(css: string): string {
  return css.trim() ? `.oxs-layout{${css}}` : '';
}

// ---------------------------------------------------------------- project data

const BLOCKED_TYPES = new Set(['script', 'iframe', 'video', 'map', 'textnode-script']);
const BLOCKED_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'style', 'link', 'meta', 'base']);

/**
 * Remove anything executable from GrapesJS project data. The editor never runs
 * scripts, but project data is still treated as untrusted input.
 */
export function cleanProject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanProject).filter((v) => v !== undefined);
  if (!value || typeof value !== 'object') return typeof value === 'string' && /<\s*script/i.test(value) ? value.replace(/<\s*\/?\s*script[^>]*>/gi, '') : value;
  const node = value as Record<string, unknown>;
  if (typeof node.type === 'string' && BLOCKED_TYPES.has(node.type)) return undefined;
  if (typeof node.tagName === 'string' && BLOCKED_TAGS.has(node.tagName.toLowerCase())) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    if (key === 'attributes' && child && typeof child === 'object') {
      out.attributes = Object.fromEntries(Object.entries(child as Record<string, unknown>).filter(([name, v]) =>
        !/^on/i.test(name) && !(typeof v === 'string' && /^\s*(javascript|vbscript|data:text)/i.test(v))));
      continue;
    }
    if (key === 'script' || key === 'script-props') continue;
    const cleaned = cleanProject(child);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

// ---------------------------------------------------------------- layouts

export const MAX_PROJECT_BYTES = 1_000_000;

export const Layout = z.object({
  project: z.record(z.string(), z.unknown()),
  html: z.string().max(400_000).refine((h) => cleanHtml(h) === h, 'The page contains code that is not allowed.'),
  css: z.string().max(200_000).refine((c) => cleanCss(c) === c, 'The page styles contain code that is not allowed.'),
}).refine((l) => JSON.stringify(l.project).length <= MAX_PROJECT_BYTES, 'This page is too large to save. Remove some blocks or photos.');
export type Layout = z.infer<typeof Layout>;

/** Clean a layout from the editor. Run on the client before saving and again on the server. */
export function cleanLayout(layout: { project: unknown; html: string; css: string }, options: CleanOptions = {}): Layout {
  return {
    project: (cleanProject(layout.project) ?? {}) as Record<string, unknown>,
    html: cleanHtml(layout.html, options),
    css: cleanCss(layout.css, options),
  };
}

// ---------------------------------------------------------------- placeholders

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const encode = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The saved form of a live block. */
export function placeholderHtml(type: SectionType, id: string, props: Record<string, unknown>): string {
  return `<section data-oxs-block="${type}" data-oxs-id="${encode(id)}" data-props="${encode(JSON.stringify(props))}"></section>`;
}

export type LayoutPart = { kind: 'html'; html: string } | { kind: 'block'; type: SectionType; id: string; props: Record<string, unknown> };

const VOID = new Set(['br', 'hr', 'img', 'wbr']);

/**
 * Split cleaned layout HTML into static chunks and top-level live blocks.
 * Live blocks nested inside other elements are ignored (left as empty sections).
 */
export function splitLayout(html: string): LayoutPart[] {
  const parts: LayoutPart[] = [];
  const tag = /<(\/?)([a-z0-9]+)([^>]*)>/gi;
  let depth = 0;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(html))) {
    const [whole, closing, name, attrs] = m;
    const lower = name.toLowerCase();
    if (!closing && depth === 0 && lower === 'section' && /data-oxs-block="/.test(attrs)) {
      const end = html.indexOf('</section>', tag.lastIndex);
      const inner = end >= 0 ? html.slice(tag.lastIndex, end) : '';
      if (end >= 0 && !/<[a-z]/i.test(inner)) {
        const type = /data-oxs-block="([a-z-]+)"/.exec(attrs)?.[1] ?? '';
        const id = decode(/data-oxs-id="([^"]*)"/.exec(attrs)?.[1] ?? '');
        let props: Record<string, unknown> = {};
        try { props = JSON.parse(decode(/data-props="([^"]*)"/.exec(attrs)?.[1] ?? '{}')); } catch { props = {}; }
        if (m.index > cursor) parts.push({ kind: 'html', html: html.slice(cursor, m.index) });
        if (isLiveBlock(type)) parts.push({ kind: 'block', type, id: id || `${type}-1`, props });
        cursor = end + '</section>'.length;
        tag.lastIndex = cursor;
        continue;
      }
    }
    if (VOID.has(lower) || whole.endsWith('/>')) continue;
    depth += closing ? -1 : 1;
    if (depth < 0) depth = 0;
  }
  if (cursor < html.length) parts.push({ kind: 'html', html: html.slice(cursor) });
  return parts.filter((p) => p.kind === 'block' || p.html.trim());
}

/** Live blocks present at the top level of a layout, by type. */
export function liveBlocksIn(html: string): SectionType[] {
  return splitLayout(html).flatMap((p) => (p.kind === 'block' ? [p.type] : []));
}
