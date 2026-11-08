/**
 * Papers' desk on the board (mockup docs/mockups/papers-board.html, the playtest's pick D, 2026-11-08): the shell's
 * regions each get a piece. Top: the title, RISK as the clock, the take. Left: tonight's bulletin with your notes.
 * Middle: the papers, editable, with the extras on them. Levers: booth nine's token, UNDO, RESET, HAND OVER.
 * Bottom: the six fields as a hand. Lift one to pick its value, and its rows light on every paper that prints
 * it. Every piece is drawn whole from a Desk on every change; every value goes in as text, never as HTML.
 */
import '@fontsource/special-elite';
import '@fontsource/courier-prime';
import { faceUrl, type AgeBand } from '../../../../shared/papers/data';
import { photoWarning, risk, type Desk, type DeskAction } from '../../../../shared/papers/desk';
import { cost, DOCS, FIELDS, ruleText, valuesFor, type DocId, type Field } from '../../../../shared/papers/rules';
import type { Brief } from '../../../../shared/gig/brief';
import './papers.css';

/** The board's regions (a table shell in HUD mode), and its root, which carries the papers' tokens. */
export interface DeskRegions {
  root: HTMLElement;
  top: HTMLElement;
  log: HTMLElement;
  middle: HTMLElement;
  levers: HTMLElement;
  bottom: HTMLElement;
}

export interface DeskViewOpts {
  desk: Desk;
  brief: Brief;
  origins: readonly string[];
  /** The title's step: EASY, MEDIUM, HARD. */
  step: string;
  /** The officer's notes still pinned (first night). */
  notes: readonly string[];
  shake: boolean;
  /** The field card that's lifted, if any. */
  lifted: Field | null;
  /** Booth nine's token is picked up: the bulletin's rules take it. */
  armed: boolean;
  onAct(a: DeskAction): void;
  onHandOver(): void;
  onDismissNote(i: number | 'all'): void;
  onLift(f: Field | null): void;
  onArm(on: boolean): void;
}

const LABELS: Record<DocId, Partial<Record<Field, string>>> = {
  id: { origin: 'PLACE OF ORIGIN', trade: 'DECLARED TRADE', age: 'AGE' },
  permit: { district: '1 · DISTRICT OF PLACEMENT', trade: '2 · TRADE', sponsor: '3 · SPONSOR' },
  transit: { origin: 'FROM', district: 'TO', arrival: 'ARRIVED' },
};
const FIELD_LABEL: Record<Field, string> = { origin: 'ORIGIN', district: 'DISTRICT', trade: 'TRADE', age: 'AGE', sponsor: 'SPONSOR', arrival: 'ARRIVAL' };
const DOC_SHORT: Record<DocId, string> = { id: 'ID', permit: 'PERMIT', transit: 'TICKET' };
const NOTE_MARK = { '': '', ok: '✓', unsure: '?' } as const;
const HINT = {
  easy: "The desk flags a photo that won't pass. It never tells you whether a rule passes.",
  other: 'The desk tells you nothing. The bulletin is all you get.',
};

type Attrs = Record<string, string>;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string, attrs: Attrs = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
export function btn(text: string, cls: string, run: () => void, attrs: Attrs = {}): HTMLButtonElement {
  const b = el('button', cls, text, { type: 'button', ...attrs });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) run();
  });
  return b;
}
/** A stamp or the crest: tinted ink on its art, its words underneath for when the art is missing. */
export const ink = (cls: string, words: string) => el('span', `pp-ink ${cls}`, words);

/** No face for this band: a head-and-shoulders silhouette. */
function silhouette(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 92 110');
  for (const [tag, a] of [
    ['rect', { width: '92', height: '110', fill: '#9aa3a0' }],
    ['path', { d: 'M10 110 Q12 80 46 76 Q80 80 82 110 Z', fill: '#4a514f' }],
    ['ellipse', { cx: '46', cy: '46', rx: '20', ry: '25', fill: '#5e6563' }],
  ] as const) {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(a)) n.setAttribute(k, v);
    svg.append(n);
  }
  return svg;
}

/** What one field costs at value `v`, against the truth (the sponsor's letter included). Fields add up apart. */
const fieldCost = (d: Desk, f: Field, v: string) => cost({ ...d.board.truth, [f]: v }, d.board.truth);

