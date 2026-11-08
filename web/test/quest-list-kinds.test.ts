import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountQuestList } from '../src/room/quest-list';
import { EMPTY_QUEST_STATE, type QuestState } from '../../shared/types';

afterEach(() => document.body.replaceChildren());
const state = (open: QuestState['open']): QuestState => ({ ...EMPTY_QUEST_STATE, open });

describe('the board tells stories, jobs and one-offs apart', () => {
  it('story quests and jobs in their own groups, each with its own mark; a one-off job says so', () => {
    const h = document.createElement('div');
    document.body.append(h);
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show(state([
      { id: 'night', title: 'Night Shift', pitch: null, timed: false, mission: { pay: 400, tier: 1 } },
      { id: 'trail', title: 'Paper Trail', pitch: null, timed: false },
      { id: 'book', title: 'The Book of Names', pitch: null, timed: false, once: true, mission: { pay: 320, tier: 1 } },
    ]));
    expect([...h.querySelectorAll('.ql-group')].map((g) => g.textContent)).toEqual(['STORY', 'ON THE TABLE']);
    const rows = [...h.querySelectorAll<HTMLElement>('.ql-row')];
    expect(rows.map((r) => [r.querySelector('.ql-title')!.textContent, r.className])).toEqual([
      ['Paper Trail', 'ql-row ql-story'],
      ['Night Shift', 'ql-row ql-job'],
      ['The Book of Names', 'ql-row ql-job ql-once'],
    ]);
    expect(rows[1].querySelector('img.ql-icon')!.getAttribute('src')).toBe('/cards/back.webp');
    expect(rows[0].querySelector('.ql-icon')!.textContent).toBe('◆');
    expect(rows[2].querySelector('.ql-once-tag')!.textContent).toBe('ONE-OFF');
    expect(rows[1].querySelector('.ql-once-tag')).toBeNull();
  });

  it('only one kind: no group heads', () => {
    const h = document.createElement('div');
    document.body.append(h);
    mountQuestList(h, { onStart: vi.fn() }).show(state([{ id: 'trail', title: 'Paper Trail', pitch: null, timed: false }]));
    expect(h.querySelectorAll('.ql-group')).toHaveLength(0);
  });
});

describe('the pane: tabs over a list and the picked quest file', () => {
  it('HERE first, the first row picked; a row shows its file; ELSEWHERE and FIXER are tabs', () => {
    const h = document.createElement('div');
    document.body.append(h);
    const onStart = vi.fn();
    const list = mountQuestList(h, { onStart });
    list.show({
      ...EMPTY_QUEST_STATE,
      open: [
        { id: 'trail', title: 'Paper Trail', pitch: 'A page from the ledger.', timed: true },
        { id: 'night', title: 'Night Shift', pitch: 'Forty seconds of camera.', timed: false, art: '/api/quests/art/night.webp', mission: { pay: 400, tier: 1 } },
      ],
      elsewhere: [{ id: 'rules', title: 'House Rules', contact: 'vesna', contactName: 'Vesna', next: null }],
      fixer: { place: 'second-socket', items: [{ id: 'burner', name: 'Burner', kind: 'cover', price: 600, tier: 1, state: 'ok' }] },
    });
    list.toggle();
    const tabs = () => [...h.querySelectorAll<HTMLButtonElement>('.ql-tab')];
    expect(tabs().map((t) => [t.dataset.tab, t.getAttribute('aria-selected')])).toEqual([['here', 'true'], ['away', 'false'], ['fixer', 'false']]);
    expect(h.querySelector('.ql-file-title')!.textContent).toBe('PAPER TRAIL');
    expect(h.querySelector('.ql-file .ql-timed')!.textContent).toBe('HAS A DEADLINE');
    h.querySelectorAll<HTMLElement>('.ql-row')[1].click();
    expect(h.querySelector('.ql-file-title')!.textContent).toBe('NIGHT SHIFT');
    expect(h.querySelector<HTMLElement>('.ql-art')!.style.backgroundImage).toContain('/api/quests/art/night.webp');
    expect(h.querySelectorAll('.ql-row')[1].getAttribute('aria-selected')).toBe('true');
    h.querySelector<HTMLButtonElement>('.ql-file .ql-start')!.click();
    expect(onStart).toHaveBeenCalledWith('night');
    list.toggle();
    tabs()[1].click();
    expect(h.querySelector('.ql-elsewhere .ql-title')!.textContent).toBe('House Rules');
    expect(h.querySelector('.ql-file .ql-hint')!.textContent).toBe('GOES ON ONLY WITH VESNA');
    tabs()[2].click();
    expect(h.querySelector('.ql-list')).toBeNull();
    expect(h.querySelector('.ql-fixer .ql-item-name')!.textContent).toBe('BURNER');
    expect(h.querySelector('.ql-fixer .ql-item-price')!.textContent).toBe('600 SOL');
  });

  it('NERVE gone: one line across the pane', () => {
    const h = document.createElement('div');
    document.body.append(h);
    mountQuestList(h, { onStart: vi.fn() }).show({ ...EMPTY_QUEST_STATE, nerveGone: { back: '06:00' }, open: [{ id: 'trail', title: 'Paper Trail', pitch: null, timed: false }] });
    expect(h.querySelector('.ql-nerve')!.textContent).toBe('NERVE GONE — NO NEW JOB UNTIL 06:00 · STORY STILL PLAYS');
  });
});

