import { describe, expect, it } from 'vitest';
import { sinceLine, wordLine, beatWindow, dueBeat, firstBeat, forBranch, goingAt, herWindow, keepMoves, lastGoing, LINE_CLIP, pruneOld, standing, undoBeats, type Move, type MoverCheck } from './moves';

const mv = (beat: number, who = 'rue', extra: Partial<Move> = {}): Move => ({ beat, at: beat - 20, who, line: 'x', place: 'tilt', ...extra });

describe('beat timing', () => {
  it('the first beat is the first even hour after the start', () => {
    expect(firstBeat(1200)).toBe(1320);
    expect(firstBeat(1260)).toBe(1320);
    expect(firstBeat(1320)).toBe(1440);
  });

  it('a beat is due once the clock reaches it, once', () => {
    expect(dueBeat(1310, null, 1200)).toBeNull();
    expect(dueBeat(1325, null, 1200)).toBe(1320);
    expect(dueBeat(1325, 1320, 1200)).toBeNull();
    // A WAIT to 03:00 on day 2 crosses several marks: one beat, the newest.
    expect(dueBeat(1440 + 180, 1320, 1200)).toBe(1440 + 120);
  });

  it('a window runs from the last beat, capped at 8 hours', () => {
    expect(beatWindow(1440 + 120, 1320, 1200)).toEqual({ from: 1320, to: 1560 });
    const beat = 1200 + 600;
    expect(beatWindow(beat, null, 1200).from).toBe(beat - 480);
    expect(beatWindow(1320, null, 1200)).toEqual({ from: 1200, to: 1320 });
  });

  it('her window starts at the parting, across midnight, and short ones drop', () => {
    expect(herWindow({ from: 1380, to: 1620 }, 1500)).toEqual({ from: 1500, to: 1620 });
    expect(herWindow({ from: 1380, to: 1620 }, 1600)).toBeNull();
    expect(herWindow({ from: 1380, to: 1620 }, undefined)).toEqual({ from: 1380, to: 1620 });
    expect(herWindow({ from: 1380, to: 1620 }, 1000)).toEqual({ from: 1380, to: 1620 });
  });
});

describe('storage rules', () => {
  const a = mv(1320);
  const b = mv(1440);

  it('only moves whose beat the clock has reached stand', () => {
    expect(standing([a, b], 1400)).toEqual([a]);
    expect(standing([a, b], 1440)).toEqual([a, b]);
  });

  it('undoing drops beats later than the clock', () => {
    expect(undoBeats([a, b], 1400)).toEqual({ moves: [a], beat: 1320 });
    expect(undoBeats([a, b], 1300)).toEqual({ moves: [], beat: null });
  });

  it('a branch keeps what stood at its line', () => {
    expect(forBranch({ moves: [a, b], beat: 1440, since: { nix: 1300, rue: 1420 } }, 1400)).toEqual({ moves: [a], beat: 1320, since: { nix: 1300 } });
    expect(forBranch({}, 1400)).toEqual({});
    // A beat that ran with no moves before the line stands, so it doesn't run again in the branch (review I1).
    expect(forBranch({ moves: [a, mv(1560)], beat: 1560 }, 1500)).toEqual({ moves: [a], beat: 1440 });
  });

  it('moves older than two story days go', () => {
    const old = mv(1320, 'rue', { at: 1000 });
    expect(pruneOld([old, b], 1000 + 2880 + 1)).toEqual([b]);
    expect(pruneOld([old], 1000 + 2880)).toEqual([old]);
  });
});

describe('going', () => {
  const going = (beat: number, until: number, place = 'tilt'): Move => mv(beat, 'rue', { place: 'home', effect: { kind: 'going', place, until } });

  it('a going move places her from its beat until its end', () => {
    const g = going(1440, 1560);
    expect(goingAt([g], 'rue', 1500)?.place).toBe('tilt');
    expect(goingAt([g], 'rue', 1430)).toBeNull();
    expect(goingAt([g], 'rue', 1560)).toBeNull();
    expect(goingAt([g], 'nix', 1500)).toBeNull();
  });

  it('the newer beat wins', () => {
    expect(goingAt([going(1440, 1620, 'tilt'), going(1560, 1620, 'socket')], 'rue', 1580)?.place).toBe('socket');
  });

  it('after its end she is where it took her', () => {
    expect(lastGoing([going(1440, 1560)], 'rue', 1600)).toEqual({ place: 'tilt', until: 1560, beat: 1440 });
    expect(lastGoing([going(1440, 1560)], 'rue', 1500)).toBeNull();
  });

  it('a parting after the beat wins: you were with her since', () => {
    expect(goingAt([going(1440, 1560)], 'rue', 1520, 1500)).toBeNull();
    expect(lastGoing([going(1440, 1560)], 'rue', 1600, 1500)).toBeNull();
    expect(goingAt([going(1440, 1560)], 'rue', 1520, 1400)?.place).toBe('tilt');
  });
});

