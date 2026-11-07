/**
 * ERRANDS (ASSIGN in code; crew spec §4): tonight's wanted line, then the work down the left, a contract's three pieces first, one row each
 * with its picture, title and state; BACK TONIGHT and OUT NOW at the column's foot. The picked row's file on the right:
 * its art, terms, who can go as SETUP's ready cards, the CLEAN / MESSY / BLOWN bar, SEND. The odds are the server's
 * (`CrewView.errands[].odds`).
 */
import { GRADES } from '../../../shared/crew-book';
import type { CrewAction, CrewRosterEntry, CrewView } from '../../../shared/types';
import { artSlot, cardPic, el, face, hhmm, keepScroll } from './crew-ui';

type Errand = CrewView['errands'][number];
type Contract = NonNullable<CrewView['contracts']>[number];
type Piece = Contract['pieces'][number];
/** A row on the list. `errand`: what SEND sends, null for a piece that can't go tonight. */
type Row = { key: string; title: string; art?: string; errand: Errand | null; piece?: Piece; contract?: Contract; lot?: Lot };
type Lot = NonNullable<CrewView['stash']>[number];

/** What's picked, held by the panel so a refresh keeps it. */
export type AssignPick = { row: string | null; who: string | null; where?: string | null };

const up = (x: string) => x.toUpperCase().replace(/-/g, ' ');
const first = (name: string) => name.split(' ')[0];
const riskWord = (r: Errand['risk']) => (r === 'med' ? 'MED' : r.toUpperCase());
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

/** The contract's two sends are spent: the third piece stays undone. */
const allSent = (c: Contract) => c.pieces.filter((p) => p.state === 'out' || p.state === 'back').length >= 2;

function pieceState(p: Piece, c: Contract, v: CrewView): [string, string] {
  if (p.state === 'open') return [up(p.spec), ''];
  if (p.state === 'back') return ['BACK', 'back'];
  if (p.state === 'waits') return [allSent(c) ? 'LEFT · TWO AT MOST' : 'WAITS · ONE A NIGHT', 'waits'];
  const who = v.roster.find((m) => m.recruit.id === p.recruit);
  return [['OUT', who ? first(who.recruit.name).toUpperCase() : null, p.due !== undefined ? `BACK ${hhmm(p.due)}` : null].filter(Boolean).join(' · '), 'out'];
}

function rowButton(r: Row, cls: string, state: string, stateCls: string, pick: () => void): HTMLButtonElement {
  const b = el('button', `cr-errand${cls}`);
  b.type = 'button';
  const text = el('span', 'cr-et');
  text.append(el('span', 'cr-et-title', r.title), el('span', `cr-es${stateCls ? ` ${stateCls}` : ''}`, state));
  b.append(artSlot('cr-thumb', r.art), text);
  b.addEventListener('click', pick);
  return b;
}

