import type { ChatMessage } from '../../../shared/types';
import { passiveLabels } from './passive';
import { markLore } from './lore-hover';
import { hhmm } from './clock';
import { pageLayout, type PageMeasure } from './paging';
import { modelLabel } from '../../../shared/model-label';
import { controlRow, editInPlace, takeSwitcher, type ControlAction } from './message-controls';
import { LineKeys } from './line-keys';
import { createMarkup, type Markup, type Segment } from './rp-markup';
import { charDelay, renderBeats, renderFrontier } from './typing';
import { speakerBeats, type Beat } from '../../../shared/beats';
import { strangerAt, type Stranger } from '../../../shared/encounter';
import type { GigSnapshot } from '../../../shared/gig/brief';
import { roundSummary, type DiceSnapshot } from '../../../shared/dice/text';
import { beatOnPage, beatStarts } from './beat-pages';

/** How many feed entries (messages or standalone tool rows) stay visible while collapsed. */
const COLLAPSED_VISIBLE = 6;
/** How long a scene or event banner takes to fade once it has done its job (style.css `.fading`). */
const BANNER_FADE_MS = 600;
/** How long a notice with UNDO stays (as journal notes); a plain notice. */
const NOTICE_UNDO_MS = 6000;
const NOTICE_MS = 4000;

/** Room kept under a paged reply's text for the [CONTINUE] button. */
const CONTINUE_PX = 40;
/** The controls row's room (17px buttons + 6px margin in the box) until one has been measured. */
const CONTROLS_PX = 23;

/** An element's height with its vertical margins; 0 for none. */
function outerHeight(n: HTMLElement | null): number {
  if (!n) return 0;
  const cs = getComputedStyle(n);
  return n.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
}

/** The line in the dialogue box: whose it is, its status, and her face on it (absent = neutral). */
export interface CurrentLine {
  id: string;
  role: ChatMessage['role'];
  status: ChatMessage['status'];
  expression?: string;
  /** Who the box shows speaking: you, your contact, or (on their page of a reply) someone else here or an event's stranger. */
  speaker: 'user' | 'contact' | 'other' | 'stranger';
  /** Which other is speaking, on their page. */
  otherId?: string;
  /** The others' faces on this reply, by id (absent = neutral). */
  othersExpressions?: Record<string, string>;
  /**
   * The *actions* of whoever the box shows speaking, from the start of the line through the page
   * showing (while she types, through what's typed), each trimmed, one per line; '' when none.
   */
  actions: string;
}

interface Entry {
  msg: ChatMessage;
  node: HTMLElement;
  text: HTMLElement;
  tools: HTMLElement;
  /** The row under the text: the tool lines, then the controls and [CONTINUE] (side by side in the box). */
  foot: HTMLElement;
  /** Roleplay messages split out *actions* as they stream; null out of character. */
  markup: Markup | null;
  /** The whole text so far, split for rendering (out of character: plain). */
  segments: Segment[];
  /** Her reply with others here (or an event's stranger): who speaks where. Empty for an ordinary reply. */
  beats: Beat[];
  /** The stranger an event left here when this reply was written (their `Name:` paragraphs are theirs); null when none. */
  stranger: string | null;
  /**
   * While it pages a speaker at a time: each beat's top margin (px), and the room under the last
   * (so her page can scroll to its top), re-applied whenever the text is redrawn.
   */
  beatMargins: { top: number[]; tail: number } | null;
}

