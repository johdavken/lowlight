import { describe, expect, it } from 'vitest';
import type { CityMapData, Place } from '../../shared/map-schema';
import type { ResidentInfo, SceneDef } from '../../shared/types';
import { mapWho, type MapWhoInputs } from '../src/ui/map/who';

const place = (id: string, scene: string, extra: Partial<Place> = {}): Place => ({ id, name: id, district: 'karasu', pin: [0, 0], scene, ...extra });
const map = (places: Place[]): CityMapData => ({ version: 1, image: 'm.webp', districts: [], places });
const room = (id: string, exits: string[] = [], resident?: string): SceneDef =>
  ({ id, name: id, district: 'karasu', exits: exits.map((to) => ({ to, way: 'in' })), ...(resident ? { resident: { character: resident, scale: 0.8 } } : {}) }) as unknown as SceneDef;
const res = (id: string): ResidentInfo => ({ id, name: id.toUpperCase(), pronoun: 'she', accent: '#fff', sprite: { src: 'x.png' }, thumb: `/t/${id}` }) as unknown as ResidentInfo;

// A pinned street, a side place off it, an exit-only room behind that, and a side place no exit reaches.
const m = map([place('street', 'k/street'), place('orchid', 'k/orchid', { side: true }), place('lost', 'k/lost', { side: true })]);
const rooms = [room('k/street', ['k/orchid'], 'hae'), room('k/orchid', ['k/street', 'k/upstairs'], 'vesna'), room('k/upstairs', ['k/orchid'], 'tilly'), room('k/lost', [], 'ines')];
const base = (sceneId: string | null): MapWhoInputs => ({
  map: m,
  rooms,
  sceneId,
  residents: { hae: res('hae'), vesna: res('vesna'), tilly: res('tilly'), ines: res('ines') },
  player: { id: 'hicks', name: 'Hicks' },
  contact: { id: 'nix', name: 'Nix', accent: '#ff4f8b' },
  busy: false,
  gigBlock: null,
});
const at = (w: ReturnType<typeof mapWho>) => Object.fromEntries(w.people.map((p) => [p.id, [p.place, p.room]]));

describe('mapWho', () => {
  it('residents stand at their pin: in a pinned room, a side place, or a room further in; one no exit reaches is left out', () => {
    const w = mapWho(base(null));
    expect(at(w)).toEqual({ hae: ['street', 'k/street'], vesna: ['street', 'k/orchid'], tilly: ['street', 'k/upstairs'] });
    expect(w.here).toBeUndefined();
    expect(w.inside!.street.map((r) => r.room)).toEqual(['k/orchid']);
  });

  it('you and your contact at a pin: here, not away, in that room', () => {
    const w = mapWho(base('k/street'));
    expect(w.here).toBe('street');
    expect(w.away).toBeUndefined();
    expect(at(w).hicks).toEqual(['street', 'k/street']);
    expect(at(w).nix).toEqual(['street', 'k/street']);
  });

  it('in a room two steps in, you stand at its pin, away, in that room', () => {
    const w = mapWho(base('k/upstairs'));
    expect(w.here).toBe('street');
    expect(w.away).toBe(true);
    expect(at(w).hicks).toEqual(['street', 'k/upstairs']);
  });

  it('without a persona you are "You", with no face', () => {
    const w = mapWho({ ...base('k/street'), player: null });
    expect(w.people.find((p) => p.role === 'you')).toMatchObject({ id: 'you', name: 'You', face: null });
  });
});
