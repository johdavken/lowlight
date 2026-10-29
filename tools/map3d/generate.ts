// The whole city from data (spec 2026-10-25 §3): the Ribbon, raised roads, the districts' blocks around them, the climb to
// Mirage Heights and the landmarks, plus the lit windows the live layer twinkles. Same data, same city.
import { checkDistricts, placeEmergency } from './emergency';
import { emptyGeometry, type Geometry } from './geometry';
import { landmarkGeometry } from './landmarks';
import type { CityData } from './load';
import { CLEARANCE, cityLots } from './lots';
import { districtStreets } from './streets';
import { marshGeometry } from './marsh';
import { ownerAt } from '../../shared/district-lookup';
import { maskFloor } from './mask-floor';
import { worksGeometry } from './works';
import { ridgeGeometry } from './ridge';
import { isleGeometry } from './isle';
import { coreGeometry } from './core';
import { portGeometry } from './port';
import { foundryGeometry } from './foundry';
import { arcologyGeometry } from './arcology';
import { hillGeometry } from './hill';
import { enclaveGeometry } from './enclave';
import { roadDistance, roadGeometry } from './roads';
import { ribbonGeometry, type StructureGeometry } from './structure';
import { spineGeometry } from './spine';
import { terrainGeometry } from './terrain';
import { litWindows, type LitWindow3 } from './windows';
import { coastEdges, followShore, gapRuns, landGrid, landPolygonIds, landPolygons, naturalShore, onLand, type LandGrid, type ShoreShift } from './water';
import { waterfrontGeometry } from './waterfront';
import { insideBorder } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';

export interface Generated {
  geometry: Geometry;
  windows: LitWindow3[];
  /** From a point to the Ribbon's stacks (Infinity with no Ribbon). */
  ribbonDistance: (x: number, y: number) => number;
  /** Whether a point is under the Spine's deck. */
  spineUnder: (x: number, y: number) => boolean;
  /** The 8× corridors around raised highways (map %). */
  deepAreas: [number, number][][];
  /** Land and water. */
  land: LandGrid;
}

