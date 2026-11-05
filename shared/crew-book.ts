/**
 * The crew tables (crew spec 2026-10-19 §1–§2): names by origin, traits, pitches and errand kinds, from
 * world/crew/*.md. Pure: a bad line or block is skipped and named in `problems`.
 */
import { parseGoods, type GoodsKind } from './goods';
import { STAT_KEYS, type StatKey } from './stats';

export const SPECIALTIES = ['runner', 'ears', 'face', 'fence', 'muscle', 'wheel'] as const;
export type Specialty = (typeof SPECIALTIES)[number];
/** Phase 1 hires every specialty but WHEEL (held back). */
export const HIREABLE: Specialty[] = SPECIALTIES.filter((s) => s !== 'wheel');

/** Wire merged into runner (crew cleanup spec §3): anything stored from before reads as a runner. */
export const normalSpec = <T>(s: T): T | 'runner' => (s === 'wire' ? 'runner' : s);

export type Grade = 0 | 1 | 2 | 3;
export const GRADES = ['GREEN', 'HAND', 'PRO', 'VET'] as const;
export type Risk = 'low' | 'med' | 'high';
export type Band = 'clean' | 'messy' | 'blown';
export const BANDS: Band[] = ['clean', 'messy', 'blown'];

export type TraitEffect =
  | { kind: 'odds'; errand: string; delta: number }
  | { kind: 'pay'; errand: string; pct: number }
  | { kind: 'hours'; pct: number }
  | { kind: 'heat-on-messy'; n: number }
  | { kind: 'never-held' }
  | { kind: 'hurt-not-gone-once' }
  | { kind: 'wage-on-clean'; n: number }
  | { kind: 'busy'; days: number }
  /** Can sell in any district, Known or not (crew goods spec §7). */
  | { kind: 'sells-anywhere' }
  /** The right route's price on any kind (crew goods spec §7). */
  | { kind: 'full-route' };

export interface Trait {
  id: string;
  label: string;
  good: boolean;
  effect: TraitEffect;
  /** A rule beside the effect, written `<effect> + <rule>`. */
  also?: TraitEffect;
  for: Specialty[] | 'any';
  text: string;
}

/** What a Graft job reads off a trait: the rest shape errands only, so a job's cards leave them off. */
const ON_A_JOB: TraitEffect['kind'][] = ['heat-on-messy', 'never-held', 'hurt-not-gone-once', 'wage-on-clean'];
export const worksInGraft = (t: Trait): boolean => ON_A_JOB.includes(t.effect.kind);

export interface ErrandEffect {
  sol?: [number, number];
  rep?: number;
  heat?: number;
  prep?: { flag: string; value: string };
  reveal?: true;
  /** Brings a lot home (crew goods spec §2). */
  lot?: 'full' | 'damaged';
}

export interface ErrandKind {
  kind: string;
  label: string;
  tag: 'PREP' | 'SOL' | 'HEAT';
  suits: Specialty[];
  hours: number;
  risk: Risk;
  needs: { on: 'job' } | { on: 'run' } | { on: 'offer' } | { on: 'lot' } | { on: 'district'; when: 'known' | 'heat' } | null;
  /** What a trait's `odds` and `pay` also match it by (crew goods spec §7). */
  group?: 'collect' | 'hustle';
  /** A COLLECT mission's kinds of goods; `any` is every kind. */
  gives?: string[];
  /** A share of the lot's value, paid when sent (Buy It Cheap). */
  cost?: number;
  /** Never offered, but old sends of it still replay (crew cleanup spec §1). */
  retired?: true;
  blurb: string;
  /** A picture in world/quests/art; CREW shows a quiet placeholder without one. */
  art?: string;
  bands: Record<Band, { effect: ErrandEffect; lines: string[] }>;
}

