import { describe, expect, it } from 'vitest';
import { labelText, layoutTiles, orderTiles, stepVertical } from '../src/landing/district-groups';
import { RANDOM } from '../src/landing/select-flow';

const e = (id: string, group: string | null, connected = true) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), connected, group });
const CAST = [
  e('hicks', 'karasu'), e('cass', 'karasu'), e('ember', 'karasu'), e('nix-direct', 'karasu'), e('silas', 'karasu'),
  e('soren', 'spine'), e('rue', 'spine'), e('adebayo', 'spine'),
  e('mother-rot', 'marsh'), e('ines', 'drownworks'),
];
const groupOf = (entries: ReturnType<typeof e>[]) => {
  const m = new Map(entries.map((x) => [x.id, x.group]));
  return (id: string) => m.get(id) ?? null;
};

describe('orderTiles', () => {
  it('RANDOM, then groups largest first (ties by district id), names within a group', () => {
    expect(orderTiles(CAST)).toEqual([RANDOM, 'cass', 'ember', 'hicks', 'nix-direct', 'silas', 'adebayo', 'rue', 'soren', 'ines', 'mother-rot']);
  });

  it('inside a group the connected come first; no group goes last', () => {
    const order = orderTiles([e('zed', 'karasu'), e('amy', 'karasu', false), e('solo', null), e('bo', 'karasu')]);
    expect(order).toEqual([RANDOM, 'bo', 'zed', 'amy', 'solo']);
  });
});

describe('layoutTiles', () => {
  it("today's cast: RANDOM and Karasu on row 0, the Spine, Drownworks and the Marsh on row 1", () => {
    const ids = orderTiles(CAST);
    const l = layoutTiles(ids, groupOf(CAST), 6);
    const at = (id: string) => l.pos[ids.indexOf(id)];
    expect(at(RANDOM)).toEqual({ col: 0, row: 0 });
    expect(['cass', 'ember', 'hicks', 'nix-direct', 'silas'].map(at)).toEqual([1, 2, 3, 4, 5].map((col) => ({ col, row: 0 })));
    expect(['adebayo', 'rue', 'soren'].map(at)).toEqual([0, 1, 2].map((col) => ({ col, row: 1 })));
    expect(at('ines')).toEqual({ col: 3, row: 1 });
    expect(at('mother-rot')).toEqual({ col: 4, row: 1 });
    expect(l.rows).toBe(2);
    expect(l.labels).toEqual([
      { group: 'karasu', col: 1, row: 0, span: 5 },
      { group: 'spine', col: 0, row: 1, span: 3 },
      { group: 'drownworks', col: 3, row: 1, span: 1 },
      { group: 'marsh', col: 4, row: 1, span: 1 },
    ]);
  });

  it('a group that does not fit what is left of a row starts the next one', () => {
    const cast = [e('a', 'x'), e('b', 'x'), e('c', 'x'), e('d', 'y'), e('f', 'y'), e('g', 'y')];
    const ids = orderTiles(cast); // RANDOM, a b c (x), d f g (y)
    const l = layoutTiles(ids, groupOf(cast), 6);
    expect(l.pos.map((p) => `${p.row}:${p.col}`)).toEqual(['0:0', '0:1', '0:2', '0:3', '1:0', '1:1', '1:2']);
  });

  it('a group wider than a row wraps, labelled on its first row only', () => {
    const big = 'abcdefgh'.split('').map((c) => e(c, 'karasu'));
    const ids = orderTiles(big);
    const l = layoutTiles(ids, groupOf(big), 6);
    expect(l.pos.map((p) => `${p.row}:${p.col}`)).toEqual(['0:0', '1:0', '1:1', '1:2', '1:3', '1:4', '1:5', '2:0', '2:1']);
    expect(l.labels).toEqual([{ group: 'karasu', col: 0, row: 1, span: 6 }]);
    expect(l.rows).toBe(3);
  });

  it('with no groups at all, tiles flow on from RANDOM in rows as before', () => {
    const cast = 'abcdefg'.split('').map((c) => e(c, null));
    const l = layoutTiles(orderTiles(cast), groupOf(cast), 6);
    expect(l.pos.map((p) => `${p.row}:${p.col}`)).toEqual(['0:0', '0:1', '0:2', '0:3', '0:4', '0:5', '1:0', '1:1']);
    expect(l.labels).toEqual([]);
  });

  it('the no-group run gets no label', () => {
    const cast = [e('a', 'x'), e('b', null)];
    const l = layoutTiles(orderTiles(cast), groupOf(cast), 6);
    expect(l.labels.map((x) => x.group)).toEqual(['x']);
  });
});

describe('stepVertical', () => {
  const ids = orderTiles(CAST);
  const l = layoutTiles(ids, groupOf(CAST), 6);
  const i = (id: string) => ids.indexOf(id);

  it('moves to the nearest column in the row below or above', () => {
    expect(ids[stepVertical(l, i('hicks'), 'down')]).toBe('ines'); // c3 → c3
    expect(ids[stepVertical(l, i('silas'), 'down')]).toBe('mother-rot'); // c5 → nearest c4
    expect(ids[stepVertical(l, i('rue'), 'up')]).toBe('cass'); // c1 → c1
    expect(ids[stepVertical(l, i('adebayo'), 'up')]).toBe(RANDOM); // c0 → c0
  });

  it('stays put with no row there', () => {
    expect(stepVertical(l, i('hicks'), 'up')).toBe(i('hicks'));
    expect(stepVertical(l, i('rue'), 'down')).toBe(i('rue'));
  });

  it('picks the nearest column when the row below is short', () => {
    const cast = [e('a', 'x'), e('b', 'x'), e('c', 'x'), e('d', 'x'), e('f', 'x'), e('g', 'y'), e('h', 'y')];
    const ids2 = orderTiles(cast);
    const l2 = layoutTiles(ids2, groupOf(cast), 6);
    // row 1 has g c0, h c1; from c? nothing to tie here — build one: from b (c2) down → nearest is h (c1)
    expect(ids2[stepVertical(l2, ids2.indexOf('b'), 'down')]).toBe('h');
  });
});

describe('labelText', () => {
  it('upper case; a leading The dropped on a one-tile group', () => {
    expect(labelText('The Marsh', 1)).toBe('MARSH');
    expect(labelText('The Spine', 3)).toBe('THE SPINE');
    expect(labelText('Karasu', 5)).toBe('KARASU');
  });
});
