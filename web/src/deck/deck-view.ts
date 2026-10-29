/** The deck's screens (spec 2026-10-23 §2, §6): the thread list and a thread, as plain DOM. */
import { photoIdOf } from '../../../shared/photos';
import { hhmmOf, minuteOfDay, weekdayOf, weekdayShort } from '../../../shared/clock';
import { forms, type Pronoun } from '../../../shared/pronoun';
import type { ChatMessage, DeckHeader, DeckReadOnly, DeckThread } from '../../../shared/types';

/** How long a press on a bubble opens its controls. */
const LONG_PRESS_MS = 450;
/** Story minutes between two texts that earn a time divider. */
const DIVIDER_GAP = 30;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** `FRI 02:09`. */
const stamp = (clock: number) => `${weekdayShort(weekdayOf(clock)).toUpperCase()} ${hhmmOf(minuteOfDay(clock))}`;

/** Her face, cut-corner framed in her accent; her initial when she has none. */
function face(t: DeckThread, cls: string): HTMLElement {
  const box = el('div', `dk-face ${cls}`);
  box.style.setProperty('--dk-accent', t.accent);
  if (t.portrait) {
    const img = el('img', 'dk-face-img');
    img.src = t.portrait;
    img.alt = '';
    box.append(img);
  } else box.textContent = t.name.charAt(0).toUpperCase();
  return box;
}

/** The bar on every screen: the network, then the weekday and story time and the weather; tapping the time passes time. */
function bar(header: Pick<DeckHeader, 'time' | 'weather'> | null, onPassTime?: () => void): HTMLElement {
  const b = el('div', 'dk-bar');
  b.append(el('span', 'dk-net', 'CORTEX//RELAY'));
  const right = [header?.time?.split('·').at(-1)?.trim(), header?.weather].filter(Boolean).join(' · ').toUpperCase();
  const clock = el('button', 'dk-now dk-clock', right || 'PASS TIME');
  clock.type = 'button';
  clock.title = 'Pass time';
  if (onPassTime) clock.addEventListener('click', () => onPassTime());
  b.append(clock);
  return b;
}

