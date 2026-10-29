import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityMapData } from '../../shared/map-schema';
import { CityMap, type WhoIsWhere } from '../src/ui/map/city-map';
import { mountCommsInset } from '../src/room/comms-inset';
import { WhosHere } from '../src/room/whos-here';
import { mountInput } from '../src/ui/input';
import { setHerPronoun } from '../src/room/her-copy';

setHerPronoun('she');
const sq = (x: number, y: number) => [
  { x, y, i: null, o: null },
  { x: x + 10, y, i: null, o: null },
  { x: x + 10, y: y + 10, i: null, o: null },
];
const MAP: CityMapData = {
  version: 1,
  image: '/map/x.webp',
  districts: [{ id: 'a', name: 'Aye', area: 'Area A', label: [10, 10], border: sq(5, 5) }],
  places: [
    { id: 'a1', name: 'A one', district: 'a', pin: [7, 7], scene: 'p/a1' },
    { id: 'a2', name: 'A two', district: 'a', pin: [9, 9], scene: 'p/a2' },
  ],
};

let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('the map on comms (spec 2026-10-20 §1)', () => {
  const strip = (comms: WhoIsWhere['comms'], onTravel = vi.fn()) => {
    const cm = new CityMap(host, { onTravel });
    cm.render(MAP, { here: 'a2', people: [], ...(comms ? { comms } : {}) });
    cm.openDistrict('a', 'a1');
    return { cm, onTravel, go: () => [...host.querySelectorAll<HTMLButtonElement>('.map-strip .go, .map-strip .go-comms')] };
  };
  it('with a deal and not on comms: WITH HER and ON COMMS', () => {
    const s = strip({ on: false, can: true });
    expect(s.go().map((b) => b.textContent)).toEqual(['WITH HER', 'ON COMMS']);
    host.querySelector<HTMLButtonElement>('.map-strip .go-comms')!.click();
    expect(s.onTravel).toHaveBeenCalledWith('a1', true);
    host.querySelector<HTMLButtonElement>('.map-strip .go')!.click();
    expect(s.onTravel).toHaveBeenLastCalledWith('a1');
    s.cm.dispose();
  });
  it('I2: at the place she already is, a plain GO', () => {
    const s = strip({ on: false, can: true, herAt: 'p/a1' });
    expect(s.go().map((b) => b.textContent)).toEqual(['GO']);
    s.cm.dispose();
  });
  it('without a deal, or already on comms: one GO', () => {
    const none = strip({ on: false, can: false });
    expect(none.go().map((b) => b.textContent)).toEqual(['GO']);
    none.cm.dispose();
    host.innerHTML = '';
    const on = strip({ on: true, can: true });
    expect(on.go().map((b) => b.textContent)).toEqual(['GO']);
    on.cm.dispose();
  });
});

describe('the comms inset (mockup C)', () => {
  it('her face on the old monitor, ON COMMS · where she is; gone with null', () => {
    const inset = mountCommsInset(host);
    inset.show({ name: 'Nix', face: '/api/agents/nix-direct/sprite', where: 'Lowlight Intake', accent: '#ff4fa3' });
    expect(host.querySelector('.ci-cap')!.textContent).toBe('ON COMMS · LOWLIGHT INTAKE');
    expect(host.querySelector('.ci-face')).not.toBeNull();
    inset.show(null);
    expect(host.querySelector('.ci')).toBeNull();
  });
});

describe('the party and LEAVE on comms', () => {
  it('her role reads ON COMMS', () => {
    const party = new WhosHere(host, { reducedMotion: true });
    party.setParty({ name: 'Hicks', accent: '#3dff7a', thumb: null }, { name: 'Nix', accent: '#ff4f8b', thumb: null }, { comms: true });
    expect([...host.querySelectorAll('.wh-role')].map((r) => r.textContent)).toContain('ON COMMS');
    party.dispose();
  });
  it('LEAVE reads HANG UP while on comms', () => {
    const input = mountInput(host, () => {});
    input.setComms(true);
    expect(host.querySelector('.key[data-key="leave"] .lb')!.textContent).toBe('HANG UP');
    expect(host.querySelector<HTMLElement>('.key[data-key="dice"]')!.classList.contains('comms-off')).toBe(true);
    input.setComms(false);
    expect(host.querySelector('.key[data-key="leave"] .lb')!.textContent).toBe('LEAVE');
    expect(host.querySelector<HTMLElement>('.key[data-key="dice"]')!.classList.contains('comms-off')).toBe(false);
  });
});

describe('the QUEST row for a desk job', async () => {
  const { mountQuestList } = await import('../src/room/quest-list');
  it("NIX'S CLIENT · COMMS · THE FERRY STAIRS · 50–120 SOL · TRUST", () => {
    mountQuestList(host, { onStart: vi.fn() }).show({ open: [{ id: 'out-by-water', title: 'Out by Water', pitch: null, timed: false, mission: { pay: null, tier: 1, range: [50, 120], own: 'Nix', trust: true, comms: 'The Ferry Stairs' } }], active: null, changed: null, waiting: null, elsewhere: [] });
    expect(host.querySelector('.ql-mission')!.textContent).toBe("NIX'S CLIENT · COMMS · THE FERRY STAIRS · 50–120 SOL · TRUST");
  });
});

describe('the waiting card for a desk job', async () => {
  const { waitWhen } = await import('../src/room/quest-cards');
  it('I4: says ON COMMS', () => {
    expect(waitWhen({ id: 'x', title: 'X', next: 'n', at: 'The Ferry Stairs', from: null, by: null, ready: false, here: false, comms: true }, 0)).toContain('ON COMMS');
  });
});
