import type { Beat } from '../../../shared/beats';
import type { Segment } from './rp-markup';

/** Typing pace: characters per second, and extra pauses layered on top. */
export const CHARS_PER_SECOND = 60;
/** Pause after a sentence-ending `.`/`!`/`?` (not inside an ellipsis) or an em dash. */
export const PAUSE_SENTENCE_MS = 180;
/** Longer pause after a newline. */
export const PAUSE_LINE_MS = 300;

/**
 * How much slower than normal to type, from a `?cps=N` in the URL: a recording-only switch so a
 * clip reads at a viewer's pace. Pauses stretch with it. 1 (normal) without a positive N.
 */
export function paceFromSearch(search: string): number {
  const cps = Number(new URLSearchParams(search).get('cps') || NaN);
  return cps > 0 ? CHARS_PER_SECOND / cps : 1;
}

const PACE = typeof location === 'undefined' ? 1 : paceFromSearch(location.search);

/** The player's text speed (the HUD's TEXT control), slowest first; `scale` stretches the pace, 0 shows text at once. */
const TEXT_SPEEDS = { slow: 2, normal: 1, fast: 0.5, instant: 0 } as const;
export type TextSpeed = keyof typeof TEXT_SPEEDS;
const SPEED_ORDER = Object.keys(TEXT_SPEEDS) as TextSpeed[];
const SPEED_KEY = 'lowlight.textSpeed';

export const textSpeedScale = (s: TextSpeed): number => TEXT_SPEEDS[s];

/** The saved text speed, per browser; normal when none is saved (or storage is off). */
export function loadTextSpeed(): TextSpeed {
  try {
    const v = localStorage.getItem(SPEED_KEY);
    return v !== null && v in TEXT_SPEEDS ? (v as TextSpeed) : 'normal';
  } catch {
    return 'normal';
  }
}

export function saveTextSpeed(s: TextSpeed): void {
  try {
    localStorage.setItem(SPEED_KEY, s);
  } catch {
    // Storage off: the speed holds for this page only.
  }
}

/** The wheel: `d` steps faster (+) or slower (−), stopping at the ends. */
export function stepTextSpeed(s: TextSpeed, d: number): TextSpeed {
  return SPEED_ORDER[Math.max(0, Math.min(SPEED_ORDER.length - 1, SPEED_ORDER.indexOf(s) + Math.sign(d)))];
}

/** The class each segment kind renders as (action/mark get styling; plain is bare text). */
export const SEGMENT_CLASS: Record<Segment['kind'], string> = { plain: '', action: 'act', mark: 'mk' };

/**
 * How long to wait, in ms, after showing `text[i]` before showing the next character: the base
 * pace plus a pause for punctuation. A `.`/`!`/`?` pauses only when it ends a sentence (followed
 * by a space or the end of the text) and isn't part of a run of dots (an ellipsis); an em dash
 * always pauses; a newline pauses longer. `scale` stretches all of it (see `paceFromSearch`).
 */
export function charDelay(text: string, i: number, scale = PACE): number {
  const base = 1000 / CHARS_PER_SECOND;
  const c = text[i];
  if (c === '\n') return scale * (base + PAUSE_LINE_MS);
  if (c === '—') return scale * (base + PAUSE_SENTENCE_MS);
  if (c === '.' || c === '!' || c === '?') {
    const inEllipsis = text[i - 1] === '.' || text[i + 1] === '.';
    const next = text[i + 1];
    if (!inEllipsis && (next === undefined || /\s/.test(next))) return scale * (base + PAUSE_SENTENCE_MS);
  }
  return scale * base;
}

function span(cls: string, text: string): HTMLSpanElement {
  const node = document.createElement('span');
  if (cls) node.className = cls;
  node.textContent = text;
  return node;
}

