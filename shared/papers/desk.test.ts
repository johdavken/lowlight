import { describe, expect, test } from 'vitest';
import { DEFAULT_ORIGINS, DEFAULT_REASONS, type PapersData } from './data';
import { act, handOver, photoWarning, risk, startDesk, type Desk, type DeskAction } from './desk';
import { papersBoard } from './generate';

const data: PapersData = { origins: [...DEFAULT_ORIGINS], names: { given: { f: [], m: [], x: [] }, family: [] }, faces: [], reasons: [...DEFAULT_REASONS] };
const first = () => startDesk(papersBoard('easy', 0, data));
const run = (d: Desk, ...as: DeskAction[]) => as.reduce((x, a) => act(x, a).desk, d);

describe('the first night', () => {
  test('trade to dock labor costs 2; a renewal stamp makes 4, at the CLEAN line', () => {
    const d1 = run(first(), { k: 'set', f: 'trade', v: 'dock labor' });
    expect(risk(d1)).toBe(2);
    const d2 = run(d1, { k: 'extra', x: 'renewal', on: true });
    expect(risk(d2)).toBe(4);
    expect(handOver(d2)).toMatchObject({ result: 'clean', risk: 4 });
  });
  test('an age the photo cannot pass for is allowed, and turned back', () => {
    const d = run(first(), { k: 'set', f: 'trade', v: 'dock labor' }, { k: 'extra', x: 'renewal', on: true }, { k: 'set', f: 'age', v: '25–40' });
    expect(risk(d)).toBe(5);
    const h = handOver(d);
    expect(h.result).toBe('back');
    expect(h.checks[0]).toMatchObject({ standing: true, ok: false });
  });
  test('booth nine on the renewal rule, and the trade: 2, clean', () => {
    const d = run(first(), { k: 'overlook', i: 2 }, { k: 'set', f: 'trade', v: 'dock labor' });
    expect(risk(d)).toBe(2);
    const h = handOver(d);
    expect(h.result).toBe('clean');
    expect(h.checks.find((c) => c.overlooked)?.text).toBe('Permits sponsored by a co-op need a renewal stamp.');
  });
  test('the truth, handed over as it is, is turned back', () => expect(handOver(first()).result).toBe('back'));
});

test('an edit past the cap is refused and changes nothing', () => {
  const d = run(first(), { k: 'set', f: 'origin', v: 'Varna' }, { k: 'set', f: 'district', v: 'Velvet' }, { k: 'set', f: 'trade', v: 'freight' });
  expect(risk(d)).toBe(6); // the cap itself is allowed
  const r = act(d, { k: 'set', f: 'arrival', v: 'this week' });
  expect(r.refused).toBe(true);
  expect(r.desk).toBe(d);
});

test('UNDO steps back one edit at a time, to the truth and no further', () => {
  const d = run(first(), { k: 'set', f: 'trade', v: 'dock labor' }, { k: 'extra', x: 'renewal', on: true }, { k: 'overlook', i: 1 });
  const back = run(d, { k: 'undo' }, { k: 'undo' }, { k: 'undo' });
  expect(back.packet).toEqual(first().packet);
  expect(back.overlooked).toBeNull();
  expect(run(back, { k: 'undo' })).toEqual(back);
});

test('booth nine toggles on the same rule and moves to another for free', () => {
  const d = run(first(), { k: 'overlook', i: 1 });
  expect(d.overlooked).toBe(1);
  expect(run(d, { k: 'overlook', i: 2 }).overlooked).toBe(2);
  expect(run(d, { k: 'overlook', i: 1 }).overlooked).toBeNull();
});

test('notes cycle through three marks and never enter the history', () => {
  const d = run(first(), { k: 'note', i: 0 });
  expect(d.notes[0]).toBe('ok');
  expect(run(d, { k: 'note', i: 0 }).notes[0]).toBe('unsure');
  expect(run(d, { k: 'note', i: 0 }, { k: 'note', i: 0 }).notes[0]).toBe('');
  expect(d.history).toEqual([]);
});

test('RESET goes back to the truth, with no booth nine, no notes and no history', () => {
  const d = run(first(), { k: 'set', f: 'trade', v: 'dock labor' }, { k: 'overlook', i: 2 }, { k: 'note', i: 1 }, { k: 'reset' });
  expect(d).toEqual(first());
});

test('the photo warning is for easy only', () => {
  const easy = run(first(), { k: 'set', f: 'age', v: '25–40' });
  expect(photoWarning(easy)).toBe(true);
  const medium = startDesk(papersBoard('medium', 42, data));
  const other = medium.board.face.looks.includes('under 25') ? 'over 40' : 'under 25';
  const wrong = run(medium, { k: 'set', f: 'age', v: other });
  expect(photoWarning(wrong)).toBe(false);
});

test('booth nine costs his price on medium', () => {
  const d = startDesk(papersBoard('medium', 42, data));
  expect(risk(run(d, { k: 'overlook', i: 0 }))).toBe(1);
});
