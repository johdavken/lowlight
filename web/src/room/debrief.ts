/**
 * A job's debrief (small jobs spec §6): one card at its end, before her closing turn. The tier stamped
 * with its cue, each check and crack, then the totals: the sol counting up, the heat, the rep (with a
 * tier crossing spelled out), a deck gained or lost, and the cover that softened a blown job. At the HUD table (mockup
 * graft-results.html D) the same node reads as the bag picture, the sums and the crew's cards (table.css); the rolls go
 * to the JOB column (`debriefRolls`).
 */
import { heatEffects, WARY_HEAT } from '../../../shared/heat';
import { repTier, TIER_NAMES } from '../../../shared/mission';
import type { Debrief } from '../../../shared/types';
import { face } from './crew-ui';

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

/** The heat a job left, where it came from, and what the district's heat now does. An older debrief has the total alone. */
function heatLines(d: Debrief): HTMLElement[] {
  const { district, delta, after, parts } = d.heat;
  const total = el('div', 'db-heat', `HEAT ${upper(district)} ${signed(delta)}${after === undefined ? '' : ` → ${after}`}`);
  if (after === undefined || !parts) return [total];
  const effects = heatEffects(after);
  const cools = `COOLS ${repTier(d.rep.after)} AT 06:00`;
  return [
    total,
    el('div', 'db-heat-why', parts.map((p) => `${p.label} ${signed(p.n)}`).join(' · ')),
    el('div', 'db-heat-now', [...(effects.length ? effects : [`NO PENALTY UNTIL ${WARY_HEAT}`]), cools].join(' · ')),
  ];
}

/** One check's line: `TECH 74% · 91 no · 40 clean`, or a crack's `CRACK · 2 TRIES USED · ACCESS GRANTED`. */
const KIND_WORD = { crit: 'CRIT', clean: 'CLEAN', cost: 'COST', miss: 'MISS' } as const;

function rollText(c: Debrief['checks'][number]): string {
  // The table's dice (spec 2026-10-29 §4): the faces, highest first, then the result.
  // The kept die first: the highest two, or the lowest two on a 0d roll (keep low).
  if (c.faces && c.kind) return [[...c.faces].sort((a, b) => (c.keep === 'low' ? a - b : b - a)).slice(0, 2).join(' '), KIND_WORD[c.kind], ...(c.steadied ? ['· STEADIED'] : [])].join(' ');
  if (c.crack) return `CRACK · ${c.crack.tries} ${c.crack.tries === 1 ? 'TRY' : 'TRIES'} USED · ${c.crack.state === 'granted' ? 'ACCESS GRANTED' : 'LOCKED OUT'}`;
  const rolls = c.rolls ?? [];
  const last = rolls.length - 1;
  return [`${c.stat} ${c.chance}%`, ...rolls.map((r, i) => `${r} ${i === last && r <= (c.chance ?? 0) ? 'clean' : 'no'}`)].join(' · ');
}

/** A roll's row: as `rollText`, with the table's dice as dice (the same words, for the HUD's JOB column). */
function rollEl(c: Debrief['checks'][number]): HTMLElement {
  const text = rollText(c);
  const n = el('div', `db-roll${c.kind ? ` k-${c.kind}` : ''}`);
  const kept = c.faces && c.kind ? text.split(' ').slice(0, Math.min(2, c.faces.length)) : [];
  if (!kept.length) n.textContent = text;
  else {
    kept.forEach((f, i) => n.append(...(i ? [' '] : []), el('b', 'db-die', f)));
    n.append(el('span', 'db-kw', ` ${text.split(' ').slice(kept.length).join(' ')}`));
  }
  return n;
}

/** What a crew line says happened to them, for its colour at the table. */
const fateClass = (line: string) => (/\b(HELD|GONE)\b/.test(line) ? 'lost' : /\bHURT\b/.test(line) ? 'hurt' : /\bMESSY\b/.test(line) ? 'messy' : 'fine');

/** One crew line, its name apart so the card can stand it on the picture; the words read as the line. */
function crewLine(line: string, name?: string): HTMLElement {
  const row = el('div', `db-crew-line ${fateClass(line)}`);
  if (!name) row.textContent = line;
  else {
    const rest = line.slice(name.length);
    const sep = rest.startsWith(' · ') ? ' · ' : ' ';
    row.append(el('b', 'db-mate-name', name), el('span', 'db-sep', sep), el('span', 'db-fate', rest.slice(sep.length)));
  }
  return row;
}

