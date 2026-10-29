import { her } from '../room/her-copy';
import { foldArrow } from './chat-keys';
import { keyButton } from './key-glyphs';
import type { ChatMode } from '../../../shared/types';

/** The RP/OOC toggle's own mode: end-of-scene is a separate send, not a toggle state. */
type ToggleMode = Exclude<ChatMode, 'end' | 'greet' | 'travel' | 'scene' | 'encounter' | 'quest' | 'gig' | 'dice' | 'text'>;

const MAX_LINES = 6;
/** How long a failed SUGGEST's reason stays in the hint. */
const SUGGEST_NOTICE_MS = 5000;
/** The field keeps at least this much room to type in before the hint gives way. */
const MIN_FIELD_PX = 160;

/** A hint's parts in display order; `drop` ranks when each steps out short of room (lowest first). */
type HintPart = { text: string; drop: number };
const RP_HINT: HintPart[] = [
  { text: '[ENTER] SEND', drop: 2 },
  { text: '[SHIFT+ENTER] NEWLINE', drop: 0 },
  { text: '[ALT+M] MODE', drop: 1 },
  { text: '[`] ADMIN', drop: 3 },
];
const OOC_HINT: HintPart[] = [
  { text: '// OUT OF CHARACTER', drop: 1 },
  { text: '[ALT+M] ROLEPLAY', drop: 0 },
];
const MODE_LABEL: Record<ToggleMode, string> = { rp: 'RP', ooc: 'OOC' };
const MODE_TITLE: Record<ToggleMode, string> = {
  rp: 'Roleplay — Nix stays in character (Alt+M to switch)',
  ooc: 'Out of character — the fiction is set aside (Alt+M to switch)',
};

/**
 * The prompt line (`RP _`), its mode chip first. Enter sends, Shift+Enter is a newline. While busy,
 * Enter is swallowed but the field stays editable so a reply can be drafted. The selector on the
 * left (or Alt+M) switches between roleplay and out-of-character; the mode goes with each message.
 */