/** RISK as the clock: a segment per point to the cap, booth nine's share striped, the CLEAN line after its segment. */
export function riskClock(d: Desk, shake: boolean): HTMLElement {
  const b = d.board;
  const now = risk(d);
  const boothPips = d.overlooked !== null ? b.booth : 0;
  const meter = el('div', `pp-meter${shake ? ' pp-shake' : ''}`);
  const head = el('div', 'pp-read');
  const n = el('span', 'pp-of');
  n.append(el('b', 'pp-risk', String(now)), ` / ${b.cap}`);
  head.append(el('span', 'pp-word', 'RISK'), n);
  const bar = el('div', 'pp-bar');
  for (let i = 0; i < b.cap; i++) {
    const full = i < now;
    const booth = full && i >= now - boothPips;
    bar.append(el('div', `pp-seg${full ? ' pp-full' : ''}${booth ? ' pp-boothseg' : ''}${i + 1 === b.clean ? ' pp-clean' : ''}`));
  }
  const foot = el('div', 'pp-read');
  foot.append(el('span', 'pp-green', `CLEAN ≤ ${b.clean}`), ...(boothPips ? [el('span', 'pp-cyan', '▨ BOOTH NINE')] : []));
  meter.append(head, bar, foot);
  return meter;
}

/** The top bar: the job's title and step, the clock, the take. */
export function renderTop(o: Pick<DeskViewOpts, 'desk' | 'brief' | 'step' | 'shake'>): HTMLElement[] {
  const title = el('div', 'pp-title');
  title.append(el('h4', '', o.brief.title), el('span', 'pp-strip', `${o.step} · ${o.brief.client}`));
  const take = el('div', 'pp-take', 'TAKE');
  take.append(el('b', '', o.brief.take));
  return [title, riskClock(o.desk, o.shake), take];
}

/** The left column: tonight's bulletin, your notes on it, and booth nine's place when the token is up. */
export function renderBulletin(o: Pick<DeskViewOpts, 'desk' | 'armed' | 'onAct' | 'onArm'>): HTMLElement {
  const { desk } = o;
  const b = desk.board;
  const t = b.truth;
  const wrap = el('div', `pp-bulletin${o.armed ? ' pp-armed' : ''}`);
  const list = el('ol');
  b.rules.forEach((r, i) => {
    const looked = desk.overlooked === i;
    const li = el('li', looked ? 'pp-looked' : '');
    // A real button (spec §3.5): clicking or pressing it cycles your note on the rule.
    const text = btn(ruleText(r.rule), 'pp-rule-text', () => o.onAct({ k: 'note', i }), { 'data-k': `note-${i}` });
    const foot = el('div', 'pp-rule-foot');
    foot.append(el('span', 'pp-note', NOTE_MARK[desk.notes[i]]));
    // Booth nine's place: on the rule he looks past (click to take him back), or offered on every rule while the token is up.
    if (looked) foot.append(btn('⌁ LOOKED PAST', 'pp-booth pp-on', () => o.onAct({ k: 'overlook', i }), { 'data-k': `booth-${i}`, 'aria-pressed': 'true' }));
    else if (o.armed)
      foot.append(
        btn('⌁ LOOK PAST', 'pp-booth', () => {
          // The act first, so the redraw that disarms still has this rule's button to keep focus on.
          o.onAct({ k: 'overlook', i });
          o.onArm(false);
        }, { 'data-k': `booth-${i}`, 'aria-pressed': 'false' }),
      );
    li.append(text, el('span', 'pp-why', r.why), foot);
    list.append(li);
  });
  const held = [t.medical && 'medical slip', t.renewal && 'renewal stamp', t.sponsor !== 'none' && 'sponsor letter'].filter(Boolean).join(', ') || 'nothing else';
  const holds = el('div', 'pp-holds');
  holds.append(el('em', '', `${b.name.toUpperCase()} HOLDS `), held);
  wrap.append(
    el('h5', '', 'CUSTOMS · TONIGHT'),
    el('div', 'pp-sub', 'Isle bulletin, booth nine. Read it twice.'),
    list,
    el('div', 'pp-always', 'ALWAYS: the photo fits the age, and a sponsor on the permit has a letter that names it.'),
    holds,
    el('div', 'pp-hint', b.tier === 'easy' ? HINT.easy : HINT.other),
  );
  return wrap;
}

