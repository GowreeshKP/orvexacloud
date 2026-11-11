import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionView } from '@orvexa/storefront-ui';
import { isLiveBlock, placeholderHtml, SECTION_DEFINITIONS, type Catalog, type PageId, type Section, type SectionType, type Theme } from '@orvexa/theme';

/**
 * Empty photo spots become real <img> elements so merchants can double-click
 * them. On the live store the placeholder shows as a soft tinted block.
 */
export const PHOTO_PLACEHOLDER_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="none"><rect width="400" height="300" fill="#e7e3da"/><path d="M0 300 140 150l70 70 60-50 130 130Z" fill="#d6d0c3"/><circle cx="300" cy="80" r="28" fill="#d6d0c3"/></svg>',
)}`;

function withPhotoPlaceholders(html: string): string {
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll('.oxs-photo--empty').forEach((el) => {
    const img = doc.createElement('img');
    img.className = el.className.replace('oxs-photo--empty', '').trim();
    img.setAttribute('src', PHOTO_PLACEHOLDER_SRC);
    img.setAttribute('alt', '');
    img.setAttribute('data-oxs-placeholder', '1');
    el.replaceWith(img);
  });
  return doc.body.innerHTML;
}

/** Static HTML for one section, or a placeholder for a live block. */
export function sectionHtml(theme: Theme, catalog: Catalog, page: PageId, section: Section): string {
  if (isLiveBlock(section.type)) return placeholderHtml(section.type, section.id, section.props as Record<string, unknown>);
  const markup = renderToStaticMarkup(createElement(SectionView, { theme, catalog, page, mode: 'live', section }));
  return withPhotoPlaceholders(markup);
}

/** The starting HTML for a page that has not been edited in the visual editor yet. */
export function pageStartHtml(theme: Theme, catalog: Catalog, page: PageId): string {
  return theme.pages[page].sections.filter((s) => !s.hidden).map((s) => sectionHtml(theme, catalog, page, s)).join('');
}

let counter = 0;
/** Content for a block in the "Add blocks" palette. */
export function blockHtml(theme: Theme, catalog: Catalog, page: PageId, type: SectionType): string {
  counter += 1;
  const id = `${type}-${Date.now().toString(36)}${counter}`.slice(0, 80);
  const section = { id, type, hidden: false, props: SECTION_DEFINITIONS[type].defaults() } as Section;
  return sectionHtml(theme, catalog, page, section);
}
