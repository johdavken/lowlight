/**
 * The JOB column (2026-11-02): while a Graft table is up, the box splits. Her lines keep the left of the band,
 * and the job's written text (SETUP's pitch, a beat, an ending) stands at the right, where it stays through her
 * replies. The box shows one page at a time, which is why beats were taken out of it (f3abcfd0). The table keeps
 * its cards and gets the height back. `job-col` on the feed's root moves her line over, as `has-portrait` does.
 */
import './job-column.css';
import { passiveLabels } from '../ui/passive';
import { markLore } from '../ui/lore-hover';
import { proseNodes } from './table/el';
import { DECODE_MS, decodeIn, scrambleIn } from './table/decode';
import { mountFrame } from '../ui/holo-frame';

/** The name a line shows (`RUE`), from its label (`RUE (ON COMMS)`): being on comms is drawn as a mark, not words. */
const nameOf = (who: string) => who.replace(/\s*\(ON COMMS\)$/i, '');

export interface JobColumn {
  /** The job's title, its text and a line under the head (SETUP's district, tier and heat); none of either: the column goes. `extra` stands under the text (a debrief's rolls). */
  show(title: string, text: string | null | undefined, sub?: string, extra?: HTMLElement | null): void;
  clear(): void;
  /** The contact's words on the line in the text shown (`{{ }}` on a beat), and who says them: they stand apart, in CRT. */
  setOnLine(who: string, words: string[]): void;
  /**
   * The talk while a job is up (2026-11-11): her lines and yours, beside the beat. `head`: what was said before the beat
   * shown (her answer to the move that brought it); `foot`: after it. Her lines decode in from noise (null text: she's
   * writing); yours stand plain. Each line is kept by `key`, so a redraw doesn't replay its decode.
   */
  setThread(thread: { head: ThreadLine[]; foot: ThreadLine[] }): void;
}

/** One line of the talk beside a job: `who` labels it (`RUE (ON COMMS)`, `SOREN`); `you`: the player's, plain. */
export interface ThreadLine {
  key: string;
  who: string;
  text: string | null;
  you?: boolean;
  line?: boolean;
  /** Her tool lines (`// APPLY_MOOD · STORM`), under her words. */
  tools?: string[];
}

/** A part of a line told the traditional way: an action as plain narration, words said in quotes, another's name. */
type TalkPart = { kind: 'act' | 'say' | 'who' | 'plain'; text: string };

/** A paragraph's small indent (playtest 2026-11-11): a character, so the decode types it and nothing shifts after. */
const INDENT = '\u2003';

