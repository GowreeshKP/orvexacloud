import { z } from 'zod';
import { Layout } from './layout';
import { Image, PAGE_IDS, Theme, ThemeCollection, validateTheme, type PageId, type SectionType } from './schema';
import { SECTION_DEFINITIONS, createSection, isRequiredSection } from './sections';
import { applyTemplate, applyTemplateStyle, TEMPLATES } from './templates';

const SECTION_TYPES = Object.keys(SECTION_DEFINITIONS) as [SectionType, ...SectionType[]];
const Page = z.enum(PAGE_IDS);
const Props = z.record(z.string(), z.unknown());

export const EditOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('update_section'), page: Page, sectionId: z.string().max(80), props: Props }),
  z.object({ op: z.literal('add_section'), page: Page, sectionType: z.enum(SECTION_TYPES), index: z.number().int().min(0).max(20).optional(), props: Props.optional() }),
  z.object({ op: z.literal('remove_section'), page: Page, sectionId: z.string().max(80) }),
  z.object({ op: z.literal('move_section'), page: Page, sectionId: z.string().max(80), toIndex: z.number().int().min(0).max(20) }),
  z.object({ op: z.literal('set_section_hidden'), page: Page, sectionId: z.string().max(80), hidden: z.boolean() }),
  z.object({ op: z.literal('set_tokens'), changes: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('update_header'), changes: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('update_footer'), changes: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('update_brand'), name: z.string().max(80).optional(), logo: Image.nullable().optional() }),
  z.object({ op: z.literal('update_seo'), title: z.string().max(70).optional(), description: z.string().max(170).optional() }),
  z.object({ op: z.literal('apply_template'), templateId: z.string().max(60) }),
  /** Take a template's look only; pages and page layouts are kept. */
  z.object({ op: z.literal('apply_template_style'), templateId: z.string().max(60) }),
  z.object({ op: z.literal('upsert_collection'), collection: ThemeCollection }),
  z.object({ op: z.literal('remove_collection'), id: z.string().max(64) }),
  /** Save (or clear, with null) the visual-editor layout of a page. Merchant only. */
  z.object({ op: z.literal('set_layout'), page: Page, layout: Layout.nullable() }),
]);
export type EditOp = z.infer<typeof EditOp>;

export type ApplyResult = { ok: true; theme: Theme } | { ok: false; errors: string[] };
export type ApplySource = 'merchant' | 'ai';

const IMAGE_KEYS = new Set(['image', 'logo', 'shareImage']);

function mergeOneLevel(base: Record<string, unknown>, changes: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(changes)) {
    const current = base[key];
    const bothObjects = value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object' && !Array.isArray(current);
    next[key] = bothObjects ? { ...(current as Record<string, unknown>), ...(value as Record<string, unknown>) } : value;
  }
  return next;
}

/** AI may rearrange and rewrite, but never supplies photos or off-store links. */
function aiViolation(op: EditOp): string | null {
  const props = op.op === 'update_section' || op.op === 'add_section' ? op.props ?? {} : op.op === 'update_header' || op.op === 'update_footer' ? op.changes : {};
  for (const [key, value] of Object.entries(props)) {
    if (IMAGE_KEYS.has(key)) return 'AI suggestions cannot add or change photos. Upload photos yourself.';
    if (/href$/i.test(key) && typeof value === 'string' && value !== '' && !value.startsWith('/')) return 'AI suggestions can only link to pages in your store.';
  }
  if (op.op === 'update_footer' && ('contact' in op.changes || 'social' in op.changes)) return 'AI suggestions cannot change contact details or social links.';
  if (op.op === 'update_brand' && op.logo !== undefined) return 'AI suggestions cannot change your logo.';
  if (op.op === 'upsert_collection' || op.op === 'remove_collection') return 'AI suggestions cannot change your categories.';
  if (op.op === 'set_layout') return 'AI suggestions cannot replace a page layout.';
  if ((op.op === 'update_section' || op.op === 'add_section') && op.props && 'images' in op.props) return 'AI suggestions cannot add or change photos. Upload photos yourself.';
  return null;
}

