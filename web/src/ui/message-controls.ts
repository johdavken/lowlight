/**
 * The message controls' buttons and in-place editor. The feed decides where they go (her latest
 * line in the box, every line in the archive); this module builds them. Text goes in through
 * textContent / value only.
 */
import type { ChatMessage } from '../../../shared/types';
import type { KeyId } from './key-glyphs';

export type ControlAction =
  | { kind: 'regenerate' | 'continue' | 'delete' | 'rewind' | 'branch'; id: string }
  | { kind: 'swipe'; id: string; index: number }
  | { kind: 'edit'; id: string; text: string };

export const REWIND_CONFIRM = 'Rewind to here? Every line after it is deleted. A checkpoint is saved first.';
export const BRANCH_CONFIRM = 'Branch from here? A new playthrough starts at this line. This one stays in LOAD.';

type Place = 'latest' | 'archive';

function button(label: string, onClick: () => void, disabled: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** One of the latest line's actions: its glyph, its word, what it does. */
export interface LineAction {
  id: KeyId;
  label: string;
  run: () => void;
}

/** A move on the map, a gig run or a dice game is the server's action line, not something typed: no EDIT. */
function editable(m: ChatMessage): boolean {
  return !(m.role === 'user' && (m.mode === 'travel' || m.mode === 'gig' || m.mode === 'dice'));
}

const branch = (m: ChatMessage, act: (a: ControlAction) => void) => () => {
  if (window.confirm(BRANCH_CONFIRM)) act({ kind: 'branch', id: m.id });
};

/** What the latest line offers (her latest, or the player's when the story ends on it): the box row and the line stack both build from this. */
export function latestActions(m: ChatMessage, act: (a: ControlAction) => void, startEdit: () => void): LineAction[] {
  const list: LineAction[] = [{ id: 'regenerate', label: 'REGENERATE', run: () => act({ kind: 'regenerate', id: m.id }) }];
  if (m.role === 'agent') list.push({ id: 'continue', label: 'KEEP GOING', run: () => act({ kind: 'continue', id: m.id }) });
  if (editable(m)) list.push({ id: 'edit', label: 'EDIT', run: startEdit });
  list.push({ id: 'delete', label: 'DELETE', run: () => act({ kind: 'delete', id: m.id }) });
  // Any line, the latest too: the story from here on, as a new playthrough.
  list.push({ id: 'branch', label: 'BRANCH HERE', run: branch(m, act) });
  return list;
}

/** The action row: her latest line (or the player's, when the story ends on it) in the box, or a line in the archive. */
export function controlRow(m: ChatMessage, place: Place, busy: boolean, act: (a: ControlAction) => void, startEdit: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'controls';
  const add = (label: string, run: () => void) => row.append(button(label, run, busy));
  if (place === 'latest') {
    for (const a of latestActions(m, act, startEdit)) add(a.label, a.run);
    return row;
  }
  if (editable(m)) add('EDIT', startEdit);
  add('DELETE', () => act({ kind: 'delete', id: m.id }));
  add('REWIND HERE', () => {
    if (window.confirm(REWIND_CONFIRM)) act({ kind: 'rewind', id: m.id });
  });
  add('BRANCH HERE', branch(m, act));
  return row;
}

/** ◂ n/N ▸ for a reply with several takes. */
export function takeSwitcher(m: ChatMessage, busy: boolean, act: (a: ControlAction) => void): HTMLElement | null {
  const t = m.takes;
  if (!t || t.count < 2) return null;
  const box = document.createElement('span');
  box.className = 'takes';
  const label = document.createElement('span');
  label.className = 'takes-n';
  label.textContent = `${t.index + 1}/${t.count}`;
  box.append(
    button('◂', () => act({ kind: 'swipe', id: m.id, index: t.index - 1 }), busy || t.index <= 0),
    label,
    button('▸', () => act({ kind: 'swipe', id: m.id, index: t.index + 1 }), busy || t.index >= t.count - 1),
  );
  return box;
}

/**
 * Turns a line's text into a textarea in place. Enter saves (Shift+Enter is a newline), Esc
 * cancels; an empty save is refused inline. `done` runs when editing ends either way.
 */
export function editInPlace(textEl: HTMLElement, initial: string, save: (text: string) => void, done: () => void): HTMLTextAreaElement {
  const area = document.createElement('textarea');
  area.className = 'edit-box';
  area.value = initial;
  area.rows = Math.min(8, Math.max(2, initial.split('\n').length + 1));
  const error = document.createElement('div');
  error.className = 'edit-error';
  const original = [...textEl.childNodes];
  textEl.replaceChildren(area, error);
  const finish = () => {
    textEl.replaceChildren(...original);
    done();
  };
  area.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      finish();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (area.value.trim().length === 0) {
        error.textContent = "// can't be empty — delete the line instead";
        return;
      }
      const text = area.value;
      finish();
      save(text);
    }
  });
  area.focus();
  return area;
}
