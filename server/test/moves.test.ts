import { describe, expect, it } from 'vitest';
import { createMoveBeat, type MoveBeatDeps } from '../src/moves';
import type { Move, MoverCheck } from '../../shared/moves';

const check = (id: string): MoverCheck => ({ id, window: { from: 1200, to: 1320 }, placeAt: () => 'karasu/noodle-stall', room: 'karasu/noodle-stall', fixed: () => false, meeting: null });
const answer = (moves: unknown[]) => JSON.stringify({ moves });
const hicks = { id: 'hicks', at: '21:40', line: 'Sold the drive. Took less than I wanted.', place: 'karasu/noodle-stall' };

function fake(o: { clock?: number; beat?: number | null; moves?: Move[]; text?: () => Promise<string | null>; on?: boolean; movers?: string[]; write?: () => boolean } = {}) {
  const state = { clock: o.clock ?? 1325, beat: o.beat ?? null, moves: o.moves ?? [], id: 'pt1', gen: 0, rewinds: 0 };
  const calls: unknown[] = [];
  const logs: string[] = [];
  const fired: { id: string; about: string; due: number }[] = [];
  const deps: MoveBeatDeps = {
    generation: () => state.gen,
    rewinds: () => state.rewinds,
    active: () => ({ id: state.id, player: 'you', start: 1200, beat: state.beat, moves: state.moves, parted: {} }),
    now: () => state.clock,
    on: () => o.on ?? true,
    movers: () => o.movers ?? ['hicks', 'rue'],
    messages: (ids) => [{ role: 'user', content: ids.join(',') }],
    checks: (ids, window) => ids.map((id) => ({ ...check(id), window })),
    places: () => new Set(['karasu/noodle-stall']),
    fenced: () => [],
    call: async (m) => {
      calls.push(m);
      const t = o.text ? await o.text() : answer([hicks]);
      return t === null ? null : { text: t, tokensIn: 10, tokensOut: 5 };
    },
    write: (ptId, read, moves, beat) => {
      if (o.write && !o.write()) return false;
      if (ptId !== state.id || read !== state.beat) return false;
      state.moves = moves;
      state.beat = beat;
      return true;
    },
    log: (l) => logs.push(l),
    withYou: () => false,
    awake: () => true,
    promiseOpen: () => false,
    fireText: async (id, o) => {
      fired.push({ id, ...o });
      return true;
    },
    markText: (ptId, beat, who, patch) => {
      state.moves = state.moves.map((m) => {
        if (m.beat !== beat || m.who !== who || m.effect?.kind !== 'text') return m;
        if (patch === null) {
          const { effect: _e, ...rest } = m;
          return rest;
        }
        return { ...m, effect: { ...m.effect, ...patch } };
      });
    },
  };
  return { deps, state, calls, logs, fired };
}

