import fs, { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapWarnings, parseMap, placesIn, serializeMap, type CityMapData } from './map-schema';

const shipped = () => JSON.parse(readFileSync('map/lowlight.json', 'utf8')) as unknown;

/** A small valid map; tests change one thing at a time. */
function base() {
  return {
    version: 1,
    image: '/map/x.webp',
    panelAt: [50, 50],
    districts: [
      { id: 'a', name: 'A', label: [10, 10], border: [[1, 2], [3, 4, -1, 0, 1, 0], [5, 6]] },
      { id: 'b', name: 'B', area: 'Bee', label: [20, 20] },
    ],
    places: [{ id: 'a1', name: 'A one', district: 'a', pin: [2, 3] }],
  };
}

function parsed(raw: unknown): CityMapData {
  const r = parseMap(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.map;
}

describe('map schema', () => {
  it('parses the shipped map', () => {
    const map = parsed(shipped());
    expect(map.districts).toHaveLength(14);
    // Studio MAP adds places as the city grows: the core ones must stay, others may join them.
    expect(placesIn(map, 'karasu').map((p) => p.id)).toEqual(
      expect.arrayContaining(['ribbon-rooftop', 'nix-walk-up', 'public-landing', 'lowlight-intake', 'second-socket', 'haes-noodles', 'the-tilt']),
    );
  });

  it('reads a map without panelAt', () => {
    const raw = base() as Record<string, unknown>;
    delete raw.panelAt;
    const map = parsed(raw);
    expect(map.panelAt).toBeUndefined();
    expect(serializeMap(map)).not.toHaveProperty('panelAt');
  });

  it('reads a 6-number anchor as handles', () => {
    const map = parsed(base());
    expect(map.districts[0].border![1]).toEqual({ x: 3, y: 4, i: [-1, 0], o: [1, 0] });
    expect(map.districts[0].border![0].i).toBeNull();
  });

  const bad: [string, (m: ReturnType<typeof base>) => void, string][] = [
    ['a duplicate district id', (m) => (m.districts[1].id = 'a'), 'districts.1.id'],
    ['a duplicate place id', (m) => m.places.push({ ...m.places[0] }), 'places.1.id'],
    ['a place in an unknown district', (m) => (m.places[0].district = 'zz'), 'places.0.district'],
    ['a label off the map', (m) => (m.districts[0].label = [101, 5]), 'districts.0.label'],
    ['a 2-point border', (m) => (m.districts[0].border = [[1, 2], [3, 4]]), 'districts.0.border'],
    ['an id with spaces', (m) => (m.districts[0].id = 'Bad Id'), 'districts.0.id'],
  ];
  it.each(bad)('rejects %s', (_name, change, path) => {
    const m = base();
    change(m);
    const r = parseMap(m);
    expect(r.ok).toBe(false);
    // an error names the field, or something inside it (zod reports `districts.0.label.0`)
    if (!r.ok) expect(r.errors.some((e) => e.path === path || e.path.startsWith(`${path}.`))).toBe(true);
  });

  it('round-trips, rounded to 0.1', () => {
    const map = parsed(base());
    expect(parsed(serializeMap(map))).toEqual(map);
    map.places[0].pin = [33.33, 10];
    expect((serializeMap(map) as { places: { pin: number[] }[] }).places[0].pin).toEqual([33.3, 10]);
  });

  it('writes a place in one key order, however its keys were set', () => {
    const map = parsed(base());
    const a = { id: 'a2', name: 'A two', district: 'a', pin: [4, 4] as [number, number], scene: 'p/x', note: 'n', inviteOnly: true };
    const b = { inviteOnly: true, note: 'n', pin: [4, 4] as [number, number], district: 'a', name: 'A two', id: 'a2', scene: 'p/x' };
    const out = (p: CityMapData['places'][number]) => JSON.stringify(serializeMap({ ...map, places: [p] }));
    expect(out(b)).toBe(out(a));
  });

  it('reads inviteOnly, and leaves it out when false', () => {
    const m = base();
    (m.places[0] as Record<string, unknown>).inviteOnly = true;
    const map = parsed(m);
    expect(map.places[0].inviteOnly).toBe(true);
    expect(parsed(serializeMap(map))).toEqual(map);
    const plain = parsed(base());
    expect('inviteOnly' in plain.places[0]).toBe(false);
    expect(parsed(serializeMap(plain))).toEqual(plain);
  });

  it('reads side, and leaves it out when false (room exits spec §4a)', () => {
    const m = base();
    (m.places[0] as Record<string, unknown>).side = true;
    const map = parsed(m);
    expect(map.places[0].side).toBe(true);
    expect(parsed(serializeMap(map))).toEqual(map);
    const plain = parsed(base());
    expect('side' in plain.places[0]).toBe(false);
  });

  it('reads gigs, and leaves it out when false', () => {
    const m = base();
    (m.places[0] as Record<string, unknown>).gigs = true;
    const map = parsed(m);
    expect(map.places[0].gigs).toBe(true);
    expect(parsed(serializeMap(map))).toEqual(map);
    const plain = parsed(base());
    expect('gigs' in plain.places[0]).toBe(false);
    (m.places[0] as Record<string, unknown>).gigs = 'yes';
    expect(parseMap(m).ok).toBe(false);
  });

  it('reads hires, drops it when empty, refuses an unknown specialty', () => {
    const m = base();
    (m.places[0] as Record<string, unknown>).hires = ['face', 'fence'];
    const map = parsed(m);
    expect(map.places[0].hires).toEqual(['face', 'fence']);
    expect(parsed(serializeMap(map))).toEqual(map);
    (m.places[0] as Record<string, unknown>).hires = [];
    expect('hires' in parsed(m).places[0]).toBe(false);
    expect('hires' in (serializeMap(parsed(m)) as { places: object[] }).places[0]).toBe(false);
    (m.places[0] as Record<string, unknown>).hires = ['pilot'];
    expect(parseMap(m).ok).toBe(false);
  });

  it("has gigs at The Tilt, the public landing, Under the Cat (the Glass Orchid's slips) and the Ferry Stairs (papers) on the shipped map", () => {
    expect(parsed(shipped()).places.filter((p) => p.gigs).map((p) => p.id).sort()).toEqual(['ferry-stairs', 'public-landing', 'the-tilt', 'under-the-cat']);
  });

  it("keeps her apartment private: the walk-up's pin is its landing, the apartment has no place, and no room's exit leads inside", () => {
    const m = parsed(shipped());
    expect(m.places.find((p) => p.id === 'nix-walk-up')!.scene).toBe('karasu/walk-up-landing');
    expect(m.places.some((p) => p.scene === 'karasu/nix-apartment')).toBe(false);
    const scenes = path.join(__dirname, '..', 'scenes');
    const into = fs
      .readdirSync(scenes)
      .flatMap((pack) => (fs.statSync(path.join(scenes, pack)).isDirectory() ? fs.readdirSync(path.join(scenes, pack)).map((room) => path.join(scenes, pack, room, 'scene.json')) : []))
      .filter((f) => fs.existsSync(f))
      .filter((f) => (JSON.parse(fs.readFileSync(f, 'utf8')).exits ?? []).some((e: { to: string }) => e.to === 'karasu/nix-apartment'));
    expect(into).toEqual([]);
  });

  it('warns on unknown and shared scene links', () => {
    const m = base();
    m.places = [
      { id: 'p1', name: 'P1', district: 'b', pin: [1, 1], scene: 'p/a' } as never,
      { id: 'p2', name: 'P2', district: 'b', pin: [1, 1], scene: 'p/a' } as never,
      { id: 'p3', name: 'P3', district: 'b', pin: [1, 1], scene: 'p/zz' } as never,
    ];
    expect(mapWarnings(parsed(m), new Set(['p/a']))).toEqual(['two places link to p/a', 'no room p/zz']);
  });

  it('warns about a side room no exit leads to (final review I3)', () => {
    const m = base();
    m.places = [
      { id: 'p1', name: 'P1', district: 'b', pin: [1, 1], scene: 'p/a', side: true } as never,
      { id: 'p2', name: 'P2', district: 'b', pin: [1, 1], scene: 'p/b', side: true } as never,
    ];
    expect(mapWarnings(parsed(m), new Set(['p/a', 'p/b']), new Set(['p/b']))).toEqual(['P1 is a side room no exit leads to']);
  });

  it('warns when a pin is outside its district, but not for a district without a border', () => {
    const m = base();
    m.districts[0]!.border = [[0, 0], [10, 0], [10, 10], [0, 10]];
    m.places = [
      { id: 'in', name: 'Inside', district: 'a', pin: [5, 5] },
      { id: 'out', name: 'Outside', district: 'a', pin: [15, 5] },
      { id: 'free', name: 'Free', district: 'b', pin: [90, 90] },
    ];
    expect(mapWarnings(parsed(m), new Set())).toEqual(['Outside is outside A']);
  });
});

describe('map ambience', () => {
  const withAmb = (amb: unknown, extra: Record<string, unknown> = {}) => ({ ...base(), ambience: amb, ...extra });
  const errs = (raw: unknown) => {
    const r = parseMap(raw);
    return r.ok ? [] : r.errors.map((e) => e.path);
  };

  it('parses the shipped ambience', () => {
    const a = parsed(shipped()).ambience!;
    expect(a.plumes.length).toBeGreaterThan(0);
    // Signs and traffic are optional: the author cleared them in Studio (traffic 2026-10-25, signs 2026-10-28).
    expect(Array.isArray(a.signs)).toBe(true);
    expect(Array.isArray(a.traffic)).toBe(true);
  });

  it('reads an ambience block with lists left out as empty', () => {
    expect(parsed(withAmb({})).ambience).toEqual({ signs: [], plumes: [], traffic: [] });
  });

  it.each([
    ['ambience.signs.0.mode', { signs: [{ at: [1, 1], color: '#ff0000', mode: 'strobe', size: 1 }] }],
    ['ambience.signs.0.color', { signs: [{ at: [1, 1], color: 'pink', mode: 'pulse', size: 1 }] }],
    ['ambience.plumes.0.amount', { plumes: [{ at: [1, 1], style: 'steam', amount: 4, lean: 0 }] }],
    ['ambience.traffic.0.path', { traffic: [{ kind: 'cars', path: [[1, 1]], every: 2, speed: 4 }] }],
  ])('refuses a bad value at %s', (path, amb) => {
    expect(errs(withAmb(amb))).toContain(path);
  });

  it('refuses windows above 2', () => {
    const raw = base();
    (raw.districts[0] as Record<string, unknown>).windows = 3;
    expect(errs(raw)).toContain('districts.0.windows');
  });

  it('round-trips ambience and windows through serializeMap', () => {
    const raw = withAmb({
      signs: [{ at: [1.2, 2], color: '#ff4fd8', mode: 'flicker', size: 2.6, speed: 0.5, phase: 0.2 }],
      plumes: [{ at: [3, 4], style: 'smoke', amount: 1.2, lean: -0.3, tint: '#7a3a9a' }],
      traffic: [{ kind: 'train', path: [[1, 1], [5, 5]], every: 20, speed: 7 }],
    });
    (raw.districts[0] as Record<string, unknown>).windows = 0.4;
    const once = parsed(raw);
    expect(parsed(serializeMap(once))).toEqual(once);
    expect(once.districts[0].windows).toBe(0.4);
  });

  it('a map without lettering parses with none (district names spec §1)', () => {
    expect(parsed(base()).districts.every((d) => d.lettering === undefined)).toBe(true);
  });

  it('round-trips a district lettering, rounded to 0.1', () => {
    const raw = base();
    (raw.districts[0] as Record<string, unknown>).lettering = { from: [10.04, 20], to: [30, 20], bend: 2.26, size: 1.6 };
    const out = serializeMap(parsed(raw)) as { districts: Record<string, unknown>[] };
    expect(out.districts[0].lettering).toEqual({ from: [10, 20], to: [30, 20], bend: 2.3, size: 1.6 });
    expect(parsed(out).districts[0].lettering).toEqual({ from: [10, 20], to: [30, 20], bend: 2.3, size: 1.6 });
  });

  it('refuses lettering size above 8', () => {
    const raw = base();
    (raw.districts[0] as Record<string, unknown>).lettering = { from: [10, 20], to: [30, 20], bend: 0, size: 9 };
    expect(errs(raw)).toContain('districts.0.lettering.size');
  });

  it('a map without ambience serialises without it', () => {
    expect(serializeMap(parsed(base()))).not.toHaveProperty('ambience');
  });
});

describe('places on a structure, traffic heights (rendered map spec §2)', () => {
  const withPlace = (extra: Record<string, unknown>) => {
    const m = base();
    Object.assign(m.places[0]!, extra);
    return m;
  };
  it('keeps on and level, including roof', () => {
    expect(parsed(withPlace({ on: 'ribbon', level: 4 })).places[0]).toMatchObject({ on: 'ribbon', level: 4 });
    expect(parsed(withPlace({ on: 'ribbon', level: 'roof' })).places[0]!.level).toBe('roof');
  });
  it('rejects levels that are not 1–12 or roof', () => {
    for (const level of [0, 13, 2.5, 'top']) {
      const r = parseMap(withPlace({ on: 'ribbon', level }));
      expect(r.ok, String(level)).toBe(false);
      if (!r.ok) expect(r.errors.some((e) => e.path === 'places.0.level')).toBe(true);
    }
  });
  it('traffic z round-trips; no z writes no key', () => {
    const m = { ...base(), ambience: { signs: [], plumes: [], traffic: [{ kind: 'cars', path: [[1, 1], [2, 2]], every: 5, speed: 1, z: 40 }, { kind: 'cars', path: [[1, 1], [2, 2]], every: 5, speed: 1 }] } };
    const out = serializeMap(parsed(m)) as { ambience: { traffic: Record<string, unknown>[] } };
    expect(out.ambience.traffic[0]!.z).toBe(40);
    expect('z' in out.ambience.traffic[1]!).toBe(false);
    expect(parsed(out).ambience!.traffic[0]!.z).toBe(40);
  });
  it('writes on and level last, after hires', () => {
    const out = serializeMap(parsed(withPlace({ scene: 'p/s', note: 'n', inviteOnly: true, gigs: true, side: true, hires: ['muscle'], on: 'ribbon', level: 2 }))) as { places: object[] };
    expect(Object.keys(out.places[0]!).slice(-3)).toEqual(['hires', 'on', 'level']);
  });
  it('warns when on names no structure (only when structures are given)', () => {
    const scenes = new Set<string>();
    const onWarnings = (w: string[]) => w.filter((x) => x.includes("isn't a structure"));
    expect(mapWarnings(parsed(withPlace({ on: 'stack', level: 2 })), scenes, undefined, new Set(['ribbon']))).toContain("A one is on 'stack', which isn't a structure");
    expect(onWarnings(mapWarnings(parsed(withPlace({ on: 'ribbon', level: 2 })), scenes, undefined, new Set(['ribbon'])))).toEqual([]);
    expect(onWarnings(mapWarnings(parsed(withPlace({ on: 'stack', level: 2 })), scenes))).toEqual([]);
  });
});
