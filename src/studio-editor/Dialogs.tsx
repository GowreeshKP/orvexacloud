
import { useEffect, useState } from 'react';
import { publishChecks, type Catalog, type TemplateDefinition, type Theme } from '@orvexa/theme';
import { TemplateGallery } from './TemplateGallery';
import { api, ApiError, type VersionSummary } from './api';
import { StudioPortal } from './studioPortal';

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <StudioPortal>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={`modal__panel${wide ? ' modal__panel--wide' : ''}`}>
          <header className="modal__head">
            <h2 id="modal-title">{title}</h2>
            <button type="button" className="btn btn--quiet" onClick={onClose}>Close</button>
          </header>
          <div className="modal__scroll">{children}</div>
        </div>
      </div>
    </StudioPortal>
  );
}

const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

export function PublishDialog({ theme, seoChecks, revision, saved, canPublish, storeUrl, onClose, onPublished }: {
  theme: Theme; seoChecks: boolean; revision: number | null; saved: boolean; canPublish: boolean; storeUrl: string; onClose: () => void; onPublished: (v: VersionSummary) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<VersionSummary | null>(null);
  const checks = publishChecks(theme, { seo: seoChecks }).filter((c) => c.level !== 'ok');
  const blocked = checks.some((c) => c.level === 'error');

  async function publish() {
    if (!revision) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.publish(revision, note);
      setDone(result.version);
      onPublished(result.version);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Publishing failed. Your draft is safe; try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Modal title="Your storefront is live" onClose={onClose}>
        <p>Version {done.version} is published. Shoppers see it on their next visit.</p>
        <div className="modal__actions">
          <a className="btn btn--primary" href={storeUrl} target="_blank" rel="noopener noreferrer">View my store</a>
          <button type="button" className="btn" onClick={onClose} autoFocus>Keep editing</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Publish your storefront" onClose={onClose}>
      {!canPublish && <p className="form-error">Only the store owner can publish. Ask them to review your changes.</p>}
      {checks.length > 0 ? (
        <>
          <p>{blocked ? 'Fix this before publishing:' : 'Worth a look before you publish (you can still publish):'}</p>
          <ul className="checks-list">{checks.map((c) => <li key={c.id} className={`check check--${c.level}`}><strong>{c.title}</strong> {c.detail}</li>)}</ul>
        </>
      ) : <p>Everything looks ready.</p>}
      <div className="field">
        <label htmlFor="publish-note">Note for your history (optional)</label>
        <input id="publish-note" maxLength={200} value={note} placeholder="e.g. Diwali homepage" onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal__actions">
        <button type="button" className="btn btn--publish" disabled={busy || blocked || !saved || !canPublish || !revision} onClick={() => void publish()} autoFocus>
          {busy ? 'Publishing…' : !saved ? 'Saving your changes…' : 'Publish'}
        </button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

export function HistoryDialog({ revision, onClose, onRestored }: { revision: number | null; onClose: () => void; onRestored: (theme: Theme, revision: number, version: number) => void }) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    api.versions().then((r) => setVersions(r.versions)).catch((e) => setError(e instanceof Error ? e.message : 'Could not load history.'));
  }, []);
  async function restore(v: VersionSummary) {
    setBusy(v.id);
    try {
      const result = await api.restore(v.id, revision);
      onRestored(result.theme, result.revision, v.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore that version.');
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal title="Published versions" onClose={onClose}>
      <p className="field__help">Restoring copies a version into your draft. Your live store changes only when you publish again.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {versions === null && !error && <p>Loading…</p>}
      {versions?.length === 0 && <p>You have not published yet.</p>}
      <ol className="history">
        {versions?.map((v) => (
          <li key={v.id}>
            <div><strong>Version {v.version}</strong>{v.note && <span>{v.note}</span>}<small>Published {when(v.createdAt)}</small></div>
            <button type="button" className="btn btn--small" disabled={busy !== null} onClick={() => void restore(v)}>{busy === v.id ? 'Restoring…' : 'Restore to draft'}</button>
          </li>
        ))}
      </ol>
    </Modal>
  );
}

export type TemplateChoice = { template: TemplateDefinition; mode: 'style' | 'replace' };

/** Change template: pick one, then choose whether to take its look only or replace the homepage. */
export function TemplatesDialog({ theme, catalog, onClose, onChoose }: { theme: Theme; catalog: Catalog; onClose: () => void; onChoose: (choice: TemplateChoice) => void }) {
  const [picked, setPicked] = useState<TemplateDefinition | null>(null);
  const homeEdited = Boolean(theme.pages.home.layout);
  if (picked) {
    return (
      <Modal title={`Use “${picked.name}”`} onClose={onClose}>
        <p>How should this template change your store?</p>
        <div className="template-choice">
          <button type="button" className="path path--primary" onClick={() => onChoose({ template: picked, mode: 'style' })} autoFocus>
            <strong>Use its style only</strong>
            <span>Colours, fonts, buttons, product cards and photo shapes change. Every page stays exactly as you edited it.</span>
          </button>
          <button type="button" className="path" onClick={() => onChoose({ template: picked, mode: 'replace' })}>
            <strong>Replace my homepage</strong>
            <span>Your homepage becomes this template’s layout{homeEdited ? ', and the changes you made to it in the editor are replaced' : ''}. Your brand, menu, footer, categories and other pages stay.</span>
          </button>
        </div>
        <p className="field__help">You can undo either choice, and published versions can always be restored from History.</p>
        <div className="modal__actions"><button type="button" className="btn" onClick={() => setPicked(null)}>Back to templates</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="Change template" onClose={onClose} wide>
      <TemplateGallery brandName={theme.brand.name} nicheId={theme.nicheId} catalog={catalog} currentId={theme.templateId} actionLabel="Choose" onChoose={setPicked} />
    </Modal>
  );
}
