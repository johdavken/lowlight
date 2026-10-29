import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { buildReport, readLogTail, readTurns, scrub, zipReport, type BugInput, type BugState } from '../src/bug-report';
import { openDb } from '../src/db';

const input = (o: Partial<BugInput> = {}): BugInput => ({
  description: 'Hae froze\nthen nothing happened',
  contact: '',
  includeTurns: true,
  screenshot: null,
  ...o,
});

const state = (o: Partial<BugState> = {}): BugState => ({
  version: '0.1.0-preview.2',
  build: null,
  os: 'linux 7.2.5 x64',
  runtime: 'Node 24.21.0 · Electron 44.0.0',
  playthrough: { id: 'pt1', name: 'Hicks — Oct 11' },
  room: { sceneId: 'ribbon/noodle-stall', contactId: 'hae' },
  present: ['hae', 'cass'],
  models: { hae: 'z-ai/glm-5.2', cass: 'deepseek/deepseek-v4-pro' },
  clock: '23:40',
  turns: [
    { speaker: 'Hicks', text: 'Hey.' },
    { speaker: 'Hae', text: 'You again.' },
  ],
  ...o,
});

const decode = (b64: string) => Buffer.from(b64, 'base64').toString('utf8');

const tmp: string[] = [];
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const tmpDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bug-report-'));
  tmp.push(d);
  return d;
};

describe('buildReport', () => {
  it('builds subject from the first line', () => {
    expect(buildReport(input(), state(), 'log', []).subject).toBe('[Lowlight 0.1.0-preview.2] Hae froze');
    const long = 'x'.repeat(100);
    const subject = buildReport(input({ description: long }), state(), 'log', []).subject;
    expect(subject).toBe(`[Lowlight 0.1.0-preview.2] ${'x'.repeat(60)}…`);
  });

  it('text carries state, description and contact', () => {
    const { text } = buildReport(input({ contact: 'pat' }), state(), 'log', []);
    for (const s of [
      'Hae froze\nthen nothing happened',
      'Contact: pat',
      '0.1.0-preview.2',
      'linux 7.2.5 x64',
      'Node 24.21.0 · Electron 44.0.0',
      'ribbon/noodle-stall',
      'hae, cass',
      'hae: z-ai/glm-5.2',
      'cass: deepseek/deepseek-v4-pro',
      '23:40',
      'Hicks — Oct 11',
    ]) expect(text).toContain(s);
  });

  it('turns only when asked', () => {
    expect(buildReport(input(), state(), 'log', []).text).toContain('Hae: You again.');
    const without = buildReport(input({ includeTurns: false }), state(), 'log', []).text;
    expect(without).not.toContain('Last turns');
    expect(without).not.toContain('You again.');
  });

  it('screenshot only when given', () => {
    expect(buildReport(input(), state(), 'log', []).attachments.map((a) => a.filename)).toEqual(['server-log.txt']);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
    const r = buildReport(input({ screenshot: png }), state(), 'log', []);
    expect(r.attachments.map((a) => a.filename)).toEqual(['screenshot.png', 'server-log.txt']);
    expect(r.attachments[0].content).toBe(png);
  });

  it('replyTo only for an email', () => {
    expect(buildReport(input({ contact: 'pat@x.io' }), state(), 'log', []).replyTo).toBe('pat@x.io');
    expect(buildReport(input({ contact: 'pat' }), state(), 'log', []).replyTo).toBeUndefined();
  });

  it('scrubs the key everywhere', () => {
    const k = 'sk-or-v1-abc123';
    const r = buildReport(
      input({ description: `crash with ${k}`, contact: `pat ${k}` }),
      state({ turns: [{ speaker: 'Hicks', text: `my key is ${k} and plainkey99` }] }),
      `error: auth ${k}`,
      ['plainkey99'],
    );
    const all = [r.subject, r.text, ...r.attachments.map((a) => decode(a.content))].join('\n');
    expect(all).not.toContain(k);
    expect(all).not.toContain('plainkey99');
    expect(all).toContain('[key removed]');
  });

  it('scrubs the description before cutting the subject', () => {
    const key = 'plainsecretkey123456';
    const r = buildReport(input({ description: `${'a'.repeat(50)} ${key}` }), state(), 'log', [key]);
    expect(r.subject).not.toContain('plainsec');
  });

  it('works with no playthrough', () => {
    const { text } = buildReport(input(), state({ playthrough: null, room: null, present: [], turns: [], clock: null }), 'log', []);
    expect(text).toContain('Hae froze');
  });
});

