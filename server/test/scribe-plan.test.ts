import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db';
import { Journal } from '../src/journal';
import { applyScribe, parseScribeAnswer, scribeMessages, type ScribeAnswer, type ScribeInput } from '../src/scribe';
import type { Plan } from '../../shared/plan';

// Her plans spec §4: the scribe reads where she's going and where she'll be.
const P = 'hicks';
let db: Db;
let journal: Journal;
beforeEach(() => {
  db = openDb(':memory:', { defaultPlayer: P });
  journal = new Journal(db);
});
const empty: ScribeAnswer = { notes: [], standing: null, lights: [], time: null, plan: null, recap: null, dossier: null };
const HOME = 'karasu/nix-home';
const HAES = 'karasu/noodle-stall';
const input = (over: Partial<ScribeInput> = {}): ScribeInput => ({
  kind: 'turn',
  self: { name: 'Nix', pronoun: 'she' },
  player: { id: P, name: 'Hicks' },
  roomLine: '[room: the stall]',
  standing: null,
  notes: [],
  exchanges: [{ speaker: 'Nix', text: "I'll go home and shower. Hae's at nine." }],
  recap: null,
  page: null,
  ...over,
});

describe('parse', () => {
  it('going, meeting, cancel and null', () => {
    expect(parseScribeAnswer('{"plan":{"going":{"place":"a","until":null},"meet":null}}').answer!.plan).toEqual({ going: { place: 'a', until: null }, meet: null });
    expect(parseScribeAnswer('{"plan":{"going":null,"meet":{"place":"b","at":"21:00"}}}').answer!.plan).toEqual({ going: null, meet: { place: 'b', at: '21:00' } });
    expect(parseScribeAnswer('{"plan":{"cancel":true}}').answer!.plan).toEqual({ cancel: true });
    expect(parseScribeAnswer('{"plan":null}').answer!.plan).toBeNull();
    expect(parseScribeAnswer('{}').answer!.plan).toBeNull();
  });
  it('a bad time is refused', () => {
    const r = parseScribeAnswer('{"plan":{"going":null,"meet":{"place":"b","at":"9pm"}}}');
    expect(r.answer!.plan).toBeNull();
    expect(r.refused[0]).toMatch(/^plan:/);
  });
});

describe('prompt', () => {
  const places = [{ id: HAES, name: "Hae's Noodles" }, { id: HOME, name: "Nix's flat" }];
  it('a timed turn gets the PLAN rule, the places line and the plan line', () => {
    const [sys, user] = scribeMessages(input({ clock: 4030, places, planLine: "going Nix's flat until 21:00; meeting at Hae's Noodles 21:00" }));
    expect(sys.content).toContain(
      'PLAN: only when Nix\'s reply commits Nix to going somewhere now, or to being somewhere at a time — "I\'m going home to shower", "meet me at Hae\'s at nine". Not a place or time only mentioned, wished for or asked about, and not a plan the two of them carry out together right now. Use the place ids from the [places: …] line. "going" is where Nix heads now without Hicks, and until when — never somewhere they go together; "meet" is where and when Nix said she\'ll be. If Nix drops a plan already listed, answer {"cancel":true}. Otherwise null; most turns have none.',
    );
    expect(sys.content).toContain('{"notes":[],"standing":null,"lights":[],"time":null,"plan":null,"recap":null,"dossier":null}');
    expect(user.content).toContain(`[places: ${HAES} "Hae's Noodles", ${HOME} "Nix's flat"]`);
    expect(user.content).toContain("[her plan: going Nix's flat until 21:00; meeting at Hae's Noodles 21:00]");
  });
  it('no places (plans off) or no clock: no PLAN rule, no lines', () => {
    for (const i of [input({ clock: 4030 }), input({ clock: null, places })]) {
      const [sys, user] = scribeMessages(i);
      expect(sys.content).not.toContain('PLAN:');
      expect(sys.content).not.toContain('"plan"');
      expect(user.content).not.toContain('[places:');
    }
  });
});

describe('apply', () => {
  const at = { messageId: 'r1', take: 0, kind: 'turn' as const, clock: 1440 + 19 * 60 };
  const deps = (set: (p: Plan | null) => void) => ({
    journal,
    player: P,
    standing: null,
    setLight: () => ({ ok: true as const, text: '' }),
    db,
    plan: { places: new Set([HOME, HAES]), set },
  });
  it('a plan is resolved on the clock and set under the reply', () => {
    const got: (Plan | null)[] = [];
    let stamped: string | null = null;
    const d = deps((p) => {
      got.push(p);
      stamped = db.stamp().messageId;
    });
    const r = applyScribe(d, { ...empty, plan: { going: { place: HOME, until: null }, meet: { place: HAES, at: '21:00' } } }, at);
    expect(got).toEqual([{ going: { place: HOME, until: 1440 + 21 * 60 }, meet: { place: HAES, at: 1440 + 21 * 60 }, from: 'r1' }]);
    expect(stamped).toBe('r1');
    expect(r.applied).toContain(`plan set: going ${HOME} until 21:00; meet ${HAES} 21:00`);
  });
  it("a going leg to where she already is (she walked you both there) is dropped; the meeting stays (chat-stress 2026-10-22)", () => {
    const got: (Plan | null)[] = [];
    const d = { ...deps((p) => got.push(p)), plan: { places: new Set([HOME, HAES]), here: HAES, set: (p: Plan | null) => got.push(p) } };
    const r = applyScribe(d, { ...empty, plan: { going: { place: HAES, until: null }, meet: null } }, at);
    expect(got).toEqual([]);
    expect(r.refused).toContain(`plan going ignored: she's at ${HAES} already`);
    const r2 = applyScribe(d, { ...empty, plan: { going: { place: HAES, until: null }, meet: { place: HOME, at: '23:00' } } }, at);
    expect(got).toEqual([{ going: null, meet: { place: HOME, at: 1440 + 23 * 60 }, from: 'r1' }]);
    expect(r2.applied).toContain(`plan set: meet ${HOME} 23:00`);
  });

  it('cancel sets null', () => {
    const got: (Plan | null)[] = [];
    expect(applyScribe(deps((p) => got.push(p)), { ...empty, plan: { cancel: true } }, at).applied).toContain('plan cancelled');
    expect(got).toEqual([null]);
  });
  it("a place that isn't on the map is refused", () => {
    const got: (Plan | null)[] = [];
    const r = applyScribe(deps((p) => got.push(p)), { ...empty, plan: { going: { place: 'nowhere', until: null }, meet: null } }, at);
    expect(r.refused).toContain("plan refused: nowhere isn't a map place");
    expect(got).toEqual([]);
  });
  it('plans off, or no clock: nothing either way', () => {
    const a = { ...empty, plan: { going: { place: HOME, until: null }, meet: null } };
    const { plan: _, ...off } = deps(() => {});
    const r = applyScribe(off, a, at);
    expect([...r.applied, ...r.refused].filter((x) => x.startsWith('plan'))).toEqual([]);
    const got: (Plan | null)[] = [];
    const r2 = applyScribe(deps((p) => got.push(p)), a, { ...at, clock: null });
    expect([...r2.applied, ...r2.refused].filter((x) => x.startsWith('plan'))).toEqual([]);
    expect(got).toEqual([]);
  });
});
