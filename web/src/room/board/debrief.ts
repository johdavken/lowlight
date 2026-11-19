/**
 * A crew-rules job's debrief on the board (crew rules spec 2026-11-17, The end): the grade, the pay with the ways' cut
 * named on its own line, the heat and where it came from, the rep, who came back hurt or held on their printed cards,
 * what the ending gave, and one key to close. The story page (the JOB column, main.ts) holds the ending's text.
 *
 * The debrief's `sol` is already after the ways' cut (`waysCut`): PAY is the pay before it, the cut its own line, and
 * what you keep is `sol` less only what the table's debrief takes off too (the Chair's cut, a paid retainer).
 */
import type { Debrief } from '../../../../shared/types';
import { heatEffects, WARY_HEAT } from '../../../../shared/heat';
import { repTier, TIER_NAMES } from '../../../../shared/mission';
import { countUp } from '../debrief';
import { el } from '../table/el';
import { personCard } from './hand';

const upper = (id: string) => id.replace(/-/g, ' ').toUpperCase();
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

/** What a crew line says happened to them: the word on their card's strip, or none. */
const fateOf = (line: string): string | null => /\bGONE\b/.exec(line)?.[0] ?? /\bHELD\b/.exec(line)?.[0] ?? /\bHURT\b/.exec(line)?.[0] ?? null;

/** Where the debrief sits on the 1600×900 stage. */
const CREW_X = 940;
const CREW_END = 1572;
const CARD_W = 204;
const CARD_STEP = 212;
const CREW_Y = 172;

function sum(cls: string, label: string, figure: HTMLElement | string): HTMLElement {
  const row = el('div', `bw-sum ${cls}`);
  row.append(el('span', '', label), typeof figure === 'string' ? el('b', '', figure) : figure);
  return row;
}

/** The people the crew lines are about, each on their printed card with their fate; lines with no card as words. */
function crewOf(d: Debrief): { cards: HTMLElement[]; words: string[] } {
  const lines = d.crew ?? [];
  const about = (name: string) => lines.filter((l) => l === name || l.startsWith(`${name} `));
  const named = d.people ?? [];
  // Lines carry first names only: two people sharing one can't be told apart, so theirs stay words.
  const people = named.filter((p) => about(p.name).length && named.filter((x) => x.name === p.name).length === 1);
  const step = people.length > 1 ? Math.min(CARD_STEP, (CREW_END - CREW_X - CARD_W) / (people.length - 1)) : CARD_STEP;
  const cards = people.map((p, i) => {
    const mine = about(p.name);
    const art = p.art ?? (p.face ? `/api/extras/${encodeURIComponent(p.face)}` : null);
    const card = personCard({ id: p.name, kind: 'recruit', name: p.name, art, state: 'ready' }, { sel: false, at: { x: Math.round(CREW_X + i * step), y: CREW_Y } });
    delete card.dataset.hand;
    card.removeAttribute('role');
    card.classList.add('bw-mate');
    card.dataset.who = p.name;
    // The rest of each line under the name: `HURT`, `CLEAN RUN · 2 TO HAND`.
    const rest = mine.map((l) => l.slice(p.name.length).replace(/^\s*·\s*/, '').trim()).filter(Boolean);
    card.querySelector('.bw-l1')!.textContent = rest.join(' · ');
    const fate = mine.map(fateOf).find(Boolean);
    if (fate) {
      card.classList.add('spent', 'harmed');
      card.append(el('span', 'bw-st', fate));
    }
    return card;
  });
  const words = lines.filter((l) => !people.some((p) => about(p.name).includes(l)));
  return { cards, words };
}