/** PASS TIME (the WAIT /solo has): a few steps, or until a time of day. */
export function renderPassTime(onWait: (b: { minutes: number } | { until: string }) => void, onClose: () => void): HTMLElement {
  const sheet = el('div', 'dk-sheet');
  const head = el('div', 'dk-sheet-head');
  const close = el('button', 'dk-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => onClose());
  head.append(el('span', 'dk-sheet-title', 'PASS TIME'), close);
  const steps = el('div', 'dk-steps');
  for (const [label, minutes] of [['+30 MIN', 30], ['+1 HOUR', 60], ['+4 HOURS', 240]] as const) {
    const b = el('button', 'dk-wait', label);
    b.type = 'button';
    b.addEventListener('click', () => onWait({ minutes }));
    steps.append(b);
  }
  const untilRow = el('div', 'dk-until-row');
  const until = el('input', 'dk-until');
  until.type = 'time';
  const go = el('button', 'dk-until-go', 'UNTIL');
  go.type = 'button';
  go.addEventListener('click', () => {
    if (/^\d{2}:\d{2}$/.test(until.value)) onWait({ until: until.value });
  });
  untilRow.append(until, go);
  sheet.append(head, steps, untilRow);
  return sheet;
}

/** The thread list: contacts in the order the server sends them (her first). */
export function renderThreads(threads: readonly DeckThread[], onOpen: (id: string) => void, header: Pick<DeckHeader, 'time' | 'weather'> | null = null, onPassTime?: () => void): HTMLElement {
  const root = el('div', 'dk-screen dk-list');
  root.append(bar(header, onPassTime), el('div', 'dk-title', 'MESSAGES'));
  const list = el('div', 'dk-rows');
  for (const t of threads) {
    const r = el('button', `dk-row${t.unread ? ' dk-new' : ''}`);
    r.type = 'button';
    const text = el('div', 'dk-rtext');
    const name = el('div', 'dk-rname', t.name.toUpperCase());
    name.style.color = t.accent;
    const last = el('div', `dk-rlast${t.last ? '' : ' dk-empty'}`, t.last ? (t.last.mine ? `you: ${t.last.text}` : t.last.text) : 'no messages yet');
    text.append(name, last);
    const side = el('div', 'dk-rside');
    side.append(el('div', 'dk-rtime', t.last ? stamp(t.last.clock) : ''));
    if (t.unread) side.append(el('span', 'dk-unread'));
    r.append(face(t, 'dk-rface'), text, side);
    r.addEventListener('click', () => onOpen(t.id));
    list.append(r);
  }
  if (threads.length === 0) list.append(el('div', 'dk-none', 'NO CONTACTS YET'));
  root.append(list);
  return root;
}

/** The rows with a `— FRI 02:09 —` divider before the first and wherever 30 story minutes pass. */
export function dividers(rows: readonly ChatMessage[]): (ChatMessage | { divider: string })[] {
  const out: (ChatMessage | { divider: string })[] = [];
  let prev: number | null = null;
  for (const m of rows) {
    if (m.clock !== undefined && (prev === null || m.clock - prev >= DIVIDER_GAP)) out.push({ divider: `— ${stamp(m.clock)} —` });
    if (m.clock !== undefined) prev = m.clock;
    out.push(m);
  }
  return out;
}

/** Why the input is gone: `SHE'S RIGHT HERE`, `THEY'RE RIGHT HERE`, `YOU'RE ON A CALL`. */
export function readOnlyText(r: Exclude<DeckReadOnly, null>, p: Pronoun): string {
  if (r === 'call') return "YOU'RE ON A CALL";
  const f = forms(p);
  return `${f.she}${f.is === 'are' ? "'re" : "'s"} right here`.toUpperCase();
}

export interface ThreadView {
  contact: DeckThread;
  header: DeckHeader;
  rows: readonly ChatMessage[];
  readOnly: DeckReadOnly;
  typing: boolean;
  /** Your texts not in the thread yet: waiting their turn, or (`failed`) not sent, to offer again. */
  pending: readonly { localId: string; text: string; failed?: string }[];
  onSend(text: string): void;
  onResend(localId: string): void;
  onRetry(messageId: string): void;
  onBack(): void;
  /** STEP OUT (with her) / HANG UP (on a call): leave, so you can text. */
  onStepOut?(): void;
  onPassTime?(): void;
  /** Long press / right-click on a bubble (deck controls spec §2): its row's id. */
  onMenu?(id: string): void;
  /** EDIT: your text back in the box. */
  editing?: { id: string; text: string } | null;
  onCancelEdit?(): void;
}

/** One thread: the header, the bubbles (hers split on lines), typing…, and the input or why there's none. */
export function renderThread(v: ThreadView): HTMLElement {
  const root = el('div', 'dk-screen dk-thread');
  root.style.setProperty('--dk-accent', v.contact.accent);
  const head = el('div', 'dk-head');
  const back = el('button', 'dk-back', '‹');
  back.type = 'button';
  back.setAttribute('aria-label', 'Back to messages');
  back.addEventListener('click', () => v.onBack());
  const who = el('div', 'dk-who');
  who.append(el('div', 'dk-name', v.contact.name.toUpperCase()), el('div', 'dk-where', [v.header.place, v.header.tail].filter(Boolean).join(' · ').toUpperCase()));
  head.append(back, face(v.contact, 'dk-hface'), who);
  root.append(bar(v.header, v.onPassTime), head);

  const msgs = el('div', 'dk-msgs');
  // When a long press last opened the menu: the tap that ends it doesn't also open a photo.
  let menuAt = 0;
  for (const x of dividers(v.rows)) {
    if ('divider' in x) {
      msgs.append(el('div', 'dk-divider', x.divider));
      continue;
    }
    if (x.role === 'user') {
      const b = el('div', 'dk-msg dk-me', x.text);
      b.dataset.id = x.id;
      msgs.append(b);
      if (x.status === 'failed') {
        const f = el('button', 'dk-retry');
        f.type = 'button';
        f.append(el('span', 'dk-failed', 'NOT DELIVERED · RETRY'));
        f.addEventListener('click', () => v.onRetry(x.id));
        msgs.append(f);
      }
    } else if (x.status === 'ok') {
      for (const line of x.text.split('\n').filter((l) => l.trim() !== '')) {
        const photo = photoIdOf(line);
        const b = photo ? photoBubble(v.contact.id, photo, () => Date.now() - menuAt < 800) : el('div', 'dk-msg dk-her', line);
        b.dataset.id = x.id;
        msgs.append(b);
      }
    }
  }
  for (const p of v.pending) {
    msgs.append(el('div', `dk-msg dk-me${p.failed ? '' : ' dk-pending'}`, p.text));
    if (p.failed) {
      const b = el('button', 'dk-resend', 'NOT SENT · RETRY');
      b.type = 'button';
      b.title = p.failed;
      b.addEventListener('click', () => v.onResend(p.localId));
      msgs.append(b);
    }
  }
  if (v.typing) msgs.append(el('div', 'dk-msg dk-her dk-typing', 'typing…'));
  root.append(msgs);
  // A long press (or a right-click) on a bubble opens its controls (deck controls spec §2).
  if (v.onMenu) {
    const bubbleOf = (t: EventTarget | null) => (t instanceof HTMLElement ? t.closest<HTMLElement>('.dk-msg[data-id]') : null);
    let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
    // Android Chrome follows a long press with its own contextmenu: one open, not two (final review #7).
    let openedAt = 0;
    const open = (id: string) => {
      if (Date.now() - openedAt < 800) return;
      openedAt = Date.now();
      menuAt = openedAt;
      v.onMenu!(id);
    };
    const cancel = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };
    msgs.addEventListener('contextmenu', (e) => {
      const b = bubbleOf(e.target);
      if (!b) return;
      e.preventDefault();
      cancel();
      open(b.dataset.id!);
    });
    msgs.addEventListener('pointerdown', (e) => {
      const b = bubbleOf(e.target);
      if (!b) return;
      cancel();
      press = { timer: setTimeout(() => ((press = null), open(b.dataset.id!)), LONG_PRESS_MS), x: e.clientX, y: e.clientY };
    });
    msgs.addEventListener('pointermove', (e) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancel();
    });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) msgs.addEventListener(t, cancel);
  }

  if (v.readOnly) {
    const foot = el('div', 'dk-readonly');
    const leave = el('button', 'dk-stepout', v.readOnly === 'call' ? 'HANG UP' : 'STEP OUT');
    leave.type = 'button';
    leave.disabled = v.typing;
    leave.addEventListener('click', () => v.onStepOut?.());
    foot.append(el('span', 'dk-ro-why', readOnlyText(v.readOnly, v.contact.pronoun)), leave);
    root.append(foot);
  } else {
    if (v.editing) {
      const strip = el('div', 'dk-editing', 'EDITING · ');
      const stop = el('button', '', 'CANCEL');
      stop.type = 'button';
      stop.addEventListener('click', () => v.onCancelEdit?.());
      strip.append(stop);
      root.append(strip);
    }
    const input = el('form', 'dk-input');
    const box = el('textarea', 'dk-box');
    if (v.editing) box.value = v.editing.text;
    box.rows = 1;
    box.maxLength = 500;
    box.placeholder = `text ${v.contact.name.toLowerCase()}…`;
    const send = el('button', 'dk-send', 'SEND');
    send.type = 'submit';
    const go = () => {
      const text = box.value.trim();
      if (text === '') return;
      v.onSend(text);
      box.value = '';
    };
    input.addEventListener('submit', (e) => {
      e.preventDefault();
      go();
    });
    send.addEventListener('click', (e) => {
      e.preventDefault();
      go();
    });
    input.append(box, send);
    root.append(input);
  }
  return root;
}

