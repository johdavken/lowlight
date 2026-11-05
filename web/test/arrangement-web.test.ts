import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountQuestList } from '../src/room/quest-list';
import type { QuestState } from '../../shared/types';

afterEach(() => {
  document.body.innerHTML = '';
});
const state = (o: Partial<QuestState>): QuestState => ({ open: [], active: null, changed: null, waiting: null, elsewhere: [], ...o });

describe('the QUEST list (arrangement)', () => {
  it('a capped row', () => {
    const h = document.createElement('div');
    document.body.append(h);
    mountQuestList(h, { onStart: vi.fn() }).show(state({ open: [{ id: 'job-b', title: 'Job B', pitch: null, timed: false, mission: { pay: null, tier: 1, range: [350, 450], capped: 'Nix' } }] }));
    const row = h.querySelector('.ql-row')!;
    expect(row.classList.contains('ql-capped')).toBe(true);
    expect(h.querySelector('.ql-file .ql-capped-note')!.textContent).toBe('NIX IS DONE TONIGHT');
    expect(h.querySelector<HTMLButtonElement>('.ql-file .ql-start')!.disabled).toBe(true);
  });

  it('NERVE GONE locks a job row (the table spec §3)', () => {
    const h = document.createElement('div');
    document.body.append(h);
    mountQuestList(h, { onStart: vi.fn() }).show(state({ nerveGone: { back: '06:00' }, open: [{ id: 'job-b', title: 'Job B', pitch: null, timed: false, locked: 'NERVE GONE — BACK AT 06:00', mission: { pay: null, tier: 1, range: [350, 450] } }] }));
    const row = h.querySelector('.ql-row')!;
    expect(row.classList.contains('ql-locked')).toBe(true);
    expect(h.querySelector('.ql-file .ql-locked-note')!.textContent).toBe('NERVE GONE — BACK AT 06:00');
    expect(h.querySelector<HTMLButtonElement>('.ql-file .ql-start')!.disabled).toBe(true);
  });
});