export function assignTab(v: CrewView, o: { act(a: CrewAction): void; picked?: string | null; sel: AssignPick }): HTMLElement {
  const root = el('div', 'cr-assign');
  const left = el('div', 'cr-assign-left');
  const brief = el('div', 'cr-brief');
  root.append(left, brief);
  const live = v.roster.filter((m) => m.state !== 'gone');
  if (v.wanted?.length) left.append(el('div', 'cr-wanted', ['WANTED TONIGHT', ...v.wanted.map((w) => `${w.name.toUpperCase()} ${up(w.kind)}`)].join(' · ')));
  const list = el('div', 'cr-errands');
  list.dataset.keep = 'errands';
  left.append(list);

  /** Where a lot can go tonight: a district someone can reach, or its own. */
  const salesOf = (l: Lot) => v.errands.filter((e) => e.lot === l.id && (Object.keys(e.odds).length > 0 || e.district === l.district));
  const rows: Row[] = [];
  const buttons = new Map<Row, HTMLButtonElement>();
  let row: Row | null = null;
  const add = (r: Row, cls: string, state: string, stateCls = '') => {
    rows.push(r);
    const b = rowButton(r, cls, state, stateCls, () => {
      row = r;
      o.sel.row = r.key;
      o.sel.where = null;
      if (r.lot) o.sel.who = null;
      draw();
    });
    buttons.set(r, b);
    list.append(b);
  };

  // The contract first: all three pieces, sendable or not.
  const inPieces = new Set<string>();
  for (const c of v.contracts ?? []) {
    list.append(el('div', 'cr-grp hot', `${c.title.toUpperCase()} · ${c.nightsLeft} NIGHT${c.nightsLeft === 1 ? '' : 'S'} LEFT`));
    for (const p of c.pieces) {
      const errand = p.state === 'open' ? (v.errands.find((e) => e.id === p.errand) ?? null) : null;
      if (errand) inPieces.add(errand.id);
      const [state, stateCls] = pieceState(p, c, v);
      add({ key: `${c.run}:${p.id}`, title: p.label, art: errand?.art ?? c.art, errand, piece: p, contract: c }, `${p.state === 'out' || p.state === 'back' ? ' taken' : ''} p-${p.state}`, state, stateCls);
    }
  }
  // The rest by kind, each district's errands together; a sale lives on its lot's row.
  const rest = v.errands.filter((e) => !inPieces.has(e.id) && !e.lot);
  const lowKey = (e: Errand) => e.kind === 'lay-low';
  const group = (head: string, errands: Errand[], state: (e: Errand) => string) => {
    if (errands.length === 0) return;
    list.append(el('div', 'cr-grp', head));
    const targets = [...new Set(errands.map((e) => e.target))];
    for (const e of targets.flatMap((t) => errands.filter((x) => x.target === t))) {
      add({ key: e.id, title: errandLabel(e), art: e.art, errand: e }, e.taken ? ' taken' : '', e.taken ? 'TAKEN TONIGHT' : state(e));
    }
  };
  const plain = (e: Errand) => `${e.tag} · ${e.hours}H`;
  const collect = rest.filter((e) => e.group === 'collect');
  group('COLLECT', collect, (e) => [up(e.goods ?? ''), `${e.hours}H`, ...(e.cost ? [`${e.cost} SOL`] : [])].join(' · '));
  // Offers are only drawn where you're Known, so none means Known nowhere. A bare list has the empty line instead.
  if (collect.length === 0 && (rows.length > 0 || rest.length > 0 || v.stash?.length)) list.append(el('div', 'cr-locked', 'COLLECT · LOCKED · REP 20 IN A DISTRICT'));
  // STASH (crew goods spec §8): one row a lot, its district picked in its file.
  if (v.stash?.length) list.append(el('div', 'cr-grp', 'STASH'));
  for (const l of v.stash ?? []) {
    const who = l.out ? v.roster.find((m) => m.recruit.id === l.out!.recruit) : undefined;
    const state = l.out ? `OUT · ${who ? first(who.recruit.name).toUpperCase() : 'SOMEONE'}` : [String(l.value), ...(l.damaged ? ['DAMAGED'] : []), ...(l.stale ? ['STALE'] : l.damaged ? [] : [`${l.nightsLeft} NIGHT${l.nightsLeft === 1 ? '' : 'S'} LEFT`])].join(' · ');
    add({ key: `lot:${l.id}`, title: l.label, art: l.art, errand: l.out ? null : (salesOf(l)[0] ?? null), lot: l }, l.out ? ' taken' : '', state);
  }
  const other = rest.filter((e) => e.group !== 'collect');
  group('DISTRICTS', other.filter((e) => e.target && !lowKey(e)), plain);
  group('LAY LOW', other.filter(lowKey), plain);
  group('OTHER', other.filter((e) => !e.target && !lowKey(e)), plain);
  if (rows.length === 0) list.append(el('div', 'cr-empty', 'NO ERRANDS TONIGHT. BE KNOWN SOMEWHERE, OR HAVE HEAT.'));

  // BACK TONIGHT and OUT NOW stay in view at the column's foot, however long the list runs.
  const foot = el('div', 'cr-list-foot');
  foot.dataset.keep = 'list-foot';
  const back = v.results.slice(0, 5);
  if (back.length > 0) {
    const b = el('div', 'cr-back');
    b.append(el('div', 'cr-sub', 'BACK TONIGHT'));
    for (const r of back) {
      const line = el('div', `cr-back-row r-${r.band}`);
      line.append(el('span', 'cr-when', hhmm(r.at)), el('span', 'cr-what', r.line), el('span', 'cr-eff', r.effects));
      b.append(line);
    }
    foot.append(b);
  }
  const out = live.filter((m) => m.state === 'out');
  if (out.length > 0) {
    const box = el('div', 'cr-out');
    box.append(el('div', 'cr-sub', 'OUT NOW'));
    for (const m of out) {
      const e = v.errands.find((x) => x.id === m.errand);
      const piece = v.contracts?.flatMap((c) => c.pieces).find((p) => p.recruit === m.recruit.id);
      const lot = v.stash?.find((l) => l.out?.recruit === m.recruit.id);
      const what = e ? errandLabel(e) : (piece?.label ?? (lot ? `Hustle · ${lot.label}` : undefined));
      const line = el('div', 'cr-out-row');
      line.append(face(m.recruit, 'cr-face small'), el('span', '', `${first(m.recruit.name).toUpperCase()}${what ? ` · ${what}` : ''}`), el('span', 'cr-eta', `BACK ${m.due !== undefined ? hhmm(m.due) : '—'}`));
      box.append(line);
    }
    foot.append(box);
  }
  if (foot.childElementCount > 0) left.append(foot);

  const open = (r: Row) => r.errand !== null && !r.errand.taken;
  row = rows.find((r) => r.key === o.sel.row) ?? (o.picked ? rows.find((r) => open(r) && r.errand!.odds[o.picked!]) : undefined) ?? rows.find(open) ?? rows[0] ?? null;
  o.sel.row = row?.key ?? null;
  o.sel.who ??= o.picked ?? null;

  /** WHO GOES: everyone not gone, those who can go first. `odds` is null on a piece that can't go tonight. */
  function picks(odds: Errand['odds'] | null, spec: Errand['spec'], routes?: Errand['routes']): HTMLElement {
    const strip = el('div', 'cr-picks');
    strip.dataset.keep = 'picks';
    const going = (m: CrewRosterEntry) => (busyReason(m) === null && odds?.[m.recruit.id] ? 0 : 1);
    for (const m of [...live].sort((a, b) => going(a) - going(b))) {
      const busy = busyReason(m);
      const od = odds?.[m.recruit.id];
      const b = el('button', `cr-pick s-${m.state}${odds && m.recruit.id === o.sel.who ? ' on' : ''}`);
      b.type = 'button';
      b.disabled = busy !== null || !od;
      const pic = cardPic(m.recruit);
      const trade = spec === m.recruit.spec ? 'THEIR TRADE' : spec || !od ? null : od.fits ? 'FITS' : 'OFF-FIT −15';
      if (trade && !busy) pic.append(el('span', `cr-why${spec === m.recruit.spec ? ' trade' : ''}`, trade));
      const foot = el('span', 'cr-pick-foot');
      if (busy) foot.textContent = busy;
      else if (od) foot.append(el('b', 'cr-pct', `${od.clean}%`), ' CLEAN');
      else foot.textContent = '—';
      const route = routes?.[m.recruit.id];
      b.append(pic, el('span', 'cr-pick-name', first(m.recruit.name).toUpperCase()), route && !busy ? el('span', 'cr-pick-price', `${route.price} SOL`) : el('span', 'cr-pick-grade', `${m.recruit.spec.toUpperCase()} · ${GRADES[m.recruit.grade]}`), foot);
      b.addEventListener('click', () => {
        o.sel.who = m.recruit.id;
        draw();
      });
      strip.append(b);
    }
    return strip;
  }

  function odds(e: Errand, inner: HTMLElement): void {
    const ready = live.filter((m) => !busyReason(m) && e.odds[m.recruit.id]);
    // A sale opens on whoever pays best: hire order could be the wrong route at 60 %.
    const best = e.routes ? [...ready].sort((a, b) => (e.routes![b.recruit.id]?.price ?? 0) - (e.routes![a.recruit.id]?.price ?? 0)) : ready;
    if (!o.sel.who || !ready.some((m) => m.recruit.id === o.sel.who)) o.sel.who = best[0]?.recruit.id ?? null;
    inner.append(el('div', 'cr-sub', 'WHO GOES'), picks(e.odds, e.spec, e.routes));
    const m = live.find((x) => x.recruit.id === o.sel.who);
    const od = o.sel.who ? e.odds[o.sel.who] : undefined;
    if (!m || !od) return void inner.append(el('div', 'cr-empty', 'NOBODY FREE TO SEND.'));
    const bar = el('div', 'cr-odds');
    for (const [cls, name, n] of [['o-clean', 'CLEAN', od.clean], ['o-messy', 'MESSY', od.messy], ['o-blown', 'BLOWN', od.blown]] as const) {
      const seg = el('div', cls, n >= 14 ? `${name} ${n}` : String(n));
      seg.style.flexBasis = `${n}%`;
      bar.append(seg);
    }
    const name = first(m.recruit.name);
    const send = el('button', 'cr-btn cr-send', `SEND ${name.toUpperCase()}`);
    send.type = 'button';
    send.addEventListener('click', () => {
      // On to the next errand when it lands; a piece stays up, its file says who's on it.
      if (!row?.piece) o.sel.row = null;
      o.sel.where = null;
      if (e.lot) o.sel.who = null;
      o.act({ do: 'send', recruit: m.recruit.id, errand: e.id });
    });
        const line = el('div', 'cr-odds-row');
    line.append(bar, el('div', 'cr-split', `HURT ${od.hurt} · HELD ${od.held} · GONE ${od.gone}`));
    const go = el('div', 'cr-send-row');
    go.append(el('span', 'cr-cost', `${e.cost ? `COSTS ${e.cost} SOL · ` : ''}BACK IN ABOUT ${e.routes?.[m.recruit.id]?.hours ?? e.hours}H · RECALL ANY TIME, NO RESULT`), send);
    const end = el('div', 'cr-file-foot');
    end.append(line, go);
    inner.append(end);
  }

  /** Where a lot goes: tonight's board first, then its own district. */
  function where(l: Lot, inner: HTMLElement): Errand | null {
    const sales = salesOf(l);
    const e = sales.find((x) => x.district === o.sel.where) ?? sales.find((x) => x.wanted) ?? sales.find((x) => x.district === l.district) ?? sales[0] ?? null;
    if (!e) return null;
    o.sel.where = e.district;
    const box = el('div', 'cr-where');
    for (const s of sales) {
      const b = el('button', s === e ? 'on' : '', `${s.name.toUpperCase()}${s.wanted ? ' · WANTED' : ''}`);
      b.type = 'button';
      b.addEventListener('click', () => {
        o.sel.where = s.district;
        draw();
      });
      box.append(b);
    }
    inner.append(el('div', 'cr-sub', 'WHERE'), box);
    return e;
  }

  /** A lot on a sale: who has it. */
  function lotOut(l: Lot, inner: HTMLElement): void {
    const who = v.roster.find((m) => m.recruit.id === l.out!.recruit);
    const go = el('div', 'cr-send-row');
    go.append(el('span', 'cr-cost', `${who ? first(who.recruit.name).toUpperCase() : 'SOMEONE'} HAS IT${l.out!.due !== undefined ? ` · BACK ${hhmm(l.out!.due)}` : ''}`));
    if (who) {
      const recall = el('button', 'cr-btn soft cr-recall', 'RECALL');
      recall.type = 'button';
      recall.addEventListener('click', () => o.act({ do: 'recall', recruit: who.recruit.id }));
      go.append(recall);
    }
    const end = el('div', 'cr-file-foot');
    end.append(go);
    inner.append(end);
  }

  /** A piece that can't go tonight: who's on it, or why it waits. */
  function unsent(r: Row & { piece: Piece; contract: Contract }, inner: HTMLElement): void {
    inner.append(el('div', 'cr-sub', 'WHO GOES'), picks(null, r.piece.spec));
    const who = v.roster.find((m) => m.recruit.id === r.piece.recruit);
    const line = r.piece.state === 'out' ? `${who ? first(who.recruit.name).toUpperCase() : 'SOMEONE'} IS ON IT` : r.piece.state === 'back' ? 'BACK. THE REPORT COMES TO WHOEVER GAVE YOU THIS' : allSent(r.contract) ? 'TWO PIECES AT MOST. THIS ONE STAYS UNDONE' : 'ONE PIECE A NIGHT · BACK AT 06:00';
    const go = el('div', 'cr-send-row');
    go.append(el('span', 'cr-cost', line));
    if (r.piece.state === 'out' && who) {
      const recall = el('button', 'cr-btn soft cr-recall', 'RECALL');
      recall.type = 'button';
      recall.addEventListener('click', () => o.act({ do: 'recall', recruit: who.recruit.id }));
      go.append(recall);
    } else {
      const send = el('button', 'cr-btn', 'SEND');
      send.type = 'button';
      send.disabled = true;
      go.append(send);
    }
    const end = el('div', 'cr-file-foot');
    end.append(go);
    inner.append(end);
  }

  function draw(): void {
    keepScroll(brief, () => {
      for (const [r, b] of buttons) b.classList.toggle('on', r === row);
      brief.replaceChildren();
      if (!row) return;
      const r = row;
      const inner = el('div', 'cr-in');
      inner.dataset.keep = 'in';
      brief.append(artSlot('cr-art', r.art), inner);
      if (r.lot) {
        const l = r.lot;
        const meta = el('div', 'cr-meta');
        for (const text of [`${l.value} SOL`, ...(l.damaged ? ['DAMAGED'] : []), l.stale ? 'STALE' : `${l.nightsLeft} NIGHT${l.nightsLeft === 1 ? '' : 'S'} LEFT`, `FROM ${up(l.district)}`]) meta.append(el('span', '', text));
        inner.append(el('h2', '', l.label.toUpperCase()), meta);
        if (l.out) return lotOut(l, inner);
        const sale = where(l, inner);
        if (sale) odds(sale, inner);
        else inner.append(el('div', 'cr-empty', 'NOWHERE TO SELL IT TONIGHT.'));
        return;
      }
      const e = r.errand;
      const hours = e?.hours ?? r.contract!.hours;
      const risk = e?.risk ?? r.contract!.risk;
      const suits = r.piece ? up(r.piece.spec) : e!.suits.map(up).join(' · ');
      const meta = el('div', 'cr-meta');
      for (const text of [`${hours}H`, `${riskWord(risk)} RISK`, `SUITS ${suits}`, ...(e?.district ? [up(e.district)] : [])]) meta.append(el('span', '', text));
      inner.append(el('h2', '', r.title.toUpperCase()), meta);
      const blurb = r.piece?.line ?? (e ? fill(e, e.blurb) : '');
      if (blurb) inner.append(el('p', 'cr-blurb', blurb));
      if (e?.taken) return void inner.append(el('div', 'cr-taken', 'TAKEN TONIGHT. IT COMES BACK AT 06:00, OR NOT.'));
      if (e) odds(e, inner);
      else unsent(r as Row & { piece: Piece; contract: Contract }, inner);
    });
  }
  draw();
  return root;
}
