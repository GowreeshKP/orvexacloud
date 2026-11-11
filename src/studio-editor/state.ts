import type { PageId, Theme } from '@orvexa/theme';

export type Panel = 'sections' | 'design' | 'categories' | 'seo';
export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict';
export type Proposal = { theme: Theme; reply: string; changes: string[]; provider: string };

export type EditorState = {
  theme: Theme | null;
  past: Theme[];
  future: Theme[];
  revision: number | null;
  saveState: SaveState;
  page: PageId;
  /** Product or category shown on the product and Shop pages. */
  handle: string | null;
  /** "preview" lets the merchant click around the store like a shopper. */
  mode: 'edit' | 'preview';
  device: 'desktop' | 'mobile';
  selected: string | null;
  panel: Panel;
  proposal: Proposal | null;
};

export type Action =
  | { type: 'commit'; theme: Theme }
  /** A page layout saved by the visual editor, which keeps its own undo history. */
  | { type: 'layout'; theme: Theme }
  | { type: 'replace'; theme: Theme; revision?: number | null; saved?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saving' }
  | { type: 'saved'; revision: number; theme: Theme }
  | { type: 'save-failed'; conflict: boolean }
  | { type: 'page'; page: PageId }
  | { type: 'navigate'; page: PageId; handle: string | null }
  | { type: 'mode'; mode: EditorState['mode'] }
  | { type: 'device'; device: EditorState['device'] }
  | { type: 'select'; sectionId: string | null }
  | { type: 'panel'; panel: Panel }
  | { type: 'propose'; proposal: Proposal | null };

const HISTORY_LIMIT = 60;

export function initialState(theme: Theme | null, revision: number | null): EditorState {
  return { theme, past: [], future: [], revision, saveState: 'saved', page: 'home', handle: null, mode: 'edit', device: 'desktop', selected: null, panel: 'sections', proposal: null };
}

export function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'commit':
      if (!state.theme || action.theme === state.theme) return { ...state, theme: action.theme };
      return { ...state, theme: action.theme, past: [...state.past, state.theme].slice(-HISTORY_LIMIT), future: [], saveState: 'unsaved', proposal: null };
    case 'layout':
      return { ...state, theme: action.theme, saveState: 'unsaved', proposal: null };
    case 'replace':
      return { ...state, theme: action.theme, past: state.theme ? [...state.past, state.theme].slice(-HISTORY_LIMIT) : [], future: [], revision: action.revision === undefined ? state.revision : action.revision, saveState: action.saved ? 'saved' : 'unsaved', selected: null, proposal: null };
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous || !state.theme) return state;
      return { ...state, theme: previous, past: state.past.slice(0, -1), future: [state.theme, ...state.future], saveState: 'unsaved', proposal: null };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next || !state.theme) return state;
      return { ...state, theme: next, past: [...state.past, state.theme], future: rest, saveState: 'unsaved', proposal: null };
    }
    case 'saving':
      return { ...state, saveState: 'saving' };
    case 'saved':
      // If the merchant kept editing while saving, stay "unsaved" so the next save runs.
      return { ...state, revision: action.revision, saveState: state.theme === action.theme ? 'saved' : 'unsaved' };
    case 'save-failed':
      return { ...state, saveState: action.conflict ? 'conflict' : 'error' };
    case 'page':
      return { ...state, page: action.page, handle: null, selected: null };
    case 'navigate':
      return { ...state, page: action.page, handle: action.handle, selected: null };
    case 'mode':
      return { ...state, mode: action.mode, selected: null, proposal: action.mode === 'preview' ? null : state.proposal };
    case 'device':
      return { ...state, device: action.device };
    case 'select':
      return { ...state, selected: action.sectionId, panel: action.sectionId ? 'sections' : state.panel };
    case 'panel':
      return { ...state, panel: action.panel };
    case 'propose':
      return { ...state, proposal: action.proposal };
  }
}
