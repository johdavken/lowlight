import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CityMapData } from '../../shared/map-schema';
import { CityMap, type WhoIsWhere } from '../src/ui/map/city-map';
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
    { id: 'a2', name: 'A two', district: 'a', pin: [9, 9] },
  ],
};
const who = (extra: Partial<WhoIsWhere> = {}): WhoIsWhere => ({ here: 'a2', people: [], ...extra });

let host: HTMLElement;
let cm: CityMap;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  cm?.dispose();
  host.remove();
});
const pin = (id: string) => host.querySelector(`.pin[data-place="${id}"]`)!;

describe('job markers on the map', () => {
  it('marked pins carry job-mark; the strip shows the line; marks clear when the job ends', () => {
    cm = new CityMap(host, { onTravel: () => {} });
    cm.render(MAP, who({ jobMarks: { a1: 'the courier came through here' } }));
    expect(pin('a1').querySelector('.job-mark')).not.toBeNull();
    expect(pin('a2').querySelector('.job-mark')).toBeNull();
    cm.openDistrict('a', 'a1');
    expect(host.querySelector('.map-strip .job-line')!.textContent).toBe('◆ the courier came through here');
    cm.update(MAP, who());
    expect(pin('a1').querySelector('.job-mark')).toBeNull();
  });
});
