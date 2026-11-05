/** A papers job card as the gig window deals it (gig runs spec §4); Studio's GIGS preview draws the same one. */
import type { Brief, Tier } from '../../../../shared/gig/brief';
import './gig.css';

export const TIER_LABEL: Record<Tier, string> = { easy: 'EASY ▮▯▯', medium: 'MEDIUM ▮▮▯', hard: 'HARD ▮▮▮' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * `picked` marks the dealt card in focus; `onJackIn` adds its SIT DOWN button
 * (none in a preview). `cap`: a papers board's own cap, once it's dealt (Papers spec §3.1).
 */
export function jobCard(b: Brief, opts: { picked?: boolean; onJackIn?: () => void; cap?: number }): HTMLElement {
  const card = el('article', `gig-job${opts.picked ? ' gig-on' : ''}`);
  const dl = el('dl', 'gig-job-facts');
  for (const [k, v] of [
    ['CLIENT', b.client],
    ['TARGET', b.target],
    ['TAKE', b.take],
  ])
    dl.append(el('dt', '', k), el('dd', '', v));
  const foot = el('div', 'gig-job-foot');
  foot.append(el('span', '', opts.cap === undefined ? 'RISK' : `RISK ${opts.cap}`));
  if (opts.onJackIn) {
    const go = el('button', 'gig-job-go', 'SIT DOWN');
    go.type = 'button';
    const run = opts.onJackIn;
    go.addEventListener('click', () => run());
    foot.append(go);
  }
  card.append(el('div', 'gig-job-kind', '◢ DESK'), el('div', 'gig-job-tier', TIER_LABEL[b.tier]), el('h4', 'gig-job-title', b.title), dl, el('p', 'gig-job-brief', b.text), foot);
  return card;
}
