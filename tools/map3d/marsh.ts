// The Marsh's failed defences and its bank (2026-10-26). The city tried to save it: a seawall along its bay side, now
// breached, and pump towers along it gone dark but for a red lamp. The Counting House is a drowned bank in its own lagoon,
// Mother Rot's top floors lit, broth on the roof, boats moored at its doors.
import type { DistrictStyle } from '../../shared/city-schema';
import { insideBorder, type Anchor, type Place } from '../../shared/map-schema';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { EMERGENCY_LIGHT, LANDMARK_BACKUP, type Box, type Light, type Prop, type Strip } from './geometry';
import { between, rng } from './rng';

type P = [number, number];
type Flooded = NonNullable<DistrictStyle['flooded']>;
export interface MarshGeometry {
  buildings: Box[];
  props: Prop[];
  strips: Strip[];
  lights: Light[];
  /** From a point to the bank's walls (map px; negative inside): the lagoon round it stays open. */
  distance: (x: number, y: number) => number;
}

export function marshGeometry(district: string, cfg: Flooded, border: Anchor[], places: Place[], onLand: (x: number, y: number) => boolean): MarshGeometry {
  const r = rng(`marsh:${district}`);
  const out: MarshGeometry = { buildings: [], props: [], strips: [], lights: [], distance: () => Infinity };
  const mine = (x: number, y: number) => insideBorder([(x / MAP_W) * 100, (y / MAP_H) * 100], border);
  const pts = border.map((a): P => [(a.x / 100) * MAP_W, (a.y / 100) * MAP_H]);

  // The seawall: along each border edge with open bay outside it, in pieces, a breach every so often, some pieces slumped.
  const wall: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const out1: P = [mx + nx * 14, my + ny * 14], out2: P = [mx - nx * 14, my - ny * 14];
    const outside = mine(out1[0], out1[1]) ? out2 : out1;
    if (onLand(outside[0], outside[1]) || mine(outside[0], outside[1])) continue;
    const ang = Math.atan2(dy, dx);
    for (let t = 0; t + 12 <= len; t += 14) {
      if (r() < 0.22) continue; // breached
      const cx = a[0] + (dx / len) * (t + 6), cy = a[1] + (dy / len) * (t + 6);
      const slumped = r() < 0.25;
      out.strips.push({ x: cx, y: cy, w: 12.5, d: 3, h: slumped ? between(r, 2, 3) : 4.6, z0: -0.6, a: ang + (slumped ? between(r, -0.12, 0.12) : 0), material: 'concrete' });
      wall.push([cx, cy]);
    }
  }
  // Pump towers along the wall, evenly spread: dark, a dim red lamp on each.
  for (let k = 0; k < cfg.pumps && wall.length; k++) {
    const [x, y] = wall[Math.min(wall.length - 1, Math.floor(((k + 0.5) / cfg.pumps) * wall.length))]!;
    const h = between(r, 22, 34);
    out.buildings.push({ x, y, w: 7, d: 7, h, z0: -0.6, a: 0, tint: '#7a5a4a', lit: 0.04, brick: 0, seed: r(), district, kind: 'tower', backup: LANDMARK_BACKUP });
    out.strips.push({ x: x + 4.2, y, w: 1.2, d: 1.2, h: h * 0.8, z0: -0.6, a: 0, material: 'pipe' });
    out.props.push({ kind: 'lamp', x, y, z0: h - 0.6, w: 0.7, d: 0.7, h: 0.7, a: 0, color: '#ff3b3b' });
    // The pumps keep running when the grid goes (blackouts phase 2).
    out.lights.push({ ...EMERGENCY_LIGHT, x, y, z: h + 4 });
  }

  // The Counting House.
  const p = places.find((q) => q.id === cfg.bank.near);
  let bank: { x: number; y: number } | null = null;
  if (p) {
    const B = cfg.bank;
    const [x, y] = [(p.pin[0] / 100) * MAP_W, (p.pin[1] / 100) * MAP_H];
    bank = { x, y };
    out.buildings.push({ x, y, w: B.w, d: B.d, h: B.h, z0: -0.6, a: 0, tint: '#ffcf7a', lit: 0.6, brick: 1, seed: 0.62, district, kind: 'building' });
    // Its old columns across the drowned front, the water up to their knees.
    for (let u = -B.w / 2 + 2; u <= B.w / 2 - 2; u += 4) out.strips.push({ x: x + u, y: y + B.d / 2 + 1.2, w: 1.2, d: 1.2, h: 12, z0: -0.6, a: 0, material: 'concrete' });
    out.strips.push({ x, y: y + B.d / 2 + 1.2, w: B.w, d: 2.4, h: 1.4, z0: 11.4, a: 0, material: 'concrete' });
    // The roof: broth on a fire, lanterns strung round the edge.
    const top = B.h - 0.6;
    out.props.push({ kind: 'barrel', x, y, z0: top, w: 1.6, d: 1.6, h: 1.2, a: 0, color: '#ff7a2a', supply: 'own' });
    for (let k = 0; k < 14; k++) {
      const t = (k / 14) * Math.PI * 2;
      out.props.push({ kind: 'lamp', x: x + Math.cos(t) * (B.w / 2 - 1.2), y: y + Math.sin(t) * (B.d / 2 - 1.2), z0: top + 1.6, w: 0.8, d: 0.8, h: 0.9, a: 0, color: k % 3 ? '#ffb347' : '#ff6a3a', supply: 'own' });
    }
    out.lights.push({ x, y, z: top + 4, color: '#ffb347', power: 45000, radius: 3, reach: 55, supply: 'own' });
    // Boats moored at its doors.
    for (let k = 0; k < 5; k++) {
      const bx = x + between(r, -B.w / 2, B.w / 2), by = y + B.d / 2 + between(r, 4, 9);
      out.strips.push({ x: bx, y: by, w: between(r, 3.5, 5.5), d: 1.5, h: 0.7, z0: -0.5, a: between(r, -0.4, 0.4), material: 'concrete' });
      out.props.push({ kind: 'lamp', x: bx, y: by, z0: 0.6, w: 0.5, d: 0.5, h: 0.6, a: 0, color: '#ffb347', supply: 'own' });
    }
    out.lights.push({ x, y: y + B.d / 2 + 6, z: 2, color: '#ffb347', power: 12000, radius: 2, reach: 35, supply: 'own' });
  }
  out.distance = (x, y) => (bank ? Math.max(Math.abs(x - bank.x) - cfg.bank.w / 2, Math.abs(y - bank.y) - cfg.bank.d / 2) : Infinity);
  return out;
}
