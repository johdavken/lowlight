import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cityDataHash } from './city-hash';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const map = () => {
  const m = JSON.parse(readFileSync('map/lowlight.json', 'utf8'));
  // A sign and a traffic path of its own (the live map may have none).
  m.ambience.signs = [{ at: [10, 10], color: '#ff4fd8', mode: 'pulse', size: 2 }];
  m.ambience.traffic = [{ kind: 'cars', path: [[10, 10], [20, 12]], every: 5, speed: 1 }];
  return m;
};
const files = [{ name: 'render.json', text: '{"a":1}' }];
const v = { generator: '1', render: '1' };

describe('cityDataHash', () => {
  it('changes when a pin moves, not when a sign speeds up', () => {
    const base = cityDataHash(map(), files, v, sha);
    const moved = map();
    moved.places[0].pin[0] += 1;
    expect(cityDataHash(moved, files, v, sha)).not.toBe(base);
    const faster = map();
    faster.ambience.signs[0].speed = 3;
    faster.ambience.traffic[0].every = 99;
    expect(cityDataHash(faster, files, v, sha)).toBe(base);
  });
  it("a district's name moving leaves the render current; even the Bay's (district names spec)", () => {
    const base = cityDataHash(map(), files, v, sha);
    const named = map();
    const k = named.districts.findIndex((d: { id: string }) => d.id === 'karasu');
    named.districts[k].label = [10, 10];
    named.districts[k].lettering = { from: [5, 10], to: [15, 10], bend: 2, size: 3 };
    expect(cityDataHash(named, files, v, sha)).toBe(base);
    // The water starts from its own point, not the Bay's label: no label reaches the render.
    const bay = map();
    bay.districts.find((d: { id: string }) => d.id === 'bay').label = [40, 70];
    expect(cityDataHash(bay, files, v, sha)).toBe(base);
  });
  it("a district's blackout rate leaves the render current (blackouts phase 3: the game reads it, the renderer never)", () => {
    const style = (outage: number) => [{ name: 'districts/marsh.json', text: JSON.stringify({ height: [1, 2], blackout: { backup: 0.01, roofLights: 0, fires: 14, outage } }, null, 2) }];
    expect(cityDataHash(map(), style(0.5), v, sha)).toBe(cityDataHash(map(), style(0.25), v, sha));
    const fires = [{ name: 'districts/marsh.json', text: JSON.stringify({ height: [1, 2], blackout: { backup: 0.01, roofLights: 0, fires: 9, outage: 0.25 } }, null, 2) }];
    expect(cityDataHash(map(), fires, v, sha)).not.toBe(cityDataHash(map(), style(0.25), v, sha));
  });
  it('changes with a city file or the render version', () => {
    const base = cityDataHash(map(), files, v, sha);
    expect(cityDataHash(map(), [{ name: 'render.json', text: '{"a":2}' }], v, sha)).not.toBe(base);
    expect(cityDataHash(map(), files, { ...v, render: '2' }, sha)).not.toBe(base);
  });
});
