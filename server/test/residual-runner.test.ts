import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb, type Db } from '../src/db';
import { Journal } from '../src/journal';
import { standingControl, storedStanding } from '../src/standing';
import { DEFAULT_SHARED_STANDING } from '../../shared/standing';
import { plansApply, ResidualRunner, RESIDUAL_BACKLOG, RESIDUAL_RUNS_KEPT, RESIDUAL_TIMEOUT_MS, RESIDUAL_WAIT_MS, type ResidualRunnerDeps } from '../src/residual-runner';
import type { CompletionMessage } from '../src/turn';
import { readSummary } from '../src/summary';
import { readHabits, writeHabits } from '../src/habits';
import type { ChatMessage } from '../../shared/types';
import { cipherKey, foldCipher, parseCipherEvents, type CipherState } from '../../shared/cipher';

const P = 'hicks';
let db: Db;
let journal: Journal;
let calls: { messages: CompletionMessage[]; maxTokens: number; signal: AbortSignal }[];
let answers: (() => Promise<{ text: string; tokensIn?: number; tokensOut?: number }>)[];
let logs: string[];
let clock: number;
let seq: number;

const add = (role: 'user' | 'agent', text: string): ChatMessage => {
  const m: ChatMessage = { id: `m${++seq}`, role, text, toolLines: [], ts: 1000 * seq, status: 'ok' };
  db.insertMessage(P, m);
  return m;
};
/** One exchange: the player's line and her reply; returns her reply. */
const exchange = (said: string, reply: string) => {
  add('user', said);
  return add('agent', reply);
};
const deferred = () => {
  let resolve!: (v: { text: string }) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<{ text: string }>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const answer = (o: object) => () => Promise.resolve({ text: JSON.stringify(o), tokensIn: 100, tokensOut: 20 });
const noteAdd = (text: string, pin = false) => ({ notes: [{ op: 'add', about: 'you', text, keys: [], pin }] });

function runner(over: Partial<ResidualRunnerDeps> = {}) {
  const d: ResidualRunnerDeps = {
    db,
    journal,
    selfName: 'Nix',
    selfPronoun: 'she',
    playerName: () => 'Hicks',
    roomLine: () => '[room: the stall]',
    standing: () => standingControl({ db, player: () => P, start: () => ({ trust: 0, warmth: 0 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING }),
    standingLine: () => 'trust 0 · warmth 0',
    setLight: () => ({ ok: true, text: 'applied' }),
    complete: async (messages, o) => {
      calls.push({ messages, ...o });
      const next = answers.shift();
      return next ? next() : { text: '{"notes":[]}' };
    },
    log: (l) => logs.push(l),
    now: () => clock,
    ...over,
  };
  return new ResidualRunner(d);
}

beforeEach(() => {
  db = openDb(':memory:', { defaultPlayer: P });
  journal = new Journal(db, () => 1);
  calls = [];
  answers = [];
  logs = [];
  clock = 0;
  seq = 0;
});
afterEach(() => {
  vi.useRealTimers();
  db.close();
});

describe('ResidualRunner', () => {
  it('runs after a reply, writes its notes and moves through', async () => {
    const r = runner();
    const a1 = exchange('I paid off Teo', 'All of it?');
    answers.push(answer(noteAdd('Hicks paid Teo off')));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    expect(journal.notes(P).map((n) => n.text)).toEqual(['Hicks paid Teo off']);
    expect(calls[0].maxTokens).toBe(600);
    expect(calls[0].messages[1].content).toContain('Hicks: I paid off Teo');
    expect(JSON.parse(db.getMeta(`scribe.${P}.through`)!)).toEqual({ id: a1.id, take: 0 });
    // The next run reads only what came after.
    const a2 = exchange('and the valve?', 'Cracked.');
    r.afterTurn(P, { id: a2.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls[1].messages[1].content).not.toContain('I paid off Teo');
    expect(calls[1].messages[1].content).toContain('Hicks: and the valve?');
  });

  it('an end turn asks for 1800 tokens and writes the recap', async () => {
    const r = runner();
    const a1 = exchange('goodnight', 'Night.');
    answers.push(answer({ notes: [], recap: 'We said goodnight.' }));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'end');
    await r.wait();
    expect(calls[0].maxTokens).toBe(1800);
    expect(journal.recap(P).text).toBe('We said goodnight.');
  });

  it('late residual stamps the old reply', async () => {
    const d = deferred();
    const r = runner();
    const a1 = exchange('one', 'reply one');
    answers.push(() => d.promise);
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    // The player answered and her next reply is streaming before the Residual comes back.
    const a2 = exchange('two', 'reply two');
    db.setReplyStamp({ messageId: a2.id, take: 0 });
    d.resolve({ text: JSON.stringify(noteAdd('from reply one')) });
    await r.wait();
    expect(db.writes().filter((w) => w.kind === 'note').at(-1)).toMatchObject({ messageId: a1.id, take: 0 });
    expect(db.stamp()).toEqual({ messageId: a2.id, take: 0 });
  });

  it('wait resolves at 8 s when still running', async () => {
    vi.useFakeTimers();
    const r = runner();
    const a1 = exchange('one', 'reply one');
    answers.push(() => new Promise(() => {}));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    let done = false;
    void r.wait().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(RESIDUAL_WAIT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('takeReplaced aborts and drops a late answer', async () => {
    const d = deferred();
    const r = runner();
    const a1 = exchange('one', 'reply one');
    answers.push(() => d.promise);
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await Promise.resolve();
    r.takeReplaced(a1.id);
    expect(calls[0].signal.aborted).toBe(true);
    d.resolve({ text: JSON.stringify(noteAdd('stale')) });
    await r.wait();
    expect(journal.notes(P)).toEqual([]);
    expect(db.residualRuns(10)[0]).toMatchObject({ error: 'dropped: take replaced' });
    expect(db.getMeta(`scribe.${P}.through`)).toBeNull();
  });

  it('a failed run writes nothing and the next run covers both exchanges', async () => {
    const r = runner();
    const a1 = exchange('first thing', 'reply one');
    answers.push(() => Promise.resolve({ text: 'I cannot help with that.' }));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    expect(db.getMeta(`scribe.${P}.through`)).toBeNull();
    expect(db.residualRuns(1)[0]).toMatchObject({ error: 'answer: not JSON' });
    const a2 = exchange('second thing', 'reply two');
    r.afterTurn(P, { id: a2.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls[1].messages[1].content).toContain('Hicks: first thing');
    expect(calls[1].messages[1].content).toContain('Hicks: second thing');
  });

  it(`backlog over ${RESIDUAL_BACKLOG} covers the newest ${RESIDUAL_BACKLOG} and logs the gap`, async () => {
    const r = runner();
    let last!: ChatMessage;
    for (let i = 1; i <= 9; i++) last = exchange(`line ${i}`, `reply ${i}`);
    r.afterTurn(P, { id: last.id, take: 0 }, 'turn');
    await r.wait();
    const content = calls[0].messages[1].content;
    expect(content).not.toContain('line 3');
    expect(content).toContain('Hicks: line 4');
    expect(content).toContain('Hicks: line 9');
    expect(logs).toContain('residual · backlog: 3 exchanges skipped');
  });

  it('continue re-reads the reply', async () => {
    const r = runner();
    const a1 = exchange('tell me', 'Well');
    answers.push(answer({ notes: [], standing: { trust: 1, warmth: 0, reason: 'r' } }));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    db.updateMessage(P, a1.id, { text: 'Well, it was the valve all along.' });
    answers.push(answer({ notes: [], standing: { trust: 1, warmth: 0, reason: 'r' } }));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls[1].messages[1].content).toContain('Nix: Well, it was the valve all along.');
    expect(storedStanding(db, P, null)!.trust).toBe(1);
  });

  it(`keeps the newest ${RESIDUAL_RUNS_KEPT} runs`, () => {
    for (let i = 0; i < RESIDUAL_RUNS_KEPT + 5; i++) {
      db.insertResidualRun({ at: i, kind: 'turn', player: P, messageId: 'm', take: 0, ms: 1, tokensIn: null, tokensOut: null, raw: null, applied: [], refused: [], error: null });
    }
    const runs = db.residualRuns(1000);
    expect(runs).toHaveLength(RESIDUAL_RUNS_KEPT);
    expect(runs[0].at).toBe(RESIDUAL_RUNS_KEPT + 4);
  });

  it('logs one dev line: residual · 3 notes · trust +1 · 1 refused (pin cap) · 1.4 s', async () => {
    for (let i = 0; i < 8; i++) journal.note(P, { text: `pin ${i}`, pinned: true }, 'agent');
    const r = runner({
      complete: async () => {
        clock += 1400;
        return { text: JSON.stringify({ notes: [noteAdd('a').notes[0], noteAdd('b').notes[0], noteAdd('c', true).notes[0]], standing: { trust: 1, warmth: 0, reason: 'r' } }) };
      },
    });
    const a1 = exchange('x', 'y');
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    expect(logs.at(-1)).toBe('residual · 3 notes · trust +1 · 1 refused (pin cap) · 1.4 s');
  });

  it('a database closed while the call is out (a load or branch) ends the run quietly', async () => {
    const d = deferred();
    const r = runner();
    const a1 = exchange('one', 'reply one');
    answers.push(() => d.promise);
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    db.close();
    d.resolve({ text: JSON.stringify(noteAdd('late')) });
    await r.wait();
    expect(logs.at(-1)).toMatch(/^residual · failed: /);
    db = openDb(':memory:', { defaultPlayer: P }); // afterEach closes it
  });

  it('takes collapsed while it runs (the player answered after a regenerate): writes land on take 0 (review C1)', async () => {
    const d = deferred();
    const r = runner();
    const a1 = exchange('one', 'take zero');
    db.setTakes(P, a1.id, [{ text: 'take zero', toolLines: [], ts: 1 }, { text: 'take one', toolLines: [], ts: 2 }], 1);
    answers.push(() => d.promise);
    r.afterTurn(P, { id: a1.id, take: 1 }, 'turn');
    db.collapseTakes(a1.id, 1);
    db.setTakes(P, a1.id, null, 0);
    r.takesCollapsed(a1.id, 1);
    d.resolve({ text: JSON.stringify(noteAdd('kept')) });
    await r.wait();
    expect(db.writes().filter((w) => w.kind === 'note').at(-1)).toMatchObject({ messageId: a1.id, take: 0 });
    db.rebuild();
    expect(journal.notes(P).map((n) => n.text)).toEqual(['kept']);
  });

  it('an answer for a take that is no longer shown is dropped (review C1 backstop)', async () => {
    const r = runner();
    const a1 = exchange('one', 'take zero');
    db.setTakes(P, a1.id, [{ text: 'take zero', toolLines: [], ts: 1 }, { text: 'take one', toolLines: [], ts: 2 }], 0);
    answers.push(answer(noteAdd('for take one')));
    r.afterTurn(P, { id: a1.id, take: 1 }, 'turn');
    await r.wait();
    expect(journal.notes(P)).toEqual([]);
    expect(db.residualRuns(1)[0].error).toBe('dropped: take replaced');
  });

  it('jobs queue per player, and a pending end is never replaced by a turn (review I1)', async () => {
    const d = deferred();
    const r = runner({ playerName: (id) => (id === P ? 'Hicks' : 'Cass') });
    const a1 = exchange('one', 'reply one');
    answers.push(() => d.promise, answer({ notes: [], recap: 'the end' }), answer(noteAdd('cass note')));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    const a2 = exchange('bye', 'night');
    r.afterTurn(P, { id: a2.id, take: 0 }, 'end');
    const a3 = exchange('again', 'hm');
    r.afterTurn(P, { id: a3.id, take: 0 }, 'turn');
    db.insertMessage('cass', { id: 'c1', role: 'user', text: 'hi', toolLines: [], ts: 99_000, status: 'ok' });
    db.insertMessage('cass', { id: 'c2', role: 'agent', text: 'yo', toolLines: [], ts: 99_001, status: 'ok' });
    r.afterTurn('cass', { id: 'c2', take: 0 }, 'turn');
    d.resolve({ text: '{"notes":[]}' });
    await r.wait();
    expect(calls.map((c) => c.maxTokens)).toEqual([600, 1800, 600]);
    expect(calls[1].messages[1].content).toContain('Hicks: again');
    expect(calls[2].messages[1].content).toContain('Cass: hi');
    expect(journal.recap(P).text).toBe('the end');
  });

  it('applies inside the around hook with the reply it read (review I3)', async () => {
    const seen: string[] = [];
    const r = runner({ around: (player, messageId, fn) => (seen.push(`${player}:${messageId}`), fn()) });
    const a1 = exchange('one', 'reply one');
    answers.push(answer(noteAdd('x')));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    expect(seen).toEqual([`${P}:${a1.id}`]);
  });

  it('a call that never settles times out and the next job still runs (review I4)', async () => {
    vi.useFakeTimers();
    const r = runner();
    const a1 = exchange('one', 'reply one');
    answers.push(() => new Promise(() => {}), answer(noteAdd('next')));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    const a2 = exchange('two', 'reply two');
    r.afterTurn(P, { id: a2.id, take: 0 }, 'turn');
    await vi.advanceTimersByTimeAsync(RESIDUAL_TIMEOUT_MS);
    await r.wait();
    expect(db.residualRuns(10).map((x) => x.error)).toEqual([null, 'call failed: timeout']);
    expect(journal.notes(P).map((n) => n.text)).toEqual(['next']);
  });

  it("with NIX_TOOL_TRACE set, every write and the run's end go to the trace (chat-stress)", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'residual-trace-')), 'trace.jsonl');
    process.env.NIX_TOOL_TRACE = file;
    try {
      const r = runner();
      const a1 = exchange('one', 'reply one');
      answers.push(answer({ ...noteAdd('x'), lights: [{ id: 'lamp', intensity: 0 }] }));
      r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
      await r.wait();
    } finally {
      delete process.env.NIX_TOOL_TRACE;
    }
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { name: string; args: string; out: string });
    expect(lines.map((l) => l.name)).toEqual(['residual:note', 'residual:light', 'residual']);
    expect(lines[2].out).toMatch(/^residual · 1 note · 1 light · /);
  });

  it('after the Residual, writes the summary when the next turn would drop lines, stamped to that reply (scribe spec §6)', async () => {
    const r = runner();
    let last!: ChatMessage;
    for (let i = 0; i < 20; i++) last = exchange(`line ${i}`, `reply ${i}`);
    db.setMeta(`scribe.${P}.through`, JSON.stringify({ id: db.allMessages(P).at(-3)!.id, take: 0 }));
    // Habits are up to date: only the turn run and the summary call.
    writeHabits(db, P, { rules: [], through: last.id });
    answers.push(answer({ notes: [] }), () => Promise.resolve({ text: 'They talked for a long time.' }));
    r.afterTurn(P, { id: last.id, take: 0 }, 'turn');
    await r.waitAll();
    expect(calls).toHaveLength(2);
    expect(calls[1].messages[1].content).toContain('Hicks: line 0');
    expect(calls[1].messages[1].content).toContain('Nix: reply 9');
    expect(calls[1].messages[1].content).not.toContain('line 10');
    const all = db.allMessages(P);
    expect(readSummary(db, P)).toEqual({ text: 'They talked for a long time.', through: all[19].id });
    expect(db.writes().filter((w) => w.key === `summary.${P}`).at(-1)).toMatchObject({ messageId: last.id, take: 0 });
    expect(db.residualRuns(1)[0]).toMatchObject({ kind: 'summary', error: null });
  });

  it('the Residual and the summary read a sent photo as its caption (photos spec §4)', async () => {
    const r = runner({ photoCaption: (id) => (id === 'roof' ? 'selfie on the roof' : null) });
    let last!: ChatMessage;
    db.insertMessage(P, { id: `m${++seq}`, role: 'agent', text: 'look\n[photo: roof]', toolLines: [], ts: 1000 * seq, status: 'ok', mode: 'text' });
    for (let i = 0; i < 20; i++) last = exchange(`line ${i}`, `reply ${i}`);
    db.insertMessage(P, { id: `m${++seq}`, role: 'user', text: 'pic?', toolLines: [], ts: 1000 * seq, status: 'ok', mode: 'text' });
    last = { id: `m${++seq}`, role: 'agent', text: '[photo: roof]', toolLines: [], ts: 1000 * seq, status: 'ok', mode: 'text' };
    db.insertMessage(P, last);
    db.setMeta(`scribe.${P}.through`, JSON.stringify({ id: db.allMessages(P).at(-3)!.id, take: 0 }));
    answers.push(answer({ notes: [] }), () => Promise.resolve({ text: 'They texted.' }));
    r.afterTurn(P, { id: last.id, take: 0 }, 'turn');
    await r.waitAll();
    expect(calls[0].messages[1].content).toContain('(by text) (sent a photo: selfie on the roof)');
    expect(calls[1].messages[1].content).toContain('(sent a photo: selfie on the roof)');
    for (const c of calls) expect(c.messages[1].content).not.toContain('[photo:');
  });

  it("the summary never reads a promised text's hidden line as yours (promised texts mid review I2)", async () => {
    const r = runner();
    let last!: ChatMessage;
    db.insertMessage(P, { id: `m${++seq}`, role: 'user', text: "[you told Hicks you'd text — it's 22:00. Text them now.]", toolLines: [], ts: 1000 * seq, status: 'ok', mode: 'text', promised: true });
    for (let i = 0; i < 20; i++) last = exchange(`line ${i}`, `reply ${i}`);
    db.setMeta(`scribe.${P}.through`, JSON.stringify({ id: db.allMessages(P).at(-3)!.id, take: 0 }));
    writeHabits(db, P, { rules: [], through: last.id });
    answers.push(answer({ notes: [] }), () => Promise.resolve({ text: 'They talked.' }));
    r.afterTurn(P, { id: last.id, take: 0 }, 'turn');
    await r.waitAll();
    expect(calls).toHaveLength(2);
    expect(calls[1].messages[1].content).not.toContain('you told Hicks');
  });

  it('a long save with no summary yet: the first summary reads the last 40 dropped lines of the relay\'s 500-line window (final review I3, I4)', async () => {
    const r = runner();
    let last!: ChatMessage;
    for (let i = 0; i < 263; i++) last = exchange(`line ${i}`, `reply ${i}`);
    db.setMeta(`scribe.${P}.through`, JSON.stringify({ id: db.allMessages(P).at(-3)!.id, take: 0 }));
    answers.push(answer({ notes: [] }), () => Promise.resolve({ text: 'A long night.' }));
    r.afterTurn(P, { id: last.id, take: 0 }, 'turn');
    await r.waitAll();
    const lines = calls[1].messages[1].content.split('\n').filter((l) => /^(Hicks|Nix): /.test(l));
    expect(lines.length).toBeLessThanOrEqual(40);
    expect(lines.length).toBeGreaterThan(0);
    // The relay sends the newest 500 messages (from line 13 on): what it would drop starts there.
    const window = db.recentMessages(P, 500);
    const through = readSummary(db, P)!.through;
    const dropAt = window.findIndex((m) => m.id === through);
    expect(dropAt).toBeGreaterThanOrEqual(0);
  });

  it('a turn waits for the Residual only, not the summary after it (final review M2)', async () => {
    const r = runner();
    let last!: ChatMessage;
    for (let i = 0; i < 20; i++) last = exchange(`line ${i}`, `reply ${i}`);
    db.setMeta(`scribe.${P}.through`, JSON.stringify({ id: db.allMessages(P).at(-3)!.id, take: 0 }));
    answers.push(answer(noteAdd('noted')), () => new Promise(() => {}));
    r.afterTurn(P, { id: last.id, take: 0 }, 'turn');
    const t0 = Date.now();
    await r.wait(2_000);
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(journal.notes(P).map((n) => n.text)).toEqual(['noted']);
    r.abortAll();
  });

  it('a run with nothing to read still ends its trace (final review M6)', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'residual-trace-')), 'trace.jsonl');
    process.env.NIX_TOOL_TRACE = file;
    try {
      const r = runner();
      const a1 = add('agent', '');
      r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
      await r.wait();
    } finally {
      delete process.env.NIX_TOOL_TRACE;
    }
    expect(fs.readFileSync(file, 'utf8')).toContain('"name":"residual"');
  });

  it('no summary call while nothing would drop', async () => {
    const r = runner();
    const a1 = exchange('one', 'reply one');
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls).toHaveLength(1);
  });

  it("her own light calls this turn: the Residual's light fixes are refused (hand-check 2026-10-16)", async () => {
    const lit: string[] = [];
    const r = runner({ setLight: (_p, id) => (lit.push(id), { ok: true, text: 'applied' }) });
    add('user', 'bring the lights down');
    const a1: ChatMessage = { id: `m${++seq}`, role: 'agent', text: '*dims the lamp*', toolLines: ['// SET_LIGHT · DESK LAMP · 20%'], ts: 1000 * seq, status: 'ok' };
    db.insertMessage(P, a1);
    answers.push(answer({ notes: [], lights: [{ id: 'desk_lamp', intensity: 0.05 }] }));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    expect(lit).toEqual([]);
    expect(db.residualRuns(1)[0].refused).toEqual(['light desk_lamp refused: she changed the lights herself this turn']);
  });

  it('a second afterTurn while one runs waits its turn, and wait covers both', async () => {
    const d = deferred();
    const r = runner();
    const a1 = exchange('one', 'reply one');
    answers.push(() => d.promise, answer(noteAdd('two')));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    const a2 = exchange('two', 'reply two');
    r.afterTurn(P, { id: a2.id, take: 0 }, 'turn');
    expect(calls).toHaveLength(1);
    d.resolve({ text: JSON.stringify(noteAdd('one')) });
    await r.wait();
    expect(journal.notes(P).map((n) => n.text).sort()).toEqual(['one', 'two']);
  });
});

