import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db';
import { Journal } from '../src/journal';
import { applyScribe, parseScribeAnswer, scribeMessages, type ScribeAnswer, type ScribeInput } from '../src/scribe';
import { promisesApply } from '../src/scribe-runner';
import type { TextPromise } from '../../shared/promise';
import type { ChatMessage } from '../../shared/types';

// Promised texts spec §4: the scribe notices she promised to text.
const P = 'hicks';
let db: Db;
let journal: Journal;
beforeEach(() => {
  db = openDb(':memory:', { defaultPlayer: P });
  journal = new Journal(db);
});
const empty: ScribeAnswer = { notes: [], standing: null, lights: [], time: null, plan: null, recap: null, dossier: null };
const HOME = 'karasu/nix-home';
const places = [{ id: HOME, name: "Nix's flat" }];
const input = (over: Partial<ScribeInput> = {}): ScribeInput => ({
  kind: 'turn',
  self: { name: 'Nix', pronoun: 'she' },
  player: { id: P, name: 'Hicks' },
  roomLine: '[room: the stall]',
  standing: null,
  notes: [],
  exchanges: [{ speaker: 'Nix', text: "I'll text you when I'm home." }],
  recap: null,
  page: null,
  ...over,
});

describe('parse', () => {
  it('a time, a place, cancel and null', () => {
    expect(parseScribeAnswer('{"promise":{"at":"22:00","about":"about the job"}}').answer!.promise).toEqual({ at: '22:00', about: 'about the job' });
    expect(parseScribeAnswer(`{"promise":{"place":"${HOME}","about":"that she's home"}}`).answer!.promise).toEqual({ place: HOME, about: "that she's home" });
    expect(parseScribeAnswer('{"promise":{"cancel":true}}').answer!.promise).toEqual({ cancel: true });
    expect(parseScribeAnswer('{}').answer!.promise ?? null).toBeNull();
    const bad = parseScribeAnswer('{"promise":{"at":"10pm","about":"x"}}');
    expect(bad.answer!.promise ?? null).toBeNull();
    expect(bad.refused[0]).toMatch(/^promise:/);
  });
});

describe('prompt', () => {
  it('with promises on: the PROMISE rule, its JSON, and the standing promise read back', () => {
    const [sys, user] = scribeMessages(input({ clock: 4030, places, promises: true, promiseLine: "text Hicks when you're at Nix's flat" }));
    expect(sys.content).toContain("PROMISE: only when Nix's reply says she'll text or message Hicks later");
    expect(sys.content).toContain('"promise":null');
    expect(user.content).toContain("[your promise: text Hicks when you're at Nix's flat]");
  });
  it('her day rides along, with the rule for moments of her day ("in bed")', () => {
    const [sys, user] = scribeMessages(input({ clock: 4030, places, promises: true, herDay: "Nix's flat 05:00–18:00 · the Intake 20:00–04:00" }));
    expect(user.content).toContain("[her day: Nix's flat 05:00–18:00 · the Intake 20:00–04:00]");
    expect(sys.content).toContain('When the promise is tied to a moment of Nix\'s day rather than a clock time ("when I\'m in bed", "after my shift"), give the time it most likely happens from [her day: …] and what Nix said, as "at".');
  });

  it('a promise she keeps in the same reply is no promise (live check)', () => {
    const [sys] = scribeMessages(input({ clock: 4030, places, promises: true }));
    expect(sys.content).toContain('If Nix\'s reply already does what she promised (she says she\'s in bed now), it\'s kept: null.');
  });

  it('promises on but plans off (on comms): the places line and PROMISE, no PLAN', () => {
    const [sys, user] = scribeMessages(input({ clock: 4030, places, promises: true, noPlans: true }));
    expect(sys.content).toContain('PROMISE:');
    expect(sys.content).not.toContain('PLAN:');
    expect(user.content).toContain('[places:');
  });
  it('promises off: nothing about them', () => {
    const [sys] = scribeMessages(input({ clock: 4030, places }));
    expect(sys.content).not.toContain('PROMISE');
    expect(sys.content).not.toContain('"promise"');
  });
});

describe('apply', () => {
  // 23:00 on Day 2.
  const at = { messageId: 'r1', take: 0, kind: 'turn' as const, clock: 1440 + 23 * 60 };
  const deps = (set: (p: TextPromise | null) => void) => ({ journal, player: P, standing: null, setLight: () => ({ ok: true as const, text: '' }), db, promise: { places: new Set([HOME]), set } });

  it("a time promise resolves past the reply's clock", () => {
    const got: (TextPromise | null)[] = [];
    const r = applyScribe(deps((p) => got.push(p)), { ...empty, promise: { at: '10:00', about: 'about the job' } }, at);
    expect(got).toEqual([{ when: { at: 2880 + 600 }, about: 'about the job', from: 'r1', since: 1440 + 23 * 60 }]);
    expect(r.applied).toContain('promise set: at 10:00, about the job');
  });
  it("a time just reached is now, not tomorrow (live check: 'in bed' at 05:40 resolved to the next day)", () => {
    const got: (TextPromise | null)[] = [];
    const now = { ...at, clock: 1440 + 5 * 60 + 40 };
    applyScribe(deps((p) => got.push(p)), { ...empty, promise: { at: '05:40', about: 'in bed' } }, now);
    applyScribe(deps((p) => got.push(p)), { ...empty, promise: { at: '05:20', about: 'in bed' } }, now);
    expect(got.map((p) => (p && 'at' in p.when ? p.when.at : null))).toEqual([1440 + 5 * 60 + 40, 1440 + 5 * 60 + 20]);
  });

  it('a place promise is set under the reply', () => {
    let stamped: string | null = null;
    const got: (TextPromise | null)[] = [];
    applyScribe(deps((p) => (got.push(p), (stamped = db.stamp().messageId))), { ...empty, promise: { place: HOME, about: "that she's home" } }, at);
    expect(got).toEqual([{ when: { place: HOME }, about: "that she's home", from: 'r1', since: 1440 + 23 * 60 }]);
    expect(stamped).toBe('r1');
  });
  it('an unknown place is refused; cancel deletes', () => {
    const got: (TextPromise | null)[] = [];
    const r = applyScribe(deps((p) => got.push(p)), { ...empty, promise: { place: 'nowhere', about: 'x' } }, at);
    expect(r.refused).toContain("promise refused: nowhere isn't a map place");
    expect(applyScribe(deps((p) => got.push(p)), { ...empty, promise: { cancel: true } }, at).applied).toContain('promise cancelled');
    expect(got).toEqual([null]);
  });
});

describe('when promises apply', () => {
  const reply = { id: 'a', role: 'agent', text: '', toolLines: [], ts: 1, status: 'ok', clock: 1300 } as ChatMessage;
  const line = (o: Partial<ChatMessage> = {}) => ({ id: 'u', role: 'user', text: '', toolLines: [], ts: 0, status: 'ok', ...o }) as ChatMessage;
  it('a stamped in-character reply, on comms too; not OOC, not her goodbye', () => {
    expect(promisesApply(reply, line())).toBe(true);
    expect(promisesApply(reply, line({ mode: 'text' }))).toBe(true);
    expect(promisesApply({ ...reply, clock: undefined }, line())).toBe(false);
    expect(promisesApply(reply, line({ mode: 'ooc' }))).toBe(false);
    expect(promisesApply(reply, line({ mode: 'end', leave: true, parting: 'her' }))).toBe(false);
  });
});
