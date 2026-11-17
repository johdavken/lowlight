import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountQuestList } from '../src/room/quest-list';
import { EMPTY_QUEST_STATE, type QuestState } from '../../shared/types';

afterEach(() => {
  // A panel a test left open still listens on the window: Esc closes any, so no test's keys reach another's.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  document.body.replaceChildren();
});
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
    expect([...h.querySelectorAll('div.ql-group.tp-head')].map((g) => g.textContent)).toEqual(['STORY', 'ON THE TABLE']);
    const rows = [...h.querySelectorAll<HTMLElement>('button.ql-row')];
    // The first row is the picked one.
    expect(rows.map((r) => [r.querySelector('.ql-title')!.firstChild!.textContent, r.className])).toEqual([
      ['Paper Trail', 'ql-row ql-story tp-row on'],
      ['Night Shift', 'ql-row ql-job tp-row'],
      ['The Book of Names', 'ql-row ql-job ql-once tp-row'],
    ]);
    // No icon and no wrapper: the title, then the line that says which kind it is (a job's terms; STORY).
    expect(h.querySelector('.ql-icon, .ql-text')).toBeNull();
    expect(rows.map((r) => [...r.children].map((c) => [c.className, c.textContent]))).toEqual([
      [['ql-title', 'Paper Trail'], ['ql-kind', 'STORY']],
      [['ql-title', 'Night Shift'], ['ql-mission', 'MISSION · TIER 1 · 400 SOL']],
      [['ql-title', 'The Book of NamesONE-OFF'], ['ql-mission', 'MISSION · TIER 1 · 320 SOL']],
    ]);
    expect(rows[2].querySelector('.ql-title > .ql-once-tag')!.textContent).toBe('ONE-OFF');
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
    expect(tabs().every((t) => t.matches('button.ql-tab.tp-tab'))).toBe(true);
    expect(tabs().map((t) => [t.dataset.tab, t.getAttribute('aria-selected'), t.classList.contains('on'), t.querySelector('span.tp-n')!.textContent, t.textContent])).toEqual([
      ['here', 'true', true, '2', 'HERE 2'],
      ['away', 'false', false, '1', 'ELSEWHERE 1'],
      ['fixer', 'false', false, '1', 'FIXER 1'],
    ]);
    const on = () => [...h.querySelectorAll<HTMLElement>('.ql-row')].map((r) => [r.classList.contains('on'), r.getAttribute('aria-selected')]);
    expect(on()).toEqual([[true, 'true'], [false, 'false']]);
    expect(h.querySelector('h2.ql-file-title')!.textContent).toBe('PAPER TRAIL');
    expect(h.querySelector('.ql-file .ql-timed')!.textContent).toBe('HAS A DEADLINE');
    expect(h.querySelector('.ql-file .ql-timed')!.className).toBe('ql-chip ql-timed tp-tag warn');
    // No picture for it: nothing stands there.
    expect(h.querySelector('.ql-file > .ql-art')!.classList.contains('ql-noart')).toBe(true);
    h.querySelectorAll<HTMLElement>('.ql-row')[1].click();
    expect(h.querySelector('.ql-file-title')!.textContent).toBe('NIGHT SHIFT');
    const art = h.querySelector<HTMLElement>('.ql-file > .ql-art')!;
    expect(art.style.backgroundImage).toContain('/api/quests/art/night.webp');
    expect(art.classList.contains('ql-noart')).toBe(false);
    expect(on()).toEqual([[false, 'false'], [true, 'true']]);
    // The file: the picture, the text, and the foot (what the key does, and the key) beside the text, not in it.
    expect([...h.querySelector('.ql-file')!.children].map((c) => c.classList[0])).toEqual(['ql-art', 'ql-in', 'ql-go']);
    expect(h.querySelector('.ql-file > .ql-go .ql-hint')!.textContent).toBe('PLAYS ON THE TABLE · SETUP NEXT');
    h.querySelector<HTMLButtonElement>('.ql-file > .ql-go .ql-start')!.click();
    expect(onStart).toHaveBeenCalledWith('night');
    expect(list.isOpen).toBe(false);
    list.toggle();
    tabs()[1].click();
    expect(tabs().map((t) => t.classList.contains('on'))).toEqual([false, true, false]);
    expect(h.querySelector('.ql-elsewhere .ql-title')!.textContent).toBe('House Rules');
    expect(h.querySelector('.ql-elsewhere .ql-kind')!.textContent).toBe('VESNA');
    expect(h.querySelector('.ql-file .ql-hint')!.textContent).toBe('GOES ON ONLY WITH VESNA');
    tabs()[2].click();
    // FIXER is a list and a file too.
    expect(h.querySelector('.ql-body.ql-fixer > .ql-list .ql-group')!.textContent).toBe('FOR SALE HERE');
    expect(h.querySelector('.ql-fixer .ql-list .ql-row.on .ql-item-name')!.textContent).toBe('BURNER');
    expect(h.querySelector('.ql-fixer .ql-list .ql-item-price')!.textContent).toBe('600 SOL');
    expect(h.querySelector('.ql-fixer > .ql-file .ql-file-title')!.textContent).toBe('BURNER');
    list.close(true);
  });

  const press = (key: string) => {
    const e = new KeyboardEvent('keydown', { key, cancelable: true });
    window.dispatchEvent(e);
    return e;
  };
  const THREE: QuestState = {
    ...EMPTY_QUEST_STATE,
    open: [
      { id: 'trail', title: 'Paper Trail', pitch: null, timed: false },
      { id: 'night', title: 'Night Shift', pitch: null, timed: false, mission: { pay: 400, tier: 1 } },
    ],
    elsewhere: [{ id: 'rules', title: 'House Rules', contact: 'vesna', contactName: 'Vesna', next: null }],
    fixer: { place: 'second-socket', items: [{ id: 'burner', name: 'Burner', kind: 'cover', price: 600, tier: 1, state: 'ok' }] },
  };

  it('← / → turn the tab among those shown, and wrap; the new tab opens on its first row', () => {
    const h = document.createElement('div');
    document.body.append(h);
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show(THREE);
    // Closed, the keys are the room's.
    expect(press('ArrowRight').defaultPrevented).toBe(false);
    list.toggle();
    const up = () => [h.querySelector<HTMLElement>('.ql-pane')!.dataset.tab, [...h.querySelectorAll('.ql-tab[aria-selected="true"]')].map((t) => (t as HTMLElement).dataset.tab).join()];
    expect(up()).toEqual(['here', 'here']);
    press('ArrowDown');
    expect(h.querySelector('.ql-file-title')!.textContent).toBe('NIGHT SHIFT');
    expect(press('ArrowRight').defaultPrevented).toBe(true);
    expect(up()).toEqual(['away', 'away']);
    expect(h.querySelector('.ql-file-title')!.textContent).toBe('HOUSE RULES');
    press('ArrowRight');
    expect(up()).toEqual(['fixer', 'fixer']);
    press('ArrowRight');
    expect(up()).toEqual(['here', 'here']);
    // Back on HERE: its first row again, not the one left picked.
    expect(h.querySelector('.ql-file-title')!.textContent).toBe('PAPER TRAIL');
    expect(press('ArrowLeft').defaultPrevented).toBe(true);
    expect(up()).toEqual(['fixer', 'fixer']);
    press('ArrowLeft');
    expect(up()).toEqual(['away', 'away']);
    list.close(true);
    // One tab: nowhere to turn.
    list.show(state([{ id: 'trail', title: 'Paper Trail', pitch: null, timed: false }]));
    list.toggle();
    press('ArrowRight');
    expect(up()).toEqual(['here', 'here']);
    list.close(true);
  });

  it('Enter does START: the picked quest starts and the panel closes; a locked one waits', () => {
    const h = document.createElement('div');
    document.body.append(h);
    const onStart = vi.fn();
    const list = mountQuestList(h, { onStart });
    list.show(THREE);
    list.toggle();
    press('ArrowDown');
    expect(h.querySelector('.ql-go .tp-key.go')!.textContent).toBe('START');
    expect(press('Enter').defaultPrevented).toBe(true);
    expect(onStart).toHaveBeenCalledExactlyOnceWith('night');
    expect(list.isOpen).toBe(false);
    // Closed, Enter is the room's again.
    expect(press('Enter').defaultPrevented).toBe(false);
    expect(onStart).toHaveBeenCalledTimes(1);
    // START off (locked): Enter does nothing and the panel stays.
    list.show(state([{ id: 'chair', title: 'The Chair, again', pitch: null, timed: false, locked: 'LOCKED' }]));
    list.toggle();
    expect(h.querySelector<HTMLButtonElement>('.ql-go .ql-start')!.disabled).toBe(true);
    expect(press('Enter').defaultPrevented).toBe(false);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(list.isOpen).toBe(true);
    list.close(true);
  });

  it("accentOf: a contact's job carries their colour on its row and its file; a plain job has none", () => {
    const h = document.createElement('div');
    document.body.append(h);
    const list = mountQuestList(h, { onStart: vi.fn(), accentOf: (n) => (n === 'Nix' ? '#ff4f8b' : undefined) });
    list.show({
      ...EMPTY_QUEST_STATE,
      open: [
        { id: 'night', title: 'Night Shift', pitch: null, timed: false, mission: { pay: 400, tier: 1 } },
        { id: 'intake', title: 'Held Papers', pitch: null, timed: false, mission: { pay: 300, tier: 1, own: 'Nix', trust: true } },
      ],
      boards: [
        {
          place: 'lowlight-intake',
          name: 'The Intake',
          jobs: [
            { id: 'cold-freight', title: 'Cold Freight', pitch: null, tier: 1, pay: 260 },
            { id: 'late-papers', title: 'Late Papers', pitch: null, tier: 1, pay: 300, with: 'Nix' },
            { id: 'orchid', title: 'Orchid Run', pitch: null, tier: 1, pay: 300, with: 'Vesna' },
          ],
        },
      ],
    });
    list.toggle();
    const c = (sel: string) => h.querySelector<HTMLElement>(sel)!.style.getPropertyValue('--c');
    const row = (title: string) => [...h.querySelectorAll<HTMLElement>('.ql-row')].find((r) => r.textContent!.includes(title))!;
    const rowC = (title: string) => row(title).style.getPropertyValue('--c');
    // HERE: the plain job is picked first.
    expect(rowC('Night Shift')).toBe('');
    expect(c('.ql-file')).toBe('');
    // Hers carries it before it's picked, and its file once it is.
    expect(rowC('Held Papers')).toBe('#ff4f8b');
    row('Held Papers').click();
    expect(c('.ql-row.on')).toBe('#ff4f8b');
    expect(c('.ql-file')).toBe('#ff4f8b');
    row('Night Shift').click();
    expect(c('.ql-row.on')).toBe('');
    expect(c('.ql-file')).toBe('');
    // ELSEWHERE: a board job only with her; one with someone the page has no colour for; a plain one.
    h.querySelector<HTMLElement>('.ql-tab[data-tab="away"]')!.click();
    expect([rowC('Cold Freight'), rowC('Late Papers'), rowC('Orchid Run')]).toEqual(['', '#ff4f8b', '']);
    expect(c('.ql-file')).toBe('');
    row('Late Papers').click();
    expect(c('.ql-row.on')).toBe('#ff4f8b');
    expect(c('.ql-file')).toBe('#ff4f8b');
    row('Orchid Run').click();
    expect(c('.ql-file')).toBe('');
    list.close(true);
  });

  it("NERVE gone: one line in the numbers' place on the head line", () => {
    const h = document.createElement('div');
    document.body.append(h);
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.setPurse(1240, 0, 4);
    list.setHeat('old-town', 3);
    list.show({ ...EMPTY_QUEST_STATE, nerveGone: { back: '06:00' }, open: [{ id: 'trail', title: 'Paper Trail', pitch: null, timed: false }] });
    expect(h.querySelector('.ql-nums')!.textContent).toBe('NERVE GONE · NO NEW JOB UNTIL 06:00');
    expect(h.querySelector('.ql-nums > .ql-nerve')).not.toBeNull();
    expect(h.querySelector('.ql-notes')!.textContent).toBe('');
    list.toggle();
    expect(h.querySelector('.quest-screen .tp-nums .ql-nerve')!.textContent).toBe('NERVE GONE · NO NEW JOB UNTIL 06:00');
    list.close(true);
  });
});

