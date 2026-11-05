import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeadView, LooseEndsView, QuestState } from '../../shared/types';
import { mountQuestList } from '../src/room/quest-list';
import { looseEndsTab } from '../src/room/quest-loose-ends';
import { DAY } from '../../shared/clock';

afterEach(() => {
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
    const group = root.querySelector('.ql-loose-group')!;
    const lines = [...group.querySelectorAll('.ql-loose-line')].map((l) => l.textContent);
    expect(lines[0]).toContain('a thick envelope under the register');
    expect(lines[0]).toContain("Hae's stall · Day 2");
    expect(lines[0]).toContain('21:40');
    expect(group.textContent).not.toMatch(/truth|T1/i);
  });

  it('a solved card: the truth, then what pointed to it', () => {
    const card = looseEndsTab(view).querySelector('.ql-loose-solved')!;
    expect(card.querySelector('.ql-loose-truth')!.textContent).toBe('The stall is a drop for the Tilt.');
    expect(card.textContent).toContain('WHAT POINTED TO IT');
    expect(card.textContent).toContain('chalk on the shutter');
  });
});

const lead = (o: Partial<LeadView> & { id: string; to: string }): LeadView =>
  ({ title: `Lead ${o.id}`, details: 'Something. More.', toName: o.to.toUpperCase(), place: null, portrait: null, met: true, followed: false, ...o }) as LeadView;
const LEADS = [
  lead({ id: 'b', to: 'vesna', title: 'The Orchid owes', details: 'Ask Vesna.', met: false, followed: true }),
  lead({ id: 'a', to: 'cass', title: 'SDG at the Tilt', details: 'A man in plain clothes asked about Hicks. He stayed two hours.', place: 'The Tilt', portrait: '/p/cass.png' }),
  lead({ id: 'c', to: 'ines', title: 'Clean water', details: 'Pump Nine is short.', met: false }),
];
const STATE: QuestState = { open: [{ id: 'q', title: 'Q', pitch: null, timed: false }], active: null, changed: null, waiting: null, elsewhere: [] };

