/**
 * A new game's opening on the cards panel (cards-panel.ts), in SUGGEST's cyan: three openings her
 * model writes for the pair (HISTORY, BUSINESS, CHANCE), under a head with both faces and the tie
 * between them. Enter starts the game with one, E puts it in the box to edit, R deals three more,
 * Esc goes back to the screen. Text goes in through textContent.
 */
import type { SceneKind, SceneOption } from '../../../shared/scenario';
import type { OpeningSet } from '../net/scenario';
import { CardsPanel, el } from './cards-panel';
import { withActions } from './suggest-panel';

export const OPENING_COPY = {
  title: 'OPENING',
  loading: '// DEALING THREE OPENINGS…',
  failed: (why: string) => `// NO OPENINGS — ${why}`,
  redraw: '↻ REDRAW',
  cancel: '[ESC] BACK',
  hints: '[▲▼] CHOOSE · [ENTER] OPEN WITH IT · [E] EDIT IT FIRST · [R] REDRAW · [ESC] BACK',
  steer: (s: string) => `STEER: ${s}`,
} as const;

export const OPENING_WORD: Record<SceneKind, string> = { history: 'HISTORY', business: 'BUSINESS', chance: 'CHANCE' };
/** A few words on each kind, beside its name. */
export const OPENING_WHAT: Record<SceneKind, string> = { history: 'something already between them', business: 'one needs something tonight', chance: 'the place throws them together' };
/** Each kind's picture (art/cards/sheet-05.png, cut like the table cards). */
export const OPENING_ART: Record<SceneKind, string> = { history: '/opening/history.webp', business: '/opening/business.webp', chance: '/opening/chance.webp' };

const thumb = (id: string) => `/api/agents/${encodeURIComponent(id)}/thumb`;

/** The pair's head: your face, YOU × HER, where and when, the tie; filled in by `fill` once a set says who you are. */
export function pairHead(her: { id: string; name: string }, where: string): { el: HTMLElement; fill(pair: OpeningSet['pair']): void } {
  const head = el('div', 'op-pair');
  const you = el('div', 'op-face');
  const hers = el('div', 'op-face op-her');
  hers.style.backgroundImage = `url("${thumb(her.id)}")`;
  const mid = el('div', 'op-mid');
  const youName = el('span', 'op-you', 'YOU');
  const names = el('div', 'op-names');
  names.append(youName, el('span', 'op-x', '×'), el('span', 'op-hername', her.name.toUpperCase()));
  const tie = el('div', 'op-tie');
  tie.hidden = true;
  mid.append(names, el('div', 'op-where', where), tie);
  head.append(you, mid, hers);
  return {
    el: head,
    fill(pair) {
      you.style.backgroundImage = `url("${thumb(pair.player.id)}")`;
      youName.textContent = (pair.player.name || 'YOU').toUpperCase();
      // Her note on you, written to her ("you signed his slip"): said as hers.
      tie.textContent = pair.tie ? `${her.name.toUpperCase()} ON ${(pair.player.name || 'YOU').toUpperCase()}: ${pair.tie}` : '';
      tie.hidden = !pair.tie;
    },
  };
}

export interface OpeningPanelOptions {
  her: { id: string; name: string };
  /** `LOWLIGHT INTAKE · KARASU · THU 20:00 · RAIN` */
  where: string;
  /** What was typed in the box (null: nothing). */
  steer: string | null;
  cached: OpeningSet | null;
  load(): Promise<OpeningSet>;
  /** Start the game with this opening; a refusal's words (the room's still loading), or null when it went. */
  onStart(text: string): string | null;
  onEdit(text: string): void;
  onCancel(): void;
  onCache(set: OpeningSet): void;
}

export function openOpeningPanel(host: HTMLElement, o: OpeningPanelOptions): CardsPanel<SceneOption> {
  const head = pairHead(o.her, o.where);
  if (o.cached) head.fill(o.cached.pair);
  let panel: CardsPanel<SceneOption> | null = null;
  panel = new CardsPanel<SceneOption>(host, {
    copy: OPENING_COPY,
    hostClass: 'suggest-host opening-host',
    header: o.where,
    head: head.el,
    ...(o.steer ? { note: OPENING_COPY.steer(o.steer) } : {}),
    cached: o.cached?.options ?? null,
    load: () =>
      o.load().then((set) => {
        head.fill(set.pair);
        o.onCache(set);
        return set.options;
      }),
    card: (s) => ({ title: OPENING_WORD[s.kind], sub: OPENING_WHAT[s.kind], art: OPENING_ART[s.kind], text: withActions(s.text) }),
    // The route's errors are already in the hint's words (net/suggest.ts).
    failed: (err) => OPENING_COPY.failed(err instanceof Error && err.message ? err.message : 'SOMETHING WENT WRONG'),
    onPlay: (s) => {
      const why = o.onStart(s.text);
      if (why) panel?.showRefusal(why);
    },
    onCancel: o.onCancel,
    onCache: () => {}, // the set (with its pair) is kept in load
    extraKey: (k, s) => {
      if (k !== 'e' && k !== 'E') return false;
      o.onEdit(s.text);
      return true;
    },
  });
  return panel;
}
