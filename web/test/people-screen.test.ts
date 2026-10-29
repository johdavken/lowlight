import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContactEntry, LeadView } from '../../shared/types';
import { openPeople, type PeopleOpts, type PeopleHandle } from '../src/room/people-screen';
import { contactsTab } from '../src/room/people-contacts';
import { leadsTab } from '../src/room/people-leads';
import type { JournalView } from '../src/ui/journal';
import { closeBugReport, openBugReport } from '../src/ui/bug-report';
import { SCREEN_GLITCH_OUT_MS } from '../src/ui/screen';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = (sel: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(sel)];
const key = (k: string, init: KeyboardEventInit = {}, target: EventTarget = document.activeElement ?? document.body) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const alt = (letter: 'C' | 'L' | 'J') => key(letter.toLowerCase(), { altKey: true, code: `Key${letter}` });

function fakeJournal() {
  const element = document.createElement('div');
  element.className = 'jd-root';
  return { element, busy: false, flashSave: vi.fn() } as unknown as JournalView & { busy: boolean; flashSave: ReturnType<typeof vi.fn> };
}

let handle: PeopleHandle | null = null;
function open(o: Partial<PeopleOpts> = {}) {
  const journal = (o.journal ?? fakeJournal()) as ReturnType<typeof fakeJournal>;
  const opts: PeopleOpts = {
    tab: 'contacts',
    contacts: async () => [] as ContactEntry[],
    leads: async () => [] as LeadView[],
    journal,
    current: 'nix',
    persona: 'Hicks',
    dev: false,
    pick: vi.fn(),
    reducedMotion: true,
    onClose: vi.fn(),
    ...o,
  };
  handle = openPeople(document.body, opts);
  return { handle, opts, journal };
}
const lit = () => $$('.pe-tab.on').map((t) => t.dataset.tab);

afterEach(() => {
  vi.useRealTimers();
  handle?.close();
  handle = null;
  document.body.replaceChildren();
});