/** The debrief's middle. `reduced`: the sums are set, not counted up. */
export function debriefBoardEl(d: Debrief, o: { title: string; reduced: boolean }): HTMLElement {
  const box = el('div', `bw-end t-${d.tier}`);
  box.append(el('div', 'bw-goin-head', `${o.title.toUpperCase()} · DONE`));
  const grade = el('div', 'bw-grade', d.tier.toUpperCase());
  box.append(grade);
  if (d.take) {
    const take = el('div', 'bw-end-take');
    take.append(el('span', '', 'TAKE'));
    const pips = el('b', '');
    for (let i = 0; i < d.take.size; i++) pips.append(el('i', i < d.take.filled ? 'on' : ''));
    take.append(pips);
    box.append(take);
  }
  // The sums: the pay, what came off it, what you keep.
  const sums = el('div', 'bw-sums');
  const cut = d.waysCut?.amount ?? 0;
  const pay = el('b', '');
  countUp(pay, d.sol + cut, o.reduced);
  sums.append(sum('bw-pay', 'PAY', pay));
  if (d.waysCut) sums.append(sum('bw-cut', `THE CUT · ${d.waysCut.pct} %`, `−${d.waysCut.amount} SOL`));
  if (d.cut) sums.append(sum('bw-cut bw-chair', `${d.cut.name.toUpperCase()}'S CUT · ${d.cut.pct} %`, `−${d.cut.amount} SOL`));
  if (d.retainer?.paid) sums.append(sum('bw-cut bw-retainer', `${d.retainer.name.toUpperCase()}'S RETAINER`, `−${d.retainer.amount} SOL`));
  else if (d.retainer) sums.append(el('div', 'bw-sum bw-unpaid', `${d.retainer.name.toUpperCase()} WASN'T PAID`));
  // Pressing on (pressing on spec §4), as the table's debrief has it: each push and what it won, or that it was lost.
  // A won push's sol is in PAY already; a lost one took the pot back and part of the pay with it.
  // A failed throw there (last pass B1) won nothing and lost nothing: its own row, in neither colour.
  for (const p of d.pushes ?? []) sums.append(p.missed ? sum('bw-push missed', `PRESSED · ${p.line.toUpperCase()}`, 'NOTHING') : sum(`bw-push ${p.result}`, `PRESSED · ${p.line.toUpperCase()}`, p.result === 'lost' ? 'LOST' : `+${p.sol} SOL`));
  if (d.push === 'lost') sums.append(el('div', 'bw-sum bw-push-end lost', `THE PUSH WENT WRONG · THE POT AND ${d.tier === 'blown' ? 'ALL' : 'HALF'} THE PAY GONE`));
  else if (d.push === 'walked') sums.append(el('div', 'bw-sum bw-push-end', 'WALKED WITH IT'));
  const kept = el('b', '');
  countUp(kept, d.sol - (d.cut?.amount ?? 0) - (d.retainer?.paid ? d.retainer.amount : 0), o.reduced);
  sums.append(sum('bw-keep', 'YOU KEEP', kept));
  // The sums, the heat and rep, and CLOSE flow down one column: extra rows (the Chair's cut, a tier crossing) push on.
  const col = el('div', 'bw-endcol');
  col.append(sums);
  box.append(col);
  // The heat it left and where from (for a crew-rules job: ON THE NIGHT, and any MESSY CREW), the rep.
  const after = el('div', 'bw-after');
  const { district, delta, parts } = d.heat;
  if (delta !== 0 || parts?.length) {
    after.append(el('div', 'bw-heat', `HEAT ${upper(district)} ${signed(delta)}${d.heat.after === undefined ? '' : ` → ${d.heat.after}`}`));
    if (parts?.length) after.append(el('div', 'bw-heat-why', parts.map((p) => `${p.label} ${signed(p.n)}`).join(' · ')));
    if (d.heat.after !== undefined) {
      const effects = heatEffects(d.heat.after);
      after.append(el('div', 'bw-heat-now', [...(effects.length ? effects : [`NO PENALTY UNTIL ${WARY_HEAT}`]), `COOLS ${repTier(d.rep.after)} AT 06:00`].join(' · ')));
    }
  }
  // A judging clock (Kroll's desk): what it decided, whatever her word does, above her word's change and the rep.
  if (d.judge) {
    const j = d.judge;
    const line = el('div', `bw-rep bw-judge${j.delta > 0 ? ' up' : j.delta < 0 ? ' down' : ''}`, `${j.label} ${j.value}/${j.size}${j.words ? ` · ${j.words}` : ''}`);
    after.append(line);
  }
  if (d.trust) after.append(el('div', 'bw-rep', `${d.trust.name.toUpperCase()} · ${d.trust.before.toUpperCase()} → ${d.trust.after.toUpperCase()}`));
  // Rep is off only on a `trust:` stake job; a judging clock leaves it paid.
  if (d.trust === undefined || d.judge) {
    after.append(el('div', 'bw-rep', `REP ${upper(d.rep.district)} ${d.rep.before} → ${d.rep.after}`));
    const [was, now] = [repTier(d.rep.before), repTier(d.rep.after)];
    if (was !== now) after.append(el('div', 'bw-rep bw-cross', `${upper(d.rep.district)} · ${TIER_NAMES[was - 1]} → ${TIER_NAMES[now - 1]}`));
  }
  if (d.cover) after.append(el('div', 'bw-rep', d.cover === 'burner' ? 'A BURNER TOOK HALF' : 'A FALL GUY TOOK IT'));
  col.append(after);
  // Who came back, and how.
  const crew = crewOf(d);
  if (crew.cards.length) box.append(el('div', 'bw-lab bw-crew-lab', 'WHO YOU BROUGHT'), ...crew.cards);
  // What the ending gave, as the table's debrief lists it.
  const gave = el('div', 'bw-gave');
  for (const line of crew.words) gave.append(el('div', 'bw-gave-line crew', line));
  if (d.recruit) gave.append(el('div', 'bw-gave-line', d.recruit));
  if (d.outfit) gave.append(el('div', 'bw-gave-line', d.outfit));
  for (const c of d.clues ?? []) gave.append(el('div', 'bw-gave-line', c));
  if (d.found) gave.append(el('div', 'bw-gave-line', `FOUND · ${d.found.toUpperCase()} · FOIL`));
  if (d.loot) gave.append(el('div', 'bw-gave-line', `A LOT OF ${d.loot.label}${d.loot.lost ? ' · NO ROOM IN THE STASH' : ''}`));
  for (const p of d.programs ?? []) gave.append(el('div', 'bw-gave-line prog', p));
  if (d.deck) gave.append(el('div', 'bw-gave-line', `DECK ${d.deck.from ? upper(d.deck.from) : 'NONE'} → ${d.deck.to ? upper(d.deck.to) : 'NONE'}`));
  if (gave.childElementCount) box.append(gave);
  const close = el('button', 'bw-close', 'CLOSE');
  close.type = 'button';
  close.append(el('small', '', '[ENTER]'));
  col.append(close);
  return box;
}