/** The ability pass's effects (spec §2): each asks something, as a setup, greed, a gamble or a trade. */
const PASS_KINDS = ['setup-position', 'setup-die', 'greed-effect', 'greed-die', 'gamble-cost', 'gamble-miss', 'trade-alarm', 'trade-nerve', 'end-take', 'end-cool', 'rerun', 'lookout', 'hold-alarm', 'talk-past', 'talk-down', 'inside-info', 'undo', 'take-hit', 'stand-firm', 'sell-part', 'pay-off'] as const;
/** What an ability does on a job (crew abilities spec §2): `alarm` is ALARM −1, `nerve` NERVE +1, `take` TAKE +1, `heat` heat −1. */
export type JobEffect = { kind: 'cross'; stat: StatKey } | { kind: 'die' } | { kind: 'getaway' } | { kind: 'again' } | { kind: 'save' } | { kind: 'alarm' } | { kind: 'nerve' } | { kind: 'take' } | { kind: 'heat' } | { kind: (typeof PASS_KINDS)[number] };
/** When an ability card plays: on a roll (as that roll's card), after a roll (on a parked roll), by itself at the end, or by itself when it's needed. */
export type Timing = 'roll' | 'after' | 'end' | 'auto';
export const TIMING: Record<JobEffect['kind'], Timing> = { cross: 'roll', die: 'roll', getaway: 'roll', again: 'roll', save: 'after', alarm: 'after', nerve: 'after', take: 'end', heat: 'end', 'setup-position': 'roll', 'setup-die': 'roll', 'greed-effect': 'roll', 'greed-die': 'roll', 'gamble-cost': 'after', 'gamble-miss': 'after', 'trade-alarm': 'after', 'trade-nerve': 'after', 'end-take': 'end', 'end-cool': 'end', rerun: 'after', lookout: 'roll', 'hold-alarm': 'auto', 'talk-past': 'roll', 'talk-down': 'after', 'inside-info': 'roll', undo: 'after', 'take-hit': 'after', 'stand-firm': 'roll', 'sell-part': 'end', 'pay-off': 'end' };

/** A trained ability (crew abilities spec §1): a job effect. Abilities are for Graft; traits alone shape errands (crew cleanup spec §2). */
export interface Ability {
  id: string;
  label: string;
  for: Specialty[] | 'any';
  /** The lowest grade that can hold it. */
  from: Grade;
  job: JobEffect;
  text: string;
}

export interface CrewBook {
  names: Record<string, string[]>;
  /** A name marked `· man` / `· woman` in names.md; unmarked names fit any face. */
  genders?: Record<string, 'man' | 'woman'>;
  traits: Trait[];
  abilities: Ability[];
  /** Keyed `"<specialty>:<grade index>"`. */
  pitches: Record<string, string[]>;
  errands: ErrandKind[];
  /** What COLLECT brings in and HUSTLE moves (crew goods spec §1). */
  goods?: GoodsKind[];
}

export const emptyCrewBook = (): CrewBook => ({ names: {}, genders: {}, traits: [], abilities: [], pitches: {}, errands: [] });

const isSpecialty = (s: string): s is Specialty => (SPECIALTIES as readonly string[]).includes(s);
/** Both the typographic minus and a hyphen count as minus. */
const num = (s: string): number | null => {
  const m = /^([+\-−]?)(\d+)$/.exec(s.trim());
  return m ? (m[1] === '-' || m[1] === '−' ? -1 : 1) * Number(m[2]) : null;
};
const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, '$1');

/** `## <heading>` sections of `- <item>` lines. */
function sections(text: string): [string, string[]][] {
  const out: [string, string[]][] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const h = /^##\s+(.+)$/.exec(line);
    if (h) out.push([h[1].trim(), []]);
    else if (line.startsWith('- ') && out.length > 0) out[out.length - 1][1].push(unquote(line.slice(2)));
  }
  return out;
}

