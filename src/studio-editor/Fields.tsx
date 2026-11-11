
import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { REWRITE_STYLES, type Catalog, type CropAspect, type Field, type Image, type RewriteStyle } from '@orvexa/theme';
import { PhotoEditor } from './PhotoEditor';
import { StockPicker } from './StockPicker';
import { api } from './api';

export type FieldContext = { catalog: Catalog; brandName: string; nicheId: string; aiEnabled: boolean; stockEnabled: boolean; stockQuery: string; notify: (message: string) => void };

const STYLE_LABELS: Record<RewriteStyle, string> = {
  write: 'Write a new version', improve: 'Make it clearer', shorter: 'Make it shorter', premium: 'Make it feel premium', friendly: 'Make it friendlier',
  hinglish: 'Rewrite in Hinglish', hindi: 'Translate to Hindi', tamil: 'Translate to Tamil',
};

/** Local text state that commits after a pause or on blur, so undo steps are whole edits. */
function useCommittedText(value: string, commit: (next: string) => void) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(value);
  useEffect(() => {
    if (value !== latest.current) {
      latest.current = value;
      setText(value);
    }
  }, [value]);
  const flush = (next: string) => {
    clearTimeout(timer.current);
    if (next !== latest.current) {
      latest.current = next;
      commit(next);
    }
  };
  const change = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(next), 600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return { text, change, flush, setNow: (next: string) => { setText(next); flush(next); } };
}

/**
 * Magic AI for one text field. An empty field gets "Write with Magic AI";
 * a filled one gets a menu of rewrites. Suggestions never replace the
 * merchant's text until they choose "Use this".
 */
