/**
 * Cracking a terminal (small jobs spec §4): a CRT window over the room with the memory dump (two
 * columns of 16 lines, hex addresses), the tries as blocks, and a log of guesses and their likeness.
 * Words and bracket pairs are picked by click, tap, or arrows and Enter; Esc or LEAVE walks away.
 * The state is shared/crack.ts's: the same terminal the server rebuilds from the seed and scores.
 * Its look is the held deck's skin (deck skins spec): words and a few pieces from skins.ts, drawn by CSS.
 */
import { makeTerminal, playTerminal, type Move, type Terminal, type TerminalSetup } from '../../../../shared/crack';
import { SKINS, skinOf, type Piece } from './skins';
import { cuesForMove, type CrackCue } from './sound';
import '@fontsource/oswald/500.css';
import '@fontsource/saira-stencil-one';
import '@fontsource/ibm-plex-sans-condensed/400.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/share-tech-mono';
import './crack.css';
import './skins/amber.css';
import './skins/slab.css';
import './skins/holo.css';
import './skins/meridian.css';
import './skins/sentinel.css';
import './skins/dock.css';
import './skins/pocket.css';
import './skins/corp.css';

/** How long the last line stays up before the window hands back. */
const END_MS = 1100;
const BASE_ADDRESS = 0xf4a0;
/** The outcome sounds just after the key, so the two read as one move. */
const OUTCOME_MS = 120;

