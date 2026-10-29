/**
 * Papers' data (spec §6): the places across the water, the client name pool, the face pool and
 * the bulletin's reasons, as world/papers/ holds them. Every parser warns once per bad entry and
 * skips it, and falls back to a built-in default where a run would otherwise have nothing.
 */
import { z } from 'zod';
import type { Rule } from './rules';

export type AgeBand = 'under 25' | '25–40' | 'over 40';
const BANDS: readonly AgeBand[] = ['under 25', '25–40', 'over 40'];
export const BAND_PREFIX: Record<'u25' | 'mid' | 'o40', AgeBand> = { u25: 'under 25', mid: '25–40', o40: 'over 40' };

/** Given names by gender: f and m for a face tagged so, x for either (a plain list in the file is all x). */
export interface Given {
  f: string[];
  m: string[];
  x: string[];
}
export interface Names {
  given: Given;
  family: string[];
}
export type Gender = 'f' | 'm';
export interface Origin {
  name: string;
  lore?: string;
  /** Names for clients from here; without them, the shared pool in names.json. */
  names?: Names;
}
export interface Face {
  id: string;
  band: AgeBand;
  /** The bands this face passes for: its own, and at most the next one over. */
  looks: AgeBand[];
  /** Set in Studio's FACES: the client's pronoun and given name follow it. Untagged: they, any name. */
  gender?: Gender;
}
export interface Reason {
  match: Partial<{ kind: 'ban' | 'if'; f: string; v: string; doc: string; g: string; op: string; w: string }>;
  text: string;
  lore: string;
}
export interface PapersData {
  origins: Origin[];
  names: Names;
  faces: Face[];
  reasons: Reason[];
}

const nameList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()) : []);

export const ORIGINS_MIN = 3;
export const ORIGINS_MAX = 8;
export const DEFAULT_ORIGINS: readonly Origin[] = ['Sable Coast', 'Kessen', 'the Shoals', 'Varna', 'Meridian'].map((name) => ({ name }));

const originSchema = z.object({ name: z.string().trim(), lore: z.string().optional(), names: z.unknown().optional() });
const namesSchema = z.object({ given: z.union([z.array(z.string()), z.object({ f: z.array(z.string()).optional(), m: z.array(z.string()).optional(), x: z.array(z.string()).optional() })]), family: z.array(z.string()) });
/** A given list as the file has it: a plain list is either gender. */
export const givenOf = (v: unknown): Given =>
  Array.isArray(v) ? { f: [], m: [], x: nameList(v) } : v && typeof v === 'object' ? { f: nameList((v as Given).f), m: nameList((v as Given).m), x: nameList((v as Given).x) } : { f: [], m: [], x: [] };
/** Every given name, whatever its gender. */
export const allGiven = (g: Given): string[] => [...g.f, ...g.m, ...g.x];

export function parseOrigins(raw: unknown, warn: (m: string) => void): Origin[] {
  if (!Array.isArray(raw)) {
    warn('papers origins.json: not a list; using the built-in origins');
    return [...DEFAULT_ORIGINS];
  }
  const out: Origin[] = [];
  for (const item of raw) {
    const p = originSchema.safeParse(item);
    if (!p.success || p.data.name === '') warn(`papers origins.json: ${JSON.stringify(item)} has no name; skipping it`);
    else if (out.some((o) => o.name === p.data.name)) warn(`papers origins.json: '${p.data.name}' twice; skipping the second`);
    else {
      const o: Origin = p.data.lore ? { name: p.data.name, lore: p.data.lore } : { name: p.data.name };
      if (p.data.names !== undefined) {
        const n = namesSchema.safeParse(p.data.names);
        if (n.success) o.names = { given: givenOf(n.data.given), family: nameList(n.data.family) };
        else warn(`papers origins.json: '${p.data.name}' names need given and family lists; using the shared names`);
      }
      out.push(o);
    }
  }
  if (out.length < ORIGINS_MIN) {
    warn(`papers origins.json: needs at least ${ORIGINS_MIN} origins; using the built-in origins`);
    return [...DEFAULT_ORIGINS];
  }
  if (out.length > ORIGINS_MAX) warn(`papers origins.json: at most ${ORIGINS_MAX} origins; keeping the first ${ORIGINS_MAX}`);
  return out.slice(0, ORIGINS_MAX);
}


export function parseNames(raw: unknown, warn: (m: string) => void): Names {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warn('papers names.json: not an object with given and family; the client goes unnamed');
    return { given: { f: [], m: [], x: [] }, family: [] };
  }
  const o = raw as Record<string, unknown>;
  return { given: givenOf(o.given), family: nameList(o.family) };
}

