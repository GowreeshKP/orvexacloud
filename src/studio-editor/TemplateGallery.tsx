import { useEffect, useMemo, useRef, useState } from 'react';
import { buildTheme, NICHES, sampleCatalog, TEMPLATES, type Catalog, type TemplateDefinition } from '@orvexa/theme';
import { Storefront, storefrontHead } from '@orvexa/storefront-ui';

const PREVIEW_WIDTH = 1280;

/** Card thumbnail: CSS container-query scale so live previews never escape the card. */
function TemplateThumb({ theme, catalog }: { theme: ReturnType<typeof buildTheme>; catalog: Catalog }) {
  const head = storefrontHead(theme, catalog, 'home');
  return (
    <div className="template-card__frame" inert aria-hidden="true">
      <link rel="stylesheet" href={head.fontHref} />
      <div className="template-card__stage" style={{ width: PREVIEW_WIDTH }}>
        <Storefront theme={theme} catalog={catalog} page="home" mode="live" hideHiddenSections />
      </div>
    </div>
  );
}

function TemplateCardView({
  template,
  brandName,
  nicheId,
  catalog,
  currentId,
  actionLabel,
  onChoose,
  onPreview,
  featured = false,
}: {
  template: TemplateDefinition;
  brandName: string;
  nicheId: string;
  catalog: Catalog;
  currentId?: string;
  actionLabel: string;
  onChoose: () => void;
  onPreview?: () => void;
  featured?: boolean;
}) {
  return (
    <article className={`template-card${template.id === currentId ? ' is-current' : ''}${featured ? ' template-card--featured' : ''}`}>
      <div className="template-card__preview">
        <TemplateThumb
          theme={buildTheme(template.id, { brandName, nicheId })}
          catalog={catalog}
        />
        {onPreview && (
          <button type="button" className="template-card__zoom" onClick={onPreview}>
            <span className="sr-only">Preview the {template.name} template</span>
          </button>
        )}
      </div>
      <div className="template-card__body">
        <h3>{template.name}{template.id === currentId && <small> (current)</small>}</h3>
        <p>{template.description}</p>
        <button type="button" className="btn btn--small btn--primary" onClick={onChoose}>{actionLabel}</button>
      </div>
    </article>
  );
}

/** The template library: live previews of every template with the merchant's own store name. */
export function TemplateGallery({ brandName, nicheId, catalog, currentId, actionLabel, onChoose }: {
  brandName: string; nicheId: string; catalog: Catalog; currentId?: string; actionLabel: string; onChoose: (template: TemplateDefinition) => void;
}) {
  const [filter, setFilter] = useState(nicheId === 'general' ? 'all' : nicheId);
  const [previewing, setPreviewing] = useState<TemplateDefinition | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const list = filter === 'all' ? TEMPLATES : TEMPLATES.filter((t) => t.niches.includes(filter));
  const shownCatalog = useMemo(() => (catalog.sample ? sampleCatalog(catalog.storeId, filter === 'all' ? nicheId : filter) : catalog), [catalog, filter, nicheId]);

  useEffect(() => {
    if (!previewing) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewing(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewing]);

  return (
    <div className="gallery">
      <div className="chips chips--filters" role="group" aria-label="Filter templates by type of store">
        <button type="button" className={`chip${filter === 'all' ? ' is-on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All {TEMPLATES.length}</button>
        {NICHES.filter((n) => n.id !== 'general').map((n) => (
          <button key={n.id} type="button" className={`chip${filter === n.id ? ' is-on' : ''}`} aria-pressed={filter === n.id} onClick={() => setFilter(n.id)}>{n.label}</button>
        ))}
      </div>
      <ul className="gallery__grid">
        {list.map((template) => (
          <li key={template.id}>
            <TemplateCardView
              template={template}
              brandName={brandName}
              nicheId={nicheId}
              catalog={shownCatalog}
              currentId={currentId}
              actionLabel={actionLabel}
              onChoose={() => onChoose(template)}
              onPreview={() => setPreviewing(template)}
            />
          </li>
        ))}
      </ul>
      {previewing && (
        <div
          className="modal modal--center-card"
          role="dialog"
          aria-modal="true"
          aria-label={`${previewing.name} template`}
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewing(null); }}
        >
          <div className="modal__panel modal__panel--card">
            <TemplateCardView
              template={previewing}
              brandName={brandName}
              nicheId={nicheId}
              catalog={shownCatalog}
              currentId={currentId}
              actionLabel={actionLabel}
              featured
              onChoose={() => { onChoose(previewing); setPreviewing(null); }}
            />
            <div className="modal__actions modal__actions--center">
              <button type="button" className="btn" ref={closeRef} onClick={() => setPreviewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
