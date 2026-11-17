/**
 * PAUSED (pause menu mockup 2026-10-30; in the HUD trace 2026-11-15, pause-menu.css): Esc in the room with nothing else open. RESUME · SAVE · LOAD ·
 * SETTINGS · TITLE, ↑↓ and Enter or a click; Esc, RESUME or a click outside closes it. SAVE, LOAD and TITLE close
 * the menu and hand over: the room opens the SAVE card, LOAD or leaves. SETTINGS (2026-11-16) is a page of its own:
 * SYS opens inside the panel, grouped, on the same trace, and Esc goes back to the rows. Opened `on: 'settings'` (the
 * HUD's SYS word) it starts there; `settingsOnly` (SYS over a job table or a screen) has no rows, so Esc closes it.
 * Nothing stops while it's up (story time only moves with turns). Its keys go first while open (capture phase) and
 * no further; on SETTINGS, SYS's own listener (older, so ahead of this one) takes ↑↓ ← → Enter and Esc.
 */
import { setHints } from '../landing/hint-line';
import './pause-menu.css';

export type PauseRow = 'resume' | 'save' | 'load' | 'settings' | 'title';

const ROWS: { id: PauseRow; label: string; hint?: string }[] = [
  { id: 'resume', label: 'RESUME' },
  { id: 'save', label: 'SAVE', hint: 'ALT+S' },
  { id: 'load', label: 'LOAD' },
  { id: 'settings', label: 'SETTINGS', hint: 'SOUND · STAGE · MODEL' },
  { id: 'title', label: 'TITLE', hint: 'ALT+T' },
];

/** SYS as a page: the HUD's (hud.ts `settings`). */
export interface SettingsPage {
  open(host: HTMLElement): void;
  close(): void;
  watch(cb: (open: boolean) => void): () => void;
}

const KEYS_ROWS = '[↑↓] MOVE · [ENTER] PICK · [ESC] RESUME';
const KEYS_SETTINGS = '[↑↓] MOVE · [←→] CHANGE · [ENTER] PICK · [ESC] BACK';
const KEYS_SETTINGS_ONLY = '[↑↓] MOVE · [←→] CHANGE · [ENTER] PICK · [ESC] CLOSE';