/** `files` are the photos in faces/ without `.jpg`; `raw` is faces.json. */
export function parseFaces(files: readonly string[], raw: unknown, warn: (m: string) => void): Face[] {
  const tags = new Map<string, { looks?: unknown; gender?: unknown }>();
  if (Array.isArray(raw)) for (const t of raw) if (t && typeof t === 'object' && typeof (t as { id?: unknown }).id === 'string') tags.set((t as { id: string }).id, t as { looks?: unknown; gender?: unknown });
  const out: Face[] = [];
  for (const id of files) {
    const band = BAND_PREFIX[id.split('-')[0] as keyof typeof BAND_PREFIX];
    if (!band) {
      warn(`papers face ${id}: the name must start u25-, mid- or o40-; skipping it`);
      continue;
    }
    const own = BANDS.indexOf(band);
    const looks = new Set<AgeBand>([band]);
    const tag = tags.get(id);
    const asked = tag?.looks;
    if (Array.isArray(asked))
      for (const b of asked) {
        const i = BANDS.indexOf(b as AgeBand);
        if (i < 0 || Math.abs(i - own) > 1) warn(`papers face ${id}: can't pass for '${String(b)}'; dropping it`);
        else looks.add(b as AgeBand);
      }
    const face: Face = { id, band, looks: BANDS.filter((b) => looks.has(b)) };
    if (tag?.gender === 'f' || tag?.gender === 'm') face.gender = tag.gender;
    else if (tag?.gender !== undefined && tag.gender !== null && tag.gender !== '') warn(`papers face ${id}: gender is f or m; leaving it untagged`);
    out.push(face);
  }
  return out;
}

const MATCH_KEYS = ['kind', 'f', 'v', 'doc', 'g', 'op', 'w'] as const;
const reasonSchema = z.object({
  match: z.object(Object.fromEntries(MATCH_KEYS.map((k) => [k, z.string().optional()]))).strict(),
  text: z.string().trim().min(1),
  lore: z.string(),
});

export function parseReasons(raw: unknown, loreIds: ReadonlySet<string>, warn: (m: string) => void): Reason[] {
  if (!Array.isArray(raw)) {
    warn('papers reasons.json: not a list; using the built-in reasons');
    return [...DEFAULT_REASONS];
  }
  const out: Reason[] = [];
  for (const item of raw) {
    const p = reasonSchema.safeParse(item);
    if (!p.success) warn(`papers reasons.json: ${JSON.stringify(item)} needs match, text and lore; skipping it`);
    else if (!loreIds.has(p.data.lore)) warn(`papers reasons.json: no lore entry '${p.data.lore}'; skipping "${p.data.text}"`);
    else out.push(p.data as Reason);
  }
  return out;
}

/** The rule's value for each key a reason can match on. */
function ruleKeys(rule: Rule): Record<(typeof MATCH_KEYS)[number], string | undefined> {
  const t = rule.kind === 'if' ? (rule.then as Record<string, string | undefined>) : {};
  return { kind: rule.kind, f: rule.f, v: rule.v, doc: t.doc, g: t.g, op: t.op, w: t.w };
}

const FALLBACK = { why: 'By order of the Isle.', lore: 'tidal-isle' };

/** Why the rule is on tonight's bulletin: the most specific matching reason, ties broken by `r`. */
export function reasonFor(rule: Rule, reasons: readonly Reason[], r: () => number): { why: string; lore: string } {
  const keys = ruleKeys(rule);
  const matches = reasons.filter((x) => Object.entries(x.match).every(([k, v]) => keys[k as keyof typeof keys] === v));
  if (matches.length === 0) return FALLBACK;
  const most = Math.max(...matches.map((x) => Object.keys(x.match).length));
  const top = matches.filter((x) => Object.keys(x.match).length === most);
  const pick = top[Math.min(top.length - 1, Math.floor(r() * top.length))];
  const fill = (s: string) => s.replaceAll('{v}', rule.v).replaceAll('{w}', keys.w ?? '').replaceAll('{origin}', rule.f === 'origin' ? rule.v : '');
  return { why: fill(pick.text), lore: pick.lore };
}

export const faceUrl = (id: string | null): string | null => (id === null ? null : `/api/papers/faces/${id}.jpg`);

const R = (match: Reason['match'], text: string, lore: string): Reason => ({ match, text, lore });