function applyOne(theme: Theme, op: EditOp): Theme {
  // Mutable working copy; the whole result is validated against the schema in applyOps.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draft = structuredClone(theme) as Record<string, any>;
  const sectionsOf = (page: PageId) => draft.pages[page].sections as Array<{ id: string; type: SectionType; hidden: boolean; props: Record<string, unknown> }>;
  const find = (page: PageId, id: string) => {
    const index = sectionsOf(page).findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`There is no section "${id}" on the ${page} page.`);
    return index;
  };

  switch (op.op) {
    case 'update_section': {
      const list = sectionsOf(op.page);
      const index = find(op.page, op.sectionId);
      list[index] = { ...list[index], props: { ...list[index].props, ...op.props } };
      return draft as Theme;
    }
    case 'add_section': {
      const list = sectionsOf(op.page);
      const created = createSection(op.sectionType, list) as { props: Record<string, unknown> };
      created.props = { ...created.props, ...(op.props ?? {}) };
      list.splice(Math.min(op.index ?? list.length, list.length), 0, created as never);
      return draft as Theme;
    }
    case 'remove_section': {
      const list = sectionsOf(op.page);
      const index = find(op.page, op.sectionId);
      if (isRequiredSection(op.page, list[index].type)) throw new Error(`The ${SECTION_DEFINITIONS[list[index].type].label.toLowerCase()} section is needed on this page and cannot be removed.`);
      list.splice(index, 1);
      return draft as Theme;
    }
    case 'move_section': {
      const list = sectionsOf(op.page);
      const [item] = list.splice(find(op.page, op.sectionId), 1);
      list.splice(Math.min(op.toIndex, list.length), 0, item);
      return draft as Theme;
    }
    case 'set_section_hidden': {
      const list = sectionsOf(op.page);
      const index = find(op.page, op.sectionId);
      if (op.hidden && isRequiredSection(op.page, list[index].type)) throw new Error('This section is needed on this page and cannot be hidden.');
      list[index] = { ...list[index], hidden: op.hidden };
      return draft as Theme;
    }
    case 'set_tokens':
      draft.tokens = mergeOneLevel(draft.tokens, op.changes);
      return draft as Theme;
    case 'update_header':
      draft.header = mergeOneLevel(draft.header, op.changes);
      return draft as Theme;
    case 'update_footer':
      draft.footer = mergeOneLevel(draft.footer, op.changes);
      return draft as Theme;
    case 'update_brand': {
      const brand = { ...draft.brand, ...(op.name !== undefined ? { name: op.name } : {}) };
      if (op.logo === null) delete brand.logo;
      else if (op.logo) brand.logo = op.logo;
      draft.brand = brand;
      return draft as Theme;
    }
    case 'update_seo':
      draft.seo = { ...draft.seo, ...(op.title !== undefined ? { title: op.title } : {}), ...(op.description !== undefined ? { description: op.description } : {}) };
      return draft as Theme;
    case 'apply_template':
      if (!TEMPLATES.some((template) => template.id === op.templateId)) throw new Error(`Unknown template "${op.templateId}".`);
      return applyTemplate(theme, op.templateId);
    case 'apply_template_style':
      if (!TEMPLATES.some((template) => template.id === op.templateId)) throw new Error(`Unknown template "${op.templateId}".`);
      return applyTemplateStyle(theme, op.templateId);
    case 'upsert_collection': {
      const list = draft.collections as Array<{ id: string }>;
      const index = list.findIndex((c) => c.id === op.collection.id);
      if (index >= 0) list[index] = op.collection; else list.push(op.collection);
      return draft as Theme;
    }
    case 'remove_collection':
      draft.collections = (draft.collections as Array<{ id: string }>).filter((c) => c.id !== op.id);
      return draft as Theme;
    case 'set_layout':
      if (op.layout) draft.pages[op.page].layout = op.layout;
      else delete draft.pages[op.page].layout;
      return draft as Theme;
  }
}

/**
 * Apply operations atomically: either every operation applies and the result
 * is a valid theme, or nothing changes.
 */
export function applyOps(theme: Theme, rawOps: unknown[], source: ApplySource = 'merchant'): ApplyResult {
  const errors: string[] = [];
  let current = theme;
  for (const [index, raw] of rawOps.entries()) {
    const parsed = EditOp.safeParse(raw);
    if (!parsed.success) {
      errors.push(`Change ${index + 1} is not a supported edit.`);
      continue;
    }
    if (source === 'ai') {
      const violation = aiViolation(parsed.data);
      if (violation) {
        errors.push(violation);
        continue;
      }
    }
    try {
      current = applyOne(current, parsed.data);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'A change could not be applied.');
    }
  }
  if (errors.length) return { ok: false, errors };
  const validated = validateTheme(current);
  return validated.ok ? { ok: true, theme: validated.theme } : { ok: false, errors: validated.errors };
}

/** A sentence a merchant understands, for review lists and history. */
export function describeOp(op: EditOp, theme: Theme): string {
  const label = (page: PageId, id: string) => {
    const found = theme.pages[page].sections.find((item) => item.id === id);
    return found ? SECTION_DEFINITIONS[found.type].label.toLowerCase() : 'a section';
  };
  switch (op.op) {
    case 'update_section': return `Update the ${label(op.page, op.sectionId)} (${Object.keys(op.props).join(', ')})`;
    case 'add_section': return `Add a ${SECTION_DEFINITIONS[op.sectionType].label.toLowerCase()} to the ${op.page} page`;
    case 'remove_section': return `Remove the ${label(op.page, op.sectionId)}`;
    case 'move_section': return `Move the ${label(op.page, op.sectionId)} to position ${op.toIndex + 1}`;
    case 'set_section_hidden': return `${op.hidden ? 'Hide' : 'Show'} the ${label(op.page, op.sectionId)}`;
    case 'set_tokens': return `Change the store style (${Object.keys(op.changes).join(', ')})`;
    case 'update_header': return 'Update the header';
    case 'update_footer': return 'Update the footer';
    case 'update_brand': return op.name !== undefined ? `Rename the store to “${op.name}”` : 'Update the logo';
    case 'update_seo': return 'Update the search title and description';
    case 'apply_template': return `Switch to the ${TEMPLATES.find((t) => t.id === op.templateId)?.name ?? op.templateId} template`;
    case 'apply_template_style': return `Use the style of the ${TEMPLATES.find((t) => t.id === op.templateId)?.name ?? op.templateId} template`;
    case 'upsert_collection': return `Save the “${op.collection.title}” category`;
    case 'remove_collection': return 'Remove a category';
    case 'set_layout': return `Update the ${op.page} page layout`;
  }
}
