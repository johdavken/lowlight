/**
 * Booth nine's walk-through (spec §3.3): the officer reads each check, one line every 380 ms,
 * over booth.jpg; then the verdict stamp. Under reduced motion every line and the stamp are
 * there at once. Returns a cancel for when the run is torn down mid-read.
 */
import type { Check } from '../../../../shared/papers/rules';
import type { PapersCueName } from './sound';

export const LINE_MS = 380;
/** How long the stamp shows before the window's result screen. */
export const STAMP_MS = 1400;

const LABEL = { clean: 'CLEAN', close: 'CLOSE CALL', back: '' } as const;
const WORDS = { clean: 'WAVED THROUGH', close: 'WAVED THROUGH', back: 'TURNED BACK' } as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function line(c: Check): HTMLElement {
  const cls = c.overlooked ? 'pp-looked' : !c.ok ? 'pp-bad' : c.applies ? 'pp-ok' : 'pp-na';
  const li = el('li', `pp-check ${cls}`);
  const sub = c.overlooked ? 'looked past' : c.standing ? 'the papers' : !c.applies ? "doesn't apply" : c.ok ? 'passes' : 'fails';
  const body = el('span', '', c.text);
  body.append(el('small', '', sub));
  li.append(el('span', 'pp-m', c.overlooked ? '⌁' : c.ok ? '✓' : '✗'), body);
  return li;
}

export function playBooth(
  host: HTMLElement,
  checks: readonly Check[],
  result: 'clean' | 'close' | 'back',
  o: { reducedMotion: boolean; cue(n: PapersCueName): void; done(): void },
): () => void {
  const view = el('div', 'pp-booth-view');
  const list = el('ul', 'pp-checks');
  view.append(el('div', 'pp-officer', 'BOOTH NINE · THE OFFICER READS'), list);
  host.replaceChildren(view);
  const stamp = () => {
    const v = el('div', `pp-verdict pp-${result}`);
    v.append(el('span', 'pp-ink', WORDS[result]), LABEL[result]);
    view.append(v);
    o.cue(result);
  };
  const say = (c: Check) => {
    list.append(line(c));
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
