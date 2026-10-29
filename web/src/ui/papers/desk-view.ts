/**
 * Papers' desk (spec §3.3, §5): the client's truth, the five documents, tonight's bulletin with
 * notes and booth nine, RISK, and UNDO · RESET · HAND OVER. Drawn whole from a Desk on every
 * change; every value goes in as text, never as HTML.
 */
import '@fontsource/special-elite';
import '@fontsource/courier-prime';
import { faceUrl } from '../../../../shared/papers/data';
import { photoWarning, risk, type Desk, type DeskAction } from '../../../../shared/papers/desk';
import { DOCS, FIELDS, ruleText, valuesFor, type DocId, type Field } from '../../../../shared/papers/rules';
import './papers.css';

export interface DeskViewOpts {
  desk: Desk;
  origins: readonly string[];
  /** The officer's notes still pinned (first night). */
  notes: readonly string[];
  shake: boolean;
  onAct(a: DeskAction): void;
  onHandOver(): void;
  onDismissNote(i: number | 'all'): void;
}

const LABELS: Record<DocId, Partial<Record<Field, string>>> = {
  id: { origin: 'PLACE OF ORIGIN', trade: 'DECLARED TRADE', age: 'AGE' },
  permit: { district: '1 · DISTRICT OF PLACEMENT', trade: '2 · TRADE', sponsor: '3 · SPONSOR' },
  transit: { origin: 'FROM', district: 'TO', arrival: 'ARRIVED' },
};
const FIELD_LABEL: Record<Field, string> = { origin: 'ORIGIN', district: 'DISTRICT', trade: 'TRADE', age: 'AGE', sponsor: 'SPONSOR', arrival: 'ARRIVAL' };
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
function btn(text: string, cls: string, run: () => void, attrs: Attrs = {}): HTMLButtonElement {
  const b = el('button', cls, text, { type: 'button', ...attrs });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) run();
  });
  return b;
}
/** A stamp or the crest: tinted ink on its art, its words underneath for when the art is missing. */
const ink = (cls: string, words: string) => el('span', `pp-ink ${cls}`, words);

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

