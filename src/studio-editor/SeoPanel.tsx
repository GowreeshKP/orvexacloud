
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { publishChecks, type EditOp, type Theme } from '@orvexa/theme';
import { api } from './api';
import { FieldControl, type FieldContext } from './Fields';

export function SeoPanel({ theme, apply, storeUrl, ctx }: { theme: Theme; apply: (op: EditOp) => boolean; storeUrl: string; ctx: FieldContext }) {
  const [busy, setBusy] = useState(false);
  const checks = publishChecks(theme);
  async function write() {
    setBusy(true);
    try {
      const result = await api.seo(theme);
      apply({ op: 'update_seo', title: result.title, description: result.description });
      ctx.notify('Search title and description written. Read them before publishing.');
    } catch (error) {
      ctx.notify(error instanceof Error ? error.message : 'AI could not write these.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <section className="group">
        <h3>How your store appears on Google</h3>
        <div className="serp" aria-label="Search result preview">
          <span className="serp__url">{storeUrl.replace(/^https:\/\//, '')}</span>
          <span className="serp__title">{theme.seo.title || theme.brand.name}</span>
          <span className="serp__desc">{theme.seo.description || 'Add a description so shoppers know what they will find.'}</span>
        </div>
        {ctx.aiEnabled && <button type="button" className="btn btn--block btn--ai" onClick={() => void write()} disabled={busy}><Sparkles size={14} aria-hidden="true" /> {busy ? 'Writing…' : 'Write these with AI'}</button>}
        <FieldControl field={{ key: 'title', label: 'Search title', kind: 'text', max: 70, help: '20 to 60 characters. Include your store name and what you sell.' }} value={theme.seo.title} ctx={ctx} onChange={(v) => apply({ op: 'update_seo', title: String(v) })} />
        <FieldControl field={{ key: 'description', label: 'Search description', kind: 'textarea', max: 170, rows: 3, help: '70 to 160 characters.' }} value={theme.seo.description} ctx={ctx} onChange={(v) => apply({ op: 'update_seo', description: String(v) })} />
        <p className="field__help">Product pages use each product’s own title and description automatically. No one can promise a Google ranking.</p>
      </section>
      <section className="group">
        <h3>Before you publish</h3>
        <ul className="checks-list">
          {checks.map((c) => <li key={c.id} className={`check check--${c.level}`}><strong>{c.title}</strong> {c.detail}</li>)}
        </ul>
      </section>
    </div>
  );
}
