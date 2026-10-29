import { describe, expect, it } from 'vitest';
import { checkDistricts } from './emergency';
import { generate } from './generate';
import { BACKUP, type Geometry } from './geometry';
import { loadCity, type CityData } from './load';
import { toBorder } from '../../shared/district-lookup';
import { parseCityFile } from '../../shared/city-schema';

// Blackouts phase 2 §2: what survives a blackout, per district (the `blackout` block in each style).
const city = loadCity('.');
const g = generate(city).geometry;
const TABLE: Record<string, [number, number, number]> = {
  nexus: [0.25, 6, 0], mirage: [0.3, 3, 0], helios: [0.25, 5, 0], cloudridge: [0.3, 0, 0], ironreach: [0.1, 4, 3],
  dockside: [0.05, 4, 4], drownworks: [0.05, 2, 4], karasu: [0.03, 3, 10], velvet: [0.03, 2, 6], strand: [0.02, 2, 8],
  tidal: [0.01, 0, 6], marsh: [0.01, 0, 14],
};
// Blackouts phase 3 §1: each district's chance a night slot is dark.
const OUTAGE: Record<string, number> = {
  marsh: 0.25, tidal: 0.15, strand: 0.15, karasu: 0.15, velvet: 0.1, drownworks: 0.1, dockside: 0.1, ironreach: 0.06,
  nexus: 0.02, mirage: 0.02, helios: 0.02, cloudridge: 0.02,
};
const fires = (id: string) => g.props.filter((p) => p.kind === 'barrel' && p.supply === 'emergency' && p.district === id);
const roofLamps = (id: string) => g.props.filter((p) => p.kind === 'lamp' && p.color === '#ff3b3b' && p.supply === 'emergency' && p.district === id);
const BACKED = new Set(['building', 'tower', 'tier']);

describe('emergency placement', () => {
  it('each district has the table’s blackout block', () => {
    for (const [id, [backup, roofLights, f]] of Object.entries(TABLE)) expect(city.styles[id]!.blackout, id).toEqual({ backup, roofLights, fires: f, outage: OUTAGE[id] });
  });
  it("each district's survivors match its blackout block", () => {
    for (const [id, [, roofLights, f]] of Object.entries(TABLE)) {
      expect(fires(id).length, `${id} fires`).toBe(f);
      expect(roofLamps(id).length, `${id} roof lights`).toBe(roofLights);
    }
  });
  it('backup covers about the share of each district’s buildings', () => {
    for (const [id, [backup]] of Object.entries(TABLE)) {
      const mine = g.buildings.filter((b) => b.district === id && BACKED.has(b.kind) && (b.backup === undefined || b.backup === BACKUP));
      const backed = mine.filter((b) => b.backup === BACKUP).length;
      expect(Math.abs(backed - Math.round(backup * mine.length)), id).toBeLessThanOrEqual(3);
    }
  });
  it('roof lights stand on the tallest buildings', () => {
    for (const id of ['nexus', 'helios', 'karasu']) {
      const tall = g.buildings.filter((b) => b.district === id && (b.kind === 'building' || b.kind === 'tower')).map((b) => b.z0 + b.h).sort((a, b) => b - a);
      for (const p of roofLamps(id)) expect(p.z0).toBeGreaterThanOrEqual(tall[Math.min(tall.length - 1, 30)]! - 0.01);
    }
  });
  it('emergency lights stand their reach inside the border', () => {
    for (const l of g.lights.filter((q) => q.supply === 'emergency' && (q.color === '#ff7a2a' || q.color === '#ff3b3b'))) {
      const d = g.districts.find((dd) => dd.border.length >= 3 && toBorder([l.x, l.y], dd.border) >= 0 && fires(dd.id).concat(roofLamps(dd.id)).some((p) => Math.hypot(p.x - l.x, p.y - l.y) < 0.01));
      expect(d, `${l.x},${l.y}`).toBeDefined();
      expect(toBorder([l.x, l.y], d!.border)).toBeGreaterThanOrEqual(l.reach);
    }
  });
  it('no emergency lamp or fire starts inside another box (final review)', () => {
    const within = (p: { x: number; y: number; z0: number }, b: (typeof g.buildings)[number]) => {
      const dx = p.x - b.x, dy = p.y - b.y, c = Math.cos(b.a), s = Math.sin(b.a);
      return Math.abs(dx * c + dy * s) < b.w / 2 && Math.abs(-dx * s + dy * c) < b.d / 2 && p.z0 >= b.z0 - 0.01 && p.z0 < b.z0 + b.h - 0.01;
    };
    const buried = g.props.filter((p) => p.supply === 'emergency' && (p.kind === 'barrel' || p.color === '#ff3b3b') && g.buildings.some((b) => within(p, b)));
    expect(buried.map((p) => `${p.district} ${p.kind} ${Math.round(p.x)},${Math.round(p.y)} z${p.z0.toFixed(1)}`)).toEqual([]);
  });
  it('the spine and the ribbon get nothing', () => {
    for (const id of ['spine', 'ribbon']) {
      expect(fires(id).length + roofLamps(id).length).toBe(0);
      expect(g.buildings.some((b) => b.district === id && b.backup === BACKUP)).toBe(false);
    }
  });
  it('nothing that was there before moves', () => {
    const bare: CityData = { ...city, styles: Object.fromEntries(Object.entries(city.styles).map(([k, s]) => [k, { ...s, blackout: undefined }])) };
    const h = generate(bare).geometry;
    const strip = (x: Geometry) => ({
      buildings: x.buildings.map(({ backup, ...b }) => (backup === BACKUP ? b : { ...b, ...(backup !== undefined && { backup }) })),
      props: x.props.filter((p) => p.supply !== 'emergency'),
      lights: x.lights.filter((l) => !(l.supply === 'emergency' && (l.color === '#ff7a2a' || l.color === '#ff3b3b'))),
      strips: x.strips,
      curves: x.curves,
    });
    expect(strip(g)).toEqual(strip(h));
  }, 60_000);
  it('checkDistricts throws on 32 districts and on an unknown id', () => {
    const many = { ...g, districts: Array.from({ length: 32 }, (_, i) => ({ id: `d${i}`, border: [] })) };
    expect(() => checkDistricts(many)).toThrow('more than 31 districts');
    const odd = { ...g, props: [...g.props, { ...g.props[0]!, district: 'atlantis' }] };
    expect(() => checkDistricts(odd)).toThrow('unknown district atlantis');
    expect(() => checkDistricts(g)).not.toThrow();
  });
  it('a blackout share over 1 fails to parse', () => {
    const def = JSON.parse(JSON.stringify(city.styles['karasu']));
    expect(parseCityFile('district', { ...def, blackout: { backup: 1.5, roofLights: 0, fires: 0 } }).ok).toBe(false);
    expect(parseCityFile('district', { ...def, blackout: { backup: 0.2, roofLights: 1, fires: 2 } }).ok).toBe(true);
  });
});
