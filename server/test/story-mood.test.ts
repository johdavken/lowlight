import { describe, expect, it } from 'vitest';
import { StoryMood, type StoryMoodDeps } from '../src/story-mood';

const at = (day: number, hhmm: string) => (day - 1) * 1440 + Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function world(presets: string[] = ['late', 'quiet', 'tense', 'dawn'], meta = new Map<string, string>()) {
  const applied: string[] = [];
  const s = { now: at(1, '21:00') as number | null, job: false };
  const deps: StoryMoodDeps = {
    room: {
      scene: () => ({ presets: Object.fromEntries(presets.map((p) => [p, {}])) }),
      applyPreset: (a, src) => {
        expect(a.duration).toBe(3);
        expect(src).toBe('world');
        applied.push(a.name);
        return { ok: true };
      },
    },
    meta: { get: (k) => meta.get(k) ?? null, set: (k, v) => void meta.set(k, v), delete: (k) => void meta.delete(k) },
    now: () => s.now,
    jobOn: () => s.job,
  };
  return { mood: new StoryMood(deps), deps, applied, meta, s };
}

describe('StoryMood', () => {
  it('a turn applies when the key changes, and stores the key', () => {
    const w = world();
    w.s.now = at(2, '00:10');
    w.mood.check('turn');
    expect(w.applied).toEqual(['late']);
    expect(w.meta.get('storyMood.key')).toBe('late@2');
  });

  it('the same key does nothing: her own mood holds (Review Focus 1)', () => {
    const w = world();
    w.s.now = at(2, '00:10');
    w.mood.check('turn');
    for (const t of ['00:30', '01:00', '02:00', '03:00']) {
      w.s.now = at(2, t);
      w.mood.check('turn');
    }
    expect(w.applied).toEqual(['late']);
  });

  it("a restart doesn't re-apply (Review Focus 2)", () => {
    const w = world();
    w.s.now = at(2, '00:10');
    w.mood.check('turn');
    const again = new StoryMood(w.deps);
    w.s.now = at(2, '00:40');
    again.check('turn');
    expect(w.applied).toEqual(['late']);
  });

  it('a WAIT across windows lands on the current rule (Review Focus 3)', () => {
    const w = world();
    w.mood.check('turn');
    expect(w.applied).toEqual([]);
    w.s.now = at(2, '05:00');
    w.mood.check('turn');
    expect(w.applied).toEqual(['dawn']);
    expect(w.meta.get('storyMood.key')).toBe('dawn@2');
  });

  it('no rule applies: nothing is applied and the key is cleared (Review Focus 5)', () => {
    const w = world(['late', 'quiet', 'tense']);
    w.s.now = at(2, '00:10');
    w.mood.check('turn');
    w.s.now = at(2, '05:00');
    w.mood.check('turn');
    expect(w.applied).toEqual(['late']);
    expect(w.meta.has('storyMood.key')).toBe(false);
  });

  it('entering always applies the current mood (the room just reset)', () => {
    const w = world();
    w.s.now = at(2, '00:10');
    w.mood.check('turn');
    w.s.now = at(2, '00:40');
    w.mood.check('enter');
    expect(w.applied).toEqual(['late', 'late']);
  });

  it('a job turns the room tense, then after-the-job for two hours', () => {
    const w = world(['late', 'quiet', 'tense', 'after-the-job']);
    w.s.job = true;
    w.mood.check('turn');
    expect(w.applied).toEqual(['tense']);
    expect(w.meta.get('storyMood.key')).toBe('job');
    w.s.job = false;
    w.s.now = at(1, '22:00');
    w.mood.check('turn');
    expect(w.meta.get('storyMood.jobSeen')).toBe(String(at(1, '21:00')));
    expect(w.applied).toEqual(['tense', 'after-the-job']);
    w.s.now = at(1, '22:00') + 121; // 00:01: the after-job window is over, and it's late
    w.mood.check('turn');
    expect(w.meta.get('storyMood.key')).toBe('late@2');
    expect(w.applied).toEqual(['tense', 'after-the-job', 'late']);
  });

  it('outside a playthrough (no clock) it does nothing', () => {
    const w = world();
    w.s.now = null;
    w.mood.check('enter');
    w.mood.check('turn');
    expect(w.applied).toEqual([]);
  });

  describe('the after-job window counts from the last time this room saw the job (Task 3 review I2)', () => {
    it('a job that ended elsewhere, long ago, gives no after-the-job on rejoin', () => {
      const w = world(['late', 'quiet', 'tense', 'after-the-job']);
      w.s.job = true;
      w.mood.check('turn'); // 21:00, tense here
      w.s.job = false; // ended while you were with someone else
      w.s.now = at(1, '21:00') + 180;
      w.mood.check('enter');
      expect(w.applied).toEqual(['tense', 'late']);
    });

    it('a room without tense still gets after-the-job once the job it saw is over', () => {
      const w = world(['late', 'quiet', 'after-the-job']);
      w.s.job = true;
      w.mood.check('turn');
      expect(w.applied).toEqual([]);
      w.s.job = false;
      w.s.now = at(1, '21:30');
      w.mood.check('turn');
      expect(w.applied).toEqual(['after-the-job']);
    });
  });

  it("a note records the key without applying (her own change came after the move: final review I1)", () => {
    const w = world();
    w.s.now = at(2, '00:10');
    w.mood.check('note');
    expect(w.applied).toEqual([]);
    expect(w.meta.get('storyMood.key')).toBe('late@2');
    w.mood.check('turn');
    expect(w.applied).toEqual([]);
  });

  it("the job is the given player's (final review M2)", () => {
    const asked: (string | undefined)[] = [];
    const w = world();
    w.deps.jobOn = (p) => (asked.push(p), false);
    w.mood.check('turn', 'vee');
    expect(asked).toEqual(['vee']);
  });

  it('her own room change earlier in this turn holds over a new window (story moods minors)', () => {
    const w = world();
    w.deps.herTurnChange = () => true;
    w.s.now = at(2, '00:10');
    w.mood.check('turn');
    expect(w.applied).toEqual([]);
    expect(w.meta.get('storyMood.key')).toBe('late@2');
  });

  it('a running job notes the time at most every half hour', () => {
    const w = world(['late', 'quiet', 'tense', 'after-the-job']);
    w.s.job = true;
    w.mood.check('turn');
    w.s.now = at(1, '21:10');
    w.mood.check('turn');
    expect(w.meta.get('storyMood.jobSeen')).toBe(String(at(1, '21:00')));
    w.s.now = at(1, '21:30');
    w.mood.check('turn');
    expect(w.meta.get('storyMood.jobSeen')).toBe(String(at(1, '21:30')));
  });
});

