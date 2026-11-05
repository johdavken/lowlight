/**
 * ROSTER (crew spec §4): recruits as SETUP's ready cards on the left (READY, OUT, HURT, HELD; open slots; GONE), and
 * the picked recruit's file on the right, scrolling inside the panel: specialty and grade, growth, traits, loyalty as a
 * word, wage, record, last runs, and the actions their state allows. No stat numbers (2026-10-19).
 */
import { BAIL, DOC } from '../../../shared/crew';
import { GRADES } from '../../../shared/crew-book';
import type { CrewAction, CrewRosterEntry, CrewView } from '../../../shared/types';
import { errandLabel } from './crew-assign';
import { cardPic, el, face, hhmm } from './crew-ui';

/** What each specialty is good at (spec §1's table). */
const GOOD_AT: Record<string, [string, string][]> = {
  runner: [['GRID', 'moves data with no heat'], ['GROUNDWORK', 'the quiet side of a contract']],
  ears: [['STREETS', 'slow and safe, moves pharma'], ['GROUNDWORK', 'hears what a contract needs']],
  face: [['BUYERS', 'private sales, moves luxuries'], ['LAY LOW', 'cools heat'], ['TALK', 'the social side of groundwork']],
  fence: [['MARKET', 'moves any kind at a flat price'], ['SELL', "the only one who can sell a job's take"]],
  muscle: [['BLOCK', 'fast money and heat, moves contraband'], ['COLLECT', 'debts and doors']],
  wheel: [['DRIVE', 'getting out, on contracts']],
};

const days = (n: number) => `${n} DAY${n === 1 ? '' : 'S'}`;

function stateOf(m: CrewRosterEntry): [string, string, string] {
  switch (m.state) {
    case 'out':
      return ['out', 'OUT', m.due !== undefined ? `BACK ${hhmm(m.due)}` : ''];
    case 'hurt':
      return ['hurt', 'HURT', days(m.hurtDays ?? 0)];
    case 'held':
      return ['held', 'HELD', ''];
    case 'job':
      return ['job', 'ON A JOB', (m.job ?? '').toUpperCase()];
    case 'gone':
      return ['gone', 'GONE', (m.gone ?? '').toUpperCase()];
    default:
      return m.busy ? ['busy', 'BUSY', 'TONIGHT'] : ['ready', 'READY', ''];
  }
}

function tile(m: CrewRosterEntry, on: boolean, pick: (id: string) => void): HTMLElement {
  const [kind, word, small] = stateOf(m);
  // An open promotion pick lights the tile (crew abilities spec §4).
  const b = el('button', `cr-tile s-${kind}${on ? ' on' : ''}${m.picks.length > 0 && m.state !== 'gone' ? ' pick' : ''}`);
  b.type = 'button';
  b.dataset.id = m.recruit.id;
  const st = el('span', 'cr-state', word);
  if (small) st.append(el('small', '', small));
  b.append(cardPic(m.recruit), el('span', 'cr-tile-name', m.recruit.name.split(' ')[0].toUpperCase()), el('span', 'cr-tile-role', `${m.recruit.spec.toUpperCase()} · ${GRADES[m.recruit.grade]}`), st);
  b.addEventListener('click', () => pick(m.recruit.id));
  return b;
}

function status(m: CrewRosterEntry, v: CrewView): string {
  const errand = m.errand ? v.errands.find((e) => e.id === m.errand) : undefined;
  switch (m.state) {
    case 'out':
      return ['OUT', errand ? errandLabel(errand).toUpperCase() : null, m.due !== undefined ? `BACK ${hhmm(m.due)}` : null]
        .filter(Boolean)
        .join(' · ');
    case 'hurt':
      return `HURT · ON THEIR FEET IN ${days(m.hurtDays ?? 0)}`;
    case 'held':
      return m.springPlace ? `HELD BY SDG · THEIR PEOPLE AT ${m.springPlace.toUpperCase()} ARE WAITING` : `HELD BY SDG · BAIL ${BAIL[m.recruit.grade]} SOL, OR LEAVE THEM`;
    case 'job':
      return `ON A JOB · ${(m.job ?? '').toUpperCase()}`;
    case 'gone':
      return `GONE · ${(m.gone ?? '').toUpperCase()}`;
    default:
      return m.busy ? 'BUSY TONIGHT' : 'READY';
  }
}

