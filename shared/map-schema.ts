/** The city map's data (map/lowlight.json): districts, their borders and labels, and places. Pure zod, shared by the game, its server and Studio. */
import { SPECIALTIES, type Specialty } from './crew-book';
import { z } from 'zod';

export type Pt = [number, number];
/** A border point; `i` / `o` are Bézier handles as offsets from it (null = a corner on that side). */
export interface Anchor {
  x: number;
  y: number;
  i: Pt | null;
  o: Pt | null;
}
export interface District {
  id: string;
  name: string;
  area?: string;
  label: Pt;
  border?: Anchor[];
  /** How many of its lit windows twinkle on the map, 0–2 (absent: 1). */
  windows?: number;
  /** Its name's line on the map (absent: straight through `label`); `label` is kept at the line's middle. */
  lettering?: Lettering;
}
/** A district name's arc, map %: its ends, the arch's height off the straight line (% of the map's width; plus bows
 * to the left of from → to on screen, 0 straight) and the letters' height (% of the map's width). */
export interface Lettering {
  from: Pt;
  to: Pt;
  bend: number;
  size: number;
}
export interface Place {
  id: string;
  name: string;
  district: string;
  pin: Pt;
  /** The room it is, as `pack/scene`. */
  scene?: string;
  note?: string;
  /** Not reachable from the map: only she can bring you (her apartment). */
  inviteOnly?: boolean;
  /** Jobs can be run from here (gig runs): JACK IN on the map. Briefs come from world/gigs/. */
  gigs?: boolean;
  /** A side room (room exits spec §4a): no pin and no map travel; you reach it through another room's exit. Keeps its id. */
  side?: boolean;
  /** Crew hires posted here each 06:00, leaning towards these specialties (crew spec §1); absent when none. */
  hires?: Specialty[];
  /** The structure it stands on (rendered map spec §2), e.g. `ribbon`; its pin is drawn at its level there. */
  on?: string;
  /** Its level on that structure, counted from the bottom (1–12), or on its roof. */
  level?: number | 'roof';
}
export type SignMode = 'pulse' | 'blink' | 'flicker';
/** A glow at a point on the map: a sign, a beacon. Sizes are a % of the map's width. */
export interface MapSign {
  at: Pt;
  color: string;
  mode: SignMode;
  size: number;
  speed?: number;
  phase?: number;
}
/** Puffs rising from a point: a stack, a vent. */
export interface MapPlume {
  at: Pt;
  style: 'steam' | 'smoke';
  amount: number;
  lean: number;
  tint?: string;
}
export type TrafficKind = 'cars' | 'train' | 'drone';
/** Lights moving along a path of straight segments. `every` in seconds, `speed` in map % a second. */
export interface MapTraffic {
  kind: TrafficKind;
  path: Pt[];
  every: number;
  speed: number;
  /** The path's height in map px (a raised road; absent: on the ground). */
  z?: number;
}
/** The map's life: atmosphere only, nothing in it reacts to the story. */
export interface MapAmbience {
  signs: MapSign[];
  plumes: MapPlume[];
  traffic: MapTraffic[];
}
export interface CityMapData {
  version: 1;
  image: string;
  /** Retired: the old district panel's spot. Read and kept if present, unused. */
  panelAt?: Pt;
  ambience?: MapAmbience;
  districts: District[];
  places: Place[];
}
export interface MapError {
  path: string;
  message: string;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;
const coord = z.number().min(0).max(100);
const offset = z.number().min(-100).max(100);
const pt = z.tuple([coord, coord]);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour as #rrggbb');
const ambienceSchema = z.object({
  signs: z
    .array(
      z.object({
        at: pt,
        color: hex,
        mode: z.enum(['pulse', 'blink', 'flicker']),
        size: z.number().min(0.2).max(6),
        speed: z.number().min(0.1).max(4).optional(),
        phase: z.number().min(0).max(1).optional(),
      }),
    )
    .default([]),
  plumes: z
    .array(
      z.object({
        at: pt,
        style: z.enum(['steam', 'smoke']),
        amount: z.number().min(0).max(3),
        lean: z.number().min(-1).max(1),
        tint: hex.optional(),
      }),
    )
    .default([]),
  traffic: z
    .array(
      z.object({
        kind: z.enum(['cars', 'train', 'drone']),
        path: z.array(pt).min(2, 'a path needs at least 2 points'),
        every: z.number().min(0.5).max(120),
        speed: z.number().min(0.5).max(20),
        z: z.number().min(0).max(200).optional(),
      }),
    )
    .default([]),
});
/** `[x, y]` is a corner; `[x, y, inX, inY, outX, outY]` carries handles. */
const anchor = z.union([z.tuple([coord, coord]), z.tuple([coord, coord, offset, offset, offset, offset])]);

const fileSchema = z
  .object({
    version: z.literal(1),
    image: z.string().min(1),
    panelAt: pt.optional(),
    ambience: ambienceSchema.optional(),
    districts: z.array(
      z.object({
        id: z.string().regex(ID, 'lowercase letters, digits and dashes'),
        name: z.string().min(1),
        area: z.string().optional(),
        label: pt,
        border: z.array(anchor).min(3, 'a border needs at least 3 points').optional(),
        windows: z.number().min(0).max(2).optional(),
        lettering: z.object({ from: pt, to: pt, bend: z.number().min(-50).max(50), size: z.number().min(0.5).max(8) }).optional(),
      }),
    ),
    places: z.array(
      z.object({
        id: z.string().regex(ID, 'lowercase letters, digits and dashes'),
        name: z.string().min(1),
        district: z.string(),
        pin: pt,
        scene: z.string().optional(),
        note: z.string().optional(),
        inviteOnly: z.boolean().optional(),
        gigs: z.boolean().optional(),
        side: z.boolean().optional(),
        hires: z.array(z.enum(SPECIALTIES)).optional(),
        on: z.string().regex(ID, 'lowercase letters, digits and dashes').optional(),
        level: z.union([z.number().int().min(1).max(12), z.literal('roof')]).optional(),
      }),
    ),
  })
  .superRefine((m, ctx) => {
    const seen = new Set<string>();
    m.districts.forEach((d, i) => {
      if (seen.has(d.id)) ctx.addIssue({ code: 'custom', path: ['districts', i, 'id'], message: `duplicate district '${d.id}'` });
      seen.add(d.id);
    });
    const places = new Set<string>();
    m.places.forEach((p, i) => {
      if (places.has(p.id)) ctx.addIssue({ code: 'custom', path: ['places', i, 'id'], message: `duplicate place '${p.id}'` });
      places.add(p.id);
      if (!seen.has(p.district)) ctx.addIssue({ code: 'custom', path: ['places', i, 'district'], message: `no district '${p.district}'` });
    });
  });

export function parseMap(raw: unknown): { ok: true; map: CityMapData } | { ok: false; errors: MapError[] } {
  const r = fileSchema.safeParse(raw);
  if (!r.success) return { ok: false, errors: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  const f = r.data;
  return {
    ok: true,
    map: {
      version: 1,
      image: f.image,
      ...(f.panelAt && { panelAt: f.panelAt }),
      ...(f.ambience && { ambience: f.ambience as MapAmbience }),
      districts: f.districts.map((d) => ({
        id: d.id,
        name: d.name,
        ...(d.area !== undefined && { area: d.area }),
        label: d.label,
        ...(d.border && { border: d.border.map(toAnchor) }),
        ...(d.windows !== undefined && { windows: d.windows }),
        ...(d.lettering && { lettering: d.lettering as Lettering }),
      })),
      places: f.places.map(({ inviteOnly, gigs, side, hires, ...p }) => ({ ...p, ...(inviteOnly && { inviteOnly: true }), ...(gigs && { gigs: true }), ...(side && { side: true }), ...(hires && hires.length > 0 && { hires }) })),
    },
  };
}

function toAnchor(a: number[]): Anchor {
  return a.length === 6 ? { x: a[0], y: a[1], i: [a[2], a[3]], o: [a[4], a[5]] } : { x: a[0], y: a[1], i: null, o: null };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const rp = (p: Pt): Pt => [r1(p[0]), r1(p[1])];

/** The JSON form, every number rounded to 0.1. */
export function serializeMap(map: CityMapData): unknown {
  return {
    version: 1,
    image: map.image,
    ...(map.panelAt && { panelAt: rp(map.panelAt) }),
    ...(map.ambience && { ambience: serializeAmbience(map.ambience) }),
    districts: map.districts.map((d) => ({
      id: d.id,
      name: d.name,
      ...(d.area !== undefined && { area: d.area }),
      label: rp(d.label),
      ...(d.border && {
        border: d.border.map((a) =>
          a.i || a.o ? [a.x, a.y, ...(a.i ?? [0, 0]), ...(a.o ?? [0, 0])].map(r1) : rp([a.x, a.y]),
        ),
      }),
      ...(d.windows !== undefined && { windows: d.windows }),
      ...(d.lettering && { lettering: { from: rp(d.lettering.from), to: rp(d.lettering.to), bend: r1(d.lettering.bend), size: r1(d.lettering.size) } }),
    })),
    // Keys in one order (not the edits' insertion order), so the same place always writes the same JSON.
    places: map.places.map((p) => ({
      id: p.id,
      name: p.name,
      district: p.district,
      pin: rp(p.pin),
      ...(p.scene !== undefined && { scene: p.scene }),
      ...(p.note !== undefined && { note: p.note }),
      ...(p.inviteOnly && { inviteOnly: true }),
      ...(p.gigs && { gigs: true }),
      ...(p.side && { side: true }),
      ...(p.hires && p.hires.length > 0 && { hires: p.hires }),
      ...(p.on !== undefined && { on: p.on }),
      ...(p.level !== undefined && { level: p.level }),
    })),
  };
}

/** A district's places in file order: their numbers on the map are this order. */
export function placesIn(map: CityMapData, districtId: string): Place[] {
  return map.places.filter((p) => p.district === districtId);
}

/** Room links that point at no room, or that two places share; pins outside their district's border. */
export function mapWarnings(map: CityMapData, scenes: ReadonlySet<string>, reached?: ReadonlySet<string>, structures?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const linked = new Set<string>();
  for (const p of map.places) {
    if (!p.scene) continue;
    if (linked.has(p.scene)) out.push(`two places link to ${p.scene}`);
    else if (!scenes.has(p.scene)) out.push(`no room ${p.scene}`);
    linked.add(p.scene);
  }
  for (const p of map.places) {
    const d = map.districts.find((x) => x.id === p.district);
    if (d?.border && !insideBorder(p.pin, d.border)) out.push(`${p.name} is outside ${d.name}`);
  }
  // A side room has no pin: with no room's exit leading to it, nobody can get there (room exits spec §4a).
  if (reached) for (const p of map.places) if (p.side && p.scene && !reached.has(p.scene)) out.push(`${p.name} is a side room no exit leads to`);
  // A place on a structure the city doesn't have keeps its pin on the ground (rendered map spec §2).
  if (structures) for (const p of map.places) if (p.on !== undefined && !structures.has(p.on)) out.push(`${p.name} is on '${p.on}', which isn't a structure`);
  return out;
}

/** Even-odd test on the border's points (curves count as straight here). */
export function insideBorder([px, py]: Pt, b: Anchor[]): boolean {
  let inside = false;
  for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
    const a = b[i]!;
    const c = b[j]!;
    if (a.y > py !== c.y > py && px < ((c.x - a.x) * (py - a.y)) / (c.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}


/** Keys in one order, points rounded to 0.1 like the rest of the file. */
function serializeAmbience(a: MapAmbience): unknown {
  return {
    signs: a.signs.map((x) => ({
      at: rp(x.at),
      color: x.color,
      mode: x.mode,
      size: x.size,
      ...(x.speed !== undefined && { speed: x.speed }),
      ...(x.phase !== undefined && { phase: x.phase }),
    })),
    plumes: a.plumes.map((x) => ({ at: rp(x.at), style: x.style, amount: x.amount, lean: x.lean, ...(x.tint !== undefined && { tint: x.tint }) })),
    traffic: a.traffic.map((x) => ({ kind: x.kind, path: x.path.map(rp), every: x.every, speed: x.speed, ...(x.z && { z: x.z }) })),
  };
}