/** The mockup's reasons (spec §6.4), as data. None invents an event beyond the lore. */
export const DEFAULT_REASONS: readonly Reason[] = [
  R({ kind: 'ban', f: 'origin' }, "MiraGen's quarantine on {v} hulls, day 9.", 'miragen-pharmaceuticals'),
  R({ kind: 'ban', f: 'origin' }, 'SDG wants {v} boats held for questioning.', 'sentinel-defense-group'),
  R({ kind: 'ban', f: 'district', v: 'the Strand' }, 'SDG is sweeping the boardwalk.', 'neon-strand'),
  R({ kind: 'ban', f: 'district', v: 'the Marsh' }, 'The city lists the Marsh as uninhabited. Nobody gets a permit for it.', 'the-marsh'),
  R({ kind: 'ban', f: 'district', v: 'Velvet' }, 'The Velvet houses closed their books this week.', 'velvet'),
  R({ kind: 'ban', f: 'district', v: 'Dockside' }, 'Voltaic says Dockside has all the hands it needs.', 'voltaic-logistics'),
  R({ kind: 'ban', f: 'district', v: 'Karasu' }, 'Reconstruction froze new residence in Old Town.', 'karasu'),
  R({ kind: 'ban', f: 'trade', v: 'dock labor' }, "Voltaic's manifests are under audit. No new hands near the cranes.", 'voltaic-logistics'),
  R({ kind: 'ban', f: 'trade', v: 'freight' }, "Voltaic's manifests are under audit. No new hands near the cranes.", 'voltaic-logistics'),
  R({ kind: 'ban', f: 'trade', v: 'house work' }, 'The houses asked customs to pause placements while they renegotiate.', 'the-houses'),
  R({ kind: 'ban', f: 'trade', v: 'clinic' }, 'Chiron filed against new street-clinic permits again.', 'chiron-medical'),
  R({ kind: 'ban', f: 'trade', v: 'none' }, 'No one comes ashore without work to go to.', 'tidal-isle'),
  R({ kind: 'ban', f: 'age', v: 'under 25' }, 'A house got caught placing minors. Everyone young gets held.', 'the-houses'),
  R({ kind: 'ban', f: 'age', v: 'over 40' }, 'Labor quota: working age only, this month.', 'the-houses'),
  R({ kind: 'ban', f: 'sponsor', v: 'none' }, 'Every arrival needs someone to answer for them.', 'tidal-isle'),
  R({ kind: 'ban', f: 'sponsor', v: 'a co-op' }, 'SDG calls co-op sponsorships unverifiable. Co-ops keep paper records.', 'the-co-ops'),
  R({ kind: 'ban', f: 'sponsor', v: 'a corp' }, "The corps filled this month's sponsored quota.", 'tidal-isle'),
  R({ kind: 'ban', f: 'sponsor', v: 'a House' }, 'The houses are between contracts with customs.', 'the-houses'),
  R({ kind: 'ban', f: 'arrival' }, 'Old slips are being purged. Anyone that old goes to the holding blocks.', 'tidal-isle'),
  R({ f: 'trade', v: 'clinic', doc: 'medical' }, 'Chiron wants a health record on anyone near patients.', 'chiron-medical'),
  R({ doc: 'medical' }, "MiraGen's quarantine order, day 9.", 'miragen-pharmaceuticals'),
  R({ doc: 'renewal' }, 'Their slips are past the window. The holding-block office renews them, for a fee.', 'tidal-isle'),
  R({ g: 'sponsor', op: 'not' }, 'Someone has to answer for them.', 'tidal-isle'),
  R({ g: 'sponsor', w: 'a House' }, 'The houses hold the placement contracts.', 'the-houses'),
  R({ g: 'sponsor', w: 'a co-op' }, 'Only the co-ops will vouch for them.', 'the-co-ops'),
  R({ g: 'sponsor', w: 'a corp' }, 'The corps want their own people only.', 'tidal-isle'),
  R({ g: 'district', op: 'is', w: 'Dockside' }, 'Voltaic places every crew it takes in Dockside.', 'dockside'),
  R({ g: 'district', op: 'is' }, 'Their placements are all in {w} this month.', 'the-houses'),
  R({ g: 'district', op: 'not', w: 'the Strand' }, 'The boardwalk recruiters are under investigation.', 'neon-strand'),
  R({ g: 'district', op: 'not', w: 'the Marsh' }, "The city won't permit anyone into the Marsh.", 'the-marsh'),
  R({ g: 'district', op: 'not' }, '{w} is closed to them this week.', 'tidal-isle'),
  R({ g: 'trade', w: 'none' }, 'No one comes ashore without work to go to.', 'tidal-isle'),
  R({ g: 'trade', w: 'dock labor' }, 'Voltaic is cutting crews again.', 'voltaic-logistics'),
  R({ g: 'trade', w: 'freight' }, 'Voltaic is cutting crews again.', 'voltaic-logistics'),
  R({ g: 'trade' }, 'The houses closed that trade to new placements.', 'the-houses'),
];