/**
 * Brings `cur` (on screen) up to `next` without touching its text box (final review I1): the draft, the focus and
 * the phone's keyboard stay. When one has the box and the other doesn't (read-only came or went), it's swapped whole.
 */
export function patchThread(cur: HTMLElement, next: HTMLElement): void {
  const keep = cur.querySelector(':scope > .dk-input');
  const fresh = next.querySelector(':scope > .dk-input');
  cur.style.cssText = next.style.cssText;
  if (!keep || !fresh) {
    cur.replaceChildren(...next.childNodes);
    return;
  }
  for (const child of [...cur.children]) if (child !== keep) child.remove();
  for (const child of [...next.children]) if (child !== fresh) cur.insertBefore(child, keep);
}

/** A deck_error in words, in the contact's pronoun (deck minor M3: a key or credit problem shows on the deck). */
export function deckErrorText(code: string, p: Pronoun): string {
  const hers = forms(p).hers.toUpperCase();
  switch (code) {
    case 'auth':
      return `${hers} KEY WAS REJECTED · RELINK AT SELECT`;
    case 'credit':
      return `NO CREDIT ON ${hers} KEY`;
    case 'busy':
    case 'unreachable':
      return 'NO SIGNAL · TRY AGAIN';
    case 'with-them':
      return "YOU'RE WITH THEM";
    case 'save-changed':
      return 'THE SAVE CHANGED · NOT SENT';
    case 'too-long':
      return 'TOO LONG';
    case 'unknown':
      return 'NOT IN YOUR CONTACTS';
    case 'not-latest':
      return 'ONLY HER LATEST TEXT';
    case 'unknown message':
      return 'THAT TEXT IS GONE';
    default:
      return 'NOT DELIVERED';
  }
}

export type MenuItem = 'regen' | 'swipe' | 'edit' | 'delete';

/** What a bubble's menu offers (deck controls spec §2): REGEN and swipes on her latest reply, EDIT on your latest text, DELETE on any. */
export function menuItems(rows: readonly ChatMessage[], id: string): MenuItem[] {
  const shown = rows.filter((m) => !m.promised);
  const row = shown.find((m) => m.id === id);
  if (!row) return [];
  const latest = shown.at(-1);
  const items: MenuItem[] = [];
  if (row.role === 'agent' && row.id === latest?.id && row.status === 'ok') {
    items.push('regen');
    if ((row.takes?.count ?? 1) > 1) items.push('swipe');
  }
  if (row.role === 'user' && latest?.role === 'agent' && latest.replyTo === row.id) items.push('edit');
  items.push('delete');
  return items;
}

