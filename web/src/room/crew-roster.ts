/**
 * ROSTER (crew spec §4): recruit tiles down the left (READY, OUT, HURT, HELD; open slots; GONE), and the picked
 * recruit's file on the right: specialty and grade, growth, traits, loyalty as a word, wage, record, last runs,
 * and the actions their state allows. No stat numbers (2026-10-19).
 */
import { BAIL, DOC } from '../../../shared/crew';
import { GRADES } from '../../../shared/crew-book';
import type { CrewAction, CrewRosterEntry, CrewView } from '../../../shared/types';
import { errandLabel } from './crew-assign';
import { el, face, hhmm } from './crew-ui';

/** What each specialty is good at (spec §1's table). */
const GOOD_AT: Record<string, [string, string][]> = {
  runner: [['CASE', "prep for tonight's jobs"], ['LEGWORK', 'clues for big jobs'], ['COURIER', 'errands run a third faster']],
  ears: [['LISTEN', 'comes back with leads and rumours'], ['SCOUT', "shows a job's draws before you take it"]],
  face: [['LAY LOW', 'cools heat'], ['TALK', 'the social side of legwork'], ['COVER', 'stories that keep you clear']],
  fence: [['HUSTLE', 'moving goods pays more'], ['SELL', "the only one who can sell a job's take"]],
  wire: [['RECORDS', 'pulls files and schedules'], ['CAMERAS', "a bonus on a job's grid check"]],
  muscle: [['COLLECT', 'debts and doors'], ['GUARD', 'rough errands blow less often']],
  wheel: [['DRIVE', 'getting out, on big jobs']],
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
    case 'gone':
      return ['gone', 'GONE', (m.gone ?? '').toUpperCase()];
    default:
      return m.busy ? ['busy', 'BUSY', 'TONIGHT'] : ['ready', 'READY', ''];
  }
}

function tile(m: CrewRosterEntry, on: boolean, pick: (id: string) => void): HTMLElement {
  const [kind, word, small] = stateOf(m);
  const b = el('button', `cr-tile s-${kind}${on ? ' on' : ''}`);
  b.type = 'button';
  b.dataset.id = m.recruit.id;
  const inner = el('span', 'cr-tile-in');
  const text = el('span', 'cr-tile-text');
  text.append(el('span', 'cr-tile-name', m.recruit.name.toUpperCase()), el('span', 'cr-tile-role', `${m.recruit.spec.toUpperCase()} · ${GRADES[m.recruit.grade]}`));
  const st = el('span', 'cr-state', word);
  if (small) st.append(el('small', '', small));
  inner.append(face(m.recruit, 'cr-face'), text, st);
  b.append(inner);
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
      return `HELD BY SDG · BAIL ${BAIL[m.recruit.grade]} SOL, OR LEAVE THEM`;
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
      return [btn('RECALL', 'ghost', () => o.act({ do: 'recall', recruit: id })), letGo()];
    case 'hurt':
      return [btn(`PAY THE DOC · ${DOC}`, 'ghost', () => o.act({ do: 'doc', recruit: id })), letGo()];
    case 'held':
      return [btn(`PAY BAIL · ${BAIL[m.recruit.grade]}`, '', () => o.act({ do: 'bail', recruit: id })), btn('LEAVE THEM', 'warn', () => o.act({ do: 'leave', recruit: id }))];
    case 'gone':
      return [];
    default:
      return [btn('ASSIGN', '', () => o.assign(id)), letGo()];
  }
}

function file(m: CrewRosterEntry, v: CrewView, o: { act(a: CrewAction): void; assign(id: string): void }): HTMLElement {
  const r = m.recruit;
  const f = el('div', `cr-file s-${stateOf(m)[0]}`);
  const mug = el('div', 'cr-mug');
  mug.append(el('span', 'cr-mug-tag', r.spec.toUpperCase()), face(r, 'cr-mug-face'));
  if (m.state === 'hurt' || m.state === 'held' || m.state === 'gone') mug.append(el('span', 'cr-stamp', m.state.toUpperCase()));
  const under = el('div', 'cr-mug-under');
  const runs = m.runs.clean + m.runs.messy + m.runs.blown;
  const rec = [`${runs} RUN${runs === 1 ? '' : 'S'}`, m.runs.clean ? `${m.runs.clean} CLEAN` : null, m.runs.messy ? `${m.runs.messy} MESSY` : null, m.runs.blown ? `${m.runs.blown} BLOWN` : null].filter(Boolean).join(' · ');
  const cell = (k: string, val: string) => {
    const d = el('div', '', k);
    d.append(el('b', '', val));
    return d;
  };
  under.append(cell('WAGE', `${r.wage} / NIGHT`), cell('RECORD', rec));
  const left = el('div', 'cr-left');
  left.append(mug, under);

  const info = el('div', 'cr-info');
  const line = el('div', 'cr-line');
  line.append(el('span', 'cr-rank', GRADES[r.grade]), el('span', '', r.spec.toUpperCase()), el('span', 'cr-from', r.origin.toUpperCase()));
  info.append(el('div', 'cr-name', r.name.toUpperCase()), line, el('div', 'cr-status', status(m, v)));

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
  if (m.next) spec.append(el('div', 'cr-dh', 'GROWTH'), el('div', 'cr-growth', `${m.toNext} more clean run${m.toNext === 1 ? '' : 's'}: ${GRADES[r.grade]} → ${m.next}.`));
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
  info.append(cols);

  if (m.log.length > 0) {
    const log = el('ul', 'cr-log');
    for (const res of m.log.slice(0, 6)) {
      const li = el('li', `r-${res.band}`);
      li.append(el('span', 'cr-when', hhmm(res.at)), el('span', 'cr-what', res.line), el('span', 'cr-eff', res.effects));
      log.append(li);
    }
    info.append(el('div', 'cr-dh', 'LAST RUNS'), log);
  }
  const acts = el('div', 'cr-acts');
  acts.append(...actions(m, o));
  info.append(acts);
  f.append(left, info);
  return f;
}

export function rosterTab(v: CrewView, o: { picked: string | null; pick(id: string): void; act(a: CrewAction): void; assign(id: string): void }): HTMLElement {
  const root = el('div', 'cr-roster');
  const tiles = el('div', 'cr-tiles');
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
