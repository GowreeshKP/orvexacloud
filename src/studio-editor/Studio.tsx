
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ExternalLink, Eye, FolderTree, History, Monitor, Paintbrush, PencilLine, Redo2, Search, Smartphone, SquareStack, Undo2 } from 'lucide-react';
import { applyOps, getNiche, sampleCatalog, type Catalog, type EditOp, type Layout, type PageId, type Theme } from '@orvexa/theme';
import '@orvexa/storefront-ui/storefront.css';
import { api, ApiError } from './api';
import { Canvas, type NavTarget } from './Canvas';
import { CategoriesPanel } from './CategoriesPanel';
import { PhotoEditor } from './PhotoEditor';
import { DesignPanel } from './DesignPanel';
import { HistoryDialog, PublishDialog, TemplatesDialog } from './Dialogs';
import type { FieldContext } from './Fields';
import { Onboarding } from './Onboarding';
import { GrapesEditor, type GrapesApi, type PhotoRequest } from './grapes/GrapesEditor';
import { StockPicker } from './StockPicker';
import { SeoPanel } from './SeoPanel';
import { initialState, reducer, type Panel } from './state';

type Props = {
  session: { storeId: string; storeName: string; role: 'owner' | 'staff' };
  initialTheme: Theme | null;
  initialRevision: number | null;
  catalog: Catalog;
  imported: { theme: Theme; warnings: string[] } | null;
  publishedVersion: number | null;
  aiEnabled: boolean;
  /** Plan-dependent features. Search settings are an Enterprise feature. */
  features: { seo: boolean; stock: boolean };
};

const PANELS: Array<[Panel, string, typeof SquareStack]> = [
  ['sections', 'Sections', SquareStack], ['design', 'Design', Paintbrush], ['categories', 'Categories', FolderTree], ['seo', 'SEO', Search],
];

const SAVE_LABEL = { saved: 'All changes saved', saving: 'Saving…', unsaved: 'Unsaved changes', error: 'Could not save', conflict: 'Changed in another window' } as const;