/** The frontier's cursor: hidden from assistive tech, since the unshown text it precedes already is. */
function cursor(): HTMLSpanElement {
  const node = span('type-cursor', '');
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** Appends `text` for `kind`, rendered as it is today: action/mark get a styling span, plain is a bare text node. */
function appendVisible(into: HTMLElement, kind: Segment['kind'], text: string): void {
  if (!text) return;
  const cls = SEGMENT_CLASS[kind];
  into.append(cls ? span(cls, text) : text);
}

/** Appends `text` for `kind` past the frontier: always a span (to carry `unshown`), styling class kept. */
function appendHidden(into: HTMLElement, kind: Segment['kind'], text: string): void {
  if (!text) return;
  const cls = [SEGMENT_CLASS[kind], 'unshown'].filter(Boolean).join(' ');
  into.append(span(cls, text));
}

/**
 * Replaces `into`'s children with `segments`, laying out the whole text. With `shown === null`
 * everything is visible and there's no cursor (this is also how a finished message renders).
 * Otherwise characters `[0, shown)` render as today; the rest render in the same segment spans
 * with the extra class `unshown` (hidden by CSS, but kept in the DOM so layout doesn't shift as
 * typing reveals them); a `.type-cursor` span sits right at the frontier.
 */
export function renderFrontier(into: HTMLElement, segments: Segment[], shown: number | null): void {
  into.replaceChildren();
  if (shown === null) {
    for (const seg of segments) appendVisible(into, seg.kind, seg.text);
    indentParagraphs(into);
    return;
  }

  let consumed = 0;
  let cursorPlaced = false;
  for (const seg of segments) {
    const segEnd = consumed + seg.text.length;
    if (!cursorPlaced && shown <= segEnd) {
      const cut = Math.max(0, shown - consumed);
      appendVisible(into, seg.kind, seg.text.slice(0, cut));
      into.append(cursor());
      cursorPlaced = true;
      appendHidden(into, seg.kind, seg.text.slice(cut));
    } else if (cursorPlaced) {
      appendHidden(into, seg.kind, seg.text);
    } else {
      appendVisible(into, seg.kind, seg.text);
    }
    consumed = segEnd;
  }
  if (!cursorPlaced) into.append(cursor());
  indentParagraphs(into);
}

/**
 * Paragraph breaks read as a first-line indent, not a blank line, so every line stays on the box's
 * line grid (paging counts whole lines). In each run of blank lines the first newline stays; the
 * rest goes in a `.para-gap` span (not shown), and an empty `.para-indent` opens the next paragraph.
 * Only spans are added: every character stays in the DOM in order, so offsets still match.
 */
export function indentParagraphs(root: HTMLElement): void {
  const text = root.textContent ?? '';
  const runs = [...text.matchAll(/\n[^\S\n]*\n\s*/g)].map((m) => [m.index + 1, m.index + m[0].length] as const);
  if (runs.length === 0) return;
  const nodes: Array<{ node: Text; start: number }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(), start = 0; n; n = walker.nextNode()) {
    nodes.push({ node: n as Text, start });
    start += (n as Text).length;
  }
  // Last run first: a split keeps the head in the same node, so earlier offsets stay where they were.
  for (const [a, b] of runs.reverse()) {
    if (b < text.length) {
      const at = nodes.findLast((n) => n.start <= b)!;
      const off = b - at.start;
      const indent = span('para-indent', '');
      indent.setAttribute('aria-hidden', 'true');
      // At a node's start, before the outermost span that opens there: inside a hidden `*` (.mk) it wouldn't show.
      let target: Node = off === 0 ? at.node : at.node.splitText(off);
      while (target.parentNode !== root && target.parentNode?.firstChild === target) target = target.parentNode;
      (target as ChildNode).before(indent);
    }
    for (const { node, start } of nodes) {
      const from = Math.max(a, start);
      const to = Math.min(b, start + node.length);
      if (from >= to) continue;
      const mid = from > start ? node.splitText(from - start) : node;
      if (mid.length > to - from) mid.splitText(to - from);
      const gap = span('para-gap', '');
      mid.before(gap);
      gap.append(mid);
    }
  }
}

/** The character at offset `i` of the text the segments make up ('' past its end). */
function textAt(segments: Segment[], i: number): string {
  let consumed = 0;
  for (const seg of segments) {
    if (i < consumed + seg.text.length) return seg.text[i - consumed];
    consumed += seg.text.length;
  }
  return '';
}

/**
 * `renderFrontier` for a reply with others' lines (or a stranger's): the same text, cut into one
 * `<div class="beat" data-who>` per beat, each marker (`Hae: `) in a `.beat-name` span. Every
 * character stays in the DOM in order, so offsets into the text still match the message's (the
 * typing frontier, the page end). The cursor sits at the frontier, as with `renderFrontier`.
 */
export function renderBeats(into: HTMLElement, segments: Segment[], beats: Beat[], shown: number | null, accentOf?: (id: string) => string | undefined): void {
  into.replaceChildren();
  let cursorPlaced = shown === null;
  let last: HTMLElement = into;
  // Segment pieces in [a, b) of the text, in order, appended into `target`.
  const piece = (target: HTMLElement, a: number, b: number) => {
    let consumed = 0;
    for (const seg of segments) {
      const segStart = consumed;
      const segEnd = consumed + seg.text.length;
      consumed = segEnd;
      const from = Math.max(a, segStart);
      const to = Math.min(b, segEnd);
      if (from >= to) continue;
      const text = seg.text.slice(from - segStart, to - segStart);
      if (cursorPlaced) {
        (shown === null ? appendVisible : appendHidden)(target, seg.kind, text);
      } else if (shown! <= to) {
        const cut = Math.max(0, shown! - from);
        appendVisible(target, seg.kind, text.slice(0, cut));
        target.append(cursor());
        cursorPlaced = true;
        appendHidden(target, seg.kind, text.slice(cut));
      } else {
        appendVisible(target, seg.kind, text);
      }
    }
  };
  for (const beat of beats) {
    const div = document.createElement('div');
    div.className = 'beat';
    div.dataset.who = beat.who;
    // Someone else here: their beat names wear their own accent (--beat-c).
    const accent = beat.id !== undefined ? accentOf?.(beat.id) : undefined;
    if (accent) div.style.setProperty('--beat-c', accent);
    into.append(div);
    last = div;
    // The blank line(s) before the next speaker: their own span, so the box can leave them out of her page.
    let gap = beat.end;
    while (gap > beat.bodyStart && /\s/.test(textAt(segments, gap - 1))) gap--;
    // Each paragraph's marker (`Hae: `) in its own label, the text around them in the beat.
    let at = beat.start;
    for (const [from, to] of beat.markers) {
      piece(div, at, from);
      const name = span('beat-name', '');
      div.append(name);
      piece(name, from, to);
      at = to;
    }
    piece(div, at, gap);
    if (gap < beat.end) {
      const g = span('beat-gap', '');
      div.append(g);
      piece(g, gap, beat.end);
    }
    // Per beat: the blank lines before the next speaker end this beat, so they open no indent.
    indentParagraphs(div);
  }
  if (!cursorPlaced) last.append(cursor());
}
