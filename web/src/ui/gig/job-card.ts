/** A job card as the hack window deals it (gig runs spec §4); Studio's GIGS preview draws the same one. */
import { gigKind, tierMax, type Brief } from '../../../../shared/gig/brief';
import type { Tier } from '../../../../shared/gig/rules';
import './gig.css';

export const TIER_LABEL: Record<Tier, string> = { easy: 'EASY ▮▯▯', medium: 'MEDIUM ▮▮▯', hard: 'HARD ▮▮▮' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const KIND = { hack: { label: '◢ GRID', go: 'JACK IN' }, slip: { label: '◢ FLOOR', go: 'SLIP IN' }, papers: { label: '◢ DESK', go: 'SIT DOWN' } } as const;

/**
 * `picked` marks the dealt card in focus; `onJackIn` adds its go button — JACK IN, SLIP IN or SIT DOWN by kind
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
  const kind = gigKind(b);
  foot.append(el('span', '', kind === 'papers' ? (opts.cap === undefined ? 'RISK' : `RISK ${opts.cap}`) : `${kind === 'slip' ? 'HEAT' : 'TRACE'} ${tierMax(kind, b.tier)}`));
  if (opts.onJackIn) {
    const go = el('button', 'gig-job-go', KIND[kind].go);
    go.type = 'button';
    const run = opts.onJackIn;
    go.addEventListener('click', () => run());
    foot.append(go);
  }
  card.append(el('div', 'gig-job-kind', KIND[kind].label), el('div', 'gig-job-tier', TIER_LABEL[b.tier]), el('h4', 'gig-job-title', b.title), dl, el('p', 'gig-job-brief', b.text), foot);
  return card;
}
