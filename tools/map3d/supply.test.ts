import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { LANDMARK_BACKUP } from './geometry';
import { loadCity } from './load';
import { MAP_H, MAP_W } from '../../shared/map-projection';

// Blackouts phase 2 §1–2: who powers each light. Fires and candles are their own; pumps and the Sentinel on backup.
const city = loadCity('.');
const g = generate(city).geometry;
const near = (a: { x: number; y: number }, b: { x: number; y: number }, r: number) => Math.hypot(a.x - b.x, a.y - b.y) < r;

describe('supply', () => {
  it('the fires already in the city burn on their own power, props and lights', () => {
    const barrels = g.props.filter((p) => p.kind === 'barrel' && p.supply !== 'emergency');
    expect(barrels.length).toBeGreaterThan(5);
    expect(barrels.every((p) => p.supply === 'own')).toBe(true);
    const fires = g.lights.filter((l) => l.color === '#ff7a2a' && l.power <= 25000 && l.supply !== 'emergency');
    expect(fires.length).toBeGreaterThan(0);
    expect(fires.every((l) => l.supply === 'own')).toBe(true);
  });
  it("the Counting House roof's fire, lanterns and light are its own", () => {
    const cfg = city.styles['marsh']!.flooded!;
    const pin = city.map.places.find((p) => p.id === cfg.bank.near)!.pin;
    const at = { x: (pin[0] / 100) * MAP_W, y: (pin[1] / 100) * MAP_H };
    const bank = g.buildings.find((b) => b.district === 'marsh' && b.kind === 'building' && b.w >= cfg.bank.w - 0.01 && near(b, at, 40))!;
    const top = bank.z0 + bank.h;
    const roof = g.props.filter((p) => p.z0 >= top - 1 && near(p, bank, cfg.bank.w));
    expect(roof.length).toBeGreaterThanOrEqual(15);
    expect(roof.every((p) => p.supply === 'own')).toBe(true);
    expect(g.lights.some((l) => near(l, bank, 2) && l.z > top && l.supply === 'own')).toBe(true);
  });
  it("the Marsh's boat lanterns and the Choir's candles are their own", () => {
    const candles = g.props.filter((p) => p.kind === 'lamp' && p.color === '#ffd27a' && p.w === 0.35 && p.district === 'marsh');
    expect(candles.length).toBeGreaterThan(0);
    expect(candles.every((p) => p.supply === 'own')).toBe(true);
    const boats = g.props.filter((p) => p.kind === 'lamp' && p.z0 === 0.6 && p.district === 'marsh');
    expect(boats.length).toBeGreaterThan(0);
    expect(boats.every((p) => p.supply === 'own')).toBe(true);
  });
  it('the Marsh pump towers are on backup, one emergency light each', () => {
    const towers = g.buildings.filter((b) => b.district === 'marsh' && b.kind === 'tower');
    expect(towers.length).toBe(city.styles['marsh']!.flooded!.pumps);
    for (const t of towers) {
      expect(t.backup).toBe(LANDMARK_BACKUP);
      expect(g.lights.filter((l) => l.supply === 'emergency' && near(l, t, 10)).length).toBe(1);
    }
  });
  it("Drownworks' pump houses are on backup, each with an emergency light", () => {
    const houses = g.buildings.filter((b) => b.district === 'drownworks' && b.backup === LANDMARK_BACKUP);
    expect(houses.length).toBeGreaterThan(3);
    for (const h of houses) expect(g.lights.some((l) => l.supply === 'emergency' && near(l, h, 10))).toBe(true);
  });
  it("the Sentinel is on backup, with one emergency light at its foot", () => {
    const cfg = city.styles['nexus']!.core!;
    const pin = city.map.places.find((p) => p.id === cfg.tower.near)!.pin;
    const at = { x: (pin[0] / 100) * MAP_W, y: (pin[1] / 100) * MAP_H };
    const tiers = g.buildings.filter((b) => b.district === 'nexus' && b.backup === LANDMARK_BACKUP);
    expect(tiers.length).toBeGreaterThanOrEqual(3);
    expect(tiers.every((b) => near(b, at, Math.max(cfg.tower.w, cfg.tower.d)))).toBe(true);
    expect(g.lights.filter((l) => l.supply === 'emergency' && l.color === '#ffb347' && near(l, at, 40)).length).toBe(1);
  });
});
