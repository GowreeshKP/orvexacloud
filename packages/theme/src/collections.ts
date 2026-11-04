import type { Catalog } from './catalog';
import type { Theme } from './schema';

/**
 * Apply the merchant's category settings to a catalogue: rename or restyle
 * categories that come from OrvexaCloud, hide some, and add custom categories
 * made of hand-picked products. Used by the renderer on every page, so the
 * live store and the editor preview always agree.
 */
export function withThemeCollections(catalog: Catalog, theme: Theme): Catalog {
  if (!theme.collections.length) return catalog;
  const settings = new Map(theme.collections.map((c) => [c.id, c]));
  const collections = catalog.collections
    .filter((c) => !settings.get(c.id)?.hidden)
    .map((c) => {
      const s = settings.get(c.id);
      if (!s || s.kind !== 'catalog') return c;
      return { ...c, title: s.title, description: s.description || c.description, image: s.image ?? c.image };
    });
  const custom = theme.collections.filter((c) => c.kind === 'custom' && !c.hidden);
  for (const c of custom) collections.push({ id: c.id, handle: c.id, title: c.title, description: c.description, image: c.image });
  const membership = new Map<string, string[]>();
  for (const c of custom) for (const productId of c.productIds) membership.set(productId, [...(membership.get(productId) ?? []), c.id]);
  const products = membership.size
    ? catalog.products.map((p) => (membership.has(p.id) ? { ...p, collectionIds: [...p.collectionIds, ...membership.get(p.id)!] } : p))
    : catalog.products;
  return { ...catalog, collections, products };
}