export function AiRewrite({ text, label, max, ctx, context, onAccept }: { text: string; label: string; max: number; ctx: FieldContext; context?: string; onAccept: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  if (!ctx.aiEnabled) return null;
  const empty = !text.trim();
  async function run(style: RewriteStyle) {
    setOpen(false);
    setBusy(true);
    try {
      const result = await api.rewrite({ text, style, fieldLabel: label, maxLength: max, brandName: ctx.brandName, nicheId: ctx.nicheId, context });
      setSuggestion(result.text);
    } catch (error) {
      ctx.notify(error instanceof Error ? error.message : 'Magic AI could not write this.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rewrite">
      {empty ? (
        <button type="button" className="link-button magic" onClick={() => void run('write')} disabled={busy}>
          <Sparkles size={13} aria-hidden="true" /> {busy ? 'Writing…' : 'Write with Magic AI'}
        </button>
      ) : (
        <button type="button" className="link-button magic" onClick={() => setOpen((v) => !v)} disabled={busy} aria-expanded={open}>
          <Sparkles size={13} aria-hidden="true" /> {busy ? 'Writing…' : 'Magic AI'}
        </button>
      )}
      {open && (
        <ul className="menu" role="menu">
          {(Object.keys(REWRITE_STYLES) as RewriteStyle[]).map((style) => (
            <li key={style}><button type="button" role="menuitem" onClick={() => void run(style)}>{STYLE_LABELS[style]}</button></li>
          ))}
        </ul>
      )}
      {suggestion !== null && (
        <div className="suggestion" role="status">
          <p>{suggestion}</p>
          {/\[[^\]]+\]/.test(suggestion) && <p className="field__help">Replace the parts in [square brackets] with your own details.</p>}
          <div className="suggestion__actions">
            <button type="button" className="btn btn--small btn--primary" onClick={() => { onAccept(suggestion); setSuggestion(null); }}>Use this</button>
            <button type="button" className="btn btn--small" onClick={() => setSuggestion(null)}>{empty ? 'Discard' : 'Keep mine'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TextField({ field, value, onChange, ctx, multiline, aiContext }: { field: Extract<Field, { kind: 'text' | 'textarea' }>; value: string; onChange: (v: string) => void; ctx: FieldContext; multiline: boolean; aiContext?: string }) {
  const id = useId();
  const { text, change, flush, setNow } = useCommittedText(value, onChange);
  const near = text.length > field.max * 0.9;
  return (
    <div className="field">
      <div className="field__top">
        <label htmlFor={id}>{field.label}</label>
        <span className={`field__count${near ? ' is-near' : ''}`} aria-live="polite">{text.length}/{field.max}</span>
      </div>
      {multiline
        ? <textarea id={id} value={text} maxLength={field.max} rows={field.kind === 'textarea' ? field.rows ?? 4 : 3} placeholder={field.placeholder} onChange={(e) => change(e.target.value)} onBlur={(e) => flush(e.target.value)} />
        : <input id={id} value={text} maxLength={field.max} placeholder={field.placeholder} onChange={(e) => change(e.target.value)} onBlur={(e) => flush(e.target.value)} />}
      {field.help && <p className="field__help">{field.help}</p>}
      {!(field.kind === 'text' && field.noAi) && <AiRewrite text={text} label={field.label} max={field.max} ctx={ctx} context={aiContext} onAccept={setNow} />}
    </div>
  );
}

function HrefField({ label, value, onChange, catalog }: { label: string; value: string; onChange: (v: string) => void; catalog: Catalog }) {
  const id = useId();
  const listId = useId();
  const { text, change, flush } = useCommittedText(value, onChange);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={text} list={listId} placeholder="/collections/all" onChange={(e) => change(e.target.value)} onBlur={(e) => flush(e.target.value)} />
      <datalist id={listId}>
        <option value="/collections/all">All products</option>
        {catalog.collections.map((c) => <option key={c.id} value={`/collections/${c.handle}`}>{c.title}</option>)}
        <option value="/pages/about">About page</option>
        <option value="/pages/contact">Contact page</option>
      </datalist>
      <p className="field__help">A page in your store (starts with /) or a full https:// address.</p>
    </div>
  );
}

/** Upload a photo after the merchant crops and adjusts it. */
async function uploadEdited(file: File, alt: string): Promise<Image> {
  const { url } = await api.upload(file);
  return { url, alt };
}

export function ImageField({ label, value, onChange, ctx, help, aspect = 'landscape' }: {
  label: string; value?: Image; onChange: (v: Image | undefined) => void; ctx: FieldContext; help?: string; aspect?: CropAspect;
}) {
  const inputId = useId();
  const altId = useId();
  const [editing, setEditing] = useState<File | string | null>(null);
  const [stock, setStock] = useState(false);
  const [stockAlt, setStockAlt] = useState('');
  const alt = useCommittedText(value?.alt ?? '', (next) => value && onChange({ ...value, alt: next }));
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      {value ? (
        <div className="image-field">
          <img src={value.url} alt="" />
          <div className="image-field__actions">
            <button type="button" className="btn btn--small" onClick={() => setEditing(value.url)}>Edit</button>
            <label className="btn btn--small" htmlFor={inputId}>Replace</label>
            <button type="button" className="btn btn--small btn--quiet" onClick={() => onChange(undefined)}><Trash2 size={13} aria-hidden="true" /> Remove</button>
          </div>
        </div>
      ) : (
        <label className="dropzone" htmlFor={inputId}><ImagePlus size={18} aria-hidden="true" /> Add a photo<small>JPG, PNG or WebP. You can crop it next.</small></label>
      )}
      {ctx.stockEnabled && <button type="button" className="link-button" onClick={() => setStock(true)}>Choose a free stock photo</button>}
      {stock && <StockPicker initialQuery={ctx.stockQuery} aspect={aspect} onClose={() => setStock(false)} onPicked={(photo) => { setStock(false); setStockAlt(photo.alt); setEditing(photo.url); }} />}
      <input id={inputId} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) setEditing(f); e.target.value = ''; }} />
      {value && (
        <>
          <label htmlFor={altId} className="field__sub">Describe the photo</label>
          <input id={altId} value={alt.text} maxLength={200} placeholder="e.g. Model wearing a green silk saree" onChange={(e) => alt.change(e.target.value)} onBlur={(e) => alt.flush(e.target.value)} />
        </>
      )}
      {help && <p className="field__help">{help}</p>}
      {editing && (
        <PhotoEditor source={editing} aspect={aspect} title={`Edit photo: ${label}`} onCancel={() => setEditing(null)}
          onSave={async (file) => {
            try {
              onChange(await uploadEdited(file, value?.alt || stockAlt));
              setStockAlt('');
              setEditing(null);
            } catch (error) {
              ctx.notify(error instanceof Error ? error.message : 'The photo could not be uploaded.');
              throw error;
            }
          }} />
      )}
    </div>
  );
}

type GalleryItem = { url: string; alt: string; caption: string; href: string } | null;

function GalleryField({ label, value, onChange, ctx, maxItems, aspect = 'portrait', help }: {
  label: string; value: GalleryItem[]; onChange: (v: GalleryItem[]) => void; ctx: FieldContext; maxItems: number; aspect?: CropAspect; help?: string;
}) {
  const items = value ?? [];
  const [editing, setEditing] = useState<{ index: number; source: File | string } | null>(null);
  const inputId = useId();
  const [target, setTarget] = useState(0);
  const [stock, setStock] = useState(false);
  const set = (index: number, next: GalleryItem) => {
    const copy = [...items];
    while (copy.length <= index) copy.push(null);
    copy[index] = next;
    onChange(copy);
  };
  const move = (from: number, to: number) => {
    const copy = [...items];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    onChange(copy);
  };
  const filled = items.filter(Boolean).length;
  return (
    <fieldset className="field gallery-field">
      <legend>{label}</legend>
      {help && <p className="field__help">{help}</p>}
      {items.map((item, index) => item && (
        <div className="gallery-field__item" key={`${index}-${item.url}`}>
          <img src={item.url} alt="" />
          <div className="gallery-field__body">
            <CommittedInput label={`Photo ${index + 1} description`} value={item.alt} max={200} placeholder="Describe the photo" onCommit={(alt) => set(index, { ...item, alt })} />
            <CommittedInput label={`Photo ${index + 1} caption`} value={item.caption} max={80} placeholder="Caption (optional)" onCommit={(caption) => set(index, { ...item, caption })} />
            <CommittedInput label={`Photo ${index + 1} link`} value={item.href} max={300} placeholder="Link, e.g. /collections/festive (optional)" onCommit={(href) => set(index, { ...item, href })} />
            <div className="gallery-field__actions">
              <button type="button" className="btn btn--small" onClick={() => setEditing({ index, source: item.url })}>Edit</button>
              <button type="button" className="icon-button" aria-label={`Move photo ${index + 1} earlier`} disabled={index === 0} onClick={() => move(index, index - 1)}>↑</button>
              <button type="button" className="icon-button" aria-label={`Move photo ${index + 1} later`} disabled={index === items.length - 1} onClick={() => move(index, index + 1)}>↓</button>
              <button type="button" className="icon-button" aria-label={`Remove photo ${index + 1}`} onClick={() => onChange(items.filter((_, i) => i !== index))}><Trash2 size={14} /></button>
            </div>
          </div>
        </div>
      ))}
      {filled < maxItems && (
        <label className="dropzone" htmlFor={inputId} onClick={() => setTarget(items.length)}><ImagePlus size={18} aria-hidden="true" /> Add a photo<small>{filled} of {maxItems}. You can crop each one.</small></label>
      )}
      <input id={inputId} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) setEditing({ index: target, source: f }); e.target.value = ''; }} />
      {ctx.stockEnabled && filled < maxItems && <button type="button" className="link-button" onClick={() => setStock(true)}>Add a free stock photo</button>}
      {stock && <StockPicker initialQuery={ctx.stockQuery} aspect={aspect} onClose={() => setStock(false)} onPicked={(photo) => { setStock(false); set(items.length, { url: photo.url, alt: photo.alt, caption: '', href: '' }); }} />}
      {editing && (
        <PhotoEditor source={editing.source} aspect={aspect} title={`Gallery photo ${editing.index + 1}`} onCancel={() => setEditing(null)}
          onSave={async (file) => {
            try {
              const current = items[editing.index];
              const uploaded = await uploadEdited(file, current?.alt ?? '');
              set(editing.index, { caption: '', href: '', ...current, ...uploaded });
              setEditing(null);
            } catch (error) {
              ctx.notify(error instanceof Error ? error.message : 'The photo could not be uploaded.');
              throw error;
            }
          }} />
      )}
    </fieldset>
  );
}

