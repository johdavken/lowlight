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

export interface JobColumn {
  /** The job's title, its text and a line under the head (SETUP's district, tier and heat); none of either: the column goes. `extra` stands under the text (a debrief's rolls). */
  show(title: string, text: string | null | undefined, sub?: string, extra?: HTMLElement | null): void;
  clear(): void;
  /** The contact's words on the line in the text shown (`{{ }}` on a beat), and who says them: they stand apart, in CRT. */
  setOnLine(who: string, words: string[]): void;
}

/** `text` with each of `words` lifted out into a CRT line, under `who`. */
function lineNodes(text: string, who: string, words: string[]): Node[] {
  const at = words.map((w) => ({ w, i: text.indexOf(w) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i)[0];
  if (!at) return [document.createTextNode(text)];
  const said = document.createElement('span');
  said.className = 'jc-line';
  said.dataset.who = `${who} (ON COMMS)`;
  said.textContent = at.w;
  const before = text.slice(0, at.i);
  return [...(before ? [document.createTextNode(before)] : []), said, ...lineNodes(text.slice(at.i + at.w.length), who, words)];
}

/**
 * `root` is the feed's root (`job-col` goes on it); the column stands in its own layer on `layerHost` (the game
 * stage). `onLine` hears when her line narrows or widens, so the feed re-pages it at its new width.
 */
export function mountJobColumn(root: HTMLElement, layerHost: HTMLElement, onLine?: () => void): JobColumn {
  const layer = document.createElement('div');
  layer.className = 'jc-layer';
  const col = document.createElement('section');
  col.className = 'jc';
  col.hidden = true;
  const head = document.createElement('div');
  head.className = 'jc-head';
  const sub = document.createElement('div');
  sub.className = 'jc-sub';
  const body = document.createElement('div');
  body.className = 'jc-body';
  // The fade at the top shows only when there's more above (scrolled down).
  body.addEventListener('scroll', () => col.classList.toggle('jc-more', body.scrollTop > 2), { passive: true });
  col.append(head, sub, body);
  layer.append(col);
  layerHost.append(layer);
  let shown = '';
  let shownText = '';
  let shownExtra: HTMLElement | null = null;
  let line = { who: '', words: [] as string[] };
  /** The text's nodes, with the words on the line drawn apart. */
  const draw = () => {
    const nodes = proseNodes(shownText).flatMap((n) => {
      if (n instanceof Text) return lineNodes(n.data, line.who, line.words);
      (n as HTMLElement).replaceChildren(...lineNodes(n.textContent ?? '', line.who, line.words));
      return [n];
    });
    body.replaceChildren(...nodes, ...(shownExtra ? [shownExtra] : []));
    passiveLabels(body);
    markLore(body);
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
    shown = '';
    col.classList.remove('jc-new');
    col.hidden = true;
    split(false);
  };
  return {
    show(title, text, subLine, extra = null) {
      if (!text && !subLine && !extra) return clear();
      const key = `${title}\n${subLine ?? ''}\n${text}`;
      // The same text again (a quest_state that changed something else) keeps where you'd scrolled to.
      if (key === shown && extra === shownExtra && !col.hidden) return;
      if (!col.hidden && text && text !== shownText) pulse();
      shown = key;
      shownText = text ?? '';
      shownExtra = extra;
      head.textContent = `◆ JOB · ${title.toUpperCase()}`;
      sub.textContent = subLine ?? '';
      sub.hidden = !subLine;
      draw();
      body.scrollTop = 0;
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
  };
}
