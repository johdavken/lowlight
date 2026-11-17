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

  it("a player's own job (for:) reads YOUR JOB, not the contact's client", () => {
    const h = document.createElement('div');
    document.body.append(h);
    mountQuestList(h, { onStart: vi.fn() }).show(state({ open: [{ id: 'the-favour', title: 'The Favour', pitch: null, timed: false, mission: { pay: 90, tier: 1, yours: true, trust: true } }] }));
    expect(h.querySelector('.ql-mission')!.textContent).toBe('YOUR JOB · TIER 1 · 90 SOL · TRUST');
  });
});
