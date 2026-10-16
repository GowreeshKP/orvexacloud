import { useState } from 'react'
import {
  EDITABLE_COPY_FIELDS,
  HOME_SECTIONS,
  PDP_OPTIONS,
  getHomeSections,
  isPdpOptionEnabled,
  isTemplateStore,
  type CopyFieldGroup,
  type StorefrontCopy,
} from '@/data/store-niches'
import type { HomeSectionId, PdpOptionId, TenantConfig, ThemeConfig } from '@/types/tenant'

export type ContentEditorTab = 'text' | 'layout' | 'pdp' | 'offers' | 'footer'

export interface StorefrontExtras {
  copy: Record<string, string>
  trustItems: { icon: string; text: string }[]
  trustEdited: boolean
  homeSections: { id: HomeSectionId; visible: boolean }[]
  pdpOptions: Record<PdpOptionId, boolean>
  footerOptions: { trustStrip: boolean; newsletter: boolean }
  socialLinks: { instagram: string; whatsapp: string; pinterest: string; facebook: string }
  freeShippingThreshold: number
  shippingFee: number
  discountCode: string
  discountPercent: number
}

export function getInitialExtras(tenant: TenantConfig | null | undefined, defaults: StorefrontCopy): StorefrontExtras {
  const theme = tenant?.theme
  const isTemplate = isTemplateStore(tenant)
  return {
    copy: { ...(theme?.copy || {}) },
    trustItems: theme?.trustItems?.length
      ? theme.trustItems.map((t) => ({ ...t }))
      : defaults.trustItems.map((t) => ({ icon: t.icon, text: t.text })),
    trustEdited: !!theme?.trustItems?.length,
    homeSections: getHomeSections(tenant),
    pdpOptions: Object.fromEntries(PDP_OPTIONS.map((o) => [o.id, isPdpOptionEnabled(tenant, o.id)])) as Record<PdpOptionId, boolean>,
    footerOptions: {
      trustStrip: theme?.footerOptions?.trustStrip ?? true,
      newsletter: theme?.footerOptions?.newsletter ?? true,
    },
    socialLinks: {
      instagram: theme?.socialLinks?.instagram || '',
      whatsapp: theme?.socialLinks?.whatsapp || '',
      pinterest: theme?.socialLinks?.pinterest || '',
      facebook: theme?.socialLinks?.facebook || '',
    },
    freeShippingThreshold: theme?.freeShippingThreshold ?? 999,
    shippingFee: theme?.shippingFee ?? 70,
    discountCode: (theme?.discountCode || (isTemplate ? `${(tenant?.slug || 'STORE').toUpperCase()}10` : 'LUNAR15')).toUpperCase(),
    discountPercent: theme?.discountPercent || (isTemplate ? 10 : 15),
  }
}

export function extrasToTheme(extras: StorefrontExtras): Partial<ThemeConfig> {
  const copy = Object.fromEntries(Object.entries(extras.copy).filter(([, v]) => v.trim()))
  return {
    copy,
    trustItems: extras.trustEdited ? extras.trustItems.filter((t) => t.text.trim()) : undefined,
    homeSections: extras.homeSections,
    pdpOptions: extras.pdpOptions,
    footerOptions: extras.footerOptions,
    socialLinks: Object.fromEntries(Object.entries(extras.socialLinks).filter(([, v]) => v.trim())),
    freeShippingThreshold: Math.max(0, Math.round(extras.freeShippingThreshold || 0)),
    shippingFee: Math.max(0, Math.round(extras.shippingFee || 0)),
    discountCode: extras.discountCode.trim() || undefined,
    discountPercent: Math.min(90, Math.max(1, Math.round(extras.discountPercent || 0))),
  }
}

const COPY_GROUPS: { id: CopyFieldGroup; label: string }[] = [
  { id: 'home', label: 'Homepage' },
  { id: 'catalog', label: 'Catalog & Cart' },
  { id: 'pdp', label: 'Product Page' },
  { id: 'footer', label: 'Footer' },
]

const cardClass = 'bg-white rounded-xl p-6 border border-black/8 shadow-sm space-y-4'
const labelClass = 'text-xs font-bold uppercase tracking-wider text-black/60 mb-1 block'
const inputClass = 'w-full border border-black/20 px-3 py-2 text-xs rounded-lg outline-none focus:border-black'

