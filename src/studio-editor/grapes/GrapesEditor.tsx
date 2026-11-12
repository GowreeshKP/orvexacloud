// @ts-nocheck — GrapesJS typings are incomplete for component attribute APIs used by the studio.
import 'grapesjs/dist/css/grapes.min.css';
import { createElement, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Component, Editor } from 'grapesjs';
import { X } from 'lucide-react';
import { LiveBlockView, storefrontHead, themeStyle } from '@orvexa/storefront-ui';
import {
  cleanLayout, isLiveBlock, PAGE_RULES, placeholderHtml, REQUIRED_LIVE_BLOCKS, SECTION_DEFINITIONS,
  type Catalog, type CropAspect, type Field, type Layout, type PageId, type SectionType, type Theme,
} from '@orvexa/theme';
import { AiRewrite, type FieldContext } from '../Fields';
import { blockHtml, pageStartHtml, PHOTO_PLACEHOLDER_SRC } from './content';

export type PhotoRequest = { mode: 'pick' | 'edit' | 'stock'; current: string | null; aspect: CropAspect; apply: (url: string, alt?: string) => void };
export type GrapesApi = { undo: () => void; redo: () => void; hasUndo: () => boolean; hasRedo: () => boolean };

type Props = {
  theme: Theme;
  catalog: Catalog;
  page: PageId;
  device: 'desktop' | 'mobile';
  ctx: FieldContext;
  /** Another panel (Design, Categories, SEO) shown instead of the blocks list. */
  left?: ReactNode;
  pageTabs: ReactNode;
  /** `initial` is true for the automatic first save of a page that has no layout yet. */
  onLayout: (layout: Layout, initial?: boolean) => void;
  onPhoto: (request: PhotoRequest) => void;
  onReady?: (api: GrapesApi | null) => void;
};

const DESKTOP_WIDTH = 1280;
const LOCKED = { editable: false, selectable: false, hoverable: false, draggable: false, droppable: false, removable: false, copyable: false, layerable: false, highlightable: false };
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'li', 'summary', 'blockquote', 'figcaption', 'a', 'strong', 'em']);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const GROUPS: Array<{ title: string; types: SectionType[] }> = [
  { title: 'Banners', types: ['hero', 'image-banner', 'promo-banner', 'trust-bar'] },
  { title: 'Live products', types: ['product-grid', 'collection-list', 'product-main', 'product-info', 'related-products', 'collection-header', 'collection-products'] },
  { title: 'Photos and stories', types: ['image-with-text', 'gallery', 'rich-text'] },
  { title: 'Trust', types: ['testimonials', 'faq'] },
  { title: 'Contact and sign-up', types: ['contact-details', 'newsletter'] },
];

const BASIC_BLOCKS: Array<{ id: string; label: string; content: string }> = [
  { id: 'basic-heading', label: 'Heading', content: '<h2 style="padding:1rem 2rem;margin:0">A short heading</h2>' },
  { id: 'basic-text', label: 'Text', content: '<p style="padding:0.5rem 2rem;max-width:62ch">Write a few sentences here.</p>' },
  { id: 'basic-image', label: 'Photo', content: `<img src="${PHOTO_PLACEHOLDER_SRC}" alt="" data-oxs-placeholder="1" style="display:block;width:100%;max-width:960px;margin:1rem auto">` },
  { id: 'basic-button', label: 'Button', content: '<div style="padding:1rem 2rem"><a class="oxs-button oxs-button--primary" href="/collections/all">Shop now</a></div>' },
  { id: 'basic-columns', label: 'Two columns', content: '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:2rem;padding:3rem 2rem"><div><h3>First column</h3><p>Text for the first column.</p></div><div><h3>Second column</h3><p>Text for the second column.</p></div></div>' },
];

