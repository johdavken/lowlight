import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HIREABLE, parseCrewBook, TIMING } from './crew-book';
import { parseExtras } from './extras';

// The shipped crew content (crew spec §7): it parses clean and has enough of everything to draw from.
const read = (f: string) => fs.readFileSync(`world/crew/${f}.md`, 'utf8');
const { book, problems } = parseCrewBook({ names: read('names'), traits: read('traits'), pitches: read('pitches'), errands: read('errands'), abilities: read('abilities'), goods: read('goods') });

describe('world/crew', () => {
  it('parses with no problems', () => {
    expect(problems).toEqual([]);
  });
  it('the ability pass: the GREEN and HAND abilities carry the spec\'s effects', () => {
    const want: Record<string, string[]> = {
      'setup-position': ['second-look', 'loop-the-cams'],
      'setup-die': ['word-on-the-street', 'cover-story'],
      'greed-effect': ['lean-on-them'],
      'greed-die': ['read-the-room', 'spoof'],
      'gamble-cost': ['hold-the-door'],
      'gamble-miss': ['heard-it-first', 'quiet-word'],
      'trade-alarm': ['log-wipe', 'smooth-it-over'],
      'trade-nerve': ['patient-wire', 'steady-talk'],
      'end-take': ['quick-sale'],
      'end-cool': ['spread-it-thin'],
    };
    for (const [kind, ids] of Object.entries(want)) expect(book.abilities.filter((a) => a.job.kind === kind).map((a) => a.id).sort()).toEqual([...ids].sort());
    // Every GREEN and HAND ability is one of them; fences are never ON A ROLL (spec §1).
    expect(book.abilities.filter((a) => a.from <= 1).length).toBe(16);
    for (const a of book.abilities.filter((x) => x.from <= 1)) expect(Object.keys(want)).toContain(a.job.kind);
    for (const a of book.abilities.filter((x) => x.from <= 1 && x.for !== 'any' && x.for.includes('fence'))) expect(TIMING[a.job.kind]).not.toBe('roll');
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
  it('errands: goods, heat and groundwork, 2+ lines per band', () => {
    expect(book.errands.filter((e) => !e.retired).map((e) => e.kind)).toEqual(['lay-low', 'pull-drive', 'hear-it', 'talk-it-out', 'lift-crate', 'buy-cheap', 'call-debt', 'sell', 'groundwork']);
    for (const e of book.errands) for (const b of ['clean', 'messy', 'blown'] as const) expect(e.bands[b].lines.length).toBeGreaterThanOrEqual(2);
  });
  it('five hireable specialties, seven runner abilities', () => {
    expect(HIREABLE).toEqual(['runner', 'ears', 'face', 'fence', 'muscle']);
    expect(book.abilities.filter((a) => a.for !== 'any' && a.for.includes('runner')).map((a) => a.id).sort()).toEqual(['clean-exit', 'log-wipe', 'lookout', 'loop-the-cams', 'patient-wire', 'run-it-twice', 'spoof']);
  });
  it('every collect mission gives goods that exist, and each kind has a route', () => {
    const ids = book.goods!.map((g) => g.id);
    expect(ids).toEqual(['data', 'pharma', 'parts', 'luxuries', 'contraband']);
    for (const e of book.errands.filter((x) => x.group === 'collect')) for (const g of e.gives!) expect(['any', ...ids]).toContain(g);
  });
  it('two traits are rules', () => {
    expect(book.traits.find((t) => t.id === 'knows-trains')).toMatchObject({ effect: { kind: 'hours', pct: -33 }, also: { kind: 'sells-anywhere' } });
    expect(book.traits.find((t) => t.id === 'old-buyers')).toMatchObject({ effect: { kind: 'odds', errand: 'hustle', delta: 10 }, also: { kind: 'full-route' } });
  });
  it('every trait bonus names an errand that exists', () => {
    const kinds = new Set(['any', ...book.errands.filter((e) => !e.retired).flatMap((e) => [e.kind, ...(e.group ? [e.group] : [])])]);
    const effects = book.traits.map((t) => t.effect);
    const named = effects.flatMap((e) => (e.kind === 'odds' || e.kind === 'pay' ? [e.errand] : []));
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((k) => !kinds.has(k))).toEqual([]);
  });
  it('the shipped map hires at the four places', () => {
    const map = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')) as { places: { id: string; hires?: string[] }[] };
    const hires = Object.fromEntries(map.places.filter((p) => p.hires).map((p) => [p.id, p.hires]));
    expect(hires).toEqual({ 'long-haul': ['runner', 'muscle'], 'low-roller': ['face', 'fence'], 'pump-house-nine': ['muscle', 'ears'], 'second-socket': ['runner'] });
  });
  it('crew faces in extras: 8+ each for runner, face, muscle and fence', () => {
    const r = parseExtras(JSON.parse(fs.readFileSync('world/extras/extras.json', 'utf8')));
    if (!r.ok) throw new Error(r.message);
    for (const s of ['runner', 'face', 'muscle', 'fence', 'ears']) expect(r.extras.filter((e) => e.tags.includes('crew') && e.tags.includes(s)).length).toBeGreaterThanOrEqual(8);
  });
  it('abilities: 5 per hireable specialty, 7 for a runner, save only at VET, no again on a fence', () => {
    for (const s of HIREABLE) expect(book.abilities.filter((a) => a.for !== 'any' && a.for.includes(s)).length).toBe(s === 'runner' ? 7 : 5);
    for (const a of book.abilities.filter((x) => x.job.kind === 'save')) expect(a.from).toBe(3);
    expect(book.abilities.filter((a) => a.for !== 'any' && a.for.includes('fence') && a.job.kind === 'again')).toEqual([]);
  });
});