/** A person's card (graft results 2026-11-04): their picture and every line about them. A contact's art may be missing: their initial, as `face`. */
function mateEl(p: NonNullable<Debrief['people']>[number], lines: string[]): HTMLElement {
  const card = el('div', `db-mate ${lines.map(fateClass).find((f) => f === 'lost' || f === 'hurt') ?? ''}`.trim());
  let pic = face({ face: p.face, name: p.name }, 'db-face');
  if (p.art) {
    const img = el('img', 'db-face') as HTMLImageElement;
    img.src = p.art;
    img.alt = '';
    img.addEventListener('error', () => img.replaceWith(face({ face: null, name: p.name }, 'db-face')));
    pic = img;
  }
  card.append(pic, ...lines.map((l) => crewLine(l, p.name)));
  return card;
}

function crewEl(d: Debrief): HTMLElement {
  const list = el('div', 'db-crew');
  const lines = d.crew ?? [];
  const about = (name: string) => lines.filter((l) => l === name || l.startsWith(`${name} `));
  // Lines carry first names only: two people sharing one (Juno Sato, Juno Mbeki) can't be told apart, so theirs stay words.
  const named = d.people ?? [];
  const people = named.filter((p) => about(p.name).length && named.filter((x) => x.name === p.name).length === 1);
  for (const p of people) list.append(mateEl(p, about(p.name)));
  // A line with no card (a save from before `people`): as words.
  for (const l of lines) if (!people.some((p) => about(p.name).includes(l))) list.append(crewLine(l));
  return list;
}

/** Counts `node` up to `to` (`N SOL`), or sets it. */
function countUp(node: HTMLElement, to: number, reduced: boolean): void {
  const say = (n: number) => (node.textContent = `${n < 0 ? `−${-n}` : n} SOL`);
  say(reduced ? to : 0);
  if (reduced || to === 0) return;
  let i = 0;
  const step = () => {
    i++;
    say(Math.round((to * i) / COUNT_STEPS));
    if (i < COUNT_STEPS) setTimeout(step, COUNT_MS);
  };
  setTimeout(step, COUNT_MS);
}

/** A sum's row: its label, then its figure at the far end (table.css); the words read as one line. */
function sumRow(cls: string, label: string, sep: string, figure: string): HTMLElement {
  const row = el('div', `db-sum ${cls}`);
  row.append(el('span', '', label), el('span', 'db-sep', sep), el('span', '', figure));
  return row;
}

/** The debrief's rolls, taken out of it for the HUD's JOB column (it stays whole on a phone). */
export function debriefRolls(node: HTMLElement): HTMLElement | null {
  const parts = [...node.querySelectorAll<HTMLElement>('.db-checks, .db-pushes')];
  if (!parts.length) return null;
  const box = el('div', 'db-rolls');
  box.append(...parts);
  return box;
}

