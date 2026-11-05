import { describe, expect, it } from 'vitest';
import { DAY } from './clock';
import { GOING_DEFAULT, markSeen, MEET_WAIT, parseLoose, parsePlan, parseSay, planKey, planOver, planPlaceAt, planTail, resolvePlan, withSeen, type Plan } from './plan';

/** Day 2 at HH:MM (Day 1 starts at 20:00, minute 1200). */
const at = (h: number, m = 0) => DAY + h * 60 + m;
const HOME = 'karasu/nix-home';
const HAES = 'karasu/noodle-stall';
const names = (id: string) => (id === HOME ? 'home' : id === HAES ? "Hae's" : id);

describe('resolvePlan', () => {
  it('going and a meeting: she goes until the meeting', () => {
    const p = resolvePlan({ going: { place: HOME, until: null }, meet: { place: HAES, at: '21:00' } }, at(19), 'r1')!;
    expect(p).toEqual({ going: { place: HOME, until: at(21) }, meet: { place: HAES, at: at(21) }, from: 'r1' });
  });
  it('a going time past the meeting is cut to the meeting', () => {
    const p = resolvePlan({ going: { place: HOME, until: '23:00' }, meet: { place: HAES, at: '21:00' } }, at(19), 'r1')!;
    expect(p.going!.until).toBe(at(21));
  });
  it('going only, no time: two hours', () => {
    const p = resolvePlan({ going: { place: HOME, until: null }, meet: null }, at(19), 'r1')!;
    expect(p.going!.until).toBe(at(19) + GOING_DEFAULT);
    expect(GOING_DEFAULT).toBe(120);
  });
  it('going only, with a time', () => {
    expect(resolvePlan({ going: { place: HOME, until: '20:30' }, meet: null }, at(19), 'r1')!.going!.until).toBe(at(20, 30));
  });
  it("HH:MM at the reply's minute is now", () => {
    expect(resolvePlan({ going: null, meet: { place: HAES, at: '21:00' } }, at(21), 'r1')!.meet!.at).toBe(at(21));
  });
  it('HH:MM earlier than the clock rolls to tomorrow', () => {
    expect(resolvePlan({ going: null, meet: { place: HAES, at: '01:00' } }, at(23), 'r1')!.meet!.at).toBe(at(23) + 120);
  });
  it('neither leg: null', () => {
    expect(resolvePlan({ going: null, meet: null }, at(19), 'r1')).toBeNull();
  });
});

describe('where the plan has her', () => {
  const p: Plan = { going: { place: HOME, until: at(20) }, meet: { place: HAES, at: at(21) }, from: 'r1' };
  it('planPlaceAt: going, the gap, the meeting window, after', () => {
    expect(planPlaceAt(p, at(19))).toBe(HOME);
    expect(planPlaceAt(p, at(20, 30))).toBeNull();
    expect(planPlaceAt(p, at(21))).toBe(HAES);
    expect(planPlaceAt(p, at(21) + MEET_WAIT - 1)).toBe(HAES);
    expect(planPlaceAt(p, at(21) + MEET_WAIT)).toBeNull();
    expect(MEET_WAIT).toBe(60);
  });
  it('planOver: after the meeting window; without one, after going', () => {
    expect(planOver(p, at(21, 59))).toBe(false);
    expect(planOver(p, at(22))).toBe(true);
    const going: Plan = { going: { place: HOME, until: at(20) }, meet: null, from: 'r1' };
    expect(planOver(going, at(19, 59))).toBe(false);
    expect(planOver(going, at(20))).toBe(true);
  });
  it('planTail: where she will be next, the meeting; the row keeps her place before it', () => {
    const q: Plan = { going: { place: HOME, until: at(21) }, meet: { place: HAES, at: at(21) }, from: 'r1' };
    expect(planTail(q, at(19), names)).toBe("Hae's 21:00");
    expect(planTail(q, at(21, 59), names)).toBe("Hae's 21:00");
    expect(planTail(q, at(22), names)).toBeNull();
    expect(planTail({ going: { place: HOME, until: at(21) }, meet: null, from: 'r1' }, at(19), names)).toBeNull();
  });
});

