/**
 * Booth nine's read on the board (spec §3.3; mockup papers-board.html, the hand-over): the officer's checks fill
 * the left column one line every 380 ms, each rule's card in the hand takes its mark as it's read, then the stamp
 * lands on the booth's picture with the verdict beside it, the take, and the line she hears. Under reduced motion
 * every line and the stamp are there at once. Returns a cancel for when the run is torn down mid-read.
 */
import { papersResultText } from '../../../../shared/gig/brief';
import type { Check } from '../../../../shared/papers/rules';
import { ink, type DeskRegions } from './desk-view';
import type { PapersCueName } from './sound';

export const LINE_MS = 380;
/** How long the stamp shows before the run ends (the board then offers SEND). */
export const STAMP_MS = 1400;

const LABEL = { clean: 'CLEAN', close: 'CLOSE CALL', back: 'TURNED BACK' } as const;
const WORDS = { clean: 'WAVED THROUGH', close: 'WAVED THROUGH', back: 'BACK ON THE BOAT' } as const;
const INK = { clean: 'WAVED THROUGH', close: 'WAVED THROUGH', back: 'TURNED BACK' } as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const markOf = (c: Check) => (c.overlooked ? '⌁' : !c.ok ? '✗' : c.applies ? '✓' : '–');
const clsOf = (c: Check) => (c.overlooked ? 'pp-looked' : !c.ok ? 'pp-bad' : c.applies ? 'pp-ok' : 'pp-na');

function line(c: Check): HTMLElement {
  const li = el('li', `pp-check ${clsOf(c)}`);
  const sub = c.overlooked ? 'looked past' : c.standing ? 'the papers' : !c.applies ? "doesn't apply" : c.ok ? 'passes' : 'fails';
  const body = el('span', '', c.text);
  body.append(el('small', '', sub));
  li.append(el('span', 'pp-m', markOf(c)), body);
  return li;
}

export interface BoothRead {
  checks: readonly Check[];
  result: 'clean' | 'close' | 'back';
  risk: number;
  cap: number;
  take: string;
  /** The client, for the line she hears. */
  name: string;
}

/** WALK AWAY: no read, no stamp. The booth's picture, the client back on the boat, and what she hears. */
export function showWalkedAway(r: DeskRegions, read: Omit<BoothRead, 'checks' | 'result'>): void {
  r.log.replaceChildren(el('div', 'pp-officer', 'YOU WALKED AWAY FROM THE DESK'));
  const view = el('div', 'pp-booth-view pp-back pp-walked');
  const side = el('div', 'pp-booth-side');
  const hears = el('div', 'pp-hears');
  hears.append(el('em', '', 'SHE HEARS'), `Result: ${papersResultText('back', read.risk, read.cap, read.name)}.`);
  side.append(el('div', 'pp-verdict-word', 'WALKED AWAY'), el('div', 'pp-verdict-sub', `BACK ON THE BOAT · RISK ${read.risk} / ${read.cap}`), hears);
  view.append(el('div', 'pp-booth-pic'), side);
  r.middle.replaceChildren(view);
  r.levers.replaceChildren();
  r.bottom.replaceChildren();
}

export function playBooth(r: DeskRegions, read: BoothRead, o: { reducedMotion: boolean; cue(n: PapersCueName): void; done(): void }): () => void {
  const { checks, result } = read;
  const list = el('ul', 'pp-checks');
  r.log.replaceChildren(el('div', 'pp-officer', 'BOOTH NINE · THE OFFICER READS'), list);
  const view = el('div', `pp-booth-view pp-${result}`);
  const pic = el('div', 'pp-booth-pic');
  const side = el('div', 'pp-booth-side');
  view.append(pic, side);
  r.middle.replaceChildren(view);
  r.levers.replaceChildren();
  // The bulletin's rules go into the hand as cards, each waiting for its mark.
  const ruleChecks = checks.filter((c) => !c.standing);
  const marks = ruleChecks.map(() => el('span', 'pp-rmark'));
  const hand = el('div', 'pp-hand pp-rules-hand');
  ruleChecks.forEach((c, i) => {
    const card = el('div', 'pp-rcard');
    card.append(el('span', 'pp-spec', `RULE ${i + 1}`), el('span', 'pp-rtext', c.text), marks[i]);
    hand.append(card);
  });
  r.bottom.replaceChildren(hand);

  const stamp = () => {
    const v = el('div', `pp-verdict pp-${result}`);
    v.append(ink('pp-vink', INK[result]));
    pic.append(v);
    const sum = el('div', 'pp-ledger');
    const take = el('div', 'pp-led');
    take.append(el('span', '', result === 'back' ? 'THE CROSSING' : 'TAKE'), el('span', '', result === 'back' ? 'LOST' : read.take));
    sum.append(take);
    const hears = el('div', 'pp-hears');
    hears.append(el('em', '', 'SHE HEARS'), `Result: ${papersResultText(result, read.risk, read.cap, read.name)}.`);
    side.append(el('div', 'pp-verdict-word', LABEL[result]), el('div', 'pp-verdict-sub', `${WORDS[result]} · RISK ${read.risk} / ${read.cap}`), sum, hears);
    o.cue(result);
  };
  let ruleAt = 0;
  const say = (c: Check) => {
    list.append(line(c));
    if (!c.standing) {
      const m = marks[ruleAt++];
      m.textContent = markOf(c);
      m.parentElement!.classList.add(clsOf(c));
    }
    o.cue(c.ok ? 'check' : 'fail');
  };
  if (o.reducedMotion) {
    checks.forEach(say);
    stamp();
    o.done();
    return () => {};
  }
  const timers: ReturnType<typeof setTimeout>[] = [];
  checks.forEach((c, i) => timers.push(setTimeout(() => say(c), LINE_MS * (i + 1))));
  const end = LINE_MS * (checks.length + 1);
  timers.push(setTimeout(stamp, end));
  timers.push(setTimeout(() => o.done(), end + STAMP_MS));
  return () => timers.forEach(clearTimeout);
}
