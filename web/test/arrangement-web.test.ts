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
    expect(row.querySelector('.ql-capped-note')!.textContent).toBe('NIX IS DONE TONIGHT');
    expect(row.querySelector<HTMLButtonElement>('.ql-start')!.disabled).toBe(true);
  });
});