export function mountInput(
  root: HTMLElement,
  send: (text: string, mode: ChatMode, o?: { leave: true }) => void,
  opts: {
    initialMode?: ToggleMode;
    onModeChange?: (mode: ToggleMode) => void;
    onDraw?: () => void;
    onDice?: () => void;
    onWalkOut?: () => void;
    onStay?: () => void;
    /** SUGGEST: your next line drafted from the scene, steered by what's typed (null: nothing). Rejects with the hint's words. */
    suggest?: (steer: string | null) => Promise<string>;
  } = {},
): {
  setBusy(b: boolean, label?: string): void;
  restoreDraft(text: string): void;
  /** Empties the field (a held quest line was chosen or sent as talk). */
  clearDraft(): void;
  /** The typed line, trimmed, taken out of the field as a send would (LET HER GO carries it). */
  takeDraft(): string;
  /** Re-measures the draft (TEXT SIZE changed its line height). */
  refit(): void;
  setAgentName(name: string): void;
  /** Whether her mind can deal events (a direct link with a working key), and why not. */
  /** `why` may be read later (a function): words about her follow her pronoun, which can arrive after. */
  setDraw(state: { ok: true } | { ok: false; why: string | (() => string) }): void;
  /** Why DRAW can't deal or play now (null: it can). */
  drawWhyNot(): string | null;
  /** Why DICE can't open now (its title, the key disabled), or null when it can. */
  setDiceBlock(reason: string | null): void;
  /** WALK OUT in place of the field (her goodbye to LEAVE has landed), or the field back. */
  setWalkOut(on: boolean): void;
  /** Comms (spec 2026-10-20 §1): LEAVE reads HANG UP while she's on the line. */
  setComms(on: boolean): void;
} {
  const bar = document.createElement('div');
  bar.className = 'input';

  const modeButton = document.createElement('button');
  modeButton.type = 'button';
  modeButton.className = 'mode';

  const field = document.createElement('div');
  field.className = 'field';
  const ta = document.createElement('textarea');
  ta.rows = 1;
  ta.spellcheck = false;
  ta.placeholder = ' ';
  ta.setAttribute('aria-label', 'Message Nix');
  const ghost = document.createElement('span');
  ghost.className = 'ghost';
  ghost.textContent = '_';
  field.append(ta, ghost);

  const hint = document.createElement('span');
  hint.className = 'hint';

  // The scene stack (spec 2026-10-16 subtitle chat box §6): DRAW, END SCENE and LEAVE in the
  // bottom-right corner beside the bar, as glyphs or words (SYS → CHAT KEYS), folding under one arrow.
  const endTitle = () => `${her().endTitle} (Alt+E)`;
  const endButton = keyButton('end', 'END SCENE', endTitle());
  endButton.classList.add('end-scene');

  const leaveButton = keyButton('leave', 'LEAVE', her().leaveTitle);
  leaveButton.classList.add('leave-scene');

  // WALK OUT (after LEAVE): stands in for the whole bar until you go, or stay.
  const walkOutButton = document.createElement('button');
  walkOutButton.type = 'button';
  walkOutButton.className = 'walk-out-btn';
  walkOutButton.textContent = 'WALK OUT';
  walkOutButton.title = 'Walk out on your own (Enter)';
  walkOutButton.hidden = true;
  const stayButton = document.createElement('button');
  stayButton.type = 'button';
  stayButton.className = 'walk-out-stay';
  stayButton.textContent = 'stay';
  stayButton.title = 'Stay and keep talking';
  stayButton.hidden = true;

  // ◆ DRAW (encounter cards): three events that could cut in now (Alt+D).
  const drawButton = keyButton('draw', '◆ DRAW');
  drawButton.classList.add('draw');

  // SUGGEST (Alt+G): her model drafts your next line into the box, unsent; what's typed steers it.
  const suggestButton = keyButton('suggest', 'SUGGEST');
  suggestButton.classList.add('suggest');

  // DICE (liar's dice on the stage between you), above DRAW: a game in the scene, so it lives with the scene's keys.
  const diceButton = keyButton('dice', 'DICE', "Liar's dice");
  diceButton.classList.add('dice');
  diceButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!diceButton.disabled) opts.onDice?.();
  });

  const sceneKeys = document.createElement('div');
  sceneKeys.className = 'scene-keys';
  sceneKeys.setAttribute('role', 'toolbar');
  sceneKeys.setAttribute('aria-label', 'Scene actions');
  sceneKeys.append(suggestButton, diceButton, drawButton, endButton, leaveButton, foldArrow(sceneKeys, 'scene'));

  bar.append(modeButton, field, hint, walkOutButton, stayButton);
  root.append(bar, sceneKeys);

  let busy = false;
  let agentName = 'Nix';
  let mode: ToggleMode = opts.initialMode ?? 'rp';
  let drawState: { ok: true } | { ok: false; why: string | (() => string) } = { ok: true };
  const idleHint = (): HintPart[] => (mode === 'ooc' ? OOC_HINT : RP_HINT);
  /** Why DRAW can't deal now (null: it can): she's transmitting, out of character, or her mind can't. */
  const drawWhyNot = (): string | null => (busy ? her().waitToFinish : mode === 'ooc' ? 'Encounters are for roleplay.' : drawState.ok ? null : typeof drawState.why === 'function' ? drawState.why() : drawState.why);
  const applyDraw = () => {
    const why = drawWhyNot();
    drawButton.disabled = why !== null;
    drawButton.title = why ?? 'Draw an encounter: three events that could cut in now (Alt+D)';
  };
  const draw = () => {
    if (drawWhyNot() === null) opts.onDraw?.();
  };

  /** A SUGGEST in flight, and how many sends there have been (a draft that lands after one is dropped). */
  let suggesting = false;
  let sends = 0;
  let notice: { text: string; timer: ReturnType<typeof setTimeout> } | null = null;
  /** Why SUGGEST can't draft now (null: it can): it shares DRAW's link, and is for roleplay. */
  const suggestWhyNot = (): string | null =>
    !opts.suggest ? 'No suggestions here.' : suggesting ? 'Drafting your line…' : busy ? her().waitToFinish : mode === 'ooc' ? 'Suggestions are for roleplay.' : drawState.ok ? null : typeof drawState.why === 'function' ? drawState.why() : drawState.why;
  const applySuggest = () => {
    const why = suggestWhyNot();
    suggestButton.disabled = why !== null && !suggesting;
    suggestButton.classList.toggle('working', suggesting);
    suggestButton.title = why ?? "Suggest your next line: it's drafted into the box, not sent. What you've typed steers it (Alt+G)";
  };
  /** The hint at rest: a failed SUGGEST's reason for a few seconds, else the mode's keys. */
  const restHint = () => {
    if (busy) return;
    if (suggesting) setHint([{ text: '// DRAFTING YOUR LINE', drop: 0 }]);
    else if (notice) setHint([{ text: `// NO LINE: ${notice.text}`, drop: 0 }]);
    else setHint(idleHint());
  };
  const suggest = async () => {
    if (suggestWhyNot() !== null || !opts.suggest) return;
    const before = ta.value;
    const sentBefore = sends;
    if (notice) clearTimeout(notice.timer);
    notice = null;
    suggesting = true;
    applySuggest();
    restHint();
    try {
      const line = await opts.suggest(before.trim() || null);
      if (sends !== sentBefore || walkOut) return;
      // The steer is replaced; anything typed while it drafted stays, after the draft.
      const added = ta.value.startsWith(before) ? ta.value.slice(before.length).trim() : ta.value.trim();
      ta.value = added ? `${line}\n${added}` : line;
      fit();
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    } catch (err) {
      const text = err instanceof Error && err.message ? err.message : 'SOMETHING WENT WRONG';
      notice = {
        text,
        timer: setTimeout(() => {
          notice = null;
          restHint();
        }, SUGGEST_NOTICE_MS),
      };
    } finally {
      suggesting = false;
      applySuggest();
      restHint();
    }
  };
  suggestButton.addEventListener('click', (e) => {
    e.stopPropagation();
    void suggest();
  });
  drawButton.addEventListener('click', (e) => {
    e.stopPropagation();
    draw();
  });

  /**
   * The hint gives way before the line overflows or the field gets too narrow to type in: its
   * parts step out in `drop` order (dots between the ones left are CSS).
   */
  const fitHint = () => {
    const parts = [...hint.children] as HTMLElement[];
    for (const p of parts) p.hidden = false;
    if (bar.clientWidth === 0) return; // not laid out
    const fits = () => bar.scrollWidth <= bar.clientWidth && field.clientWidth >= MIN_FIELD_PX;
    const order = [...parts].sort((a, b) => Number(a.dataset.drop) - Number(b.dataset.drop));
    for (const p of order) {
      if (fits()) return;
      p.hidden = true;
    }
  };
  const setHint = (parts: HintPart[]) => {
    hint.replaceChildren(
      ...parts.map((p) => {
        const s = document.createElement('span');
        s.className = 'hint-part';
        s.textContent = p.text;
        s.dataset.drop = String(p.drop);
        return s;
      }),
    );
    fitHint();
  };
  window.addEventListener('resize', fitHint);
  document.fonts?.addEventListener('loadingdone', fitHint);

  const applyMode = () => {
    modeButton.textContent = MODE_LABEL[mode];
    modeButton.title = MODE_TITLE[mode];
    modeButton.setAttribute('aria-label', mode === 'ooc' ? 'Mode: out of character' : 'Mode: roleplay');
    bar.classList.toggle('mode-rp', mode === 'rp');
    bar.classList.toggle('mode-ooc', mode === 'ooc');
    restHint();
    applyDraw();
    applySuggest();
  };
  const toggleMode = () => {
    mode = mode === 'rp' ? 'ooc' : 'rp';
    applyMode();
    opts.onModeChange?.(mode);
  };
  applyMode();

  modeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMode();
    ta.focus();
  });

  const fit = () => {
    ta.style.height = 'auto';
    const line = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const h = Math.min(ta.scrollHeight, line * MAX_LINES);
    ta.style.height = `${h}px`;
    // The dialogue box sits on the bar: a draft past one line lifts it by the extra lines.
    document.documentElement.style.setProperty('--input-extra', `${Math.max(0, h - line)}px`);
  };

  const endScene = () => {
    if (busy) return;
    send(ta.value.trim(), 'end');
    sends++;
    ta.value = '';
    fit();
  };
  endButton.addEventListener('click', endScene);

  const leaveScene = () => {
    if (busy) return;
    send(ta.value.trim(), 'end', { leave: true });
    sends++;
    ta.value = '';
    fit();
  };
  leaveButton.addEventListener('click', leaveScene);

  let walkOut = false;
  const applyWalkOut = (on: boolean) => {
    walkOut = on;
    bar.classList.toggle('walk-out', on);
    // WALK OUT stands in for the prompt line and both stacks: the line stack (the feed's) reads this.
    document.documentElement.classList.toggle('walking-out', on);
    for (const n of [modeButton, field, hint, sceneKeys]) n.hidden = on;
    walkOutButton.hidden = !on;
    stayButton.hidden = !on;
    // No focus grab: Enter still turns her goodbye's pages (the feed takes it first) until it's all shown.
    if (on) ta.blur();
    else {
      fitHint();
      ta.focus();
    }
  };
  walkOutButton.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.onWalkOut?.();
  });
  stayButton.addEventListener('click', (e) => {
    e.stopPropagation();
    applyWalkOut(false);
    opts.onStay?.();
  });

  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || walkOut) return;
    e.preventDefault();
    if (busy) return;
    const text = ta.value.trim();
    if (text.length === 0) return;
    send(text, mode);
    sends++;
    ta.value = '';
    fit();
  });

  // Typing anywhere on the page lands in the prompt — unless focus is already in some other
  // editable control (e.g. the dev panel's fields), or the key is backtick (reserved to toggle
  // the dev panel).
  window.addEventListener('keydown', (e) => {
    // While WALK OUT stands in for the bar, Enter walks out and nothing else types.
    if (walkOut) {
      // Not an Enter something else took (a page turn), nor one meant for another field or button.
      const active = document.activeElement;
      const elsewhere =
        active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement || (active instanceof HTMLButtonElement && active !== walkOutButton);
      if (e.key === 'Enter' && !e.defaultPrevented && !e.altKey && !e.ctrlKey && !e.metaKey && !elsewhere) {
        e.preventDefault();
        opts.onWalkOut?.();
      }
      return;
    }
    // Alt+M switches roleplay / out of character from anywhere (e.code: Alt+M types µ on some layouts).
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyM') {
      e.preventDefault();
      toggleMode();
      return;
    }
    // Alt+E ends the scene from anywhere, like Alt+M switches mode.
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyE') {
      e.preventDefault();
      endScene();
      return;
    }
    // Alt+G suggests your next line from anywhere.
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyG') {
      e.preventDefault();
      void suggest();
      return;
    }
    // Alt+D draws an encounter from anywhere.
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyD') {
      e.preventDefault();
      draw();
      return;
    }
    const active = document.activeElement;
    const inOtherField =
      active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement || active instanceof HTMLSelectElement;
    if (inOtherField || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && e.key !== '`') ta.focus();
  });
  bar.addEventListener('click', () => {
    if (!walkOut) ta.focus();
  });
  ta.focus();

  return {
    setAgentName(name: string) {
      agentName = name;
      ta.setAttribute('aria-label', `Message ${name}`);
      // Her pronoun is set with her name (the portrait event): the buttons' titles follow it.
      endButton.title = endTitle();
      leaveButton.title = her().leaveTitle;
      applyDraw();
      applySuggest();
    },
    setBusy(b: boolean, label = `// ${agentName.toUpperCase()} IS TRANSMITTING`) {
      busy = b;
      bar.classList.toggle('busy', b);
      if (b) setHint([{ text: label, drop: 0 }]);
      else restHint();
      endButton.disabled = b;
      leaveButton.disabled = b;
      applyDraw();
      applySuggest();
    },
    setDraw(state) {
      drawState = state;
      applyDraw();
      applySuggest();
    },
    setDiceBlock(reason) {
      diceButton.disabled = reason !== null;
      diceButton.title = reason ?? "Liar's dice";
    },
    drawWhyNot,
    setComms(on: boolean) {
      const label = on ? 'HANG UP' : 'LEAVE';
      leaveButton.querySelector('.lb')!.textContent = label;
      leaveButton.setAttribute('aria-label', label);
      // Liar's dice is a table game: not across the line (comms review I6).
      diceButton.classList.toggle('comms-off', on);
    },
    setWalkOut(on: boolean) {
      if (on !== walkOut) applyWalkOut(on);
    },
    /** Re-measures the draft (TEXT SIZE changed its line height). */
    refit() {
      fit();
    },
    clearDraft() {
      ta.value = '';
      fit();
    },
    takeDraft() {
      const text = ta.value.trim();
      sends++;
      ta.value = '';
      fit();
      return text;
    },
    /** Put a draft the server refused back into the field, ahead of anything typed since. */
    restoreDraft(text: string) {
      ta.value = ta.value.length > 0 ? `${text}\n${ta.value}` : text;
      fit();
    },
  };
}