export function generate(city: CityData): Generated {
  const g = emptyGeometry();
  // Districts gone under (the Marsh) are water, not land.
  const under = city.map.districts.filter((d) => city.styles[d.id]?.flooded).map((d) => d.id);
  // Isles bring their own ground (a natural shore), so no slab shaped like their administrative border.
  const isleIds = city.map.districts.filter((d) => city.styles[d.id]?.isle).map((d) => d.id);
  g.land = landPolygons(city.map, [...under, ...isleIds]);
  g.landDistricts = landPolygonIds(city.map, [...under, ...isleIds]);
  // Land: the districts, the gaps between them, and the Spine's strip; the rest is the bay.
  const land: LandGrid = landGrid(city.map, city.spines.map((sp) => spineGeometry(sp, city.map.places, null).along), under, isleIds);
  const isLand = onLand(land);
  const borderOf = (id: string) => city.map.districts.find((d) => d.id === id)?.border;
  const clip = (x: number, y: number, within?: string) => {
    if (!isLand(x, y)) return false;
    const b = within ? borderOf(within) : undefined;
    return !b || insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], b);
  };
  const structures: StructureGeometry[] = city.structures.map((s) => ribbonGeometry(s, city.map.places, clip));
  const traffic = city.map.ambience?.traffic ?? [];
  const toRoad = roadDistance(traffic);
  const toStructure = (x: number, y: number) => Math.min(Infinity, ...structures.map((s) => s.distance(x, y)));
  const spines = city.spines.map((sp) => spineGeometry(sp, city.map.places, structures.length ? toStructure : null));
  // Isles on cliffs (Tidal Isle): their heightfields, the QDF and the Ferry Stairs; blocks stand on their ground.
  const isles = city.map.districts.flatMap((d) => {
    const cfg = city.styles[d.id]?.isle;
    const others = city.map.districts.filter((o) => o.id !== d.id && o.border && o.border.length >= 3).map((o) => o.border!);
    return cfg && d.border ? [isleGeometry(d.id, cfg, d.border, city.map.places, others)] : [];
  });
  // Natural shores on every coast: each land slab's outline wanders out into open water (isles bring their own shore).
  const shifts: ShoreShift[] = [];
  // Ports' quays are built straight: their coast keeps its line.
  const portCoasts = city.map.districts.filter((d) => city.styles[d.id]?.port).map((d) => ({ d, edges: coastEdges(city.map, land, d.id) }));
  const quayside = (x: number, y: number) => portCoasts.some((pc) => pc.edges.some(([a, b]) => segDistance(x, y, a, b) < 30));
  const water = (x: number, y: number) => !isLand(x, y) && !isles.some((is) => is.heightAt(x, y) >= 0);
  const shoreWater = (x: number, y: number) => water(x, y) && !quayside(x, y);
  g.land = g.land.map((poly, k) => naturalShore(poly, shoreWater, `shore:${k}`, city.render.shore ?? 20, 6, shifts));
  const alongShore = followShore(shifts);
  // Seafronts (the Strand): a boardwalk, a wheel and a pier on the district's coast; blocks keep back from the boardwalk.
  const fronts = city.map.districts.flatMap((d) => {
    const cfg = city.styles[d.id]?.waterfront;
    if (!cfg) return [];
    const edges = coastEdges(city.map, land, d.id);
    return [{ edges, geo: waterfrontGeometry(d.id, cfg, edges, city.map.places, isLand) }];
  });
  const coastLines = fronts.flatMap((f) => f.edges);
  const toFront = (x: number, y: number) => {
    let best = Infinity;
    for (const [a, b] of coastLines) {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) - 5);
    }
    return best;
  };
  // Quarters of winding streets (Velvet), lined with their own row houses.
  const quarters = city.map.districts.flatMap((d) => {
    const cfg = city.styles[d.id]?.streets;
    return cfg && d.border ? [districtStreets(d.id, cfg, d.border, city.map.places, city.styles[d.id])] : [];
  });
  // The district's own blocks stand behind the row houses (a lot's centre about half a lot further back).
  const toQuarter = (x: number, y: number) => Math.min(Infinity, ...quarters.map((q) => q.distance(x, y) - q.frontDepth - 9 + CLEARANCE));
  // The Marsh's seawall, pumps and drowned bank; the bank's lagoon stays open.
  const marshes = city.map.districts.flatMap((d) => {
    const cfg = city.styles[d.id]?.flooded;
    return cfg && d.border ? [marshGeometry(d.id, cfg, d.border, city.map.places, isLand)] : [];
  });
  const toBank = (x: number, y: number) => Math.min(Infinity, ...marshes.map((m) => m.distance(x, y) - 24 + CLEARANCE));
  for (const m of marshes) {
    g.buildings.push(...m.buildings);
    g.props.push(...m.props);
    g.strips.push(...m.strips);
    g.lights.push(...m.lights);
  }
  // Water works (Drownworks): bays, pump houses, pipe racks and the floodwall; blocks keep off the bays.
  const works = city.map.districts.flatMap((d) => {
    const cfg = city.styles[d.id]?.works;
    const drownedBorders = city.map.districts.filter((o) => city.styles[o.id]?.flooded && o.border).map((o) => o.border!);
    const drowned = (x: number, y: number) => drownedBorders.some((b) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], b));
    // Piers keep off any other ground (the isles' natural shores included).
    const solid = (x: number, y: number) => isLand(x, y) || isles.some((is) => is.heightAt(x, y) >= 0);
    return cfg && d.border ? [worksGeometry(d.id, cfg, d.border, city.map.places, coastEdges(city.map, land, d.id), drowned, solid)] : [];
  });
  const toWorks = (x: number, y: number) => Math.min(Infinity, ...works.map((w) => w.distance(x, y) - 12 + CLEARANCE));
  for (const w of works) {
    for (const b of w.buildings) [b.x, b.y] = alongShore(b.x, b.y);
    for (const p of w.props) [p.x, p.y] = alongShore(p.x, p.y);
    for (const st of w.strips) {
      [st.x, st.y] = alongShore(st.x, st.y);
      if (st.ends) for (const e of st.ends) [e[0], e[1]] = alongShore(e[0], e[1]);
    }
    for (const l of w.lights) [l.x, l.y] = alongShore(l.x, l.y);

    g.buildings.push(...w.buildings);
    g.props.push(...w.props);
    g.strips.push(...w.strips);
    g.lights.push(...w.lights);
  }
  // Container ports (Dockside): quays, cranes, ships and yards; blocks keep off them.
  const solidAt = (x: number, y: number) => isLand(x, y) || isles.some((is) => is.heightAt(x, y) >= 0);
  // The distance to a structure, road or raised highway, cached on a 2 px grid: every district generator asks it tens of
  // thousands of times (the review's profile: 2 s of Dockside alone), and the answer moves at most a px within a cell.
  const blockedCache = new Map<number, number>();
  const blockedAt = (x: number, y: number) => {
    const k = Math.round(x / 2) * 8192 + Math.round(y / 2);
    let d = blockedCache.get(k);
    if (d === undefined) {
      const cx = Math.round(x / 2) * 2, cy = Math.round(y / 2) * 2;
      d = Math.min(toStructure(cx, cy), toRoad(cx, cy), ...spines.map((sp) => sp.distance(cx, cy)));
      blockedCache.set(k, d);
    }
    return d;
  };
  const ports = portCoasts.map(({ d, edges }) =>
    portGeometry(d.id, city.styles[d.id]!.port!, d.border!, edges, solidAt, blockedAt),
  );
  // Heavy industry (Iron Reach): steelworks, gas holders, tank farms, chimneys, pipe racks; blocks keep off them.
  const foundries = city.map.districts.flatMap((d) => {
    const cfg = city.styles[d.id]?.industry;
    // A port's branch line carries on into the works.
    const branch = ports.map((p) => p.branch).find(Boolean) ?? null;
    const nb = cfg?.blendWith ? city.map.districts.find((o) => o.id === cfg.blendWith) : undefined;
    const nbPort = cfg?.blendWith ? city.styles[cfg.blendWith]?.port : undefined;
    const blend = nb?.border && nbPort ? { border: nb.border, containers: nbPort.containers, taken: (x: number, y: number) => Math.min(Infinity, ...ports.map((p) => p.distance(x, y))) } : null;
    const edges = (cfg?.edgeBlend ?? []).flatMap((id) => {
      const o = city.map.districts.find((x) => x.id === id), st = city.styles[id];
      return o?.border && st ? [{ border: o.border, colors: st.windowColors, height: st.height }] : [];
    });
    const plumes = (city.map.ambience?.plumes ?? []).filter((p) => p.style === 'smoke').map((p): [number, number] => [(p.at[0] / 100) * MAP_W, (p.at[1] / 100) * MAP_H]);
    const road = ports.map((p) => p.road).find(Boolean) ?? null;
    return cfg && d.border ? [foundryGeometry(d.id, cfg, d.border, solidAt, blockedAt, branch, blend, { road, edges, plumes })] : [];
  });
  const toPort = (x: number, y: number) => Math.min(Infinity, ...ports.map((p) => p.distance(x, y) + CLEARANCE), ...foundries.map((p) => p.distance(x, y) + CLEARANCE), ...arcologies.map((p) => p.distance(x, y) + CLEARANCE));
  // Arcologies (Helios Towers): five eco superstructures, their grounds and the infrastructure between.
  const arcologies = city.map.districts.flatMap((d) => {
    const cfg = city.styles[d.id]?.arcologies;
    return cfg && d.border ? [arcologyGeometry(d.id, cfg, d.border, solidAt, blockedAt)] : [];
  });
  for (const a of arcologies) g.curves.push(...a.curves);
  // Hills (Cloudridge): raised ground on the isles' mesh, contour roads, villas behind walls, trees.
  const hills = city.map.districts.flatMap((d) => {
    const cfg = city.styles[d.id]?.hill;
    return cfg && d.border ? [hillGeometry(d.id, cfg, d.border, blockedAt)] : [];
  });
  // Enclaves (Mirage Heights): the government on its plateau.
  const enclaves = city.map.districts.flatMap((d) => {
    const cfg = city.styles[d.id]?.enclave;
    const z = city.terrain && city.terrain.plateau === d.id ? city.terrain.height : 0;
    return cfg && d.border ? [enclaveGeometry(d.id, cfg, d.border, z, blockedAt)] : [];
  });
  for (const e of enclaves) {
    g.buildings.push(...e.buildings);
    g.props.push(...e.props);
    g.strips.push(...e.strips);
    g.curves.push(...e.curves);
    g.lights.push(...e.lights);
  }
  for (const h of hills) {
    g.islands.push(h.grid);
    g.buildings.push(...h.buildings);
    g.props.push(...h.props);
    g.strips.push(...h.strips);
    g.lights.push(...h.lights);
    g.curves.push(...h.curves);
  }
  for (const p of [...ports, ...foundries, ...arcologies]) {
    g.buildings.push(...p.buildings);
    g.props.push(...p.props);
    g.strips.push(...p.strips);
    g.lights.push(...p.lights);
  }
  const keepOut = (x: number, y: number) => Math.min(toStructure(x, y), toRoad(x, y), toFront(x, y), toQuarter(x, y), toBank(x, y), toWorks(x, y), toPort(x, y), ...spines.map((sp) => sp.distance(x, y)));
  for (const q of quarters) {
    g.buildings.push(...q.buildings);
    g.props.push(...q.props);
    g.strips.push(...q.strips);
    g.curves.push(...q.curves);
    g.lights.push(...q.lights);
  }
  g.landFill = { step: land.step, runs: gapRuns(city.map, land) };
  // Ridges between flooded districts and the neighbours they name: crags, tall pines, mist.
  for (const d of city.map.districts) {
    const ids = city.styles[d.id]?.flooded?.ridgeWith;
    if (!ids?.length) continue;
    const rg = ridgeGeometry(city.map, d.id, ids, land, g.landFill.runs);
    g.props.push(...rg.props);
    g.volumes.push(...rg.volumes);
    g.lights.push(...rg.lights);
  }
  for (const { geo } of fronts) {
    // Out with the natural shore. Tall curves (the wheel's rim and spokes) move as one piece, and so does everything
    // inside their footprint (its cars and A-frame), so the wheel doesn't warp; the rest bends with the shore.
    const rigid: { x0: number; x1: number; y0: number; y1: number; dx: number; dy: number }[] = [];
    for (const c of geo.curves) {
      const zs = c.points.map((q) => q[2]);
      if (Math.max(...zs) - Math.min(...zs) <= 12) continue;
      const xs2 = c.points.map((q) => q[0]), ys2 = c.points.map((q) => q[1]);
      const mx = (Math.min(...xs2) + Math.max(...xs2)) / 2, my = (Math.min(...ys2) + Math.max(...ys2)) / 2;
      const [nx2, ny2] = alongShore(mx, my);
      rigid.push({ x0: Math.min(...xs2) - 6, x1: Math.max(...xs2) + 6, y0: Math.min(...ys2) - 8, y1: Math.max(...ys2) + 8, dx: nx2 - mx, dy: ny2 - my });
    }
    const move = (x: number, y: number): [number, number] => {
      const r2 = rigid.find((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
      return r2 ? [x + r2.dx, y + r2.dy] : alongShore(x, y);
    };
    for (const b of geo.buildings) [b.x, b.y] = move(b.x, b.y);
    for (const p of geo.props) [p.x, p.y] = move(p.x, p.y);
    for (const st of geo.strips) {
      [st.x, st.y] = move(st.x, st.y);
      if (st.ends) for (const e of st.ends) [e[0], e[1]] = move(e[0], e[1]);
    }
    for (const l of geo.lights) [l.x, l.y] = move(l.x, l.y);
    for (const c of geo.curves) for (const q of c.points) [q[0], q[1]] = move(q[0], q[1]);
    g.buildings.push(...geo.buildings);
    g.props.push(...geo.props);
    g.strips.push(...geo.strips);
    g.curves.push(...geo.curves);
    g.lights.push(...geo.lights);
  }
  for (const s of structures) {
    tag(s, 'ribbon');
    g.buildings.push(...s.buildings);
    g.props.push(...s.props);
    g.strips.push(...s.strips);
    g.curves.push(...s.curves);
    g.lights.push(...s.lights);
    g.volumes.push(...s.volumes);
    Object.assign(g.pinHeights, s.pinHeights);
  }
  for (const sp of spines) {
    tag(sp, 'spine');
    g.buildings.push(...sp.buildings);
    g.props.push(...sp.props);
    g.strips.push(...sp.strips);
    g.curves.push(...sp.curves);
    g.lights.push(...sp.lights);
    Object.assign(g.pinHeights, sp.pinHeights);
  }
  // Roads a raised highway carries get no deck of their own.
  const carried = (path: [number, number][]) =>
    spines.some((sp) => path.filter(([x, y]) => sp.under((x / 100) * 4608, (y / 100) * 3072)).length >= path.length * 0.7);
  const roads = roadGeometry(traffic.filter((t) => !carried(t.path)));
  g.strips.push(...roads.strips);
  g.props.push(...roads.props);
  for (const is of isles) {
    g.islands.push(is.grid);
    g.buildings.push(...is.buildings);
    g.props.push(...is.props);
    g.strips.push(...is.strips);
    g.lights.push(...is.lights);
    for (const p of city.map.places) if (p.district === is.grid.id && !p.side) g.pinHeights[p.id] = Math.max(0, is.heightAt((p.pin[0] / 100) * MAP_W, (p.pin[1] / 100) * MAP_H));
  }
  const grounds = Object.fromEntries(isles.map((is) => [is.grid.id, is.heightAt]));
  const keepIsle = (x: number, y: number) => Math.min(Infinity, ...isles.map((is) => is.distance(x, y) + CLEARANCE));
  const lots = cityLots(city, (x, y) => Math.min(keepOut(x, y), keepIsle(x, y)), toStructure, grounds);
  g.buildings.push(...lots.buildings);
  g.props.push(...lots.props);
  g.curves.push(...lots.curves);
  g.strips.push(...lots.strips);
  g.lights.push(...lots.lights);
  // City cores (Nexus): towers rising to the Sentinel, its plaza and emblems.
  const withBorder = city.map.districts.filter((d) => d.border && d.border.length >= 3);
  withBorder.forEach((d, i) => {
    const style = city.styles[d.id];
    if (!style?.core) return;
    const blends = style.core.blend.flatMap((e) => {
      const n = city.map.districts.find((o) => o.id === e.with);
      const ns = city.styles[e.with];
      return n?.border && ns ? [{ border: n.border, style: ns, reach: e.reach, step: e.step, lanterns: e.lanterns ? ns.streets?.lanternColors : undefined }] : [];
    });
    const c = coreGeometry(d.id, style, d.border!, city.map.places, withBorder.slice(0, i).map((o) => o.border!), (x, y) => Math.min(keepOut(x, y), keepIsle(x, y)), CLEARANCE, blends);
    g.buildings.push(...c.buildings);
    g.props.push(...c.props);
    g.strips.push(...c.strips);
    g.curves.push(...c.curves);
    g.lights.push(...c.lights);
    Object.assign(g.pinHeights, c.pinHeights);
  });
  if (city.terrain) {
    const t = terrainGeometry(city.terrain, city.map);
    if (t) {
      g.terrain = t.grid;
      g.props.push(...t.props);
      g.lights.push(...t.lights);
      g.buildings.push(...t.buildings);
      g.strips.push(...t.strips);
    }
  }
  const ribbon = structures[0] ?? null;
  const grid = g.terrain;
  const groundAt = grid
    ? (x: number, y: number) => {
        const i = Math.round((x - grid.x0) / grid.step), j = Math.round((y - grid.y0) / grid.step);
        return i >= 0 && j >= 0 && i < grid.cols && j < grid.rows ? grid.heights[j * grid.cols + i]! : -1;
      }
    : undefined;
  const marks = landmarkGeometry(city.landmarks, { places: city.map.places, frame: ribbon ? ribbon.frame : null, height: groundAt, cliffTop: city.terrain?.height });
  g.buildings.push(...marks.buildings);
  g.curves.push(...marks.curves);
  g.props.push(...marks.props);
  g.lights.push(...marks.lights);
  // Nothing in the city stands up into a raised deck: roofs under it stay below the deck by its clearance.
  const spineUnder = (x: number, y: number) => spines.some((sp) => sp.under(x, y));
  const caps = city.spines;
  const capAt = (x: number, y: number) => {
    let cap = Infinity;
    spines.forEach((sp, i) => {
      if (sp.under(x, y)) cap = Math.min(cap, caps[i]!.deckHeight - caps[i]!.underClearance);
    });
    return cap;
  };
  const CAPPED = new Set(['building', 'stack', 'tier', 'wall', 'bridge']);
  g.buildings = g.buildings.flatMap((b) => {
    if (!CAPPED.has(b.kind)) return [b];
    const cap = capAt(b.x, b.y);
    if (b.z0 >= cap) return [];
    return [b.z0 + b.h > cap ? { ...b, h: cap - b.z0 } : b];
  });
  const LOOSE = new Set(['tank', 'ac', 'mast', 'sign', 'billboard', 'board-frame', 'hanging-sign']);
  g.props = g.props.filter((p) => !LOOSE.has(p.kind) || p.z0 < capAt(p.x, p.y) - 2 || !spineUnder(p.x, p.y) || p.z0 >= (caps[0]?.deckHeight ?? Infinity));
  fillDistricts(g, city);
  placeEmergency(g, city.styles);
  checkDistricts(g);
  const deepAreas = spines.map((sp) => sp.along.map(([x, y]) => [Math.round((x / 4608) * 1000) / 10, Math.round((y / 3072) * 1000) / 10] as [number, number]));
  return { geometry: g, windows: litWindows(g.buildings, 'windows'), ribbonDistance: toStructure, spineUnder, deepAreas, land };
}

function segDistance(x: number, y: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}

type Owned = { district?: string };
/** Lamp pools reach up to about 170 map px: that far past its edge, water, gaps and shore things go dark with a district. */
const REACH = 170;
/** Items a structure brings run on its own power (the Spine, the Ribbon), whatever they stand over. */
function tag(geo: { buildings: Owned[]; props: Owned[]; strips: Owned[]; curves: Owned[] }, id: string) {
  for (const list of [geo.buildings, geo.props, geo.strips, geo.curves]) for (const it of list) it.district = id;
}

/** The blackout mask's table, and a district on every item still without one: the district its footprint centre
 * stands in, or the nearest within a lamp's reach (a boardwalk on the natural shore, a pier); '' further out. Exact per
 * point: a cached grid would round across the line. */
function fillDistricts(g: Geometry, city: CityData) {
  const bordered = city.map.districts.filter((d) => d.border && d.border.length >= 3);
  g.districts = [
    ...bordered.map((d) => ({ id: d.id, border: d.border!.map((a) => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H] as [number, number]) })),
    { id: 'spine', border: [] },
    { id: 'ribbon', border: [] },
  ];
  g.maskFloor = maskFloor(g.districts, MAP_W, MAP_H, REACH, 8);
  const at = (x: number, y: number) => {
    const i = ownerAt([x, y], g.districts, REACH);
    return i ? g.districts[i - 1]!.id : '';
  };
  for (const b of g.buildings) b.district ||= at(b.x, b.y);
  for (const p of g.props) p.district ||= at(p.x, p.y);
  for (const st of g.strips) st.district ||= st.ends ? at((st.ends[0][0] + st.ends[1][0]) / 2, (st.ends[0][1] + st.ends[1][1]) / 2) : at(st.x, st.y);
  for (const c of g.curves) c.district ||= at(c.points[0]![0], c.points[0]![1]);
}