describe('PEOPLE', () => {
  it('opens on the asked tab, PEOPLE in the head, the tab lit', () => {
    const { handle } = open({ tab: 'leads' });
    expect($('.people-screen .scr-head')!.textContent).toBe('// PEOPLE[ESC] CLOSE');
    expect($$('.pe-tab').map((t) => t.textContent)).toEqual(['CONTACTS', 'LEADS', 'JOURNAL']);
    expect(lit()).toEqual(['leads']);
    expect(handle.tab).toBe('leads');
    expect($('.pe-pane')!.dataset.tab).toBe('leads');
  });

  it("Alt+C/L/J switch tabs; the open tab's key closes it", () => {
    const { handle, opts } = open({ tab: 'contacts' });
    alt('J');
    expect(handle.tab).toBe('journal');
    alt('L');
    expect(handle.tab).toBe('leads');
    expect(alt('L').defaultPrevented).toBe(true);
    expect(opts.onClose).toHaveBeenCalledTimes(1);
    expect($('.people-screen')).toBeNull();
  });

  it('Alt+P (PEOPLE itself) closes it from any tab', () => {
    const { opts } = open({ tab: 'leads' });
    key('p', { altKey: true, code: 'KeyP' });
    expect($('.people-screen')).toBeNull();
    expect(opts.onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a tab shows it', () => {
    const { handle } = open();
    $('.pe-tab[data-tab="journal"]')!.click();
    expect(handle.tab).toBe('journal');
  });

  it('← / → move between tabs and wrap, even with the chat prompt focused behind; not while typing in a field of its own', () => {
    const prompt = document.createElement('textarea');
    document.body.prepend(prompt);
    prompt.focus();
    const { handle } = open({ tab: 'contacts' });
    expect(key('ArrowLeft', {}, prompt).defaultPrevented).toBe(true);
    expect(handle.tab).toBe('journal');
    key('ArrowRight', {}, prompt);
    expect(handle.tab).toBe('contacts');
    const own = document.createElement('textarea');
    $('.pe-pane')!.append(own);
    own.focus();
    key('ArrowRight', {}, own);
    expect(handle.tab).toBe('contacts');
  });

  it('Enter, ↑ and ↓ never reach the room while it is up, whatever the tab handles', () => {
    const room = vi.fn();
    window.addEventListener('keydown', room);
    open({ tab: 'leads' });
    for (const k of ['Enter', 'ArrowUp', 'ArrowDown']) expect(key(k).defaultPrevented).toBe(true);
    window.removeEventListener('keydown', room);
    expect(room).not.toHaveBeenCalled();
  });

  it('with a bug report open over it, its keys are left alone', () => {
    const { handle } = open({ tab: 'contacts' });
    openBugReport({ from: 'scene', screenshot: null, onClose: () => {} });
    alt('J');
    expect(handle.tab).toBe('contacts');
    key('Escape');
    expect($('.people-screen')).not.toBeNull();
    closeBugReport();
  });

  it('Esc stays swallowed while it glitches out (a quick second Esc does not reach the room)', () => {
    vi.useFakeTimers();
    const room = vi.fn();
    window.addEventListener('keydown', room);
    open({ tab: 'contacts', reducedMotion: false });
    key('Escape');
    key('Escape');
    expect(room).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SCREEN_GLITCH_OUT_MS);
    key('Escape');
    expect(room).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', room);
    vi.useRealTimers();
    handle = null;
  });

  it('busy journal work on another tab: Esc and the backdrop bring JOURNAL up and flash its SAVE', () => {
    const journal = fakeJournal();
    const { handle } = open({ tab: 'contacts', journal });
    journal.busy = true;
    key('Escape');
    expect(handle.tab).toBe('journal');
    expect(journal.flashSave).toHaveBeenCalledTimes(1);
    handle.show('leads');
    $('.people-screen')!.click();
    expect(handle.tab).toBe('journal');
    expect(journal.flashSave).toHaveBeenCalledTimes(2);
  });

  it('a tab loads once per open: switching back keeps it (and its selection) without a new load', async () => {
    const contacts = vi.fn(async () => CONTACTS);
    const { handle } = open({ tab: 'contacts', contacts });
    await new Promise((r) => setTimeout(r, 0));
    key('ArrowUp');
    handle.show('journal');
    handle.show('contacts');
    expect(contacts).toHaveBeenCalledTimes(1);
    expect($$('.pe-tile.on').map((t) => t.dataset.id)).toEqual(['cass']);
  });

  it('Esc closes; with the journal busy it flashes SAVE and stays open', () => {
    const journal = fakeJournal();
    const { handle, opts } = open({ tab: 'journal', journal });
    journal.busy = true;
    key('Escape');
    expect(journal.flashSave).toHaveBeenCalledTimes(1);
    expect($('.people-screen')).not.toBeNull();
    journal.busy = false;
    const e = key('Escape');
    expect(e.defaultPrevented).toBe(true);
    expect($('.people-screen')).toBeNull();
    expect(opts.onClose).toHaveBeenCalledTimes(1);
    expect(handle.tab).toBe('journal');
  });

  it("Esc with a note's edit box focused is left to the box (it cancels the edit)", () => {
    const journal = fakeJournal();
    open({ tab: 'journal', journal });
    journal.busy = true;
    const edit = document.createElement('textarea');
    edit.className = 'jr-edit';
    journal.element.append(edit);
    edit.focus();
    const e = key('Escape', {}, edit);
    expect(e.defaultPrevented).toBe(false);
    expect(journal.flashSave).not.toHaveBeenCalled();
    expect($('.people-screen')).not.toBeNull();
  });

  it('a backdrop click with the journal busy flashes SAVE and stays open', () => {
    const journal = fakeJournal();
    open({ tab: 'journal', journal });
    journal.busy = true;
    $('.people-screen')!.click();
    expect(journal.flashSave).toHaveBeenCalledTimes(1);
    expect($('.people-screen')).not.toBeNull();
    journal.busy = false;
    $('.people-screen')!.click();
    expect($('.people-screen')).toBeNull();
  });

  it('a fetch that resolves after a tab switch or close draws nothing', async () => {
    let resolve!: (v: ContactEntry[]) => void;
    const contacts = () => new Promise<ContactEntry[]>((r) => (resolve = r));
    const { handle } = open({ tab: 'contacts', contacts });
    handle.show('leads');
    resolve([{ id: 'cass', name: 'Cass' } as ContactEntry]);
    await new Promise((r) => setTimeout(r, 0));
    expect($('.pe-pane')!.dataset.tab).toBe('leads');
    expect($('.pe-roster')).toBeNull();

    handle.show('contacts');
    handle.close();
    resolve([{ id: 'cass', name: 'Cass' } as ContactEntry]);
    await new Promise((r) => setTimeout(r, 0));
    expect($('.pe-roster')).toBeNull();
  });

  it('the JOURNAL tab mounts the journal view', () => {
    const journal = fakeJournal();
    open({ tab: 'journal', journal });
    expect($('.pe-pane')!.contains(journal.element)).toBe(true);
  });

  it('onClose once, on close or Esc', () => {
    const { handle, opts } = open();
    handle.close();
    key('Escape');
    handle.close();
    expect(opts.onClose).toHaveBeenCalledTimes(1);
  });
});

