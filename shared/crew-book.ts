/**
 * The crew tables (crew spec 2026-10-19 §1–§2): names by origin, traits, pitches and errand kinds, from
 * world/crew/*.md. Pure: a bad line or block is skipped and named in `problems`.
 */

export const SPECIALTIES = ['runner', 'ears', 'face', 'fence', 'wire', 'muscle', 'wheel'] as const;
export type Specialty = (typeof SPECIALTIES)[number];
/** Phase 1 hires every specialty but WHEEL (held for big jobs). */
export const HIREABLE: Specialty[] = SPECIALTIES.filter((s) => s !== 'wheel');

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
  | { kind: 'busy'; days: number };

export interface Trait {
  id: string;
  label: string;
  good: boolean;
  effect: TraitEffect;
  for: Specialty[] | 'any';
  text: string;
}

export interface ErrandEffect {
  sol?: [number, number];
  rep?: number;
  heat?: number;
  prep?: { flag: string; value: string };
  reveal?: true;
}

export interface ErrandKind {
  kind: string;
  label: string;
  tag: 'PREP' | 'SOL' | 'HEAT';
  suits: Specialty[];
  hours: number;
  risk: Risk;
  needs: { on: 'job' } | { on: 'district'; when: 'known' | 'heat' } | null;
  blurb: string;
  bands: Record<Band, { effect: ErrandEffect; lines: string[] }>;
}

export interface CrewBook {
  names: Record<string, string[]>;
  traits: Trait[];
  /** Keyed `"<specialty>:<grade index>"`. */
  pitches: Record<string, string[]>;
  errands: ErrandKind[];
}

export const emptyCrewBook = (): CrewBook => ({ names: {}, traits: [], pitches: {}, errands: [] });

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
    const effect = parseEffect(eff);
    if (!effect) {
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
    out.push({ id, label, good: sign === '+', effect, for: forV, text });
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
    n === undefined || n === '' ? null : n === 'job' ? { on: 'job' } : n === 'district known' ? { on: 'district', when: 'known' } : n === 'district heat' ? { on: 'district', when: 'heat' } : undefined!;
  if (needs === undefined) return `${name}: needs must be job, district known or district heat`;
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
  return { kind, label: fields.label ?? kind, tag, suits: suits as Specialty[], hours, risk, needs, blurb: fields.blurb ?? '', bands };
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

export function parseCrewBook(files: { names: string; traits: string; pitches: string; errands: string }): { book: CrewBook; problems: string[] } {
  const problems: string[] = [];
  const names: Record<string, string[]> = {};
  for (const [d, list] of sections(files.names)) names[d] = [...(names[d] ?? []), ...list];
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
  return { book: { names, traits: parseTraits(files.traits, problems), pitches, errands: parseErrands(files.errands, problems) }, problems };
}