describe('scrub', () => {
  it('ignores empty keys', () => {
    expect(scrub('hello', [''])).toBe('hello');
  });
});

describe('readLogTail', () => {
  it('reads only the tail of a big log', () => {
    const file = path.join(tmpDir(), 'server.log');
    const fd = fs.openSync(file, 'w');
    const n = 400_000; // ~20 MB
    let chunk = '';
    for (let i = 0; i < n; i++) {
      chunk += `line ${String(i).padStart(8, '0')} ${'.'.repeat(36)}${i === n - 1 ? '' : '\n'}`;
      if (chunk.length > 1_000_000) {
        fs.writeSync(fd, chunk);
        chunk = '';
      }
    }
    fs.writeSync(fd, chunk);
    fs.closeSync(fd);
    expect(fs.statSync(file).size).toBeGreaterThan(18_000_000);

    const tail = readLogTail(file).split('\n');
    expect(tail).toHaveLength(200);
    expect(tail[0]).toContain(`line ${String(n - 200).padStart(8, '0')}`);
    expect(tail[199]).toBe(`line ${String(n - 1).padStart(8, '0')} ${'.'.repeat(36)}`);
  });

  it('caps the tail at 256 KB however long the lines', () => {
    const file = path.join(tmpDir(), 'server.log');
    fs.writeFileSync(file, `${'z'.repeat(10_000)}\n`.repeat(300));
    expect(Buffer.byteLength(readLogTail(file))).toBeLessThanOrEqual(256 * 1024);
  });

  it('one huge last line still comes back, cut to the window', () => {
    const file = path.join(tmpDir(), 'server.log');
    fs.writeFileSync(file, `first\n${'q'.repeat(600_000)}`);
    const tail = readLogTail(file);
    expect(tail.length).toBeGreaterThan(200_000);
    expect(Buffer.byteLength(tail)).toBeLessThanOrEqual(256 * 1024);
  });

  it('a short log comes back whole', () => {
    const file = path.join(tmpDir(), 'server.log');
    fs.writeFileSync(file, 'a\nb\nc\n');
    expect(readLogTail(file)).toBe('a\nb\nc');
  });

  it('without a file', () => {
    expect(readLogTail(null)).toBe('(no log file)');
    expect(readLogTail(path.join(tmpDir(), 'missing.log'))).toBe('(no log file)');
  });
});

describe('zipReport', () => {
  it('zips the report', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const r = buildReport(input({ screenshot: png.toString('base64') }), state(), 'the log', []);
    const files = unzipSync(zipReport(r));
    expect(Object.keys(files).sort()).toEqual(['report.txt', 'screenshot.png', 'server-log.txt']);
    expect(strFromU8(files['report.txt'])).toContain(r.subject);
    expect(strFromU8(files['report.txt'])).toContain('Hae froze');
    expect(strFromU8(files['server-log.txt'])).toBe('the log');
    expect(Buffer.from(files['screenshot.png']).equals(png)).toBe(true);
  });
});

describe('readTurns', () => {
  it("reads a contact database's last turns read-only, oldest first", () => {
    const file = path.join(tmpDir(), 'room.db');
    const db = openDb(file, { defaultPlayer: 'hicks' });
    for (let i = 0; i < 14; i++) db.insertMessage('hicks', { id: `m${i}`, role: i % 2 ? 'agent' : 'user', text: `line ${i}`, toolLines: [], ts: 1000 + i, status: i === 13 ? 'failed' : 'ok' });
    db.close();
    const turns = readTurns(file, 'hicks', { player: 'Hicks', contact: 'Hae' }, 10);
    expect(turns).toHaveLength(10);
    expect(turns[0]).toEqual({ speaker: 'Hae', text: 'line 3' });
    expect(turns.at(-1)).toEqual({ speaker: 'Hicks', text: 'line 12' });
  });

  it('no database, no turns', () => {
    expect(readTurns(path.join(tmpDir(), 'missing.db'), 'hicks', { player: 'H', contact: 'C' })).toEqual([]);
  });
});