const contact = (o: Partial<ContactEntry> & { id: string; name: string }): ContactEntry =>
  ({ accent: '#f0f', portrait: `/p/${o.id}.png`, status: 'met', sceneId: 'k/x', placeName: 'The Tilt', timeOfDay: 'late', lastLine: null, standing: null, ...o }) as ContactEntry;
const lead = (o: Partial<LeadView> & { id: string; to: string }): LeadView =>
  ({ title: `Lead ${o.id}`, details: 'Something. More.', toName: o.to.toUpperCase(), place: null, portrait: null, met: true, followed: false, ...o }) as LeadView;
const CONTACTS = [
  contact({ id: 'cass', name: 'Cass', standing: { word: 'warm', trust: 2, warmth: 3, last: 'paid on time' } }),
  contact({ id: 'nix', name: 'Nix', lastLine: { speaker: 'Nix', text: 'Sit wherever.' }, placeName: 'Lowlight Intake' }),
  contact({ id: 'hae', name: 'Hae' }),
];
const press = (tab: ReturnType<typeof contactsTab>, k: string) => tab.handleKey!(new KeyboardEvent('keydown', { key: k }));

describe('CONTACTS', () => {
  const mount = (o: Partial<{ current: string; dev: boolean; pick: (id: string) => void }> = {}, leads: LeadView[] = []) => {
    const pick = vi.fn();
    const tab = contactsTab(CONTACTS, leads, { current: 'nix', dev: false, pick, ...o });
    document.body.replaceChildren(tab);
    return { tab, pick };
  };
  const file = () => $('.pe-file')!;

  it('the roster lists everyone in order, HERE on the one you are with, who is selected first', () => {
    mount();
    expect($$('.pe-tile').map((t) => t.dataset.id)).toEqual(['cass', 'nix', 'hae']);
    expect($('.pe-tile[data-id="nix"]')!.textContent).toContain('● HERE');
    expect($$('.pe-tile.on').map((t) => t.dataset.id)).toEqual(['nix']);
    expect(file().querySelector('.pe-name')!.textContent).toBe('NIX');
    expect(file().querySelector('.pe-where')!.textContent).toBe('Lowlight Intake · "Sit wherever."');
  });

  it('↑ / ↓ move the selection and its file, without wrapping', () => {
    const { tab } = mount();
    expect(press(tab, 'ArrowDown')).toBe(true);
    expect(file().querySelector('.pe-name')!.textContent).toBe('HAE');
    press(tab, 'ArrowDown');
    expect(file().querySelector('.pe-name')!.textContent).toBe('HAE');
    press(tab, 'ArrowUp');
    press(tab, 'ArrowUp');
    press(tab, 'ArrowUp');
    expect(file().querySelector('.pe-name')!.textContent).toBe('CASS');
    $('.pe-tile[data-id="hae"]')!.click();
    expect(file().querySelector('.pe-name')!.textContent).toBe('HAE');
  });

  it('her file shows her standing word and the leads that point to her, followed dimmed', () => {
    const { tab } = mount({}, [lead({ id: 'a', to: 'cass' }), lead({ id: 'b', to: 'cass', followed: true }), lead({ id: 'c', to: 'hae' })]);
    press(tab, 'ArrowUp');
    expect(file().querySelector('.pe-standing')!.textContent).toBe('warm');
    expect($$('.pe-leads li', file()).map((l) => [l.textContent, l.classList.contains('followed')])).toEqual([
      ['Lead a', false],
      ['Lead b', true],
    ]);
  });

  it('her file shows her bio and facts under where she is (spec 2026-10-28 §4)', () => {
    const list = [contact({ id: 'cass', name: 'Cass', bio: ['Cass Arden, 31.', 'Keeps the peace.'], facts: [{ label: 'TELL', value: 'Slides a drink.' }] })];
    document.body.replaceChildren(contactsTab(list, [], { current: 'cass', dev: false, pick: vi.fn() }));
    expect($$('.pe-bio p', file()).map((p) => p.textContent)).toEqual(['Cass Arden, 31.', 'Keeps the peace.']);
    expect(file().querySelector('.pe-facts dt')!.textContent).toBe('TELL');
    expect(file().querySelector('.pe-facts dd')!.textContent).toBe('Slides a drink.');
    const sub = file().querySelector('.pe-where')!.nextElementSibling!;
    expect(sub.className).toBe('pe-sub');
    expect(sub.textContent).toBe('FILE');
  });

  it('selecting another contact redraws her file, none of the last one', () => {
    const list = [contact({ id: 'cass', name: 'Cass', bio: ['Cass Arden, 31.'] }), contact({ id: 'hae', name: 'Hae' })];
    const tab = contactsTab(list, [], { current: 'cass', dev: false, pick: vi.fn() });
    document.body.replaceChildren(tab);
    expect(file().querySelector('.pe-bio')).not.toBeNull();
    press(tab, 'ArrowDown');
    expect(file().querySelector('.pe-name')!.textContent).toBe('HAE');
    expect(file().querySelector('.pe-bio')).toBeNull();
    expect(file().querySelector('.pe-facts')).toBeNull();
    expect($$('.pe-sub', file()).map((n) => n.textContent)).not.toContain('FILE');
  });

  it('a contact only heard of still shows her file; facts without a bio show alone', () => {
    const list = [contact({ id: 'vee', name: 'Vee', status: 'shared', sharedBy: 'Nix', facts: [{ label: 'KNOWN FOR', value: 'Courier work.' }] })];
    document.body.replaceChildren(contactsTab(list, [], { current: 'nix', dev: false, pick: vi.fn() }));
    expect(file().querySelector('.pe-bio')).toBeNull();
    expect(file().querySelector('.pe-facts dd')!.textContent).toBe('Courier work.');
  });

  it('GO and Enter go to her; on the one you are with GO is disabled and Enter does nothing', () => {
    const { tab, pick } = mount();
    const go = () => file().querySelector<HTMLButtonElement>('.pe-go')!;
    expect(go().disabled).toBe(true);
    expect(go().title).toBe("you're here");
    press(tab, 'Enter');
    expect(pick).not.toHaveBeenCalled();
    press(tab, 'ArrowUp');
    go().click();
    press(tab, 'Enter');
    expect(pick.mock.calls).toEqual([['cass'], ['cass']]);
  });

  it('a tile that takes focus (Tab) is selected, so Enter goes where it shows', () => {
    const { tab, pick } = mount();
    $('.pe-tile[data-id="hae"]')!.focus();
    expect(file().querySelector('.pe-name')!.textContent).toBe('HAE');
    press(tab, 'Enter');
    expect(pick).toHaveBeenCalledWith('hae');
  });

  it('with the dev panel open the standing word carries the values', () => {
    const { tab } = mount({ dev: true });
    press(tab, 'ArrowUp');
    expect(file().querySelector<HTMLElement>('.pe-standing')!.title).toBe('T+2 W+3 · last: "paid on time"');
  });

  it('a sprite that fails shows her portrait, then her initial', () => {
    mount();
    const fig = () => file().querySelector('.pe-figure') as HTMLImageElement | null;
    expect(fig()!.getAttribute('src')).toBe('/api/agents/nix/sprite');
    fig()!.dispatchEvent(new Event('error'));
    expect(fig()!.getAttribute('src')).toBe('/p/nix.png');
    fig()!.dispatchEvent(new Event('error'));
    expect(fig()).toBeNull();
    expect(file().querySelector('.pe-mono')!.textContent).toBe('N');
  });

  it("a contact you've only heard of says who told you", () => {
    document.body.replaceChildren(contactsTab([contact({ id: 'cass', name: 'Cass', status: 'shared', sharedBy: 'Nix' })], [], { current: 'nix', dev: false, pick: vi.fn() }));
    expect($('.pe-where')!.textContent).toBe('The Tilt · heard from Nix');
  });

  it('nobody yet', () => {
    document.body.replaceChildren(contactsTab([], [], { current: 'nix', dev: false, pick: vi.fn() }));
    expect($('.pe-empty')!.textContent).toBe('Nobody yet.');
  });

  it('the screen sends ↑ / ↓ / Enter to the tab with the chat prompt focused behind', async () => {
    const pick = vi.fn();
    const prompt = document.createElement('textarea');
    document.body.prepend(prompt);
    prompt.focus();
    open({ tab: 'contacts', contacts: async () => CONTACTS, pick });
    await new Promise((r) => setTimeout(r, 0));
    key('ArrowUp', {}, prompt);
    key('Enter', {}, prompt);
    expect(pick).toHaveBeenCalledWith('cass');
  });

  it('Enter on a focused button in the screen is that button\'s (GO goes; a tab button shows its tab)', async () => {
    const pick = vi.fn();
    const { handle } = open({ tab: 'contacts', contacts: async () => CONTACTS, pick });
    await new Promise((r) => setTimeout(r, 0));
    const tabBtn = $<HTMLButtonElement>('.pe-tab[data-tab="leads"]')!;
    tabBtn.focus();
    expect(key('Enter', {}, tabBtn).defaultPrevented).toBe(false);
    expect(pick).not.toHaveBeenCalled();
    expect(handle.tab).toBe('contacts');
  });
});