describe('LEADS and LOOSE ENDS on QUEST', () => {
  function mount(o: { leads?: LeadView[]; loose?: LooseEndsView } = {}) {
    const host = document.createElement('div');
    document.body.append(host);
    const leads = vi.fn(async () => o.leads ?? LEADS);
    const looseEnds = vi.fn(async () => o.loose ?? view);
    const list = mountQuestList(host, { onStart: vi.fn(), leads, looseEnds });
    list.show(STATE);
    const tabs = () => [...host.querySelectorAll<HTMLElement>('.ql-tab')].map((t) => t.textContent);
    const row = (title: string) => [...host.querySelectorAll<HTMLElement>('.ql-row')].find((r) => r.textContent!.includes(title))!;
    return { host, list, leads, looseEnds, tabs, row };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('both load with the first state and as it opens, and take a tab each, with their counts', async () => {
    const { list, leads, looseEnds, tabs } = mount();
    expect(tabs()).toEqual(['HERE 1']);
    list.toggle();
    await settle();
    expect(tabs()).toEqual(['HERE 1', 'LEADS 3', 'LOOSE ENDS 2']);
    // Once on the first state, once as it opened.
    expect(leads).toHaveBeenCalledTimes(2);
    expect(looseEnds).toHaveBeenCalledTimes(2);
  });

  it('a failed load leaves the tabs out and the panel up', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const list = mountQuestList(host, { onStart: vi.fn(), leads: () => Promise.reject(new Error('no')), looseEnds: () => Promise.reject(new Error('no')) });
    list.show(STATE);
    list.toggle();
    await settle();
    expect(list.isOpen).toBe(true);
    expect([...host.querySelectorAll('.ql-tab')].map((t) => t.textContent)).toEqual(['HERE 1']);
  });

  it('openOn opens on that tab; on it already it closes', async () => {
    const { list, host } = mount();
    list.openOn('loose');
    await settle();
    expect(list.isOpen).toBe(true);
    expect(host.querySelector<HTMLElement>('.ql-pane')!.dataset.tab).toBe('loose');
    expect(host.querySelector('.ql-loose-line')).not.toBeNull();
    list.openOn('leads');
    await settle();
    expect(host.querySelector<HTMLElement>('.ql-pane')!.dataset.tab).toBe('leads');
    list.openOn('leads');
    expect(list.isOpen).toBe(false);
  });

  it('open leads first, then FOLLOWED dimmed; unmet shows ?, met her portrait', async () => {
    const { list, host, row } = mount();
    list.openOn('leads');
    await settle();
    expect([...host.querySelectorAll('.ql-lead .ql-title')].map((n) => n.textContent)).toEqual(['SDG at the Tilt', 'Clean water', 'The Orchid owes']);
    expect(host.querySelector('.ql-group')!.textContent).toBe('FOLLOWED');
    expect(row('The Orchid owes').classList.contains('ql-followed')).toBe(true);
    expect(row('Clean water').querySelector('.ql-icon')!.textContent).toBe('?');
    expect(row('SDG at the Tilt').querySelector('img')!.getAttribute('src')).toBe('/p/cass.png');
  });

  it('the file shows the whole text and who and where it points, with or without a place', async () => {
    const { list, host, row } = mount();
    list.openOn('leads');
    await settle();
    const file = () => host.querySelector('.ql-file')!;
    expect(file().querySelector('.ql-file-title')!.textContent).toBe('SDG AT THE TILT');
    expect(file().querySelector('.ql-lead-text')!.textContent).toBe('A man in plain clothes asked about Hicks. He stayed two hours.');
    expect(file().querySelector('.ql-file-tag')!.textContent).toBe('→ CASS · The Tilt');
    row('Clean water').click();
    expect(file().querySelector('.ql-file-tag')!.textContent).toBe('→ INES');
  });

  it('the first state loads them, so has() knows and QUEST can stay on the bar for leads alone', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onNotes = vi.fn();
    const leads = vi.fn(async () => LEADS);
    const list = mountQuestList(host, { onStart: vi.fn(), leads, looseEnds: async () => ({ open: [], solved: [] }), onNotes });
    const empty: QuestState = { ...STATE, open: [] };
    list.show(empty);
    expect(list.has()).toBe(false);
    await settle();
    expect(list.has()).toBe(true);
    expect(onNotes).toHaveBeenCalled();
    list.show(empty);
    expect(leads).toHaveBeenCalledTimes(1);
  });

  it('openOn on the open panel does not open it again (no second cue); a state push leaves an empty LEADS up', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onOpen = vi.fn();
    const list = mountQuestList(host, { onStart: vi.fn(), leads: async () => [], looseEnds: async () => ({ open: [], solved: [] }), onOpen });
    list.openOn('leads');
    list.openOn('loose');
    expect(onOpen).toHaveBeenCalledTimes(1);
    list.show({ ...STATE, open: [] });
    await settle();
    expect(list.isOpen).toBe(true);
  });

  it('↑ / ↓ move through LEADS in order, without wrapping', async () => {
    const { list, host } = mount();
    list.openOn('leads');
    await settle();
    const at = () => host.querySelector('.ql-file .ql-file-title')!.textContent;
    const press = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
    press('ArrowUp');
    expect(at()).toBe('SDG AT THE TILT');
    press('ArrowDown');
    expect(at()).toBe('CLEAN WATER');
    press('ArrowDown');
    press('ArrowDown');
    expect(at()).toBe('THE ORCHID OWES');
    list.close();
  });

  it('asked for by key with nothing there, the tab shows and says so; leaving it, it goes', async () => {
    const { list, host, tabs } = mount({ leads: [], loose: { open: [], solved: [] } });
    list.openOn('leads');
    await settle();
    expect(tabs()).toEqual(['HERE 1', 'LEADS 0']);
    expect(host.querySelector('.ql-none')!.textContent).toBe('No leads yet. People tell you things; the useful ones end up here.');
    host.querySelector<HTMLElement>('.ql-tab[data-tab="here"]')!.click();
    expect(tabs()).toEqual(['HERE 1']);
  });
});