describe('the pane coming up', () => {
  it("flickers with ql-flicker, never ql-in (the file column's class, whose -38px margin lifted the pane under the keys bar)", () => {
    const h = document.createElement('div');
    document.body.append(h);
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show(state([{ id: 'trail', title: 'Paper Trail', pitch: null, timed: false }]));
    list.toggle();
    const pane = h.querySelector<HTMLElement>('.ql-pane')!;
    expect(pane.classList.contains('ql-flicker')).toBe(true);
    expect(pane.classList.contains('ql-in')).toBe(false);
  });
});


describe("ELSEWHERE: the other places' boards (2026-11-01)", () => {
  it('a group per place; a job row says whose it is and when it posts; GO THERE goes to its place', () => {
    const h = document.createElement('div');
    document.body.append(h);
    const onGoTo = vi.fn();
    const list = mountQuestList(h, { onStart: vi.fn(), onGoTo });
    list.show({
      ...EMPTY_QUEST_STATE,
      elsewhere: [{ id: 'rules', title: 'House Rules', contact: 'vesna', contactName: 'Vesna', next: null }],
      boards: [
        { place: 'long-haul', name: 'The Long Haul', jobs: [{ id: 'cold-freight', title: 'Cold Freight', pitch: 'A look inside a trailer.', art: '/api/quests/art/cold-freight.webp', tier: 1, pay: null, range: [260, 340] }] },
        { place: 'lowlight-intake', name: 'The Intake', jobs: [{ id: 'held-papers', title: 'Held Papers', pitch: null, tier: 1, pay: 300, with: 'Nix', opens: '20:00' }] },
      ],
    });
    expect(list.has()).toBe(true);
    list.toggle();
    expect([...h.querySelectorAll('.ql-tab')].map((t) => t.textContent)).toEqual(['ELSEWHERE 3']);
    expect([...h.querySelectorAll('.ql-group')].map((g) => g.textContent)).toEqual(['THE LONG HAUL · TONIGHT', 'THE INTAKE · TONIGHT']);
    const rows = [...h.querySelectorAll<HTMLElement>('.ql-row')];
    expect(rows.map((r) => r.querySelector('.ql-title')!.textContent)).toEqual(['House Rules', 'Cold Freight', 'Held Papers']);
    expect(rows[1].querySelector('img')!.getAttribute('src')).toBe('/api/quests/art/cold-freight.webp');
    expect(rows[1].querySelector('.ql-mission')!.textContent).toBe('MISSION · TIER 1 · 260–340 SOL');
    expect(rows[2].className).toContain('ql-later');
    expect(rows[2].querySelector('.ql-mission')!.textContent).toBe('MISSION · TIER 1 · 300 SOL · WITH NIX · FROM 20:00');
    rows[2].click();
    expect(h.querySelector('.ql-file-title')!.textContent).toBe('HELD PAPERS');
    expect([...h.querySelectorAll('.ql-file .ql-chip')].map((c) => c.textContent)).toEqual(['WITH NIX', 'POSTS AT 20:00']);
    expect(h.querySelector('.ql-file .ql-hint')!.textContent).toBe('AT THE INTAKE · ONLY WITH NIX · POSTS AT 20:00');
    h.querySelector<HTMLButtonElement>('.ql-goto')!.click();
    expect(onGoTo).toHaveBeenCalledWith('lowlight-intake');
    expect(list.isOpen).toBe(false);
  });
});