describe('keepMoves', () => {
  // Window 22:00–00:00 (1320–1440); the beat is 00:00 (1440).
  const check = (id: string, o: Partial<MoverCheck> = {}): MoverCheck => ({
    id,
    window: { from: 1320, to: 1440 },
    placeAt: () => 'karasu/noodle-stall',
    room: 'karasu/noodle-stall',
    fixed: () => false,
    meeting: null,
    ...o,
  });
  const places = new Set(['karasu/noodle-stall', 'karasu/the-tilt', 'spine/second-socket']);
  const keep = (moves: unknown[], movers = [check('hicks'), check('rue'), check('nix'), check('ember')], fenced: string[] = []) => keepMoves({ moves }, { beat: 1440, movers, places, fenced });
  const one = (o: Record<string, unknown> = {}) => ({ id: 'hicks', at: '23:40', line: 'Sold the drive to a Spine buyer. Took less than I wanted.', place: 'karasu/noodle-stall', ...o });

  it("keeps the spec's example, with its beat and its minute", () => {
    const r = keep([one({ effect: { kind: 'going', place: 'spine/second-socket', until: '01:30' } })]);
    expect(r.refused).toEqual([]);
    expect(r.moves).toEqual([{ beat: 1440, at: 1420, who: 'hicks', line: 'Sold the drive to a Spine buyer. Took less than I wanted.', place: 'karasu/noodle-stall', effect: { kind: 'going', place: 'spine/second-socket', until: 1530 } }]);
  });

  it('refuses an unknown id and a second move for the same contact', () => {
    const r = keep([one({ id: 'mother-rot' }), one(), one({ at: '23:50' })]);
    expect(r.moves).toHaveLength(1);
    expect(r.refused).toHaveLength(2);
  });

  it('refuses a minute outside her window', () => {
    expect(keep([one({ at: '21:00' })]).moves).toEqual([]);
    expect(keep([one({ at: '01:00' })]).moves).toEqual([]);
    expect(keep([one({ at: 'late' })]).moves).toEqual([]);
  });

  it('refuses a place the world never put her, give or take a step', () => {
    const moving = check('hicks', { placeAt: (t) => (t < 1410 ? 'karasu/noodle-stall' : 'karasu/the-tilt') });
    expect(keep([one({ place: 'karasu/the-tilt' })], [moving]).moves).toHaveLength(1);
    expect(keep([one({ at: '23:20', place: 'karasu/the-tilt' })], [moving]).moves).toHaveLength(1);
    expect(keep([one({ at: '22:10', place: 'karasu/the-tilt' })], [moving]).moves).toEqual([]);
    // No place from the world: her room's scene.
    expect(keep([one()], [check('hicks', { placeAt: () => null, room: 'karasu/noodle-stall' })]).moves).toHaveLength(1);
  });

  it("refuses a line naming a written quest's people or a guest", () => {
    expect(keep([one({ line: 'Saw Kestrel at the stall.' })], undefined, ['Kestrel']).moves).toEqual([]);
    expect(keep([one({ line: 'Saw the kestrels at the stall.' })], undefined, ['Kestrel']).moves).toHaveLength(1);
    // A part of a name counts too (final review I3): a surname alone is still her.
    expect(keep([one({ line: 'Paid Venn off at the stall.' })], undefined, ['Mara Venn']).moves).toEqual([]);
    expect(keep([one({ line: 'Paid Al off at the stall.' })], undefined, ['Al Venn']).moves).toHaveLength(1);
  });

  it('refuses an empty line and one over the clip', () => {
    expect(keep([one({ line: '  ' })]).moves).toEqual([]);
    expect(keep([one({ line: 'x'.repeat(LINE_CLIP + 1) })]).moves).toEqual([]);
    expect(keep([one({ line: 'x'.repeat(LINE_CLIP) })]).moves).toHaveLength(1);
  });

  it('keeps three movers, one word and one text', () => {
    const r = keep([one(), one({ id: 'rue', effect: { kind: 'word' } }), one({ id: 'nix', effect: { kind: 'word' } }), one({ id: 'ember' })]);
    expect(r.moves.map((m) => m.who)).toEqual(['hicks', 'rue', 'nix']);
    expect(r.moves[2].effect).toBeUndefined();
    const t = keep([one({ effect: { kind: 'text', about: 'the drive' } }), one({ id: 'rue', effect: { kind: 'text', about: 'x' } })]);
    expect(t.moves.map((m) => m.effect?.kind)).toEqual(['text', undefined]);
  });

  it('a going move into a fixed block or her meeting with you keeps its line and loses its effect', () => {
    const go = one({ effect: { kind: 'going', place: 'karasu/the-tilt', until: '01:30' } });
    expect(keep([go], [check('hicks', { fixed: () => true })]).moves[0].effect).toBeUndefined();
    expect(keep([go], [check('hicks', { meeting: { from: 1470, to: 1530 } })]).moves[0].effect).toBeUndefined();
    expect(keep([one({ effect: { kind: 'going', place: 'nowhere', until: '01:30' } })]).moves[0].effect).toBeUndefined();
  });

  it('a going move with no end runs two hours from the beat, and never past the next beat plus two', () => {
    expect(keep([one({ effect: { kind: 'going', place: 'karasu/the-tilt' } })]).moves[0].effect).toEqual({ kind: 'going', place: 'karasu/the-tilt', until: 1440 + 120 });
    expect(keep([one({ effect: { kind: 'going', place: 'karasu/the-tilt', until: '09:00' } })]).moves[0].effect).toEqual({ kind: 'going', place: 'karasu/the-tilt', until: 1440 + 240 });
  });

  it('an answer with no moves list keeps nothing', () => {
    expect(keepMoves('nope', { beat: 1440, movers: [], places, fenced: [] })).toEqual({ moves: [], refused: ['no moves list'] });
    expect(keepMoves({ moves: [] }, { beat: 1440, movers: [], places, fenced: [] })).toEqual({ moves: [], refused: [] });
  });
});