function CardTitle({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="border-b border-black/10 pb-3">
      <h3 className="text-xs font-bold tracking-wider uppercase text-black flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
      </h3>
      {hint && <p className="text-[11px] text-black/50 mt-1">{hint}</p>}
    </div>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`w-11 h-6 rounded-full transition-all cursor-pointer relative flex-shrink-0 ${on ? 'bg-emerald-500' : 'bg-stone-300'}`}
    >
      <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all ${on ? 'left-5.5' : 'left-0.5'}`} />
    </button>
  )
}

export default function StorefrontContentEditor({
  tab,
  value,
  defaults,
  currencySymbol = '₹',
  onChange,
}: {
  tab: ContentEditorTab
  value: StorefrontExtras
  defaults: StorefrontCopy
  currencySymbol?: string
  onChange: (updates: Partial<StorefrontExtras>) => void
}) {
  const [copyGroup, setCopyGroup] = useState<CopyFieldGroup>('home')

  const setCopy = (key: string, text: string) => onChange({ copy: { ...value.copy, [key]: text } })
  const defaultText = (key: keyof StorefrontCopy) => {
    const d = defaults[key]
    return Array.isArray(d) ? (d as string[]).join('\n') : String(d)
  }

  const moveSection = (index: number, delta: number) => {
    const next = [...value.homeSections]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ homeSections: next })
  }

  const setTrust = (items: StorefrontExtras['trustItems']) => onChange({ trustItems: items, trustEdited: true })

  if (tab === 'text') {
    const fields = EDITABLE_COPY_FIELDS.filter((f) => f.group === copyGroup)
    const overriddenCount = EDITABLE_COPY_FIELDS.filter((f) => value.copy[f.key]?.trim()).length
    return (
      <div className={cardClass}>
        <CardTitle
          icon="✍️"
          title="Headlines & Store Text"
          hint="Change any heading or message on your store. Leave a field empty to keep the default shown in grey."
        />

        <div className="flex flex-wrap items-center gap-2">
          {COPY_GROUPS.map((g) => {
            const count = EDITABLE_COPY_FIELDS.filter((f) => f.group === g.id && value.copy[f.key]?.trim()).length
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setCopyGroup(g.id)}
                className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                  copyGroup === g.id ? 'bg-black text-white border-black' : 'bg-white text-black/60 border-black/15 hover:border-black'
                }`}
              >
                {g.label}
                {count > 0 && <span className="ml-1.5 text-[10px] opacity-70">({count})</span>}
              </button>
            )
          })}
          {overriddenCount > 0 && (
            <button
              type="button"
              onClick={() => onChange({ copy: {} })}
              className="ml-auto text-[11px] font-bold text-red-600 hover:text-red-700 cursor-pointer"
            >
              Reset all text
            </button>
          )}
        </div>

        <div className="space-y-4">
          {fields.map((f) => {
            const current = value.copy[f.key] || ''
            return (
              <div key={f.key}>
                <div className="flex items-center justify-between">
                  <label className={labelClass} htmlFor={`copy-${f.key}`}>
                    {f.label}
                  </label>
                  {current.trim() && (
                    <button
                      type="button"
                      onClick={() => setCopy(f.key, '')}
                      className="text-[10px] font-bold text-black/50 hover:text-black underline cursor-pointer mb-1"
                    >
                      Use default
                    </button>
                  )}
                </div>
                {f.multiline ? (
                  <textarea
                    id={`copy-${f.key}`}
                    rows={f.key === 'pdpShippingPoints' ? 3 : 2}
                    value={current}
                    onChange={(e) => setCopy(f.key, e.target.value)}
                    placeholder={defaultText(f.key)}
                    className={inputClass}
                  />
                ) : (
                  <input
                    id={`copy-${f.key}`}
                    type="text"
                    value={current}
                    onChange={(e) => setCopy(f.key, e.target.value)}
                    placeholder={defaultText(f.key)}
                    className={inputClass}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (tab === 'layout') {
    return (
      <div className="space-y-6">
        <div className={cardClass}>
          <CardTitle
            icon="🧱"
            title="Homepage Sections"
            hint="Show, hide and reorder the blocks below your hero banner. The hero always stays on top."
          />
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-stone-50 border border-dashed border-black/15">
              <span className="text-[10px] font-mono text-black/40 w-5 text-center">—</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-black">Hero banner</p>
                <p className="text-[10px] text-black/50">Edited on the Branding & Hero tab</p>
              </div>
              <span className="text-[10px] font-bold text-black/40 uppercase">Fixed</span>
            </div>
            {value.homeSections.map((s, i) => {
              const meta = HOME_SECTIONS.find((h) => h.id === s.id)
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    s.visible ? 'bg-white border-black/15' : 'bg-stone-50 border-black/8 opacity-60'
                  }`}
                >
                  <span className="text-[10px] font-mono text-black/40 w-5 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-black">{meta?.label}</p>
                    <p className="text-[10px] text-black/50 truncate">{meta?.desc}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveSection(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${meta?.label} up`}
                      className="w-7 h-7 rounded border border-black/15 text-xs font-bold hover:border-black disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(i, 1)}
                      disabled={i === value.homeSections.length - 1}
                      aria-label={`Move ${meta?.label} down`}
                      className="w-7 h-7 rounded border border-black/15 text-xs font-bold hover:border-black disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      ↓
                    </button>
                  </div>
                  <Toggle
                    on={s.visible}
                    label={`Show ${meta?.label}`}
                    onClick={() =>
                      onChange({ homeSections: value.homeSections.map((x) => (x.id === s.id ? { ...x, visible: !x.visible } : x)) })
                    }
                  />
                </div>
              )
            })}
          </div>
        </div>

        <div className={cardClass}>
          <CardTitle icon="🎗️" title="Trust Ticker Messages" hint="The scrolling strip under your hero. Use an emoji as the icon." />
          <div className="space-y-2">
            {value.trustItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.icon}
                  maxLength={4}
                  onChange={(e) => setTrust(value.trustItems.map((t, j) => (j === i ? { ...t, icon: e.target.value } : t)))}
                  aria-label="Icon"
                  className="w-12 border border-black/20 px-2 py-2 text-sm text-center rounded-lg outline-none focus:border-black"
                />
                <input
                  type="text"
                  value={item.text}
                  onChange={(e) =>
                    setTrust(value.trustItems.map((t, j) => (j === i ? { ...t, text: e.target.value.toUpperCase() } : t)))
                  }
                  aria-label="Message"
                  className={`${inputClass} font-bold uppercase`}
                />
                <button
                  type="button"
                  onClick={() => setTrust(value.trustItems.filter((_, j) => j !== i))}
                  aria-label="Remove message"
                  className="text-red-500 hover:text-red-700 text-xs px-2 cursor-pointer font-bold"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTrust([...value.trustItems, { icon: '✨', text: '' }])}
              className="bg-black text-white font-bold text-xs uppercase px-4 py-2 rounded-lg hover:bg-stone-800 cursor-pointer"
            >
              + Add message
            </button>
            {value.trustEdited && (
              <button
                type="button"
                onClick={() =>
                  onChange({ trustItems: defaults.trustItems.map((t) => ({ icon: t.icon, text: t.text })), trustEdited: false })
                }
                className="text-[11px] font-bold text-black/50 hover:text-black underline cursor-pointer"
              >
                Restore defaults
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'pdp') {
    return (
      <div className="space-y-6">
        <div className={cardClass}>
          <CardTitle icon="🛍️" title="Product Page Layout" hint="Choose which blocks appear on every product page." />
          {PDP_OPTIONS.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-4 py-2 border-b border-black/5 last:border-0">
              <div>
                <p className="text-xs font-bold text-black">{o.label}</p>
                <p className="text-[10px] text-black/50">{o.desc}</p>
              </div>
              <Toggle
                on={value.pdpOptions[o.id]}
                label={o.label}
                onClick={() => onChange({ pdpOptions: { ...value.pdpOptions, [o.id]: !value.pdpOptions[o.id] } })}
              />
            </div>
          ))}
        </div>

        <div className={cardClass}>
          <CardTitle icon="✍️" title="Product Page Text" hint="Leave empty to keep the default shown in grey." />
          {EDITABLE_COPY_FIELDS.filter((f) => f.group === 'pdp').map((f) => (
            <div key={f.key}>
              <label className={labelClass} htmlFor={`pdp-${f.key}`}>
                {f.label}
              </label>
              {f.multiline ? (
                <textarea
                  id={`pdp-${f.key}`}
                  rows={f.key === 'pdpShippingPoints' ? 3 : 2}
                  value={value.copy[f.key] || ''}
                  onChange={(e) => setCopy(f.key, e.target.value)}
                  placeholder={defaultText(f.key)}
                  className={inputClass}
                />
              ) : (
                <input
                  id={`pdp-${f.key}`}
                  type="text"
                  value={value.copy[f.key] || ''}
                  onChange={(e) => setCopy(f.key, e.target.value)}
                  placeholder={defaultText(f.key)}
                  className={inputClass}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (tab === 'offers') {
    const freeAlways = value.shippingFee <= 0
    return (
      <div className="space-y-6">
        <div className={cardClass}>
          <CardTitle icon="🚚" title="Shipping Charges" hint="Used in the cart progress bar, checkout total and product page." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="ship-fee">
                Shipping fee ({currencySymbol})
              </label>
              <input
                id="ship-fee"
                type="number"
                min={0}
                value={value.shippingFee}
                onChange={(e) => onChange({ shippingFee: Number(e.target.value) })}
                className={inputClass}
              />
              <p className="text-[10px] text-black/40 mt-1">Set to 0 to offer free shipping on every order.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="ship-threshold">
                Free shipping above ({currencySymbol})
              </label>
              <input
                id="ship-threshold"
                type="number"
                min={0}
                disabled={freeAlways}
                value={value.freeShippingThreshold}
                onChange={(e) => onChange({ freeShippingThreshold: Number(e.target.value) })}
                className={`${inputClass} disabled:bg-stone-100 disabled:text-black/30`}
              />
              <p className="text-[10px] text-black/40 mt-1">Orders at or above this amount ship free.</p>
            </div>
          </div>
          <p className="text-xs bg-stone-50 border border-black/10 rounded-lg px-3 py-2 text-black/70">
            Customers will see:{' '}
            <span className="font-bold text-black">
              {freeAlways
                ? 'Free delivery on every order'
                : `Free delivery on orders over ${currencySymbol}${(value.freeShippingThreshold || 0).toLocaleString('en-IN')}, otherwise ${currencySymbol}${value.shippingFee}`}
            </span>
          </p>
        </div>

        <div className={cardClass}>
          <CardTitle icon="🏷️" title="Promo Code" hint="Customers enter this code in their bag to get a discount." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="promo-code">
                Code
              </label>
              <input
                id="promo-code"
                type="text"
                value={value.discountCode}
                onChange={(e) => onChange({ discountCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                className={`${inputClass} font-mono font-bold uppercase`}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="promo-percent">
                Discount (%)
              </label>
              <input
                id="promo-percent"
                type="number"
                min={1}
                max={90}
                value={value.discountPercent}
                onChange={(e) => onChange({ discountPercent: Number(e.target.value) })}
                className={inputClass}
              />
              <p className="text-[10px] text-black/40 mt-1">Between 1% and 90%.</p>
            </div>
          </div>
          <p className="text-[11px] text-black/50">
            Tip: mention the code in your announcement bar, e.g. “USE CODE {value.discountCode || 'CODE'} FOR {value.discountPercent}% OFF”.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <CardTitle icon="🧾" title="Footer Blocks" />
        {[
          { key: 'trustStrip' as const, label: 'Trust strip', desc: 'Four promise tiles at the top of the footer' },
          { key: 'newsletter' as const, label: 'Newsletter sign-up', desc: 'Email capture box in the footer' },
        ].map((o) => (
          <div key={o.key} className="flex items-center justify-between gap-4 py-2 border-b border-black/5 last:border-0">
            <div>
              <p className="text-xs font-bold text-black">{o.label}</p>
              <p className="text-[10px] text-black/50">{o.desc}</p>
            </div>
            <Toggle
              on={value.footerOptions[o.key]}
              label={o.label}
              onClick={() => onChange({ footerOptions: { ...value.footerOptions, [o.key]: !value.footerOptions[o.key] } })}
            />
          </div>
        ))}
      </div>

      <div className={cardClass}>
        <CardTitle
          icon="🔗"
          title="Social Media Links"
          hint="Only the links you fill in are shown. WhatsApp falls back to your support phone number."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'instagram' as const, label: 'Instagram', placeholder: 'https://instagram.com/yourstore' },
            { key: 'whatsapp' as const, label: 'WhatsApp', placeholder: 'https://wa.me/919876543210' },
            { key: 'facebook' as const, label: 'Facebook', placeholder: 'https://facebook.com/yourstore' },
            { key: 'pinterest' as const, label: 'Pinterest', placeholder: 'https://pinterest.com/yourstore' },
          ].map((s) => (
            <div key={s.key}>
              <label className={labelClass} htmlFor={`social-${s.key}`}>
                {s.label}
              </label>
              <input
                id={`social-${s.key}`}
                type="url"
                value={value.socialLinks[s.key]}
                onChange={(e) => onChange({ socialLinks: { ...value.socialLinks, [s.key]: e.target.value } })}
                placeholder={s.placeholder}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={cardClass}>
        <CardTitle icon="✍️" title="Footer Text" hint="Leave empty to keep the default shown in grey." />
        {EDITABLE_COPY_FIELDS.filter((f) => f.group === 'footer').map((f) => (
          <div key={f.key}>
            <label className={labelClass} htmlFor={`footer-${f.key}`}>
              {f.label}
            </label>
            {f.multiline ? (
              <textarea
                id={`footer-${f.key}`}
                rows={2}
                value={value.copy[f.key] || ''}
                onChange={(e) => setCopy(f.key, e.target.value)}
                placeholder={defaultText(f.key)}
                className={inputClass}
              />
            ) : (
              <input
                id={`footer-${f.key}`}
                type="text"
                value={value.copy[f.key] || ''}
                onChange={(e) => setCopy(f.key, e.target.value)}
                placeholder={defaultText(f.key)}
                className={inputClass}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