/** The middle: the papers, editable as ever, the extras on them, and the officer's notes on the first night. */
export function renderPapers(o: Pick<DeskViewOpts, 'desk' | 'origins' | 'notes' | 'lifted' | 'onAct' | 'onDismissNote'>): HTMLElement {
  const { desk } = o;
  const b = desk.board;
  const t = b.truth;
  const p = desk.packet;
  const values = valuesFor(o.origins);
  const warnPhoto = photoWarning(desk);

  const row = (doc: DocId, f: Field) => {
    const forged = p[f] !== t[f];
    const r = el('div', `pp-row${forged ? ' pp-forged' : ''}${warnPhoto && f === 'age' ? ' pp-warned' : ''}${o.lifted === f ? ' pp-hot pp-lit' : ''}`, undefined, { 'data-f': f });
    const sel = el('select', '', undefined, { 'data-doc': doc, 'data-f': f, 'aria-label': `${LABELS[doc][f]}` });
    for (const v of values[f]) {
      const opt = el('option', '', v, { value: v });
      if (v === p[f]) opt.selected = true;
      sel.append(opt);
    }
    sel.value = p[f];
    sel.addEventListener('change', () => o.onAct({ k: 'set', f, v: sel.value }));
    r.append(el('span', 'pp-k', LABELS[doc][f]), sel, el('span', 'pp-tag', forged ? '✎' : ''));
    if (warnPhoto && f === 'age') r.append(el('span', 'pp-warn', "the photo won't pass for that age"));
    return r;
  };
  const rows = (doc: DocId) => DOCS.find((d) => d.id === doc)!.fields.map((f) => row(doc, f));
  /** A paper's share of RISK, on its corner like a pencilled sum. */
  const docMark = (doc: DocId) => {
    const n = DOCS.find((d) => d.id === doc)!.fields.filter((f) => p[f] !== t[f]).length;
    return n ? [el('span', 'pp-forgedmark', `✎ +${n}`)] : [];
  };

  // ID card
  const photo = el('div', 'pp-photo');
  const url = faceUrl(b.face.id);
  const img = url ? el('img', '', undefined, { src: url, alt: '' }) : null;
  // A face that won't load is drawn as the silhouette, not a broken image.
  img?.addEventListener('error', () => img.replaceWith(silhouette()));
  photo.append(img ?? silhouette(), el('div', 'pp-looks', `looks ${b.face.looks.join(' or ')}`));
  const idFields = el('div');
  idFields.append(el('div', 'pp-idname', b.name), el('div', 'pp-idmeta', `${b.idNumber} · ISSUED ${b.issued}`), ...rows('id'));
  const mrz = `ARR<<LWL<${p.origin.replace(/^the /, '').toUpperCase().replace(/\s/g, '<')}<<${p.trade.toUpperCase().replace(/\s/g, '<')}<${b.idNumber.slice(4)}<<<<<<<<`;
  const idcard = el('div', 'pp-doc pp-idcard');
  const idtop = el('div', 'pp-idtop', 'CITY OF LOWLIGHT');
  idtop.append(el('span', '', 'ARRIVAL IDENTITY'));
  const idbody = el('div', 'pp-idbody');
  idbody.append(photo, idFields);
  idcard.append(idtop, idbody, ink('pp-crest', ''), el('div', 'pp-mrz', mrz), ...docMark('id'));

  // ferry ticket
  const renewed = p.renewal;
  const ticket = el('div', 'pp-doc pp-ticket');
  const tmain = el('div', 'pp-tmain');
  const thead = el('div', 'pp-thead', 'FERRY TRANSIT');
  thead.append(el('span', '', 'ISLE ARRIVALS'));
  tmain.append(thead, ...rows('transit'));
  const stub = el('div', 'pp-tstub');
  stub.append(el('span', '', 'ADMIT ONE'), el('b', '', `№ ${b.idNumber.slice(-4)}`), el('span', '', 'TIDAL ISLE'));
  // Stamped, the stub takes it off; without one, its own empty slot offers it (beside the medical slip's).
  if (renewed) stub.append(btn('UNSTAMP', 'pp-fbtn', () => o.onAct({ k: 'extra', x: 'renewal', on: false }), { 'data-k': 'extra-renewal' }));
  ticket.append(tmain, stub, ink('pp-crest', ''), ...docMark('transit'));
  if (renewed) {
    const r = el('div', 'pp-renew');
    const blue = t.renewal ? '' : ' pp-blue';
    r.append(ink(`pp-a${blue}`, 'RENEWED'), ink(`pp-b${blue}`, 'HOLDING BLOCK OFFICE'));
    ticket.append(r);
    if (!t.renewal) ticket.append(el('span', 'pp-forgedmark pp-low', '✎ +2'));
  }

  // work permit
  const permit = el('div', 'pp-doc pp-permit');
  const phead = el('div', 'pp-phead');
  phead.append(el('b', '', 'TIDAL ISLE · OFFICE OF ARRIVALS'), 'WORK PERMIT · FORM 7-B');
  const sig = el('div', 'pp-sig');
  const officer = el('span', '', 'ISSUING OFFICER');
  officer.append(el('br'), el('i', '', 'R. Okafor'));
  sig.append(officer, ink('pp-seal', 'ISLE CUSTOMS'));
  permit.append(phead, ...rows('permit'), ink('pp-crest', ''), sig, ...docMark('permit'));

  // medical slip
  const medical = p.medical
    ? (() => {
        const m = el('div', 'pp-doc pp-medical');
        if (!t.medical) m.append(el('span', 'pp-forgedmark', '✎ +2'));
        m.append(el('b', '', 'ISLE HEALTH OFFICE'), 'MEDICAL SLIP', el('br'), 'No quarantine markers.', el('br'), 'Fit for work.', ink('pp-cleared', 'CLEARED'), btn('REMOVE', 'pp-fbtn', () => o.onAct({ k: 'extra', x: 'medical', on: false }), { 'data-k': 'extra-medical' }));
        return m;
      })()
    : (() => {
        const g = el('div', 'pp-ghost', 'NO MEDICAL SLIP');
        g.append(btn(t.medical ? 'PUT BACK' : 'FORGE +2', 'pp-fbtn', () => o.onAct({ k: 'extra', x: 'medical', on: true }), { 'data-k': 'extra-medical' }));
        return g;
      })();

  // sponsor letter (follows the permit)
  let letter: HTMLElement;
  if (p.sponsor !== 'none') {
    const lCost = t.sponsor === 'none' ? 2 : p.sponsor !== t.sponsor ? 1 : 0;
    letter = el('div', 'pp-doc pp-letter');
    if (lCost) letter.append(el('span', 'pp-forgedmark', `✎ +${lCost}`));
    letter.append(el('div', 'pp-lh', 'LETTER OF SPONSORSHIP'), 'To the Office of Arrivals: the bearer is known to us and placed with us. We answer for them.', el('br'), el('br'), `Signed, on behalf of ${p.sponsor}.`);
  } else {
    letter = el('div', 'pp-ghost', 'NO SPONSOR LETTER');
    letter.append(el('span', '', 'comes with a sponsor on the permit'));
  }

  const renewal = renewed
    ? null
    : (() => {
        const g = el('div', 'pp-ghost', 'NO RENEWAL STAMP');
        g.append(el('span', '', 'stamped on the ferry ticket'), btn(t.renewal ? 'PUT BACK' : 'STAMP +2', 'pp-fbtn', () => o.onAct({ k: 'extra', x: 'renewal', on: true }), { 'data-k': 'extra-renewal' }));
        return g;
      })();

  const extras = el('div', 'pp-extras');
  extras.append(medical, ...(renewal ? [renewal] : []), letter);
  const docs = el('div', 'pp-docs');
  docs.append(idcard, permit, ticket, extras);
  docs.addEventListener('mouseover', (e) => {
    const r = (e.target as Element).closest?.('.pp-row') as HTMLElement | null;
    if (r) for (const x of docs.querySelectorAll(`.pp-row[data-f="${r.dataset.f}"]`)) x.classList.add('pp-hot');
  });
  docs.addEventListener('mouseout', () => docs.querySelectorAll('.pp-hot:not(.pp-lit)').forEach((x) => x.classList.remove('pp-hot')));

  const middle = el('div', 'pp-desk');
  middle.append(docs);
  if (o.notes.length) {
    const notes = el('div', 'pp-notes');
    o.notes.forEach((n, i) => {
      const card = el('div', 'pp-officer-note', n);
      card.append(btn('×', '', () => o.onDismissNote(i), { 'aria-label': 'dismiss', 'data-k': `dismiss-${i}` }));
      notes.append(card);
    });
    notes.append(btn('GOT IT', 'pp-gotit', () => o.onDismissNote('all'), { 'data-k': 'gotit' }));
    middle.append(notes);
  }
  return middle;
}

