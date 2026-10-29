/**
 * A job's debrief (small jobs spec §6): one card at its end, before her closing turn. The tier stamped
 * with its cue, each check and crack, then the totals: the sol counting up, the heat, the rep (with a
 * tier crossing spelled out), a deck gained or lost, and the cover that softened a blown job.
 */
import { repTier, TIER_NAMES } from '../../../shared/mission';
import { GIG_RESULT_LINE } from '../../../shared/bigjob';
import type { Debrief } from '../../../shared/types';

const COUNT_STEPS = 12;
const COUNT_MS = 40;

const el = (tag: string, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const upper = (id: string) => id.replace(/-/g, ' ').toUpperCase();
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

/** One check's line: `TECH 74% · 91 no · 40 clean`, or a crack's `CRACK · 2 TRIES USED · ACCESS GRANTED`. */
function rollText(c: Debrief['checks'][number]): string {
  if (c.crack) return `CRACK · ${c.crack.tries} ${c.crack.tries === 1 ? 'TRY' : 'TRIES'} USED · ${c.crack.state === 'granted' ? 'ACCESS GRANTED' : 'LOCKED OUT'}`;
  const rolls = c.rolls ?? [];
  const last = rolls.length - 1;
  return [`${c.stat} ${c.chance}%`, ...rolls.map((r, i) => `${r} ${i === last && r <= (c.chance ?? 0) ? 'clean' : 'no'}`)].join(' · ');
}

export function debriefEl(d: Debrief, o: { cue(name: 'clean' | 'messy' | 'blown'): void; reduced: boolean }): HTMLElement {
  const box = el('div', `db db-${d.tier}`);
  box.append(el('div', 'db-tier', d.tier.toUpperCase()));
  o.cue(d.tier);
  if (d.checks.length) {
    const list = el('div', 'db-checks');
    for (const c of d.checks) {
      const row = el('div', 'db-check');
      row.append(el('div', 'db-line', c.line), el('div', 'db-roll', rollText(c)));
      list.append(row);
    }
    box.append(list);
  }
  // A big job (big jobs spec §4): the clues found, how the read went (never its words), the gig.
  if (d.big) {
    if (d.big.clues.length) {
      const ul = el('ul', 'db-clues');
      for (const c of d.big.clues) ul.append(el('li', '', c));
      box.append(ul);
    }
    if (d.big.read) box.append(el('div', 'db-read', `READ · ${d.big.read.toUpperCase()}`));
    if (d.big.gig) box.append(el('div', 'db-gig', `${d.big.gig.kind.toUpperCase()} · ${d.big.gig.tier.toUpperCase()} · ${GIG_RESULT_LINE[d.big.gig.result]}`));
  }
  const totals = el('div', 'db-totals');
  const sol = el('div', 'db-sol', `${o.reduced ? d.sol : 0} SOL`);
  totals.append(sol);
  if (!o.reduced && d.sol !== 0) {
    let i = 0;
    const step = () => {
      i++;
      sol.textContent = `${Math.round((d.sol * i) / COUNT_STEPS)} SOL`;
      if (i < COUNT_STEPS) setTimeout(step, COUNT_MS);
    };
    setTimeout(step, COUNT_MS);
  } else sol.textContent = `${d.sol} SOL`;
  if (d.heat.delta !== 0) totals.append(el('div', 'db-heat', `HEAT ${upper(d.heat.district)} ${signed(d.heat.delta)}`));
  // A trust job (Intake board spec §2): her word when it changed, and no rep line (rep doesn't move).
  if (d.trust !== undefined) {
    if (d.trust) totals.append(el('div', 'db-trust', `${d.trust.name.toUpperCase()} · ${d.trust.before.toUpperCase()} → ${d.trust.after.toUpperCase()}`));
  } else {
    totals.append(el('div', 'db-rep', `REP ${upper(d.rep.district)} ${d.rep.before} → ${d.rep.after}`));
    const [was, now] = [repTier(d.rep.before), repTier(d.rep.after)];
    if (was !== now) totals.append(el('div', 'db-cross', `${upper(d.rep.district)} · ${TIER_NAMES[was - 1]} → ${TIER_NAMES[now - 1]}`));
  }
  if (d.deck) totals.append(el('div', 'db-deck', `DECK ${d.deck.from ? upper(d.deck.from) : 'NONE'} → ${d.deck.to ? upper(d.deck.to) : 'NONE'}`));
  // The arrangement's retainer (spec 2026-10-20 §2).
  if (d.retainer?.paid) totals.append(el('div', 'db-retainer', `${d.retainer.name.toUpperCase()}'S RETAINER −${d.retainer.amount} SOL`));
  else if (d.retainer) totals.append(el('div', 'db-unpaid', `${d.retainer.name.toUpperCase()} WASN'T PAID`));
  if (d.cover) totals.append(el('div', 'db-cover', d.cover === 'burner' ? 'A BURNER TOOK HALF' : 'A FALL GUY TOOK IT'));
  box.append(totals);
  return box;
}
