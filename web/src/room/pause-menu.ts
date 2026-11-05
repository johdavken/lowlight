/**
 * PAUSED (pause menu mockup 2026-10-30): Esc in the room with nothing else open. RESUME · SAVE · LOAD ·
 * SETTINGS · TITLE, ↑↓ and Enter or a click; Esc, RESUME or a click outside closes it. Picking a row closes
 * the menu and hands over: the room opens the SAVE card, LOAD, SYS or leaves. Nothing stops while it's up
 * (story time only moves with turns). Its keys go first while open (capture phase) and no further.
 */
import './pause-menu.css';

export type PauseRow = 'resume' | 'save' | 'load' | 'settings' | 'title';

const ROWS: { id: PauseRow; label: string; hint?: string }[] = [
  { id: 'resume', label: 'RESUME' },
  { id: 'save', label: 'SAVE', hint: 'ALT+S' },
  { id: 'load', label: 'LOAD' },
  { id: 'settings', label: 'SETTINGS', hint: 'SOUND · TEXT · MODEL' },
  { id: 'title', label: 'TITLE', hint: 'ALT+T' },
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export function openPauseMenu(
  host: HTMLElement,
  o: {
    /** The line along the bottom: where, when, who with. */
    where: string;
    onSave(): void;
    onLoad(): void;
    onSettings(): void;
    onTitle(): void;
    /** Called as soon as it closes, whatever closed it; `resumed` when that was RESUME, Esc or a click outside. */
    onClose?(resumed: boolean): void;
    /** Who SAVE waits on (her reply streaming), asked on open and again on SAVE; null: free. */
    saveBlockedBy?(): string | null;
    reducedMotion?: boolean;
  },
): { close(): void; readonly isOpen: boolean } {
  const root = el('div', 'pause-menu');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Paused');
  const panel = el('div', `pause-panel${o.reducedMotion ? '' : ' pause-glitch-in'}`);
  const head = el('div', 'pause-head');
  head.append(el('span', '', '// PAUSED'), el('span', 'pause-hint', '[ESC] RESUME'));
  const list = el('div', 'pause-rows');
  list.setAttribute('role', 'menu');
  const rows = ROWS.map((r) => {
    const n = el('button', 'pause-row');
    n.type = 'button';
    n.dataset.row = r.id;
    n.setAttribute('role', 'menuitem');
    n.append(el('span', '', r.label));
    if (r.hint) n.append(el('small', '', r.hint));
    n.addEventListener('click', (e) => {
      e.stopPropagation();
      pick(r.id);
    });
    n.addEventListener('mouseenter', () => setFocus(ROWS.indexOf(r)));
    list.append(n);
    return n;
  });
  panel.append(head, el('div', 'pause-title', 'PAUSED'), list, el('div', 'pause-where', o.where));
  root.append(panel);
  host.append(root);

  /** SAVE's row as it stands: WAIT FOR <NAME> while she replies. True when blocked. */
  const saveRow = rows[ROWS.findIndex((r) => r.id === 'save')];
  const showSaveBlock = (): boolean => {
    const who = o.saveBlockedBy?.() ?? null;
    saveRow.querySelector('small')!.textContent = who ? `WAIT FOR ${who.toUpperCase()}` : 'ALT+S';
    saveRow.classList.toggle('blocked', who !== null);
    return who !== null;
  };
  showSaveBlock();

  let focus = 0;
  let open = true;
  const setFocus = (i: number) => {
    focus = (i + ROWS.length) % ROWS.length;
    rows.forEach((r, k) => r.classList.toggle('on', k === focus));
  };
  setFocus(0);

  const close = (resumed = true) => {
    if (!open) return;
    open = false;
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    o.onClose?.(resumed);
  };
  const pick = (id: PauseRow) => {
    if (id === 'save' && showSaveBlock()) return;
    close(id === 'resume');
    if (id === 'save') o.onSave();
    else if (id === 'load') o.onLoad();
    else if (id === 'settings') o.onSettings();
    else if (id === 'title') o.onTitle();
  };
  const onKey = (e: KeyboardEvent) => {
    // Browser shortcuts (reload, devtools, zoom) still work.
    if (e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key)) return;
    // Every other key stops here while it's up: the prompt, the room's chrome keys and the Esc behind it wait.
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') setFocus(focus + 1);
    else if (e.key === 'ArrowUp') setFocus(focus - 1);
    else if (e.key === 'Enter' || e.key === ' ') pick(ROWS[focus].id);
  };
  window.addEventListener('keydown', onKey, true);
  // A click outside the panel resumes.
  root.addEventListener('click', (e) => {
    if (!panel.contains(e.target as Node)) close();
  });

  return {
    close: () => close(false),
    get isOpen() {
      return open;
    },
  };
}