/** The hand: one card per field. Its value, the truth when you've changed it, the papers that print it, its cost. */
export function renderFieldHand(o: Pick<DeskViewOpts, 'desk' | 'origins' | 'lifted' | 'onAct' | 'onLift'>): HTMLElement {
  const { desk } = o;
  const b = desk.board;
  const t = b.truth;
  const p = desk.packet;
  const values = valuesFor(o.origins);
  const hand = el('div', 'pp-hand');
  for (const f of FIELDS) {
    const forged = p[f] !== t[f];
    const lifted = o.lifted === f;
    const card = el('div', `pp-field${forged ? ' pp-forged' : ''}${lifted ? ' pp-lift' : ''}`, undefined, { 'data-field': f });
    const on = DOCS.filter((d) => d.fields.includes(f)).map((d) => DOC_SHORT[d.id]).join(' · ') + (f === 'sponsor' ? ' + LETTER' : '');
    const head = btn('', 'pp-field-head', () => o.onLift(lifted ? null : f), { 'data-k': `field-${f}`, 'aria-expanded': String(lifted), 'aria-label': `${FIELD_LABEL[f]}: ${p[f]}` });
    head.append(
      el('span', 'pp-spec', FIELD_LABEL[f]),
      ...(forged ? [el('span', 'pp-grade', '✎')] : []),
      el('span', 'pp-val', p[f]),
      el('span', 'pp-tru', forged ? `TRUE: ${t[f]}` : 'AS THEY ARE'),
      el('span', 'pp-on', `ON ${on}`),
    );
    card.append(head);
    if (lifted) {
      const opts = el('div', 'pp-opts', undefined, { role: 'group', 'aria-label': `${FIELD_LABEL[f]} values` });
      values[f].forEach((v, i) => {
        const c = fieldCost(desk, f, v);
        // The photo only gets flagged where the desk flags it (easy: spec §3.4).
        const badPhoto = f === 'age' && b.tier === 'easy' && !b.face.looks.includes(v as AgeBand);
        const cls = `pp-opt${v === p[f] ? ' pp-cur' : ''}${v === t[f] ? ' pp-true' : ''}${badPhoto ? ' pp-photo-bad' : ''}`;
        // The run drops the card unless the pick is refused (over the cap: it stays up for another).
        const opt = btn('', cls, () => o.onAct({ k: 'set', f, v }), { 'data-k': `opt-${f}-${i}`, 'data-v': v, 'aria-pressed': String(v === p[f]) });
        opt.append(el('span', '', v), el('small', '', v === t[f] ? 'TRUE' : `+${c}`));
        opts.append(opt);
      });
      card.append(opts);
    }
    const foot = el('div', 'pp-foot');
    // At rest, the cheapest change (the sponsor's letter counted: +3 from none, +2 to another).
    const cheapest = Math.min(...values[f].filter((v) => v !== t[f]).map((v) => fieldCost(desk, f, v)));
    foot.append(el('span', '', forged ? 'FORGED' : 'CHANGE'), el('span', 'pp-cost', `+${forged ? fieldCost(desk, f, p[f]) : cheapest}`));
    card.append(foot);
    hand.append(card);
  }
  return hand;
}