/** Each action's [start, end) in the text the segments spell; an action streamed as several segments is one span. */
export function actionSpans(segments: Segment[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let open: [number, number] | null = null;
  let at = 0;
  for (const seg of segments) {
    const end = at + seg.text.length;
    if (seg.kind === 'action') {
      if (open) open[1] = end;
      else spans.push((open = [at, end]));
    } else open = null;
    at = end;
  }
  return spans;
}

/** The parts of `text` inside both an action span and one of `ranges`, each action trimmed, one per line. */
export function actionsIn(text: string, spans: Array<[number, number]>, ranges: Array<[number, number]>): string {
  const out: string[] = [];
  for (const [s, e] of spans) {
    const piece = ranges.map(([from, to]) => text.slice(Math.max(s, from), Math.max(Math.max(s, from), Math.min(e, to)))).join('').trim();
    if (piece) out.push(piece);
  }
  return out.join('\n');
}

/** Where a reply stops being visible: the character index just past the last one on that page. */
export type PageEnd = (id: string, page: number, pageHeight: number) => number;

/**
 * While her text streams or types it's re-rendered on every delta and tick: aria-busy keeps the
 * feed's live region from re-announcing it each time, until it's whole.
 */
/** A CSS length in px: `240px` (NaN for anything else). */
function cssPx(v: string): number {
  const s = v.trim();
  if (s.endsWith('px')) return parseFloat(s);
  return NaN;
}

/** The hidden line a greeting answers. */
function isGreetLine(m: ChatMessage): boolean {
  return m.role === 'user' && m.mode === 'greet';
}

function markBusy(text: HTMLElement, busy: boolean): void {
  if (busy) text.setAttribute('aria-busy', 'true');
  else text.removeAttribute('aria-busy');
}

/** The splits for `text`: through the roleplay markup, or plain out of character. */
function split(markup: Markup | null, text: string): Segment[] {
  if (text === '') return [];
  return markup ? markup.push(text) : [{ kind: 'plain', text }];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The 2x sibling of a portrait url: `@2x` inserted before the file extension (`a/nix.png` → `a/nix@2x.png`). */
export function portrait2x(url: string): string {
  return url.replace(/^([^?#]*?)(\.[a-z0-9]+)?([?#].*)?$/i, (_m, base: string, ext = '', rest = '') => `${base}@2x${ext}${rest}`);
}

/** A CSS `url("…")` for an untrusted url string — quotes, backslashes and newlines escaped. */
function cssUrl(url: string): string {
  return `url("${url.replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]/g, '')}")`;
}

/** Nix's portrait chip: a pink-tinted alpha mask (`--portrait` on the feed root) in a cut-corner frame. */
function avatar(status: ChatMessage['status']): HTMLElement {
  const node = el('div', 'avatar');
  if (status === 'streaming') node.classList.add('pulse');
  if (status === 'lost') node.classList.add('dim');
  node.setAttribute('aria-hidden', 'true');
  const frame = el('div', 'avatar-frame');
  frame.append(el('div', 'avatar-art'));
  node.append(frame);
  return node;
}

function toolRow(text: string): HTMLElement {
  return el('div', 'tool', text);
}

const GIG_STAMP: Record<GigSnapshot['result'], string> = { clean: 'CLEAN', close: 'CLOSE CALL', traced: 'TRACED', caught: 'CAUGHT', back: 'TURNED BACK' };

/** A gig run's card (gig runs spec §6.3): head, result stamp, trace, and its brief behind a toggle. */
function gigCard(g: GigSnapshot): HTMLElement {
  const card = el('div', 'gig-card-body');
  const head = el('div', 'gig-card-head');
  const where = { slip: 'FLOOR · ', papers: 'DESK · ', hack: '' }[g.kind ?? 'hack'];
  const meter = { slip: 'heat', papers: 'risk', hack: 'trace' }[g.kind ?? 'hack'];
  head.append(
    el('span', 'gig-head', `◢ GIG · ${where}${g.title.toUpperCase()} · ${g.tier.toUpperCase()}`),
    el('span', `gig-stamp gig-${g.result}`, GIG_STAMP[g.result]),
    el('span', 'gig-trace', `${meter} ${g.trace}/${g.max}`),
  );
  const brief = el('div', 'gig-brief', g.brief);
  brief.hidden = true;
  const toggle = el('button', 'gig-brief-toggle', '▸ brief');
  toggle.type = 'button';
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    brief.hidden = !brief.hidden;
    toggle.textContent = brief.hidden ? '▸ brief' : '▾ brief';
  });
  card.append(head);
  // Papers: who crossed, and whether booth nine looked away (spec §4.3).
  if (g.papers) card.append(el('div', 'gig-client', `${g.papers.name}${g.papers.overlooked !== null ? ' · booth nine' : ''}`));
  card.append(toggle, brief);
  return card;
}

/** A liar's dice game's card (liar's dice spec §5.3): who won and for what, the dice left, the rounds behind a toggle. */
function diceCard(d: DiceSnapshot): HTMLElement {
  const card = el('div', 'dice-card-body');
  const end = d.rounds[d.rounds.length - 1].left;
  const head = el('div', 'dice-card-head');
  head.append(el('span', 'dice-head', `◆ DICE · ${d.result === 'won' ? 'YOU' : d.her.toUpperCase()} WON · for ${d.stake}`), el('span', 'dice-score', `${end.you} – ${end.her}`));
  const rounds = el('div', 'dice-rounds');
  for (const r of d.rounds) rounds.append(el('div', '', roundSummary(r, d, 'you')));
  rounds.hidden = true;
  const toggle = el('button', 'dice-rounds-toggle', '▸ rounds');
  toggle.type = 'button';
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    rounds.hidden = !rounds.hidden;
    toggle.textContent = rounds.hidden ? '▸ rounds' : '▾ rounds';
  });
  card.append(head, toggle, rounds);
  return card;
}

/**
 * The floating holo-feed: recent messages bottom-left, fading toward the top. Wheel-up or PageUp
 * expands it into the full scrollable history (root gets `.expanded`, which dims the scene);
 * Escape collapses it. All message text goes in through `textContent` — never parsed as HTML.
 *
 * A reply too long for the collapsed feed is paged, visual-novel style: it starts at its first
 * line, one screenful at a time, with [CONTINUE ▸ n/N] (click, PageDown, or Enter/Space while the
 * prompt is empty). Past the last page it shows normally again — except in the dialogue box, whose
 * height is fixed: there a reply stays on its last page (unpaged, it would run under the footer).
 */
/** Her lines and the quest rows carry lore words (feedback 2026-10-19). */
const loreLine = (m: ChatMessage) => m.role === 'agent' || m.mode === 'quest';

export class Feed {
  private readonly list: HTMLElement;
  private readonly count: HTMLElement;
  private readonly entries = new Map<string, Entry>();
  private _expanded = false;
  private agentName = 'NIX';
  private userName = 'YOU';
  /** Unknown message ids already warned about, so a stray stream warns once, not per delta. */
  private readonly warned = new Set<string>();
  /** The reply being paged and the page showing (0-based). */
  private pager: { id: string; page: number } | null = null;
  /** How many pages applyPaging last laid the paged reply out in (relayout keeps the reader's place by it). */
  private pagerPages = 0;
  /**
   * The page height applyPaging gave the paged reply's box. Typing stops at that box's edge; it is
   * never re-measured mid-page, since the message reads taller once paged (button and controls in).
   */
  private pageHeight = 0;
  /** The controls row's height as last measured (see measureDom). */
  private controlsPx = CONTROLS_PX;
  /** Replies already read to the end (or left behind): never paged again. */
  private readonly pagedOut = new Set<string>();
  private readonly measure: (id: string) => PageMeasure;
  private readonly onKey: (e: KeyboardEvent) => void;
  private readonly onResize = () => this.refresh();

  /** Stage mode: the collapsed view is the dialogue box — the current message and the tool lines after it. */
  private readonly stage: boolean;
  private readonly currentListeners = new Set<(c: CurrentLine | null) => void>();
  private readonly strangerListeners = new Set<(s: Stranger | null) => void>();
  /** The stranger present at the newest row as last told (name and face), so listeners hear only changes. */
  private strangerKey = '';
  private currentKey = '';
  /** Message controls: where they go is decided here, the buttons in message-controls.ts. */
  private readonly onControl: ((a: ControlAction) => void) | null;
  /** Stage mode: the latest line's options, in the box's bottom-left corner. */
  private readonly lineKeys = new LineKeys();
  private busy = false;
  private editingId: string | null = null;
  private decorKey = '';
  private modelLabels = new Map<string, string>();
  private labelsVersion = 0;
  private notice: { node: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;
  /** Her reply typing out: characters `[0, shown)` are visible; a pending timer shows the next one. */
  private typing: { id: string; shown: number; timer: ReturnType<typeof setTimeout> | null } | null = null;
  /** The player's text speed as a pace scale (2 slow … 0.5 fast); 0 shows her replies as they come. */
  private pace = 1;
  private readonly reducedMotion: boolean;
  private readonly pageEnd: PageEnd;
  /** Everyone else here, whose marked lines are their own beats (the who's-here strip's people). */
  private others: { id: string; name: string; accent: string }[] = [];
  /**
   * The opening scene (scenario cards): its card in the archive, in its place, and its banner over
   * the box. Never an entry, so it's never the current line and never has controls. `shown`: the
   * banner was on screen at the last refresh (so it fades when it goes, rather than never appearing).
   */
  private scene: { id: string; entry: HTMLElement; banner: HTMLElement; shown: boolean } | null = null;
  /** The event now in play (encounter cards): its banner over the box, until her reaction, END SCENE or travel. */
  private event: { key: string; banner: HTMLElement; shown: boolean } | null = null;
  /** The paged reply's beat layout (when it has more than one speaker): where each beat starts. */
  private beatPage: { id: string; starts: number[]; pageHeight: number } | null = null;
  /** Each reply's action spans, by its segments array, rebuilt when segments are added (faces from actions). */
  private readonly spanCache = new WeakMap<Segment[], { count: number; spans: Array<[number, number]> }>();
  /** The node last reported as the current line (typing re-reports it as its actions grow). */
  private currentNode: HTMLElement | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly onRetry: (userMessageId: string) => void,
    measure?: (id: string) => PageMeasure,
    opts: { stage?: boolean; onControl?: (a: ControlAction) => void; reducedMotion?: boolean; pageEnd?: PageEnd } = {},
  ) {
    this.onControl = opts.onControl ?? null;
    this.measure = measure ?? ((id) => this.measureDom(id));
    this.reducedMotion = opts.reducedMotion ?? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.pageEnd = opts.pageEnd ?? ((id, page, pageHeight) => this.pageEndDom(id, page, pageHeight));
    this.stage = opts.stage === true;
    if (this.stage) root.classList.add('feed-stage');
    root.classList.add('feed-root');
    const dim = el('div', 'feed-dim');
    dim.addEventListener('click', () => this.collapse());

    const head = el('div', 'feed-head');
    head.append(el('span', 'feed-head-title', '// ARCHIVE'));
    this.count = el('span', 'feed-head-count');
    head.append(this.count, el('span', 'feed-head-hint', '[ESC] CLOSE'));

    this.list = el('div', 'feed');
    this.list.setAttribute('role', 'log');
    this.list.setAttribute('aria-live', 'polite');
    this.list.addEventListener('wheel', (e) => {
      if (!this._expanded && e.deltaY < 0) this.expand();
    });

    // The box's border and fill are their own layer, so the nameplate can sit on its top edge
    // (the list clips what overflows it).
    // Subtitles (spec 2026-10-16): a scrim under the line, and the latest line's options in the corner beside it.
    if (this.stage) root.append(dim, head, el('div', 'sub-scrim'), this.list, this.lineKeys.el);
    else root.append(dim, head, this.list);
    // No portrait until the server sends hers (it does on every connect): an empty frame, not someone else's face.
    root.classList.add('portrait-pending');

    this.onKey = (e: KeyboardEvent) => {
      if (this.controlKey(e)) return;
      if (e.key === 'PageUp') {
        if (!this._expanded) {
          e.preventDefault();
          this.expand();
        } else if (document.activeElement?.tagName === 'TEXTAREA') {
          e.preventDefault();
          this.list.scrollBy({ top: -this.list.clientHeight * 0.85 });
        }
      } else if (e.key === 'PageDown' && this._expanded && document.activeElement?.tagName === 'TEXTAREA') {
        e.preventDefault();
        this.list.scrollBy({ top: this.list.clientHeight * 0.85 });
      } else if (e.key === 'Escape' && this._expanded) {
        e.preventDefault();
        this.collapse();
      } else if (!this._expanded && (this.canTurn() || this.skipTo() !== null) && this.isPageKey(e)) {
        e.preventDefault();
        if (!this.skip()) this.advance();
      }
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
    // A face that loads after a reply was laid out (her italics load on first use) re-wraps it.
    document.fonts?.addEventListener('loadingdone', this.onResize);
  }

  /** PageDown, or Enter/Space while focus is nowhere in particular or in an empty prompt. */
  /** Whether a page key has a page to turn to (a reply in beats ends on its last speaker's page). */
  private canTurn(): boolean {
    const entry = this.pager && this.entries.get(this.pager.id);
    if (!this.pager || !entry) return false;
    if (!this.stage || entry.msg.status === 'streaming') return true;
    const beats = this.beatLayout(entry);
    const m = this.measure(entry.msg.id);
    const { pages } = beats ?? pageLayout(m.content, m.available, m.lineHeight, this.continueReserve);
    return this.pager.page < pages - 1;
  }

  private isPageKey(e: KeyboardEvent): boolean {
    const active = document.activeElement;
    // The empty prompt swallows Enter only to keep a newline out; that isn't using it.
    const emptyPrompt = active instanceof HTMLTextAreaElement && active.value === '' && active.closest('.input') !== null;
    if (e.defaultPrevented && !emptyPrompt) return false; // another handler (the journal's edit box, the HUD) consumed it
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return false;
    if (e.key === 'PageDown') return true;
    if (e.key !== 'Enter' && e.key !== ' ') return false;
    if (active instanceof HTMLTextAreaElement) return active.value === '';
    return !(active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLButtonElement);
  }

  /** Turns to the next page of the paged reply; past its last page (once she's done) it shows normally, except in the box. */
  advance(): void {
    if (!this.pager) return;
    const entry = this.entries.get(this.pager.id);
    if (!entry) return;
    const beats = this.beatLayout(entry);
    const m = this.measure(this.pager.id);
    const { pages } = beats ?? pageLayout(m.content, m.available, m.lineHeight, this.continueReserve);
    if (this.pager.page < pages - 1) this.pager.page++;
    // In the box a reply stays on its last page: unpaged, it would run under the footer (and a
    // reply in beats would show everyone at once).
    else if (!this.stage && entry.msg.status !== 'streaming') {
      this.pagedOut.add(this.pager.id);
      this.pager = null;
    }
    this.refresh();
  }

  /**
   * Re-measures and re-pages what's shown (TEXT SIZE changed the text's size), on the page that holds
   * where the reader was: the old page's start, as a share of the reply, in the new layout.
   */
  relayout(): void {
    const was = this.pager && this.pagerPages > 0 ? { id: this.pager.id, at: this.pager.page / this.pagerPages } : null;
    this.refresh();
    if (!was || this.pager?.id !== was.id || this.pagerPages <= 1) return;
    const page = Math.min(this.pagerPages - 1, Math.floor(was.at * this.pagerPages));
    if (page === this.pager.page) return;
    this.pager.page = page;
    this.refresh();
  }

  /** The text speed (the HUD's TEXT control): a pace scale, 0 for at once (which finishes a reply typing now). */
  setTextSpeed(scale: number): void {
    this.pace = scale;
    if (scale === 0) this.finishTyping();
  }

  /** Starts typing her reply from character `shown`, finishing any other reply typing first. */
  private startTyping(id: string, shown: number): void {
    this.finishTyping();
    this.typing = { id, shown, timer: null };
  }

  /** Stops typing and shows the whole reply. */
  private finishTyping(): void {
    const t = this.typing;
    if (!t) return;
    if (t.timer !== null) clearTimeout(t.timer);
    this.typing = null;
    const entry = this.entries.get(t.id);
    if (!entry) return;
    this.render(entry, null);
    // The whole line is in sight now: its actions are all of them (a skip, instant speed, the last tick).
    if (this.stage && this.currentNode === entry.node) this.reportCurrent(entry.node);
  }

  /** Re-renders an entry's text with its frontier, keeping the page's scroll where it was. */
  private render(entry: Entry, shown: number | null): void {
    const top = entry.text.scrollTop;
    if (entry.beats.length > 0) {
      renderBeats(entry.text, entry.segments, entry.beats, shown, this.accentOf);
      this.applyBeatMargins(entry);
    } else renderFrontier(entry.text, entry.segments, shown);
    entry.text.scrollTop = top;
    markBusy(entry.text, shown !== null || entry.msg.status === 'streaming');
    // Lore words once the line is all there (not while it types or streams).
    if (shown === null && entry.msg.status !== 'streaming' && loreLine(entry.msg)) markLore(entry.text);
  }

  /** How far typing may go now: the text so far, or while paged the end of the page showing. */
  private limit(entry: Entry): number {
    const len = entry.msg.text.length;
    if (this.pager?.id !== entry.msg.id) return len;
    const end = Math.min(len, this.pageEnd(entry.msg.id, this.pager.page, this.pageHeight));
    // A reply in beats: typing stops at the end of this speaker's words, in sight — not in the
    // hidden blank line and marker that open the next speaker's page.
    const bp = this.beatPage?.id === entry.msg.id ? this.beatPage : null;
    if (!bp) return end;
    const i = beatOnPage(bp.starts, this.pager.page, bp.pageHeight);
    const next = entry.beats[i + 1];
    if (!next) return end;
    let words = next.start;
    while (words > entry.beats[i].bodyStart && /\s/.test(entry.msg.text[words - 1])) words--;
    return Math.min(end, words);
  }

  /** Where a skip would jump the typing frontier to; null when nothing is typing behind its limit. */
  private skipTo(): number | null {
    const entry = this.typing && this.entries.get(this.typing.id);
    if (!this.typing || !entry) return null;
    const limit = this.limit(entry);
    return this.typing.shown < limit ? limit : null;
  }

  /** A page key, [CONTINUE] or a click on her text while she types: shows the rest of the page. False if nothing to skip. */
  private skip(): boolean {
    const to = this.skipTo();
    if (to === null || !this.typing) return false;
    if (this.typing.timer !== null) clearTimeout(this.typing.timer);
    this.typing = { ...this.typing, shown: to, timer: null };
    this.paint();
    return true;
  }

  /** Shows the next character (with any asterisks after it: markup isn't typed). */
  private tick(): void {
    const t = this.typing;
    const entry = t && this.entries.get(t.id);
    if (!t || !entry) return;
    t.timer = null;
    const limit = this.limit(entry);
    t.shown = Math.min(t.shown + 1, limit);
    while (entry.markup && t.shown < limit && entry.msg.text[t.shown] === '*') t.shown++;
    this.paint();
  }

  /** Renders the typing reply at its frontier and keeps the timer going while it's behind its limit; ends typing once done. */
  private paint(): void {
    const t = this.typing;
    if (!t) return;
    const entry = this.entries.get(t.id);
    if (!entry) return this.finishTyping();
    // Typed past the page end (it caught up with the stream, then the reply grew into pages): the
    // overflow wasn't read yet, so it un-types and comes in front of the reader on the next page.
    const limit = this.limit(entry);
    if (t.shown > limit) t.shown = limit;
    if (t.shown >= entry.msg.text.length && entry.msg.status !== 'streaming') return this.finishTyping();
    this.render(entry, t.shown);
    if (this.stage && this.currentNode === entry.node) this.reportCurrent(entry.node);
    // The wait follows the character just shown (before the first, index -1: the base pace).
    if (t.timer === null && t.shown < limit) t.timer = setTimeout(() => this.tick(), charDelay(entry.msg.text, t.shown - 1) * this.pace);
  }

  /** While she replies (or a turn is pending) every control is disabled. */
  setBusy(busy: boolean): void {
    if (this.busy === busy) return;
    this.busy = busy;
    this.decorKey = '';
    this.refresh();
  }

  /** Every line in the feed, oldest first (time order, as shown). */
  messages(): ChatMessage[] {
    return this.ordered();
  }

  /** The message as the feed holds it (for undo). */
  get(id: string): ChatMessage | undefined {
    return this.entries.get(id)?.msg;
  }

  /** Drops deleted lines (delete, rewind). */
  remove(ids: string[]): void {
    if (this.scene && ids.includes(this.scene.id)) this.setScene(null);
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      entry.node.remove();
      this.entries.delete(id);
      if (this.editingId === id) this.editingId = null;
    }
    this.restrange();
    this.decorKey = '';
    this.refresh();
  }

  /**
   * An event, END SCENE or move went or came back out of order (a delete, UNDO): her replies whose
   * stranger changed are redrawn with the right pages.
   */
  private restrange(): void {
    for (const [id, entry] of this.entries) {
      if (entry.msg.role !== 'agent' || this.strangerFor(entry.msg) === entry.stranger) continue;
      if (this.typing?.id === id) continue; // still typing out: it settles on its next redraw
      const fresh = this.build(entry.msg, false);
      entry.node.replaceWith(fresh.node);
      this.entries.set(id, fresh);
    }
  }

  /**
   * A quiet line under the feed (`// LINE DELETED · UNDO`); with an action, a button for it for 6 s. A
   * `polite` one gives way to a notice already showing (returns false then).
   */
  showNotice(text: string, action?: { label: string; run: () => void }, o: { polite?: boolean } = {}): boolean {
    if (o.polite && this.notice) return false;
    if (this.notice) {
      clearTimeout(this.notice.timer);
      this.notice.node.remove();
    }
    const node = el('div', 'feed-notice', text);
    const close = () => {
      if (this.notice?.node === node) this.notice = null;
      node.remove();
    };
    if (action) {
      const b = el('button', 'notice-action', action.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        close();
        action.run();
      });
      node.append(' ', b);
    }
    this.root.append(node);
    this.notice = { node, timer: setTimeout(close, action ? NOTICE_UNDO_MS : NOTICE_MS) };
    return true;
  }

  /** Removes the feed's window listeners. */
  dispose(): void {
    this.finishTyping();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    document.fonts?.removeEventListener('loadingdone', this.onResize);
    document.documentElement.style.removeProperty('--box-fit');
    this.lineKeys.dispose();
  }

  /** Called when the stranger present at the newest row (strangerAt) changes: a quest or event row, END SCENE, travel, a rewind. */
  onStranger(fn: (s: Stranger | null) => void): () => void {
    this.strangerListeners.add(fn);
    return () => this.strangerListeners.delete(fn);
  }

  /** Tells onStranger's listeners when the newest row's stranger has changed. */
  private tellStranger(): void {
    if (this.strangerListeners.size === 0) return;
    const rows = this.ordered();
    const s = strangerAt(rows, rows.length - 1);
    const key = s ? `${s.name}\u0000${s.face ?? ''}` : '';
    if (key === this.strangerKey) return;
    this.strangerKey = key;
    for (const fn of this.strangerListeners) fn(s);
  }

  /** Stage mode: called whenever the current line (who spoke last, and its status) changes. */
  onCurrent(fn: (c: CurrentLine | null) => void): () => void {
    this.currentListeners.add(fn);
    return () => this.currentListeners.delete(fn);
  }

  get expanded(): boolean {
    return this._expanded;
  }

  /** Points every avatar (present and future) at a new portrait; the 2x variant is derived from it. */
  setPortrait(url: string, kind: 'face' | 'mask' | 'monogram' = 'mask', name?: string): void {
    this.root.style.setProperty('--portrait', cssUrl(url));
    this.root.style.setProperty('--portrait-2x', cssUrl(kind === 'mask' ? portrait2x(url) : url));
    this.root.classList.remove('portrait-pending');
    this.root.classList.toggle('portrait-face', kind === 'face');
    this.root.classList.toggle('portrait-monogram', kind === 'monogram');
    if (kind === 'monogram') this.root.style.setProperty('--monogram', JSON.stringify((name ?? '?').charAt(0).toUpperCase()));
  }

  /** The agent's display name on her messages (upper-cased), including ones already in the feed. */
  setAgentName(name: string): void {
    this.agentName = name.toUpperCase();
    for (const n of this.list.querySelectorAll('.msg.agent:not(.other-page):not(.stranger-page) .name')) n.textContent = this.agentName;
  }

  /** The player's persona name on his lines (upper-cased), including ones already in the feed. */
  setUserName(name: string): void {
    this.userName = name.toUpperCase();
    for (const n of this.list.querySelectorAll('.msg.user .name')) n.textContent = this.userName;
  }

  /**
   * Everyone else here (Hae at her stall, Silas at home): their `Name:` paragraphs in replies become
   * their own beats, each with their own page, nameplate and accent. Every reply already shown is redrawn.
   */
  setOthers(others: { id: string; name: string; accent: string }[]): void {
    this.others = others.map((o) => ({ ...o }));
    // An open editor is redrawn away with its line: the line gets its controls back.
    this.editingId = null;
    // A reply typing out keeps typing from where it was (the room may change places mid-reply).
    const typing = this.typing && { id: this.typing.id, shown: this.typing.shown };
    if (this.typing?.timer != null) clearTimeout(this.typing.timer);
    this.typing = null;
    for (const [id, entry] of this.entries) {
      if (entry.msg.role !== 'agent') continue;
      const fresh = this.build(entry.msg, false);
      entry.node.replaceWith(fresh.node);
      this.entries.set(id, fresh);
    }
    if (typing && this.entries.has(typing.id)) this.startTyping(typing.id, typing.shown);
    this.decorKey = '';
    this.refresh();
  }

  /** Her reply's beats with others or a stranger here; empty when it's an ordinary reply (one beat, hers, unmarked). */
  private beatsFor(m: ChatMessage, stranger: string | null): Beat[] {
    if ((this.others.length === 0 && !stranger) || m.role !== 'agent' || m.mode === 'ooc') return [];
    const beats = speakerBeats(m.text, this.others, this.agentName, stranger);
    const ordinary = beats.length === 1 && beats[0].who === 'contact' && beats[0].bodyStart === beats[0].start;
    return ordinary ? [] : beats;
  }

  setHistory(messages: ChatMessage[]): void {
    this.finishTyping();
    this.entries.clear();
    this.list.replaceChildren();
    this.setScene(messages.find((m) => m.mode === 'scene') ?? null);
    for (const m of messages) if (!isGreetLine(m) && m.mode !== 'scene') this.append(m, false);
    this.refresh(true);
  }

  upsert(m: ChatMessage): void {
    if (isGreetLine(m)) return; // where the user walked in: scaffolding for her, nothing to show
    if (m.mode === 'scene') {
      this.setScene(m);
      this.refresh();
      return;
    }
    const existing = this.entries.get(m.id);
    if (existing && this.editingId === m.id) this.editingId = null; // the server changed it under the editor
    // Keep going: the old text is a prefix of the reopened one — resume where it left off, not page 1.
    const keepGoing = existing !== undefined && this.isKeepGoing(existing.msg, m);
    const resume = keepGoing ? this.resumePage(m.id) : undefined;
    // Reopened for more text (a new take, keep going): it pages again like a fresh reply.
    const reopened = existing !== undefined && m.status === 'streaming' && existing.msg.status !== 'streaming';
    if (reopened) this.pagedOut.delete(m.id);
    // Text that doesn't carry on from what was there (a swipe, an edit, a new take) is read from page 1.
    if (existing && !keepGoing && this.pager?.id === m.id && !m.text.startsWith(existing.msg.text)) this.pager = null;
    if (existing) {
      // An update while she's still streaming (her expression changed) carries the server's copy of
      // the text, which lags the deltas: keep what's streamed so far, take everything else.
      if (existing.msg.status === 'streaming' && m.status === 'streaming') m = { ...m, text: existing.msg.text };
      // Text that doesn't carry on from what's typing (a swipe, an edit) shows at once — as does
      // text the stream never produced (a regenerate that failed before any: the old reply restored).
      const unstreamed = existing.msg.status === 'streaming' && existing.msg.text === '' && m.status !== 'streaming';
      if (this.typing?.id === m.id && (unstreamed || !m.text.startsWith(existing.msg.text))) this.finishTyping();
      const fresh = this.build(m, false);
      existing.node.replaceWith(fresh.node);
      this.entries.set(m.id, fresh);
    } else {
      this.finishTyping(); // a new entry replaces the box: the typing reply shows at once
      this.append(m, true);
    }
    // Her new reply types out as it streams; keep going types only the new text (even if the old text
    // was still typing: it resumes on the old text's last page, all shown), any other reopen from the start.
    const types = m.role === 'agent' && (existing ? reopened : m.status === 'streaming');
    if (types && !this.reducedMotion && this.pace > 0 && !this._expanded && (keepGoing || this.typing?.id !== m.id)) this.startTyping(m.id, keepGoing ? existing!.msg.text.length : 0);
    if (resume !== undefined) {
      this.pagedOut.delete(m.id);
      this.pager = { id: m.id, page: resume };
    }
    this.refresh();
  }

  /** Keep going reopens her reply for streaming with the same text she already had, to add to it. */
  private isKeepGoing(existing: ChatMessage, m: ChatMessage): boolean {
    return m.status === 'streaming' && existing.status !== 'streaming' && m.text !== '' && m.text.startsWith(existing.text);
  }

  /** The last page of the reply as it stood before the reopen: where paging should resume. */
  private resumePage(id: string): number {
    const entry = this.entries.get(id);
    const beats = entry ? this.beatLayout(entry) : null;
    const m = this.measure(id);
    const { pages } = beats ?? pageLayout(m.content, m.available, m.lineHeight, this.continueReserve);
    return Math.max(0, pages - 1);
  }

  delta(id: string, d: string): void {
    const entry = this.entries.get(id);
    if (!entry) return this.warnUnknown('delta', id);
    if (d.length === 0) return;
    entry.msg = { ...entry.msg, text: entry.msg.text + d };
    entry.segments.push(...split(entry.markup, d));
    entry.beats = this.beatsFor(entry.msg, entry.stranger);
    // Laid out in full before paging measures it; past the typing frontier it stays hidden.
    this.render(entry, this.typing?.id === id ? this.typing.shown : null);
    this.refresh();
  }

  toolLine(id: string | null, text: string): void {
    const entry = id === null ? undefined : this.entries.get(id);
    if (id !== null && !entry) return this.warnUnknown('tool_line', id);
    if (entry) {
      entry.msg = { ...entry.msg, toolLines: [...entry.msg.toolLines, text] };
      const row = toolRow(text);
      row.classList.add('live');
      entry.tools.append(row);
    } else {
      const row = toolRow(text);
      row.classList.add('entry', 'live');
      this.list.append(row);
    }
    this.refresh();
  }

  expand(): void {
    if (this._expanded) return;
    this.finishTyping();
    this._expanded = true;
    this.root.classList.add('expanded');
    for (const n of this.list.querySelectorAll('.hidden-collapsed')) n.classList.remove('hidden-collapsed');
    this.refresh(true);
  }

  collapse(): void {
    if (!this._expanded) return;
    this._expanded = false;
    this.root.classList.remove('expanded');
    this.refresh(true);
  }

  private warnUnknown(kind: string, id: string): void {
    if (this.warned.has(id)) return;
    this.warned.add(id);
    console.warn(`[feed] ${kind} for unknown message ${id}; dropped`);
  }

  /** Shows the opening scene (or, null, none): its card first in the archive, its banner over the box. */
  private setScene(m: ChatMessage | null): void {
    this.scene?.entry.remove();
    this.scene?.banner.remove();
    this.scene = null;
    if (!m) return;
    const title = `THE SCENE · ${(m.scene?.title ?? '').toUpperCase()}`;
    const entry = el('article', 'entry scene-entry');
    entry.dataset.sceneId = m.id;
    entry.append(el('header', 'sb-title', title), el('div', 'sb-text', m.text));
    this.list.prepend(entry);
    const banner = el('div', 'scene-banner');
    const fold = el('span', 'sb-fold');
    const head = el('div', 'sb-head');
    head.append(el('span', 'sb-title', title), fold);
    banner.append(head, el('div', 'sb-text', m.text));
    banner.addEventListener('click', () => this.foldScene(!banner.classList.contains('folded')));
    this.scene = { id: m.id, entry, banner, shown: false };
    this.foldScene(false);
  }

  /**
   * The event in play (encounter cards §5): the newest event row with no END SCENE (that went
   * through) or move on the map after it. Its banner sits over the box (a click folds it) until her
   * reaction finishes or you answer, then fades; the archive keeps the card.
   */
  private showEvent(): void {
    const rows = this.ordered();
    const at = rows.findLastIndex((m) => m.role === 'user' && m.mode === 'encounter');
    const over = at >= 0 && rows.slice(at + 1).some((m) => m.role === 'user' && m.status !== 'failed' && (m.mode === 'end' || m.mode === 'travel'));
    const m = at >= 0 && !over ? rows[at] : null;
    const key = m ? `${m.id}:${m.status}` : '';
    if (this.event && this.event.key !== key) {
      this.event.banner.remove();
      this.event = null;
    }
    if (!m) return;
    if (!this.event) {
      const banner = el('div', 'encounter-banner');
      const head = el('div', 'eb-head');
      head.append(el('span', 'eb-title', `◆ ENCOUNTER · ${(m.encounter?.title ?? '').toUpperCase()}`));
      if (m.encounter?.stranger) head.append(el('span', 'eb-arrives', `${m.encounter.stranger.name.toUpperCase()} ARRIVES`));
      head.append(el('span', 'eb-fold'));
      banner.append(head, el('div', 'eb-text', m.text));
      if (m.status === 'failed') {
        const status = el('div', 'status');
        const retry = el('button', 'retry', 'RETRY');
        retry.type = 'button';
        retry.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onRetry(m.id);
        });
        status.append(el('span', 'status-label', '// NOT DELIVERED'), retry);
        banner.append(status);
      }
      banner.addEventListener('click', () => this.foldEvent(!banner.classList.contains('folded')));
      this.event = { key, banner, shown: false };
      this.foldEvent(false);
    }
    // Once her reaction has finished (or you answer), it has done its job.
    const answered = rows.slice(at + 1).some((x) => x.role === 'user' || x.status === 'ok');
    if (answered) this.dismiss(this.event.banner, this.event.shown);
    else this.restore(this.event.banner);
    this.event.shown = this.event.banner.isConnected && !this.event.banner.classList.contains('fading');
  }

  /** Takes a banner away: a fade when it was on screen (and motion is allowed), else at once. */
  private dismiss(banner: HTMLElement, fade: boolean): void {
    if (!banner.isConnected || banner.classList.contains('fading')) return;
    if (!fade || this.reducedMotion) {
      banner.remove();
      return;
    }
    banner.classList.add('fading');
    setTimeout(() => {
      if (banner.classList.contains('fading')) banner.remove();
    }, BANNER_FADE_MS);
  }

  /** Puts a banner back over the box (its line was deleted, or it was never up). */
  private restore(banner: HTMLElement): void {
    banner.classList.remove('fading');
    if (!banner.isConnected) this.root.append(banner);
  }

  private foldEvent(folded: boolean): void {
    if (!this.event) return;
    this.event.banner.classList.toggle('folded', folded);
    this.event.banner.querySelector('.eb-fold')!.textContent = folded ? '▸' : '▾ FOLD';
  }

  private foldScene(folded: boolean): void {
    if (!this.scene) return;
    this.scene.banner.classList.toggle('folded', folded);
    this.scene.banner.querySelector('.sb-fold')!.textContent = folded ? '▸' : '▾ FOLD';
  }

  private append(m: ChatMessage, live: boolean): void {
    const entry = this.build(m, live);
    // In time order: a line restored by UNDO goes back to its place, not to the bottom.
    const later = [...this.list.querySelectorAll<HTMLElement>('.msg, .encounter-entry')].find((n) => (this.entries.get(n.dataset.id ?? '')?.msg.ts ?? -Infinity) > m.ts);
    this.entries.set(m.id, entry);
    if (later) later.before(entry.node);
    else this.list.append(entry.node);
    // Back in its place (UNDO) before her later replies: an event or a scene's end changes who they had there.
    if (later && m.role === 'user' && (m.mode === 'encounter' || m.mode === 'end' || m.mode === 'travel')) this.restrange();
  }

  /** The lines in time order (as the feed holds them), with `m` in its place. */
  private ordered(m?: ChatMessage): ChatMessage[] {
    const rows = [...this.entries.values()].map((e) => e.msg).filter((x) => x.id !== m?.id);
    if (m) rows.push(m);
    return rows.sort((a, b) => a.ts - b.ts);
  }

  /** Who an event left here when her reply `m` was written. */
  private strangerFor(m: ChatMessage): string | null {
    if (m.role !== 'agent') return null;
    const rows = this.ordered(m);
    return strangerAt(rows, rows.findIndex((x) => x.id === m.id))?.name ?? null;
  }

  /** An event's row: its card at its place in the archive (the banner shows it over the box). */
  private buildEncounter(m: ChatMessage): Entry {
    const node = el('article', `entry encounter-entry s-${m.status}`);
    node.dataset.id = m.id;
    const head = el('header', 'meta');
    head.append(el('span', 'eb-title', `◆ ENCOUNTER · ${(m.encounter?.title ?? '').toUpperCase()}`), el('time', 'ts', hhmm(m.ts)));
    if (m.encounter?.stranger) head.append(el('span', 'eb-arrives', `${m.encounter.stranger.name.toUpperCase()} ARRIVES`));
    const text = el('div', 'text');
    text.textContent = m.text;
    const tools = el('div', 'tools');
    const foot = el('div', 'foot');
    node.append(head, text, foot);
    return { msg: m, node, text, tools, foot, markup: null, segments: [], beats: [], stranger: null, beatMargins: null };
  }

  private build(m: ChatMessage, live: boolean): Entry {
    if (m.mode === 'encounter' && m.role === 'user') return this.buildEncounter(m);
    const node = el('article', `entry msg ${m.role} s-${m.status}`);
    if (live) node.classList.add('live');
    if (m.mode === 'ooc') node.classList.add('ooc');
    if (m.mode === 'end' && m.role === 'user') node.classList.add('end');
    if (m.mode === 'greet') node.classList.add('greet');
    // A move on the map: an action line, not something said, so no bubble.
    if (m.mode === 'travel' && m.role === 'user') node.classList.add('travel');
    node.dataset.id = m.id;
    if (m.role === 'agent') node.append(avatar(m.status));

    const meta = el('header', 'meta');
    meta.append(el('span', 'name', m.role === 'agent' ? this.agentName : this.userName), el('time', 'ts', hhmm(m.ts)));
    if (m.mode === 'ooc') meta.append(el('span', 'ooc-tag', 'OOC'));
    if (m.mode === 'end' && m.role === 'user') meta.append(el('span', 'end-tag', m.leave ? 'LEAVE' : 'END SCENE'));
    node.append(meta);
    // A finished gig run: its amber card, then the action line under it.
    if (m.mode === 'gig' && m.role === 'user' && m.gig) {
      node.classList.add('gig-row');
      node.append(gigCard(m.gig));
    }
    // A finished liar's dice game: its card, then the action line under it.
    if (m.mode === 'dice' && m.role === 'user' && m.dice) {
      node.classList.add('dice-row');
      node.append(diceCard(m.dice));
    }

    // A quest's beat or pick (quest lines spec §3): its title, the pick line as yours, then the written text.
    let shown = m.text;
    if (m.mode === 'quest' && m.role === 'user' && m.quest) {
      node.classList.add('quest-row');
      node.append(el('div', 'qr-head', `◆ QUEST · ${m.quest.title.toUpperCase()}`));
      const pick = m.quest.pick?.line;
      if (pick && shown.startsWith(pick)) {
        node.append(el('div', 'qr-pick', pick));
        shown = shown.slice(pick.length).replace(/^\n+/, '');
      }
    }

    const markup = m.mode === 'ooc' ? null : createMarkup();
    const text = el('div', 'text');
    const segments = split(markup, shown);
    const stranger = this.strangerFor(m);
    const beats = this.beatsFor(m, stranger);
    if (beats.length > 0) renderBeats(text, segments, beats, null, this.accentOf);
    else renderFrontier(text, segments, null);
    if (m.mode === 'quest') passiveLabels(text);
    markBusy(text, m.status === 'streaming');
    if (m.status !== 'streaming' && loreLine(m)) markLore(text);
    if (m.role === 'agent') {
      text.addEventListener('click', () => {
        if (this.typing?.id === m.id) this.skip();
      });
    }
    node.append(text);

    const tools = el('div', 'tools');
    for (const line of m.toolLines) tools.append(toolRow(line));
    const foot = el('div', 'foot');
    foot.append(tools);
    node.append(foot);

    const retryTarget = m.role === 'user' && m.status === 'failed' ? m.id : m.role === 'agent' && m.status === 'lost' ? m.replyTo : undefined;
    if (m.status === 'failed' || m.status === 'lost') {
      const status = el('div', 'status');
      status.append(el('span', 'status-label', m.status === 'lost' ? '// SIGNAL LOST' : '// NOT DELIVERED'));
      if (retryTarget !== undefined) {
        const btn = el('button', 'retry', 'RETRY');
        btn.type = 'button';
        btn.addEventListener('click', () => this.onRetry(retryTarget));
        status.append(btn);
      }
      node.append(status);
    }

    return { msg: m, node, text, tools, foot, markup, segments, beats, stranger, beatMargins: null };
  }

  /** Re-applies the collapsed window (and paging) and keeps the view pinned to the newest entry. */
  private refresh(forceBottom = false): void {
    this.tellStranger();
    const all = [...this.list.children] as HTMLElement[];
    const current = this.stage ? this.currentIndex(all) : -1;
    // Controls first, so paging measures the message as it will stand.
    this.decorate(all);
    const paged = this.applyPaging(all, current);
    if (!this._expanded) {
      const cut = this.stage ? current : paged ? all.length - 1 : all.length - COLLAPSED_VISIBLE;
      // In the box, only standalone tool lines may follow the current message (an empty reply waits).
      // The opening scene's card is the banner's while collapsed: the archive shows it in its place.
      all.forEach((n, i) => n.classList.toggle('hidden-collapsed', i < cut || (this.stage && i > cut && n.classList.contains('msg')) || n.classList.contains('scene-entry') || n.classList.contains('encounter-entry') || n.classList.contains('quest-row')));
    }
    if (this.scene) {
      // Once her greeting has finished (or you answer, or END SCENE went through), the banner goes; the archive keeps its card.
      const done = [...this.entries.values()].some((e) => (e.msg.role === 'user' && e.msg.status !== 'failed') || e.msg.status === 'ok');
      if (done) this.dismiss(this.scene.banner, this.scene.shown);
      else this.restore(this.scene.banner);
      this.scene.shown = this.scene.banner.isConnected && !this.scene.banner.classList.contains('fading');
    }
    this.showEvent();
    if (this.stage) this.reportCurrent(all[current]);
    this.paint();
    this.count.textContent = `${this.entries.size} ENTRIES`;

    const nearBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 80;
    if (this.stage && !this._expanded) {
      // The box shows its line from the top, where the nameplate sits. (Measured now, the box may
      // still be growing to fit.) Tool lines after the line scroll it up to show them.
      const trailing = current >= 0 && current < all.length - 1;
      this.list.scrollTop = trailing ? this.list.scrollHeight : 0;
    } else if (forceBottom || nearBottom || !this._expanded) this.list.scrollTop = this.list.scrollHeight;
  }

  /**
   * Stage mode: the index of the current message — the newest message, except that a reply still
   * empty (opened but no text yet) leaves the line before it up. -1 when there are no messages.
   */
  private currentIndex(all: HTMLElement[]): number {
    for (let i = all.length - 1; i >= 0; i--) {
      const n = all[i];
      if (!n.classList.contains('msg')) continue;
      const e = this.entries.get(n.dataset.id ?? '');
      // Her greeting is current from the start: the line before it is from the last visit.
      if (e && e.msg.role === 'agent' && e.msg.status === 'streaming' && e.msg.text === '' && e.msg.mode !== 'greet') continue;
      // A quest's beat is read in the panel above (quest cards), never in the box: the line before stays until she answers.
      if (e && e.msg.role === 'user' && e.msg.mode === 'quest') continue;
      return i;
    }
    return -1;
  }

  private reportCurrent(node: HTMLElement | undefined): void {
    const e = node ? this.entries.get(node.dataset.id ?? '') : undefined;
    this.currentNode = node;
    const c: CurrentLine | null = e ? { id: e.msg.id, role: e.msg.role, status: e.msg.status, ...this.speakerOf(e), actions: '' } : null;
    if (c && e) c.actions = this.actionsOf(e, c);
    if (c && e?.msg.role === 'agent' && e.msg.expression) c.expression = e.msg.expression;
    if (c && e?.msg.role === 'agent' && e.msg.othersExpressions) c.othersExpressions = e.msg.othersExpressions;
    this.root.classList.toggle('speaker-user', c?.role === 'user');
    this.root.classList.toggle('speaker-agent', c?.role === 'agent');
    this.root.classList.toggle('speaker-other', c?.speaker === 'other');
    const other = c?.otherId !== undefined ? this.others.find((o) => o.id === c.otherId) : undefined;
    if (other) this.root.style.setProperty('--other', other.accent);
    else this.root.style.removeProperty('--other');
    this.root.classList.toggle('speaker-stranger', c?.speaker === 'stranger');
    // Her page of a reply wears her nameplate.
    for (const n of this.list.querySelectorAll<HTMLElement>('.msg.agent.other-page, .msg.agent.stranger-page')) {
      if (n === e?.node) continue;
      n.classList.remove('other-page', 'stranger-page');
      const name = n.querySelector('.meta .name');
      if (name) name.textContent = this.agentName;
    }
    if (e?.msg.role === 'agent') {
      const theirs = c?.speaker === 'stranger';
      e.node.classList.toggle('other-page', other !== undefined);
      e.node.classList.toggle('stranger-page', theirs);
      const name = e.node.querySelector('.meta .name');
      if (name) name.textContent = other ? other.name.toUpperCase() : theirs && e.stranger ? e.stranger.toUpperCase() : this.agentName;
    }
    const key = c ? `${c.id}:${c.status}:${c.expression ?? ''}:${c.speaker}:${c.otherId ?? ''}:${JSON.stringify(c.othersExpressions ?? {})}:${c.actions}` : '';
    if (key === this.currentKey) return;
    this.currentKey = key;
    for (const fn of this.currentListeners) fn(c);
  }

  /** An other's accent, for their beat names. */
  private readonly accentOf = (id: string): string | undefined => this.others.find((o) => o.id === id)?.accent;

  /** The line's *actions* for `c`'s speaker, up to the page showing or the typing frontier (faces from actions). */
  private actionsOf(e: Entry, c: CurrentLine): string {
    const upTo = this.typing?.id === e.msg.id ? this.typing.shown : this.limit(e);
    const mine = (b: Beat) => b.who === c.speaker && (b.who !== 'other' || b.id === c.otherId);
    const ranges: Array<[number, number]> = e.beats.length === 0 ? [[0, upTo]] : e.beats.filter(mine).map((b) => [b.bodyStart, Math.min(b.end, upTo)]);
    // The spans are worked out once per new text, not per typed character.
    let cached = this.spanCache.get(e.segments);
    if (!cached || cached.count !== e.segments.length) this.spanCache.set(e.segments, (cached = { count: e.segments.length, spans: actionSpans(e.segments) }));
    return actionsIn(e.msg.text, cached.spans, ranges);
  }

  /** Who speaks on the page of `e` the box shows (the beat on the pager's page, else her first beat), and which other. */
  private speakerOf(e: Entry): { speaker: CurrentLine['speaker']; otherId?: string } {
    if (e.msg.role === 'user') return { speaker: 'user' };
    if (e.beats.length === 0) return { speaker: 'contact' };
    const paged = this.pager?.id === e.msg.id && this.beatPage?.id === e.msg.id;
    const i = paged ? beatOnPage(this.beatPage!.starts, this.pager!.page, this.beatPage!.pageHeight) : 0;
    const beat = e.beats[Math.min(i, e.beats.length - 1)];
    return beat.who === 'other' ? { speaker: 'other', otherId: beat.id! } : { speaker: beat.who };
  }

  /**
   * Stage mode, a reply with more than one speaker: a page per beat, every beat after the first
   * starting on a new page. The page is the box at rest, or as tall as the tallest beat needs (up
   * to the cap). Null for anything else (it pages by height as usual).
   */
  private beatLayout(entry: Entry): { pageHeight: number; pages: number; starts: number[]; heights: number[] } | null {
    if (!this.stage || this._expanded || entry.beats.length < 2) return null;
    const m = this.measure(entry.msg.id);
    const lh = m.lineHeight;
    const heights = m.beats && m.beats.length === entry.beats.length ? m.beats : entry.beats.map(() => m.content / entry.beats.length);
    const cap = Math.max(lh, Math.floor(m.available / lh) * lh);
    const rest = m.base !== undefined ? Math.floor(m.base / lh) * lh : 0;
    const pageHeight = Math.min(cap, Math.max(Math.ceil(Math.max(...heights) / lh) * lh, rest, lh));
    const starts = beatStarts(heights, pageHeight);
    const pages = Math.max(1, Math.ceil((starts[starts.length - 1] + heights[heights.length - 1]) / pageHeight));
    return { pageHeight, pages, starts, heights };
  }

  /** Puts each beat after the first at the top of its page (or back in the flow, with no margins). */
  private applyBeatMargins(entry: Entry): void {
    const nodes = entry.text.querySelectorAll<HTMLElement>(':scope > .beat');
    const m = entry.beatMargins;
    nodes.forEach((n, i) => {
      n.style.marginTop = m && i > 0 ? `${m.top[i]}px` : '';
      n.style.marginBottom = m && i === nodes.length - 1 ? `${m.tail}px` : '';
    });
  }

  /** Clips the newest reply to its current page when it's too long for the collapsed feed. True if paging. */
  private applyPaging(all: HTMLElement[], current = -1): boolean {
    for (const n of this.list.querySelectorAll('button.continue')) n.remove();
    for (const t of this.list.querySelectorAll<HTMLElement>('.text.paged')) {
      t.classList.remove('paged');
      t.style.maxHeight = '';
      delete t.dataset.page;
    }
    for (const e of this.entries.values()) {
      if (e.beatMargins === null) continue;
      e.beatMargins = null;
      this.applyBeatMargins(e);
    }
    this.beatPage = null;

    // Stage mode pages the current message (tool lines may follow it); otherwise the newest entry.
    const last = this.stage ? all[current] : all[all.length - 1];
    const id = last?.classList.contains('msg') && last.classList.contains('agent') ? last.dataset.id : undefined;
    this.fitBox(id);
    if (this.pager && this.pager.id !== id) {
      // Left behind by a newer entry: it stays unpaged. If instead the box fell back to an older
      // line (her reply emptied for a new take), the reply pages afresh when it returns.
      const pagerNode = this.entries.get(this.pager.id)?.node;
      const newer = last !== undefined && pagerNode !== undefined && (pagerNode.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      if (newer || !pagerNode) this.pagedOut.add(this.pager.id);
      this.pager = null;
    }
    const candidate = id === undefined ? undefined : this.entries.get(id);
    // The box always pages the reply it shows (unpaged, a long one would run under the footer).
    const entry = id === undefined || (this.pagedOut.has(id) && !this.stage) ? undefined : candidate;
    if (this._expanded || !entry) {
      this.root.classList.remove('paging');
      return false;
    }

    // It's the line the box shows: measured shown, though the last refresh may have hidden it (her
    // reply was still empty then) — a hidden node measures 0 tall and would never page.
    entry.node.classList.remove('hidden-collapsed');
    const beats = this.beatLayout(entry);
    const m = this.measure(entry.msg.id);
    const { pageHeight, pages } = beats ?? pageLayout(m.content, m.available, m.lineHeight, this.continueReserve);
    if (beats) {
      // Each beat after the first is pushed down to the top of its page.
      const n = beats.starts.length;
      entry.beatMargins = {
        top: beats.starts.map((s, i) => (i === 0 ? 0 : s - (beats.starts[i - 1] + beats.heights[i - 1]))),
        tail: Math.max(0, pages * pageHeight - (beats.starts[n - 1] + beats.heights[n - 1])),
      };
      this.applyBeatMargins(entry);
      this.beatPage = { id: entry.msg.id, starts: beats.starts, pageHeight };
    }
    if (pages <= 1) {
      // It fits (or fits again): no paging, and nothing to hold on to — never [CONTINUE ▸ n/1].
      if (this.pager?.id === entry.msg.id) this.pager = null;
      this.root.classList.remove('paging');
      return false;
    }
    this.pager ??= { id: entry.msg.id, page: 0 };
    this.pager.page = Math.min(this.pager.page, Math.max(0, pages - 1));
    this.pagerPages = pages;

    const streaming = entry.msg.status === 'streaming';
    entry.text.classList.add('paged');
    entry.text.style.maxHeight = `${pageHeight}px`;
    this.pageHeight = pageHeight;
    entry.text.dataset.page = String(this.pager.page);
    entry.text.scrollTop = this.pager.page * pageHeight;

    // In the box a finished reply ends on its last page (nothing after it to continue to).
    const lastPage = this.stage && !streaming && this.pager.page >= pages - 1;
    if (!lastPage) {
      const btn = el('button', `continue${streaming ? ' more' : ''}`, `[CONTINUE ▸ ${this.pager.page + 1}/${Math.max(1, pages)}]`);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        if (!this.skip()) this.advance();
      });
      entry.foot.prepend(btn);
    }
    this.root.classList.add('paging');
    return true;
  }

  /**
   * Stage mode: the box grows (up to `--box-max`) by just what her current reply needs to fit, so a
   * reply that misses by a line or two doesn't page; past the cap it pages in the box at its cap.
   */
  private fitBox(id: string | undefined): void {
    if (!this.stage) return;
    const entry = id === undefined || this._expanded ? undefined : this.entries.get(id);
    let fit = '';
    if (entry) {
      const m = this.measure(entry.msg.id);
      const base = m.base ?? m.available;
      // A reply in beats needs the box as tall as one of its pages.
      const content = this.beatLayout(entry)?.pageHeight ?? m.content;
      if (content > base) fit = content <= m.available ? `calc(var(--box-h) + ${Math.ceil(content - base)}px)` : 'var(--box-max)';
    }
    // On :root too: what stands on the box from outside the feed (the dice tray) follows it as it grows.
    for (const el of [this.root, document.documentElement]) {
      if (fit) el.style.setProperty('--box-fit', fit);
      else el.style.removeProperty('--box-fit');
    }
  }

  /** Room a paged reply keeps for [CONTINUE]: none in the box, where it shares the footer row. */
  private get continueReserve(): number {
    return this.stage ? 0 : CONTINUE_PX;
  }

  /** The newest message, which the box's controls act on. */
  private latest(): ChatMessage | undefined {
    const nodes = this.list.querySelectorAll<HTMLElement>('.msg');
    const last = nodes[nodes.length - 1];
    return last ? this.entries.get(last.dataset.id ?? '')?.msg : undefined;
  }

  /**
   * Puts the controls where they belong: on the newest line in the box (with ◂ n/N ▸ when it has
   * takes), on every line in the archive. Rebuilt only when what they depend on changes.
   */
  private decorate(all: HTMLElement[]): void {
    if (!this.onControl) return;
    const latest = this.latest();
    const key = [this._expanded, latest?.id, latest?.role, latest?.status, latest?.takes?.index, latest?.takes?.count, latest?.model, this.labelsVersion, this.busy, this.editingId, all.length].join('|');
    if (key === this.decorKey) return;
    this.decorKey = key;
    for (const n of this.list.querySelectorAll('.controls, .takes, .model-tag')) n.remove();
    const act = this.onControl;
    // In the box the latest line's options are the line stack; it hides while that line is edited
    // (the editor's Enter / Esc are the controls) and in the archive (every line has its row there).
    const boxed = this.stage && !this._expanded;
    this.lineKeys.set(
      boxed && latest && this.editingId !== latest.id ? { msg: latest, busy: this.busy, act, startEdit: () => this.startEdit(latest.id) } : null,
    );
    for (const entry of this.entries.values()) {
      const isLatest = entry.msg.id === latest?.id;
      if (entry.msg.id === this.editingId || (!this._expanded && !isLatest)) continue;
      if (entry.msg.status === 'streaming') continue;
      // An event's card has no controls: her reaction carries them (a restored event would wait on a reply).
      if (entry.node.classList.contains('encounter-entry')) continue;
      const meta = entry.node.querySelector('.meta');
      if (entry.msg.role === 'agent' && entry.msg.model && meta) {
        const tag = document.createElement('span');
        tag.className = 'model-tag';
        tag.textContent = this.modelLabels.get(entry.msg.model) ?? modelLabel(entry.msg.model);
        tag.title = entry.msg.model;
        meta.append(tag);
      }
      const switcher = isLatest && entry.msg.role === 'agent' ? takeSwitcher(entry.msg, this.busy, act) : null;
      if (switcher) meta?.append(switcher);
      if (boxed) continue;
      const row = controlRow(entry.msg, this._expanded ? 'archive' : 'latest', this.busy, act, () => this.startEdit(entry.msg.id));
      entry.tools.after(row);
    }
  }

  /** Labels for model ids (from her MODEL menu's choices); others show the id after '/'. */
  setModelLabels(labels: Map<string, string>): void {
    this.modelLabels = labels;
    this.labelsVersion++;
    this.refresh();
  }

  private startEdit(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || !this.onControl || this.busy) return;
    const act = this.onControl;
    if (this.typing?.id === id) this.finishTyping(); // the editor takes the text's place
    this.editingId = id;
    for (const n of entry.node.querySelectorAll('.controls, .takes')) n.remove();
    if (id === this.latest()?.id) this.lineKeys.set(null);
    editInPlace(
      entry.text,
      entry.msg.text,
      (text) => act({ kind: 'edit', id, text }),
      () => {
        if (this.editingId === id) this.editingId = null;
        this.decorKey = '';
        this.refresh();
      },
    );
  }

  /** ← / → swipe, Alt+R regenerate, Alt+C keep going — on her latest line, when nothing is being typed. */
  private controlKey(e: KeyboardEvent): boolean {
    if (!this.onControl || this._expanded || this.busy || e.defaultPrevented) return false;
    const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    const typing = active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') && active.value.length > 0;
    if (typing) return false;
    const latest = this.latest();
    if (!latest || latest.status === 'streaming') return false;
    const act = this.onControl;
    const t = latest.takes;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey && latest.role === 'agent' && t && t.count > 1) {
      const index = t.index + (e.key === 'ArrowRight' ? 1 : -1);
      if (index < 0 || index >= t.count) return false;
      e.preventDefault();
      act({ kind: 'swipe', id: latest.id, index });
      return true;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      act({ kind: 'regenerate', id: latest.id });
      return true;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'c' || e.key === 'C') && latest.role === 'agent') {
      e.preventDefault();
      act({ kind: 'continue', id: latest.id });
      return true;
    }
    return false;
  }

  /** The real layout: the feed's max height minus everything in the message that isn't its text. */
  private measureDom(id: string): PageMeasure {
    const e = this.entries.get(id)!;
    const cs = getComputedStyle(e.text);
    const lineHeight = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.55;
    const feedHeight = parseFloat(getComputedStyle(this.list).maxHeight) || this.list.clientHeight;
    let chrome: number;
    let borrow = 0;
    if (this.stage) {
      // In the box the footer row (tool lines, controls, [CONTINUE]) is pinned to the bottom, out of
      // the flow, in room the line's bottom padding keeps for it whether or not it's filled yet; the
      // nameplate sits on the box's edge. So all that isn't text is the line's padding.
      chrome = e.node.offsetHeight - e.text.offsetHeight;
    } else {
      // The same box whatever state the message is in: the [CONTINUE] button and the controls row are
      // taken out as they stand (with their margins), then their room is added back as a fixed reserve
      // — the button's by pageLayout, the controls row's here, on the newest line, even while she
      // streams, so the page doesn't shrink when she finishes and it arrives.
      const btn = e.node.querySelector<HTMLElement>('button.continue');
      const row = e.node.querySelector<HTMLElement>('.controls');
      if (row) this.controlsPx = outerHeight(row);
      const reserve = this.onControl && this.latest()?.id === id ? this.controlsPx : 0;
      chrome = e.node.offsetHeight - e.text.offsetHeight - outerHeight(btn) - outerHeight(row) + reserve;
      // The message's bottom padding is only breathing room under its last row: a page may borrow
      // it, so a reply that misses by a few px still fits on one (the feed clips just padding).
      borrow = parseFloat(getComputedStyle(e.node).paddingBottom) || 0;
    }
    const available = feedHeight - chrome + borrow;
    // The box at rest is shorter than its cap (the max height measured above) by a fixed amount.
    const rest = this.stage ? cssPx(getComputedStyle(this.root).getPropertyValue('--box-h')) : NaN;
    const base = Number.isFinite(rest) && rest < feedHeight ? available - (feedHeight - rest) : undefined;
    const beats = [...e.text.querySelectorAll<HTMLElement>(':scope > .beat')].map((b) => b.offsetHeight);
    return { content: e.text.scrollHeight, available, lineHeight, ...(base !== undefined ? { base } : {}), ...(beats.length > 1 ? { beats } : {}) };
  }

  /** The real page end: binary search for the first character whose box reaches below the page's bottom edge. */
  private pageEndDom(id: string, page: number, pageHeight: number): number {
    const text = this.entries.get(id)?.text;
    const len = text?.textContent?.length ?? 0;
    const range = document.createRange();
    if (!text || typeof range.getClientRects !== 'function') return len; // no layout to measure (jsdom)
    const nodes: Array<{ node: Text; start: number }> = [];
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(), start = 0; n; n = walker.nextNode()) {
      nodes.push({ node: n as Text, start });
      start += (n as Text).length;
    }
    // Client rects are in window px; scrollTop and pageHeight in stage px (the zoomed game stage).
    const z = (text as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;
    const bottom = text.getBoundingClientRect().top + ((page + 1) * pageHeight - text.scrollTop) * z;
    const below = (i: number): boolean => {
      let k = nodes.length - 1;
      while (k > 0 && nodes[k].start > i) k--;
      range.setStart(nodes[k].node, i - nodes[k].start);
      range.setEnd(nodes[k].node, i - nodes[k].start + 1);
      const rects = range.getClientRects(); // none for hidden markup: counted as on the page
      return rects.length > 0 && rects[rects.length - 1].bottom > bottom + 0.5;
    };
    let lo = 0;
    let hi = len;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (below(mid)) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }
}