describe('The Chair, again: locked with its checklist (Tier 2 spec §1)', () => {
  const checks: NonNullable<QuestState['open'][number]['checks']> = [
    { id: 'jobs', label: '6 JOBS WITH HER UNDER THE DEAL', ok: true, progress: '8/6' },
    { id: 'clean', label: '4 OF THE LAST 6 CLEAN', ok: false, progress: '3/6' },
    { id: 'shift', label: 'HER SHIFT', ok: false, progress: 'FROM 20:00' },
  ];
  const open: QuestState['open'] = [{ id: 'the-chair-again', title: 'The Chair, again', pitch: 'More of her nights.', timed: false, locked: 'LOCKED', checks }];
  const mount = () => {
    const h = document.createElement('div');
    document.body.append(h);
    mountQuestList(h, { onStart: vi.fn() }).show(state(open));
    return h;
  };
  it('the row carries the checklist for hover: ✓ or ✗, the label, the progress', () => {
    const h = mount();
    const row = h.querySelector<HTMLElement>('.ql-row')!;
    expect(row.classList.contains('ql-locked')).toBe(true);
    const items = [...row.querySelectorAll<HTMLElement>('.ql-checks .ql-check')];
    expect(items.map((i) => [i.classList.contains('ok'), i.textContent])).toEqual([
      [true, '✓6 JOBS WITH HER UNDER THE DEAL8/6'],
      [false, '✗4 OF THE LAST 6 CLEAN3/6'],
      [false, '✗HER SHIFTFROM 20:00'],
    ]);
  });
  it('its file (a tap on phone) shows the same list, START off', () => {
    const h = mount();
    h.querySelector<HTMLElement>('.ql-row')!.click();
    expect(h.querySelectorAll('.ql-in .ql-checks .ql-check')).toHaveLength(3);
    expect(h.querySelector<HTMLButtonElement>('.ql-start')!.disabled).toBe(true);
  });
});


describe('RUMORS (tier 3 contracts spec §5)', () => {
  const rumor = { id: 'c', line: 'He has been asking after you.', place: 'counting-house', placeName: 'The Counting House', contact: 'mother-rot', contactName: 'Mother Rot', here: false, leaving: 'Nix' };
  const mount = (r: { here?: boolean; leaving?: string | null } | null) => {
    const h = document.createElement('div');
    document.body.append(h);
    const o = { onStart: vi.fn(), onGoTo: vi.fn(), onGoToContact: vi.fn() };
    const list = mountQuestList(h, o);
    list.show({ ...state([]), ...(r ? { rumors: [{ ...rumor, ...r } as NonNullable<QuestState['rumors']>[number]] } : {}) });
    return { h, o };
  };
  const button = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('.ql-goto')!;
  it('no rows, no tab', () => expect(mount(null).h.querySelector('[data-tab="rumors"]')).toBeNull());
  it('the line shows, and GO TO asks before you leave', () => {
    const { h, o } = mount({});
    expect(h.querySelector('.ql-pitch')!.textContent).toBe(rumor.line);
    expect(button(h).textContent).toBe('GO TO MOTHER ROT');
    button(h).click();
    expect(button(h).textContent).toBe('LEAVE NIX FOR NOW?');
    expect(o.onGoToContact).not.toHaveBeenCalled();
    button(h).click();
    expect(o.onGoToContact).toHaveBeenCalledWith('mother-rot');
  });
  it('with them elsewhere: the map', () => {
    const { h, o } = mount({ leaving: null });
    button(h).click();
    expect(o.onGoTo).toHaveBeenCalledWith('counting-house');
  });
  it('with them at the place: START', () => {
    const { h, o } = mount({ here: true, leaving: null });
    expect(button(h).textContent).toBe('START');
    button(h).click();
    expect(o.onStart).toHaveBeenCalledWith('c');
  });
});

describe('a contract waiting', () => {
  it('its pieces show on ELSEWHERE, and it can be walked away from', () => {
    const h = document.createElement('div');
    document.body.append(h);
    const onWalk = vi.fn();
    const list = mountQuestList(h, { onStart: vi.fn(), onWalk });
    list.show({ ...state([]), arc: { id: 'c', title: 'C', next: 'soon', stage: 'waiting', walk: true, pieces: [{ id: 'boat', spec: 'muscle', state: 'open' }, { id: 'roof', spec: 'ears', state: 'out' }, { id: 'goodwill', spec: 'face', state: 'back' }] } });
    expect([...h.querySelectorAll('.ql-piece')].map((p) => p.textContent)).toEqual(['BOAT · SEND MUSCLE', 'ROOF · OUT', 'GOODWILL · BACK']);
    h.querySelector<HTMLButtonElement>('.ql-walk')!.click();
    expect(onWalk).toHaveBeenCalledWith('c');
  });

  it("a job's file says who posted it, then the pitch, then what it involves", () => {
    const h = document.createElement('div');
    document.body.append(h);
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show(state([{ id: 'night', title: 'Night Shift', pitch: 'A crate.', postedBy: 'A man in a grey coat.', brief: 'Open it.', timed: false, mission: { pay: 400, tier: 1 } }]));
    list.toggle();
    const parts = [...h.querySelectorAll('.ql-file .ql-postedby, .ql-file .ql-pitch, .ql-file .ql-brief')].map((e) => e.textContent);
    expect(parts).toEqual(['POSTED BY A man in a grey coat.', 'A crate.', 'Open it.']);
  });
});