export function debriefEl(d: Debrief, o: { cue(name: 'clean' | 'messy' | 'blown'): void; reduced: boolean }): HTMLElement {
  const box = el('div', `db db-${d.tier}`);
  box.append(el('div', 'db-art'), el('div', 'db-tier', d.tier.toUpperCase()));
  o.cue(d.tier);
  if (d.checks.length) {
    const list = el('div', 'db-checks');
    for (const c of d.checks) {
      const check = el('div', 'db-check');
      check.append(el('div', 'db-line', c.line), rollEl(c));
      list.append(check);
    }
    box.append(list);
  }
  // The hand's row at the table: the crew, who wants in, what ran.
  const row = el('div', 'db-row');
  // The crew brought (the hand spec §4): a line each, on their card when we know them.
  if (d.crew?.length) row.append(crewEl(d));
  // gives: recruit (crew spec §5): someone from the job wants in.
  if (d.recruit) row.append(el('div', 'db-recruit', d.recruit));
  if (d.outfit) row.append(el('div', 'db-recruit db-outfit', d.outfit));
  // Programs that ran (programs spec §2.5): a line each.
  if (d.programs?.length) {
    const list = el('div', 'db-programs');
    for (const line of d.programs) list.append(el('div', 'db-program-line', line));
    row.append(list);
  }
  if (row.childElementCount) box.append(row);
  // Pressing on (spec 2026-10-29 §4): each push, its roll, and what it won or that it lost.
  if (d.pushes?.length) {
    const list = el('div', 'db-pushes');
    list.append(el('div', 'db-push-head', 'PRESSED'));
    for (const p of d.pushes) {
      const push = el('div', 'db-push');
      push.append(el('div', 'db-line', p.line), p.rolls || p.faces ? rollEl(p) : el('div', 'db-roll', ''), el('div', 'db-gain', p.result === 'lost' ? 'LOST' : `+${p.sol} SOL`));
      list.append(push);
    }
    box.append(list);
  }
  // The table (spec §4): TAKE as it ended, and the NERVE it cost.
  if (d.take) {
    const take = el('div', 'db-take');
    take.append(el('b', '', 'TAKE'));
    for (let i = 0; i < d.take.size; i++) take.append(el('i', i < d.take.filled ? 'on' : ''));
    box.append(take);
  }
  const totals = el('div', 'db-totals');
  // The sums: the pay, what came off it, what you keep (the last only at the HUD table; the sol is the job's own).
  const sums = el('div', 'db-sums');
  const pay = el('div', 'db-sum db-pay');
  const sol = el('span', 'db-sol');
  pay.append(el('span', 'db-pay-word', 'PAY'), sol);
  countUp(sol, d.sol, o.reduced);
  sums.append(pay);
  // Her cut of the job (Tier 2 spec 2026-11-01 §3).
  if (d.cut) sums.append(sumRow('db-cut', `${d.cut.name.toUpperCase()}'S CUT · ${d.cut.pct}%`, ' · ', `−${d.cut.amount} SOL`));
  // The arrangement's retainer (spec 2026-10-20 §2).
  if (d.retainer?.paid) sums.append(sumRow('db-retainer', `${d.retainer.name.toUpperCase()}'S RETAINER`, ' ', `−${d.retainer.amount} SOL`));
  else if (d.retainer) sums.append(el('div', 'db-unpaid', `${d.retainer.name.toUpperCase()} WASN'T PAID`));
  const keep = el('div', 'db-keep');
  const kept = el('b', '');
  keep.append(el('span', '', 'YOU KEEP'), kept);
  countUp(kept, d.sol - (d.cut?.amount ?? 0) - (d.retainer?.paid ? d.retainer.amount : 0), o.reduced);
  sums.append(keep);
  // A foil the job dropped (owned programs), on the loot line's look.
  if (d.found) sums.append(el('div', 'db-loot db-found', `FOUND · ${d.found.toUpperCase()} · FOIL`));
  if (d.loot) sums.append(el('div', 'db-loot', `A LOT OF ${d.loot.label}${d.loot.lost ? ' · NO ROOM IN THE STASH' : ''}`));
  totals.append(sums);
  if (d.heat.delta !== 0) totals.append(...heatLines(d));
  // A trust job (Intake board spec §2): her word when it changed, and no rep line (rep doesn't move).
  if (d.trust !== undefined) {
    if (d.trust) totals.append(el('div', 'db-trust', `${d.trust.name.toUpperCase()} · ${d.trust.before.toUpperCase()} → ${d.trust.after.toUpperCase()}`));
  } else {
    totals.append(el('div', 'db-rep', `REP ${upper(d.rep.district)} ${d.rep.before} → ${d.rep.after}`));
    const [was, now] = [repTier(d.rep.before), repTier(d.rep.after)];
    if (was !== now) totals.append(el('div', 'db-cross', `${upper(d.rep.district)} · ${TIER_NAMES[was - 1]} → ${TIER_NAMES[now - 1]}`));
  }
  if (d.nerve) totals.append(el('div', 'db-nerve', `NERVE −${d.nerve}`));
  if (d.deck) totals.append(el('div', 'db-deck', `DECK ${d.deck.from ? upper(d.deck.from) : 'NONE'} → ${d.deck.to ? upper(d.deck.to) : 'NONE'}`));
  if (d.cover) totals.append(el('div', 'db-cover', d.cover === 'burner' ? 'A BURNER TOOK HALF' : 'A FALL GUY TOOK IT'));
  box.append(totals);
  return box;
}
