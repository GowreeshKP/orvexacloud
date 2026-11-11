
import { useState } from 'react';
import { ArrowLeft, LayoutGrid, LayoutTemplate, RotateCcw, Sparkles, Store } from 'lucide-react';
import { buildStarterTheme, buildTheme, NICHES, TEMPLATES, type Catalog, type Theme } from '@orvexa/theme';
import { api } from './api';
import { ScaledStorefront } from './Canvas';
import { TemplateGallery } from './TemplateGallery';

const FEELINGS = ['Calm and premium', 'Warm and traditional', 'Bold and young', 'Clean and simple', 'Playful and bright', 'Festive and rich'];

type Step = 'start' | 'brief' | 'result' | 'templates';

export function Onboarding({ storeName, catalog, imported, onDone }: {
  storeName: string; catalog: Catalog; imported: { theme: Theme; warnings: string[] } | null; onDone: (theme: Theme) => void;
}) {
  const [step, setStep] = useState<Step>('start');
  const [brief, setBrief] = useState({ brandName: storeName, nicheId: imported?.theme.nicheId ?? 'general', about: '', audience: '', vibe: '', language: 'english' as 'english' | 'hinglish' });
  const [result, setResult] = useState<{ theme: Theme; reason: string; notes: string[]; provider: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setBusy(true);
    setError('');
    try {
      setResult(await api.generate(brief));
      setStep('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The store could not be generated. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding">
      <header className="onboarding__head">
        {step !== 'start' && <button type="button" className="btn btn--quiet" onClick={() => setStep(step === 'result' ? 'brief' : 'start')}><ArrowLeft size={15} aria-hidden="true" /> Back</button>}
        <p className="onboarding__store"><Store size={15} aria-hidden="true" /> {storeName}</p>
      </header>

      {step === 'start' && (
        <section className="onboarding__start">
          <h1>Let’s design your storefront</h1>
          <p className="lede">Let AI design it from a short description, or start from a simple page and build it yourself. You can change everything afterwards.</p>
          <div className="field onboarding__niche">
            <label htmlFor="start-niche">What do you sell?</label>
            <select id="start-niche" value={brief.nicheId} onChange={(e) => setBrief({ ...brief, nicheId: e.target.value })}>
              {NICHES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <div className="paths">
            <button type="button" className="path path--primary" onClick={() => setStep('brief')}>
              <Sparkles size={22} aria-hidden="true" />
              <strong>Describe your store, and AI builds it</strong>
              <span>Answer three questions. AI picks a template, colours and writes your homepage in about 20 seconds.</span>
            </button>
            <button type="button" className="path" onClick={() => setStep('templates')}>
              <LayoutGrid size={22} aria-hidden="true" />
              <strong>Choose a template</strong>
              <span>Start from one of {TEMPLATES.length} ready designs made for Indian D2C brands, then edit everything.</span>
            </button>
            <button type="button" className="path" onClick={() => onDone(buildStarterTheme({ brandName: storeName, nicheId: brief.nicheId }))}>
              <LayoutTemplate size={22} aria-hidden="true" />
              <strong>Start with a simple page</strong>
              <span>Six ready blocks with placeholder text. Drag in more blocks and write your own words.</span>
            </button>
            {imported && (
              <button type="button" className="path" onClick={() => onDone(imported.theme)}>
                <RotateCcw size={22} aria-hidden="true" />
                <strong>Keep my current design</strong>
                <span>Bring over your colours, fonts, headline and announcement from the old customiser.</span>
                {imported.warnings.map((w) => <small key={w}>{w}</small>)}
              </button>
            )}
          </div>
        </section>
      )}

      {step === 'brief' && (
        <form className="brief" onSubmit={(e) => { e.preventDefault(); void generate(); }}>
          <h1>Tell us about your store</h1>
          <p className="lede">Use your own words. AI only uses what you write here, and never invents product facts.</p>
          <div className="field">
            <label htmlFor="b-name">Store name</label>
            <input id="b-name" required maxLength={80} value={brief.brandName} onChange={(e) => setBrief({ ...brief, brandName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="b-niche">What do you sell?</label>
            <select id="b-niche" value={brief.nicheId} onChange={(e) => setBrief({ ...brief, nicheId: e.target.value })}>
              {NICHES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-about">What makes your products yours?</label>
            <textarea id="b-about" rows={4} maxLength={1200} value={brief.about} placeholder="e.g. We work with six weaving families in Pochampally. Every saree is woven to order." onChange={(e) => setBrief({ ...brief, about: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="b-audience">Who buys from you?</label>
            <input id="b-audience" maxLength={300} value={brief.audience} placeholder="e.g. Women in their 30s buying for weddings and festivals" onChange={(e) => setBrief({ ...brief, audience: e.target.value })} />
          </div>
          <fieldset className="field">
            <legend>How should your store feel?</legend>
            <div className="chips">
              {FEELINGS.map((f) => <button key={f} type="button" className={`chip${brief.vibe === f ? ' is-on' : ''}`} aria-pressed={brief.vibe === f} onClick={() => setBrief({ ...brief, vibe: brief.vibe === f ? '' : f })}>{f}</button>)}
            </div>
          </fieldset>
          <fieldset className="field">
            <legend>Language for your homepage</legend>
            <div className="segmented" role="radiogroup">
              {(['english', 'hinglish'] as const).map((lang) => <button key={lang} type="button" role="radio" aria-checked={brief.language === lang} className={brief.language === lang ? 'is-on' : ''} onClick={() => setBrief({ ...brief, language: lang })}>{lang === 'english' ? 'English' : 'Hinglish'}</button>)}
            </div>
          </fieldset>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--primary btn--large" disabled={busy || !brief.brandName.trim()}><Sparkles size={16} aria-hidden="true" /> {busy ? 'Designing your store…' : 'Build my store'}</button>
        </form>
      )}

      {step === 'result' && result && (
        <section className="result">
          <div className="result__head">
            <div>
              <h1>Here’s a first design</h1>
              <p className="lede">{result.reason || 'Review it, then make it yours in the editor.'}{result.provider === 'built-in' ? ' (Built-in suggestion: AI writing is not switched on yet.)' : ''}</p>
              {result.notes.map((n) => <p key={n} className="field__help">{n}</p>)}
            </div>
            <div className="result__actions">
              <button type="button" className="btn btn--primary" onClick={() => onDone(result.theme)}>Use this design</button>
              <button type="button" className="btn" onClick={() => void generate()} disabled={busy}>{busy ? 'Trying again…' : 'Try another'}</button>
            </div>
          </div>
          <div className="result__preview">
            <ScaledStorefront theme={result.theme} catalog={catalog} page="home" width={1280} />
          </div>
        </section>
      )}

      {step === 'templates' && (
        <section className="onboarding__templates">
          <div className="onboarding__templates-intro">
            <h1>Choose a template</h1>
            <p className="lede">Each one is a starting point. Change the words, photos, colours and blocks afterwards.</p>
          </div>
          <TemplateGallery brandName={storeName} nicheId={brief.nicheId} catalog={catalog} actionLabel="Start with this"
            onChoose={(t) => onDone(buildTheme(t.id, { brandName: storeName, nicheId: brief.nicheId === 'general' ? t.niches[0] : brief.nicheId }))} />
        </section>
      )}
    </main>
  );
}
