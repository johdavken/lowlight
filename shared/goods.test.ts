import { describe, expect, it } from 'vitest';
import { collectOffers, isStale, nightsLeft, parseGoods, salePrice, wantedFor, type GoodsKind, type Lot } from './goods';

const data: GoodsKind = { id: 'data', label: 'Data', route: 'runner', value: 380 };
const lot: Lot = { id: 's1', kind: 'data', value: 380, day: 0, district: 'strand' };

describe('salePrice (crew goods spec §3)', () => {
  it('the right route pays full', () => expect(salePrice({ lot, goods: data, spec: 'runner', wanted: false, day: 0 })).toBe(380));
  it('a fence pays 80 % on any kind', () => expect(salePrice({ lot, goods: data, spec: 'fence', wanted: false, day: 0 })).toBe(300));
  it('a fence on its own kind pays full', () => expect(salePrice({ lot, goods: { ...data, route: 'fence' }, spec: 'fence', wanted: false, day: 0 })).toBe(380));
  it('the wrong route pays 60 %', () => expect(salePrice({ lot, goods: data, spec: 'muscle', wanted: false, day: 0 })).toBe(230));
  it('wanted +50 %', () => expect(salePrice({ lot, goods: data, spec: 'runner', wanted: true, day: 0 })).toBe(570));
  it('damaged 70 %', () => expect(salePrice({ lot: { ...lot, damaged: true }, goods: data, spec: 'runner', wanted: false, day: 0 })).toBe(270));
  it('stale 60 % from the fourth night', () => {
    expect(salePrice({ lot, goods: data, spec: 'runner', wanted: false, day: 3 })).toBe(380);
    expect(salePrice({ lot, goods: data, spec: 'runner', wanted: false, day: 4 })).toBe(230);
  });
  it('all of them together', () => expect(salePrice({ lot: { ...lot, damaged: true }, goods: data, spec: 'muscle', wanted: true, day: 4 })).toBe(140));
  it('full-route takes the right route price', () => expect(salePrice({ lot, goods: data, spec: 'muscle', wanted: false, day: 0, fullRoute: true })).toBe(380));
  it('a trait pay applies', () => expect(salePrice({ lot, goods: data, spec: 'runner', wanted: false, day: 0, payPct: 20 })).toBe(460));
});

describe('staleness', () => {
  it('stale after three nights, and stays stale', () => expect([3, 4, 9].map((d) => isStale(lot, d))).toEqual([false, true, true]));
  it('nights left, floored at 0', () => expect([0, 3, 9].map((d) => nightsLeft(lot, d))).toEqual([3, 0, 0]));
});

describe('wantedFor (crew goods spec §4)', () => {
  const o = { seed: 'pt', districts: ['strand', 'karasu', 'marsh'], kinds: ['data', 'pharma', 'parts', 'luxuries', 'contraband'] };
  it('one kind a district, the same for a seed and day', () => {
    expect(Object.keys(wantedFor({ ...o, day: 5 })).sort()).toEqual(['karasu', 'marsh', 'strand']);
    expect(wantedFor({ ...o, day: 5 })).toEqual(wantedFor({ ...o, day: 5 }));
  });
  it('never the same kind two nights running in a district', () => {
    for (let d = 1; d < 40; d++) for (const x of o.districts) expect(wantedFor({ ...o, day: d })[x]).not.toBe(wantedFor({ ...o, day: d - 1 })[x]);
  });
  it('a new district does not move the others', () => {
    expect(wantedFor({ ...o, day: 7 }).strand).toBe(wantedFor({ ...o, districts: ['strand'], day: 7 }).strand);
  });
  it('no kinds, nothing', () => expect(wantedFor({ ...o, kinds: [], day: 1 })).toEqual({}));
});

describe('collectOffers (crew goods spec §2)', () => {
  const missions = ['a', 'b', 'c', 'd', 'e', 'f'].map((kind) => ({ kind, gives: ['data', 'pharma'] }));
  const o = { seed: 'pt', missions, districts: ['strand', 'karasu'] };
  it('three in two districts, two in one, none in none', () => {
    expect(collectOffers({ ...o, day: 1 })).toHaveLength(3);
    expect(collectOffers({ ...o, districts: ['strand'], day: 1 })).toHaveLength(2);
    expect(collectOffers({ ...o, districts: [], day: 1 })).toEqual([]);
  });
  it('the same for a seed and day, each mission once, in a known district', () => {
    const list = collectOffers({ ...o, day: 4 });
    expect(list).toEqual(collectOffers({ ...o, day: 4 }));
    expect(new Set(list.map((x) => x.kind)).size).toBe(3);
    for (const x of list) expect(o.districts).toContain(x.district);
  });
  it('no mission heads the list two nights running', () => {
    for (let d = 1; d < 30; d++) expect(collectOffers({ ...o, day: d })[0].kind).not.toBe(collectOffers({ ...o, day: d - 1 })[0].kind);
  });
});

describe('parseGoods', () => {
  const block = (o = '') => `---\nkind: data\nlabel: Data\nroute: runner\nvalue: 380\n${o}---\n`;
  it('reads a block', () => {
    const problems: string[] = [];
    expect(parseGoods(block('art: data.webp\n'), problems)).toEqual([{ id: 'data', label: 'Data', route: 'runner', value: 380, art: 'data.webp' }]);
    expect(problems).toEqual([]);
  });
  it('reports a bad route and a bad value', () => {
    const problems: string[] = [];
    expect(parseGoods(block().replace('runner', 'pilot'), problems)).toEqual([]);
    expect(parseGoods(block().replace('380', 'lots'), problems)).toEqual([]);
    expect(problems).toEqual(['goods: data: route must be a specialty you can hire', 'goods: data: value must be a number above 0']);
  });
});
