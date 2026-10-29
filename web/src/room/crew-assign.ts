/**
 * ASSIGN (crew spec §4): tonight's errands, who's back and who's out down the left; the picked errand's brief on
 * the right: what it suits, who can go (FITS / OFF-FIT and their CLEAN chance), the CLEAN / MESSY / BLOWN bar with
 * the band lines and how BLOWN splits, then SEND. The odds are the server's (`CrewView.errands[].odds`).
 */
import type { CrewAction, CrewRosterEntry, CrewView } from '../../../shared/types';
import { el, face, hhmm } from './crew-ui';

type Errand = CrewView['errands'][number];

const up = (x: string) => x.toUpperCase().replace(/-/g, ' ');
const first = (name: string) => name.split(' ')[0];
/** An errand's text with its target's name filled in: `Hustle in {district}` → `Hustle in Neon Strand`. */
const fill = (e: Errand, text: string) => text.replace(/\{(district|job|place)\}/g, () => e.name || (e.target ?? ''));
export const errandLabel = (e: Errand) => fill(e, e.label);

function busyReason(m: CrewRosterEntry): string | null {
  if (m.state === 'out') return `OUT · BACK ${m.due !== undefined ? hhmm(m.due) : '—'}`;
  if (m.state === 'hurt') return `HURT · ${m.hurtDays ?? 0} DAY${m.hurtDays === 1 ? '' : 'S'}`;
  if (m.state === 'held') return 'HELD BY SDG';
  if (m.busy) return 'BUSY TONIGHT';
  return null;
}

