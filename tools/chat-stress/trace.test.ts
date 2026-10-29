import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { traceLines, waitForScribe } from './trace';

it('reads the calls after a byte offset, though earlier lines hold multi-byte text (→ ·)', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trace-')), 'trace.jsonl');
  fs.writeFileSync(file, `${JSON.stringify({ name: 'apply_mood', args: '{}', out: 'applied: mood → quiet · lights' })}\n`);
  const from = fs.statSync(file).size;
  fs.appendFileSync(file, `${JSON.stringify({ at: 1, self: 'cass', name: 'note', args: '{"text":"x"}', out: 'noted: n1 "x"' })}\n`);
  expect(traceLines(file, from)).toEqual([{ name: 'note', args: '{"text":"x"}', out: 'noted: n1 "x"' }]);
  expect(traceLines(file, 0)).toHaveLength(2);
  expect(traceLines(path.join(path.dirname(file), 'none.jsonl'), 0)).toEqual([]);
});

it("waitForScribe resolves once the scribe's run-end line is in the trace, or at the limit", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trace-')), 'trace.jsonl');
  fs.writeFileSync(file, '');
  const from = 0;
  setTimeout(() => fs.appendFileSync(file, `${JSON.stringify({ name: 'scribe:note', args: 'note n1 added', out: 'ok' })}\n`), 20);
  setTimeout(() => fs.appendFileSync(file, `${JSON.stringify({ name: 'scribe', args: '', out: 'scribe · 1 note · 0.4 s' })}\n`), 60);
  const t0 = Date.now();
  expect(await waitForScribe(file, from, 2000, 10)).toBe(true);
  expect(Date.now() - t0).toBeLessThan(1000);
  expect(await waitForScribe(path.join(path.dirname(file), 'none.jsonl'), 0, 50, 10)).toBe(false);
});