/** How long it takes to step away when resumed (pause-menu.css `.pause-closing`). */
const CLOSE_MS = 200;

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
    /** SETTINGS: SYS, opened inside the panel. */
    settings: SettingsPage;
    /** Open on SETTINGS (the HUD's SYS word), not the rows. */
    on?: 'rows' | 'settings';
    /** SETTINGS alone (SYS over a job table or a screen): no rows, and Esc closes it. */
    settingsOnly?: boolean;
    onTitle(): void;
    /** Its sounds (picked 2026-11-16 on the Pause Sounds audition): the lit row moving, a row picked (SAVE, LOAD, SETTINGS), TITLE. */
    onCue?(n: 'row' | 'pick' | 'title'): void;
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
  const panel = el('div', 'pause-panel');
  const list = el('div', 'pause-rows');
  list.setAttribute('role', 'menu');
  const rows = ROWS.map((r) => {
    const n = el('button', 'pause-row');
    n.type = 'button';
    n.dataset.row = r.id;
    n.setAttribute('role', 'menuitem');
    // The lit row's hairline runs out to its hint.
    n.append(el('span', '', r.label), el('i', 'pause-line'));
    if (r.hint) n.append(el('small', '', r.hint));
    n.addEventListener('click', (e) => {
      e.stopPropagation();
      pick(r.id);
    });
    n.addEventListener('mouseenter', () => setFocus(ROWS.indexOf(r)));
    list.append(n);
    return n;
  });
  const keys = el('div', 'pause-keys');
  const title = el('div', 'pause-title', 'PAUSED');
  /** SYS goes in here on SETTINGS. */
  const page = el('div', 'pause-settings');
  page.hidden = true;
  panel.append(title, list, page, el('div', 'pause-where', o.where), keys);
  // Clicks in the panel stay in it: the HUD shuts SYS on a click anywhere outside it.
  panel.addEventListener('click', (e) => e.stopPropagation());
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
  let onSettings = false;
  /** The rows, or SETTINGS: the title, the key line and what shows. */
  const showPage = (settings: boolean) => {
    onSettings = settings;
    title.textContent = settings ? 'SETTINGS' : 'PAUSED';
    list.hidden = settings;
    page.hidden = !settings;
    panel.classList.toggle('on-settings', settings);
    setHints(keys, !settings ? KEYS_ROWS : o.settingsOnly ? KEYS_SETTINGS_ONLY : KEYS_SETTINGS);
  };
  // SYS shut (Esc, an Alt chord, MODEL handing over): back to the rows, or out if there are none.
  const unwatch = o.settings.watch((up) => {
    if (up || !open || !onSettings) return;
    if (o.settingsOnly) close();
    else {
      showPage(false);
      setFocus(ROWS.findIndex((r) => r.id === 'settings'));
    }
  });
  const setFocus = (i: number) => {
    focus = (i + ROWS.length) % ROWS.length;
    rows.forEach((r, k) => r.classList.toggle('on', k === focus));
  };
  setFocus(0);

  // While it draws off, Esc mustn't reach the room (it would pause again under it).
  const swallowEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const close = (resumed = true) => {
    if (!open) return;
    open = false;
    unwatch();
    window.removeEventListener('keydown', onKey, true);
    if (onSettings) o.settings.close();
    // Resumed, it steps away over the room (pause-menu.css `pause-closing`); a row hands over to its screen at once.
    const ms = resumed && !o.reducedMotion ? CLOSE_MS : 0;
    if (!ms) root.remove();
    else {
      root.classList.add('pause-closing');
      window.addEventListener('keydown', swallowEsc, true);
      setTimeout(() => {
        window.removeEventListener('keydown', swallowEsc, true);
        root.remove();
      }, ms);
    }
    o.onClose?.(resumed);
  };
  const openSettings = () => {
    showPage(true);
    o.settings.open(page);
  };
  const pick = (id: PauseRow) => {
    // RESUME has the close's own sound (the page's onClose); SAVE refused by her reply says why and stays quiet.
    if (id === 'title') o.onCue?.('title');
    else if (id !== 'resume' && !(id === 'save' && o.saveBlockedBy?.())) o.onCue?.('pick');
    if (id === 'settings') return openSettings();
    if (id === 'save' && showSaveBlock()) return;
    close(id === 'resume');
    if (id === 'save') o.onSave();
    else if (id === 'load') o.onLoad();
    else if (id === 'title') o.onTitle();
  };
  const onKey = (e: KeyboardEvent) => {
    // Browser shortcuts (reload, devtools, zoom) still work.
    if (e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key)) return;
    // Every other key stops here while it's up: the prompt, the room's chrome keys and the Esc behind it wait.
    e.preventDefault();
    e.stopImmediatePropagation();
    // On SETTINGS, SYS has had the keys it uses; the rest stop here.
    if (onSettings) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      o.onCue?.('row');
      setFocus(focus + (e.key === 'ArrowDown' ? 1 : -1));
    }
    else if (e.key === 'Enter' || e.key === ' ') pick(ROWS[focus].id);
  };
  window.addEventListener('keydown', onKey, true);
  // A click outside the panel resumes.
  // Only a press that started outside: the first click on SETTINGS turns the sound on, MUSIC, VOICE and AMBIENT
  // appear, the panel grows under the pointer, and that click would land outside it.
  let downOutside = false;
  root.addEventListener('pointerdown', (e) => (downOutside = !panel.contains(e.target as Node)));
  root.addEventListener('click', (e) => {
    if (downOutside && !panel.contains(e.target as Node)) close();
  });
  showPage(false);
  if (o.settingsOnly || o.on === 'settings') openSettings();

  return {
    close: () => close(false),
    get isOpen() {
      return open;
    },
  };
}
