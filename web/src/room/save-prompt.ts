/**
 * The room's SAVE card (spec 2026-10-07 §6; restyled 2026-10-18, PEOPLE spec §3): the room's picture, the line
 * LOAD will show (place · time · who's with you), and a name field prefilled with the automatic name. Enter
 * saves, Esc cancels; a refused save keeps it open with the reason inline.
 */

import { ApiError } from '../net/playthroughs';
import { onClickAway } from '../ui/click-away';
import './save-card.css';

/** What the card shows of the moment being saved. */
export interface SaveSnapshot {
  /** The room's art (null: none). */
  picture: string | null;
  place: string;
  time: string | null;
  withName: string;
  withAccent: string;
}

const NAME_MAX = 80; // the server's limit on a save's name

/**
 * What a failed save does: no playthrough any more (or not this one) → leave for the title; busy → the room's
 * "Wait for <Contact> to finish" notice (the prompt closes); anything else stays in the prompt.
 */
export function saveFailure(
  err: unknown,
  waitFor: (contact: string | undefined) => string,
): { leave: string } | { notice: string } | { inline: string } {
  // The playthrough this room was in is gone or another is active now: the title sorts it out.
  if (err instanceof ApiError && (err.error === 'no-playthrough' || err.error === 'not-active')) return { leave: '/' };
  if (err instanceof ApiError && err.error === 'busy') return { notice: waitFor(err.contact) };
  if (err instanceof ApiError && err.error === 'bad-name') return { inline: `// NAME IT — 1 TO ${NAME_MAX} CHARACTERS` };
  const why = err instanceof ApiError ? err.error : err instanceof Error ? err.message : String(err);
  return { inline: `// COULDN'T SAVE — ${why}` };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  n.textContent = text;
  return n;
}

export function openSavePrompt(
  host: HTMLElement,
  o: {
    defaultName: string;
    /** Saves under `name`; resolving closes the prompt, rejecting shows the error's message inline. */
    save(name: string): Promise<void>;
    /** Called once the prompt is gone (saved or cancelled). */
    onClose?(): void;
    snapshot?: SaveSnapshot;
    reducedMotion?: boolean;
  },
): void {
  const box = el('div', 'save-card');
  if (!o.reducedMotion) box.classList.add('sc-glitch-in');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Save');
  const field = el('input', 'sc-field');
  field.type = 'text';
  field.maxLength = NAME_MAX;
  field.value = o.defaultName;
  field.setAttribute('aria-label', 'Save name');
  const error = el('div', 'error');
  const body = el('div', 'sc-body');
  const s = o.snapshot;
  if (s?.picture) {
    const pic = el('img', 'sc-picture');
    pic.alt = '';
    pic.src = s.picture;
    pic.addEventListener('error', () => pic.remove(), { once: true });
    box.append(pic);
  }
  if (s) {
    const line = el('div', 'sc-line', `${[s.place, s.time].filter(Boolean).join(' · ').toUpperCase()} · `);
    const who = el('span', 'sc-with', `WITH ${s.withName.toUpperCase()}`);
    who.style.color = s.withAccent;
    line.append(who);
    body.append(line);
  }
  body.append(el('div', 'sc-title', 'SAVE'), field, error, el('div', 'sc-hint', '[ENTER] SAVE · [ESC] CANCEL'));
  box.append(body, el('div', 'sc-scan'));
  host.append(box);
  field.focus();
  field.select();

  let saving = false;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    window.removeEventListener('keydown', onEsc, true);
    offClickAway();
    box.remove();
    o.onClose?.();
  };
  // Esc cancels wherever focus is (a click can take it off the field), and goes no further.
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (!saving) close();
  };
  window.addEventListener('keydown', onEsc, true);
  // A click away cancels, as Esc does (not while the save is on its way).
  const offClickAway = onClickAway(
    (n) => box.contains(n),
    () => {
      if (!saving) close();
    },
  );

  field.addEventListener('keydown', (e) => {
    // Nothing typed here reaches the room (its chat prompt, page turns, Esc back to the dial-in).
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (saving) return;
      saving = true;
      error.textContent = '';
      o.save(field.value).then(close, (err: unknown) => {
        saving = false;
        error.textContent = err instanceof Error ? err.message : String(err);
        field.focus();
      });
    }
  });
}