describe('StoryMood and the power (blackouts phase 3 §3)', () => {
  const outage = (from: number) => ({ district: 'karasu', from, to: from + 120, by: 'schedule' as const });
  function powered(presets: string[] = ['late', 'quiet', 'tense', 'dawn'], meta = new Map<string, string>()) {
    const w = world(presets, meta);
    const power: { now: ReturnType<typeof outage> | null; calls: boolean[] } = { now: null, calls: [] };
    w.deps.power = () => power.now;
    w.deps.room.setPower = (a, src) => {
      expect(src).toBe('world');
      power.calls.push(a.out);
      return { ok: true };
    };
    return { ...w, power };
  }

  it('the power going puts the room out once; the same outage again does nothing', () => {
    const w = powered();
    w.s.now = at(2, '22:30');
    w.power.now = outage(at(2, '22:00'));
    w.mood.check('turn');
    w.mood.check('turn');
    w.s.now = at(2, '23:30');
    w.mood.check('turn');
    expect(w.power.calls).toEqual([true]);
    expect(w.meta.get('storyMood.power')).toBe(String(at(2, '22:00')));
  });

  it('her own light between checks stands: nothing more is done to the room (Review Focus 3)', () => {
    const w = powered();
    w.s.now = at(2, '22:30');
    w.power.now = outage(at(2, '22:00'));
    w.mood.check('turn');
    w.deps.herTurnChange = () => true;
    w.mood.check('turn');
    expect(w.power.calls).toEqual([true]);
    expect(w.applied).toEqual([]);
  });

  it('no late over a dark room; the power back restores it, then late applies', () => {
    const w = powered();
    w.s.now = at(3, '01:00');
    w.power.now = outage(at(2, '22:00'));
    w.mood.check('turn');
    expect(w.applied).toEqual([]);
    w.power.now = null;
    w.s.now = at(3, '02:00');
    w.mood.check('turn');
    expect(w.power.calls).toEqual([true, false]);
    expect(w.applied).toEqual(['late']);
    expect(w.meta.get('storyMood.power')).toBeUndefined();
  });

  it('walking into a dark room puts it out', () => {
    const w = powered();
    w.s.now = at(2, '22:30');
    w.power.now = outage(at(2, '22:00'));
    w.mood.check('enter');
    expect(w.power.calls).toEqual([true]);
  });

  it('walking from one dark room into another in the same district puts the new room out too', () => {
    const w = powered();
    w.s.now = at(2, '22:30');
    w.power.now = outage(at(2, '22:00'));
    w.mood.check('turn');
    w.mood.check('enter');
    expect(w.power.calls).toEqual([true, true]);
  });

  it('a restart after the power came back restores the room on the first check (Review Focus 1)', () => {
    const meta = new Map([['storyMood.power', String(at(2, '22:00'))]]);
    const w = powered(['quiet'], meta);
    w.s.now = at(3, '07:00');
    w.mood.check('turn');
    expect(w.power.calls).toEqual([false]);
  });

  it('a swipe that undid the narrator\'s cut brings the room back (Review Focus 2)', () => {
    const w = powered(['quiet']);
    w.s.now = at(2, '22:30');
    w.power.now = { ...outage(at(2, '22:15')), by: 'schedule' };
    w.mood.check('turn');
    w.power.now = null;
    w.mood.check('turn');
    expect(w.power.calls).toEqual([true, false]);
  });

  it('a new outage right after another (a different start) puts the room out again', () => {
    const w = powered(['quiet']);
    w.s.now = at(2, '22:30');
    w.power.now = outage(at(2, '22:00'));
    w.mood.check('turn');
    w.power.now = outage(at(2, '22:20'));
    w.mood.check('turn');
    expect(w.power.calls).toEqual([true, true]);
  });

  it('a note (walked in, then changed again by her) records the power without acting', () => {
    const w = powered(['quiet']);
    w.s.now = at(2, '22:30');
    w.power.now = outage(at(2, '22:00'));
    w.mood.check('note');
    expect(w.power.calls).toEqual([]);
    expect(w.meta.get('storyMood.power')).toBe(String(at(2, '22:00')));
  });
});