function parseEffect(s: string): TraitEffect | null {
  const t = s.trim().split(/\s+/);
  const n = (i: number) => num(t[i] ?? '');
  const pct = (i: number) => (/%$/.test(t[i] ?? '') ? num(t[i].slice(0, -1)) : null);
  switch (t[0]) {
    case 'odds':
      return t.length === 3 && n(2) !== null ? { kind: 'odds', errand: t[1], delta: n(2)! } : null;
    case 'pay':
      return t.length === 3 && pct(2) !== null ? { kind: 'pay', errand: t[1], pct: pct(2)! } : null;
    case 'hours':
      return t.length === 2 && pct(1) !== null ? { kind: 'hours', pct: pct(1)! } : null;
    case 'heat-on-messy':
      return t.length === 2 && n(1) !== null ? { kind: 'heat-on-messy', n: n(1)! } : null;
    case 'never-held':
      return t.length === 1 ? { kind: 'never-held' } : null;
    case 'sells-anywhere':
      return t.length === 1 ? { kind: 'sells-anywhere' } : null;
    case 'full-route':
      return t.length === 1 ? { kind: 'full-route' } : null;
    case 'hurt-not-gone-once':
      return t.length === 1 ? { kind: 'hurt-not-gone-once' } : null;
    case 'wage-on-clean':
      return t.length === 2 && n(1) !== null ? { kind: 'wage-on-clean', n: n(1)! } : null;
    case 'busy': {
      const m = /^(\d)-in-7$/.exec(t[1] ?? '');
      return t.length === 2 && m && Number(m[1]) <= 7 ? { kind: 'busy', days: Number(m[1]) } : null;
    }
  }
  return null;
}

function parseTraits(text: string, problems: string[]): Trait[] {
  const out: Trait[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const f = line.split('·').map((x) => x.trim());
    if (f.length !== 6) {
      problems.push(`traits: "${line}" needs six fields split by ·`);
      continue;
    }
    const [id, label, sign, eff, forS, text] = f;
    const [mainS, alsoS] = eff.split(/\s\+\s/);
    const effect = parseEffect(mainS);
    const also = alsoS === undefined ? undefined : parseEffect(alsoS);
    if (!effect || also === null || (also && also.kind !== 'sells-anywhere' && also.kind !== 'full-route')) {
      problems.push(`traits: ${id}: unknown effect "${eff}"`);
      continue;
    }
    if (!['+', '-', '−'].includes(sign)) {
      problems.push(`traits: ${id}: sign must be + or −`);
      continue;
    }
    let forV: Specialty[] | 'any' = 'any';
    if (forS !== 'any') {
      const list = forS.split(',').map((x) => x.trim());
      const bad = list.filter((x) => !isSpecialty(x));
      if (bad.length > 0) {
        problems.push(`traits: ${id}: unknown specialty ${bad.join(', ')}`);
        continue;
      }
      forV = list as Specialty[];
    }
    if (out.some((x) => x.id === id)) {
      problems.push(`traits: ${id} is listed twice`);
      continue;
    }
    out.push({ id, label, good: sign === '+', effect, ...(also ? { also } : {}), for: forV, text });
  }
  return out;
}


function parseJobEffect(s: string): JobEffect | null {
  const t = s.trim().split(/\s+/);
  if (t[0] === 'cross') return t.length === 2 && (STAT_KEYS as readonly string[]).includes(t[1]) ? { kind: 'cross', stat: t[1] as StatKey } : null;
  const pass = PASS_KINDS.find((k) => k === s.trim());
  if (pass) return { kind: pass };
  const bare: Record<string, JobEffect> = { die: { kind: 'die' }, getaway: { kind: 'getaway' }, again: { kind: 'again' }, save: { kind: 'save' }, 'alarm -1': { kind: 'alarm' }, 'nerve +1': { kind: 'nerve' }, 'take +1': { kind: 'take' }, 'heat -1': { kind: 'heat' } };
  return bare[t.join(' ').replace('−', '-')] ?? null;
}