describe('the beat runner', () => {
  it('a due beat makes one call and writes its kept moves', async () => {
    const f = fake();
    await createMoveBeat(f.deps).check();
    expect(f.calls).toHaveLength(1);
    expect(f.state.beat).toBe(1320);
    expect(f.state.moves.map((m) => [m.who, m.at, m.beat])).toEqual([['hicks', 1300, 1320]]);
  });

  it('a beat that ran makes no call', async () => {
    const f = fake({ beat: 1320 });
    await createMoveBeat(f.deps).check();
    expect(f.calls).toHaveLength(0);
  });

  it('switched off, no call', async () => {
    const f = fake({ on: false });
    await createMoveBeat(f.deps).check();
    expect(f.calls).toHaveLength(0);
    expect(f.state.beat).toBeNull();
  });

  it('nobody to move: the beat is marked run and costs nothing', async () => {
    const f = fake({ movers: [] });
    await createMoveBeat(f.deps).check();
    expect(f.calls).toHaveLength(0);
    expect(f.state.beat).toBe(1320);
  });

  it('old moves are dropped when a beat writes', async () => {
    const old: Move = { beat: 1320, at: 1300, who: 'rue', line: 'x', place: 'karasu/noodle-stall' };
    const f = fake({ clock: 1300 + 2880 + 125, beat: 1320, moves: [old], movers: [] });
    await createMoveBeat(f.deps).check();
    expect(f.state.moves).toEqual([]);
  });

  it('a failed call marks the beat run with nothing; three in a row stop beats', async () => {
    const f = fake({ text: () => Promise.reject(new Error('timeout')) });
    const beat = createMoveBeat(f.deps);
    await beat.check();
    expect(f.state.beat).toBe(1320);
    expect(f.state.moves).toEqual([]);
    f.state.clock = 1445;
    await beat.check();
    f.state.clock = 1565;
    await beat.check();
    expect(f.calls).toHaveLength(3);
    f.state.clock = 1685;
    await beat.check();
    expect(f.calls).toHaveLength(3);
    expect(f.logs.some((l) => l.includes('stopped'))).toBe(true);
  });

  it('text that is not JSON writes the beat empty and counts as dead', async () => {
    const f = fake({ text: async () => 'the city sleeps' });
    await createMoveBeat(f.deps).check();
    expect(f.state.beat).toBe(1320);
    expect(f.state.moves).toEqual([]);
  });

  it('no key or model: a quiet skip, not written, not counted (Review Focus 3)', async () => {
    const f = fake({ text: async () => null });
    const beat = createMoveBeat(f.deps);
    for (const c of [1325, 1445, 1565, 1685]) {
      f.state.clock = c;
      await beat.check();
    }
    expect(f.state.beat).toBeNull();
    f.deps.call = async () => ({ text: answer([hicks]), tokensIn: 1, tokensOut: 1 });
    await beat.check();
    expect(f.state.beat).toBe(1680);
  });

  it('a write refused (a LOAD or REWIND during the call) is logged, not retried, not dead (Review Focus 2)', async () => {
    let n = 0;
    const f = fake({ write: () => ++n > 1 });
    const beat = createMoveBeat(f.deps);
    await beat.check();
    expect(f.state.beat).toBeNull();
    expect(f.logs.some((l) => l.includes('changed'))).toBe(true);
    expect(f.calls).toHaveLength(1);
  });

  it('a LOAD in place during the call (same id, same beat, new generation): not written (final review I2)', async () => {
    const f = fake({ text: async () => (f.state.gen++, answer([hicks])) });
    await createMoveBeat(f.deps).check();
    expect(f.state.beat).toBeNull();
    expect(f.logs.some((l) => l.includes('changed'))).toBe(true);
  });

  it('a throw while building the prompt is not a dead beat, and writes nothing (minor M5)', async () => {
    const f = fake();
    f.deps.messages = () => {
      throw new Error('no playthrough');
    };
    const beat = createMoveBeat(f.deps);
    for (const c of [1325, 1445, 1565, 1685]) {
      f.state.clock = c;
      await beat.check();
    }
    expect(f.state.beat).toBeNull();
    expect(f.calls).toHaveLength(0);
    f.deps.messages = (ids) => [{ role: 'user', content: ids.join(',') }];
    await beat.check();
    expect(f.calls).toHaveLength(1);
  });

  it('a REWIND during the call: not written, so the beat can go differently (minor M1)', async () => {
    const f = fake({ text: async () => (f.state.rewinds++, (f.state.clock = 1300), answer([hicks])) });
    await createMoveBeat(f.deps).check();
    expect(f.state.beat).toBeNull();
  });

  it('a REWIND that leaves the clock past the beat still writes (minor M1)', async () => {
    const f = fake({ text: async () => (f.state.rewinds++, answer([hicks])) });
    await createMoveBeat(f.deps).check();
    expect(f.state.beat).toBe(1320);
  });

  it('a REGEN dipping the clock during the call still writes: the beat never runs twice (minor M1)', async () => {
    const f = fake({ text: async () => ((f.state.clock = 1310), answer([hicks])) });
    const beat = createMoveBeat(f.deps);
    await beat.check();
    expect(f.state.beat).toBe(1320);
    f.state.clock = 1330;
    await beat.check();
    expect(f.calls).toHaveLength(1);
  });

  it('a LOAD in place while a move text is out: its mark goes nowhere (final review I2)', async () => {
    const f = fake({ beat: 1320, moves: [{ beat: 1320, at: 1300, who: 'hicks', line: 'x', place: 'karasu/noodle-stall', effect: { kind: 'text', about: 'y' } }] });
    f.deps.fireText = async () => {
      f.state.gen++;
      return false;
    };
    await createMoveBeat(f.deps).check();
    expect(f.state.moves[0].effect).toEqual({ kind: 'text', about: 'y' });
  });

  it('two checks at once make one call; a clock move during a pass runs one more', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const f = fake({ text: async () => (await held, answer([hicks])) });
    const beat = createMoveBeat(f.deps);
    const a = beat.check();
    const b = beat.check();
    f.state.clock = 1445;
    release();
    await Promise.all([a, b]);
    expect(f.calls).toHaveLength(2);
    expect(f.state.beat).toBe(1440);
  });

  it('anything that throws in a pass is logged, never thrown out of a clock move (Review Focus 3)', async () => {
    const f = fake({ movers: [] });
    f.deps.write = () => {
      throw new Error('statement has been finalized');
    };
    await expect(createMoveBeat(f.deps).check()).resolves.toBeUndefined();
    expect(f.logs.some((l) => l.includes('statement has been finalized'))).toBe(true);
  });

});