function ListEditor<T>({ label, items, maxItems, empty, make, render, onChange, help }: {
  label: string; items: T[]; maxItems: number; empty: T; help?: string;
  make?: () => T; render: (item: T, update: (next: T) => void, index: number) => React.ReactNode; onChange: (next: T[]) => void;
}) {
  return (
    <fieldset className="field list-editor">
      <legend>{label}</legend>
      {help && <p className="field__help">{help}</p>}
      {items.map((item, index) => (
        <div className="list-editor__row" key={index}>
          <div className="list-editor__body">{render(item, (next) => onChange(items.map((x, i) => (i === index ? next : x))), index)}</div>
          <button type="button" className="icon-button" aria-label={`Remove item ${index + 1}`} onClick={() => onChange(items.filter((_, i) => i !== index))}><X size={14} /></button>
        </div>
      ))}
      {items.length < maxItems && <button type="button" className="btn btn--small" onClick={() => onChange([...items, make ? make() : empty])}><Plus size={13} aria-hidden="true" /> Add</button>}
    </fieldset>
  );
}

function CommittedInput({ value, onCommit, max, placeholder, label, multiline }: { value: string; onCommit: (v: string) => void; max: number; placeholder?: string; label: string; multiline?: boolean }) {
  const { text, change, flush } = useCommittedText(value, onCommit);
  return multiline
    ? <textarea aria-label={label} value={text} maxLength={max} rows={3} placeholder={placeholder} onChange={(e) => change(e.target.value)} onBlur={(e) => flush(e.target.value)} />
    : <input aria-label={label} value={text} maxLength={max} placeholder={placeholder} onChange={(e) => change(e.target.value)} onBlur={(e) => flush(e.target.value)} />;
}

