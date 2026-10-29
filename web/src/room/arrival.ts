/**
 * The arrival screen (spec 2026-10-27), in the district load screen's place: you see it every time
 * you arrive. A 1600×900 stage on the game stage, the district's art left, the place right.
 * - `opening`: a new game's first room; the box takes how the scene opens, ENTER sends it with the greeting.
 * - `travel`: GO on the map; the box takes your line on the way, GO moves you, BACK leaves all as it was.
 * - `resume`: CONTINUE or LOAD; no box, ENTER once the room is up.
 * A page-load screen starts with no mode (no box, no ENTER) until the history says which it is.
 * View only: the room tells it the district, the clock and when it's ready, and listens for send/back/close.
 */
import './arrival.css';
import { formatClock } from '../../../shared/clock';
import type { DistrictInfo } from '../../../shared/districts';
import { TRAVEL_LINE_MAX } from '../../../shared/arrival';
import { SCENE_TEXT_MAX } from '../../../shared/scenario';
import { STAGE_H, STAGE_W } from '../landing/stage';

export type ArrivalMode = 'opening' | 'travel' | 'resume';
export type IntroState = 'waiting' | 'filling' | 'ready' | 'closed';

/** Where GO is about to take you. */
export interface ArrivalTravel {
  sceneId: string;
  /** The place's name on the map. */
  to: string;
  /** Where you are now, by its map name (null off the map). */
  from: string | null;
  comms: boolean;
}

export interface Arrival {
  readonly open: boolean;
  /**
   * Page-load screens start with no mode (no box, ENTER hidden); history decides. Only the first call counts,
   * except that a late opening still replaces the 4 s fallback resume while it's up (nothing pressed yet).
   */
  setMode(mode: 'opening' | 'resume'): void;
  /** The room's scene id (the server finds its district) and name; only the first call counts. No scene closes the screen. */
  setScene(sceneId: string | undefined, roomName: string): void;
  setClock(m: number | null): void;
  /** Who comes with you ("NIX COMES WITH YOU", "NIX ON THE LINE"); null: nobody. */
  setWith(line: string | null): void;
  /** The room behind has loaded (on travel: the room you GO to). */
  ready(): void;
  /** Closes it now. */
  close(): void;
  /** A refusal of GO, shown above the keys; GO can be pressed again and the box keeps its text. */
  notice(text: string): void;
  /** The box's text right now, trimmed ('' when empty or there's no box). */
  text(): string;
  /** ENTER (opening) or GO (travel), with text(). Opening closes after; travel stays up until ready(). */
  onSend(cb: (text: string) => void): void;
  /** BACK (travel): the screen has already closed. */
  onBack(cb: () => void): void;
  /** Fires once, when it closes or gives up; at once if it already has. */
  onClose(cb: () => void): void;
  state(): IntroState;
}

/** The district a room is in (GET /api/districts?scene=); null for anything but a 200 with JSON. */
export async function fetchDistrict(sceneId: string): Promise<DistrictInfo | null> {
  try {
    const res = await fetch(`/api/districts?scene=${encodeURIComponent(sceneId)}`);
    return res.ok ? ((await res.json()) as DistrictInfo) : null;
  } catch {
    return null;
  }
}

const TICK_MS = 50;
const FADE_MS = 300;
/** The bar stops here until the room says it's ready. */
const HOLD = 0.9;
/** How long a ready page-load screen waits for the history to say opening or resume. */
const MODE_FALLBACK_MS = 4000;

const RULE: Record<ArrivalMode | 'none', string> = { none: 'NOW ENTERING', opening: 'OPENING AT', travel: 'HEADING TO', resume: 'BACK AT' };
const LABEL = { opening: 'HOW IT OPENS', travel: 'WHAT YOU SAY ON THE WAY' } as const;
const HINT = {
  opening: 'Leave it empty and she greets you as she would. Typed words steer SUGGEST.',
  travel: 'Leave it empty and you just go. Typed words steer SUGGEST.',
} as const;
const DRAFTING = 'SUGGEST IS DRAFTING';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** A paragraph's first sentence (the whole paragraph when it has no stop). */
const firstSentence = (lore: string): string => {
  const para = lore.split(/\n\s*\n/).map((s) => s.trim()).find(Boolean) ?? '';
  return /^[\s\S]*?[.!?…](?=\s|$)/.exec(para)?.[0] ?? para;
};

