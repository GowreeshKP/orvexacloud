
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Storefront, storefrontHead } from '@orvexa/storefront-ui';
import type { Catalog, PageId, Theme } from '@orvexa/theme';
import type { Proposal } from './state';

const WIDTH = { desktop: 1280, mobile: 390 } as const;

export type NavTarget = { page: PageId; handle: string | null } | { notice: string };

/** Work out where a storefront link goes, so the preview can follow it. */
export function resolveLink(href: string): NavTarget {
  if (/^(mailto|tel):/i.test(href)) return { notice: 'Email and phone links open on shoppers’ devices.' };
  if (/^https?:/i.test(href)) return { notice: `This link opens ${href.replace(/^https?:\/\//, '').split('/')[0]} on your live store.` };
  const path = href.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path === '/') return { page: 'home', handle: null };
  const [, first, second] = path.split('/');
  if (first === 'collections') return { page: 'collection', handle: second ?? 'all' };
  if (first === 'products' && second) return { page: 'product', handle: second };
  if (first === 'pages' && second === 'about') return { page: 'about', handle: null };
  if (first === 'pages' && second === 'contact') return { page: 'contact', handle: null };
  if (first === 'cart') return { notice: 'The bag and checkout are run by Orvexa Cloud, so they are not part of this preview.' };
  if (first === 'search' || first === 'account' || first === 'wishlist') return { notice: `${first[0].toUpperCase()}${first.slice(1)} is run by Orvexa Cloud and works on your live store.` };
  if (first === 'policies') return { notice: 'Policy pages come from your Orvexa Cloud settings.' };
  return { notice: 'This page is not part of the storefront design.' };
}

/** Render a storefront at a real device width, scaled to fit the available space. */
export function ScaledStorefront({ theme, catalog, page, handle, width, selected, onSelect, onPhoto, onNavigate, live, maxHeight }: {
  theme: Theme; catalog: Catalog; page: PageId; handle?: string | null; width: number; selected?: string | null;
  onSelect?: (id: string | null) => void; onPhoto?: (sectionId: string, path: string, hasPhoto: boolean) => void;
  onNavigate?: (target: NavTarget) => void; live?: boolean; maxHeight?: number;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      // Measure the parent so the unscaled 1280px inner never expands the container.
      const parent = outer.current.parentElement;
      const available = Math.max(
        1,
        parent?.clientWidth || outer.current.clientWidth || width,
      );
      const scale = Math.min(1, available / width);
      const raw = Math.max(inner.current.scrollHeight, inner.current.offsetHeight, 1);
      const scaledHeight = raw * scale;
      setBox({
        scale,
        height: maxHeight ? Math.min(scaledHeight, maxHeight) : scaledHeight,
      });
    };
    measure();
    // Previews inside template cards can mount before width is known; remeasure twice.
    const raf = requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 120);
    const observer = new ResizeObserver(measure);
    if (outer.current.parentElement) observer.observe(outer.current.parentElement);
    else observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [width, theme, catalog, page, handle, maxHeight]);

  useEffect(() => {
    if (!selected || !inner.current) return;
    inner.current.querySelector(`[data-section-id="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [selected]);

  const head = storefrontHead(theme, catalog, page);
  const interactive = Boolean(onSelect || onNavigate);
  return (
    <div ref={outer} className="scaled" style={{ height: box.height || undefined }}>
      <link rel="stylesheet" href={head.fontHref} />
      <div
        ref={inner}
        className="scaled__inner"
        style={{ width, transform: `scale(${box.scale})` }}
        onClickCapture={(event) => {
          if (!interactive) return;
          const el = event.target as HTMLElement;
          if (el.closest('summary')) return; // let menus and dropdowns open
          event.preventDefault();
          const photo = !live && el.closest<HTMLElement>('[data-photo]');
          if (photo && onPhoto) {
            const [sectionId, path] = photo.dataset.photo!.split(':');
            onPhoto(sectionId, path, Boolean(photo.querySelector('img')));
            return;
          }
          const anchor = el.closest<HTMLAnchorElement>('a[href]');
          const navigable = anchor && (live || anchor.closest('.oxs-header, .oxs-footer'));
          if (anchor && navigable && onNavigate) {
            onNavigate(resolveLink(anchor.getAttribute('href') ?? '/'));
            return;
          }
          if (onSelect) {
            const target = el.closest<HTMLElement>('[data-section-id]');
            onSelect(target?.dataset.sectionId ?? null);
          }
        }}
        onSubmitCapture={(event) => event.preventDefault()}
      >
        <Storefront
          theme={theme} catalog={catalog} page={page} mode={live ? 'live' : 'editor'}
          productHandle={page === 'product' ? handle ?? undefined : undefined}
          collectionHandle={page === 'collection' ? handle ?? 'all' : undefined}
          selectedSectionId={selected ?? undefined} hideHiddenSections={live || !onSelect}
        />
      </div>
    </div>
  );
}

export function Canvas({ theme, catalog, page, handle, device, mode, selected, onSelect, onPhoto, onNavigate, proposal, onAcceptProposal, onDiscardProposal, sample }: {
  theme: Theme; catalog: Catalog; page: PageId; handle: string | null; device: 'desktop' | 'mobile'; mode: 'edit' | 'preview';
  selected: string | null; onSelect: (id: string | null) => void; onPhoto: (sectionId: string, path: string, hasPhoto: boolean) => void;
  onNavigate: (target: NavTarget) => void; proposal: Proposal | null; onAcceptProposal: () => void; onDiscardProposal: () => void;
  sample: { available: boolean; on: boolean; toggle: (on: boolean) => void };
}) {
  const shown = proposal?.theme ?? theme;
  const live = mode === 'preview';
  return (
    <div className={`canvas canvas--${device}`}>
      <div className="canvas__bar">
        {live ? <p className="canvas__note">Preview: click around like a shopper. Nothing here changes your store.</p>
          : <p className="canvas__note">Click a section to edit it, or a photo spot to add a photo. Menu links open other pages.</p>}
        {sample.available && (
          <div className="segmented" role="radiogroup" aria-label="Products shown in the preview">
            <button type="button" role="radio" aria-checked={!sample.on} className={!sample.on ? 'is-on' : ''} onClick={() => sample.toggle(false)}>My products</button>
            <button type="button" role="radio" aria-checked={sample.on} className={sample.on ? 'is-on' : ''} onClick={() => sample.toggle(true)}>Sample products</button>
          </div>
        )}
      </div>
      {catalog.sample && !sample.available && <p className="canvas__note">Showing sample products. Your real products appear here once you add them in Orvexa Cloud.</p>}
      {proposal && (
        <div className="proposal-bar" role="region" aria-label="AI suggestion">
          <div>
            <strong>Previewing the AI suggestion</strong>
            <ul>{proposal.changes.slice(0, 6).map((change, i) => <li key={i}>{change}</li>)}</ul>
          </div>
          <div className="proposal-bar__actions">
            <button type="button" className="btn btn--primary" onClick={onAcceptProposal}>Apply changes</button>
            <button type="button" className="btn" onClick={onDiscardProposal}>Discard</button>
          </div>
        </div>
      )}
      <div className="device" aria-label={`${device === 'mobile' ? 'Mobile' : 'Desktop'} preview of the ${page} page`}>
        <ScaledStorefront
          theme={shown} catalog={catalog} page={page} handle={handle} width={WIDTH[device]} live={live}
          selected={proposal || live ? null : selected}
          onSelect={proposal || live ? undefined : onSelect}
          onPhoto={proposal || live ? undefined : onPhoto}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}