export function FieldControl({ field, value, onChange, ctx, aiContext }: { field: Field; value: unknown; onChange: (v: unknown) => void; ctx: FieldContext; aiContext?: string }) {
  const id = useId();
  switch (field.kind) {
    case 'text':
    case 'textarea':
      return <TextField field={field} value={String(value ?? '')} onChange={onChange} ctx={ctx} multiline={field.kind === 'textarea'} aiContext={aiContext} />;
    case 'href':
      return <HrefField label={field.label} value={String(value ?? '')} onChange={onChange} catalog={ctx.catalog} />;
    case 'select':
      if (field.options.length > 3) {
        return (
          <div className="field">
            <label htmlFor={id}>{field.label}</label>
            <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
              {field.options.map(([option, label]) => <option key={option} value={option}>{label}</option>)}
            </select>
          </div>
        );
      }
      return (
        <div className="field">
          <span className="field__label" id={id}>{field.label}</span>
          <div className="segmented" role="radiogroup" aria-labelledby={id}>
            {field.options.map(([option, label]) => (
              <button key={option} type="button" role="radio" aria-checked={value === option} className={value === option ? 'is-on' : ''} onClick={() => onChange(option)}>{label}</button>
            ))}
          </div>
        </div>
      );
    case 'toggle':
      return (
        <label className="toggle">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <span>{field.label}</span>
        </label>
      );
    case 'number':
      return (
        <div className="field">
          <label htmlFor={id}>{field.label}</label>
          <div className="stepper">
            <input id={id} type="range" min={field.min} max={field.max} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} />
            <output htmlFor={id}>{String(value)}</output>
          </div>
        </div>
      );
    case 'image':
      return <ImageField label={field.label} value={value as Image | undefined} onChange={onChange} ctx={ctx} help={field.help} aspect={field.aspect} />;
    case 'gallery':
      return <GalleryField label={field.label} value={value as GalleryItem[]} onChange={onChange} ctx={ctx} maxItems={field.maxItems} aspect={field.aspect} help={field.help} />;
    case 'string-list':
      return <ListEditor label={field.label} help={field.help} items={(value as string[]) ?? []} maxItems={field.maxItems} empty="" onChange={onChange}
        render={(item, update, i) => <CommittedInput label={`Line ${i + 1}`} value={item} max={field.max} onCommit={update} />} />;
    case 'faq-list':
      return <ListEditor label={field.label} help={field.help} items={(value as Array<{ question: string; answer: string }>) ?? []} maxItems={field.maxItems} empty={{ question: 'New question', answer: 'Your answer' }} onChange={onChange}
        render={(item, update, i) => <>
          <CommittedInput label={`Question ${i + 1}`} value={item.question} max={200} onCommit={(question) => update({ ...item, question })} />
          <CommittedInput label={`Answer ${i + 1}`} value={item.answer} max={1000} multiline onCommit={(answer) => update({ ...item, answer })} />
        </>} />;
    case 'quote-list':
      return <ListEditor label={field.label} help={field.help} items={(value as Array<{ quote: string; author: string }>) ?? []} maxItems={field.maxItems} empty={{ quote: 'Paste the review here', author: 'Customer name' }} onChange={onChange}
        render={(item, update, i) => <>
          <CommittedInput label={`Review ${i + 1}`} value={item.quote} max={400} multiline onCommit={(quote) => update({ ...item, quote })} />
          <CommittedInput label={`Reviewer ${i + 1}`} value={item.author} max={80} onCommit={(author) => update({ ...item, author })} />
        </>} />;
    case 'collections': {
      const selected = (value as string[]) ?? [];
      return (
        <fieldset className="field">
          <legend>{field.label}</legend>
          {field.help && <p className="field__help">{field.help}</p>}
          {ctx.catalog.collections.length === 0 && <p className="field__help">You have no collections yet.</p>}
          <div className="checks">
            {ctx.catalog.collections.map((c) => (
              <label key={c.id} className="toggle">
                <input type="checkbox" checked={selected.includes(c.id)} disabled={!selected.includes(c.id) && selected.length >= field.maxItems}
                  onChange={(e) => onChange(e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))} />
                <span>{c.title}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case 'product-source': {
      const source = (value as { kind: string; collectionId?: string }) ?? { kind: 'featured' };
      const current = source.kind === 'collection' ? `collection:${source.collectionId}` : source.kind;
      return (
        <div className="field">
          <label htmlFor={id}>{field.label}</label>
          <select id={id} value={current} onChange={(e) => {
            const next = e.target.value;
            onChange(next.startsWith('collection:') ? { kind: 'collection', collectionId: next.slice(11) } : { kind: next });
          }}>
            <option value="featured">Featured products</option>
            <option value="newest">Newest products</option>
            {ctx.catalog.collections.map((c) => <option key={c.id} value={`collection:${c.id}`}>From “{c.title}”</option>)}
          </select>
        </div>
      );
    }
  }
}