function parseAbilities(text: string, traitIds: string[], problems: string[]): Ability[] {
  const out: Ability[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const f = line.split('·').map((x) => x.trim());
    if (f.length !== 6) {
      problems.push(`abilities: "${line}" needs six fields split by ·`);
      continue;
    }
    const [id, label, forS, gradeS, jobS, text] = f;
    const job = parseJobEffect(jobS);
    if (!job) {
      problems.push(`abilities: ${id}: unknown job effect "${jobS}"`);
      continue;
    }
    const from = GRADES.indexOf(gradeS as (typeof GRADES)[number]);
    if (from < 0) {
      problems.push(`abilities: ${id}: grade must be GREEN, HAND, PRO or VET`);
      continue;
    }
    let forV: Specialty[] | 'any' = 'any';
    if (forS !== 'any') {
      const list = forS.split(',').map((x) => x.trim());
      const bad = list.filter((x) => !isSpecialty(x));
      if (bad.length > 0) {
        problems.push(`abilities: ${id}: unknown specialty ${bad.join(', ')}`);
        continue;
      }
      forV = list as Specialty[];
    }
    if (traitIds.includes(id)) {
      problems.push(`abilities: ${id} is a trait id`);
      continue;
    }
    if (out.some((x) => x.id === id)) {
      problems.push(`abilities: ${id} is listed twice`);
      continue;
    }
    out.push({ id, label, for: forV, from: from as Grade, job, text });
  }
  return out;
}

function parseErrandEffect(s: string): ErrandEffect | string {
  const e: ErrandEffect = {};
  for (const part of s.split('·').map((x) => x.trim()).filter(Boolean)) {
    let m: RegExpExecArray | null;
    if ((m = /^sol\s+([+\-−]?\d+)(?:-(\d+))?$/.exec(part))) {
      const lo = num(m[1])!;
      e.sol = [lo, m[2] ? Number(m[2]) : lo];
    } else if ((m = /^rep\s+([+\-−]?\d+)$/.exec(part))) e.rep = num(m[1])!;
    else if ((m = /^heat\s+([+\-−]?\d+)$/.exec(part))) e.heat = num(m[1])!;
    else if ((m = /^prep\s+([a-z-]+)=([a-z-]+)$/.exec(part))) e.prep = { flag: m[1], value: m[2] };
    else if (part === 'reveal') e.reveal = true;
    else if (part === 'lot') e.lot = 'full';
    else if (part === 'lot damaged') e.lot = 'damaged';
    else return `unknown effect "${part}"`;
  }
  return e;
}

function parseErrand(block: string): ErrandKind | string {
  const fields: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  let list: string | null = null;
  for (const raw of block.split('\n')) {
    if (!raw.trim()) continue;
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item && list) {
      lists[list].push(item[1].trim());
      continue;
    }
    const kv = /^([a-z]+):\s*(.*)$/.exec(raw.trim());
    if (!kv) return `can't read "${raw.trim()}"`;
    if (kv[2] === '' && ['clean', 'messy', 'blown'].includes(kv[1])) {
      list = kv[1];
      lists[list] = [];
    } else {
      list = null;
      fields[kv[1]] = kv[2].trim();
    }
  }
  const kind = fields.kind ?? '';
  const name = kind || '(no kind)';
  if (!/^[a-z][a-z0-9-]*$/.test(kind)) return `${name}: kind must be lowercase letters, digits and dashes`;
  const tag = fields.tag;
  if (tag !== 'PREP' && tag !== 'SOL' && tag !== 'HEAT') return `${name}: tag must be PREP, SOL or HEAT`;
  const suits = (fields.suits ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const bad = suits.filter((x) => !isSpecialty(x));
  if (suits.length === 0 || bad.length > 0) return `${name}: unknown specialty in suits: ${bad.join(', ') || '(none)'}`;
  const hours = Number(fields.hours);
  if (!(hours > 0)) return `${name}: hours must be a number above 0`;
  const risk = fields.risk;
  if (risk !== 'low' && risk !== 'med' && risk !== 'high') return `${name}: risk must be low, med or high`;
  const n = fields.needs;
  const needs: ErrandKind['needs'] =
    n === undefined || n === '' ? null : n === 'job' ? { on: 'job' } : n === 'run' ? { on: 'run' } : n === 'offer' ? { on: 'offer' } : n === 'lot' ? { on: 'lot' } : n === 'district known' ? { on: 'district', when: 'known' } : n === 'district heat' ? { on: 'district', when: 'heat' } : undefined!;
  if (needs === undefined) return `${name}: needs must be job, run, offer, lot, district known or district heat`;
  if (fields.retired !== undefined && fields.retired !== 'yes') return `${name}: retired must be yes`;
  if (fields.group !== undefined && fields.group !== 'collect' && fields.group !== 'hustle') return `${name}: group must be collect or hustle`;
  const cost = fields.cost === undefined ? undefined : Number(fields.cost);
  if (cost !== undefined && !(cost > 0 && cost < 1)) return `${name}: cost must be a share between 0 and 1`;
  if (fields.art !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*\.(png|webp|jpg)$/.test(fields.art)) return `${name}: art must be a file name like night-clerk.webp`;
  const bands = {} as ErrandKind['bands'];
  for (const b of BANDS) {
    const items = lists[b] ?? [];
    let effect: ErrandEffect = {};
    const lines: string[] = [];
    for (const it of items) {
      const em = /^effect:\s*(.*)$/.exec(it);
      if (em) {
        const e = parseErrandEffect(em[1]);
        if (typeof e === 'string') return `${name}: ${b}: ${e}`;
        effect = e;
      } else lines.push(unquote(it));
    }
    if (lines.length === 0) return `${name}: ${b} needs at least one line`;
    bands[b] = { effect, lines };
  }
  return { kind, label: fields.label ?? kind, tag, suits: suits as Specialty[], hours, risk, needs, blurb: fields.blurb ?? '', ...(fields.retired ? { retired: true as const } : {}), ...(fields.group ? { group: fields.group as 'collect' | 'hustle' } : {}), ...(fields.gives ? { gives: fields.gives.split(',').map((x) => x.trim()) } : {}), ...(cost !== undefined ? { cost } : {}), ...(fields.art ? { art: fields.art } : {}), bands };
}

