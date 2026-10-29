/**
 * The chat box's corner stacks (spec 2026-10-16 subtitle chat box §7): glyphs or labels
 * (SYS → CHAT KEYS) and which stacks are folded, kept per browser like TEXT SIZE.
 */
export type ChatKeys = 'glyphs' | 'labels';
export type FoldSide = 'line' | 'scene';

const KEYS_KEY = 'lowlight.chatKeys';
const FOLD_KEY = 'lowlight.chatFold';

/** The saved choice; glyphs when none is saved, it isn't one, or storage is off. */
export function loadChatKeys(): ChatKeys {
  try {
    return localStorage.getItem(KEYS_KEY) === 'labels' ? 'labels' : 'glyphs';
  } catch {
    return 'glyphs';
  }
}

export function saveChatKeys(k: ChatKeys): void {
  try {
    localStorage.setItem(KEYS_KEY, k);
  } catch {
    // Storage off: the choice holds for this page only.
  }
}

/** `keys-glyphs` or `keys-labels` on `root` (the game stage): the stacks' CSS reads it. */
export function applyChatKeys(root: HTMLElement, k: ChatKeys): void {
  root.classList.toggle('keys-glyphs', k === 'glyphs');
  root.classList.toggle('keys-labels', k === 'labels');
}

/** Which stacks are folded; anything but a saved `true` reads as open. */
export function loadFold(): Record<FoldSide, boolean> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}');
    const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
    return { line: o.line === true, scene: o.scene === true };
  } catch {
    return { line: false, scene: false };
  }
}

export function saveFold(f: Record<FoldSide, boolean>): void {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify(f));
  } catch {
    // Storage off: the fold holds for this page only.
  }
}

const WHAT: Record<FoldSide, string> = { line: 'the line options', scene: 'the scene actions' };

/**
 * The arrow at the corner end of a stack: a click folds `stack` to just the arrow (`.folded`; the
 * arrow turns over in CSS) or opens it again, and the choice is saved. The saved fold applies at once.
 */
export function foldArrow(stack: HTMLElement, side: FoldSide): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fold';
  b.dataset.side = side;
  const arw = document.createElement('span');
  arw.className = 'arw';
  arw.textContent = side === 'line' ? '◂' : '▸';
  b.append(arw);
  const apply = (folded: boolean) => {
    stack.classList.toggle('folded', folded);
    b.setAttribute('aria-expanded', String(!folded));
    b.title = `${folded ? 'Show' : 'Hide'} ${WHAT[side]}`;
    b.setAttribute('aria-label', b.title);
  };
  apply(loadFold()[side]);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const folded = !stack.classList.contains('folded');
    apply(folded);
    saveFold({ ...loadFold(), [side]: folded });
  });
  return b;
}
