import { describe, expect, it } from 'vitest';
import { applyOps, buildTheme } from '@orvexa/theme';
import { initialState, reducer } from './state';

const base = buildTheme('heritage-drape', { brandName: 'A', nicheId: 'sarees-ethnic' });
const rename = (name: string) => {
  const result = applyOps(base, [{ op: 'update_brand', name }]);
  if (!result.ok) throw new Error();
  return result.theme;
};

describe('editor state', () => {
  it('undoes and redoes every committed change', () => {
    let s = initialState(base, 1);
    s = reducer(s, { type: 'commit', theme: rename('B') });
    s = reducer(s, { type: 'commit', theme: rename('C') });
    expect(s.saveState).toBe('unsaved');
    s = reducer(s, { type: 'undo' });
    expect(s.theme?.brand.name).toBe('B');
    s = reducer(s, { type: 'redo' });
    expect(s.theme?.brand.name).toBe('C');
    s = reducer(s, { type: 'commit', theme: rename('D') });
    expect(s.future).toHaveLength(0);
  });

  it('stays unsaved if the merchant edited while a save was in flight', () => {
    let s = initialState(base, 1);
    const sent = rename('B');
    s = reducer(s, { type: 'commit', theme: sent });
    s = reducer(s, { type: 'saving' });
    s = reducer(s, { type: 'commit', theme: rename('C') });
    s = reducer(s, { type: 'saved', revision: 2, theme: sent });
    expect(s.saveState).toBe('unsaved');
    expect(s.revision).toBe(2);
  });

  it('marks the draft saved when the saved theme is current', () => {
    let s = initialState(base, 1);
    const sent = rename('B');
    s = reducer(s, { type: 'commit', theme: sent });
    s = reducer(s, { type: 'saved', revision: 2, theme: sent });
    expect(s.saveState).toBe('saved');
  });

  it('clears an AI proposal when the merchant edits or undoes', () => {
    let s = initialState(base, 1);
    s = reducer(s, { type: 'propose', proposal: { theme: rename('AI'), reply: '', changes: [], provider: 'x' } });
    s = reducer(s, { type: 'commit', theme: rename('B') });
    expect(s.proposal).toBeNull();
  });
});
