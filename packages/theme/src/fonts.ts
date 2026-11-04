/**
 * Curated storefront fonts. A short, deliberate list keeps pages fast and
 * pairings tasteful. Mukta covers Devanagari for Hindi-language storefronts.
 */
export const FONTS = {
  fraunces: { family: 'Fraunces', css: '"Fraunces", Georgia, serif', google: 'Fraunces:opsz,wght@9..144,400..700', kind: 'serif' },
  cormorant: { family: 'Cormorant Garamond', css: '"Cormorant Garamond", Georgia, serif', google: 'Cormorant+Garamond:wght@500;600;700', kind: 'serif' },
  'instrument-serif': { family: 'Instrument Serif', css: '"Instrument Serif", Georgia, serif', google: 'Instrument+Serif', kind: 'serif' },
  syne: { family: 'Syne', css: '"Syne", "Helvetica Neue", Arial, sans-serif', google: 'Syne:wght@500..800', kind: 'sans' },
  bricolage: { family: 'Bricolage Grotesque', css: '"Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif', google: 'Bricolage+Grotesque:opsz,wght@12..96,400..800', kind: 'sans' },
  hanken: { family: 'Hanken Grotesk', css: '"Hanken Grotesk", "Helvetica Neue", Arial, sans-serif', google: 'Hanken+Grotesk:wght@400;500;600;700', kind: 'sans' },
  manrope: { family: 'Manrope', css: '"Manrope", "Helvetica Neue", Arial, sans-serif', google: 'Manrope:wght@400;500;600;700', kind: 'sans' },
  karla: { family: 'Karla', css: '"Karla", "Helvetica Neue", Arial, sans-serif', google: 'Karla:wght@400;500;700', kind: 'sans' },
  lora: { family: 'Lora', css: '"Lora", Georgia, serif', google: 'Lora:wght@400;500;600', kind: 'serif' },
  nunito: { family: 'Nunito Sans', css: '"Nunito Sans", "Helvetica Neue", Arial, sans-serif', google: 'Nunito+Sans:opsz,wght@6..12,400..700', kind: 'sans' },
  mukta: { family: 'Mukta', css: '"Mukta", "Helvetica Neue", Arial, sans-serif', google: 'Mukta:wght@400;500;700', kind: 'sans' },
} as const;

export type FontId = keyof typeof FONTS;
export const FONT_IDS = Object.keys(FONTS) as [FontId, ...FontId[]];

/** Google Fonts stylesheet URL for exactly the fonts a theme uses. */
export function fontStylesheetHref(fontIds: FontId[]): string {
  const unique = [...new Set(fontIds)];
  const families = unique.map((id) => `family=${FONTS[id].google}`).join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