function traitFor(field: Field, catalog: Catalog) {
  const base = { name: `p_${field.key}`, label: field.label, changeProp: true };
  switch (field.kind) {
    case 'text': case 'textarea': case 'href': return { ...base, type: 'text' };
    case 'number': return { ...base, type: 'number', min: field.min, max: field.max };
    case 'toggle': return { ...base, type: 'checkbox' };
    case 'select': return { ...base, type: 'select', options: field.options.map(([id, name]) => ({ id, name })) };
    case 'product-source': return { ...base, type: 'select', options: [{ id: 'featured', name: 'Featured products' }, { id: 'newest', name: 'Newest products' }, ...catalog.collections.map((c) => ({ id: `collection:${c.id}`, name: `From “${c.title}”` }))] };
    default: return null; // lists, photos and category pickers are not needed by live blocks
  }
}
function toTrait(field: Field, value: unknown): unknown {
  if (field.kind === 'product-source') { const v = value as { kind?: string; collectionId?: string } | undefined; return v?.kind === 'collection' ? `collection:${v.collectionId}` : v?.kind ?? 'featured'; }
  return value;
}
function fromTrait(field: Field, value: unknown): unknown {
  if (field.kind === 'number') return Number(value);
  if (field.kind === 'toggle') return Boolean(value);
  if (field.kind === 'product-source') { const v = String(value); return v.startsWith('collection:') ? { kind: 'collection', collectionId: v.slice(11) } : { kind: v }; }
  return value;
}

function aspectFor(el: HTMLElement | undefined): CropAspect {
  const scope = el?.closest('[class]')?.className ?? '';
  if (/hero|banner/.test(scope)) return 'wide';
  if (/split|gallery|tile|card/.test(scope)) return 'portrait';
  return 'landscape';
}

/**
 * The visual editor. GrapesJS edits the page freely; live blocks (products,
 * buy box, categories, contact, sign-up) are locked and saved as placeholders.
 * Every change is cleaned (cleanLayout) and handed to the studio to save.
 */
