/** A city of named rooms with no scene files behind them, for tests that only need names. */
import type { SceneDef } from '../../../shared/types';
import type { RoomRegistry } from '../../src/rooms';

export const CITY = ['default/rooftop', 'default/workspace', 'karasu/lowlight-intake', 'karasu/nix-apartment', 'karasu/noodle-stall', 'karasu/ribbon-rooftop'];

export function fakeRooms(names: string[] = CITY): RoomRegistry {
  const sorted = [...names].sort();
  const def = (id: string) => {
    const [district, folder] = id.split('/') as [string, string];
    return { id, district, folder, name: folder, description: '', resolution: [480, 270], layers: [], lights: [], presets: {} } as unknown as SceneDef;
  };
  return {
    get: (id) => (sorted.includes(id) ? def(id) : undefined),
    list: () => sorted.map(def),
    first: () => def(sorted[0]!),
    has: (id) => sorted.includes(id),
    resolve: (name) => (sorted.includes(name) ? { ok: true, id: name } : { ok: false, error: `no room '${name}'` }),
    inDistrict: (d) => sorted.filter((n) => n.startsWith(`${d}/`)),
    names: () => [...sorted],
  };
}
