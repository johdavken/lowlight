import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountQuestList } from '../src/room/quest-list';
import type { QuestState } from '../../shared/types';

afterEach(() => {
  document.body.innerHTML = '';
});
const state = (o: Partial<QuestState>): QuestState => ({ open: [], active: null, changed: null, waiting: null, elsewhere: [], ...o });

describe('the QUEST list', () => {
  it('the QUEST row for her own job', () => {
    const h = document.createElement('div');
    document.body.append(h);
    mountQuestList(h, { onStart: vi.fn() }).show(state({ open: [{ id: 'held-papers', title: 'Held Papers', pitch: null, timed: false, mission: { pay: null, tier: 1, range: [50, 150], own: 'Nix', trust: true } }] }));
    expect(h.querySelector('.ql-mission')!.textContent).toBe("NIX'S CLIENT · 50–150 SOL · TRUST");
  });
});