/** A paragraph that is someone else's beat in her reply (`Silas: …`): their name, and the rest as written. */
const BEAT = /^([A-Z][A-Za-z'’. -]{0,24}):\s+(.+)$/;

/**
 * A line of talk told the traditional way (playtest 2026-11-11): her `*actions*` as plain narration, what she says in
 * quotes, no blank lines. An action opens a paragraph; what she says after it runs on in the same one. Words already in
 * quotes keep theirs; someone else's beat (`Silas: …`) keeps its words as written, under their name. `plain` is the same
 * text with a line break between paragraphs (the decode types it, so nothing moves when the parts come in).
 */
export function talkParts(text: string): { paragraphs: TalkPart[][]; plain: string } {
  const paragraphs: TalkPart[][] = [];
  let cur: TalkPart[] = [];
  for (const para of text.split(/\n+/).map((p) => p.trim()).filter(Boolean)) {
    const beat = BEAT.exec(para);
    const parts: TalkPart[] = beat
      ? [{ kind: 'who', text: beat[1] }, ...beat[2].split(/\*([^*\n]+)\*/).map((t, i): TalkPart => ({ kind: i % 2 ? 'act' : 'plain', text: t.trim() })).filter((x) => x.text)]
      : para
          .split(/\*([^*\n]+)\*/)
          .map((t, i): TalkPart => {
            const w = t.trim();
            if (i % 2) return { kind: 'act', text: w };
            // Already quoted, or only punctuation (`*nods*.`): as written.
            return { kind: /^["“'‘]/.test(w) || !/[\p{L}\p{N}]/u.test(w) ? 'plain' : 'say', text: w };
          })
          .filter((x) => x.text);
    if (!parts.length) continue;
    // A new paragraph at an action (or another's beat) once something's been said; words run on after an action.
    if (cur.length && (parts[0].kind === 'act' || parts[0].kind === 'who' || cur[0].kind === 'who')) {
      paragraphs.push(cur);
      cur = [];
    }
    cur.push(...parts);
  }
  if (cur.length) paragraphs.push(cur);
  const shown = (x: TalkPart) => (x.kind === 'say' ? `“${x.text}”` : x.kind === 'who' ? `${x.text.toUpperCase()}` : x.text);
  const plain = paragraphs.map((ps) => ps.map(shown).join(' ')).join(`\n${INDENT}`);
  return { paragraphs, plain };
}

/** `talkParts` as nodes: each paragraph a line of its own, its parts by kind (job-column.css). */
function talkNodes(text: string): Node[] {
  const { paragraphs } = talkParts(text);
  const out: Node[] = [];
  paragraphs.forEach((ps, i) => {
    if (i) out.push(document.createTextNode(`\n${INDENT}`));
    ps.forEach((x, j) => {
      if (j) out.push(document.createTextNode(' '));
      if (x.kind === 'plain') out.push(document.createTextNode(x.text));
      else out.push(Object.assign(document.createElement('span'), { className: `jc-t-${x.kind}`, textContent: x.kind === 'say' ? `“${x.text}”` : x.kind === 'who' ? x.text.toUpperCase() : x.text }));
    });
  });
  return out;
}

/** The job's text with what's said in it ("…" or “…”) in a span of its own, coloured apart from the narration (playtest). */
function quoted(text: string): Node[] {
  const out: Node[] = [];
  let at = 0;
  for (const m of text.matchAll(/“[^”\n]*”|"[^"\n]*"/g)) {
    if (m.index > at) out.push(document.createTextNode(text.slice(at, m.index)));
    out.push(Object.assign(document.createElement('span'), { className: 'jc-t-quote', textContent: m[0] }));
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(document.createTextNode(text.slice(at)));
  return out;
}

/** `text` with each of `words` lifted out into a CRT line, under `who`. */
function lineNodes(text: string, who: string, words: string[]): Node[] {
  const at = words.map((w) => ({ w, i: text.indexOf(w) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i)[0];
  if (!at) return [document.createTextNode(text)];
  const said = document.createElement('span');
  said.className = 'jc-line';
  said.dataset.who = `${who} (ON COMMS)`;
  said.dataset.name = who;
  said.textContent = at.w;
  const before = text.slice(0, at.i);
  return [...(before ? [document.createTextNode(before)] : []), said, ...lineNodes(text.slice(at.i + at.w.length), who, words)];
}

/**
 * `root` is the feed's root (`job-col` goes on it); the column stands in its own layer on `layerHost` (the game
 * stage). `onLine` hears when her line narrows or widens, so the feed re-pages it at its new width.
 */
export function mountJobColumn(root: HTMLElement, layerHost: HTMLElement, onLine?: () => void, o: { reduced?: () => boolean } = {}): JobColumn {
  const layer = document.createElement('div');
  layer.className = 'jc-layer';
  const col = document.createElement('section');
  col.className = 'jc';
  col.hidden = true;
  // The head stands on the frame's top edge (the room HUD): the job's name on the subtitle box's plate, the details past
  // its roof line. `◆ JOB · ` stays in its text (screen readers, tests), unseen.
  const top = document.createElement('div');
  top.className = 'jc-top';
  const head = document.createElement('div');
  head.className = 'jc-head';
  const kind = Object.assign(document.createElement('span'), { className: 'jc-kind', textContent: '◆ JOB · ' });
  const title = Object.assign(document.createElement('span'), { className: 'jc-title' });
  head.append(kind, title);
  const sub = document.createElement('div');
  sub.className = 'jc-sub';
  top.append(head, sub);
  const body = document.createElement('div');
  body.className = 'jc-body';
  // The fade at the top shows only when there's more above (scrolled down).
  body.addEventListener('scroll', () => col.classList.toggle('jc-more', body.scrollTop > 2), { passive: true });
  col.append(top, body);
  layer.append(col);
  layerHost.append(layer);
  // The subtitle box's glass and corners, in the job's amber (the room HUD): the frame sits behind it in the layer.
  mountFrame(col, { shape: 'col', clip: false });
  let shown = '';
  let shownText = '';
  let shownExtra: HTMLElement | null = null;
  let line = { who: '', words: [] as string[] };
  /** The talk's lines, and each one's node (kept across redraws so its noise or decode carries on) and shown text. */
  let thread: { head: ThreadLine[]; foot: ThreadLine[] } = { head: [], foot: [] };
  const lineNodesByKey = new Map<string, { node: HTMLElement; decoded: string | null }>();
  /** The text's nodes, with the words on the line drawn apart. */
  const draw = () => {
    // The job's own text under NARRATOR (playtest 2026-11-11), its paragraphs on lines of their own, indented, no blank lines.
    const nodes = proseNodes(shownText.trim().replace(/\n+/g, `\n${INDENT}`)).flatMap((n) => {
      if (n instanceof Text) return lineNodes(n.data, line.who, line.words);
      (n as HTMLElement).replaceChildren(...lineNodes(n.textContent ?? '', line.who, line.words));
      return [n];
    });
    const story = nodes.length ? [Object.assign(document.createElement('div'), { className: 'jc-story' })] : [];
    // What's said in it stands apart, in its plain text and in its *italic* narration alike (a beat written all in
    // asterisks, playtest); the words on comms keep theirs.
    for (const n of nodes) if (n instanceof HTMLElement && n.localName === 'em') n.replaceChildren(...[...n.childNodes].flatMap((c) => (c instanceof Text ? quoted(c.data) : [c])));
    story[0]?.append(...nodes.flatMap((n) => (n instanceof Text ? quoted(n.data) : [n])));
    const of = (ls: ThreadLine[]) => ls.flatMap((l) => lineNodesByKey.get(l.key)?.node ?? []);
    body.replaceChildren(...of(thread.head), ...story, ...of(thread.foot), ...(shownExtra ? [shownExtra] : []));
    passiveLabels(body);
    markLore(body);
  };
  /** A line's words: yours plain; hers noise while she writes, then decoded once into her actions and speech. */
  const fillLine = (l: ThreadLine) => {
    let held = lineNodesByKey.get(l.key);
    if (!held) {
      const node = document.createElement('div');
      node.className = l.you ? 'jc-say jc-you' : 'jc-reply';
      node.append(Object.assign(document.createElement('span'), { className: 'jc-reply-text' }), Object.assign(document.createElement('div'), { className: 'jc-tools' }));
      held = { node, decoded: null };
      lineNodesByKey.set(l.key, held);
    }
    const h = held;
    h.node.dataset.who = l.who;
    h.node.dataset.name = nameOf(l.who);
    h.node.classList.toggle('jc-here', !l.you && !l.line);
    // Her tool lines (a mood, a pin) under her words, as the box's footer had them.
    const tools = h.node.querySelector<HTMLElement>('.jc-tools')!;
    const shownTools = [...tools.children].map((t) => t.textContent).join('\n');
    if (shownTools !== (l.tools ?? []).join('\n')) tools.replaceChildren(...(l.tools ?? []).map((t) => Object.assign(document.createElement('div'), { className: 'jc-tool', textContent: t })));
    const words = h.node.querySelector<HTMLElement>('.jc-reply-text')!;
    if (l.text === null) {
      h.decoded = null;
      // The noise has its own span: it flickers until that span leaves the page.
      if (!words.querySelector('.jc-noise')) {
        const noiseSpan = Object.assign(document.createElement('span'), { className: 'jc-noise' });
        words.replaceChildren(noiseSpan);
        scrambleIn(noiseSpan);
      }
      return;
    }
    if (l.text === h.decoded) return;
    const text = l.text;
    const first = h.decoded === null || l.you;
    h.decoded = text;
    const t = document.createElement('span');
    words.replaceChildren(t);
    // Told the traditional way: actions plain, what's said in quotes (talkParts).
    const prose = () => t.replaceChildren(...talkNodes(text));
    // Yours, an edit of a line already in, or reduced motion: no decode.
    if (l.you || !first || o.reduced?.()) return prose();
    // The letters lock in as the finished text reads, then take their parts' colours.
    decodeIn(t, talkParts(text).plain);
    setTimeout(() => {
      if (h.decoded === text && t.isConnected) {
        t.classList.remove('decoding');
        prose();
      }
    }, DECODE_MS + 80);
  };
  // New words in a column already up: it pulses and says so (playtest: easy to miss). The pulse is on a
  // pseudo-element, so `jc-in` doesn't replay when the class goes.
  const pulse = () => {
    col.classList.remove('jc-new');
    void col.offsetWidth;
    col.classList.add('jc-new');
  };
  col.addEventListener('animationend', (e) => {
    if (e.animationName === 'jc-new') col.classList.remove('jc-new');
  });
  const split = (on: boolean) => {
    if (root.classList.contains('job-col') === on) return;
    root.classList.toggle('job-col', on);
    onLine?.();
  };

  const clear = () => {
    thread = { head: [], foot: [] };
    lineNodesByKey.clear();
    shown = '';
    col.classList.remove('jc-new');
    col.hidden = true;
    split(false);
  };
  return {
    show(titleText, text, subLine, extra = null) {
      if (!text && !subLine && !extra) return clear();
      const key = `${titleText}\n${subLine ?? ''}\n${text}`;
      // The same text again (a quest_state that changed something else) keeps where you'd scrolled to.
      if (key === shown && extra === shownExtra && !col.hidden) return;
      if (!col.hidden && text && text !== shownText) pulse();
      shown = key;
      shownText = text ?? '';
      shownExtra = extra;
      title.textContent = titleText.toUpperCase();
      sub.textContent = subLine ?? '';
      sub.hidden = !subLine;
      draw();
      // A new beat starts at the top, unless her answer is waiting at its foot.
      body.scrollTop = thread.foot.length > 0 ? body.scrollHeight : 0;
      col.classList.remove('jc-more');
      col.hidden = false;
      split(true);
    },
    clear,
    setOnLine(who, words) {
      if (who === line.who && words.join('\n') === line.words.join('\n')) return;
      line = { who, words };
      if (!col.hidden) draw();
    },
    setThread(t) {
      const before = [...thread.head, ...thread.foot].map((l) => l.key).join('|');
      const footBefore = thread.foot.map((l) => l.key).join('|');
      thread = t;
      const all = [...t.head, ...t.foot];
      for (const k of [...lineNodesByKey.keys()]) if (!all.some((l) => l.key === k)) lineNodesByKey.delete(k);
      for (const l of all) fillLine(l);
      if (all.map((l) => l.key).join('|') === before && t.foot.map((l) => l.key).join('|') === footBefore) return;
      if (col.hidden) return;
      draw();
      // A new line at the foot is brought into view; one moved to the head is already at the top.
      if (t.foot.length > 0 && t.foot.map((l) => l.key).join('|') !== footBefore) body.scrollTop = body.scrollHeight;
    },
  };
}