function actions(m: CrewRosterEntry, o: { act(a: CrewAction): void; assign(id: string): void }): HTMLElement[] {
  const id = m.recruit.id;
  const btn = (text: string, cls: string, fn: () => void) => {
    const b = el('button', `cr-btn ${cls}`, text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  // LET GO asks once more: it can't be taken back but by rewinding.
  const letGo = () => {
    const b = btn('LET GO', 'warn', () => {
      if (b.dataset.sure) return o.act({ do: 'letgo', recruit: id });
      b.dataset.sure = '1';
      b.textContent = 'SURE? LET GO';
    });
    return b;
  };
  switch (m.state) {
    case 'out':
      return [btn('RECALL', 'soft', () => o.act({ do: 'recall', recruit: id })), letGo()];
    case 'hurt':
      return [btn(`PAY THE DOC · ${DOC}`, 'soft', () => o.act({ do: 'doc', recruit: id })), letGo()];
    case 'held': {
      // SPRING THEM (crew spec §5): a rescue tonight at the place they were hired.
      const spring = btn('SPRING THEM', 'soft', () => o.act({ do: 'spring', recruit: id }));
      if (!m.canSpring) {
        spring.disabled = true;
        if (m.springWhy) spring.title = m.springWhy;
      }
      return [btn(`PAY BAIL · ${BAIL[m.recruit.grade]}`, '', () => o.act({ do: 'bail', recruit: id })), spring, btn('LEAVE THEM', 'warn', () => o.act({ do: 'leave', recruit: id }))];
    }
    case 'gone':
    case 'job':
      return [];
    default:
      return [btn('ASSIGN', '', () => o.assign(id)), letGo()];
  }
}

const TIMING_WORD = { roll: 'ON A ROLL', after: 'AFTER A ROLL', end: 'AT THE END', auto: 'WHEN IT COMES' } as const;

/** An ability's card (crew abilities spec §4): its label, when it plays, what it does on a job and on errands, its line. */
function abilityCard(id: string, v: CrewView, cls = ''): HTMLElement {
  const a = v.abilities[id];
  const c = el('div', `cr-ab${cls ? ` ${cls}` : ''}`);
  c.dataset.id = id;
  if (!a) return c;
  const head = el('div', 'cr-ab-head');
  head.append(el('span', 'cr-ab-name', a.label.toUpperCase()), el('span', `cr-ab-when t-${a.timing}`, TIMING_WORD[a.timing]));
  c.append(head, el('div', 'cr-ab-job', a.job));
  if (a.text) c.append(el('div', 'cr-ab-text', a.text));
  return c;
}

/**
 * PROMOTED · CHOOSE (crew abilities spec §4): the oldest open pick's two cards, KEEP under each. Any state may choose.
 */
function chooseCard(m: CrewRosterEntry, v: CrewView, act: (a: CrewAction) => void): HTMLElement {
  const p = m.picks[0];
  const box = el('div', 'cr-choose');
  const before = GRADES[Math.max(0, p.grade - 1)];
  box.append(el('div', 'cr-dh', 'PROMOTED · CHOOSE'), el('div', 'cr-choose-head', `${m.recruit.name.split(' ')[0].toUpperCase()} · ${before} → ${GRADES[p.grade]}`));
  const row = el('div', 'cr-choose-row');
  for (const id of p.offer) {
    const c = abilityCard(id, v);
    const keep = el('button', 'cr-btn cr-keep', 'KEEP');
    keep.type = 'button';
    keep.addEventListener('click', () => act({ do: 'learn', recruit: m.recruit.id, ability: id, grade: p.grade }));
    c.append(keep);
    row.append(c);
  }
  box.append(row);
  return box;
}

/**
 * ABILITIES (crew abilities spec §4): `SLOTS n/m`, the slotted cards with UNSLOT, then the known ones dimmed with SLOT.
 * SLOT with every slot full lights the slotted cards: tap one to swap it out. Only while ready.
 */
function abilitiesBlock(m: CrewRosterEntry, v: CrewView, act: (a: CrewAction) => void): HTMLElement {
  const box = el('div', 'cr-abilities');
  box.append(el('div', 'cr-dh', 'ABILITIES'), el('div', 'cr-ab-slots', `SLOTS ${m.slotted.length}/${m.slots}`));
  const ready = m.state === 'ready';
  const why = ready ? '' : status(m, v);
  const rid = m.recruit.id;
  const btn = (text: string, fn: () => void) => {
    const b = el('button', 'cr-btn soft cr-ab-btn', text);
    b.type = 'button';
    b.disabled = !ready;
    if (why) b.title = why;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    return b;
  };
  const slotted = m.slotted.map((id) => {
    const c = abilityCard(id, v, 'slotted');
    c.append(btn('UNSLOT', () => act({ do: 'unslot', recruit: rid, ability: id })));
    return c;
  });
  const known = m.abilities
    .filter((id) => !m.slotted.includes(id))
    .map((id) => {
      const c = abilityCard(id, v, 'known');
      c.append(
        btn('SLOT', () => {
          if (m.slotted.length < m.slots) return act({ do: 'slot', recruit: rid, ability: id });
          // Full: the slotted cards light up; the one tapped goes out.
          for (const s of slotted) {
            s.classList.add('cr-swap');
            s.onclick = () => act({ do: 'slot', recruit: rid, ability: id, out: s.dataset.id! });
          }
        }),
      );
      return c;
    });
  box.append(...slotted, ...known);
  return box;
}

function file(m: CrewRosterEntry, v: CrewView, o: { act(a: CrewAction): void; assign(id: string): void }): HTMLElement {
  const r = m.recruit;
  const f = el('div', `cr-file s-${stateOf(m)[0]}`);
  f.dataset.keep = `file:${r.id}`;
  const mug = el('div', 'cr-mug');
  mug.append(face(r, 'cr-mug-face'));
  if (m.state === 'hurt' || m.state === 'held' || m.state === 'gone') mug.append(el('span', 'cr-stamp', m.state.toUpperCase()));
  const under = el('div', 'cr-mug-under');
  const runs = m.runs.clean + m.runs.messy + m.runs.blown;
  const rec = [`${runs} RUN${runs === 1 ? '' : 'S'}`, m.runs.clean ? `${m.runs.clean} CLEAN` : null, m.runs.messy ? `${m.runs.messy} MESSY` : null, m.runs.blown ? `${m.runs.blown} BLOWN` : null].filter(Boolean).join(' · ');
  const cell = (k: string, val: string) => {
    const d = el('div', '', k);
    d.append(el('b', '', val));
    return d;
  };
  under.append(cell('WAGE', `${r.wage} A NIGHT WORKED`), cell('RECORD', rec));
  const id = el('div', 'cr-id');
  const line = el('div', 'cr-line');
  line.append(el('span', 'cr-rank', GRADES[r.grade]), el('span', '', r.spec.toUpperCase()), el('span', 'cr-from', r.origin.toUpperCase()));
  id.append(el('div', 'cr-name', r.name.toUpperCase()), line);
  if (m.vouchedBy) id.append(el('div', 'cr-vouched', `Vouched for by ${m.vouchedBy}`));
  id.append(el('div', 'cr-status', status(m, v)), under);
  const top = el('div', 'cr-top');
  top.append(mug, id);
  f.append(top);
  if (m.picks.length > 0 && m.state !== 'gone') f.append(chooseCard(m, v, o.act));

  const cols = el('div', 'cr-cols');
  const spec = el('div', '');
  spec.append(el('div', 'cr-dh', 'SPECIALTY'), el('div', 'cr-spec', r.spec.toUpperCase()));
  const ladder = el('div', 'cr-ladder');
  for (const [i, g] of GRADES.entries()) ladder.append(el('span', i === r.grade ? 'on' : i < r.grade ? 'f' : '', g));
  const good = el('ul', 'cr-goodat');
  for (const [k, d] of GOOD_AT[r.spec] ?? []) {
    const li = el('li', '');
    li.append(el('b', '', k), document.createTextNode(d));
    good.append(li);
  }
  spec.append(ladder, good);
  if (m.next) spec.append(el('div', 'cr-dh', 'GROWTH'), el('div', 'cr-growth', `${Math.ceil(m.toNext)} more clean run${Math.ceil(m.toNext) === 1 ? '' : 's'}: ${GRADES[r.grade]} → ${m.next}. A job below their grade counts half.`));
  const traits = el('div', '');
  traits.append(el('div', 'cr-dh', 'TRAITS'));
  for (const t of m.traitsShown) {
    const row = el('div', 'cr-trait');
    row.dataset.kind = t.good ? 'good' : 'bad';
    row.append(el('span', 'cr-ico', t.good ? '+' : '−'), el('span', 'cr-t', t.label.toUpperCase()), el('span', 'cr-d', t.text));
    traits.append(row);
  }
  for (let i = 0; i < m.hiddenTraits; i++) {
    const row = el('div', 'cr-trait');
    row.dataset.kind = 'hidden';
    row.append(el('span', 'cr-ico', '?'), el('span', 'cr-t', 'UNKNOWN'), el('span', 'cr-d', 'Shows itself after three runs.'));
    traits.append(row);
  }
  if (m.state !== 'gone') traits.append(el('div', 'cr-dh', 'LOYALTY'), el('div', 'cr-loyal-word', m.word), el('div', 'cr-loyal-line', m.line));
  cols.append(spec, traits);
  f.append(cols);
  if (m.state !== 'gone' && (m.abilities.length > 0 || m.slots > 0)) f.append(abilitiesBlock(m, v, o.act));

  if (m.log.length > 0) {
    const log = el('ul', 'cr-log');
    for (const res of m.log.slice(0, 6)) {
      const li = el('li', `r-${res.band}`);
      li.append(el('span', 'cr-when', hhmm(res.at)), el('span', 'cr-what', res.line), el('span', 'cr-eff', res.effects));
      log.append(li);
    }
    f.append(el('div', 'cr-dh', 'LAST RUNS'), log);
  }
  const acts = el('div', 'cr-acts');
  acts.append(...actions(m, o));
  f.append(acts);
  return f;
}

export function rosterTab(v: CrewView, o: { picked: string | null; pick(id: string): void; act(a: CrewAction): void; assign(id: string): void }): HTMLElement {
  const root = el('div', 'cr-roster');
  const tiles = el('div', 'cr-tiles');
  tiles.dataset.keep = 'tiles';
  const live = v.roster.filter((m) => m.state !== 'gone');
  const gone = v.roster.filter((m) => m.state === 'gone');
  tiles.append(...live.map((m) => tile(m, m.recruit.id === o.picked, o.pick)));
  for (let i = live.length; i < v.slots; i++) tiles.append(el('div', 'cr-tile cr-slot', '+ OPEN SLOT · HIRE AT A PLACE'));
  if (gone.length > 0) {
    const g = el('div', 'cr-gone');
    g.append(el('div', 'cr-sub', `GONE · ${gone.length}`), ...gone.map((m) => tile(m, m.recruit.id === o.picked, o.pick)));
    tiles.append(g);
  }
  root.append(tiles);
  const m = v.roster.find((x) => x.recruit.id === o.picked);
  root.append(m ? file(m, v, o) : el('div', 'cr-empty', 'NOBODY YET. HIRE AT A PLACE: THE HIRE TAB SAYS WHERE.'));
  return root;
}
