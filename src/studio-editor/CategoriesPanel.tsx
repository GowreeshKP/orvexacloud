
import { useMemo, useState } from 'react';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { formatPrice, slugify, type Catalog, type EditOp, type Image, type Theme, type ThemeCollection } from '@orvexa/theme';
import { FieldControl, ImageField, type FieldContext } from './Fields';

type Draft = ThemeCollection & { isNew?: boolean };

function uniqueId(base: string, taken: Set<string>) {
  const root = slugify(base).slice(0, 50) || 'category';
  let id = root;
  for (let n = 2; taken.has(id); n += 1) id = `${root}-${n}`;
  return id;
}

export function CategoriesPanel({ theme, catalog, apply, ctx }: { theme: Theme; catalog: Catalog; apply: (op: EditOp) => boolean; ctx: FieldContext }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const settings = new Map(theme.collections.map((c) => [c.id, c]));
  const custom = theme.collections.filter((c) => c.kind === 'custom');
  const countIn = (id: string) => catalog.products.filter((p) => p.collectionIds.includes(id)).length;

  const editCatalog = (id: string) => {
    const base = catalog.collections.find((c) => c.id === id)!;
    const existing = settings.get(id);
    setDraft(existing ?? { id, kind: 'catalog', title: base.title, description: base.description, image: undefined, productIds: [], hidden: false });
  };
  const toggleHidden = (c: ThemeCollection) => apply({ op: 'upsert_collection', collection: { ...c, hidden: !c.hidden } });

  if (draft) {
    return <CategoryForm theme={theme} draft={draft} catalog={catalog} ctx={ctx} onCancel={() => setDraft(null)}
      onSave={(c) => { if (apply({ op: 'upsert_collection', collection: c })) { setDraft(null); ctx.notify(`“${c.title}” saved.`); } }}
      onDelete={draft.kind === 'custom' && !draft.isNew ? () => { if (apply({ op: 'remove_collection', id: draft.id })) setDraft(null); } : undefined} />;
  }

  return (
    <div className="panel">
      <p className="field__help">Categories become pages in your store, such as /collections/festive. Shoppers reach them from the Shop menu and from category sections on your pages.</p>

      <section className="group">
        <h3>Categories from your products</h3>
        <p className="field__help">These come from the Category field on each product in Orvexa Cloud. Change a product’s category there; here you can rename, describe, add a photo or hide.</p>
        {catalog.sample && <p className="field__help">You are seeing sample categories. Yours appear once you add products.</p>}
        <ul className="category-list">
          {catalog.collections.map((c) => {
            const s = settings.get(c.id);
            const image = s?.image ?? c.image;
            return (
              <li key={c.id} className={s?.hidden ? 'is-hidden' : ''}>
                {image ? <img src={image.url} alt="" /> : <span className="category-list__blank" aria-hidden="true" />}
                <button type="button" className="category-list__name" onClick={() => editCatalog(c.id)}>
                  <strong>{s?.title ?? c.title}</strong>
                  <small>{countIn(c.id)} products{s?.hidden ? ', hidden' : ''}</small>
                </button>
                <button type="button" className="icon-button" aria-label={s?.hidden ? `Show ${c.title}` : `Hide ${c.title}`}
                  onClick={() => toggleHidden(s ?? { id: c.id, kind: 'catalog', title: c.title, description: c.description, productIds: [], hidden: false })}>
                  {s?.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="group">
        <h3>Your own categories</h3>
        <p className="field__help">Group any products you like, for example “Diwali edit” or “Under ₹2,000”.</p>
        {custom.length > 0 && (
          <ul className="category-list">
            {custom.map((c) => (
              <li key={c.id} className={c.hidden ? 'is-hidden' : ''}>
                {c.image ? <img src={c.image.url} alt="" /> : <span className="category-list__blank" aria-hidden="true" />}
                <button type="button" className="category-list__name" onClick={() => setDraft(c)}>
                  <strong>{c.title}</strong>
                  <small>{c.productIds.length} products{c.hidden ? ', hidden' : ''}</small>
                </button>
                <button type="button" className="icon-button" aria-label={c.hidden ? `Show ${c.title}` : `Hide ${c.title}`} onClick={() => toggleHidden(c)}>
                  {c.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn--block" onClick={() => setDraft({ id: '', kind: 'custom', title: '', description: '', productIds: [], hidden: false, isNew: true })}>
          <Plus size={15} aria-hidden="true" /> New category
        </button>
      </section>
    </div>
  );
}

function CategoryForm({ theme, draft: start, catalog: cat, ctx: fieldCtx, onCancel, onSave, onDelete }: {
  theme: Theme; draft: Draft; catalog: Catalog; ctx: FieldContext; onCancel: () => void; onSave: (c: ThemeCollection) => void; onDelete?: () => void;
}) {
  const [form, setForm] = useState<Draft>(start);
  const [query, setQuery] = useState('');
  const visible = useMemo(() => cat.products.filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 200), [cat.products, query]);
  const chosen = new Set(form.productIds);
  const isCustom = form.kind === 'custom';

  function save() {
    const title = form.title.trim();
    if (!title) return fieldCtx.notify('Give the category a name.');
    if (isCustom && form.productIds.length === 0) return fieldCtx.notify('Choose at least one product.');
    const taken = new Set([...cat.collections.map((c) => c.id), ...theme.collections.map((c) => c.id)]);
    const id = form.isNew ? uniqueId(title, taken) : form.id;
    const { isNew: _isNew, ...rest } = form;
    onSave({ ...rest, id, title });
  }

  return (
    <div className="panel">
      <button type="button" className="btn btn--quiet btn--small" onClick={onCancel}>Back to categories</button>
      <h3 className="panel__title">{form.isNew ? 'New category' : `Edit “${start.title}”`}</h3>
      <FieldControl field={{ key: 'title', label: 'Name', kind: 'text', max: 80, noAi: true }} value={form.title} ctx={fieldCtx} onChange={(v) => setForm((f) => ({ ...f, title: String(v) }))} />
      <FieldControl field={{ key: 'description', label: 'Description', kind: 'textarea', max: 500, rows: 3, help: 'Shown at the top of the category page.' }} value={form.description} ctx={fieldCtx} onChange={(v) => setForm((f) => ({ ...f, description: String(v) }))} />
      <ImageField label="Category photo" value={form.image} aspect="portrait" ctx={fieldCtx} help="Used on category tiles. Without one, the first product photo is used."
        onChange={(image: Image | undefined) => setForm((f) => ({ ...f, image }))} />
      {isCustom && (
        <fieldset className="field">
          <legend>Products ({form.productIds.length} chosen)</legend>
          <input type="search" placeholder="Search products" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
          <ul className="product-picker">
            {visible.map((p) => (
              <li key={p.id}>
                <label>
                  <input type="checkbox" checked={chosen.has(p.id)} onChange={(e) => setForm((f) => ({ ...f, productIds: e.target.checked ? [...f.productIds, p.id] : f.productIds.filter((x) => x !== p.id) }))} />
                  {p.images[0] ? <img src={p.images[0].url} alt="" /> : <span className="category-list__blank" aria-hidden="true" />}
                  <span><strong>{p.title}</strong><small>{formatPrice(p.priceMinor, cat.currency)}</small></span>
                </label>
              </li>
            ))}
            {visible.length === 0 && <li className="field__help">No products match.</li>}
          </ul>
        </fieldset>
      )}
      <div className="modal__actions">
        <button type="button" className="btn btn--primary" onClick={save}>Save category</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        {onDelete && <button type="button" className="btn btn--quiet btn--danger" onClick={onDelete}>Delete</button>}
      </div>
    </div>
  );
}
