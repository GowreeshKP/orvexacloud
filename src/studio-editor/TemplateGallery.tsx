import { useMemo, useState } from 'react';
import { buildTheme, NICHES, sampleCatalog, TEMPLATES, type Catalog, type TemplateDefinition } from '@orvexa/theme';
import { Storefront, storefrontHead } from '@orvexa/storefront-ui';
import { ScaledStorefront } from './Canvas';

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

/** The template library: live previews of every template with the merchant's own store name. */
export function TemplateGallery({ brandName, nicheId, catalog, currentId, actionLabel, onChoose }: {
  brandName: string; nicheId: string; catalog: Catalog; currentId?: string; actionLabel: string; onChoose: (template: TemplateDefinition) => void;
}) {
  const [filter, setFilter] = useState(nicheId === 'general' ? 'all' : nicheId);
  const [previewing, setPreviewing] = useState<TemplateDefinition | null>(null);
  const list = filter === 'all' ? TEMPLATES : TEMPLATES.filter((t) => t.niches.includes(filter));
  const shownCatalog = useMemo(() => (catalog.sample ? sampleCatalog(catalog.storeId, filter === 'all' ? nicheId : filter) : catalog), [catalog, filter, nicheId]);

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
          <li key={template.id} className={`template-card${template.id === currentId ? ' is-current' : ''}`}>
            <div className="template-card__preview">
              <TemplateThumb
                key={`${template.id}-${filter}`}
                theme={buildTheme(template.id, { brandName, nicheId })}
                catalog={shownCatalog}
              />
              <button type="button" className="template-card__zoom" onClick={() => setPreviewing(template)}><span className="sr-only">Preview the {template.name} template</span></button>
            </div>
            <div className="template-card__body">
              <h3>{template.name}{template.id === currentId && <small> (current)</small>}</h3>
              <p>{template.description}</p>
              <button type="button" className="btn btn--small" onClick={() => onChoose(template)}>{actionLabel}</button>
            </div>
          </li>
        ))}
      </ul>
      {previewing && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={`${previewing.name} preview`}>
          <div className="modal__panel modal__panel--wide">
            <header className="modal__head">
              <div><h2>{previewing.name}</h2><p>{previewing.description}</p></div>
              <div className="modal__actions">
                <button type="button" className="btn btn--primary" onClick={() => { onChoose(previewing); setPreviewing(null); }}>{actionLabel}</button>
                <button type="button" className="btn" onClick={() => setPreviewing(null)} autoFocus>Close</button>
              </div>
            </header>
            <div className="modal__scroll">
              <ScaledStorefront theme={buildTheme(previewing.id, { brandName, nicheId })} catalog={shownCatalog} page="home" width={PREVIEW_WIDTH} maxHeight={Math.round(window.innerHeight * 0.7)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
