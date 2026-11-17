import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeadView, LooseEndsView, QuestState } from '../../shared/types';
import { mountQuestList } from '../src/room/quest-list';
import { looseEndsTab } from '../src/room/quest-loose-ends';
import { DAY } from '../../shared/clock';

afterEach(() => {
  // A panel a test left open still listens on the window: Esc closes any, so no test's keys reach another's.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
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

  it('a page of two columns: NOTICED and its note at the left, SOLVED at the right, and only when something is', () => {
    const root = looseEndsTab(view);
    expect(root.matches('.ql-loose-tab.ql-read')).toBe(true);
    const cols = [...root.querySelectorAll(':scope > .ql-col')];
    expect(cols).toHaveLength(2);
    expect([...cols[0].children].map((c) => c.classList[0])).toEqual(['ql-loose-head', 'ql-loose-group', 'ql-loose-note']);
    expect(cols[0].querySelector('.ql-loose-head')!.textContent).toBe('NOTICED');
    expect(cols[0].querySelector('p.ql-loose-note')!.textContent).toBe('Lines that sit together point at the same thing. Nothing here names it.');
    expect([...cols[1].children].map((c) => c.classList[0])).toEqual(['ql-group', 'ql-loose-solved']);
    expect(cols[1].querySelector('div.ql-group')!.textContent).toBe('SOLVED');
    // Nothing solved: no right column. Nothing noticed: no note under the head.
    const open = looseEndsTab({ open: view.open, solved: [] });
    expect(open.querySelectorAll(':scope > .ql-col')).toHaveLength(1);
    expect(open.querySelector('.ql-group, .ql-loose-solved')).toBeNull();
    const solved = looseEndsTab({ open: [], solved: view.solved });
    expect(solved.querySelectorAll(':scope > .ql-col')).toHaveLength(2);
    expect(solved.querySelector('.ql-loose-note, .ql-loose-group')).toBeNull();
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
    const lead = (title: string) => [...host.querySelectorAll<HTMLElement>('article.ql-lead')].find((r) => r.querySelector('.ql-title')!.textContent === title)!;
    return { host, list, leads, looseEnds, tabs, lead };
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

  it('a page to read: OPEN leads in the first column, FOLLOWED in a second; each points to a name, or a ? before you have met them', async () => {
    const { list, host, lead } = mount();
    list.openOn('leads');
    await settle();
    const page = host.querySelector('.ql-body > .ql-read.ql-leads')!;
    // Not a list and a file: nothing to pick.
    expect(host.querySelector('.ql-list, .ql-file, .ql-row')).toBeNull();
    expect([...host.querySelectorAll('article.ql-lead .ql-title')].map((n) => n.textContent)).toEqual(['SDG at the Tilt', 'Clean water', 'The Orchid owes']);
    const cols = [...page.querySelectorAll(':scope > .ql-col')];
    expect(cols).toHaveLength(2);
    // Each column's head, with its count, then its leads.
    expect(cols[0].firstElementChild!.matches('.ql-sub')).toBe(true);
    expect(cols[0].firstElementChild!.textContent).toBe('OPEN 2');
    expect([...cols[0].querySelectorAll('.ql-lead')].map((n) => [n.querySelector('.ql-title')!.textContent, n.classList.contains('ql-followed')])).toEqual([['SDG at the Tilt', false], ['Clean water', false]]);
    expect(host.querySelectorAll('.ql-group')).toHaveLength(1);
    expect(cols[1].firstElementChild!.matches('div.ql-group')).toBe(true);
    expect(cols[1].firstElementChild!.textContent).toBe('FOLLOWED 1');
    expect([...cols[1].querySelectorAll('.ql-lead')].map((n) => [n.querySelector('.ql-title')!.textContent, n.classList.contains('ql-followed')])).toEqual([['The Orchid owes', true]]);
    // No portrait or icon: who it points to is said, or a ? before you've met them.
    expect(page.querySelector('img, .ql-icon')).toBeNull();
    expect(lead('Clean water').querySelector('.ql-kind')!.textContent).toBe('→ ?');
    expect(lead('The Orchid owes').querySelector('.ql-kind')!.textContent).toBe('→ ?');
    expect(lead('SDG at the Tilt').querySelector('.ql-kind')!.textContent).toBe('→ CASS · The Tilt');
    list.close(true);
  });

  it('nothing followed: one column, no FOLLOWED head', async () => {
    const { list, host } = mount({ leads: LEADS.filter((l) => !l.followed) });
    list.openOn('leads');
    await settle();
    expect(host.querySelectorAll('.ql-leads > .ql-col')).toHaveLength(1);
    expect(host.querySelector('.ql-leads .ql-group')).toBeNull();
    expect(host.querySelector('.ql-leads .ql-sub')!.textContent).toBe('OPEN 2');
    list.close(true);
  });

  it('each lead shows the whole text and who and where it points, with or without a place', async () => {
    const { list, host, lead: at } = mount({ leads: [...LEADS, lead({ id: 'd', to: 'ines', title: 'Pump Nine', details: 'She counts the valves.' }), lead({ id: 'e', to: 'hae', title: 'Late bowls', details: 'Someone eats there after close.', place: "Hae's stall", met: false })] });
    list.openOn('leads');
    await settle();
    // Every lead's text is on the page at once, in its own article: title, text, where it points.
    expect([...host.querySelectorAll('article.ql-lead')].map((n) => [...n.children].map((c) => `${c.tagName.toLowerCase()}.${c.className}`))).toEqual(Array(5).fill(['div.ql-title', 'p.ql-lead-text', 'span.ql-kind']));
    expect(at('SDG at the Tilt').querySelector('p.ql-lead-text')!.textContent).toBe('A man in plain clothes asked about Hicks. He stayed two hours.');
    expect(at('SDG at the Tilt').querySelector('.ql-kind')!.textContent).toBe('→ CASS · The Tilt');
    expect(at('Pump Nine').querySelector('p.ql-lead-text')!.textContent).toBe('She counts the valves.');
    expect(at('Pump Nine').querySelector('.ql-kind')!.textContent).toBe('→ INES');
    // Not met yet: the place still shows, the name doesn't.
    expect(at('Late bowls').querySelector('.ql-kind')!.textContent).toBe("→ ? · Hae's stall");
    expect(at('The Orchid owes').querySelector('p.ql-lead-text')!.textContent).toBe('Ask Vesna.');
    list.close(true);
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

  it('↑ / ↓ pick nothing on LEADS or LOOSE ENDS (pages to read) and never reach the room; ← / → still turn the tab', async () => {
    const { list, host } = mount();
    list.openOn('leads');
    await settle();
    const titles = () => [...host.querySelectorAll('.ql-lead .ql-title')].map((n) => n.textContent);
    const press = (k: string) => {
      const e = new KeyboardEvent('keydown', { key: k, cancelable: true });
      window.dispatchEvent(e);
      return e;
    };
    const tab = () => host.querySelector<HTMLElement>('.ql-pane')!.dataset.tab;
    const before = host.querySelector('.ql-leads')!;
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown']) expect(press(k).defaultPrevented).toBe(true);
    expect(titles()).toEqual(['SDG at the Tilt', 'Clean water', 'The Orchid owes']);
    expect(host.querySelector('.ql-pane .on, .ql-pane [aria-selected="true"], .ql-pane .ql-picked')).toBeNull();
    // Not even drawn again: the page under the reader stays the same nodes.
    expect(host.querySelector('.ql-leads')).toBe(before);
    expect(tab()).toBe('leads');
    // Nothing to do on a page to read: Enter is left alone.
    expect(press('Enter').defaultPrevented).toBe(false);
    press('ArrowRight');
    expect(tab()).toBe('loose');
    press('ArrowDown');
    expect(host.querySelector('.ql-pane .on, .ql-pane [aria-selected="true"]')).toBeNull();
    expect(tab()).toBe('loose');
    press('ArrowRight');
    expect(tab()).toBe('here');
    press('ArrowLeft');
    press('ArrowLeft');
    expect(tab()).toBe('leads');
    list.close(true);
  });

  it('asked for by key with nothing there, the tab shows and says so; leaving it, it goes', async () => {
    const { list, host, tabs } = mount({ leads: [], loose: { open: [], solved: [] } });
    list.openOn('leads');
    await settle();
    expect(tabs()).toEqual(['HERE 1', 'LEADS 0']);
    expect(host.querySelector('.ql-read.ql-leads > .ql-none')!.textContent).toBe('No leads yet. People tell you things; the useful ones end up here.');
    host.querySelector<HTMLElement>('.ql-tab[data-tab="here"]')!.click();
    expect(tabs()).toEqual(['HERE 1']);
  });
});