describe('time backstop (spec 2026-10-20)', () => {
  /** Her line and reply stamped at `clock` (playtest c7f7d4ac: Day 3, 19:10). */
  const stamped = (clock: number) => {
    const u: ChatMessage = { id: `m${++seq}`, role: 'user', text: '*he waits an hour and at 20:00 heads down to Hae\'s*', toolLines: [], ts: 1000 * seq, status: 'ok', clock };
    db.insertMessage(P, u);
    const a: ChatMessage = { id: `m${++seq}`, role: 'agent', text: '*20:00. Shift starts.* … *01:15. The rain picks up.*', toolLines: [], ts: 1000 * seq, status: 'ok', replyTo: u.id, clock };
    db.insertMessage(P, a);
    return a;
  };
  const moves: { id: string; take: number; minutes: number }[] = [];
  const passTime: ResidualRunnerDeps['passTime'] = (_p, r, minutes) => {
    moves.push({ ...r, minutes });
    db.updateMessage(P, r.id, { clock: db.getMessage(P, r.id)!.clock! + minutes });
    return { ok: true, text: '' };
  };
  beforeEach(() => (moves.length = 0));

  it("playtest c7f7d4ac: a reply at Day 3 19:10 that ran the night to 01:15 is moved to Day 4 01:15", async () => {
    const r = runner({ passTime });
    const a = stamped(4030);
    answers.push(answer({ notes: [], time: { until: '01:15' } }));
    r.afterTurn(P, { id: a.id, take: 0 }, 'turn');
    await r.wait();
    expect(db.getMessage(P, a.id)!.clock).toBe(4395);
    expect(moves).toEqual([{ id: a.id, take: 0, minutes: 365 }]);
    expect(calls[0].messages[1].content).toContain('[clock: Day 3, Sat 19:10]');
    expect(logs.at(-1)).toContain('time +365');
    expect(db.residualRuns(1, P)[0].applied).toContain('time +365 → Day 4, Sun 01:15');
  });

  it('an ordinary turn answering time null moves nothing', async () => {
    const r = runner({ passTime });
    const a = stamped(4030);
    answers.push(answer({ notes: [], time: null }));
    r.afterTurn(P, { id: a.id, take: 0 }, 'turn');
    await r.wait();
    expect(moves).toEqual([]);
    expect(db.getMessage(P, a.id)!.clock).toBe(4030);
    expect(logs.at(-1)).toContain('nothing to write');
  });

  it('her own pass_time this turn stands: the Residual only backstops a skip she told but didn\'t pass (chat-stress 2026-10-20)', async () => {
    const r = runner({ passTime });
    const a = stamped(1500);
    // She passed till dawn herself: her reply sits past its line.
    db.updateMessage(P, a.id, { clock: 1800 });
    answers.push(answer({ notes: [], time: { until: '06:30' } }));
    r.afterTurn(P, { id: a.id, take: 0 }, 'turn');
    await r.wait();
    expect(moves).toEqual([]);
    expect(db.getMessage(P, a.id)!.clock).toBe(1800);
    expect(db.residualRuns(1, P)[0].refused).toContain('time ignored: she passed time herself this turn');
  });

  it('an ignored or refused hour shows in the dev line as time', async () => {
    const r = runner({ passTime });
    const a = stamped(4030);
    answers.push(answer({ notes: [], time: { until: '18:00' } }));
    r.afterTurn(P, { id: a.id, take: 0 }, 'turn');
    await r.wait();
    expect(moves).toEqual([]);
    expect(logs.at(-1)).toMatch(/1 refused \(time\)/);
  });
});