describe('the pane coming up', () => {
  it("comes up on the trace screen, its tabs, notes and numbers on the head line; the pane never takes ql-in (the file column's class)", () => {
    const h = document.createElement('div');
    document.body.append(h);
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show({ ...state([{ id: 'trail', title: 'Paper Trail', pitch: null, timed: false }]), changed: 'Paper Trail has changed since you started it' });
    // Closed: no screen; the parts wait in a hidden holder.
    const holder = h.querySelector<HTMLElement>(':scope > div.ql-host')!;
    expect(holder.hidden).toBe(true);
    expect([...holder.children].map((c) => c.className)).toEqual(['ql-tabs', 'ql-notes', 'ql-nums', 'ql-pane']);
    expect(h.querySelector('.scr-root')).toBeNull();
    list.toggle();
    const screen = h.querySelector<HTMLElement>(':scope > .scr-root.scr-trace.quest-screen')!;
    expect(screen.getAttribute('role')).toBe('dialog');
    expect(screen.querySelector('.tp-title')!.textContent).toBe('JOBS');
    expect(screen.querySelector('.tp-head-row > .tp-tabs > .ql-tabs .ql-tab')!.textContent).toBe('HERE 1');
    expect(screen.querySelector('.tp-head-row > .tp-note > .ql-notes .ql-changed')!.textContent).toBe('Paper Trail has changed since you started it');
    expect(screen.querySelector('.tp-head-row > .tp-nums > .ql-nums')).not.toBeNull();
    expect(screen.querySelector('.tp-keys')!.textContent).toContain('START');
    const pane = screen.querySelector<HTMLElement>('.scr-screen .scr-scroll > .ql-pane')!;
    expect(pane.dataset.tab).toBe('here');
    expect(pane.querySelector('.ql-body > .ql-list .ql-row')).not.toBeNull();
    // Nothing left in the holder, which stays hidden; and no holo frame anywhere.
    expect(holder.hidden).toBe(true);
    expect(holder.children).toHaveLength(0);
    expect(h.querySelector('.hf')).toBeNull();
    expect(pane.classList.contains('hf-opening')).toBe(false);
    expect(pane.classList.contains('ql-in')).toBe(false);
    list.close(true);
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
    expect(rows.every((r) => r.matches('button.ql-row.tp-row'))).toBe(true);
    // No picture on a row: the job's stands by its file once it's picked.
    expect(h.querySelector('.ql-list img, .ql-list .ql-icon')).toBeNull();
    expect(rows[1].querySelector('.ql-mission')!.textContent).toBe('MISSION · TIER 1 · 260–340 SOL');
    expect(rows[1].className).not.toContain('ql-later');
    expect(rows[2].className).toContain('ql-later');
    expect(rows[2].querySelector('.ql-mission')!.textContent).toBe('MISSION · TIER 1 · 300 SOL · WITH NIX · FROM 20:00');
    rows[1].click();
    expect(h.querySelector('.ql-file-title')!.textContent).toBe('COLD FREIGHT');
    expect(h.querySelector<HTMLElement>('.ql-file > .ql-art')!.style.backgroundImage).toContain('/api/quests/art/cold-freight.webp');
    expect(h.querySelector('.ql-file .ql-pitch')!.textContent).toBe('A look inside a trailer.');
    expect(h.querySelector('.ql-file .ql-hint')!.textContent).toBe('AT THE LONG HAUL');
    h.querySelectorAll<HTMLElement>('.ql-row')[2].click();
    expect(h.querySelector('.ql-file > .ql-art')!.classList.contains('ql-noart')).toBe(true);
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
  it('the row is greyed and carries no checklist; its file lists it: ✓ or ✗, the label, the progress', () => {
    const h = mount();
    const row = h.querySelector<HTMLElement>('.ql-row')!;
    expect(row.classList.contains('ql-locked')).toBe(true);
    expect(row.querySelector('.ql-checks')).toBeNull();
    expect(h.querySelectorAll('.ql-checks')).toHaveLength(1);
    expect(h.querySelector('.ql-file .ql-in .ql-locked-note')!.textContent).toBe('LOCKED');
    expect(h.querySelector('.ql-file .ql-in .ql-locked-note + ul.ql-checks')).not.toBeNull();
    const items = [...h.querySelectorAll<HTMLElement>('.ql-file .ql-in .ql-checks .ql-check')];
    expect(items.map((i) => [i.classList.contains('ok'), i.textContent])).toEqual([
      [true, '✓6 JOBS WITH HER UNDER THE DEAL8/6'],
      [false, '✗4 OF THE LAST 6 CLEAN3/6'],
      [false, '✗HER SHIFTFROM 20:00'],
    ]);
  });
  it('its file keeps the list after a tap on the row, START off and nothing said for the key', () => {
    const h = mount();
    h.querySelector<HTMLElement>('.ql-row')!.click();
    expect(h.querySelectorAll('.ql-in .ql-checks .ql-check')).toHaveLength(3);
    expect(h.querySelector<HTMLButtonElement>('.ql-start')!.disabled).toBe(true);
    expect(h.querySelector('.ql-go .ql-hint')!.textContent).toBe('');
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
    // The file has a title (who it's about) and its terms line (where it was heard).
    expect(h.querySelector('.ql-file h2.ql-file-title')!.textContent).toBe('MOTHER ROT');
    expect(h.querySelector('.ql-file .ql-meta')!.textContent).toBe('HEARD · THE COUNTING HOUSE');
    expect(h.querySelector('.ql-row .ql-line')!.textContent).toBe('The Counting House');
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

  it("a job's file gives the pitch, then who posted it, then what it involves, each under its head", () => {
    const h = document.createElement('div');
    document.body.append(h);
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show(state([{ id: 'night', title: 'Night Shift', pitch: 'A crate.', postedBy: 'A man in a grey coat.', brief: 'Open it.', timed: false, mission: { pay: 400, tier: 1 } }]));
    list.toggle();
    // In order inside the file's text: title, terms, pitch, POSTED BY and who, THE JOB and what.
    expect([...h.querySelector('.ql-file > .ql-in')!.children].map((e) => [e.classList[0], e.textContent])).toEqual([
      ['ql-file-title', 'NIGHT SHIFT'],
      ['ql-meta', 'MISSION · TIER 1 · 400 SOL'],
      ['ql-pitch', 'A crate.'],
      ['ql-sub', 'POSTED BY'],
      ['ql-postedby', 'A man in a grey coat.'],
      ['ql-sub', 'THE JOB'],
      ['ql-brief', 'Open it.'],
    ]);
    // No head without its text.
    list.show(state([{ id: 'night', title: 'Night Shift', pitch: 'A crate.', timed: false, mission: { pay: 400, tier: 1 } }]));
    expect(h.querySelector('.ql-file .ql-sub, .ql-file .ql-postedby, .ql-file .ql-brief')).toBeNull();
    list.close(true);
  });
});

// A job that can give an outfit says so on its file (2026-11-09, playtest call).
describe('OUTFIT on a job file', () => {
  it('HERE and ELSEWHERE both show OUTFIT · NIX · COAT after ONE-OFF', () => {
    const h = document.createElement('div');
    document.body.append(h);
    const list = mountQuestList(h, { onStart: vi.fn(), onGoTo: vi.fn() });
    list.show({
      ...EMPTY_QUEST_STATE,
      open: [{ id: 'lark', title: 'Lark', pitch: null, timed: false, once: true, outfit: 'NIX · COAT', mission: { pay: 90, tier: 1 } }],
      boards: [{ place: 'lowlight-intake', name: 'The Intake', jobs: [{ id: 'lark2', title: 'Lark Two', pitch: null, tier: 1, pay: 90, once: true, outfit: 'NIX · COAT' }] }],
    });
    list.toggle();
    expect([...h.querySelectorAll('.ql-file .ql-chip')].map((c) => c.textContent)).toEqual(['ONE-OFF', 'OUTFIT · NIX · COAT']);
    expect(h.querySelector('.ql-file .ql-outfit')).not.toBeNull();
    h.querySelectorAll<HTMLButtonElement>('.ql-tab')[1].click();
    [...h.querySelectorAll<HTMLElement>('.ql-row')].find((r) => r.textContent?.includes('Lark Two'))!.click();
    expect([...h.querySelectorAll('.ql-file .ql-chip')].map((c) => c.textContent)).toEqual(['ONE-OFF', 'OUTFIT · NIX · COAT']);
  });
});