describe('move texts (spec §4.2)', () => {
  const textMove = (o: Partial<Move> = {}): Move => ({ beat: 1320, at: 1300, who: 'hicks', line: 'Found your drive.', place: 'karasu/noodle-stall', effect: { kind: 'text', about: 'the drive' }, ...o });

  it('a kept text goes out once, due at the beat, and is marked sent', async () => {
    const f = fake({ text: async () => answer([{ ...hicks, effect: { kind: 'text', about: 'the drive' } }]) });
    const beat = createMoveBeat(f.deps);
    await beat.check();
    expect(f.fired).toEqual([{ id: 'hicks', about: 'the drive', due: 1320 }]);
    expect(f.state.moves[0].effect).toEqual({ kind: 'text', about: 'the drive', sent: true });
    await beat.check();
    expect(f.fired).toHaveLength(1);
  });

  it('asleep, it waits', async () => {
    const f = fake({ beat: 1320, moves: [textMove()] });
    let awake = false;
    f.deps.awake = () => awake;
    const beat = createMoveBeat(f.deps);
    await beat.check();
    expect(f.fired).toHaveLength(0);
    awake = true;
    await beat.check();
    expect(f.fired).toHaveLength(1);
  });

  it('three failures drop it', async () => {
    const f = fake({ beat: 1320, moves: [textMove()] });
    f.deps.fireText = async () => false;
    const beat = createMoveBeat(f.deps);
    for (let i = 0; i < 4; i++) await beat.check();
    expect(f.state.moves[0].effect).toBeUndefined();
    expect(f.state.moves[0].line).toBe('Found your drive.');
  });

  it("with her before it went out: dropped, left to [since]", async () => {
    const f = fake({ beat: 1320, moves: [textMove()] });
    f.deps.withYou = (id) => id === 'hicks';
    await createMoveBeat(f.deps).check();
    expect(f.fired).toHaveLength(0);
    expect(f.state.moves[0].effect).toBeUndefined();
  });

  it('a newer beat ran first: dropped', async () => {
    const f = fake({ clock: 1445, beat: 1440, moves: [textMove()] });
    await createMoveBeat(f.deps).check();
    expect(f.fired).toHaveLength(0);
    expect(f.state.moves[0].effect).toBeUndefined();
  });

  it('a promise to text still open when the beat keeps it: the line stays, the text goes', async () => {
    const f = fake({ text: async () => answer([{ ...hicks, effect: { kind: 'text', about: 'the drive' } }]) });
    f.deps.promiseOpen = (id) => id === 'hicks';
    await createMoveBeat(f.deps).check();
    expect(f.state.moves[0].effect).toBeUndefined();
    expect(f.fired).toHaveLength(0);
  });

  it('a sent text whose row was rewound away is not sent again', async () => {
    const f = fake({ beat: 1320, moves: [textMove({ effect: { kind: 'text', about: 'the drive', sent: true } })] });
    await createMoveBeat(f.deps).check();
    expect(f.fired).toHaveLength(0);
  });
});