export function Studio({ session, initialTheme, initialRevision, catalog: storeCatalog, imported, publishedVersion, aiEnabled, features }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState(initialTheme, initialRevision));
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'publish' | 'history' | 'templates' | null>(null);
  const [published, setPublished] = useState(publishedVersion);
  const [useSample, setUseSample] = useState(false);
  const [photoJob, setPhotoJob] = useState<{ request: PhotoRequest; source: File | string; alt?: string } | null>(null);
  const [stockJob, setStockJob] = useState<PhotoRequest | null>(null);
  const pendingPhoto = useRef<PhotoRequest | null>(null);
  const grapesApi = useRef<GrapesApi | null>(null);
  const [grapesReady, setGrapesReady] = useState(false);
  /** What the last edit changed, so undo and redo go to the right history. */
  const lastEdit = useRef<'theme' | 'page'>('page');
  /** Bumped when the whole design is replaced (restore), so the visual editor reloads. */
  const [epoch, setEpoch] = useState(0);
  const photoInput = useRef<HTMLInputElement>(null);
  const catalog = useSample || storeCatalog.sample ? sampleCatalog(session.storeId, state.theme?.nicheId ?? 'general') : storeCatalog;
  const storeUrl = `https://orvexacloud.in/${session.storeId}${published != null ? `?v=${published}` : ''}`;

  // Edits always build on the newest theme, even from a debounced field commit.
  const themeRef = useRef(state.theme);
  themeRef.current = state.theme;

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 5000);
  }, []);

  const apply = useCallback((op: EditOp): boolean => {
    const theme = themeRef.current;
    if (!theme) return false;
    const result = applyOps(theme, [op]);
    if (!result.ok) {
      notify(result.errors[0]);
      return false;
    }
    themeRef.current = result.theme;
    lastEdit.current = 'theme';
    dispatch({ type: 'commit', theme: result.theme });
    return true;
  }, [notify]);

  // ------------------------------------------------------------- autosave
  const saving = useRef(false);
  const stateRevision = useRef(state.revision);
  stateRevision.current = state.revision;
  const save = useCallback(async () => {
    const theme = themeRef.current;
    if (!theme || saving.current) return;
    saving.current = true;
    dispatch({ type: 'saving' });
    try {
      const result = await api.saveDraft(theme, stateRevision.current);
      stateRevision.current = result.revision;
      dispatch({ type: 'saved', revision: result.revision, theme });
    } catch (error) {
      dispatch({ type: 'save-failed', conflict: error instanceof ApiError && error.status === 409 });
      if (error instanceof ApiError && error.status === 401) notify(error.message);
    } finally {
      saving.current = false;
    }
  }, [notify]);
  useEffect(() => {
    if (!state.theme || state.saveState !== 'unsaved') return;
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
  }, [state.theme, state.saveState, state.revision, save]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (state.saveState !== 'saved') event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state.saveState]);

  // ------------------------------------------------------------- shortcuts
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dialog) setDialog(null);
        else if (state.proposal) dispatch({ type: 'propose', proposal: null });
        else dispatch({ type: 'select', sectionId: null });
        return;
      }
      // Ctrl+Z inside the page is handled by the visual editor (GrapesJS).
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, state.proposal]);


  // ------------------------------------------------------------- photos and page layouts from the visual editor
  const requestPhoto = useCallback((request: PhotoRequest) => {
    if (request.mode === 'stock') setStockJob(request);
    else if (request.mode === 'edit' && request.current) setPhotoJob({ request, source: request.current });
    else { pendingPhoto.current = request; photoInput.current?.click(); }
  }, []);

  const commitLayout = useCallback((page: PageId, layout: Layout, initial = false) => {
    const theme = themeRef.current;
    if (!theme) return;
    const result = applyOps(theme, [{ op: 'set_layout', page, layout }]);
    if (!result.ok) { notify(`That change could not be saved: ${result.errors[0]}`); return; }
    themeRef.current = result.theme;
    if (!initial) lastEdit.current = 'page'; // an automatic first save is not an edit
    dispatch({ type: 'layout', theme: result.theme });
  }, [notify]);

  /** Undo or redo the last edit: design and template changes in the studio, page edits in GrapesJS. */
  const history = (direction: 'undo' | 'redo') => {
    const theme = themeRef.current;
    const target = direction === 'undo' ? state.past.at(-1) : state.future[0];
    const canvasCan = direction === 'undo' ? grapesApi.current?.hasUndo() : grapesApi.current?.hasRedo();
    // Studio history when the last edit was a design or template change, or the canvas has nothing to undo.
    if ((lastEdit.current === 'theme' || !canvasCan) && target && theme) {
      if (JSON.stringify(target.pages) !== JSON.stringify(theme.pages)) setEpoch((n) => n + 1); // pages changed: reload the canvas
      themeRef.current = target;
      dispatch({ type: direction });
      return;
    }
    if (grapesApi.current) grapesApi.current[direction]();
    else dispatch({ type: direction });
  };

  const navigate = useCallback((target: NavTarget) => {
    if ('notice' in target) notify(target.notice);
    else dispatch({ type: 'navigate', page: target.page, handle: target.handle });
  }, [notify]);

  const ctx: FieldContext = { catalog, brandName: state.theme?.brand.name ?? session.storeName, nicheId: state.theme?.nicheId ?? 'general', aiEnabled, stockEnabled: features.stock, stockQuery: getNiche(state.theme?.nicheId ?? 'general').photoQuery, notify };

  // ------------------------------------------------------------- render
  if (!state.theme) {
    return <Onboarding storeName={session.storeName} catalog={catalog} imported={imported} onDone={(theme) => dispatch({ type: 'replace', theme, revision: null })} />;
  }
  const theme = state.theme;

  return (
    <div className="studio">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="mark" aria-hidden="true">O</span>
          <div><strong>{theme.brand.name}</strong><span>Storefront Studio</span></div>
        </div>
        <div className="topbar__center">
          <div className="segmented segmented--dark" role="radiogroup" aria-label="Preview size">
            <button type="button" role="radio" aria-checked={state.device === 'desktop'} className={state.device === 'desktop' ? 'is-on' : ''} onClick={() => dispatch({ type: 'device', device: 'desktop' })}><Monitor size={15} aria-hidden="true" /> Desktop</button>
            <button type="button" role="radio" aria-checked={state.device === 'mobile'} className={state.device === 'mobile' ? 'is-on' : ''} onClick={() => dispatch({ type: 'device', device: 'mobile' })}><Smartphone size={15} aria-hidden="true" /> Mobile</button>
          </div>
        </div>
        <div className="topbar__actions">
          <button type="button" className="icon-button icon-button--dark" aria-label="Undo" title="Undo" disabled={!grapesReady && !state.past.length} onClick={() => history('undo')}><Undo2 size={16} /></button>
          <button type="button" className="icon-button icon-button--dark" aria-label="Redo" title="Redo" disabled={!grapesReady && !state.future.length} onClick={() => history('redo')}><Redo2 size={16} /></button>
          <span className={`save-state save-state--${state.saveState}`} role="status">{SAVE_LABEL[state.saveState]}</span>
          {state.saveState === 'error' && <button type="button" className="btn btn--small btn--on-dark" onClick={() => void save()}>Retry</button>}
          <button type="button" className="btn btn--small btn--on-dark" aria-pressed={state.mode === 'preview'} title={state.mode === 'preview' ? 'Back to editing' : 'Preview'} onClick={() => dispatch({ type: 'mode', mode: state.mode === 'preview' ? 'edit' : 'preview' })}>
            {state.mode === 'preview' ? <><PencilLine size={14} aria-hidden="true" /> <span className="topbar__label">Edit</span></> : <><Eye size={14} aria-hidden="true" /> <span className="topbar__label">Preview</span></>}
          </button>
          <button type="button" className="btn btn--small btn--on-dark" title="History" onClick={() => setDialog('history')}><History size={14} aria-hidden="true" /> <span className="topbar__label">History</span></button>
          {published !== null && <a className="btn btn--small btn--on-dark" href={storeUrl} target="_blank" rel="noopener noreferrer" title="Open live store">Live <ExternalLink size={13} aria-hidden="true" /></a>}
          <button type="button" className="btn btn--publish" onClick={() => setDialog('publish')}>Publish</button>
        </div>
      </header>

      {state.saveState === 'conflict' && (
        <div className="banner banner--warning" role="alert">
          This store was saved from another window or by a teammate. Reload to load the newest version; changes you made here since your last save will be lost.
          <button type="button" className="btn btn--small" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}

      {state.mode === 'preview' || state.proposal ? (
        <div className="workspace workspace--preview">
          <main className="stage" id="main">
            <Canvas
              theme={theme} catalog={catalog} page={state.page} handle={state.handle} device={state.device} mode={state.mode} selected={null}
              onSelect={() => undefined}
              onPhoto={() => undefined}
              onNavigate={navigate}
              sample={{ available: !storeCatalog.sample, on: useSample, toggle: setUseSample }}
              proposal={state.proposal}
              onAcceptProposal={() => { if (state.proposal) { themeRef.current = state.proposal.theme; dispatch({ type: 'commit', theme: state.proposal.theme }); } }}
              onDiscardProposal={() => dispatch({ type: 'propose', proposal: null })}
            />
          </main>
        </div>
      ) : (
        <div className="workspace workspace--grapes">
          <nav className="rail" aria-label="Editor panels">
            {PANELS.filter(([id]) => id !== 'seo' || features.seo).map(([id, label, Icon]) => (
              <button key={id} type="button" className={state.panel === id ? 'is-on' : ''} aria-pressed={state.panel === id} onClick={() => dispatch({ type: 'panel', panel: id })}>
                <Icon size={18} aria-hidden="true" /><span>{label}</span>
              </button>
            ))}
          </nav>
          <GrapesEditor
            key={`${state.page}-${epoch}-${useSample ? 'sample' : 'store'}`}
            theme={theme} catalog={catalog} page={state.page} device={state.device} ctx={ctx}
            pageTabs={<PageTabs page={state.page} onPage={(page) => dispatch({ type: 'page', page })} />}
            left={state.panel === 'sections' ? undefined : (
              <>
                {state.panel === 'design' && <DesignPanel theme={theme} apply={apply} ctx={ctx} onOpenTemplates={() => setDialog('templates')} />}
                {state.panel === 'categories' && <CategoriesPanel theme={theme} catalog={catalog} apply={apply} ctx={ctx} />}
                {state.panel === 'seo' && features.seo && <SeoPanel theme={theme} apply={apply} storeUrl={storeUrl} ctx={ctx} />}
              </>
            )}
            onLayout={(layout, initial) => commitLayout(state.page, layout, initial)}
            onPhoto={requestPhoto}
            onReady={(api) => { grapesApi.current = api; setGrapesReady(Boolean(api)); }}
          />
        </div>
      )}

      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const request = pendingPhoto.current;
          if (file && request) setPhotoJob({ request, source: file });
          e.target.value = '';
        }} />
      {stockJob && (
        <StockPicker initialQuery={ctx.stockQuery} aspect={stockJob.aspect} onClose={() => setStockJob(null)}
          onPicked={(photo) => { setPhotoJob({ request: stockJob, source: photo.url, alt: photo.alt }); setStockJob(null); }} />
      )}
      {photoJob && (
        <PhotoEditor source={photoJob.source} aspect={photoJob.request.aspect} title="Edit photo" onCancel={() => setPhotoJob(null)}
          onSave={async (file) => {
            try {
              const { url } = await api.upload(file);
              photoJob.request.apply(url, photoJob.alt);
              setPhotoJob(null);
              notify('Photo saved. Add a short description in “Alt”.');
            } catch (error) {
              notify(error instanceof Error ? error.message : 'The photo could not be uploaded.');
              throw error;
            }
          }} />
      )}
      {dialog === 'templates' && (
        <TemplatesDialog theme={theme} catalog={catalog} onClose={() => setDialog(null)} onChoose={({ template, mode }) => {
          const ok = apply(mode === 'style' ? { op: 'apply_template_style', templateId: template.id } : { op: 'apply_template', templateId: template.id });
          if (!ok) return;
          setDialog(null);
          // Always remount the visual editor so template colours/layout show immediately.
          dispatch({ type: 'page', page: mode === 'replace' ? 'home' : state.page });
          setEpoch((n) => n + 1);
          notify(mode === 'style' ? `Now using the ${template.name} style. Your pages are unchanged; the undo arrow reverses this.` : `Your homepage now uses the ${template.name} layout. The undo arrow brings your previous homepage back.`);
        }} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}

      {dialog === 'publish' && (
        <PublishDialog theme={theme} seoChecks={features.seo} revision={state.revision} saved={state.saveState === 'saved'} canPublish={session.role === 'owner'} storeUrl={storeUrl}
          onClose={() => setDialog(null)} onPublished={(v) => setPublished(v.version)} />
      )}
      {dialog === 'history' && (
        <HistoryDialog revision={state.revision} onClose={() => setDialog(null)} onRestored={(restored, revision, version) => {
          themeRef.current = restored;
          dispatch({ type: 'replace', theme: restored, revision, saved: true });
          setEpoch((n) => n + 1);
          setDialog(null);
          notify(`Version ${version} restored to your draft. Publish to make it live.`);
        }} />
      )}
    </div>
  );
}

const PAGE_TABS: Array<[PageId, string]> = [['home', 'Home'], ['collection', 'Shop'], ['product', 'Product'], ['about', 'About'], ['contact', 'Contact']];

function PageTabs({ page, onPage }: { page: PageId; onPage: (page: PageId) => void }) {
  return (
    <div className="segmented segmented--full segmented--pages" role="tablist" aria-label="Page">
      {PAGE_TABS.map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={page === id} className={page === id ? 'is-on' : ''} onClick={() => onPage(id)}>{label}</button>
      ))}
    </div>
  );
}