export function GrapesEditor({ theme, catalog, page, device, ctx, left, pageTabs, onLayout, onPhoto, onReady }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const traitsRef = useRef<HTMLDivElement>(null);
  const selectorsRef = useRef<HTMLDivElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const live = useRef({ theme, catalog, page, onLayout, onPhoto, device });
  live.current = { theme, catalog, page, onLayout, onPhoto, device };
  const [selected, setSelected] = useState<Component | null>(null);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [loading, setLoading] = useState(true);

  // ------------------------------------------------------------ create the editor once per page
  useEffect(() => {
    let cancelled = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let editor: Editor | null = null;

    const save = (initial = false) => {
      clearTimeout(saveTimer);
      if (!editor) return;
      const raw = { project: editor.getProjectData(), html: editor.getHtml(), css: editor.getCss({ avoidProtected: true }) ?? '' };
      live.current.onLayout(cleanLayout(raw), initial);
    };
    const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => save(), 700); };

    const requestPhoto = (target: Component, mode: PhotoRequest['mode']) => {
      const src = String(target.get('src') ?? '');
      const placeholder = target.getAttributes()['data-oxs-placeholder'] || src.startsWith('data:image/svg');
      live.current.onPhoto({
        mode: placeholder && mode === 'edit' ? 'pick' : mode,
        current: placeholder ? null : src,
        aspect: aspectFor(target.getEl() as HTMLElement | undefined),
        apply: (url, alt) => {
          target.set('src', url);
          target.removeAttributes('data-oxs-placeholder');
          if (alt && !target.getAttributes().alt) target.addAttributes({ alt });
          scheduleSave();
          refresh();
        },
      });
    };

    function registerTypes(ed: Editor) {
      const baseModel = ed.Components.getType('default')!.model;
      ed.Components.addType('oxs-live', {
        isComponent: (el: HTMLElement) => {
          const type = el?.getAttribute?.('data-oxs-block');
          return type && isLiveBlock(type) ? { type: 'oxs-live' } : undefined;
        },
        model: {
          defaults: { tagName: 'section', droppable: false, stylable: false, draggable: '[data-gjs-type=wrapper]', traits: [] },
          init(this: Component) {
            const attrs = this.getAttributes();
            const type = attrs['data-oxs-block'] as SectionType;
            const def = SECTION_DEFINITIONS[type];
            let props: Record<string, unknown> = {};
            try { props = JSON.parse(attrs['data-props'] || '{}'); } catch { props = {}; }
            props = { ...def.defaults(), ...props };
            this.set({ oxsType: type, oxsId: attrs['data-oxs-id'] || `${type}-${Date.now().toString(36)}`, oxsProps: props, name: `${def.label} (live)` }, { silent: true });
            const traits = def.fields.map((f) => traitFor(f, live.current.catalog)).filter(Boolean);
            this.setTraits(traits as never);
            for (const f of def.fields) this.set(`p_${f.key}`, toTrait(f, props[f.key]), { silent: true });
            if (REQUIRED_LIVE_BLOCKS[live.current.page].includes(type)) this.set({ removable: false, copyable: false });
            this.on('change', () => {
              const changed = Object.keys(this.changedAttributes() || {}).filter((k) => k.startsWith('p_'));
              if (!changed.length) return;
              const next = { ...(this.get('oxsProps') as Record<string, unknown>) };
              for (const key of changed) {
                const field = def.fields.find((f) => `p_${f.key}` === key);
                if (field) next[field.key] = fromTrait(field, this.get(key));
              }
              this.set('oxsProps', next, { silent: true });
              (this as unknown as { renderPreview: () => void }).renderPreview();
              scheduleSave();
            });
            (this as unknown as { renderPreview: () => void }).renderPreview();
          },
          renderPreview(this: Component) {
            const { theme: t, catalog: c, page: p } = live.current;
            const markup = renderToStaticMarkup(createElement(LiveBlockView, { theme: t, catalog: c, page: p, mode: 'editor', block: { type: this.get('oxsType'), id: this.get('oxsId'), props: this.get('oxsProps') } }));
            this.setAttributes({ class: `oxs-section oxs-section--${this.get('oxsType')}`, 'data-oxs-block': this.get('oxsType') });
            this.components(markup.replace(/^<section[^>]*>/, '').replace(/<\/section>$/, ''));
            this.find('*').forEach((child) => child.set(LOCKED));
          },
          // Saved as an empty placeholder; the live store fills it with live data.
          toHTML(this: Component) {
            return placeholderHtml(this.get('oxsType'), this.get('oxsId'), this.get('oxsProps'));
          },
          toJSON(this: Component, ...args: unknown[]) {
            const json = (baseModel.prototype.toJSON as (...a: unknown[]) => Record<string, unknown>).apply(this, args);
            delete json.components;
            for (const key of Object.keys(json)) if (key.startsWith('p_') || key.startsWith('oxs')) delete json[key];
            json.attributes = { 'data-oxs-block': this.get('oxsType'), 'data-oxs-id': this.get('oxsId'), 'data-props': JSON.stringify(this.get('oxsProps')) };
            return json;
          },
        },
      });
      // Double-clicking a photo opens Orvexa's photo editor instead of GrapesJS's asset manager.
      ed.Commands.add('open-assets', {
        run: (_e: Editor, _s: unknown, opts: { target?: Component } = {}) => { if (opts.target) requestPhoto(opts.target, 'edit'); },
      } as never);
    }

    (async () => {
      const grapesjs = (await import('grapesjs')).default;
      if (cancelled || !canvasRef.current) return;
      const { theme: t, catalog: c, page: p } = live.current;
      const layout = t.pages[p].layout;
      const hasProject = Boolean(layout && Array.isArray((layout.project as { pages?: unknown[] }).pages) && (layout.project as { pages: unknown[] }).pages.length);
      const head = storefrontHead(t, c, p);
      editor = grapesjs.init({
        container: canvasRef.current,
        height: '100%',
        width: 'auto',
        fromElement: false,
        storageManager: false,
        // No outside icon font: the security policy blocks third-party stylesheets.
        cssIcons: '',
        panels: { defaults: [] },
        ...(hasProject ? { projectData: layout!.project } : { components: layout ? layout.html : pageStartHtml(t, c, p), style: layout?.css ?? '' }),
        canvas: { styles: ['/storefront.css', head.fontHref] },
        // Security: GrapesJS never runs scripts or unsafe attributes; the server cleans again.
        allowScripts: 0,
        parser: { optionsHtml: { allowScripts: false, allowUnsafeAttr: false, allowUnsafeAttrValue: false } },
        canvasCss: 'body{background-color:transparent !important;color:var(--oxs-text)} .gjs-selected{outline:3px solid #ffc21a !important;outline-offset:-3px} .gjs-selected-parent{outline:2px dashed #ffc21a !important} img[data-oxs-placeholder]{outline:2px dashed rgba(18,22,58,.35);outline-offset:-6px;cursor:pointer}',
        protectedCss: '* { box-sizing: border-box; } body { margin: 0; min-height: 100%; } [data-oxs-block] * { pointer-events: none; }',
        deviceManager: { devices: [{ id: 'desktop', name: 'Desktop', width: `${DESKTOP_WIDTH}px` }, { id: 'mobile', name: 'Mobile', width: '390px', widthMedia: '700px' }] },
        blockManager: { appendTo: blocksRef.current! },
        layerManager: { appendTo: layersRef.current! },
        traitManager: { appendTo: traitsRef.current! },
        selectorManager: { appendTo: selectorsRef.current!, componentFirst: true },
        styleManager: {
          appendTo: stylesRef.current!,
          sectors: [
            { name: 'Text', open: true, properties: ['font-size', 'font-weight', 'color', 'text-align', 'line-height'] },
            { name: 'Spacing', open: false, properties: ['padding', 'margin'] },
            { name: 'Background', open: false, properties: ['background-color'] },
            { name: 'Corners', open: false, properties: ['border-radius'] },
          ],
        },
        plugins: [registerTypes],
      } as never);
      editorRef.current = editor;
      // Development only: lets developers and browser tests inspect the editor from the console.
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __oxsEditor?: Editor }).__oxsEditor = editor;

      // ------------------------------------------------------- blocks for this page
      const bm = editor.Blocks;
      for (const b of BASIC_BLOCKS) bm.add(b.id, { label: b.label, category: 'Basics', content: b.content });
      for (const group of GROUPS) {
        for (const type of group.types.filter((x) => PAGE_RULES[p].allowed.includes(x))) {
          const required = REQUIRED_LIVE_BLOCKS[p].includes(type);
          if (required) continue; // already on the page and cannot be added twice
          bm.add(`oxs-${type}`, { label: SECTION_DEFINITIONS[type].label, category: group.title, content: blockHtml(t, c, p, type) });
        }
      }

      editor.on('load', () => {
        if (cancelled || !editor) return;
        applyCanvasTheme(editor, live.current.theme);
        setDevice(editor, live.current.device, stageRef.current);
        // Links inside the canvas never navigate while editing.
        const doc = editor.Canvas.getDocument();
        doc?.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest?.('a')) e.preventDefault(); }, true);
        setLoading(false);
        // Loading a page is not an edit: start with an empty undo history.
        editor.UndoManager.clear();
        onReady?.({
          undo: () => editor?.UndoManager.undo(),
          redo: () => editor?.UndoManager.redo(),
          hasUndo: () => Boolean(editor?.UndoManager.hasUndo()),
          hasRedo: () => Boolean(editor?.UndoManager.hasRedo()),
        });
        if (!hasProject) saveTimer = setTimeout(() => save(true), 700); // store the layout of a page opened for the first time
      });
      editor.on('update', () => scheduleSave());
      editor.on('component:selected', (c2: Component) => {
        // Merchants see only meaningful settings, not GrapesJS's developer fields (id, title).
        const type = c2.get('type');
        if (type === 'image') c2.setTraits([{ type: 'text', name: 'alt', label: 'Describe the photo' }] as never);
        else if (type === 'link') c2.setTraits([{ type: 'text', name: 'href', label: 'Link' }, { type: 'checkbox', name: 'target', label: 'Open in a new tab', valueTrue: '_blank', valueFalse: '' }] as never);
        else if (type !== 'oxs-live') c2.setTraits([]);
        setSelected(c2);
        requestAnimationFrame(() => {
          if (!editor) return;
          setDevice(editor, live.current.device, stageRef.current);
          try { editor.refresh(); } catch { /* ignore */ }
          keepToolsInView(editor);
          centerSelectedInView(editor, c2);
        });
      });
      editor.on('component:deselected', () => setSelected(editor?.getSelected() ?? null));
      editor.on('component:update', () => refresh());
      editor.on('rteToolbarPosUpdate', (pos: { left?: number; top?: number }) => {
        const canvasEl = editor?.Canvas.getElement();
        const rte = (editor as unknown as { RichTextEditor?: { getToolbarEl?: () => HTMLElement | null } }).RichTextEditor?.getToolbarEl?.();
        if (!canvasEl || !rte || !pos) return;
        const rect = canvasEl.getBoundingClientRect();
        const tw = rte.scrollWidth || 200;
        const th = rte.scrollHeight || 40;
        if (typeof pos.left === 'number' && pos.left + tw > rect.width - 8) pos.left = Math.max(8, rect.width - tw - 8);
        if (typeof pos.left === 'number' && pos.left < 8) pos.left = 8;
        if (typeof pos.top === 'number' && pos.top < 8) pos.top = 8;
        if (typeof pos.top === 'number' && pos.top + th > rect.height - 8) pos.top = Math.max(8, rect.height - th - 8);
      });
      editor.on('canvas:updateTools', () => { if (editor) keepToolsInView(editor); });
      // Photo actions requested from the settings panel.
      (editor as unknown as { oxsPhoto: typeof requestPhoto }).oxsPhoto = requestPhoto;
    })();

    return () => {
      cancelled = true;
      if (saveTimer) save(); // keep the last change
      onReady?.(null);
      editor?.destroy();
      editorRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ follow theme and device changes
  useEffect(() => {
    if (editorRef.current && !loading) applyCanvasTheme(editorRef.current, theme);
  }, [theme.tokens, theme.brand, theme.templateId, theme.header, theme.footer, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editorRef.current || loading) return;
    setDevice(editorRef.current, device, stageRef.current);
    const onResize = () => editorRef.current && setDevice(editorRef.current, device, stageRef.current);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [device, loading]);

  // Keep the page frame centered in the stage when selection / inspector / size changes.
  useEffect(() => {
    if (!editorRef.current || loading) return;
    const ed = editorRef.current;
    const stage = stageRef.current;
    const layout = () => {
      setDevice(ed, device, stage);
      try { ed.refresh(); } catch { /* ignore */ }
      keepToolsInView(ed);
    };
    const id = window.requestAnimationFrame(() => {
      layout();
      if (selected) centerSelectedInView(ed, selected);
    });
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const ro = typeof ResizeObserver !== 'undefined' && stage
      ? new ResizeObserver(() => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(layout, 60);
        })
      : null;
    if (stage) ro?.observe(stage);
    return () => {
      window.cancelAnimationFrame(id);
      clearTimeout(resizeTimer);
      ro?.disconnect();
    };
  }, [selected, device, loading]);

  const editor = editorRef.current;
  const tag = String(selected?.get('tagName') ?? '');
  const isLive = selected?.get('type') === 'oxs-live';
  const isImage = selected?.get('type') === 'image';
  const isText = Boolean(selected && !isLive && !isImage && (selected.is('text') || selected.is('link') || TEXT_TAGS.has(tag)));
  const text = isText ? ((selected!.getEl() as HTMLElement | undefined)?.innerText ?? '').trim() : '';
  const label = isLive ? String(selected!.get('name')) : isImage ? 'Photo' : isText ? 'Text' : selected ? String(selected.getName?.() ?? 'Block') : '';
  const clearSelection = () => editor?.select(undefined as never);

  return (
    <div className={`gx${selected ? ' gx--inspecting' : ''}`}>
      <aside className="gx-left" aria-label="Blocks and layers">
        {left}
        <div className="panel" hidden={Boolean(left)}>
          {pageTabs}
          <h3 className="gx-title">Add blocks</h3>
          <p className="field__help">Drag a block onto the page. Live blocks show real products and prices.</p>
          <div ref={blocksRef} className="gx-blocks" />
          <h3 className="gx-title">On this page</h3>
          <div ref={layersRef} className="gx-layers" />
        </div>
      </aside>

      <main className="gx-stage" ref={stageRef} aria-label="Page editor">
        <p className="canvas__note">Drag blocks in, double-click text to type, double-click a photo to change it. Header and footer are set in Design.</p>
        <div className={`gx-frame gx-frame--${device}`}>
          <div ref={canvasRef} className="gx-canvas" />
          {loading && <p className="gx-loading">Loading the editor…</p>}
        </div>
      </main>

      <aside className="inspector gx-right" aria-label="Selected item settings" hidden={!selected}>
        {selected && (
          <header className="inspector__head">
            <div>
              <h2>{label}</h2>
              <p>{isLive ? 'Shows live data from Orvexa Cloud. Change what it shows below.' : isImage ? 'Double-click the photo, or use the buttons below.' : isText ? 'Double-click the text on the page to type.' : 'Change its style below.'}</p>
            </div>
            <button type="button" className="icon-button" aria-label="Close settings" onClick={clearSelection}><X size={16} /></button>
          </header>
        )}
        {isText && (
          <section className="group">
            <AiRewrite key={selected!.getId()} text={text} label={/^h[1-6]$/.test(tag) ? 'Heading' : 'Text'} max={/^h[1-6]$/.test(tag) ? 120 : 600} ctx={ctx} context={label}
              onAccept={(value) => { selected!.components(esc(value)); refresh(); }} />
            {!ctx.aiEnabled && <p className="field__help">Magic AI is not switched on for this studio.</p>}
          </section>
        )}
        {isImage && (
          <section className="group photo-actions">
            <button type="button" className="btn btn--small" onClick={() => (editor as unknown as { oxsPhoto: (c: Component, m: string) => void }).oxsPhoto(selected!, 'pick')}>Replace photo</button>
            <button type="button" className="btn btn--small" onClick={() => (editor as unknown as { oxsPhoto: (c: Component, m: string) => void }).oxsPhoto(selected!, 'edit')}>Crop and adjust</button>
            {ctx.stockEnabled && <button type="button" className="btn btn--small" onClick={() => (editor as unknown as { oxsPhoto: (c: Component, m: string) => void }).oxsPhoto(selected!, 'stock')}>Free stock photo</button>}
            <p className="field__help">Describe the photo in “Alt” below, for screen readers and Google.</p>
          </section>
        )}
        <div ref={traitsRef} className="gx-traits" />
        <details className="gx-style" open={!isLive}>
          <summary>Style</summary>
          <div ref={selectorsRef} />
          <div ref={stylesRef} />
        </details>
      </aside>
    </div>
  );
}