describe('her plan (her plans spec §4)', () => {
  const HOME = 'karasu/nix-home';
  const HAES = 'karasu/noodle-stall';
  const places = [{ id: HOME, name: "Nix's flat" }, { id: HAES, name: "Hae's Noodles" }];
  const stamped = (clock: number) => {
    const u: ChatMessage = { id: `m${++seq}`, role: 'user', text: 'Hungry?', toolLines: [], ts: 1000 * seq, status: 'ok', clock };
    db.insertMessage(P, u);
    const a: ChatMessage = { id: `m${++seq}`, role: 'agent', text: "I'll go home and shower. Hae's at nine.", toolLines: [], ts: 1000 * seq, status: 'ok', replyTo: u.id, clock };
    db.insertMessage(P, a);
    return a;
  };
  const going = { plan: { going: { place: HOME, until: null }, meet: { place: HAES, at: '21:00' } } };

  it('a promise made in a promised text resolves from the story clock now, not that text\'s past minute (minor 4)', async () => {
    const r = runner({ promise: () => ({ places }), storyClock: () => 1440 + 23 * 60 });
    const u: ChatMessage = { id: `m${++seq}`, role: 'user', text: '[you told Hicks]', toolLines: [], ts: 1000 * seq, status: 'ok', mode: 'text', promised: true, clock: 1440 + 16 * 60 };
    db.insertMessage(P, u);
    const t: ChatMessage = { id: `m${++seq}`, role: 'agent', text: 'home. text you at 20:00', toolLines: [], ts: 1000 * seq, status: 'ok', replyTo: u.id, clock: 1440 + 16 * 60, mode: 'text' };
    db.insertMessage(P, t);
    answers.push(answer({ notes: [], promise: { at: '20:00', about: 'again' } }));
    r.afterTurn(P, { id: t.id, take: 0 }, 'turn');
    await r.wait();
    // 23:00 now: 20:00 is tomorrow's, not this afternoon's.
    expect(JSON.parse(db.getMeta('promise.hicks')!).when).toEqual({ at: 2880 + 20 * 60 });
  });

  it("the places line has the rooms of her day too, when plans also apply (deck controls e2e finding)", async () => {
    const r = runner({ plan: () => ({ places: [places[0]], onSet: () => {} }), promise: () => ({ places: [places[0], { id: 'karasu/nix-apartment', name: "Nix's Apartment" }] }) });
    const a2 = stamped(1440 + 19 * 60);
    answers.push(answer({ notes: [] }));
    r.afterTurn(P, { id: a2.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls[0].messages[1].content).toContain('karasu/nix-apartment "Nix\'s Apartment"');
  });

  it('a new promise clears the spent mark, even from the same reply re-taken (final review I1)', async () => {
    const r = runner({ promise: () => ({ places }) });
    const a2 = stamped(1440 + 19 * 60);
    db.setMeta('promisespent.hicks', a2.id);
    answers.push(answer({ notes: [], promise: { at: '22:00', about: 'again' } }));
    r.afterTurn(P, { id: a2.id, take: 0 }, 'turn');
    await r.wait();
    expect(JSON.parse(db.getMeta('promise.hicks')!).from).toBe(a2.id);
    expect(db.getMeta('promisespent.hicks')).toBeNull();
  });

  it('her day reaches the Residual when promises apply (deck controls spec §1)', async () => {
    const r = runner({ promise: () => ({ places }), herDay: () => "Nix's flat 05:00–18:00" });
    const a2 = stamped(1440 + 19 * 60);
    answers.push(answer({ notes: [] }));
    r.afterTurn(P, { id: a2.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls[0].messages[1].content).toContain("[her day: Nix's flat 05:00–18:00]");
  });

  it("a text reply's meet plan is set (deck spec §3)", async () => {
    const r = runner({ plan: () => ({ places, onSet: () => {} }) });
    const u: ChatMessage = { id: `m${++seq}`, role: 'user', text: 'tonight?', toolLines: [], ts: 1000 * seq, status: 'ok', clock: 1440 + 19 * 60, mode: 'text' };
    db.insertMessage(P, u);
    const t: ChatMessage = { id: `m${++seq}`, role: 'agent', text: "hae's at nine", toolLines: [], ts: 1000 * seq, status: 'ok', replyTo: u.id, clock: 1440 + 19 * 60, mode: 'text' };
    db.insertMessage(P, t);
    answers.push(answer({ notes: [], plan: { going: null, meet: { place: HAES, at: '21:00' } } }));
    r.afterTurn(P, { id: t.id, take: 0 }, 'turn');
    await r.wait();
    expect(JSON.parse(db.getMeta('plan.hicks')!)).toMatchObject({ meet: { place: HAES, at: 1440 + 21 * 60 }, from: t.id });
    expect(calls[0].messages[1].content).toContain("Nix: (by text) hae's at nine");
    expect(calls[0].messages[1].content).toContain('Hicks: (by text) tonight?');
  });

  it("a text reply's lights and time are left alone: she isn't in the room you're in (deck spec §4)", async () => {
    const lit: string[] = [];
    const moved: number[] = [];
    const r = runner({ setLight: (_p, id) => (lit.push(id), { ok: true, text: 'applied' }), passTime: (_p, _r, m) => (moved.push(m), { ok: true, text: 'ok' }) });
    const u: ChatMessage = { id: `m${++seq}`, role: 'user', text: 'lights off, bed', toolLines: [], ts: 1000 * seq, status: 'ok', clock: 1500, mode: 'text' };
    db.insertMessage(P, u);
    const t: ChatMessage = { id: `m${++seq}`, role: 'agent', text: 'night. see you at 6', toolLines: [], ts: 1000 * seq, status: 'ok', replyTo: u.id, clock: 1500, mode: 'text' };
    db.insertMessage(P, t);
    answers.push(answer({ notes: [], lights: [{ id: 'lamp', intensity: 0 }], time: { until: '06:00' } }));
    r.afterTurn(P, { id: t.id, take: 0 }, 'turn');
    await r.wait();
    expect(lit).toEqual([]);
    expect(moved).toEqual([]);
    expect(db.residualRuns(1, P)[0].refused).toEqual(expect.arrayContaining([expect.stringContaining('a text')]));
  });

  it('a plan in the answer is stored under her reply, and onSet hears it once', async () => {
    const set: { plan: unknown; reply: string }[] = [];
    const r = runner({ plan: () => ({ places, onSet: (plan, reply) => set.push({ plan, reply }) }) });
    const a = stamped(1440 + 19 * 60);
    answers.push(answer({ notes: [], ...going }));
    r.afterTurn(P, { id: a.id, take: 0 }, 'turn');
    await r.wait();
    const stored = JSON.parse(db.getMeta('plan.hicks')!);
    expect(stored).toEqual({ going: { place: HOME, until: 1440 + 21 * 60 }, meet: { place: HAES, at: 1440 + 21 * 60 }, from: a.id });
    expect(db.writes().find((w) => w.key === 'plan.hicks')?.messageId).toBe(a.id);
    expect(set).toEqual([{ plan: stored, reply: a.id }]);
    expect(calls[0].messages[1].content).toContain(`[places: ${HOME} "Nix's flat", ${HAES} "Hae's Noodles"]`);
  });

  it('the next run reads the standing plan back as [her plan: …], and a cancel deletes it', async () => {
    const r = runner({ plan: () => ({ places, onSet: () => {} }) });
    const a = stamped(1440 + 19 * 60);
    answers.push(answer({ notes: [], ...going }));
    r.afterTurn(P, { id: a.id, take: 0 }, 'turn');
    await r.wait();
    const b = stamped(1440 + 19 * 60 + 5);
    answers.push(answer({ notes: [], plan: { cancel: true } }));
    r.afterTurn(P, { id: b.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls[1].messages[1].content).toContain("[her plan: going Nix's flat until 21:00; meeting at Hae's Noodles 21:00]");
    expect(db.getMeta('plan.hicks')).toBeNull();
  });

  it("a plan that's over isn't listed as her plan (final review I3)", async () => {
    const r = runner({ plan: () => ({ places, onSet: () => {} }) });
    db.setMeta('plan.hicks', JSON.stringify({ going: null, meet: { place: HAES, at: 1440 + 21 * 60 }, from: 'm0' }));
    const a = stamped(1440 + 23 * 60);
    answers.push(answer({ notes: [] }));
    r.afterTurn(P, { id: a.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls[0].messages[1].content).not.toContain('[her plan:');
  });

  it("a new plan clears the old plan's seen record (final review M2)", async () => {
    const r = runner({ plan: () => ({ places, onSet: () => {} }) });
    db.setMeta('plan.hicks.seen', JSON.stringify({ from: 'm0', missed: 1 }));
    const a = stamped(1440 + 19 * 60);
    answers.push(answer({ notes: [], ...going }));
    r.afterTurn(P, { id: a.id, take: 0 }, 'turn');
    await r.wait();
    expect(db.getMeta('plan.hicks.seen')).toBeNull();
  });

  it("'here' is where her room was when the reply ended, not when the Residual runs (final review M5)", async () => {
    const r = runner({ plan: () => ({ places, here: HOME, onSet: () => {} }) });
    const a = stamped(1440 + 19 * 60);
    answers.push(answer({ notes: [], plan: { going: { place: HAES, until: null }, meet: null } }));
    r.afterTurn(P, { id: a.id, take: 0 }, 'turn', HAES);
    await r.wait();
    expect(db.getMeta('plan.hicks')).toBeNull();
  });

  it('plans off for this reply (null): no places line, nothing stored', async () => {
    const r = runner({ plan: () => null });
    const a = stamped(1440 + 19 * 60);
    answers.push(answer({ notes: [], ...going }));
    r.afterTurn(P, { id: a.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls[0].messages[1].content).not.toContain('[places:');
    expect(db.getMeta('plan.hicks')).toBeNull();
  });
});

describe('when plans apply (her plans spec §4)', () => {
  const reply = { id: 'a', role: 'agent', text: '', toolLines: [], ts: 1, status: 'ok', clock: 1300 } as ChatMessage;
  const line = (o: Partial<ChatMessage> = {}) => ({ id: 'u', role: 'user', text: '', toolLines: [], ts: 0, status: 'ok', ...o }) as ChatMessage;
  it('a stamped in-character reply, off comms', () => {
    expect(plansApply(reply, line(), false)).toBe(true);
    expect(plansApply({ ...reply, clock: undefined }, line(), false)).toBe(false);
    expect(plansApply(reply, line({ mode: 'ooc' }), false)).toBe(false);
    expect(plansApply(reply, line(), true)).toBe(false);
  });
  it('a text line plans even with comms on (deck spec §3)', () => {
    expect(plansApply(reply, line({ mode: 'text' }), true)).toBe(true);
  });
  it('never her goodbye when she leaves: it would replace the plan she left on (final review I2)', () => {
    expect(plansApply(reply, line({ mode: 'end', leave: true, parting: 'her' }), false)).toBe(false);
  });
});

describe('cipher in the turn run (cipher spec §2.3–2.4)', () => {
  const state = (): CipherState =>
    foldCipher([parseCipherEvents(db.getMeta(cipherKey(P))), [{ t: 'truth', id: 'nix-1', kind: 'place', truth: 'The stall is a drop.', knownBy: ['nix'], comesOutWhen: 'you see the drop', changes: 'c', clueIdeas: 'i', seq: 1 }]], 7);

  it('sends the open truths as [cipher: …], writes a clue under the reply, and a rewind takes it back', async () => {
    const r = runner({ cipher: state, sceneId: () => 'karasu/noodle-stall' });
    const a1 = exchange('look under the register', '*She slides a thick envelope out of sight.*');
    answers.push(answer({ notes: [], cipher: { clues: [{ id: 'T1', text: 'a thick envelope' }], learned: [] } }));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls[0].messages[1].content).toContain('[cipher: T1 · The stall is a drop. · comes out when you see the drop]');
    const evs = parseCipherEvents(db.getMeta(cipherKey(P)));
    expect(evs).toEqual([expect.objectContaining({ t: 'clue', id: 'nix-1', messageId: a1.id, place: 'karasu/noodle-stall', onPage: true })]);
    expect(logs.at(-1)).toContain('1 clue');
    const a0 = db.allMessages(P)[0];
    db.cutAfter(P, a0.id);
    expect(db.getMeta(cipherKey(P))).toBeNull();
  });

  it('no open truths: no [cipher: …] line', async () => {
    const r = runner({ cipher: () => foldCipher([], 7) });
    const a1 = exchange('hi', 'Hey.');
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls[0].messages[1].content).not.toContain('[cipher:');
  });

  it("a clue in the narrator's event is on the page (review I1)", async () => {
    const r = runner({ cipher: state, sceneId: () => 'karasu/noodle-stall' });
    db.insertMessage(P, { id: 'e1', role: 'user', text: 'A courier drops a thick envelope at the stall.', toolLines: [], ts: 500, status: 'ok', mode: 'encounter', encounter: { title: 'Parcel' } });
    const a1 = add('agent', 'Huh.');
    answers.push(answer({ notes: [], cipher: { clues: [{ id: 'T1', text: 'a thick envelope' }], learned: [] } }));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    expect(parseCipherEvents(db.getMeta(cipherKey(P)))).toEqual([expect.objectContaining({ t: 'clue', onPage: true })]);
  });

  it("an event card reads as the Narrator's, not the player's", async () => {
    const r = runner();
    db.insertMessage(P, { id: 'e1', role: 'user', text: 'A courier drops a parcel at the stall.', toolLines: [], ts: 500, status: 'ok', mode: 'encounter', encounter: { title: 'Parcel' } });
    const a1 = add('agent', 'Huh.');
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.wait();
    expect(calls[0].messages[1].content).toMatch(/Narrator: .*courier drops a parcel/);
    expect(calls[0].messages[1].content).not.toMatch(/Hicks: .*courier/);
  });
});

describe('the cipher run (cipher spec §2.2)', () => {
  const cast = () => [{ id: 'nix', name: 'Nix', pronoun: 'she', about: 'A fixer.', secret: null }, { id: 'hae', name: 'Hae', pronoun: 'she', about: 'The stall.', secret: null }];
  const live = (replies: () => number) => () => foldCipher([parseCipherEvents(db.getMeta(cipherKey(P)))], replies());
  const truthAnswer = (truths: object[]) => answer({ truths });
  const good = { kind: 'place', truth: 'The stall is a drop.', knownBy: ['hae'], comesOutWhen: 'w', changes: 'c', clueIdeas: 'i' };
  const isCipherCall = (c: { messages: CompletionMessage[] }) => c.messages[0].content.startsWith('You keep the secrets');

  it('not due: no call', async () => {
    const r = runner({ cipher: live(() => 5), cipherCast: cast, selfId: 'nix' });
    const a1 = exchange('hi', 'Hey.');
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.waitAll();
    expect(calls.some(isCipherCall)).toBe(false);
  });

  it('due: writes a run and the truths that pass under the reply; a rewind takes them back', async () => {
    const r = runner({ cipher: live(() => 6), cipherCast: cast, selfId: 'nix' });
    const a0 = add('user', 'first');
    const a1 = add('agent', 'Hey.');
    answers.push(answer({ notes: [] }));
    answers.push(truthAnswer([good, { ...good, kind: 'self', knownBy: ['hicks'] }]));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.waitAll();
    const call = calls.find(isCipherCall)!;
    expect(call.maxTokens).toBe(1200);
    const evs = parseCipherEvents(db.getMeta(cipherKey(P)));
    expect(evs.map((e) => e.t)).toEqual(['run', 'truth']);
    expect(evs[1]).toMatchObject({ id: `nix-${a1.id}.0-1`, kind: 'place', knownBy: ['hae'] });
    const row = db.residualRuns(5).find((x) => x.kind === 'cipher')!;
    expect(row.applied).toEqual([`truth nix-${a1.id}.0-1 (place)`]);
    expect(row.refused).toEqual(['truths[1]: knownBy: the player']);
    expect(logs.some((l) => l.startsWith('residual · cipher · 1 truth (place) · 1 refused'))).toBe(true);
    db.cutAfter(P, a0.id);
    expect(db.getMeta(cipherKey(P))).toBeNull();
  });

  it('a run with every truth refused still waits refillGap', async () => {
    let replies = 6;
    const r = runner({ cipher: live(() => replies), cipherCast: cast, selfId: 'nix' });
    const a1 = exchange('hi', 'Hey.');
    answers.push(answer({ notes: [] }));
    answers.push(truthAnswer([{ ...good, knownBy: ['hicks'] }]));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.waitAll();
    expect(parseCipherEvents(db.getMeta(cipherKey(P))).map((e) => e.t)).toEqual(['run']);
    replies = 7;
    const a2 = exchange('again', 'Hm.');
    r.afterTurn(P, { id: a2.id, take: 0 }, 'turn');
    await r.waitAll();
    expect(calls.filter(isCipherCall)).toHaveLength(1);
  });

  it("a truth's id names the take it was written on, so another take's truth never shares it (final review 1)", async () => {
    const r = runner({ cipher: live(() => 6), cipherCast: cast, selfId: 'nix' });
    const a1 = exchange('hi', 'Hey.');
    answers.push(answer({ notes: [] }));
    answers.push(truthAnswer([good]));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.waitAll();
    const ids = parseCipherEvents(db.getMeta(cipherKey(P))).filter((e) => e.t === 'truth').map((e) => (e as { id: string }).id);
    expect(ids).toEqual([`nix-${a1.id}.0-1`]);
  });

  it('a failed cipher call waits 3 replies before trying again, not every reply (minor 1)', async () => {
    let replies = 6;
    const r = runner({ cipher: live(() => replies), cipherCast: cast, selfId: 'nix' });
    const turn = async (said: string) => {
      const a = exchange(said, 'Hm.');
      r.afterTurn(P, { id: a.id, take: 0 }, 'turn');
      await r.waitAll();
    };
    answers.push(answer({ notes: [] }));
    answers.push(() => Promise.reject(new Error('provider down')));
    await turn('one');
    expect(calls.filter(isCipherCall)).toHaveLength(1);
    replies = 7;
    await turn('two');
    replies = 8;
    await turn('three');
    expect(calls.filter(isCipherCall)).toHaveLength(1);
    // The failure itself writes no run: a provider blip mustn't cost the 10-reply wait.
    expect(parseCipherEvents(db.getMeta(cipherKey(P))).some((e) => e.t === 'run')).toBe(false);
    replies = 9;
    await turn('four');
    expect(calls.filter(isCipherCall)).toHaveLength(2);
  });

  it('a second truth from the same contact never reuses an id', async () => {
    db.setMeta(cipherKey(P), JSON.stringify([{ t: 'truth', id: 'nix-1', kind: 'city', truth: 'x', knownBy: [], comesOutWhen: 'w', changes: 'c', clueIdeas: 'i', seq: 1 }, { t: 'learned', id: 'nix-1', seq: 2 }]));
    const r = runner({ cipher: live(() => 6), cipherCast: cast, selfId: 'nix' });
    const a1 = exchange('hi', 'Hey.');
    answers.push(answer({ notes: [] }));
    answers.push(truthAnswer([good]));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn');
    await r.waitAll();
    expect(parseCipherEvents(db.getMeta(cipherKey(P))).filter((e) => e.t === 'truth').map((e) => (e as { id: string }).id)).toEqual(['nix-1', `nix-${a1.id}.0-1`]);
  });
});

describe('habits run (habits spec §1)', () => {
  let habitAnswers: (() => Promise<{ text: string }>)[];
  let habitCalls: CompletionMessage[][];
  const isHabits = (m: CompletionMessage[]) => m[0].content.startsWith("You read one writer's");
  /** A runner whose habits calls answer from habitAnswers; every other call gets an empty turn answer. */
  const habitsRunner = () =>
    runner({
      complete: async (messages) => {
        if (!isHabits(messages)) return { text: '{"notes":[]}' };
        habitCalls.push(messages);
        const next = habitAnswers.shift();
        return next ? next() : { text: '{"rules":[]}' };
      },
    });
  /** `k` exchanges, each followed by the Residual; returns her last reply. */
  const play = async (r: ResidualRunner, k: number, reply = (i: number) => `reply ${seq + i}`) => {
    let last!: ChatMessage;
    for (let i = 0; i < k; i++) {
      last = exchange(`line ${i}`, reply(i));
      r.afterTurn(P, { id: last.id, take: 0 }, 'turn');
      await r.waitAll();
    }
    return last;
  };
  const habitRows = () => db.residualRuns(50, P).filter((x) => x.kind === 'habits');

  beforeEach(() => {
    habitAnswers = [];
    habitCalls = [];
  });

  it('none before 8 of her replies; at the 8th the rules are written and the run recorded', async () => {
    const r = habitsRunner();
    habitAnswers.push(() => Promise.resolve({ text: '{"rules":["No glasses business"]}' }));
    await play(r, 7);
    expect(habitCalls).toHaveLength(0);
    const eighth = await play(r, 1);
    expect(readHabits(db, P)).toEqual({ rules: ['No glasses business'], through: eighth.id });
    expect(habitRows()[0]).toMatchObject({ kind: 'habits', messageId: eighth.id, applied: ['habits: 1 rules'], error: null });
    expect(logs.some((l) => l.startsWith('residual · habits · 1 rules'))).toBe(true);
  });

  it('the next run waits 12 more of her replies', async () => {
    const r = habitsRunner();
    await play(r, 8);
    await play(r, 11);
    expect(habitCalls).toHaveLength(1);
    await play(r, 1);
    expect(habitCalls).toHaveLength(2);
  });

  it('a failed call writes nothing and waits 3 replies', async () => {
    const r = habitsRunner();
    habitAnswers.push(() => Promise.reject(new Error('provider down')));
    await play(r, 8);
    expect(readHabits(db, P)).toBeNull();
    expect(habitRows()[0].error).toMatch(/^call failed/);
    await play(r, 2);
    expect(habitCalls).toHaveLength(1);
    await play(r, 1);
    expect(habitCalls).toHaveLength(2);
  });

  it('an answer that is no list writes nothing and waits too', async () => {
    const r = habitsRunner();
    habitAnswers.push(() => Promise.resolve({ text: 'I see no habits.' }));
    await play(r, 8);
    expect(readHabits(db, P)).toBeNull();
    expect(habitRows()[0].error).toBe('answer: not JSON');
    await play(r, 2);
    expect(habitCalls).toHaveLength(1);
  });

  it('a take replaced while the call is out drops the answer', async () => {
    const r = habitsRunner();
    const d = deferred();
    habitAnswers.push(() => d.promise);
    await play(r, 7);
    const last = exchange('line', 'reply');
    r.afterTurn(P, { id: last.id, take: 0 }, 'turn');
    await vi.waitFor(() => expect(habitCalls).toHaveLength(1));
    r.takeReplaced(last.id);
    d.resolve({ text: '{"rules":["A"]}' });
    await r.waitAll();
    expect(readHabits(db, P)).toBeNull();
    expect(habitRows()[0].error).toBe('dropped: take replaced');
  });

  it('a rule that quotes her is refused, the rest kept', async () => {
    const r = habitsRunner();
    habitAnswers.push(() => Promise.resolve({ text: '["A","Stop: pushes his glasses up"]' }));
    await play(r, 8, () => '*pushes his glasses up* Sure.');
    expect(readHabits(db, P)!.rules).toEqual(['A']);
    expect(habitRows()[0].refused).toEqual(['habits: rule 2 quotes her']);
  });

  it('an empty list clears the one in place', async () => {
    const r = habitsRunner();
    habitAnswers.push(() => Promise.resolve({ text: '{"rules":["A"]}' }), () => Promise.resolve({ text: '{"rules":[]}' }));
    await play(r, 8);
    expect(readHabits(db, P)!.rules).toEqual(['A']);
    await play(r, 12);
    expect(readHabits(db, P)!.rules).toEqual([]);
  });

  it('reads only up to its own reply, not one that landed while it ran (task 3 review I1)', async () => {
    const r = habitsRunner();
    await play(r, 7);
    const eighth = exchange('line 8', 'reply eight');
    r.afterTurn(P, { id: eighth.id, take: 0 }, 'turn');
    exchange('the next line', 'the next reply');
    await r.waitAll();
    expect(readHabits(db, P)!.through).toBe(eighth.id);
    expect(habitCalls[0][1].content).not.toContain('the next');
  });

  it('reads her lines and theirs, and the rules in place', async () => {
    const r = habitsRunner();
    habitAnswers.push(() => Promise.resolve({ text: '{"rules":["No glasses business"]}' }));
    await play(r, 20);
    const user = habitCalls[1][1].content;
    expect(user).toContain('No glasses business');
    expect(user).toContain('Nix: reply');
    expect(user).toContain('Hicks: line');
  });
});