const el = (tag: string, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;
const ALARM_SEGMENTS = 3;

/** A skin's extra piece, or null for the ones the window draws itself (the column, the alarm). */
function pieceEl(piece: Piece, text: string | undefined, deck: string | null): HTMLElement | null {
  if (piece === 'plate' || piece === 'stencil' || piece === 'manifest') return el('span', `ct-${piece}`, text);
  if (piece === 'name') return deck ? el('span', 'ct-deck-name', deck.toUpperCase()) : null;
  if (piece === 'linked') return el('span', 'ct-linked', `LINKED · ${deck?.toUpperCase() ?? 'NO DECK'}`);
  if (piece === 'signal') {
    const n = el('span', 'ct-signal');
    const deaf = text?.startsWith('NO UPLINK');
    for (let i = 0; i < 4; i++) n.append(el('i', i === 0 || !deaf ? 'on' : ''));
    n.append(el('b', '', text));
    return n;
  }
  if (piece === 'keys') {
    const n = el('div', 'ct-keys');
    for (const k of ['ESC', 'F1', 'F2', 'TRACE', 'PROBE', 'SPACE', 'ENTER', '◄', '►', 'PWR']) n.append(el('span', '', k));
    return n;
  }
  if (piece === 'corners') return el('i', 'ct-corner');
  return null;
}

export function openTerminal(
  host: HTMLElement,
  o: { setup: TerminalSetup; title: string; cue(c: CrackCue): void; onDone(r: { moves: Move[] }): void; reduced: boolean; alarm?: number },
): { close(): void } {
  const t: Terminal = makeTerminal(o.setup);
  const moves: Move[] = [];
  let over = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let outcome: ReturnType<typeof setTimeout> | null = null;

  const skinName = skinOf(o.setup);
  const skin = SKINS[skinName];
  const has = (p: Piece) => skin.pieces.includes(p);
  const win = el('div', `ct-window ct-skin-${skinName}`);
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', `Terminal: ${o.title}`);
  const head = el('div', 'ct-head');
  head.append(el('span', 'ct-title', `TERMINAL · ${o.title.toUpperCase()}`), el('span', 'ct-size', `${t.password.length} LETTERS`));
  const triesRow = el('div', 'ct-tries');
  const body = el('div', 'ct-body');
  const dump = el('div', 'ct-dump');
  const side = el('div', 'ct-side');
  const log = el('div', 'ct-log');
  const leave = el('button', 'ct-leave', skin.leave) as HTMLButtonElement;
  leave.type = 'button';
  if (t.ghost) side.append(el('div', 'ct-ghost', `LETTER ${t.ghost.index + 1}: ${t.ghost.letter}`));
  if (t.hint) side.append(el('div', 'ct-hint', t.hint));
  side.append(log, leave);
  body.append(dump, side);
  win.append(head, triesRow, body);
  for (const p of skin.pieces) {
    const n = pieceEl(p, skin.text?.[p], o.setup.deck ?? null);
    if (!n) continue;
    if (p === 'keys') win.append(n);
    else if (p === 'corners') win.append(n, pieceEl(p, undefined, null)!);
    else head.insertBefore(n, head.children[1] ?? null);
  }
  // The corporate terminal's ALARM (spec §3): the job's, lit in 3 segments; a lockout shows the rise the server then applies.
  const alarm = has('alarm') ? el('div', 'ct-alarm') : null;
  const paintAlarm = (n: number) => {
    if (!alarm) return;
    alarm.replaceChildren(el('b', '', 'ALARM'));
    for (let i = 0; i < ALARM_SEGMENTS; i++) alarm.append(el('i', i < Math.min(ALARM_SEGMENTS, n) ? 'on' : ''));
  };
  if (alarm) {
    paintAlarm(o.alarm ?? 0);
    win.append(alarm);
  }

  // The dump: each line's words and bracket pairs are pickable spans, the rest junk.
  const picks: HTMLElement[] = [];
  const wordEls = new Map<string, HTMLElement>();
  const bracketEls: HTMLElement[] = [];
  // The pocket deck's small screen: one scrolling column; every other skin two of 16.
  const oneCol = has('column');
  if (oneCol) dump.classList.add('ct-one-col');
  const cols = oneCol ? [el('div', 'ct-col')] : [el('div', 'ct-col'), el('div', 'ct-col')];
  t.lines.forEach((line, li) => {
    const row = el('div', 'ct-row');
    row.append(el('span', 'ct-addr', hex(BASE_ADDRESS + li * line.length)));
    const text = el('span', 'ct-text');
    let c = 0;
    while (c < line.length) {
      const w = t.words.find((x) => x.line === li && x.col === c);
      const bi = t.brackets.findIndex((b) => b.line === li && b.from === c);
      if (w) {
        const s = el('span', 'ct-word', w.word);
        s.dataset.word = w.word;
        s.onclick = () => play({ word: w.word });
        wordEls.set(w.word, s);
        picks.push(s);
        text.append(s);
        c += w.word.length;
      } else if (bi >= 0) {
        const b = t.brackets[bi];
        const s = el('span', 'ct-bracket', line.slice(b.from, b.to + 1));
        s.dataset.i = String(bi);
        s.onclick = () => play({ bracket: bi });
        bracketEls[bi] = s;
        picks.push(s);
        text.append(s);
        c = b.to + 1;
      } else {
        text.append(document.createTextNode(line[c]));
        c++;
      }
    }
    row.append(text);
    cols[oneCol || li < t.lines.length / 2 ? 0 : 1].append(row);
  });
  dump.append(...cols);
  for (const p of picks) {
    p.tabIndex = -1;
    p.setAttribute('role', 'button');
    p.addEventListener('mouseenter', () => !over && !p.classList.contains('struck') && !p.classList.contains('used') && o.cue('hover'));
  }

  const logLine = (a: string, b?: string) => {
    const n = el('div', 'ct-entry');
    n.append(el('span', 'ct-entry-a', a));
    if (b) n.append(el('span', 'ct-entry-b', b));
    log.append(n);
    log.scrollTop = log.scrollHeight;
  };

  /** Draws the state after `moves`: struck duds, used brackets, the tries left. */
  const paint = () => {
    const p = playTerminal(t, moves);
    const out = new Set([...t.struck, ...p.log.flatMap((l) => ('word' in l.move && l.likeness !== undefined ? [l.move.word] : l.removed ? [l.removed] : []))]);
    for (const [w, n] of wordEls) n.classList.toggle('struck', out.has(w));
    p.log.forEach((l) => 'bracket' in l.move && bracketEls[l.move.bracket]?.classList.add('used'));
    triesRow.replaceChildren(el('span', 'ct-tries-k', skin.tries));
    for (let i = 0; i < t.tries; i++) triesRow.append(el('i', i < p.triesLeft ? 'on' : ''));
    return p;
  };

  const finish = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    close();
    o.onDone({ moves: [...moves] });
  };

  function play(m: Move): void {
    if (over) return;
    const before = playTerminal(t, moves);
    const after = playTerminal(t, [...moves, m]);
    // A struck word, a used bracket: nothing happens.
    if (after.log.length === before.log.length) return;
    moves.push(m);
    const entry = after.log.at(-1)!;
    paint();
    const [key, ...then] = cuesForMove(m, after);
    o.cue(key);
    if (outcome) clearTimeout(outcome);
    outcome = then.length ? setTimeout(() => then.forEach((c) => o.cue(c)), OUTCOME_MS) : null;
    if ('word' in m) logLine(`> ${m.word}`, after.state === 'granted' ? 'ACCESS GRANTED' : skin.likeness(entry.likeness ?? 0, t.password.length));
    else logLine(`> ${(bracketEls[m.bracket]?.textContent ?? '[]')}`, entry.reset ? skin.reset : entry.removed ? skin.dud : skin.nothing);
    if (after.state === 'locked') {
      logLine('LOCKED OUT');
      paintAlarm((o.alarm ?? 0) + 1);
    }
    if (after.state !== 'open') {
      over = true;
      win.classList.add(after.state === 'granted' ? 'is-granted' : 'is-locked');
      timer = setTimeout(finish, o.reduced ? 0 : END_MS);
    }
  }

  const focusAt = (i: number) => {
    const p = picks[(i + picks.length) % picks.length];
    if (!p) return;
    if (!oneCol) {
      p.focus();
      return;
    }
    // One column runs past the screen: keep the cursor in view by scrolling the dump alone (focus's own
    // scroll, or scrollIntoView, would scroll the stage behind the phone too).
    p.focus({ preventScroll: true });
    const top = p.offsetTop;
    const bottom = top + p.offsetHeight;
    if (top < dump.scrollTop) dump.scrollTop = top;
    else if (bottom > dump.scrollTop + dump.clientHeight) dump.scrollTop = bottom - dump.clientHeight;
  };
  /** The arrows step the cursor with the same tick as the mouse. */
  const step = (i: number) => {
    focusAt(i);
    if (!over) o.cue('hover');
  };
  /** Walking away (Esc or LEAVE) before the terminal's done. */
  const walk = () => {
    if (over) return;
    o.cue('leave');
    finish();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      walk();
      return;
    }
    const at = picks.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(at + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(at - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      if (at >= 0) picks[at].click();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };
  leave.onclick = walk;

  function close(): void {
    window.removeEventListener('keydown', onKey, true);
    win.remove();
  }

  host.append(win);
  paint();
  window.addEventListener('keydown', onKey, true);
  o.cue('open');
  focusAt(0);
  return { close };
}
