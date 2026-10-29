/**
 * Papers' rules (spec 2026-10-11-papers-design.md §1–§2): the client's fields and where each is
 * printed, the bulletin's rule shapes and their wording, what a packet costs, and the officer's
 * checks. Editing is linked, so a packet is one value per field: an Identity. The sponsor letter
 * isn't chosen: it's attached exactly when there's a sponsor, and names it.
 */

export type Field = 'origin' | 'district' | 'trade' | 'age' | 'sponsor' | 'arrival';
export const FIELDS: readonly Field[] = ['origin', 'district', 'trade', 'age', 'sponsor', 'arrival'];
export type Values = Record<Field, readonly string[]>;

const FIXED: Omit<Values, 'origin'> = {
  district: ['Karasu', 'Velvet', 'the Marsh', 'Dockside', 'the Strand'],
  trade: ['dock labor', 'house work', 'clinic', 'freight', 'none'],
  age: ['under 25', '25–40', 'over 40'],
  sponsor: ['none', 'a House', 'a co-op', 'a corp'],
  arrival: ['this week', 'last week', 'older'],
};

/** Every field's values; the origins come from world/papers/origins.json (spec §6.1). */
export function valuesFor(origins: readonly string[]): Values {
  return { origin: [...origins], ...FIXED };
}

export type DocId = 'id' | 'permit' | 'transit';
export const DOCS: readonly { id: DocId; label: string; fields: readonly Field[] }[] = [
  { id: 'id', label: 'ID CARD', fields: ['origin', 'trade', 'age'] },
  { id: 'permit', label: 'WORK PERMIT', fields: ['district', 'trade', 'sponsor'] },
  { id: 'transit', label: 'TRANSIT SLIP', fields: ['origin', 'district', 'arrival'] },
];
/** How many documents print each field: what changing it costs. */
export const APPEAR = Object.fromEntries(FIELDS.map((f) => [f, DOCS.filter((d) => d.fields.includes(f)).length])) as Record<Field, number>;

export type Extra = 'medical' | 'renewal';
export interface Identity extends Record<Field, string> {
  medical: boolean;
  renewal: boolean;
}

export type Rule =
  | { kind: 'ban'; f: Field; v: string }
  | { kind: 'if'; f: Field; v: string; then: { doc: Extra } }
  | { kind: 'if'; f: Field; v: string; then: { g: 'sponsor' | 'district' | 'trade'; op: 'is' | 'not'; w: string } };

export const applies = (rule: Rule, id: Identity): boolean => rule.kind === 'ban' || id[rule.f] === rule.v;

export function holds(rule: Rule, id: Identity): boolean {
  if (rule.kind === 'ban') return id[rule.f] !== rule.v;
  if (id[rule.f] !== rule.v) return true;
  const t = rule.then;
  if ('doc' in t) return id[t.doc];
  return t.op === 'is' ? id[t.g] === t.w : id[t.g] !== t.w;
}

const TRADE_SUBJ: Record<string, string> = { 'dock labor': 'Dockhands', 'house work': 'House workers', clinic: 'Clinic workers', freight: 'Freight crews', none: 'Anyone without a trade' };
const TRADE_WORK: Record<string, string> = { 'dock labor': 'the docks', 'house work': 'in the Houses', clinic: 'in clinics', freight: 'freight' };
const ARRIVAL_SUBJ: Record<string, string> = { 'this week': 'Arrivals this week', 'last week': 'Arrivals from last week', older: 'Arrivals older than last week' };

/** A rule's subject, and whether it reads as plural ("need") or singular ("needs"). */
function subject(f: Field, v: string): [string, boolean] {
  switch (f) {
    case 'origin':
      return [`Arrivals from ${v}`, true];
    case 'district':
      return [`Permits for ${v}`, true];
    case 'trade':
      return [TRADE_SUBJ[v] ?? v, v !== 'none'];
    case 'age':
      return [v === '25–40' ? 'Anyone aged 25–40' : `Anyone ${v}`, false];
    case 'sponsor':
      return [v === 'none' ? 'Unsponsored permits' : `Permits sponsored by ${v}`, true];
    case 'arrival':
      return [ARRIVAL_SUBJ[v] ?? `Arrivals ${v}`, true];
  }
}

