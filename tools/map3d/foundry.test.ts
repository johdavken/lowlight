import { describe, expect, it } from 'vitest';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { generate } from './generate';
import { loadCity } from './load';

const city = loadCity('.');
const ir = city.map.districts.find((d) => d.id === 'ironreach')!;
const dock = city.map.districts.find((d) => d.id === 'dockside')!;
const cfg = city.styles['ironreach']!.industry!;
const inIr = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], ir.border!);
const inDock = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], dock.border!);
const g = generate(city).geometry;
const own = g.buildings.filter((b) => b.district === 'ironreach');

describe('Iron Reach, the industrial zone (2026-10-27)', () => {
  it('steelworks: blast furnaces with stoves, the molten glow at each casthouse', () => {
    const molten = g.lights.filter((l) => l.color === '#ffb030' && inIr(l.x, l.y));
    expect(molten.length).toBeGreaterThanOrEqual(2);
    expect(molten.length).toBeLessThanOrEqual(cfg.steelworks);
    for (const m of molten) expect(g.props.filter((p) => p.kind === 'tank' && p.h > cfg.furnace * cfg.scale * 0.7 && Math.hypot(p.x - m.x, p.y - m.y) < 120).length).toBeGreaterThanOrEqual(2);
  });
  it('refineries: lamp-strung cracking columns and a flare burning on its stack', () => {
    const flares = g.lights.filter((l) => l.color === '#ff9a3a' && l.z > cfg.flare && inIr(l.x, l.y));
    expect(flares.length).toBeGreaterThanOrEqual(1);
    for (const f of flares) expect(g.props.filter((p) => p.kind === 'lamp' && p.color === '#ffe2b0' && Math.hypot(p.x - f.x, p.y - f.y) < 160).length).toBeGreaterThan(20);
  });
  it('the works fill the ground between the plants: lit halls, yards, tanks; no generic blocks', () => {
    const halls = own.filter((b) => b.kind === 'building' && b.lit === 0.3);
    expect(halls.length).toBeGreaterThan(30);
    // Every building is the industry's own (the generic lots are off here).
    expect(own.every((b) => b.lit !== city.styles['ironreach']!.windowLit)).toBe(true);
    expect(g.lights.filter((l) => inIr(l.x, l.y)).length).toBeGreaterThan(80);
  });
  it("freight rail in from Dockside: its trunk branches toward Iron Reach and carries on inside, an ore train on it", () => {
    const rails = g.strips.filter((s) => s.material === 'street-light' && s.color === '#7a5a3c');
    expect(rails.some((s) => inIr(s.x, s.y) && s.w > 100)).toBe(true);
    // The branch: a line in Dockside one end of which reaches Iron Reach's border.
    const reaches = (s: (typeof rails)[number]) => [-1, 1].some((k) => {
      const ex = s.x + (Math.cos(s.a) * s.w * k) / 2, ey = s.y + (Math.sin(s.a) * s.w * k) / 2;
      return [0, 1, 2, 3, 4, 5, 6, 7].some((q) => inIr(ex + Math.cos(q * 0.785) * 60, ey + Math.sin(q * 0.785) * 60));
    });
    expect(rails.some((s) => inDock(s.x, s.y) && s.w > 100 && reaches(s))).toBe(true);
    const wagons = own.filter((b) => b.kind === 'car' && b.w === 7);
    expect(wagons.length).toBeGreaterThanOrEqual(8);
  });
  it('Dockside and Iron Reach blend: port containers inside Iron Reach near the line, Dockside\'s warehouses up to it, an interchange of trains along it', () => {
    const port = city.styles['dockside']!.port!;
    const portStacks = g.props.filter((p) => p.kind === 'container' && port.containers.includes(p.color!) && inIr(p.x, p.y) && p.z0 < 0.5);
    expect(portStacks.length).toBeGreaterThan(100);
    // Across the line, Dockside's warehouses come right up to it.
    const toIr = (x: number, y: number) => [0, 1, 2, 3, 4, 5, 6, 7].some((q) => inIr(x + Math.cos(q * 0.785) * 120, y + Math.sin(q * 0.785) * 120));
    const across = g.buildings.filter((b) => b.district === 'dockside' && b.lit === 0.15 && toIr(b.x, b.y));
    expect(across.length).toBeGreaterThan(10);
    // Parallel tracks along the shared border, a container train and an ore train among them.
    const locos = own.filter((b) => b.kind === 'car' && b.w === 14);
    expect(locos.length).toBeGreaterThanOrEqual(2);
    const flatcars = g.strips.filter((s) => s.material === 'girder' && s.w === 8.4 && inIr(s.x, s.y));
    expect(flatcars.length).toBeGreaterThan(10);
  });
  it("a truck road from Dockside's terminals to the Spine's foot, a truck plaza and a cargo lift there", () => {
    const roads = g.strips.filter((s) => s.material === 'street' && s.d === 10 && s.w > 100);
    expect(roads.some((s) => inDock(s.x, s.y))).toBe(true);
    expect(roads.some((s) => inIr(s.x, s.y))).toBe(true);
    const foot = [(cfg.spineFoot![0] / 100) * MAP_W, (cfg.spineFoot![1] / 100) * MAP_H] as const;
    // The lift: lattice legs reaching the deck near the foot.
    expect(g.props.filter((p) => p.kind === 'lattice' && p.h >= cfg.spineDeck && Math.hypot(p.x - foot[0], p.y - foot[1]) < 200).length).toBeGreaterThanOrEqual(4);
  });
  it('toward Cloudridge and Helios the works give way to blocks with their windows', () => {
    const blocks = own.filter((b) => b.kind === 'building' && b.lit === 0.5);
    expect(blocks.length).toBeGreaterThan(10);
    expect(blocks.some((b) => city.styles['cloudridge']!.windowColors.includes(b.tint))).toBe(true);
  });
  it('the derrick stands lit among thick pines on the wooded west edge', () => {
    const at = [(cfg.derrick!.at[0] / 100) * MAP_W, (cfg.derrick!.at[1] / 100) * MAP_H] as const;
    expect(g.strips.filter((s) => s.material === 'girder' && s.ends && Math.hypot(s.x - at[0], s.y - at[1]) < 20).length).toBeGreaterThan(8);
    expect(g.props.filter((p) => p.kind === 'pine' && Math.hypot(p.x - at[0], p.y - at[1]) < cfg.derrick!.forest + 30).length).toBeGreaterThan(60);
  });
  it("chimneys stand under the ambience's smoke plumes", () => {
    for (const pl of city.map.ambience!.plumes!.filter((p) => p.style === 'smoke' && inIr((p.at[0] / 100) * MAP_W, (p.at[1] / 100) * MAP_H))) {
      const [px, py] = [(pl.at[0] / 100) * MAP_W, (pl.at[1] / 100) * MAP_H];
      expect(own.some((b) => b.kind === 'stack' && Math.abs(b.y - b.h * Math.cos((52 * Math.PI) / 180) - py) < 12 && Math.abs(b.x - px) < 110)).toBe(true);
    }
  });
  it('the west edge gets its own pines, apart from the derrick forest', () => {
    const at = [(cfg.derrick!.at[0] / 100) * MAP_W, (cfg.derrick!.at[1] / 100) * MAP_H] as const;
    const edge = g.props.filter((p) => p.kind === 'pine' && inIr(p.x, p.y) && Math.hypot(p.x - at[0], p.y - at[1]) > cfg.derrick!.forest + 30);
    expect(edge.length).toBeGreaterThan(cfg.pines.count * 0.6);
  });
  it('moving a smoke plume (Studio) moves no plant', () => {
    const plants = (gg: typeof g) => gg.lights.filter((l) => (l.color === '#ffb030' || l.color === '#ff9a3a') && inIr(l.x, l.y)).map((l) => `${l.x.toFixed(2)},${l.y.toFixed(2)}`).sort();
    const moved = structuredClone(city);
    const pl = moved.map.ambience!.plumes!.find((p) => p.style === 'smoke' && inIr((p.at[0] / 100) * MAP_W, (p.at[1] / 100) * MAP_H))!;
    pl.at = [pl.at[0] + 1.5, pl.at[1]];
    expect(plants(generate(moved).geometry)).toEqual(plants(g));
  }, 60_000);
  it('chimneys in pairs with steady red lamps, pines along the west edge', () => {
    expect(own.filter((b) => b.kind === 'stack' && b.h > cfg.chimney * 0.7).length).toBeGreaterThanOrEqual(cfg.chimneys);
    const pines = g.props.filter((p) => p.kind === 'pine' && inIr(p.x, p.y));
    expect(pines.length).toBeGreaterThan(40);
    // Along the west edge, or in the derrick's forest.
    const at = [(cfg.derrick!.at[0] / 100) * MAP_W, (cfg.derrick!.at[1] / 100) * MAP_H] as const;
    for (const p of pines) expect(p.x < cfg.pines.depth + 1 || Math.hypot(p.x - at[0], p.y - at[1]) < cfg.derrick!.forest + 30).toBe(true);
  });
});
