
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlipHorizontal2, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { CROP_ASPECTS, type CropAspect } from '@orvexa/theme';

/**
 * In-browser photo editor. The preview and the saved file are drawn by the
 * same `drawCrop` + `applyAdjustments` code, so what merchants see is exactly
 * what they get. Output is capped at 2000px and saved as WebP (JPEG fallback).
 */

export type Adjustments = { brightness: number; contrast: number; saturation: number; warmth: number };
const NEUTRAL: Adjustments = { brightness: 0, contrast: 0, saturation: 0, warmth: 0 };

const FILTERS: Array<{ id: string; label: string; adjust: Adjustments }> = [
  { id: 'original', label: 'Original', adjust: NEUTRAL },
  { id: 'warm', label: 'Warm', adjust: { brightness: 4, contrast: 6, saturation: 10, warmth: 38 } },
  { id: 'cool', label: 'Cool', adjust: { brightness: 2, contrast: 6, saturation: -6, warmth: -38 } },
  { id: 'vivid', label: 'Vivid', adjust: { brightness: 4, contrast: 18, saturation: 40, warmth: 4 } },
  { id: 'soft', label: 'Soft', adjust: { brightness: 10, contrast: -22, saturation: -14, warmth: 10 } },
  { id: 'classic', label: 'Classic', adjust: { brightness: 0, contrast: 12, saturation: -45, warmth: 30 } },
  { id: 'mono', label: 'Mono', adjust: { brightness: 0, contrast: 16, saturation: -100, warmth: 0 } },
];

const SLIDERS: Array<[keyof Adjustments, string]> = [['brightness', 'Brightness'], ['contrast', 'Contrast'], ['saturation', 'Colour'], ['warmth', 'Warmth']];
const MAX_SIDE = 2000;

/** Pixel adjustments, shared by preview and export. */
export function applyAdjustments(data: ImageData, a: Adjustments) {
  if (!a.brightness && !a.contrast && !a.saturation && !a.warmth) return;
  const bm = 1 + (a.brightness / 100) * 0.5;
  const cf = 1 + (a.contrast / 100) * 0.7;
  const sf = 1 + a.saturation / 100;
  const w = (a.warmth / 100) * 28;
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] * bm, g = px[i + 1] * bm, b = px[i + 2] * bm;
    r = (r - 128) * cf + 128; g = (g - 128) * cf + 128; b = (b - 128) * cf + 128;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * sf; g = l + (g - l) * sf; b = l + (b - l) * sf;
    px[i] = r + w; px[i + 1] = g + w * 0.25; px[i + 2] = b - w; // Uint8ClampedArray clamps to 0-255
  }
}

type Geometry = { rotation: 0 | 90 | 180 | 270; flip: boolean; zoom: number; cx: number | null; cy: number | null; aspect: CropAspect };

function cropBox(img: HTMLImageElement, g: Geometry) {
  const sideways = g.rotation % 180 !== 0;
  const rw = sideways ? img.naturalHeight : img.naturalWidth;
  const rh = sideways ? img.naturalWidth : img.naturalHeight;
  const ratio = CROP_ASPECTS[g.aspect].ratio ?? rw / rh;
  const [bw, bh] = rw / rh > ratio ? [rh * ratio, rh] : [rw, rw / ratio];
  const cw = bw / g.zoom, ch = bh / g.zoom;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const cx = clamp(g.cx ?? rw / 2, cw / 2, rw - cw / 2);
  const cy = clamp(g.cy ?? rh / 2, ch / 2, rh - ch / 2);
  return { rw, rh, cw, ch, cx, cy };
}

function drawCrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement, g: Geometry, outW: number, outH: number) {
  const { rw, rh, cw, ch, cx, cy } = cropBox(img, g);
  ctx.save();
  ctx.clearRect(0, 0, outW, outH);
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(outW / cw, outH / ch);
  ctx.translate(-(cx - cw / 2), -(cy - ch / 2));
  if (g.flip) { ctx.translate(rw, 0); ctx.scale(-1, 1); }
  if (g.rotation === 90) { ctx.translate(rw, 0); ctx.rotate(Math.PI / 2); }
  if (g.rotation === 180) { ctx.translate(rw, rh); ctx.rotate(Math.PI); }
  if (g.rotation === 270) { ctx.translate(0, rh); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export function PhotoEditor({ source, aspect: initialAspect, title, onCancel, onSave }: {
  source: File | string; aspect: CropAspect; title: string; onCancel: () => void; onSave: (file: File) => Promise<void>;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'crop' | 'adjust' | 'filters'>('crop');
  const [geometry, setGeometry] = useState<Geometry>({ rotation: 0, flip: false, zoom: 1, cx: null, cy: null, aspect: initialAspect });
  const [adjust, setAdjust] = useState<Adjustments>(NEUTRAL);
  const [filterId, setFilterId] = useState('original');
  const [saving, setSaving] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // React runs effects twice in development; a cancelled load must never report back,
    // or revoking its object URL would show a false "could not be opened" error.
    let cancelled = false;
    setError('');
    setImg(null);
    const image = new Image();
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    if (typeof source === 'string' && /^https?:/.test(source)) image.crossOrigin = 'anonymous';
    image.onload = () => { if (!cancelled) setImg(image); };
    image.onerror = () => { if (!cancelled) setError('This photo could not be opened. Try a JPG, PNG or WebP file.'); };
    image.src = url;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      if (typeof source !== 'string') URL.revokeObjectURL(url);
    };
  }, [source]);

  const box = img ? cropBox(img, geometry) : null;
  const preview = useMemo(() => {
    if (!box) return { w: 0, h: 0 };
    const maxW = 640, maxH = 440;
    const scale = Math.min(maxW / box.cw, maxH / box.ch);
    return { w: Math.round(box.cw * scale), h: Math.round(box.ch * scale) };
  }, [box?.cw, box?.ch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw the preview on every change, once per animation frame.
  useEffect(() => {
    if (!img || !canvas.current || !preview.w) return;
    const frame = requestAnimationFrame(() => {
      const el = canvas.current!;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(preview.w * dpr);
      el.height = Math.round(preview.h * dpr);
      const ctx = el.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      drawCrop(ctx, img, geometry, el.width, el.height);
      try {
        const data = ctx.getImageData(0, 0, el.width, el.height);
        applyAdjustments(data, adjust);
        ctx.putImageData(data, 0, 0);
      } catch {
        setError('This photo is stored on another website and cannot be edited here. Upload it again from your computer.');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [img, geometry, adjust, preview.w, preview.h]);

  // Filter thumbnails, rendered small from the current crop when the tab is open.
  useEffect(() => {
    if (tab !== 'filters' || !img || !box) return;
    const timer = setTimeout(() => {
      const w = 120, h = Math.max(40, Math.round(120 * (box.ch / box.cw)));
      const next: Record<string, string> = {};
      for (const f of FILTERS) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) continue;
        drawCrop(ctx, img, geometry, w, h);
        try {
          const data = ctx.getImageData(0, 0, w, h);
          applyAdjustments(data, f.adjust);
          ctx.putImageData(data, 0, 0);
          next[f.id] = c.toDataURL('image/jpeg', 0.7);
        } catch { /* reported by the preview */ }
      }
      setThumbs(next);
    }, 120);
    return () => clearTimeout(timer);
  }, [tab, img, geometry]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useCallback((dx: number, dy: number) => {
    if (!img || !box) return;
    const perPixel = box.cw / preview.w;
    setGeometry((g) => ({ ...g, cx: box.cx - dx * perPixel, cy: box.cy - dy * perPixel }));
  }, [img, box, preview.w]);

  const rotate = (delta: 90 | -90) => setGeometry((g) => ({ ...g, rotation: (((g.rotation + delta) % 360) + 360) % 360 as Geometry['rotation'], cx: null, cy: null }));

  async function save() {
    if (!img || !box) return;
    setSaving(true);
    setError('');
    try {
      const k = Math.min(1, MAX_SIDE / Math.max(box.cw, box.ch));
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(box.cw * k));
      out.height = Math.max(1, Math.round(box.ch * k));
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Your browser could not prepare the photo.');
      drawCrop(ctx, img, geometry, out.width, out.height);
      const data = ctx.getImageData(0, 0, out.width, out.height);
      applyAdjustments(data, adjust);
      ctx.putImageData(data, 0, 0);
      let blob = await canvasToBlob(out, 'image/webp', 0.86);
      if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(out, 'image/jpeg', 0.88);
      if (blob && blob.size > 4.8 * 1024 * 1024) blob = await canvasToBlob(out, 'image/jpeg', 0.75);
      if (!blob) throw new Error('Your browser could not save the photo.');
      await onSave(new File([blob], blob.type === 'image/webp' ? 'photo.webp' : 'photo.jpg', { type: blob.type }));
    } catch (e) {
      setError(e instanceof Error && e.name !== 'SecurityError' ? e.message : 'This photo cannot be edited here. Upload it again from your computer.');
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="photo-editor-title">
      <div className="modal__panel modal__panel--wide photo-editor">
        <header className="modal__head">
          <h2 id="photo-editor-title">{title}</h2>
          <div className="modal__actions">
            <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={!img || saving || Boolean(error)}>{saving ? 'Saving…' : 'Save photo'}</button>
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          </div>
        </header>
        <div className="photo-editor__body">
          <div className="photo-editor__stage">
            {error && <p className="form-error" role="alert">{error}</p>}
            {!img && !error && <p>Opening photo…</p>}
            {img && (
              <>
                <canvas
                  ref={canvas}
                  className="photo-editor__canvas"
                  style={{ width: preview.w, height: preview.h }}
                  tabIndex={0}
                  aria-label="Photo preview. Drag or use the arrow keys to reposition."
                  onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
                  onPointerMove={(e) => { if (!drag.current) return; pan(e.clientX - drag.current.x, e.clientY - drag.current.y); drag.current = { x: e.clientX, y: e.clientY }; }}
                  onPointerUp={() => { drag.current = null; }}
                  onKeyDown={(e) => {
                    const step = e.shiftKey ? 40 : 10;
                    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
                    if (moves[e.key]) { e.preventDefault(); pan(...moves[e.key]); }
                  }}
                />
                <div className="photo-editor__tools">
                  <button type="button" className="icon-button" aria-label="Zoom out" onClick={() => setGeometry((g) => ({ ...g, zoom: Math.max(1, g.zoom - 0.25) }))}><Minus size={16} /></button>
                  <input type="range" min={1} max={4} step={0.01} value={geometry.zoom} aria-label="Zoom" onChange={(e) => setGeometry((g) => ({ ...g, zoom: Number(e.target.value) }))} />
                  <button type="button" className="icon-button" aria-label="Zoom in" onClick={() => setGeometry((g) => ({ ...g, zoom: Math.min(4, g.zoom + 0.25) }))}><Plus size={16} /></button>
                  <span className="photo-editor__divider" />
                  <button type="button" className="icon-button" aria-label="Rotate left" onClick={() => rotate(-90)}><RotateCcw size={16} /></button>
                  <button type="button" className="icon-button" aria-label="Rotate right" onClick={() => rotate(90)}><RotateCw size={16} /></button>
                  <button type="button" className="icon-button" aria-label="Flip" aria-pressed={geometry.flip} onClick={() => setGeometry((g) => ({ ...g, flip: !g.flip }))}><FlipHorizontal2 size={16} /></button>
                </div>
                <p className="field__help">Drag the photo to choose what shows. Saved at up to {MAX_SIDE}px for fast loading.</p>
              </>
            )}
          </div>

          <aside className="photo-editor__side">
            <div className="segmented segmented--full" role="tablist" aria-label="Editing tools">
              {(['crop', 'adjust', 'filters'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>{t === 'crop' ? 'Crop' : t === 'adjust' ? 'Adjust' : 'Filters'}</button>
              ))}
            </div>
            {tab === 'crop' && (
              <div className="crop-options" role="radiogroup" aria-label="Shape">
                {(Object.keys(CROP_ASPECTS) as CropAspect[]).map((key) => {
                  const r = CROP_ASPECTS[key].ratio ?? 1.3;
                  return (
                    <button key={key} type="button" role="radio" aria-checked={geometry.aspect === key} className={`crop-option${geometry.aspect === key ? ' is-on' : ''}`}
                      onClick={() => setGeometry((g) => ({ ...g, aspect: key, cx: null, cy: null }))}>
                      <span className="crop-option__shape" style={{ aspectRatio: String(r), borderStyle: CROP_ASPECTS[key].ratio ? 'solid' : 'dashed' }} />
                      <span>{CROP_ASPECTS[key].label}</span>
                      {key === initialAspect && <small>Best fit</small>}
                    </button>
                  );
                })}
              </div>
            )}
            {tab === 'adjust' && (
              <div className="adjust">
                {SLIDERS.map(([key, label]) => (
                  <label key={key} className="adjust__row">
                    <span>{label}<output>{adjust[key] > 0 ? `+${adjust[key]}` : adjust[key]}</output></span>
                    <input type="range" min={-100} max={100} value={adjust[key]} onChange={(e) => { setFilterId(''); setAdjust((a) => ({ ...a, [key]: Number(e.target.value) })); }} />
                  </label>
                ))}
                <button type="button" className="btn btn--small" onClick={() => { setAdjust(NEUTRAL); setFilterId('original'); }}>Reset</button>
              </div>
            )}
            {tab === 'filters' && (
              <div className="filters" role="radiogroup" aria-label="Filters">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" role="radio" aria-checked={filterId === f.id} className={`filter${filterId === f.id ? ' is-on' : ''}`} onClick={() => { setFilterId(f.id); setAdjust(f.adjust); }}>
                    {thumbs[f.id] ? <img src={thumbs[f.id]} alt="" /> : <span className="filter__blank" />}
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
