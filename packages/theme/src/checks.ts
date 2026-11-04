import type { Theme } from './schema';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export type Check = { id: string; level: 'error' | 'warning' | 'ok'; title: string; detail: string };

export function contrastChecks(theme: Theme): Check[] {
  const c = theme.tokens.colors;
  const pairs: Array<[string, string, string, string]> = [
    ['contrast-text', 'Text on background', c.text, c.background],
    ['contrast-muted', 'Secondary text on background', c.muted, c.background],
    ['contrast-button', 'Button text on main colour', c.onPrimary, c.primary],
    ['contrast-surface', 'Text on cards', c.text, c.surface],
  ];
  return pairs.map(([id, title, fg, bg]) => {
    const ratio = contrastRatio(fg, bg);
    return ratio >= 4.5
      ? { id, level: 'ok', title, detail: `Easy to read (${ratio}:1).` }
      : { id, level: ratio >= 3 ? 'warning' : 'error', title, detail: `Hard to read (${ratio}:1). Aim for at least 4.5:1 so every shopper can read it.` };
  });
}

/** Checklist shown before publishing. Errors block publishing; warnings do not. */
export function publishChecks(theme: Theme, options: { seo?: boolean } = {}): Check[] {
  const checks: Check[] = [...contrastChecks(theme)];
  const { title, description } = theme.seo;
  if (options.seo !== false) {
    checks.push(title.length >= 20 && title.length <= 60
    ? { id: 'seo-title', level: 'ok', title: 'Search title', detail: 'A good length for Google results.' }
    : { id: 'seo-title', level: 'warning', title: 'Search title', detail: 'Write a title of 20 to 60 characters that names your store and what you sell.' });
  checks.push(description.length >= 70 && description.length <= 160
    ? { id: 'seo-description', level: 'ok', title: 'Search description', detail: 'A good length for Google results.' }
    : { id: 'seo-description', level: 'warning', title: 'Search description', detail: 'Write 70 to 160 characters describing what shoppers will find.' });
  }

  const visibleHome = theme.pages.home.sections.filter((item) => !item.hidden);
  const hero = visibleHome.find((item) => item.type === 'hero');
  if (hero?.type === 'hero' && hero.props.variant !== 'triptych' && hero.props.variant !== 'editorial' && !hero.props.image) {
    checks.push({ id: 'hero-image', level: 'warning', title: 'Hero photo', detail: 'Add a photo to your hero banner. It is the first thing shoppers see.' });
  }
  const photos = Object.values(theme.pages).flatMap((page) => page.sections).flatMap((item) => {
    const props = item.props as { image?: { alt: string }; images?: Array<{ alt: string } | null> };
    return [props.image, ...(props.images ?? [])].filter((image): image is { alt: string } => Boolean(image));
  });
  const missingAlt = photos.filter((image) => !image.alt.trim());
  if (missingAlt.length) {
    checks.push({ id: 'alt-text', level: 'warning', title: 'Photo descriptions', detail: `${missingAlt.length} photo${missingAlt.length > 1 ? 's need' : ' needs'} a short description for screen readers and Google Images.` });
  }
  const placeholders = Object.values(theme.pages).reduce((n, page) => n + (page.layout?.html.match(/data-oxs-placeholder/g)?.length ?? 0), 0);
  if (placeholders) {
    checks.push({ id: 'photo-placeholders', level: 'warning', title: 'Empty photo spots', detail: `${placeholders} photo spot${placeholders > 1 ? 's still show' : ' still shows'} a placeholder. Double-click ${placeholders > 1 ? 'them' : 'it'} in the editor to add a photo.` });
  }
  if (theme.header.announcement.enabled && theme.header.announcement.messages.length === 0) {
    checks.push({ id: 'announcement', level: 'error', title: 'Announcement bar', detail: 'The announcement bar is on but empty. Add text or turn it off.' });
  }
  return checks;
}