function parseErrands(text: string, problems: string[]): ErrandKind[] {
  const out: ErrandKind[] = [];
  const blocks = text.split(/^---\s*$/m).filter((b) => b.trim() && !/^\s*#[^\n]*\s*$/.test(b));
  for (const b of blocks) {
    const e = parseErrand(b);
    if (typeof e === 'string') problems.push(`errands: ${e}`);
    else if (out.some((x) => x.kind === e.kind)) problems.push(`errands: ${e.kind} is written twice`);
    else out.push(e);
  }
  return out;
}

export function parseCrewBook(files: { names: string; traits: string; pitches: string; errands: string; abilities?: string; goods?: string }): { book: CrewBook; problems: string[] } {
  const problems: string[] = [];
  const names: Record<string, string[]> = {};
  const genders: Record<string, 'man' | 'woman'> = {};
  for (const [d, list] of sections(files.names)) {
    const plain = list.map((line) => {
      const m = /^(.*?)\s*·\s*(\S+)$/.exec(line);
      if (!m) return line;
      if (m[2] === 'man' || m[2] === 'woman') genders[m[1]] = m[2];
      else problems.push(`names: "${line}" must end in · man or · woman, or neither`);
      return m[1];
    });
    names[d] = [...(names[d] ?? []), ...plain];
  }
  const pitches: Record<string, string[]> = {};
  for (const [h, list] of sections(files.pitches)) {
    const [spec, grade] = h.split(/\s+/);
    const g = GRADES.indexOf((grade ?? '') as (typeof GRADES)[number]);
    if (!isSpecialty(spec ?? '') || g < 0) {
      problems.push(`pitches: "## ${h}" must be "## <specialty> <GRADE>"`);
      continue;
    }
    pitches[`${spec}:${g}`] = [...(pitches[`${spec}:${g}`] ?? []), ...list];
  }
  const traits = parseTraits(files.traits, problems);
  const abilities = parseAbilities(files.abilities ?? '', traits.map((t) => t.id), problems);
  return { book: { names, genders, traits, abilities, pitches, errands: parseErrands(files.errands, problems), goods: parseGoods(files.goods ?? '', problems) }, problems };
}