describe('her lines', () => {
  const m = (beat: number, at: number, line: string, o: Partial<Move> = {}): Move => ({ beat, at, who: 'hicks', line, place: 'karasu/noodle-stall', ...o });

  it('since: her standing moves after since, three at most, newest kept', () => {
    const moves = [m(1320, 1250, 'one'), m(1440, 1400, 'two'), m(1560, 1500, 'three'), m(1680, 1650, 'four'), m(1680, 1660, 'rue', { who: 'rue' })];
    expect(sinceLine(moves, 'hicks', 1300, 1200, 1700, 'Vee')).toBe('[since you last saw Vee: 23:20 two · 01:00 three · 03:30 four]');
    expect(sinceLine(moves, 'hicks', null, 1200, 1500, 'Vee')).toBe('[since you last saw Vee: 20:50 one · 23:20 two]');
    expect(sinceLine(moves, 'hicks', 1700, 1200, 1700, 'Vee')).toBeNull();
    // A move at the minute you left her is hers since (her window starts there).
    expect(sinceLine([m(1320, 1300, 'as you left')], 'hicks', 1300, 1200, 1400, 'Vee')).toBe('[since you last saw Vee: 21:40 as you left]');
  });

  it('word: word moves from the last day she would have heard, two at most', () => {
    const w = (at: number, who: string) => m(at + 20, at, `${who} did it`, { who, effect: { kind: 'word' } });
    const moves = [w(1300, 'rue'), w(1400, 'ember'), w(1500, 'cass'), w(1550, 'silas'), m(1560, 1550, 'plain')];
    const name = (id: string) => id.toUpperCase();
    expect(wordLine(moves, (x) => x.who !== 'silas', 1600, name)).toBe('[word going round: EMBER · ember did it, 23:20 · CASS · cass did it, 01:00]');
    expect(wordLine(moves, () => true, 1550 + 1440 + 1, name)).toBeNull();
  });
});
