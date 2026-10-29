import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContactEntry, LeadView, LooseEndsView } from '../../shared/types';
import { looseEndsTab } from '../src/room/people-loose-ends';
import { openPeople, type PeopleHandle } from '../src/room/people-screen';
import type { JournalView } from '../src/ui/journal';
import { DAY } from '../../shared/clock';

let handle: PeopleHandle | null = null;
afterEach(() => {
  handle?.close();
  handle = null;
  document.body.replaceChildren();
});

const at = DAY + 21 * 60 + 40; // Day 2, 21:40
const view: LooseEndsView = {
  open: [
    [
      { text: 'a thick envelope under the register', place: "Hae's stall", at },
      { text: 'the same courier, twice', place: 'Second Socket', at: at + 30 },
    ],
  ],
  solved: [{ truth: 'The stall is a drop for the Tilt.', clues: [{ text: 'chalk on the shutter', place: "Hae's stall", at }] }],
};

describe('LOOSE ENDS (cipher spec §2.8)', () => {
  it('nothing yet', () => {
    expect(looseEndsTab({ open: [], solved: [] }).textContent).toBe("Nothing you've noticed yet.");
  });

  it('an open group lists what was noticed, where and when, and never a truth', () => {
    const root = looseEndsTab(view);
    const group = root.querySelector('.pe-loose-group')!;
    const lines = [...group.querySelectorAll('.pe-loose-line')].map((l) => l.textContent);
    expect(lines[0]).toContain('a thick envelope under the register');
    expect(lines[0]).toContain("Hae's stall · Day 2");
    expect(lines[0]).toContain('21:40');
    expect(group.textContent).not.toMatch(/truth|T1/i);
  });

  it('a solved card: the truth, then what pointed to it', () => {
    const card = looseEndsTab(view).querySelector('.pe-loose-solved')!;
    expect(card.querySelector('.pe-loose-truth')!.textContent).toBe('The stall is a drop for the Tilt.');
    expect(card.textContent).toContain('WHAT POINTED TO IT');
    expect(card.textContent).toContain('chalk on the shutter');
  });

  it('PEOPLE has a LOOSE ENDS tab last, on Alt+O', async () => {
    const looseEnds = vi.fn(async () => view);
    handle = openPeople(document.body, {
      tab: 'contacts',
      contacts: async () => [] as ContactEntry[],
      leads: async () => [] as LeadView[],
      looseEnds,
      journal: Object.assign(document.createElement('div'), {}) as unknown as JournalView,
      current: 'nix',
      persona: 'Hicks',
      dev: false,
      pick: vi.fn(),
      reducedMotion: true,
    });
    expect([...document.querySelectorAll('.pe-tab')].map((t) => t.textContent).at(-1)).toBe('LOOSE ENDS');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', code: 'KeyO', altKey: true, bubbles: true, cancelable: true }));
    expect(handle.tab).toBe('loose');
    await vi.waitFor(() => expect(document.querySelector('.pe-loose-line')).not.toBeNull());
    expect(looseEnds).toHaveBeenCalledTimes(1);
  });
});