function applyCanvasTheme(editor: Editor, theme: Theme) {
  const doc = editor.Canvas.getDocument();
  if (!doc) return;
  const t = theme.tokens;
  const style = Object.entries(themeStyle(theme)).map(([k, v]) => `${k}:${String(v)}`).join(';');
  doc.documentElement.setAttribute('class', ['oxs', `oxs-btn-${t.buttonStyle}`, `oxs-card-${t.cardStyle}`, t.headingCase === 'uppercase' ? 'oxs-caps' : ''].filter(Boolean).join(' '));
  doc.documentElement.setAttribute('style', style);
  const href = storefrontHead(theme, { storeId: '', currency: 'INR', products: [], collections: [], sample: true }, 'home').fontHref;
  if (!doc.head.querySelector(`link[href="${CSS.escape(href)}"]`)) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    doc.head.appendChild(link);
  }
}

/**
 * Desktop renders at a true 1280px, scaled to fit, and centered in the stage.
 * Mobile is 390px at full size, also centered. Avoid fitViewport alone — it
 * parks the frame in the left corner and can clip outside the visible stage.
 */
function setDevice(editor: Editor, device: 'desktop' | 'mobile', stage: HTMLElement | null) {
  const canvasEl = editor.Canvas.getElement();
  // Measure the Grapes canvas itself — stage padding must not inflate the zoom math.
  const width = Math.max(canvasEl?.clientWidth || 0, 280);
  const height = Math.max(canvasEl?.clientHeight || 0, 360);
  const model = editor.Devices.get(device);
  const gap = 12;
  const deviceW = device === 'desktop' ? DESKTOP_WIDTH : 390;
  const zoom = Math.min(1, Math.max(device === 'desktop' ? 0.2 : 0.5, (width - gap * 2) / deviceW));
  model?.set({
    width: `${deviceW}px`,
    height: `${Math.max(device === 'desktop' ? 720 : 640, Math.floor((height - gap * 2) / zoom))}px`,
  });
  editor.setDevice(device);
  editor.Canvas.setZoom(zoom * 100);
  const scaledW = deviceW * zoom;
  const x = Math.max(gap, (width - scaledW) / 2);
  editor.Canvas.setCoords(x, gap);
  // Grapes can emit `scale() translate()` which parks the page on the right.
  // Force translate-then-scale so Desktop/Mobile stay centered in the stage.
  const frames = canvasEl?.querySelector('.gjs-cv-canvas__frames') as HTMLElement | null;
  if (frames) {
    frames.style.transformOrigin = '0 0';
    frames.style.transform = `translate(${Math.round(x)}px, ${gap}px) scale(${zoom})`;
  }
  const wrapper = canvasEl?.querySelector('.gjs-frame-wrapper') as HTMLElement | null;
  if (wrapper) {
    wrapper.style.left = '0px';
    wrapper.style.top = '0px';
  }
  keepToolsInView(editor);
}

