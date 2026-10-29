import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../shared/types';
import { openDb } from '../src/db';
import { buildMessages, HISTORY_MAX_MESSAGES, HISTORY_STEP } from '../src/history';
import { JOBS_APART } from '../src/instructions';
import { readSummary, SUMMARY_KEEP, SUMMARY_LINE, SUMMARY_MAX, summaryDue, summaryMessages, writeSummary } from '../src/summary';

let n = 0;
const msg = (role: 'user' | 'agent', text: string): ChatMessage => ({ id: `m${++n}`, role, text, toolLines: [], ts: n, status: 'ok' });
/** `pairs` exchanges, oldest first. */
const history = (pairs: number) => Array.from({ length: pairs }, (_, i) => [msg('user', `line ${i}`), msg('agent', `reply ${i}`)]).flat();
const reply = { kind: 'reply' as const, contextLines: ['[room: rain]'], text: 'Now.' };

describe('buildMessages with a summary', () => {
  it('goes first after the system, merged into the first kept line when that is a user line', () => {
    const h = history(25); // 50 messages: the kept history starts at 20
    const through = h[HISTORY_STEP - 1].id;
    const m = buildMessages({ instructions: 'S', history: h, turn: reply, summary: { text: 'they argued about the valve', through } });
    expect(m[0]).toEqual({ role: 'system', content: 'S' });
    expect(m[1]).toEqual({ role: 'user', content: `${SUMMARY_LINE('they argued about the valve')}\n\n${h[HISTORY_STEP].text}` });
    expect(m).toHaveLength(1 + (h.length - HISTORY_STEP) + 1);
  });

  it('is its own user line when the kept history starts with her line', () => {
    const h = [msg('agent', 'opening'), ...history(25)]; // 51: kept starts at 20, an agent line
    const through = h[HISTORY_STEP - 1].id;
    const m = buildMessages({ instructions: 'S', history: h, turn: reply, summary: { text: 'x', through } });
    expect(m[1]).toEqual({ role: 'user', content: SUMMARY_LINE('x') });
    expect(m[2]).toEqual({ role: 'assistant', content: h[HISTORY_STEP].text });
  });

  it('is left out while the line it runs to is still in the kept history', () => {
    const h = history(10);
    const m = buildMessages({ instructions: 'S', history: h, turn: reply, summary: { text: 'x', through: h[3].id } });
    expect(m.some((x) => x.content.includes('[earlier tonight'))).toBe(false);
  });
});

describe('the previous summary (final review I2)', () => {
  it('while the newest summary runs to a line still kept, the one before stands in', () => {
    const h = history(25); // 50: kept starts at 20
    const m = buildMessages({ instructions: 'S', history: h, turn: reply, summary: { text: 'B', through: h[39].id, prev: { text: 'A', through: h[19].id } } });
    expect(m[1].content.startsWith(SUMMARY_LINE('A'))).toBe(true);
  });

  it('writeSummary keeps the one it replaces as prev', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    writeSummary(db, 'hicks', { text: 'A', through: 'm1' });
    writeSummary(db, 'hicks', { text: 'B', through: 'm2' });
    expect(readSummary(db, 'hicks')).toEqual({ text: 'B', through: 'm2', prev: { text: 'A', through: 'm1' } });
    db.close();
  });
});

describe('summaryDue', () => {
  it('is empty until one more exchange would move the start', () => {
    const fits = history((HISTORY_MAX_MESSAGES - 2) / 2); // 38 messages + one exchange = 40: still fits
    expect(summaryDue(fits, null)).toEqual([]);
    const full = history(HISTORY_MAX_MESSAGES / 2); // 40 + one exchange = 42: the start moves by a step
    expect(summaryDue(full, null).map((m) => m.id)).toEqual(full.slice(0, HISTORY_STEP).map((m) => m.id));
  });

  it('skips what the summary already covers', () => {
    const h = history(HISTORY_MAX_MESSAGES / 2 + HISTORY_STEP / 2); // 60: next start 40
    const due = summaryDue(h, h[HISTORY_STEP - 1].id);
    expect(due.map((m) => m.id)).toEqual(h.slice(HISTORY_STEP, 2 * HISTORY_STEP).map((m) => m.id));
    expect(summaryDue(h, h[2 * HISTORY_STEP - 1].id)).toEqual([]);
  });
});

describe('storage and prompt', () => {
  it('an overlong summary keeps its newest part, from a sentence start', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const sentences = Array.from({ length: 120 }, (_, i) => `Beat ${i} happened in the rain.`);
    writeSummary(db, 'hicks', { text: sentences.join(' '), through: 'm1' });
    const s = readSummary(db, 'hicks')!;
    expect(s.text.length).toBeLessThanOrEqual(SUMMARY_KEEP);
    expect(s.text.endsWith('Beat 119 happened in the rain.')).toBe(true);
    expect(s.text).toMatch(/^Beat \d+ happened/);
    expect(s.text).not.toContain('Beat 0 ');
    db.close();
  });

  it('a summary GLM writes at its usual length is kept whole', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const text = `${'word '.repeat(570)}end.`; // ~2,850 characters, past the 1,500 asked for
    writeSummary(db, 'hicks', { text, through: 'm1' });
    expect(readSummary(db, 'hicks')!.text).toBe(text);
    expect(text.length).toBeGreaterThan(SUMMARY_MAX);
    db.close();
  });

  it('a long run with no sentence end is cut at a word', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    writeSummary(db, 'hicks', { text: `start ${'word '.repeat(800)}end`, through: 'm1' });
    const s = readSummary(db, 'hicks')!.text;
    expect(s.length).toBeLessThanOrEqual(SUMMARY_KEEP);
    expect(s.startsWith('word')).toBe(true);
    expect(s.endsWith('end')).toBe(true);
    db.close();
  });

  it('rewind past the summarised reply restores the older summary', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', msg('agent', 'a'));
    const a = db.allMessages('hicks')[0].id;
    db.withStamp({ messageId: a, take: 0 }, () => writeSummary(db, 'hicks', { text: 'first', through: a }));
    db.insertMessage('hicks', msg('agent', 'b'));
    const b = db.allMessages('hicks')[1].id;
    db.withStamp({ messageId: b, take: 0 }, () => writeSummary(db, 'hicks', { text: 'second', through: b }));
    db.cutAfter('hicks', a);
    expect(readSummary(db, 'hicks')).toEqual({ text: 'first', through: a });
    db.close();
  });

  it('the prompt carries the old summary and the lines, and starts like the Residual', () => {
    const [system, user] = summaryMessages('they met', [msg('user', 'hello'), msg('agent', 'hi')], { self: 'Nix', player: 'Hicks' });
    expect(system.content.startsWith('You keep the records for a roleplay')).toBe(true);
    expect(user.content).toContain('they met');
    expect(user.content).toContain('Hicks: hello');
    expect(user.content).toContain('Nix: hi');
    expect(system.content).toContain(JOBS_APART);
  });
});