/** The levers: booth nine's token, UNDO, RESET, and HAND OVER as a picture. */
export function renderLevers(o: Pick<DeskViewOpts, 'desk' | 'armed' | 'onAct' | 'onArm' | 'onHandOver'>): HTMLElement[] {
  const { desk } = o;
  const b = desk.board;
  const on = desk.overlooked;
  const tokenWords = on !== null ? ['⌁', `ON RULE ${on + 1}`] : o.armed ? ['⌁', 'PICK A RULE'] : ['⌁', b.booth ? `+${b.booth}` : 'FREE'];
  const token = btn('', `pp-token${on !== null ? ' pp-spent' : ''}${o.armed ? ' pp-armed' : ''}`, () => {
    if (on !== null) o.onAct({ k: 'overlook', i: on });
    else o.onArm(!o.armed);
  }, { 'data-k': 'token', 'aria-pressed': String(o.armed || on !== null), 'aria-label': on !== null ? `Booth nine looks past rule ${on + 1}: take it back` : 'Booth nine: look past one rule' });
  token.append(el('b', '', tokenWords[0]), el('span', '', tokenWords[1]));
  const undo = btn('UNDO', 'pp-lv', () => o.onAct({ k: 'undo' }), { 'data-k': 'undo' });
  undo.disabled = desk.history.length === 0;
  const hand = btn('HAND OVER', 'pp-hand-over', () => o.onHandOver(), { 'data-k': 'hand' });
  return [el('div', 'pp-lvhead', 'BOOTH NINE'), token, undo, btn('RESET', 'pp-lv', () => o.onAct({ k: 'reset' }), { 'data-k': 'reset' }), el('div', 'pp-lvhead', 'HAND OVER'), hand];
}