export function ruleText(rule: Rule): string {
  if (rule.kind === 'ban') {
    const { f, v } = rule;
    if (f === 'origin') return `No arrivals from ${v} tonight.`;
    if (f === 'district') return `No permits for ${v} tonight.`;
    if (f === 'trade') return v === 'none' ? 'No one without a trade tonight.' : `No ${v} permits tonight.`;
    if (f === 'age') return `No one ${v} tonight.`;
    if (f === 'sponsor') return v === 'none' ? 'Every permit needs a sponsor tonight.' : `No permits sponsored by ${v} tonight.`;
    return 'Nothing older than last week tonight.';
  }
  const [subj, plural] = subject(rule.f, rule.v);
  const need = plural ? 'need' : 'needs';
  const t = rule.then;
  let rest: string;
  if ('doc' in t) rest = `${need} a ${t.doc === 'medical' ? 'medical slip' : 'renewal stamp'}`;
  else if (t.g === 'sponsor') rest = t.op === 'not' ? `${need} a sponsor` : `${need} ${t.w} sponsor`;
  else if (t.g === 'district') rest = t.op === 'is' ? `may only enter ${t.w}` : `may not enter ${t.w}`;
  else if (t.w === 'none') rest = `${need} a trade`;
  else rest = rule.f === 'district' || rule.f === 'sponsor' ? `can't be for ${t.w}` : `may not work ${TRADE_WORK[t.w] ?? t.w}`;
  return `${subj} ${rest}.`;
}

export const EXTRA_COST = 2;

/** What a packet costs against the truth (spec §1.3). */
export function cost(id: Identity, truth: Identity): number {
  let c = 0;
  for (const f of FIELDS) if (id[f] !== truth[f]) c += APPEAR[f];
  if (id.sponsor !== 'none') c += truth.sponsor === 'none' ? EXTRA_COST : id.sponsor !== truth.sponsor ? 1 : 0;
  if (id.medical && !truth.medical) c += EXTRA_COST;
  if (id.renewal && !truth.renewal) c += EXTRA_COST;
  return c;
}

export interface Check {
  text: string;
  standing: boolean;
  applies: boolean;
  ok: boolean;
  overlooked: boolean;
}

/** The ID photo is the client's own face: the age on the card has to be one it looks. */
export const photoOk = (id: Identity, looks: readonly string[]): boolean => looks.includes(id.age);

/** The officer's checks in reading order (spec §2.1, §3.3): the standing ones, then tonight's rules. */
export function checkPacket(id: Identity, rules: readonly Rule[], looks: readonly string[], overlooked: number | null): Check[] {
  const standing = (text: string, ok: boolean): Check => ({ text, standing: true, applies: true, ok, overlooked: false });
  const out: Check[] = [standing(`The photo looks ${id.age === '25–40' ? 'between 25 and 40' : id.age}.`, photoOk(id, looks))];
  // Linked editing keeps the letter on the sponsor: the line still teaches that the letter exists.
  if (id.sponsor !== 'none') out.push(standing('A sponsor letter matches the permit.', true));
  rules.forEach((rule, i) => {
    const looked = i === overlooked;
    out.push({ text: ruleText(rule), standing: false, applies: applies(rule, id), ok: looked || holds(rule, id), overlooked: looked });
  });
  return out;
}

export function outcome(checks: readonly Check[], risk: number, clean: number): 'clean' | 'close' | 'back' {
  if (checks.some((c) => !c.ok)) return 'back';
  return risk <= clean ? 'clean' : 'close';
}