export function assignTab(v: CrewView, o: { act(a: CrewAction): void; picked?: string | null }): HTMLElement {
  const root = el('div', 'cr-assign');
  const left = el('div', 'cr-assign-left');
  const brief = el('div', 'cr-brief');
  root.append(left, brief);
  const live = v.roster.filter((m) => m.state !== 'gone');
  let errand: Errand | null = v.errands.find((e) => !e.taken && o.picked && e.odds[o.picked]) ?? v.errands.find((e) => !e.taken) ?? v.errands[0] ?? null;
  let who: string | null = o.picked ?? null;

  const back = v.results.slice(0, 5);
  if (back.length > 0) {
    const b = el('div', 'cr-back');
    b.append(el('div', 'cr-sub', 'BACK TONIGHT'));
    for (const r of back) {
      const row = el('div', `cr-back-row r-${r.band}`);
      row.append(el('span', 'cr-when', hhmm(r.at)), el('span', 'cr-what', r.line), el('span', 'cr-eff', r.effects));
      b.append(row);
    }
    left.append(b);
  }
  const list = el('div', 'cr-errands');
  left.append(el('div', 'cr-sub', 'TONIGHT · ERRANDS'), list);
  const buttons = v.errands.map((e) => {
    const b = el('button', `cr-errand${e.taken ? ' taken' : ''}`);
    b.type = 'button';
    b.append(el('span', 'cr-k', e.tag), el('span', `cr-risk ${e.risk}`, e.risk === 'med' ? 'MED' : e.risk.toUpperCase()), el('span', 'cr-et', errandLabel(e)), el('span', 'cr-em', `${up(e.district || '—')} · ${e.hours}h · suits ${e.suits.join(', ')}`));
    b.addEventListener('click', () => {
      errand = e;
      draw();
    });
    return b;
  });
  if (buttons.length === 0) list.append(el('div', 'cr-empty', 'NO ERRANDS TONIGHT. BE KNOWN SOMEWHERE, OR HAVE HEAT, OR A JOB ON A BOARD.'));
  list.append(...buttons);
  const out = live.filter((m) => m.state === 'out');
  if (out.length > 0) {
    const box = el('div', 'cr-out');
    box.append(el('div', 'cr-sub', 'OUT NOW'));
    for (const m of out) {
      const e = v.errands.find((x) => x.id === m.errand);
      const row = el('div', 'cr-out-row');
      row.append(face(m.recruit, 'cr-face small'), el('span', '', `${first(m.recruit.name).toUpperCase()}${e ? ` · ${errandLabel(e)}` : ''}`), el('span', 'cr-eta', `BACK ${m.due !== undefined ? hhmm(m.due) : '—'}`));
      box.append(row);
    }
    left.append(box);
  }

  function draw(): void {
    for (const [i, b] of buttons.entries()) b.classList.toggle('on', v.errands[i] === errand);
    brief.replaceChildren();
    if (!errand) return;
    const e = errand;
    const meta = el('div', 'cr-meta');
    for (const [k, val] of [['WHERE', up(e.district || '—')], ['TAKES', `${e.hours}H`], ['SUITS', e.suits.map(up).join(' · ')], ['RISK', e.risk === 'med' ? 'MED' : e.risk.toUpperCase()]] as const) {
      const s = el('span', '', `${k} `);
      s.append(el('b', '', val));
      meta.append(s);
    }
    brief.append(el('div', 'cr-sub', e.tag), el('h2', '', errandLabel(e).toUpperCase()), meta);
    if (e.blurb) brief.append(el('p', 'cr-blurb', fill(e, e.blurb)));
    if (e.taken) return void brief.append(el('div', 'cr-taken', 'TAKEN TONIGHT. IT COMES BACK AT 06:00, OR NOT.'));
    const ready = live.filter((m) => !busyReason(m) && e.odds[m.recruit.id]);
    if (!who || !e.odds[who]) who = ready[0]?.recruit.id ?? null;
    const picks = el('div', 'cr-picks');
    for (const m of live) {
      const busy = busyReason(m);
      const od = e.odds[m.recruit.id];
      const b = el('button', `cr-pick${m.recruit.id === who ? ' on' : ''}`);
      b.type = 'button';
      b.disabled = busy !== null || !od;
      const top = el('div', 'cr-pick-top');
      top.append(face(m.recruit, 'cr-face small'), el('span', 'cr-pick-name', first(m.recruit.name).toUpperCase()));
      if (od && !busy) top.append(el('span', 'cr-pct', `${od.clean}%`));
      b.append(top, el('div', 'cr-why', busy ?? (od ? `${m.recruit.spec.toUpperCase()} · ${od.fits ? 'FITS' : 'OFF-FIT −15'}` : '')));
      b.addEventListener('click', () => {
        who = m.recruit.id;
        draw();
      });
      picks.append(b);
    }
    brief.append(el('div', 'cr-sub', 'WHO GOES'), picks);
    const m = live.find((x) => x.recruit.id === who);
    const od = who ? e.odds[who] : undefined;
    if (!m || !od) return void brief.append(el('div', 'cr-empty', 'NOBODY FREE TO SEND.'));
    const bar = el('div', 'cr-odds');
    for (const [cls, name, n] of [['o-clean', 'CLEAN', od.clean], ['o-messy', 'MESSY', od.messy], ['o-blown', 'BLOWN', od.blown]] as const) {
      const seg = el('div', cls, n >= 9 ? `${name} ${n}` : String(n));
      seg.style.flexBasis = `${n}%`;
      bar.append(seg);
    }
    const bands = el('div', 'cr-bands');
    const name = first(m.recruit.name);
    for (const [cls, label, text] of [['c', 'CLEAN', e.bands.clean], ['m', 'MESSY', e.bands.messy], ['x', 'BLOWN', e.bands.blown]] as const) {
      const d = el('div', cls);
      d.append(el('b', '', label), document.createTextNode(fill(e, text.replace(/\{name\}/g, name))));
      if (cls === 'x') d.append(el('div', 'cr-split', `HURT ${od.hurt} · HELD ${od.held} · GONE ${od.gone}`));
      bands.append(d);
    }
    const send = el('button', 'cr-btn cr-send', `SEND ${name.toUpperCase()}`);
    send.type = 'button';
    send.addEventListener('click', () => o.act({ do: 'send', recruit: m.recruit.id, errand: e.id }));
    const row = el('div', 'cr-send-row');
    const hours = Math.round((m.recruit.spec === 'runner' ? (e.hours * 2) / 3 : e.hours) * 10) / 10;
    row.append(send, el('span', 'cr-cost', `BACK IN ABOUT ${hours}H · RECALL ANY TIME, NO RESULT`));
    brief.append(el('div', 'cr-sub', `ODDS · ${name.toUpperCase()}`), bar, bands, row);
  }
  draw();
  return root;
}