/** Scroll the selected card/section into the middle of the editor viewport. */
function centerSelectedInView(editor: Editor, component: Component) {
  try {
    const el = component.getEl() as HTMLElement | undefined;
    if (!el?.isConnected) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    const frameEl = (editor.Canvas as unknown as { getFrameEl?: () => HTMLIFrameElement | undefined }).getFrameEl?.()
      || (editor.Canvas.getElement()?.querySelector('iframe') as HTMLIFrameElement | null);
    const win = frameEl?.contentWindow;
    if (!win) return;
    const rect = el.getBoundingClientRect();
    const targetTop = win.scrollY + rect.top - win.innerHeight / 2 + rect.height / 2;
    win.scrollTo({ top: Math.max(0, targetTop), behavior: reduce ? 'auto' : 'smooth' });
  } catch {
    /* ignore */
  }
}

/** Keep Grapes selection/RTE toolbars inside the visible canvas so they never spill off-screen. */
function keepToolsInView(editor: Editor) {
  const canvas = editor.Canvas.getElement();
  if (!canvas) return;
  const bounds = canvas.getBoundingClientRect();
  const pad = 10;
  const clampEl = (el: HTMLElement | null | undefined) => {
    if (!el || el.style.display === 'none') return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    let dx = 0;
    let dy = 0;
    if (r.right > bounds.right - pad) dx = bounds.right - pad - r.right;
    if (r.left + dx < bounds.left + pad) dx += bounds.left + pad - (r.left + dx);
    if (r.top + dy < bounds.top + pad) dy = bounds.top + pad - r.top;
    if (r.bottom + dy > bounds.bottom - pad) dy += bounds.bottom - pad - (r.bottom + dy);
    if (!dx && !dy) return;
    const left = (parseFloat(el.style.left) || 0) + dx;
    const top = (parseFloat(el.style.top) || 0) + dy;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  };
  const canvasApi = editor.Canvas as unknown as {
    getToolbarEl?: () => HTMLElement | null;
    getBadgeEl?: () => HTMLElement | null;
  };
  clampEl(canvasApi.getToolbarEl?.());
  clampEl(canvasApi.getBadgeEl?.());
  try {
    const rte = (editor as unknown as { RichTextEditor?: { getToolbarEl?: () => HTMLElement | null } }).RichTextEditor;
    clampEl(rte?.getToolbarEl?.());
  } catch {
    /* RTE may be inactive */
  }
}