export function renderDesk(o: DeskViewOpts): HTMLElement {
  const { desk } = o;
  const b = desk.board;
  const t = b.truth;
  const p = desk.packet;
  const values = valuesFor(o.origins);
  const warnPhoto = photoWarning(desk);

  const row = (doc: DocId, f: Field) => {
    const forged = p[f] !== t[f];
    const r = el('div', `pp-row${forged ? ' pp-forged' : ''}${warnPhoto && f === 'age' ? ' pp-warned' : ''}`, undefined, { 'data-f': f });
    const sel = el('select', '', undefined, { 'data-doc': doc, 'data-f': f, 'aria-label': `${LABELS[doc][f]}` });
    for (const v of values[f]) {
      const opt = el('option', '', v, { value: v });
      if (v === p[f]) opt.selected = true;
      sel.append(opt);
    }
    sel.value = p[f];
    sel.addEventListener('change', () => o.onAct({ k: 'set', f, v: sel.value }));
    r.append(el('span', 'pp-k', LABELS[doc][f]), sel, el('span', 'pp-tag', forged ? '✎ +1' : ''));
    if (warnPhoto && f === 'age') r.append(el('span', 'pp-warn', "the photo won't pass for that age"));
    return r;
  };
  const rows = (doc: DocId) => DOCS.find((d) => d.id === doc)!.fields.map((f) => row(doc, f));

  // WHO THEY ARE
  const held = [t.medical && 'medical slip', t.renewal && 'renewal stamp', t.sponsor !== 'none' && 'sponsor letter'].filter(Boolean).join(', ') || 'nothing else';
  const truth = el('div', 'pp-truth');
  truth.replaceChildren(...FIELDS.map((f) => {
    const s = el('span');
    s.append(el('em', '', FIELD_LABEL[f]), ` ${t[f]}`);
    return s;
  }), (() => {
    const s = el('span');
    s.append(el('em', '', 'HOLDS'), ` ${held}`);
    return s;
  })());

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
  idcard.append(idtop, idbody, ink('pp-crest', ''), el('div', 'pp-mrz', mrz));

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
  ticket.append(tmain, stub, ink('pp-crest', ''));
  if (renewed) {
    const r = el('div', 'pp-renew');
    const blue = t.renewal ? '' : ' pp-blue';
    r.append(ink(`pp-a${blue}`, 'RENEWED'), ink(`pp-b${blue}`, 'HOLDING BLOCK OFFICE'));
    ticket.append(r);
    if (!t.renewal) ticket.append(el('span', 'pp-forgedmark', '✎ +2'));
  }

  // work permit
  const permit = el('div', 'pp-doc pp-permit');
  const phead = el('div', 'pp-phead');
  phead.append(el('b', '', 'TIDAL ISLE · OFFICE OF ARRIVALS'), 'WORK PERMIT · FORM 7-B');
  const sig = el('div', 'pp-sig');
  const officer = el('span', '', 'ISSUING OFFICER');
  officer.append(el('br'), el('i', '', 'R. Okafor'));
  sig.append(officer, ink('pp-seal', 'ISLE CUSTOMS'));
  permit.append(phead, ...rows('permit'), ink('pp-crest', ''), sig);

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

  const docs = el('div', 'pp-docs');
  docs.append(idcard, ticket, permit, medical, ...(renewal ? [renewal] : []), letter);
  docs.addEventListener('mouseover', (e) => {
    const r = (e.target as Element).closest?.('.pp-row') as HTMLElement | null;
    if (r) for (const x of docs.querySelectorAll(`.pp-row[data-f="${r.dataset.f}"]`)) x.classList.add('pp-hot');
  });
  docs.addEventListener('mouseout', () => docs.querySelectorAll('.pp-hot').forEach((x) => x.classList.remove('pp-hot')));

  const deskEl = el('div', 'pp-desk');
  if (o.notes.length) {
    const notes = el('div', 'pp-notes');
    o.notes.forEach((n, i) => {
      const card = el('div', 'pp-officer-note', n);
      card.append(btn('×', '', () => o.onDismissNote(i), { 'aria-label': 'dismiss', 'data-k': `dismiss-${i}` }));
      notes.append(card);
    });
    notes.append(btn('GOT IT', 'pp-gotit', () => o.onDismissNote('all'), { 'data-k': 'gotit' }));
    deskEl.append(notes);
  }
  deskEl.append(el('div', 'pp-label', 'WHO THEY ARE'), truth, el('div', 'pp-label', 'THE PACKET'), docs);

  // the side column
  const bulletin = el('div', 'pp-bulletin');
  const list = el('ol');
  b.rules.forEach((r, i) => {
    const li = el('li');
    // A real button (spec §3.5): clicking or pressing it cycles your note on the rule.
    const text = btn(ruleText(r.rule), 'pp-rule-text', () => o.onAct({ k: 'note', i }), { 'data-k': `note-${i}` });
    const foot = el('div', 'pp-rule-foot');
    foot.append(el('span', 'pp-note', NOTE_MARK[desk.notes[i]]), btn('⌁ BOOTH NINE', `pp-booth${desk.overlooked === i ? ' pp-on' : ''}`, () => o.onAct({ k: 'overlook', i }), { 'data-k': `booth-${i}`, 'aria-pressed': String(desk.overlooked === i) }));
    li.append(text, el('span', 'pp-why', r.why), foot);
    list.append(li);
  });
  bulletin.append(el('h5', '', 'CUSTOMS · TONIGHT'), el('div', 'pp-sub', 'Isle bulletin, booth nine. Read it twice.'), list, el('div', 'pp-always', 'Always: the photo fits the age, and a sponsor on the permit has a letter that names it.'));

  const now = risk(desk);
  const boothPips = desk.overlooked !== null ? b.booth : 0;
  const meter = el('div', `pp-meter${o.shake ? ' pp-shake' : ''}`);
  const top = el('div', 'pp-read');
  top.append(el('span', '', 'RISK'), el('b', 'pp-risk', String(now)));
  const bar = el('div', 'pp-bar');
  for (let i = 0; i < b.cap; i++) {
    const full = i < now;
    const booth = full && i >= now - boothPips;
    bar.append(el('div', `pp-seg${full ? ' pp-full' : ''}${booth ? ' pp-boothseg' : ''}${i + 1 === b.clean ? ' pp-clean' : ''}`));
  }
  const foot = el('div', 'pp-read');
  foot.append(el('span', 'pp-green', `CLEAN ≤ ${b.clean}`), el('span', '', `CAP ${b.cap}`));
  meter.append(top, bar, foot);

  const acts = el('div', 'pp-acts');
  const undo = btn('UNDO', '', () => o.onAct({ k: 'undo' }), { 'data-k': 'undo' });
  undo.disabled = desk.history.length === 0;
  acts.append(undo, btn('RESET', '', () => o.onAct({ k: 'reset' }), { 'data-k': 'reset' }), btn('HAND OVER', 'pp-go', () => o.onHandOver(), { 'data-k': 'hand' }));

  const side = el('div', 'pp-side');
  side.append(bulletin, meter, acts, el('div', 'pp-hint', b.tier === 'easy' ? HINT.easy : HINT.other));

  const grid = el('div', 'pp-grid');
  grid.append(deskEl, side);
  return grid;
}