export function createArrival(
  host: HTMLElement,
  o: {
    reducedMotion: boolean;
    fetchDistrict: (sceneId: string) => Promise<DistrictInfo | null>;
    /** SUGGEST: resolves with the draft or rejects with Error(copy). Absent: no SUGGEST key. */
    suggest?: (steer: string | null) => Promise<string>;
    /** Present: this is a travel screen. */
    travel?: ArrivalTravel;
    /** Travel: the italic line she'll read. */
    moveLine?: string;
    /** Travel: start loading the destination's art while you type. */
    preload?: (sceneId: string) => void;
    minMs?: number;
    giveUpMs?: number;
    /** A room that never says it's ready still finishes this long after the district arrives. */
    stuckMs?: number;
    /** True while a panel above the screen (the bug report) owns the keyboard: keys pass through. */
    paused?: () => boolean;
    artUrl?: (id: string) => string;
  },
): Arrival {
  const travel = o.travel ?? null;
  const minMs = o.minMs ?? 1500;
  const artUrl = o.artUrl ?? ((id: string) => `/api/district-art/${encodeURIComponent(id)}`);
  let mode: ArrivalMode | null = travel ? 'travel' : null;
  let state: IntroState = 'waiting';
  let sceneSet = false;
  let roomReady = false;
  let startedAt = 0;
  let roomName = '';
  let clock: number | null = null;
  let info: DistrictInfo | null = null;
  /** Travel: GO was pressed and no notice has answered it yet. */
  let sending = false;
  let drafting = false;
  /** What ENTER or GO sent: the greeting reads it, so a close that wasn't ENTER sends nothing (review I3). */
  let sentText = '';
  /** A page-load screen with no mode this long after it's ready resumes, so the room is never stuck behind it. */
  let modeFallback: ReturnType<typeof setTimeout> | null = null;
  /** The resume is the fallback's, not the history's: a late history that says opening still wins. */
  let guessed = false;
  /** Travel: a move that never lands still steps aside (as a room that never says ready does). */
  let moveStuck: ReturnType<typeof setTimeout> | null = null;
  const closers: (() => void)[] = [];
  const senders: ((text: string) => void)[] = [];
  const backers: (() => void)[] = [];

  const root = el('div', 'ar-root');
  const stage = el('div', 'ar-stage');
  stage.style.width = `${STAGE_W}px`;
  stage.style.height = `${STAGE_H}px`;
  const file = el('div', 'ar-file');
  const rule = el('div', 'ar-rule', RULE[mode ?? 'none']);
  const name = el('div', 'ar-name');
  const sub = el('div', 'ar-sub');
  const loreLine = el('div', 'ar-lore-line');
  const route = el('div', 'ar-route');
  const meta = el('div', 'ar-meta');
  const withLine = el('div', 'ar-with');
  withLine.hidden = true;
  const lore = el('div', 'ar-lore');
  const move = el('div', 'ar-move');
  const notice = el('div', 'ar-notice');
  const bar = el('div', 'ar-bar');
  const fill = el('i', '');
  fill.style.width = '0%';
  bar.append(fill);
  const keys = el('div', 'ar-keys');
  const go = el('button', 'ar-go');
  go.type = 'button';
  file.append(rule, name, sub, loreLine, route, meta, withLine, lore, move, notice, bar, keys);
  stage.append(file);
  root.append(stage);
  host.append(root);
  // Nothing under the screen keeps focus (Ctrl+V would paste into the chat prompt); it gets it back on close.
  const hadFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  hadFocus?.blur();

  /** The box and its parts, once the mode has one. */
  let box: { area: HTMLTextAreaElement; label: HTMLElement; fail: HTMLElement; suggest: HTMLButtonElement | null; back: HTMLButtonElement | null } | null = null;
  /** Focus the box, unless a panel above (the bug report) owns the keyboard (review M5). */
  const focusBox = () => {
    if (box && !o.paused?.()) box.area.focus();
  };

  function buildBox(m: 'opening' | 'travel'): void {
    const wrap = el('div', 'ar-box');
    const label = el('span', '', LABEL[m]);
    const head = el('div', 'ar-label');
    head.append(label, el('span', 'ar-optional', 'OPTIONAL'));
    const area = el('textarea', 'ar-area');
    area.maxLength = m === 'opening' ? SCENE_TEXT_MAX : TRAVEL_LINE_MAX;
    area.rows = 3;
    area.spellcheck = true;
    area.addEventListener('input', () => {
      notice.textContent = '';
      fail.textContent = '';
    });
    const fail = el('div', 'ar-fail');
    wrap.append(head, area, el('div', 'ar-hint', HINT[m]), fail);
    notice.before(wrap);
    let suggest: HTMLButtonElement | null = null;
    if (o.suggest) {
      suggest = el('button', 'ar-suggest', 'SUGGEST');
      suggest.type = 'button';
      suggest.append(el('small', '', 'ALT+G'));
      suggest.addEventListener('click', (e) => {
        e.stopPropagation();
        draftNow();
      });
      keys.append(suggest);
    }
    let back: HTMLButtonElement | null = null;
    if (m === 'travel') {
      back = el('button', 'ar-back', 'BACK');
      back.type = 'button';
      back.append(el('small', '', 'ESC'));
      back.addEventListener('click', (e) => {
        e.stopPropagation();
        goBack();
      });
      keys.append(back);
    }
    box = { area, label, fail, suggest, back };
    focusBox();
  }

  function showGo(): void {
    go.replaceChildren();
    if (mode === 'travel') go.append('GO', el('small', '', '↵'));
    else if (mode === 'opening') go.append('ENTER', el('small', '', '↵'));
    else go.textContent = '[ ENTER TO CONTINUE ]';
    go.classList.toggle('ar-go-key', mode === 'opening' || mode === 'travel');
    go.hidden = mode === null || (mode !== 'travel' && state !== 'ready');
    // Always last: SUGGEST, BACK, then GO or ENTER at the right (review I1).
    keys.append(go);
  }
  go.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mode === 'resume') {
      if (state === 'ready') close();
    } else send();
  });

  function showPlace(): void {
    name.textContent = roomName.toUpperCase();
    meta.textContent = clock === null ? '' : formatClock(clock).toUpperCase();
  }

  function showLore(): void {
    lore.replaceChildren();
    loreLine.textContent = '';
    if (!info) return;
    if (mode === 'opening' || mode === 'travel') loreLine.textContent = firstSentence(info.lore);
    else for (const para of info.lore.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)) lore.append(el('p', '', para));
  }

  const stuckMs = o.stuckMs ?? 20000;
  const tick = () => {
    if (state !== 'filling') return;
    if (Date.now() - startedAt >= stuckMs) roomReady = true;
    const progress = Math.min((Date.now() - startedAt) / minMs, roomReady ? 1 : HOLD);
    fill.style.width = `${Math.round(progress * 1000) / 10}%`;
    if (progress >= 1) {
      state = 'ready';
      showGo();
      if (mode === null && !modeFallback)
        modeFallback = setTimeout(() => {
          setMode('resume');
          guessed = mode === 'resume';
        }, MODE_FALLBACK_MS);
    }
  };
  const timer = travel ? null : setInterval(tick, TICK_MS);
  const giveUp = travel
    ? null
    : setTimeout(() => {
        // An opening keeps its box: no district in time fills in with none (review I4).
        if (state === 'waiting') (mode === 'opening' ? fillIn(null) : close());
      }, o.giveUpMs ?? 8000);

  function close(): void {
    if (state === 'closed') return;
    state = 'closed';
    if (timer) clearInterval(timer);
    if (giveUp) clearTimeout(giveUp);
    if (modeFallback) clearTimeout(modeFallback);
    if (moveStuck) clearTimeout(moveStuck);
    window.removeEventListener('keydown', onKey, { capture: true });
    if (document.activeElement instanceof HTMLElement && root.contains(document.activeElement)) document.activeElement.blur();
    if (o.reducedMotion) root.remove();
    else {
      root.classList.add('ar-out');
      setTimeout(() => root.remove(), FADE_MS);
    }
    if (hadFocus?.isConnected && (document.activeElement === null || document.activeElement === document.body)) hadFocus.focus();
    for (const cb of closers.splice(0)) cb();
  }

  const typed = () => box?.area.value.trim() ?? '';
  const text = () => sentText;

  /** ENTER (opening, once the room is up) or GO (travel, once until a notice). */
  function send(): void {
    if (state === 'closed') return;
    if (mode === 'opening') {
      if (state !== 'ready') return;
      sentText = typed();
      for (const cb of senders) cb(sentText);
      close();
    } else if (mode === 'travel') {
      if (sending) return;
      sending = true;
      notice.textContent = '';
      root.classList.add('ar-moving');
      fill.style.width = `${HOLD * 100}%`;
      // The move is on its way: BACK can't take it back, and a late draft mustn't land (review I2).
      if (box?.back) box.back.disabled = true;
      if (box?.suggest) box.suggest.disabled = true;
      sentText = typed();
      moveStuck = setTimeout(close, o.stuckMs ?? 20000);
      for (const cb of senders) cb(sentText);
    }
  }

  function goBack(): void {
    if (mode !== 'travel' || state === 'closed' || sending) return;
    close();
    for (const cb of backers) cb();
  }

  function draftNow(): void {
    if (!o.suggest || !box || drafting || sending || state === 'closed') return;
    const b = box;
    drafting = true;
    b.label.textContent = DRAFTING;
    b.label.classList.add('ar-drafting');
    if (b.suggest) b.suggest.disabled = true;
    b.fail.textContent = '';
    const done = () => {
      drafting = false;
      b.label.textContent = LABEL[mode === 'travel' ? 'travel' : 'opening'];
      b.label.classList.remove('ar-drafting');
      if (b.suggest) b.suggest.disabled = sending;
    };
    o.suggest(b.area.value.trim() || null).then(
      (draft) => {
        done();
        if (state === 'closed') return;
        b.area.value = draft;
        focusBox();
      },
      (err: unknown) => {
        done();
        b.fail.textContent = err instanceof Error ? err.message : String(err);
      },
    );
  }

  function onKey(e: KeyboardEvent): void {
    if (state === 'closed') return;
    if (o.paused?.()) return;
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    // In the box: it types (Ctrl+V pastes, Shift+Enter breaks a line), and nothing under the screen hears it.
    if (box && e.target === box.area) {
      e.stopImmediatePropagation();
      // Safari confirms a composition with an Enter that isn't marked composing, only keyCode 229 (review M7).
      if (e.key === 'Enter' && plain && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        if (!e.repeat) send();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        goBack();
      } else if (e.altKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        draftNow();
      }
      return;
    }
    // Browser shortcuts (Ctrl/Cmd, the F keys) keep working, except into a field under the screen
    // (Ctrl+V, Ctrl+Backspace) or Ctrl/Cmd+Enter, which would send the chat prompt.
    const t = e.target;
    const intoField = t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement);
    if ((e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key)) && e.key !== 'Enter' && !intoField) return;
    // Nothing else below the screen sees a key while it's up: not the chat prompt, not the room's
    // own window listeners registered after this one. The audio unlock is registered before it
    // (startRoom creates this screen right after), so the key that closes it still unlocks sound.
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.repeat) return;
    if (e.key === 'Escape') return goBack();
    if (e.altKey && (e.key === 'g' || e.key === 'G')) return draftNow();
    if (!plain) return;
    if (mode === 'opening' || mode === 'travel') {
      if (e.key === 'Enter') send();
      return;
    }
    if (mode === 'resume' && (e.key === 'Enter' || e.key === ' ') && state === 'ready') close();
  }
  window.addEventListener('keydown', onKey, { capture: true });
  root.addEventListener('click', () => {
    if (mode === 'resume' && state === 'ready') close();
  });
  // A click anywhere but a key puts the caret back in the box, so typing never goes nowhere (review M6).
  root.addEventListener('mousedown', (e) => {
    if (!box || state === 'closed' || (e.target instanceof Element && e.target.closest('button, textarea'))) return;
    e.preventDefault();
    focusBox();
  });

  function fillIn(d: DistrictInfo | null): void {
    if (state !== 'waiting') return;
    info = d;
    if (d?.hasArt) {
      const img = el('img', 'ar-art');
      img.alt = '';
      img.addEventListener('error', () => {
        img.remove();
        root.classList.add('ar-no-art');
      });
      img.src = artUrl(d.id);
      stage.prepend(img, el('div', 'ar-fade'));
    } else root.classList.add('ar-no-art');
    sub.textContent = d ? [d.name.toUpperCase(), d.subtitle].filter(Boolean).join(' · ') : '';
    showLore();
    if (travel) {
      state = 'ready';
      return;
    }
    state = 'filling';
    startedAt = Date.now();
    tick();
  }

  function setScene(sceneId: string | undefined, nameOf: string): void {
    if (sceneSet || state === 'closed') return;
    sceneSet = true;
    roomName = nameOf;
    showPlace();
    if (!sceneId) return close();
    // No district (or no answer) still shows where you are, with no art: an opening keeps its box (review I4).
    void o.fetchDistrict(sceneId).then(
      (d) => fillIn(d),
      () => fillIn(null),
    );
  }

  function setMode(m: 'opening' | 'resume'): void {
    if (state === 'closed') return;
    // A late history on a new game: the screen is still up (any key on a resume closes it), so the opening box can still go in.
    if (guessed) {
      guessed = false;
      if (m === 'resume') return;
      mode = null;
    }
    if (mode !== null) return;
    mode = m;
    rule.textContent = RULE[m];
    if (m === 'opening') buildBox('opening');
    showLore();
    showGo();
  }

  showGo();
  if (travel) {
    root.classList.add('ar-travel');
    route.append(el('b', '', (travel.from ?? '').toUpperCase()), el('span', 'ar-arrow'), el('b', 'ar-to', travel.to.toUpperCase()));
    route.hidden = travel.from === null;
    move.textContent = o.moveLine ?? '';
    buildBox('travel');
    showGo();
    o.preload?.(travel.sceneId);
    setScene(travel.sceneId, travel.to);
  } else {
    route.hidden = true;
    move.hidden = true;
  }

  return {
    get open() {
      return state !== 'closed';
    },
    setMode,
    setScene,
    setClock(m) {
      clock = m;
      if (sceneSet) showPlace();
    },
    setWith(line) {
      withLine.textContent = line ?? '';
      withLine.hidden = line === null;
    },
    ready() {
      roomReady = true;
      if (travel) {
        if (sending) close();
        return;
      }
      tick();
    },
    close,
    notice(t) {
      if (state === 'closed') return;
      notice.textContent = t;
      sending = false;
      if (moveStuck) clearTimeout(moveStuck);
      moveStuck = null;
      root.classList.remove('ar-moving');
      fill.style.width = '0%';
      if (box?.back) box.back.disabled = false;
      if (box?.suggest) box.suggest.disabled = drafting;
      focusBox();
    },
    text,
    onSend(cb) {
      senders.push(cb);
    },
    onBack(cb) {
      backers.push(cb);
    },
    onClose(cb) {
      if (state === 'closed') cb();
      else closers.push(cb);
    },
    state: () => state,
  };
}