describe('storage', () => {
  it('planKey', () => expect(planKey('hicks')).toBe('plan.hicks'));
  it('parsePlan round-trips', () => {
    const p: Plan = { going: null, meet: { place: HAES, at: at(21) }, from: 'r1', met: true };
    expect(parsePlan(JSON.stringify(p))).toEqual(p);
  });
  it('parsePlan keeps missed', () => {
    const p: Plan = { going: null, meet: { place: HAES, at: at(21) }, from: 'r1', missed: true };
    expect(parsePlan(JSON.stringify(p))).toEqual(p);
  });
  it('parsePlan on junk is null', () => {
    expect(parsePlan(null)).toBeNull();
    expect(parsePlan('{')).toBeNull();
    expect(parsePlan('{"going":null,"meet":null,"from":"m"}')).toBeNull();
    expect(parsePlan('{"going":{"place":"x"},"meet":null,"from":"m"}')).toBeNull();
  });
});

describe('shared plans (spec 2026-11-05)', () => {
  const at = (hh: number, day = 2) => day * DAY + hh * 60;

  it('keeps who else is coming, and reads junk as nobody', () => {
    const p = resolvePlan({ going: null, meet: { place: 'haes', at: '09:00', with: ['silas'] } }, at(3), 'r1')!;
    expect(p.meet?.with).toEqual(['silas']);
    expect(parsePlan(JSON.stringify(p))?.meet?.with).toEqual(['silas']);
    expect(parsePlan(JSON.stringify({ ...p, meet: { place: 'haes', at: 1, with: [3] } }))?.meet).toEqual({ place: 'haes', at: 1 });
  });

  it('makes no meeting without a time, and keeps a going leg', () => {
    expect(resolvePlan({ going: null, meet: { place: 'haes', at: null } }, at(3), 'r1')).toBeNull();
    const p = resolvePlan({ going: { place: 'home', until: null }, meet: { place: 'haes', at: null } }, at(3), 'r1')!;
    expect(p.meet).toBeNull();
    expect(p.going?.until).toBe(at(3) + GOING_DEFAULT);
  });

  it('reads tomorrow as the next day, or as the coming day before 06:00', () => {
    const meet = { place: 'haes', at: '22:00', tomorrow: true };
    expect(resolvePlan({ going: null, meet }, at(20), 'r1')!.meet!.at).toBe(at(22, 3));
    expect(resolvePlan({ going: null, meet }, at(3), 'r1')!.meet!.at).toBe(at(22));
    expect(resolvePlan({ going: null, meet: { ...meet, at: '00:30' } }, at(20), 'r1')!.meet!.at).toBe(3 * DAY + 30);
  });

  it('carries who you came with on the met mark', () => {
    const plan = resolvePlan({ going: null, meet: { place: 'haes', at: '09:00' } }, at(3), 'r1')!;
    const raw = markSeen(null, 'r1', 'met', at(9), { with: 'silas', row: 'm7' });
    expect(withSeen(plan, raw, at(9))).toMatchObject({ metWith: 'silas', metRow: 'm7' });
    expect(withSeen(plan, raw, at(8)).metWith).toBeUndefined();
    // Met again on her own: who you came with goes.
    expect(withSeen(plan, markSeen(raw, 'r1', 'met', at(9)), at(9)).metWith).toBeUndefined();
    // Another mark leaves it.
    expect(withSeen(plan, markSeen(raw, 'r1', 'missed', at(10)), at(10)).metWith).toBe('silas');
  });

  it('parses a loose date and one-time lines', () => {
    expect(parseLoose(JSON.stringify({ place: 'haes', with: ['silas'], at: 5, from: 'r1' }))).toEqual({ place: 'haes', with: ['silas'], at: 5, from: 'r1' });
    expect(parseLoose('{"place":"haes"}')).toBeNull();
    expect(parseSay(JSON.stringify({ from: 'r1', lines: ['[x]'] }))).toEqual({ from: 'r1', lines: ['[x]'] });
    expect(parseSay('nope')).toBeNull();
  });
});
