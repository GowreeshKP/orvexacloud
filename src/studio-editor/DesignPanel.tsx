import { useEffect, useRef, useState } from 'react';
import { contrastChecks, FONT_IDS, FONTS, fontStylesheetHref, TEMPLATES, type EditOp, type Theme, type Tokens } from '@orvexa/theme';
import { FieldControl, ImageField, type FieldContext } from './Fields';

const COLOR_LABELS: Record<keyof Tokens['colors'], string> = {
  background: 'Page background', surface: 'Cards and panels', text: 'Main text', muted: 'Secondary text',
  primary: 'Main colour (buttons)', onPrimary: 'Text on buttons', accent: 'Highlight',
};

type Choice<K extends keyof Tokens> = { key: K; label: string; options: Array<[Tokens[K], string]> };
const STYLE_CHOICES = [
  { key: 'buttonStyle', label: 'Buttons', options: [['solid', 'Solid'], ['outline', 'Outline'], ['pill', 'Rounded'], ['underline', 'Underlined']] },
  { key: 'cardStyle', label: 'Product cards', options: [['plain', 'Plain'], ['framed', 'Framed'], ['raised', 'Tinted'], ['caption-overlay', 'Text on photo']] },
  { key: 'imageShape', label: 'Product photo shape', options: [['portrait', 'Portrait'], ['square', 'Square'], ['landscape', 'Landscape'], ['tall', 'Tall']] },
  { key: 'radius', label: 'Corners', options: [['sharp', 'Sharp'], ['soft', 'Soft'], ['round', 'Round']] },
  { key: 'spacing', label: 'Spacing', options: [['compact', 'Compact'], ['regular', 'Regular'], ['airy', 'Airy']] },
  { key: 'headingCase', label: 'Headings', options: [['as-written', 'As written'], ['uppercase', 'Capitals']] },
] as const satisfies ReadonlyArray<Choice<keyof Tokens>>;

function ColorInput({ label, value, onCommit }: { label: string; value: string; onCommit: (hex: string) => void }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setLocal(value), [value]);
  const change = (next: string) => {
    setLocal(next);
    clearTimeout(timer.current);
    if (/^#[0-9a-f]{6}$/i.test(next)) timer.current = setTimeout(() => onCommit(next.toLowerCase()), 350);
  };
  return (
    <label className="color-row">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(local) ? local : value} onChange={(e) => change(e.target.value)} aria-label={`${label} colour picker`} />
      <span>{label}</span>
      <input className="mono" value={local} maxLength={7} spellCheck={false} onChange={(e) => change(e.target.value)} aria-label={`${label} hex code`} />
    </label>
  );
}

function DesignGroup({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className="design-group" open={defaultOpen}>
      <summary className="design-group__summary">{title}</summary>
      <div className="design-group__body">{children}</div>
    </details>
  );
}