/** How many texts after this one a DELETE takes with it. */
export function laterCount(rows: readonly ChatMessage[], id: string): number {
  const shown = rows.filter((m) => !m.promised);
  const at = shown.findIndex((m) => m.id === id);
  return at < 0 ? 0 : shown.length - at - 1;
}

/** A bubble's controls, over the thread. DELETE asks first, with how many texts go with it. */
export function renderMenu(o: {
  items: readonly MenuItem[];
  takes?: { index: number; count: number } | null;
  later: number;
  onRegen(): void;
  onSwipe(index: number): void;
  onEdit(): void;
  onDelete(): void;
  onClose(): void;
}): HTMLElement {
  const menu = el('div', 'dk-menu');
  const btn = (cls: string, label: string, fn: () => void) => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const row = el('div', 'dk-menu-row');
  if (o.items.includes('swipe') && o.takes) {
    const t = o.takes;
    const prev = btn('dk-prev', '‹', () => o.onSwipe(Math.max(0, t.index - 1)));
    prev.disabled = t.index === 0;
    const next = btn('dk-next', '›', () => o.onSwipe(Math.min(t.count - 1, t.index + 1)));
    next.disabled = t.index === t.count - 1;
    row.append(prev, el('span', 'dk-takes', `${t.index + 1}/${t.count}`), next);
  }
  if (o.items.includes('regen')) row.append(btn('dk-m-regen', 'REGEN', o.onRegen));
  if (o.items.includes('edit')) row.append(btn('dk-m-edit', 'EDIT', o.onEdit));
  if (o.items.includes('delete'))
    row.append(
      btn('dk-m-delete', 'DELETE', () => {
        const confirm = el('div', 'dk-confirm', o.later > 0 ? `DELETE THIS AND ${o.later} AFTER?` : 'DELETE THIS?');
        confirm.append(btn('dk-yes', 'YES', o.onDelete), btn('dk-no', 'NO', o.onClose));
        row.replaceWith(confirm);
      }),
    );
  row.append(btn('dk-close', '×', o.onClose));
  menu.append(row);
  return menu;
}

/** How long the Cortex Global boot screen stays before it fades to the deck. */
export const BOOT_MS = 1200;
const BOOT_FADE_MS = 250;

/** The network's boot screen when the deck opens: the Cortex Global logo, a scan line, the network line. A tap skips it. */
export function renderBoot(onDone: () => void): HTMLElement {
  const boot = el('div', 'dk-boot');
  const logo = el('img', 'dk-boot-logo');
  logo.src = '/deck/cortex-global.webp';
  logo.alt = 'Cortex Global';
  boot.append(logo, el('div', 'dk-boot-scan'), el('div', 'dk-boot-line', 'CORTEX RELAY · A CORTEX GLOBAL NETWORK'));
  let gone = false;
  const finish = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    boot.classList.add('dk-boot-out');
    setTimeout(() => {
      boot.remove();
      onDone();
    }, BOOT_FADE_MS);
  };
  const timer = setTimeout(finish, BOOT_MS);
  boot.addEventListener('click', finish);
  return boot;
}

/** Her photo in a text (photos spec §5): a picture in her accent's frame; a tap opens it full screen; PHOTO UNAVAILABLE once it's gone from her pool. */
function photoBubble(contact: string, id: string, justPressed: () => boolean): HTMLElement {
  const b = el('div', 'dk-msg dk-her dk-photo-msg');
  const frame = el('div', 'dk-photo');
  const src = `/api/agents/${encodeURIComponent(contact)}/photo/${encodeURIComponent(id)}`;
  const img = el('img', 'dk-photo-img');
  img.src = src;
  img.alt = 'photo';
  img.loading = 'lazy';
  img.addEventListener('error', () => frame.replaceWith(el('div', 'dk-photo-gone', 'PHOTO UNAVAILABLE')), { once: true });
  // It has no height until it loads: a thread that sat at the bottom stays there as it grows (final review I3).
  img.addEventListener(
    'load',
    () => {
      const msgs = b.closest<HTMLElement>('.dk-msgs');
      if (msgs && msgs.scrollTop + msgs.clientHeight >= msgs.scrollHeight - img.offsetHeight - 40) msgs.scrollTop = msgs.scrollHeight;
    },
    { once: true },
  );
  frame.append(img);
  frame.addEventListener('click', () => {
    if (justPressed() || !frame.isConnected) return;
    const viewer = el('div', 'dk-viewer');
    const big = el('img', 'dk-viewer-img');
    big.src = src;
    big.alt = 'photo';
    viewer.append(big);
    viewer.addEventListener('click', () => viewer.remove());
    document.body.append(viewer);
  });
  b.append(frame);
  return b;
}