describe('LEADS', () => {
  const LEADS = [
    lead({ id: 'a', to: 'cass', title: 'SDG at the Tilt', details: 'A man in plain clothes asked about Hicks. He stayed two hours.', place: 'The Tilt', portrait: '/p/cass.png', met: true }),
    lead({ id: 'b', to: 'vesna', title: 'The Orchid owes', details: 'Ask Vesna.', met: false, followed: true }),
    lead({ id: 'c', to: 'ines', title: 'Clean water', details: 'Pump Nine is short.', met: false, place: null }),
  ];
  const mount = (list = LEADS) => {
    const tab = leadsTab(list);
    document.body.replaceChildren(tab);
    return tab;
  };
  const detail = () => $('.pe-lead-detail')!;

  it('open leads first, then FOLLOWED with the followed ones dimmed; unmet shows ?', () => {
    mount();
    expect($$('.pe-lead').map((l) => l.dataset.id)).toEqual(['a', 'c', 'b']);
    expect($('.pe-leadlist .pe-sub')!.textContent).toBe('FOLLOWED');
    expect($('.pe-lead[data-id="b"]')!.classList.contains('followed')).toBe(true);
    expect($('.pe-lead[data-id="c"] .pe-unknown')!.textContent).toBe('?');
    expect($('.pe-lead[data-id="a"] img')!.getAttribute('src')).toBe('/p/cass.png');
  });

  it('the detail shows the whole text and who and where it points, with or without a place', () => {
    const tab = mount();
    expect(detail().querySelector('.pe-lead-title')!.textContent).toBe('SDG at the Tilt');
    expect(detail().querySelector('.pe-lead-text')!.textContent).toBe('A man in plain clothes asked about Hicks. He stayed two hours.');
    expect(detail().querySelector('.pe-lead-to')!.textContent).toBe('→ CASS · The Tilt');
    tab.handleKey!(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(detail().querySelector('.pe-lead-to')!.textContent).toBe('→ INES');
    $('.pe-lead[data-id="b"]')!.click();
    expect(detail().querySelector('.pe-lead-title')!.textContent).toBe('The Orchid owes');
  });

  it('↑ / ↓ move through the list in its order, without wrapping', () => {
    const tab = mount();
    const at = () => $$('.pe-lead.on').map((l) => l.dataset.id);
    tab.handleKey!(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(at()).toEqual(['a']);
    tab.handleKey!(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    tab.handleKey!(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    tab.handleKey!(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(at()).toEqual(['b']);
  });

  it('no leads', () => {
    mount([]);
    expect($('.pe-empty')!.textContent).toBe('No leads yet. People tell you things; the useful ones end up here.');
  });
});

describe('PEOPLE, switching screens', () => {
  it('requestClose(true) closes at once (a switch); with busy journal work it still refuses', () => {
    const journal = fakeJournal();
    const { handle } = open({ tab: 'contacts', journal, reducedMotion: false });
    journal.busy = true;
    expect(handle.requestClose(true)).toBe(false);
    expect($('.people-screen')).not.toBeNull();
    journal.busy = false;
    const room = vi.fn();
    window.addEventListener('keydown', room);
    expect(handle.requestClose(true)).toBe(true);
    expect($('.people-screen')).toBeNull();
    // Nothing still on screen: Esc is the room's again at once.
    key('Escape');
    expect(room).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', room);
  });
});

describe('PEOPLE, final review', () => {
  it('Enter with a clicked (focused) tile goes to the selected contact, through the real screen', async () => {
    const pick = vi.fn();
    open({ tab: 'contacts', contacts: async () => CONTACTS, pick });
    await new Promise((r) => setTimeout(r, 0));
    const cass = $<HTMLButtonElement>('.pe-tile[data-id="cass"]')!;
    cass.focus();
    cass.click();
    key('ArrowDown', {}, cass);
    key('ArrowDown', {}, cass);
    key('Enter', {}, cass);
    expect(pick).toHaveBeenCalledWith('hae');
  });

  it('requestClose refuses over busy journal work (JOURNAL up, SAVE lit); the own-tab key does too', () => {
    const journal = fakeJournal();
    const { handle } = open({ tab: 'contacts', journal });
    journal.busy = true;
    expect(handle.requestClose()).toBe(false);
    expect(handle.tab).toBe('journal');
    expect(journal.flashSave).toHaveBeenCalledTimes(1);
    alt('J');
    expect($('.people-screen')).not.toBeNull();
    expect(journal.flashSave).toHaveBeenCalledTimes(2);
    journal.busy = false;
    expect(handle.requestClose()).toBe(true);
    expect($('.people-screen')).toBeNull();
  });

  it('Esc in the dossier page is left to the page (it reverts the draft)', () => {
    const journal = fakeJournal();
    open({ tab: 'journal', journal });
    journal.busy = true;
    const page = document.createElement('textarea');
    page.className = 'jd-text';
    journal.element.append(page);
    page.focus();
    expect(key('Escape', {}, page).defaultPrevented).toBe(false);
    expect(journal.flashSave).not.toHaveBeenCalled();
  });
});

describe('main.ts switches between YOU, PEOPLE and MAP', () => {
  it("the open one's word is lit in the bar (setOpen), and none once it closes", async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync('web/src/main.ts', 'utf8');
    for (const s of ['you', 'people', 'map']) expect(main).toContain(`hud.setOpen('${s}')`);
    expect(main.match(/hud\.setOpen\(null\)/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('the bar words switch when another of the three is open, and Tab cycles them', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync('web/src/main.ts', 'utf8');
    expect(main).toMatch(/hud\.setYou\(\(\) => \{[^}]*switchTo\('you'\)/);
    expect(main).toMatch(/hud\.setPeople\(\(\) => [^\n]*switchTo\('people'\)/);
    expect(main).toMatch(/hud\.setMapLink\(\(\) => \{[\s\S]{0,200}switchTo\('map'\)/);
    expect(main).toMatch(/listenScreenCycle\(window, \{/);
  });
});

describe('main.ts wires PEOPLE', () => {
  it('PEOPLE (the bar and Alt+P) opens on the tab last shown, CONTACTS the first time', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync('web/src/main.ts', 'utf8');
    expect(main).toMatch(/let lastPeopleTab: PeopleTab = 'contacts';/);
    expect(main).toMatch(/hud\.setPeople\(\(\) => [^\n]*openPeopleOn\(lastPeopleTab\)/);
    expect(main).toMatch(/k === 'people'\) openPeopleOn\(lastPeopleTab\)/);
  });

  it('the MAP and DICE links close PEOPLE through the guarded close', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync('web/src/main.ts', 'utf8');
    expect(main).not.toContain('people?.close()');
    expect(main.match(/requestClose\(/g)!.length).toBeGreaterThanOrEqual(4);
    // The MAP link switches through switchTo, which asks PEOPLE first.
    expect(main).toMatch(/if \(cur === 'people' && !people\?\.requestClose\(true\)\) return;/);
  });

  it('GO closes PEOPLE first, so a refusal ("Wait for…") shows in the room, not under the screen', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync('web/src/main.ts', 'utf8');
    const pick = main.match(/people = openPeople\([\s\S]*?pick: \(id\) => ([^\n]+)/)![1]!;
    // Through the guarded close: unsaved journal work refuses GO instead of being thrown away.
    expect(pick).toContain('requestClose()');
    expect(pick.indexOf('requestClose()')).toBeLessThan(pick.indexOf('goToContact(id)'));
  });
});

describe('her arrangement line (spec 2026-10-20 §3)', () => {
  it('active, stepped back, none', () => {
    const one = (arrangement: ContactEntry['arrangement']) => {
      const tab = contactsTab([contact({ id: 'nix', name: 'Nix', standing: { word: 'Trusts you', trust: 5, warmth: 0, last: null }, arrangement })], [], { current: 'nix', dev: false, pick: vi.fn() });
      document.body.replaceChildren(tab);
      return $('.pe-file .pe-arrangement')?.textContent ?? null;
    };
    expect(one({ retainer: 150, nights: 1, active: true })).toBe('YOUR OPERATOR · 150 A NIGHT · ONE JOB A NIGHT');
    expect(one({ retainer: 200, nights: 2, active: true })).toBe('YOUR OPERATOR · 200 A NIGHT · TWO JOBS A NIGHT');
    expect(one({ retainer: 150, nights: 1, active: false })).toBe('STEPPED BACK');
    expect(one(null)).toBeNull();
  });
});