export function DesignPanel({ theme, apply, ctx, onOpenTemplates }: { theme: Theme; apply: (op: EditOp) => boolean; ctx: FieldContext; onOpenTemplates: () => void }) {
  const t = theme.tokens;
  const problems = contrastChecks(theme).filter((c) => c.level !== 'ok');
  const setToken = (changes: Record<string, unknown>) => apply({ op: 'set_tokens', changes });

  return (
    <div className="panel panel--design">
      <link rel="stylesheet" href={fontStylesheetHref([...FONT_IDS])} />
      <header className="panel__intro">
        <h2>Design</h2>
        <p className="field__help">Brand, colours, header and footer. Page blocks are edited on the canvas.</p>
      </header>

      <DesignGroup title="Template" defaultOpen>
        <div className="template-current">
          <span>{TEMPLATES.find((tpl) => tpl.id === theme.templateId)?.name ?? 'Your own design'}</span>
          <button type="button" className="btn btn--small" onClick={onOpenTemplates}>Change</button>
        </div>
        <p className="field__help">Take a template’s style only, or replace your homepage with its layout.</p>
      </DesignGroup>

      <DesignGroup title="Brand" defaultOpen>
        <FieldControl field={{ key: 'name', label: 'Store name', kind: 'text', max: 80, noAi: true }} value={theme.brand.name} ctx={ctx} onChange={(v) => apply({ op: 'update_brand', name: String(v) })} />
        <ImageField label="Logo" value={theme.brand.logo} aspect="free" ctx={ctx} help="A wide logo on a transparent background works best." onChange={(logo) => apply({ op: 'update_brand', logo: logo ?? null })} />
      </DesignGroup>

      <DesignGroup title="Colours" defaultOpen>
        {(Object.keys(COLOR_LABELS) as Array<keyof Tokens['colors']>).map((key) => (
          <ColorInput key={key} label={COLOR_LABELS[key]} value={t.colors[key]} onCommit={(hex) => setToken({ colors: { [key]: hex } })} />
        ))}
        {problems.length > 0 && (
          <ul className="checks-list" aria-label="Readability">
            {problems.map((p) => <li key={p.id} className={`check check--${p.level}`}><strong>{p.title}</strong> {p.detail}</li>)}
          </ul>
        )}
      </DesignGroup>

      <DesignGroup title="Fonts">
        {(['display', 'body'] as const).map((role) => (
          <div className="field" key={role}>
            <label htmlFor={`font-${role}`}>{role === 'display' ? 'Headings' : 'Body text'}</label>
            <select id={`font-${role}`} value={t.fonts[role]} style={{ fontFamily: FONTS[t.fonts[role]].css }} onChange={(e) => setToken({ fonts: { [role]: e.target.value } })}>
              {FONT_IDS.map((id) => <option key={id} value={id} style={{ fontFamily: FONTS[id].css }}>{FONTS[id].family}</option>)}
            </select>
          </div>
        ))}
      </DesignGroup>

      <DesignGroup title="Style">
        {STYLE_CHOICES.map((choice) => (
          <div className="field" key={choice.key}>
            <span className="field__label" id={`style-${choice.key}`}>{choice.label}</span>
            <div className="segmented segmented--wrap" role="radiogroup" aria-labelledby={`style-${choice.key}`}>
              {choice.options.map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={t[choice.key] === value} className={t[choice.key] === value ? 'is-on' : ''} onClick={() => setToken({ [choice.key]: value })}>{label}</button>
              ))}
            </div>
          </div>
        ))}
      </DesignGroup>

      <DesignGroup title="Top bar">
        <FieldControl field={{ key: 'enabled', label: 'Show an announcement bar', kind: 'toggle' }} value={theme.header.announcement.enabled} ctx={ctx}
          onChange={(v) => apply({ op: 'update_header', changes: { announcement: { enabled: v, ...(v && !theme.header.announcement.messages.length ? { messages: [`Welcome to ${theme.brand.name}`] } : {}) } } })} />
        {theme.header.announcement.enabled && <>
          <FieldControl field={{ key: 'messages', label: 'Messages', kind: 'string-list', maxItems: 5, max: 120, help: 'Up to five short lines. Mention only offers and delivery terms you have set up.' }}
            value={theme.header.announcement.messages} ctx={ctx} onChange={(v) => apply({ op: 'update_header', changes: { announcement: { messages: (v as string[]).map((m) => m.trim()).filter(Boolean) } } })} />
          <FieldControl field={{ key: 'style', label: 'How messages appear', kind: 'select', options: [['static', 'Side by side'], ['scroll', 'Scrolling ticker']] }} value={theme.header.announcement.style} ctx={ctx}
            onChange={(v) => apply({ op: 'update_header', changes: { announcement: { style: v } } })} />
          <FieldControl field={{ key: 'tone', label: 'Bar colour', kind: 'select', options: [['primary', 'Main colour'], ['accent', 'Highlight'], ['dark', 'Text colour']] }} value={theme.header.announcement.tone} ctx={ctx}
            onChange={(v) => apply({ op: 'update_header', changes: { announcement: { tone: v } } })} />
          <FieldControl field={{ key: 'href', label: 'Link (optional)', kind: 'href' }} value={theme.header.announcement.href} ctx={ctx}
            onChange={(v) => apply({ op: 'update_header', changes: { announcement: { href: v } } })} />
        </>}
      </DesignGroup>

      <DesignGroup title="Header & icons">
        <FieldControl field={{ key: 'layout', label: 'Logo position', kind: 'select', options: [['logo-left', 'Left'], ['logo-center', 'Centre']] }} value={theme.header.layout} ctx={ctx}
          onChange={(v) => apply({ op: 'update_header', changes: { layout: v } })} />
        <FieldControl field={{ key: 'background', label: 'Header colour', kind: 'select', options: [['page', 'Page background'], ['surface', 'Card colour'], ['primary', 'Main colour']] }} value={theme.header.background} ctx={ctx}
          onChange={(v) => apply({ op: 'update_header', changes: { background: v } })} />
        <fieldset className="field field--icons">
          <legend>Icons</legend>
          <div className="icon-toggles">
            {(['search', 'account', 'wishlist'] as const).map((key) => (
              <FieldControl key={key} field={{ key, label: { search: 'Search', account: 'Account sign-in', wishlist: 'Wishlist' }[key], kind: 'toggle' }} value={theme.header.icons[key]} ctx={ctx}
                onChange={(v) => apply({ op: 'update_header', changes: { icons: { [key]: v } } })} />
            ))}
          </div>
          <p className="field__help">The bag icon is always shown.</p>
        </fieldset>
        <FieldControl field={{ key: 'categoryMenu', label: 'Show categories under “Shop”', kind: 'toggle', help: 'The menu link to /collections/all opens a list of your categories.' }} value={theme.header.categoryMenu} ctx={ctx}
          onChange={(v) => apply({ op: 'update_header', changes: { categoryMenu: v } })} />
        <FieldControl field={{ key: 'sticky', label: 'Keep the header visible while scrolling', kind: 'toggle' }} value={theme.header.sticky} ctx={ctx}
          onChange={(v) => apply({ op: 'update_header', changes: { sticky: v } })} />
        <MenuEditor theme={theme} apply={apply} />
      </DesignGroup>

      <DesignGroup title="Footer">
        <FieldControl field={{ key: 'tagline', label: 'Footer line', kind: 'text', max: 160 }} value={theme.footer.tagline} ctx={ctx} onChange={(v) => apply({ op: 'update_footer', changes: { tagline: v } })} />
        <FieldControl field={{ key: 'showPolicyLinks', label: 'Show shipping, returns, privacy and terms links', kind: 'toggle' }} value={theme.footer.showPolicyLinks} ctx={ctx} onChange={(v) => apply({ op: 'update_footer', changes: { showPolicyLinks: v } })} />
        {(['phone', 'email', 'address'] as const).map((key) => (
          <FieldControl key={key} field={{ key, label: { phone: 'Support phone', email: 'Support email', address: 'Address' }[key], kind: 'text', max: key === 'address' ? 200 : key === 'email' ? 120 : 20, noAi: true }}
            value={theme.footer.contact[key]} ctx={ctx} onChange={(v) => apply({ op: 'update_footer', changes: { contact: { [key]: v } } })} />
        ))}
        {(['instagram', 'facebook', 'youtube', 'pinterest', 'whatsapp'] as const).map((key) => (
          <FieldControl key={key} field={{ key, label: `${key === 'whatsapp' ? 'WhatsApp' : key[0].toUpperCase() + key.slice(1)} link`, kind: 'href' }}
            value={theme.footer.social[key]} ctx={ctx} onChange={(v) => apply({ op: 'update_footer', changes: { social: { [key]: v } } })} />
        ))}
      </DesignGroup>
    </div>
  );
}

function MenuEditor({ theme, apply }: { theme: Theme; apply: (op: EditOp) => boolean }) {
  const menu = theme.header.menu;
  const set = (next: typeof menu) => apply({ op: 'update_header', changes: { menu: next } });
  return (
    <fieldset className="field list-editor">
      <legend>Menu links</legend>
      {menu.map((item, i) => (
        <div className="menu-row" key={`${i}-${item.label}-${item.href}`}>
          <input aria-label={`Menu item ${i + 1} label`} defaultValue={item.label} maxLength={30} onBlur={(e) => e.target.value !== item.label && set(menu.map((m, j) => (j === i ? { ...m, label: e.target.value } : m)))} />
          <input aria-label={`Menu item ${i + 1} link`} className="mono" defaultValue={item.href} maxLength={300} onBlur={(e) => e.target.value !== item.href && set(menu.map((m, j) => (j === i ? { ...m, href: e.target.value } : m)))} />
          <button type="button" className="icon-button" aria-label={`Remove menu item ${i + 1}`} onClick={() => set(menu.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {menu.length < 7 && <button type="button" className="btn btn--small" onClick={() => set([...menu, { label: 'New link', href: '/collections/all' }])}>Add link</button>}
    </fieldset>
  );
}
