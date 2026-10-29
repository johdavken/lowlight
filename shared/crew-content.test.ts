import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HIREABLE, parseCrewBook } from './crew-book';
import { parseExtras } from './extras';

// The shipped crew content (crew spec §7): it parses clean and has enough of everything to draw from.
const read = (f: string) => fs.readFileSync(`world/crew/${f}.md`, 'utf8');
const { book, problems } = parseCrewBook({ names: read('names'), traits: read('traits'), pitches: read('pitches'), errands: read('errands') });

describe('world/crew', () => {
  it('parses with no problems', () => {
    expect(problems).toEqual([]);
  });
  it('names: at least 20 per origin district, none twice in a district', () => {
    for (const d of ['karasu', 'velvet', 'strand', 'tidal', 'marsh', 'drownworks']) {
      expect(book.names[d]?.length ?? 0).toBeGreaterThanOrEqual(20);
      expect(new Set(book.names[d]).size).toBe(book.names[d].length);
    }
  });
  it('traits: 4+ per hireable specialty (2+ good, 1+ bad), 6+ any, every effect kind used', () => {
    for (const s of HIREABLE) {
      const own = book.traits.filter((t) => t.for !== 'any' && t.for.includes(s));
      expect(own.length).toBeGreaterThanOrEqual(4);
      expect(own.filter((t) => t.good).length).toBeGreaterThanOrEqual(2);
      expect(own.filter((t) => !t.good).length).toBeGreaterThanOrEqual(1);
    }
    expect(book.traits.filter((t) => t.for === 'any').length).toBeGreaterThanOrEqual(6);
    expect(new Set(book.traits.map((t) => t.effect.kind)).size).toBe(8);
  });
  it('pitches: 2+ per specialty per grade', () => {
    for (const s of HIREABLE) for (const g of [0, 1, 2, 3]) expect(book.pitches[`${s}:${g}`]?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
  it('errands: the six phase 1 kinds, 2+ lines per band', () => {
    expect(book.errands.map((e) => e.kind)).toEqual(['hustle', 'collect', 'lay-low', 'case', 'records', 'scout']);
    for (const e of book.errands) for (const b of ['clean', 'messy', 'blown'] as const) expect(e.bands[b].lines.length).toBeGreaterThanOrEqual(2);
  });
  it('the shipped map hires at the three places', () => {
    const map = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')) as { places: { id: string; hires?: string[] }[] };
    const hires = Object.fromEntries(map.places.filter((p) => p.hires).map((p) => [p.id, p.hires]));
    expect(hires).toEqual({ 'low-roller': ['face', 'fence'], 'pump-house-nine': ['muscle', 'ears'], 'second-socket': ['wire', 'runner'] });
  });
  it('crew faces in extras: 8+ each for runner, face, muscle and fence', () => {
    const r = parseExtras(JSON.parse(fs.readFileSync('world/extras/extras.json', 'utf8')));
    if (!r.ok) throw new Error(r.message);
    for (const s of ['runner', 'face', 'muscle', 'fence', 'ears', 'wire']) expect(r.extras.filter((e) => e.tags.includes('crew') && e.tags.includes(s)).length).toBeGreaterThanOrEqual(8);
  });
});
