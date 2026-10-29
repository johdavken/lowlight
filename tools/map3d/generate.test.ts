import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import type { Box } from './geometry';
import { generate } from './generate';
import { loadCity } from './load';
import { heightField } from './terrain';
import { litWindows } from './windows';

const city = loadCity('.');
const px = (p: readonly number[]) => [(p[0]! / 100) * MAP_W, (p[1]! / 100) * MAP_H] as const;

describe('generate', () => {
  const g = generate(city);
  it('same data, same city', () => {
    const again = generate(city);
    expect({ ...again, ribbonDistance: null, spineUnder: null }).toEqual({ ...g, ribbonDistance: null, spineUnder: null });
    // Generating the whole city again takes a while under a full parallel run.
  }, 60_000);
  it('the twinkle list stays light enough to draw every frame (about what the painting scan found)', () => {
    expect(g.windows.length).toBeLessThanOrEqual(900);
    expect(g.windows.length).toBeGreaterThan(600);
  });
  it('the highway rides the Spine\'s deck: no road of its own, the deck at its height', () => {
    expect(g.geometry.strips.filter((s) => s.material === 'road' && s.z0 + s.h !== 120)).toHaveLength(0);
    expect(g.geometry.strips.filter((s) => s.material === 'road').length).toBeGreaterThan(30);
  });
  it('windows sit on lit walls', () => {
    const box: Box = { x: 100, y: 200, w: 12, d: 9, h: 30, z0: 5, a: 0.3, tint: '#ffb347', lit: 0.8, brick: 0, seed: 0.42, district: 'karasu', kind: 'building' };
    const ws = litWindows([box], 'test');
    expect(ws.length).toBeGreaterThan(0);
    const r = Math.hypot(box.w, box.d) / 2;
    for (const w of ws) {
      const [x, y] = [(w.x / 100) * MAP_W, (w.y / 100) * MAP_H];
      expect(Math.hypot(x - box.x, y - box.y)).toBeLessThanOrEqual(r + 0.5);
      expect(w.z).toBeGreaterThan(box.z0);
      expect(w.z).toBeLessThanOrEqual(box.z0 + box.h);
    }
  });
  it('the climb rises to the plateau', () => {
    const h = heightField(city.terrain!, city.map);
    const [mx, my] = px([87.9, 18]);
    const [vx, vy] = px([86.2, 21.1]);
    const toward = (x: number, y: number, tx: number, ty: number, d: number) => {
      const L = Math.hypot(tx - x, ty - y);
      return [x + ((tx - x) / L) * d, y + ((ty - y) / L) * d] as const;
    };
    expect(h(...toward(mx, my, vx, vy, 4))).toBeGreaterThan(80);
    expect(h(...toward(vx, vy, mx, my, 4))).toBeLessThan(10);
  });
  it('landmarks land where they are tied', () => {
    const lift = g.geometry.props.filter((p) => p.kind === 'lattice');
    expect(lift.length).toBeGreaterThan(0);
    const landing = city.map.places.find((p) => p.id === 'public-landing')!;
    const [lx, ly] = px(landing.pin);
    // At the route point nearest the landing (Task 5's ruling): within the pin's distance from the route, plus a little.
    const routeDist = g.ribbonDistance(lx, ly) + 8 + 17;
    expect(Math.min(...lift.map((p) => Math.hypot(p.x - lx, p.y - ly)))).toBeLessThan(routeDist + 20);
    const tower = g.geometry.buildings.find((b) => b.kind === 'tower' && b.tint === '#bfe0ff')!;
    expect(tower).toBeDefined();
    expect(g.ribbonDistance(tower.x, tower.y)).toBeGreaterThanOrEqual(0);
  });
  it('pin heights', () => {
    expect(g.geometry.pinHeights['hicks-walkway']).toBeCloseTo(9.7, 6);
    expect('cloudridge' in g.geometry.pinHeights).toBe(false);
    // Places on a structure, on an isle's cliffs (Tidal Isle) or up a core's tower (the Sentinel) stand at their height.
    const style = (id: string) => city.styles[city.map.places.find((p) => p.id === id)?.district ?? ''];
    const onIsle = (id: string) => !!style(id)?.isle;
    const upTower = (id: string) => style(id)?.core?.tower.near === id;
    expect(Object.keys(g.geometry.pinHeights).every((id) => ['ribbon', 'spine'].includes(city.map.places.find((p) => p.id === id)?.on ?? '') || onIsle(id) || upTower(id))).toBe(true);
    expect(g.geometry.pinHeights['ferry-stairs']).toBeGreaterThan(5);
  });
});
